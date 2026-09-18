/**
 * Market Data API Routes
 * 
 * RESTful endpoints that expose the Market Gateway to the frontend.
 * All responses follow a consistent format:
 * { success: boolean, data?: any, error?: string, meta?: object }
 */
const express = require('express');
const router = express.Router();
const indicatorSeries = require('../engine/indicator-series');

module.exports = function createMarketRoutes(gateway, instrumentMaster, marketStream) {
    /**
     * GET /api/v2/quote/:symbol
     * Get real-time quote for a symbol
     * Query params: exchange
     */
    router.get('/quote/:symbol', async (req, res) => {
        try {
            const { symbol } = req.params;
            const { exchange } = req.query;
            const quote = await gateway.getQuote(symbol, exchange);
            res.json({ success: true, data: quote, meta: { cached: false } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/quotes
     * Get quotes for multiple symbols
     * Query params: symbols (comma-separated), exchange
     */
    router.get('/quotes', async (req, res) => {
        try {
            const { symbols, exchange } = req.query;
            if (!symbols) {
                return res.status(400).json({ success: false, error: 'symbols parameter required' });
            }
            const symbolList = symbols.split(',').map(s => ({ symbol: s.trim(), exchange: exchange || '' }));
            const quotes = await gateway.getQuotes(symbolList);
            res.json({ success: true, data: quotes, meta: { count: quotes.length } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/history/:symbol
     * Get historical OHLCV candles
     * Query params: exchange, interval, limit, endDate
     */
    router.get('/history/:symbol', async (req, res) => {
        try {
            const { symbol } = req.params;
            const { exchange, interval = '1D', limit = 100, endDate } = req.query;
            const candles = await gateway.getHistory(symbol, exchange, interval, parseInt(limit), endDate);
            res.json({ success: true, data: candles, meta: { symbol, interval, count: candles.length } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/indicators/:symbol
     * Indicator series for chart overlays and sub-panes.
     *
     * Computed here, from the same gateway candles the history endpoint returns,
     * using the same IndicatorEngine the screener and AI context builder use —
     * so a value drawn on the chart cannot disagree with a screener filter.
     * Query params: exchange, interval, limit, overlays (ema20,ema50,bb), sub (rsi|macd)
     */
    router.get('/indicators/:symbol', async (req, res) => {
        try {
            const { symbol } = req.params;
            const { exchange, interval = '1D', limit = 200, overlays = '', sub = '' } = req.query;
            const candles = await gateway.getHistory(symbol, exchange, interval, parseInt(limit));
            const data = indicatorSeries.build(candles, {
                overlays: String(overlays).split(',').map(s => s.trim()).filter(Boolean),
                sub: sub || null
            });
            res.json({
                success: true,
                data,
                meta: { symbol, interval, bars: data.bars, source: data.source }
            });
        } catch (error) {
            res.status(503).json({ success: false, error: `Indicators unavailable: ${error.message}` });
        }
    });

    /**
     * GET /api/v2/search
     * Search for instruments
     * Query params: q (query), assetType, exchange, sector, country
     */
    router.get('/search', (req, res) => {
        try {
            const { q, assetType, exchange, sector, country } = req.query;
            const filters = {};
            if (assetType) filters.assetType = assetType;
            if (exchange) filters.exchange = exchange;
            if (sector) filters.sector = sector;
            if (country) filters.country = country;

            // Search instrument master first (instant, no API calls)
            let results = instrumentMaster.search(q, filters);

            // Limit results
            results = results.slice(0, 50);

            res.json({ success: true, data: results, meta: { count: results.length, source: 'instrument_master' } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/overview
     * Get market overview (indices, breadth)
     */
    router.get('/overview', async (req, res) => {
        try {
            const overview = await gateway.getMarketOverview();
            res.json({ success: true, data: overview, meta: { count: overview.length } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/sectors
     * Get sector performance data
     */
    router.get('/sectors', async (req, res) => {
        try {
            const sectors = instrumentMaster.getSectors();
            res.json({ success: true, data: sectors });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/instruments
     * List all instruments with optional filters
     * Query params: assetType, exchange, sector, page, limit
     */
    router.get('/instruments', (req, res) => {
        try {
            const { assetType, exchange, sector, page = 1, limit = 50 } = req.query;
            const filters = {};
            if (assetType) filters.assetType = assetType;
            if (exchange) filters.exchange = exchange;
            if (sector) filters.sector = sector;

            let results = instrumentMaster.search('', filters);
            const total = results.length;

            // Paginate
            const offset = (parseInt(page) - 1) * parseInt(limit);
            results = results.slice(offset, offset + parseInt(limit));

            res.json({
                success: true,
                data: results,
                meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/providers
     * Get provider health status
     */
    router.get('/providers', (req, res) => {
        const health = gateway.getProviderHealth();
        res.json({ success: true, data: health });
    });

    /**
     * GET /api/v2/metrics
     * Get gateway metrics
     */
    router.get('/metrics', (req, res) => {
        const metrics = gateway.getMetrics();
        res.json({ success: true, data: metrics });
    });

    /**
     * GET /api/v2/stream/stats
     * Get WebSocket stream statistics
     */
    router.get('/stream/stats', (req, res) => {
        if (!marketStream) {
            return res.json({ success: true, data: { enabled: false } });
        }
        const stats = marketStream.getStats();
        res.json({ success: true, data: stats });
    });

    return router;
};
