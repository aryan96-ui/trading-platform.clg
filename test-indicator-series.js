/**
 * Focused tests for the chart indicator-series adapter.
 *
 * The contract the chart depends on:
 *  - a series point is { time, value } with a finite value, in candle order
 *  - bars a series has no value for are dropped, never emitted as 0
 *  - the last value of a series equals the scalar the screener/AI use
 *  - empty or short input degrades to nothing, never to a fabricated number
 */
const assert = require('assert');
const IndicatorEngine = require('./src/engine/indicator-engine');
const { build } = require('./src/engine/indicator-series');

let pass = 0, fail = 0;
const t = (name, fn) => {
    try { fn(); console.log('  ✓ ' + name); pass++; }
    catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
};

/** Deterministic ramp + wave so RSI has both gains and losses. */
function candles(n = 260) {
    const out = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
        price += Math.sin(i / 7) * 1.6 + 0.35;
        const close = Math.max(1, price);
        out.push({
            timestamp: new Date(Date.UTC(2025, 0, 1 + i)).toISOString(),
            open: +(close - 0.4).toFixed(2),
            high: +(close + 0.9).toFixed(2),
            low: +(close - 1.1).toFixed(2),
            close: +close.toFixed(2),
            volume: 1000 + (i % 13) * 37,
            source: 'demo'
        });
    }
    return out;
}

const bars = candles();
const times = bars.map(c => Math.floor(new Date(c.timestamp).getTime() / 1000));
const closes = bars.map(c => Number(c.close));

console.log('\n=== Series shape ===');
t('ema20 returns points with finite values', () => {
    const s = build(bars, { overlays: ['ema20'] }).overlays.ema20;
    assert.ok(s.length > 200, 'expected a long series, got ' + s.length);
    assert.ok(s.every(p => typeof p.time === 'number' && Number.isFinite(p.value)));
});
t('series times are candle times, in order', () => {
    const s = build(bars, { overlays: ['ema20'] }).overlays.ema20;
    assert.strictEqual(s[0].time, times[19], 'first EMA20 bar is the seed bar');
    assert.deepStrictEqual(s.map(p => p.time), times.slice(19));
});
t('bb returns three aligned bands', () => {
    const o = build(bars, { overlays: ['bb'] }).overlays;
    assert.strictEqual(o.bbUpper.length, o.bbLower.length);
    assert.strictEqual(o.bbMiddle.length, o.bbUpper.length);
    assert.ok(o.bbUpper.every((p, i) => p.value >= o.bbMiddle[i].value && p.value >= o.bbLower[i].value));
});
t('unknown overlay names produce nothing', () => {
    assert.deepStrictEqual(build(bars, { overlays: ['rsi200'] }).overlays, {});
});

console.log('\n=== Parity with the engine (one owner of the math) ===');
t('last ema20 point equals IndicatorEngine.ema', () => {
    const s = build(bars, { overlays: ['ema20'] }).overlays.ema20;
    assert.strictEqual(s[s.length - 1].value, IndicatorEngine.ema(closes, 20));
});
t('last ema50 point equals IndicatorEngine.ema', () => {
    const s = build(bars, { overlays: ['ema50'] }).overlays.ema50;
    assert.strictEqual(s[s.length - 1].value, IndicatorEngine.ema(closes, 50));
});
t('last rsi pane point equals IndicatorEngine.rsi', () => {
    const s = build(bars, { sub: 'rsi' }).panes.rsi;
    assert.strictEqual(s[s.length - 1].value, IndicatorEngine.rsi(closes, 14));
});
t('bb middle equals the bollinger scalar', () => {
    const o = build(bars, { overlays: ['bb'] }).overlays;
    const scalar = IndicatorEngine.bollinger(closes, 20, 2);
    assert.strictEqual(o.bbMiddle[o.bbMiddle.length - 1].value, scalar.middle);
});
t('rsi pane stays inside 0-100', () => {
    build(bars, { sub: 'rsi' }).panes.rsi.forEach(p => assert.ok(p.value >= 0 && p.value <= 100, 'rsi out of range: ' + p.value));
});

console.log('\n=== MACD pane ===');
t('histogram equals macd - signal on every shared bar', () => {
    const pane = build(bars, { sub: 'macd' }).panes.macd;
    const rows = pane.filter(p => p.macd !== undefined && p.signal !== undefined && p.histogram !== undefined);
    assert.ok(rows.length > 100, 'expected many complete MACD bars');
    rows.forEach(p => assert.ok(Math.abs((p.macd - p.signal) - p.histogram) < 1e-9, 'histogram mismatch'));
});
t('incomplete bars are omitted, not zero-filled', () => {
    const pane = build(bars, { sub: 'macd' }).panes.macd;
    const first = pane[0];
    assert.ok(first.histogram === undefined || first.signal === undefined, 'early bar should not claim a signal');
});
t('macd pane matches the engine scalar at the last bar', () => {
    const pane = build(bars, { sub: 'macd' }).panes.macd;
    const scalar = IndicatorEngine.macd(closes);
    assert.ok(Math.abs(pane[pane.length - 1].macd - scalar.line) < 1e-9);
    assert.ok(Math.abs(pane[pane.length - 1].signal - scalar.signal) < 1e-9);
});

console.log('\n=== Degenerate input ===');
t('empty candles → no series, no crash', () => {
    const d = build([], { overlays: ['ema20', 'bb'], sub: 'rsi' });
    assert.strictEqual(d.bars, 0);
    assert.deepStrictEqual(d.overlays.ema20, []);
    assert.deepStrictEqual(d.panes.rsi, []);
});
t('too few candles → empty series (null, not zero)', () => {
    const d = build(bars.slice(0, 10), { overlays: ['ema20'] });
    assert.deepStrictEqual(d.overlays.ema20, []);
});
t('undefined input is handled', () => {
    const d = build(undefined, { overlays: ['ema20'] });
    assert.strictEqual(d.bars, 0);
    assert.strictEqual(d.source, 'unknown');
});
t('bars with a broken close are skipped', () => {
    const dirty = bars.slice(0, 60).map((c, i) => i === 30 ? { ...c, close: null } : c);
    const d = build(dirty, { overlays: ['ema20'] });
    assert.strictEqual(d.bars, 59);
    assert.strictEqual(d.overlays.ema20[d.overlays.ema20.length - 1].time, times[59]);
});

console.log('\n========================================');
console.log(`RESULTS: ${pass} passed, ${fail} failed`);
console.log('========================================\n');
process.exit(fail ? 1 : 0);
