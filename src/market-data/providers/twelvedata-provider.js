/**
 * Twelve Data Provider Adapter
 * Free tier: 800 requests/day, 8 req/min
 * Supports: Stocks, Forex, Crypto, ETFs, Indices
 */
const axios = require('axios');
const BaseProvider = require('./base-provider');
const Normalizer = require('../normalizer');

class TwelveDataProvider extends BaseProvider {
    constructor(config = {}) {
        super('twelvedata', {
            apiKey: config.apiKey || process.env.TWELVEDATA_API_KEY || '',
            baseUrl: 'https://api.twelvedata.com',
            rateLimit: { requestsPerMinute: 8, requestsPerDay: 800 },
            priority: 1,
            supportedAssetTypes: ['stocks', 'forex', 'crypto', 'etf', 'index'],
            supportedExchanges: ['NSE', 'BSE', 'NYSE', 'NASDAQ', 'LSE', 'TSE', 'FX']
        });
    }

    async getQuote(symbol, exchange) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        try {
            const params = { symbol, apikey: this.apiKey };
            if (exchange) params.exchange = exchange;

            const { data } = await axios.get(`${this.baseUrl}/quote`, {
                params,
                timeout: 5000
            });

            if (data.status === 'error') throw new Error(data.message || 'Twelve Data API error');

            const price = parseFloat(data.close);
            const prevClose = parseFloat(data.previous_close);
            const change = isNaN(price) || isNaN(prevClose) ? 0 : price - prevClose;

            this.recordLatency(Date.now() - start);
            this.recordSuccess();

            return Normalizer.normalizeQuote({
                symbol: data.symbol,
                exchange: exchange || '',
                price: data.close,
                bid: data.bid,
                ask: data.ask,
                volume: data.volume,
                open: data.open,
                high: data.high,
                low: data.low,
                previousClose: data.previous_close,
                change: change,
                changePercent: data.percent_change,
                timestamp: new Date().toISOString()
            }, this.name, this._guessAssetType(symbol));
        } catch (error) {
            this.recordError(error);
            throw error;
        }
    }

    async getQuotes(symbols) {
        const results = [];
        const batchSize = 8; // Twelve Data free tier max per request
        const batches = [];
        for (let i = 0; i < symbols.length; i += batchSize) {
            batches.push(symbols.slice(i, i + batchSize));
        }

        for (const batch of batches) {
            if (!this.canMakeRequest()) break;

            try {
                const symbolStr = batch.map(s => s.symbol).join(',');
                const params = { symbol: symbolStr, apikey: this.apiKey };
                if (batch[0].exchange) params.exchange = batch[0].exchange;

                const { data } = await axios.get(`${this.baseUrl}/quote`, {
                    params,
                    timeout: 8000
                });

                const quotes = Array.isArray(data) ? data : [data];
                for (const q of quotes) {
                    const price = parseFloat(q.close);
                    const prevClose = parseFloat(q.previous_close);
                    const change = isNaN(price) || isNaN(prevClose) ? 0 : price - prevClose;

                    results.push(Normalizer.normalizeQuote({
                        symbol: q.symbol,
                        exchange: q.exchange || batch[0].exchange || '',
                        price: q.close,
                        bid: q.bid,
                        ask: q.ask,
                        volume: q.volume,
                        open: q.open,
                        high: q.high,
                        low: q.low,
                        previousClose: q.previous_close,
                        change,
                        changePercent: q.percent_change,
                        timestamp: new Date().toISOString()
                    }, this.name));
                }

                this.recordSuccess();
            } catch (error) {
                this.recordError(error);
            }
        }

        return results;
    }

    async getHistory(symbol, exchange, interval = '1D', limit = 100, endDate) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        const intervalMap = {
            '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
            '1h': '1h', '4h': '4h', '1D': '1day', '1W': '1week', '1M': '1month'
        };

        try {
            const params = {
                symbol,
                interval: intervalMap[interval] || interval,
                outputsize: limit,
                apikey: this.apiKey
            };
            if (exchange) params.exchange = exchange;
            if (endDate) {
                params.end_date = endDate instanceof Date
                    ? endDate.toISOString().split('T')[0]
                    : endDate;
            }

            const { data } = await axios.get(`${this.baseUrl}/time_series`, {
                params,
                timeout: 10000
            });

            if (data.status === 'error') throw new Error(data.message);

            const candles = (data.values || []).map(v => Normalizer.normalizeCandle({
                symbol: data.meta?.symbol || symbol,
                exchange: exchange || '',
                timestamp: v.datetime,
                open: v.open,
                high: v.high,
                low: v.low,
                close: v.close,
                volume: v.volume
            }, this.name));

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
            const { data } = await axios.get(`${this.baseUrl}/symbol_search`, {
                params: { symbol: query, apikey: this.apiKey },
                timeout: 5000
            });

            let results = (data.data || data || []).map(item =>
                Normalizer.normalizeInstrument({
                    symbol: item.symbol,
                    exchange: item.exchange,
                    companyName: item.instrument_name || item.name,
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
        const indices = ['NSE:NIFTY_50', 'NSE:NIFTY_BANK', 'NYSE:SPX', 'NASDAQ:IXIC', 'NYSE:DJI'];
        const results = [];

        for (const idx of indices) {
            if (!this.canMakeRequest()) break;
            try {
                const [exchange, symbol] = idx.split(':');
                const quote = await this.getQuote(symbol, exchange);
                results.push(Normalizer.normalizeIndex({
                    symbol: quote.symbol,
                    name: this._getIndexName(symbol),
                    price: quote.price,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    volume: quote.volume
                }, this.name));
            } catch (e) {
                // Skip failed indices — fallback engine will handle this
            }
        }

        return results;
    }

    _guessAssetType(symbol) {
        if (/^(USD|EUR|GBP|JPY|INR|AUD|CAD|CHF|NZD)/.test(symbol)) return 'forex';
        if (/\//.test(symbol)) return 'forex';
        if (/^(BTC|ETH|ADA|SOL|XRP|DOGE|DOT|LINK|AVAX)/.test(symbol)) return 'crypto';
        return 'stocks';
    }

    _getIndexName(symbol) {
        const names = {
            'NIFTY_50': 'NIFTY 50', 'NIFTY_BANK': 'NIFTY Bank',
            'SPX': 'S&P 500', 'IXIC': 'NASDAQ', 'DJI': 'Dow Jones'
        };
        return names[symbol] || symbol;
    }
}

module.exports = TwelveDataProvider;
