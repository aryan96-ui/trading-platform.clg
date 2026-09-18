/**
 * Trade Quality Engine
 * 
 * Evaluates the quality of a proposed trade BEFORE execution.
 * Calculates a quality score (0-100) based on multiple factors.
 * 
 * CRITICAL: Never present the score as a guaranteed prediction.
 * CRITICAL: Always show supporting AND contradicting factors.
 * 
 * Factors evaluated:
 * - Trend alignment
 * - Momentum confirmation
 * - Volatility context
 * - Volume confirmation
 * - Risk/Reward ratio
 * - Market regime compatibility
 * - Sector/relative strength
 * - Portfolio concentration risk
 * - Liquidity assessment
 */
class TradeQualityEngine {
    constructor(regimeEngine) {
        this.regimeEngine = regimeEngine;
    }

    /**
     * Evaluate trade quality
     * @param {object} trade - { symbol, direction, entryPrice, stopLoss, target, sector, portfolio }
     * @param {object} marketData - { price, rsi, macdHistogram, volume, atr, ema200, regime }
     * @returns {TradeQuality}
     */
    evaluate(trade, marketData) {
        const factors = [];
        let score = 50; // Start at neutral

        const { direction, entryPrice, stopLoss, target } = trade;
        const { price, rsi, macdHistogram, volume, atr, ema200, sma50, regime } = marketData;

        // 1. TREND ALIGNMENT (±15 points)
        const trendScore = this._evaluateTrend(direction, price, ema200, sma50, regime);
        score += trendScore.delta;
        factors.push(trendScore);

        // 2. MOMENTUM (±10 points)
        const momentumScore = this._evaluateMomentum(direction, rsi, macdHistogram);
        score += momentumScore.delta;
        factors.push(momentumScore);

        // 3. VOLATILITY (±10 points)
        const volatilityScore = this._evaluateVolatility(atr, price, regime);
        score += volatilityScore.delta;
        factors.push(volatilityScore);

        // 4. VOLUME (±8 points)
        const volumeScore = this._evaluateVolume(volume);
        score += volumeScore.delta;
        factors.push(volumeScore);

        // 5. RISK/REWARD (±12 points)
        const rrScore = this._evaluateRiskReward(entryPrice, stopLoss, target, direction);
        score += rrScore.delta;
        factors.push(rrScore);

        // 6. REGIME COMPATIBILITY (±8 points)
        const regimeScore = this._evaluateRegime(direction, regime);
        score += regimeScore.delta;
        factors.push(regimeScore);

        // 7. PORTFOLIO RISK (±7 points)
        const portfolioScore = this._evaluatePortfolioRisk(trade.portfolio, trade.symbol);
        score += portfolioScore.delta;
        factors.push(portfolioScore);

        // 8. LIQUIDITY (±5 points)
        const liquidityScore = this._evaluateLiquidity(volume, atr, price);
        score += liquidityScore.delta;
        factors.push(liquidityScore);

        // Clamp score
        score = Math.max(0, Math.min(100, Math.round(score)));

        // Generate supporting and contradicting factors
        const supporting = factors.filter(f => f.delta > 0);
        const contradicting = factors.filter(f => f.delta < 0);
        const neutral = factors.filter(f => f.delta === 0);

        return {
            score,
            grade: this._scoreToGrade(score),
            direction,
            factors,
            supporting: supporting.map(f => ({ name: f.name, detail: f.detail })),
            contradicting: contradicting.map(f => ({ name: f.name, detail: f.detail })),
            neutral: neutral.map(f => f.name),
            risks: this._identifyRisks(score, factors, trade, marketData),
            invalidation: this._defineInvalidation(trade, marketData),
            timestamp: new Date().toISOString(),
            disclaimer: 'Trade quality score is an analytical tool, not a prediction. It does not guarantee any outcome.'
        };
    }

