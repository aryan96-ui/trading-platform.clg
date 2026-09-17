/**
 * One-off extractor: splits terminal.html into css/ + js/ modules.
 *
 * The monolith's sections are delimited by `// ==================== NAME ====================`
 * markers. This moves each section into its owning file verbatim — no rewrite —
 * so the split cannot introduce behaviour changes. Run once, then delete.
 *
 * Usage: node tools/split-terminal.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'terminal.html'), 'utf8');

// ------------------------------------------------------------
// 1. CSS
// ------------------------------------------------------------
const styleMatch = src.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) throw new Error('no <style> block found');
fs.mkdirSync(path.join(ROOT, 'css'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'css/terminal.css'), styleMatch[1].trim() + '\n');
console.log('css/terminal.css');

// ------------------------------------------------------------
// 2. JS sections
// ------------------------------------------------------------
const scriptMatch = src.match(/<script>\n([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('no <script> block found');
const js = scriptMatch[1];
const lines = js.split('\n');

const MARKER = /^\/\/ ==================== (.+?) ====================$/;
const sections = [];
lines.forEach((line, i) => {
    const m = line.match(MARKER);
    if (m) sections.push({ name: m[1], start: i });
});
sections.forEach((s, i) => { s.end = i + 1 < sections.length ? sections[i + 1].start : lines.length; });

// Preamble before the first marker (should be empty/whitespace)
const preamble = lines.slice(0, sections[0].start).join('\n').trim();
if (preamble) console.log('--- preamble (kept in shell) ---\n' + preamble);

// Section name → destination file
const MAP = {
    'STATE': 'js/core/state.js',
    'UTILITIES': 'js/core/api.js',
    'STATUS': 'js/core/api.js',
    'SEARCH': 'js/watchlist/watchlist.js',
    'WATCHLIST': 'js/watchlist/watchlist.js',
    'TICKER': 'js/watchlist/watchlist.js',
    'VIEW SWITCHING': 'js/app.js',
    'OVERVIEW': 'js/market-overview/overview.js',
    'SCREENER': 'js/views/screener.js',
    'HEATMAP': 'js/heatmap/heatmap.js',
    'RISK': 'js/views/risk.js',
    'SIGNALS (ranked + conflict)': 'js/signals/signals.js',
    'MARKET REGIME + STRATEGY MATRIX': 'js/views/regime.js',
    'BEHAVIOR + GUARDRAILS': 'js/views/behavior.js',
    'STRATEGY LAB (backtest)': 'js/views/strategies.js',
    'CLAIM VERIFICATION': 'js/views/claims.js',
    'TRADE REVIEWS (post-trade learning)': 'js/views/reviews.js',
    'AI COPILOT': 'js/ai-copilot/ai-copilot.js',
    'JOURNAL': 'js/views/journal.js',
    'TAPE': 'js/components/tape.js',
    'COMMAND PALETTE': 'js/components/palette.js',
    'SYMBOL SELECT': 'js/chart/chart.js',
    'CHART (TradingView-style candles)': 'js/chart/chart.js',
    'TOAST NOTIFICATIONS': 'js/core/ui.js',
    'KEYBOARD SHORTCUTS': 'js/core/ui.js',
    'THEME TOGGLE': 'js/core/ui.js',
    'STATUS BAR': 'js/core/ui.js',
    'RESIZABLE PANELS': 'js/core/ui.js',
    'INIT': 'js/app.js'
};

const buckets = new Map();
const unmapped = [];
for (const s of sections) {
    const dest = MAP[s.name];
    if (!dest) { unmapped.push(s.name); continue; }
    if (!buckets.has(dest)) buckets.set(dest, []);
    buckets.get(dest).push(s);
}
if (unmapped.length) throw new Error('unmapped sections: ' + unmapped.join(', '));

// Verify every destination file is written in load order
const ORDER = [
    'js/core/state.js',
    'js/core/api.js',
    'js/core/ui.js',
    'js/watchlist/watchlist.js',
    'js/components/tape.js',
    'js/components/palette.js',
    'js/chart/chart.js',
    'js/ai-copilot/ai-copilot.js',
    'js/market-overview/overview.js',
    'js/heatmap/heatmap.js',
    'js/signals/signals.js',
    'js/views/screener.js',
    'js/views/regime.js',
    'js/views/behavior.js',
    'js/views/risk.js',
    'js/views/strategies.js',
    'js/views/claims.js',
    'js/views/reviews.js',
    'js/views/journal.js',
    'js/app.js'
];
for (const dest of buckets.keys()) {
    if (!ORDER.includes(dest)) throw new Error('destination missing from ORDER: ' + dest);
}

for (const dest of ORDER) {
    const secs = buckets.get(dest) || [];
    const body = secs.map(s => {
        const slice = lines.slice(s.start, s.end).join('\n').replace(/\s+$/, '');
        return `// ==================== ${s.name} ====================\n${slice.split('\n').slice(1).join('\n')}`;
    }).join('\n\n');
    const abs = path.join(ROOT, dest);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `/**\n * ProTrader — ${dest.replace(/^js\//, '').replace('.js', '')}\n *\n * Split from the terminal monolith; behaviour unchanged.\n */\n` + body.trim() + '\n');
    console.log(dest + '  (' + secs.map(s => s.name).join(', ') + ')');
}

console.log('\nLoad order for the shell:');
ORDER.forEach(f => console.log(`  <script src="${f}"></script>`));
