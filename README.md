# 📈 ProTrader 2.0 — Institutional-Grade Paper Trading & Quantitative Platform

A production-ready, full-stack paper trading ecosystem and quantitative intelligence engine. Built with institutional trading workflows, real-time market data streaming, multi-regime risk gate guards, behavioral analytics, AI trade thesis generation, and seamless serverless cloud deployment.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20In--Memory-brightgreen)
![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-success)
![Deployment](https://img.shields.io/badge/Vercel-Ready-black)

---

## ✨ ProTrader 2.0 Highlights

- **📊 Unified Pro Trading Terminal (`terminal.html`)** - Interactive multi-timeframe charts, dynamic order book, trade execution dock, and real-time market tape.
- **🛡️ Pre-Trade Risk Engine & Guardrails** - Hard stop-loss checks, position limits, leverage bounding, and real-time capital protection.
- **🧠 Quantitative Intelligence Hub (v2)** - Technical indicator engine (RSI, MACD, Bollinger Bands, ATR, Supertrend), market regime detection, sentiment aggregation, and sector heatmaps.
- **🔐 Institutional Authentication Flow** - Professional email/password login with masked credentials, instant validation, dynamic feedback, and resilient database fallback.
- **💼 Paper Portfolio & Order Ledger** - Full transaction history, P&L calculation, excursion metrics (MAE/MFE), and execution quality analytics.
- **💳 Razorpay Payment & Premium Tier** - Built-in webhook handling and premium tier subscription management.
- **☁️ Zero-Config Serverless Deployment** - Native Vercel `@vercel/node` configuration with resilient in-memory database auto-failover.

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/aryan96-ui/trading-platform.clg.git
cd trading-platform.clg
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/trading-platform
JWT_SECRET=protrader_jwt_production_key_2025
JWT_EXPIRES_IN=7d
```

*(Note: If `MONGODB_URI` is omitted or temporarily unreachable, ProTrader 2.0 automatically boots in ultra-fast, zero-friction in-memory mode).*

### 3. Launch

```bash
npm start
```

Open your browser to:
- **Landing Page**: `http://localhost:3000/`
- **Login**: `http://localhost:3000/login.html`
- **Pro Terminal**: `http://localhost:3000/terminal.html`
- **Health Probe**: `http://localhost:3000/health`

---

## 🧪 Automated Test Suite

ProTrader 2.0 includes comprehensive unit, integration, and algorithmic test coverage:

```bash
# Run all Jest suites + quantitative engine tests (313 tests)
npm run test:all
```

- **Jest Suites**: `api.test.js`, `indicators.test.js`, `monteCarlo.test.js`, `pairsTrading.test.js`, `riskEngine.test.js` (23/23 passing)
- **Engine Tests**: 290 quantitative calculations, indicator series, and regime matrix tests (0 failures)

---

## 📁 Architecture Overview

```
trading-platform/
├── api/                    # Vercel serverless entrypoint
│   └── index.js
├── algorithms/             # Quantitative engines & risk models
│   ├── indicator-engine.js
│   ├── riskEngine.js
│   ├── monteCarlo.js
│   └── market-regime-engine.js
├── css/                    # Modular theme system & dark palettes
│   ├── terminal.css
│   ├── tokens.css
│   └── platform.css
├── js/                     # Component controllers & reactive state
│   ├── core/               # State, session, navigation, API client
│   ├── chart/              # Real-time charting
│   ├── orders/             # Order execution dock
│   └── views/              # Risk, screener, journal, behavior views
├── routes/                 # Express REST APIs
│   ├── auth.js             # Institutional JWT authentication
│   ├── marketRoutes.js     # Candles, prices, and news
│   ├── tradeRoutes.js      # Order routing & portfolio ledger
│   └── intelligence.js     # Quantitative v2 intelligence endpoints
├── src/                    # Test suites and service adapters
│   └── tests/
├── terminal.html           # Unified institutional trading terminal
├── login.html              # Secure institutional sign-in
├── server.js               # Super-server with MongoDB/In-Memory resilience
├── vercel.json             # Vercel serverless deployment specification
└── package.json            # ProTrader 2.0 metadata & scripts
```

---

## ☁️ Deploy to Vercel

ProTrader 2.0 is configured for immediate 1-click deployment on Vercel:

1. Import this repository in [Vercel](https://vercel.com/new).
2. Set `MONGODB_URI`, `JWT_SECRET`, and `JWT_EXPIRES_IN` in the environment settings.
3. Click **Deploy**.

For detailed instructions, refer to [DEPLOYMENT_GUIDE.md](file:///c:/Users/Happy/OneDrive/Desktop/trading-platform.clg/DEPLOYMENT_GUIDE.md).

---

## 📄 License

Licensed under the MIT License.
