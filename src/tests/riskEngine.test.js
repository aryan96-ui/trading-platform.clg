// tests/riskEngine.test.js - Risk Engine & Sizing Calculations
const RiskEngine = require('../../algorithms/riskEngine');

describe('RiskEngine', () => {
    test('calculateKellyPosition: returns positive fraction when edge exists', () => {
        const result = RiskEngine.calculateKellyPosition({
            winRate: 0.60,
            winLossRatio: 2.0,
            capital: 100000,
            fraction: 0.5
        });

        expect(result.isEdgePositive).toBe(true);
        expect(result.fullKellyPercent).toBe(40); // (0.6 * 2 - 0.4) / 2 = 0.40 -> 40%
        expect(result.recommendedPositionPercent).toBe(20); // half kelly = 20%
        expect(result.recommendedRiskAmount).toBe(20000);
    });

    test('calculateKellyPosition: handles zero/negative edge safely', () => {
        const result = RiskEngine.calculateKellyPosition({
            winRate: 0.30,
            winLossRatio: 1.0,
            capital: 100000
        });

        expect(result.isEdgePositive).toBe(false);
        expect(result.recommendedPositionPercent).toBe(0);
        expect(result.recommendedRiskAmount).toBe(0);
    });

    test('calculateAtrPositionSizing: computes valid quantity, stop loss and take profit', () => {
        const sizing = RiskEngine.calculateAtrPositionSizing({
            capital: 100000,
            currentPrice: 2500,
            atr: 50,
            riskPercent: 1.5,
            atrMultiplier: 2.0,
            direction: 'BUY'
        });

        expect(sizing.quantity).toBeGreaterThan(0);
        expect(sizing.stopLoss).toBe(2400); // 2500 - (50 * 2) = 2400
        expect(sizing.takeProfit).toBe(2700); // 2500 + (100 * 2) = 2700
        expect(sizing.stopDistance).toBe(100);
    });

    test('calculateVaR: returns reasonable Value-at-Risk percentage', () => {
        const returns = [0.01, -0.02, 0.015, -0.005, -0.03, 0.025, 0.01, -0.012, 0.008, -0.015, 0.02, -0.01];
        const varResult = RiskEngine.calculateVaR(returns, 100000, 0.95);

        expect(varResult.varPercent).toBeGreaterThan(0);
        expect(varResult.varAmount).toBeGreaterThan(0);
        expect(varResult.confidence).toBe('95%');
    });
});
