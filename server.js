// server.js - Enhanced Backend with Real Market Data APIs
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Initialize Razorpay only if credentials are provided
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay initialized successfully');
} else {
    console.log('⚠️  Razorpay credentials not found in .env - Payment features disabled');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve static files (HTML, CSS, JS)

// User schema & model
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 100000 },
    portfolio: { type: Object, default: {} },
    // Premium fields
    isPremium: { type: Boolean, default: false },
    stripeCustomerId: { type: String },
    subscriptionId: { type: String },
    tierLevel: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' }
});
const User = mongoose.model('User', userSchema);

// Premium‑only middleware
const requirePremium = async (req, res, next) => {
    const email = req.headers['x-user-email']; // demo auth header
    if (!email) return res.status(401).json({ success: false, message: 'Unauthenticated' });
    let user;
    if (isMongoDBConnected) {
        user = await User.findOne({ email }).select('isPremium');
    } else {
        user = inMemoryUsers.get(email);
    }
    if (!user || !user.isPremium) {
        return res.status(403).json({ success: false, message: 'Premium subscription required' });
    }
    req.user = { email, isPremium: true };
    next();
};

// In-memory fallback storage (when MongoDB is unavailable)
const inMemoryUsers = new Map();
let isMongoDBConnected = false;

// In‑memory trade history
const tradeHistory = new Map();

// Connect to MongoDB with better timeout settings
console.log('🔄 Attempting to connect to MongoDB Atlas...');
mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s for faster fallback
    socketTimeoutMS: 45000,
    family: 4 // Use IPv4, skip trying IPv6 (faster connection)
})
    .then(async () => {
        console.log('✅ Successfully connected to MongoDB Atlas');
        console.log('✅ Database: trading');
        isMongoDBConnected = true;
        try {
            const demoUser = await User.findOne({ email: 'demo@college.com' });
            if (!demoUser) {
                await User.create({ email: 'demo@college.com', password: 'password123', balance: 100000, portfolio: {}, isPremium: false });
                console.log('✅ Demo user created in MongoDB');
            } else {
                console.log('✅ Demo user already exists in MongoDB');
            }
        } catch (err) {
            console.log('⚠️  Could not create demo user:', err.message);
        }
    })
    .catch(err => {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ MongoDB Connection FAILED');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Error: ' + err.message);
        console.log('');
        console.log('📋 Common Fixes:');
        console.log('  1. Check your internet connection');
        console.log('  2. Whitelist your IP in MongoDB Atlas:');
        console.log('     - Go to Network Access in MongoDB Atlas');
        console.log('     - Add your current IP or use 0.0.0.0/0 (allow all)');
        console.log('  3. Verify MongoDB credentials in .env file');
        console.log('  4. Check if MongoDB Atlas cluster is running');
        console.log('');
        console.log('⚠️  SERVER WILL CONTINUE IN IN-MEMORY MODE');
        console.log('⚠️  Data will NOT persist after server restart');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');

        // Create demo user in memory
        inMemoryUsers.set('demo@college.com', {
            email: 'demo@college.com',
            password: 'password123',
            balance: 100000,
            portfolio: {},
            isPremium: false
        });
        console.log('✅ Demo user created in IN-MEMORY storage');
    });

// ============================================
// MARKET DATA CLASS - Real API Integration
// ============================================
class MarketDataService {
    constructor() {
        this.cache = {};
        this.cacheTimeout = 60000; // 1 minute cache
    }

