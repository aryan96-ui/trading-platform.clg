/**
 * ProTrader — market-overview/markets
 *
 * The Markets view: indices, breadth, sector performance and the movers of the
 * selected asset class. Every number comes from the gateway through the same
 * endpoints the dashboard and heatmap use, with its provenance shown.
 */

async function renderMarkets() {
    const p = $('centerPanel');
    if (!p) return;
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading markets…</div>';

    const listR = await api('/api/v2/instruments?assetType=' + state.assetType + '&limit=24');
    const symbols = (listR.success ? listR.data : []).map(i => i.symbol);
    const [ov, heat, q] = await Promise.all([
        api('/api/v2/overview'),
        api('/api/v2/heatmap'),
        symbols.length ? api('/api/v2/quotes?symbols=' + symbols.join(',')) : Promise.resolve({ success: true, data: [] })
    ]);

    const indices = ov.success && Array.isArray(ov.data) ? ov.data : [];
    const stats = heat.success ? heat.data.stats : null;
    const sectors = heat.success ? heat.data.sectors : [];
    const quotes = (q.success ? q.data : []).slice().sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));

    p.innerHTML = `
    <div style="padding:16px">
        <div class="asset-grid" style="grid-template-columns:repeat(4,1fr);max-width:420px">
            ${['stock', 'crypto', 'forex', 'index'].map(t => `
                <div class="asset-btn ${state.assetType === t ? 'active' : ''}" data-type="${t}" onclick="setAssetType('${t}');switchView('markets')">${t}</div>`).join('')}
        </div>

        <div class="section-title">Major indices</div>
        ${indices.length
            ? `<div class="stat-grid">${indices.map(i => `
                <div class="stat-card">
                    <div class="label">${escapeHtml(i.name)}</div>
                    <div class="value ${cls(i.changePercent)}">${fmt(i.price)}</div>
                    <div class="mono ${cls(i.changePercent)}" style="font-size:11px">${sign(i.changePercent)}%</div>
                    ${i.source ? `<div class="dim" style="font-size:9.5px;margin-top:2px">${i.source}</div>` : ''}
                </div>`).join('')}</div>`
            : '<div class="mini-empty">Indices unavailable</div>'}

        <div class="section-title">Breadth</div>
        ${stats ? dashboardBreadth(stats, heat.data.provenance) : '<div class="mini-empty">Breadth unavailable</div>'}

        <div class="section-title">${state.assetType} movers</div>
        ${quotes.length ? table(['Symbol', 'Name', 'Price', 'Change', 'Source'],
            quotes.map(x => `<tr>
                <td onclick="selectSymbol('${x.symbol}')" style="cursor:pointer"><b>${x.symbol}</b></td>
                <td style="font-family:var(--font-sans)">${escapeHtml(x.name || x.companyName || '')}</td>
                <td>${fmt(x.price)}</td>
                <td class="${cls(x.changePercent)}">${pctOf(x.changePercent)}</td>
                <td style="font-family:var(--font-sans)"><span class="badge ${x.source === 'demo' ? 'purple' : 'blue'}">${x.source || '—'}</span></td>
            </tr>`))
            : '<div class="mini-empty">No quotes for this asset class</div>'}

        <div class="section-title">Sector performance</div>
        ${sectors.length ? table(['Sector', 'Change', 'Rated', 'Stocks'],
            sectors.slice().sort((a, b) => (b.changePercent ?? -999) - (a.changePercent ?? -999)).map(s => `<tr onclick="switchView('heatmap')" style="cursor:pointer">
                <td style="font-family:var(--font-sans)">${escapeHtml(s.name)}</td>
                <td class="${cls(s.changePercent)}">${pctOf(s.changePercent)}</td>
                <td>${s.availableCount ?? 0}/${s.stockCount ?? 0}</td>
                <td style="font-family:var(--font-sans)">${(s.stocks || []).slice(0, 4).map(x => x.symbol).join(', ') || '—'}</td>
            </tr>`))
            : '<div class="mini-empty">Sector data unavailable</div>'}
    </div>`;
}

/** Shared breadth block — the dashboard widget uses the same markup. */
function dashboardBreadth(stats, provenance) {
    const total = (stats.advancers || 0) + (stats.decliners || 0) + (stats.unchanged || 0) || 1;
    const pct = (n) => ((n || 0) / total) * 100;
    return `
        <div class="stat-grid">
            <div class="stat-card"><div class="label">Advancers</div><div class="value up">${stats.advancers ?? '—'}</div></div>
            <div class="stat-card"><div class="label">Decliners</div><div class="value down">${stats.decliners ?? '—'}</div></div>
            <div class="stat-card"><div class="label">Unchanged</div><div class="value">${stats.unchanged ?? '—'}</div></div>
            <div class="stat-card"><div class="label">Rated</div><div class="value">${stats.totalStocks ?? '—'}</div></div>
        </div>
        <div class="breadth-bar">
            <div class="adv" style="width:${pct(stats.advancers)}%"></div>
            <div class="unch" style="width:${pct(stats.unchanged)}%"></div>
            <div class="dec" style="width:${pct(stats.decliners)}%"></div>
        </div>
        ${heatProvenance(provenance)}`;
}
