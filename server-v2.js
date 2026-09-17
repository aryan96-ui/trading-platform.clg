/**
 * ProTrader v2 — Professional Trading Platform Server
 * 
 * Architecture:
 * - Market Gateway (provider-agnostic, multi-provider fallback)
 * - WebSocket Market Stream (multiplexed subscriptions)
 * - Instrument Master (searchable instrument database)
 * - Existing API routes (backward compatible with v1 frontend)
 * - In-memory storage (no database dependency)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');

// ============================================
// CORE ARCHITECTURE IMPORTS
// ============================================
const MarketGateway = require('./src/market-data/gateway');
const MarketStream = require('./src/websocket/market-stream');
const InstrumentMaster = require('./src/instruments/instrument-master');
const createMarketRoutes = require('./src/api/market-routes');

// Provider adapters
const TwelveDataProvider = require('./src/market-data/providers/twelvedata-provider');
const FinnhubProvider = require('./src/market-data/providers/finnhub-provider');
const AlphaVantageProvider = require('./src/market-data/providers/alphavantage-provider');
const CoinGeckoProvider = require('./src/market-data/providers/coingecko-provider');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ============================================
// PHASE 1: MARKET DATA GATEWAY
// ============================================
console.log('\n🔄 Initializing Market Data Gateway...');

const isDemoMode = !process.env.TWELVEDATA_API_KEY && !process.env.FINNHUB_API_KEY && !process.env.ALPHAVANTAGE_API_KEY;

const gateway = new MarketGateway({ isDemoMode });

// Register providers (skip if no API key)
if (process.env.TWELVEDATA_API_KEY) {
    gateway.registerProvider(new TwelveDataProvider({ apiKey: process.env.TWELVEDATA_API_KEY }));
} else {
    console.log('  ⚠️  Twelve Data: no API key (set TWELVEDATA_API_KEY)');
}

if (process.env.FINNHUB_API_KEY) {
    gateway.registerProvider(new FinnhubProvider({ apiKey: process.env.FINNHUB_API_KEY }));
} else {
    console.log('  ⚠️  Finnhub: no API key (set FINNHUB_API_KEY)');
}

if (process.env.ALPHAVANTAGE_API_KEY) {
    gateway.registerProvider(new AlphaVantageProvider({ apiKey: process.env.ALPHAVANTAGE_API_KEY }));
} else {
    console.log('  ⚠️  Alpha Vantage: no API key (set ALPHAVANTAGE_API_KEY)');
}

// CoinGecko is always registered (free, no key needed)
gateway.registerProvider(new CoinGeckoProvider());

// Demo provider as last-resort fallback (clearly labeled DEMO DATA)
// Only registered when no real market-data keys are configured
if (isDemoMode) {
    const DemoProvider = require('./src/market-data/providers/demo-provider');
    gateway.registerProvider(new DemoProvider());
    console.log('  ⚠️  Demo provider registered (all quotes labeled DEMO DATA)');
}

// ============================================
// INSTRUMENT MASTER
// ============================================
console.log('🔄 Initializing Instrument Master...');
const instrumentMaster = new InstrumentMaster();
console.log(`  ✅ ${instrumentMaster.size} instruments loaded`);

// Let the gateway route each request to providers that actually support the
// symbol's asset class (prevents crypto-only providers stalling stock calls)
gateway.setInstrumentMaster(instrumentMaster);

// ============================================
// WEBSOCKET MARKET STREAM
// ============================================
console.log('🔄 Initializing WebSocket Market Stream...');
const marketStream = new MarketStream(gateway, { isDemoMode, updateInterval: 3000 });
marketStream.start(server);
console.log('  ✅ WebSocket server attached');

// ============================================
// PHASE 2+3: ANALYTICS ENGINES
// ============================================
console.log('\n🔄 Initializing Analytics Engines...');

const ScreenerEngine = require('./src/engine/screener-engine');
const SectorHeatmap = require('./src/engine/sector-heatmap');
const MarketRegimeEngine = require('./src/engine/market-regime-engine');
const TradeQualityEngine = require('./src/engine/trade-quality-engine');
const RiskTerminal = require('./src/engine/risk-terminal');
const MarketTape = require('./src/engine/market-tape');
const createEngineRoutes = require('./src/api/engine-routes');

const screener = new ScreenerEngine(instrumentMaster, gateway);
const sectorHeatmap = new SectorHeatmap(instrumentMaster, gateway);
const marketRegime = new MarketRegimeEngine();
const tradeQuality = new TradeQualityEngine(marketRegime);
const riskTerminal = new RiskTerminal();
const marketTape = new MarketTape({ maxSize: 2000, largePrintThreshold: 100000 });

// Phase 4-6 engines
const TradingJournal = require('./src/engine/trading-journal');
const BehavioralAnalytics = require('./src/engine/behavioral-analytics');
const AICopilot = require('./src/engine/ai-copilot');
const AIContextBuilder = require('./src/engine/ai-context-builder');
const StrategyLab = require('./src/engine/strategy-lab');
const createIntelligenceRoutes = require('./src/api/intelligence-routes');

const journal = new TradingJournal();
const behavioral = new BehavioralAnalytics();
const aiCopilot = new AICopilot({ enabled: true }); // Falls back to rule-engine if Ollama is down
const strategyLab = new StrategyLab(journal);

// ============================================
// INTELLIGENCE LAYER (Modules 1-25)
// ============================================
const EventBus = require('./src/engine/event-bus');
const EvidenceEngine = require('./src/engine/evidence-engine');
const { SignalRankingEngine, SignalConflictEngine } = require('./src/engine/signal-engine');
const { PreTradeRiskCheck, PortfolioHeat, PositionSizingEngine } = require('./src/engine/pre-trade-risk');
const TradeThesisService = require('./src/engine/trade-thesis');
const PostTradeLearningEngine = require('./src/engine/post-trade-learning');
const ExecutionQualityAnalytics = require('./src/engine/execution-quality');
const GuardrailEngine = require('./src/engine/guardrails');
const TraderProfile = require('./src/engine/trader-profile');
const StrategyRegimeMatrix = require('./src/engine/strategy-regime-matrix');
const BacktestEngine = require('./src/engine/backtest-engine');
const ClaimVerificationEngine = require('./src/engine/claim-verification');
const createIntelligenceV2Routes = require('./src/api/intelligence-v2-routes');

const eventBus = new EventBus();
const signalRanking = new SignalRankingEngine();
const signalConflict = new SignalConflictEngine();
const preTradeRisk = new PreTradeRiskCheck();
const portfolioHeat = new PortfolioHeat();
const positionSizing = new PositionSizingEngine();
const thesisService = new TradeThesisService();
const postTradeLearning = new PostTradeLearningEngine();
const executionQuality = new ExecutionQualityAnalytics();
const guardrails = new GuardrailEngine();
const traderProfile = new TraderProfile();
const strategyMatrix = new StrategyRegimeMatrix();
const backtestEngine = new BacktestEngine();
const claimVerification = new ClaimVerificationEngine();

// Event-bus wiring: auto-review closed trades + guardrail outcome logging
journal.trades.set = ((original) => function (key, value) {
    const result = original.call(this, key, value);
    try { eventBus.tradeClosed(value[value.length - 1]); } catch (e) { /* best effort */ }
    return result;
})(journal.trades.set);

