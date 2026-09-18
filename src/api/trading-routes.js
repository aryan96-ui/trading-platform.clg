/**
 * Paper Trading API
 *
 * Account, order, position and P&L endpoints for the unified workspace.
 *
 * Every route prices from the gateway through the trading service, so the
 * terminal's ticket, holdings table and chart cannot disagree about a price.
 */
const express = require('express');
const router = express.Router();

module.exports = { createTradingRoutes: function createTradingRoutes({ trading }) {
    const email = (req) => req.params.email || req.query.email || req.body?.email || 'demo@college.com';

    const unavailable = (res, error) => res.status(503).json({ success: false, error });
    const bad = (res, error) => res.status(400).json({ success: false, error });
    const notFound = (res, error) => res.status(404).json({ success: false, error });

    const guard = (handler) => async (req, res) => {
        try {
            await handler(req, res);
        } catch (e) {
            unavailable(res, e.message);
        }
    };

    /**
     * POST /api/v2/trades/pre-check — portfolio risk + guardrail warnings for a
     * proposed order, evaluated against the server's account state. Shares the
     * `/trades` path with the rest of the trading workflow so the route contract
     * cannot drift from the endpoint the UI already documents.
     */
    router.post('/trades/pre-check', guard(async (req, res) => {
        const { email: reqEmail, trade } = req.body || {};
        if (!trade) return bad(res, 'trade is required');
        const result = await trading.preCheck(reqEmail || 'demo@college.com', trade);
        if (result.success) return res.json(result);
        if (result.code === 'DATA_UNAVAILABLE') return unavailable(res, result.error);
        return bad(res, result.error);
    }));

    // ========================================
    // ACCOUNT
    // ========================================

    /** GET /api/v2/account/:email — balance, positions, live mark-to-market */
    router.get('/account/:email', guard(async (req, res) => {
        const snapshot = await trading.snapshot(email(req));
        res.json({ success: true, data: snapshot });
    }));

    /** GET /api/v2/account/:email/pnl — realised / unrealised / daily / per symbol */
    router.get('/account/:email/pnl', guard(async (req, res) => {
        res.json({ success: true, data: await trading.getPnl(email(req)) });
    }));

    /** GET /api/v2/account/:email/analytics — exposure + concentration */
    router.get('/account/:email/analytics', guard(async (req, res) => {
        res.json({ success: true, data: await trading.getAnalytics(email(req)) });
    }));

    // ========================================
    // ORDERS
    // ========================================

    /** GET /api/v2/orders?email=&status=&symbol= */
    router.get('/orders', guard(async (req, res) => {
        const { status, symbol, limit } = req.query;
        const data = trading.getOrders(email(req), {
            status, symbol,
            limit: limit ? parseInt(limit, 10) : undefined
        });
        res.json({ success: true, data });
    }));

    /**
     * POST /api/v2/orders — place a paper order
     *
     * Body: { email, symbol, side, quantity, orderType, limitPrice,
     *         stopLoss, target, strategy, notes, acknowledgeGuardrails, guardrailReason }
     *
     * A guardrail block returns 409 with the warnings so the UI can present
     * the discipline check and let the user consciously override.
     */
    router.post('/orders', guard(async (req, res) => {
        const result = await trading.placeOrder(req.body || {});
        if (result.success) return res.json(result);
        if (result.code === 'GUARDRAIL_BLOCK') return res.status(409).json(result);
        if (result.code === 'DATA_UNAVAILABLE') return res.status(503).json(result);
        return bad(res, result.error);
    }));

    /** DELETE /api/v2/orders/:id?email= — cancel a resting limit order */
    router.delete('/orders/:id', guard(async (req, res) => {
        const result = trading.cancelOrder(email(req), req.params.id);
        if (result.success) return res.json(result);
        return bad(res, result.error);
    }));

    /** POST /api/v2/orders/fill-resting?email= — evaluate resting orders now */
    router.post('/orders/fill-resting', guard(async (req, res) => {
        const filled = await trading.tryFillOpenOrders(req.query.email || null);
        res.json({ success: true, data: { filled, count: filled.length } });
    }));

    // ========================================
    // FILLS
    // ========================================

    /** GET /api/v2/fills/:email — execution log */
    router.get('/fills/:email', guard(async (req, res) => {
        const { limit, symbol } = req.query;
        res.json({
            success: true,
            data: trading.getFills(email(req), {
                limit: limit ? parseInt(limit, 10) : undefined,
                symbol
            })
        });
    }));

    // ========================================
    // POSITIONS
    // ========================================

    /** POST /api/v2/positions/:symbol/close — exit at the live quote */
    router.post('/positions/:symbol/close', guard(async (req, res) => {
        const { quantity, reason } = req.body || {};
        const result = await trading.closePosition(email(req), req.params.symbol, quantity, reason);
        if (result.success) return res.json(result);
        if (result.code === 'DATA_UNAVAILABLE') return unavailable(res, result.error);
        return notFound(res, result.error);
    }));

    /** PUT /api/v2/positions/:symbol/stop — move the protective stop */
    router.put('/positions/:symbol/stop', guard(async (req, res) => {
        const result = await trading.updateStop(email(req), req.params.symbol, req.body?.stopLoss);
        if (result.success) return res.json(result);
        return bad(res, result.error);
    }));

    /** GET /api/v2/positions/:email — open positions only */
    router.get('/positions/:email', guard(async (req, res) => {
        const snapshot = await trading.snapshot(email(req));
        res.json({ success: true, data: { positions: snapshot.positions } });
    }));

    return router;
  },
};
