// routes/exportRoutes.js - CSV & Report Generation Endpoints
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Trade = require('../models/Trade');
const { inMemoryUsers, authenticateToken } = require('../middlewares/auth');
const exportService = require('../services/exportService');
const marketDataService = require('../services/marketDataService');

// GET /api/portfolio/export - Download Portfolio as CSV
router.get('/portfolio/export', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email || req.query.email || 'demo@college.com';
        let user = null;

        if (mongoose.connection.readyState === 1) {
            user = await User.findOne({ email });
        } else {
            user = inMemoryUsers.get(email);
        }

        if (!user) {
            user = { email, balance: 100000, portfolio: {} };
        }

        const csvContent = exportService.generatePortfolioCSV(user, marketDataService.currentPrices);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="protrader_portfolio_${Date.now()}.csv"`);
        return res.send(csvContent);
    } catch (err) {
        console.error('Export Error:', err);
        return res.status(500).send('Export failed');
    }
});

// GET /api/history/export - Download Trade History as CSV
router.get('/history/export', authenticateToken, async (req, res) => {
    try {
        const email = req.user?.email || req.query.email || 'demo@college.com';
        let trades = [];

        if (mongoose.connection.readyState === 1) {
            trades = await Trade.find({ userId: email }).sort({ timestamp: -1 });
        }

        const csvContent = exportService.generateTradesCSV(trades, email);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="protrader_trades_${Date.now()}.csv"`);
        return res.send(csvContent);
    } catch (err) {
        return res.status(500).send('Export failed');
    }
});

module.exports = router;