// Post-trade review auto-generation on close (journal already generates base review)
// Wrap closeTrade to enrich with regime + post-trade learning
const originalCloseTrade = journal.closeTrade.bind(journal);
journal.closeTrade = (email, tradeId, exitPrice, context = {}) => {
    const closed = originalCloseTrade(email, tradeId, exitPrice, context);
    if (closed) {
        try {
            const enriched = { ...closed, marketRegime: closed.marketRegime || context.regime?.regime || 'UNKNOWN' };
            closed.review = postTradeLearning.generateReview(enriched, {
                regime: context.regime,
                benchmarkReturn: context.benchmarkReturn,
                accountValue: context.accountValue,
                strategyAdherence: context.strategyAdherence
            });
            // tradeClosed already emitted by the journal.trades.set patch above
        } catch (e) {
            console.error('[intelligence] review generation failed:', e.message);
        }
    }
    return closed;
};

// Guardrail outcome logging on close
const originalRecordOutcome = guardrails.recordOutcome.bind(guardrails);
journal.closeTrade = ((orig) => function (email, tradeId, exitPrice, context = {}) {
    const closed = orig.call(this, email, tradeId, exitPrice, context);
    if (closed) {
        try {
            guardrails.recordOutcome(email, null, { pnl: closed.pnl, result: closed.pnl >= 0 ? 'win' : 'loss' });
        } catch (e) { /* best effort */ }
    }
    return closed;
})(journal.closeTrade);