    // Get real crypto prices from CoinGecko (Free, no API key)
    async getCryptoPrice(coinId) {
        try {
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=inr&include_24hr_change=true`,
                { timeout: 5000 }
            );
            return {
                price: response.data[coinId].inr,
                change: response.data[coinId].inr_24h_change || 0
            };
        } catch (error) {
            console.log(`CoinGecko API failed for ${coinId}, using mock data`);
            return this.getMockCryptoPrice(coinId);
        }
    }

    // Get forex rates from exchangerate-api (Free)
    async getForexRate(from, to = 'INR') {
        try {
            const response = await axios.get(
                `https://api.exchangerate-api.com/v4/latest/${from}`,
                { timeout: 5000 }
            );
            return {
                price: response.data.rates[to],
                change: (Math.random() - 0.5) * 0.5
            };
        } catch (error) {
            console.log(`Forex API failed for ${from}/${to}, using mock data`);
            return this.getMockForexRate(from, to);
        }
    }

    // Mock data fallbacks
    getMockCryptoPrice(coinId) {
        const mockPrices = {
            'bitcoin': { price: 3500000 + Math.random() * 100000, change: (Math.random() - 0.5) * 8 },
            'ethereum': { price: 200000 + Math.random() * 10000, change: (Math.random() - 0.5) * 10 },
            'cardano': { price: 45 + Math.random() * 10, change: (Math.random() - 0.5) * 5 },
            'solana': { price: 6500 + Math.random() * 500, change: (Math.random() - 0.5) * 12 },
            'ripple': { price: 50 + Math.random() * 5, change: (Math.random() - 0.5) * 6 }
        };
        return mockPrices[coinId] || { price: 1000, change: 0 };
    }

    getMockStockPrice(symbol) {
        const mockPrices = {
            'RELIANCE': { price: 2450.25 + Math.random() * 100, change: (Math.random() - 0.5) * 5 },
            'TCS': { price: 3278.50 + Math.random() * 200, change: (Math.random() - 0.5) * 4 },
            'HDFC': { price: 1645.75 + Math.random() * 100, change: (Math.random() - 0.5) * 3 },
            'INFY': { price: 1520.40 + Math.random() * 80, change: (Math.random() - 0.5) * 6 },
            'SBIN': { price: 585.60 + Math.random() * 50, change: (Math.random() - 0.5) * 4 },
            'ICICI': { price: 950.30 + Math.random() * 70, change: (Math.random() - 0.5) * 3 },
            'BHARTI': { price: 890.45 + Math.random() * 60, change: (Math.random() - 0.5) * 4 },
            'ITC': { price: 420.80 + Math.random() * 30, change: (Math.random() - 0.5) * 2 }
        };
        return mockPrices[symbol] || { price: 1000, change: 0 };
    }

    getMockForexRate(from, to) {
        const mockRates = {
            'USD': { price: 83.5 + Math.random() * 0.5, change: (Math.random() - 0.5) * 0.3 },
            'EUR': { price: 90.2 + Math.random() * 0.8, change: (Math.random() - 0.5) * 0.5 },
            'GBP': { price: 105.8 + Math.random() * 1.2, change: (Math.random() - 0.5) * 0.6 },
            'JPY': { price: 0.55 + Math.random() * 0.05, change: (Math.random() - 0.5) * 0.02 }
        };
        return mockRates[from] || { price: 75, change: 0 };
    }

    getMockCommodityPrice(commodity) {
        const mockPrices = {
            'GOLD': { price: 5500 + Math.random() * 200, change: (Math.random() - 0.5) * 3 },
            'SILVER': { price: 68 + Math.random() * 5, change: (Math.random() - 0.5) * 4 },
            'CRUDE': { price: 6200 + Math.random() * 300, change: (Math.random() - 0.5) * 5 }
        };
        return mockPrices[commodity] || { price: 1000, change: 0 };
    }

    // Get all market data
    async getAllMarketData() {
        const cacheKey = 'all_market_data';
        const cached = this.cache[cacheKey];

        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            return cached.data;
        }

        try {
            // Fetch real crypto prices
            const [bitcoin, ethereum, cardano, solana, ripple] = await Promise.all([
                this.getCryptoPrice('bitcoin'),
                this.getCryptoPrice('ethereum'),
                this.getCryptoPrice('cardano'),
                this.getCryptoPrice('solana'),
                this.getCryptoPrice('ripple')
            ]);

            // Fetch real forex rates
            const [usd, eur, gbp, jpy] = await Promise.all([
                this.getForexRate('USD'),
                this.getForexRate('EUR'),
                this.getForexRate('GBP'),
                this.getForexRate('JPY')
            ]);

            const data = {
                stocks: {
                    'RELIANCE': this.getMockStockPrice('RELIANCE'),
                    'TCS': this.getMockStockPrice('TCS'),
                    'HDFC': this.getMockStockPrice('HDFC'),
                    'INFY': this.getMockStockPrice('INFY'),
                    'SBIN': this.getMockStockPrice('SBIN'),
                    'ICICI': this.getMockStockPrice('ICICI'),
                    'BHARTI': this.getMockStockPrice('BHARTI'),
                    'ITC': this.getMockStockPrice('ITC')
                },
                crypto: {
                    'BTC': bitcoin,
                    'ETH': ethereum,
                    'ADA': cardano,
                    'SOL': solana,
                    'XRP': ripple
                },
                forex: {
                    'USD/INR': usd,
                    'EUR/INR': eur,
                    'GBP/INR': gbp,
                    'JPY/INR': jpy
                },
                commodities: {
                    'GOLD': this.getMockCommodityPrice('GOLD'),
                    'SILVER': this.getMockCommodityPrice('SILVER'),
                    'CRUDE': this.getMockCommodityPrice('CRUDE')
                },
                timestamp: new Date().toISOString()
            };

            this.cache[cacheKey] = { timestamp: Date.now(), data };
            return data;
        } catch (error) {
            console.error('Market data fetch error:', error.message);
            return this.getMockAllData();
        }
    }

    getMockAllData() {
        return {
            stocks: {
                'RELIANCE': this.getMockStockPrice('RELIANCE'),
                'TCS': this.getMockStockPrice('TCS'),
                'HDFC': this.getMockStockPrice('HDFC'),
                'INFY': this.getMockStockPrice('INFY'),
                'SBIN': this.getMockStockPrice('SBIN'),
                'ICICI': this.getMockStockPrice('ICICI'),
                'BHARTI': this.getMockStockPrice('BHARTI'),
                'ITC': this.getMockStockPrice('ITC')
            },
            crypto: {
                'BTC': this.getMockCryptoPrice('bitcoin'),
                'ETH': this.getMockCryptoPrice('ethereum'),
                'ADA': this.getMockCryptoPrice('cardano'),
                'SOL': this.getMockCryptoPrice('solana'),
                'XRP': this.getMockCryptoPrice('ripple')
            },
            forex: {
                'USD/INR': this.getMockForexRate('USD'),
                'EUR/INR': this.getMockForexRate('EUR'),
                'GBP/INR': this.getMockForexRate('GBP'),
                'JPY/INR': this.getMockForexRate('JPY')
            },
            commodities: {
                'GOLD': this.getMockCommodityPrice('GOLD'),
                'SILVER': this.getMockCommodityPrice('SILVER'),
                'CRUDE': this.getMockCommodityPrice('CRUDE')
            },
            timestamp: new Date().toISOString()
        };
    }
}

const marketDataService = new MarketDataService();

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/', (req, res) => {
    res.send('ProTrader Backend - Multi-Asset Trading Platform');
});

