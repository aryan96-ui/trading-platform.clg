/**
 * Market Data Gateway
 * 
 * Provider-agnostic orchestrator that:
 * - Selects the best provider for each request based on priority + health + rate limits
 * - Implements automatic fallback: Provider A → Provider B → Provider C → Cache
 * - Caches all results with intelligent TTLs
 * - Exposes a single unified API for the rest of the application
 * - Tracks provider health and data quality
 * 
 * Architecture:
 * Request → Gateway → Provider Selection → Adapter → Normalizer → Cache → Response
 */
const EventEmitter = require('events');
const MarketCache = require('./cache');
const Normalizer = require('./normalizer');

// Providers and the instrument master disagree on singular/plural asset names
// ('stock' vs 'stocks'). Canonicalise both sides before comparing.
const ASSET_ALIASES = {
    stock: 'stocks', stocks: 'stocks',
    etf: 'etf', etfs: 'etf',
    crypto: 'crypto',
    forex: 'forex',
    index: 'index', indices: 'index'
};

const CRYPTO_PREFIXES = /^(BTC|ETH|ADA|SOL|XRP|DOT|DOGE|AVAX|LINK|MATIC|LTC|BNB|USDT|USDC)/;
const INDEX_SYMBOLS = ['NIFTY', 'SENSEX', 'NIFTY_BANK', 'NIFTY_IT', 'INDIA_VIX', 'SPX', 'IXIC', 'DJI', 'FTSE', 'DAX', 'NIKKEI'];

class MarketGateway extends EventEmitter {
    constructor(config = {}) {
        super();
        this.providers = []; // Sorted by priority (lower = higher priority)
        this.cache = new MarketCache(config.cache);
        this.isDemoMode = config.isDemoMode !== false; // Default true when no keys
        this._eventSubscribers = new Map(); // Symbol → Set of callbacks
        this.instrumentMaster = null;
        this._assetTypeCache = new Map(); // symbol:exchange → assetType

        // Metrics
        this.metrics = {
            totalRequests: 0,
            cacheHits: 0,
            providerCalls: 0,
            fallbacks: 0,
            errors: 0,
            startTime: Date.now()
        };
    }

    /**
     * Attach the instrument master so the gateway can route requests to
     * providers that actually support the symbol's asset class. Without this
     * a crypto-only provider is asked for stock history on every call and the
     * request stalls until that provider times out.
     */
    setInstrumentMaster(instrumentMaster) {
        this.instrumentMaster = instrumentMaster;
        this._assetTypeCache.clear();
    }

    static canonAsset(assetType) {
        const key = String(assetType || '').toLowerCase();
        return ASSET_ALIASES[key] || key;
    }

    /**
     * Resolve the asset class for a symbol: instrument master first, heuristics as fallback.
     */
    _resolveAssetType(symbol, exchange) {
        const key = `${symbol}:${exchange || ''}`;
        const memo = this._assetTypeCache.get(key);
        if (memo) return memo;

        let assetType = null;
        if (this.instrumentMaster) {
            try {
                const exact = this.instrumentMaster.getBySymbol(symbol, exchange);
                if (exact && exact.assetType) {
                    assetType = exact.assetType;
                } else {
                    const upper = String(symbol).toUpperCase();
                    const hit = this.instrumentMaster.search(symbol, {})
                        .find(i => i.symbol && i.symbol.toUpperCase() === upper);
                    if (hit && hit.assetType) assetType = hit.assetType;
                }
            } catch (e) {
                // Instrument master unavailable — fall through to heuristics
            }
        }

        if (!assetType) assetType = this._guessAssetType(symbol);
        this._assetTypeCache.set(key, assetType);
        return assetType;
    }

    _guessAssetType(symbol) {
        const s = String(symbol || '').toUpperCase();
        if (s.includes('/')) return 'forex';
        if (INDEX_SYMBOLS.includes(s)) return 'index';
        if (CRYPTO_PREFIXES.test(s) && !/^USDT?$/.test(s)) return 'crypto';
        // Six-letter fiat pair such as USDINR / EURUSD
        if (/^(USD|EUR|GBP|JPY|INR|AUD|CAD|CHF|NZD)/.test(s) && s.length === 6) return 'forex';
        return 'stocks';
    }

