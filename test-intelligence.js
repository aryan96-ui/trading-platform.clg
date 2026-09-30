/**
 * Intelligence Layer Test Suite
 * Run: node test-intelligence.js
 */
const EventBus = require('./src/engine/event-bus');
const EvidenceEngine = require('./src/engine/evidence-engine');
const { SignalRankingEngine, SignalConflictEngine } = require('./src/engine/signal-engine');
const { PreTradeRiskCheck, PortfolioHeat, PositionSizingEngine } = require('./src/engine/pre-trade-risk');
const TradeThesisService = require('./src/engine/trade-thesis');
const PostTradeLearningEngine = require('./src/engine/post-trade-learning');
const ExecutionQualityAnalytics = require('./src/engine/execution-quality');
const GuardrailEngine = require('./src/engine/guardrails');
const TraderProfile = require('./src/engine/trader-profile');
const StrategyRegimeMatrix = require('./src/engine/strategy-regime-matrix');
const BacktestEngine = require('./src/engine/backtest-engine');
const ClaimVerificationEngine = require('./src/engine/claim-verification');

let passed = 0, failed = 0;
const failures = [];
function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; failures.push(msg); console.error(`  FAIL: ${msg}`); }
}

// ============================================================
console.log('\n=== Module 24: Event Bus ===');
const bus = new EventBus();
let seen = [];
bus.onEvent('TRADE_CLOSED', e => seen.push(e.payload));
bus.tradeClosed({ symbol: 'RELIANCE', pnl: 100 });
bus.regimeChanged({ regime: 'TRENDING' });
assert(seen.length === 1, 'Subscriber received TRADE_CLOSED');
const events = bus.getEvents({ limit: 10 });
assert(events.length === 2, `History has ${events.length} events`);
assert(bus.getStats().counts.TRADE_CLOSED === 1, 'Stats count TRADE_CLOSED');
// Handler error isolation
bus.onEvent('TRADE_OPENED', () => { throw new Error('handler bug'); });
bus.tradeOpened({ symbol: 'X' }); // should not crash
assert(true, 'Handler errors are isolated');

// ============================================================
console.log('\n=== Module 11: Evidence Engine ===');
const ev = EvidenceEngine.create({ type: 'volume', source: 'test', value: 2.4, interpretation: 'Volume elevated' });
assert(ev.type === 'volume' && ev.source === 'test' && ev.reliability === 'MEDIUM', 'Evidence created');
const ind = EvidenceEngine.fromIndicator({ name: 'RSI', value: 72, bullishIf: 60, bearishIf: 40 });
assert(ind.interpretation.includes('supportive'), 'High RSI interpreted as supportive');
const indLow = EvidenceEngine.fromIndicator({ name: 'RSI', value: 25, bullishIf: 60, bearishIf: 40 });
assert(indLow.interpretation.includes('adverse'), 'Low RSI interpreted as adverse');
const indNull = EvidenceEngine.fromIndicator({ name: 'RSI', value: null });
assert(indNull.reliability === 'LOW' && indNull.interpretation.includes('Insufficient'), 'Null → insufficient');
const pol = EvidenceEngine.polarity([ind, indLow, indNull, ev]);
assert(pol.supporting === 1 && pol.contradicting === 1 && pol.insufficient === 1 && pol.neutral === 1, `Polarity: ${pol.supporting} sup, ${pol.contradicting} contra, ${pol.insufficient} insuff`);
const prov = EvidenceEngine.provenance({ source: 'X', timestamp: new Date().toISOString() });
assert(prov.status === 'LIVE', `Provenance freshness: ${prov.status}`);
assert(EvidenceEngine.freshness(null).status === 'UNKNOWN', 'Null timestamp → UNKNOWN');
try { EvidenceEngine.create({ type: 'x' }); assert(false, 'Should throw without source'); }
catch (e) { assert(true, 'Throws without source'); }

