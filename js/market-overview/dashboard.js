/**
 * ProTrader — market-overview/dashboard
 *
 * The Dashboard is the merged single page: market breadth, indices, sector
 * performance, heatmap snapshot, movers, signal radar, portfolio/risk and AI
 * insight — all as collapsible widgets in one grid, all fed by the same APIs
 * the dedicated views use. It renders nothing it cannot source: missing
 * numbers are shown as DATA UNAVAILABLE, never invented.
 */

const DASH_WIDGETS = ['breadth', 'indices', 'portfolio', 'signals', 'sectors', 'movers', 'heat', 'ai', 'tape'];

function widget(key, title, bodyHtml, extra = '') {
    const closed = state.widgets[key] === false;
    return `<section class="widget ${extra} ${closed ? 'closed' : ''}">
        <div class="widget-head" data-widget="${key}">
            <h4>${title}</h4><span class="chev">▼</span>
        </div>
        <div class="widget-body">${bodyHtml}</div>
    </section>`;
}

async function renderDashboard() {
    const p = $('centerPanel');
    if (!p) return;
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading market intelligence…</div>';

    const symbols = state.instruments.slice(0, 15).map(i => i.symbol);
    const [ov, heat, sig, tapeR] = await Promise.all([
        api('/api/v2/overview'),
        api('/api/v2/heatmap'),
        fetchRankedSignals(symbols),
        api('/api/v2/tape?limit=12')
    ]);

    const indices = ov.success ? (Array.isArray(ov.data) ? ov.data : []) : [];
    const stats = heat.success ? heat.data.stats : null;
    const sectors = heat.success ? heat.data.sectors : [];
    const provenance = heat.success ? heat.data.provenance : null;
    const ranked = sig.ranked || [];
    const tape = tapeR.success ? tapeR.data : [];
    const a = state.account;
    const an = state.analytics;

    p.innerHTML = `
    <div class="widget-grid">
        ${widget('breadth', '📊 Market Breadth', breadthBody(stats, provenance), 'span-2')}
        ${widget('indices', '🌐 Major Indices', indices.length
            ? `<div class="kv-grid">${indices.map(i => `<div class="kv-box"><div class="k">${i.name}</div>
                <div class="v ${cls(i.changePercent)}">${fmt(i.price)} <span style="font-size:11px">${sign(i.changePercent)}%</span></div></div>`).join('')}</div>`
            : '<div class="mini-empty">Indices unavailable</div>')}
        ${widget('portfolio', '💼 Portfolio &amp; Risk', portfolioBody(a, an))}
        ${widget('signals', '📡 Signal Radar', signalsBody(ranked, sig.error))}
        ${widget('sectors', '🏭 Sector Performance', sectorsBody(sectors))}
        ${widget('movers', '🚀 Watchlist Movers', moversBody(sig.quotes || []))}
        ${widget('heat', '🗺️ Heatmap Snapshot', heatBody(sectors))}
        ${widget('ai', '🤖 AI Insight', aiBody(), 'span-2')}
        ${widget('tape', '📡 Market Tape', tapeBody(tape), 'span-2')}
    </div>`;

    loadDashboardAi();
}

function breadthBody(stats, provenance) {
    if (!stats) return '<div class="mini-empty">Breadth unavailable — the heatmap engine returned no data.</div>';
    const total = (stats.advancers || 0) + (stats.decliners || 0) + (stats.unchanged || 0) || 1;
    const pct = (n) => ((n || 0) / total) * 100;
    return `
        <div class="kv-grid">
            ${kv('Advancers', stats.advancers ?? '—')}
            ${kv('Decliners', stats.decliners ?? '—')}
            ${kv('Unchanged', stats.unchanged ?? '—')}
            ${kv('Instruments', stats.totalStocks ?? '—')}
            ${kv('Top sector', stats.topSector || '—')}
            ${kv('Bottom sector', stats.bottomSector || '—')}
        </div>
        <div class="breadth-bar">
            <div class="adv" style="width:${pct(stats.advancers)}%"></div>
            <div class="unch" style="width:${pct(stats.unchanged)}%"></div>
            <div class="dec" style="width:${pct(stats.decliners)}%"></div>
        </div>
        ${heatProvenance(provenance)}`;
}

function portfolioBody(a, an) {
    if (!a) return `<div class="mini-empty">${state.accountError || 'Loading account…'}</div>`;
    return `
        <div class="kv-grid">
            ${kv('Equity', '₹' + fmt(a.equity))}
            ${kv('Total P&L', '₹' + fmt(a.totalPnl), colorOf(a.totalPnl))}
            ${kv('Return', sign(a.returnPercent) + '%', colorOf(a.returnPercent))}
            ${kv('Open positions', a.positions.length)}
            ${kv('Cash', '₹' + fmt(a.balance))}
            ${kv('Concentration', an ? `${an.concentration.hhi} · ${an.concentration.level}` : '—', an && an.concentration.level === 'HIGH' ? 'var(--red)' : an && an.concentration.level === 'MODERATE' ? 'var(--orange)' : 'var(--green)')}
        </div>
        <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn small" onclick="switchView('portfolio')">Portfolio</button>
            <button class="btn small" onclick="switchView('risk')">Risk terminal</button>
            <button class="btn small" onclick="dockTab('pnl')">P&amp;L</button>
        </div>`;
}

