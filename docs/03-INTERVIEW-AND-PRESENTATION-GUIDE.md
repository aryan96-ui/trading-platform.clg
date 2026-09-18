# ProTrader — Interview, Viva & Presentation Guide

Everything needed to **defend** this project in a viva, present it in a hackathon, or answer interview questions about it. Every answer is grounded in code that exists in this repository.

**The three sentences that win the room:**

1. "It is a market-data gateway plus a decision-intelligence layer, and the LLM is never allowed to originate a financial number — the backend computes, the AI interprets."
2. "It separates decision quality from outcome quality: a losing trade that followed the plan is classified as a *good trade with a bad result*, which is the opposite of how P&L-based journals work."
3. "Every number on screen carries its provenance — source, quality and timestamp — and when a metric is unavailable it renders DATA UNAVAILABLE rather than a plausible estimate."

---

## Part A — Executive Summary (say this first)

ProTrader is a Node.js/Express platform with a single-page browser workspace that unifies market analysis and paper trading. Two subsystems:

- **A market-data and paper-trading platform** — a provider-agnostic gateway over 76 instruments (48 stocks, 10 crypto, 7 forex, 11 indices) with health-aware failover, per-asset-class routing and TTL caching, a WebSocket quote stream, a deterministic demo provider, and a simulated broker with orders, fills, positions, commission accounting and mark-to-market P&L.
- **A decision-intelligence layer** — 25 engines across five concerns: *context* (regime, heatmap/breadth, tape), *risk* (pre-trade check, portfolio heat, position sizing, stress), *quality* (signal ranking, signal conflict, trade quality, execution analysis), *reflection* (journal, post-trade review, behavioural analytics, guardrails, trader profile, event bus), and *validation* (backtest, sensitivity, walk-forward, strategy × regime matrix, claim verification).

**Scale:** 94 hand-written source files, ≈21,000 lines (excluding `node_modules`), 106 HTTP endpoints, 25 engine modules, 76 instruments, 371 automated test assertions, 15 UI views in one page. A waste-removal pass deleted 15 superseded files (2,412 lines of duplicate dashboard JS among them) and fixed five audit defects.

**The engineering rule that shapes everything:** the platform never fabricates a number. Indicators, statistics, exposure, risk, regime, behavioural metrics and signal scores are all computed server-side from candles the gateway returned. The AI receives structured context and interprets it; with Ollama absent it degrades to a deterministic rule engine and reports `aiModel: rule-engine`.

---

## Part B — Resume Project Description

> **ProTrader — AI-Driven Trading & Transaction Analytics Platform** | Node.js · Express · MongoDB · WebSocket · Vanilla JS · Lightweight Charts
>
> Built a market-data and decision-intelligence platform for retail traders (≈21,000 LOC, 106 REST endpoints, 25 engine modules, 371 tests).
> - Designed a **multi-provider market-data gateway** with health tracking, rate limiting, TTL caching and **asset-class-aware routing**, cutting cold stock-request latency from ~700 ms to 3–28 ms by preventing a crypto-only provider from ever being queried for an equity.
> - Implemented a **server-authoritative indicator engine** (EMA, Wilder RSI/ATR/ADX, MACD, Bollinger, Stochastic) as single-pass O(n) series, with scalars delegating to the series so a chart line, a screener filter and an AI evidence panel can never disagree.
> - Built a **simulated broker** with market/limit orders, partial exits, protective stops, commission accounting and a full audit trail, wired to a pre-trade risk engine and configurable behavioural guardrails with an audited override flow.
> - Developed **11 analytics engines**: market-regime classification, signal ranking with 7-factor score breakdown, signal-conflict detection, trade-quality grading, execution-timing analysis, post-trade review with R-multiples and **real MFE/MAE from bars**, behavioural pattern detection (6 observable detectors), strategy × regime matrix, and claim verification.
> - Enforced **provenance discipline** end-to-end: every payload carries source/quality/asOf and unavailable metrics return `null`, rendered as DATA UNAVAILABLE.

---

## Part C — LinkedIn Project Description