// ============================================================
console.log('\n=== Module 8: Signal Ranking ===');
const ranking = new SignalRankingEngine();
const signals = [
    { symbol: 'RELIANCE', type: 'breakout', strategy: 'momentum', created: new Date().toISOString(), relativeVolume: 2.2, volume: 2200000, volatility: 0.02 },
    { symbol: 'TCS', type: 'dip', strategy: 'mean_reversion', created: new Date(Date.now() - 3600000).toISOString(), relativeVolume: 0.6, volume: 50000, volatility: 0.06 },
    { symbol: 'INFY', type: 'trend', strategy: 'trend_following', created: new Date().toISOString(), relativeVolume: 1.0, volume: 800000, volatility: 0.01 }
];
const ranked = ranking.rankSignals(signals, {
    regime: { regime: 'TRENDING', sub: 'BULLISH' },
    strategies: [{ name: 'Momentum', tags: ['breakout', 'momentum'] }]
});
assert(ranked.length === 3, '3 signals ranked');
assert(ranked[0].symbol === 'RELIANCE', `Top signal: ${ranked[0].symbol}`);
assert(ranked[0].qualityScore >= 70, `Top quality ${ranked[0].qualityScore} → TOP_PRIORITY`);
assert(ranked[0].tier === 'TOP_PRIORITY', 'Top tier TOP_PRIORITY');
assert(ranked[0].scoreBreakdown.freshness > 80, 'Freshness high for new signal');
assert(ranked[1].qualityScore < ranked[0].qualityScore, 'Stale weak signal ranks lower');
const alerts = ranking.buildSmartAlerts(ranked);
assert(alerts.counts.top >= 1, 'Smart alert tiers built');

// ============================================================
console.log('\n=== Module 9: Signal Conflict ===');
const conflict = new SignalConflictEngine();
const result = conflict.detectConflicts({ price: 'bullish', volume: 'bullish', rsi: 'bearish', sector: 'bearish', market: 'neutral' });
assert(result.hasConflict === true, 'Conflict detected');
assert(result.bullishFactors.length === 2 && result.bearishFactors.length === 2, '2v2 factors counted');
assert(result.lean === 'neutral', '2v2 → neutral lean');
const clean = conflict.detectConflicts({ price: 'bullish', volume: 'bullish', rsi: 'bullish' });
assert(clean.hasConflict === false && clean.lean === 'bullish', 'Clean 3-0 → bullish');

// ============================================================
console.log('\n=== Module 12: Pre-Trade Risk ===');
const ptr = new PreTradeRiskCheck();
const check = ptr.runCheck(
    { symbol: 'TCS', direction: 'buy', quantity: 50, entryPrice: 100, stopLoss: 95, target: 115, sector: 'IT', assetType: 'stock' },
    { holdings: [{ symbol: 'INFY', value: 40000, sector: 'IT' }, { symbol: 'RELIANCE', value: 60000, sector: 'Energy' }], totalValue: 100000 },
    { regime: { regime: 'HIGH VOLATILITY' }, volatility: 0.05 }
);
assert(check.riskLevel === 'HIGH' || check.riskLevel === 'MODERATE', `Risk level: ${check.riskLevel}`);
assert(check.findings.length >= 2, `Findings: ${check.findings.length}`);
assert(check.positionWeight === 5, `Position weight: ${check.positionWeight}%`);
const lowCheck = ptr.runCheck(
    { symbol: 'TCS', quantity: 5, entryPrice: 100, stopLoss: 95, target: 120, sector: 'New', assetType: 'stock' },
    { holdings: [], totalValue: 100000 }, { volatility: 0.01 }
);
assert(lowCheck.riskLevel === 'LOW', 'Small diversified trade → LOW');

// ============================================================
console.log('\n=== Module 13: Portfolio Heat ===');
const heat = new PortfolioHeat();
const heatResult = heat.compute({
    totalValue: 100000,
    holdings: [
        { symbol: 'A', value: 40000, sector: 'IT' },
        { symbol: 'B', value: 35000, sector: 'IT' },
        { symbol: 'C', value: 25000, sector: 'Energy' }
    ]
});
assert(heatResult.heatLevel === 'HIGH' || heatResult.heatLevel === 'CRITICAL', `Heat level: ${heatResult.heatLevel}`);
assert(heatResult.sectorExposure[0].name === 'IT', 'Sector exposure computed');
assert(heatResult.singleNames.length === 3, 'Single-name exposures');
assert(heatResult.heatDrivers.length >= 1, 'Heat drivers identified');
const cold = heat.compute({ totalValue: 100000, holdings: Array.from({ length: 8 }, (_, i) => ({ symbol: `S${i}`, value: 12500, sector: `Sector${i}` })) });
assert(cold.heatLevel === 'LOW' || cold.heatLevel === 'MODERATE', 'Diversified → low heat');

