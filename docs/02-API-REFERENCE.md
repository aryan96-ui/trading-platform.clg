# ProTrader — Complete API Reference

Base URL (development): `http://localhost:3001`

Two servers exist:

| Server | File | Port (default) | Purpose |
| --- | --- | --- | --- |
| **v2 (primary)** | `server-v2.js` | **3000** (`server-v2.js:33`) | Market data, paper trading, engines, intelligence, AI, static app |
| **v1 (legacy)** | `server.js` | **3001** (`server.js:24`) | Auth with MongoDB, portfolio CRUD, Stripe/Razorpay payments, premium gates |

> The two servers have **different** defaults, so they do not collide. This workspace runs v2
> on 3001 via a `PORT` override, which is why the base URL above is 3001. `npm start` runs v2.

## Response envelope

Success:

```json
{ "success": true, "data": { }, "meta": { "count": 24, "source": "demo" } }
```

Error:

```json
{ "success": false, "error": "candles and strategy required" }
```

Route-level rejections use HTTP 400 (bad input), 404 (unknown resource), 409 (order/reconciliation conflict), 503 (engine or dependency unavailable). Business rejections that are meaningful to the user (a guardrail block) return 200 with `success:false` and a structured reason so the UI can render the discipline check.

## Provenance contract

Every market-derived payload includes, where applicable:

| Field | Meaning |
| --- | --- |
| `source` / `meta.source` | `demo`, `coingecko`, `twelvedata`, … |
| `quality` / `dataQuality` | `REALTIME`, `DELAYED`, `DEMO`, `UNAVAILABLE` |
| `asOf` / `timestamp` | When the observation was made |
| `unavailable[]` | Named metrics that could not be computed (never silently zero) |

---

# 1. Market Data — `/api/v2` (`src/api/market-routes.js`)

### 1.1 `GET /api/v2/quote/:symbol`
- **Purpose:** latest price for one instrument.
- **Query:** `exchange` (optional; resolved from the instrument master).
- **Response (verified keys):** `{ symbol, exchange, assetType, timestamp, price, bid, ask, volume, open, high, low, previousClose, change, changePercent, source, dataQuality }`.
- **Field naming to respect:** the asset class is `assetType`; provenance is split across `source` and `dataQuality` (not a single `quality`); the observation time is `timestamp` (not `asOf`). Level-1 `bid`/`ask` are present; there is no order-book **depth**.
- **Validation:** unknown symbol → 404. Provider failure → falls through to the demo provider, labelled `source: demo`.
- **Logic:** `gateway.getQuote` → resolve instrument → choose provider by `supports()` + health + rate-limit state → normalise → cache (symbol-keyed).

### 1.2 `GET /api/v2/quotes`
- **Purpose:** batch quotes for watchlists, the tape, the heatmap and overlay widgets.
- **Query:** `symbols` (comma-separated, required).
- **Response:** `data` is a **bare array** of quote objects (verified: `?symbols=INFY,BTC` → 2 rows).
- **Logic:** one gateway batch call; mixed asset classes are routed per symbol (crypto → CoinGecko, stocks → keyed provider or demo).

### 1.3 `GET /api/v2/history/:symbol`
- **Purpose:** OHLCV candles for charts, indicators and backtests.
- **Query:** `interval` (`1m,5m,15m,1h,1D,1W,1M`), `limit` (default 200), `exchange`.
- **Response:** `data` is a **bare array of candle objects** `[{ time, open, high, low, close, volume }]` (verified: `?limit=3` → 3 rows). Provenance accompanies it in the `meta` envelope rather than on each bar.
- **Guarantee (demo):** the series is a pure function of `(symbol, interval, barIndex)` — identical across requests and exchanges, and a shorter request is a suffix of a longer one. Last close is anchored to the current quote.