> **ProTrader: a trading platform that scores decisions, not just P&L** 📈
>
> Most retail trading tools optimise for chart features and execution speed. I built the opposite: a platform whose product is *decision quality*.
>
> The architecture has one unusual rule — **the LLM is never allowed to originate a financial number.** The backend computes every indicator, statistic, exposure figure, risk score and behavioural metric; the AI layer receives that structured context and only interprets it. When the model is unavailable, the system degrades to a deterministic rule engine and says so. When a metric genuinely can't be computed, it renders "DATA UNAVAILABLE" instead of a plausible-looking estimate.
>
> What it does:
> 📊 Provider-agnostic market-data gateway — 76 instruments across equities, crypto, forex and indices, with health-aware failover and asset-class routing that removed a ~700 ms stall on cold stock requests
> 🔍 Server-authoritative indicators — a chart line, a screener filter and an AI evidence panel all read the same arithmetic
> 🧠 25 decision engines — market regime, pre-trade risk, portfolio heat, dynamic position sizing, signal ranking with a 7-factor breakdown, post-trade review with R-multiples and real MFE/MAE, strategy × regime matrix, backtest + walk-forward validation, and finfluencer claim verification
> 🛡 Behavioural guardrails that insert friction at the moment of the next bad decision — position escalation after losses, revenge trading, stop-movement, loss-holding — all from *observable* behaviour, with a full override audit trail
> ⚡ 106 REST endpoints · 371 tests · 15 views in one workspace
>
> The most interesting design decision: **a losing trade that followed the plan is classified as a good trade with a bad result.** Profit is a result; a good decision is a process. Separating them is the whole point.

---

## Part D — Hackathon Pitch (60 seconds)

> **The problem.** Retail traders have better charts than ever and still lose money for the same three reasons: they take trades that violate their own rules, they can't see their recurring behavioural patterns, and they can't tell whether a strategy works in *today's* market.
>
> **What we built.** ProTrader — one workspace that takes a trader from *data → context → analysis → risk check → thesis → trade → monitor → review → learn*.
>
> **Three things make it different.**
>
> One: **the AI never invents a number.** The backend computes every indicator, exposure figure, risk score and behavioural metric. The language model receives verified structured context and interprets it. If the model is down, a rule engine answers and labels itself. If a metric doesn't exist, the UI says DATA UNAVAILABLE.
>
> Two: **it scores decisions, not outcomes.** Every completed trade is automatically reviewed, and classified as a good or bad trade independently of whether it made money. A losing trade that followed the plan is a *good trade with a bad result*.
>
> Three: **guardrails with friction, not warnings.** Lose four trades in a row and the platform doesn't show a red badge — it asks you to justify the next trade before you place it, and logs the override against the eventual outcome.
>
> **Demo line:** buy INFY, watch it flow to holdings, close it, and see the review, the behavioural update and the strategy × regime matrix change in front of you.
>
> **Traction/scale:** 25,000 lines, 106 endpoints, 25 engines, 371 tests, zero console errors across 15 live views.

---

## Part E — 50 Technical Interview Questions & Answers

### Architecture

**1. Describe the architecture in one sentence.**
A four-layer system — single-page browser workspace → Express API → 25 domain engines behind a market-data gateway → Mongo for durable records and in-memory Maps for the real-time hot path.

**2. Why not a framework like React?**
No build step means the whole artefact is auditable end-to-end, which matters for a system whose core claim is "every number is traceable". The cost is manual DOM management, which I contained by giving each view one render function and one data owner. With a larger team I would move to a component framework.

**3. What is the single most important architectural rule?**
Server-authoritative facts. Indicators, statistics, exposure, risk, regime, trade metrics, behavioural metrics and signal scores are all computed server-side; the LLM only interprets, and the client never computes an indicator.

**4. How does the client know which data is trustworthy?**
Every market payload carries `source`, `quality` (REALTIME/DELAYED/DEMO/UNAVAILABLE) and `asOf`. The screener and heatmap render a provenance badge; missing metrics are `null` and render as `—` or DATA UNAVAILABLE.

