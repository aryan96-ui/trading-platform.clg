/**
 * Alpha Vantage Provider Adapter
 * Free tier: 25 requests/day, 5/min (standard)
 * Supports: Stocks (global), Forex, Crypto, Fundamental data
 * Best for: Historical data quality, fundamentals
 */
const axios = require('axios');
const BaseProvider = require('./base-provider');
const Normalizer = require('../normalizer');

class AlphaVantageProvider extends BaseProvider {
    constructor(config = {}) {
        super('alphavantage', {
            apiKey: config.apiKey || process.env.ALPHAVANTAGE_API_KEY || 'demo',
            baseUrl: 'https://www.alphavantage.co/query',
            rateLimit: { requestsPerMinute: 5, requestsPerDay: 25 },
            priority: 3, // Lower priority due to strict rate limits
            supportedAssetTypes: ['stocks', 'forex', 'crypto', 'etf'],
            supportedExchanges: ['NSE', 'BSE', 'NYSE', 'NASDAQ', 'LSE', 'TSE']
        });
    }

    async getQuote(symbol, exchange) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        try {
            const { data } = await axios.get(this.baseUrl, {
                params: {
                    function: 'GLOBAL_QUOTE',
                    symbol,
                    apikey: this.apiKey
                },
                timeout: 10000
            });

            const gq = data['Global Quote'];
            if (!gq || Object.keys(gq).length === 0) {
                throw new Error(data.Note || data['Error Message'] || 'No data from Alpha Vantage');
            }

            this.recordLatency(Date.now() - start);
            this.recordSuccess();

            return Normalizer.normalizeQuote({
                symbol: gq['01. symbol'] || symbol,
                exchange: exchange || '',
                price: gq['05. price'],
                bid: 0,
                ask: 0,
                volume: gq['06. volume'],
                open: gq['02. open'],
                high: gq['03. high'],
                low: gq['04. low'],
                previousClose: gq['08. previous close'],
                change: gq['09. change'],
                changePercent: gq['10. change percent'],
                timestamp: new Date().toISOString()
            }, this.name, this._guessAssetType(symbol));
        } catch (error) {
            this.recordError(error);
            throw error;
        }
    }

    async getQuotes(symbols) {
        // Alpha Vantage doesn't support batch quotes — fetch one at a time
        const results = [];
        for (const { symbol, exchange } of symbols) {
            if (!this.canMakeRequest()) break;
            try {
                results.push(await this.getQuote(symbol, exchange));
            } catch (e) { /* skip */ }
        }
        return results;
    }

    async getHistory(symbol, exchange, interval = '1D', limit = 100, endDate) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        const intraday = ['1m', '5m', '15m', '30m', '1h'];
        const isIntraday = intraday.includes(interval);
        const intervalMap = {
            '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
            '1h': '60min', '4h': '60min', '1D': 'daily', '1W': 'weekly', '1M': 'monthly'
        };

        try {
            const params = {
                function: isIntraday ? 'TIME_SERIES_INTRADAY' : `TIME_SERIES_${intervalMap[interval] || 'DAILY'}`,
                symbol,
                apikey: this.apiKey,
                outputsize: 'full'
            };

            if (isIntraday) {
                params.interval = intervalMap[interval] || '5min';
            }

            const { data } = await axios.get(this.baseUrl, { params, timeout: 15000 });

            const timeSeriesKey = isIntraday
                ? `Time Series (${params.interval})`
                : `Time Series (${intervalMap[interval] || 'Daily'})`;

            const series = data[timeSeriesKey];
            if (!series) {
                throw new Error(data.Note || data['Error Message'] || 'No time series data');
            }

            let entries = Object.entries(series);
            // Limit entries
            if (entries.length > limit) entries = entries.slice(0, limit);

            const candles = entries.map(([timestamp, v]) =>
                Normalizer.normalizeCandle({
                    symbol,
                    exchange: exchange || '',
                    timestamp,
                    open: v['1. open'],
                    high: v['2. high'],
                    low: v['3. low'],
                    close: v['4. close'],
                    volume: v['5. volume']
                }, this.name)
            );

            this.recordLatency(Date.now() - start);
            this.recordSuccess();
            return candles;
        } catch (error) {
            this.recordError(error);
            throw error;
        }
    }

    async searchInstruments(query, filters = {}) {
        // Alpha Vantage doesn't have a search endpoint — use SYMBOL_SEARCH
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);

        try {
            const { data } = await axios.get(this.baseUrl, {
                params: { function: 'SYMBOL_SEARCH', keywords: query, apikey: this.apiKey },
                timeout: 5000
            });

            let results = (data.bestMatches || []).map(item =>
                Normalizer.normalizeInstrument({
                    symbol: item['1. symbol'],
                    exchange: item['4. region'] || '',
                    companyName: item['2. name'],
                    assetType: item['3. type'],
                    country: item['4. region'] || ''
                }, this.name)
            );

            if (filters.assetType) results = results.filter(r => r.assetType === filters.assetType);

            this.recordSuccess();
            return results;
        } catch (error) {
            this.recordError(error);
            return [];
        }
    }

    _guessAssetType(symbol) {
        if (/^(USD|EUR|GBP|JPY|INR|AUD|CAD|CHF|NZD)/.test(symbol)) return 'forex';
        if (/\//.test(symbol)) return 'forex';
        if (/^(BTC|ETH|ADA|SOL|XRP|DOGE|DOT|LINK|AVAX)/.test(symbol)) return 'crypto';
        return 'stocks';
    }
}

module.exports = AlphaVantageProvider;
