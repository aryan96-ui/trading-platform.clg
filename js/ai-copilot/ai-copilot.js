/**
 * ProTrader — ai-copilot/ai-copilot
 *
 * The AI layer never computes a financial fact. The client sends a symbol; the
 * server prices it, computes indicators, regime and risk, and returns an
 * explanation plus the evidence it used. `aiEvidenceHtml` is the one renderer
 * of that evidence, used by the right-hand panel and the AI workspace view.
 */

async function analyzeSymbol(symbol) {
    state.ai = { symbol, data: state.ai.symbol === symbol ? state.ai.data : null, loading: true };

    const symEl = $('aiSymbol');
    const respEl = $('aiResponse');
    const evEl = $('aiEvidence');
    if (symEl) symEl.textContent = symbol;
    if (respEl) respEl.innerHTML = '<div class="ai-response" style="color:var(--text-secondary)">Generating analysis…</div>';
    if (evEl) evEl.innerHTML = '';

    const r = await api('/api/v2/ai/analyze', 'POST', { symbol });
    if (!r.success) {
        state.ai = { symbol, data: null, error: r.error };
        if (respEl) respEl.innerHTML = `<div class="ai-response" style="color:var(--red)">${escapeHtml(r.error || 'AI unavailable')}</div>`;
        return;
    }

    state.ai = { symbol, data: r.data };

    if (respEl) respEl.innerHTML = `<div class="ai-response">${r.data.explanation.replace(/\n/g, '<br>')}</div>`;
    if (evEl) evEl.innerHTML = aiEvidenceHtml(r.data);

    const mode = $('aiMode');
    if (mode) {
        mode.textContent = r.data.aiModel === 'rule-engine' ? 'rule-engine' : r.data.aiModel;
        mode.className = 'badge ' + (r.data.aiModel === 'rule-engine' ? 'orange' : 'blue');
    }

    if (state.view === 'ai') renderAiWorkspace();
}

/** Evidence panel — the only place AI evidence is rendered. */
function aiEvidenceHtml(d) {
    const prov = d.dataProvenance || {};
    const ev = d.evidence || {};
    const ind = ev.indicatorsUsed || {};
    const cond = ev.marketConditions || {};
    const unavailable = d.unavailable || [];

    return `
        <div class="ai-evidence">
            <h4>Evidence Panel</h4>
            <div class="ev-row"><span class="k">Signal</span><span class="v" style="color:${['BEARISH', 'MILD_BEARISH'].includes(d.signal) ? 'var(--red)' : ['BULLISH', 'MILD_BULLISH'].includes(d.signal) ? 'var(--green)' : 'var(--text-secondary)'}">${d.signal}</span></div>
            <div class="ev-row"><span class="k">Bias</span><span class="v">${d.bias}</span></div>
            <div class="ev-row"><span class="k">Confidence</span><span class="v">${Math.round((d.confidence || 0) * 100)}%</span></div>
            ${ind.rsi != null ? `<div class="ev-row"><span class="k">RSI</span><span class="v">${ind.rsi}</span></div>` : ''}
            ${ind.adx != null ? `<div class="ev-row"><span class="k">ADX</span><span class="v">${ind.adx}</span></div>` : ''}
            <div class="ev-row"><span class="k">Regime</span><span class="v">${cond.regime || '—'} ${cond.regimeSub || ''}</span></div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Risks:</div>
            ${(ev.risks || []).map(x => `<div style="font-size:11px;color:var(--orange)">• ${escapeHtml(x)}</div>`).join('') || '<div class="mini-empty">None flagged</div>'}
            <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Counterarguments:</div>
            ${((ev.counterarguments || []).length ? ev.counterarguments : ['None flagged']).map(x => `<div style="font-size:11px;color:var(--text-secondary)">• ${escapeHtml(x)}</div>`).join('')}
            <div style="margin-top:8px;font-size:10px;color:var(--text-muted)">Source: ${prov.source || 'unknown'} · ${prov.quality || '—'} · ${prov.bars || 0} bars ${prov.interval || ''}</div>
            <div style="margin-top:4px;font-size:10px;color:var(--text-muted)">Data timestamp: ${d.dataFreshness ? new Date(d.dataFreshness).toLocaleString() : 'unavailable'} · ${d.aiModel}</div>
            ${unavailable.length ? `<div style="margin-top:6px;font-size:10px;color:var(--orange)">DATA UNAVAILABLE: ${unavailable.join(', ')}</div>` : ''}
            ${(d.dataWarnings || []).map(w => `<div style="margin-top:2px;font-size:10px;color:var(--text-muted)">• ${escapeHtml(w)}</div>`).join('')}
            <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">${escapeHtml(d.disclaimer || '')}</div>
        </div>`;
}

