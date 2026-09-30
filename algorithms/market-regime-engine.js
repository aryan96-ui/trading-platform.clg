/**
 * Market Regime Engine
 * 
 * Classifies current market conditions and provides supporting evidence.
 * 
 * Regimes:
 * - TRENDING (BULLISH / BEARISH)
 * - RANGE-BOUND
 * - HIGH VOLATILITY
 * - LOW VOLATILITY
 * - BREAKOUT
 * - CRISIS
 * 
 * CRITICAL: Never produce a regime without showing supporting evidence.
 * CRITICAL: Never present regime as a guarantee.
 */
class MarketRegimeEngine {
    constructor() {
        this.history = []; // Past regime assessments
        this.maxHistory = 100;
    }

    /**
     * Assess current market regime for an instrument or index
     * @param {object} data - { prices: number[], volumes: number[], timeframe: string }
     * @returns {MarketRegime}
     */
    assess(data) {
        const { prices = [], volumes = [], timeframe = '1D' } = data;

        if (prices.length < 20) {
            return this._emptyRegime('Insufficient data for regime assessment');
        }

        // Calculate evidence
        const evidence = this._calculateEvidence(prices, volumes);

        // Classify regime
        const regime = this._classifyRegime(evidence);

        const result = {
            regime: regime.primary,
            sub: regime.sub,
            subRegime: regime.sub, // Backward-compat alias
            confidence: regime.confidence,
            evidence: {
                trend: {
                    direction: evidence.trendDirection,
                    strength: evidence.trendStrength,
                    adx: evidence.adx
                },
                volatility: {
                    level: evidence.volatilityLevel,
                    percentile: evidence.volatilityPercentile,
                    atr: evidence.atr,
                    atrPercent: evidence.atrPercent
                },
                momentum: {
                    rsi: evidence.rsi,
                    macdHistogram: evidence.macdHistogram,
                    momentumScore: evidence.momentumScore
                },
                volume: {
                    trend: evidence.volumeTrend,
                    relativeVolume: evidence.relativeVolume,
                    volumeConfirmation: evidence.volumeConfirmation
                },
                support: evidence.nearestSupport,
                resistance: evidence.nearestResistance
            },
            description: this._describeRegime(regime, evidence),
            risks: this._identifyRisks(regime, evidence),
            timestamp: new Date().toISOString(),
            timeframe,
            disclaimer: 'Regime classification is based on historical data and is not predictive.'
        };

        this.history.push(result);
        if (this.history.length > this.maxHistory) this.history.shift();

        return result;
    }

    /**
     * Get regime history
     */
    getHistory() {
        return [...this.history];
    }

    _calculateEvidence(prices, volumes) {
        // Returns
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }

