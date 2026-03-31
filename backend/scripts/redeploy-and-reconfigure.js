#!/usr/bin/env node
/**
 * Redeploy contracts, clear DB, and update contract addresses in backend and frontend .env.local.
 * Run from repo root: node backend/scripts/redeploy-and-reconfigure.js
 * Or from backend: node scripts/redeploy-and-reconfigure.js
 *
 * Requires: backend/.env.local with ETHEREUM_PRIVATE_KEY (and ETHEREUM_RPC_URL if needed).
 * Deploy script loads env from backend/.env.local.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Wallet } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const backendRoot = path.join(__dirname, '..');
const repoRoot = path.join(__dirname, '..', '..');
const contractsDir = path.join(repoRoot, 'contracts');
const backendEnvPath = path.join(backendRoot, '.env.local');
const frontendEnvPath = path.join(repoRoot, 'frontend', '.env.local');

function clearDb() {
  const dbFiles = [
    path.join(backendRoot, 'positions.db'),
    path.join(backendRoot, 'positions.db-wal'),
    path.join(backendRoot, 'positions.db-shm'),
  ];
  for (const f of dbFiles) {
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        console.log('Removed:', f);
      }
    } catch (e) {
      console.warn('Could not remove', f, e.message);
    }
  }
  console.log('DB cleared.\n');
}

const HHE10402 = 'HHE10402';
const MAX_DEPLOY_ATTEMPTS = 6;
const WAIT_FOR_CONFIRMS_MS = 60 * 1000; // 60s (~several blocks on Base)
const WAIT_PROGRESS_INTERVAL_MS = 15 * 1000; // log every 15s so it's clear we're not stuck

function runDeploy() {
  const env = { ...process.env };
  return execSync('pnpm run deploy', {
    encoding: 'utf-8',
    cwd: contractsDir,
    env: { ...env, DOTENV_CONFIG_PATH: backendEnvPath },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
}

async function runDeployWithRetry() {
  console.log('Deploying PriceOracle and LineFutures to Base mainnet...\n');
  let lastError;
  for (let attempt = 1; attempt <= MAX_DEPLOY_ATTEMPTS; attempt++) {
    try {
      return runDeploy();
    } catch (e) {
      lastError = e;
      const out = (e.stderr || '') + (e.stdout || '') + (e.message || '');
      if (out.includes(HHE10402) && attempt < MAX_DEPLOY_ATTEMPTS) {
        const waitSec = WAIT_FOR_CONFIRMS_MS / 1000;
        console.warn(
          `\n⚠️  HHE10402: Pending transactions need 5 confirmations. Waiting ${waitSec}s then retry (${attempt}/${MAX_DEPLOY_ATTEMPTS})...\n`
        );
        // Show progress so it's obvious the script isn't stuck
        for (let elapsed = 0; elapsed < WAIT_FOR_CONFIRMS_MS; elapsed += WAIT_PROGRESS_INTERVAL_MS) {
          await new Promise((r) => setTimeout(r, WAIT_PROGRESS_INTERVAL_MS));
          const remaining = Math.ceil((WAIT_FOR_CONFIRMS_MS - elapsed) / 1000);
          if (remaining > 0) process.stdout.write(`   ... ${remaining}s remaining\n`);
        }
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

function parseAddresses(stdout) {
  const contractMatch = stdout.match(/CONTRACT_ADDRESS=(0x[a-fA-F0-9]{40})/);
  const futuresMatch = stdout.match(/FUTURES_CONTRACT_ADDRESS=(0x[a-fA-F0-9]{40})/);
  if (!contractMatch || !futuresMatch) {
    throw new Error(
      'Could not parse deployed addresses from output. Expected CONTRACT_ADDRESS=0x... and FUTURES_CONTRACT_ADDRESS=0x...'
    );
  }
  return {
    contractAddress: contractMatch[1],
    futuresContractAddress: futuresMatch[1],
  };
}

function updateEnvFile(filePath, updates) {
  if (!fs.existsSync(filePath)) {
    console.warn('Env file not found:', filePath);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf-8');
  const keys = Object.keys(updates);
  for (const key of keys) {
    const value = updates[key];
    const regex = new RegExp(`^(${key}=).*`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `$1${value}`);
    } else {
      content = content.trimEnd() + '\n' + key + '=' + value + '\n';
    }
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('Updated', filePath);
}

function getDeployerAddress() {
  dotenv.config({ path: backendEnvPath });
  const key = process.env.ETHEREUM_PRIVATE_KEY?.replace(/"/g, '').trim();
  if (!key) return null;
  return new Wallet(key).address;
}

async function main() {
  console.log('=== Redeploy and reconfigure ===\n');

  const deployer = getDeployerAddress();
  if (deployer) console.log('Deployer address:', deployer, '\n');
  else console.warn('Deployer address unknown (ETHEREUM_PRIVATE_KEY not set in backend/.env.local)\n');

  clearDb();

  let stdout;
  try {
    stdout = await runDeployWithRetry();
  } catch (e) {
    console.error('Deploy failed:', e.message);
    if (e.stdout) console.log(e.stdout);
    if (e.stderr) console.error(e.stderr);
    process.exit(1);
  }

  const { contractAddress, futuresContractAddress } = parseAddresses(stdout);
  console.log('\nParsed addresses:');
  console.log('  CONTRACT_ADDRESS (Oracle):', contractAddress);
  console.log('  FUTURES_CONTRACT_ADDRESS:', futuresContractAddress);

  updateEnvFile(backendEnvPath, {
    CONTRACT_ADDRESS: contractAddress,
    FUTURES_CONTRACT_ADDRESS: futuresContractAddress,
    ORACLE_CONTRACT_ADDRESS: contractAddress,
  });

  updateEnvFile(frontendEnvPath, {
    NEXT_PUBLIC_FUTURES_CONTRACT_ADDRESS: futuresContractAddress,
  });

  console.log('\nDone. Restart backend and frontend to use the new contracts.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
