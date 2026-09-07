/**
 * Instrument Master
 * 
 * A searchable database of financial instruments.
 * Pre-populated with major instruments, expandable via provider search.
 * 
 * Supports:
 * - Symbol search
 * - Company name search
 * - Exchange filter
 * - Asset class filter
 * - Sector / Industry filter
 * - Country filter
 * - Index membership
 */
class InstrumentMaster {
    constructor() {
        this.instruments = new Map(); // symbol:exchange → Instrument
        this._buildIndianInstruments();
        this._buildGlobalIndices();
        this._buildCryptoInstruments();
        this._buildForexInstruments();
    }

    /**
     * Search instruments by query string and optional filters
     */
    search(query, filters = {}) {
        const q = (query || '').toUpperCase().trim();
        let results = [...this.instruments.values()];

        // Text search across symbol, companyName, sector
        if (q) {
            results = results.filter(inst =>
                inst.symbol.toUpperCase().includes(q) ||
                inst.companyName.toUpperCase().includes(q) ||
                (inst.sector && inst.sector.toUpperCase().includes(q)) ||
                (inst.industry && inst.industry.toUpperCase().includes(q))
            );
        }

        // Apply filters
        if (filters.assetType) {
            results = results.filter(i => i.assetType === filters.assetType);
        }
        if (filters.exchange) {
            results = results.filter(i => i.exchange === filters.exchange);
        }
        if (filters.sector) {
            results = results.filter(i => i.sector === filters.sector);
        }
        if (filters.country) {
            results = results.filter(i => i.country === filters.country);
        }
        if (filters.index) {
            results = results.filter(i => i.indexMembership && i.indexMembership.includes(filters.index));
        }

        // Sort by relevance: exact symbol match first, then starts-with, then contains
        if (q) {
            results.sort((a, b) => {
                const aExact = a.symbol.toUpperCase() === q ? 0 : 1;
                const bExact = b.symbol.toUpperCase() === q ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                const aStarts = a.symbol.toUpperCase().startsWith(q) ? 0 : 1;
                const bStarts = b.symbol.toUpperCase().startsWith(q) ? 0 : 1;
                if (aStarts !== bStarts) return aStarts - bStarts;
                return a.symbol.localeCompare(b.symbol);
            });
        }

        return results;
    }

    /**
     * Get instrument by exact symbol + exchange
     */
    getBySymbol(symbol, exchange) {
        const key = `${symbol}:${exchange || 'default'}`;
        return this.instruments.get(key) || null;
    }

    /**
     * Get all instruments for an asset class
     */
    getByAssetType(assetType) {
        return [...this.instruments.values()].filter(i => i.assetType === assetType);
    }

    /**
     * Get all instruments for an exchange
     */
    getByExchange(exchange) {
        return [...this.instruments.values()].filter(i => i.exchange === exchange);
    }

    /**
     * Get all instruments in a sector
     */
    getBySector(sector) {
        return [...this.instruments.values()].filter(i => i.sector === sector);
    }

    /**
     * Get all instruments in an index
     */
    getByIndex(indexName) {
        return [...this.instruments.values()].filter(i =>
            i.indexMembership && i.indexMembership.includes(indexName)
        );
    }

    /**
     * Get unique sectors
     */
    getSectors() {
        const sectors = new Set();
        for (const inst of this.instruments.values()) {
            if (inst.sector) sectors.add(inst.sector);
        }
        return [...sectors].sort();
    }

    /**
     * Get unique asset types
     */
    getAssetTypes() {
        const types = new Set();
        for (const inst of this.instruments.values()) {
            types.add(inst.assetType);
        }
        return [...types].sort();
    }

    /**
     * Add or update an instrument from provider data
     */
    upsert(instrument) {
        const key = `${instrument.symbol}:${instrument.exchange || 'default'}`;
        const existing = this.instruments.get(key);
        if (existing) {
            // Merge provider mappings
            if (instrument.providerMappings) {
                existing.providerMappings = { ...existing.providerMappings, ...instrument.providerMappings };
            }
            // Update empty fields
            for (const [k, v] of Object.entries(instrument)) {
                if (v && !existing[k]) existing[k] = v;
            }
        } else {
            this.instruments.set(key, instrument);
        }
    }

    /**
     * Bulk upsert from search results
     */
    bulkUpsert(instruments) {
        for (const inst of instruments) {
            this.upsert(inst);
        }
    }

    /**
     * Get count
     */
    get size() {
        return this.instruments.size;
    }

    // ========================================
    // Pre-populated instrument data
    // ========================================

