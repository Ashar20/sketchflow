# Sketch Flow

**Sketch Flow** is a gamified futures trading platform where users predict token price movements by **drawing curves on a chart** instead of placing traditional orders. It's a 1–5 minute prediction game with directional accuracy-based PnL calculation.

**Core Innovation**: Users draw their price predictions as freehand curves, which are sampled into 60 price points and stored in MongoDB. When the position expires (after 60 seconds per position), PnL is calculated based on how many of the 59 directional changes (up/down/flat) the user predicted correctly — not on magnitude, just direction.

**Key Integrations**:

- **MongoDB Atlas** — cloud database for storing user predictions and actual price windows
- **LineFutures (EVM or Flow)** — user-signed opens; backend closes expired positions and records leaderboard data

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       SKETCH FLOW SYSTEM ARCHITECTURE                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  FRONTEND (Next.js 16 + React 19)                                         │
│  ├─ Landing Page (hero, features, animations)                             │
│  ├─ Predict Page (TradingChart + PatternDrawingBox canvas)                │
│  ├─ History Page (open/closed positions)                                  │
│  ├─ Leaderboard Page (user rankings)                                     │
│  └─ Flow wallet (FCL) + Cadence transactions for opens                  │
│                                                                            │
│  ┌──────────────────────┐     ┌──────────────────────────┐                │
│  │   PRICE PIPELINE     │     │  PREDICTION PIPELINE     │                │
│  │  Bybit WebSocket     │     │  User draws curve        │                │
│  │  → Price Ingester    │     │  → Sample to 60 points   │                │
│  │  → Price Aggregator  │     │  → Upload to MongoDB     │                │
│  │    (60 prices/min)   │     │  → Get commitment ID     │                │
│  │  → MongoDB submit    │     │  → Store on-chain ref    │                │
│  │  → PriceOracle store │     └──────────────────────────┘                │
│  └──────────────────────┘                                                  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │   FUTURES LIFECYCLE                                   │                  │
│  │  1. User opens position via LineFutures contract      │                  │
│  │  2. PositionCloser cron (every 10s) finds expired     │                  │
│  │  3. Retrieves predictions + actual prices from MongoDB│                  │
│  │  4. PNL Calculator computes directional accuracy      │                  │
│  │  5. Settlement on-chain via LineFutures.closePosition │                  │
│  │  6. Payout to user wallet (native token on chain)      │                  │
│  └──────────────────────────────────────────────────────┘                  │
│                                                                            │
│  ┌──────────────────────────────────┐                                      │
│  │   DATA STORES                    │                                      │
│  │  ├─ MongoDB (predictions/prices) │                                      │
│  │  │  └─ price_commitments (index) │                                      │
│  │  ├─ LineFutures (on-chain state) │                                      │
│  │  └─ SQLite (leaderboard/history) │                                      │
│  └──────────────────────────────────┘                                      │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer            | Technology                                                       |
| ---------------- | ---------------------------------------------------------------- |
| Smart Contracts  | Solidity ^0.8.28, Hardhat, Hardhat Ignition                     |
| Backend          | Node.js, Express.js, TypeScript                                  |
| Frontend         | Next.js 16 (App Router), React 19, TailwindCSS 4                |
| Blockchain       | Flow testnet / mainnet (default backend: `BLOCKCHAIN_ADAPTER=flow`) |
| Database         | MongoDB Atlas (cloud), SQLite (local)                            |
| Wallet           | Flow (FCL discovery + user-signed Cadence txs)                     |
| Charting         | TradingView lightweight-charts                                   |
| Animations       | Framer Motion, Three.js (3D backgrounds)                         |
| Database         | SQLite with WAL mode (via better-sqlite3)                        |
| Price Feed       | Bybit WebSocket (real-time tickers)                              |
| Flow contracts   | Cadence `LineFutures` / `PriceOracle` (see `cadence/contracts`)   |
| Signatures       | User Flow account (opens); operator Flow key (backend closes)     |
| State Management | TanStack Query (React Query)                                     |
| Blockchain Libs  | @onflow/fcl, @onflow/types (frontend); optional EVM stack in `contracts/` |

---

## Smart Contracts Deep Dive

### LineFutures.sol — Position Lifecycle Management

**Purpose**: Manages the full lifecycle of prediction positions — open, close, fee collection, and payouts.

**Key State**:

```solidity
struct Position {
    address user;
    uint256 amount;                    // wei deposited
    uint16 leverage;                   // 1x–2500x
    uint256 openTimestamp;
    string predictionCommitmentId;     // MongoDB ObjectId for user's 60-point prediction
    bool isOpen;
    int256 pnl;
    string actualPriceCommitmentId;    // MongoDB ObjectId for actual 60-price window
    uint256 closeTimestamp;
}
```

