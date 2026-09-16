/**
 * Indicator Engine verification
 *
 * Checks the engine's maths against independently written implementations
 * and against invariants that must hold for any correct implementation.
 * Run: node test-indicators.js
 */
const IndicatorEngine = require('./src/engine/indicator-engine');

let passed = 0, failed = 0;
function check(name, actual, expected, tolerance = 1e-6) {
    const ok = typeof expected === 'number' && typeof actual === 'number'
        ? Math.abs(actual - expected) <= tolerance
        : actual === expected;
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}\n      expected ${expected}\n      actual   ${actual}`); }
}

// ---------- independent reference implementations ----------
function refSMA(v, n) {
    if (v.length < n) return null;
    let s = 0; for (let i = v.length - n; i < v.length; i++) s += v[i];
    return s / n;
}
function refRSI(c, n = 14) {
    if (c.length < n + 1) return null;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; d > 0 ? g += d : l -= d; }
    let ag = g / n, al = l / n;
    for (let i = n + 1; i < c.length; i++) {
        const d = c[i] - c[i - 1];
        ag = (ag * (n - 1) + (d > 0 ? d : 0)) / n;
        al = (al * (n - 1) + (d < 0 ? -d : 0)) / n;
    }
    if (al === 0) return 100;
    return 100 - 100 / (1 + ag / al);
}
function refEMA(v, n) {
    if (v.length < n) return null;
    const k = 2 / (n + 1);
    let e = v.slice(0, n).reduce((a, b) => a + b, 0) / n;
    for (let i = n; i < v.length; i++) e = v[i] * k + e * (1 - k);
    return e;
}

// ---------- fixtures ----------
const flat = new Array(60).fill(100);
const rising = Array.from({ length: 60 }, (_, i) => 100 + i);
const falling = Array.from({ length: 60 }, (_, i) => 200 - i);
// Deterministic pseudo-random walk (no Math.random)
const walk = (() => {
    const out = [100]; let s = 7;
    for (let i = 1; i < 120; i++) { s = (s * 1103515245 + 12345) % 2147483648; out.push(out[i - 1] + ((s / 2147483648) - 0.48) * 3); }
    return out;
})();

console.log('\n=== SMA / EMA ===');
check('SMA flat', IndicatorEngine.sma(flat, 20), 100);
check('SMA walk(20) matches reference', IndicatorEngine.sma(walk, 20), refSMA(walk, 20), 1e-9);
check('EMA walk(20) matches reference', IndicatorEngine.ema(walk, 20), refEMA(walk, 20), 1e-9);
check('EMA returns null when too short', IndicatorEngine.ema([1, 2, 3], 20), null);

console.log('\n=== RSI ===');
check('RSI rising → 100', IndicatorEngine.rsi(rising, 14), 100);
check('RSI falling → 0', IndicatorEngine.rsi(falling, 14), 0);
check('RSI flat → 100 (no losses)', IndicatorEngine.rsi(flat, 14), 100);
check('RSI walk matches reference', IndicatorEngine.rsi(walk, 14), refRSI(walk, 14), 1e-9);
check('RSI bounded 0..100', IndicatorEngine.rsi(walk, 14) >= 0 && IndicatorEngine.rsi(walk, 14) <= 100, true);
check('RSI null when insufficient', IndicatorEngine.rsi([1, 2, 3], 14), null);

console.log('\n=== ATR ===');
const candles = walk.map((c, i) => ({
    timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    open: c - 0.5, high: c + 1.5, low: c - 1.5, close: c, volume: 1000 + i
}));
// Independent Wilder ATR
const refATR = (() => {
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    let a = trs.slice(0, 14).reduce((x, y) => x + y, 0) / 14;
    for (let i = 14; i < trs.length; i++) a = (a * 13 + trs[i]) / 14;
    return a;
})();
check('ATR(14) matches reference', IndicatorEngine.atr(candles, 14), refATR, 1e-9);
check('ATR always positive', IndicatorEngine.atr(candles, 14) > 0, true);
check('ATR null when insufficient', IndicatorEngine.atr(candles.slice(0, 5), 14), null);

console.log('\n=== MACD ===');
const macd = IndicatorEngine.macd(walk);
check('MACD histogram = line − signal', macd.histogram, macd.line - macd.signal, 1e-9);
check('MACD line = EMA12 − EMA26', macd.line, IndicatorEngine.ema(walk, 12) - IndicatorEngine.ema(walk, 26), 1e-9);
check('MACD null when too short', IndicatorEngine.macd([1, 2, 3]), null);

console.log('\n=== Bollinger ===');
const boll = IndicatorEngine.bollinger(walk, 20, 2);
const w20 = walk.slice(-20);
const mean20 = w20.reduce((a, b) => a + b, 0) / 20;
const sd = Math.sqrt(w20.reduce((a, v) => a + (v - mean20) ** 2, 0) / 20);
check('Bollinger middle = SMA20', boll.middle, refSMA(walk, 20), 1e-9);
check('Bollinger upper', boll.upper, mean20 + 2 * sd, 1e-9);
check('Bollinger lower', boll.lower, mean20 - 2 * sd, 1e-9);
check('Bollinger position = (p−lower)/(upper−lower)*100',
    boll.position, ((walk[walk.length - 1] - boll.lower) / (boll.upper - boll.lower)) * 100, 1e-6);

console.log('\n=== ADX / Stochastic ===');
const adx = IndicatorEngine.adx(candles, 14);
check('ADX bounded 0..100', adx !== null && adx >= 0 && adx <= 100, true);
check('ADX (clean trend) is high', IndicatorEngine.adx(
    rising.map((c, i) => ({
        timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        open: c, high: c + 1, low: c - 1, close: c, volume: 100
    })), 14) > 50, true);
const k = IndicatorEngine.stochasticK(candles, 14, 3);
check('Stochastic %K bounded 0..100', k !== null && k >= 0 && k <= 100, true);

console.log('\n=== Snapshot ===');
const snap = IndicatorEngine.snapshot(candles);
check('snapshot price = last close', snap.price, candles[candles.length - 1].close, 1e-9);
check('snapshot rsi present', typeof snap.rsi === 'number', true);
check('snapshot bars counted', snap.bars, candles.length);
check('snapshot relativeVolume = volume / avgVolume', snap.relativeVolume,
    candles[candles.length - 1].volume / IndicatorEngine.sma(candles.map(c => c.volume), 20), 1e-9);
check('snapshot change1D = % change vs prior close',
    snap.change1D, ((walk[walk.length - 1] - walk[walk.length - 2]) / walk[walk.length - 2]) * 100, 1e-9);
check('snapshot 52w proximity uses observed high (>= 0)', snap.proximity52wHigh >= 0, true);
check('fundamentals are null, not invented', snap.marketCap === null && snap.peRatio === null && snap.dividendYield === null, true);

console.log('\n=== Honest empties (no fabricated values) ===');
const emptySnap = IndicatorEngine.snapshot([]);
check('empty candles → price null', emptySnap.price, null);
check('empty candles → rsi null', emptySnap.rsi, null);
check('empty candles → bars 0', emptySnap.bars, 0);
check('empty candles → dataSource none', emptySnap.dataSource, 'none');
const shortSnap = IndicatorEngine.snapshot(candles.slice(0, 10));
check('10 bars → ema200 null', shortSnap.ema200, null);
check('10 bars → marketCap null', shortSnap.marketCap, null);
check('short series still gives price', typeof shortSnap.price, 'number');
check('null quote ignored (no crash)', IndicatorEngine.snapshot(candles, null).price, candles[candles.length - 1].close, 1e-9);

console.log('\n=== Unsorted input is normalised ===');
const shuffled = [...candles].reverse();
check('reversed candles produce same RSI', IndicatorEngine.snapshot(shuffled).rsi, snap.rsi, 1e-9);

console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================');
process.exit(failed === 0 ? 0 : 1);