/** Right-panel view: focus the AI pane on the selected symbol. */
async function renderAI() {
    rightTab('aiPane');
    const symbol = state.selectedSymbol || state.instruments[0]?.symbol;
    if (!symbol) {
        $('aiResponse').innerHTML = '<div class="ai-response" style="color:var(--text-muted)">No instrument available to analyse.</div>';
        return;
    }
    await analyzeSymbol(symbol);
}

/** Centre view: the AI workspace — analysis, evidence and a symbol switcher. */
async function openAiView() {
    const p = $('centerPanel');
    if (!p) return;
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading AI workspace…</div>';
    rightTab('aiPane');

    const symbol = state.selectedSymbol || state.instruments[0]?.symbol;
    if (!symbol) {
        p.innerHTML = '<div style="padding:20px" class="mini-empty">Waiting for the watchlist…</div>';
        return;
    }
    if (state.ai.symbol !== symbol || !state.ai.data) await analyzeSymbol(symbol);
    renderAiWorkspace();
}

function renderAiWorkspace() {
    const p = $('centerPanel');
    const symbol = state.ai.symbol;
    const d = state.ai.data;
    if (!p) return;
    if (!d) {
        p.innerHTML = `<div style="padding:20px" class="mini-empty">${escapeHtml(state.ai.error || 'AI analysis unavailable')}</div>`;
        return;
    }

    const prov = d.dataProvenance || {};
    p.innerHTML = `
    <div style="padding:16px">
        <div class="section-title" style="margin-top:0">AI Copilot — <span class="mono">${symbol}</span> <span class="badge orange">${d.aiModel}</span></div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
            ${state.instruments.slice(0, 10).map(i => `<div class="chip ${i.symbol === symbol ? 'active' : ''}" onclick="selectSymbol('${i.symbol}')">${i.symbol}</div>`).join('')}
        </div>

        <div class="split" style="display:grid;grid-template-columns:1.6fr 1fr;gap:14px">
            <div>
                <div class="stat-grid">
                    <div class="stat-card"><div class="label">Signal</div><div class="value" style="font-size:14px;color:${['BEARISH', 'MILD_BEARISH'].includes(d.signal) ? 'var(--red)' : ['BULLISH', 'MILD_BULLISH'].includes(d.signal) ? 'var(--green)' : 'var(--text-secondary)'}">${d.signal}</div></div>
                    <div class="stat-card"><div class="label">Bias</div><div class="value" style="font-size:14px">${d.bias}</div></div>
                    <div class="stat-card"><div class="label">Confidence</div><div class="value" style="font-size:14px">${Math.round((d.confidence || 0) * 100)}%</div></div>
                    <div class="stat-card"><div class="label">Regime</div><div class="value" style="font-size:14px">${(d.evidence?.marketConditions || {}).regime || '—'}</div></div>
                </div>
                <div class="ai-response">${d.explanation.replace(/\n/g, '<br>')}</div>
                <div style="display:flex;gap:6px">
                    <button class="btn small primary" onclick="switchView('chart')">Trade this</button>
                    <button class="btn small" onclick="switchView('risk')">Portfolio risk</button>
                    <button class="btn small" onclick="switchView('regime')">Regime detail</button>
                    <button class="btn small" onclick="openPalette('screen RSI<30')">Screen RSI&lt;30</button>
                </div>
            </div>
            <div>${aiEvidenceHtml(d)}
                <div class="card" style="margin-top:10px">
                    <h4>Data provenance</h4>
                    <div class="metric-row"><span class="metric-label">Source</span><span class="metric-value">${prov.source || 'unknown'}</span></div>
                    <div class="metric-row"><span class="metric-label">Quality</span><span class="metric-value">${prov.quality || '—'}</span></div>
                    <div class="metric-row"><span class="metric-label">Bars</span><span class="metric-value">${prov.bars || 0} ${prov.interval || ''}</span></div>
                    <div class="metric-row"><span class="metric-label">Model</span><span class="metric-value">${d.aiModel}</span></div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:8px">Indicators and risk are computed by the backend from real candles — the model only interprets them.</div>
                </div>
            </div>
        </div>
    </div>`;
}
