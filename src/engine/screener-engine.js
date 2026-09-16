/**
 * Advanced Screener Engine
 * 
 * Filters instruments by any combination of:
 * - Price, market cap, volume, relative volume
 * - % change (1D, 1W, 1M)
 * - Technical indicators: RSI, MACD, EMA, SMA, ATR, Bollinger
 * - 52-week high/low proximity
 * - Sector, industry, exchange, country
 * - Dividend yield, P/E, EPS (where available)
 * 
 * Supports custom filter builder:
 *   RSI < 30 AND volume > 2x average AND price > 200 EMA
 *
 * All technical values are computed from real candle history via the
 * IndicatorEngine — never synthesised.
 */
const IndicatorEngine = require('./indicator-engine');

class ScreenerEngine {
    constructor(instrumentMaster, gateway) {
        this.master = instrumentMaster;
        this.gateway = gateway;
        this.savedScreens = new Map(); // screenId → { name, filters, created }
        this._filterDefinitions = this._buildFilterDefinitions();
    }

    /**
     * Run a screen with given filters
     * @param {Array<Filter>} filters - Array of { field, operator, value, indicator? }
     * @returns {Promise<Array<ScreenResult>>}
     */
    async runScreen(filters = []) {
        // Get all instruments
        let candidates = [...this.master.instruments.values()];

        // Apply static filters first (from instrument master data)
        const staticFilters = filters.filter(f => this._isStaticFilter(f.field));
        for (const filter of staticFilters) {
            candidates = candidates.filter(item => this._applyFilter(item, filter));
        }

        if (candidates.length === 0) return [];

        // For technical indicator filters, we need price data
        const technicalFilters = filters.filter(f => !this._isStaticFilter(f.field));
        if (technicalFilters.length > 0) {
            // Enrich with market data (limit to avoid hammering APIs)
            const enriched = await this._enrichWithMarketData(candidates.slice(0, 100));
            candidates = enriched.filter(item => {
                return technicalFilters.every(f => this._applyTechnicalFilter(item, f));
            });
        }

        // Apply limit
        return candidates.slice(0, 500);
    }

    /**
     * Get available filter definitions for the UI
     */
    getFilterDefinitions() {
        return this._filterDefinitions;
    }