    /**
     * Single compatibility check for a provider against an asset class and
     * exchange. Handles singular/plural asset naming (the instrument master
     * says 'stock', providers declare 'stocks') and providers that declare no
     * exchange restriction at all.
     */
    _providerSupportsAsset(provider, assetType, exchange) {
        const declared = provider.supportedAssetTypes || [];
        if (declared.length > 0 &&
            !declared.map(MarketGateway.canonAsset).includes(MarketGateway.canonAsset(assetType))) {
            return false;
        }
        const exchanges = provider.supportedExchanges || [];
        if (exchange && exchanges.length > 0 && !exchanges.includes(exchange)) return false;
        return true;
    }

    /**
     * Providers eligible for an asset class, in priority order.
     * Returns all providers when nothing declares support so a request is
     * never silently unroutable.
     */
    _candidates(assetType, exchange) {
        const matching = this.providers.filter(p => this._providerSupportsAsset(p, assetType, exchange));
        // Nothing declared support for this class (unknown asset type) — fall
        // back to every provider rather than making the symbol unroutable.
        return matching.length > 0 ? matching : this.providers;
    }

    /**
     * Register a market data provider adapter
     */
    registerProvider(provider) {
        this.providers.push(provider);
        this.providers.sort((a, b) => a.priority - b.priority);
        console.log(`  Registered provider: ${provider.name} (priority ${provider.priority})`);
    }

    /**
     * Get real-time quote for a symbol
     * Tries providers in priority order, falls back to cache
     */
    async getQuote(symbol, exchange) {
        const cacheKey = MarketCache.key('quote', symbol, exchange || 'default');
        this.metrics.totalRequests++;

        // Check cache first for fresh data
        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.metrics.cacheHits++;
            return cached;
        }

        // Try providers that actually support this symbol's asset class,
        // in priority order. Filtering happens before canMakeRequest() so a
        // skipped provider does not burn a rate-limit slot.
        const assetType = this._resolveAssetType(symbol, exchange);
        for (const provider of this._candidates(assetType, exchange)) {
            if (!provider.canMakeRequest()) continue;

            try {
                this.metrics.providerCalls++;
                const quote = await provider.getQuote(symbol, exchange);
                this.cache.set(cacheKey, quote, 'quote');
                this.emit('quote', quote);
                return quote;
            } catch (error) {
                this.metrics.fallbacks++;
                // Try next provider
            }
        }

        // All providers failed — try stale cache
        const staleQuote = this.cache.get(cacheKey);
        if (staleQuote) {
            staleQuote.dataQuality = 'STALE';
            return staleQuote;
        }