function signalsBody(ranked, error) {
    if (error) return `<div class="mini-empty">${escapeHtml(error)}</div>`;
    if (!ranked.length) return '<div class="mini-empty">No signals above the move threshold right now.</div>';
    return ranked.slice(0, 5).map(s => `
        <div class="metric-row" style="cursor:pointer" onclick="selectSymbol('${s.symbol}')">
            <span class="metric-label"><b class="mono">${s.symbol}</b> ${escapeHtml(s.type || '')}</span>
            <span class="metric-value">
                <span class="${cls(s.changePercent)}">${sign(s.changePercent)}%</span>
                <span class="badge ${s.tier === 'TOP_PRIORITY' ? 'green' : s.tier === 'MEDIUM' ? 'orange' : 'blue'}">${Math.round(s.qualityScore)}</span>
            </span>
        </div>`).join('') +
        `<div style="margin-top:8px"><button class="btn small" onclick="switchView('signals')">All signals</button></div>`;
}

function sectorsBody(sectors) {
    if (!sectors.length) return '<div class="mini-empty">Sector data unavailable</div>';
    const sorted = sectors.slice().sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999));
    return table(['Sector', 'Change', 'Rated', 'Leader'],
        sorted.slice(0, 10).map(s => `<tr onclick="switchView('heatmap')" style="cursor:pointer">
            <td style="font-family:var(--font-sans)">${escapeHtml(s.name)}</td>
            <td class="${cls(s.changePercent)}">${pctOf(s.changePercent)}</td>
            <td>${s.availableCount ?? 0}/${s.stockCount ?? 0}</td>
            <td style="font-family:var(--font-sans)">${s.stocks && s.stocks[0] ? s.stocks[0].symbol : '—'}</td>
        </tr>`));
}

function moversBody(quotes) {
    if (!quotes.length) return '<div class="mini-empty">No quotes yet</div>';
    const movers = quotes.slice().sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0)).slice(0, 8);
    return `<div class="kv-grid">${movers.map(q => `
        <div class="kv-box" style="cursor:pointer" onclick="selectSymbol('${q.symbol}')">
            <div class="k">${q.symbol}</div>
            <div class="v ${cls(q.changePercent)}">${fmt(q.price)} <span style="font-size:11px">${sign(q.changePercent)}%</span></div>
        </div>`).join('')}</div>`;
}

function heatBody(sectors) {
    const rated = sectors.filter(s => typeof s.changePercent === 'number');
    if (!rated.length) return '<div class="mini-empty">Heatmap unavailable</div>';
    const sorted = rated.slice().sort((a, b) => b.changePercent - a.changePercent);
    const cell = s => `<div class="heat-stock" style="background:${s.changePercent >= 0 ? 'rgba(0,200,83,' + Math.min(0.6, 0.12 + Math.abs(s.changePercent) / 6) + ')' : 'rgba(255,61,61,' + Math.min(0.6, 0.12 + Math.abs(s.changePercent) / 6) + ')'}" onclick="switchView('heatmap')">
        <div class="s">${s.name}</div><div class="c ${cls(s.changePercent)}">${pctOf(s.changePercent)}</div></div>`;
    return `<div class="section-title" style="margin-top:0">Strongest</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:4px">${sorted.slice(0, 4).map(cell).join('')}</div>
        <div class="section-title">Weakest</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:4px">${sorted.slice(-4).map(cell).join('')}</div>
        <div style="margin-top:10px"><button class="btn small" onclick="switchView('heatmap')">Full heatmap</button></div>`;
}

function aiBody() {
    return `<div id="dashAi" class="ai-response" style="color:var(--text-muted)">Pick a symbol (or wait for the watchlist to load) — the AI reasons over server-computed indicators and states its evidence.</div>
        <div id="dashAiEvidence" style="margin-top:10px"></div>
        <div style="margin-top:8px"><button class="btn small" onclick="switchView('ai')">Open AI workspace</button></div>`;
}

function tapeBody(tape) {
    if (!tape.length) return '<div class="mini-empty">Tape is quiet</div>';
    return `<div style="display:grid;grid-template-columns:80px 1fr 1fr 1fr;gap:6px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;padding:2px 6px">
            <span>Time</span><span>Symbol</span><span>Price</span><span>Size</span></div>` +
        tape.map(e => `<div class="tape-row" style="grid-template-columns:80px 1fr 1fr 1fr">
            <span class="tape-time">${new Date(e.time).toLocaleTimeString()}</span>
            <span class="mono">${e.symbol || '—'}</span>
            <span class="tape-px ${cls(e.change)}">${fmt(e.price)}</span>
            <span style="color:${e.isLargePrint ? 'var(--orange)' : 'var(--text-secondary)'}">${fmt(e.size)}${e.isLargePrint ? ' 📣' : e.isVolumeAnomaly ? ' 🔍' : ''}</span>
        </div>`).join('');
}

/** The dashboard's AI widget is the same component the right panel uses. */
async function loadDashboardAi() {
    const host = $('dashAi');
    if (!host) return;
    const symbol = state.selectedSymbol || state.instruments[0]?.symbol;
    if (!symbol) { host.textContent = 'No instrument available to analyse.'; return; }

    host.textContent = `Analysing ${symbol}…`;
    const d = state.ai.symbol === symbol ? state.ai.data : null;
    const r = d ? { success: true, data: d } : await api('/api/v2/ai/analyze', 'POST', { symbol });
    if (!r.success) { host.innerHTML = `<span style="color:var(--red)">${escapeHtml(r.error || 'AI unavailable')}</span>`; return; }

    state.ai = { symbol, data: r.data };
    host.innerHTML = `<div class="ai-response">${r.data.explanation.replace(/\n/g, '<br>')}</div>`;
    const ev = $('dashAiEvidence');
    if (ev) ev.innerHTML = aiEvidenceHtml(r.data);
}
