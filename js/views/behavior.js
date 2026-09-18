/**
 * ProTrader — views/behavior
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== BEHAVIOR + GUARDRAILS ====================
async function renderBehavior() {
    const p = $('centerPanel');
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Analyzing trading behavior...</div>';
    const [behR, profR, grR] = await Promise.all([
        api('/api/trader/behavior?email=demo@college.com'),
        api('/api/trader/profile?email=demo@college.com'),
        api('/api/guardrails/settings?email=demo@college.com')
    ]);
    const beh = behR.success ? behR.data : { behaviors: [], profile: null };
    const prof = profR.success ? profR.data : null;
    const settings = grR.success ? grR.data : null;

    const sevBadge = (s) => s === 'HIGH' ? '<span class="badge red">HIGH</span>' : s === 'MODERATE' ? '<span class="badge orange">MODERATE</span>' : '<span class="badge blue">LOW</span>';

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Trades Analyzed</div><div class="value">${beh.tradeCount || '—'}</div></div>
                <div class="stat-card"><div class="label">Patterns</div><div class="value" style="color:${beh.behaviors.length ? 'var(--orange)' : 'var(--green)'}">${beh.behaviors.length}</div></div>
                <div class="stat-card"><div class="label">Guardrails</div><div class="value" style="font-size:13px">${settings && settings.enabled ? 'ON' : 'OFF'}</div></div>
            </div>

            <div class="section-title">Behavior Alerts — observable patterns only</div>
            ${beh.behaviors.length ? beh.behaviors.map(b => `
                <div class="card" style="border-color:${b.severity==='HIGH'?'var(--red)':'var(--orange)'}">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <b style="font-size:12px">${b.label}</b> ${sevBadge(b.severity)}
                    </div>
                    <div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px">${b.description}</div>
                    ${(b.example||[]).length ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">${b.example.join(' · ')}</div>` : ''}
                    <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">→ ${b.recommendation}</div>
                </div>`).join('') : '<div class="card">No significant patterns detected. Behavior engine reports only measurable trade actions.</div>'}
            <div style="color:var(--text-muted);font-size:10px">Behavioral analysis is limited to observable trading activity — it is not a psychological assessment.</div>

            <div class="section-title">Trader Profile</div>
            ${prof ? `
            <div class="card">
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">${prof.summary || 'Profile forming — more trades needed.'}</div>
                <div style="display:flex;gap:16px;flex-wrap:wrap">
                    <div style="flex:1;min-width:200px">
                        <div style="font-size:10px;color:var(--green);text-transform:uppercase;letter-spacing:.5px">Best</div>
                        ${(prof.best||[]).map(b => `<div style="font-size:11.5px;padding:2px 0">• ${b.key} — ${b.dimension} (${b.winRate}% win, ${b.totalPnl>0?'+':''}${b.totalPnl} P&L)</div>`).join('') || '<div style="font-size:11px;color:var(--text-muted)">Insufficient data</div>'}
                    </div>
                    <div style="flex:1;min-width:200px">
                        <div style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:.5px">Worst</div>
                        ${(prof.worst||[]).map(b => `<div style="font-size:11.5px;padding:2px 0">• ${b.key} — ${b.dimension} (${b.winRate}% win, ${b.totalPnl>0?'+':''}${b.totalPnl} P&L)</div>`).join('') || '<div style="font-size:11px;color:var(--text-muted)">None flagged</div>'}
                    </div>
                </div>
                ${prof.behaviorHighlights && prof.behaviorHighlights.length ? `<div style="margin-top:8px;font-size:11px;color:var(--orange)">${prof.behaviorHighlights.map(h => '• ' + h.text).join('<br>')}</div>` : ''}
                ${(prof.strategies||[]).slice(0,3).map(s => `
                    <div class="metric-row"><span class="metric-label">${s.key} (${s.tradeCount} trades)</span><span class="metric-value">${s.winRate}% win · ${s.profitFactor} PF · ${s.expectancy} exp</span></div>`).join('')}
                <div style="font-size:9.5px;color:var(--text-muted);margin-top:6px">${prof.disclaimer || ''}</div>
            </div>` : '<div class="card">Insufficient history for a profile.</div>'}

            <div class="section-title">Guardrail Settings</div>
            ${settings ? `
            <div class="card">
                <table>
                    <tbody>
                    ${[['maxDailyTrades','Max trades / day',settings.maxDailyTrades],['maxDailyLossPct','Max daily loss %',settings.maxDailyLossPct],['maxPositionSizePct','Max position %',settings.maxPositionSizePct],['maxRiskPerTradePct','Max risk / trade %',settings.maxRiskPerTradePct],['maxConsecutiveLosses','Max consecutive losses',settings.maxConsecutiveLosses],['cooldownAfterLossStreakMin','Cooldown after loss streak (min)',settings.cooldownAfterLossStreakMin]]
                    .map(([k,l,v]) => `<tr><td style="font-family:var(--font-sans)">${l}</td><td style="text-align:right">${v}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}

            <div class="section-title">Discipline Check — controlled trading friction</div>
            <div class="card" style="border-color:var(--orange)">
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">Simulate placing a large paper trade. If it trips a guardrail, ProTrader requires a reason before proceeding — and logs the override.</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <select id="guardSym">${['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK'].map(s => `<option>${s}</option>`).join('')}</select>
                    <input id="guardQty" type="number" value="200" style="width:80px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <input id="guardEntry" type="number" value="2500" style="width:90px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <button class="btn small" onclick="runGuardrailCheck()">⛔ Check Discipline</button>
                </div>
                <div id="guardrailResult" style="margin-top:10px"></div>
            </div>
        </div>`;
}

async function runGuardrailCheck() {
    const el = $('guardrailResult');
    const jr = await api('/api/v2/journal/demo@college.com');
    const recent = (jr.success ? jr.data : []).slice(-12).reverse();
    const trade = {
        symbol: $('guardSym').value,
        direction: 'long',
        quantity: parseInt($('guardQty').value) || 100,
        entryPrice: parseFloat($('guardEntry').value) || 2500,
        stopLoss: (parseFloat($('guardEntry').value) || 2500) * 0.97
    };
    const r = await api('/api/guardrails/check', 'POST', {
        email: 'demo@college.com', trade,
        context: { accountValue: 100000, recentTrades: recent.map(t => ({ pnl: t.pnl, quantity: t.quantity, entryPrice: t.entryPrice, closedAt: t.closedAt, timestamp: t.closedAt })) }
    });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${r.error}</div>`; return; }
    const d = r.data;
    if (!d.overrideRequired && !d.warnings.length) {
        el.innerHTML = '<div style="color:var(--green);font-size:12px">✅ Passed — no guardrail tripped for this position.</div>';
        return;
    }
    el.innerHTML = `
        <div style="border:1px solid var(--orange);border-radius:6px;padding:10px;background:rgba(245,158,11,.06)">
            <b style="font-size:12px">DISCIPLINE CHECK</b>
            ${d.blocks.map(b => `
                <div style="margin-top:6px;font-size:11.5px;color:var(--red)">⛔ <b>${b.message}</b>
                    <div style="color:var(--text-muted);font-size:10px">${b.evidence}</div></div>`).join('')}
            ${d.warnings.map(w => `
                <div style="margin-top:6px;font-size:11.5px;color:var(--orange)">⚠️ ${w.message}
                    <div style="color:var(--text-muted);font-size:10px">${w.evidence}</div></div>`).join('')}
            <div style="margin-top:10px;font-size:11px;color:var(--text-secondary)">Reason for this trade?</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
                ${d.reasonOptions.map((o, i) => `<button class="btn small" onclick="confirmGuardrailOverride('${o.replace(/\s+/g,'_')}', ${i})">${o}</button>`).join('')}
                <button class="btn small danger" onclick="$('guardrailResult').innerHTML='<div style=color:var(--text-muted)>Trade cancelled — no override.</div>'">Cancel</button>
            </div>
        </div>`;
    state.pendingGuardrail = { trade, blocks: d.blocks.map(b => b.type) };
}

async function confirmGuardrailOverride(reason) {
    const el = $('guardrailResult');
    if (!state.pendingGuardrail) return;
    const { trade, blocks } = state.pendingGuardrail;
    const r = await api('/api/guardrails/confirm', 'POST', {
        email: 'demo@college.com', trade, blockIds: blocks,
        reason: reason.replace(/_/g, ' '),
        context: { accountValue: 100000 }
    });
    if (r.success) {
        el.innerHTML = `<div style="color:var(--orange);font-size:12px">Override recorded. Reason: <b>${r.data.userResponse.reason}</b> · timestamp ${new Date(r.data.timestamp).toLocaleTimeString()}. All overrides are logged for post-trade review.</div>`;
        state.pendingGuardrail = null;
    } else {
        el.innerHTML = `<div style="color:var(--red)">${r.error}</div>`;
    }
}
