/**
 * Deploy PriceOracle and LineFutures directly with ethers (no Ignition).
 * Use when Ignition fails with HHE10402 (pending nonce).
 *
 * Run from contracts/: node scripts/run-deploy-direct.js
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { network } from "hardhat";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const { ethers } = await network.connect();
  const [signer] = await ethers.getSigners();
  const submitter = signer.address;

  console.log("Deployer:", submitter);
  console.log("Deploying PriceOracle...");

  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const oracle = await PriceOracle.deploy(submitter);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("PriceOracle deployed to:", oracleAddress);

  console.log("Deploying LineFutures...");
  const LineFutures = await ethers.getContractFactory("LineFutures");
  const futures = await LineFutures.deploy(submitter, oracleAddress);
  await futures.waitForDeployment();
  const futuresAddress = await futures.getAddress();
  console.log("LineFutures deployed to:", futuresAddress);

  const result = {
    CONTRACT_ADDRESS: oracleAddress,
    ORACLE_CONTRACT_ADDRESS: oracleAddress,
    FUTURES_CONTRACT_ADDRESS: futuresAddress,
  };
  const outPath = join(__dirname, "..", "deployment-result.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
  console.log("Wrote", outPath);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
