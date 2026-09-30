// algorithms/riskEngine.js - Quantitative Risk Management & Position Sizing Engine

class RiskEngine {
    /**
     * Kelly Criterion Formula:
     * f* = (p * b - (1 - p)) / b
     * where:
     *   p = probability of a winning trade (win rate, 0 < p < 1)
     *   b = reward-to-risk ratio (average win / average loss)
     * 
     * Uses Half-Kelly or Quarter-Kelly by default for safety against variance.
     */
    static calculateKellyPosition({ winRate = 0.55, winLossRatio = 1.8, capital = 100000, fraction = 0.5 }) {
        if (winRate <= 0 || winRate >= 1 || winLossRatio <= 0) {
            return { kellyPercent: 0, recommendedRiskAmount: 0, safeFraction: 'Quarter-Kelly' };
        }

        const p = winRate;
        const q = 1 - p;
        const b = winLossRatio;

        // Full Kelly fraction
        const fullKelly = (p * b - q) / b;

        // Bounded between 0 and 25% max per single trade
        const adjustedKelly = Math.max(0, Math.min(0.25, fullKelly * fraction));
        const recommendedRiskAmount = Number((capital * adjustedKelly).toFixed(2));

        return {
            fullKellyPercent: Number((fullKelly * 100).toFixed(2)),
            fractionUsed: fraction === 0.5 ? 'Half-Kelly (50%)' : `${(fraction * 100).toFixed(0)}% Kelly`,
            recommendedPositionPercent: Number((adjustedKelly * 100).toFixed(2)),
            recommendedRiskAmount,
            isEdgePositive: fullKelly > 0
        };
    }

    /**
     * ATR-based Volatility Stop-Loss & Dynamic Position Sizing
     * 
     * Sizing = (Capital * RiskTolerancePercent) / (StopLossDistance)
     */
    static calculateAtrPositionSizing({
        capital = 100000,
        currentPrice = 2500,
        atr = 35.5,
        riskPercent = 1.5,     // 1.5% max capital risk
        atrMultiplier = 2.0,   // 2 x ATR stop distance
        direction = 'BUY'
    }) {
        if (currentPrice <= 0 || atr <= 0 || capital <= 0) {
            return { quantity: 0, stopLoss: currentPrice, takeProfit: currentPrice };
        }

        const maxRiskAmount = capital * (riskPercent / 100);
        const stopDistance = Math.max(0.01, atr * atrMultiplier);
        
        // Calculate max shares permitted by risk tolerance
        const maxSharesByRisk = Math.floor(maxRiskAmount / stopDistance);
        // Calculate max shares permitted by available cash
        const maxSharesByCash = Math.floor(capital / currentPrice);
        
        const quantity = Math.max(1, Math.min(maxSharesByRisk, maxSharesByCash));
        const totalInvested = Number((quantity * currentPrice).toFixed(2));

        const isLong = direction.toUpperCase() === 'BUY';
        const stopLoss = Number((isLong ? currentPrice - stopDistance : currentPrice + stopDistance).toFixed(2));
        const takeProfit = Number((isLong ? currentPrice + (stopDistance * 2.0) : currentPrice - (stopDistance * 2.0)).toFixed(2));

        return {
            quantity,
            currentPrice,
            totalInvested,
            stopLoss,
            takeProfit,
            stopDistance: Number(stopDistance.toFixed(2)),
            riskRewardRatio: '1 : 2.0',
            maxLossAmount: Number((quantity * stopDistance).toFixed(2)),
            projectedProfit: Number((quantity * stopDistance * 2.0).toFixed(2))
        };
    }

    /**
     * Parametric & Historical Value at Risk (VaR 95% and 99%)
     */
    static calculateVaR(dailyReturns = [], portfolioValue = 100000, confidence = 0.95) {
        if (!Array.isArray(dailyReturns) || dailyReturns.length < 10) {
            // Default 95% 1-day VaR approximation for typical equities (~2.1%)
            return {
                confidence: `${(confidence * 100).toFixed(0)}%`,
                varPercent: 2.15,
                varAmount: Number((portfolioValue * 0.0215).toFixed(2)),
                method: 'Standardized Normative Model'
            };
        }

        // Sort returns in ascending order for historical percentile VaR
        const sorted = [...dailyReturns].sort((a, b) => a - b);
        const index = Math.floor((1 - confidence) * sorted.length);
        const historicalVaR = Math.abs(sorted[index]);

        // Mean and standard deviation for parametric VaR
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.map(r => Math.pow(r - mean, 2)).reduce((a, b) => a + b, 0) / dailyReturns.length;
        const stdDev = Math.sqrt(variance);

        // Z-score: 1.645 for 95%, 2.326 for 99%
        const z = confidence === 0.99 ? 2.326 : 1.645;
        const parametricVaR = (z * stdDev) - mean;

        const finalVaRPct = Number((Math.max(historicalVaR, parametricVaR) * 100).toFixed(2));
        const finalVaRAmount = Number((portfolioValue * (finalVaRPct / 100)).toFixed(2));

        return {
            confidence: `${(confidence * 100).toFixed(0)}%`,
            varPercent: finalVaRPct,
            varAmount: finalVaRAmount,
            dailyVolatility: Number((stdDev * 100).toFixed(2)),
            method: 'Hybrid Historical / Parametric VaR'
        };
    }
}

module.exports = RiskEngine;
