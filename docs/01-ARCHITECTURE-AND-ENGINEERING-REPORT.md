# ProTrader — Architecture & Engineering Report

**AI-Driven Trading & Transaction Analytics Platform**

Revision: the unified-workspace build (`fffeda1`, `673f9aa`)
Prepared for: final-year review, hackathon judging, internship evaluation, technical interview, software-engineering audit.

> **How to read the status labels in this document.** Every capability is marked with what has
> actually been exercised, not what the code intends:
> **✅ verified** — implemented and exercised end-to-end against the running system.
> **⚠️ implemented, unverified** — code exists and is wired, but has not been run against real input here.
> **🧪 demo-backed** — works, but its inputs come from the built-in demo provider (labelled `DEMO`).
> **❌ absent** — not implemented; stated so the audit is honest.

---

## 1. Executive Summary

ProTrader is a **Node.js/Express market-data and decision-intelligence platform** with a
single-page browser workspace. It is two products folded into one repository:

1. **A market-data and paper-trading platform** — a provider-agnostic market-data gateway
   (76 instruments across equities, crypto, forex and indices), a deterministic demo feed,
   a WebSocket quote stream, and a simulated broker with orders, fills, positions,
   mark-to-market P&L and commission accounting.
2. **A decision-intelligence layer** — 25 engine modules that turn that data into context
   (market regime), risk (pre-trade checks, portfolio heat, position sizing), quality
   (signal ranking, trade quality, execution analysis), reflection (post-trade review,
   behavioural analytics, guardrails) and validation (backtesting, walk-forward testing,
   walk-forward robustness, strategy × regime matrix, claim verification).

The engineering thesis is unusual and worth stating plainly, because it drives most design
decisions: **the platform never fabricates a number and never lets the language model
originate one.** Indicators, statistics, exposure, risk, regime, trade metrics, behavioural
metrics and signal scores are all computed server-side from candles the gateway returned.
The AI layer receives a structured context object and *interprets* it; when Ollama is not
running it degrades to a deterministic rule engine and says so (`aiModel: rule-engine`).
Where data is genuinely unavailable the system returns `null` and the UI renders
`DATA UNAVAILABLE` rather than a plausible-looking estimate.

**Scale:** 94 hand-written source files, ≈21,000 lines (excluding `node_modules`),
87 HTTP endpoints on the v2 server plus 19 on the legacy v1 server (106 total), 2 MongoDB
models, 25 engine modules, 371 automated tests.

**Cleanup status:** this revision follows a waste-removal pass that deleted 15 superseded
files (three duplicate dashboards with their 2,412 lines of client JS, two static shells, a
scratch Express server, a scratch connection test, an orphaned `User` model) and fixed the
defects F1–F4 and F7 below. The legacy-duplication limitation no longer applies.

**Honest headline limitation:** the v2 server has **no authentication or authorisation**;
accounts are addressed by an email in the URL. This is a demo/paper-trading prototype and
must not be pointed at real money or real personal data before that is fixed (see §8).

---

## 2. Project Overview

### 2.1 Project goal

Move a discretionary trader from *"data → chart → gut decision"* to
*"data → context → analysis → risk check → thesis → trade → monitor → review → learn → adapt"*.

The system is explicitly **not** a price predictor. Its success metric is the quality of
trading decisions: did the setup follow a stated strategy, was the risk acceptable, and did
the trader repeat their own recurring mistakes.

### 2.2 Problem statement

Retail trading tools optimise for *execution speed and chart features*. They do not:

- Check a proposed trade against the trader's **own** portfolio risk and rules before it is placed.
- Distinguish a **good decision with a bad outcome** from a bad decision that happened to work.
- Detect **observable behavioural patterns** (position escalation after a loss, revenge trading,
  moving stops repeatedly) that traders cannot see in themselves.
- Test whether a strategy actually works **in the current market regime** for that specific trader's record.
- Verify the claims made by financial influencers against measurable data.

### 2.3 Target users

| User | Need |
| --- | --- |
| Retail trader / student learner | Practise with paper money while being coached on risk and process |
| Trading educator / mentor | Evidence-based feedback on a student's decision quality, not just P&L |
| Quant-curious analyst | A backtest/walk-forward harness wired to the same live data path |
| Auditor / evaluator | Traceability: every displayed number carries its source and timestamp |

### 2.4 Key features

Grouped by the layer that owns them (see §4 for the full architecture):

- **Market data**: multi-provider gateway with health tracking, failover, per-asset-class routing, TTL caching, a WebSocket stream and a deterministic demo provider.
- **Market context**: sector heatmap and breadth, market tape, market-regime classification, sector performance.
- **Risk**: pre-trade risk check, portfolio heat, dynamic position sizing, stress tests and concentration analysis.
- **Quality**: signal ranking with a 7-factor score breakdown, signal-conflict detection, trade-quality grading, execution-quality analysis (entry/exit timing versus alternatives).
- **Reflection**: automatic post-trade review (R-multiple, MAE/MFE, four-way outcome classification), behavioural analytics (6 observable pattern detectors), trader profile, configurable guardrails with an audited override flow.
- **Validation**: backtest with enforced train/validation/out-of-sample splits, parameter sensitivity, rolling walk-forward, strategy × regime matrix, claim verification.
- **Explainability**: a server-side AI context builder, an evidence engine, and an AI copilot that returns signal, bias, confidence, risks, counterarguments and data provenance.
- **Execution**: simulated broker with market/limit orders, partial exits, protective stops, commission and fee accounting, and a full order/fill/trade audit trail.

### 2.5 Business value

- **Decision quality as the product.** Post-trade review scores process, not luck — the single
  hardest thing to buy in retail trading software.
- **Behavioural guardrails create a moat.** The platform learns the *individual's* failure
  patterns and inserts friction at the moment of the next bad decision.
- **One data model, many features.** Because a trade carries regime, strategy, risk, signal,
  behaviour and execution context, every surface (sidebar, dock, review, matrix) reads the
  same facts instead of recomputing them.
- **Honest data provenance** is a compliance-adjacent feature: every payload carries
  `source`, `quality`, `asOf`, and unrated values are visibly unavailable.

### 2.6 Real-world use cases

1. **Learn risk before risking capital.** Paper-trade with a pre-trade risk check and a
   supervised position-size engine.
2. **Trade-journal-with-a-brain.** Journal plus automatic review plus behavioural flags.
3. **Strategy triage.** Before running a strategy with money, see its expectancy by regime
   and its walk-forward stability.
4. **Claim triage.** Paste an influencer claim; get SUPPORTED / PARTIALLY SUPPORTED /
   NOT SUPPORTED / INSUFFICIENT DATA graded against available data.
5. **Institutional-style desks** (analogous tooling): regime dashboards, execution analysis,
   portfolio heat and concentration limits.

---

## 3. Technology Stack

### 3.1 Backend

| Technology | Version | Purpose | Why chosen | Where used |
| --- | --- | --- | --- | --- |
| **Node.js** | ≥18 (CommonJS) | Server runtime | Non-blocking I/O suits fan-out to many market-data APIs; one language across the stack; zero build step for a reviewable codebase | `server-v2.js`, all of `src/` |
| **Express.js** | ^4.22 | HTTP routing, static hosting, middleware | De-facto standard; the app is small enough that a heavier framework would add ceremony | `server-v2.js:263-292`, `src/api/*` |
| **axios** | ^1.13 | HTTP client for market-data providers | Interceptors/timeouts/JSON handling out of the box | `src/market-data/providers/*` |
| **ws (via `MarketStream`)** | — | WebSocket quote push | Minimal, no socket.io abstraction needed for one-way quotes | `src/websocket/market-stream.js` |
| **dotenv** | ^16.4 | Environment configuration | Twelve-factor style config; keeps keys out of the repo | all three entry points |
| **cors** | ^2.8.5 | Cross-origin requests | Needed while the frontend was served from a different port during development | `server-v2.js:38` |
| **mongoose** | ^8.0 | MongoDB ODM | Schema + validation for the user/payment records the legacy layer uses | `models/*.js`, `server.js` |
| **razorpay** | ^2.9.6 | INR payment gateway | India-first checkout used by the premium flow | `server.js` payment routes |
| **stripe** | ^20.1 | Global payment gateway | Alternative rail for the premium flow | `server.js` payment routes |
| **nodemon** | ^3.1 (dev) | Auto-restart in development | Faster iteration | `npm run dev*` |

