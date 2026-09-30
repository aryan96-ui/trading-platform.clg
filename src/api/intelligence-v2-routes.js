/**
 * Intelligence Layer API Routes (Module 27)
 *
 * GET  /api/market/regime/:symbol
 * GET  /api/market/signals
 * GET  /api/signals/ranked
 * POST /api/signals/conflict
 * GET  /api/portfolio/risk
 * GET  /api/portfolio/heat
 * POST /api/portfolio/position-size
 * POST /api/trades/pre-check
 * GET  /api/trades/:id/review
 * POST /api/trades/thesis
 * POST /api/trades/thesis/resolve
 * GET  /api/trader/behavior
 * GET  /api/trader/profile
 * POST /api/guardrails/check
 * POST /api/guardrails/confirm
 * GET  /api/guardrails/settings
 * PUT  /api/guardrails/settings
 * POST /api/strategies/backtest
 * POST /api/strategies/sensitivity
 * POST /api/strategies/walk-forward
 * GET  /api/strategies/matrix
 * POST /api/strategies/matrix/assess
 * POST /api/claims/verify
 * GET  /api/execution/:tradeId
 * POST /api/execution/timing
 * POST /api/ai/analyze-trade
 * GET  /api/events
 */
const express = require('express');
const router = express.Router();

module.exports = function createIntelligenceV2Routes(svcs) {
    const {
        eventBus, signalRanking, signalConflict, preTradeRisk, portfolioHeat,
        positionSizing, thesisService, postTradeLearning, executionQuality,
        guardrails, traderProfile, strategyMatrix, backtestEngine, claimVerification,
        regimeEngine, journal, aiCopilot
    } = svcs;

    // ============ MARKET REGIME ============
    router.get('/market/regime/:symbol', (req, res) => {
        // Requires price history — in demo mode return explicit UNKNOWN
        res.json({
            success: true,
            data: {
                regime: 'UNKNOWN',
                confidence: 0,
                evidence: [],
                symbol: req.params.symbol,
                message: 'Insufficient data to assess regime for this symbol. Provide price history via POST /api/market/regime/assess.',
                timestamp: new Date().toISOString()
            }
        });
    });

    router.post('/market/regime/assess', (req, res) => {
        const { prices, volumes, timeframe } = req.body || {};
        if (!prices || !Array.isArray(prices) || prices.length < 20) {
            return res.status(400).json({ success: false, error: 'prices array required (≥20 points)' });
        }
        const result = regimeEngine.assess({ prices, volumes: volumes || [], timeframe });
        eventBus.regimeChanged({ symbol: req.body.symbol || 'index', regime: result.regime });
        res.json({ success: true, data: result });
    });

    // ============ SIGNALS ============
    router.get('/market/signals', (req, res) => {
        const { symbol } = req.query;
        const recent = eventBus.getEvents({ type: 'SIGNAL_CREATED', limit: 50 });
        const signals = recent
            .map(e => e.payload)
            .filter(s => !symbol || s.symbol === symbol);
        res.json({ success: true, data: signals });
    });

    router.post('/signals/ranked', (req, res) => {
        const { signals, context } = req.body || {};
        if (!signals || !Array.isArray(signals)) {
            return res.status(400).json({ success: false, error: 'signals array required' });
        }
        const ranked = signalRanking.rankSignals(signals, context || {});
        const alerts = signalRanking.buildSmartAlerts(ranked);
        ranked.forEach(s => eventBus.signalCreated(s));
        res.json({ success: true, data: { ranked, alerts } });
    });

    router.post('/signals/conflict', (req, res) => {
        const { factors } = req.body || {};
        if (!factors) return res.status(400).json({ success: false, error: 'factors object required' });
        const result = signalConflict.detectConflicts(factors);
        res.json({ success: true, data: result });
    });

    // ============ PORTFOLIO RISK / HEAT / SIZING ============
    router.get('/portfolio/risk', (req, res) => {
        const { email = 'demo@college.com' } = req.query;
        const holdings = journal.getTrades(email)
            .filter(t => t.pnl === undefined) // open trades only (best effort)
            .map(t => ({ symbol: t.symbol, quantity: t.quantity, avgPrice: t.entryPrice, currentPrice: t.entryPrice, sector: t.sector, assetType: t.assetType }));
        const analysis = portfolioHeat.compute({ holdings });
        res.json({ success: true, data: analysis });
    });

    router.get('/portfolio/heat', (req, res) => {
        const { holdings } = req.query;
        let parsed = null;
        if (holdings) {
            try { parsed = { holdings: JSON.parse(holdings) }; } catch (e) { /* fall through */ }
        }
        const heat = portfolioHeat.compute(parsed || {});
        res.json({ success: true, data: heat });
    });

    router.post('/portfolio/position-size', (req, res) => {
        const input = req.body || {};
        const required = ['accountValue', 'entryPrice', 'stopLoss'];
        for (const f of required) {
            if (input[f] === undefined) return res.status(400).json({ success: false, error: `${f} required` });
        }
        const result = positionSizing.size(input);
        res.json({ success: true, data: result });
    });

    // ============ PRE-TRADE CHECK ============
    router.post('/trades/pre-check', (req, res) => {
        const { trade, portfolio, market } = req.body || {};
        if (!trade) return res.status(400).json({ success: false, error: 'trade object required' });
        const result = preTradeRisk.runCheck(trade, portfolio || {}, market || {});
        if (result.riskLevel === 'HIGH') eventBus.riskThreshold({ symbol: trade.symbol, level: result.riskLevel, details: result.highFindings });
        res.json({ success: true, data: result });
    });

    // ============ POST-TRADE REVIEW ============
    router.get('/trades/:id/review', (req, res) => {
        const tradeId = req.params.id;
        // Look up closed trade from journal
        const allTrades = [];
        for (const [email, trades] of journal.trades.entries()) {
            for (const t of trades) if (t.id === tradeId) allTrades.push({ ...t, email });
        }
        if (allTrades.length === 0) {
            return res.status(404).json({ success: false, error: 'Trade not found or still open' });
        }
        const trade = allTrades[0];
        const review = trade.review || postTradeLearning.generateReview(trade);
        res.json({ success: true, data: { ...trade, review } });
    });

    // ============ TRADE THESIS ============
    router.post('/trades/thesis', (req, res) => {
        const { email, thesis } = req.body || {};
        if (!email || !thesis) return res.status(400).json({ success: false, error: 'email and thesis required' });
        try {
            const created = thesisService.createThesis(email, thesis);
            eventBus.emitEvent('THESIS_CREATED', { symbol: thesis.symbol, thesisId: created.id });
            res.json({ success: true, data: created });
        } catch (e) {
            res.status(400).json({ success: false, error: e.message });
        }
    });

    router.post('/trades/thesis/resolve', (req, res) => {
        const { email, thesisId, outcome } = req.body || {};
        if (!email || !thesisId || !outcome) {
            return res.status(400).json({ success: false, error: 'email, thesisId, outcome required' });
        }
        try {
            const comparison = thesisService.resolveThesis(email, thesisId, outcome);
            res.json({ success: true, data: comparison });
        } catch (e) {
            res.status(400).json({ success: false, error: e.message });
        }
    });

    router.get('/trades/thesis/:email', (req, res) => {
        const { status } = req.query;
        res.json({ success: true, data: thesisService.getTheses(req.params.email, status) });
    });

    // ============ TRADER BEHAVIOR / PROFILE ============
    router.get('/trader/behavior', (req, res) => {
        const { email = 'demo@college.com' } = req.query;
        const trades = journal.getTrades(email);
        const analysis = svcs.behavioral.analyze(trades);
        res.json({ success: true, data: analysis });
    });

    router.get('/trader/profile', (req, res) => {
        const { email = 'demo@college.com' } = req.query;
        const trades = journal.getTrades(email);
        const profile = traderProfile.buildProfile(email, trades);
        res.json({ success: true, data: profile });
    });

    // ============ GUARDRAILS ============
    router.get('/guardrails/settings', (req, res) => {
        const { email = 'demo@college.com' } = req.query;
        res.json({ success: true, data: guardrails.getSettings(email) });
    });

    router.put('/guardrails/settings', (req, res) => {
        const { email = 'demo@college.com', updates } = req.body || {};
        if (!updates) return res.status(400).json({ success: false, error: 'updates required' });
        res.json({ success: true, data: guardrails.updateSettings(email, updates) });
    });

    router.post('/guardrails/check', (req, res) => {
        const { email = 'demo@college.com', trade, context } = req.body || {};
        if (!trade) return res.status(400).json({ success: false, error: 'trade required' });
        const result = guardrails.checkTrade(email, trade, context || {});
        if (result.overrideRequired) eventBus.guardrailTriggered({ symbol: trade.symbol, blocks: result.blocks });
        res.json({ success: true, data: result });
    });

    router.post('/guardrails/confirm', (req, res) => {
        const { email = 'demo@college.com', trade, blockIds, reason, notes } = req.body || {};
        if (!trade) return res.status(400).json({ success: false, error: 'trade required' });
        const entry = guardrails.confirmTrade(email, trade, { blockIds: blockIds || [], reason, notes });
        res.json({ success: true, data: entry });
    });

    router.get('/guardrails/logs/:email', (req, res) => {
        res.json({ success: true, data: guardrails.getLogs(req.params.email) });
    });

    // ============ STRATEGIES ============
    router.post('/strategies/backtest', (req, res) => {
        const { candles, strategy, params, initialCapital } = req.body || {};
        if (!candles || !strategy) return res.status(400).json({ success: false, error: 'candles and strategy required' });
        const result = backtestEngine.runBacktest({ candles, strategy, params: params || {}, initialCapital });
        res.json({ success: true, data: result });
    });

    router.post('/strategies/sensitivity', (req, res) => {
        const { candles, strategy, paramName, paramValues } = req.body || {};
        if (!candles || !strategy || !paramName || !paramValues) {
            return res.status(400).json({ success: false, error: 'candles, strategy, paramName, paramValues required' });
        }
        const result = backtestEngine.runSensitivity({ candles, strategy, paramName, paramValues });
        res.json({ success: true, data: result });
    });

    router.post('/strategies/walk-forward', (req, res) => {
        const { candles, strategy, params, windowSize, stepSize } = req.body || {};
        if (!candles || !strategy) return res.status(400).json({ success: false, error: 'candles and strategy required' });
        const result = backtestEngine.runWalkForward({ candles, strategy, params: params || {}, windowSize, stepSize });
        res.json({ success: true, data: result });
    });

    router.get('/strategies/matrix', (req, res) => {
        const { email = 'demo@college.com' } = req.query;
        const trades = journal.getTrades(email);
        const matrix = strategyMatrix.build(trades);
        res.json({ success: true, data: matrix });
    });

    router.post('/strategies/matrix/assess', (req, res) => {
        const { strategy, currentRegime, email = 'demo@college.com' } = req.body || {};
        if (!strategy || !currentRegime) {
            return res.status(400).json({ success: false, error: 'strategy and currentRegime required' });
        }
        const matrix = strategyMatrix.build(journal.getTrades(email));
        const result = strategyMatrix.assessCompatibility(strategy, currentRegime, matrix);
        res.json({ success: true, data: result });
    });

    // ============ CLAIMS ============
    router.post('/claims/verify', (req, res) => {
        const { claimText, symbol, data } = req.body || {};
        if (!claimText || !symbol) return res.status(400).json({ success: false, error: 'claimText and symbol required' });
        const result = claimVerification.verify({ claimText, symbol, data: data || {} });
        res.json({ success: true, data: result });
    });

    // ============ EXECUTION ============
    router.get('/execution/:tradeId', (req, res) => {
        const tradeId = req.params.tradeId;
        let trade = null;
        for (const [, trades] of journal.trades.entries()) {
            const found = trades.find(t => t.id === tradeId);
            if (found) { trade = found; break; }
        }
        if (!trade) return res.status(404).json({ success: false, error: 'Trade not found' });
        const analysis = executionQuality.analyze({
            id: trade.id, symbol: trade.symbol, direction: trade.direction,
            plannedEntry: trade.plannedEntry, actualEntry: trade.entryPrice,
            plannedExit: trade.plannedExit, actualExit: trade.exitPrice,
            quantity: trade.quantity,
            maxFavorableExcursion: trade.maxFavorableExcursion,
            maxAdverseExcursion: trade.maxAdverseExcursion
        });
        res.json({ success: true, data: analysis });
    });

    router.post('/execution/timing', (req, res) => {
        const { trade, candles } = req.body || {};
        if (!trade || !candles) return res.status(400).json({ success: false, error: 'trade and candles required' });
        const result = executionQuality.timingAlpha(trade, candles);
        res.json({ success: true, data: result });
    });

    // ============ AI ANALYZE TRADE ============
    router.post('/ai/analyze-trade', async (req, res) => {
        const { context } = req.body || {};
        if (!context || !context.symbol) return res.status(400).json({ success: false, error: 'context.symbol required' });
        try {
            const result = await aiCopilot.analyze(context);
            res.json({ success: true, data: result });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // ============ EVENT BUS ============
    router.get('/events', (req, res) => {
        const { type, limit } = req.query;
        res.json({
            success: true,
            data: eventBus.getEvents({ type, limit: limit ? parseInt(limit) : 50 }),
            stats: eventBus.getStats()
        });
    });

    return router;
};