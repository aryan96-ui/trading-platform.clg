/**
 * Indicator Engine
 *
 * Computes technical indicators from real OHLCV candles.
 *
 * Every value here is derived from observed market data — nothing is
 * randomised or invented. When a series is too short for a period, the
 * indicator returns null and callers must treat it as DATA UNAVAILABLE
 * rather than substituting a synthetic value.
 *
 * Shared by: Screener Engine, AI Context Builder, Market Regime Engine.
 */
class IndicatorEngine {
    /**
     * Build the full technical snapshot used by the screener and AI context.
     *
     * @param {Array} candles - OHLCV candles, oldest → newest
     * @param {Object} [quote] - Optional live quote (price/volume) to prefer
     * @returns {Object} snapshot with nulls where data is insufficient
     */
    static snapshot(candles = [], quote = null) {
        const bars = Array.isArray(candles) ? [...candles] : [];
        bars.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const empty = {
            price: null, rsi: null, macdLine: null, macdHistogram: null, macdSignal: null,
            ema20: null, ema50: null, ema200: null, sma20: null, sma50: null, sma200: null,
            atr: null, atrPercent: null, bollingerPosition: null, stochasticK: null, adx: null,
            volume: null, relativeVolume: null, avgVolume: null,
            change1D: null, change1W: null, change1M: null,
            proximity52wHigh: null, proximity52wLow: null,
            marketCap: null, dividendYield: null, peRatio: null,
            bars: bars.length, dataSource: bars.length ? (bars[bars.length - 1].source || 'unknown') : 'none'
        };

        if (bars.length === 0) return empty;

        const closes = bars.map(c => Number(c.close)).filter(v => Number.isFinite(v));
        const volumes = bars.map(c => Number(c.volume)).filter(v => Number.isFinite(v));
        if (closes.length === 0) return empty;

        const lastCandle = bars[bars.length - 1];
        const price = quote && Number.isFinite(Number(quote.price))
            ? Number(quote.price)
            : Number(lastCandle.close);
        const volume = quote && Number.isFinite(Number(quote.volume))
            ? Number(quote.volume)
            : Number(lastCandle.volume);

        const macd = IndicatorEngine.macd(closes);
        const boll = IndicatorEngine.bollinger(closes, 20, 2);
        const ema20 = IndicatorEngine.ema(closes, 20);
        const ema50 = IndicatorEngine.ema(closes, 50);
        const ema200 = IndicatorEngine.ema(closes, 200);
        const atr = IndicatorEngine.atr(bars, 14);

        // 52-week window (252 trading days) when history allows, else all bars
        const window = Math.min(252, bars.length);
        const recent = bars.slice(-window);
        const high52 = Math.max(...recent.map(c => Number(c.high)));
        const low52 = Math.min(...recent.map(c => Number(c.low)));

        const avgVolume = volumes.length >= 20
            ? IndicatorEngine.sma(volumes, 20)
            : null;

        return {
            ...empty,
            price,
            rsi: IndicatorEngine.rsi(closes, 14),
            macdLine: macd ? macd.line : null,
            macdSignal: macd ? macd.signal : null,
            macdHistogram: macd ? macd.histogram : null,
            ema20, ema50, ema200,
            sma20: IndicatorEngine.sma(closes, 20),
            sma50: IndicatorEngine.sma(closes, 50),
            sma200: IndicatorEngine.sma(closes, 200),
            atr,
            atrPercent: atr !== null && price ? (atr / price) * 100 : null,
            bollingerPosition: boll ? boll.position : null,
            stochasticK: IndicatorEngine.stochasticK(bars, 14, 3),
            adx: IndicatorEngine.adx(bars, 14),
            volume: Number.isFinite(volume) ? volume : null,
            relativeVolume: avgVolume && Number.isFinite(volume) ? volume / avgVolume : null,
            avgVolume,
            change1D: IndicatorEngine.changePercent(closes, 1),
            change1W: IndicatorEngine.changePercent(closes, 5),
            change1M: IndicatorEngine.changePercent(closes, 21),
            proximity52wHigh: Number.isFinite(high52) && price ? ((high52 - price) / high52) * 100 : null,
            proximity52wLow: Number.isFinite(low52) && price ? ((price - low52) / low52) * 100 : null,
            // No fundamental dataset is wired in — reported as unavailable,
            // never estimated.
            marketCap: null,
            dividendYield: null,
            peRatio: null,
            bars: bars.length,
            dataSource: lastCandle.source || 'unknown'
        };
    }