### 3.2 Frontend

| Technology | Purpose | Why chosen | Where used |
| --- | --- | --- | --- |
| **HTML5** | Page structure | No framework build step keeps the artefact auditable end-to-end | `terminal.html`, 11 other pages |
| **CSS3** (custom properties, grid, flex, `backdrop-filter`) | Design system | A design-token system (`:root` variables) gives one place to change theme/geometry; no CSS framework means no unused bytes | `css/terminal.css`, `css/platform.css` |
| **Vanilla JavaScript (ES2020+)** | Behaviour | Explicit control over render timing and API calls; no bundler; modules loaded in a deliberate order | `js/**` (30 files) |
| **Lightweight Charts** (TradingView, v4.1.0 standalone) | Candlestick/line/area + indicator panes | Purpose-built financial charting, canvas-rendered, multiple series + crosshair sync; **measured 160 KB raw / 49 KB gzip** from the CDN | `js/chart/chart.js` |
| **Inter + JetBrains Mono** (Google Fonts) | Typography | Inter for UI; monospace for every number so columns align — a Bloomberg-terminal convention | `<link>` in `terminal.html` |

**Frontend architecture (the current, unified workspace).** `terminal.html` is the single
page. It loads 34 modules in a load-bearing order:

```
core/state → core/api → core/ui → core/nav → core/account
watchlist → components/{tape,palette,sidebar,alerts}
chart → orders/{orders,dock} → market-overview/{dashboard,markets}
portfolio → heatmap → signals → views/* → ai-copilot → app.js
```

`app.js` is a bootstrap only (keyboard, chrome paint, poll loops). Ownership is explicit:

| Concern | Single owner |
| --- | --- |
| Client state | `js/core/state.js` |
| Orders, account, fills, analytics, P&L | `js/core/account.js` |
| Which views exist / navigation | `js/core/nav.js` (`switchView` is the only entry) |
| Alert feed (signals + behaviour flags) | `js/components/alerts.js` |
| Order ticket + pre-trade review | `js/orders/orders.js` |
| Bottom dock (6 tabs) | `js/orders/dock.js` |
| Chart + indicator panes | `js/chart/chart.js` |

### 3.3 Data layer

| Technology | Purpose | Why |
| --- | --- | --- |
| **MongoDB (Mongoose)** | User and payment persistence | Document shape suits heterogeneous portfolio/position blobs; the legacy layer already used it |
| **In-memory Maps (Maps/Hash)** | The hot path: instrument master, quote/OHLCV cache, paper-trading books, journal | Sub-millisecond reads without a database round trip; the platform is a real-time read-heavy system |
| **JSON over HTTP + WebSocket** | Transport | Universal, debuggable with `curl` |

### 3.4 External data providers

| Provider | Asset classes | Status in this build |
| --- | --- | --- |
| CoinGecko (priority 2) | crypto | Keyless; live crypto quotes/history |
| Demo provider (priority 99) | all | **Always-on deterministic fallback**, labelled `DEMO` |
| Twelve Data / Finnhub / Alpha Vantage | stocks, forex | Implemented; require API keys (env), not active in this build |

### 3.5 Testing & tooling

| Tool | Purpose |
| --- | --- |
| Hand-rolled assertion suites (`test-*.js`, 371 assertions) | No framework dependency; each suite is runnable with `node test-x.js` |
| `curl`-based API sweeps | Endpoint contract verification against the running server |
| Browser DevTools harness via the preview bridge | Live DOM/render/console verification of the UI |

---

## 4. System Architecture

### 4.1 Layered architecture

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ PRESENTATION LAYER                                                            │
│ terminal.html — top navbar · left rail · centre view · intelligence panel      │
│                  · bottom dock · ticker · status strip                        │
│ js/core (state, api, nav, ui, account) · js/components · js/views             │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │  fetch(JSON)                          ▲  WebSocket quotes
┌───────────────▼───────────────────────────────────────┴───────────────────────┐
│ API LAYER (Express)                                                           │
│  /api/v2  market-routes · trading-routes · engine-routes                      │
│  /api     intelligence-routes · intelligence-v2-routes · legacy v1 routes      │
│  static   express.static(__dirname)                                           │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────────────┐
│ DOMAIN / INTELLIGENCE LAYER (25 engines, all server-side)                     │
│                                                                               │
│  Market Data Layer → Normalisation → Market Context → Risk → Regime →         │
│  Signals → Strategy → Behaviour → Execution → Journal → AI Context →          │
│  Ollama / Rule Engine → Explainable-AI payload                                │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────────────┐
│ MARKET-DATA GATEWAY                                                           │
│  asset-class routing · provider health · rate limiting · TTL cache            │
│  providers: CoinGecko (crypto) · TwelveData/Finnhub/AlphaVantage (keyed)      │
│             · Demo (deterministic fallback)                                   │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────────────┐
│ PERSISTENCE                                                                   │
│  MongoDB (users, payments)  ·  In-memory Maps (instruments, quotes, books)     │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data flow: placing a paper trade (traced end-to-end)

```
1. USER picks INFY in the watchlist
   js/watchlist/watchlist.js → selectSymbol('INFY')
2. js/core/state.js        state.selectedSymbol = 'INFY'; state.quotes['INFY'] refreshed by the 5s poll
3. js/chart/chart.js       loadChartData('INFY','1D')
   GET /api/v2/history/INFY?interval=1D&limit=200
4. src/api/market-routes.js → gateway.getHistory(...)
5. gateway: resolve asset class (instrument master) → choose provider → cache
   (CoinGecko is skipped for a stock: it declares supportedAssetTypes: ['crypto'])
6. demo-provider: history is a pure function of (symbol, interval, barIndex) → deterministic candles
7. Chart: LightweightCharts candlestick + volume series; overlays come from
   GET /api/v2/indicators/INFY (IndicatorEngine series → {time,value}[])
8. USER opens the ticket in the same split, sets qty/stop/target/thesis
9. "REVIEW ORDER" → POST /api/v2/trades/pre-check
   → src/trading/paper-trading.js preCheck(email, trade)
   → PreTradeRiskCheck + GuardrailEngine + portfolio snapshot (server-owned)
10. Verdict on screen: risk level, position weight, guarding evidence bullets.
    If a guardrail blocks: DISCIPLINE CHECK with reason chips.
11. "CONFIRM" → POST /api/v2/orders
    → PaperTradingService.placeOrder → gateway.getQuote (fills at the live quote)
    → commission 0.05% per side, balance debit, position upsert, fill appended
    → TradingJournal.openTrade (carries regime + thesis)
    → EventBus emit ORDER_FILLED
12. Response → js/core/account.js refreshAccountData()
    → sidebar portfolio/holdings, bottom dock, profile chip, chart position card all re-render
    → toast: "BUY 5 INFY · filled @ 1.5K"
```

### 4.3 Data flow: closing a trade and generating a review

