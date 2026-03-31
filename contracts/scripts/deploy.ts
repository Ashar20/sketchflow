import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

async function getWalletAddress(privateKey: string): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address;
}

async function deploy() {
  const privateKey = process.env.ETHEREUM_PRIVATE_KEY?.replace(/"/g, '');

  if (!privateKey) {
    throw new Error('ETHEREUM_PRIVATE_KEY not found in environment');
  }

  const walletAddress = await getWalletAddress(privateKey);
  console.log(`\n📋 Deployment Configuration:`);
  console.log(`   Wallet Address: ${walletAddress}`);
  console.log(`   Network: Base Mainnet`);
  console.log(`   RPC URL: ${process.env.ETHEREUM_RPC_URL || 'https://mainnet.base.org'}\n`);

  // Deploy LineFutures
  console.log('🚀 Deploying LineFutures...');
  const execOpts = {
    encoding: 'utf-8' as const,
    cwd: join(__dirname, '..'),
    stdio: 'pipe' as const,
    env: {
      ...process.env,
      HARDHAT_IGNITION_CONFIRM_DEPLOYMENT: 'false',
      HARDHAT_IGNITION_CONFIRM_RESET: 'false',
    },
  };
  const futuresDeployCmd = `npx hardhat ignition deploy --network base ignition/modules/LineFutures.ts --parameters '{"LineFuturesModule":{"pnlServerAddress":"${walletAddress}"}}' --reset`;

  console.log(`   Running: ${futuresDeployCmd}\n`);
  const futuresOutput = execSync(futuresDeployCmd, execOpts);

  // Extract futures address from output
  const futuresMatch = futuresOutput.match(/deployed to (0x[a-fA-F0-9]{40})/i);
  if (!futuresMatch) {
    throw new Error('Failed to extract LineFutures address from deployment output');
  }
  const futuresAddress = futuresMatch[1];
  console.log(`   ✅ LineFutures deployed to: ${futuresAddress}\n`);

  // Summary
  console.log('\n✨ Deployment Complete!\n');
  console.log('📝 Update your backend/.env.local with:');
  console.log(`   FUTURES_CONTRACT_ADDRESS=${futuresAddress}\n`);

  return {
    futuresAddress,
    walletAddress
  };
}

deploy().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});