**Core Functions**:

| Function                 | Description                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `openPosition()`        | Accepts ETH + leverage + prediction commitment ID. Min 0.001 ETH, max 2500x leverage.       |
| `batchOpenPositions()`  | Opens 1–5 positions in a single tx with equal ETH split. Staggered timestamps (i × 60s).    |
| `closePosition()`       | Called by PnL server only. Requires position expired. Deducts 2% fee on profits. Pays user.  |
| `getClosablePositions()`| Returns array of position IDs where `block.timestamp >= openTimestamp + 60s` and still open.  |

**Constants**:

- `MIN_AMOUNT` = 0.001 ETH (10^15 wei)
- `MAX_LEVERAGE` = 2500x
- `POSITION_DURATION` = 60 seconds
- `feePercentage` = 200 basis points (2% on profits only)

---

## Backend Architecture

The backend is organized into distinct pipelines, each responsible for a part of the system.

### 5.1 Price Pipeline

```
Bybit WebSocket → PriceIngester → PriceAggregator → MongoDB (data + commitment index)
```

1. **PriceIngester** (`src/ingester/priceIngester.ts`)
   - WebSocket connection to Bybit's public ticker stream (`tickers.BTCUSDT`)
   - Emits `'price'` events with `{price, timestamp, source}`
   - Auto-reconnect with exponential backoff (max 10 attempts)
   - Heartbeat check every 10s (reconnects if no data for 30s)
   - Supports dynamic ticker switching (BTC, ETH, AAVE, DOGE)

2. **PriceAggregator** (`src/aggregator/priceAggregator.ts`)
   - Accumulates prices into minute-aligned 60-second windows
   - Produces exactly 60 data points per window (one per second)
   - Gap-filling: backward fill from end, then forward fill from start
   - Calculates TWAP and volatility (standard deviation) per window
   - Emits `'windowReady'` event

3. **MongoDBStorage** (`src/storage/mongoStorage.ts`)
   - MongoDB client connected to Atlas cloud database
   - Retry logic: 3 attempts with exponential backoff (5s → 10s → 20s)
   - Stores data in collections: `price_windows`, `user_predictions`, and `price_commitments`
   - Returns MongoDB ObjectId as hex string with `0x` prefix
   - Stores commitment mappings (windowStart → commitment) in `price_commitments` collection

4. **Orchestrator** (`src/orchestrator/orchestrator.ts`)
   - Coordinates the entire price pipeline end-to-end
   - Event-driven: listens to `windowReady` → MongoDB submit → MongoDB commitment storage
   - Window check interval every 5 seconds

### 5.2 Futures/Position Pipeline

1. **PredictionService** (`src/futures/predictionService.ts`)
   - Accepts user-drawn prediction curves (exactly 60 numbers)
   - Rate limiting: 10 requests per 60s per IP/address
   - Validates: exactly 60 positive finite numbers
   - Uploads to MongoDB, returns commitment ID (ObjectId)

2. **PositionService** (`src/futures/positionService.ts`)
   - Retrieves position details with predictions + analytics
   - Closes expired positions:
     - Retrieve predictions from MongoDB
     - Retrieve actual prices from MongoDB (via commitment lookup)
     - Calculate PnL via PNLCalculator
     - Call `LineFutures.closePosition()` on-chain
     - Record in PositionDatabase (for leaderboard)

3. **PositionCloser** (`src/futures/positionCloser.ts`)
   - Cron job running every 10 seconds
   - Calls `LineFutures.getClosablePositions()` to find expired positions
   - 2-second delay between closing each position
   - Retry queue: failed positions retry up to 5 times
   - Skip list: positions permanently skipped (e.g., data loss)

### 5.3 Position Database (SQLite)