```
POST /api/v2/positions/INFY/close
   → PaperTradingService.closePosition
       · mark-to-market from the gateway quote (never a client price)
       · realised P&L, fee accounting, position removed/partially reduced
       · journal.closeTrade(email, tradeId, exitPrice, context)
           · MFE/MAE from the actual bars during the holding window (src/trading/excursions.js)
           · R-multiple, holding time, relative performance vs benchmark
           · four-way classification: GOOD/BAD trade × GOOD/BAD result
           · review object (score + summary) attached to the trade
           · EventBus emit TRADE_CLOSED
   → PostTradeLearningEngine.generateReview(trade, context) enriches with regime evidence
   → BehaviouralAnalytics recomputes patterns over the updated trade list
   → next /api/trader/behavior call reflects the new trade
   → strategy × regime matrix cell updates on the next /api/strategies/matrix call
```

### 4.4 Architecture decisions and their rationale

| Decision | Rationale | Trade-off accepted |
| --- | --- | --- |
| Server computes all facts; the LLM only interprets | Prevents hallucinated numbers presented as analysis; makes the AI output auditable | The AI is only as good as the context builder |
| Deterministic demo provider keyed on `(symbol, interval, barIndex)` | Any two features that ask for the same series must agree; a shorter request is a suffix of a longer one | Demo data is synthetic (labelled) |
| Asset-class-aware provider routing | A crypto-only provider must never be asked for a stock (it cost ~650 ms per cold request) | Requires a maintained asset-class map |
| One owner per piece of state on the client | Kills the class of bug where the sidebar and the dock disagree | Modules must be loaded in order |
| No client-side indicator maths | One arithmetic across chart, screener, AI | Every indicator needs a server round trip |
| In-memory trading books | Sub-millisecond reads on a real-time path | State is lost on restart (documented, not hidden) |
| Explicit `null` for missing metrics | "DATA UNAVAILABLE" is a feature, not a bug | UI needs null-aware rendering everywhere |

---

## 5. Feature Analysis

Each entry: purpose → workflow → files/functions → input → processing → output.
Status follows the legend at the top.

### 5.1 Market-data gateway — ✅ verified
- **Purpose:** present many providers as one API with health-aware failover.
- **Files:** `src/market-data/gateway.js`, `cache.js`, `normalizer.js`, `providers/*.js`, `src/instruments/instrument-master.js`.
- **Input:** `(symbol, exchange, interval, limit)`; **Processing:** asset-class resolution → provider selection by `supports()` + health + rate-limit state → normalise candles/quotes → TTL cache (`:default` keys, symbol-keyed quotes) → metrics; **Output:** normalised candles/quotes + `source`/`quality` provenance.
- **Measured:** cold stocks/forex/index **3–28 ms** (was ~650–800 ms before asset-class routing).

### 5.2 Instrument master — ✅ verified
- **Purpose:** instant search/metadata without an API call.
- **Files:** `src/instruments/instrument-master.js`; **Data:** 76 instruments — 48 stocks, 10 crypto, 7 forex, 11 indices.
- **Functions:** `search(query, filters)`, `getBySymbol(symbol, exchange)`, `getSectors()`.
- **Output:** symbol, company name, exchange, asset class, sector, industry, country, index membership.

### 5.3 Live quote stream — ⚠️ implemented, unverified
- **Files:** `src/websocket/market-stream.js` (attached at `server-v2.js:96`), stats at `GET /api/v2/stream/stats`.
- **Behaviour:** subscribes to gateway symbols, pushes on an interval (3 s), tracks clients/subscriptions/symbols. The workspace additionally polls HTTP every 5 s, so quotes render even if the socket is unavailable.

### 5.4 Paper-trading broker — ✅ verified
- **Purpose:** simulated execution with real accounting discipline.
- **Files:** `src/trading/paper-trading.js` (850 lines), `src/api/trading-routes.js`, `src/trading/excursions.js`.
- **Workflow:** `preCheck` → `placeOrder` → `_fill` (live quote only; refuses to fill on an invented price) → position upsert → `journal.openTrade` → `EventBus`. Exits via `/positions/:symbol/close`, stops via `PUT /positions/:symbol/stop` (every move appended to `stopHistory`), resting limit orders via `/orders/fill-resting`.
- **Output:** account snapshot (balance, equity, market value, cost basis, unrealised/realised/total P&L, fees, return %), analytics (exposure, sector/asset-class mix, HHI concentration), P&L by symbol and by day.
- **Measured:** `BUY 5 INFY` filled at the live DEMO quote; holdings and the dock updated; an over-sized order was blocked by guardrails and, after an audited override, honestly rejected for insufficient balance.

### 5.5 Trading journal — ✅ verified
- **Files:** `src/engine/trading-journal.js`; **State:** 64 seeded closed trades + live ones.
- **Per trade:** entry/exit price and time, quantity, direction, stop, target, strategy, sector, thesis, MAE/MFE, R-multiple, holding time, regime at entry/exit, review score.
- **Endpoints:** `POST /api/v2/journal/open`, `POST /api/v2/journal/close`, `GET /api/v2/journal/:email`, `GET /api/v2/journal/open`, `PUT`-style `POST /api/trades/thesis`.

### 5.6 Market regime engine — ✅ verified
- **Files:** `src/engine/market-regime-engine.js`; **Endpoint:** `POST /api/market/regime/assess`, `GET /api/market/regime/:symbol`.
- **Classes:** TRENDING_UP/DOWN, RANGE_BOUND, HIGH_VOLATILITY, LOW_VOLATILITY, BREAKOUT, HIGH_RISK_EVENT, NEUTRAL.
- **Measured:** NIFTY50 over 200 DEMO bars → `NEUTRAL / MIXED SIGNALS`, confidence 40%, evidence `ADX 27.0`, `ATR% 0.54, percentile 53`, `RSI 51.1` — every field traceable.

### 5.7 Strategy × regime matrix — ✅ verified
- **Files:** `src/engine/strategy-regime-matrix.js`; **Endpoint:** `GET /api/strategies/matrix`, `POST /api/strategies/matrix/assess`.
- **Behaviour:** groups the trader's own closed trades by strategy × regime, reports win rate and expectancy with the sample size, and grades compatibility HIGH/MODERATE/LOW. Language is deliberately evidence-based ("historically performs poorly for your record"), never predictive.

### 5.8 Pre-trade risk + portfolio heat + sizing — ✅ verified
- **Files:** `src/engine/pre-trade-risk.js`, `src/engine/risk-terminal.js`; **Endpoints:** `POST /api/v2/trades/pre-check`, `GET /api/portfolio/risk`, `GET /api/portfolio/heat`, `POST /api/portfolio/position-size`, `POST /api/v2/risk/analyze`, `POST /api/v2/risk/position-size`.
- **Output:** risk level, position weight, findings with factor+detail, stress scenarios, concentration, and a fixed-fractional position size adjusted for volatility/regime/exposure.

### 5.9 Signal ranking and conflict detection — ✅ verified
- **Files:** `src/engine/signal-engine.js`; **Endpoints:** `POST /api/signals/ranked` (requires a `signals[]` array), `POST /api/signals/conflict`.
- **Score breakdown (7 factors):** freshness, volume confirmation, regime compatibility, strategy match, liquidity, risk, relevance → quality score /100 → tiers TOP_PRIORITY / MEDIUM / LOW.
- **Verified:** 12 ranked signals on the live watchlist; the dashboard, the alerts pane and the Signals view all share one shaping function (`fetchRankedSignals`) so a score is identical everywhere.

### 5.10 Trade quality + execution quality — ✅ verified
- **Files:** `src/engine/trade-quality-engine.js`, `src/engine/execution-quality.js`; **Endpoints:** `POST /api/v2/trade-quality/evaluate`, `GET /api/execution/:tradeId`, `POST /api/execution/timing`.
- **Output:** quality score/grade with factors; entry/exit timing versus the best and worst available alternative within a window, with a disclaimer.