// ============================================================
console.log('\n=== Module 6: Position Sizing ===');
const ps = new PositionSizingEngine();
const size = ps.size({
    accountValue: 100000, riskPercent: 1, entryPrice: 100, stopLoss: 75,
    regimeAdjustment: -20, concentrationAdjustment: -10, strategyAdjustment: 5
});
assert(size.riskAmount === 1000, `Risk budget: ${size.riskAmount}`);
assert(size.stopDistance === 25, `Stop distance: ${size.stopDistance}`);
assert(size.baseUnits === 40, `Base units: ${size.baseUnits}`);
assert(size.totalAdjustmentPct === -25, `Adjustments: ${size.totalAdjustmentPct}%`);
assert(size.suggestedUnits === 30, `Suggested: ${size.suggestedUnits} (40 * 0.75)`);
assert(size.calculation.length === 7, `Calculation steps: ${size.calculation.length}`);
assert(size.actualRisk === 750, `Actual risk: ${size.actualRisk}`);
// Zero-stop guard
const zeroStop = ps.size({ accountValue: 100000, riskPercent: 1, entryPrice: 100, stopLoss: 100 });
assert(zeroStop.baseUnits === 0, 'Zero stop distance → 0 units');

// ============================================================
console.log('\n=== Module 15: Trade Thesis ===');
const thesisSvc = new TradeThesisService();
const thesis = thesisSvc.createThesis('u@t.com', {
    symbol: 'RELIANCE', direction: 'long', entry: 100, stop: 90, target: 120,
    reason: 'Breakout with volume', strategy: 'momentum', invalidation: 'close below 90',
    expectedHoldingHours: 48
});
assert(thesis.expectedRiskReward === 2, `Expected R:R: ${thesis.expectedRiskReward}`);
try { thesisSvc.createThesis('u@t.com', { symbol: 'X' }); assert(false, 'Should require fields'); }
catch (e) { assert(true, 'Thesis validation enforces required fields'); }
const comparison = thesisSvc.resolveThesis('u@t.com', thesis.id, {
    exitPrice: 115, pnl: 750, pnlPercent: 7.5, holdingHours: 30,
    riskReward: 1.5, maxAdverseExcursion: -10, maxFavorableExcursion: 18
});
assert(comparison.hitTarget === false && comparison.actualRR === 1.5, 'Comparison computed');
assert(comparison.thesisQuality >= 70, `Thesis quality: ${comparison.thesisQuality}`);
assert(comparison.verdict.length > 10, 'Verdict text present');
const stats = thesisSvc.getThesisStats('u@t.com');
assert(stats.thesisCount === 1, 'Thesis stats count');
assert(stats.message.includes('small'), 'Small sample caveat');

// ============================================================
console.log('\n=== Module 1: Post-Trade Learning ===');
const ptl = new PostTradeLearningEngine();
const goodBad = ptl.generateReview({
    id: 't1', symbol: 'TCS', direction: 'long', entryPrice: 100, exitPrice: 98,
    pnl: -200, pnlPercent: -2, durationHours: 3, riskReward: 1.0, riskTaken: 200,
    stopLoss: 95, maxFavorableExcursion: 300, maxAdverseExcursion: 220
}, { regime: { regime: 'TRENDING', sub: 'BULLISH' }, benchmarkReturn: -3.0, strategyAdherence: true });
assert(goodBad.classification === 'GOOD TRADE / BAD RESULT', `Classification: ${goodBad.classification}`);
assert(goodBad.decision.label === 'GOOD TRADE', 'Decision quality GOOD');
assert(goodBad.relative.alpha > 0, 'Outperformed benchmark despite loss');
assert(goodBad.sections.whatHappened.includes('TCS'), 'What happened section');
assert(goodBad.aiLesson.some(l => l.includes('good trade with a bad result')), 'AI lesson correct');
const badGood = ptl.generateReview({
    id: 't2', symbol: 'XYZ', direction: 'long', entryPrice: 100, exitPrice: 110,
    pnl: 1000, pnlPercent: 10, durationHours: 1, riskReward: 2.5, riskTaken: 400,
    stopLoss: null, maxFavorableExcursion: 1500, maxAdverseExcursion: 50
}, { strategyAdherence: false });
assert(badGood.classification === 'BAD TRADE / GOOD RESULT', `Classification: ${badGood.classification}`);
assert(badGood.aiLesson.some(l => l.includes('violated your rules')), 'Lesson flags rule violation');

