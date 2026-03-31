# Contract Deployment Guide for Ethereum Sepolia

## Prerequisites

1. Ensure you have Sepolia ETH in your deployment wallet
2. Set up environment variables (see below)
3. The backend wallet address will be used as the submitter and PnL server

## Step 1: Set Environment Variables

The Hardhat config expects these variables. You can set them as environment variables:

```bash
export ETHEREUM_RPC_URL=https://rpc.sepolia.org
export ETHEREUM_SEPOLIA_PRIVATE_KEY=your_private_key_here
```

Or use Hardhat keystore:
```bash
npx hardhat keystore set ETHEREUM_SEPOLIA_PRIVATE_KEY
npx hardhat keystore set ETHEREUM_RPC_URL
```

## Step 2: Deploy MNTPriceOracle

First, deploy the price oracle contract. The submitter address should be your backend wallet address (the one that will submit price commitments).

```bash
cd contracts
npx hardhat ignition deploy --network sepolia ignition/modules/MNTPriceOracle.ts \
  --parameters '{"MNTPriceOracleModule":{"submitterAddress":"YOUR_BACKEND_WALLET_ADDRESS"}}'
```

**Save the deployed oracle address** - you'll need it for the next step.

## Step 3: Deploy LineFutures

Deploy the LineFutures contract. You'll need:
- `pnlServerAddress`: Your backend wallet address (same as submitter)
- `mntPriceOracleAddress`: The oracle address from Step 2

```bash
npx hardhat ignition deploy --network sepolia ignition/modules/LineFutures.ts \
  --parameters '{"LineFuturesModule":{"pnlServerAddress":"YOUR_BACKEND_WALLET_ADDRESS","mntPriceOracleAddress":"ORACLE_ADDRESS_FROM_STEP_2"}}'
```

**Save the deployed LineFutures address**.

## Step 4: Update Backend Environment

Update your `backend/.env.local` with the new addresses:

```env
CONTRACT_ADDRESS=<oracle_address_from_step_2>
FUTURES_CONTRACT_ADDRESS=<linefutures_address_from_step_3>
```

## Step 5: Verify Deployment

You can verify the contracts on Etherscan:
- Sepolia Etherscan: https://sepolia.etherscan.io/

## Notes

- Make sure your deployment wallet has enough Sepolia ETH for gas fees
- The backend wallet address should be the same for both submitter and PnL server
- After deployment, update the frontend `.env.local` if you have `NEXT_PUBLIC_FUTURES_CONTRACT_ADDRESS` set