### 5.11 Post-trade learning — ✅ verified
- **Files:** `src/engine/post-trade-learning.js`, `src/trading/excursions.js`, `src/api/intelligence-v2-routes.js` (`GET /api/trades/:id/review`).
- **Output:** the 9-section review (what happened, why, strategy adherence, regime, what went well/wrong, repeat, avoid, AI lesson) plus metrics. Classification separates process from outcome.

### 5.12 Behavioural analytics + guardrails — ✅ verified
- **Files:** `src/engine/behavioral-analytics.js`, `src/engine/guardrails.js`, `src/engine/trader-profile.js`; **Endpoints:** `GET /api/trader/behavior`, `GET /api/trader/profile`, `GET|PUT /api/guardrails/settings`, `POST /api/guardrails/check`, `POST /api/guardrails/confirm`, `GET /api/guardrails/logs/:email`.
- **Detects (observable only) — six detectors, verified by enumerating the engine's emitted types:** `revenge_trading`, `overtrading`, `position_escalation`, `premature_exits`, `chasing` (entry chasing), `concentration`.
- **Honest scope note:** the wider behavioural catalogue in the original specification (averaging down, explicit stop-movement detection, off-strategy trades, trades-after-loss-streak, loss-holding asymmetry) is **not** implemented as separate detectors. Do not represent the engine as detecting more patterns than these six.
- **Guardrail friction:** a blocked order returns a discipline check with reason options; the override is logged with the reason, timestamp and eventual outcome. **Verified:** `• Position would be 12245.6% of account (limit 25%)`, `• Risk per trade 12240.6% exceeds 2%`.
- **Trader profile:** an aggregate of the above; the platform never diagnoses psychological or medical conditions — it describes measurable behaviour.

### 5.13 Backtest, sensitivity, walk-forward — ✅ verified
- **Files:** `src/engine/backtest-engine.js`, `src/engine/strategy-lab.js`, `js/views/strategies.js`; **Endpoints:** `POST /api/strategies/backtest|sensitivity|walk-forward`.
- **Safeguards:** signals computed only from data up to each bar (no look-ahead); chronological non-overlapping segments; transaction cost 10 bps + 5 bps slippage; sample-size warnings.
- **Verified live:** candles come from the gateway (RELIANCE, 400 DEMO bars); two consecutive runs produced **identical** output; walk-forward produced real out-of-sample trades per window.

### 5.14 Claim verification — ✅ verified
- **Files:** `src/engine/claim-verification.js`, `js/views/claims.js`; **Endpoint:** `POST /api/claims/verify`.
- **Behaviour:** extracts verifiable statements, checks them against available data, returns SUPPORTED / PARTIALLY SUPPORTED / NOT SUPPORTED / INSUFFICIENT DATA with per-claim evidence. It never declares a person fraudulent. Symbol resolution prefers an instrument named in the claim over the first uppercase token.

### 5.15 AI copilot + evidence engine — ⚠️ implemented; LLM path unverified
- **Files:** `src/engine/ai-context-builder.js`, `src/engine/ai-copilot.js`, `src/engine/evidence-engine.js`, `js/ai-copilot/ai-copilot.js`; **Endpoints:** `POST /api/v2/ai/analyze` (takes `{ symbol }` only), `POST /api/ai/analyze-trade`, `GET /api/ai/status`.
- **Contract:** the client sends a symbol; the server prices it, computes indicators/regime/exposure and returns signal, bias, confidence, evidence (indicators used, market conditions, risks, counterarguments), provenance (`source`, `quality`, `bars`, `interval`), `unavailable[]`, a freshness timestamp, the model name and a disclaimer.
- **Unverified:** Ollama is not running in this environment, so every response reports `aiModel: rule-engine`. The LLM branch has never executed here.

### 5.16 Screener — ✅ verified
- **Files:** `src/engine/screener-engine.js`, `js/views/screener.js`; **Endpoints:** `POST /api/v2/screen`, `GET /api/v2/screen/filters|presets|saved`, `POST /api/v2/screen/save`.
- **Verified:** `RSI < 45` returned 22 rows with genuine server-computed technicals; clicking a row opens an inline candlestick chart.

### 5.17 Sector heatmap and market breadth — ✅ verified
- **Files:** `src/engine/sector-heatmap.js`, `src/api/engine-routes.js`; **Endpoints:** `GET /api/v2/heatmap`, `/heatmap/sectors`, `/heatmap/sector/:name`.
- **Verified:** repeated identical requests return identical numbers; breadth (e.g. 24 advancers / 23 decliners) matches the Overview widgets; unrated instruments render as neutral tiles, never a colour.

### 5.18 Market tape — ✅ verified
- **Files:** `src/engine/market-tape.js`; **Endpoints:** `GET /api/v2/tape`, `/tape/stats`, `POST /api/v2/tape/pause|filter`.
- **Behaviour:** ring buffer (max 2000 entries) with large-print and volume-anomaly flags; pausable; rendered in the right panel and as a dashboard widget.

### 5.19 Unified workspace UI — ✅ verified
- **Files:** `terminal.html`, `css/platform.css`, `js/core/*`, `js/components/*`, `js/orders/*`, `js/market-overview/*`, `js/portfolio/*`, `js/chart/*`, `js/views/*`.
- **Layout:** 15-view navbar, 8-section collapsible rail, 3-pane intelligence column (AI / Tape / Alerts), 6-tab bottom dock, ticker, status strip. Draggable sidebar and dock; command palette (Ctrl+K) with view jumps, `screen RSI<30`, `open NIFTY`.
- **Verified:** all 15 views render with **zero console errors**; a paper order updates sidebar + dock + position card; sidebar collapse, panel tabs, dock tabs and the palette were all exercised.

### 5.20 Legacy layer (v1) — 🧪 present, front-door only
- **Files:** `server.js` (1,213 lines, 19 endpoints, MongoDB + Stripe/Razorpay) and the funnel pages `index.html` (landing), `login.html` + `js/auth.js`, `pricing.html`, `payment-success.html` + `js/landing.js`.
- **Status:** this is the auth/premium front door only. The duplicate application surfaces were **deleted** in the waste-removal pass: `dashboard.html`, `dashboard-pro.html`, `dashboard-standalone.html`, `market.html`, `portfolio.html`, `order-history.html`, `test-server.html` and the 2,412 lines of `js/dashboard*.js` that drove them, along with the superseded `server-no-db.js`. Every link in the remaining pages now points at `terminal.html`, so there is exactly one application surface.
- **One residual gap:** `server.js` still holds the only real (if insecure, F-code) auth and payment code; it is retained for the billing flow, not as an application entry point. `npm start` now runs `server-v2.js`.

---

## 6. Algorithm Analysis

All formulas below are implemented server-side in `src/engine/*`. Complexity is stated for `n` bars.

### 6.1 Technical indicators — `src/engine/indicator-engine.js` (+ `indicator-series.js`)