// Seed demo trade history AFTER all enrichment wraps are installed so seeded
// trades flow through the full pipeline (events, enriched reviews, guardrail
// outcome logs) like real paper trades. Clearly DEMO.
seedDemoHistory(journal, { postTradeLearning });

// Feed WebSocket quotes into market tape (after tape is defined)
marketStream.on('quote', (quote) => {
    marketTape.add(quote);
});

console.log('  ✅ Screener Engine ready');
console.log('  ✅ Sector Heatmap ready');
console.log('  ✅ Market Regime Engine ready');
console.log('  ✅ Trade Quality Engine ready');
console.log('  ✅ Risk Terminal ready');
console.log('  ✅ Market Tape ready');

// ============================================
// PAPER TRADING
// Single owner of account, order, position and P&L state. Fills are priced
// from the gateway, and every fill links to a journal trade so the trade
// carries its regime, strategy and risk into the intelligence layer.
// ============================================
const PaperTradingService = require('./src/trading/paper-trading');
const { computeExcursions } = require('./src/trading/excursions');
const { createTradingRoutes } = require('./src/api/trading-routes');

const trading = new PaperTradingService({
    gateway,
    instrumentMaster,
    journal,
    guardrails,
    preTradeRisk,
    positionSizing,
    regimeEngine: marketRegime,
    eventBus,
    computeExcursions
});

// Resting limit orders are evaluated against fresh quotes.
setInterval(() => {
    trading.tryFillOpenOrders().catch(e => console.error('[trading] resting order sweep failed:', e.message));
}, 15000).unref?.();

console.log('  ✅ Paper Trading Service ready');

// Seed the demo account with real orders executed through the service, so the
// unified workspace opens with live positions, a resting order book and P&L
// instead of empty panels. Nothing here is invented: each fill uses the
// gateway's current DEMO-labelled quote.
seedPaperAccount(trading, gateway);

// ============================================
// API ROUTES
// ============================================

// v2 Market API (new professional routes)
app.use('/api/v2', createMarketRoutes(gateway, instrumentMaster, marketStream));

// v2 Paper Trading API (account, orders, positions, P&L)
app.use('/api/v2', createTradingRoutes({ trading }));

// v2 Engine API (analytics, screener, heatmap, regime, risk, tape)
app.use('/api/v2', createEngineRoutes({
    screener,
    heatmap: sectorHeatmap,
    regime: marketRegime,
    tradeQuality,
    riskTerminal,
    tape: marketTape
}));

// AI Context Builder — derives the AI's structured context from real market
// data so the AI layer never receives (or invents) unverified numbers
const aiContextBuilder = new AIContextBuilder({ gateway, instrumentMaster, regimeEngine: marketRegime });

// v2 Intelligence API (journal, behavioral, AI copilot, strategy lab)
app.use('/api/v2', createIntelligenceRoutes({
    journal,
    behavioral,
    aiCopilot,
    strategyLab,
    aiContextBuilder
}));

// v2 Intelligence Layer API (signals, claims, thesis, execution, backtest, guardrails, profile, regime, events)
app.use('/api', createIntelligenceV2Routes({
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
    regimeEngine: marketRegime,
    journal,
    behavioral,
    aiCopilot
}));

// ============================================
// V1 COMPATIBILITY ROUTES (preserved from original)
// ============================================

// In-memory user storage
const users = new Map();
const tradeHistory = new Map();

// Create demo user
users.set('demo@college.com', {
    email: 'demo@college.com',
    password: 'password123',
    balance: 100000,
    portfolio: {}
});
console.log('  ✅ Demo user created');

// Auth endpoints
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });
    if (users.has(email)) return res.json({ success: false, message: 'User already exists' });
    users.set(email, { email, password, balance: 100000, portfolio: {} });
    return res.json({ success: true, user: { email, balance: 100000, portfolio: {} } });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });
    const user = users.get(email);
    if (!user || user.password !== password) {
        return res.json({ success: false, message: 'Invalid credentials' });
    }
    return res.json({ success: true, user: { email: user.email, balance: user.balance, portfolio: user.portfolio } });
});

