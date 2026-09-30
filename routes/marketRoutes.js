// routes/marketRoutes.js - Market Data & Candlestick Endpoints
const express = require('express');
const router = express.Router();
const marketDataService = require('../services/marketDataService');
const newsService = require('../services/newsService');

// GET /api/market-data - Complete multi-asset market data
router.get('/market-data', async (req, res) => {
    try {
        const data = await marketDataService.getAllMarketData();
        res.json(data);
    } catch (err) {
        console.error('Market Data API Error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch market data' });
    }
});

// GET /api/candles - Historical Candlestick Bars
router.get('/candles', (req, res) => {
    try {
        const { symbol = 'RELIANCE', count = 100, interval = '5m' } = req.query;
        const candles = marketDataService.getHistoricalCandles(symbol, parseInt(count) || 100, interval);
        res.json({
            success: true,
            symbol: symbol.toUpperCase(),
            interval,
            count: candles.length,
            candles
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to generate candles' });
    }
});

// GET /api/assets - All supported asset definitions
router.get('/assets', (req, res) => {
    res.json({
        success: true,
        assets: marketDataService.assets
    });
});

// GET /api/stocks - Legacy Stocks endpoint
router.get('/stocks', (req, res) => {
    res.json(marketDataService.assets.stocks);
});

// GET /api/news - Real-time market news feed
router.get('/news', (req, res) => {
    const { category, symbol } = req.query;
    const headlines = newsService.getHeadlines(category, symbol);
    res.json({ success: true, count: headlines.length, news: headlines });
});

module.exports = router;
