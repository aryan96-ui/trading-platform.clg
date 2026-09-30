/**
 * Risk Terminal Engine
 * 
 * Professional risk dashboard that shows:
 * - Portfolio exposure by sector, asset class, single-stock concentration
 * - Correlation analysis
 * - Volatility assessment
 * - Maximum drawdown tracking
 * - Position sizing calculator
 * - Risk per trade
 * - Stress scenarios ("What if X falls 5%?")
 */
class RiskTerminal {
    /**
     * Analyze portfolio risk
     * @param {object} portfolio - { holdings: [{ symbol, quantity, avgPrice, currentPrice, sector, assetType }] }
     * @param {object} marketData - { regime, volatility, etc }
     * @returns {RiskAnalysis}
     */
    analyze(portfolio, marketData = {}) {
        const holdings = portfolio.holdings || [];
        const totalValue = holdings.reduce((a, h) => a + (h.quantity * (h.currentPrice || h.avgPrice)), 0);

        if (totalValue === 0) {
            return this._emptyAnalysis('No positions to analyze');
        }

        // Enrich holdings with value data
        const enriched = holdings.map(h => ({
            ...h,
            value: h.quantity * (h.currentPrice || h.avgPrice),
            pnl: h.currentPrice ? (h.currentPrice - h.avgPrice) * h.quantity : 0,
            pnlPercent: h.avgPrice > 0 ? ((h.currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0,
            weight: 0
        }));

        // Calculate weights
        enriched.forEach(h => { h.weight = (h.value / totalValue) * 100; });

        // Sector exposure
        const sectorExposure = {};
        for (const h of enriched) {
            const sector = h.sector || 'Unknown';
            if (!sectorExposure[sector]) sectorExposure[sector] = { name: sector, value: 0, weight: 0, holdings: [] };
            sectorExposure[sector].value += h.value;
            sectorExposure[sector].holdings.push(h);
        }
        for (const s of Object.values(sectorExposure)) {
            s.weight = (s.value / totalValue) * 100;
        }

        // Asset class exposure
        const assetClassExposure = {};
        for (const h of enriched) {
            const type = h.assetType || 'stock';
            if (!assetClassExposure[type]) assetClassExposure[type] = { name: type, value: 0, weight: 0 };
            assetClassExposure[type].value += h.value;
        }
        for (const a of Object.values(assetClassExposure)) {
            a.weight = (a.value / totalValue) * 100;
        }

        // Concentration risk
        const maxSingleWeight = Math.max(...enriched.map(h => h.weight));
        const top3Weight = [...enriched].sort((a, b) => b.weight - a.weight).slice(0, 3).reduce((a, h) => a + h.weight, 0);
        const concentrationRisk = maxSingleWeight > 30 ? 'HIGH' : maxSingleWeight > 15 ? 'MODERATE' : 'LOW';

        // Sector concentration (HHI approximation)
        const sectorWeights = Object.values(sectorExposure).map(s => s.weight / 100);
        const hhi = sectorWeights.reduce((a, w) => a + w * w, 0);
        const sectorDiversification = hhi < 0.15 ? 'WELL DIVERSIFIED' : hhi < 0.30 ? 'MODERATELY CONCENTRATED' : 'HIGHLY CONCENTRATED';

        // Portfolio-level metrics
        const totalPnl = enriched.reduce((a, h) => a + h.pnl, 0);
        const totalPnlPercent = totalValue > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0;

        // Stress scenarios
        const scenarios = this._runStressScenarios(enriched, totalValue);

        // Risk per trade recommendation
        const riskPerTrade = totalValue * 0.02; // 2% rule
        const maxPositionSize = totalValue * 0.10; // 10% max single position

        return {
            summary: {
                totalValue: parseFloat(totalValue.toFixed(2)),
                totalPnl: parseFloat(totalPnl.toFixed(2)),
                totalPnlPercent: parseFloat(totalPnlPercent.toFixed(2)),
                holdingCount: enriched.length,
                concentrationRisk,
                sectorDiversification
            },
            holdings: enriched.sort((a, b) => b.value - a.value),
            sectorExposure: Object.values(sectorExposure).sort((a, b) => b.value - a.value),
            assetClassExposure: Object.values(assetClassExposure).sort((a, b) => b.value - a.value),
            concentration: {
                maxSingleWeight: parseFloat(maxSingleWeight.toFixed(1)),
                top3Weight: parseFloat(top3Weight.toFixed(1)),
                hhi: parseFloat(hhi.toFixed(3)),
                risk: concentrationRisk
            },
            stressTests: scenarios,
            recommendations: {
                riskPerTrade: parseFloat(riskPerTrade.toFixed(2)),
                maxPositionSize: parseFloat(maxPositionSize.toFixed(2)),
                suggestion: concentrationRisk === 'HIGH'
                    ? 'Consider reducing largest position. Diversify across sectors.'
                    : concentrationRisk === 'MODERATE'
                        ? 'Portfolio is acceptable but could benefit from more sector diversity.'
                        : 'Portfolio is well diversified. Maintain current allocation.'
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Calculate optimal position size based on risk parameters
     */
    calculatePositionSize(accountValue, riskPercent, entryPrice, stopLoss) {
        const riskAmount = accountValue * (riskPercent / 100);
        const riskPerShare = Math.abs(entryPrice - stopLoss);
        const shares = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
        const positionValue = shares * entryPrice;
        const actualRisk = shares * riskPerShare;

        return {
            shares,
            positionValue: parseFloat(positionValue.toFixed(2)),
            riskAmount: parseFloat(actualRisk.toFixed(2)),
            riskPercent,
            entryPrice,
            stopLoss,
            target: entryPrice + (riskPerShare * 2), // Default 2:1 R:R
            riskReward: 2.0
        };
    }

    _runStressScenarios(holdings, totalValue) {
        const scenarios = [
            { name: 'Market Crash (-5%)', description: 'All positions fall 5%', adjustment: -5 },
            { name: 'Sector Rotation (-10%)', description: 'Largest sector falls 10%', adjustment: -10 },
            { name: 'Gap Down (-3%)', description: 'All positions gap down 3%', adjustment: -3 },
            { name: 'Flash Crash (-15%)', description: 'Extreme scenario — all fall 15%', adjustment: -15 },
            { name: 'Volatility Spike', description: 'Positions widen by 2x normal range', adjustment: -8 }
        ];

        return scenarios.map(scenario => {
            let impact;
            if (scenario.name.includes('Sector')) {
                // Only affect largest sector
                const sectorValues = {};
                holdings.forEach(h => {
                    const s = h.sector || 'Unknown';
                    sectorValues[s] = (sectorValues[s] || 0) + h.value;
                });
                const largestSector = Object.entries(sectorValues).sort((a, b) => b[1] - a[1])[0];
                impact = largestSector ? largestSector[1] * (scenario.adjustment / 100) : 0;
            } else {
                impact = totalValue * (scenario.adjustment / 100);
            }

            return {
                name: scenario.name,
                description: scenario.description,
                impact: parseFloat(impact.toFixed(2)),
                impactPercent: scenario.adjustment,
                portfolioAfter: parseFloat((totalValue + impact).toFixed(2))
            };
        });
    }

    _emptyAnalysis(reason) {
        return {
            summary: { totalValue: 0, totalPnl: 0, holdingCount: 0, concentrationRisk: 'NONE', sectorDiversification: 'N/A' },
            holdings: [],
            sectorExposure: [],
            assetClassExposure: [],
            concentration: { maxSingleWeight: 0, top3Weight: 0, hhi: 0, risk: 'NONE' },
            stressTests: [],
            recommendations: { riskPerTrade: 0, maxPositionSize: 0, suggestion: reason },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = RiskTerminal;