// Market data endpoint (v1 compatible — uses gateway with fallback to demo data)
app.get('/api/market-data', async (req, res) => {
    try {
        const [btc, eth, ada, sol, xrp] = await Promise.allSettled([
            gateway.getQuote('BTC', 'coingecko').catch(() => null),
            gateway.getQuote('ETH', 'coingecko').catch(() => null),
            gateway.getQuote('ADA', 'coingecko').catch(() => null),
            gateway.getQuote('SOL', 'coingecko').catch(() => null),
            gateway.getQuote('XRP', 'coingecko').catch(() => null),
        ]);

        const extract = (r) => r.status === 'fulfilled' && r.value ? r.value : null;

        const toLegacy = (q) => q ? { price: q.price, change: q.changePercent } : { price: 0, change: 0 };

        res.json({
            stocks: {
                'RELIANCE': getDemoStock('RELIANCE'), 'TCS': getDemoStock('TCS'),
                'HDFC': getDemoStock('HDFC'), 'INFY': getDemoStock('INFY'),
                'SBIN': getDemoStock('SBIN'), 'ICICI': getDemoStock('ICICI'),
                'BHARTI': getDemoStock('BHARTI'), 'ITC': getDemoStock('ITC')
            },
            crypto: {
                'BTC': toLegacy(extract(btc)), 'ETH': toLegacy(extract(eth)),
                'ADA': toLegacy(extract(ada)), 'SOL': toLegacy(extract(sol)),
                'XRP': toLegacy(extract(xrp))
            },
            forex: {
                'USD/INR': { price: 83.5, change: 0.1 },
                'EUR/INR': { price: 90.2, change: -0.2 },
                'GBP/INR': { price: 105.8, change: 0.3 },
                'JPY/INR': { price: 0.55, change: -0.01 }
            },
            commodities: {
                'GOLD': { price: 5500 + Math.random() * 200, change: (Math.random() - 0.5) * 3 },
                'SILVER': { price: 68 + Math.random() * 5, change: (Math.random() - 0.5) * 4 },
                'CRUDE': { price: 6200 + Math.random() * 300, change: (Math.random() - 0.5) * 5 }
            },
            timestamp: new Date().toISOString(),
            _meta: { source: isDemoMode ? 'demo' : 'gateway', version: 'v2' }
        });
    } catch (error) {
        // Fallback to pure demo data
        res.json(getAllDemoData());
    }
});

// Trade endpoint (v1 request shape) — delegates to the paper trading service
// so the legacy request shape and the unified terminal share ONE order book
// and ONE price source (previously this path filled at a random price that no
// other screen could reproduce).
app.post('/api/trade', async (req, res) => {
    const { email, symbol, type, quantity, assetType } = req.body;
    if (!email || !symbol || !type || !quantity) {
        return res.json({ success: false, message: 'Missing parameters' });
    }

    const user = users.get(email);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const result = await trading.placeOrder({
        email, symbol, side: type, quantity: Number(quantity), orderType: 'market'
    });
    if (!result.success) {
        return res.json({ success: false, message: result.error });
    }

    const account = result.data.account;
    user.balance = account.balance;
    user.portfolio = {};
    for (const p of account.positions) {
        user.portfolio[p.symbol] = { quantity: p.quantity, avgPrice: p.avgPrice, assetType: p.assetType || assetType };
    }

    return res.json({ success: true, newBalance: user.balance, portfolio: user.portfolio });
});

// Payment endpoint
app.post('/api/payment', (req, res) => {
    const { email, amount } = req.body;
    if (!email || !amount) return res.json({ success: false, message: 'Missing parameters' });
    const user = users.get(email);
    if (!user) return res.json({ success: false, message: 'User not found' });
    user.balance += amount;
    return res.json({ success: true, newBalance: user.balance });
});

