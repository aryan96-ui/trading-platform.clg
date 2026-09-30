/**
 * ProTrader — views/regime
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== MARKET REGIME + STRATEGY MATRIX ====================
async function renderRegime() {
    const p = $('centerPanel');
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading regime analysis...</div>';

    const [matrixR] = await Promise.all([api('/api/strategies/matrix?email=demo@college.com')]);
    const strategies = matrixR.success && matrixR.data ? matrixR.data.strategies || [] : [];
    const allRegimes = ['TRENDING_UP','TRENDING_DOWN','RANGE_BOUND','HIGH_VOLATILITY','LOW_VOLATILITY'];

    const regimeColor = (r) => r.includes('UP') ? 'var(--green)' : r.includes('DOWN') ? 'var(--red)' :
        r.includes('VOLATIL') ? 'var(--orange)' : 'var(--blue)';

    p.innerHTML = `
        <div style="padding:16px">
            <div class="section-title">Market Regime Detection</div>
            <div class="card" style="border-color:var(--border-accent)">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:11px;color:var(--text-secondary)">Symbol:</span>
                    <input id="regimeSymbol" value="${state.selectedSymbol || 'NIFTY50'}" style="width:110px;text-transform:uppercase">
                    <button class="btn primary small" onclick="runRegimeFromMarket()">▶ Assess market data</button>
                </div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Runs the regime engine over the gateway's own daily candles for that symbol — the same series the chart and screener use.</div>
                <div id="regimeResult" style="margin-top:10px"></div>
            </div>

            <div class="section-title">Engine test — synthetic scenarios</div>
            <div class="card">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <select id="regimeSeries" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                        <option value="trend">Steady uptrend</option>
                        <option value="range">Range-bound</option>
                        <option value="volatile">High volatility</option>
                        <option value="crash">Sharp downtrend</option>
                    </select>
                    <button class="btn small" onclick="runRegimeAssess()">▶ Run engine test</button>
                    <span style="font-size:10px;color:var(--orange)">Generated in the browser to exercise the classifier — NOT market data.</span>
                </div>
                <div id="scenarioResult" style="margin-top:10px"></div>
            </div>

            <div class="section-title">Strategy × Regime Matrix — your historical performance by regime</div>
            <table>
                <thead><tr><th>Strategy</th><th>N</th><th>Overall</th>${allRegimes.map(r => `<th style="color:${regimeColor(r)}">${r.replace('_',' ')}</th>`).join('')}</tr></thead>
                <tbody>
                ${strategies.map(s => `
                    <tr>
                        <td style="font-family:var(--font-sans);font-weight:500">${s.strategy}</td>
                        <td>${s.tradeCount}</td>
                        <td>${s.overallWinRate != null ? s.overallWinRate + '%' : '—'}</td>
                        ${allRegimes.map(rg => {
                            const cell = (s.cells || []).find(c => c.regime === rg);
                            if (!cell) return '<td style="color:var(--text-muted)">—</td>';
                            const c = cell.winRate >= 55 ? 'var(--green)' : cell.winRate >= 45 ? 'var(--orange)' : 'var(--red)';
                            return `<td title="${cell.tradeCount} trades · expectancy ${cell.expectancyR}R">
                                <span style="color:${c};font-weight:600">${cell.winRate}%</span>
                                <span style="color:var(--text-muted);font-size:10px"> (${cell.tradeCount})</span></td>`;
                        }).join('')}
                    </tr>`).join('')}
                </tbody>
            </table>
            <div style="color:var(--text-muted);font-size:10px;margin-top:6px">${matrixR.success && matrixR.data.message || ''} Cells show win rate and sample size. Small samples are flagged, never overstated.</div>

            <div class="section-title">Strategy Fit for the current regime</div>
            <div class="card">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:11px;color:var(--text-secondary)">Regime:</span>
                    <select id="assessRegime">${allRegimes.map(r => `<option>${r}</option>`).join('')}</select>
                    <span style="font-size:11px;color:var(--text-secondary)">Strategy:</span>
                    <select id="assessStrategy">${strategies.map(s => `<option>${s.strategy}</option>`).join('') || '<option>momentum_breakout</option>'}</select>
                    <button class="btn primary small" onclick="runMatrixAssess()">▶ Assess Fit</button>
                </div>
                <div id="matrixAssessResult" style="margin-top:10px"></div>
            </div>
        </div>`;
}

/** The real read: regime from the gateway's candles for a symbol. */
async function runRegimeFromMarket() {
    const el = $('regimeResult');
    const symbol = ($('regimeSymbol')?.value || 'NIFTY50').trim().toUpperCase();
    el.innerHTML = `<div style="color:var(--text-secondary)">Loading ${escapeHtml(symbol)} candles…</div>`;

    const h = await api('/api/v2/history/' + encodeURIComponent(symbol) + '?interval=1D&limit=200');
    const candles = h.success && Array.isArray(h.data) ? h.data.filter(c => isFinite(+c.close)) : [];
    if (candles.length < 30) {
        el.innerHTML = `<div style="color:var(--orange)">DATA UNAVAILABLE — only ${candles.length} candle(s) for ${escapeHtml(symbol)}; the regime classifier needs at least 30.</div>`;
        return;
    }

    const r = await api('/api/market/regime/assess', 'POST', {
        prices: candles.map(c => +c.close),
        volumes: candles.map(c => +(c.volume || 0)),
        symbol
    });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(r.error || 'Assessment failed')}</div>`; return; }

    el.innerHTML = regimeHtml(r.data, `${symbol} · ${candles.length} bars · source ${(candles[0].source || 'unknown').toUpperCase()}`);
}

/** Seeded so repeated runs of the same scenario are identical, not random. */
function seededRandom(seed) {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

async function runRegimeAssess() {
    const el = $('scenarioResult');
    const kind = $('regimeSeries').value;
    const rnd = seededRandom(kind.length * 7919 + 13);
    const prices = [];
    let v = 100;
    for (let i = 0; i < 90; i++) {
        if (kind === 'trend') v *= 1.004 + (rnd() - 0.5) * 0.006;
        else if (kind === 'range') v *= 1 + (rnd() - 0.5) * 0.008;
        else if (kind === 'volatile') v *= 1 + (rnd() - 0.5) * 0.035;
        else if (kind === 'crash') v *= 0.992 + (rnd() - 0.5) * 0.006;
        prices.push(parseFloat(v.toFixed(2)));
    }

    el.innerHTML = '<div style="color:var(--text-secondary)">Assessing…</div>';
    const r = await api('/api/market/regime/assess', 'POST', { prices, symbol: 'SYNTHETIC' });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${escapeHtml(r.error)}</div>`; return; }

    el.innerHTML = regimeHtml(r.data, 'SYNTHETIC series generated in the browser — an engine test, not a market read');
}