    _addInstrument(data) {
        const inst = {
            symbol: data.symbol,
            exchange: data.exchange || '',
            companyName: data.companyName || '',
            sector: data.sector || '',
            industry: data.industry || '',
            country: data.country || 'India',
            assetType: data.assetType || 'stock',
            currency: data.currency || 'INR',
            timezone: data.timezone || 'Asia/Kolkata',
            lotSize: data.lotSize || 1,
            tickSize: data.tickSize || 0.05,
            isin: data.isin || '',
            status: 'ACTIVE',
            indexMembership: data.indexMembership || [],
            providerMappings: {}
        };
        this.instruments.set(`${inst.symbol}:${inst.exchange}`, inst);
    }

    _buildIndianInstruments() {
        const nifty50 = [
            { symbol: 'RELIANCE', companyName: 'Reliance Industries Ltd', sector: 'Energy', industry: 'Oil & Gas', lotSize: 1 },
            { symbol: 'TCS', companyName: 'Tata Consultancy Services', sector: 'IT', industry: 'Software Services', lotSize: 1 },
            { symbol: 'HDFCBANK', companyName: 'HDFC Bank Ltd', sector: 'Financials', industry: 'Banking', lotSize: 1 },
            { symbol: 'INFY', companyName: 'Infosys Ltd', sector: 'IT', industry: 'Software Services', lotSize: 1 },
            { symbol: 'ICICIBANK', companyName: 'ICICI Bank Ltd', sector: 'Financials', industry: 'Banking', lotSize: 1 },
            { symbol: 'HINDUNILVR', companyName: 'Hindustan Unilever Ltd', sector: 'Consumer Staples', industry: 'FMCG', lotSize: 1 },
            { symbol: 'ITC', companyName: 'ITC Ltd', sector: 'Consumer Staples', industry: 'FMCG', lotSize: 1 },
            { symbol: 'SBIN', companyName: 'State Bank of India', sector: 'Financials', industry: 'Banking', lotSize: 1 },
            { symbol: 'BHARTIARTL', companyName: 'Bharti Airtel Ltd', sector: 'Telecom', industry: 'Telecom Services', lotSize: 1 },
            { symbol: 'KOTAKBANK', companyName: 'Kotak Mahindra Bank Ltd', sector: 'Financials', industry: 'Banking', lotSize: 1 },
            { symbol: 'LT', companyName: 'Larsen & Toubro Ltd', sector: 'Industrials', industry: 'Construction', lotSize: 1 },
            { symbol: 'AXISBANK', companyName: 'Axis Bank Ltd', sector: 'Financials', industry: 'Banking', lotSize: 1 },
            { symbol: 'ASIANPAINT', companyName: 'Asian Paints Ltd', sector: 'Materials', industry: 'Specialty Chemicals', lotSize: 1 },
            { symbol: 'MARUTI', companyName: 'Maruti Suzuki India Ltd', sector: 'Consumer Discretionary', industry: 'Automobiles', lotSize: 1 },
            { symbol: 'SUNPHARMA', companyName: 'Sun Pharmaceutical Industries Ltd', sector: 'Healthcare', industry: 'Pharmaceuticals', lotSize: 1 },
            { symbol: 'TATAMOTORS', companyName: 'Tata Motors Ltd', sector: 'Consumer Discretionary', industry: 'Automobiles', lotSize: 1 },
            { symbol: 'WIPRO', companyName: 'Wipro Ltd', sector: 'IT', industry: 'Software Services', lotSize: 1 },
            { symbol: 'ULTRACEMCO', companyName: 'UltraTech Cement Ltd', sector: 'Materials', industry: 'Cement', lotSize: 1 },
            { symbol: 'TITAN', companyName: 'Titan Company Ltd', sector: 'Consumer Discretionary', industry: 'Luxury Goods', lotSize: 1 },
            { symbol: 'BAJFINANCE', companyName: 'Bajaj Finance Ltd', sector: 'Financials', industry: 'NBFC', lotSize: 1 },
            { symbol: 'NESTLEIND', companyName: 'Nestle India Ltd', sector: 'Consumer Staples', industry: 'Food Processing', lotSize: 1 },
            { symbol: 'POWERGRID', companyName: 'Power Grid Corporation of India', sector: 'Utilities', industry: 'Power Distribution', lotSize: 1 },
            { symbol: 'NTPC', companyName: 'NTPC Ltd', sector: 'Utilities', industry: 'Power Generation', lotSize: 1 },
            { symbol: 'ONGC', companyName: 'Oil and Natural Gas Corporation', sector: 'Energy', industry: 'Oil & Gas', lotSize: 1 },
            { symbol: 'TATASTEEL', companyName: 'Tata Steel Ltd', sector: 'Materials', industry: 'Steel', lotSize: 1 },
            { symbol: 'HCLTECH', companyName: 'HCL Technologies Ltd', sector: 'IT', industry: 'Software Services', lotSize: 1 },
            { symbol: 'TECHM', companyName: 'Tech Mahindra Ltd', sector: 'IT', industry: 'Software Services', lotSize: 1 },
            { symbol: 'DRREDDY', companyName: "Dr. Reddy's Laboratories Ltd", sector: 'Healthcare', industry: 'Pharmaceuticals', lotSize: 1 },
            { symbol: 'CIPLA', companyName: 'Cipla Ltd', sector: 'Healthcare', industry: 'Pharmaceuticals', lotSize: 1 },
            { symbol: 'ADANIENT', companyName: 'Adani Enterprises Ltd', sector: 'Industrials', industry: 'Trading', lotSize: 1 },
            { symbol: 'BAJAJFINSV', companyName: 'Bajaj Finserv Ltd', sector: 'Financials', industry: 'Insurance', lotSize: 1 },
            { symbol: 'TATACONSUM', companyName: 'Tata Consumer Products Ltd', sector: 'Consumer Staples', industry: 'Food Products', lotSize: 1 },
            { symbol: 'DIVISLAB', companyName: "Divi's Laboratories Ltd", sector: 'Healthcare', industry: 'Pharmaceuticals', lotSize: 1 },
            { symbol: 'DRREDDY', companyName: "Dr. Reddy's Laboratories Ltd", sector: 'Healthcare', industry: 'Pharmaceuticals', lotSize: 1 },
            { symbol: 'EICHERMOT', companyName: 'Eicher Motors Ltd', sector: 'Consumer Discretionary', industry: 'Automobiles', lotSize: 1 },
            { symbol: 'GRASIM', companyName: 'Grasim Industries Ltd', sector: 'Materials', industry: 'Cement', lotSize: 1 },
            { symbol: 'HINDALCO', companyName: 'Hindalco Industries Ltd', sector: 'Materials', industry: 'Metals & Mining', lotSize: 1 },
            { symbol: 'JSWSTEEL', companyName: 'JSW Steel Ltd', sector: 'Materials', industry: 'Steel', lotSize: 1 },
            { symbol: 'COALINDIA', companyName: 'Coal India Ltd', sector: 'Energy', industry: 'Mining', lotSize: 1 },
            { symbol: 'BPCL', companyName: 'Bharat Petroleum Corporation Ltd', sector: 'Energy', industry: 'Oil & Gas', lotSize: 1 },
            { symbol: 'HEROMOTOCO', companyName: 'Hero MotoCorp Ltd', sector: 'Consumer Discretionary', industry: 'Automobiles', lotSize: 1 },
            { symbol: 'HINDALCO', companyName: 'Hindalco Industries Ltd', sector: 'Materials', industry: 'Metals & Mining', lotSize: 1 },
            { symbol: 'BRITANNIA', companyName: 'Britannia Industries Ltd', sector: 'Consumer Staples', industry: 'Food Products', lotSize: 1 },
            { symbol: 'APOLLOHOSP', companyName: 'Apollo Hospitals Enterprise Ltd', sector: 'Healthcare', industry: 'Healthcare Services', lotSize: 1 },
            { symbol: 'TRENT', companyName: 'Trent Ltd', sector: 'Consumer Discretionary', industry: 'Retail', lotSize: 1 },
            { symbol: 'BAJAJ-AUTO', companyName: 'Bajaj Auto Ltd', sector: 'Consumer Discretionary', industry: 'Automobiles', lotSize: 1 },
            { symbol: 'INDUSINDBK', companyName: 'IndusInd Bank Ltd', sector: 'Financials', industry: 'Banking', lotSize: 1 },
            { symbol: 'M&M', companyName: 'Mahindra & Mahindra Ltd', sector: 'Consumer Discretionary', industry: 'Automobiles', lotSize: 1 },
            { symbol: 'SBILIFE', companyName: 'SBI Life Insurance Company Ltd', sector: 'Financials', industry: 'Insurance', lotSize: 1 },
            { symbol: 'ADANIPORTS', companyName: 'Adani Ports and Special Economic Zone', sector: 'Industrials', industry: 'Ports & Logistics', lotSize: 1 },
        ];

        for (const inst of nifty50) {
            this._addInstrument({
                ...inst,
                exchange: 'NSE',
                country: 'India',
                assetType: 'stock',
                currency: 'INR',
                indexMembership: ['NIFTY_50', 'NIFTY']
            });
        }
    }