    /** Simple moving average of the last `period` values (null if too short). */
    static sma(values, period) {
        const series = IndicatorEngine.smaSeries(values, period);
        return series[series.length - 1] ?? null;
    }

    /** SMA at every bar that has a full window — the chart's series form. */
    static smaSeries(values, period) {
        const out = Array.isArray(values) ? new Array(values.length).fill(null) : [];
        if (!Array.isArray(values) || values.length < period || period <= 0) return out;
        for (let i = period - 1; i < values.length; i++) {
            out[i] = values.slice(i - period + 1, i + 1).reduce((a, v) => a + v, 0) / period;
        }
        return out;
    }

    /** Exponential moving average (seeded with an SMA, Wilder-style start). */
    static ema(values, period) {
        const series = IndicatorEngine.emaSeries(values, period);
        return series[series.length - 1] ?? null;
    }

    /** EMA at every bar from the seed onward — the chart's overlay form. */
    static emaSeries(values, period) {
        const out = Array.isArray(values) ? new Array(values.length).fill(null) : [];
        if (!Array.isArray(values) || values.length < period || period <= 0) return out;
        const k = 2 / (period + 1);
        let ema = values.slice(0, period).reduce((a, v) => a + v, 0) / period;
        out[period - 1] = ema;
        for (let i = period; i < values.length; i++) {
            ema = values[i] * k + ema * (1 - k);
            out[i] = ema;
        }
        return out;
    }

    /** Wilder's RSI over `period` (default 14). */
    static rsi(closes, period = 14) {
        const series = IndicatorEngine.rsiSeries(closes, period);
        return series[series.length - 1] ?? null;
    }

    /** RSI at every bar — same Wilder recursion, kept in one place. */
    static rsiSeries(closes, period = 14) {
        const out = Array.isArray(closes) ? new Array(closes.length).fill(null) : [];
        if (!Array.isArray(closes) || closes.length < period + 1) return out;

        let gain = 0, loss = 0;
        for (let i = 1; i <= period; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff >= 0) gain += diff; else loss -= diff;
        }
        let avgGain = gain / period;
        let avgLoss = loss / period;
        out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

