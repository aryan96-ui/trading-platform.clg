/**
 * ProTrader — Unified Super-Server
 *
 * Combines:
 * 1. REST API v1 (Business): User Auth, MongoDB Persistence, Razorpay Payments
 * 2. REST API v2 (Intelligence): Market Gateway, AI Copilot, Regime Detection, Signals, Guardrails, Backtesting
 * 3. WebSocket Layer: Real-time Market Data Streaming (/market/ws)
 * 4. Unified Frontend: Terminal & Dashboard pages guarded by the Premium Wall (requirePremium)
 */
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const config = require('./config');
const { requirePremium, inMemoryUsers } = require('./middlewares/auth');
const User = require('./models/User');

// ============================================
// CORE ARCHITECTURE IMPORTS (from algorithms & services)
// ============================================
const MarketGateway = require('./src/market-data/gateway');
const MarketStream = require('./src/websocket/market-stream');
const InstrumentMaster = require('./src/instruments/instrument-master');

// Provider adapters
const TwelveDataProvider = require('./src/market-data/providers/twelvedata-provider');
const FinnhubProvider = require('./src/market-data/providers/finnhub-provider');
const AlphaVantageProvider = require('./src/market-data/providers/alphavantage-provider');
const CoinGeckoProvider = require('./src/market-data/providers/coingecko-provider');

// Analytics Engines (from algorithms)
const ScreenerEngine = require('./algorithms/screener-engine');
const SectorHeatmap = require('./algorithms/sector-heatmap');
const MarketRegimeEngine = require('./algorithms/market-regime-engine');
const TradeQualityEngine = require('./algorithms/trade-quality-engine');
const RiskTerminal = require('./algorithms/risk-terminal');
const MarketTape = require('./algorithms/market-tape');

// Intelligence Engines (from algorithms)
const TradingJournal = require('./algorithms/trading-journal');
const BehavioralAnalytics = require('./algorithms/behavioral-analytics');
const AICopilot = require('./algorithms/ai-copilot');
const AIContextBuilder = require('./algorithms/ai-context-builder');
const StrategyLab = require('./algorithms/strategy-lab');
const EventBus = require('./algorithms/event-bus');
const EvidenceEngine = require('./algorithms/evidence-engine');
const { SignalRankingEngine, SignalConflictEngine } = require('./algorithms/signal-engine');
const { PreTradeRiskCheck, PortfolioHeat, PositionSizingEngine } = require('./algorithms/pre-trade-risk');
const TradeThesisService = require('./algorithms/trade-thesis');
const PostTradeLearningEngine = require('./algorithms/post-trade-learning');
const ExecutionQualityAnalytics = require('./algorithms/execution-quality');
const GuardrailEngine = require('./algorithms/guardrails');
const TraderProfile = require('./algorithms/trader-profile');
const StrategyRegimeMatrix = require('./algorithms/strategy-regime-matrix');
const BacktestEngine = require('./algorithms/backtest-engine');
const ClaimVerificationEngine = require('./algorithms/claim-verification');

// Paper Trading Service
const PaperTradingService = require('./src/trading/paper-trading');
const { computeExcursions } = require('./src/trading/excursions');

// Route Modules
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const buildIntelligenceRouter = require('./routes/intelligence');
const aiRoutes = require('./routes/aiRoutes');
const algoRoutes = require('./routes/algoRoutes');
const marketRoutes = require('./routes/marketRoutes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || config.PORT || 3000;

// ============================================
// SECURITY & BODY PARSING MIDDLEWARE
// ============================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email', 'x-access-token', 'x-api-key']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure DNS servers for reliable MongoDB SRV lookups in cloud/local environments
const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) { }

// ============================================
// DATABASE INITIALIZATION (Atlas + In-Memory Fallback)
// ============================================
console.log('🔄 Checking Database connection...');
let isMongoDBConnected = false;

// Seed demo user in-memory immediately so auth is instant on boot
inMemoryUsers.set('demo@college.com', {
    name: 'Demo Trader',
    email: 'demo@college.com',
    password: 'password123',
    balance: 100000,
    portfolio: {},
    isPremium: true,
    tierLevel: 'pro',
    plan: 'PRO'
});

