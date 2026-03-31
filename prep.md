# Sketch Flow — Demo Judge Q&A Prep

## 30-Second Elevator Pitch

Sketch Flow lets you trade futures by drawing. Instead of placing complex orders, you sketch where you think the price will go over the next minute. Your prediction is sampled into 60 price points and committed to storage before the position opens. When the minute's up, we compare your drawing against reality — direction by direction, second by second. Get over 50% of the directions right and you profit, amplified by leverage up to 2500x. You open positions from your wallet on Base (native gas). It's Pictionary meets futures trading.

---

## Numbers to Know Cold

| Metric | Value |
|--------|-------|
| Points per prediction | 60 |
| Directional comparisons | 59 |
| Break-even accuracy | 50% |
| Position duration | 60 seconds |
| Max leverage | 2500x |
| Min stake | 0.001 ETH |
| Fee | 2% on profits only |
| Position closer interval | every 10 seconds |
| Rate limit | 10 predictions per 60s per IP |
| Trading pairs | BTC, ETH, AAVE, DOGE |

---

## Category 1: Technical Architecture

**Q: Walk us through the system architecture.**

> Four main components: (1) A **real-time price pipeline** — Bybit WebSocket prices aggregated into 60-second windows, stored with on-chain commitment references. (2) A **prediction pipeline** — user-drawn curves sampled to 60 points, uploaded and referenced in our LineFutures contract. (3) An **automated settlement engine** — runs every 10 seconds, finds expired positions, retrieves prediction and actual price data, computes directional accuracy PnL, and settles on-chain. (4) A **wallet-native open path** — the user signs `LineFutures.openPosition` with ETH value; no separate relayer service in this codebase.

**Q: How does the PnL calculation work?**

> We compare 59 consecutive directional changes between predicted and actual prices. For each second-to-second transition, we check if the user predicted the correct direction (up, down, or flat). The accuracy feeds into: `pnl = (2 * accuracy - 1) * maxProfit`, where maxProfit = priceMovement * positionSize * leverage. 50% accuracy = break-even (random chance). 100% = max profit. 0% = max loss. We chose this over traditional P&L because it rewards reading market microstructure, not just guessing a direction, and random guessing averages to break-even — making it provably fair.

**Q: Why directional accuracy instead of traditional P&L?**

> Traditional futures reward a single directional bet. Sketch Flow rewards *curve-reading skill* — you need to predict the shape of price movement, not just "up or down." This creates a genuine skill game where chart readers have an edge, while random guessers break even. It also prevents trivial strategies: you can't just draw a flat line or a steep slope and win consistently.

**Q: Why do users pay gas on open?**

> Opens are standard contract calls from the user's wallet to LineFutures. That keeps custody and authorization simple: no off-chain balance ledger or third-party relayer in the loop. We convert a USDC-denominated stake to wei using a configured ETH/USD rate so the UI stays intuitive while the contract still takes ETH.

**Q: How do you ensure price feed integrity?**

> Prices flow through a controlled pipeline: Bybit WebSocket -> PriceIngester -> PriceAggregator -> storage -> on-chain commitment. The aggregator produces minute-aligned windows with gap-filling for missed data points. Once committed, the data is immutable. Write access to the PriceOracle contract is restricted to a single designated submitter address. For production hardening, we'd add multiple price sources with a median filter.

**Q: What happens if stored prediction/price data becomes unavailable?**

> Multi-layered handling. The submitter has retry logic with exponential backoff (3 attempts). The PositionCloser has a retry queue — positions that fail retrieval retry up to 5 times. Permanently lost data positions are added to a skip list and flagged. The architecture separates transient failures (retryable) from permanent data loss (skip and flag).

---

## Category 2: Trust & Centralization (Your Weakest Spot)

**Q: Your PnL server is centralized. How is this different from a centralized exchange?**

> Transparency. Predictions and prices are committed to storage *before* settlement — anyone can independently verify the PnL calculation. The centralized server is an execution convenience, not a trust assumption on correctness. The formula is deterministic: given the same two 60-point arrays, anyone gets the same PnL. Decentralizing with an oracle committee is the clear next step.

**Q: What stops the closer from misbehaving?**

> The closer can delay settlement but cannot invent PnL: predictions and price windows are committed before close, and the formula is deterministic. Stronger guarantees would come from decentralizing the closer (e.g. oracle committee).

