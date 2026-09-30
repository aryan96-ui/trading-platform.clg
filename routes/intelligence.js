// routes/intelligence.js - Unified Intelligence & Quantitative API Layer
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const { requirePremium, inMemoryUsers } = require('../middlewares/auth');

const createMarketRoutes = require('../src/api/market-routes');
const createEngineRoutes = require('../src/api/engine-routes');
const createIntelligenceRoutes = require('../src/api/intelligence-routes');
const createIntelligenceV2Routes = require('../src/api/intelligence-v2-routes');
const { createTradingRoutes } = require('../src/api/trading-routes');

module.exports = function buildIntelligenceRouter(services) {
    const {
        gateway, instrumentMaster, marketStream,
        screener, heatmap, regime, tradeQuality, riskTerminal, tape,
        journal, behavioral, aiCopilot, strategyLab, aiContextBuilder,
        trading, eventBus, signalRanking, signalConflict,
        preTradeRisk, portfolioHeat, positionSizing, thesisService,
        postTradeLearning, executionQuality, guardrails,
        traderProfile, strategyMatrix, backtestEngine, claimVerification
    } = services;

    const v2Router = express.Router();

    // ── DATA FLOW BRIDGE: Inject User Portfolio into Context & Risk Engines ──
    // Ensures intelligence layer accesses actual user holdings from Business Layer (MongoDB / in-memory)
    v2Router.use(async (req, res, next) => {
        const email = req.user?.email || req.headers['x-user-email'] || req.query.email || req.body?.email;
        if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            let portfolio = {};
            let balance = 100000;

            if (mongoose.connection.readyState === 1) {
                try {
                    const dbUser = await User.findOne({ email: normalizedEmail }).select('portfolio balance');
                    if (dbUser) {
                        portfolio = dbUser.portfolio || {};
                        balance = dbUser.balance || 100000;
                    }
                } catch (e) {}
            }
            if (Object.keys(portfolio).length === 0 && inMemoryUsers.has(normalizedEmail)) {
                const mem = inMemoryUsers.get(normalizedEmail);
                if (mem) {
                    portfolio = mem.portfolio || {};
                    balance = mem.balance || 100000;
                }
            }

            req.userPortfolio = portfolio;
            req.userBalance = balance;
        }
        next();
    });

    // ── PREMIUM WALL GATE FOR AI ROUTES ──────────────────────────────
    // Block all /ai/* endpoints if user is not premium
    v2Router.use(['/ai', '/ai/*'], requirePremium);

    // ── MOUNT V2 SUB-ROUTERS ─────────────────────────────────────────
    // 1. Market Data
    v2Router.use(createMarketRoutes(gateway, instrumentMaster, marketStream));

    // 2. Paper Trading (accounts, orders, fills, positions, P&L)
    v2Router.use(createTradingRoutes({ trading }));

    // 3. Analytics Engines (screener, heatmap, regime, trade quality, risk, tape)
    v2Router.use(createEngineRoutes({
        screener,
        heatmap,
        regime,
        tradeQuality,
        riskTerminal,
        tape
    }));

    // 4. Intelligence API (journal, behavioral, AI copilot, strategy lab)
    v2Router.use(createIntelligenceRoutes({
        journal,
        behavioral,
        aiCopilot,
        strategyLab,
        aiContextBuilder
    }));

    // 5. Intelligence V2 Layer (signals, claims, thesis, execution, guardrails, profile, backtest)
    const intelV2 = createIntelligenceV2Routes({
        eventBus,
        signalRanking,
        signalConflict,
        preTradeRisk,
        portfolioHeat,
        positionSizing,
        thesisService,
        postTradeLearning,
        executionQuality,
        guardrails,
        traderProfile,
        strategyMatrix,
        backtestEngine,
        claimVerification,
        regimeEngine: regime,
        journal,
        behavioral,
        aiCopilot
    });

    // Mount Intel V2 with AI endpoints gated by requirePremium
    intelV2.use('/ai/analyze-trade', requirePremium);

    return { v2Router, intelV2 };
};