**5. Where does state live?**
Server: paper-trading books, journal, guardrail logs, caches. Client: `js/core/state.js` is the only store, `js/core/account.js` is the only writer of account state, and `js/core/nav.js` owns view routing.

**6. What happens if a data provider goes down?**
The gateway tracks provider health and rate-limit state, and selection is `supports(assetType) && healthy && withinRateLimit` in priority order. If everything fails, the demo provider answers and the payload is labelled `source: demo` — degraded, never fake.

**7. Why is the demo provider deterministic?**
History is a pure function of `(symbol, interval, barIndex)`. Two features that ask for the same series get identical candles, a shorter request is a suffix of a longer one, and behaviour demonstrated in tests is reproducible.

**8. What did asset-class routing actually fix?**
A crypto-only provider (CoinGecko, priority 2) was tried first for *every* stock request, and its health timer auto-reset every 30 s — so the first stock request each minute paid a ~650–800 ms doomed round trip. Routing stocks/forex/indices away from it brought cold requests to 3–28 ms.

**9. How do you avoid a chart disagreeing with a screener?**
One indicator implementation (`IndicatorEngine`), with scalar functions delegating to the series functions, so both surfaces obtain the same arithmetic. Enforced by 16 parity tests. Additionally, the quote cache is keyed by symbol only, because every symbol maps to exactly one exchange — that fixed a bug where consumers read different cache slots for the same instrument.

**10. How is the system extended with a new engine?**
Add the module under `src/engine/`, expose a route in the relevant `src/api/*-routes.js`, add a client view or section, add tests. Engines are pure functions over inputs wherever possible, which is what makes them testable without a server.

### Frontend / UI-UX

**11. Why one page instead of separate dashboard and terminal pages?**
The user's complaint: analysis and execution lived in different pages, so every insight cost a context switch. Merging them means the chart, the risk check, the order ticket and the P&L sit in one grid, and a trade's context never leaves the screen.

**12. How is the layout structured?**
A CSS grid: 52 px topbar, elastic body (rail | centre view | intelligence column), a resizer, the bottom dock, a 30 px ticker and a 26 px status strip. Nested panels use flex with `min-height:0` so inner scrollers work instead of growing the page.

**13. What did the malformed HTML actually break, and why does it matter?**
The right column, the workspace and the body-row were never closed, so the dock, the order ticket host and the ticker were parsed *inside* the intelligence panel. Unclosed tags don't just look wrong — they silently relocate unrelated UI into the wrong container. Fixed by a corrected shell and verified by DOM inspection.

**14. How do you keep 15 views performant?**
Each view renders once into its own container with incremental DOM writes; large row sets use `<table>` with sticky headers; scrollers are fixed-height with `overflow:auto`; the chart is a single LightweightCharts instance destroyed on view switch; and polling is split per surface (quotes 5 s, tape 4 s, account 15 s) so a tick repaints only the cells that changed.

**15. How did you handle the "features aren't showing" class of bug?**
Root cause was four independent defects: malformed shell HTML, `app.js` overwriting the nav registry with an outdated views map, nav targets (`renderPortfolio`, `renderMarkets`, `renderDock`, `dockTab`) referenced but never implemented, and the alerts feed calling `POST /api/signals/ranked` without the required `signals[]` array so it 400'd forever. Fixing only one would have left the others invisible.

**16. Anything you would do differently in the frontend?**
Introduce a tiny render helper (a virtual-DOM-lite diff, or web components) so re-rendering a list doesn't rebuild its DOM, and move the drawing tools out of `state` into an actual implementation or delete the state.

**17. Accessibility status?**
Honest: keyboard navigation exists (Ctrl+K palette, Ctrl+/ shortcuts, 1–9 view jumps), focus states are styled, and colour is never the only signal (arrows/labels accompany red/green). ARIA live regions, a palette focus trap and a contrast audit remain to be done.

### Backend / API

**18. Why Express rather than Fastify/Nest?**
The surface is ~106 small routes over pure engines; Express adds the least ceremony and is the most widely understood by reviewers. Nest's DI would not pay for itself here.

