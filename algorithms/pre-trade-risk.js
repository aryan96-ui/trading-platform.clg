/**
 * Pre-Trade Risk Intelligence
 * 
 * Three cooperating services:
 * - PreTradeRiskCheck: evaluates portfolio exposure, sector concentration,
 *   correlation, volatility, daily P&L, drawdown, regime, strategy fit
 *   BEFORE execution. Explains risk; does not prevent every trade.
 * - PortfolioHeat: exposes total/gross/sector/single-name exposure and
 *   classifies portfolio heat LOW/MODERATE/HIGH/CRITICAL with the exact
 *   positions causing it.
 * - PositionSizingEngine: dynamic sizing from account value, risk %, stop
 *   distance, volatility, regime, concentration, strategy performance —
 *   always showing how the result was calculated.
 */
const EvidenceEngine = require('./evidence-engine');

// ============================================================
// PRE-TRADE RISK CHECK
// ============================================================
class PreTradeRiskCheck {
    /**
     * Run a pre-trade risk check
     * @param {object} trade - { symbol, direction, quantity, entryPrice, stopLoss, target, sector, assetType, strategy }
     * @param {object} portfolio - { holdings: [{symbol, value, sector, assetType, weight}], totalValue, dayPnl, dayPnlPercent }
     * @param {object} market - { regime, volatility, atr }
     */
    runCheck(trade, portfolio = {}, market = {}) {
        const findings = [];
        const evidence = [];
        let riskLevel = 'LOW';
        let riskScore = 0;

        const holdings = portfolio.holdings || [];
        const totalValue = portfolio.totalValue || holdings.reduce((a, h) => a + (h.value || 0), 0);
        const tradeValue = (trade.quantity || 0) * (trade.entryPrice || 0);
        const positionWeight = totalValue > 0 ? (tradeValue / totalValue) * 100 : (tradeValue > 0 ? 100 : 0);

        // 1. Single-stock concentration
        if (positionWeight > 30) {
            riskScore += 3;
            findings.push({ level: 'HIGH', factor: 'Single-stock concentration', detail: `New position would be ${positionWeight.toFixed(1)}% of portfolio`, suggested: 'Consider reducing quantity' });
        } else if (positionWeight > 15) {
            riskScore += 2;
            findings.push({ level: 'MODERATE', factor: 'Single-stock concentration', detail: `New position would be ${positionWeight.toFixed(1)}% of portfolio`, suggested: 'Monitor exposure' });
        }

        // 2. Sector exposure
        const sector = trade.sector || 'Unknown';
        const existingSectorValue = holdings.filter(h => h.sector === sector).reduce((a, h) => a + (h.value || 0), 0);
        const sectorWeightAfter = totalValue > 0 ? ((existingSectorValue + tradeValue) / totalValue) * 100 : positionWeight;
        if (sectorWeightAfter > 40) {
            riskScore += 2;
            findings.push({ level: 'HIGH', factor: 'Sector exposure', detail: `${sector} would be ${sectorWeightAfter.toFixed(1)}% of portfolio`, suggested: 'Avoid adding to this sector' });
        } else if (sectorWeightAfter > 25) {
            riskScore += 1;
            findings.push({ level: 'MODERATE', factor: 'Sector exposure', detail: `${sector} would be ${sectorWeightAfter.toFixed(1)}% of portfolio` });
        }

        // 3. Correlation with existing positions
        const sameAsset = holdings.filter(h => h.assetType === trade.assetType).length;
        const correlation = sameAsset > 0 ? 'HIGH' : 'LOW';
        if (correlation === 'HIGH') {
            riskScore += 1;
            findings.push({ level: 'MODERATE', factor: 'Correlation', detail: `Portfolio already holds ${sameAsset} position(s) in ${trade.assetType || 'same asset class'}` });
        }

        // 4. Daily loss check
        const dayPnl = portfolio.dayPnlPercent || 0;
        if (dayPnl <= -2) {
            riskScore += 2;
            findings.push({ level: 'HIGH', factor: 'Daily loss', detail: `Daily P&L is ${dayPnl.toFixed(1)}%`, suggested: 'Consider stopping for the day' });
        } else if (dayPnl <= -1) {
            riskScore += 1;
            findings.push({ level: 'MODERATE', factor: 'Daily loss', detail: `Daily P&L is ${dayPnl.toFixed(1)}%` });
        }

        // 5. Volatility
        const vol = market.volatility || 0.02;
        if (vol > 0.04) {
            riskScore += 2;
            findings.push({ level: 'HIGH', factor: 'Volatility', detail: `Volatility elevated (${(vol * 100).toFixed(1)}%)`, suggested: 'Reduce position size' });
        }

        // 6. Regime compatibility
        const regime = market.regime || {};
        if (regime.regime === 'HIGH VOLATILITY') {
            riskScore += 1;
            findings.push({ level: 'MODERATE', factor: 'Market regime', detail: 'High-volatility regime' });
        }

        // 7. Risk/Reward
        const entry = trade.entryPrice || 0;
        const stop = trade.stopLoss || 0;
        const target = trade.target || 0;
        const risk = Math.abs(entry - stop);
        const reward = Math.abs(target - entry);
        const rr = risk > 0 ? reward / risk : 0;
        if (rr > 0 && rr < 1.5) {
            riskScore += 1;
            findings.push({ level: 'MODERATE', factor: 'Risk/Reward', detail: `R:R is ${rr.toFixed(1)}:1` });
        }

        // 8. Strategy compatibility
        const strategyFit = market.strategyFit; // optional 0-100
        if (strategyFit !== undefined && strategyFit < 40) {
            riskScore += 1;
            findings.push({ level: 'MODERATE', factor: 'Strategy compatibility', detail: `Strategy historically performs poorly in ${regime.regime || 'current'} regime (fit ${strategyFit}%)` });
        }

        // Classify
        riskLevel = riskScore >= 8 ? 'HIGH' : riskScore >= 4 ? 'MODERATE' : 'LOW';

        const highFindings = findings.filter(f => f.level === 'HIGH');
        const moderateFindings = findings.filter(f => f.level === 'MODERATE');

        return {
            riskLevel,
            riskScore,
            positionWeight: parseFloat(positionWeight.toFixed(1)),
            tradeValue,
            findings,
            highFindings,
            moderateFindings,
            summary: this._summarize(riskLevel, findings),
            suggestedAction: riskLevel === 'HIGH'
                ? 'High risk: reduce position size or postpone. Review highlighted factors.'
                : riskLevel === 'MODERATE'
                    ? 'Moderate risk: proceed with reduced size and defined stop.'
                    : 'Low risk: trade is within portfolio risk limits.',
            evidence: evidence.concat([
                EvidenceEngine.create({ type: 'portfolio', source: 'pre-trade-risk', value: { positionWeight, sectorWeightAfter }, interpretation: `Position weight ${positionWeight.toFixed(1)}%, sector ${sectorWeightAfter.toFixed(1)}%`, reliability: 'MEDIUM' })
            ]),
            timestamp: new Date().toISOString()
        };
    }

