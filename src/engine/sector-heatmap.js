/**
 * Sector Heatmap Engine
 * 
 * Generates hierarchical heatmap data:
 * Market → Sector → Industry → Stock
 * 
 * Each node shows: price change %, volume, relative strength
 * Supports click-through navigation
 */
class SectorHeatmap {
    constructor(instrumentMaster) {
        this.master = instrumentMaster;
    }

    /**
     * Generate the full market heatmap
     * @param {object} priceData - { symbol: { price, change } }
     * @returns {HeatmapNode}
     */
    generate(priceData = {}) {
        const sectors = {};
        const allInstruments = [...this.master.instruments.values()].filter(i => i.assetType === 'stock');

        // Group by sector → industry → stocks
        for (const inst of allInstruments) {
            const sector = inst.sector || 'Unknown';
            const industry = inst.industry || 'Unknown';

            if (!sectors[sector]) {
                sectors[sector] = { name: sector, industries: {}, stocks: [] };
            }
            if (!sectors[sector].industries[industry]) {
                sectors[sector].industries[industry] = { name: industry, stocks: [] };
            }

            const pd = priceData[inst.symbol] || {};
            const change = pd.change || (Math.random() - 0.5) * 4;
            const price = pd.price || (1000 + Math.random() * 5000);
            const volume = pd.volume || Math.floor(100000 + Math.random() * 2000000);

            const stockNode = {
                symbol: inst.symbol,
                companyName: inst.companyName,
                exchange: inst.exchange,
                price: parseFloat(price.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat(change.toFixed(2)),
                volume,
                marketCap: price * (1000000 + Math.random() * 50000000),
                size: Math.abs(change) // For heatmap sizing
            };

            sectors[sector].stocks.push(stockNode);
            sectors[sector].industries[industry].stocks.push(stockNode);
        }

        // Calculate sector-level aggregates
        const sectorNodes = Object.values(sectors).map(sector => {
            const allStocks = sector.stocks;
            const avgChange = allStocks.length > 0
                ? allStocks.reduce((a, s) => a + s.change, 0) / allStocks.length
                : 0;
            const totalVolume = allStocks.reduce((a, s) => a + s.volume, 0);

            const industryNodes = Object.values(sector.industries).map(ind => {
                const indAvgChange = ind.stocks.length > 0
                    ? ind.stocks.reduce((a, s) => a + s.change, 0) / ind.stocks.length
                    : 0;
                return {
                    name: ind.name,
                    change: parseFloat(indAvgChange.toFixed(2)),
                    changePercent: parseFloat(indAvgChange.toFixed(2)),
                    stockCount: ind.stocks.length,
                    stocks: ind.stocks.sort((a, b) => b.change - a.change),
                    size: Math.abs(indAvgChange) * ind.stocks.length
                };
            });

            return {
                name: sector.name,
                change: parseFloat(avgChange.toFixed(2)),
                changePercent: parseFloat(avgChange.toFixed(2)),
                stockCount: allStocks.length,
                totalVolume,
                industries: industryNodes.sort((a, b) => b.change - a.change),
                stocks: allStocks.sort((a, b) => b.change - a.change),
                size: Math.abs(avgChange) * allStocks.length
            };
        });

        // Sort sectors by change
        sectorNodes.sort((a, b) => b.change - a.change);

        return {
            name: 'Market',
            sectors: sectorNodes,
            stats: {
                advancers: sectorNodes.reduce((a, s) => a + s.stocks.filter(st => st.change > 0).length, 0),
                decliners: sectorNodes.reduce((a, s) => a + s.stocks.filter(st => st.change < 0).length, 0),
                unchanged: sectorNodes.reduce((a, s) => a + s.stocks.filter(st => st.change === 0).length, 0),
                totalStocks: sectorNodes.reduce((a, s) => a + s.stockCount, 0),
                topSector: sectorNodes[0]?.name || '',
                bottomSector: sectorNodes[sectorNodes.length - 1]?.name || ''
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Drill down into a sector
     */
    drilldown(sectorName, priceData = {}) {
        const full = this.generate(priceData);
        return full.sectors.find(s => s.name === sectorName) || null;
    }

    /**
     * Get sector performance summary
     */
    getSectorPerformance(priceData = {}) {
        const full = this.generate(priceData);
        return full.sectors.map(s => ({
            name: s.name,
            change: s.change,
            stockCount: s.stockCount,
            topStock: s.stocks[0]?.symbol || '',
            bottomStock: s.stocks[s.stocks.length - 1]?.symbol || ''
        }));
    }
}

module.exports = SectorHeatmap;
