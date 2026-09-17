/**
 * ProTrader — views/claims
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== CLAIM VERIFICATION ====================
async function renderClaims() {
    const p = $('centerPanel');
    const examples = [
        'RELIANCE is experiencing unusual volume and breaking out',
        'TCS is oversold right now and ready to bounce',
        'HDFCBANK is in a strong uptrend with institutions buying'
    ];
    p.innerHTML = `
        <div style="padding:16px">
            <div class="section-title">Finfluencer Claim Verification — evidence, not authority</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Paste any market claim. ProTrader extracts verifiable statements and compares them against available data. Claims that cannot be checked are reported as INSUFFICIENT DATA — never assumed.</div>
            <div class="card" style="border-color:var(--border-accent)">
                <textarea id="claimText" rows="2" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);padding:8px;font-family:var(--font-sans);font-size:12px;resize:vertical"></textarea>
                <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:11px;color:var(--text-secondary)">Examples:</span>
                    ${examples.map((e, i) => `<button class="btn small" onclick="loadClaim(${i})">${e.split(' ').slice(0,2).join(' ')}…</button>`).join('')}
                    <button class="btn primary small" style="margin-left:auto" onclick="runClaimVerify()">🔎 Verify Claim</button>
                </div>
                <div id="claimResult" style="margin-top:12px"></div>
            </div>
            <div class="section-title">How verdicts work</div>
            <div class="card">
                <div style="font-size:11.5px;color:var(--text-secondary)">SUPPORTED = observed data agrees · PARTIALLY SUPPORTED = some evidence agrees · NOT SUPPORTED = data contradicts · INSUFFICIENT DATA = cannot be checked with current coverage.</div>
                <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Claim verification never declares a person fraudulent — it only grades market claims against evidence.</div>
            </div>
        </div>`;
}

function loadClaim(i) {
    const examples = [
        'RELIANCE is experiencing unusual volume and breaking out',
        'TCS is oversold right now and ready to bounce',
        'HDFCBANK is in a strong uptrend with institutions buying'
    ];
    $('claimText').value = examples[i];
}

async function runClaimVerify() {
    const el = $('claimResult');
    const text = $('claimText').value.trim();
    if (!text) { el.innerHTML = '<div style="color:var(--orange)">Enter a claim first.</div>'; return; }
    el.innerHTML = '<div style="color:var(--text-secondary)">Verifying against available data...</div>';
    const m = text.match(/\b([A-Z]{2,6})\b/);
    const symbol = m ? m[1] : 'RELIANCE';
    const q = await api('/api/v2/quotes?symbols=' + symbol);
    const quote = q.success && q.data.length ? q.data[0] : null;
    const r = await api('/api/claims/verify', 'POST', {
        claimText: text, symbol,
        data: quote ? { price: quote.price, volume: quote.volume, avgVolume: quote.avgVolume, changePercent: quote.changePercent } : {}
    });
    if (!r.success) { el.innerHTML = `<div style="color:var(--red)">${r.error}</div>`; return; }
    const d = r.data;
    const verdictBadge = (v) => v === 'SUPPORTED' ? '<span class="badge green">SUPPORTED</span>' : v === 'PARTIALLY SUPPORTED' ? '<span class="badge orange">PARTIAL</span>' : v === 'NOT SUPPORTED' ? '<span class="badge red">NOT SUPPORTED</span>' : '<span class="badge blue">INSUFFICIENT DATA</span>';
    el.innerHTML = `
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">Claims extracted from: "${text}" · symbol: ${symbol}${quote ? ' · observed price ' + fmt(quote.price) + ' (' + quote.dataQuality + ')' : ''}</div>
        ${d.claims.map(c => `
            <div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin:6px 0">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:12px"><b>${c.claim}</b></span> ${verdictBadge(c.verdict)}
                </div>
                ${c.evidence && c.evidence.length ? c.evidence.map(e => `<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">• ${e.interpretation}${e.value !== undefined && e.value !== null ? ' — ' + e.value : ''} (${e.source})</div>`).join('') : ''}
                ${c.reason ? `<div style="font-size:10.5px;color:var(--text-secondary);margin-top:2px">${c.reason}</div>` : ''}
            </div>`).join('')}
    `;
}