**19. How is input validated?**
Explicitly at the route edge — a missing required field returns 400 with a described reason (`candles and strategy required`) before any engine runs. Verified by deliberately malformed requests: 6 endpoints returned 400, and 200 to the documented contract.

**20. Why does `POST /api/strategies/backtest` require candles?**
So the server can never invent a price series for a validation run. The client fetches candles from the same `/history` endpoint the chart uses, which also means a backtest is reproducible and auditable.

**21. Why is `POST /api/v2/ai/analyze` symbol-only?**
To make hallucination structurally impossible for numbers: the client cannot inject values, and the context is built from the same server-side sources as everything else.

**22. How does the API behave when an engine fails?**
It returns 503 with a reason (heatmap, indicators) rather than an empty success — the UI shows an honest unavailable state instead of a blank panel that looks like zero.

**23. What is the response envelope and why?**
`{ success, data, meta }` on success, `{ success, error }` on failure. A single shape means every client helper has one unwrapping path, and `meta` carries count/source/provenance without polluting `data`.

**24. Any route-contract mismatch class of bug left?**
Yes, one that was structural: `/api/v2/heatmap` is a GET that read `req.body`, so it always received `{}` and the engine generated prices with `Math.random()`. Two identical calls returned 16 vs 25 advancers. Fixed by making the engine own its quote fetch and taking no body.

**25. How are trades journaled atomically?**
`PaperTradingService.closePosition` computes realised P&L, mutates the position, then calls `journal.closeTrade` with the computed values, then emits `TRADE_CLOSED` on the event bus. Partial exits were added so the journal records a realised tranche without destroying the open position.

### Data & Algorithms

**26. Which technical indicators did you implement and why Wilder smoothing?**
EMA, Wilder RSI, Wilder ATR, Wilder ADX, MACD, Bollinger Bands and Stochastic %K. Wilder smoothing (`avg = (prev·(p−1) + x)/p`) is the published definition for RSI/ATR/ADX, so values match standard platforms rather than an approximation.

**27. What is an R-multiple and why is it the primary trade metric?**
`realisedP&L / initialRisk`, where `initialRisk = |entry − stop| × quantity`. It normalises every trade by the risk actually taken, so a 1R win on a small position and a 1R win on a large one are comparable — the only honest way to build expectancy from a mixed history.

**28. How do you compute MAE and MFE correctly?**
Maximum Adverse/Favourable Excursion is the extreme adverse/favourable price move *while the position was open*, taken from the actual bars between entry and exit timestamps (`src/trading/excursions.js`). It previously came from a random walk, which made excursion-based analysis meaningless.

**29. Complexity of your indicators?**
EMA/RSI/ATR/ADX/MACD are single-pass O(n). SMA and Bollinger are O(n·p) with the periodic window; Stochastic is O(n·p). Series form matters because the backtest engine runs hundreds of windows — scalar-per-bar recomputation would be O(n²).

**30. How do you classify a trade as good or bad?**
A 2×2 cross of *process* (did it follow the stated strategy? was risk acceptable? was the stop honoured?) and *result* (P&L sign): GOOD/BAD TRADE × GOOD/BAD RESULT. A losing trade that followed the plan is a *good trade with a bad result*. Verified live: the seeded journal's first trade returns `classification: "GOOD TRADE / BAD RESULT"` with `decision.score 60`, `entryQuality WEAK (35)`, `riskQuality GOOD (70)` — and `relative.available: false` with the message *"Insufficient data to evaluate relative performance"* rather than a fabricated comparison.

**31. Market-regime classification — how?**
A rule-ordered classifier over measurable inputs — ATR percentile, ADX, moving-average structure, price dispersion, index trend, breadth, volume — emitting `{ regime, sub, confidence, evidence[] }`. Confidence reflects how many independent indicators agree, and the evidence list is displayed, so a classification is always inspectable rather than asserted.

**32. How does signal ranking work?**
`qualityScore = Σ wᵢ·scoreᵢ` over seven normalised factors (freshness, volume confirmation, regime compatibility, strategy match, liquidity, risk, relevance), each returned individually so the UI can show a per-factor breakdown, with tiers by composite threshold.

