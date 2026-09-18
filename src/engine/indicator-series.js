/**
 * Indicator series — chart adapter
 *
 * The chart needs indicator values at every bar, not just the latest one. This
 * module turns candles into the `[{ time, value }]` shape the charting library
 * wants, using the IndicatorEngine's series methods so an overlay drawn on the
 * chart is the same arithmetic as the screener filter and the AI's evidence.
 */
const IndicatorEngine = require('./indicator-engine');

/** Drop bars a series has no value for, so the chart leaves a gap not a zero. */
function points(times, values) {
    const out = [];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined || !Number.isFinite(v)) continue;
        out.push({ time: times[i], value: v });
    }
    return out;
}

/**
 * @param {Array} candles - OHLCV bars, oldest first
 * @param {object} opts
 * @param {string[]} opts.overlays - subset of ['ema20','ema50','bb']
 * @param {string|null} opts.sub - 'rsi' | 'macd' | null
 */
/** Number(v) turns null into 0, which would plot a fabricated zero — be strict. */
function num(v) {
    if (v === null || v === undefined || v === '') return NaN;
    return Number(v);
}

function build(candles = [], { overlays = [], sub = null } = {}) {
    const bars = (Array.isArray(candles) ? candles : [])
        .map(c => ({ ...c, close: num(c.close) }))
        .filter(c => Number.isFinite(c.close));
    const times = bars.map(c => Math.floor(new Date(c.timestamp).getTime() / 1000));
    const closes = bars.map(c => c.close);

    const series = {};
    if (overlays.includes('ema20')) series.ema20 = points(times, IndicatorEngine.emaSeries(closes, 20));
    if (overlays.includes('ema50')) series.ema50 = points(times, IndicatorEngine.emaSeries(closes, 50));
    if (overlays.includes('bb')) {
        const bb = IndicatorEngine.bollingerSeries(closes, 20, 2);
        series.bbUpper = points(times, bb.upper);
        series.bbMiddle = points(times, bb.middle);
        series.bbLower = points(times, bb.lower);
    }

    const panes = {};
    if (sub === 'rsi') {
        panes.rsi = points(times, IndicatorEngine.rsiSeries(closes, 14));
    }
    if (sub === 'macd') {
        const m = IndicatorEngine.macdSeries(closes);
        panes.macd = times
            .map((t, i) => ({
                time: t,
                // undefined (not null) so JSON drops the key and the chart skips the bar
                macd: m.macd[i] ?? undefined,
                signal: m.signal[i] ?? undefined,
                histogram: m.histogram[i] ?? undefined
            }))
            .filter(p => p.macd !== undefined || p.histogram !== undefined);
    }

    return {
        overlays: series,
        panes,
        bars: bars.length,
        source: bars[0]?.source || 'unknown'
    };
}

module.exports = { build, points };
