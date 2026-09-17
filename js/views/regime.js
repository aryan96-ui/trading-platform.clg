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
            <div class="section-title">Market Regime Detection — assess a price series</div>
            <div class="card" style="border-color:var(--border-accent)">
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:11px;color:var(--text-secondary)">Series:</span>
                    <select id="regimeSeries" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                        <option value="trend">Steady uptrend</option>
                        <option value="range">Range-bound</option>
                        <option value="volatile">High volatility</option>
                        <option value="crash">Sharp downtrend</option>
                    </select>
                    <button class="btn primary small" onclick="runRegimeAssess()">▶ Assess Regime</button>
                    <span style="font-size:10px;color:var(--text-muted)">Demo series — regime engine runs on the values above</span>
                </div>
                <div id="regimeResult" style="margin-top:10px"></div>
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

async function runRegimeAssess() {
    const el = $('regimeResult');
    const kind = $('regimeSeries').value;
    const prices = [];
    let v = 100;
    const n = 90;
    for (let i = 0; i < n; i++) {
        if (kind === 'trend') v *= 1.004 + (Math.random() - 0.5) * 0.006;
        else if (kind === 'range') v *= 1 + (Math.random() - 0.5) * 0.008;
        else if (kind === 'volatile') v *= 1 + (Math.random() - 0.5) * 0.035;
        else if (kind === 'crash') v *= 0.992 + (Math.random() - 0.5) * 0.006;
        prices.push(parseFloat(v.toFixed(2)));
    }
    el.innerHTML = '<div style="color:var(--text-secondary)">Assessing...</div>';
    const r = await api('/api/market/regime/assess', 'POST', { prices, symbol: 'DEMO-SERIES' });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${r.error}</div>`; return; }
    const d = r.data;
    const ev = d.evidence || {};
    el.innerHTML = `
        <div class="ai-evidence">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div><span style="font-weight:700;font-size:14px">${d.regime}</span>
                    ${d.sub ? ` <span class="badge blue">${d.sub}</span>` : ''}
                </div>
                <span style="font-family:var(--font-mono);font-size:12px">confidence ${Math.round(d.confidence*100)}%</span>
            </div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Evidence:</div>
            ${ev.trend ? `<div class="ev-row"><span class="k">Trend</span><span class="v">${ev.trend.direction} · ADX ${(ev.trend.adx||0).toFixed(1)}</span></div>` : ''}
            ${ev.volatility ? `<div class="ev-row"><span class="k">Volatility</span><span class="v">ATR% ${(ev.volatility.atrPercent||0).toFixed(2)} · percentile ${Math.round(ev.volatility.percentile||0)}</span></div>` : ''}
            ${ev.momentum ? `<div class="ev-row"><span class="k">Momentum</span><span class="v">RSI ${(ev.momentum.rsi||0).toFixed(1)}</span></div>` : ''}
            <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">Analysis of the demo series above. Regime is context, not a prediction.</div>
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
