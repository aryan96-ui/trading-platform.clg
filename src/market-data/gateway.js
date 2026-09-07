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

class MarketGateway extends EventEmitter {
    constructor(config = {}) {
        super();
        this.providers = []; // Sorted by priority (lower = higher priority)
        this.cache = new MarketCache(config.cache);
        this.isDemoMode = config.isDemoMode !== false; // Default true when no keys
        this._eventSubscribers = new Map(); // Symbol → Set of callbacks

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

        // Try each provider in priority order
        for (const provider of this.providers) {
            if (!provider.canMakeRequest()) continue;
            if (!provider.supports('stocks', exchange) &&
                !provider.supports('crypto', exchange) &&
                !provider.supports('forex', exchange)) continue;

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

        // Find best provider that supports batch quotes
        for (const provider of this.providers) {
            if (!provider.canMakeRequest()) continue;
            if (typeof provider.getQuotes !== 'function') continue;

            try {
                this.metrics.providerCalls++;
                const quotes = await provider.getQuotes(uncached);
                for (const quote of quotes) {
                    const cacheKey = MarketCache.key('quote', quote.symbol, quote.exchange || 'default');
                    this.cache.set(cacheKey, quote, 'quote');
                    results.push(quote);
                    this.emit('quote', quote);
                }
                break; // Success — don't try other providers
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

        for (const provider of this.providers) {
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

        for (const provider of this.providers) {
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
