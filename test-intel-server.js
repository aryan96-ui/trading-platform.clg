/**
 * End-to-end API test for the intelligence layer (Modules 1-27).
 * Spawns server-v2.js, asserts each endpoint behaves correctly.
 */
const { spawn } = require('child_process');
const http = require('http');

const PORT = 4317;
let passed = 0, failed = 0;
const failures = [];

function assert(cond, name) {
    if (cond) { passed++; }
    else { failed++; failures.push(name); console.log('  FAIL:', name); }
}

function req(method, path, body) {
    return new Promise((resolve) => {
        const data = body ? JSON.stringify(body) : null;
        const r = http.request({
            host: '127.0.0.1', port: PORT, path, method,
            headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
        }, (res) => {
            let out = '';
            res.on('data', c => out += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(out) }); } catch (e) { resolve({ status: res.statusCode, json: null }); } });
        });
        r.on('error', () => resolve({ status: 0, json: null }));
        if (data) r.write(data);
        r.end();
    });
}

async function waitUp() {
    for (let i = 0; i < 40; i++) {
        const r = await req('GET', '/api/market/signals');
        if (r.status === 200) return true;
        await new Promise(r2 => setTimeout(r2, 250));
    }
    return false;
}

(async () => {
    const child = spawn(process.execPath, ['server-v2.js'], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', d => console.log('[server]', d.toString().trim().slice(0, 200)));

    if (!(await waitUp())) {
        console.log('Server did not start');
        process.exit(1);
    }
    console.log('Server up. Running API assertions...\n');

    // ---- Market regime: demo mode must be honest ----
    let r = await req('GET', '/api/market/regime/RELIANCE');
    assert(r.status === 200 && r.json.success, 'GET /api/market/regime/:symbol');
    assert(r.json.data.regime === 'UNKNOWN', 'Regime UNKNOWN in demo (no fake classification)');

    r = await req('POST', '/api/market/regime/assess', { prices: Array.from({length: 80}, (_, i) => 100 + Math.sin(i/10) * 10 + i * 0.3), symbol: 'NIFTY' });
    assert(r.status === 200 && r.json.data.regime, 'POST /api/market/regime/assess returns regime');
    const regEv = r.json.data.evidence;
    assert(regEv && (Array.isArray(regEv) ? regEv.length > 0 : Object.keys(regEv).length > 0), 'Regime has evidence');
    assert(typeof r.json.data.confidence === 'number', 'Regime has confidence');

    // ---- Signals ----
    r = await req('POST', '/api/signals/ranked', {
        signals: [
            { symbol: 'RELIANCE', type: 'breakout', direction: 'bullish', price: 2500, volumeRatio: 2.4, rsi: 58 },
            { symbol: 'TCS', type: 'rsi', direction: 'bearish', price: 3280, volumeRatio: 0.6, rsi: 68 },
            { symbol: 'INFY', type: 'macd', direction: 'bullish', price: 1520, volumeRatio: 1.2, rsi: 45 }
        ]
    });
    assert(r.status === 200 && r.json.data.ranked.length === 3, 'Signals ranked');
    assert(r.json.data.alerts.tiers, 'Smart alerts built');
    const ranked = r.json.data.ranked;
    assert(ranked.every(s => typeof s.qualityScore === 'number' && s.qualityScore > 0), 'Quality score present');
    assert(ranked[0].qualityScore >= ranked[1].qualityScore && ranked[1].qualityScore >= ranked[2].qualityScore, 'Sorted by quality');

    r = await req('GET', '/api/market/signals');
    assert(r.status === 200 && Array.isArray(r.json.data), 'GET /api/market/signals');

    r = await req('POST', '/api/signals/conflict', { factors: { price: 'bullish', volume: 'bullish', rsi: 'neutral', sector: 'bearish', market: 'bearish' } });
    assert(r.status === 200 && r.json.data.conflict, 'Conflict detection');

    // ---- Portfolio risk / heat / sizing ----
    r = await req('GET', '/api/portfolio/risk');
    assert(r.status === 200 && r.json.data, 'GET /api/portfolio/risk');

    r = await req('GET', '/api/portfolio/heat');
    assert(r.status === 200 && r.json.data.heatLevel !== undefined, 'GET /api/portfolio/heat');
    assert(typeof r.json.data.totalExposure === 'number', 'Heat has totalExposure');

    r = await req('POST', '/api/portfolio/position-size', {
        accountValue: 100000, entryPrice: 2500, stopLoss: 2425,
        volatility: 0.03, regimeAdjustment: -20, concentrationAdjustment: -10
    });
    assert(r.status === 200 && r.json.data.suggestedUnits > 0, 'Position sizing');
    assert(r.json.data.calculation && r.json.data.calculation.length > 0, 'Sizing shows calculation steps');
    assert(r.json.data.adjustments.length === 2, 'Sizing applies regime + concentration adjustments');
    assert(r.json.data.suggestedUnits < r.json.data.baseUnits, 'Adjustments reduce position size');

    // ---- Pre-trade check ----
    r = await req('POST', '/api/trades/pre-check', {
        trade: { symbol: 'RELIANCE', direction: 'long', quantity: 100, entryPrice: 2500, stopLoss: 2450 },
        portfolio: { holdings: [{ symbol: 'TCS', quantity: 10, avgPrice: 3000, currentPrice: 3200, sector: 'IT' }], accountValue: 100000 }
    });
    assert(r.status === 200 && r.json.data.riskLevel, 'Pre-trade check');

    // ---- Guardrails ----
    r = await req('GET', '/api/guardrails/settings?email=demo@college.com');
    assert(r.status === 200 && r.json.data.enabled === true, 'Guardrail settings default');

    // Force a check that must block: risk per trade above 2% on 1L account with a big position
    r = await req('POST', '/api/guardrails/check', {
        email: 'demo@college.com',
        trade: { symbol: 'RELIANCE', quantity: 500, entryPrice: 2500, stopLoss: 2400 },
        context: { accountValue: 100000, recentTrades: [] }
    });
    assert(r.status === 200, 'Guardrail check runs');
    const gr = r.json.data;
    assert(Array.isArray(gr.blocks), 'Guardrail blocks array');
    assert(gr.blocks.some(b => b.type === 'position_size') || gr.blocks.some(b => b.type === 'risk_per_trade'), 'Big position blocked');

    r = await req('POST', '/api/guardrails/confirm', { email: 'demo@college.com', trade: { symbol: 'RELIANCE', quantity: 500, entryPrice: 2500, stopLoss: 2400 }, blockIds: ['position_size'], reason: 'Strategy Setup' });
    assert(r.status === 200 && r.json.data.allowed === true, 'Override logged with reason');

    // ---- Trader behavior + profile (seeded demo trades) ----
    r = await req('GET', '/api/trader/behavior?email=demo@college.com');
    assert(r.status === 200, 'GET /api/trader/behavior');
    const behavior = r.json.data;
    assert(behavior.tradeCount > 0, `Behavior analyzed ${behavior.tradeCount} seeded trades`);
    assert(Array.isArray(behavior.behaviors), 'Behavior pattern list present');

    r = await req('GET', '/api/trader/profile?email=demo@college.com');
    assert(r.status === 200 && r.json.data.tradeCount > 0, 'Trader profile built from seed');
    assert(r.json.data.strategies && r.json.data.strategies.length > 0, 'Profile has strategy breakdown');

    // ---- Journal + review ----
    r = await req('GET', '/api/v2/journal/demo@college.com');
    assert(r.status === 200 && r.json.data.length > 0, `Journal has ${r.json.data.length} seeded trades`);
    const trades = r.json.data;
    const closed = trades.find(t => t.exitPrice !== undefined);
    assert(closed && closed.review, 'Seeded trade has generated review');

    r = await req('GET', '/api/trades/' + encodeURIComponent(closed.id) + '/review');
    assert(r.status === 200 && r.json.data.review, 'GET /api/trades/:id/review');
    assert(r.json.data.review.classification, 'Review has GOOD/BAD TRADE classification');

    // ---- Strategy matrix (from seeded trades w/ regime) ----
    r = await req('GET', '/api/strategies/matrix?email=demo@college.com');
    assert(r.status === 200, 'Strategy × regime matrix');
    const matrix = r.json.data;
    assert(matrix && (matrix.regimes || matrix.strategies), 'Matrix has content');

    r = await req('POST', '/api/strategies/matrix/assess', { strategy: 'momentum_breakout', currentRegime: 'RANGE_BOUND', email: 'demo@college.com' });
    assert(r.status === 200, 'Matrix compatibility assessment');
    const compat = r.json.data;
    assert(['HIGH', 'MODERATE', 'LOW', 'UNKNOWN'].includes(compat.compatibility), 'Compatibility verdict valid');
    assert(compat.message, 'Compatibility has message');

    // ---- Backtest ----
    const candles = [];
    let bp = 100, dir = 1;
    for (let i = 0; i < 260; i++) {
        if (i > 0 && i % 25 === 0) dir = -dir;
        bp *= 1 + dir * 0.012;
        candles.push({ timestamp: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(), open: bp, high: bp * 1.01, low: bp * 0.99, close: bp });
    }
    r = await req('POST', '/api/strategies/backtest', { candles, strategy: 'sma_crossover', params: { fast: 10, slow: 30 }, initialCapital: 100000 });
    assert(r.status === 200 && r.json.data.success, 'Backtest runs');
    assert(r.json.data.segments.training && r.json.data.segments.outOfSample, 'Train/OOS split');

    r = await req('POST', '/api/strategies/sensitivity', { candles, strategy: 'sma_crossover', paramName: 'fast', paramValues: [8, 10, 12] });
    assert(r.status === 200 && r.json.data.results.length === 3, 'Sensitivity testing');

    r = await req('POST', '/api/strategies/walk-forward', { candles, strategy: 'sma_crossover', params: { fast: 10, slow: 30 }, windowSize: 120, stepSize: 40 });
    assert(r.status === 200 && r.json.data.success === true, 'Walk-forward runs');
    assert(r.json.data.windows.length >= 2, 'Walk-forward windows');

    // ---- Claims ----
    r = await req('POST', '/api/claims/verify', {
        claimText: 'RELIANCE is experiencing unusual volume and breaking out',
        symbol: 'RELIANCE',
        data: { volume: 2400000, avgVolume: 1000000, price: 2500, high52w: 2600, ema50: 2400, rsi: 58 }
    });
    assert(r.status === 200 && r.json.data.claims.length >= 2, 'Claim verification extracts claims');
    assert(['SUPPORTED', 'PARTIALLY SUPPORTED', 'NOT SUPPORTED', 'INSUFFICIENT DATA'].includes(r.json.data.claims[0].verdict), 'Verdict valid');

    // ---- Execution ----
    r = await req('GET', '/api/execution/' + encodeURIComponent(closed.id));
    assert(r.status === 200, 'Execution quality analytics');
    const exec = r.json.data;
    assert(exec.entrySlippage !== undefined && exec.totalEstimatedCost !== undefined, 'Execution has slippage + cost');
    assert(exec.simulated === true && exec.disclaimer, 'Execution labeled simulated');

    // ---- AI analyze ----
    r = await req('POST', '/api/ai/analyze-trade', {
        context: { symbol: 'RELIANCE', marketData: { price: 2500 }, indicators: { rsi: 58, adx: 31 } }
    });
    assert(r.status === 200 && r.json.data.bias, 'AI analyze-trade (rule-engine fallback)');

    // ---- Events ----
    r = await req('GET', '/api/events?limit=20');
    assert(r.status === 200 && r.json.data.length >= 0, 'Event bus query');
    assert(r.json.data.some(e => e.type === 'TRADE_CLOSED') || r.json.stats, 'Event bus has stats');

    child.kill();
    console.log(`\n========================================`);
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`========================================`);
    if (failures.length) { console.log('Failures:', failures.join('; ')); process.exit(1); }
    process.exit(0);
})();