// Auth endpoints
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });

    if (isMongoDBConnected) {
        // Use MongoDB
        try {
            const existing = await User.findOne({ email });
            if (existing) return res.json({ success: false, message: 'User already exists' });
            const newUser = await User.create({ email, password, balance: 100000, portfolio: {} });
            return res.json({ success: true, user: { email: newUser.email, balance: newUser.balance, portfolio: newUser.portfolio } });
        } catch (err) {
            console.error(err);
            return res.json({ success: false, message: 'Server error' });
        }
    } else {
        // Use in-memory storage
        if (inMemoryUsers.has(email)) {
            return res.json({ success: false, message: 'User already exists' });
        }
        inMemoryUsers.set(email, { email, password, balance: 100000, portfolio: {} });
        return res.json({ success: true, user: { email, balance: 100000, portfolio: {} } });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });

    if (isMongoDBConnected) {
        // Use MongoDB
        try {
            const user = await User.findOne({ email, password });
            if (!user) return res.json({ success: false, message: 'Invalid credentials' });
            return res.json({ success: true, user: { email: user.email, balance: user.balance, portfolio: user.portfolio || {} } });
        } catch (err) {
            console.error(err);
            return res.json({ success: false, message: 'Server error' });
        }
    } else {
        // Use in-memory storage
        const user = inMemoryUsers.get(email);
        if (!user || user.password !== password) {
            return res.json({ success: false, message: 'Invalid credentials' });
        }
        return res.json({ success: true, user: { email: user.email, balance: user.balance, portfolio: user.portfolio || {} } });
    }
});

// Market data endpoint
app.get('/api/market-data', async (req, res) => {
    try {
        const data = await marketDataService.getAllMarketData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});

// Razorpay order creation endpoint
app.post('/api/create-order', async (req, res) => {
    if (!razorpay) {
        return res.status(503).json({ error: 'Payment gateway not configured. Please add Razorpay credentials to .env' });
    }
    const { amount, currency = 'INR', receipt } = req.body; // amount in smallest currency unit (e.g., paise)
    try {
        const options = {
            amount: amount, // e.g., 49900 for ₹499.00
            currency: currency,
            receipt: receipt || `receipt_${Date.now()}`,
            payment_capture: 1
        };
        const order = await razorpay.orders.create(options);
        res.json({ id: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt });
    } catch (err) {
        console.error('Razorpay order creation error:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Razorpay payment verification endpoint
app.post('/api/verify-payment', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email } = req.body;
    // Verify signature
    const generated_signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');
    if (generated_signature !== razorpay_signature) {
        return res.json({ success: false, message: 'Signature verification failed' });
    }
    // Save payment record
    const Payment = require('./models/Payment');
    await Payment.create({
        userId: email,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        amount: req.body.amount,
        status: 'SUCCESS'
    });
    // Activate Pro plan for user
    if (isMongoDBConnected) {
        await User.updateOne({ email }, { isPremium: true, plan: 'PRO' });
    } else {
        const memUser = inMemoryUsers.get(email);
        if (memUser) { memUser.isPremium = true; memUser.plan = 'PRO'; inMemoryUsers.set(email, memUser); }
    }
    res.json({ success: true, message: 'Payment verified and plan activated' });
});

// Enhanced trade endpoint with multi-asset support
app.post('/api/trade', async (req, res) => {
    const { email, symbol, type, quantity, assetType } = req.body;
    if (!email || !symbol || !type || !quantity) {
        return res.json({ success: false, message: 'Missing parameters' });
    }
    try {
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false, message: 'User not found' });

        // Get current market price
        const marketData = await marketDataService.getAllMarketData();
        let priceData;

        switch (assetType) {
            case 'crypto':
                priceData = marketData.crypto[symbol];
                break;
            case 'forex':
                priceData = marketData.forex[symbol];
                break;
            case 'commodities':
                priceData = marketData.commodities[symbol];
                break;
            default: // stocks
                priceData = marketData.stocks[symbol];
        }

        if (!priceData) return res.json({ success: false, message: 'Invalid symbol' });

        const price = priceData.price;
        const totalAmount = quantity * price;

        // Initialize portfolio if needed
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

        await user.save();

        // Record trade
        const tradeRecord = { type, symbol, quantity, price, totalAmount, assetType, timestamp: new Date().toISOString() };
        if (!tradeHistory.has(email)) tradeHistory.set(email, []);
        tradeHistory.get(email).push(tradeRecord);

        return res.json({ success: true, newBalance: user.balance, portfolio: user.portfolio });
    } catch (err) {
        console.error(err);
        return res.json({ success: false, message: 'Server error' });
    }
});

// Payment endpoint
app.post('/api/payment', async (req, res) => {
    const { email, amount } = req.body;
    if (!email || !amount) return res.json({ success: false, message: 'Missing parameters' });
    try {
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false, message: 'User not found' });
        user.balance += amount;
        await user.save();
        return res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        console.error(err);
        return res.json({ success: false, message: 'Server error' });
    }
});

// Trade history endpoint
app.get('/api/history/:email', (req, res) => {
    const { email } = req.params;
    const history = tradeHistory.get(email) || [];
    res.json({ success: true, history });
});

// Portfolio endpoint
app.get('/api/portfolio/:email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.params.email });
        if (!user) return res.json({ success: false, portfolio: {} });
        res.json({ success: true, portfolio: user.portfolio || {} });
    } catch (err) {
        res.json({ success: false, portfolio: {} });
    }
});

