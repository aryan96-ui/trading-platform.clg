/**
 * Execution Quality Analytics + Timing Alpha
 * 
 * For PAPER trades, records intended vs actual entry/exit and estimates
 * simulated execution costs. Never claims real exchange execution quality —
 * all metrics are explicitly labeled SIMULATED.
 * 
 * TimingAlpha: compares the actual entry against hypothetical entries
 * 5/15/30 minutes later where historical data exists. This is ANALYSIS,
 * not guaranteed alternative execution.
 */
const EvidenceEngine = require('./evidence-engine');

class ExecutionQualityAnalytics {
    /**
     * Analyze execution quality of a closed trade
     * @param {object} trade - { id, symbol, direction, plannedEntry, actualEntry, plannedExit, actualExit, quantity, decisionTimestamp, executionTimestamp }
     */
    analyze(trade) {
        const quantity = trade.quantity || 1;
        const actualEntry = trade.actualEntry || trade.entryPrice;
        const actualExit = trade.actualExit || trade.exitPrice;
        const plannedEntry = trade.plannedEntry ?? actualEntry;
        const plannedExit = trade.plannedExit ?? actualExit;

        // Entry slippage (simulated): planned vs actual
        const entrySlippage = plannedEntry > 0 ? actualEntry - plannedEntry : 0;
        const entrySlippageBps = plannedEntry > 0 ? (entrySlippage / plannedEntry) * 10000 : 0;
        const estimatedEntryCost = entrySlippage * quantity;

        // Exit slippage (simulated)
        const exitSlippage = plannedExit > 0 ? plannedExit - actualExit : 0;
        const exitSlippageBps = plannedExit > 0 ? (exitSlippage / plannedExit) * 10000 : 0;
        const estimatedExitCost = exitSlippage * quantity;

        // Timing difference (decision → execution)
        let timingSeconds = null;
        if (trade.decisionTimestamp && trade.executionTimestamp) {
            timingSeconds = Math.round((new Date(trade.executionTimestamp) - new Date(trade.decisionTimestamp)) / 1000);
        }

        // Adverse/favorable movement after entry (simulated from MFE/MAE)
        const adverseAfterEntry = Math.abs(trade.maxAdverseExcursion || 0);
        const favorableAfterEntry = Math.abs(trade.maxFavorableExcursion || 0);

        const quality = this._scoreQuality(entrySlippageBps, exitSlippageBps, timingSeconds);

        return {
            tradeId: trade.id,
            symbol: trade.symbol,
            direction: trade.direction,
            plannedEntry,
            actualEntry,
            entrySlippage: parseFloat(entrySlippage.toFixed(2)),
            entrySlippageBps: parseFloat(entrySlippageBps.toFixed(1)),
            estimatedEntryCost: parseFloat(estimatedEntryCost.toFixed(2)),
            plannedExit,
            actualExit,
            exitSlippage: parseFloat(exitSlippage.toFixed(2)),
            exitSlippageBps: parseFloat(exitSlippageBps.toFixed(1)),
            estimatedExitCost: parseFloat(estimatedExitCost.toFixed(2)),
            totalEstimatedCost: parseFloat((estimatedEntryCost + estimatedExitCost).toFixed(2)),
            timingSeconds,
            adverseAfterEntry: parseFloat(adverseAfterEntry.toFixed(2)),
            favorableAfterEntry: parseFloat(favorableAfterEntry.toFixed(2)),
            quality,
            explanation: this._explain(quality, entrySlippageBps, exitSlippageBps),
            simulated: true,
            disclaimer: 'Simulated execution metrics based on paper-trade prices. Not real exchange execution quality.',
            evidence: [
                EvidenceEngine.create({ type: 'indicator', source: 'execution-quality', value: entrySlippageBps, interpretation: `Simulated entry slippage ${entrySlippageBps.toFixed(1)} bps`, reliability: 'MEDIUM' }),
                EvidenceEngine.create({ type: 'indicator', source: 'execution-quality', value: exitSlippageBps, interpretation: `Simulated exit slippage ${exitSlippageBps.toFixed(1)} bps`, reliability: 'MEDIUM' })
            ],
            timestamp: new Date().toISOString()
        };
    }

