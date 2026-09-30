/**
 * Sector Heatmap Engine
 *
 * Generates hierarchical heatmap data:
 * Market → Sector → Industry → Stock
 *
 * Every price, change and volume comes from the Market Data Gateway — the
 * same quotes the ticker, screener and AI Copilot read — in a single batched
 * call. The engine owns fetching its own data; it deliberately takes no
 * caller-supplied price data, because a caller that passes an empty object
 * (as a GET route always did) must not silently degrade into invented values.
 *
 * Anything the gateway cannot supply is reported as `null` with
 * `available: false` and carried in the `unavailable` count, never estimated.
 */
class SectorHeatmap {
    constructor(instrumentMaster, gateway) {
        this.master = instrumentMaster;
        this.gateway = gateway;
    }

    /**
     * Generate the full market heatmap from live gateway quotes.
     * @returns {Promise<HeatmapNode>}
     */
    async generate() {
        const instruments = [...this.master.instruments.values()].filter(i => i.assetType === 'stock');

        // One batched quote request for the whole universe.
        let quotes = [];
        if (this.gateway && instruments.length > 0) {
            try {
                quotes = await this.gateway.getQuotes(
                    instruments.map(i => ({ symbol: i.symbol, exchange: i.exchange }))
                );
            } catch (error) {
                // Provider failure → report the whole board as unavailable
                quotes = [];
            }
        }

        const bySymbol = new Map();
        for (const q of quotes) {
            if (q && q.symbol) bySymbol.set(q.symbol, q);
        }

        const sectors = {};
        let asOf = null;
        for (const inst of instruments) {
            const sector = inst.sector || 'Unknown';
            const industry = inst.industry || 'Unknown';

            if (!sectors[sector]) {
                sectors[sector] = { name: sector, industries: {}, stocks: [] };
            }
            if (!sectors[sector].industries[industry]) {
                sectors[sector].industries[industry] = { name: industry, stocks: [] };
            }

            const quote = bySymbol.get(inst.symbol) || null;
            const available = SectorHeatmap._isUsable(quote);

            if (available && quote.timestamp) {
                if (!asOf || new Date(quote.timestamp) > new Date(asOf)) asOf = quote.timestamp;
            }

            const changePercent = available && Number.isFinite(Number(quote.changePercent))
                ? parseFloat(Number(quote.changePercent).toFixed(2))
                : null;
            const change = available && Number.isFinite(Number(quote.change))
                ? parseFloat(Number(quote.change).toFixed(2))
                : null;

            const stockNode = {
                symbol: inst.symbol,
                companyName: inst.companyName,
                exchange: inst.exchange,
                available,
                price: available && Number.isFinite(Number(quote.price))
                    ? parseFloat(Number(quote.price).toFixed(2))
                    : null,
                change,
                changePercent,
                volume: available && Number.isFinite(Number(quote.volume)) ? Number(quote.volume) : null,
                // No fundamentals dataset is wired in — reported as unavailable,
                // never estimated from price.
                marketCap: null,
                size: changePercent === null ? 0 : Math.abs(changePercent),
                source: available ? (quote.source || 'unknown') : null,
                dataQuality: available ? (quote.dataQuality || 'UNKNOWN') : 'UNAVAILABLE'
            };

            sectors[sector].stocks.push(stockNode);
            sectors[sector].industries[industry].stocks.push(stockNode);
        }

        const byChangeDesc = (a, b) => {
            if (a.changePercent === null && b.changePercent === null) return 0;
            if (a.changePercent === null) return 1;
            if (b.changePercent === null) return -1;
            return b.changePercent - a.changePercent;
        };
        const avgChange = stocks => {
            const rated = stocks.filter(s => s.changePercent !== null);
            if (rated.length === 0) return null;
            return parseFloat((rated.reduce((a, s) => a + s.changePercent, 0) / rated.length).toFixed(2));
        };
        const totalVolume = stocks => {
            const volumes = stocks.map(s => s.volume).filter(v => v !== null);
            return volumes.length ? volumes.reduce((a, v) => a + v, 0) : null;
        };

        const sectorNodes = Object.values(sectors).map(sector => {
            const sectorChange = avgChange(sector.stocks);
            const industryNodes = Object.values(sector.industries).map(ind => {
                const indChange = avgChange(ind.stocks);
                return {
                    name: ind.name,
                    changePercent: indChange,
                    stockCount: ind.stocks.length,
                    availableCount: ind.stocks.filter(s => s.available).length,
                    stocks: [...ind.stocks].sort(byChangeDesc),
                    size: indChange === null ? 0 : Math.abs(indChange) * ind.stocks.length
                };
            });

            return {
                name: sector.name,
                changePercent: sectorChange,
                stockCount: sector.stocks.length,
                availableCount: sector.stocks.filter(s => s.available).length,
                totalVolume: totalVolume(sector.stocks),
                industries: industryNodes.sort(byChangeDesc),
                stocks: [...sector.stocks].sort(byChangeDesc),
                size: sectorChange === null ? 0 : Math.abs(sectorChange) * sector.stocks.length
            };
        });

        sectorNodes.sort(byChangeDesc);

        const flat = sectorNodes.flatMap(s => s.stocks);
        const rated = flat.filter(s => s.changePercent !== null);
        const ranked = sectorNodes.filter(s => s.changePercent !== null);
        const sources = [...new Set(flat.map(s => s.source).filter(Boolean))];
        const qualities = [...new Set(flat.map(s => s.dataQuality).filter(q => q && q !== 'UNAVAILABLE'))];

        return {
            name: 'Market',
            sectors: sectorNodes,
            stats: {
                advancers: rated.filter(s => s.changePercent > 0).length,
                decliners: rated.filter(s => s.changePercent < 0).length,
                unchanged: rated.filter(s => s.changePercent === 0).length,
                unavailable: flat.length - rated.length,
                totalStocks: flat.length,
                topSector: ranked[0]?.name || '',
                bottomSector: ranked[ranked.length - 1]?.name || ''
            },
            provenance: {
                sources,
                qualities,
                asOf,
                rated: rated.length,
                unavailable: flat.length - rated.length
            },
            timestamp: new Date().toISOString()
        };
    }

    /** A quote is usable only if it carries a real, finite percent change. */
    static _isUsable(quote) {
        return !!quote
            && quote.changePercent !== undefined
            && quote.changePercent !== null
            && Number.isFinite(Number(quote.changePercent));
    }

    /**
     * Drill down into a sector
     */
    async drilldown(sectorName) {
        const full = await this.generate();
        return full.sectors.find(s => s.name === sectorName) || null;
    }

    /**
     * Get sector performance summary
     */
    async getSectorPerformance() {
        const full = await this.generate();
        return full.sectors.map(s => ({
            name: s.name,
            changePercent: s.changePercent,
            stockCount: s.stockCount,
            availableCount: s.availableCount,
            topStock: s.stocks[0]?.symbol || '',
            bottomStock: s.stocks[s.stocks.length - 1]?.symbol || ''
        }));
    }
}

module.exports = SectorHeatmap;
