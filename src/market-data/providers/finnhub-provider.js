/**
 * Finnhub Provider Adapter
 * Free tier: 60 calls/minute, 300 calls/day
 * Supports: Stocks (global), Forex, Crypto, ETF, Fundamentals
 */
const axios = require('axios');
const BaseProvider = require('./base-provider');
const Normalizer = require('../normalizer');

class FinnhubProvider extends BaseProvider {
    constructor(config = {}) {
        super('finnhub', {
            apiKey: config.apiKey || process.env.FINNHUB_API_KEY || '',
            baseUrl: 'https://finnhub.io/api/v1',
            rateLimit: { requestsPerMinute: 60, requestsPerDay: 300 },
            priority: 2,
            supportedAssetTypes: ['stocks', 'forex', 'crypto', 'etf'],
            supportedExchanges: ['NSE', 'BSE', 'NYSE', 'NASDAQ', 'AMEX', 'LSE', 'TSE', 'XETRA']
        });
    }

    async getQuote(symbol, exchange) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        try {
            const symbolParam = exchange ? `${exchange}:${symbol}` : symbol;
            const { data } = await axios.get(`${this.baseUrl}/quote`, {
                params: { symbol: symbolParam, token: this.apiKey },
                timeout: 5000
            });

            if (!data || data.error) throw new Error(data?.error || 'Finnhub API error');

            this.recordLatency(Date.now() - start);
            this.recordSuccess();

            return Normalizer.normalizeQuote({
                symbol,
                exchange: exchange || '',
                price: data.c,  // current price
                bid: data.bidPrice || 0,
                ask: data.askPrice || 0,
                volume: 0, // Finnhub quote doesn't include volume
                open: data.o,
                high: data.h,
                low: data.l,
                previousClose: data.pc,
                change: data.d || (data.c - data.pc),
                changePercent: data.dp || (data.pc ? ((data.c - data.pc) / data.pc * 100) : 0),
                timestamp: new Date().toISOString()
            }, this.name, this._guessAssetType(symbol));
        } catch (error) {
            this.recordError(error);
            throw error;
        }
    }

    async getQuotes(symbols) {
        const results = [];
        // Finnhub only supports one quote at a time
        for (const { symbol, exchange } of symbols) {
            if (!this.canMakeRequest()) break;
            try {
                const quote = await this.getQuote(symbol, exchange);
                results.push(quote);
            } catch (e) {
                // Skip failed symbols
            }
        }
        return results;
    }

    async getHistory(symbol, exchange, interval = '1D', limit = 100, endDate) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        const resolutionMap = {
            '1m': '1', '5m': '5', '15m': '15', '30m': '30',
            '1h': '60', '4h': '240', '1D': 'D', '1W': 'W', '1M': 'M'
        };

        const symbolParam = exchange ? `${exchange}:${symbol}` : symbol;
        const to = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : Math.floor(Date.now() / 1000);
        // Calculate from date based on limit and interval
        const intervalMs = this._intervalToMs(interval);
        const from = Math.floor((to * 1000 - limit * intervalMs) / 1000);

        try {
            const { data } = await axios.get(`${this.baseUrl}/stock/candle`, {
                params: {
                    symbol: symbolParam,
                    resolution: resolutionMap[interval] || 'D',
                    from,
                    to,
                    token: this.apiKey
                },
                timeout: 10000
            });

            if (data.s === 'no_data' || !data.c) {
                throw new Error('No historical data available');
            }

            const candles = [];
            for (let i = 0; i < data.t.length; i++) {
                candles.push(Normalizer.normalizeCandle({
                    symbol,
                    exchange: exchange || '',
                    timestamp: new Date(data.t[i] * 1000).toISOString(),
                    open: data.o[i],
                    high: data.h[i],
                    low: data.l[i],
                    close: data.c[i],
                    volume: data.v[i]
                }, this.name));
            }

            this.recordLatency(Date.now() - start);
            this.recordSuccess();
            return candles;
        } catch (error) {
            this.recordError(error);
            throw error;
        }
    }

    async searchInstruments(query, filters = {}) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);

        try {
            const { data } = await axios.get(`${this.baseUrl}/search`, {
                params: { q: query, token: this.apiKey },
                timeout: 5000
            });

            let results = (data.result || []).map(item =>
                Normalizer.normalizeInstrument({
                    symbol: item.symbol,
                    exchange: item.exchange || '',
                    companyName: item.description || '',
                    assetType: item.type || 'stock',
                    country: item.country || ''
                }, this.name)
            );

            if (filters.assetType) results = results.filter(r => r.assetType === filters.assetType);
            if (filters.exchange) results = results.filter(r => r.exchange === filters.exchange);

            this.recordSuccess();
            return results;
        } catch (error) {
            this.recordError(error);
            return [];
        }
    }

    async getMarketOverview() {
        // Finnhub provides basic market data for major indices
        const indexSymbols = [
            { symbol: 'SPY', name: 'S&P 500', exchange: 'ARCA' },
            { symbol: 'QQQ', name: 'NASDAQ 100', exchange: 'ARCA' },
            { symbol: 'DIA', name: 'Dow Jones', exchange: 'ARCA' }
        ];

        const results = [];
        for (const idx of indexSymbols) {
            if (!this.canMakeRequest()) break;
            try {
                const quote = await this.getQuote(idx.symbol, idx.exchange);
                results.push(Normalizer.normalizeIndex({
                    symbol: quote.symbol,
                    name: idx.name,
                    price: quote.price,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    volume: quote.volume
                }, this.name));
            } catch (e) { /* skip */ }
        }
        return results;
    }

    _guessAssetType(symbol) {
        if (/^(USD|EUR|GBP|JPY|INR|AUD|CAD|CHF|NZD)/.test(symbol)) return 'forex';
        if (/\//.test(symbol)) return 'forex';
        if (/^(BTC|ETH|ADA|SOL|XRP|DOGE|DOT|LINK|AVAX)/.test(symbol)) return 'crypto';
        return 'stocks';
    }

    _intervalToMs(interval) {
        const map = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000,
            '1h': 3600000, '4h': 14400000, '1D': 86400000, '1W': 604800000, '1M': 2592000000 };
        return map[interval] || 86400000;
    }
}

module.exports = FinnhubProvider;