```sql
CREATE TABLE closed_positions (
    id INTEGER PRIMARY KEY,
    position_id INTEGER UNIQUE NOT NULL,
    user_address TEXT NOT NULL,
    amount TEXT,
    leverage INTEGER,
    open_timestamp INTEGER NOT NULL,
    close_timestamp INTEGER NOT NULL,
    pnl TEXT,
    prediction_commitment_id TEXT,
    actual_price_commitment_id TEXT,
    tx_hash TEXT,
    accuracy REAL,
    correct_directions INTEGER,
    total_directions INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Indexed on `user_address`, `open_timestamp`, `close_timestamp` for fast leaderboard queries.

### 5.4 API Endpoints

**Health & Data**:

| Endpoint                  | Method | Description                   |
| ------------------------- | ------ | ----------------------------- |
| `/api/health`            | GET    | System status                 |
| `/api/latest`            | GET    | Latest price window           |
| `/api/history`           | GET    | Price history (start/end)     |
| `/api/stats`             | GET    | Statistics                    |
| `/api/metrics`           | GET    | Detailed system metrics       |

**Futures**:

| Endpoint                            | Method | Description                      |
| ----------------------------------- | ------ | -------------------------------- |
| `/api/predictions/upload`          | POST   | Upload prediction → MongoDB      |
| `/api/predictions/:commitmentId`   | GET    | Retrieve prediction data         |
| `/api/position/:positionId`        | GET    | Full position details            |
| `/api/positions/user/:address`     | GET    | User's positions                 |
| `/api/positions/open`              | GET    | All open positions               |
| `/api/positions/closed`            | GET    | Closed positions                 |
| `/api/leaderboard`                 | GET    | Rankings (PnL/accuracy/winrate)  |
| `/api/leaderboard/user/:address`   | GET    | User stats                       |
| `/api/admin/close-expired`         | POST   | Manually close expired (admin)   |

---

## Frontend Architecture

### Pages

1. **Landing Page** (`app/page.tsx`) — Hero section with "Draw your futures" tagline, feature showcase with Framer Motion animations, Nyan Cat easter egg, CTA to Predict page.

2. **Predict Page** (`app/predict/page.tsx`) — Main trading interface:
   - **TokenPairSelector**: Choose BTC/USDT, ETH/USDT, AAVE/USDT, DOGE/USDT
   - **TradingChart**: Real-time price chart via lightweight-charts
   - **PatternDrawingBox**: Canvas for drawing predictions (left-to-right only, neon cyan glow)
   - **BottomControls**: Amount slider (USDC), leverage slider (1–2500x), submit/cancel
   - Time horizon: 1–5 minutes (offset)
   - Onboarding tour (NextStep library)

3. **History Page** (`app/history/`) — View all user positions (open/closed) with details: position ID, token pair, amount, leverage, PnL, accuracy, timestamps.

4. **Leaderboard Page** (`app/leaderboard/`) — Global rankings by PnL, win rate, accuracy. User profiles with aggregated stats.

### Key Components

- **TradingChart.tsx** — lightweight-charts integration, real-time price rendering
- **PatternDrawingBox.tsx** — HTML5 Canvas drawing with mouse/touch, samples curve to 60 points
- **PredictionOverlay.tsx** — Shows drawn prediction overlaid on the price chart
- **NyanCat.tsx** — 3D Nyan Cat animation (Three.js)
- **ColorBlends.tsx** — Shader gradient background (Three.js)
- **SlotMachineLever.tsx** — Fun submit button animation

### Custom Hooks

- `usePredictionDrawing` — Drawing state (points, canvas operations)
- `usePriceData` — Fetch price data from backend
- `useFlowWallet` — Flow wallet session via FCL (`authenticate` / `unauthenticate`)
- `useTokenPair` — Global token pair context

---

## Core Innovation: Directional Accuracy PnL

This is the heart of Sketch Flow's game mechanics. Instead of traditional P&L based on entry/exit price difference, we use **directional accuracy** across the entire curve.

### The Formula

```
Step 1: Extract directions
  For i = 0 to 58:
    predictedDirection[i] = sign(predictions[i+1] - predictions[i])   // +1, -1, or 0
    actualDirection[i]    = sign(actualPrices[i+1] - actualPrices[i]) // +1, -1, or 0

Step 2: Count correct predictions
  correctDirections = count where predictedDirection[i] == actualDirection[i]
  totalDirections = 59

Step 3: Calculate accuracy
  accuracy = correctDirections / 59

Step 4: Calculate max profit potential
  priceMovement = |actualPrices[59] - actualPrices[0]|
  positionSize  = amount / actualPrices[0]
  maxProfit     = priceMovement × positionSize × leverage

Step 5: Calculate PnL
  pnl = (2 × accuracy - 1) × maxProfit

Step 6: Apply fee (only on profits)
  if pnl > 0: fee = pnl × 0.02 (2%)
  finalAmount = amount + pnl - fee
