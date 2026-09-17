/**
 * ProTrader — ai-copilot/ai-copilot
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== AI COPILOT ====================
async function renderAI() {
    if (state.selectedSymbol) {
        $('aiSymbol').textContent = state.selectedSymbol;
        analyzeSymbol(state.selectedSymbol);
    }
}

async function analyzeSymbol(symbol) {
    $('aiSymbol').textContent = symbol;
    $('aiResponse').innerHTML = '<div class="ai-response" style="color:var(--text-secondary)">Generating analysis...</div>';
    $('aiEvidence').innerHTML = '';

    // Send the symbol only — the backend computes price, indicators and regime
    // from real market data and tags their provenance. The frontend never
    // supplies numbers the AI would then present as analysis.
    const r = await api('/api/v2/ai/analyze', 'POST', { symbol });
    if (!r.success) { $('aiResponse').innerHTML = `<div class="ai-response" style="color:var(--red)">${r.error}</div>`; return; }
    const d = r.data;
    const prov = d.dataProvenance || {};
    const unavailable = d.unavailable || [];

    $('aiResponse').innerHTML = `<div class="ai-response">${d.explanation.replace(/\n/g, '<br>')}</div>`;
    $('aiMode').textContent = d.aiModel === 'rule-engine' ? 'rule-engine' : d.aiModel;
    $('aiMode').className = 'badge ' + (d.aiModel === 'rule-engine' ? 'orange' : 'blue');

    const ev = d.evidence;
    $('aiEvidence').innerHTML = `
        <div class="ai-evidence">
            <h4>Evidence Panel</h4>
            <div class="ev-row"><span class="k">Signal</span><span class="v" style="color:${d.signal==='BEARISH'||d.signal==='MILD_BEARISH'?'var(--red)':d.signal==='BULLISH'||d.signal==='MILD_BULLISH'?'var(--green)':'var(--text-secondary)'}">${d.signal}</span></div>
            <div class="ev-row"><span class="k">Bias</span><span class="v">${d.bias}</span></div>
            <div class="ev-row"><span class="k">Confidence</span><span class="v">${Math.round(d.confidence*100)}%</span></div>
            ${ev.indicatorsUsed.rsi !== null ? `<div class="ev-row"><span class="k">RSI</span><span class="v">${ev.indicatorsUsed.rsi}</span></div>` : ''}
            ${ev.indicatorsUsed.adx !== null ? `<div class="ev-row"><span class="k">ADX</span><span class="v">${ev.indicatorsUsed.adx}</span></div>` : ''}
            <div class="ev-row"><span class="k">Regime</span><span class="v">${ev.marketConditions.regime} ${ev.marketConditions.regimeSub||''}</span></div>
            <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Risks:</div>
            ${ev.risks.map(r => `<div style="font-size:11px;color:var(--orange)">• ${r}</div>`).join('')}
            <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Counterarguments:</div>
            ${(ev.counterarguments.length ? ev.counterarguments : ['None flagged']).map(c => `<div style="font-size:11px;color:var(--text-secondary)">• ${c}</div>`).join('')}
            <div style="margin-top:8px;font-size:10px;color:var(--text-muted)">Source: ${prov.source || 'unknown'} · ${prov.quality || '—'} · ${prov.bars || 0} bars ${prov.interval || ''}</div>
            <div style="margin-top:4px;font-size:10px;color:var(--text-muted)">Data timestamp: ${d.dataFreshness ? new Date(d.dataFreshness).toLocaleString() : 'unavailable'} · ${d.aiModel}</div>
            ${unavailable.length ? `<div style="margin-top:6px;font-size:10px;color:var(--orange)">DATA UNAVAILABLE: ${unavailable.join(', ')}</div>` : ''}
            ${(d.dataWarnings || []).map(w => `<div style="margin-top:2px;font-size:10px;color:var(--text-muted)">• ${w}</div>`).join('')}
            <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">${d.disclaimer}</div>
        </div>`;
}