### 1.4 `GET /api/v2/indicators/:symbol`
- **Purpose:** server-computed indicator series for chart overlays and panes. The client never computes an indicator.
- **Query:** `interval`, `limit`, `overlays` (`ema20,ema50,sma200,bb,vwap`), `sub` (`rsi,macd,stoch,atr,adx`), `exchange`.
- **Response (verified keys):** `{ overlays, panes, bars, source }` — e.g. `{ overlays: { ema20: [{time,value}] }, panes: { rsi: [...] }, bars: 60, source: "demo" }`. There is no `symbol`/`interval`/`latest` wrapper; the caller already knows what it asked for.
- **Validation:** insufficient bars (e.g. `limit < period`) → that series is returned empty with an `unavailable` note; 503 with a reason if the gateway cannot supply candles.
- **Note:** scalar indicator endpoints delegate to the same series implementation, so the number a screener filters on equals the number drawn on the chart (16 parity tests).

### 1.5 `GET /api/v2/search`
- **Purpose:** symbol lookup for the navbar search and palette.
- **Query:** `q` (required), `limit` (default 20), `assetType`, `exchange`, `sector`.
- **Response:** `data` is the **array itself** (no wrapper object): `[{ symbol, exchange, companyName, sector, industry, country, assetType, currency, … }]`. Verified: `?q=reliance` → 1 row.

> The filter parameter is **`assetType`** (values `stock|crypto|forex|index`), not `assetClass`. The instrument record's field is likewise `assetType`. Passing `assetClass=` is silently ignored.
- **Logic:** case-insensitive match across symbol / name / sector / industry over the 76-instrument master.

### 1.6 `GET /api/v2/overview`
- **Purpose:** the Index Strip widget — the 10 major indices.
- **Response:** `data` is a **bare array of 10** index rows (no `breadth` field here). Verified: 10 rows; NIFTY 50 +0.13%.

> Market breadth lives in the heatmap payload (`GET /api/v2/heatmap` → `stats`), not in `/overview`. The earlier draft of this reference described a combined object; that was wrong.

### 1.7 `GET /api/v2/sectors` · 1.8 `GET /api/v2/instruments` · 1.9 `GET /api/v2/providers` · 1.10 `GET /api/v2/metrics` · 1.11 `GET /api/v2/stream/stats`

| Endpoint | Purpose | Response highlights |
| --- | --- | --- |
| `/sectors` | Sector list with aggregate performance | bare array (verified: **14** sectors) |
| `/instruments` | Instrument master with filters | bare array; accepted filters `assetType`, `exchange`, `sector`, `country`, `q`, `page`, `limit` (default 50) |
| `/providers` | Provider health and configuration | bare array (verified: **2** enabled providers — CoinGecko + Demo in keyless mode) |
| `/metrics` | Gateway cache/route telemetry | `{ totalRequests, cacheHits, providerCalls, fallbacks, errors, startTime, cacheStats }` |
| `/stream/stats` | WebSocket stream status | `{ clients, subscriptions, symbols, marketStatus, isDemoMode }` |

> Shape convention to note: several collection endpoints return the **array directly** as `data`
> (`/search`, `/instruments`, `/sectors`, `/overview`, `/providers`, `/heatmap/sectors`, `/tape`,
> `/regime/history`) while others return an object. Client helpers must not assume one shape.

---

# 2. Paper Trading — `/api/v2` (`src/api/trading-routes.js`)

The account identity is the `email` path/body parameter (**this is the missing-auth gap S1** — see the security section of the main report).

### 2.1 `POST /api/v2/trades/pre-check`
- **Purpose:** pre-trade risk intelligence **and** guardrail friction, evaluated against the server's own account state. The client sends only the trade, so the portfolio shape has one owner.
- **Request:**
```json
{ "email": "demo@protrader.io",
  "trade": { "symbol": "INFY", "side": "BUY", "quantity": 25, "price": 1500,
             "stopLoss": 1450, "target": 1600, "strategy": "momentum_breakout" } }
```
- **Response (allowed):**
```json
{ "success": true, "data": { "trade": {...},
  "risk": { "riskLevel": "MODERATE", "positionWeight": 12.4, "findings": [
      { "severity": "MEDIUM", "factor": "Position sizing", "detail": "Position would be 12.4% of account (limit 25%)" } ] },
  "guardrail": { "allowed": true, "warnings": [] } } }
```
- **Response (blocked):** `guardrail.allowed=false` with `reasons[]` and the reason-chip options the user must choose from before overriding.
- **Verified:** an over-sized order returned `• Position would be 12245.6% of account (limit 25%)` and `• Risk per trade 12240.6% exceeds 2%`.