// ============================================================
console.log('\n=== Module 16/17: Execution Quality + Timing ===');
const eq = new ExecutionQualityAnalytics();
const exec = eq.analyze({
    id: 'e1', symbol: 'TCS', direction: 'long', quantity: 100,
    plannedEntry: 2840, actualEntry: 2846, plannedExit: 2900, actualExit: 2895,
    decisionTimestamp: new Date(Date.now() - 120000).toISOString(),
    executionTimestamp: new Date().toISOString(),
    maxAdverseExcursion: -30, maxFavorableExcursion: 80
});
assert(exec.entrySlippage === 6, `Entry slippage: ${exec.entrySlippage}`);
assert(exec.estimatedEntryCost === 600, `Entry cost: ${exec.estimatedEntryCost}`);
assert(exec.simulated === true, 'Simulated flag');
assert(exec.disclaimer.includes('Not real exchange'), 'Simulated disclaimer');
assert(exec.quality.score < 80, `Quality penalized for slippage: ${exec.quality.score}`);
assert(exec.explanation.includes('slippage'), 'Explanation mentions slippage');

// Timing alpha with synthetic candles
const candles = [];
const base = Date.now() - 3600000;
for (let i = 0; i < 60; i++) {
    candles.push({ timestamp: new Date(base + i * 60000).toISOString(), close: 2830 + i * 0.5 });
}
const timing = eq.timingAlpha({ actualEntry: 2846, executionTimestamp: new Date(base + 30 * 60000).toISOString() }, candles);
assert(timing.available === true, 'Timing analysis available');
assert(timing.alternatives.length === 3, '3 alternative entries');
assert(timing.bestAlternative !== null, 'Best alternative found');
assert(timing.alternatives[0].minutes === 5, '5-minute alternative');
const noData = eq.timingAlpha({ actualEntry: 100 }, []);
assert(noData.available === false && noData.message.includes('Insufficient'), 'No data → insufficient');

// ============================================================
console.log('\n=== Module 3: Guardrails ===');
const gr = new GuardrailEngine();
gr.updateSettings('g@t.com', { maxConsecutiveLosses: 2, cooldownAfterLossStreakMin: 10 });
const recentLosses = Array.from({ length: 3 }, (_, i) => ({ pnl: -100, closedAt: new Date(Date.now() - i * 60000).toISOString() }));
const guardCheck = gr.checkTrade('g@t.com', { symbol: 'X', quantity: 100, entryPrice: 100, stopLoss: 90 }, { recentTrades: recentLosses, accountValue: 100000 });
assert(guardCheck.overrideRequired === true, 'Discipline check required');
assert(guardCheck.blocks.some(b => b.type === 'consecutive_losses'), 'Consecutive losses block');
const confirm = gr.confirmTrade('g@t.com', { symbol: 'X', quantity: 100, entryPrice: 100, stopLoss: 90 }, { blockIds: ['consecutive_losses'], reason: 'Portfolio Hedge', context: { recentTrades: recentLosses, accountValue: 100000 } });
assert(confirm.allowed === true, 'Override allowed with reason');
assert(confirm.userResponse.reason === 'Portfolio Hedge', 'Reason recorded');
const logs = gr.getLogs('g@t.com');
assert(logs.length === 1 && logs[0].overriddenTypes.includes('consecutive_losses'), 'Override logged');
// Cooldown applied when NOT overridden
gr.confirmTrade('g@t.com', { symbol: 'Y', quantity: 10, entryPrice: 100, stopLoss: 90 }, { blockIds: [], reason: 'none', context: { recentTrades: recentLosses, accountValue: 100000 } });
assert(gr._cooldownMinutes('g@t.com') > 0, 'Cooldown set after un-overridden streak');
// Outcome logging
gr.recordOutcome('g@t.com', null, { pnl: -500, result: 'loss' });
assert(gr.getLogs('g@t.com').some(l => l.tradeOutcome), 'Outcome recorded');

