/**
 * AI Context Builder
 *
 * Assembles the structured context that the AI layer is allowed to reason
 * over. ALL numbers are computed here from real market data — the AI never
 * derives financial facts itself, and no client-supplied numbers are trusted.
 *
 * Flow: provider → gateway → candles → indicators → regime → context
 */
const IndicatorEngine = require('./indicator-engine');

class AIContextBuilder {
    constructor({ gateway, instrumentMaster, regimeEngine } = {}) {
        this.gateway = gateway;
        this.instrumentMaster = instrumentMaster;
        this.regimeEngine = regimeEngine;
    }

    /**
     * Build a provenance-tagged context for a symbol.
     * Missing inputs are reported in `unavailable` / `warnings`, never filled in.
     */
    async build(symbol, exchange) {
        const warnings = [];
        let quote = null;
        let candles = [];

        try {
            quote = await this.gateway.getQuote(symbol, exchange);
        } catch (error) {
            warnings.push(`Quote unavailable: ${error.message}`);
        }

        try {
            candles = await this.gateway.getHistory(symbol, exchange, '1D', 260);
        } catch (error) {
            warnings.push(`History unavailable: ${error.message}`);
        }

        const tech = IndicatorEngine.snapshot(candles, quote);
        const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
        const volumes = candles.map(c => Number(c.volume)).filter(Number.isFinite);

        let regime = { regime: 'UNKNOWN', sub: null, confidence: null, evidence: [] };
        if (this.regimeEngine && closes.length >= 20) {
            try {
                const assessed = this.regimeEngine.assess({ prices: closes, volumes, timeframe: '1D' });
                regime = {
                    regime: assessed.regime || 'UNKNOWN',
                    sub: assessed.sub || assessed.subRegime || null,
                    confidence: assessed.confidence ?? null,
                    evidence: assessed.evidence || []
                };
            } catch (error) {
                warnings.push(`Regime unavailable: ${error.message}`);
            }
        } else {
            warnings.push('Regime unavailable: insufficient price history');
        }

        const indicatorFields = [
            'rsi', 'macdLine', 'macdHistogram', 'ema20', 'ema50', 'ema200',
            'sma20', 'sma50', 'sma200', 'atr', 'adx', 'bollingerPosition', 'stochasticK'
        ];
        const unavailable = indicatorFields.filter(f => tech[f] === null || tech[f] === undefined);

        const source = (quote && quote.source) || tech.dataSource || 'unknown';
        const dataQuality = (quote && quote.dataQuality) || (candles.length ? 'DEMO' : 'UNAVAILABLE');

        return {
            symbol,
            marketData: {
                price: tech.price,
                volume: tech.volume,
                relativeVolume: tech.relativeVolume,
                volatility: tech.atrPercent !== null ? tech.atrPercent / 100 : null,
                change1D: tech.change1D,
                change1W: tech.change1W,
                change1M: tech.change1M,
                dataQuality,
                source
            },
            indicators: {
                rsi: tech.rsi,
                macdLine: tech.macdLine,
                macdHistogram: tech.macdHistogram,
                ema20: tech.ema20,
                ema50: tech.ema50,
                ema200: tech.ema200,
                sma20: tech.sma20,
                sma50: tech.sma50,
                sma200: tech.sma200,
                atr: tech.atr,
                adx: tech.adx,
                bollingerPosition: tech.bollingerPosition,
                stochasticK: tech.stochasticK
            },
            regime,
            dataTimestamp: (quote && quote.timestamp) || (candles.length ? candles[candles.length - 1].timestamp : null),
            dataProvenance: {
                source,
                quality: dataQuality,
                bars: candles.length,
                interval: '1D'
            },
            unavailable,
            warnings
        };
    }
}

module.exports = AIContextBuilder;
