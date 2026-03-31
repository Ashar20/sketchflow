# Sketch Flow — 2.5 Min Build in Public Pitch

---

## 1. Hook — The Pain (20 sec)

> 95% of retail users who try derivatives trading lose money — not because they can't read charts, but because the tools are built for quant desks, not humans.

$200B trades hands daily in crypto derivatives. Almost none of it comes from the 100M+ crypto users who understand price direction but can't navigate order books, margin calls, and gas fees.

---

## 2. Why Now / Why It Matters (20-25 sec)

Three things changed this year:

- **Base brought fees to near-zero** — micro-positions are finally viable on-chain
- **Embedded wallets killed the MetaMask barrier** — users sign up with Google, not seed phrases
- **Polymarket proved the model** — $50B+ volume showed that simplified speculation has massive product-market fit

Current perp DEXs (dYdX, GMX, Hyperliquid) are powerful but intimidating. Prediction markets are simple but binary. There's nothing in between — until now.

---

## 3. The Product (30 sec)

> We built Sketch Flow for crypto-native users who understand charts but don't trade — so they can predict price movement by drawing a curve and earn real payouts in 60 seconds, instead of learning perpetual futures.

**How it works:**
1. You draw a price curve on a canvas
2. Pick your stake (as low as $0.10) and leverage (up to 2500x)
3. In 60 seconds, we score your 59 directional predictions against real BTC price data
4. Above 50% accuracy = profit. Below = loss. Simple, fair, verifiable.

No order books. No liquidations. No complexity. Just draw and earn.

---

## 4. On-chain stack (30 sec)

> Positions live in **LineFutures** on Base. The user wallet signs `openPosition` / `batchOpenPositions` with native ETH value; the backend runs an automated closer that settles expired positions and writes results to the leaderboard database.

**What we use:**
- **LineFutures** — collateral, leverage, fees, and settlement on Base
- **MongoDB + commitments** — prediction and price window payloads referenced at close time
- **Position closer** — cron-driven `closePosition` from the designated operator key

**Trade-off:** Users pay network gas on each open. In return, there is no off-chain ledger or relayer trust path — opens are ordinary contract calls from the user's wallet.

**What breaks if our backend is down?** New closes can stall until it is back; funds and position state remain on-chain. We can add redundancy or decentralize the closer over time.

---

## 5. Quick Demo (35-40 sec)

**Pre-loaded state: Wallet connected with a little ETH on Base**

Core action flow:
1. Open predict page — live BTC chart streaming from Bybit
2. Draw a price curve on the canvas (3 seconds)
3. Set 0.5 USDC stake, 10x leverage, 1-minute window
4. Hit submit — wallet confirms `openPosition` (gas)
5. Position is live on Base
6. 60 seconds later: position auto-settles, PnL calculated from directional accuracy
7. Payout lands in the user's wallet per the contract

One action. Draw to earn. 60 seconds start to finish.

*(Backup screen recording prepared in case of live demo issues)*

---

## 6. Traction + Next 90 Days (25-30 sec)

**Now:**
- Live on Base mainnet with real settlement
- Wallet-native opens against LineFutures
- 4 trading pairs (BTC, ETH, AAVE, DOGE)
- Automated position closer running every 10 seconds
- Leaderboard tracking accuracy, PnL, and win rate

**Next 90 days:**
- Launch prediction tournaments with prize pools
- Add 10+ token pairs
- Mobile-optimized drawing experience
- Social features: share predictions, follow top drawers
- Target 1,000 active weekly users through crypto Twitter and trading communities

---

**Team:**
- **Fabian Ferno** — Scaled products to 10K+ users, full-stack Web3, smart contract architecture
- **Philo Sanjay** — Backend systems, built the real-time price pipeline and settlement engine
- **Silas Ashar** — Frontend and product, designed the drawing interface and trading UX