### 2.2 `GET /api/v2/account/:email`
- **Purpose:** the single source of account truth for the entire UI.
- **Response:** `{ email, balance, equity, marketValue, costBasis, unrealisedPnl, realisedPnl, totalPnl, fees, returnPercent, positions: [{ symbol, quantity, avgPrice, price, marketValue, unrealisedPnl, pnlPercent, stopLoss, strategy }], orderCount, fillCount, asOf }`.
- **Consumers:** `js/core/account.js` → sidebar Portfolio/Holdings, dock, position card, profile chip.

### 2.3 `GET /api/v2/account/:email/pnl`
- **Purpose:** realised P&L timeline for the dock's P&L tab and portfolio analytics.
- **Query:** `groupBy=day|symbol` (default `day`).
- **Response:** `{ equity, unrealised, realised, fees, total, returnPercent, byDay: [{ date, pnl, trades }], bySymbol: [{ symbol, pnl, trades }] }`.

### 2.4 `GET /api/v2/account/:email/analytics`
- **Purpose:** exposure and concentration analytics.
- **Response (verified keys):** `{ exposure, bySector, byAssetClass, concentration, performance, asOf }`.

  > Note the naming inconsistency worth knowing when consuming this: the analytics payload calls
  > the split **`byAssetClass`**, while the instrument record and every query filter use
  > **`assetType`**. Both mean the same concept.
- **Verified live:** 6 metrics + 5 exposure bars rendered.

### 2.5 `GET /api/v2/orders` · 2.6 `POST /api/v2/orders` · 2.7 `DELETE /api/v2/orders/:id`
- `GET /api/v2/orders?email=&status=` → `{ orders: [...] }` (open, filled, cancelled, resting).
- `POST /api/v2/orders` — **place an order.**
  - **Request:** `{ email, symbol, side: "BUY"|"SELL", quantity, orderType: "MARKET"|"LIMIT", limitPrice?, stopLoss?, target?, strategy?, notes?, acknowledgeGuardrails?, guardrailReason? }`.
  - **Processing:** guardrail check (if not acknowledged) → resolve instrument → **live quote fill only** (refuses to invent a price) → commission 0.05% per side → balance/position mutation → `journal.openTrade` (carrying regime + thesis) → `EventBus.emit(ORDER_FILLED)`.
  - **Response:** `{ order: { id, status: "FILLED", filledPrice, quantity, commission, timestamp }, position, account }`.
  - **Errors:** 409 `INSUFFICIENT_BALANCE` (with the required and available amounts), 400 `UNKNOWN_SYMBOL`, 200 `success:false` with `guardrail` when blocked.
  - **Verified:** `BUY 5 INFY` filled at the live DEMO quote and propagated to holdings and the dock.
- `DELETE /api/v2/orders/:id` → cancel an open/resting order.

### 2.8 `POST /api/v2/orders/fill-resting`
- **Purpose:** simulate a resting limit order being touched by price.
- **Request:** `{ email, orderId, price }` or `{ email, symbol, price }`.
- **Logic:** fills only when the trigger price satisfies the limit; otherwise returns `success:false` with the reason.

