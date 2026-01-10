// server-no-db.js - Backend WITHOUT MongoDB (In-Memory Only)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ============================================
// IN-MEMORY DATA STORAGE (No MongoDB needed!)
// ============================================
const users = new Map();
const tradeHistory = new Map();

// Create demo user
users.set('demo@college.com', {
    email: 'demo@college.com',
    password: 'password123',
    balance: 100000,
    portfolio: {}
});

console.log('✅ Demo user created in memory');

// ============================================
// MARKET DATA SERVICE
// ============================================
class MarketDataService {
    constructor() {
        this.cache = {};
        this.cacheTimeout = 60000;
    }

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
            return this.getMockCryptoPrice(coinId);
        }
    }

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
            return this.getMockForexRate(from, to);
        }
    }

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

    async getAllMarketData() {
        const cacheKey = 'all_market_data';
        const cached = this.cache[cacheKey];

        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            return cached.data;
        }

        try {
            const [bitcoin, ethereum, cardano, solana, ripple] = await Promise.all([
                this.getCryptoPrice('bitcoin'),
                this.getCryptoPrice('ethereum'),
                this.getCryptoPrice('cardano'),
                this.getCryptoPrice('solana'),
                this.getCryptoPrice('ripple')
            ]);

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

app.get('/', (req, res) => {
    res.send('ProTrader Backend - In-Memory Mode (No Database)');
});

app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Email and password required' });

    if (users.has(email)) {
        return res.json({ success: false, message: 'User already exists' });
    }

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

app.get('/api/market-data', async (req, res) => {
    try {
        const data = await marketDataService.getAllMarketData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch market data' });
    }
});

app.post('/api/trade', (req, res) => {
    const { email, symbol, type, quantity, assetType } = req.body;
    if (!email || !symbol || !type || !quantity) {
        return res.json({ success: false, message: 'Missing parameters' });
    }

    const user = users.get(email);
    if (!user) return res.json({ success: false, message: 'User not found' });

    marketDataService.getAllMarketData().then(marketData => {
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
            default:
                priceData = marketData.stocks[symbol];
        }

        if (!priceData) return res.json({ success: false, message: 'Invalid symbol' });

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
});

app.post('/api/payment', (req, res) => {
    const { email, amount } = req.body;
    if (!email || !amount) return res.json({ success: false, message: 'Missing parameters' });

    const user = users.get(email);
    if (!user) return res.json({ success: false, message: 'User not found' });

    user.balance += amount;
    return res.json({ success: true, newBalance: user.balance });
});

app.get('/api/history/:email', (req, res) => {
    const { email } = req.params;
    const history = tradeHistory.get(email) || [];
    res.json({ success: true, history });
});

app.get('/api/portfolio/:email', (req, res) => {
    const user = users.get(req.params.email);
    if (!user) return res.json({ success: false, portfolio: {} });
    res.json({ success: true, portfolio: user.portfolio || {} });
});

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

app.listen(PORT, () => {
    console.log(`\n✅ ========================================`);
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Mode: IN-MEMORY (No Database)`);
    console.log(`✅ Real market data integration enabled`);
    console.log(`✅ Multi-asset trading ready`);
    console.log(`✅ ========================================\n`);
});
