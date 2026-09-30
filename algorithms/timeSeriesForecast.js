// algorithms/timeSeriesForecast.js - High-Precision Time-Series Forecasting Engine

class TimeSeriesForecastEngine {
    /**
     * Double Exponential Smoothing (Holt's Linear Trend) & Horizon Projection
     * 
     * @param {Array<number>} prices - Historical price array
     * @param {number} horizon - Number of forward steps to project (e.g. 10)
     * @param {number} alpha - Level smoothing parameter (0 < alpha < 1)
     * @param {number} beta - Trend smoothing parameter (0 < beta < 1)
     */
    static forecastPrices(prices = [], horizon = 12, alpha = 0.35, beta = 0.15) {
        if (!Array.isArray(prices) || prices.length < 10) {
            const fallback = prices[prices.length - 1] || 1000;
            return { forecast: new Array(horizon).fill(fallback), bounds: { upper: [], lower: [] } };
        }

        const n = prices.length;
        let level = prices[0];
        let trend = prices[1] - prices[0];
        const residuals = [];

        // Fit Holt's model across historical series
        for (let i = 1; i < n; i++) {
            const prevLevel = level;
            const prevTrend = trend;
            const actual = prices[i];

            const oneStepAhead = prevLevel + prevTrend;
            residuals.push(actual - oneStepAhead);

            level = (alpha * actual) + ((1 - alpha) * (prevLevel + prevTrend));
            trend = (beta * (level - prevLevel)) + ((1 - beta) * prevTrend);
        }

        // Calculate residual standard error
        const sse = residuals.reduce((sum, r) => sum + Math.pow(r, 2), 0);
        const stdError = Math.sqrt(sse / Math.max(1, residuals.length - 2));

        // Generate forward projection
        const currentPrice = prices[n - 1];
        const forecast = [];
        const upperBounds = [];
        const lowerBounds = [];

        for (let m = 1; m <= horizon; m++) {
            const projected = Number((level + (m * trend)).toFixed(2));
            // Expanding confidence interval with horizon sqrt(m)
            const margin = Number((1.96 * stdError * Math.sqrt(m)).toFixed(2));
            const upper = Number((projected + margin).toFixed(2));
            const lower = Number((Math.max(0.01, projected - margin)).toFixed(2));

            forecast.push(projected);
            upperBounds.push(upper);
            lowerBounds.push(lower);
        }

        // Project Key Targets
        const target1h = forecast[Math.min(2, forecast.length - 1)];
        const target1d = forecast[Math.min(6, forecast.length - 1)];
        const target1w = forecast[forecast.length - 1];

        const change1d = Number((((target1d - currentPrice) / currentPrice) * 100).toFixed(2));
        const isBullish = change1d > 0;
        const confidenceScore = Math.max(45, Math.min(92, Math.round(75 - (stdError / currentPrice * 1000))));

        return {
            currentPrice,
            forecastHorizonSteps: horizon,
            horizons: {
                next1Hour: { price: target1h, changePercent: Number((((target1h - currentPrice) / currentPrice) * 100).toFixed(2)) },
                next1Day: { price: target1d, changePercent: change1d },
                next1Week: { price: target1w, changePercent: Number((((target1w - currentPrice) / currentPrice) * 100).toFixed(2)) }
            },
            modelMetrics: {
                level: Number(level.toFixed(2)),
                trendSlope: Number(trend.toFixed(4)),
                residualStdError: Number(stdError.toFixed(2)),
                confidence: `${confidenceScore}%`
            },
            signal: isBullish ? 'BULLISH' : 'BEARISH',
            supportFloor: Math.min(...lowerBounds),
            resistanceCeiling: Math.max(...upperBounds),
            forecastCurve: forecast,
            upperConfidenceBand: upperBounds,
            lowerConfidenceBand: lowerBounds
        };
    }
}

module.exports = TimeSeriesForecastEngine;