        this.metrics.errors++;
        throw new Error(`No provider available for ${symbol}`);
    }

    /**
     * Get quotes for multiple symbols efficiently
     */
    async getQuotes(symbols) {
        const results = [];
        const uncached = [];

        // Separate cached vs uncached
        for (const { symbol, exchange } of symbols) {
            const cacheKey = MarketCache.key('quote', symbol, exchange || 'default');
            const cached = this.cache.get(cacheKey);
            if (cached) {
                results.push(cached);
                this.metrics.cacheHits++;
            } else {
                uncached.push({ symbol, exchange });
            }
        }

        if (uncached.length === 0) return results;

        // Resolve each symbol's asset class once, then let each provider only
        // handle the symbols it declares support for.
        const assetTypes = new Map();
        for (const u of uncached) {
            assetTypes.set(u.symbol, this._resolveAssetType(u.symbol, u.exchange));
        }

        // Find best provider that supports batch quotes.
        // A provider only "wins" if it covered ALL requested symbols;
        // partial/empty results fall through to lower-priority providers
        // (e.g. a crypto-only provider is skipped for stock symbols, so the
        // demo provider must still get a chance to serve them).
        const covered = new Set(results.map(q => q.symbol));
        const remaining = () => uncached.filter(u => !covered.has(u.symbol));

        for (const provider of this.providers) {
            // Nothing left to fetch → done. A provider with no applicable
            // symbols is skipped (not a reason to abort the whole loop).
            if (remaining().length === 0) break;
            const todo = remaining().filter(u =>
                this._providerSupportsAsset(provider, assetTypes.get(u.symbol), u.exchange));
            if (todo.length === 0) continue;
            if (!provider.canMakeRequest()) continue;
            if (typeof provider.getQuotes !== 'function') continue;

            try {
                this.metrics.providerCalls++;
                const quotes = await provider.getQuotes(todo);
                for (const quote of quotes) {
                    if (!quote || !quote.symbol) continue;
                    covered.add(quote.symbol);
                    const cacheKey = MarketCache.key('quote', quote.symbol, quote.exchange || 'default');
                    this.cache.set(cacheKey, quote, 'quote');
                    results.push(quote);
                    this.emit('quote', quote);
                }
            } catch (error) {
                this.metrics.fallbacks++;
            }
        }

        return results;
    }

    /**
     * Get historical OHLCV candles
     */
    async getHistory(symbol, exchange, interval, limit, endDate) {
        const cacheKey = MarketCache.key('candles', symbol, exchange || 'default', interval, String(limit));
        this.metrics.totalRequests++;

        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.metrics.cacheHits++;
            return cached;
        }

        const assetType = this._resolveAssetType(symbol, exchange);
        for (const provider of this._candidates(assetType, exchange)) {
            if (!provider.canMakeRequest()) continue;
            try {
                this.metrics.providerCalls++;
                const candles = await provider.getHistory(symbol, exchange, interval, limit, endDate);
                this.cache.set(cacheKey, candles, 'candles');
                return candles;
            } catch (error) {
                this.metrics.fallbacks++;
            }
        }

        this.metrics.errors++;
        throw new Error(`No provider available for history: ${symbol}`);
    }

    /**
     * Search for instruments across providers
     */
    async searchInstruments(query, filters = {}) {
        const cacheKey = MarketCache.key('search', query, JSON.stringify(filters));
        this.metrics.totalRequests++;

        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.metrics.cacheHits++;
            return cached;
        }

        let allResults = [];

        for (const provider of this.providers) {
            if (!provider.canMakeRequest()) continue;
            try {
                this.metrics.providerCalls++;
                const results = await provider.searchInstruments(query, filters);
                allResults = allResults.concat(results);
                break; // Use first available provider for search
            } catch (error) {
                this.metrics.fallbacks++;
            }
        }

        // Deduplicate by symbol
        const seen = new Set();
        const unique = allResults.filter(r => {
            const key = `${r.symbol}:${r.exchange}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        this.cache.set(cacheKey, unique, 'search');
        return unique;
    }

    /**
     * Get market overview (major indices)
     */
    async getMarketOverview() {
        const cacheKey = MarketCache.key('overview', 'global');
        this.metrics.totalRequests++;

        const cached = this.cache.get(cacheKey);
        if (cached) {
            this.metrics.cacheHits++;
            return cached;
        }

        for (const provider of this._candidates('index')) {
            if (!provider.canMakeRequest()) continue;
            try {
                this.metrics.providerCalls++;
                const overview = await provider.getMarketOverview();
                if (overview && overview.length > 0) {
                    this.cache.set(cacheKey, overview, 'overview');
                    return overview;
                }
            } catch (error) {
                this.metrics.fallbacks++;
            }
        }

        return [];
    }

    /**
     * Get provider health status for all registered providers
     */
    getProviderHealth() {
        return this.providers.map(p => p.getHealthStatus());
    }

    /**
     * Which providers would serve a given symbol (used by /metrics and UI).
     */
    describeRouting(symbol, exchange) {
        const assetType = this._resolveAssetType(symbol, exchange);
        return { symbol, exchange: exchange || null, assetType, providers: this._candidates(assetType).map(p => p.name) };
    }

    /**
     * Get gateway metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheStats: this.cache.getStats(),
            uptime: Date.now() - this.metrics.startTime,
            providersRegistered: this.providers.length,
            isDemoMode: this.isDemoMode
        };
    }

    /**
     * Get a unified market snapshot (all asset classes)
     */
    async getMarketSnapshot() {
        const cacheKey = MarketCache.key('snapshot', 'all');
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        const [overview] = await Promise.all([
            this.getMarketOverview().catch(() => [])
        ]);

        const snapshot = {
            indices: overview,
            timestamp: new Date().toISOString(),
            source: 'gateway'
        };

        this.cache.set(cacheKey, snapshot, 'overview');
        return snapshot;
    }

    /**
     * Shutdown cleanly
     */
    destroy() {
        this.cache.destroy();
        this.removeAllListeners();
    }
}

module.exports = MarketGateway;