| Indicator | Formula | Complexity | Notes |
| --- | --- | --- | --- |
| SMA | `Σ(close[i-period+1..i]) / period` | O(n·p) | Per-window reduce |
| EMA | seed = SMA(first p); `EMA_i = close_i·k + EMA_{i-1}·(1−k)`, `k = 2/(p+1)` | **O(n)** | Series form is single-pass; scalar = last element |
| RSI (Wilder) | `RS = avgGain/avgLoss`; `RSI = 100 − 100/(1+RS)`; averages smoothed with `(prev·(p−1)+x)/p` | O(n) | Returns 100 when `avgLoss == 0` |
| ATR (Wilder) | `TR = max(H−L, |H−C_prev|, |L−C_prev|)`, smoothed Wilder-style | O(n) | Volatility unit for stops/sizing |
| ADX (Wilder) | `+DM/−DM` → smoothed `+DI/−DI` → `DX = 100·|+DI−−DI|/(+DI+−DI)` → smoothed | O(n) | Trend-strength, direction-agnostic |
| MACD | `EMA(fast) − EMA(slow)`, signal = EMA(macd, 9), histogram = macd − signal | O(n) | Signal EMA runs over contiguous MACD values, then maps back |
| Bollinger | `middle = SMA(p)`, `sd = √(Σ(x−μ)²/p)`, bands = `μ ± m·sd` | O(n·p) | Band position 0–100 |
| Stochastic %K | `100·(C−L_p)/(H_p−L_p)`, smoothed by SMA | O(n·p) | — |

**Design note:** scalars *delegate* to the series implementations, so the value drawn on the chart is byte-identical to the value a screener filter tests. Verified by 16 dedicated parity tests.

### 6.2 Trade metrics — `src/trading/excursions.js`, `src/engine/trading-journal.js`

- **Realised P&L:** `(exit − entry) · qty · direction − fees`
- **R-multiple:** `realisedP&L / initialRisk` where `initialRisk = |entry − stop| · qty`
- **MAE/MFE:** extremes of `low/high` over the bars between entry and exit timestamps (**real bars, not a random walk**)
- **Holding time:** `exitTime − entryTime` (reported in human units)
- **Relative performance:** `tradeReturn − benchmarkReturn` over the same window
- **Outcome classification:** cross-product of *process* (did the trade follow the stated strategy and keep risk acceptable?) and *result* (P&L sign) → GOOD/BAD TRADE × GOOD/BAD RESULT. A losing trade that followed the plan is a *good trade with a bad result*.
- **Review score:** weighted composite of setup quality, risk quality, exit quality and adherence (0–100).

### 6.3 Portfolio analytics — `src/engine/pre-trade-risk.js`, `paper-trading.js`

- **Position weight:** `positionValue / equity · 100`
- **Exposure:** gross = `Σ marketValue`; invested % = `gross / equity · 100`
- **Concentration (HHI):** `Σ wᵢ²` where `wᵢ` is the position's share of gross → `<0.25` LOW, `0.25–0.5` MODERATE, `>0.5` HIGH
- **Unrealised P&L:** `Σ (price·qty − avgPrice·qty)`; **realised** from closed orders; **equity** = `cash + marketValue`
- **Fees:** 0.05% of notional per side, disclosed on every fill
- **Portfolio heat:** aggregate open risk as a % of equity, plus per-position risk
- **Position sizing (fixed-fractional):** `riskBudget = equity · riskPerTrade`; `baseQty = riskBudget / |entry − stop|`; then multipliers for volatility, regime, existing exposure, correlation and the strategy's historical performance in that regime → final quantity (capped by exposure limits).

### 6.4 Regime classification — `src/engine/market-regime-engine.js`

Rule-ordered classifier over measurable inputs (ATR percentile, ADX, MA structure, price dispersion, index trend, breadth, volume), emitting `{ regime, sub, confidence, evidence[] }`. Confidence is a function of how many independent indicators agree; the evidence array is what the UI shows, so a classification is always inspectable.

### 6.5 Signal ranking — `src/engine/signal-engine.js`

`qualityScore = Σ wᵢ · scoreᵢ` over 7 normalised factors (freshness, volume confirmation, regime compatibility, strategy match, liquidity, risk, relevance), each 0–100 and returned individually so the UI can render a per-factor bar breakdown. Tiers are thresholds on the composite. **Signal conflict** compares direction factors (price/volume/RSI/sector/market) and reports lean + conflict + recommendation; unavailable factors are explicitly labelled rather than assumed neutral.

### 6.6 Behaviour detection — `src/engine/behavioral-analytics.js`

Pattern detectors over the ordered trade list, e.g.:
- **Position escalation after loss:** `(riskNow − avgRiskAfterLosses) / avgRiskAfterLosses` with a threshold → evidence string quoting both amounts.
- **Revenge trading / trades after a loss streak:** consecutive-loss counter then a time-to-next-trade and size-delta test.
- **Holding losers longer than winners:** `meanHoldingTime(losers) − meanHoldingTime(winners)`.
- **Stop movement:** count of entries in `stopHistory`.
- **Overtrading / frequency:** trades per day versus the trader's own baseline.
- **Concentration / oversizing:** position weight versus account equity.

### 6.7 Strategy validation — `src/engine/backtest-engine.js`

- **Split:** chronological training / validation / out-of-sample (no shuffle).
- **No look-ahead:** signal computed on bar *i*, executed at bar *i+1*'s open.
- **Costs:** 10 bps commission + 5 bps slippage per side.
- **Expectancy:** `winRate·avgWin − lossRate·avgLoss` (also reported in R).
- **Profit factor:** `Σ wins / |Σ losses|`.
- **Max drawdown:** peak-to-trough on the equity curve.
- **Walk-forward:** rolling `windowSize` train → `stepSize` out-of-sample, aggregating OOS trades for a stability read; the UI warns when the aggregate sample is too small to conclude anything.

### 6.8 Claim verification — `src/engine/claim-verification.js`

Claim-type extraction (price move, oversold/overbought, volume anomaly, trend, institutional flow) → data requirement per type → comparison against observed values → verdict with per-claim evidence and an explicit INSUFFICIENT DATA path. Complexity is linear in the number of extracted claims.

### 6.9 Search — `src/instruments/instrument-master.js`

Case-insensitive substring match across symbol / company name / sector / industry with optional exchange, asset-class, sector and country filters; linear scan over 76 instruments (µs), O(n) with early `limit` truncation.

---

## 7. Database Analysis

### 7.1 Storage strategy: why hybrid

The platform has two very different workloads:

1. **A real-time read-heavy hot path** — quotes, candles, indicators, open positions, journal rows, tape entries. Requirement: sub-millisecond reads, tolerant of loss (it is paper trading). **Choice: in-memory `Map` collections.**
2. **Durable, low-volume, consistency-sensitive records** — user accounts and payment transactions. Requirement: uniqueness and durability. **Choice: MongoDB via Mongoose.**

A document store was preferred over a relational one because a user's portfolio/position blob is naturally a nested document, and the legacy layer already read it that way.

### 7.2 Collections / models

| Model | File | Fields | Notes |
| --- | --- | --- | --- |
| **User (legacy, inline)** | `server.js:31-42` | `email` (unique, required), `password`, `balance` (default 100000), `portfolio` (Object), `isPremium`, `stripeCustomerId`, `subscriptionId`, `tierLevel` enum `free|pro|enterprise` | The model actually used by the running v1 server |
| **Payment** | `models/Payment.js` | `userId`, `paymentId`, `orderId`, `amount`, `status` (default PENDING), `date` | Imported by `server.js:415` for Stripe/Razorpay records |

**Relationships:** `Payment.userId` → `User.email` (**logical foreign key only** — no `ref`/populate, no DB-level constraint). **Indexes:** the only index is the implicit unique index on `email`. No compound or TTL indexes.

### 7.3 In-memory stores (the hot path)

| Store | Owner | Key | Contents |
| --- | --- | --- | --- |
| Instrument master | `instrument-master.js` | `symbol:exchange` | 76 instruments + metadata |
| Quote cache | `market-data/cache.js` (via gateway) | **symbol** | Live quotes with TTL |
| OHLCV cache | same | `symbol:interval:limit` | Candle arrays |
| Paper books | `paper-trading.js` | `email` | balance, positions, orders, fills, realised P&L, fees |
| Trading journal | `trading-journal.js` | `email` → trade[] | Trades + reviews |
| Tape | `market-tape.js` | ring buffer | 2000 most recent prints |
| Guardrail logs | `guardrails.js` | `email` | Warnings shown, overrides, reasons |