// ============================================================
console.log('\n=== Module 22: Trader Profile ===');
const tp = new TraderProfile();
const mkTrade = (i, o = {}) => ({
    strategy: o.strategy || (i % 2 ? 'momentum' : 'mean_reversion'),
    setup: o.setup || 'breakout',
    symbol: o.symbol || (i % 2 ? 'RELIANCE' : 'TCS'),
    sector: o.sector || (i % 2 ? 'Energy' : 'IT'),
    marketRegime: o.regime || (i % 2 ? 'TRENDING' : 'RANGE-BOUND'),
    pnl: o.pnl ?? (i % 3 === 0 ? 250 : -100),
    riskTaken: 200, durationHours: 5, riskReward: 1.2,
    entryPrice: 100, quantity: 10
});
const profileTrades = Array.from({ length: 25 }, (_, i) => mkTrade(i));
const profile = tp.buildProfile('p@t.com', profileTrades);
assert(profile.tradeCount === 25, 'Profile trade count');
assert(profile.strategies.length >= 2, `Strategies grouped: ${profile.strategies.length}`);
assert(profile.best.length >= 1 && profile.worst.length >= 1, 'Best/worst identified');
assert(profile.sampleNote.includes('statistically'), 'Sample caveat present');
assert(profile.summary.length > 10, 'Summary text');
const aiCtx = tp.toAIContext('p@t.com');
assert(aiCtx.available === true && aiCtx.tradeCount === 25, 'AI context available');
assert(tp.toAIContext('nobody@x.com').available === false, 'No profile → not available');

// ============================================================
console.log('\n=== Module 5: Strategy × Regime Matrix ===');
const sm = new StrategyRegimeMatrix();
const matrixTrades = [
    ...Array.from({ length: 8 }, () => mkTrade(1, { strategy: 'momentum', regime: 'TRENDING', pnl: 200 })),
    ...Array.from({ length: 8 }, () => mkTrade(0, { strategy: 'momentum', regime: 'RANGE-BOUND', pnl: -150 }))
];
const matrix = sm.build(matrixTrades);
assert(matrix.strategies.length >= 1, 'Matrix built');
const momentum = matrix.strategies.find(s => s.strategy === 'momentum');
assert(momentum.cells.length === 2, 'Two regime cells');
const compat = sm.assessCompatibility('momentum', 'TRENDING', matrix);
assert(compat.compatibility === 'HIGH', `TRENDING compat: ${compat.compatibility}`);
const compatLow = sm.assessCompatibility('momentum', 'RANGE-BOUND', matrix);
assert(compatLow.compatibility === 'LOW', `RANGE compat: ${compatLow.compatibility}`);
assert(compatLow.message.includes('caution'), 'Caution message for low compat');
const unknown = sm.assessCompatibility('nonexistent', 'TRENDING', matrix);
assert(unknown.compatibility === 'UNKNOWN', 'Unknown strategy → UNKNOWN');

// ============================================================
console.log('\n=== Module 18-20: Backtest + Robustness ===');
const bt = new BacktestEngine();
// Generate OHLC data with frequent drift-direction reversals so SMA crossovers
// fire densely enough that every walk-forward test window contains signals.
function seededRand(seed) {
    let s = seed;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}