```

### Key Properties

| Accuracy | Outcome          | Interpretation                          |
| -------- | ---------------- | --------------------------------------- |
| 100%     | Max profit       | Every second's direction correctly predicted |
| 75%      | Half max profit  | Strong prediction skill                 |
| 50%      | Break-even       | Random chance baseline                  |
| 25%      | Half max loss    | Mostly wrong                            |
| 0%       | Max loss         | Every direction predicted incorrectly   |

This creates elegant game dynamics:
- **50% accuracy = break-even** (equivalent to random guessing)
- The formula `(2 × accuracy - 1)` linearly maps [0, 1] accuracy to [-1, +1] PnL multiplier
- Leverage amplifies both gains and losses proportionally
- Only directional accuracy matters, not magnitude — preventing trivial strategies

---

## MongoDB Storage

### Why MongoDB?

Storing 60 price points directly on-chain per position would be prohibitively expensive. MongoDB Atlas provides reliable cloud storage with on-chain commitment references (ObjectIds) for verification.

### Two-Way Usage

**1. Price Windows (Backend → MongoDB → PriceOracle)**

```
Every 60 seconds:
  PriceAggregator produces 60-price window
  → Insert document into MongoDB `price_windows` collection
  → Receive ObjectId as hex string commitment
  → Store commitment in PriceOracle contract (indexed by minute timestamp)
```

**2. User Predictions (Frontend → Backend → MongoDB)**

```
User draws curve:
  Frontend samples 60 points from drawing
  → POST /api/predictions/upload (array of 60 numbers)
  → Backend validates & uploads to MongoDB `user_predictions` collection
  → Returns ObjectId commitment to frontend
  → Frontend passes commitment to LineFutures.openPosition()
```

### Verification Flow

At position close time:
1. Retrieve prediction commitment from LineFutures position data
2. Retrieve actual price commitment from MongoDB `price_commitments` collection (by minute-aligned timestamp)
3. Fetch both documents from MongoDB using ObjectId commitments
4. Extract 60-number arrays from documents
5. Run PNL calculation on the two arrays

### MongoDB Setup

**MongoDB Atlas Cloud Setup:**
1. Create free MongoDB Atlas account at https://www.mongodb.com/cloud/atlas
2. Create M0 cluster (free tier)
3. Create database named `sketchflow`
4. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/`
5. Whitelist your server IP or use `0.0.0.0/0` for testing
6. Set `MONGODB_URI` environment variable

**Collections:**
- `price_windows` — 60-second price windows with indexes on `windowStart` and `createdAt`
- `user_predictions` — User prediction data with indexes on `userAddress` and `createdAt`
- `price_commitments` — Commitment mappings (windowStart → commitment) with unique index on `windowStart`

**Benefits:**
- Cloud-hosted with automatic backups
- No data loss on restarts (persistent cloud storage)
- Query capabilities by user, timestamp, etc.
- Built-in monitoring and alerting

---

## Opening positions (Flow)

The predict page signs **Cadence transactions** with the user’s Flow wallet (`@onflow/fcl` `mutate`). Collateral is **FLOW**: the tx withdraws from `/storage/flowTokenVault` and calls `LineFutures.openPosition` or `batchOpenPositions` (see `cadence/transactions/`). Set `NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS` to your deployed contract account. Users pay Flow network fees from their wallet like any other Flow app.

**Deploy + operator setup:** see **`cadence/DEPLOY.md`** (`flow.json`, `flow deploy`, `scripts/sync-flow-cadence-address.mjs`, and storage paths `/storage/sketchflowPnlOperator`, etc.). **Testnet:** root `flow.json` targets **`0x168a31e4dc7d31f1`** — add `testnet-account.pkey`, run `flow deploy -n testnet -f flow.json`, then copy `backend/env.testnet.example` / `frontend/env.testnet.example` into `.env.local`. **Emulator:** use `flow.emulator.json` (see `cadence/DEPLOY.md`) and `env.emulator.example`.

### Optional: sponsored transaction fees (Flow payer)

You can run a **separate Flow account** that only pays transaction fees while the user remains **proposer** and **authorizer** (they still sign and supply stake from their vault). Enable on the API with `FLOW_SPONSOR_ENABLED=true`, `FLOW_SPONSOR_ADDRESS`, and `FLOW_SPONSOR_PRIVATE_KEY` (fund that account with a small FLOW balance for fees). The server exposes `GET /api/flow/fee-sponsorship` and `POST /api/flow/sponsor-sign`; the predict page calls them automatically when sponsorship is available. The server **SHA-256 allowlists** only the LineFutures **open** and **batch open** cadence templates built from `FLOW_LINE_FUTURES_ADDRESS` and `NETWORK` (and optional `FLOW_FUNGIBLE_TOKEN_ADDRESS` / `FLOW_TOKEN_ADDRESS` if you override token addresses—keep them in sync with the frontend). Optional `FLOW_SPONSOR_API_KEY` + `NEXT_PUBLIC_FLOW_SPONSOR_API_KEY` adds a simple shared secret on the sponsor-sign route.

---