// History endpoint — served from the paper trading fill log
app.get('/api/history/:email', (req, res) => {
    const { fills } = trading.getFills(req.params.email, { limit: 500 });
    const history = fills.slice().reverse().map(f => ({
        type: f.side, symbol: f.symbol, quantity: f.quantity, price: f.price,
        totalAmount: parseFloat((f.quantity * f.price).toFixed(2)),
        assetType: undefined, timestamp: f.at
    }));
    res.json({ success: true, history });
});

// Portfolio endpoint — live mark-to-market snapshot in the legacy shape
app.get('/api/portfolio/:email', async (req, res) => {
    const snapshot = await trading.snapshot(req.params.email);
    const portfolio = {};
    for (const p of snapshot.positions) {
        portfolio[p.symbol] = {
            quantity: p.quantity, avgPrice: p.avgPrice, assetType: p.assetType,
            currentPrice: p.currentPrice, pnl: p.unrealizedPnl, pnlPercent: p.unrealizedPnlPercent
        };
    }
    res.json({ success: true, portfolio, balance: snapshot.balance, equity: snapshot.equity });
});

// Stocks list
app.get('/api/stocks', (req, res) => {
    const stocks = instrumentMaster.getByAssetType('stock').map(i => ({
        symbol: i.symbol,
        name: i.companyName,
        sector: i.sector,
        exchange: i.exchange
    }));
    res.json(stocks);
});

// ============================================
// DEMO DATA HELPERS
// ============================================

/**
 * Open a small, deterministic demo book through the real order path.
 * Every fill is priced by the gateway, so the seeded positions obey the same
 * rules as a user-placed order (risk check, journal linkage, commission).
 */
async function seedPaperAccount(trading, gateway) {
    const email = 'demo@college.com';
    const OPEN_POSITIONS = [
        { symbol: 'RELIANCE', quantity: 10, strategy: 'momentum-breakout' },
        { symbol: 'HDFCBANK', quantity: 12, strategy: 'trend-following' },
        { symbol: 'TCS', quantity: 6, strategy: 'momentum-breakout' },
        { symbol: 'TATAMOTORS', quantity: 20, strategy: 'mean-reversion' }
    ];

    try {
        for (const p of OPEN_POSITIONS) {
            const quote = await gateway.getQuote(p.symbol);
            if (!quote || !isFinite(quote.price)) continue;
            await trading.placeOrder({
                email,
                symbol: p.symbol,
                side: 'buy',
                quantity: p.quantity,
                orderType: 'market',
                stopLoss: parseFloat((quote.price * 0.96).toFixed(2)),
                target: parseFloat((quote.price * 1.08).toFixed(2)),
                strategy: p.strategy,
                notes: 'demo book seed',
                acknowledgeGuardrails: true,
                guardrailReason: 'demo seed'
            });
        }

        // Resting limit orders below market — they stay open and are evaluated
        // against fresh quotes by the sweep, exactly like a user's orders.
        for (const rest of [{ symbol: 'INFY', quantity: 5 }, { symbol: 'ITC', quantity: 10 }]) {
            const quote = await gateway.getQuote(rest.symbol);
            if (!quote || !isFinite(quote.price)) continue;
            await trading.placeOrder({
                email,
                symbol: rest.symbol,
                side: 'buy',
                quantity: rest.quantity,
                orderType: 'limit',
                limitPrice: parseFloat((quote.price * 0.94).toFixed(2)),
                strategy: 'mean-reversion',
                notes: 'demo book seed (resting)'
            });
        }

        // One cancelled order so the order history shows a full lifecycle.
        const placeholder = await gateway.getQuote('SBIN');
        if (placeholder && isFinite(placeholder.price)) {
            const placed = await trading.placeOrder({
                email,
                symbol: 'SBIN',
                side: 'buy',
                quantity: 8,
                orderType: 'limit',
                limitPrice: parseFloat((placeholder.price * 0.9).toFixed(2)),
                strategy: 'mean-reversion',
                notes: 'demo book seed (cancelled)'
            });
            if (placed.success) trading.cancelOrder(email, placed.data.order.id);
        }

        console.log('  ✅ Demo paper account seeded');
    } catch (e) {
        console.error('  ⚠️  Demo paper account seed failed:', e.message);
    }
}

