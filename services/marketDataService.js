// services/marketDataService.js - Multi-Asset High Performance Market Engine
const axios = require('axios');
const config = require('../config');

class MarketDataService {
    constructor() {
        this.cache = {};
        this.cacheTimeout = config.CACHE_TIMEOUT_MS || 30000;
        this.historicalCache = new Map();

        // Baseline assets database
        this.assets = {
            stocks: [
                { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', exchange: 'NSE', basePrice: 2450.25, sector: 'Energy & Retail', volatility: 1.8 },
                { symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', basePrice: 3278.50, sector: 'IT Services', volatility: 1.4 },
                { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', exchange: 'NSE', basePrice: 1645.75, sector: 'Banking', volatility: 1.6 },
                { symbol: 'INFY', name: 'Infosys Ltd.', exchange: 'NSE', basePrice: 1520.40, sector: 'IT Services', volatility: 2.1 },
                { symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', basePrice: 585.60, sector: 'Banking', volatility: 2.3 },
                { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd.', exchange: 'NSE', basePrice: 950.30, sector: 'Banking', volatility: 1.7 },
                { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd.', exchange: 'NSE', basePrice: 890.45, sector: 'Telecom', volatility: 1.5 },
                { symbol: 'ITC', name: 'ITC Ltd.', exchange: 'NSE', basePrice: 420.80, sector: 'FMCG', volatility: 1.1 }
            ],
            crypto: [
                { symbol: 'BTC', coinId: 'bitcoin', name: 'Bitcoin', basePrice: 5850000.00, sector: 'Layer 1', volatility: 3.5 },
                { symbol: 'ETH', coinId: 'ethereum', name: 'Ethereum', basePrice: 285000.00, sector: 'Smart Contracts', volatility: 4.2 },
                { symbol: 'SOL', coinId: 'solana', name: 'Solana', basePrice: 14200.00, sector: 'DeFi & NFT', volatility: 5.1 },
                { symbol: 'ADA', coinId: 'cardano', name: 'Cardano', basePrice: 48.50, sector: 'Smart Contracts', volatility: 4.0 },
                { symbol: 'XRP', coinId: 'ripple', name: 'Ripple', basePrice: 55.20, sector: 'Payments', volatility: 4.5 }
            ],
            forex: [
                { symbol: 'USD/INR', from: 'USD', name: 'US Dollar / Indian Rupee', basePrice: 83.55, volatility: 0.4 },
                { symbol: 'EUR/INR', from: 'EUR', name: 'Euro / Indian Rupee', basePrice: 90.80, volatility: 0.6 },
                { symbol: 'GBP/INR', from: 'GBP', name: 'British Pound / Indian Rupee', basePrice: 106.20, volatility: 0.7 },
                { symbol: 'JPY/INR', from: 'JPY', name: 'Japanese Yen / Indian Rupee', basePrice: 0.56, volatility: 0.5 }
            ],
            commodities: [
                { symbol: 'GOLD', name: 'Gold 24K (10g)', basePrice: 71500.00, unit: '₹ / 10g', volatility: 0.9 },
                { symbol: 'SILVER', name: 'Silver 999 (1kg)', basePrice: 86400.00, unit: '₹ / kg', volatility: 1.9 },
                { symbol: 'CRUDEOIL', name: 'Crude Oil WTI', basePrice: 6520.00, unit: '₹ / bbl', volatility: 2.8 }
            ]
        };

        // Live prices state
        this.currentPrices = new Map();
        this.initializePrices();
    }

    initializePrices() {
        for (const [category, list] of Object.entries(this.assets)) {
            list.forEach(item => {
                this.currentPrices.set(item.symbol, {
                    symbol: item.symbol,
                    name: item.name,
                    category,
                    price: item.basePrice,
                    change: 0,
                    changePercent: 0,
                    high: item.basePrice * 1.01,
                    low: item.basePrice * 0.99,
                    open: item.basePrice,
                    prevClose: item.basePrice,
                    volume: Math.floor(500000 + Math.random() * 2000000),
                    timestamp: Date.now()
                });
            });
        }
    }

    // Tick update simulator (produces realistic continuous price movement)
    simulateTick(symbol) {
        const item = this.currentPrices.get(symbol);
        if (!item) return null;

        const assetDef = this.findAssetDef(symbol);
        const vol = assetDef ? assetDef.volatility / 100 : 0.015;
        
        // Random walk with mean reversion towards base price
        const drift = (assetDef.basePrice - item.price) * 0.001;
        const shock = (Math.random() - 0.495) * item.price * (vol * 0.05);
        const newPrice = Math.max(0.01, Number((item.price + drift + shock).toFixed(2)));

        const change = Number((newPrice - item.prevClose).toFixed(2));
        const changePercent = Number(((change / item.prevClose) * 100).toFixed(2));

        item.price = newPrice;
        item.change = change;
        item.changePercent = changePercent;
        if (newPrice > item.high) item.high = newPrice;
        if (newPrice < item.low) item.low = newPrice;
        item.volume += Math.floor(Math.random() * 50);
        item.timestamp = Date.now();

        return item;
    }

    findAssetDef(symbol) {
        for (const list of Object.values(this.assets)) {
            const found = list.find(a => a.symbol === symbol);
            if (found) return found;
        }
        return { basePrice: 1000, volatility: 2 };
    }

    // Real API fetch with graceful fallback
    async fetchCryptoFromAPI(coinId) {
        try {
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=inr&include_24hr_change=true`,
                { timeout: 3500 }
            );
            if (response.data && response.data[coinId]) {
                return {
                    price: response.data[coinId].inr,
                    changePercent: response.data[coinId].inr_24h_change || 0
                };
            }
        } catch (e) {
            // API timeout or rate limit - fallback to simulation
        }
        return null;
    }

    async getAllMarketData() {
        const cacheKey = 'all_market_data';
        const cached = this.cache[cacheKey];

        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            return cached.data;
        }

        const data = {
            stocks: {},
            crypto: {},
            forex: {},
            commodities: {},
            timestamp: new Date().toISOString()
        };

        for (const [symbol, state] of this.currentPrices.entries()) {
            if (state.category === 'stocks') {
                data.stocks[symbol] = { price: state.price, change: state.change, changePercent: state.changePercent, volume: state.volume, high: state.high, low: state.low };
            } else if (state.category === 'crypto') {
                data.crypto[symbol] = { price: state.price, change: state.change, changePercent: state.changePercent, volume: state.volume, high: state.high, low: state.low };
            } else if (state.category === 'forex') {
                data.forex[symbol] = { price: state.price, change: state.change, changePercent: state.changePercent };
            } else if (state.category === 'commodities') {
                data.commodities[symbol] = { price: state.price, change: state.change, changePercent: state.changePercent, volume: state.volume };
            }
        }

        this.cache[cacheKey] = { timestamp: Date.now(), data };
        return data;
    }

    getAssetPrice(symbol) {
        const state = this.currentPrices.get(symbol.toUpperCase());
        return state ? state.price : null;
    }

    // Generate historical candlestick OHLCV bars
    getHistoricalCandles(symbol, count = 100, interval = '5m') {
        const cacheKey = `${symbol}_${count}_${interval}`;
        const state = this.currentPrices.get(symbol.toUpperCase()) || { price: 1000 };
        let currentPrice = state.price;

        const candles = [];
        const intervalMs = this.parseInterval(interval);
        const now = Date.now();

        // Deterministic base seed + volatility
        let walkPrice = currentPrice * 0.92;
        const volatility = 0.012;

        for (let i = count - 1; i >= 0; i--) {
            const time = now - (i * intervalMs);
            const open = walkPrice;
            const delta = (Math.random() - 0.49) * (walkPrice * volatility);
            const close = Number((open + delta).toFixed(2));
            const high = Number((Math.max(open, close) + (Math.random() * walkPrice * volatility * 0.5)).toFixed(2));
            const low = Number((Math.min(open, close) - (Math.random() * walkPrice * volatility * 0.5)).toFixed(2));
            const volume = Math.floor(10000 + Math.random() * 50000);

            candles.push({ time, open, high, low, close, volume });
            walkPrice = close;
        }

        // Adjust last candle close to match live currentPrice
        if (candles.length > 0) {
            candles[candles.length - 1].close = currentPrice;
            candles[candles.length - 1].high = Math.max(candles[candles.length - 1].high, currentPrice);
            candles[candles.length - 1].low = Math.min(candles[candles.length - 1].low, currentPrice);
        }

        return candles;
    }

    parseInterval(interval) {
        switch (interval) {
            case '1m': return 60 * 1000;
            case '5m': return 5 * 60 * 1000;
            case '15m': return 15 * 60 * 1000;
            case '1h': return 60 * 60 * 1000;
            case '4h': return 4 * 60 * 60 * 1000;
            case '1D': return 24 * 60 * 60 * 1000;
            case '1W': return 7 * 24 * 60 * 60 * 1000;
            default: return 5 * 60 * 1000;
        }
    }
}

module.exports = new MarketDataService();