const mongoUri = process.env.MONGODB_URI || config.MONGODB_URI;
const isPlaceholderCluster = mongoUri && mongoUri.includes('cluster0.gfxhtlt.mongodb.net');

if (isPlaceholderCluster) {
    console.log('⚠️ MongoDB URI in .env uses an inactive cluster URL. Running in high-performance IN-MEMORY MODE.');
    console.log('💡 To persist to MongoDB, update MONGODB_URI in your .env or cloud environment settings.');
} else if (mongoUri) {
    mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 3000,
        family: 4
    })
        .then(async () => {
            isMongoDBConnected = true;
            console.log('✅ Connected to MongoDB');
            try {
                const demoUser = await User.findOne({ email: 'demo@college.com' });
                if (!demoUser) {
                    await User.create({
                        name: 'Demo Trader',
                        email: 'demo@college.com',
                        password: 'password123',
                        balance: 100000,
                        portfolio: {},
                        isPremium: true,
                        tierLevel: 'pro',
                        plan: 'PRO'
                    });
                    console.log('✅ Demo user seeded in MongoDB (Pro Tier)');
                }
            } catch (e) {
                console.log('⚠️ Could not verify demo user in MongoDB:', e.message);
            }
        })
        .catch((err) => {
            console.log('⚠️ MongoDB offline or unreachable (' + (err.code || err.message) + '). Running seamlessly in IN-MEMORY MODE.');
            isMongoDBConnected = false;
        });
} else {
    console.log('ℹ️ No MONGODB_URI configured. Running in IN-MEMORY MODE.');
}

// ============================================
// MARKET DATA GATEWAY & PROVIDERS
// ============================================
console.log('🔄 Initializing Market Data Gateway...');
const isDemoMode = !process.env.TWELVEDATA_API_KEY && !process.env.FINNHUB_API_KEY && !process.env.ALPHAVANTAGE_API_KEY;
const gateway = new MarketGateway({ isDemoMode });

if (process.env.TWELVEDATA_API_KEY) {
    gateway.registerProvider(new TwelveDataProvider({ apiKey: process.env.TWELVEDATA_API_KEY }));
}
if (process.env.FINNHUB_API_KEY) {
    gateway.registerProvider(new FinnhubProvider({ apiKey: process.env.FINNHUB_API_KEY }));
}
if (process.env.ALPHAVANTAGE_API_KEY) {
    gateway.registerProvider(new AlphaVantageProvider({ apiKey: process.env.ALPHAVANTAGE_API_KEY }));
}
gateway.registerProvider(new CoinGeckoProvider());

if (isDemoMode) {
    const DemoProvider = require('./src/market-data/providers/demo-provider');
    gateway.registerProvider(new DemoProvider());
    console.log('  ⚠️ Demo provider registered (all quotes labeled DEMO DATA)');
}

// ============================================
// INSTRUMENT MASTER & WEBSOCKET STREAM
// ============================================
const instrumentMaster = new InstrumentMaster();
gateway.setInstrumentMaster(instrumentMaster);
console.log(`  ✅ ${instrumentMaster.size} instruments loaded`);

console.log('🔄 Initializing WebSocket Market Stream...');
const marketStream = new MarketStream(gateway, { isDemoMode, updateInterval: 3000 });
marketStream.start(server);
console.log('  ✅ WebSocket server attached at /market/ws');

// ============================================
// ANALYTICS & INTELLIGENCE ENGINES
// ============================================
const screener = new ScreenerEngine(instrumentMaster, gateway);
const sectorHeatmap = new SectorHeatmap(instrumentMaster, gateway);
const marketRegime = new MarketRegimeEngine();
const tradeQuality = new TradeQualityEngine(marketRegime);
const riskTerminal = new RiskTerminal();
const marketTape = new MarketTape({ maxSize: 2000, largePrintThreshold: 100000 });