**33. How do you detect signal conflict?**
Compare directionally signed factors (price, volume, RSI, sector, market) and report the lean plus a conflict flag; unavailable factors are marked unavailable rather than counted as neutral.

**34. How does behavioural detection avoid pseudo-psychology?**
It only measures observable sequences: position-size delta after a loss, trade frequency versus the trader's own baseline, time-to-next-trade after a loss streak, stop-movement counts (`stopHistory`), holding-time asymmetry between winners and losers. The payload carries `observableOnly: true` and the copy never diagnoses a condition.

**35. Position sizing formula?**
Fixed-fractional: `riskBudget = equity × riskPerTrade`, `baseQty = riskBudget / |entry − stop|`, then documented multipliers for volatility, regime, existing exposure and correlation, capped by exposure limits. Every multiplier is returned with its reason so the number is explainable.

**36. How do you prevent look-ahead bias in backtests?**
Signals are computed on bar *i* and executed at bar *i+1*'s open; splits are strictly chronological (train/validation/out-of-sample, no shuffle); and costs are charged per side (10 bps commission + 5 bps slippage).

**37. What is walk-forward testing and how did you implement it?**
Rolling windows: train on `windowSize` bars, test on the next `stepSize`, advance, repeat, then aggregate out-of-sample trades. This exposes parameter overfitting that a single backtest hides. Implemented in `backtest-engine.js` with the window sizes shown in the UI.

**38. Concentration metric?**
Herfindahl–Hirschman Index: `Σ wᵢ²` where `wᵢ` is a position's share of gross exposure → `<0.25` LOW, `0.25–0.5` MODERATE, `>0.5` HIGH.

**39. Why did the strategy lab produce empty out-of-sample columns?**
Walk-forward windows were sized (100 train / 25 test) shorter than the round-trips a strategy needed once indicators were warm-up-limited, so no window contained a complete trade. Sized to the bars the feed actually serves (150/50) and the column filled.

**40. How is claim verification different from a chatbot's opinion?**
It extracts machine-checkable claim types (price move, overbought/oversold, volume anomaly, trend, institutional flow), maps each to a data requirement, compares against observed values, and returns SUPPORTED / PARTIALLY SUPPORTED / NOT SUPPORTED / INSUFFICIENT DATA with per-claim evidence and a source. It never asserts fraud or intent.

### Database

**41. Why hybrid MongoDB plus in-memory?**
Two workloads: durable low-volume records (users, payments) need a database; the real-time read-heavy hot path (quotes, candles, positions, journal) needs sub-millisecond reads and tolerates loss because it is paper trading. A database round trip on every quote read would dominate latency.

**42. What is the schema?**
Mongoose `User` (email unique, balance, portfolio, isPremium, tierLevel) — defined inline in `server.js` — and `Payment` (userId, paymentId, orderId, amount, status, date). Payments reference users by email as a **logical** foreign key only.

**43. Any modelling defect?**
Yes, and it is now fixed. `models/User.js` duplicated the inline `User` schema in `server.js:43` — two competing `mongoose.model('User')` definitions, where loading both would throw `OverwriteModelError`. I deleted the orphan so `server.js` is the single owner of the schema.

**44. Indexes?**
Only the implicit unique index on `email`. There are no compound or TTL indexes; a production version would index `Payment.userId` and `Payment.status` and add TTL expiry to short-lived caches.

**45. What is volatile, and is that acceptable?**
Positions, orders, fills, journal trades, tape and guardrail logs are in-memory and re-seed on boot. Acceptable for a paper-trading prototype because the seed is deterministic, so demonstrated behaviour is reproducible — but it must move to Mongo/Redis before any real use.

### Security

**46. What are the security gaps?**
Stated plainly: **no authentication or authorisation on the v2 API** (any caller can act for any account by changing the email), **plaintext passwords**, **hardcoded demo credentials**, **no session/token mechanism**, **wide-open CORS**, **no rate limiting**, **no security headers**, and payment webhooks that trust client-supplied order IDs.

