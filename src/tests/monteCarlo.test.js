// tests/monteCarlo.test.js - Monte Carlo Simulator Verification
const MonteCarloSimulator = require('../../algorithms/monteCarlo');

describe('MonteCarloSimulator', () => {
    test('runSimulation: executes trials and generates statistical distribution', () => {
        const result = MonteCarloSimulator.runSimulation({
            initialCapital: 100000,
            numTrades: 50,
            numSimulations: 1000,
            winRate: 0.55,
            avgWinPercent: 3.0,
            avgLossPercent: 2.0,
            riskPerTrade: 0.02
        });

        expect(result.totalSimulations).toBe(1000);
        expect(result.summary.medianFinalEquity).toBeGreaterThan(0);
        expect(result.summary.best5PercentEquity).toBeGreaterThanOrEqual(result.summary.medianFinalEquity);
        expect(result.summary.medianFinalEquity).toBeGreaterThanOrEqual(result.summary.worst5PercentEquity);
        expect(result.histogram.length).toBe(15);
        expect(result.samplePaths.length).toBeGreaterThan(0);
    });
});
