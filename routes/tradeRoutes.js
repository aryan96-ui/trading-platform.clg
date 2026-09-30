// routes/tradeRoutes.js - Order Execution, Portfolio & History Engine
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Trade = require('../models/Trade');
const { inMemoryUsers, authenticateToken } = require('../middlewares/auth');
const { tradeLimiter } = require('../middlewares/rateLimiter');
const marketDataService = require('../services/marketDataService');
const webSocketService = require('../services/webSocketService');
const { validateToken } = require('../services/riskGateService');

// In-memory trade ledger fallback
const inMemoryTradeLedger = new Map();

// Helper to get user record
async function getUserRecord(email) {
    if (mongoose.connection.readyState === 1) {
        return await User.findOne({ email });
    }
    return inMemoryUsers.get(email) || null;
}

// POST /api/trade - Execute Buy / Sell Order
router.post('/trade', tradeLimiter, authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email || req.body.email;
        const { symbol, type, quantity, assetType = 'stocks', orderType = 'MARKET', riskGateToken } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'User session or email required' });
        }
        if (!symbol || !type || !quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Valid symbol, order type, and positive quantity required' });
        }

        // ── Risk Gate Enforcement ──────────────────────────────────────────────
        // Every trade must be pre-authorized by a valid Risk Gate token issued
        // by POST /api/analyze-thesis. Tokens expire in 10 minutes and are
        // single-use (consumed on first valid trade).
        const gateCheck = validateToken(riskGateToken, email, symbol);
        if (!gateCheck.valid) {
            return res.status(403).json({
                success: false,
                riskGateFailed: true,
                message: `🔒 Risk Gate: ${gateCheck.reason}`
            });
        }

        const sym = symbol.toUpperCase();
        const action = type.toUpperCase();
        const numQty = parseFloat(quantity);

        // Get current live execution price
        const currentPrice = marketDataService.getAssetPrice(sym);
        if (!currentPrice) {
            return res.status(400).json({ success: false, message: `Invalid or untradable symbol: ${sym}` });
        }

        const totalOrderValue = numQty * currentPrice;

        // Retrieve User
        let user = null;
        let isMongo = (mongoose.connection.readyState === 1);

        if (isMongo) {
            user = await User.findOne({ email });
        } else {
            user = inMemoryUsers.get(email);
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User account not found' });
        }

        if (!user.portfolio) user.portfolio = {};
        if (!user.portfolio[sym]) {
            user.portfolio[sym] = { quantity: 0, avgPrice: 0, assetType };
        }

        const holding = user.portfolio[sym];
        let realizedPnl = 0;

        if (action === 'BUY') {
            if (totalOrderValue > user.balance) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient balance (Required: ₹${totalOrderValue.toFixed(2)}, Available: ₹${user.balance.toFixed(2)})`
                });
            }

            const newTotalQty = holding.quantity + numQty;
            const newTotalInvested = (holding.avgPrice * holding.quantity) + totalOrderValue;
            holding.avgPrice = Number((newTotalInvested / newTotalQty).toFixed(2));
            holding.quantity = newTotalQty;
            holding.assetType = assetType;
            user.balance = Number((user.balance - totalOrderValue).toFixed(2));
        } else if (action === 'SELL') {
            if (holding.quantity < numQty) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient holdings (Owned: ${holding.quantity}, Requested: ${numQty})`
                });
            }

            realizedPnl = Number(((currentPrice - holding.avgPrice) * numQty).toFixed(2));
            holding.quantity -= numQty;
            user.balance = Number((user.balance + totalOrderValue).toFixed(2));

            if (holding.quantity <= 0) {
                delete user.portfolio[sym];
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid order action (BUY or SELL)' });
        }

        // Save User State
        if (isMongo) {
            user.markModified('portfolio');
            await user.save();
        } else {
            inMemoryUsers.set(email, user);
        }

        // Record Execution in Audit Ledger
        const tradeRecord = {
            id: 'TX_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            userId: email,
            symbol: sym,
            type: action,
            assetType,
            quantity: numQty,
            price: currentPrice,
            totalAmount: totalOrderValue,
            orderType,
            pnl: realizedPnl,
            timestamp: new Date().toISOString()
        };

        if (isMongo) {
            try {
                await Trade.create(tradeRecord);
            } catch (e) {
                console.error('Trade save to Mongo error:', e.message);
            }
        }

        // Save in memory ledger
        if (!inMemoryTradeLedger.has(email)) {
            inMemoryTradeLedger.set(email, []);
        }
        inMemoryTradeLedger.get(email).unshift(tradeRecord);

        // Broadcast Trade Event via WebSocket
        webSocketService.broadcastTrade(tradeRecord);

        return res.json({
            success: true,
            message: `Successfully executed ${action} ${numQty} ${sym} at ₹${currentPrice.toFixed(2)}`,
            trade: tradeRecord,
            newBalance: user.balance,
            portfolio: user.portfolio
        });
    } catch (err) {
        console.error('Trading Engine Error:', err);
        return res.status(500).json({ success: false, message: 'Execution error: ' + err.message });
    }
});

