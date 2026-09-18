/**
 * Intelligence API Routes
 * 
 * Trading Journal, Behavioral Analytics, AI Copilot, Strategy Lab
 */
const express = require('express');
const router = express.Router();

module.exports = function createIntelligenceRoutes(services) {
    const { journal, behavioral, aiCopilot, strategyLab, aiContextBuilder } = services;

    // ========================================
    // TRADING JOURNAL
    // ========================================

    // Open a trade
    router.post('/journal/open', (req, res) => {
        const { email, trade } = req.body;
        if (!email || !trade) return res.status(400).json({ success: false, error: 'email and trade required' });
        const opened = journal.openTrade(email, trade);
        res.json({ success: true, data: opened });
    });

    // Close a trade (generates post-trade review)
    router.post('/journal/close', (req, res) => {
        const { email, tradeId, exitPrice } = req.body;
        if (!email || !tradeId || exitPrice === undefined) {
            return res.status(400).json({ success: false, error: 'email, tradeId, exitPrice required' });
        }
        const closed = journal.closeTrade(email, tradeId, exitPrice);
        if (!closed) return res.status(404).json({ success: false, error: 'Trade not found or already closed' });
        res.json({ success: true, data: closed });
    });

    // Get all trades for a user
    router.get('/journal/:email', (req, res) => {
        const trades = journal.getTrades(req.params.email);
        res.json({ success: true, data: trades, meta: { count: trades.length } });
    });

    // Performance stats (with optional filters)
    router.get('/journal/:email/stats', (req, res) => {
        const { strategy, symbol, sector, direction } = req.query;
        const stats = journal.getPerformanceStats(req.params.email, { strategy, symbol, sector, direction });
        res.json({ success: true, data: stats });
    });

    // ========================================
    // BEHAVIORAL ANALYTICS
    // ========================================

    // Analyze trading behavior
    router.post('/behavioral/analyze', (req, res) => {
        const { trades } = req.body;
        if (!trades || !Array.isArray(trades)) {
            return res.status(400).json({ success: false, error: 'trades array required' });
        }
        const result = behavioral.analyze(trades);
        res.json({ success: true, data: result });
    });

    // ========================================
    // AI COPILOT
    // ========================================

    // Analyze an instrument with AI + evidence panel.
    //
    // The backend builds the context from real market data — client-supplied
    // indicator numbers are never trusted, so the AI can only reason over
    // figures ProTrader itself computed and can prove the source of.
    router.post('/ai/analyze', async (req, res) => {
        const { symbol, exchange, context: suppliedContext } = req.body || {};

        let context = suppliedContext;
        if (symbol && aiContextBuilder) {
            try {
                context = await aiContextBuilder.build(symbol, exchange);
            } catch (error) {
                return res.status(503).json({
                    success: false,
                    error: `Market data unavailable for ${symbol}: ${error.message}`
                });
            }
        }

        if (!context || !context.symbol) {
            return res.status(400).json({ success: false, error: 'symbol (or context with symbol) required' });
        }

        try {
            const result = await aiCopilot.analyze(context);
            result.dataProvenance = context.dataProvenance || null;
            result.unavailable = context.unavailable || [];
            result.dataWarnings = context.warnings || [];
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Check Ollama availability
    router.get('/ai/status', async (req, res) => {
        const available = await aiCopilot.isOllamaAvailable();
        res.json({ success: true, data: { available, model: aiCopilot.model, url: aiCopilot.ollamaUrl } });
    });

    // ========================================
    // STRATEGY LAB
    // ========================================

    // Analyze trades by dimension
    router.post('/strategy/analyze', (req, res) => {
        const { trades, dimension } = req.body;
        if (!trades || !Array.isArray(trades)) {
            return res.status(400).json({ success: false, error: 'trades array required' });
        }
        try {
            const result = dimension
                ? strategyLab.analyzeByDimension(trades, dimension)
                : strategyLab.analyzeAll(trades);
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    // Get available dimensions
    router.get('/strategy/dimensions', (req, res) => {
        res.json({ success: true, data: strategyLab.dimensions });
    });

    return router;
};