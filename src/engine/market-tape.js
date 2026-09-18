/**
 * Market Tape Engine
 * 
 * Manages a professional market tape (time & sales feed).
 * Shows: TIME, PRICE, SIZE, CHANGE, SOURCE
 * 
 * Features:
 * - Pause/Resume
 * - Symbol filtering
 * - Large-print highlighting
 * - Volume anomaly detection
 * - Configurable buffer size
 */
class MarketTape {
    constructor(config = {}) {
        this.buffer = [];
        this.maxSize = config.maxSize || 1000;
        this.isPaused = false;
        this.filters = { symbols: [], minSize: 0 };
        this.largePrintThreshold = config.largePrintThreshold || 100000;
        this.anomalyThreshold = config.anomalyThreshold || 3.0; // 3x average = anomaly
        this._averageSize = 10000;
        this._sizeHistory = [];
    }

    /**
     * Add a trade/quote update to the tape
     */
    add(entry) {
        if (this.isPaused) return;

        const tapeEntry = {
            time: entry.timestamp || new Date().toISOString(),
            symbol: entry.symbol || '',
            price: parseFloat(entry.price || 0),
            size: parseInt(entry.volume || entry.size || 0),
            change: parseFloat(entry.change || entry.changePercent || 0),
            source: entry.source || 'unknown',
            isLargePrint: false,
            isVolumeAnomaly: false,
            direction: entry.change > 0 ? 'up' : entry.change < 0 ? 'down' : 'flat'
        };

        // Track size for anomaly detection
        this._sizeHistory.push(tapeEntry.size);
        if (this._sizeHistory.length > 100) this._sizeHistory.shift();
        this._averageSize = this._sizeHistory.reduce((a, b) => a + b, 0) / this._sizeHistory.length;

        // Mark large prints
        tapeEntry.isLargePrint = tapeEntry.size >= this.largePrintThreshold;

        // Mark volume anomalies (> N times average)
        if (this._averageSize > 0) {
            tapeEntry.isVolumeAnomaly = (tapeEntry.size / this._averageSize) >= this.anomalyThreshold;
        }

        // Apply filters
        if (this.filters.symbols.length > 0 && !this.filters.symbols.includes(tapeEntry.symbol)) {
            return;
        }
        if (this.filters.minSize > 0 && tapeEntry.size < this.filters.minSize) {
            return;
        }

        this.buffer.push(tapeEntry);

        // Trim buffer
        if (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
    }

    /**
     * Get tape entries with optional filters
     */
    getEntries(options = {}) {
        let entries = [...this.buffer];

        if (options.symbol) {
            entries = entries.filter(e => e.symbol === options.symbol);
        }
        if (options.direction) {
            entries = entries.filter(e => e.direction === options.direction);
        }
        if (options.largePrintsOnly) {
            entries = entries.filter(e => e.isLargePrint);
        }
        if (options.anomaliesOnly) {
            entries = entries.filter(e => e.isVolumeAnomaly);
        }
        if (options.since) {
            const since = new Date(options.since).getTime();
            entries = entries.filter(e => new Date(e.time).getTime() >= since);
        }

        // Most recent first
        if (options.sort !== 'oldest') {
            entries.reverse();
        }

        // Limit
        if (options.limit) {
            entries = entries.slice(0, options.limit);
        }

        return entries;
    }

    /**
     * Pause the tape
     */
    pause() { this.isPaused = true; }

    /**
     * Resume the tape
     */
    resume() { this.isPaused = false; }

    /**
     * Set symbol filter
     */
    filterBySymbols(symbols) {
        this.filters.symbols = symbols || [];
    }

    /**
     * Set minimum size filter
     */
    filterByMinSize(minSize) {
        this.filters.minSize = minSize || 0;
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.filters = { symbols: [], minSize: 0 };
    }

    /**
     * Get tape statistics
     */
    getStats() {
        const total = this.buffer.length;
        const ups = this.buffer.filter(e => e.direction === 'up').length;
        const downs = this.buffer.filter(e => e.direction === 'down').length;
        const largePrints = this.buffer.filter(e => e.isLargePrint).length;
        const anomalies = this.buffer.filter(e => e.isVolumeAnomaly).length;

        return {
            totalEntries: total,
            ups,
            downs,
            flat: total - ups - downs,
            largePrints,
            volumeAnomalies: anomalies,
            averageSize: Math.round(this._averageSize),
            isPaused: this.isPaused,
            bufferSize: this.maxSize
        };
    }

    /**
     * Clear the tape
     */
    clear() {
        this.buffer = [];
        this._sizeHistory = [];
    }
}

module.exports = MarketTape;