**Q: What are the main centralization points?**

> Three: (1) The PnL server that closes positions — a single backend. We'd decentralize with an oracle network. (2) The price feed from Bybit — we'd add multiple sources with median aggregation. (3) The operator key that signs closes — we'd add multi-sig or a distributed operator set. The on-chain commitments and deterministic PnL formula limit the damage any centralized component can do — they can delay but not fabricate outcomes.

---

## Category 3: PnL Model Challenges

**Q: With 59 binary comparisons at 1-second granularity, isn't this just coin flipping?**

> At 1-second granularity, BTC price has momentum and mean-reversion patterns that skilled chart readers can exploit. Random guessing converges to 50% = break-even, so the house doesn't lose to noise. The leverage amplifies edge — even 55% accuracy is meaningfully profitable. This is skill-based, not luck-based, for anyone who can read charts.

**Q: What if price is flat for most of the 60 seconds? Flat-flat matches inflate accuracy.**

> Good question. In low-volatility windows, many transitions are flat->flat, giving "free" correct predictions. But the maxProfit term handles this — it scales with `|actualPrices[59] - actualPrices[0]|`. High accuracy on a flat window yields near-zero PnL. Accuracy without movement = no payout. The formula self-corrects.

**Q: Can a sophisticated user game this? E.g., always draw flat lines?**

> Drawing flat means predicting 59 "flat" directions. If the market moves at all, most actual directions are up or down, giving low accuracy. There's no dominant trivial strategy — you genuinely need to predict microstructure. The math punishes lazy strategies.

**Q: What about high-frequency patterns like alternating up-down?**

> Drawing a zigzag means predicting alternating up/down. Real BTC at 1-second intervals has its own statistical distribution. If it trends, your zigzag gets ~50% wrong. If it chops, you might do well — but then maxProfit is tiny because start-to-end movement is small. Again, the formula self-balances.

---

## Category 4: Economic Viability

**Q: Who's the counterparty? Where does profit come from?**

> The contract holds a pool of ETH from all open positions. Losers fund winners — it's a zero-sum pool minus the 2% fee on profits. The platform doesn't take directional risk. It's the same model as any peer-to-peer derivatives platform.

**Q: What's the revenue model?**

> 2% fee on profitable positions only. We only make money when users make money. At scale with high volume, this creates sustainable revenue while keeping the platform attractive. Aligns incentives.

**Q: What if everyone wins at the same time?**

> Statistically unlikely across many concurrent positions — some users predict well, others don't. The pool balances. In a worst case, the contract pays out more than it collected for that batch, drawing from accumulated fees and pool reserves. This is a known risk in pooled derivatives models, managed with position limits and pool monitoring.

---

## Category 5: Smart Contracts & Security

**Q: What are your access control mechanisms?**

> Role-based on both contracts. LineFutures: `owner` (pause, set fees, withdraw) and `pnlServer` (only address that can close positions). PriceOracle: `submitter` (only address that can store commitments). Separation of concerns — no single key compromises the whole system. Position opening is permissionless.

**Q: How do you prevent prediction manipulation?**

> Predictions are committed to storage *before* the position opens on-chain. The commitment ID is locked in the `openPosition` transaction. You can't change your prediction after seeing actual prices. Price data is committed at minute boundaries before any positions for that window can close. Ordering guarantees prevent gaming.

**Q: What's the maximum risk for a user?**

> Their deposited amount. Even at 2500x leverage with 0% accuracy, finalAmount floors at zero — the contract ensures no user loses more than their deposit. Fee is only on profits, never losses.

**Q: Have the contracts been audited?**

> Not yet — this is a hackathon build. For production, we'd need formal audits on PnL calculation logic, access control on the closer, and fee extraction. The centralized PnL server would need to be decentralized with an oracle network. We know the path to production-grade security.

---

## Category 6: Technical Depth Gotchas

**Q: How do you handle clock drift between backend and blockchain?**

> Positions use `block.timestamp` for expiry. The PositionCloser polls `getClosablePositions()` which checks on-chain time. Settlement timing is always determined by the blockchain, not our backend clock. No drift issues.

**Q: Could a user see prices before their prediction is locked?**

> No. The prediction commitment is stored *before* `openPosition()` is called on-chain. The 60-second window starts at `block.timestamp` of the open transaction. The user can't retroactively adjust. Commitment ordering prevents gaming.