const journal = new TradingJournal();
const behavioral = new BehavioralAnalytics();
const aiCopilot = new AICopilot({ enabled: true });
const strategyLab = new StrategyLab(journal);
const aiContextBuilder = new AIContextBuilder({ gateway, instrumentMaster, regimeEngine: marketRegime });

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

// Event-bus wiring: auto-review closed trades + guardrail logging
journal.trades.set = ((original) => function (key, value) {
    const result = original.call(this, key, value);
    try { eventBus.tradeClosed(value[value.length - 1]); } catch (e) { }
    return result;
})(journal.trades.set);

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
            guardrails.recordOutcome(email, null, { pnl: closed.pnl, result: closed.pnl >= 0 ? 'win' : 'loss' });
        } catch (e) {
            console.error('[intelligence] trade review hook error:', e.message);
        }
    }
    return closed;
};

// Feed WebSocket quotes into market tape
marketStream.on('quote', (quote) => {
    marketTape.add(quote);
});

// Seed demo trades history
seedDemoHistory(journal, { postTradeLearning });

// ============================================
// PAPER TRADING SERVICE
// ============================================
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

// Sweep resting limit orders against live prices
setInterval(() => {
    trading.tryFillOpenOrders().catch(e => console.error('[trading] resting order sweep failed:', e.message));
}, 15000).unref?.();

// Seed initial paper trading account
seedPaperAccount(trading, gateway);

// ============================================
// THE PREMIUM WALL: Route Gate for terminal.html
// ============================================
app.get(['/terminal.html', '/terminal'], async (req, res, next) => {
    const email = req.query.email || req.headers['x-user-email'];
    if (!email) {
        // Allow the page to load; the client-side security script will redirect
        // to pricing.html if no valid session or if non-premium.
        return next();
    }

    try {
        let isPrem = false;
        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ email: email.toLowerCase().trim() }).select('isPremium tierLevel');
            if (user && (user.isPremium || user.tierLevel === 'pro' || user.tierLevel === 'enterprise')) {
                isPrem = true;
            }
        }
        if (!isPrem && inMemoryUsers.has(email.toLowerCase().trim())) {
            const mem = inMemoryUsers.get(email.toLowerCase().trim());
            if (mem && (mem.isPremium || mem.tierLevel === 'pro' || mem.tierLevel === 'enterprise')) {
                isPrem = true;
            }
        }

        if (!isPrem) {
            return res.redirect('/pricing.html?reason=premium_required');
        }
    } catch (err) {
        console.error('Terminal guard check error:', err.message);
    }
    next();
});

// Health check endpoints for cloud monitoring & deployment
app.get(['/health', '/api/health'], (req, res) => {
    res.json({
        status: 'UP',
        service: 'protrader-super-server',
        database: isMongoDBConnected ? 'connected' : 'in-memory',
        instruments: instrumentMaster ? instrumentMaster.size : 0,
        timestamp: new Date().toISOString()
    });
});

// Legacy dashboard redirects to ensure backward compatibility
app.get(['/dashboard-standalone.html', '/dashboard.html', '/dashboard-pro.html', '/dashboard'], (req, res) => {
    res.redirect('/terminal.html');
});

// Serve Static Frontend Assets
app.use(express.static(__dirname));

// ============================================
// MOUNT MODULAR API ROUTES
// ============================================

// 1. Business Layer: Auth
app.use('/api/auth', authRoutes);
app.use('/api', authRoutes); // Backward compatibility: /api/register, /api/login, /api/me

// 2. Business Layer: Payments (Razorpay & Deposits)
app.use('/api', paymentRoutes); // /api/create-order, /api/verify-payment, /api/payment

// 3. Market Data & Candlestick Service
app.use('/api', marketRoutes);

// 4. Intelligence Layer: API v2 and Intelligence Engine Routes
const { v2Router, intelV2 } = buildIntelligenceRouter({
    gateway, instrumentMaster, marketStream,
    screener, heatmap: sectorHeatmap, regime: marketRegime, tradeQuality, riskTerminal, tape: marketTape,
    journal, behavioral, aiCopilot, strategyLab, aiContextBuilder,
    trading, eventBus, signalRanking, signalConflict,
    preTradeRisk, portfolioHeat, positionSizing, thesisService,
    postTradeLearning, executionQuality, guardrails,
    traderProfile, strategyMatrix, backtestEngine, claimVerification
});