// Stocks list endpoint
app.get('/api/stocks', (req, res) => {
    const stocks = [
        { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.' },
        { symbol: 'TCS', name: 'Tata Consultancy Services' },
        { symbol: 'HDFC', name: 'HDFC Bank Ltd.' },
        { symbol: 'INFY', name: 'Infosys Ltd.' },
        { symbol: 'SBIN', name: 'State Bank of India' },
        { symbol: 'ICICI', name: 'ICICI Bank Ltd.' },
        { symbol: 'BHARTI', name: 'Bharti Airtel Ltd.' },
        { symbol: 'ITC', name: 'ITC Ltd.' }
    ];
    res.json(stocks);
});

// AI Insights (premium) - Enhanced with real calculations
app.get('/api/ai/predict', requirePremium, async (req, res) => {
    const { symbol = 'TCS' } = req.query;

    try {
        // Get current market data
        const marketData = await marketDataService.getAllMarketData();
        let currentPrice;
        let assetType = 'stocks';

        // Find the asset
        if (marketData.stocks[symbol]) {
            currentPrice = marketData.stocks[symbol].price;
            assetType = 'stocks';
        } else if (marketData.crypto[symbol]) {
            currentPrice = marketData.crypto[symbol].price;
            assetType = 'crypto';
        } else if (marketData.commodities[symbol]) {
            currentPrice = marketData.commodities[symbol].price;
            assetType = 'commodities';
        } else {
            return res.json({ success: false, message: 'Symbol not found' });
        }

        // Generate historical trend (simulate last 30 days)
        const historicalData = [];
        for (let i = 29; i >= 0; i--) {
            const variance = (Math.random() - 0.5) * (currentPrice * 0.03);
            historicalData.push(currentPrice + variance);
        }

        // Calculate technical indicators for AI prediction
        const sma10 = historicalData.slice(-10).reduce((a, b) => a + b, 0) / 10;
        const sma20 = historicalData.reduce((a, b) => a + b, 0) / 30;
        const momentum = ((currentPrice - historicalData[0]) / historicalData[0]) * 100;

        // Calculate volatility
        const returns = [];
        for (let i = 1; i < historicalData.length; i++) {
            returns.push((historicalData[i] - historicalData[i - 1]) / historicalData[i - 1]);
        }
        const volatility = Math.sqrt(returns.reduce((a, b) => a + b * b, 0) / returns.length) * 100;

        // Trend detection
        const isUptrend = sma10 > sma20;
        const trendStrength = Math.abs((sma10 - sma20) / sma20) * 100;

        // Price forecast (next 1 hour, 1 day, 1 week)
        const trendFactor = isUptrend ? 1 : -1;
        const forecast1h = currentPrice * (1 + (trendFactor * 0.002 * trendStrength));
        const forecast1d = currentPrice * (1 + (trendFactor * 0.015 * trendStrength));
        const forecast1w = currentPrice * (1 + (trendFactor * 0.05 * trendStrength));

        // Confidence score (based on trend strength and low volatility)
        const baseConfidence = 0.5;
        const trendBonus = Math.min(trendStrength / 100, 0.3);
        const volatilityPenalty = Math.min(volatility / 100, 0.2);
        const confidence = Math.max(0.4, Math.min(0.95, baseConfidence + trendBonus - volatilityPenalty));

        // Support and Resistance levels
        const support = Math.min(...historicalData.slice(-10));
        const resistance = Math.max(...historicalData.slice(-10));

        // AI Signal
        let signal = 'HOLD';
        let signalStrength = 0;
        if (currentPrice < sma10 && sma10 > sma20 && momentum > -5) {
            signal = 'BUY';
            signalStrength = Math.min(trendStrength * 10, 100);
        } else if (currentPrice > sma10 && sma10 < sma20 && momentum < 5) {
            signal = 'SELL';
            signalStrength = Math.min(trendStrength * 10, 100);
        }

        const prediction = {
            symbol,
            assetType,
            currentPrice,
            forecast: {
                nextHour: forecast1h,
                nextDay: forecast1d,
                nextWeek: forecast1w
            },
            priceChange: {
                nextHour: ((forecast1h - currentPrice) / currentPrice) * 100,
                nextDay: ((forecast1d - currentPrice) / currentPrice) * 100,
                nextWeek: ((forecast1w - currentPrice) / currentPrice) * 100
            },
            confidence: (confidence * 100).toFixed(1) + '%',
            signal: signal,
            signalStrength: signalStrength.toFixed(0),
            technicals: {
                sma10: sma10.toFixed(2),
                sma20: sma20.toFixed(2),
                momentum: momentum.toFixed(2) + '%',
                volatility: volatility.toFixed(2) + '%',
                trend: isUptrend ? 'Bullish' : 'Bearish',
                trendStrength: trendStrength.toFixed(2) + '%'
            },
            levels: {
                support: support.toFixed(2),
                resistance: resistance.toFixed(2),
                target: (isUptrend ? resistance * 1.02 : support * 0.98).toFixed(2),
                stopLoss: (isUptrend ? support * 0.98 : resistance * 1.02).toFixed(2)
            },
            recommendation: signal === 'BUY' ?
                `Strong buy signal with ${signalStrength.toFixed(0)}% strength. Entry at ${currentPrice.toFixed(2)}, target ${(isUptrend ? resistance * 1.02 : support * 0.98).toFixed(2)}` :
                signal === 'SELL' ?
                    `Sell signal with ${signalStrength.toFixed(0)}% strength. Consider profit booking.` :
                    `Hold position. Wait for clearer signals. Monitor support at ${support.toFixed(2)} and resistance at ${resistance.toFixed(2)}.`,
            timestamp: new Date().toISOString()
        };

        res.json({ success: true, data: prediction });
    } catch (error) {
        console.error('AI Prediction error:', error);
        res.json({ success: false, message: 'Prediction failed' });
    }
});

// Advanced technical indicators (premium) - 10+ indicators
app.get('/api/indicators', requirePremium, async (req, res) => {
    const { symbol = 'TCS' } = req.query;

    try {
        // Get current price
        const marketData = await marketDataService.getAllMarketData();
        let currentPrice;

        if (marketData.stocks[symbol]) currentPrice = marketData.stocks[symbol].price;
        else if (marketData.crypto[symbol]) currentPrice = marketData.crypto[symbol].price;
        else if (marketData.commodities[symbol]) currentPrice = marketData.commodities[symbol].price;
        else return res.json({ success: false, message: 'Symbol not found' });

        // Generate 50 days of historical data for better indicator calculation
        const historicalData = [];
        for (let i = 49; i >= 0; i--) {
            const variance = (Math.random() - 0.5) * (currentPrice * 0.04);
            const basePrice = currentPrice + variance;
            historicalData.push({
                close: basePrice,
                high: basePrice * (1 + Math.random() * 0.02),
                low: basePrice * (1 - Math.random() * 0.02),
                volume: Math.floor(1000000 + Math.random() * 500000)
            });
        }

        // 1. RSI (Relative Strength Index) - 14 period
        const rsiPeriod = 14;
        const changes = [];
        for (let i = 1; i < historicalData.length; i++) {
            changes.push(historicalData[i].close - historicalData[i - 1].close);
        }
        const gains = changes.map(c => c > 0 ? c : 0);
        const losses = changes.map(c => c < 0 ? -c : 0);
        const avgGain = gains.slice(-rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod;
        const avgLoss = losses.slice(-rsiPeriod).reduce((a, b) => a + b, 0) / rsiPeriod;
        const rs = avgGain / (avgLoss || 1);
        const rsi = 100 - (100 / (1 + rs));

        // 2. MACD (Moving Average Convergence Divergence)
        const ema12 = calculateEMA(historicalData.map(d => d.close), 12);
        const ema26 = calculateEMA(historicalData.map(d => d.close), 26);
        const macdLine = ema12 - ema26;
        const signalLine = macdLine * 0.9; // Simplified signal
        const histogram = macdLine - signalLine;

        // 3. Bollinger Bands (20, 2)
        const sma20 = historicalData.slice(-20).reduce((a, b) => a + b.close, 0) / 20;
        const squaredDiffs = historicalData.slice(-20).map(d => Math.pow(d.close - sma20, 2));
        const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / 20);
        const bollingerUpper = sma20 + (2 * stdDev);
        const bollingerMiddle = sma20;
        const bollingerLower = sma20 - (2 * stdDev);
        const bollingerPosition = ((currentPrice - bollingerLower) / (bollingerUpper - bollingerLower)) * 100;

        // 4. Stochastic Oscillator (14, 3, 3)
        const low14 = Math.min(...historicalData.slice(-14).map(d => d.low));
        const high14 = Math.max(...historicalData.slice(-14).map(d => d.high));
        const stochasticK = ((currentPrice - low14) / (high14 - low14)) * 100;
        const stochasticD = stochasticK * 0.9; // Simplified %D

        // 5. ATR (Average True Range) - Volatility
        const trueRanges = [];
        for (let i = 1; i < historicalData.length; i++) {
            const tr = Math.max(
                historicalData[i].high - historicalData[i].low,
                Math.abs(historicalData[i].high - historicalData[i - 1].close),
                Math.abs(historicalData[i].low - historicalData[i - 1].close)
            );
            trueRanges.push(tr);
        }
        const atr = trueRanges.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const atrPercent = (atr / currentPrice) * 100;

        // 6. ADX (Average Directional Index) - Trend Strength
        const adx = 25 + (Math.random() * 50); // Simplified for demo

        // 7. Ichimoku Cloud
        const high9 = Math.max(...historicalData.slice(-9).map(d => d.high));
        const low9 = Math.min(...historicalData.slice(-9).map(d => d.low));
        const high26 = Math.max(...historicalData.slice(-26).map(d => d.high));
        const low26 = Math.min(...historicalData.slice(-26).map(d => d.low));
        const tenkanSen = (high9 + low9) / 2;
        const kijunSen = (high26 + low26) / 2;
        const senkouSpanA = (tenkanSen + kijunSen) / 2;
        const high52 = Math.max(...historicalData.map(d => d.high));
        const low52 = Math.min(...historicalData.map(d => d.low));
        const senkouSpanB = (high52 + low52) / 2;

        // 8. Volume Profile
        const avgVolume = historicalData.reduce((a, b) => a + b.volume, 0) / historicalData.length;
        const currentVolume = historicalData[historicalData.length - 1].volume;
        const volumeRatio = currentVolume / avgVolume;

        // 9. Fibonacci Retracement Levels
        const pivotHigh = Math.max(...historicalData.map(d => d.high));
        const pivotLow = Math.min(...historicalData.map(d => d.low));
        const diff = pivotHigh - pivotLow;
        const fib236 = pivotHigh - (diff * 0.236);
        const fib382 = pivotHigh - (diff * 0.382);
        const fib500 = pivotHigh - (diff * 0.500);
        const fib618 = pivotHigh - (diff * 0.618);
        const fib786 = pivotHigh - (diff * 0.786);

        // 10. Parabolic SAR
        const sar = currentPrice * (Math.random() > 0.5 ? 0.98 : 1.02);

        const indicators = {
            symbol,
            currentPrice: currentPrice.toFixed(2),

            // Momentum Indicators
            momentum: {
                rsi: {
                    value: rsi.toFixed(2),
                    signal: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral',
                    interpretation: rsi > 70 ? 'Consider selling' : rsi < 30 ? 'Consider buying' : 'No clear signal'
                },
                stochastic: {
                    k: stochasticK.toFixed(2),
                    d: stochasticD.toFixed(2),
                    signal: stochasticK > 80 ? 'Overbought' : stochasticK < 20 ? 'Oversold' : 'Neutral'
                },
                macd: {
                    line: macdLine.toFixed(2),
                    signal: signalLine.toFixed(2),
                    histogram: histogram.toFixed(2),
                    trend: histogram > 0 ? 'Bullish' : 'Bearish'
                }
            },

            // Volatility Indicators
            volatility: {
                bollingerBands: {
                    upper: bollingerUpper.toFixed(2),
                    middle: bollingerMiddle.toFixed(2),
                    lower: bollingerLower.toFixed(2),
                    position: bollingerPosition.toFixed(1) + '%',
                    signal: bollingerPosition > 80 ? 'Near upper band - Overbought' :
                        bollingerPosition < 20 ? 'Near lower band - Oversold' : 'Within bands'
                },
                atr: {
                    value: atr.toFixed(2),
                    percent: atrPercent.toFixed(2) + '%',
                    signal: atrPercent > 3 ? 'High volatility' : atrPercent < 1.5 ? 'Low volatility' : 'Normal volatility'
                }
            },

            // Trend Indicators
            trend: {
                adx: {
                    value: adx.toFixed(2),
                    signal: adx > 25 ? 'Strong trend' : adx > 20 ? 'Moderate trend' : 'Weak trend or ranging'
                },
                ichimoku: {
                    tenkanSen: tenkanSen.toFixed(2),
                    kijunSen: kijunSen.toFixed(2),
                    senkouSpanA: senkouSpanA.toFixed(2),
                    senkouSpanB: senkouSpanB.toFixed(2),
                    signal: currentPrice > senkouSpanA && currentPrice > senkouSpanB ? 'Bullish (above cloud)' :
                        currentPrice < senkouSpanA && currentPrice < senkouSpanB ? 'Bearish (below cloud)' : 'Inside cloud'
                },
                parabolicSAR: {
                    value: sar.toFixed(2),
                    signal: currentPrice > sar ? 'Uptrend' : 'Downtrend'
                }
            },

            // Support & Resistance
            levels: {
                fibonacci: {
                    level_0: pivotHigh.toFixed(2),
                    level_236: fib236.toFixed(2),
                    level_382: fib382.toFixed(2),
                    level_500: fib500.toFixed(2),
                    level_618: fib618.toFixed(2),
                    level_786: fib786.toFixed(2),
                    level_100: pivotLow.toFixed(2)
                },
                pivotPoints: {
                    high: pivotHigh.toFixed(2),
                    low: pivotLow.toFixed(2),
                    pivot: ((pivotHigh + pivotLow + currentPrice) / 3).toFixed(2)
                }
            },

            // Volume Analysis
            volume: {
                current: currentVolume,
                average: Math.floor(avgVolume),
                ratio: volumeRatio.toFixed(2),
                signal: volumeRatio > 1.5 ? 'High volume - Strong move' :
                    volumeRatio < 0.7 ? 'Low volume - Weak move' : 'Average volume'
            },

            // Overall Signal
            overallSignal: calculateOverallSignal(rsi, macdLine, bollingerPosition, stochasticK),
            timestamp: new Date().toISOString()
        };

        res.json({ success: true, symbol, indicators });
    } catch (error) {
        console.error('Indicators error:', error);
        res.json({ success: false, message: 'Failed to calculate indicators' });
    }
});

// Helper function for EMA calculation
function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
}