function regimeHtml(d, sourceLabel) {
    const ev = d.evidence || {};
    return `
        <div class="ai-evidence">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div><span style="font-weight:700;font-size:14px">${d.regime}</span>
                    ${d.sub ? ` <span class="badge blue">${d.sub}</span>` : ''}
                </div>
                <span style="font-family:var(--font-mono);font-size:12px">confidence ${Math.round((d.confidence || 0) * 100)}%</span>
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Evidence:</div>
            ${ev.trend ? `<div class="ev-row"><span class="k">Trend</span><span class="v">${ev.trend.direction} · ADX ${(ev.trend.adx || 0).toFixed(1)}</span></div>` : ''}
            ${ev.volatility ? `<div class="ev-row"><span class="k">Volatility</span><span class="v">ATR% ${(ev.volatility.atrPercent || 0).toFixed(2)} · percentile ${Math.round(ev.volatility.percentile || 0)}</span></div>` : ''}
            ${ev.momentum ? `<div class="ev-row"><span class="k">Momentum</span><span class="v">RSI ${(ev.momentum.rsi || 0).toFixed(1)}</span></div>` : ''}
            <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">${escapeHtml(sourceLabel)} · Regime is context, not a prediction.</div>
        </div>`;
}

async function runMatrixAssess() {
    const el = $('matrixAssessResult');
    const regime = $('assessRegime').value;
    const strategy = $('assessStrategy').value;
    const r = await api('/api/strategies/matrix/assess', 'POST', { strategy, currentRegime: regime, email: 'demo@college.com' });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${r.error}</div>`; return; }
    const d = r.data;
    const col = d.compatibility === 'HIGH' ? 'var(--green)' : d.compatibility === 'MODERATE' ? 'var(--orange)' : d.compatibility === 'LOW' ? 'var(--red)' : 'var(--text-secondary)';
    el.innerHTML = `
        <div class="card" style="border-color:${col};margin:0">
            <div style="display:flex;justify-content:space-between">
                <span style="font-size:11px;color:var(--text-secondary)">${strategy} × ${regime}</span>
                <span style="font-weight:700;color:${col}">${d.compatibility}</span>
            </div>
            <div style="margin-top:6px;font-size:12px">${d.message}</div>
            ${d.evidence ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px">${d.evidence}</div>` : ''}
            ${d.bestRegime ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">Best regime in your history: ${d.bestRegime}</div>` : ''}
        </div>`;
}