**Q: How do you handle WebSocket disconnects during a price window?**

> The PriceIngester auto-reconnects with exponential backoff (max 10 attempts). Heartbeat check every 10s triggers reconnect if no data for 30s. The PriceAggregator gap-fills missing seconds — backward fill from end, then forward fill from start. A window always has exactly 60 data points.

**Q: Why SQLite for the leaderboard instead of the blockchain?**

> On-chain leaderboard queries would be expensive and slow. SQLite with WAL mode gives us fast indexed queries on user_address, timestamps, accuracy — perfect for leaderboard rankings. The authoritative position data lives on-chain; SQLite is a read-optimized cache for UX.

---

## Category 7: Product & Market

**Q: What problem does Sketch Flow solve?**

> 95% of retail traders lose money on derivatives — not because they can't read charts, but because the tools are built for quant desks. Sketch Flow makes futures trading intuitive: draw what you think, stake what you want, get paid in 60 seconds. No order books, no liquidations, no complexity.

**Q: Who is your target user?**

> Two audiences: (1) Crypto-native users who understand charts but find perp DEXs intimidating. (2) Newcomers who get "price goes up/down" but not "limit order with stop-loss at 2x leverage." Embedded wallets and small Base fees lower friction for the second group.

**Q: How do you compare to Polymarket?**

> Polymarket = binary outcomes (yes/no on events). Sketch Flow = continuous curve prediction with second-by-second granularity. It's a skill-based micro-game, not a prediction market. The 60-second time horizon and drawing UX make it feel like a game; the underlying mechanics give it DeFi depth.

**Q: How do you compare to GMX/dYdX/Hyperliquid?**

> Those are full-featured perp DEXs for sophisticated traders. Sketch Flow is the on-ramp — simplified UX, fixed 60-second duration, no liquidation management. We're not competing with them; we're capturing the 100M+ crypto users who understand price direction but won't touch a perp DEX.

**Q: Why 60-second positions?**

> Sweet spot between engagement and market dynamics. Short enough to be a micro-game, long enough for real price movement. Maps cleanly to minute-aligned price windows. Users can batch 1-5 positions for longer exposure with staggered timestamps.

---

## Category 8: Future & Scalability

**Q: How would you scale for production?**

> (1) L2 deployment (Base/Arbitrum) for cheaper txns. (2) PostgreSQL for concurrent access. (3) Multiple price sources with median aggregation. (4) Decentralized PnL oracle committee. (5) WebSocket push for real-time position updates. (6) Position size limits and pool health monitoring.

**Q: What other features could you build?**

> Longer timeframes (hourly/daily). Multi-token relative prediction. Tournaments with prize pools. Social features — share and compare drawings. Pattern recognition challenges (draw a head-and-shoulders). On-chain leaderboard with NFT rewards.

---

## Demo Flow (Rehearse This)

1. Open predict page — live BTC chart streaming
2. Draw a price curve on canvas (3 seconds, make it dramatic)
3. Set stake and leverage
4. Submit — wallet signs open tx (gas on Base)
5. Position opens on-chain from the user's wallet
6. Wait for settlement (or show a pre-settled position)
7. Show PnL result with accuracy breakdown
8. Flash leaderboard

**If live demo breaks:** Switch to backup screen recording immediately. Don't debug on stage.

---

## One-Liners for Common Reactions

| Judge says... | You say... |
|---------------|------------|
| "This is just gambling" | "Random guessing breaks even. Profit requires skill — reading 1-second price microstructure. The math proves it." |
| "2500x leverage is insane" | "It's the upper bound. Most users pick 5-50x. And max loss is always capped at your deposit — no liquidation spirals." |
| "What's your moat?" | "Three things: the drawing UX (novel interaction), directional accuracy PnL (novel formula), and the on-chain LineFutures stack that makes it work at micro-scale." |
| "This won't scale" | "The architecture is modular — swap SQLite for Postgres, add price sources, decentralize the PnL server. The core primitive scales; the infra catches up." |
| "Who would actually use this?" | "Anyone who watches price charts but doesn't trade. That's the majority of crypto users. We turn spectators into participants." |

---

## Team

- **Fabian Ferno** — Scaled products to 10K+ users, full-stack Web3, smart contract architecture
- **Philo Sanjay** — Backend systems, real-time price pipeline and settlement engine
- **Silas Ashar** — Frontend and product, drawing interface and trading UX