const btCandles = [];
let bp = 100;
let dir = 1;
const rnd = seededRand(42);
for (let i = 0; i < 500; i++) {
    if (i > 0 && i % 25 === 0) dir = -dir;
    bp *= 1 + dir * 0.012 + (rnd() - 0.5) * 0.004;
    const open = bp, close = bp * (1 + (rnd() - 0.5) * 0.003);
    btCandles.push({
        timestamp: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
        open, high: Math.max(open, close) * 1.008, low: Math.min(open, close) * 0.992, close
    });
}
const backtest = bt.runBacktest({ candles: btCandles, strategy: 'sma_crossover', params: { fast: 10, slow: 30 }, initialCapital: 100000 });
assert(backtest.success === true, 'Backtest ran');
assert(backtest.segments.training && backtest.segments.validation && backtest.segments.outOfSample, '3 segments');
assert(backtest.outOfSample.sampleSize >= 0, 'OOS metrics');
assert(backtest.safeguards.lookAheadBias.includes('Prevented'), 'Look-ahead safeguard documented');
assert(backtest.outOfSample.sampleSizeWarning, 'Sample size warning');

// Walk forward
const wf = bt.runWalkForward({ candles: btCandles, strategy: 'sma_crossover', params: { fast: 10, slow: 30 }, windowSize: 150, stepSize: 50 });
assert(wf.success === true, 'Walk-forward ran');
assert(wf.windows.length >= 3, `Walk-forward windows: ${wf.windows.length}`);
assert(wf.aggregateOutOfSample.sampleSize > 0, 'Aggregate OOS metrics');

// Sensitivity
const sens = bt.runSensitivity({ candles: btCandles, strategy: 'sma_crossover', paramName: 'fast', paramValues: [8, 10, 12, 14], baseParams: { slow: 30 } });
assert(sens.results.length === 4, 'Sensitivity 4 values');
assert(typeof sens.parameterSensitive === 'boolean', 'Sensitivity flag');
assert(sens.warning.includes('WARNING') || sens.warning.includes('robust'), 'Sensitivity verdict');

// Insufficient data
const tiny = bt.runBacktest({ candles: btCandles.slice(0, 20), strategy: 'sma_crossover' });
assert(tiny.success === false && tiny.error.includes('Insufficient'), 'Insufficient data rejected');

// ============================================================
console.log('\n=== Module 10: Claim Verification ===');
const cv = new ClaimVerificationEngine();
const supported = cv.verify({
    claimText: 'RELIANCE is experiencing unusual volume and breaking out',
    symbol: 'RELIANCE',
    data: { volume: 2400000, avgVolume: 1000000, price: 2500, high52w: 2600, ema50: 2400, rsi: 58, macdHistogram: 1.5 }
});
assert(supported.success === true, 'Verification ran');
assert(supported.claims.length >= 2, `Claims extracted: ${supported.claims.length}`);
const volumeClaim = supported.claims.find(c => c.field === 'volume');
assert(volumeClaim.verdict === 'SUPPORTED', `Volume claim: ${volumeClaim.verdict} (2.4x avg)`);
assert(volumeClaim.evidence[0].value === 2.4, 'Evidence ratio 2.4x');

const notSupported = cv.verify({
    claimText: 'TCS is oversold right now',
    symbol: 'TCS',
    data: { rsi: 65, volume: 1000, avgVolume: 1000 }
});
const rsiClaim = notSupported.claims.find(c => c.field === 'oversold');
assert(rsiClaim.verdict === 'NOT SUPPORTED', `Oversold claim: ${rsiClaim.verdict}`);

const institutional = cv.verify({
    claimText: 'institutional buying is increasing in INFY',
    symbol: 'INFY',
    data: { volume: 1000, avgVolume: 1000 }
});
const instClaim = institutional.claims.find(c => c.field === 'institutional');
assert(instClaim.verdict === 'INSUFFICIENT DATA', 'Institutional → INSUFFICIENT (never fabricated)');
assert(institutional.disclaimer.includes('not fabricated'), 'Disclaimer present');

const noClaims = cv.verify({ claimText: 'hello world', symbol: 'X', data: {} });
assert(noClaims.verdict === 'INSUFFICIENT DATA', 'No claims → INSUFFICIENT');

// ============================================================
console.log(`\n========================================`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`========================================`);
if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(failed > 0 ? 1 : 0);