### 2.9 `GET /api/v2/fills/:email`
- **Purpose:** execution log (the dock's Fill/Trade History tab).
- **Response:** `{ fills: [{ id, orderId, symbol, side, quantity, price, commission, timestamp, strategy }] }` — the raw material for execution-quality analysis.

### 2.10 `POST /api/v2/positions/:symbol/close`
- **Purpose:** exit (fully or partially) and generate the automatic post-trade review.
- **Request:** `{ email, quantity?, price?, reason? }` (omit `quantity` to close in full; omit `price` to use the live quote).
- **Processing:** mark-to-market from the gateway quote → realised P&L + fees → position reduce/remove → `journal.closeTrade` → **MFE/MAE from the real bars** → R-multiple, holding time, benchmark-relative return → four-way outcome classification → review attached → `EventBus.emit(TRADE_CLOSED)`.
- **Response:** `{ position, closed: { quantity, price, pnl, pnlPercent, rMultiple, mae, mfe, holdingTime, outcome, review }, account }`.
- **Note:** partial exits are supported — a partial close records a realised P&L tranche without destroying the open position.

### 2.11 `PUT /api/v2/positions/:symbol/stop`
- **Purpose:** move or set a protective stop; every move is appended to `stopHistory` so repeated stop movement is detectable behaviour.
- **Request:** `{ email, stopLoss, target? }`.

### 2.12 `GET /api/v2/positions/:email`
- **Purpose:** open positions in isolation (the dock's Holdings tab and the sidebar).
- **Response:** `{ positions: [...], count, gross, unrealisedPnl }`.

---

# 3. Engines — `/api/v2` (`src/api/engine-routes.js`)

### 3.1 `POST /api/v2/screen`
- **Purpose:** filter the universe using **server-computed** technicals.
- **Request:** `{ filters: [{ field: "rsi", op: "lt", value: 30 }, …], logic: "and"|"or", limit? }` (also accepts a flat filter object).
- **Fields:** `price, changePercent, volume, relativeVolume, rsi, ema20, ema50, sma200, atr, adx, macd, macdSignal, bollinger, stochastic, sector, assetType, marketCap (null when unavailable)`.
- **Response:** `{ rows: [{ symbol, name, price, changePercent, rsi, relativeVolume, source, quality, matched[] }], count, meta: { scanned, rated, source } }`.
- **Verified:** `RSI < 45` → 22 rows with real values (HDFCBANK 42.5, KOTAKBANK 34.2); unrated metrics render `—`.

### 3.2 `GET /api/v2/screen/presets` · 3.3 `GET /api/v2/screen/filters` · 3.4 `POST /api/v2/screen/save` · 3.5 `GET /api/v2/screen/saved` · 3.6 `POST /api/v2/screen/:id/run`
- Presets, the filter field catalogue, and saved screens (in-memory per account). A saved-screen run re-executes with the stored filters.

### 3.7 `GET /api/v2/heatmap`
- **Purpose:** sector heatmap and the market-breadth numbers the Overview cards use.
- **Query:** `sector`, `assetType` (optional filters).
- **Response:** `{ name, sectors: [...], stats, provenance, timestamp }` — verified top-level keys. Breadth and rated/unrated counts live under `stats`, and per-tile provenance under `provenance`.
- **Critical contract note:** this is a **GET that takes no body**. The previous implementation read `req.body`, so it always received `{}` and generated prices with `Math.random()` — two identical calls returned 16 vs 25 advancers and moved M&M from 3,420 to 4,436. The engine now owns its quote fetch through the gateway, so **repeated identical requests return identical numbers** and agree with `/quotes` and `/history`.
- **Verified:** two consecutive calls returned 24/23 advancers; the Overview breadth cards matched.

### 3.8 `GET /api/v2/heatmap/sectors` · 3.9 `GET /api/v2/heatmap/sector/:name`
- Sector aggregates; per-sector tiles and breadth. Unknown sector → 404.

### 3.10 `POST /api/v2/regime/assess`
- **Purpose:** classify market conditions from measurable inputs.
- **Request:** `{ candles: [{time,open,high,low,close,volume}], symbol?, benchmark? }`.
- **Response:** `{ regime, sub, confidence, evidence: [{ indicator, value, reading }], inputs: { adx, atrPercent, atrPercentile, maStructure, dispersion, breadth }, timestamp }`.
- **Classes:** `TRENDING_UP, TRENDING_DOWN, RANGE_BOUND, HIGH_VOLATILITY, LOW_VOLATILITY, BREAKOUT, HIGH_RISK_EVENT, NEUTRAL`.
- **Verified:** NIFTY50, 200 bars → `NEUTRAL / MIXED SIGNALS`, confidence 40%, evidence `ADX 27.0`, `ATR% 0.54 percentile 53`.

### 3.11 `GET /api/v2/regime/history`
- **Purpose:** regime over time for the Regime view's timeline. **Query:** `symbol`, `interval`, `limit`.
- **Response:** bare array of regime points (verified: 37 rows).

### 3.12 `POST /api/v2/trade-quality/evaluate`
- **Purpose:** grade a trade's process quality (independent of its P&L).
- **Request:** `{ trade: { symbol, side, entryPrice, exitPrice, quantity, stopLoss, target, entryTime, exitTime, strategy, mae, mfe, rMultiple }, context?: { regimeAtEntry } }`.
- **Response:** `{ score, grade, factors: [{ name, score, weight, note }], classification: { process, result, combined } }`.
- **Classification:** `GOOD TRADE / GOOD RESULT`, `GOOD TRADE / BAD RESULT`, `BAD TRADE / GOOD RESULT`, `BAD TRADE / BAD RESULT`.

### 3.13 `POST /api/v2/risk/analyze`
- **Purpose:** portfolio + trade risk with stress scenarios.
- **Request:** `{ portfolio: { equity, positions: [...] }, trade? }`.
- **Response:** `{ riskLevel, findings: [{ severity, factor, detail }], stress: [{ scenario, impact, impactPercent }], concentration, heat, summary }`.

### 3.14 `POST /api/v2/risk/position-size`
- **Purpose:** dynamic fixed-fractional position sizing.
- **Request:** `{ equity, riskPerTrade, entryPrice, stopPrice, volatility?, regime?, exposure?, correlation?, strategyWinRate? }`.
- **Response:** `{ riskBudget, stopDistance, baseQuantity, adjustments: [{ factor, multiplier, reason }], finalQuantity, positionValue, positionWeight, notes }`.

### 3.15–3.18 Tape
| Endpoint | Purpose | Response |
| --- | --- | --- |
| `GET /api/v2/tape` | Recent prints (ring buffer, max 2000) | bare array of entries (verified: 50 rows default) |
| `GET /api/v2/tape/stats` | Tape telemetry | `{ totalEntries, ups, downs, flat, largePrints, volumeAnomalies, averageSize }` |
| `POST /api/v2/tape/pause` | Pause/resume | `{ paused }` |
| `POST /api/v2/tape/filter` | Filter by symbol/asset class | `{ filter }` |

---

# 4. Journal & AI — `/api/v2` (`src/api/intelligence-routes.js`)

### 4.1 `POST /api/v2/journal/open`
- **Request:** `{ email, symbol, side, entryPrice, quantity, stopLoss, target, strategy, thesis?, entryTime? }`.
- **Response:** `{ trade: { id, …, regimeAtEntry, status: "OPEN" } }`. The journal stamps the market regime at entry so the review has something to compare against later.

### 4.2 `POST /api/v2/journal/close`
- **Request:** `{ email, tradeId, exitPrice, exitTime?, reason? }` or `{ email, symbol, exitPrice }`.
- **Processing:** computes R-multiple, MFE/MAE from real bars, holding time, benchmark-relative return, review score and the four-way classification; emits `TRADE_CLOSED`.
- **Response:** `{ trade: { …, status: "CLOSED", pnl, pnlPercent, rMultiple, mae, mfe, holdingTime, outcome, review } }`.

### 4.3 `GET /api/v2/journal/:email` · 4.4 `GET /api/v2/journal/:email/stats`
- Trade list (optionally filtered by `status`, `strategy`, `symbol`) and aggregate statistics (win rate, average R, expectancy, profit factor, best/worst, streaks, by-strategy breakdown).

### 4.5 `POST /api/v2/behavioral/analyze`
- **Purpose:** run behaviour detection over a supplied trade list.
- **Request:** `{ trades: [...], settings? }`.
- **Response:** `{ behaviors: [{ type, label, severity, description, example[], recommendation }], profile, tradeCount, message, timestamp }`. Note the key is **`behaviors`**, not `patterns`.
- **Minimum sample:** with fewer than 3 trades the engine returns `behaviors: []` plus `message: "Need at least 3 trades to build a behavioral profile"` rather than a low-confidence guess.
- **Detectable types (six — the full enum emitted by `behavioral-analytics.js`):** `revenge_trading`, `overtrading`, `position_escalation`, `premature_exits`, `chasing`, `concentration`.

  > The original specification listed a broader behavioural catalogue (averaging down, stop-movement, off-strategy trades, loss-holding asymmetry, frequency). Only these six are implemented; the docs previously overstated this as fourteen, which was wrong.
- **Verified:** the seeded dataset reports *"Position size increased 128% after consecutive losses — 33,220 vs 14,541"*.

### 4.6 `POST /api/v2/ai/analyze`
- **Purpose:** the AI copilot for a symbol. **The client sends a symbol only** — any client-computed numbers would be ignored, because the server builds the context.
- **Request:** `{ symbol, email?, exchange?, interval? }`.
- **Processing:** `AiContextBuilder` gathers quote, candles, indicators, regime, sector stance, portfolio exposure and recent behaviour → the model (Ollama if reachable, otherwise the rule engine) produces an interpretation → `EvidenceEngine` attaches the evidence.
- **Response:** `{ symbol, signal, bias, confidence, summary, evidence: { indicators: [...], marketConditions: [...], risks: [...], counterarguments: [...] }, context: { rsi, adx, atrPercent, regime, sector, exposure }, provenance: { source, quality, bars, interval, asOf }, unavailable: [], aiModel, disclaimer }`.
- **Degradation:** `aiModel: "rule-engine"` when Ollama is unreachable (the situation in this environment — the LLM branch is written but has never executed here).

### 4.7 `GET /api/v2/ai/status`
- **Response:** `{ available, model, url }` (verified). When Ollama is unreachable, `available: false` and the analysis responses report `aiModel: "rule-engine"`.

### 4.8 `POST /api/v2/strategy/analyze` · 4.9 `GET /api/v2/strategy/dimensions`
- Dimension analysis for a strategy (trend, volatility, volume, timing, risk dimensions) and the dimension catalogue used by the Strategy view.

---

# 5. Intelligence Layer — `/api` (`src/api/intelligence-v2-routes.js`)

> Mounted at `/api` (not `/api/v2`). `/api/market/regime/assess` and `/api/trades/pre-check` intentionally mirror the `/api/v2` versions for the intelligence client.

### 5.1 Regime
| Endpoint | Purpose |
| --- | --- |
| `GET /api/market/regime/:symbol` | Regime for a symbol, using the **gateway's own candles** by default (`?bars=200&synthetic=true` to test the engine with a labelled synthetic series) |
| `POST /api/market/regime/assess` | As above with an explicit `{ candles }` body |

### 5.2 Signals
- **`GET /api/market/signals`** — signals derived from the current watchlist/universe.
- **`POST /api/signals/ranked`** — **Request requires `signals: []`** (plus optional `context`). A request with only `context` is a 400 — this exact contract mismatch previously left the alerts pane permanently empty, which is why `js/components/alerts.js` now sends the array.
  - **Response:** `{ ranked: [{ signal, qualityScore, tier, direction, breakdown: [{ factor, score, weight, note }] }], summary: { total, topPriority, medium, low } }`.
  - **7 factors:** freshness, volume confirmation, regime compatibility, strategy match, liquidity, risk, relevance.
  - **Verified:** 12 ranked signals on the live watchlist, identical in the dashboard, alerts and Signals view.
- **`POST /api/signals/conflict`** — detects directionally conflicting factors. **Response:** `{ lean, conflict: bool, factors: [{ factor, direction, available }], recommendation }`; unavailable factors are reported as unavailable rather than assumed neutral.

### 5.3 Portfolio risk & sizing
| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/portfolio/risk` | `?email=` | risk level, findings, stress scenarios, concentration |
| `GET /api/portfolio/heat` | `?email=` | aggregate and per-position risk as % of equity |
| `POST /api/portfolio/position-size` | sizing inputs (see 3.14) | sized quantity with per-factor adjustments |

### 5.4 Trades, thesis, reviews
| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `POST /api/trades/pre-check` | pre-trade check (intelligence variant) | same contract as 2.1 |
| `GET /api/trades/:id/review` | **the post-trade review** | returns the *trade* with an embedded `review`: `{ classification, decision: { label, score, factors[], summary }, result: { label, pnl, pnlPercent, summary }, entryQuality, exitQuality, riskQuality, relative: { available, message, tradeReturn }, sections: { whatHappened, whyItHappened, strategyFollowed, marketRegime, whatWentWell, whatWentWrong, shouldRepeat, shouldAvoid }, evidence, aiLesson, timestamp }` — eight sections plus `aiLesson` |
| `POST /api/trades/thesis` | capture a trade thesis before entry | `{ email, symbol, thesis: { direction, rationale, invalidation, expectedMove, confidence } }` |
| `POST /api/trades/thesis/resolve` | resolve a thesis against what happened | returns whether the rationale and invalidation were borne out |
| `GET /api/trades/thesis/:email` | thesis history | used by the Reviews view |

### 5.5 Trader behaviour & guardrails
| Endpoint | Purpose | Response |
| --- | --- | --- |
| `GET /api/trader/behavior` | live behavioural analysis over the account's own trades | `{ behaviors: [...], profile: { strengths[], weaknesses[], observations[], summary, disclaimer }, tradeCount, message, timestamp }` |
| `GET /api/trader/profile` | aggregate trader profile | strengths, recurring weaknesses, discipline score, per-pattern counts, notes |
| `GET /api/guardrails/settings` | read the account's rules | `{ maxDailyTrades, maxDailyLoss, maxPositionSize, maxPortfolioConcentration, maxRiskPerTrade, maxConsecutiveLosses, cooldownAfterLossStreak }` |
| `PUT /api/guardrails/settings` | update the rules | returns the stored settings |
| `POST /api/guardrails/check` | evaluate a proposed trade | `{ allowed, warnings: [{ type, label, evidence }], blockedBy?: [...] }` |
| `POST /api/guardrails/confirm` | record an override | `{ email, warnings, reason, trade }` → an audited log entry (warning shown, type, user response, reason, timestamp) |
| `GET /api/guardrails/logs/:email` | the full override audit trail | pairs each override with the trade's eventual outcome |
| `GET /api/events` | recent event-bus activity | `{ events: [{ type, payload, timestamp }] }` |

### 5.6 Strategy validation
| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /api/strategies/backtest` | `{ candles, strategy, params, initialCapital, costs? }` | full metrics (trades, win rate, expectancy, profit factor, max drawdown, Sharpe-ish, equity curve), `provenance`, and `warnings[]`; **400 if `candles` or `strategy` is missing** — the server never invents candles for a backtest |
| `POST /api/strategies/sensitivity` | `{ candles, strategy, param, range }` | metric across parameter values, showing whether an edge is a plateau or a spike |
| `POST /api/strategies/walk-forward` | `{ candles, strategy, windowSize, stepSize }` | per-window train vs out-of-sample results plus an aggregate |
| `GET /api/strategies/matrix` | `?email=` | the strategy × regime matrix from the trader's own closed trades (win rate, expectancy, sample size per cell) |
| `POST /api/strategies/matrix/assess` | `{ email, strategy, regime? }` | compatibility grade `HIGH/MODERATE/LOW` with the historical evidence and an evidence-based recommendation |

**Verified live:** Strategy Lab candles came from the gateway (RELIANCE, 400 DEMO bars), two consecutive runs produced byte-identical output, and walk-forward produced non-empty out-of-sample windows (150 train / 50 test).

### 5.7 Claim verification
- **`POST /api/claims/verify`** — **Request:** `{ claim: "…", symbol?, email? }`.
- **Processing:** extract verifiable statements → choose the data requirement per claim type → compare against observed data (resolving the symbol from the claim text, preferring an instrument actually named over the first uppercase token) → verdict.
- **Response:** `{ claims: [{ text, type, verdict: "SUPPORTED|PARTIALLY_SUPPORTED|NOT_SUPPORTED|INSUFFICIENT_DATA", evidence, dataUsed, source }], summary, disclaimer }`.
- **Ethics:** it grades statements against data; it never asserts fraud or intent.

### 5.8 Execution quality
- **`GET /api/execution/:tradeId`** — **Response:** `{ entryTiming: { actual, best, worst, percentile, score }, exitTiming: {...}, slippage, score, grade, notes }`.
- **`POST /api/execution/timing`** — the same analysis for a supplied trade + candles. Alternative prices come from the actual bars, so every comparison is inspectable.
- **`POST /api/ai/analyze-trade`** — narrative explanation of an execution, built from the computed metrics.

---

# 6. Legacy v1 — `server-v2.js` inline + `server.js`

### 6.1 v2 inline (`server-v2.js`, no database required)

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/register` | Register (in-memory in v2; MongoDB in v1) |
| POST | `/api/login` | Authenticate and return the user profile |
| GET | `/api/market-data` | Legacy market snapshot |
| POST | `/api/trade` | Legacy trade path (kept for the old pages) |
| POST | `/api/payment` | Legacy payment placeholder |
| GET | `/api/history/:email` | Legacy trade history |
| GET | `/api/portfolio/:email` | Legacy portfolio |
| GET | `/api/stocks` | Static instrument list for the old pages |

### 6.2 v1 server (`server.js`, requires MongoDB; premium routes use `requirePremium`)

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/` | Serves the landing page |
| POST | `/api/register` | Mongoose create; **passwords stored in plaintext (S2)** |
| POST | `/api/login` | Direct `{ email, password }` match (**S2**) |
| GET | `/api/market-data` | Legacy snapshot |
| POST | `/api/create-order` | Stripe/Razorpay order creation |
| POST | `/api/verify-payment` | Client-supplied `orderId` (**S8**) |
| POST | `/api/trade` | Portfolio mutation |
| POST | `/api/payment` | Payment record |
| GET | `/api/history/:email` · GET `/api/portfolio/:email` · GET `/api/stocks` | Legacy reads |
| GET | `/api/ai/predict` *(premium)* | **Invents its prediction** — do not present as analysis |
| GET | `/api/indicators` *(premium)* | Legacy indicator path |
| GET | `/api/history/:symbol` *(premium)* | OHLCV |
| POST | `/api/alerts` *(premium)* · GET `/api/portfolio/export` *(premium)* · GET `/api/support` *(premium)* | Premium features |
| GET | `/api/white-label` | Whitelabel config |
| POST | `/api/backtest` *(premium)* | Legacy backtest |

---

# 7. Endpoint census

| Mount | Count |
| --- | --- |
| `/api/v2` market routes | 11 |
| `/api/v2` trading routes | 12 |
| `/api/v2` engine routes | 18 |
| `/api/v2` intelligence routes | 9 |
| `/api` intelligence-v2 routes | 29 |
| `server-v2.js` inline | 8 |
| **v2 total** | **87** |
| **v1 total (`server.js`)** | **19** |
| **Grand total** | **106** |

---

# 8. Client-side API helpers

All client calls funnel through two owners:

| File | Exposes | Notes |
| --- | --- | --- |
| `js/core/api.js` | `api.get/post/put/del`, `api.v2(...)`, `api.intel(...)` | Single place for the base URL, JSON parsing, the `success` envelope, and error surfacing |
| `js/core/account.js` | `fetchAccount`, `fetchAnalytics`, `fetchPnl`, `placeOrder`, `closePosition`, `setStop` | Single writer of `state.account`; every consumer of account data reads from here |

Client polling intervals (a design decision, not a default):

| Surface | Interval |
| --- | --- |
| Quotes | 5 s |
| Tape | 4 s |
| Account | 15 s |
| Alerts (signals + behaviour) | 45 s |
| Status strip | 30 s |
| Clock | 1 s |
