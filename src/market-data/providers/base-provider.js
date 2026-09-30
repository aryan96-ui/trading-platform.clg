/**
 * Base Market Data Provider Interface
 * 
 * All provider adapters must extend this class and implement
 * the required methods. The gateway never calls provider-specific
 * methods directly — only these interface methods.
 */
class BaseProvider {
    constructor(name, config = {}) {
        this.name = name;
        this.apiKey = config.apiKey || process.env[`${name.toUpperCase()}_API_KEY`] || '';
        this.baseUrl = config.baseUrl || '';
        this.rateLimit = config.rateLimit || { requestsPerMinute: 60, requestsPerDay: 800 };
        this.priority = config.priority || 10;
        this.supportedAssetTypes = config.supportedAssetTypes || ['stocks'];
        this.supportedExchanges = config.supportedExchanges || [];
        this.requestCount = { minute: 0, day: 0, lastMinuteReset: Date.now(), lastDayReset: Date.now() };
        this.isHealthy = true;
        this.lastError = null;
        this.lastSuccess = null;
        this.averageLatency = 0;
        this.latencySamples = [];
        this._healthTimer = null;
    }

    async getQuote(symbol, exchange) {
        throw new Error(`${this.name}: getQuote() not implemented`);
    }

    async getQuotes(symbols) {
        throw new Error(`${this.name}: getQuotes() not implemented`);
    }

    async getHistory(symbol, exchange, interval, limit, endDate) {
        throw new Error(`${this.name}: getHistory() not implemented`);
    }

    async searchInstruments(query, filters = {}) {
        throw new Error(`${this.name}: searchInstruments() not implemented`);
    }

    async getMarketOverview() {
        throw new Error(`${this.name}: getMarketOverview() not implemented`);
    }

    async getSectorPerformance() {
        throw new Error(`${this.name}: getSectorPerformance() not implemented`);
    }

    supports(assetType, exchange) {
        if (!this.supportedAssetTypes.includes(assetType)) return false;
        if (exchange && this.supportedExchanges.length > 0 && !this.supportedExchanges.includes(exchange)) return false;
        return true;
    }

    /**
     * Check if provider can accept a request, then atomically reserve a slot.
     * Pre-increments the counter so concurrent async callers cannot exceed the limit.
     * Returns false if rate limited or unhealthy — caller must NOT proceed.
     */
    canMakeRequest() {
        this._resetCounters();
        if (this.requestCount.minute >= this.rateLimit.requestsPerMinute) return false;
        if (this.requestCount.day >= this.rateLimit.requestsPerDay) return false;
        if (!this.isHealthy) return false;
        // Pre-increment to reserve the slot before the async work begins
        this.requestCount.minute++;
        this.requestCount.day++;
        return true;
    }

    recordRequest() {
        // No-op — already pre-incremented in canMakeRequest()
    }

    recordLatency(ms) {
        this.latencySamples.push(ms);
        if (this.latencySamples.length > 100) this.latencySamples.shift();
        this.averageLatency = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
    }

    recordError(error) {
        this.isHealthy = false;
        this.lastError = { message: error.message, timestamp: Date.now() };
        // Cancel any pending health-restoration timer so only the latest error controls recovery
        if (this._healthTimer) clearTimeout(this._healthTimer);
        this._healthTimer = setTimeout(() => {
            this.isHealthy = true;
            this._healthTimer = null;
        }, 30000);
    }

    recordSuccess() {
        this.isHealthy = true;
        this.lastSuccess = Date.now();
    }

    getHealthStatus() {
        return {
            provider: this.name,
            isHealthy: this.isHealthy,
            priority: this.priority,
            requestsPerMinute: this.requestCount.minute,
            requestsPerDay: this.requestCount.day,
            rateLimit: this.rateLimit,
            averageLatency: Math.round(this.averageLatency),
            lastSuccess: this.lastSuccess,
            lastError: this.lastError,
            supportedAssetTypes: this.supportedAssetTypes
        };
    }

    _resetCounters() {
        const now = Date.now();
        if (now - this.requestCount.lastMinuteReset > 60000) {
            this.requestCount.minute = 0;
            this.requestCount.lastMinuteReset = now;
        }
        if (now - this.requestCount.lastDayReset > 86400000) {
            this.requestCount.day = 0;
            this.requestCount.lastDayReset = now;
        }
    }
}

module.exports = BaseProvider;
