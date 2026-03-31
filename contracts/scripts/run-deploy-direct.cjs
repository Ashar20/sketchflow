#!/usr/bin/env node
/**
 * Load backend env, run deploy-direct.ts (ethers deploy, no Ignition), then update backend and frontend .env.local.
 * Run from repo root: node contracts/scripts/run-deploy-direct.cjs
 * Or from contracts/: node scripts/run-deploy-direct.cjs
 */
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const scriptDir = __dirname;
const contractsDir = path.join(scriptDir, "..");
const repoRoot = path.join(contractsDir, "..");
const backendEnvPath = path.join(repoRoot, "backend", ".env.local");
const frontendEnvPath = path.join(repoRoot, "frontend", ".env.local");
const resultPath = path.join(contractsDir, "deployment-result.json");

require("dotenv").config({ path: backendEnvPath });

function updateEnvFile(filePath, updates) {
  if (!fs.existsSync(filePath)) {
    console.warn("Env file not found:", filePath);
    return;
  }
  let content = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^(${key}=).*`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `$1${value}`);
    } else {
      content = content.trimEnd() + "\n" + key + "=" + value + "\n";
    }
  }
  fs.writeFileSync(filePath, content, "utf-8");
  console.log("Updated", filePath);
}

console.log("Running direct deploy (no Ignition)...\n");
execSync("pnpm exec hardhat run scripts/deploy-direct.ts --network base", {
  stdio: "inherit",
  env: process.env,
  cwd: contractsDir,
});

const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
console.log("\nDeployed addresses:", result);

updateEnvFile(backendEnvPath, {
  CONTRACT_ADDRESS: result.CONTRACT_ADDRESS,
  FUTURES_CONTRACT_ADDRESS: result.FUTURES_CONTRACT_ADDRESS,
  ORACLE_CONTRACT_ADDRESS: result.ORACLE_CONTRACT_ADDRESS,
});

updateEnvFile(frontendEnvPath, {
  NEXT_PUBLIC_FUTURES_CONTRACT_ADDRESS: result.FUTURES_CONTRACT_ADDRESS,
});

console.log("\nDone. Restart backend and frontend to use the new contracts.");