### 7.4 CRUD and durability

- **Create:** `POST /api/v2/orders` (fill + position + journal trade), `POST /api/v2/journal/open`, `POST /api/register` (Mongo).
- **Read:** account, P&L, analytics, orders, fills, positions, journal, matrix, behaviour, profile.
- **Update:** `PUT /api/v2/positions/:symbol/stop`, `PUT /api/guardrails/settings`, close end-points.
- **Delete:** `DELETE /api/v2/orders/:id` (cancel).
- **Durability:** trading state is **volatile by design** — it re-seeds on boot (the demo dataset is deterministic, so the behaviour the UI demonstrates is reproducible). Mongo durability applies only to users and payments.

---

## 8. API Analysis

A complete endpoint-by-endpoint reference is in **`docs/02-API-REFERENCE.md`**. This section covers the architecture of the API surface.

### 8.1 Mount points

| Mount | Router | Domain | Endpoints |
| --- | --- | --- | --- |
| `/api/v2` | `market-routes.js` | market data + indicators | 11 |
| `/api/v2` | `trading-routes.js` | paper trading | 12 |
| `/api/v2` | `engine-routes.js` | screener, heatmap, regime, quality, risk, tape | 18 |
| `/api/v2` | `intelligence-routes.js` | journal, AI, strategy dimensions | 10 |
| `/api` | `intelligence-v2-routes.js` | the intelligence layer | 29 |
| `/api` | inline in `server-v2.js` | legacy v1 compatibility + auth | 8 |
| — | `server.js` (v1, separate process) | auth, portfolio, payments | 19 |

### 8.2 Response contract

Every JSON endpoint returns a uniform envelope:

```json
{ "success": true, "data": { }, "meta": { "count": 24, "source": "demo" } }
{ "success": false, "error": "candles and strategy required" }
```

Validation is explicit at the edge (`if (!candles || !strategy) return res.status(400)…`), so the API answers with a described error rather than an exception. Verified: 6 endpoints returned 400 to a deliberately malformed request and 200 to the documented contract.

### 8.3 Status codes in use

| Code | Meaning in this API |
| --- | --- |
| 200 | Success (including `success:false` business rejections such as a guardrail block) |
| 400 | Missing/invalid parameters |
| 404 | Unknown resource (e.g. unknown sector) |
| 409 | Order rejected/conflict (e.g. insufficient balance at fill time) |
| 500/503 | Engine failure or dependency unavailable (heatmap/indicators explicitly return 503 with a reason) |

### 8.4 Notable contracts

- `POST /api/v2/trades/pre-check` — body `{ email, trade }`; returns `{ trade, risk, guardrail }`. The portfolio shape is **server-owned**; the client never sends its own positions.
- `POST /api/v2/orders` — `{ email, symbol, side, quantity, orderType, limitPrice?, stopLoss?, target?, strategy?, notes?, acknowledgeGuardrails?, guardrailReason? }`.
- `POST /api/v2/ai/analyze` — `{ symbol }` **only**. Any client-supplied indicator would be ignored by design.
- `POST /api/strategies/backtest` — `{ candles, strategy, params, initialCapital }`; the server never invents candles for a backtest.
- `GET /api/v2/indicators/:symbol` — `?overlays=ema20,ema50,bb&sub=rsi|macd`; returns `{ overlays: {time,value}[], panes, bars, source }`.

---

## 9. UI / UX Analysis

- **Design philosophy:** institutional terminal, not consumer dashboard. Dark base (`#06080f`), elevated surfaces, a single accent gradient, monospace numerals everywhere so columns align, and a strict "no number without provenance" rule.
- **Layout system:** the shell is a CSS grid — `52px` topbar, elastic body (`minmax(0,1fr)`), resizer, dock, `30px` ticker, `26px` status strip. Panels use flex with `min-height:0` so nested scrollers behave. Design tokens (spacing, radius, colour, glow) live in `:root`.
- **Collapsible everything:** the rail has 8 collapsible sections, the dashboard has 9 collapsible widgets, the dock collapses to 34 px, the sidebar and intelligence panel toggle from the navbar. Widget state survives re-render through `state.widgets`.
- **User journey:** search or watchlist → chart (candles + volume + overlays, with the order ticket beside it) → pre-trade check → justification → place → monitor in the dock and sidebar → exit → automatic review → behaviour/matrix update.
- **Responsive behaviour:** 1200 px collapses the rail, 900 px the intelligence column, under 600 px the navbar becomes purely keyboard/palette driven.
- **Accessibility, honestly:** keyboard navigation exists (Ctrl+K palette, Ctrl+/ shortcuts, `1-9` view jumps, `S`, `R`), focus states are styled, and colour is never the only signal (arrows, labels and badges accompany red/green). **Not done:** ARIA roles/live regions, a focus trap in the palette modal, and a contrast audit.
- **Performance techniques in the UI:** incremental DOM writes per view (no virtual DOM churn), `<table>` for large row sets, sticky headers, `overflow:auto` scrollers instead of growing the page, a single chart instance per view (destroyed on switch), and a quote poll (5 s) decoupled from render so only price cells change.

---

## 10. Security Analysis

**This build is a paper-trading prototype with no authentication on the v2 API. That is the single largest gap and is stated first.**

### 10.1 What exists

| Control | Status |
| --- | --- |
| Legacy v1 login/register | Present (`POST /api/register`, `POST /api/login`) |
| Premium gate | Present (`requirePremium` middleware reading an `x-user-email` header, `server.js:44-56`) |
| Parameter validation | Consistent at route level; engines reject missing inputs with 400 and a reason |
| Parameterised DB access | Mongoose query builders (no string-concatenated queries observed) |
| Secret externalisation | API keys and payment secrets read from `.env` via `dotenv`; `.env` is not committed |
| XSS surface in the workspace | `escapeHtml()` applied to interpolated provider/claim/behaviour strings; numeric cells are `fmt()`-ed |

### 10.2 Findings (verified in source)

| # | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| S1 | **Critical** | **No authentication or authorisation on the v2 API.** Any caller can read or mutate any account by changing the email in the URL/body. | `/api/v2/account/:email`, `/api/v2/orders` (`email` in body), `/api/v2/positions/:symbol/close` |
| S2 | **Critical** | **Passwords are stored and compared in plaintext**; login is `User.findOne({ email, password })`. A DB read exposes every credential. | `server.js:333, 356, 366` |
| S3 | **High** | **Hardcoded demo credentials** are seeded and printed in logs. | `server.js:83, 114` (`demo@college.com` / `password123`) |
| S4 | **High** | **No session or token mechanism at all** — no JWT, no cookies, no server session. The "identity" is a header or query string. | `jsonwebtoken` is neither declared in `package.json` nor required by any source file (it exists only as an extraneous unlocked install in `node_modules/`) |
| S5 | **High** | **Wide-open CORS** — `app.use(cors())` with no origin allow-list, on a server that also serves the static app. | `server-v2.js:38`, `server.js:27` |
| S6 | **Medium** | **No rate limiting** on any route, including the payment endpoints and the AI endpoint that triggers upstream provider calls. | `express-rate-limit` is not declared and not required anywhere (extraneous install only) |
| S7 | **Medium** | **No security headers** (no CSP, HSTS, `X-Frame-Options`). | `helmet` is absent from `package.json`, from `package-lock.json` and from `node_modules/` — verified with `require.resolve` |
| S8 | **Medium** | **No payment webhook signature verification evidence** in the v2 path; the v1 flow trusts a client-supplied `orderId` in `/api/verify-payment`. | `server.js` payment routes |
| S9 | **Low** | **Error messages leak internals** (engine exception text is returned to the client, e.g. `Heatmap unavailable: ${error.message}`). | `engine-routes.js` |
| S10 | **Low** | **Unbounded in-memory growth**: journal/tape/guardrail logs grow per account with no eviction (the tape is capped at 2000; the journal is not). | `trading-journal.js`, `guardrails.js` |