    _evaluateTrend(direction, price, ema200, sma50, regime) {
        let delta = 0;
        const detail = [];

        if (direction === 'buy') {
            if (price > ema200) { delta += 10; detail.push('Price above 200 EMA (bullish)'); }
            else { delta -= 10; detail.push('Price below 200 EMA (bearish context)'); }

            if (price > sma50) { delta += 5; detail.push('Price above 50 SMA'); }
            else { delta -= 3; detail.push('Price below 50 SMA'); }

            if (regime && regime.sub === 'BULLISH') { delta += 3; detail.push('Market regime is bullish'); }
            else if (regime && regime.sub === 'BEARISH') { delta -= 5; detail.push('Market regime is bearish — counter-trend risk'); }
        } else {
            if (price < ema200) { delta += 10; detail.push('Price below 200 EMA (bearish)'); }
            else { delta -= 10; detail.push('Price above 200 EMA (bullish context)'); }

            if (price < sma50) { delta += 5; detail.push('Price below 50 SMA'); }
            else { delta -= 3; detail.push('Price above 50 SMA'); }

            if (regime && regime.sub === 'BEARISH') { delta += 3; detail.push('Market regime is bearish'); }
            else if (regime && regime.sub === 'BULLISH') { delta -= 5; detail.push('Market regime is bullish — counter-trend risk'); }
        }

        return { name: 'Trend Alignment', delta, detail: detail.join('; ') || 'No trend data available' };
    }

    _evaluateMomentum(direction, rsi, macdHistogram) {
        let delta = 0;
        const detail = [];

        if (direction === 'buy') {
            if (rsi > 30 && rsi < 70) { delta += 5; detail.push(`RSI ${rsi.toFixed(1)} — neutral zone`); }
            else if (rsi <= 30) { delta += 8; detail.push(`RSI ${rsi.toFixed(1)} — oversold, potential bounce`); }
            else if (rsi >= 70) { delta -= 8; detail.push(`RSI ${rsi.toFixed(1)} — overbought, pullback risk`); }

            if (macdHistogram > 0) { delta += 5; detail.push('MACD histogram positive'); }
            else { delta -= 3; detail.push('MACD histogram negative'); }
        } else {
            if (rsi > 30 && rsi < 70) { delta += 5; detail.push(`RSI ${rsi.toFixed(1)} — neutral zone`); }
            else if (rsi >= 70) { delta += 8; detail.push(`RSI ${rsi.toFixed(1)} — overbought, potential decline`); }
            else if (rsi <= 30) { delta -= 8; detail.push(`RSI ${rsi.toFixed(1)} — oversold, bounce risk`); }

            if (macdHistogram < 0) { delta += 5; detail.push('MACD histogram negative'); }
            else { delta -= 3; detail.push('MACD histogram positive'); }
        }

        return { name: 'Momentum', delta, detail: detail.join('; ') || 'No momentum data' };
    }

    _evaluateVolatility(atr, price, regime) {
        const atrPercent = price > 0 ? (atr / price) * 100 : 0;
        let delta = 0;
        const detail = [];

        if (atrPercent < 1.5) {
            delta += 5; detail.push(`Low volatility (${atrPercent.toFixed(1)}%) — favorable entry`);
        } else if (atrPercent < 3) {
            delta += 2; detail.push(`Normal volatility (${atrPercent.toFixed(1)}%)`);
        } else {
            delta -= 5; detail.push(`High volatility (${atrPercent.toFixed(1)}%) — wider stops needed`);
        }

        return { name: 'Volatility', delta, detail: detail.join('; ') };
    }

    _evaluateVolume(volume) {
        let delta = 0;
        const detail = [];

        if (volume > 500000) { delta += 5; detail.push('Good liquidity'); }
        else if (volume > 100000) { delta += 2; detail.push('Adequate volume'); }
        else { delta -= 5; detail.push('Low volume — slippage risk'); }

        return { name: 'Volume', delta, detail: detail.join('; ') };
    }

    _evaluateRiskReward(entry, stopLoss, target, direction) {
        if (!stopLoss || !target) {
            return { name: 'Risk/Reward', delta: 0, detail: 'Stop-loss and target not defined' };
        }

        const risk = Math.abs(entry - stopLoss);
        const reward = Math.abs(target - entry);
        const rr = risk > 0 ? reward / risk : 0;
        let delta = 0;
        const detail = [];

        if (rr >= 3) { delta = 12; detail.push(`Excellent R:R ${rr.toFixed(1)}:1`); }
        else if (rr >= 2) { delta = 8; detail.push(`Good R:R ${rr.toFixed(1)}:1`); }
        else if (rr >= 1.5) { delta = 4; detail.push(`Acceptable R:R ${rr.toFixed(1)}:1`); }
        else if (rr >= 1) { delta = 0; detail.push(`Marginal R:R ${rr.toFixed(1)}:1`); }
        else { delta = -8; detail.push(`Poor R:R ${rr.toFixed(1)}:1 — risk exceeds reward`); }

        return { name: 'Risk/Reward', delta, detail: detail.join('; ') };
    }

