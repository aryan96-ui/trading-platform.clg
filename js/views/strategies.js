/**
 * ProTrader — views/strategies
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== STRATEGY LAB (backtest) ====================
async function renderStrategies() {
    const p = $('centerPanel');
    p.innerHTML = `
        <div style="padding:16px">
            <div class="section-title">Strategy Validation Lab — statistical safeguards enforced</div>
            <div class="card" style="border-color:var(--border-accent)">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:11px;color:var(--text-secondary)">Strategy:</span>
                    <select id="btStrategy">
                        <option value="sma_crossover">SMA Crossover</option>
                        <option value="rsi">RSI Reversal</option>
                        <option value="breakout">Breakout</option>
                        <option value="bollinger">Bollinger</option>
                    </select>
                    <span style="font-size:11px;color:var(--text-secondary)">Fast:</span><input id="btFast" type="number" value="10" style="width:60px">
                    <span style="font-size:11px;color:var(--text-secondary)">Slow:</span><input id="btSlow" type="number" value="30" style="width:60px">
                    <button class="btn primary small" onclick="runBacktest()">▶ Run Backtest</button>
                </div>
                <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">Demo price series (labeled). Signals fire at close, execute next open — no look-ahead. Costs: 10 bps + 5 bps slippage. Train/validation/out-of-sample split enforced.</div>
                <div id="btResult" style="margin-top:10px"></div>
            </div>

            <div class="section-title">Robustness — parameter sensitivity</div>
            <div class="card">
                <button class="btn small" onclick="runSensitivity()">▶ Test parameter sensitivity (fast = 6..16)</button>
                <div id="sensResult" style="margin-top:10px"></div>
            </div>

            <div class="section-title">Walk-Forward Test</div>
            <div class="card">
                <button class="btn small" onclick="runWalkForward()">▶ Run walk-forward (rolling train→OOS)</button>
                <div id="wfResult" style="margin-top:10px"></div>
            </div>
        </div>`;
}

function genDemoCandles(n = 520) {
    const c = []; let bp = 100; let dir = 1;
    for (let i = 0; i < n; i++) {
        if (i > 0 && i % 25 === 0) dir = -dir;
        bp *= 1 + dir * 0.011 + (Math.random() - 0.5) * 0.004;
        const o = bp, cl = bp * (1 + (Math.random() - 0.5) * 0.004);
        c.push({ timestamp: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(), open: o, high: Math.max(o, cl) * 1.008, low: Math.min(o, cl) * 0.992, close: cl });
    }
    return c;
}

async function runBacktest() {
    const el = $('btResult');
    const candles = genDemoCandles();
    const r = await api('/api/strategies/backtest', 'POST', {
        candles, strategy: $('btStrategy').value,
        params: { fast: parseInt($('btFast').value) || 10, slow: parseInt($('btSlow').value) || 30 },
        initialCapital: 100000
    });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${r.data.error || r.error}</div>`; return; }
    const d = r.data;
    const m = (seg) => seg.tradeCount ? `<span style="color:${seg.winRate>=55?'var(--green)':seg.winRate>=45?'var(--orange)':'var(--red)'}">${seg.winRate}%</span> win · ${seg.tradeCount} trades · PF ${seg.profitFactor} · exp ${seg.expectancy}` : '<span style="color:var(--text-muted)">no trades</span>';
    el.innerHTML = `
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">${d.safeguards.lookAheadBias} ${d.safeguards.futureLeakage}</div>
        <table>
            <thead><tr><th>Segment</th><th>Result</th></tr></thead>
            <tbody>
                <tr><td style="font-family:var(--font-sans)">Training</td><td>${m(d.segments.training)}</td></tr>
                <tr><td style="font-family:var(--font-sans)">Validation</td><td>${m(d.segments.validation)}</td></tr>
                <tr><td style="font-family:var(--font-sans)">Out-of-sample</td><td>${m(d.segments.outOfSample)}</td></tr>
            </tbody>
        </table>
        <div style="margin-top:8px;font-size:11px;color:${d.outOfSample.sampleSizeWarning.includes('NOT statistically') ? 'var(--orange)' : 'var(--green)'}">${d.outOfSample.sampleSizeWarning}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Costs/slippage included: ${d.safeguards.transactionCosts}</div>
    `;
}

async function runSensitivity() {
    const el = $('sensResult');
    const candles = genDemoCandles();
    const r = await api('/api/strategies/sensitivity', 'POST', { candles, strategy: $('btStrategy').value, paramName: 'fast', paramValues: [6, 8, 10, 12, 14, 16], baseParams: { slow: parseInt($('btSlow').value) || 30 } });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${r.error}</div>`; return; }
    const d = r.data;
    el.innerHTML = `
        <table>
            <thead><tr><th>fast</th><th>Trades</th><th>Win%</th><th>PF</th><th>Expectancy</th><th>MaxDD</th></tr></thead>
            <tbody>${d.results.map(x => `<tr style="${x.fast === d.best.value ? 'outline:1px solid var(--green);outline-offset:-1px' : ''}"><td>${x.fast}</td><td>${x.tradeCount}</td><td>${x.winRate}</td><td>${x.profitFactor}</td><td>${x.expectancy}</td><td>${x.maxDrawdown}</td></tr>`).join('')}</tbody>
        </table>
        <div style="margin-top:8px;font-size:11.5px;color:${d.parameterSensitive ? 'var(--red)' : 'var(--green)'}">${d.warning}</div>
        <div style="font-size:10px;color:var(--text-muted)">${d.note}</div>
    `;
}

async function runWalkForward() {
    const el = $('wfResult');
    const candles = genDemoCandles(560);
    const r = await api('/api/strategies/walk-forward', 'POST', { candles, strategy: $('btStrategy').value, params: { fast: parseInt($('btFast').value) || 10, slow: parseInt($('btSlow').value) || 30 }, windowSize: 180, stepSize: 45 });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${r.data.error || r.error}</div>`; return; }
    const d = r.data;
    el.innerHTML = `
        <div style="font-size:11px;color:var(--text-secondary)">${d.summary}</div>
        <table style="margin-top:6px">
            <thead><tr><th>Window</th><th>Train</th><th>OOS (test)</th></tr></thead>
            <tbody>${d.windows.map(w => `<tr><td>${w.window}</td>
                <td>${w.train.tradeCount} tr · ${w.train.winRate ?? '—'}% · PF ${w.train.profitFactor ?? '—'}</td>
                <td>${w.test.tradeCount} tr · ${w.test.winRate ?? '—'}% · PF ${w.test.profitFactor ?? '—'}</td></tr>`).join('')}</tbody>
        </table>
        <div style="margin-top:6px;font-size:11px;color:var(--text-secondary)">Aggregate OOS: ${d.aggregateOutOfSample.sampleSize} trades · win ${d.aggregateOutOfSample.winRate}% · expectancy ${d.aggregateOutOfSample.expectancy} · ${d.aggregateOutOfSample.sampleSizeWarning}</div>
        <div style="font-size:10px;color:var(--text-muted)">${d.safeguards}</div>
    `;
}
