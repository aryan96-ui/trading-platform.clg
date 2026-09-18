/**
 * ProTrader — views/strategies
 *
 * The Strategy Validation Lab. Candles come from the gateway — the same
 * deterministic series the chart, screener and AI use — so a backtest result
 * can be reproduced and can be checked against what the rest of the app shows.
 * The lab previously generated its own random walk on the client, which made
 * every run unrepeatable and disconnected it from the market data.
 */

async function renderStrategies() {
    const p = $('centerPanel');
    const symbol = state.selectedSymbol || state.instruments[0]?.symbol || 'RELIANCE';
    p.innerHTML = `
        <div style="padding:16px">
            <div class="section-title" style="margin-top:0">Strategy Validation Lab — statistical safeguards enforced</div>
            <div class="card" style="border-color:var(--border-accent)">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:11px;color:var(--text-secondary)">Symbol:</span>
                    <input id="btSymbol" value="${symbol}" style="width:110px;text-transform:uppercase" onchange="runBacktest()">
                    <span style="font-size:11px;color:var(--text-secondary)">Strategy:</span>
                    <select id="btStrategy">
                        <option value="sma_crossover">SMA Crossover</option>
                        <option value="rsi">RSI Reversal</option>
                        <option value="breakout">Breakout</option>
                        <option value="bollinger">Bollinger</option>
                    </select>
                    <span style="font-size:11px;color:var(--text-secondary)">Fast:</span><input id="btFast" type="number" value="5" style="width:60px">
                    <span style="font-size:11px;color:var(--text-secondary)">Slow:</span><input id="btSlow" type="number" value="20" style="width:60px">
                    <button class="btn primary small" onclick="runBacktest()">▶ Run Backtest</button>
                </div>
                <div id="btProvenance" style="margin-top:6px"></div>
                <div style="font-size:10px;color:var(--text-muted)">Signals fire at close and execute at the next open — no look-ahead. Costs: 10 bps + 5 bps slippage. Train / validation / out-of-sample split enforced. Candles are served by the gateway, never generated in the browser.</div>
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

/**
 * The lab's only candle source: the gateway's history endpoint, so the series
 * is the same one drawn on the chart and screened by the screener.
 */
async function labCandles(limit = 400) {
    const symbol = ($('btSymbol')?.value || state.selectedSymbol || 'RELIANCE').trim().toUpperCase();
    const r = await api('/api/v2/history/' + encodeURIComponent(symbol) + '?interval=1D&limit=' + limit);
    const candles = r.success && Array.isArray(r.data) ? r.data.filter(c => isFinite(+c.close)) : [];
    return { symbol, candles, source: candles[0]?.source || null, error: r.success ? null : r.error };
}

function labTooShort(el, got) {
    el.innerHTML = `<div style="color:var(--orange)">DATA UNAVAILABLE — the feed returned ${got} candle${got === 1 ? '' : 's'} for this symbol, which is not enough to test a strategy honestly. Pick another symbol or interval.</div>`;
}

function labProvenance({ symbol, candles, source }) {
    const el = $('btProvenance');
    if (!el) return;
    el.innerHTML = candles.length
        ? `<span class="badge ${source === 'demo' ? 'purple' : 'blue'}">${(source || 'unknown').toUpperCase()}</span>
           <span style="font-size:10px;color:var(--text-muted);margin-left:6px">${symbol} · ${candles.length} bars · 1D — same series as the chart</span>`
        : `<span style="font-size:10px;color:var(--red)">No history for ${symbol}</span>`;
}

async function runBacktest() {
    const el = $('btResult');
    el.innerHTML = '<div class="mini-empty">Loading candles…</div>';
    const { symbol, candles, source, error } = await labCandles(400);
    if (error) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(error)}</div>`; return; }
    labProvenance({ symbol, candles, source });
    if (candles.length < 120) return labTooShort(el, candles.length);

    const r = await api('/api/strategies/backtest', 'POST', {
        candles, symbol, strategy: $('btStrategy').value,
        params: { fast: parseInt($('btFast').value) || 5, slow: parseInt($('btSlow').value) || 20 },
        initialCapital: 100000
    });
    if (!r.success || !r.data?.segments) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(r.error || 'Backtest failed')}</div>`; return; }

    const d = r.data;
    const m = (seg) => seg.tradeCount
        ? `<span style="color:${seg.winRate >= 55 ? 'var(--green)' : seg.winRate >= 45 ? 'var(--orange)' : 'var(--red)'}">${seg.winRate}%</span> win · ${seg.tradeCount} trades · PF ${seg.profitFactor} · exp ${seg.expectancy}`
        : '<span style="color:var(--text-muted)">no trades</span>';

    el.innerHTML = `
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">${escapeHtml(d.safeguards.lookAheadBias)} ${escapeHtml(d.safeguards.futureLeakage)}</div>
        <table>
            <thead><tr><th>Segment</th><th>Result</th></tr></thead>
            <tbody>
                <tr><td style="font-family:var(--font-sans)">Training</td><td>${m(d.segments.training)}</td></tr>
                <tr><td style="font-family:var(--font-sans)">Validation</td><td>${m(d.segments.validation)}</td></tr>
                <tr><td style="font-family:var(--font-sans)">Out-of-sample</td><td>${m(d.segments.outOfSample)}</td></tr>
            </tbody>
        </table>
        <div style="margin-top:8px;font-size:11px;color:${/NOT statistically/.test(d.outOfSample.sampleSizeWarning) ? 'var(--orange)' : 'var(--green)'}">${escapeHtml(d.outOfSample.sampleSizeWarning)}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Costs/slippage included: ${escapeHtml(d.safeguards.transactionCosts)} · source: ${escapeHtml(source || 'unknown')}</div>`;
}

async function runSensitivity() {
    const el = $('sensResult');
    el.innerHTML = '<div class="mini-empty">Running…</div>';
    const { symbol, candles, source, error } = await labCandles(400);
    if (error) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(error)}</div>`; return; }
    labProvenance({ symbol, candles, source });
    if (candles.length < 120) return labTooShort(el, candles.length);

    const r = await api('/api/strategies/sensitivity', 'POST', {
        candles, symbol, strategy: $('btStrategy').value, paramName: 'fast',
        paramValues: [6, 8, 10, 12, 14, 16],
        baseParams: { slow: parseInt($('btSlow').value) || 30 }
    });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(r.error || 'Sensitivity failed')}</div>`; return; }
    const d = r.data;

    el.innerHTML = `
        <table>
            <thead><tr><th>fast</th><th>Trades</th><th>Win%</th><th>PF</th><th>Expectancy</th><th>MaxDD</th></tr></thead>
            <tbody>${d.results.map(x => `<tr style="${x.fast === d.best.value ? 'outline:1px solid var(--green);outline-offset:-1px' : ''}"><td>${x.fast}</td><td>${x.tradeCount}</td><td>${x.winRate}</td><td>${x.profitFactor}</td><td>${x.expectancy}</td><td>${x.maxDrawdown}</td></tr>`).join('')}</tbody>
        </table>
        <div style="margin-top:8px;font-size:11.5px;color:${d.parameterSensitive ? 'var(--red)' : 'var(--green)'}">${escapeHtml(d.warning)}</div>
        <div style="font-size:10px;color:var(--text-muted)">${escapeHtml(d.note)}</div>`;
}

async function runWalkForward() {
    const el = $('wfResult');
    el.innerHTML = '<div class="mini-empty">Running…</div>';
    const { symbol, candles, source, error } = await labCandles(400);
    if (error) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(error)}</div>`; return; }
    labProvenance({ symbol, candles, source });
    if (candles.length < 160) return labTooShort(el, candles.length);

    const r = await api('/api/strategies/walk-forward', 'POST', {
        candles, symbol, strategy: $('btStrategy').value,
        params: { fast: parseInt($('btFast').value) || 5, slow: parseInt($('btSlow').value) || 20 },
        // Sized to the bars the feed actually serves (400): a 150-bar train with a
        // 50-bar test leaves each out-of-sample window long enough to hold a trade.
        windowSize: 150, stepSize: 50
    });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(r.error || 'Walk-forward failed')}</div>`; return; }
    const d = r.data;

    el.innerHTML = `
        <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml(d.summary)}</div>
        <table style="margin-top:6px">
            <thead><tr><th>Window</th><th>Train</th><th>OOS (test)</th></tr></thead>
            <tbody>${d.windows.map(w => `<tr><td>${w.window}</td>
                <td>${w.train.tradeCount} tr · ${w.train.winRate ?? '—'}% · PF ${w.train.profitFactor ?? '—'}</td>
                <td>${w.test.tradeCount} tr · ${w.test.winRate ?? '—'}% · PF ${w.test.profitFactor ?? '—'}</td></tr>`).join('')}</tbody>
        </table>
        <div style="margin-top:6px;font-size:11px;color:var(--text-secondary)">Aggregate OOS: ${d.aggregateOutOfSample.sampleSize} trades · win ${d.aggregateOutOfSample.winRate}% · expectancy ${d.aggregateOutOfSample.expectancy} · ${escapeHtml(d.aggregateOutOfSample.sampleSizeWarning)}</div>
        <div style="font-size:10px;color:var(--text-muted)">${escapeHtml(d.safeguards)} · source: ${escapeHtml(source || 'unknown')}</div>`;
}
