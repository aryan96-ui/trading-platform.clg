/**
 * Demo Provider
 * 
 * Generates CLEARLY LABELED synthetic quotes for demo mode.
 * Every quote carries dataQuality: 'DEMO' and source: 'demo'.
 * Registered LAST (lowest priority) so real providers always win.
 * 
 * The frontend MUST display a "DEMO DATA" badge whenever quotes
 * come from this provider. Never used when real providers succeed.
 */
const BaseProvider = require('./base-provider');
const Normalizer = require('../normalizer');

const BASE_PRICES = {
    // NSE stocks
    'RELIANCE': 2450, 'TCS': 3280, 'HDFCBANK': 1645, 'INFY': 1520,
    'SBIN': 586, 'ICICIBANK': 950, 'BHARTIARTL': 890, 'ITC': 421,
    'KOTAKBANK': 1780, 'LT': 3350, 'AXISBANK': 1080, 'ASIANPAINT': 2950,
    'MARUTI': 9800, 'SUNPHARMA': 1150, 'TATAMOTORS': 680, 'WIPRO': 420,
    'ULTRACEMCO': 9800, 'TITAN': 3200, 'BAJFINANCE': 6500, 'NESTLEIND': 24500,
    'POWERGRID': 280, 'NTPC': 330, 'ONGC': 275, 'TATASTEEL': 140,
    'HCLTECH': 1420, 'TECHM': 1250, 'DRREDDY': 6200, 'CIPLA': 1450,
    'ADANIENT': 2500, 'BAJAJFINSV': 1650, 'TATACONSUM': 1100, 'DIVISLAB': 3600,
    'EICHERMOT': 4500, 'GRASIM': 2300, 'HINDALCO': 620, 'JSWSTEEL': 880,
    'COALINDIA': 450, 'BPCL': 620, 'HEROMOTOCO': 4500, 'BRITANNIA': 5200,
    'APOLLOHOSP': 6300, 'TRENT': 1600, 'BAJAJ-AUTO': 8500, 'INDUSINDBK': 1350,
    'M&M': 2700, 'SBILIFE': 1450, 'ADANIPORTS': 1200, 'HINDUNILVR': 2400,
    // Indices
    'NIFTY': 24175, 'SENSEX': 80200, 'NIFTY_BANK': 51500, 'NIFTY_IT': 36000,
    'INDIA_VIX': 12.5, 'SPX': 5400, 'IXIC': 17000, 'DJI': 39000,
    'FTSE': 8200, 'DAX': 18500, 'NIKKEI': 39000,
    // Crypto (aligned with CoinGecko universe)
    'BTC': 65000, 'ETH': 3500, 'ADA': 0.45, 'SOL': 150, 'XRP': 0.52,
    'DOT': 7, 'DOGE': 0.12, 'AVAX': 35, 'LINK': 15, 'MATIC': 0.7,
    // Forex
    'USDINR': 83.5, 'EURINR': 90.2, 'GBPINR': 105.8, 'JPYINR': 0.55,
    'EURUSD': 1.08, 'GBPUSD': 1.27, 'USDJPY': 154
};

class DemoProvider extends BaseProvider {
    constructor(config = {}) {
        super('demo', {
            baseUrl: '',
            rateLimit: { requestsPerMinute: 1000, requestsPerDay: 100000 },
            priority: 99, // Last resort
            supportedAssetTypes: ['stocks', 'crypto', 'forex', 'index', 'etf']
        });
        this._drift = new Map();
    }

    async getQuote(symbol, exchange) {
        return this._makeQuote(symbol, exchange);
    }

    async getQuotes(symbols) {
        return symbols.map(s => this._makeQuote(s.symbol, s.exchange));
    }

    async getHistory(symbol, exchange, interval = '1D', limit = 100) {
        const base = BASE_PRICES[symbol] || 1000;
        const candles = [];
        const stepMs = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1D': 86400000, '1W': 604800000, '1M': 2592000000 };
        const step = stepMs[interval] || 86400000;
        const now = Date.now();

        let price = base * 0.9;
        for (let i = limit - 1; i >= 0; i--) {
            const drift = (Math.random() - 0.47) * 0.02;
            price = price * (1 + drift);
            const open = price;
            const high = price * (1 + Math.random() * 0.012);
            const low = price * (1 - Math.random() * 0.012);
            const close = price * (1 + (Math.random() - 0.5) * 0.008);
            candles.push(Normalizer.normalizeCandle({
                symbol, exchange: exchange || 'DEMO',
                timestamp: new Date(now - i * step).toISOString(),
                open, high, low, close,
                volume: Math.floor(100000 + Math.random() * 5000000)
            }, 'demo'));
        }
        return candles;
    }

    async searchInstruments(query, filters = {}) {
        const q = (query || '').toUpperCase();
        const results = Object.entries(BASE_PRICES)
            .filter(([sym]) => sym.includes(q))
            .slice(0, 20)
            .map(([sym]) => Normalizer.normalizeInstrument({
                symbol: sym,
                exchange: 'DEMO',
                companyName: sym,
                assetType: this._guessType(sym)
            }, 'demo'));
        return filters.assetType ? results.filter(r => r.assetType === filters.assetType) : results;
    }

    _makeQuote(symbol, exchange) {
        const base = BASE_PRICES[symbol] || 1000;
        const prevDrift = this._drift.get(symbol) || 0;
        const drift = prevDrift * 0.9 + (Math.random() - 0.5) * 0.004;
        this._drift.set(symbol, drift);

        const price = base * (1 + drift);
        const change = price - base;

        return Normalizer.normalizeQuote({
            symbol,
            exchange: exchange || 'DEMO',
            price,
            bid: price * 0.999,
            ask: price * 1.001,
            volume: Math.floor(100000 + Math.random() * 5000000),
            open: base * 0.998,
            high: price * (1 + Math.random() * 0.01),
            low: price * (1 - Math.random() * 0.01),
            previousClose: base,
            change,
            changePercent: (change / base) * 100,
            timestamp: new Date().toISOString(),
            dataQuality: 'DEMO'
        }, 'demo', this._guessType(symbol));
    }

    _guessType(symbol) {
        if (['BTC','ETH','ADA','SOL','XRP','DOT','DOGE','AVAX','LINK','MATIC'].includes(symbol)) return 'crypto';
        if (['USDINR','EURINR','GBPINR','JPYINR','EURUSD','GBPUSD','USDJPY'].includes(symbol)) return 'forex';
        if (['NIFTY','SENSEX','NIFTY_BANK','NIFTY_IT','INDIA_VIX','SPX','IXIC','DJI','FTSE','DAX','NIKKEI'].includes(symbol)) return 'index';
        return 'stocks';
    }
}

module.exports = DemoProvider;