    _summarize(level, findings) {
        const high = findings.filter(f => f.level === 'HIGH').length;
        const mod = findings.filter(f => f.level === 'MODERATE').length;
        return `Portfolio risk ${level} — ${high} high, ${mod} moderate factor(s).`;
    }
}

// ============================================================
// PORTFOLIO HEAT
// ============================================================
class PortfolioHeat {
    /**
     * Compute portfolio heat
     */
    compute(portfolio = {}) {
        const holdings = portfolio.holdings || [];
        if (holdings.length === 0) {
            return { heatLevel: 'NONE', totalExposure: 0, grossExposure: 0, holdings: [], heatDrivers: [], timestamp: new Date().toISOString() };
        }

        const totalValue = portfolio.totalValue || holdings.reduce((a, h) => a + (h.value || 0), 0);
        const grossExposure = holdings.reduce((a, h) => a + Math.abs(h.value || 0), 0);
        const longExposure = holdings.filter(h => (h.direction || 'long') === 'long').reduce((a, h) => a + (h.value || 0), 0);
        const shortExposure = holdings.filter(h => h.direction === 'short').reduce((a, h) => a + (h.value || 0), 0);

        // Sector exposure
        const sectors = {};
        for (const h of holdings) {
            const s = h.sector || 'Unknown';
            sectors[s] = (sectors[s] || 0) + (h.value || 0);
        }
        const sectorExposure = Object.entries(sectors)
            .map(([name, value]) => ({ name, value, weight: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
            .sort((a, b) => b.value - a.value);

        // Single-name
        const singleNames = holdings
            .map(h => ({ symbol: h.symbol, value: h.value || 0, weight: totalValue > 0 ? ((h.value || 0) / totalValue) * 100 : 0, risk: h.risk || ((h.stopDistancePct || 5) * ((h.value || 0) / (totalValue || 1)) / 100) }))
            .sort((a, b) => b.value - a.value);

        const topSingle = singleNames[0]?.weight || 0;
        const topSector = sectorExposure[0]?.weight || 0;

        // Heat score
        let heatScore = 0;
        if (topSingle > 30) heatScore += 30; else if (topSingle > 15) heatScore += 15;
        if (topSector > 50) heatScore += 25; else if (topSector > 30) heatScore += 15;
        if (grossExposure > totalValue * 1.5) heatScore += 20; // leverage-ish
        if (holdings.length <= 2) heatScore += 15;
        const maxDrawdown = portfolio.maxDrawdownPct || 0;
        if (maxDrawdown > 15) heatScore += 20; else if (maxDrawdown > 8) heatScore += 10;

        heatScore = Math.min(100, heatScore);
        const heatLevel = heatScore >= 75 ? 'CRITICAL' : heatScore >= 50 ? 'HIGH' : heatScore >= 25 ? 'MODERATE' : 'LOW';

        // Drivers (positions causing heat)
        const heatDrivers = singleNames
            .filter(h => h.weight > 15)
            .map(h => ({ symbol: h.symbol, weight: parseFloat(h.weight.toFixed(1)), reason: `Position is ${h.weight.toFixed(1)}% of portfolio` }));

        return {
            heatLevel,
            heatScore,
            totalExposure: parseFloat(totalValue.toFixed(2)),
            grossExposure: parseFloat(grossExposure.toFixed(2)),
            longExposure: parseFloat(longExposure.toFixed(2)),
            shortExposure: parseFloat(shortExposure.toFixed(2)),
            sectorExposure,
            singleNames,
            topSingleWeight: parseFloat(topSingle.toFixed(1)),
            topSectorWeight: parseFloat(topSector.toFixed(1)),
            heatDrivers,
            timestamp: new Date().toISOString()
        };
    }
}

// ============================================================
// DYNAMIC POSITION SIZING
// ============================================================
class PositionSizingEngine {
    /**
     * Compute suggested position size with a fully transparent calculation
     */
    size({
        accountValue, riskPercent = 1, entryPrice, stopLoss,
        volatility, regimeAdjustment = 0, concentrationAdjustment = 0,
        strategyAdjustment = 0, correlationAdjustment = 0
    }) {
        const riskAmount = accountValue * (riskPercent / 100);
        const riskPerUnit = Math.abs(entryPrice - stopLoss);
        const baseUnits = riskPerUnit > 0 ? Math.floor(riskAmount / riskPerUnit) : 0;

        const adjustments = [];
        const applyAdjustment = (label, pct) => {
            if (!pct) return 0;
            adjustments.push({ label, percent: pct });
            return pct;
        };

        let totalAdjustmentPct = 0;
        totalAdjustmentPct += applyAdjustment('Regime adjustment', regimeAdjustment);
        totalAdjustmentPct += applyAdjustment('Portfolio concentration', concentrationAdjustment);
        totalAdjustmentPct += applyAdjustment('Strategy historical performance', strategyAdjustment);
        totalAdjustmentPct += applyAdjustment('Correlation', correlationAdjustment);

        const adjustedUnits = Math.max(0, Math.round(baseUnits * (1 + totalAdjustmentPct / 100)));
        const adjustedRisk = adjustedUnits * riskPerUnit;
        const positionValue = adjustedUnits * entryPrice;
        const positionWeight = accountValue > 0 ? (positionValue / accountValue) * 100 : 0;

        return {
            accountValue,
            riskPercent,
            riskAmount: parseFloat(riskAmount.toFixed(2)),
            stopDistance: parseFloat(riskPerUnit.toFixed(2)),
            baseUnits,
            adjustments,
            totalAdjustmentPct: parseFloat(totalAdjustmentPct.toFixed(1)),
            suggestedUnits: adjustedUnits,
            actualRisk: parseFloat(adjustedRisk.toFixed(2)),
            actualRiskPercent: accountValue > 0 ? parseFloat(((adjustedRisk / accountValue) * 100).toFixed(2)) : 0,
            positionValue: parseFloat(positionValue.toFixed(2)),
            positionWeight: parseFloat(positionWeight.toFixed(1)),
            calculation: [
                `Risk budget = ${accountValue} × ${riskPercent}% = ${riskAmount.toFixed(0)}`,
                `Risk per unit = |${entryPrice} − ${stopLoss}| = ${riskPerUnit.toFixed(2)}`,
                `Base size = floor(${riskAmount.toFixed(0)} / ${riskPerUnit.toFixed(2)}) = ${baseUnits}`,
                ...adjustments.map(a => `${a.label}: ${a.percent > 0 ? '+' : ''}${a.percent}%`),
                `Suggested size = ${baseUnits} × (1 + ${totalAdjustmentPct}%) = ${adjustedUnits}`
            ],
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { PreTradeRiskCheck, PortfolioHeat, PositionSizingEngine };