    _scoreQuality(entryBps, exitBps, timingSeconds) {
        let score = 70; // base — paper fills assumed good
        if (entryBps > 10) score -= 10;
        if (entryBps > 30) score -= 15;
        if (exitBps > 10) score -= 10;
        if (exitBps > 30) score -= 15;
        if (timingSeconds !== null && timingSeconds > 120) score -= 10;
        score = Math.max(0, Math.min(100, score));
        return {
            score,
            grade: score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'FAIR' : 'POOR',
            label: 'simulated'
        };
    }

    _explain(quality, entryBps, exitBps) {
        const parts = [];
        if (quality.score >= 80) parts.push('Execution quality was excellent with minimal simulated slippage.');
        else if (quality.score >= 60) parts.push('Execution quality was acceptable.');
        else parts.push('Execution quality was poor — check timing and liquidity assumptions.');
        if (entryBps > 20) parts.push(`Entry slippage (${entryBps.toFixed(0)} bps) reduced the favorable outcome.`);
        if (exitBps > 20) parts.push(`Exit slippage (${exitBps.toFixed(0)} bps) reduced the realized result.`);
        return parts.join(' ');
    }

    /**
     * Timing alpha — hypothetical alternative entries
     * @param {object} trade - closed trade
     * @param {Array} candles - historical candles around the entry with timestamps
     */
    timingAlpha(trade, candles = []) {
        if (!candles || candles.length < 4) {
            return {
                available: false,
                message: 'Insufficient historical data for timing analysis.',
                disclaimer: 'Timing analysis is retrospective and does not imply achievable alternative execution.'
            };
        }

        const entryTime = new Date(trade.executionTimestamp || trade.openedAt || trade.timestamp).getTime();
        const actualEntry = trade.actualEntry || trade.entryPrice;

        // Find candles at +5m, +15m, +30m from entry
        const offsets = [5, 15, 30];
        const results = offsets.map(minutes => {
            const targetTime = entryTime + minutes * 60000;
            const closest = candles.reduce((best, c) => {
                const t = new Date(c.timestamp).getTime();
                const diff = Math.abs(t - targetTime);
                return !best || diff < best.diff ? { candle: c, diff } : best;
            }, null);

            if (!closest) return { minutes, available: false };
            const altPrice = closest.candle.close;
            const diffPct = actualEntry > 0 ? ((altPrice - actualEntry) / actualEntry) * 100 : 0;
            return {
                minutes,
                available: true,
                alternativePrice: parseFloat(altPrice.toFixed(2)),
                differencePct: parseFloat(diffPct.toFixed(2)),
                interpretation: diffPct > 0
                    ? `Entering ${minutes} minutes later would have been ${diffPct.toFixed(2)}% worse (higher entry)`
                    : diffPct < 0
                        ? `Entering ${minutes} minutes later would have been ${Math.abs(diffPct).toFixed(2)}% better (lower entry)`
                        : `Entering ${minutes} minutes later would have been equivalent`
            };
        });

        const best = results.filter(r => r.available).reduce((acc, r) => {
            const betterBy = -r.differencePct; // negative diff = better entry
            return !acc || betterBy > acc.betterBy ? { ...r, betterBy } : acc;
        }, null);

        return {
            available: true,
            actualEntry,
            alternatives: results,
            bestAlternative: best
                ? { minutes: best.minutes, price: best.alternativePrice, improvementPct: parseFloat(Math.max(0, best.betterBy).toFixed(2)) }
                : null,
            disclaimer: 'Timing analysis is retrospective. A later entry was not guaranteed achievable at the observed price.'
        };
    }
}

module.exports = ExecutionQualityAnalytics;