### 10.3 Recommended remediation (in priority order)

1. **Introduce real sessions**: short-lived JWT (or signed HTTP-only cookie session) issued at login; derive the account from the token, never from a URL/body field; delete `:email` account addressing in favour of `/api/v2/account/me`.
2. **Hash passwords** with `bcrypt`/`argon2` (cost ≥ 10), migrate existing rows on next login, remove seeded credentials from code. Note: `bcryptjs` is already present in `node_modules/` as an extraneous install (neither declared nor imported) — do not rely on it without adding it to `package.json`.
3. **Lock CORS to the app origin(s)** and add `helmet` with a CSP that permits only the fonts/CDN actually used.
4. **Rate-limit** the API (per-IP and per-account), especially `/api/login`, `/api/register`, payment and AI routes.
5. **Verify payment webhooks by signature** server-side and make settlement idempotent on `paymentId`.
6. **Return generic error text** to clients; log the detail server-side.
7. **Add ownership checks** to every trading route once identity exists.

---

## 11. Performance Analysis

### 11.1 Measured (this environment, DEMO mode)

Method: 2 warm-up requests then 5 measured requests per route, median reported, against the
running server in DEMO mode on this machine (`http.request` timing, server-rendered).

| Metric | Value (median, min–max) |
| --- | --- |
| `GET /api/v2/history/:symbol` (200 bars, warm) | **2 ms** (1–3) |
| `GET /api/v2/indicators/:symbol` (200 bars, 2 overlays + RSI pane) | **2 ms** (1–2) |
| `GET /api/v2/quote/:symbol` (warm) | **1 ms** (1–1) |
| `GET /api/v2/heatmap` (full sector breadth) | **2 ms** (1–5) |
| `GET /api/v2/overview` | **1 ms** (0–2) |
| `POST /api/v2/screen` (RSI filter over the universe) | **105 ms** (100–110) |
| Cold stock/forex/index request (server-side total) | 3–28 ms (was 650–800 ms pre-fix) |
| `GET /api/v2/quotes` (5 mixed symbols incl. crypto) | ~500 ms cold (upstream crypto round trip), cached thereafter |
| Dashboard render (9 widgets, 4 parallel API calls) | ~500 ms to painted |
| View switch (per view) | 420–515 ms wall-clock including its own fetches |
| `terminal.html` payload | **6.8 KB** (142 lines) + 2 stylesheets (37 KB: `platform.css` 13.9 KB, `terminal.css` 23.4 KB) |
| Workspace DOM nodes | **852** measured on the chart view (canvas-rendered chart excluded — it is not DOM) |
| Client scripts loaded | 28 modules (29 `<script>` tags including one inline) |

### 11.2 Techniques

- **Caching:** TTL cache for quotes and candles; quote keys are symbol-only (every symbol maps to exactly one exchange), which eliminated a class of bug where the chart and the screener read different cache slots for the same instrument.
- **Provider routing by asset class:** a crypto-only provider is never tried for a stock; health-sensitive providers can't stall the hot path.
- **Single-pass indicator series:** EMA/RSI/MACD are single-pass O(n) rather than recomputing a scalar per bar (`O(n²)`), which matters for the backtest engine running hundreds of windows.
- **Deterministic demo data:** history is a pure function of `(symbol, interval, barIndex)`, so it is cache-friendly, reproducible and identical across consumers — no repeated generation cost.
- **Independent data sets in one response:** `/api/v2/overview`, `/heatmap`, `/signals/ranked` and `/tape` are fetched with `Promise.all`, so dashboard paint time is the slowest call, not the sum.
- **Polling design:** quotes 5 s, tape 4 s, account 15 s, alerts 45 s, status 30 s, clock 1 s — each refreshing only the surface that consumes it; avoids a full re-render per tick.
- **Chart hygiene:** one chart instance per view, explicitly removed on switch (`remove()`), indicator panes created only when selected.

### 11.3 Scalability notes (honest)

- The in-memory design is single-process: it cannot scale horizontally without a shared store (Redis) and sticky sessions.
- `_account(acct)` books are per-email Maps; a multi-tenant deployment needs the paper books in Mongo/Redis with the same transactional discipline.
- The daily P&L aggregation is a linear scan per request — fine for hundreds of trades, needs materialisation at thousands.
- The demo provider is single-threaded CPU work per request; a real feed should push into the cache rather than compute on demand.

---

## 12. Project Metrics

| Metric | Value | How measured |
| --- | --- | --- |
| Hand-written source files | **94** | 53 server-side (43 src modules + 2 servers + 7 test files + 1 model) + 30 client JS + 5 HTML + 6 CSS |
| Lines of code (excl. `node_modules`) | **≈21,000** | `wc -l` across the above (20,983) |
| — server-side JS | ≈13,550 | servers (1,927), `src/**` (10,096), tests (1,514), models (12) |
| — client JS | ≈3,774 | all of it the unified workspace; 2,412 lines of legacy dashboard JS were deleted |
| — HTML | ≈1,890 | 5 pages (was 12) |
| — CSS | ≈1,770 | 6 stylesheets |
| Engine modules | **25** | `src/engine/` |
| HTTP endpoints | **106** | 87 on v2 + 19 on v1 |
| Route modules | 5 | `src/api/` |
| Data providers | 5 | CoinGecko, TwelveData, Finnhub, AlphaVantage, Demo |
| Instruments | **76** | 48 stocks · 10 crypto · 7 forex · 11 indices |
| MongoDB models | 2 (1 inline `User` + 1 `Payment`; the orphaned `models/User.js` was deleted) | `models/`, `server.js` |
| UI views (single page) | **15** | navbar registry in `js/core/nav.js` |
| Dashboard widgets | 9 | `js/market-overview/dashboard.js` |
| Dock tabs | 6 | `js/orders/dock.js` |
| Automated tests | **371 assertions / 6 suites** | 39 indicators · 16 indicator-series · 46 heatmap · 100 trading · 105 intelligence · 65 API |
| Documented endpoints exercised | 65 calls / ~55 endpoints | API sweeps against the running server |
| Console errors in a full 15-view pass | **0** | live preview sweep |
| Cyclomatic complexity | **Moderate** | Largest files: `server.js` 1213, `paper-trading.js` 850, `backtest-engine.js` 397; the v2 server is 714 lines of mostly wiring. Heavy branching is confined to the engines (each ≤400 lines and unit-tested). |
| Production readiness | **4 / 10** | Functionally substantial and internally consistent; blocked by S1–S5 (no auth, plaintext passwords, open CORS), volatile trading state, no LLM path exercised, and legacy duplication. |

---

## 13. Known Limitations, Defects and Duplication (audit findings)

### 13.1 Defect register

Fixed in the waste-removal pass (each verified in source before and after):