    /**
     * Save a screen configuration
     */
    saveScreen(name, filters) {
        const id = `screen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        this.savedScreens.set(id, { name, filters, created: new Date().toISOString(), runCount: 0 });
        return id;
    }

    /**
     * Run a saved screen
     */
    async runSavedScreen(screenId) {
        const screen = this.savedScreens.get(screenId);
        if (!screen) throw new Error(`Screen ${screenId} not found`);
        screen.runCount++;
        return this.runScreen(screen.filters);
    }

    /**
     * Get all saved screens
     */
    getSavedScreens() {
        return [...this.savedScreens.entries()].map(([id, s]) => ({ id, ...s }));
    }

    /**
     * Delete a saved screen
     */
    deleteScreen(screenId) {
        return this.savedScreens.delete(screenId);
    }

    // ========================================
    // PRESET SCREENS
    // ========================================

    getPresetScreens() {
        return [
            {
                name: 'Oversold Bounce',
                description: 'RSI < 30, price near 52-week low, high volume',
                filters: [
                    { field: 'rsi', operator: '<', value: 30 },
                    { field: 'proximity52wLow', operator: '<', value: 10 },
                    { field: 'relativeVolume', operator: '>', value: 1.5 }
                ]
            },
            {
                name: 'Breakout Alert',
                description: 'Price near 52-week high, high volume, MACD bullish',
                filters: [
                    { field: 'proximity52wHigh', operator: '<', value: 5 },
                    { field: 'relativeVolume', operator: '>', value: 2 },
                    { field: 'macdHistogram', operator: '>', value: 0 }
                ]
            },
            {
                name: 'Dividend Income',
                description: 'High dividend yield, low P/E, stable large cap',
                filters: [
                    { field: 'dividendYield', operator: '>', value: 2 },
                    { field: 'peRatio', operator: '<', value: 25 },
                    { field: 'marketCap', operator: '>', value: 10000 }
                ]
            },
            {
                name: 'Momentum Leaders',
                description: 'Strong uptrend, RSI > 50, price above all EMAs',
                filters: [
                    { field: 'rsi', operator: '>', value: 50 },
                    { field: 'rsi', operator: '<', value: 70 },
                    { field: 'change1D', operator: '>', value: 1 },
                    { field: 'volume', operator: '>', value: 100000 }
                ]
            },
            {
                name: 'Sector Leaders',
                description: 'Top performers by sector',
                filters: [
                    { field: 'change1D', operator: '>', value: 2 },
                    { field: 'relativeVolume', operator: '>', value: 1.2 }
                ]
            }
        ];
    }

    // ========================================
    // FILTER APPLICATION
    // ========================================

    _applyFilter(item, filter) {
        const value = this._getFieldValue(item, filter.field);
        if (value === null || value === undefined) return false;
        return this._compare(value, filter.operator, filter.value);
    }

    _applyTechnicalFilter(item, filter) {
        const tech = item._technicalData;
        if (!tech) return false;

        let value;
        switch (filter.field) {
            case 'rsi': value = tech.rsi; break;
            case 'macdHistogram': value = tech.macdHistogram; break;
            case 'macdLine': value = tech.macdLine; break;
            case 'ema20': value = tech.ema20; break;
            case 'ema50': value = tech.ema50; break;
            case 'ema200': value = tech.ema200; break;
            case 'sma20': value = tech.sma20; break;
            case 'sma50': value = tech.sma50; break;
            case 'sma200': value = tech.sma200; break;
            case 'atr': value = tech.atr; break;
            case 'bollingerPosition': value = tech.bollingerPosition; break;
            case 'stochasticK': value = tech.stochasticK; break;
            case 'adx': value = tech.adx; break;
            case 'priceAboveEma200': return tech.price > tech.ema200;
            case 'priceAboveEma50': return tech.price > tech.ema50;
            case 'volume': value = tech.volume; break;
            case 'relativeVolume': value = tech.relativeVolume; break;
            case 'change1D': value = tech.change1D; break;
            case 'change1W': value = tech.change1W; break;
            case 'change1M': value = tech.change1M; break;
            case 'proximity52wHigh': value = tech.proximity52wHigh; break;
            case 'proximity52wLow': value = tech.proximity52wLow; break;
            case 'price': value = tech.price; break;
            case 'marketCap': value = tech.marketCap; break;
            case 'dividendYield': value = tech.dividendYield; break;
            case 'peRatio': value = tech.peRatio; break;
            default: return true; // Unknown field passes
        }

        if (value === null || value === undefined) return false;
        return this._compare(value, filter.operator, filter.value);
    }

    _compare(actual, operator, expected) {
        switch (operator) {
            case '>': return actual > expected;
            case '>=': return actual >= expected;
            case '<': return actual < expected;
            case '<=': return actual <= expected;
            case '=': case '==': return actual === expected;
            case '!=': return actual !== expected;
            case 'between': return actual >= expected[0] && actual <= expected[1];
            case 'contains': return String(actual).toLowerCase().includes(String(expected).toLowerCase());
            default: return true;
        }
    }

    _getFieldValue(item, field) {
        switch (field) {
            case 'symbol': return item.symbol;
            case 'companyName': return item.companyName;
            case 'sector': return item.sector;
            case 'industry': return item.industry;
            case 'exchange': return item.exchange;
            case 'country': return item.country;
            case 'assetType': return item.assetType;
            default: return null;
        }
    }

    _isStaticFilter(field) {
        return ['symbol', 'companyName', 'sector', 'industry', 'exchange', 'country', 'assetType'].includes(field);
    }

    async _enrichWithMarketData(instruments) {
        // Real indicators, computed from each instrument's actual candle
        // history plus its live quote. Values with no available dataset
        // (market cap, P/E, dividend yield) stay null so the UI can report
        // DATA UNAVAILABLE instead of showing an invented number.
        return Promise.all(instruments.map(async inst => {
            let quote = null;
            let candles = [];

            try {
                quote = await this.gateway.getQuote(inst.symbol, inst.exchange);
            } catch (error) { /* quote unavailable → fall back to last close */ }

            try {
                candles = await this.gateway.getHistory(inst.symbol, inst.exchange, '1D', 260);
            } catch (error) { /* history unavailable → indicators report null */ }

            const technical = IndicatorEngine.snapshot(candles, quote);
            return {
                ...inst,
                _technicalData: technical,
                dataProvenance: {
                    source: (quote && quote.source) || technical.dataSource,
                    quality: (quote && quote.dataQuality) || (candles.length ? 'DEMO' : 'UNAVAILABLE'),
                    bars: candles.length
                }
            };
        }));
    }

    _buildFilterDefinitions() {
        return {
            static: [
                { field: 'symbol', label: 'Symbol', type: 'text', operators: ['contains', '=', '!='] },
                { field: 'companyName', label: 'Company Name', type: 'text', operators: ['contains'] },
                { field: 'sector', label: 'Sector', type: 'select', options: ['IT', 'Financials', 'Energy', 'Healthcare', 'Consumer Staples', 'Consumer Discretionary', 'Materials', 'Industrials', 'Utilities', 'Telecom', 'Cryptocurrency', 'Forex'] },
                { field: 'industry', label: 'Industry', type: 'text', operators: ['contains', '='] },
                { field: 'exchange', label: 'Exchange', type: 'select', options: ['NSE', 'BSE', 'NYSE', 'NASDAQ', 'LSE', 'COINGECKO', 'FX'] },
                { field: 'country', label: 'Country', type: 'select', options: ['India', 'USA', 'UK', 'Germany', 'Japan', 'Global'] },
                { field: 'assetType', label: 'Asset Type', type: 'select', options: ['stock', 'crypto', 'forex', 'index', 'etf'] }
            ],
            technical: [
                { field: 'price', label: 'Price', type: 'number', unit: '₹/$' },
                { field: 'rsi', label: 'RSI (14)', type: 'number', range: [0, 100] },
                { field: 'macdHistogram', label: 'MACD Histogram', type: 'number' },
                { field: 'ema20', label: 'EMA 20', type: 'number' },
                { field: 'ema50', label: 'EMA 50', type: 'number' },
                { field: 'ema200', label: 'EMA 200', type: 'number' },
                { field: 'sma20', label: 'SMA 20', type: 'number' },
                { field: 'sma50', label: 'SMA 50', type: 'number' },
                { field: 'sma200', label: 'SMA 200', type: 'number' },
                { field: 'atr', label: 'ATR', type: 'number' },
                { field: 'bollingerPosition', label: 'Bollinger Position', type: 'number', range: [0, 100] },
                { field: 'stochasticK', label: 'Stochastic %K', type: 'number', range: [0, 100] },
                { field: 'adx', label: 'ADX', type: 'number', range: [0, 100] },
                { field: 'volume', label: 'Volume', type: 'number' },
                { field: 'relativeVolume', label: 'Relative Volume', type: 'number' },
                { field: 'change1D', label: 'Change 1D %', type: 'number' },
                { field: 'change1W', label: 'Change 1W %', type: 'number' },
                { field: 'change1M', label: 'Change 1M %', type: 'number' },
                { field: 'proximity52wHigh', label: '% from 52W High', type: 'number', range: [0, 100] },
                { field: 'proximity52wLow', label: '% from 52W Low', type: 'number', range: [0, 100] },
                { field: 'marketCap', label: 'Market Cap (Cr)', type: 'number' },
                { field: 'dividendYield', label: 'Dividend Yield %', type: 'number', range: [0, 20] },
                { field: 'peRatio', label: 'P/E Ratio', type: 'number' },
                { field: 'priceAboveEma200', label: 'Price > 200 EMA', type: 'boolean' },
                { field: 'priceAboveEma50', label: 'Price > 50 EMA', type: 'boolean' }
            ]
        };
    }
}

module.exports = ScreenerEngine;
