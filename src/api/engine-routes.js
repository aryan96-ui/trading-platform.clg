/**
 * Analytics Engine API Routes
 * 
 * RESTful endpoints for:
 * - Market Screener
 * - Sector Heatmap
 * - Market Regime
 * - Trade Quality
 * - Risk Terminal
 * - Market Tape
 */
const express = require('express');
const router = express.Router();

module.exports = function createEngineRoutes(engines) {
    const { screener, heatmap, regime, tradeQuality, riskTerminal, tape } = engines;

    // ========================================
    // SCREENER
    // ========================================

    /**
     * POST /api/v2/screen
     * Run a screen with filters
     */
    router.post('/screen', async (req, res) => {
        try {
            const { filters } = req.body;
            const results = await screener.runScreen(filters || []);
            res.json({ success: true, data: results, meta: { count: results.length } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    /**
     * GET /api/v2/screen/presets
     * Get predefined screen configurations
     */
    router.get('/screen/presets', (req, res) => {
        const presets = screener.getPresetScreens();
        res.json({ success: true, data: presets });
    });

    /**
     * GET /api/v2/screen/filters
     * Get available filter definitions for the UI
     */
    router.get('/screen/filters', (req, res) => {
        const filters = screener.getFilterDefinitions();
        res.json({ success: true, data: filters });
    });

    /**
     * POST /api/v2/screen/save
     * Save a screen configuration
     */
    router.post('/screen/save', (req, res) => {
        const { name, filters } = req.body;
        if (!name || !filters) {
            return res.status(400).json({ success: false, error: 'name and filters required' });
        }
        const id = screener.saveScreen(name, filters);
        res.json({ success: true, data: { id, name } });
    });

    /**
     * GET /api/v2/screen/saved
     * Get all saved screens
     */
    router.get('/screen/saved', (req, res) => {
        const screens = screener.getSavedScreens();
        res.json({ success: true, data: screens });
    });

    /**
     * POST /api/v2/screen/:id/run
     * Run a saved screen
     */
    router.post('/screen/:id/run', async (req, res) => {
        try {
            const results = await screener.runSavedScreen(req.params.id);
            res.json({ success: true, data: results, meta: { count: results.length } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ========================================
    // SECTOR HEATMAP
    // ========================================

    /**
     * GET /api/v2/heatmap
     * Get full market heatmap
     */
    router.get('/heatmap', (req, res) => {
        const priceData = req.body || {};
        const heatmapData = heatmap.generate(priceData);
        res.json({ success: true, data: heatmapData });
    });

    /**
     * GET /api/v2/heatmap/sector/:name
     * Drill down into a specific sector
     */
    router.get('/heatmap/sector/:name', (req, res) => {
        const sectorData = heatmap.drilldown(req.params.name);
        if (!sectorData) {
            return res.status(404).json({ success: false, error: 'Sector not found' });
        }
        res.json({ success: true, data: sectorData });
    });

    /**
     * GET /api/v2/heatmap/sectors
     * Get sector performance summary
     */
    router.get('/heatmap/sectors', (req, res) => {
        const performance = heatmap.getSectorPerformance();
        res.json({ success: true, data: performance });
    });

    // ========================================
    // MARKET REGIME
    // ========================================

    /**
     * POST /api/v2/regime/assess
     * Assess market regime for given price data
     */
    router.post('/regime/assess', (req, res) => {
        const { prices, volumes, timeframe } = req.body;
        if (!prices || !Array.isArray(prices) || prices.length < 20) {
            return res.status(400).json({
                success: false,
                error: 'prices array required (minimum 20 data points)'
            });
        }
        const result = regime.assess({ prices, volumes: volumes || [], timeframe });
        res.json({ success: true, data: result });
    });

    /**
     * GET /api/v2/regime/history
     * Get regime assessment history
     */
    router.get('/regime/history', (req, res) => {
        const history = regime.getHistory();
        res.json({ success: true, data: history });
    });

    // ========================================
    // TRADE QUALITY
    // ========================================

    /**
     * POST /api/v2/trade-quality/evaluate
     * Evaluate trade quality before execution
     */
    router.post('/trade-quality/evaluate', (req, res) => {
        const { trade, marketData } = req.body;
        if (!trade || !marketData) {
            return res.status(400).json({
                success: false,
                error: 'trade and marketData objects required'
            });
        }
        const result = tradeQuality.evaluate(trade, marketData);
        res.json({ success: true, data: result });
    });

    // ========================================
    // RISK TERMINAL
    // ========================================

    /**
     * POST /api/v2/risk/analyze
     * Analyze portfolio risk
     */
    router.post('/risk/analyze', (req, res) => {
        const { portfolio, marketData } = req.body;
        if (!portfolio) {
            return res.status(400).json({ success: false, error: 'portfolio object required' });
        }
        const result = riskTerminal.analyze(portfolio, marketData || {});
        res.json({ success: true, data: result });
    });

    /**
     * POST /api/v2/risk/position-size
     * Calculate position size
     */
    router.post('/risk/position-size', (req, res) => {
        const { accountValue, riskPercent, entryPrice, stopLoss } = req.body;
        if (!accountValue || !riskPercent || !entryPrice || !stopLoss) {
            return res.status(400).json({
                success: false,
                error: 'accountValue, riskPercent, entryPrice, stopLoss required'
            });
        }
        const result = riskTerminal.calculatePositionSize(accountValue, riskPercent, entryPrice, stopLoss);
        res.json({ success: true, data: result });
    });

    // ========================================
    // MARKET TAPE
    // ========================================

    /**
     * GET /api/v2/tape
     * Get market tape entries
     */
    router.get('/tape', (req, res) => {
        const { symbol, direction, largePrintsOnly, anomaliesOnly, limit } = req.query;
        const entries = tape.getEntries({
            symbol, direction,
            largePrintsOnly: largePrintsOnly === 'true',
            anomaliesOnly: anomaliesOnly === 'true',
            limit: limit ? parseInt(limit) : 50
        });
        res.json({ success: true, data: entries, meta: { count: entries.length } });
    });

    /**
     * GET /api/v2/tape/stats
     * Get tape statistics
     */
    router.get('/tape/stats', (req, res) => {
        const stats = tape.getStats();
        res.json({ success: true, data: stats });
    });

    /**
     * POST /api/v2/tape/pause
     * Pause/resume the tape
     */
    router.post('/tape/pause', (req, res) => {
        const { pause } = req.body;
        if (pause !== undefined) {
            pause ? tape.pause() : tape.resume();
        } else {
            tape.isPaused ? tape.resume() : tape.pause();
        }
        res.json({ success: true, data: { isPaused: tape.isPaused } });
    });

    /**
     * POST /api/v2/tape/filter
     * Set tape filters
     */
    router.post('/tape/filter', (req, res) => {
        const { symbols, minSize } = req.body;
        if (symbols) tape.filterBySymbols(symbols);
        if (minSize) tape.filterByMinSize(minSize);
        res.json({ success: true, data: { filters: tape.filters } });
    });

    return router;
};
