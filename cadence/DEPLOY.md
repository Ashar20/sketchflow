# Flow: deploy Sketch Flow contracts and wire the app

This stack uses **Cadence** `PriceOracle` and `LineFutures`. Operator resources live at **`/storage/sketchflowPnlOperator`**, **`/storage/sketchflowPriceOracleAdmin`**, and optionally **`/storage/sketchflowOwnerAdmin`**.

Contracts and transactions target **Cadence 1.x** / **Flow CLI v2** (`flow deploy`, `flow transactions send`). User txs use `prepare(signer: auth(Storage) &Account)` and `signer.storage.borrow` / `save`.

Root **`flow.json`** is configured for **testnet** deploy account **`0x168a31e4dc7d31f1`** (see **`testnet-deployer`**). Save your funded account’s private key as **`testnet-account.pkey`** in the repo root (same format as **`emulator-account.pkey`**; gitignored). Emulator uses a **separate** config file.

## Local emulator (no testnet keys)

From the **repo root** (uses **`flow.emulator.json`**, **`emulator-account.pkey`**, and **`cadence/emulator/LineFutures.cdc`**):

```bash
# Terminal A — core contracts + REST on :8888
flow emulator --contracts -f flow.emulator.json

# Terminal B
LINE_FUTURES_ADDRESS=0xf8d6e0586b0a20c7 node scripts/sync-flow-cadence-address.mjs
flow deploy -n emulator -f flow.emulator.json -y
flow transactions send cadence/transactions/setup_price_oracle_admin.cdc --signer emulator-account -n emulator -f flow.emulator.json -y
flow transactions send cadence/transactions/setup_pnl_operator.cdc --signer emulator-account -n emulator -f flow.emulator.json -y
flow transactions send cadence/transactions/setup_owner_admin.cdc --signer emulator-account -n emulator -f flow.emulator.json -y
```

Then copy **`backend/env.emulator.example`** → `backend/.env.local` and **`frontend/env.emulator.example`** → `frontend/.env.local` (adjust MongoDB / admin key). **`FLOW_KEY_HASH_ALGO=SHA3_256`** matches the default emulator service account.

To reset transaction imports in git to the placeholder after experimenting:

```bash
LINE_FUTURES_ADDRESS=0x0000000000000001 node scripts/sync-flow-cadence-address.mjs
```

(Use your **real** deploy address instead of `0x000…01` before sending txs on testnet.)

## Prerequisites (testnet / mainnet)

- [Flow CLI](https://developers.flow.com/tools/flow-cli/install) installed.
- A **funded** Flow testnet (or mainnet) account for deployment and, usually, the backend signer account that will hold **`PnlOperator`**.

## 1. Testnet deploy (`flow.json`)

1. Create **`testnet-account.pkey`** in the repo root with your account private key (hex; `0x` prefix is OK if that’s what `flow keys generate` printed).
2. Ensure the account **`0x168a31e4dc7d31f1`** has enough **FLOW** for deploy + setup txs.
3. Deploy **`cadence/contracts/PriceOracle.cdc`** and **`cadence/contracts/LineFutures.cdc`** (testnet core token imports)—not **`cadence/emulator/`**.

```bash
flow deploy -n testnet -f flow.json -y
```

Deployments use the **`testnet-deployer`** account from **`flow.json`**.

## 2. Sync import addresses in transactions

User-facing and setup transactions use a single placeholder import address **`0x0000000000000001`**. After you know the deployed account:

```bash
cd /path/to/sketchflow
LINE_FUTURES_ADDRESS=0xYour16CharHexAddr node scripts/sync-flow-cadence-address.mjs
```

This rewrites **`cadence/transactions/*.cdc`** so `import LineFutures from 0x…` and `import PriceOracle from 0x…` match your deployment (same account for both contracts is typical).

## 3. One-time setup transactions (on-chain)

Sign and send with the **appropriate** accounts:

| Transaction | Who signs | Purpose |
|-------------|-----------|---------|
| `setup_price_oracle_admin.cdc` | Account that will submit oracle commitments | Stores `@PriceOracle.Admin` at `/storage/sketchflowPriceOracleAdmin` |
| `setup_pnl_operator.cdc` | **Same account as backend** `FLOW_ACCOUNT_ADDRESS` | Stores `@LineFutures.PnlOperator` at `/storage/sketchflowPnlOperator` (required for **`closePosition`** from the API) |
| `setup_owner_admin.cdc` | Owner / ops | Optional `@LineFutures.OwnerAdmin` at `/storage/sketchflowOwnerAdmin` |

Use Flow CLI, Flow Port, or your wallet to submit these after syncing addresses.

## 4. Wire backend (`backend/.env` or `.env.local`)

```env
BLOCKCHAIN_ADAPTER=flow
NETWORK=testnet
FLOW_ACCESS_NODE=https://rest-testnet.onflow.org

# LineFutures deployment account (16-hex Flow address)
FUTURES_CONTRACT_ADDRESS=0xYour16CharHexAddr
# or explicitly:
# FLOW_LINE_FUTURES_ADDRESS=0xYour16CharHexAddr

# Operator account that holds PnlOperator at /storage/sketchflowPnlOperator
FLOW_ACCOUNT_ADDRESS=0x...
FLOW_PRIVATE_KEY=...   # hex, no 0x; or reuse ETHEREUM_PRIVATE_KEY if same encoding your signer expects
FLOW_KEY_ID=0
```

You still need **`MONGODB_URI`**, **`ADMIN_API_KEY`**, and **`ETHEREUM_PRIVATE_KEY`** in the default config loader today (use a throwaway dev key for EVM-only fields if you are Flow-only locally).

## 5. Wire frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_FLOW_NETWORK=testnet
NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS=0xYour16CharHexAddr
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

If you override FlowToken / FungibleToken addresses, set the same values in the backend sponsor section (see `backend/.env.example`).

## 6. Core contract addresses (reference)

| Network | FungibleToken | FlowToken |
|---------|---------------|-----------|
| Testnet | `0x9a0766d93b6608b7` | `0x7e60df042a9c0868` |
| Mainnet | `0xf233dcee88fe0abe` | `0x1654653399040a61` |

`open_position.cdc` and `batch_open_positions.cdc` ship with **testnet** imports; for mainnet deployments, update those two imports to the mainnet rows above.

## EVM / Hardhat

Solidity contracts under `contracts/` are **optional** for this Flow-native path. They are not required to deploy or run **`BLOCKCHAIN_ADAPTER=flow`**.
