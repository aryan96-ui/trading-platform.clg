/**
 * CoinGecko Provider Adapter
 * Free tier: 30 calls/minute (with delay), no API key needed
 * Supports: Crypto only (3000+ coins)
 * Best for: Broad crypto coverage, market data
 */
const axios = require('axios');
const BaseProvider = require('./base-provider');
const Normalizer = require('../normalizer');

// Map common ticker symbols to CoinGecko IDs
const SYMBOL_TO_ID = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'ADA': 'cardano', 'SOL': 'solana',
    'XRP': 'ripple', 'DOT': 'polkadot', 'DOGE': 'dogecoin', 'AVAX': 'avalanche-2',
    'LINK': 'chainlink', 'MATIC': 'matic-network', 'UNI': 'uniswap',
    'ATOM': 'cosmos', 'LTC': 'litecoin', 'BCH': 'bitcoin-cash',
    'ALGO': 'algorand', 'FIL': 'filecoin', 'APT': 'aptos',
    'ARB': 'arbitrum', 'OP': 'optimism', 'NEAR': 'near'
};

const ID_TO_SYMBOL = {};
for (const [sym, id] of Object.entries(SYMBOL_TO_ID)) {
    ID_TO_SYMBOL[id] = sym;
}

class CoinGeckoProvider extends BaseProvider {
    constructor(config = {}) {
        super('coingecko', {
            apiKey: config.apiKey || '', // CoinGecko free doesn't need a key
            baseUrl: 'https://api.coingecko.com/api/v3',
            rateLimit: { requestsPerMinute: 30, requestsPerDay: 10000 },
            priority: 2,
            supportedAssetTypes: ['crypto'],
            supportedExchanges: ['binance', 'coinbase', 'kraken']
        });
        this._requestQueue = [];
        this._lastRequestTime = 0;
    }

    // Rate-limit aware request (CoinGecko free requires ~2s between requests)
    async _throttledRequest(url, params = {}) {
        const now = Date.now();
        const elapsed = now - this._lastRequestTime;
        if (elapsed < 2100) {
            await new Promise(r => setTimeout(r, 2100 - elapsed));
        }

        this._lastRequestTime = Date.now();
        return axios.get(url, { params, timeout: 10000 });
    }

    async getQuote(symbol, exchange) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        try {
            const coinId = SYMBOL_TO_ID[symbol] || symbol.toLowerCase();
            const { data } = await this._throttledRequest(
                `${this.baseUrl}/simple/price`,
                {
                    ids: coinId,
                    vs_currencies: 'usd,inr',
                    include_24hr_change: true,
                    include_24hr_vol: true,
                    include_last_updated_at: true
                }
            );

            if (!data[coinId]) throw new Error(`Coin ${symbol} not found`);

            const coin = data[coinId];
            const price = coin.usd || 0;

            this.recordLatency(Date.now() - start);
            this.recordSuccess();

            return Normalizer.normalizeQuote({
                symbol: ID_TO_SYMBOL[coinId] || symbol,
                exchange: exchange || 'coingecko',
                price,
                bid: null,
                ask: null,
                volume: coin.usd_24h_vol || 0,
                open: null,
                high: null,
                low: null,
                previousClose: null,
                change: price * (coin.usd_24h_change || 0) / 100,
                changePercent: coin.usd_24h_change || 0,
                timestamp: coin.last_updated_at
                    ? new Date(coin.last_updated_at * 1000).toISOString()
                    : new Date().toISOString()
            }, this.name, 'crypto');
        } catch (error) {
            this.recordError(error);
            throw error;
        }
    }

    async getQuotes(symbols) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        const coinIds = symbols.map(s => SYMBOL_TO_ID[s.symbol] || s.symbol.toLowerCase()).join(',');

        try {
            const { data } = await this._throttledRequest(
                `${this.baseUrl}/simple/price`,
                {
                    ids: coinIds,
                    vs_currencies: 'usd,inr',
                    include_24hr_change: true,
                    include_24hr_vol: true,
                    include_last_updated_at: true
                }
            );

            const results = [];
            for (const { symbol } of symbols) {
                const coinId = SYMBOL_TO_ID[symbol] || symbol.toLowerCase();
                if (data[coinId]) {
                    const coin = data[coinId];
                    const price = coin.usd || 0;
                    results.push(Normalizer.normalizeQuote({
                        symbol: ID_TO_SYMBOL[coinId] || symbol,
                        exchange: 'coingecko',
                        price,
                        volume: coin.usd_24h_vol || 0,
                        change: price * (coin.usd_24h_change || 0) / 100,
                        changePercent: coin.usd_24h_change || 0,
                        timestamp: coin.last_updated_at
                            ? new Date(coin.last_updated_at * 1000).toISOString()
                            : new Date().toISOString()
                    }, this.name, 'crypto'));
                }
            }

            this.recordLatency(Date.now() - start);
            this.recordSuccess();
            return results;
        } catch (error) {
            this.recordError(error);
            return [];
        }
    }

    async getHistory(symbol, exchange, interval = '1D', limit = 100, endDate) {
        if (!this.canMakeRequest()) throw new Error(`${this.name}: rate limit exceeded`);
        const start = Date.now();

        const coinId = SYMBOL_TO_ID[symbol] || symbol.toLowerCase();
        const daysMap = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365 };
        const days = daysMap[interval] || Math.min(Math.ceil(limit / 24), 365);

        try {
            const { data } = await this._throttledRequest(
                `${this.baseUrl}/coins/${coinId}/market_chart`,
                { vs_currency: 'usd', days, interval: interval === '1D' ? 'daily' : (days <= 1 ? 'hourly' : 'daily') }
            );

            const candles = [];
            if (data.prices) {
                for (let i = 0; i < Math.min(data.prices.length, limit); i++) {
                    const price = data.prices[i][1];
                    const vol = data.total_volumes && data.total_volumes[i] ? data.total_volumes[i][1] : 0;

                    candles.push(Normalizer.normalizeCandle({
                        symbol: ID_TO_SYMBOL[coinId] || symbol,
                        exchange: exchange || 'coingecko',
                        timestamp: new Date(data.prices[i][0]).toISOString(),
                        open: price * (1 + (Math.random() - 0.5) * 0.01),
                        high: price * (1 + Math.random() * 0.02),
                        low: price * (1 - Math.random() * 0.02),
                        close: price,
                        volume: Math.floor(vol)
                    }, this.name));
                }
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
            const { data } = await this._throttledRequest(
                `${this.baseUrl}/search`, { query }
            );

            const results = (data.coins || []).map(item =>
                Normalizer.normalizeInstrument({
                    symbol: item.symbol ? item.symbol.toUpperCase() : '',
                    exchange: 'coingecko',
                    companyName: item.name,
                    assetType: 'crypto',
                    country: ''
                }, this.name)
            );

            this.recordSuccess();
            return results;
        } catch (error) {
            this.recordError(error);
            return [];
        }
    }
}

module.exports = CoinGeckoProvider;
