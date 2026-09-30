// tests/indicators.test.js - Mathematical Accuracy Tests for Technical Indicators
const TechnicalIndicators = require('../../algorithms/technicalIndicators');

describe('TechnicalIndicators Engine', () => {
    const mockPrices = [
        100, 102, 104, 103, 105, 107, 106, 108, 110, 109,
        111, 113, 112, 115, 118, 117, 119, 122, 120, 125,
        124, 128, 130, 127, 129, 132, 131, 135, 138, 140
    ];

    const mockCandles = mockPrices.map((p, i) => ({
        time: 1700000000000 + i * 300000,
        open: p - 1,
        high: p + 2,
        low: p - 2,
        close: p,
        volume: 50000 + (i * 1000)
    }));

    test('SMA: calculates correct simple moving average', () => {
        const sma5 = TechnicalIndicators.SMA([10, 20, 30, 40, 50], 5);
        expect(sma5[0]).toBeNull();
        expect(sma5[3]).toBeNull();
        expect(sma5[4]).toBe(30);
    });

    test('EMA: calculates exponential moving average with correct weighting', () => {
        const ema = TechnicalIndicators.EMA([10, 20, 30, 40, 50], 3);
        expect(ema.length).toBe(5);
        expect(ema[0]).toBe(10);
        expect(ema[ema.length - 1]).toBeGreaterThan(30);
    });

    test('RSI: bounded between 0 and 100 and reacts to upward trend', () => {
        const rsi = TechnicalIndicators.RSI(mockPrices, 14);
        expect(rsi.length).toBe(mockPrices.length);
        const lastRsi = rsi[rsi.length - 1];
        expect(lastRsi).toBeGreaterThanOrEqual(0);
        expect(lastRsi).toBeLessThanOrEqual(100);
        // In strong uptrend, RSI should be above 60
        expect(lastRsi).toBeGreaterThan(60);
    });

    test('MACD: produces line, signal line, and histogram', () => {
        const macd = TechnicalIndicators.MACD(mockPrices, 12, 26, 9);
        expect(macd.macdLine).toBeDefined();
        expect(macd.signalLine).toBeDefined();
        expect(macd.histogram).toBeDefined();
        expect(macd.macdLine.length).toBe(mockPrices.length);
    });

    test('Bollinger Bands: upper band is strictly greater than lower band', () => {
        const bb = TechnicalIndicators.BollingerBands(mockPrices, 20, 2);
        const lastIdx = mockPrices.length - 1;
        expect(bb.upper[lastIdx]).toBeGreaterThan(bb.middle[lastIdx]);
        expect(bb.middle[lastIdx]).toBeGreaterThan(bb.lower[lastIdx]);
        expect(bb.percentB[lastIdx]).toBeGreaterThan(0);
    });

    test('ATR: calculates positive volatility values', () => {
        const atr = TechnicalIndicators.ATR(mockCandles, 14);
        expect(atr.length).toBe(mockCandles.length);
        const lastAtr = atr[atr.length - 1];
        expect(lastAtr).toBeGreaterThan(0);
    });

    test('Ichimoku: returns key cloud lines', () => {
        const ichi = TechnicalIndicators.Ichimoku(mockCandles);
        expect(ichi).toHaveProperty('tenkanSen');
        expect(ichi).toHaveProperty('kijunSen');
        expect(ichi).toHaveProperty('senkouSpanA');
        expect(ichi).toHaveProperty('senkouSpanB');
        expect(ichi.tenkanSen).toBeGreaterThan(0);
    });

    test('evaluateSignals: generates valid composite signal and confidence', () => {
        const evalResult = TechnicalIndicators.evaluateSignals(mockCandles);
        expect(['BUY', 'SELL', 'HOLD']).toContain(evalResult.signal);
        expect(evalResult.confidence).toBeGreaterThanOrEqual(50);
        expect(evalResult.confidence).toBeLessThanOrEqual(100);
    });
});
