/**
 * Market Data Normalizer
 * 
 * Converts provider-specific response formats into the unified
 * internal schema. Every provider adapter calls the appropriate
 * normalizer method so the rest of the system only sees one format.
 */
class Normalizer {
    static normalizeQuote(raw, provider, assetType = 'stocks') {
        const numOr = (val, fallback) => {
            if (val === undefined || val === null || val === '') return fallback;
            const n = parseFloat(val);
            return isNaN(n) ? fallback : n;
        };

        return {
            symbol: raw.symbol || raw.ticker || '',
            exchange: raw.exchange || raw.exchangeCode || '',
            assetType,
            timestamp: raw.timestamp || new Date().toISOString(),
            price: numOr(raw.price !== undefined ? raw.price : raw.close, 0),
            bid: numOr(raw.bid !== undefined ? raw.bid : raw.bidPrice, null),
            ask: numOr(raw.ask !== undefined ? raw.ask : raw.askPrice, null),
            volume: (() => {
                const v = raw.volume !== undefined ? raw.volume : raw.dailyVolume;
                if (v === undefined || v === null || v === '') return 0;
                const n = parseInt(v, 10);
                return isNaN(n) ? 0 : n;
            })(),
            open: numOr(raw.open !== undefined ? raw.open : raw.openPrice, null),
            high: numOr(raw.high !== undefined ? raw.high : raw.dayHigh, null),
            low: numOr(raw.low !== undefined ? raw.low : raw.dayLow, null),
            previousClose: numOr(raw.previousClose !== undefined ? raw.previousClose : raw.prevClose, null),
            change: numOr(raw.change !== undefined ? raw.change : raw.priceChange, 0),
            changePercent: numOr(raw.changePercent !== undefined ? raw.changePercent : raw.percentChange, 0),
            source: provider,
            dataQuality: raw.dataQuality || 'LIVE'
        };
    }

    static normalizeCandle(raw, provider) {
        const numOr = (val, fallback) => {
            if (val === undefined || val === null || val === '') return fallback;
            const n = parseFloat(val);
            return isNaN(n) ? fallback : n;
        };

        return {
            symbol: raw.symbol || '',
            exchange: raw.exchange || '',
            timestamp: raw.timestamp || raw.date || raw.time || new Date().toISOString(),
            open: numOr(raw.open, 0),
            high: numOr(raw.high, 0),
            low: numOr(raw.low, 0),
            close: numOr(raw.close !== undefined ? raw.close : raw.price, 0),
            volume: (() => {
                const v = raw.volume;
                if (v === undefined || v === null || v === '') return 0;
                const n = parseInt(v, 10);
                return isNaN(n) ? 0 : n;
            })(),
            source: provider
        };
    }

    static normalizeInstrument(raw, provider) {
        return {
            symbol: raw.symbol || raw.ticker || '',
            exchange: raw.exchange || raw.exchangeCode || '',
            companyName: raw.companyName || raw.name || raw.description || '',
            sector: raw.sector || raw.industry_sector || '',
            industry: raw.industry || raw.industryGroup || '',
            country: raw.country || raw.countryCode || '',
            assetType: raw.assetType || 'stock',
            currency: raw.currency || raw.currencyCode || 'USD',
            timezone: raw.timezone || '',
            lotSize: raw.lotSize || raw.minQuantity || 1,
            tickSize: raw.tickSize || 0.01,
            isin: raw.isin || '',
            providerMappings: { [provider]: raw.symbol || raw.ticker || '' },
            status: raw.status || 'ACTIVE',
            source: provider
        };
    }

    static normalizeSector(raw, provider) {
        return {
            name: raw.name || raw.sectorName || '',
            change: parseFloat(raw.change || raw.changePercent || 0),
            changePercent: parseFloat(raw.changePercent || raw.change || 0),
            volume: parseInt(raw.volume || 0),
            marketCap: parseFloat(raw.marketCap || 0) || null,
            source: provider
        };
    }

    static normalizeIndex(raw, provider) {
        return {
            symbol: raw.symbol || raw.indexSymbol || '',
            name: raw.name || raw.indexName || '',
            price: parseFloat(raw.price || raw.last || raw.close || 0),
            change: parseFloat(raw.change || 0),
            changePercent: parseFloat(raw.changePercent || raw.percentChange || 0),
            open: parseFloat(raw.open || 0) || null,
            high: parseFloat(raw.high || 0) || null,
            low: parseFloat(raw.low || 0) || null,
            volume: parseInt(raw.volume || 0) || null,
            source: provider
        };
    }

    static assessDataQuality(timestamp) {
        if (!timestamp) return 'UNKNOWN';
        const age = Date.now() - new Date(timestamp).getTime();
        if (age < 0) return 'UNKNOWN';
        if (age < 60000) return 'LIVE';
        if (age < 300000) return 'REALTIME';
        if (age < 3600000) return 'DELAYED';
        if (age < 86400000) return 'STALE';
        return 'UNAVAILABLE';
    }

    /**
     * Merge quotes from multiple providers without mutating the input array
     */
    static mergeQuotes(quotes) {
        if (!quotes || quotes.length === 0) return null;
        const qualityRank = { LIVE: 0, REALTIME: 1, DELAYED: 2, STALE: 3, UNKNOWN: 4, UNAVAILABLE: 5 };
        return [...quotes].sort((a, b) => {
            const qa = qualityRank[a.dataQuality] ?? 4;
            const qb = qualityRank[b.dataQuality] ?? 4;
            if (qa !== qb) return qa - qb;
            return new Date(b.timestamp) - new Date(a.timestamp);
        })[0];
    }
}

module.exports = Normalizer;