## Data Flow Walkthroughs

### Flow 1: Opening a Position (FLOW collateral)

```
1. User draws prediction curve on PatternDrawingBox canvas
2. Frontend calls samplePredictionPoints(curve) → 60 price values
3. Frontend POST /api/predictions/upload → Backend PredictionService
   - Validates exactly 60 positive finite numbers
   - Uploads to MongoDB → receives commitment ID (ObjectId)
4. Frontend submits Cadence tx: withdraw FLOW from vault → LineFutures.openPosition (or batch)
5. Contract creates Position struct, emits PositionOpened event
6. Position is now live — 60-second countdown begins
```

### Flow 2: Position Settlement (Auto-Close)

```
1. PositionCloser cron runs every 10 seconds
2. Calls LineFutures.getClosablePositions()
   → Returns position IDs where block.timestamp ≥ openTimestamp + 60s
3. For each expired position:
   a. Read position data from contract (predictionCommitmentId, openTimestamp)
   b. Fetch prediction document from MongoDB using ObjectId → decode 60 numbers
   c. Compute minute-aligned window: openTimestamp rounded to minute boundary
   d. Fetch actual price commitment from MongoDB `price_commitments` collection
   e. Fetch actual price document from MongoDB using ObjectId → decode 60 numbers
   f. PNLCalculator.calculatePNL(predictions, actualPrices, amount, leverage, 200bps)
   g. Call LineFutures.closePosition(positionId, pnl, actualPriceCommitmentId)
   h. Contract transfers (amount + pnl - fee) to user
   i. Record in SQLite closed_positions table
4. Failed closures enter retry queue (max 5 retries)
```

### Flow 3: Real-Time Price Pipeline

```
1. PriceIngester connects to Bybit WebSocket (wss://stream.bybit.com)
   → Subscribes to tickers (e.g. FLOWUSDT)
   → Receives ~10 price updates per second
2. PriceAggregator accumulates prices per second
   → At minute boundary: produces 60-price window
   → Gap-fills missing seconds (backward fill, then forward fill)
   → Emits 'windowReady' event
3. Orchestrator receives event:
   → Inserts 60-price document into MongoDB → ObjectId commitment
   → Stores commitment mapping in MongoDB `price_commitments` collection (windowStart → commitment)
4. Commitment now available for position closing reference
```




## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- MongoDB Atlas account (free tier available)
- Flow testnet FLOW (wallet + gas) when running against testnet; optional Hardhat/EVM tooling only if you use the legacy Solidity contracts

### Environment

Copy `backend/.env.example` to `backend/.env` and fill in values. (The server loads `backend/.env` via dotenv.)

**Backend** (`backend/.env`):

```
ETHEREUM_PRIVATE_KEY=
FUTURES_CONTRACT_ADDRESS=   # Flow: 16-hex LineFutures account (same as NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
MONGODB_DATABASE=sketchflow
ADMIN_API_KEY=

ETH_USD_RATE=3000             # used with predict UI USDC ↔ ETH sizing (optional but recommended)
```

**Frontend** — copy `frontend/.env.example` to `frontend/.env.local`:

```
NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS=   # deployed LineFutures on Flow
NEXT_PUBLIC_FLOW_NETWORK=testnet       # or mainnet
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

**Flow Cadence** — deploy with Flow CLI per **`cadence/DEPLOY.md`** (not Hardhat).

**EVM (optional)** — copy `contracts/.env.example` to `contracts/.env` only if you use `BLOCKCHAIN_ADAPTER=evm` / Hardhat.

### Run

1. **MongoDB** — use Atlas, **or** local Docker: from the repo root run `docker compose up -d` (Mongo on `localhost:27017`, data in a named volume). Set `MONGODB_URI=mongodb://127.0.0.1:27017/` in `backend/.env`. **Or** run without Docker: `cd backend && npm run build && npm run dev:memory` (ephemeral in-memory Mongo via `mongodb-memory-server`).
2. Backend: `cd backend && npm run dev` (port 3001), or `npm run start` after `npm run build`
3. Frontend: `cd frontend && npm run dev`

### Deploy contracts

- **Flow (default):** follow **`cadence/DEPLOY.md`** — `flow.json`, `flow deploy`, then `LINE_FUTURES_ADDRESS=0x… node scripts/sync-flow-cadence-address.mjs`, run setup transactions, set `FUTURES_CONTRACT_ADDRESS` / `FLOW_LINE_FUTURES_ADDRESS` and `NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS`.
- **EVM (legacy):** `contracts/DEPLOY.md` and `contracts/DEPLOYMENT.md` (Hardhat / Ignition).

## License

MIT