function seedDemoHistory(journal, svcs = {}) {
    const email = 'demo@college.com';
    const SYMBOLS = [
        { symbol: 'RELIANCE', sector: 'Energy', base: 2450 },
        { symbol: 'TCS', sector: 'IT', base: 3280 },
        { symbol: 'INFY', sector: 'IT', base: 1520 },
        { symbol: 'HDFCBANK', sector: 'Financial', base: 1645 },
        { symbol: 'ICICIBANK', sector: 'Financial', base: 950 },
        { symbol: 'BHARTIARTL', sector: 'Telecom', base: 890 },
        { symbol: 'LT', sector: 'Infrastructure', base: 3350 },
        { symbol: 'TATAMOTORS', sector: 'Auto', base: 680 },
        { symbol: 'SUNPHARMA', sector: 'Healthcare', base: 1150 },
        { symbol: 'TITAN', sector: 'Consumer', base: 3200 }
    ];
    const STRATEGIES = ['momentum_breakout', 'trend_following', 'mean_reversion', 'sma_crossover', 'breakout_pullback'];
    const REGIMES = ['TRENDING_UP', 'RANGE_BOUND', 'HIGH_VOLATILITY', 'TRENDING_DOWN'];
    const N = 64;

    // Deterministic PRNG (mulberry32) so the labeled demo dataset is identical
    // on every boot. Analytics views then demonstrate the same, reproducible
    // evidence instead of varying with luck.
    let _s = 0x9e3779b9;
    const rnd = () => {
        _s = (_s + 0x6D2B79F5) | 0;
        let t = _s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < N; i++) {
        const meta = SYMBOLS[Math.floor(rnd() * SYMBOLS.length)];
        const strategy = STRATEGIES[i % STRATEGIES.length];
        const regime = REGIMES[Math.floor(rnd() * REGIMES.length)];
        const base = meta.base * (1 + (rnd() - 0.5) * 0.06);

        // Engineered pattern: a run of losses mid-history with size ramping up
        // after each one, so Behavioral Analytics has a real, discoverable
        // pattern (position escalation after losses) to surface.
        const inLossStreak = i >= 8 && i <= 12; // 5 straight losses mid-history
        const escalating = i >= 9 && i <= 12;   // sizes ramp after those losses
        const escalationFactor = escalating ? 1.6 + (i - 8) * 1.1 : 1;
        const quantity = Math.round((5 + rnd() * 12) * escalationFactor);
        const stopLoss = base * (1 - 0.02 - rnd() * 0.01);

        // Direction/outcome engineered so the streak is losses, others mixed
        const forceLoss = inLossStreak;
        const pnlPct = forceLoss
            ? -(0.008 + rnd() * 0.012)
            : (rnd() - 0.42) * 0.03; // ~58% win bias outside streak

        const durationH = 1 + Math.floor(rnd() * 26);
        // Spread the whole trade over the past: openedAt ~ (N-i) days ago,
        // closedAt durationH hours later. closeTrade runs at ~now, so timestamps
        // and the enriched review are corrected afterwards for realism.
        const closedAt = new Date(Date.now() - (N - i) * 15 * 3600000 - Math.floor(rnd() * 8) * 3600000);
        const openedAt = new Date(closedAt.getTime() - durationH * 3600000);
        const entryPrice = parseFloat(base.toFixed(2));
        const exitPrice = parseFloat((entryPrice * (1 + pnlPct)).toFixed(2));

        const trade = journal.openTrade(email, {
            symbol: meta.symbol,
            type: 'buy',
            quantity,
            entryPrice,
            stopLoss,
            target: parseFloat((entryPrice * 1.03).toFixed(2)),
            strategy,
            sector: meta.sector,
            notes: 'Seeded demo trade',
            marketRegime: regime
        });
        // Close through the real pipeline so events + guardrail logs fire.
        if (trade) {
            trade.marketRegime = regime;
            const closed = journal.closeTrade(email, trade.id, exitPrice, {
                regime: { regime, sub: pnlPct >= 0 ? 'BULLISH' : 'BEARISH' }
            });
            if (closed) {
                // Correct timestamps + duration, regenerate the enriched review
                // so every downstream engine sees realistic history.
                closed.openedAt = openedAt.toISOString();
                closed.closedAt = closedAt.toISOString();
                closed.durationHours = parseFloat(durationH.toFixed(2));
                if (svcs.postTradeLearning) {
                    try {
                        closed.review = svcs.postTradeLearning.generateReview(closed, {
                            regime: { regime, sub: pnlPct >= 0 ? 'BULLISH' : 'BEARISH' }
                        });
                    } catch (e) { /* best effort */ }
                }
            }
        }
    }
    console.log(`  ✅ Seeded ${N} demo trades for demo@college.com (labeled DEMO)`);
}