    _evaluateRegime(direction, regime) {
        if (!regime || !regime.regime) {
            return { name: 'Regime', delta: 0, detail: 'No regime data available' };
        }

        let delta = 0;
        const detail = [];

        if (regime.regime === 'TRENDING') {
            if ((direction === 'buy' && regime.sub === 'BULLISH') ||
                (direction === 'sell' && regime.sub === 'BEARISH')) {
                delta = 8; detail.push(`Trending ${regime.sub.toLowerCase()} — trade aligned with trend`);
            } else {
                delta = -5; detail.push(`Trending ${regime.sub.toLowerCase()} — counter-trend trade`);
            }
        } else if (regime.regime === 'RANGE-BOUND') {
            delta = 0; detail.push('Range-bound — use range-trading approach');
        } else if (regime.regime === 'HIGH VOLATILITY') {
            delta = -5; detail.push('High volatility — reduce position size');
        } else if (regime.regime === 'LOW VOLATILITY') {
            delta = 2; detail.push('Low volatility — compression may lead to breakout');
        }

        return { name: 'Regime', delta, detail: detail.join('; ') };
    }

    _evaluatePortfolioRisk(portfolio, symbol) {
        if (!portfolio) return { name: 'Portfolio', delta: 0, detail: 'No portfolio data' };

        const holdings = portfolio.holdings || [];
        const totalValue = holdings.reduce((a, h) => a + (h.value || 0), 0);
        const symbolExposure = holdings.find(h => h.symbol === symbol);

        let delta = 0;
        const detail = [];

        if (symbolExposure) {
            const exposure = totalValue > 0 ? (symbolExposure.value / totalValue) * 100 : 0;
            if (exposure > 30) { delta = -7; detail.push(`${exposure.toFixed(0)}% concentration in ${symbol} — high risk`); }
            else if (exposure > 15) { delta = -3; detail.push(`${exposure.toFixed(0)}% exposure to ${symbol}`); }
            else { delta = 0; detail.push('Acceptable concentration level'); }
        } else {
            delta = 2; detail.push('New position — no concentration risk');
        }

        return { name: 'Portfolio Risk', delta, detail: detail.join('; ') };
    }

    _evaluateLiquidity(volume, atr, price) {
        const spread = atr > 0 ? (atr * 0.1) : 0;
        const spreadPercent = price > 0 ? (spread / price) * 100 : 0;

        let delta = 0;
        const detail = [];

        if (volume > 1000000) { delta = 5; detail.push('High liquidity'); }
        else if (volume > 200000) { delta = 2; detail.push('Adequate liquidity'); }
        else { delta = -3; detail.push('Limited liquidity — wider spreads possible'); }

        return { name: 'Liquidity', delta, detail: detail.join('; ') };
    }

    _scoreToGrade(score) {
        if (score >= 80) return { letter: 'A', label: 'Excellent', color: '#00c853' };
        if (score >= 65) return { letter: 'B', label: 'Good', color: '#8bc34a' };
        if (score >= 50) return { letter: 'C', label: 'Fair', color: '#f59e0b' };
        if (score >= 35) return { letter: 'D', label: 'Weak', color: '#ff9800' };
        return { letter: 'F', label: 'Poor', color: '#ff3d3d' };
    }

    _identifyRisks(score, factors, trade, marketData) {
        const risks = [];

        if (score < 50) risks.push('Overall trade quality is below average');
        if (trade.direction === 'buy' && marketData.rsi > 70) risks.push('Entering long at overbought levels');
        if (trade.direction === 'sell' && marketData.rsi < 30) risks.push('Shorting at oversold levels');

        const rr = factors.find(f => f.name === 'Risk/Reward');
        if (rr && rr.delta < 0) risks.push('Risk/Reward ratio is unfavorable');

        const regime = factors.find(f => f.name === 'Regime');
        if (regime && regime.delta < 0) risks.push('Trade is counter to market regime');

        return risks;
    }

    _defineInvalidation(trade, marketData) {
        const conditions = [];

        if (trade.stopLoss) {
            conditions.push(`Trade invalidated if price closes below ${trade.stopLoss}`);
        }
        if (trade.direction === 'buy') {
            conditions.push('Invalidate if price breaks below key support');
            conditions.push('Invalidate if RSI drops below 30 with heavy volume');
        } else {
            conditions.push('Invalidate if price breaks above key resistance');
            conditions.push('Invalidate if RSI rises above 70 with heavy volume');
        }

        return conditions;
    }
}

module.exports = TradeQualityEngine;