// GET /api/portfolio or /api/portfolio/:email
router.get(['/portfolio', '/portfolio/:email'], authenticateToken, async (req, res) => {
    try {
        const email = req.params.email || req.user?.email || req.query.email;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email required' });
        }

        let user = null;
        if (mongoose.connection.readyState === 1) {
            user = await User.findOne({ email });
        } else {
            user = inMemoryUsers.get(email);
        }

        if (!user) {
            return res.json({ success: true, balance: 100000, portfolio: {}, totalValuation: 100000, unrealizedPnl: 0 });
        }

        const portfolio = user.portfolio || {};
        let holdingsValuation = 0;
        let totalInvested = 0;

        const enrichedPortfolio = {};
        for (const [sym, pos] of Object.entries(portfolio)) {
            if (pos.quantity <= 0) continue;
            const livePrice = marketDataService.getAssetPrice(sym) || pos.avgPrice;
            const currentVal = pos.quantity * livePrice;
            const investedVal = pos.quantity * pos.avgPrice;
            const pnl = currentVal - investedVal;
            const pnlPct = investedVal > 0 ? (pnl / investedVal) * 100 : 0;

            holdingsValuation += currentVal;
            totalInvested += investedVal;

            enrichedPortfolio[sym] = {
                ...pos,
                currentPrice: livePrice,
                investedValue: Number(investedVal.toFixed(2)),
                currentValue: Number(currentVal.toFixed(2)),
                unrealizedPnl: Number(pnl.toFixed(2)),
                unrealizedPnlPercent: Number(pnlPct.toFixed(2))
            };
        }

        const totalValuation = Number(((user.balance || 0) + holdingsValuation).toFixed(2));
        const totalPnl = Number((holdingsValuation - totalInvested).toFixed(2));

        return res.json({
            success: true,
            email,
            balance: user.balance,
            holdingsValuation: Number(holdingsValuation.toFixed(2)),
            totalValuation,
            unrealizedPnl: totalPnl,
            portfolio: enrichedPortfolio
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/history or /api/history/:email
router.get(['/history', '/history/:email'], authenticateToken, async (req, res) => {
    try {
        const email = req.params.email || req.user?.email || req.query.email;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email required' });
        }

        let trades = [];
        if (mongoose.connection.readyState === 1) {
            trades = await Trade.find({ userId: email }).sort({ timestamp: -1 }).limit(100);
        }

        if (trades.length === 0) {
            trades = inMemoryTradeLedger.get(email) || [];
        }

        return res.json({ success: true, count: trades.length, history: trades });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/payment - Add demo funds
router.post('/payment', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email || req.body.email;
        const amount = parseFloat(req.body.amount);

        if (!email || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid email and positive deposit amount required' });
        }

        let user = null;
        if (mongoose.connection.readyState === 1) {
            user = await User.findOne({ email });
            if (user) {
                user.balance = Number((user.balance + amount).toFixed(2));
                await user.save();
            }
        } else {
            user = inMemoryUsers.get(email);
            if (user) {
                user.balance = Number((user.balance + amount).toFixed(2));
                inMemoryUsers.set(email, user);
            }
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.json({
            success: true,
            message: `Successfully deposited ₹${amount.toLocaleString()} into trading wallet.`,
            newBalance: user.balance
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