function getDemoStock(symbol) {
    const basePrices = {
        'RELIANCE': 2450, 'TCS': 3280, 'HDFC': 1645, 'INFY': 1520,
        'SBIN': 586, 'ICICI': 950, 'BHARTI': 890, 'ITC': 421,
        'HDFCBANK': 1645, 'ICICIBANK': 950, 'BHARTIARTL': 890,
        'SBIN': 586, 'KOTAKBANK': 1780, 'LT': 3350, 'AXISBANK': 1080,
        'WIPRO': 420, 'TATAMOTORS': 680, 'SUNPHARMA': 1150,
        'MARUTI': 9800, 'BAJFINANCE': 6500, 'TITAN': 3200
    };
    const base = basePrices[symbol] || 1000;
    const jitter = (Math.random() - 0.5) * 0.04;
    const price = base * (1 + jitter);
    return { price: parseFloat(price.toFixed(2)), change: parseFloat((jitter * 100).toFixed(2)) };
}

function getAllDemoData() {
    return {
        stocks: {
            'RELIANCE': getDemoStock('RELIANCE'), 'TCS': getDemoStock('TCS'),
            'HDFC': getDemoStock('HDFC'), 'INFY': getDemoStock('INFY'),
            'SBIN': getDemoStock('SBIN'), 'ICICI': getDemoStock('ICICI'),
            'BHARTI': getDemoStock('BHARTI'), 'ITC': getDemoStock('ITC')
        },
        crypto: {
            'BTC': { price: 65000 + Math.random() * 2000, change: (Math.random() - 0.5) * 5 },
            'ETH': { price: 3500 + Math.random() * 200, change: (Math.random() - 0.5) * 6 },
            'ADA': { price: 0.45 + Math.random() * 0.05, change: (Math.random() - 0.5) * 4 },
            'SOL': { price: 150 + Math.random() * 15, change: (Math.random() - 0.5) * 8 },
            'XRP': { price: 0.52 + Math.random() * 0.05, change: (Math.random() - 0.5) * 5 }
        },
        forex: {
            'USD/INR': { price: 83.5, change: 0.1 },
            'EUR/INR': { price: 90.2, change: -0.2 },
            'GBP/INR': { price: 105.8, change: 0.3 },
            'JPY/INR': { price: 0.55, change: -0.01 }
        },
        commodities: {
            'GOLD': { price: 5500 + Math.random() * 200, change: (Math.random() - 0.5) * 3 },
            'SILVER': { price: 68 + Math.random() * 5, change: (Math.random() - 0.5) * 4 },
            'CRUDE': { price: 6200 + Math.random() * 300, change: (Math.random() - 0.5) * 5 }
        },
        timestamp: new Date().toISOString()
    };
}

// ============================================
// START SERVER
// ============================================
server.listen(PORT, () => {
    console.log(`\n✅ ========================================`);
    console.log(`✅ ProTrader v2 Server — Trading Intelligence OS`);
    console.log(`✅ http://localhost:${PORT}`);
    console.log(`✅ Mode: ${isDemoMode ? 'DEMO (no API keys)' : 'LIVE (providers active)'}`);
    console.log(`✅ WebSocket: ws://localhost:${PORT}/market/ws`);
    console.log(`✅ Market Gateway: ${gateway.getProviderHealth().length} providers`);
    console.log(`✅ Instrument Master: ${instrumentMaster.size} instruments`);
    console.log(`✅ Engines: Screener | Heatmap | Regime | TradeQuality | Risk | Tape`);
    console.log(`✅ Intelligence: Signals | Claims | Thesis | Execution | Guardrails | Profile | Backtest | Matrix`);
    console.log(`✅ ========================================\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    gateway.destroy();
    marketStream.destroy();
    server.close();
    process.exit(0);
});

module.exports = { app, server, gateway, instrumentMaster, marketStream };