        for (let i = period + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            const g = diff > 0 ? diff : 0;
            const l = diff < 0 ? -diff : 0;
            avgGain = (avgGain * (period - 1) + g) / period;
            avgLoss = (avgLoss * (period - 1) + l) / period;
            out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        }
        return out;
    }

    /** Wilder's ATR from candles (needs high/low/close). */
    static atr(candles, period = 14) {
        if (!Array.isArray(candles) || candles.length < period + 1) return null;

        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = Number(candles[i].high);
            const low = Number(candles[i].low);
            const prevClose = Number(candles[i - 1].close);
            if (![high, low, prevClose].every(Number.isFinite)) return null;
            trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }
        if (trs.length < period) return null;

        let atr = trs.slice(0, period).reduce((a, v) => a + v, 0) / period;
        for (let i = period; i < trs.length; i++) {
            atr = (atr * (period - 1) + trs[i]) / period;
        }
        return atr;
    }

    /** MACD line, signal line and histogram. */
    static macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
        const series = IndicatorEngine.macdSeries(closes, fast, slow, signalPeriod);
        const line = series.macd[series.macd.length - 1];
        const signal = series.signal[series.signal.length - 1];
        if (line === null || line === undefined || signal === null || signal === undefined) return null;
        return { line, signal, histogram: line - signal };
    }

    /** MACD line, signal and histogram at every bar — the sub-pane's series form. */
    static macdSeries(closes, fast = 12, slow = 26, signalPeriod = 9) {
        const empty = { macd: [], signal: [], histogram: [] };
        if (!Array.isArray(closes) || closes.length < slow + signalPeriod) return empty;

        const fastSeries = IndicatorEngine.emaSeries(closes, fast);
        const slowSeries = IndicatorEngine.emaSeries(closes, slow);
        const macd = closes.map((_, i) =>
            fastSeries[i] === null || slowSeries[i] === null ? null : fastSeries[i] - slowSeries[i]);

        // Signal EMA runs over the contiguous MACD values only, then maps back.
        const firstIndex = macd.findIndex(v => v !== null);
        const compact = macd.filter(v => v !== null);
        const signalCompact = IndicatorEngine.emaSeries(compact, signalPeriod);

        const signal = new Array(closes.length).fill(null);
        const histogram = new Array(closes.length).fill(null);
        for (let k = 0; k < compact.length; k++) {
            const i = firstIndex + k;
            signal[i] = signalCompact[k];
            if (signalCompact[k] !== null) histogram[i] = macd[i] - signalCompact[k];
        }

        return { macd, signal, histogram };
    }

    /** Bollinger bands plus where price sits inside them (0-100). */
    static bollinger(closes, period = 20, mult = 2) {
        const bands = IndicatorEngine.bollingerSeries(closes, period, mult);
        const last = bands.middle.length - 1;
        const mean = bands.middle[last];
        if (mean === null || mean === undefined) return null;
        const upper = bands.upper[last];
        const lower = bands.lower[last];
        const price = closes[closes.length - 1];
        const position = upper === lower ? 50 : ((price - lower) / (upper - lower)) * 100;
        return { upper, middle: mean, lower, position };
    }

    /** Bollinger bands at every bar — the chart's overlay form. */
    static bollingerSeries(closes, period = 20, mult = 2) {
        const length = Array.isArray(closes) ? closes.length : 0;
        const out = { upper: new Array(length).fill(null), middle: new Array(length).fill(null), lower: new Array(length).fill(null) };
        if (!Array.isArray(closes) || closes.length < period) return out;

        for (let i = period - 1; i < closes.length; i++) {
            const slice = closes.slice(i - period + 1, i + 1);
            const mean = slice.reduce((a, v) => a + v, 0) / period;
            const variance = slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period;
            const sd = Math.sqrt(variance);
            out.middle[i] = mean;
            out.upper[i] = mean + mult * sd;
            out.lower[i] = mean - mult * sd;
        }
        return out;
    }

    /** Smoothed Stochastic %K. */
    static stochasticK(candles, period = 14, smooth = 3) {
        if (!Array.isArray(candles) || candles.length < period) return null;
        const ks = [];
        for (let i = period - 1; i < candles.length; i++) {
            const window = candles.slice(i - period + 1, i + 1);
            const high = Math.max(...window.map(c => Number(c.high)));
            const low = Math.min(...window.map(c => Number(c.low)));
            const close = Number(candles[i].close);
            if (![high, low, close].every(Number.isFinite)) return null;
            ks.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
        }
        return IndicatorEngine.sma(ks, smooth);
    }

    /** Wilder's ADX (trend strength, direction-agnostic). */
    static adx(candles, period = 14) {
        if (!Array.isArray(candles) || candles.length < period * 2) return null;

        const plusDM = [], minusDM = [], trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = Number(candles[i].high);
            const low = Number(candles[i].low);
            const prevHigh = Number(candles[i - 1].high);
            const prevLow = Number(candles[i - 1].low);
            const prevClose = Number(candles[i - 1].close);
            if (![high, low, prevHigh, prevLow, prevClose].every(Number.isFinite)) return null;

            const upMove = high - prevHigh;
            const downMove = prevLow - low;
            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
            trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }

        // Wilder smoothing of TR / +DM / -DM
        let trS = trs.slice(0, period).reduce((a, v) => a + v, 0);
        let plusS = plusDM.slice(0, period).reduce((a, v) => a + v, 0);
        let minusS = minusDM.slice(0, period).reduce((a, v) => a + v, 0);

        const dxs = [];
        for (let i = period; i < trs.length; i++) {
            trS = trS - trS / period + trs[i];
            plusS = plusS - plusS / period + plusDM[i];
            minusS = minusS - minusS / period + minusDM[i];

            if (trS === 0) continue;
            const plusDI = (plusS / trS) * 100;
            const minusDI = (minusS / trS) * 100;
            const sum = plusDI + minusDI;
            if (sum === 0) continue;
            dxs.push((Math.abs(plusDI - minusDI) / sum) * 100);
        }

        if (dxs.length < period) return null;
        let adx = dxs.slice(0, period).reduce((a, v) => a + v, 0) / period;
        for (let i = period; i < dxs.length; i++) {
            adx = (adx * (period - 1) + dxs[i]) / period;
        }
        return adx;
    }

    /** Percentage change over the last `bars` bars. */
    static changePercent(closes, bars) {
        if (!Array.isArray(closes) || closes.length < bars + 1) return null;
        const now = closes[closes.length - 1];
        const then = closes[closes.length - 1 - bars];
        if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return null;
        return ((now - then) / then) * 100;
    }
}

module.exports = IndicatorEngine;