app.use('/api/v2', v2Router);
app.use('/api', intelV2);
app.use('/api', aiRoutes);
app.use('/api', algoRoutes);

// ============================================
// V1 LEGACY COMPATIBILITY ENDPOINTS
// ============================================
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
            _meta: { source: isDemoMode ? 'demo' : 'gateway', version: 'super-server' }
        });
    } catch (error) {
        res.json(getAllDemoData());
    }
});

app.post('/api/trade', async (req, res) => {
    const { email, symbol, type, quantity, assetType, stopLoss, target, acknowledgeGuardrails, guardrailReason, riskGateToken } = req.body;
    if (!email || !symbol || !type || !quantity) {
        return res.json({ success: false, message: 'Missing parameters' });
    }

    const result = await trading.placeOrder({
        email,
        symbol,
        side: type.toLowerCase(),
        quantity: Number(quantity),
        orderType: 'market',
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        target: target ? Number(target) : undefined,
        acknowledgeGuardrails: acknowledgeGuardrails !== undefined ? acknowledgeGuardrails : true,
        guardrailReason: guardrailReason || (riskGateToken ? 'risk-gate-verified' : 'api-order-override')
    });
    if (!result.success) {
        return res.json({ success: false, message: result.error });
    }

    const account = result.data.account;
    const portfolio = {};
    for (const p of account.positions) {
        portfolio[p.symbol] = { quantity: p.quantity, avgPrice: p.avgPrice, assetType: p.assetType || assetType };
    }

    // Keep MongoDB and in-memory User balance/portfolio in sync
    if (mongoose.connection.readyState === 1) {
        try {
            await User.updateOne({ email }, { balance: account.balance, portfolio });
        } catch (e) { }
    }
    const memUser = inMemoryUsers.get(email);
    if (memUser) {
        memUser.balance = account.balance;
        memUser.portfolio = portfolio;
    }

    return res.json({ success: true, trade: result.data.order, newBalance: account.balance, portfolio });
});

app.get('/api/history/:email', (req, res) => {
    const { fills } = trading.getFills(req.params.email, { limit: 500 });
    const history = fills.slice().reverse().map(f => ({
        type: f.side, symbol: f.symbol, quantity: f.quantity, price: f.price,
        totalAmount: parseFloat((f.quantity * f.price).toFixed(2)),
        timestamp: f.at
    }));
    res.json({ success: true, history });
});

app.get(['/api/portfolio', '/api/portfolio/:email'], async (req, res) => {
    const email = req.params.email || req.query.email || 'demo@college.com';
    const snapshot = await trading.snapshot(email);
    const portfolio = {};
    for (const p of snapshot.positions) {
        portfolio[p.symbol] = {
            quantity: p.quantity, avgPrice: p.avgPrice, assetType: p.assetType,
            currentPrice: p.currentPrice, pnl: p.unrealizedPnl, pnlPercent: p.unrealizedPnlPercent
        };
    }
    res.json({ success: true, portfolio, balance: snapshot.balance, equity: snapshot.equity });
});

app.get('/api/stocks', (req, res) => {
    const stocks = instrumentMaster.getByAssetType('stock').map(i => ({
        symbol: i.symbol,
        name: i.companyName,
        sector: i.sector,
        exchange: i.exchange
    }));
    res.json(stocks);
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'UP',
        server: 'ProTrader Super-Server',
        port: PORT,
        timestamp: new Date().toISOString(),
        database: isMongoDBConnected ? 'MongoDB Atlas (Connected)' : 'In-Memory Mode (Active)',
        providers: gateway.getProviderHealth().length,
        instruments: instrumentMaster.size,
        websocket: 'ws://localhost:' + PORT + '/market/ws'
    });
});