// Helper function for overall signal
function calculateOverallSignal(rsi, macdLine, bollingerPosition, stochasticK) {
    let bullishScore = 0;
    let bearishScore = 0;

    // RSI signals
    if (rsi < 30) bullishScore += 2;
    else if (rsi > 70) bearishScore += 2;

    // MACD signals
    if (macdLine > 0) bullishScore += 1;
    else bearishScore += 1;

    // Bollinger signals
    if (bollingerPosition < 20) bullishScore += 1;
    else if (bollingerPosition > 80) bearishScore += 1;

    // Stochastic signals
    if (stochasticK < 20) bullishScore += 1;
    else if (stochasticK > 80) bearishScore += 1;

    if (bullishScore > bearishScore + 1) return { signal: 'BUY', strength: ((bullishScore / 6) * 100).toFixed(0) + '%' };
    if (bearishScore > bullishScore + 1) return { signal: 'SELL', strength: ((bearishScore / 6) * 100).toFixed(0) + '%' };
    return { signal: 'HOLD', strength: '50%' };
}

// Historical data with range parameter (premium)
app.get('/api/history/:symbol', requirePremium, async (req, res) => {
    const { symbol } = req.params;
    const { range = '1y' } = req.query;
    const days = range === '1m' ? 30 : range === '3m' ? 90 : range === '6m' ? 180 : 365;
    const data = [];
    for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const price = 3000 + Math.random() * 200;
        data.push({ date: date.toISOString().split('T')[0], open: price, high: price + 20, low: price - 20, close: price + (Math.random() - 0.5) * 10 });
    }
    res.json({ success: true, symbol, range, data });
});

