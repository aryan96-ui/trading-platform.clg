/**
 * ProTrader — Legacy (v1) API surface
 *
 * The eight request shapes the original frontend used, plus the premium
 * endpoints the legacy server owned, expressed as thin adapters over the SAME
 * services the /api/v2 routes use.
 *
 * There is deliberately no second implementation in this file. `/api/trade` and
 * `/api/v2/orders` reach the same order book, `/api/login` and the terminal read
 * the same identity, and every price comes from the gateway — which is what
 * makes the two spellings of a route one code path instead of two apps that
 * could disagree about the same account.
 */

const express = require('express');

module.exports = function createLegacyRoutes({ accounts, trading, gateway, instrumentMaster, billing, requirePremium }) {
    const router = express.Router();

    // Legacy alerts are a premium placeholder; they live with the routes that
    // serve them rather than in a second user store.
    const alertsByEmail = new Map();

    // ========================================
    // HELPERS
    // ========================================

    /** Look up an instrument's exchange so the gateway can route the request. */
    const exchangeFor = (symbol) => instrumentMaster?.getBySymbol?.(symbol)?.exchange;

    /**
     * A quote in the legacy { price, change } shape, or an explicit
     * unavailable marker. Missing values are reported, never invented.
     */
    const legacyQuote = async (symbol) => {
        try {
            const q = await gateway.getQuote(symbol, exchangeFor(symbol));
            if (!q || !isFinite(q.price) || q.price <= 0) return { price: null, change: null, unavailable: true };
            return {
                price: q.price,
                change: typeof q.changePercent === 'number' ? q.changePercent : null,
                source: q.source || q.dataQuality || undefined
            };
        } catch (e) {
            return { price: null, change: null, unavailable: true };
        }
    };

    /** The legacy user object, composed from the identity owner + the trading owner. */
    const accountView = async (email) => {
        const [snapshot, identity] = await Promise.all([trading.snapshot(email), accounts.find(email)]);
        const portfolio = {};
        for (const p of snapshot.positions) {
            portfolio[p.symbol] = {
                quantity: p.quantity,
                avgPrice: p.avgPrice,
                assetType: p.assetType,
                currentPrice: p.currentPrice,
                pnl: p.unrealizedPnl,
                pnlPercent: p.unrealizedPnlPercent
            };
        }
        return {
            email,
            balance: snapshot.balance,
            equity: snapshot.equity,
            portfolio,
            isPremium: !!(identity && identity.isPremium),
            tierLevel: identity ? identity.tierLevel : 'free'
        };
    };

    // ========================================
    // AUTH
    // ========================================

    router.post('/register', async (req, res) => {
        const { email, password } = req.body || {};
        const result = await accounts.register(email, password);
        if (!result.success) return res.json({ success: false, message: result.message });
        // The balance comes from the trading service, which creates the account
        // on first read — the identity service never owns money.
        return res.json({ success: true, user: await accountView(email) });
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body || {};
        const result = await accounts.login(email, password);
        if (!result.success) return res.json({ success: false, message: result.message });
        return res.json({ success: true, user: await accountView(email) });
    });

    /**
     * POST /api/logout — the server keeps no session, so this only exists for
     * the client to have one honest place to end a session.
     */
    router.post('/logout', (req, res) => res.json({ success: true }));

    /** GET /api/me — who the caller claims to be, in one call. */
    router.get('/me', async (req, res) => {
        const email = req.headers['x-user-email'] || req.query.email;
        if (!email) return res.status(401).json({ success: false, message: 'Unauthenticated' });
        const identity = await accounts.find(email);
        if (!identity) return res.status(404).json({ success: false, message: 'Unknown account' });
        return res.json({ success: true, user: await accountView(email) });
    });

    // ========================================
    // MARKET DATA
    // ========================================

    /**
     * GET /api/market-data — the legacy grouped payload, assembled from real
     * gateway quotes. Symbols the gateway cannot price come back explicitly
     * unavailable rather than filled in with a random walk.
     */
    router.get('/market-data', async (req, res) => {
        const groups = {
            stocks: ['RELIANCE', 'TCS', 'HDFC', 'INFY', 'SBIN', 'ICICI', 'BHARTI', 'ITC'],
            crypto: ['BTC', 'ETH', 'ADA', 'SOL', 'XRP'],
            forex: ['USD/INR', 'EUR/INR', 'GBP/INR', 'JPY/INR'],
            commodities: ['GOLD', 'SILVER', 'CRUDE']
        };

        try {
            const out = {};
            for (const [group, symbols] of Object.entries(groups)) {
                const quotes = await Promise.all(symbols.map(legacyQuote));
                out[group] = {};
                symbols.forEach((s, i) => { out[group][s] = quotes[i]; });
            }
            out.timestamp = new Date().toISOString();
            out._meta = {
                source: 'gateway',
                demo: !Object.values(out).some(v => v && v.source),
                version: 'unified'
            };
            res.json(out);
        } catch (error) {
            res.status(503).json({ success: false, error: 'Market data unavailable', detail: error.message });
        }
    });

    /** GET /api/stocks — the instrument list the legacy screener read. */
    router.get('/stocks', (req, res) => {
        const stocks = instrumentMaster.getByAssetType('stock').map(i => ({
            symbol: i.symbol,
            name: i.companyName,
            sector: i.sector,
            exchange: i.exchange
        }));
        res.json(stocks);
    });

    // ========================================
    // TRADING (adapters over the one order book)
    // ========================================

    router.post('/trade', async (req, res) => {
        const { email, symbol, type, quantity } = req.body || {};
        if (!email || !symbol || !type || !quantity) {
            return res.json({ success: false, message: 'Missing parameters' });
        }
        if (!(await accounts.find(email))) {
            return res.json({ success: false, message: 'User not found' });
        }

        const result = await trading.placeOrder({
            email,
            symbol,
            side: type,
            quantity: Number(quantity),
            orderType: 'market'
        });
        if (!result.success) return res.json({ success: false, message: result.error });

        const view = await accountView(email);
        return res.json({ success: true, newBalance: view.balance, portfolio: view.portfolio });
    });

    router.get('/history/:email', (req, res) => {
        const { fills } = trading.getFills(req.params.email, { limit: 500 });
        const history = fills.slice().reverse().map(f => ({
            type: f.side,
            symbol: f.symbol,
            quantity: f.quantity,
            price: f.price,
            totalAmount: parseFloat((f.quantity * f.price).toFixed(2)),
            timestamp: f.at
        }));
        res.json({ success: true, history });
    });

    /**
     * GET /api/portfolio/export — CSV of the live portfolio.
     * Registered before /portfolio/:email so the literal path wins.
     */
    router.get('/portfolio/export', requirePremium, async (req, res) => {
        const email = req.headers['x-user-email'];
        const snapshot = await trading.snapshot(email);
        const rows = ['symbol,quantity,avgPrice,currentPrice,unrealizedPnl'];
        for (const p of snapshot.positions) {
            rows.push([p.symbol, p.quantity, p.avgPrice, p.currentPrice ?? '', p.unrealizedPnl ?? ''].join(','));
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="portfolio.csv"');
        res.send(rows.join('\n'));
    });

    router.get('/portfolio/:email', async (req, res) => {
        const view = await accountView(req.params.email);
        res.json({ success: true, portfolio: view.portfolio, balance: view.balance, equity: view.equity });
    });

    /**
     * POST /api/payment — legacy "add funds". Credits go through the trading
     * service, because it is the only owner of balance.
     */
    router.post('/payment', async (req, res) => {
        const { email, amount } = req.body || {};
        if (!email || !amount) return res.json({ success: false, message: 'Missing parameters' });
        if (!(await accounts.find(email))) return res.json({ success: false, message: 'User not found' });

        const result = await trading.deposit(email, Number(amount));
        if (!result.success) return res.json({ success: false, message: result.error });
        return res.json({ success: true, newBalance: result.balance });
    });

    // ========================================
    // PREMIUM ENDPOINTS (ported from the legacy server)
    // ========================================

    /** POST /api/alerts — store an alert (premium). */
    router.post('/alerts', requirePremium, (req, res) => {
        const email = req.headers['x-user-email'];
        const { symbol, condition, target } = req.body || {};
        if (!symbol || !condition || typeof target !== 'number') {
            return res.json({ success: false, message: 'Invalid alert payload' });
        }
        const alerts = alertsByEmail.get(email) || [];
        alerts.push({ symbol, condition, target, createdAt: new Date().toISOString() });
        alertsByEmail.set(email, alerts);
        res.json({ success: true, alerts });
    });

    /**
     * GET /api/alerts — the caller's alerts with the live distance to target,
     * evaluated against real gateway quotes.
     */
    router.get('/alerts', requirePremium, async (req, res) => {
        const email = req.headers['x-user-email'];
        const alerts = alertsByEmail.get(email) || [];
        const evaluated = await Promise.all(alerts.map(async (a) => {
            const quote = await legacyQuote(a.symbol);
            return {
                ...a,
                current: quote.price,
                distancePercent: quote.price === null || !a.target
                    ? null
                    : parseFloat((((quote.price - a.target) / a.target) * 100).toFixed(2))
            };
        }));
        res.json({ success: true, alerts: evaluated });
    });

    router.get('/support', requirePremium, (req, res) => {
        res.json({ success: true, message: 'Priority support is available via Slack channel #protrader-support' });
    });

    router.get('/white-label', async (req, res) => {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || apiKey !== process.env.WHITE_LABEL_API_KEY) {
            return res.status(403).json({ success: false, message: 'Invalid API key' });
        }
        const stocks = instrumentMaster.getByAssetType('stock').slice(0, 25);
        const data = await Promise.all(stocks.map(async (i) => ({
            symbol: i.symbol,
            name: i.companyName,
            ...(await legacyQuote(i.symbol))
        })));
        res.json({ success: true, data });
    });

    // ========================================
    // BILLING
    // ========================================

    if (billing) {
        router.post('/create-order', billing.createOrder);
        router.post('/verify-payment', billing.verifyPayment);
    }

    return router;
};