**47. What is the remediation order?**
(1) Real sessions — short-lived JWT or signed HTTP-only cookie — and derive identity from the token, replacing `/account/:email` with `/account/me`; (2) bcrypt/argon2 password hashing; (3) CORS allow-list plus helmet/CSP; (4) rate limiting on login, payment and AI routes; (5) server-side payment signature verification with idempotent settlement; (6) generic client error text; (7) ownership checks on every trading route.

**48. Any injection surface?**
Database access uses Mongoose query builders rather than concatenated strings, and client-side interpolation of provider-derived strings passes through `escapeHtml()`. The real risk here is authorisation, not injection.

**49. Does the LLM create a prompt-injection or data-leak risk?**
The context is server-built from structured fields (numbers and short labels), not user-generated free text, and the AI endpoint accepts only a symbol — so there is little surface for injection. The remaining risk is the upstream provider seeing portfolio context, which should be documented as a data-sharing decision.

**50. Which single fix would most raise the production-readiness score?**
Authentication with server-derived identity. It is the gate that turns every other control from "present" into "enforceable", and it is the reason the honest score is 4/10 rather than 7/10.

---

## Part F — Viva / Project Defence

**Q: What problem does this solve that existing platforms don't?**
Existing retail tools optimise for chart features and execution speed. ProTrader's product is decision quality: pre-trade risk against *your own* portfolio and rules, post-trade review that separates process from outcome, observable behavioural detection, and strategy validation per market regime.

**Q: Is the AI making trading decisions?**
No. The backend computes every fact; the AI interprets structured, verified context. It produces evidence, risks, counterarguments and a disclaimer — never an instruction like "buy this".

**Q: How do you know your data isn't fake?**
Three mechanisms: every payload carries `source`/`quality`/`asOf` and the UI displays it; the demo provider is deterministic and labelled, so it can't masquerade as live; and features that previously invented data were removed — the screener's `Math.random()` technicals, the client-side AI indicators and the dashboard's third synthetic series are gone, replaced by the shared gateway path.

**Q: What was your hardest bug?**
The heatmap. It was a GET reading `req.body` so it always received `{}`, and the engine filled the gap with `Math.random()`. The symptom looked like a UI problem (breadth flipping on every page visit), and it took tracing the route → engine → provider chain to find a contract mismatch two layers away from the visible defect.

**Q: What would you build next?**
Real authentication and durable storage, then the drawing-tools layer that the state currently implies but doesn't implement, then a persisted regime history so the strategy × regime matrix can be computed from market history rather than only the user's own trades.

**Q: What are you least happy with?**
The security posture: no auth on the v2 API, plaintext passwords, open CORS. I removed the structural waste (three duplicate dashboards, 2,412 lines of dead client JS, two static shells, an orphaned model, a superseded server) but did not build authentication — deliberately, because it is an architectural change that touches every route, and I would rather leave it explicitly undone than half-done.

**Q: If you had two more weeks?**
Auth + hashed passwords + CORS lockdown (1 week), migrate paper books and journal to Mongo with a repository layer (3 days), then a render-diffing layer and accessibility pass (4 days).

---

## Part G — Metrics Cheat-Sheet

| Metric | Value |
| --- | --- |
| Hand-written source files | 109 |
| Lines of code (excl. `node_modules`) | ≈21,000 |
| Server-side JS | ≈13,550 |
| Client JS | ≈3,774 (all of it the unified workspace) |
| Engine modules | 25 |
| HTTP endpoints | 106 (87 v2 + 19 v1) |
| Instruments | 76 (48 stocks, 10 crypto, 7 forex, 11 indices) |
| Data providers | 5 |
| MongoDB models | 2 (inline `User` + `Payment`) |
| UI views (one page) | 15 |
| Dashboard widgets | 9 |
| Dock tabs | 6 |
| Tests | 371 assertions / 6 suites |
| Endpoints exercised live | ~55 |
| Console errors in a full 15-view pass | 0 |
| Cold stock request | 3–28 ms (was 650–800 ms) |
| Production readiness | 4/10 (blocked by auth/security gaps) |