| # | Was | Fix | Proof |
| --- | --- | --- | --- |
| F1 | `models/User.js` never imported; `server.js:43` defines its own inline `User` schema — two competing `mongoose.model('User')` definitions | Module deleted; `server.js` is now the single owner of the schema | `grep -rn "models/User" --include=*.js .` → no matches |
| F2 | `js/chart/chart.js` registered `window.addEventListener('resize', …)` **inside** `loadChartData`, which runs on every view switch, symbol change, interval change and overlay toggle → unbounded listener growth | Extracted to a guarded `bindResize()` (bound once per page) and throttled to one frame via `requestAnimationFrame` | Instrumented `window.addEventListener` across 5 chart re-renders: **0** resize registrations (was 5) |
| F3 | `js/ai-copilot/ai-copilot.js` `renderAI()` had no caller (nav maps `ai → openAiView()`) | Deleted | `grep -rn renderAI js/` → no matches |
| F4 | `state.chart.drawing` / `state.chart.lines` never read | Removed from `js/core/state.js` | `state.chart` now resolves to `{type, interval, overlays, sub}` |
| F7 | `package.json` described the project as "College project - Paper trading platform"; `crypto@1.0.1` (a deprecated placeholder package) in dependencies; `dev-no-db` script pointed at the deleted `server-no-db.js` | Description rewritten, `crypto` dropped (Node's built-in `crypto` resolves first regardless), scripts repointed | `npm test` added and passing; `npm start` now runs the keyless v2 server |

Still open:

| # | File | Defect | Impact |
| --- | --- | --- | --- |
| F5 | `src/market-data/providers/demo-provider.js` | Synthesises history for **any** symbol string, including nonsense, always labelled `source: demo` | An unknown symbol silently returns plausible candles; acceptable in demo mode but must be blocked before real use |
| F6 | `server.js:24` vs `server-v2.js:33` | Different defaults — v1 binds **3001**, v2 binds **3000** (this workspace runs v2 on 3001 via a `PORT` override) | They do **not** collide by default; the earlier draft of this report claimed both defaulted to 3001, which was wrong |

### 13.2 Structural limitations (design, not defects)

1. **Volatile trading state** — restarting the server discards positions, orders and journal trades (they re-seed deterministically).
2. **No LLM path exercised** — Ollama is absent, so `aiModel: rule-engine` on every response; the LLM branch is written but unverified.
3. **No auth on the intelligence/trading API** (S1) — the dominant production blocker.
4. **Legacy front door retained** — `index.html`, `login.html`, `pricing.html`, `payment-success.html` and `server.js` still exist for the auth/billing funnel. They no longer contain a competing application (all app links point at `terminal.html`), but they are a second code path a maintainer must know about.
5. **No order-book depth** — no configured provider supplies L2 data, so none is shown (rather than faked).
6. **Single-process in-memory design** — limits horizontal scaling (§11.3).
7. **Accessibility gaps** — no ARIA live regions, no modal focus trap, no contrast audit (§9).
8. **Stale metric:** package.json still describes the project as `"College project - Paper trading platform"` while the code is a much larger intelligence platform.

### 13.3 Verification gaps (things not proven here)

- The WebSocket stream is attached and reports stats, but push behaviour was not instrumented in the browser (HTTP polling covers the same need).
- Stripe/Razorpay flows were not executed (they need live keys); the legacy pages that drive them were only checked for HTTP 200.
- Sentiment/news features mentioned in earlier specs have no implementation; nothing in the UI claims them.

---

## 14. Engineering Practices Worth Calling Out In A Review

1. **Provenance as a first-class field.** Every market payload carries `source`, `quality`/`dataQuality`, and an `asOf` timestamp; the UI shows a provenance footer (`Source: demo · DEMO · 24/47 instruments rated`). Missing metrics are `null` → `—` / `DATA UNAVAILABLE`.
2. **One owner per piece of state.** Documented per module (§3.2); the sidebar, dock, portfolio view and chart position card all read `state.account`, which only `core/account.js` writes.
3. **Single-owner arithmetic.** `IndicatorEngine` owns indicators (scalars delegate to series); indicators therefore cannot disagree between the chart, the screener and the AI. Enforced by 16 parity tests.
4. **The LLM cannot invent numbers.** `POST /api/v2/ai/analyze` accepts a symbol only; the context is built server-side.
5. **Determinism as a testable property.** Demo history is a pure function of `(symbol, interval, barIndex)`; the journal seed is deterministic (identical hash across boots) so behavioural patterns demonstrated in the UI are reproducible.
6. **Tests that encode the contract, not the implementation** — empty input → `null` not `0`; short series → empty series, never zero-filled; a broken bar is skipped, not plotted.
7. **Honest refusals.** The broker refuses to fill without a live quote; the indicators endpoint labels its source; heatmap/indicators return 503 with a reason rather than an empty success.
8. **A run doc** (`.freebuff/run.md`) records how to reproduce the environment, the detach recipe, the port choice and the known gotchas.

---

## 15. Architecture Diagram (single page)

```
                            ┌──────────────────────────────┐
                            │        USER (browser)        │
                            └──────────────┬───────────────┘
                                           │
        ┌──────────────────────────────────▼──────────────────────────────────┐
        │ ProTrader Workspace (terminal.html)                                 │
        │ ┌──────────┬──────────────────────────────────┬───────────────────┐  │
        │ │ RAIL     │ CENTRE VIEW (15 views)           │ INTELLIGENCE      │  │
        │ │ 8 secs   │ dashboard · chart+ticket ·       │ AI · Tape ·       │  │
        │ │ watchlist│ markets · screener · heatmap ·  │ Alerts            │  │
        │ │ portfolio│ signals · strategies ·          │                   │  │
        │ │ holdings │ portfolio · regime · behaviour ·│                   │  │
        │ │ orders   │ risk · claims · reviews ·       │                   │  │
        │ │ alerts   │ journal · AI                     │                   │  │
        │ └──────────┴──────────────────────────────────┴───────────────────┘  │
        │ DOCK: open orders · order history · trade history · holdings ·         │
        │       analytics · P&L      TICKER · STATUS STRIP · PALETTE (Ctrl+K)    │
        └──────────────────────────────────┬──────────────────────────────────┘
                     fetch JSON             │            ▲ WebSocket quotes
        ┌──────────────────────────────────▼────────────┴──────────────────────┐
        │ Express  /api/v2 (41) · /api (39) · static                           │
        └──────────────────────────────────┬──────────────────────────────────┘
        ┌──────────────────────────────────▼──────────────────────────────────┐
        │ INTELLIGENCE LAYER — 25 engines                                      │
        │ context: regime · heatmap/breadth · tape                             │
        │ risk: pre-trade · heat · sizing · risk terminal                      │
        │ quality: signals(+conflict) · trade quality · execution              │
        │ reflection: journal · post-trade review · behaviour · guardrails ·    │
        │             trader profile · event bus · evidence                    │
        │ validation: backtest · sensitivity · walk-forward · matrix · claims  │
        │ AI: ai-context-builder → ai-copilot (Ollama or rule engine) →        │
        │     explainable payload                                              │
        └──────────────────────────────────┬──────────────────────────────────┘
        ┌──────────────────────────────────▼──────────────────────────────────┐
        │ MARKET-DATA GATEWAY  routing · health · rate-limit · TTL cache       │
        │ CoinGecko | TwelveData | Finnhub | AlphaVantage | DEMO (deterministic)│
        └──────────────────────────────────┬──────────────────────────────────┘
        ┌──────────────────────────────────▼──────────────────────────────────┐
        │ PERSISTENCE  MongoDB (users, payments) · in-memory Maps (hot path)    │
        └──────────────────────────────────────────────────────────────────────┘
```

---

## 16. Document Set

| File | Contents |
| --- | --- |
| `docs/01-ARCHITECTURE-AND-ENGINEERING-REPORT.md` | This document: overview, stack, architecture, features, algorithms, database, API architecture, UI/UX, security, performance, metrics, findings |
| `docs/02-API-REFERENCE.md` | Every endpoint: method, route, purpose, request, response, validation, business logic, data operations |
| `docs/03-INTERVIEW-AND-PRESENTATION-GUIDE.md` | 50 technical Q&A, viva/defence answers, resume / LinkedIn / hackathon narratives |