// Custom alerts (premium) – store in‑memory per user
const userAlerts = new Map();
app.post('/api/alerts', requirePremium, async (req, res) => {
    const email = req.headers['x-user-email'];
    const { symbol, condition, target } = req.body;
    if (!symbol || !condition || typeof target !== 'number') {
        return res.json({ success: false, message: 'Invalid alert payload' });
    }
    const alerts = userAlerts.get(email) || [];
    alerts.push({ symbol, condition, target });
    userAlerts.set(email, alerts);
    res.json({ success: true, alerts });
});

// Export portfolio as CSV (premium)
app.get('/api/portfolio/export', requirePremium, async (req, res) => {
    const email = req.headers['x-user-email'];
    const user = isMongoDBConnected ? await User.findOne({ email }) : inMemoryUsers.get(email);
    const portfolio = user?.portfolio || {};
    const rows = ['symbol,quantity,avgPrice'];
    for (const [sym, info] of Object.entries(portfolio)) {
        rows.push(`${sym},${info.quantity},${info.avgPrice}`);
    }
    const csv = rows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio.csv"');
    res.send(csv);
});

// Priority support placeholder
app.get('/api/support', requirePremium, (req, res) => {
    res.json({ success: true, message: 'Priority support is available via Slack channel #protrader-support' });
});

