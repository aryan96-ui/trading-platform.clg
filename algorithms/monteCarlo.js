// algorithms/monteCarlo.js - High Performance Monte-Carlo Strategy Simulator

class MonteCarloSimulator {
    /**
     * Run Monte Carlo Simulation across N trials (default 10,000)
     * 
     * @param {Object} params
     * @param {number} params.initialCapital - Starting account equity (e.g. 100,000)
     * @param {number} params.numTrades - Number of future trade steps to simulate (e.g. 100)
     * @param {number} params.numSimulations - Number of random paths (e.g. 5,000 - 10,000)
     * @param {number} params.winRate - Historical strategy win rate (e.g. 0.54)
     * @param {number} params.avgWinPercent - Average profit per win (e.g. 3.2%)
     * @param {number} params.avgLossPercent - Average loss per loss (e.g. 1.8%)
     * @param {number} params.riskPerTrade - Fraction of capital risked per trade (e.g. 0.02)
     */
    static runSimulation({
        initialCapital = 100000,
        numTrades = 100,
        numSimulations = 10000,
        winRate = 0.55,
        avgWinPercent = 3.5,
        avgLossPercent = 2.0,
        riskPerTrade = 0.02
    }) {
        const finalEquities = new Float64Array(numSimulations);
        const maxDrawdowns = new Float64Array(numSimulations);
        
        // Retain 10 sample equity paths for chart plotting
        const samplePaths = [];
        const sampleIndices = new Set([0, 100, 500, 1000, 2500, 5000, 7500, 9000, 9500, 9999]);

        for (let sim = 0; sim < numSimulations; sim++) {
            let equity = initialCapital;
            let peakEquity = initialCapital;
            let maxDd = 0;
            const path = sampleIndices.has(sim) ? [equity] : null;

            for (let t = 0; t < numTrades; t++) {
                const isWin = Math.random() < winRate;
                
                // Add natural variance around average win/loss (Gaussian-like variation)
                let tradeReturnPct;
                if (isWin) {
                    const variance = (Math.random() - 0.5) * (avgWinPercent * 0.4);
                    tradeReturnPct = (avgWinPercent + variance) / 100;
                } else {
                    const variance = (Math.random() - 0.5) * (avgLossPercent * 0.4);
                    tradeReturnPct = -(avgLossPercent + variance) / 100;
                }

                // Sizing based on current equity * riskPerTrade
                const tradeSize = equity * (riskPerTrade * 5); // position allocation
                const pnl = tradeSize * tradeReturnPct;
                equity = Math.max(10, equity + pnl);

                if (equity > peakEquity) {
                    peakEquity = equity;
                }
                const currentDd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
                if (currentDd > maxDd) {
                    maxDd = currentDd;
                }

                if (path && t % Math.max(1, Math.floor(numTrades / 20)) === 0) {
                    path.push(Number(equity.toFixed(2)));
                }
            }

            finalEquities[sim] = equity;
            maxDrawdowns[sim] = maxDd;
            if (path) samplePaths.push(path);
        }

        // Sort arrays for percentile extraction
        const sortedEquities = Array.from(finalEquities).sort((a, b) => a - b);
        const sortedDrawdowns = Array.from(maxDrawdowns).sort((a, b) => a - b);

        const getPercentile = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];

        const medianEquity = getPercentile(sortedEquities, 0.50);
        const p5Equity = getPercentile(sortedEquities, 0.05); // 95% Confidence floor
        const p25Equity = getPercentile(sortedEquities, 0.25);
        const p75Equity = getPercentile(sortedEquities, 0.75);
        const p95Equity = getPercentile(sortedEquities, 0.95);

        const medianDrawdown = getPercentile(sortedDrawdowns, 0.50);
        const p95Drawdown = getPercentile(sortedDrawdowns, 0.95); // 95% Worst case drawdown

        const profitableRuns = sortedEquities.filter(e => e > initialCapital).length;
        const probOfProfit = Number(((profitableRuns / numSimulations) * 100).toFixed(2));
        const ruinRuns = sortedDrawdowns.filter(dd => dd > 35).length;
        const probOfRuin = Number(((ruinRuns / numSimulations) * 100).toFixed(2));

        // Generate distribution histogram bins (15 bins)
        const minEq = sortedEquities[0];
        const maxEq = sortedEquities[sortedEquities.length - 1];
        const binStep = (maxEq - minEq) / 15;
        const histogram = [];

        for (let b = 0; b < 15; b++) {
            const rangeStart = minEq + (b * binStep);
            const rangeEnd = rangeStart + binStep;
            const count = sortedEquities.filter(e => e >= rangeStart && (b === 14 ? e <= rangeEnd : e < rangeEnd)).length;
            histogram.push({
                rangeLabel: `₹${(rangeStart / 1000).toFixed(0)}k - ₹${(rangeEnd / 1000).toFixed(0)}k`,
                count,
                frequencyPercent: Number(((count / numSimulations) * 100).toFixed(1))
            });
        }

        return {
            totalSimulations: numSimulations,
            tradesPerRun: numTrades,
            initialCapital,
            summary: {
                medianFinalEquity: Number(medianEquity.toFixed(2)),
                expectedReturnPercent: Number((((medianEquity - initialCapital) / initialCapital) * 100).toFixed(2)),
                worst5PercentEquity: Number(p5Equity.toFixed(2)),
                best5PercentEquity: Number(p95Equity.toFixed(2)),
                interquartileRange: {
                    p25: Number(p25Equity.toFixed(2)),
                    p75: Number(p75Equity.toFixed(2))
                },
                medianMaxDrawdown: Number(medianDrawdown.toFixed(2)) + '%',
                worstCaseMaxDrawdown: Number(p95Drawdown.toFixed(2)) + '%',
                probabilityOfProfit: `${probOfProfit}%`,
                probabilityOfSevereDrawdown: `${probOfRuin}%`
            },
            histogram,
            samplePaths
        };
    }
}

module.exports = MonteCarloSimulator;
