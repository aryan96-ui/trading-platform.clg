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
const sectorHeatmap = new SectorHeatmap(instrumentMaster);
const marketRegime = new MarketRegimeEngine();
const tradeQuality = new TradeQualityEngine(marketRegime);
const riskTerminal = new RiskTerminal();
const marketTape = new MarketTape({ maxSize: 2000, largePrintThreshold: 100000 });

// Phase 4-6 engines
const TradingJournal = require('./src/engine/trading-journal');
const BehavioralAnalytics = require('./src/engine/behavioral-analytics');
const AICopilot = require('./src/engine/ai-copilot');
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
    const closed = originalCloseTrade(email, tradeId, exitPrice);
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
// API ROUTES
// ============================================

// v2 Market API (new professional routes)
app.use('/api/v2', createMarketRoutes(gateway, instrumentMaster, marketStream));

// v2 Engine API (analytics, screener, heatmap, regime, risk, tape)
app.use('/api/v2', createEngineRoutes({
    screener,
    heatmap: sectorHeatmap,
    regime: marketRegime,
    tradeQuality,
    riskTerminal,
    tape: marketTape
}));

// v2 Intelligence API (journal, behavioral, AI copilot, strategy lab)
app.use('/api/v2', createIntelligenceRoutes({
    journal,
    behavioral,
    aiCopilot,
    strategyLab
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

// Trade endpoint
app.post('/api/trade', (req, res) => {
    const { email, symbol, type, quantity, assetType } = req.body;
    if (!email || !symbol || !type || !quantity) {
        return res.json({ success: false, message: 'Missing parameters' });
    }

    const user = users.get(email);
    if (!user) return res.json({ success: false, message: 'User not found' });

    const priceData = getDemoStock(symbol);
    const price = priceData.price;
    const totalAmount = quantity * price;

    if (!user.portfolio) user.portfolio = {};
    if (!user.portfolio[symbol]) {
        user.portfolio[symbol] = { quantity: 0, avgPrice: 0, assetType };
    }

    const holding = user.portfolio[symbol];

    if (type === 'buy') {
        if (totalAmount > user.balance) {
            return res.json({ success: false, message: 'Insufficient balance' });
        }
        const newQty = holding.quantity + quantity;
        holding.avgPrice = ((holding.avgPrice * holding.quantity) + totalAmount) / newQty;
        holding.quantity = newQty;
        user.balance -= totalAmount;
    } else if (type === 'sell') {
        if (holding.quantity < quantity) {
            return res.json({ success: false, message: 'Insufficient holdings' });
        }
        holding.quantity -= quantity;
        user.balance += totalAmount;
        if (holding.quantity === 0) delete user.portfolio[symbol];
    }

    const tradeRecord = { type, symbol, quantity, price, totalAmount, assetType, timestamp: new Date().toISOString() };
    if (!tradeHistory.has(email)) tradeHistory.set(email, []);
    tradeHistory.get(email).push(tradeRecord);

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

// History endpoint
app.get('/api/history/:email', (req, res) => {
    const history = tradeHistory.get(req.params.email) || [];
    res.json({ success: true, history });
});

// Portfolio endpoint
app.get('/api/portfolio/:email', (req, res) => {
    const user = users.get(req.params.email);
    if (!user) return res.json({ success: false, portfolio: {} });
    res.json({ success: true, portfolio: user.portfolio || {} });
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

    for (let i = 0; i < N; i++) {
        const meta = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const strategy = STRATEGIES[i % STRATEGIES.length];
        const regime = REGIMES[Math.floor(Math.random() * REGIMES.length)];
        const base = meta.base * (1 + (Math.random() - 0.5) * 0.06);

        // Bias some streaks so behavioral analytics has real patterns to find
        const inLossStreak = i >= 8 && i <= 12; // 5 straight losses mid-history
        const escalating = i >= 9 && i <= 12;   // sizes grow after those losses
        const quantity = Math.round((5 + Math.random() * 12) * (escalating ? 2.4 : 1));
        const stopLoss = base * (1 - 0.02 - Math.random() * 0.01);

        // Direction/outcome engineered so the streak is losses, others mixed
        const forceLoss = inLossStreak;
        const pnlPct = forceLoss
            ? -(0.008 + Math.random() * 0.012)
            : (Math.random() - 0.42) * 0.03; // ~58% win bias outside streak

        const durationH = 1 + Math.floor(Math.random() * 26);
        // Spread the whole trade over the past: openedAt ~ (N-i) days ago,
        // closedAt durationH hours later. closeTrade runs at ~now, so timestamps
        // and the enriched review are corrected afterwards for realism.
        const closedAt = new Date(Date.now() - (N - i) * 15 * 3600000 - Math.floor(Math.random() * 8) * 3600000);
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