    _buildGlobalIndices() {
        const indices = [
            { symbol: 'NIFTY', companyName: 'NIFTY 50', exchange: 'NSE', assetType: 'index', sector: 'Index', country: 'India' },
            { symbol: 'SENSEX', companyName: 'BSE SENSEX', exchange: 'BSE', assetType: 'index', sector: 'Index', country: 'India' },
            { symbol: 'NIFTY_BANK', companyName: 'NIFTY Bank', exchange: 'NSE', assetType: 'index', sector: 'Index', country: 'India' },
            { symbol: 'NIFTY_IT', companyName: 'NIFTY IT', exchange: 'NSE', assetType: 'index', sector: 'Index', country: 'India' },
            { symbol: 'INDIA_VIX', companyName: 'India VIX', exchange: 'NSE', assetType: 'index', sector: 'Volatility', country: 'India' },
            { symbol: 'SPX', companyName: 'S&P 500', exchange: 'NYSE', assetType: 'index', sector: 'Index', country: 'USA' },
            { symbol: 'IXIC', companyName: 'NASDAQ Composite', exchange: 'NASDAQ', assetType: 'index', sector: 'Index', country: 'USA' },
            { symbol: 'DJI', companyName: 'Dow Jones Industrial Average', exchange: 'NYSE', assetType: 'index', sector: 'Index', country: 'USA' },
            { symbol: 'FTSE', companyName: 'FTSE 100', exchange: 'LSE', assetType: 'index', sector: 'Index', country: 'UK' },
            { symbol: 'DAX', companyName: 'DAX', exchange: 'XETRA', assetType: 'index', sector: 'Index', country: 'Germany' },
            { symbol: 'NIKKEI', companyName: 'Nikkei 225', exchange: 'TSE', assetType: 'index', sector: 'Index', country: 'Japan' },
        ];

        for (const idx of indices) {
            this._addInstrument({ ...idx, currency: idx.country === 'India' ? 'INR' : 'USD' });
        }
    }

