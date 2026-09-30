/**
 * In-Memory Market Data Cache
 * 
 * Provides intelligent TTL-based caching for market data.
 * Designed to work standalone (no Redis required) or with Redis adapter.
 * 
 * TTL Strategy:
 * - Real-time quotes: 5s (or 0 during market hours for live feel)
 * - Historical candles: 1h (rarely changes)
 * - Instrument metadata: 24h (static data)
 * - Market overview: 30s
 * - Search results: 5min
 */
class MarketCache {
    constructor(config = {}) {
        this.store = new Map();
        this.stats = { hits: 0, misses: 0, evictions: 0 };
        this.maxSize = config.maxSize || 10000;
        this.defaultTTL = config.defaultTTL || 60000;

        // Named TTLs
        this.ttls = {
            quote: config.ttlQuote || 5000,
            candles: config.ttlCandles || 3600000,
            instrument: config.ttlInstrument || 86400000,
            overview: config.ttlOverview || 30000,
            search: config.ttlSearch || 300000,
            sector: config.ttlSector || 60000
        };

        // Cleanup expired entries every 30 seconds
        this._cleanupInterval = setInterval(() => this._cleanup(), 30000);
    }

    /**
     * Get a cached value by key
     */
    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            this.stats.misses++;
            return null;
        }
        this.stats.hits++;
        entry.hits++;
        entry.lastAccessed = Date.now();
        return entry.value;
    }

    /**
     * Set a value in the cache
     * @param {string} key
     * @param {*} value
     * @param {string} ttlType - 'quote'|'candles'|'instrument'|'overview'|'search'|'sector'
     * @param {number} [customTTL] - Override TTL in ms
     */
    set(key, value, ttlType = 'quote', customTTL) {
        // Evict oldest if at capacity
        if (this.store.size >= this.maxSize && !this.store.has(key)) {
            this._evictLRU();
        }

        const ttl = customTTL || this.ttls[ttlType] || this.defaultTTL;
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttl,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            hits: 0
        });
    }

    /**
     * Delete a specific key
     */
    delete(key) {
        this.store.delete(key);
    }

    /**
     * Delete all keys matching a prefix
     */
    deleteByPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }

    /**
     * Get or set: return cached value, or compute and cache it
     */
    async getOrSet(key, computeFn, ttlType = 'quote') {
        const cached = this.get(key);
        if (cached !== null) return cached;

        const value = await computeFn();
        this.set(key, value, ttlType);
        return value;
    }

    /**
     * Build a standard cache key
     */
    static key(type, ...parts) {
        return `md:${type}:${parts.join(':')}`;
    }

    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            totalRequests: total,
            hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%',
            size: this.store.size,
            maxSize: this.maxSize
        };
    }

    _evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, entry] of this.store.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.store.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    _cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.expiresAt) {
                this.store.delete(key);
            }
        }
    }

    destroy() {
        clearInterval(this._cleanupInterval);
        this.store.clear();
    }
}

module.exports = MarketCache;