// White‑label API key check (placeholder)
app.get('/api/white-label', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.WHITE_LABEL_API_KEY) {
        return res.status(403).json({ success: false, message: 'Invalid API key' });
    }
    const data = await marketDataService.getAllMarketData();
    res.json({ success: true, data });
});

// Backtesting Engine (premium) - Test trading strategies
app.post('/api/backtest', requirePremium, async (req, res) => {
    const { symbol = 'TCS', strategy = 'sma_crossover', period = '1y', initialCapital = 100000 } = req.body;

    try {
        // Get current price for the symbol
        const marketData = await marketDataService.getAllMarketData();
        let basePrice;

        if (marketData.stocks[symbol]) basePrice = marketData.stocks[symbol].price;
        else if (marketData.crypto[symbol]) basePrice = marketData.crypto[symbol].price;
        else if (marketData.commodities[symbol]) basePrice = marketData.commodities[symbol].price;
        else return res.json({ success: false, message: 'Symbol not found' });

        // Generate historical data for backtesting
        const days = period === '1m' ? 30 : period === '3m' ? 90 : period === '6m' ? 180 : 365;
        const historicalData = [];
        let price = basePrice * 0.8; // Start at 80% of current price

        for (let i = 0; i < days; i++) {
            const change = (Math.random() - 0.48) * (price * 0.03); // Slight upward bias
            price += change;
            const dailyHigh = price * (1 + Math.random() * 0.02);
            const dailyLow = price * (1 - Math.random() * 0.02);

            historicalData.push({
                date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                open: price,
                high: dailyHigh,
                low: dailyLow,
                close: price,
                volume: Math.floor(1000000 + Math.random() * 500000)
            });
        }

        // Apply trading strategy
        let capital = initialCapital;
        let shares = 0;
        let trades = [];
        let signals = [];
        let equityCurve = [];

        // Calculate indicators based on strategy
        for (let i = 20; i < historicalData.length; i++) {
            const currentData = historicalData.slice(0, i + 1);
            let signal = 'HOLD';

            // Strategy Logic
            if (strategy === 'sma_crossover') {
                // Simple Moving Average Crossover (10/20)
                const sma10 = currentData.slice(-10).reduce((a, b) => a + b.close, 0) / 10;
                const sma20 = currentData.slice(-20).reduce((a, b) => a + b.close, 0) / 20;
                const prevSma10 = currentData.slice(-11, -1).reduce((a, b) => a + b.close, 0) / 10;
                const prevSma20 = currentData.slice(-21, -1).reduce((a, b) => a + b.close, 0) / 20;

                if (prevSma10 <= prevSma20 && sma10 > sma20) signal = 'BUY';
                else if (prevSma10 >= prevSma20 && sma10 < sma20) signal = 'SELL';

            } else if (strategy === 'rsi') {
                // RSI Strategy (14-period)
                const changes = [];
                for (let j = Math.max(0, i - 14); j < i; j++) {
                    changes.push(currentData[j + 1].close - currentData[j].close);
                }
                const gains = changes.map(c => c > 0 ? c : 0);
                const losses = changes.map(c => c < 0 ? -c : 0);
                const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
                const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
                const rs = avgGain / (avgLoss || 1);
                const rsi = 100 - (100 / (1 + rs));

                if (rsi < 30) signal = 'BUY';
                else if (rsi > 70) signal = 'SELL';

            } else if (strategy === 'macd') {
                // MACD Strategy
                const prices = currentData.map(d => d.close);
                const ema12 = calculateEMA(prices, 12);
                const ema26 = calculateEMA(prices, 26);
                const macdLine = ema12 - ema26;

                // Previous MACD
                const prevPrices = currentData.slice(0, -1).map(d => d.close);
                const prevEma12 = calculateEMA(prevPrices, 12);
                const prevEma26 = calculateEMA(prevPrices, 26);
                const prevMacdLine = prevEma12 - prevEma26;

                if (prevMacdLine < 0 && macdLine > 0) signal = 'BUY';
                else if (prevMacdLine > 0 && macdLine < 0) signal = 'SELL';

            } else if (strategy === 'bollinger') {
                // Bollinger Bands Strategy
                const sma20 = currentData.slice(-20).reduce((a, b) => a + b.close, 0) / 20;
                const squaredDiffs = currentData.slice(-20).map(d => Math.pow(d.close - sma20, 2));
                const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / 20);
                const upperBand = sma20 + (2 * stdDev);
                const lowerBand = sma20 - (2 * stdDev);
                const currentPrice = currentData[i].close;

                if (currentPrice < lowerBand) signal = 'BUY';
                else if (currentPrice > upperBand) signal = 'SELL';
            }

            // Execute trades based on signal
            const currentPrice = historicalData[i].close;

            if (signal === 'BUY' && capital > 0 && shares === 0) {
                shares = Math.floor(capital / currentPrice);
                const cost = shares * currentPrice;
                capital -= cost;
                trades.push({
                    date: historicalData[i].date,
                    type: 'BUY',
                    price: currentPrice.toFixed(2),
                    shares: shares,
                    value: cost.toFixed(2)
                });
            } else if (signal === 'SELL' && shares > 0) {
                const proceeds = shares * currentPrice;
                capital += proceeds;
                trades.push({
                    date: historicalData[i].date,
                    type: 'SELL',
                    price: currentPrice.toFixed(2),
                    shares: shares,
                    value: proceeds.toFixed(2),
                    pnl: (proceeds - (shares * trades[trades.length - 1].price)).toFixed(2)
                });
                shares = 0;
            }

            // Calculate current equity
            const currentEquity = capital + (shares * currentPrice);
            equityCurve.push({
                date: historicalData[i].date,
                equity: currentEquity.toFixed(2)
            });

            if (signal !== 'HOLD') {
                signals.push({
                    date: historicalData[i].date,
                    signal: signal,
                    price: currentPrice.toFixed(2)
                });
            }
        }

        // Close any open position at the end
        if (shares > 0) {
            const finalPrice = historicalData[historicalData.length - 1].close;
            const proceeds = shares * finalPrice;
            capital += proceeds;
            trades.push({
                date: historicalData[historicalData.length - 1].date,
                type: 'SELL (Close)',
                price: finalPrice.toFixed(2),
                shares: shares,
                value: proceeds.toFixed(2),
                pnl: (proceeds - (shares * parseFloat(trades[trades.length - 1].price))).toFixed(2)
            });
            shares = 0;
        }

        const finalEquity = capital;

        // Calculate performance metrics
        const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100;
        const winningTrades = trades.filter(t => t.pnl && parseFloat(t.pnl) > 0).length;
        const losingTrades = trades.filter(t => t.pnl && parseFloat(t.pnl) < 0).length;
        const totalTrades = winningTrades + losingTrades;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

        // Calculate Sharpe Ratio (simplified)
        const returns = [];
        for (let i = 1; i < equityCurve.length; i++) {
            const dailyReturn = ((parseFloat(equityCurve[i].equity) - parseFloat(equityCurve[i - 1].equity)) / parseFloat(equityCurve[i - 1].equity));
            returns.push(dailyReturn);
        }
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const stdDevReturns = Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length);
        const sharpeRatio = (avgReturn / (stdDevReturns || 1)) * Math.sqrt(252); // Annualized

        // Max Drawdown
        let maxEquity = initialCapital;
        let maxDrawdown = 0;
        equityCurve.forEach(point => {
            const equity = parseFloat(point.equity);
            if (equity > maxEquity) maxEquity = equity;
            const drawdown = ((maxEquity - equity) / maxEquity) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });

        const result = {
            success: true,
            backtest: {
                symbol,
                strategy: strategy.replace('_', ' ').toUpperCase(),
                period: period.toUpperCase(),
                initialCapital: initialCapital,
                finalEquity: finalEquity.toFixed(2),
                totalReturn: totalReturn.toFixed(2) + '%',
                totalTrades: totalTrades,
                winningTrades: winningTrades,
                losingTrades: losingTrades,
                winRate: winRate.toFixed(2) + '%',
                sharpeRatio: sharpeRatio.toFixed(2),
                maxDrawdown: maxDrawdown.toFixed(2) + '%',
                performance: totalReturn > 0 ? 'Profitable' : totalReturn < 0 ? 'Loss' : 'Break-even',
                rating: totalReturn > 20 && winRate > 50 ? '⭐⭐⭐⭐⭐ Excellent' :
                    totalReturn > 10 && winRate > 45 ? '⭐⭐⭐⭐ Good' :
                        totalReturn > 0 && winRate > 40 ? '⭐⭐⭐ Fair' :
                            totalReturn > -10 ? '⭐⭐ Poor' : '⭐ Very Poor'
            },
            trades: trades.slice(-20), // Last 20 trades
            signals: signals.slice(-50), // Last 50 signals
            equityCurve: equityCurve.filter((_, i) => i % Math.max(1, Math.floor(equityCurve.length / 100)) === 0), // Downsample for chart
            recommendation: totalReturn > 10 && winRate > 50 ?
                `Excellent strategy! ${strategy.toUpperCase()} shows strong performance with ${winRate.toFixed(0)}% win rate and ${totalReturn.toFixed(1)}% return.` :
                totalReturn > 0 ?
                    `Strategy shows modest returns. Consider optimizing parameters or combining with other indicators.` :
                    `This strategy did not perform well on ${symbol}. Consider trying a different strategy or adjusting parameters.`,
            timestamp: new Date().toISOString()
        };

        res.json(result);
    } catch (error) {
        console.error('Backtesting error:', error);
        res.json({ success: false, message: 'Backtest failed' });
    }
});

// End of premium placeholders

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Real market data integration enabled`);
    console.log(`✅ Multi-asset trading: Stocks, Crypto, Forex, Commodities`);
});
