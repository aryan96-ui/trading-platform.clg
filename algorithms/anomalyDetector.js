// algorithms/anomalyDetector.js - Real-Time Market Anomaly & Flash-Crash Detector

class AnomalyDetector {
    /**
     * Scan a series of candlestick bars for volume spikes and flash deviations
     * 
     * @param {string} symbol
     * @param {Array<Object>} candles - [{time, open, high, low, close, volume}, ...]
     * @param {number} thresholdStdDev - Z-score anomaly threshold (e.g. 2.5 - 3.0)
     */
    static scanCandles(symbol, candles = [], thresholdStdDev = 2.5) {
        if (!Array.isArray(candles) || candles.length < 20) {
            return { symbol, isAnomaly: false, activeAlerts: [], baseline: {} };
        }

        const n = candles.length;
        const recentWindow = candles.slice(-20); // Baseline window

        // 1. Price Returns Analysis
        const returns = [];
        for (let i = 1; i < recentWindow.length; i++) {
            returns.push((recentWindow[i].close - recentWindow[i - 1].close) / recentWindow[i - 1].close);
        }

        const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const varReturn = returns.map(r => Math.pow(r - meanReturn, 2)).reduce((a, b) => a + b, 0) / returns.length;
        const stdReturn = Math.sqrt(varReturn) || 0.001;

        const latestCandle = candles[n - 1];
        const prevCandle = candles[n - 2];
        const latestReturn = (latestCandle.close - prevCandle.close) / prevCandle.close;
        const returnZScore = Number(((latestReturn - meanReturn) / stdReturn).toFixed(2));

        // 2. Volume Surge Analysis
        const volumes = recentWindow.map(c => c.volume);
        const meanVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
        const varVolume = volumes.map(v => Math.pow(v - meanVolume, 2)).reduce((a, b) => a + b, 0) / volumes.length;
        const stdVolume = Math.sqrt(varVolume) || 1;

        const latestVolume = latestCandle.volume;
        const volumeZScore = Number(((latestVolume - meanVolume) / stdVolume).toFixed(2));
        const volumeSurgeRatio = Number((latestVolume / meanVolume).toFixed(2));

        // 3. Intraday Candle Range (High - Low)
        const ranges = recentWindow.map(c => (c.high - c.low) / c.close);
        const meanRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
        const currentRange = (latestCandle.high - latestCandle.low) / latestCandle.close;
        const rangeExpansionRatio = Number((currentRange / (meanRange || 0.001)).toFixed(2));

        const alerts = [];

        // Condition A: Flash Crash Detection
        if (returnZScore <= -thresholdStdDev) {
            alerts.push({
                type: 'FLASH_CRASH_WARNING',
                severity: 'CRITICAL',
                message: `Severe downward deviation detected on ${symbol}: ${returnZScore}σ decline.`,
                metric: `${(latestReturn * 100).toFixed(2)}% drop in single bar`
            });
        }

        // Condition B: Breakout Surge
        if (returnZScore >= thresholdStdDev) {
            alerts.push({
                type: 'EXPONENTIAL_BREAKOUT',
                severity: 'HIGH',
                message: `Violent upside breakout detected on ${symbol}: +${returnZScore}σ surge.`,
                metric: `+${(latestReturn * 100).toFixed(2)}% jump`
            });
        }

        // Condition C: Whale / Institutional Volume Surge
        if (volumeZScore >= 3.0 || volumeSurgeRatio >= 3.5) {
            alerts.push({
                type: 'UNUSUAL_VOLUME_SPIKE',
                severity: 'WARNING',
                message: `Abnormal volume activity on ${symbol}: ${volumeSurgeRatio}x 20-bar average.`,
                metric: `${latestVolume.toLocaleString()} units`
            });
        }

        // Condition D: Extreme Volatility Expansion
        if (rangeExpansionRatio >= 3.0) {
            alerts.push({
                type: 'VOLATILITY_EXPANSION',
                severity: 'MEDIUM',
                message: `High-Low price span expanded ${rangeExpansionRatio}x above baseline.`,
                metric: `Spread: ₹${(latestCandle.high - latestCandle.low).toFixed(2)}`
            });
        }

        const isAnomaly = alerts.length > 0;

        return {
            symbol,
            timestamp: Date.now(),
            isAnomaly,
            anomalyScore: Math.min(100, Math.round((Math.abs(returnZScore) * 20) + (volumeZScore * 15))),
            returnZScore,
            volumeZScore,
            volumeSurgeRatio,
            rangeExpansionRatio,
            alerts,
            status: isAnomaly ? 'ANOMALY_DETECTED' : 'NORMAL_EQUILIBRIUM'
        };
    }
}

module.exports = AnomalyDetector;
