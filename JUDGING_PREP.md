# Sketch Flow — Judging Prep (**Flow / Consumer DeFi**)

## Table of Contents

1. [Challenge fit: Consumer DeFi on Flow](#challenge-fit-consumer-defi-on-flow)
2. [Project Overview](#project-overview)
3. [System Architecture](#system-architecture)
4. [Technology Stack](#technology-stack)
5. [Cadence Contracts](#cadence-contracts)
6. [Backend Architecture](#backend-architecture)
7. [Frontend (unchanged UX surface)](#frontend-unchanged-ux-surface)
8. [Core Innovation: Directional Accuracy PnL](#core-innovation-directional-accuracy-pnl)
9. [EigenDA Integration](#eigenda-integration)
10. [Optional: EVM path (Base / Privy)](#optional-evm-path-base--privy)
11. [Deploying to Flow Testnet](#deploying-to-flow-testnet)
12. [Data Flow Walkthroughs](#data-flow-walkthroughs)
13. [Security Considerations](#security-considerations)
14. [Q&A Prep](#qa-prep)
15. [Quick Reference: Key File Locations](#quick-reference-key-file-locations)

---

## Challenge fit: Consumer DeFi on Flow

**Consumer DeFi** brings on-chain finance into everyday use: minimal jargon, fewer manual steps, less “sign this transaction” fatigue, with automation and strong security that feels invisible.

How this build maps to that:

| Consumer DeFi theme | How we address it |
| ------------------- | ----------------- |
| **Accessible onboarding** | Flow-native path: Flow wallet + FLOW on testnet; optional passkey/social via Flow ecosystem wallets. (EVM build can still use Privy + embedded wallet on Base.) |
| **Sponsored / hidden gas** | On Flow, fee handling is **native** (small FLOW fees per tx). Optional future: sponsored transactions / wallet APIs on Flow. |
| **Human-friendly actions** | Users **draw** a prediction curve; the app turns that into structured data and commitments—no order book UX. |
| **Automation** | Minute-aligned price windows, automatic expiry handling, PnL server closes positions on a schedule. |
| **Security without UX cost** | Cadence **resources** (`PriceOracle.Admin`, `LineFutures.PnlOperator`) gate who can write oracle rows or close positions; custody stays in vault semantics (FLOW in `LineFutures` treasury). |

**Why Flow:** Cadence’s resource-oriented model fits **custodial-of-program** patterns (treasury vault, capability-based admin), native FLOW for testnet collateral, and clear separation between **public reads** and **authorized writes**—aligned with consumer-grade products that still need real on-chain settlement.

---

## Project Overview

**Sketch Flow** is a gamified prediction experience: users sketch a price path on a chart; the curve becomes **60 sampled points**, committed to **EigenDA**, referenced on-chain in **LineFutures** (Cadence on **Flow testnet**). After **60 seconds** (per position), the backend loads prediction + realized prices, computes **directional-accuracy PnL**, and **closes** the position on Flow via the **PnlOperator** resource.

**Key integrations**

- **Flow + Cadence** — `LineFutures` and `PriceOracle` contracts; FLOW collateral and payouts.
- **EigenDA** — blob storage for predictions and price windows; commitments stored on-chain.
- **Flow mode** — with `BLOCKCHAIN_ADAPTER=flow`, opens are **native Flow** (user signs Cadence txs with their Flow account); the EVM predict UI in this repo is not wired to FCL yet.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                  SKETCH FLOW ON FLOW (CONSUMER-DEFI ORIENTED)               │
├────────────────────────────────────────────────────────────────────────────┤
│  FRONTEND (Next.js — UI not redesigned for this migration)                 │
│  ├─ Predict: draw curve → sample 60 → upload → open via Flow wallet (FCL)   │
│  ├─ History / Leaderboard / Landing                                        │
│  └─ Flow wallet connection when FCL is wired; today often Privy + Base for demo │
│                                                                            │
│  PRICE PIPELINE                                                            │
│  Bybit WS → aggregator → MongoDB + EigenDA commitments                     │
│                                                                            │
│  SETTLEMENT                                                                │
│  PositionCloser → PnL calc → Flow tx: PnlOperator.closePosition              │
│                                                                            │
│  FLOW (Cadence)                                                            │
│  ├─ LineFutures: FLOW treasury, positions, fees, events                  │
│  └─ PriceOracle: DA commitment strings per minute (Admin resource)         │
│                                                                            │
│  DATA                                                                      │
│  MongoDB / SQLite (leaderboard), EigenDA blobs, Flow chain state           │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
| ----- | ---------- |
| **Smart contracts** | **Cadence** — `LineFutures`, `PriceOracle` (Flow testnet targets) |
| **Chain** | **Flow** (testnet REST: e.g. `https://rest-testnet.onflow.org`) |
| **Backend chain client** | `@onflow/fcl`, `@onflow/sdk`, server-side signing (`FLOW_PRIVATE_KEY`, etc.) |
| **Backend** | Node.js, Express, TypeScript |
| **Frontend** | Next.js (App Router), React, Tailwind — **unchanged in this migration** |
| **EVM path (optional)** | `ethers` v6 when `BLOCKCHAIN_ADAPTER=evm` (legacy Base/Sepolia tooling) |
| **DA** | EigenDA via HTTP proxy |
| **Wallet / UX (Flow)** | Flow wallet + FCL for submits when the client is migrated; backend Flow mode matches Cadence |
| **Charts** | TradingView lightweight-charts |

---

## Cadence Contracts

Source: `cadence/contracts/`.

### LineFutures

- **FLOW** in/out via `FlowToken` / `FungibleToken` (testnet addresses: `0x7e60df042a9c0868`, `0x9a0766d93b6608b7`).
- **Treasury** holds deposited FLOW; **open** moves vault → treasury; **close** withdraws payout to user’s **`/public/flowTokenReceiver`**.
- **Positions** — struct fields align with the old Solidity model: user `Address`, amount `UFix64`, leverage, timestamps `UFix64`, commitment strings, `Fix64` pnl when closed.
- **Roles (resources)**  
  - **`PnlOperator`** — only path used by backend to call internal close logic (stored at `/storage/drawfiPnlOperator` on the operator account).  
  - **`OwnerAdmin`** — pause, fees, emergency withdraw (stored separately; deploy/setup).  
- **Batch open** — 1–5 commitments, staggered `openTimestamp` by 60s; remainder FLOW refunded to user.
- **Fees** — 2% of **positive** pnl (200 bps), same product rule as before.

### PriceOracle

- **`Admin` resource** — `storeCommitment(windowStart, commitment)`; only the account that holds the resource can write (setup transaction saves it under e.g. `/storage/drawfiPriceOracleAdmin`).
- **Views** — `getCommitment`, `getLatestWindow`, `getWindowsInRange`, `getWindowCount`.

### Why resources instead of `msg.sender`

Cadence does not have EVM’s `msg.sender` in contract functions. Gating writes with **resources in account storage** matches Flow’s security model and is easy to explain as “only our automation account can close or write oracle rows.”

---

## Backend Architecture

- **Adapter switch** — `BLOCKCHAIN_ADAPTER=flow` uses `FlowFuturesContractStorage` (reads + **PnL server closes** only); `evm` keeps `FuturesContractStorage` (ethers) for Base-style deployments.
- **Config** — `FLOW_ACCESS_NODE`, `FLOW_ACCOUNT_ADDRESS`, `FLOW_PRIVATE_KEY`, `FLOW_KEY_ID`, `FLOW_KEY_SIGN_ALGO` (default `ECDSA_P256`), `FLOW_KEY_HASH_ALGO` (default `SHA2_256`), `FUTURES_CONTRACT_ADDRESS` or `FLOW_LINE_FUTURES_ADDRESS` for the deployed `LineFutures` account.
- **Flow modules** — `src/flow/flowSigner.ts`, `src/flow/flowTx.ts`, `src/contract/flowFuturesContractStorage.ts`.
- **EVM opens** — handled in the **Next.js** predict page via `ethers` (`openPosition` / `batchOpenPositions` with `{ value }`); no separate relayer module in the backend.
- **Position pipeline** — unchanged mathematically: `PositionService`, `PositionCloser`, `PNLCalculator`, Mongo retrieval for windows.

---

## Frontend and Flow

**Flow is Flow:** the product story is **native FLOW**, **Flow addresses**, and **Cadence transactions** for `LineFutures.openPosition` / user vault withdraw → contract (typically via **@onflow/fcl** in the browser).

If the current Next app still shows Privy/EVM-only controls, that is **legacy UI** until FCL is wired; the **backend in Flow mode** already targets **native Flow** opens and operator-signed closes only.

---

## Core Innovation: Directional Accuracy PnL

Unchanged from the previous judging doc: **59 directional comparisons** (up/down/flat) between predicted and actual series; accuracy maps linearly to PnL multiplier \((2 \times \text{accuracy} - 1) \times \text{maxProfit}\); **50% accuracy ≈ break-even**; **2% fee on profits only**.

Collateral amounts are still fed through the same **wei-scale** numeric path in the calculator for continuity; on Flow, **UFix64** amounts are converted to that scale in the adapter for PnL only.

---

## EigenDA Integration

Unchanged: predictions and price windows as blobs; commitments referenced from **LineFutures** positions and optionally from **PriceOracle** on Flow. The orchestrator continues to use **MongoDB** for window payloads in the current codebase; oracle contract writes can be enabled via a small Flow transaction layer when operators wire `ContractStorage` to Flow.

---

## Optional: EVM path (Base / Privy)

When **`BLOCKCHAIN_ADAPTER=evm`**, the live demo stack uses **LineFutures on Base**, **Privy** for the wallet, and **direct** contract calls from the browser for opens. There is **no** off-chain balance service or meta-tx relayer in this repository.

With **`BLOCKCHAIN_ADAPTER=flow`**, position **opens** are intended to be **signed by the user’s Flow account**; the **PnL server** only signs **close** txs via the **`PnlOperator`** resource.

---

## Deploying to Flow Testnet

1. **Install** [Flow CLI](https://developers.flow.com/tools/flow-cli/install).
2. **Create / fund** a testnet account with FLOW.
3. **Deploy** `PriceOracle` and `LineFutures` from `flow.json` (update account + keys).
4. **Setup transactions** (run once per deployment):
   - `PriceOracle.createAdmin()` → save `@PriceOracle.Admin` to `/storage/drawfiPriceOracleAdmin`.
   - `LineFutures.createPnlOperator()` → save to `/storage/drawfiPnlOperator`.
   - `LineFutures.createOwnerAdmin()` → save to a chosen path for ops (pause/fees).
5. Fund the **operator** account with enough **FLOW** for transaction fees on **`PnlOperator.closePosition`** (and any oracle txs). Users who open positions need their own **FlowToken vault** + **`/public/flowTokenReceiver`** so payouts succeed.
6. Set backend env: `BLOCKCHAIN_ADAPTER=flow`, `FUTURES_CONTRACT_ADDRESS=<LineFutures deploy address>`, `FLOW_ACCOUNT_ADDRESS`, `FLOW_PRIVATE_KEY`, etc.

Exact CLI commands evolve with Flow CLI versions; use `flow deploy` / project docs for the current testnet.

---

## Data Flow Walkthroughs

### Open (native Flow)

1. User draws curve → 60 points → upload → EigenDA commitment.
2. User’s **Flow wallet** signs a Cadence transaction: withdraw FLOW from their **`FlowToken.Vault`**, call **`LineFutures.openPosition`** (or batch variant). On-chain **`user`** is **`signer.address`** (a Flow address).
3. Frontend/API can poll **`getPosition`** / **`getUserPositions`** using that Flow address (16-hex `0x…` form).

### Close (automation)

1. `PositionCloser` finds closable ids (timestamp + open state).
2. Load prediction + actual window from Mongo/EigenDA.
3. `PNLCalculator` → `Fix64` pnl string for Cadence.
4. Flow tx: borrow `PnlOperator` → `closePosition` → treasury pays user **FLOW** (if any) to their public receiver.

---

## Security Considerations

| Concern | Mitigation |
| ------- | ---------- |
| Unauthorized close | Only account with **`PnlOperator`** in storage can authorize close txs. |
| Unauthorized oracle writes | Only account with **`PriceOracle.Admin`** resource. |
| User payout | **`/public/flowTokenReceiver`** must exist; otherwise close panics—expected on Flow for accounts without FLOW receiver setup. |
| EVM client hygiene | Standard wallet tx nonces; match chain ID and contract address in the UI. |
| Custody | FLOW lives in **contract treasury** resource; not a single EOA balance. |

---

## Q&A Prep

**Q: How does this fit “Consumer DeFi”?**  
We optimize for **recognizable personal-finance verbs** (draw, play, settle) while keeping **real settlement on Flow** and **auditable commitments** (EigenDA). **Automation** handles scheduled closes; **opens** stay **user-signed on Flow** (or wallet-signed on EVM until FCL is wired).

**Q: Why Flow instead of EVM L2?**  
**Resources and vault semantics** make custody and role separation **first-class**; native FLOW suits a **testnet consumer demo** without wrapping ETH. The product narrative stays the same; the **trust anchor** moves to Flow.

**Q: What did you change vs the old stack?**  
**Cadence contracts**, **Flow-backed backend** (`FlowFuturesContractStorage` for reads/closes), **config/env** for Flow.

**Q: Is the frontend “on Flow”?**  
**Settlement** is on Flow. The **intended** client path is **FCL + Flow wallet** for opens; **Privy + Base** remain the **EVM demo** path when `BLOCKCHAIN_ADAPTER=evm`.

**Q: EigenDA still matters?**  
Yes—**cost and verifiability** for 60-point payloads; Flow stores **references**, not the full series.

---

## Quick Reference: Key File Locations

| Component | Path |
| --------- | ---- |
| LineFutures (Cadence) | `cadence/contracts/LineFutures.cdc` |
| PriceOracle (Cadence) | `cadence/contracts/PriceOracle.cdc` |
| Flow CLI manifest | `flow.json` |
| Flow futures adapter | `backend/src/contract/flowFuturesContractStorage.ts` |
| Flow tx / FCL helpers | `backend/src/flow/flowTx.ts`, `backend/src/flow/flowSigner.ts` |
| Config / adapter flag | `backend/src/config/config.ts` |
| EVM predict opens (frontend) | `frontend/app/predict/page.tsx` |
| Backend entry | `backend/src/index.ts` |
| PnL engine | `backend/src/pnl/pnlCalculator.ts` |
| Position closer | `backend/src/futures/positionCloser.ts` |
| Predict UI | `frontend/app/predict/page.tsx` |

---

## Legacy reference

Solidity `LineFutures.sol` and Hardhat artifacts under `contracts/` remain in the repo for **historical / EVM** comparison when `BLOCKCHAIN_ADAPTER=evm`. The **judging story for this submission** is **Flow testnet + Cadence** as above.
