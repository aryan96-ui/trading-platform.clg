/**
 * Strategy × Regime Matrix
 * 
 * A strategy is NOT universally effective. This engine computes each
 * strategy's historical performance BY MARKET REGIME and produces
 * compatibility guidance using historical evidence, never certainty.
 */
class StrategyRegimeMatrix {
    /**
     * Build the matrix from closed trades
     */
    build(trades = []) {
        if (trades.length === 0) {
            return { strategies: [], message: 'No trades to build matrix', timestamp: new Date().toISOString() };
        }

        const byStrategy = new Map();
        for (const t of trades) {
            const strategy = t.strategy || 'unspecified';
            const regime = t.marketRegime || 'UNKNOWN';
            if (!byStrategy.has(strategy)) byStrategy.set(strategy, new Map());
            const regimes = byStrategy.get(strategy);
            if (!regimes.has(regime)) regimes.set(regime, []);
            regimes.get(regime).push(t);
        }

        const strategies = [...byStrategy.entries()].map(([name, regimeMap]) => {
            const cells = [...regimeMap.entries()].map(([regime, ts]) => {
                const wins = ts.filter(t => (t.pnl || 0) > 0);
                const totalPnl = ts.reduce((a, t) => a + (t.pnl || 0), 0);
                const rMultiples = ts.reduce((a, t) => a + (t.riskReward || 0), 0) / ts.length;
                return {
                    regime,
                    tradeCount: ts.length,
                    winRate: parseFloat(((wins.length / ts.length) * 100).toFixed(1)),
                    totalPnl: parseFloat(totalPnl.toFixed(2)),
                    expectancyR: parseFloat((rMultiples).toFixed(2)),
                    sampleAdequate: ts.length >= 5
                };
            }).sort((a, b) => b.totalPnl - a.totalPnl);

            const all = [...regimeMap.values()].flat();
            const allWins = all.filter(t => (t.pnl || 0) > 0);
            return {
                strategy: name,
                tradeCount: all.length,
                overallWinRate: parseFloat(((allWins.length / all.length) * 100).toFixed(1)),
                cells
            };
        });

        return {
            strategies,
            timestamp: new Date().toISOString(),
            message: 'Matrix uses historical evidence. Small samples are not statistically significant.'
        };
    }

    /**
     * Assess compatibility of a strategy with the CURRENT regime
     */
    assessCompatibility(strategy, currentRegime, matrix) {
        const entry = (matrix.strategies || []).find(s => s.strategy === strategy);
        if (!entry) {
            return {
                strategy,
                currentRegime,
                compatibility: 'UNKNOWN',
                message: `No historical data for strategy "${strategy}".`,
                evidence: 'Insufficient historical evidence.'
            };
        }

        const cell = entry.cells.find(c => c.regime === currentRegime);
        if (!cell || cell.tradeCount < 3) {
            return {
                strategy,
                currentRegime,
                compatibility: 'UNKNOWN',
                message: cell
                    ? `Only ${cell.tradeCount} recorded trade(s) of "${strategy}" during ${currentRegime} — too few to assess compatibility.`
                    : `Insufficient history of "${strategy}" during ${currentRegime} conditions.`,
                evidence: `${cell ? cell.tradeCount : 0} trade(s) recorded in this regime.`,
                bestRegime: entry.cells[0]?.regime || null
            };
        }

        let compatibility, recommended;
        if (cell.winRate >= 55 && cell.expectancyR >= 0.3 && cell.sampleAdequate) {
            compatibility = 'HIGH';
            recommended = 'This setup historically performs well for your record in these conditions.';
        } else if (cell.winRate >= 45 && cell.totalPnl >= 0 && cell.sampleAdequate) {
            compatibility = 'MODERATE';
            recommended = 'Historically mixed performance in these conditions — use normal position sizing.';
        } else {
            compatibility = 'LOW';
            recommended = `Exercise caution. "${strategy}" historically performs poorly for your record during ${currentRegime} conditions.`;
        }

        return {
            strategy,
            currentRegime,
            compatibility,
            message: recommended,
            evidence: `${cell.tradeCount} trade(s), ${cell.winRate}% win rate, ${cell.expectancyR >= 0 ? '+' : ''}${cell.expectancyR}R expectancy in ${currentRegime}.`,
            cell,
            bestRegime: entry.cells[0]?.regime || null,
            sampleAdequate: cell.sampleAdequate,
            caveat: 'Historical evidence only — not a prediction of this trade outcome.'
        };
    }
}

module.exports = StrategyRegimeMatrix;