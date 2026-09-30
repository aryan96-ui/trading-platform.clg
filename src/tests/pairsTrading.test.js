// tests/pairsTrading.test.js - Pairs Trading & Correlation Verification
const PairsTradingEngine = require('../../algorithms/pairsTrading');

describe('PairsTradingEngine', () => {
    test('calculatePearsonCorrelation: returns 1.0 for perfectly correlated series', () => {
        const a = [10, 20, 30, 40, 50];
        const b = [20, 40, 60, 80, 100];
        const r = PairsTradingEngine.calculatePearsonCorrelation(a, b);
        expect(r).toBe(1.0);
    });

    test('calculatePearsonCorrelation: returns -1.0 for perfectly inverse series', () => {
        const a = [10, 20, 30, 40, 50];
        const b = [100, 80, 60, 40, 20];
        const r = PairsTradingEngine.calculatePearsonCorrelation(a, b);
        expect(r).toBe(-1.0);
    });

    test('analyzePair: produces z-score, spread, and signal', () => {
        const seriesA = [100, 102, 101, 104, 103, 105, 106, 108, 107, 110];
        const seriesB = [200, 204, 202, 208, 206, 210, 212, 216, 214, 220];
        const analysis = PairsTradingEngine.analyzePair('HDFCBANK', seriesA, 'ICICIBANK', seriesB);

        expect(analysis.pair).toBe('HDFCBANK / ICICIBANK');
        expect(analysis.correlation).toBeGreaterThan(0.9);
        expect(analysis.isCointegrated).toBe(true);
        expect(analysis.currentZScore).toBeDefined();
    });
});