// ============================================
// SEEDING HELPERS & DEMO DATA
// ============================================
async function seedPaperAccount(tradingService, gw) {
    const email = 'demo@college.com';
    const OPEN_POSITIONS = [
        { symbol: 'RELIANCE', quantity: 10, strategy: 'momentum-breakout' },
        { symbol: 'HDFCBANK', quantity: 12, strategy: 'trend-following' },
        { symbol: 'TCS', quantity: 6, strategy: 'momentum-breakout' },
        { symbol: 'TATAMOTORS', quantity: 20, strategy: 'mean-reversion' }
    ];

    try {
        for (const p of OPEN_POSITIONS) {
            const quote = await gw.getQuote(p.symbol);
            if (!quote || !isFinite(quote.price)) continue;
            await tradingService.placeOrder({
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
        console.log('  ✅ Demo paper account seeded with live quotes');
    } catch (e) {
        console.error('  ⚠️ Demo paper account seed failed:', e.message);
    }
}

function seedDemoHistory(journalInstance, svcs = {}) {
    const email = 'demo@college.com';
    const SYMBOLS = [
        { symbol: 'RELIANCE', sector: 'Energy', base: 2450 },
        { symbol: 'TCS', sector: 'IT', base: 3280 },
        { symbol: 'INFY', sector: 'IT', base: 1520 },
        { symbol: 'HDFCBANK', sector: 'Financial', base: 1645 },
        { symbol: 'ICICIBANK', sector: 'Financial', base: 950 },
        { symbol: 'BHARTIARTL', sector: 'Telecom', base: 890 }
    ];
    const STRATEGIES = ['momentum_breakout', 'trend_following', 'mean_reversion'];
    const REGIMES = ['TRENDING_UP', 'RANGE_BOUND', 'HIGH_VOLATILITY'];
    const N = 24;

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
        const base = meta.base * (1 + (rnd() - 0.5) * 0.05);
        const quantity = Math.round(5 + rnd() * 10);
        const pnlPct = (rnd() - 0.42) * 0.03;
        const entryPrice = parseFloat(base.toFixed(2));
        const exitPrice = parseFloat((entryPrice * (1 + pnlPct)).toFixed(2));

        const trade = journalInstance.openTrade(email, {
            symbol: meta.symbol,
            type: 'buy',
            quantity,
            entryPrice,
            stopLoss: parseFloat((entryPrice * 0.97).toFixed(2)),
            target: parseFloat((entryPrice * 1.05).toFixed(2)),
            strategy,
            sector: meta.sector,
            notes: 'Seeded demo trade',
            marketRegime: regime
        });

        if (trade) {
            trade.marketRegime = regime;
            journalInstance.closeTrade(email, trade.id, exitPrice, {
                regime: { regime, sub: pnlPct >= 0 ? 'BULLISH' : 'BEARISH' }
            });
        }
    }
    console.log(`  ✅ Seeded ${N} demo trades for demo@college.com`);
}

function getDemoStock(symbol) {
    const basePrices = {
        'RELIANCE': 2450, 'TCS': 3280, 'HDFC': 1645, 'INFY': 1520,
        'SBIN': 586, 'ICICI': 950, 'BHARTI': 890, 'ITC': 421
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
            'HDFC': getDemoStock('HDFC'), 'INFY': getDemoStock('INFY')
        },
        crypto: {
            'BTC': { price: 65000, change: 2.1 },
            'ETH': { price: 3500, change: 1.4 }
        },
        timestamp: new Date().toISOString()
    };
}

// ============================================
// START SERVER
// ============================================
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`\n==================================================`);
        console.log(`🚀 ProTrader Super-Server ACTIVE on http://localhost:${PORT}`);
        console.log(`📡 WebSocket Real-time Feed: ws://localhost:${PORT}/market/ws`);
        console.log(`💳 Razorpay & Auth Layer: Online on port ${PORT}`);
        console.log(`🤖 AI Copilot & Quant Suite: Guarded by requirePremium`);
        console.log(`==================================================\n`);
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    gateway.destroy();
    marketStream.destroy();
    server.close();
    process.exit(0);
});

module.exports = { app, server, gateway, instrumentMaster, marketStream, trading };