        // Volatility (standard deviation of returns)
        const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);

        // ATR
        const trueRanges = [];
        for (let i = 1; i < prices.length; i++) {
            const range = Math.abs(prices[i] - prices[i - 1]);
            trueRanges.push(range);
        }
        const atr = trueRanges.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, trueRanges.length);
        const atrPercent = (atr / prices[prices.length - 1]) * 100;

        // Volatility percentile (how does current vol compare to recent history)
        const recentVol = volatility;
        const allVols = [];
        for (let i = 20; i < returns.length; i++) {
            const window = returns.slice(i - 20, i);
            const mean = window.reduce((a, b) => a + b, 0) / window.length;
            const v = Math.sqrt(window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length);
            allVols.push(v);
        }
        const sortedVols = [...allVols].sort((a, b) => a - b);
        const volatilityPercentile = sortedVols.length > 0
            ? (sortedVols.filter(v => v <= recentVol).length / sortedVols.length) * 100
            : 50;

        // SMA
        const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const sma50 = prices.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, prices.length);
        const currentPrice = prices[prices.length - 1];

        // Trend direction
        const trendDirection = currentPrice > sma20 ? 'bullish' : currentPrice < sma20 ? 'bearish' : 'neutral';

        // Trend strength (based on SMA separation)
        const smaSeparation = Math.abs(sma20 - sma50) / sma50 * 100;
        const trendStrength = Math.min(100, smaSeparation * 10);

        // ADX approximation
        const adx = 20 + trendStrength * 0.6;

        // RSI
        const gains = returns.map(r => r > 0 ? r : 0);
        const losses = returns.map(r => r < 0 ? -r : 0);
        const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const rs = avgGain / (avgLoss || 0.001);
        const rsi = 100 - (100 / (1 + rs));

        // MACD (simplified)
        const ema12 = this._ema(prices, 12);
        const ema26 = this._ema(prices, 26);
        const macdLine = ema12 - ema26;
        const macdHistogram = macdLine * 0.3; // Simplified

        // Momentum score (-100 to 100)
        const momentumScore = (rsi - 50) * 2;

        // Volume analysis
        const avgVolume = volumes.length > 0
            ? volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length)
            : 0;
        const currentVolume = volumes[volumes.length - 1] || 0;
        const relativeVolume = avgVolume > 0 ? currentVolume / avgVolume : 1;
        const volumeTrend = relativeVolume > 1.5 ? 'high' : relativeVolume < 0.7 ? 'low' : 'normal';
        const volumeConfirmation = (trendDirection === 'bullish' && volumeTrend === 'high') ||
            (trendDirection === 'bearish' && volumeTrend === 'high');

        // Support / Resistance (simplified: recent lows/highs)
        const recentPrices = prices.slice(-20);
        const nearestSupport = Math.min(...recentPrices);
        const nearestResistance = Math.max(...recentPrices);

        return {
            volatility, atr, atrPercent, volatilityPercentile,
            sma20, sma50, currentPrice,
            trendDirection, trendStrength, adx,
            rsi, macdLine, macdHistogram, momentumScore,
            volumeTrend, relativeVolume, volumeConfirmation,
            nearestSupport, nearestResistance
        };
    }

    _classifyRegime(evidence) {
        let primary = 'NEUTRAL';
        let sub = 'NORMAL';
        let confidence = 0.5;

        // Volatility classification
        const volLevel = evidence.volatilityPercentile > 80 ? 'HIGH'
            : evidence.volatilityPercentile < 20 ? 'LOW' : 'NORMAL';

        // Trend classification
        const trendStr = evidence.adx > 30 ? 'STRONG' : evidence.adx > 20 ? 'MODERATE' : 'WEAK';

        if (volLevel === 'HIGH' && evidence.trendDirection === 'neutral') {
            primary = 'HIGH VOLATILITY';
            sub = 'CHOPPY';
            confidence = 0.6 + (evidence.volatilityPercentile - 80) / 100;
        } else if (volLevel === 'LOW' && trendStr === 'WEAK') {
            primary = 'RANGE-BOUND';
            sub = 'LOW VOLATILITY';
            confidence = 0.5 + (20 - evidence.volatilityPercentile) / 100;
        } else if (evidence.trendDirection === 'bullish' && trendStr === 'STRONG') {
            primary = 'TRENDING';
            sub = 'BULLISH';
            confidence = 0.5 + evidence.trendStrength / 200;
        } else if (evidence.trendDirection === 'bearish' && trendStr === 'STRONG') {
            primary = 'TRENDING';
            sub = 'BEARISH';
            confidence = 0.5 + evidence.trendStrength / 200;
        } else if (volLevel === 'HIGH') {
            primary = 'HIGH VOLATILITY';
            sub = evidence.trendDirection === 'bullish' ? 'BULLISH VOLATILITY' : 'BEARISH VOLATILITY';
            confidence = 0.55;
        } else if (volLevel === 'LOW') {
            primary = 'LOW VOLATILITY';
            sub = 'COMPRESSION';
            confidence = 0.5;
        } else {
            primary = 'NEUTRAL';
            sub = 'MIXED SIGNALS';
            confidence = 0.4;
        }

        // Check for breakout conditions
        if (evidence.volumeConfirmation && trendStr === 'STRONG') {
            sub = `${sub} (BREAKOUT)`;
            confidence = Math.min(0.85, confidence + 0.1);
        }

        // Clamp confidence
        confidence = Math.max(0.2, Math.min(0.9, confidence));

        return { primary, sub, confidence };
    }

    _describeRegime(regime, evidence) {
        const parts = [];

        if (regime.primary === 'TRENDING') {
            parts.push(`Market is in a ${regime.sub.toLowerCase()} trend`);
            parts.push(`with ${evidence.trendStrength.toFixed(0)}% trend strength`);
        } else if (regime.primary === 'RANGE-BOUND') {
            parts.push('Market is consolidating in a range');
            parts.push('with low volatility and weak directional bias');
        } else if (regime.primary === 'HIGH VOLATILITY') {
            parts.push('Market is experiencing elevated volatility');
            parts.push(`Volatility is at the ${evidence.volatilityPercentile.toFixed(0)}th percentile`);
        } else if (regime.primary === 'LOW VOLATILITY') {
            parts.push('Market volatility is compressed');
            parts.push('This may precede a directional move');
        } else {
            parts.push('Market signals are mixed');
            parts.push('No clear directional bias');
        }

        parts.push(`RSI: ${evidence.rsi.toFixed(1)}, ADX: ${evidence.adx.toFixed(1)}`);

        return parts.join('. ') + '.';
    }

    _identifyRisks(regime, evidence) {
        const risks = [];

        if (regime.primary === 'TRENDING' && regime.sub === 'BULLISH') {
            if (evidence.rsi > 70) risks.push('RSI indicates overbought conditions');
            if (evidence.volatilityPercentile > 70) risks.push('Elevated volatility in uptrend');
            risks.push('Trend may be extended — mean reversion risk');
        }
        if (regime.primary === 'TRENDING' && regime.sub === 'BEARISH') {
            if (evidence.rsi < 30) risks.push('RSI indicates oversold conditions — bounce possible');
            risks.push('Bearish momentum may accelerate');
        }
        if (regime.primary === 'HIGH VOLATILITY') {
            risks.push('Stop-losses may be triggered by noise');
            risks.push('Position sizing should be reduced');
            risks.push('Spread costs increase');
        }
        if (regime.primary === 'RANGE-BOUND') {
            risks.push('Range breakout could trigger sharp move');
            risks.push('Mean-reversion strategies favored');
        }
        if (evidence.adx > 40) {
            risks.push('Strong trend may be nearing exhaustion');
        }

        return risks;
    }

    _ema(data, period) {
        const k = 2 / (period + 1);
        let ema = data[0];
        for (let i = 1; i < data.length; i++) {
            ema = (data[i] * k) + (ema * (1 - k));
        }
        return ema;
    }

    _emptyRegime(reason) {
        return {
            regime: 'UNKNOWN',
            sub: reason,
            confidence: 0,
            evidence: {},
            description: reason,
            risks: [],
            timestamp: new Date().toISOString(),
            disclaimer: 'Insufficient data for regime classification.'
        };
    }
}

module.exports = MarketRegimeEngine;