    _buildCryptoInstruments() {
        const cryptos = [
            { symbol: 'BTC', companyName: 'Bitcoin', sector: 'Cryptocurrency', industry: 'Layer 1' },
            { symbol: 'ETH', companyName: 'Ethereum', sector: 'Cryptocurrency', industry: 'Layer 1' },
            { symbol: 'ADA', companyName: 'Cardano', sector: 'Cryptocurrency', industry: 'Layer 1' },
            { symbol: 'SOL', companyName: 'Solana', sector: 'Cryptocurrency', industry: 'Layer 1' },
            { symbol: 'XRP', companyName: 'Ripple', sector: 'Cryptocurrency', industry: 'Payment' },
            { symbol: 'DOT', companyName: 'Polkadot', sector: 'Cryptocurrency', industry: 'Layer 0' },
            { symbol: 'DOGE', companyName: 'Dogecoin', sector: 'Cryptocurrency', industry: 'Layer 1' },
            { symbol: 'AVAX', companyName: 'Avalanche', sector: 'Cryptocurrency', industry: 'Layer 1' },
            { symbol: 'LINK', companyName: 'Chainlink', sector: 'Cryptocurrency', industry: 'Oracle' },
            { symbol: 'MATIC', companyName: 'Polygon', sector: 'Cryptocurrency', industry: 'Layer 2' },
        ];

        for (const crypto of cryptos) {
            this._addInstrument({
                ...crypto,
                exchange: 'COINGECKO',
                assetType: 'crypto',
                currency: 'USD',
                country: 'Global'
            });
        }
    }

    _buildForexInstruments() {
        const forexPairs = [
            { symbol: 'USDINR', companyName: 'USD/INR', sector: 'Forex', industry: 'Major Pairs' },
            { symbol: 'EURINR', companyName: 'EUR/INR', sector: 'Forex', industry: 'Cross Pairs' },
            { symbol: 'GBPINR', companyName: 'GBP/INR', sector: 'Forex', industry: 'Cross Pairs' },
            { symbol: 'JPYINR', companyName: 'JPY/INR', sector: 'Forex', industry: 'Cross Pairs' },
            { symbol: 'EURUSD', companyName: 'EUR/USD', sector: 'Forex', industry: 'Major Pairs' },
            { symbol: 'GBPUSD', companyName: 'GBP/USD', sector: 'Forex', industry: 'Major Pairs' },
            { symbol: 'USDJPY', companyName: 'USD/JPY', sector: 'Forex', industry: 'Major Pairs' },
        ];

        for (const pair of forexPairs) {
            this._addInstrument({
                ...pair,
                exchange: 'FX',
                assetType: 'forex',
                currency: 'USD',
                country: 'Global'
            });
        }
    }
}

module.exports = InstrumentMaster;
