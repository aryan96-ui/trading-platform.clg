/**
 * ProTrader — market-overview/overview
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== OVERVIEW ====================
async function renderOverview() {
    const p = $('centerPanel');
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading market overview...</div>';
    const [overview, heatR] = await Promise.all([
        api('/api/v2/overview'), api('/api/v2/heatmap')
    ]);

    const stats = heatR.success ? heatR.data.stats : {};
    const sectors = heatR.success ? heatR.data.sectors : [];
    const breadth = heatR.success ? heatR.data.provenance : null;

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Advancers</div><div class="value up">${stats.advancers ?? '—'}</div></div>
                <div class="stat-card"><div class="label">Decliners</div><div class="value down">${stats.decliners ?? '—'}</div></div>
                <div class="stat-card"><div class="label">Unchanged</div><div class="value">${stats.unchanged ?? '—'}</div></div>
                <div class="stat-card"><div class="label">Instruments</div><div class="value">${stats.totalStocks ?? '—'}</div></div>
                ${stats.unavailable ? `<div class="stat-card"><div class="label">Unavailable</div><div class="value" style="color:var(--text-muted)">${stats.unavailable}</div></div>` : ''}
            </div>
            ${heatProvenance(breadth)}
            <div class="section-title">Major Indices</div>
            <div class="stat-grid" id="indexGrid">
                ${(overview.success && overview.data.length ? overview.data : []).map(i => `
                    <div class="stat-card">
                        <div class="label">${i.name}</div>
                        <div class="value ${cls(i.change)}">${fmt(i.price)}</div>
                        <div style="font-family:var(--font-mono);font-size:11px;color:${i.change>=0?'var(--green)':'var(--red)'}">${sign(i.changePercent)}%</div>
                    </div>`).join('') || '<div style="color:var(--text-muted)">Indices unavailable in demo mode</div>'}
            </div>
            <div class="section-title">Sector Performance</div>
            <table>
                <thead><tr><th>Sector</th><th style="text-align:right">Change</th><th style="text-align:right">Stocks</th><th>Top Stock</th></tr></thead>
                <tbody>
                ${sectors.slice(0, 10).map(s => `
                    <tr onclick="switchView('heatmap')" style="cursor:pointer">
                        <td style="font-family:var(--font-sans);font-weight:500">${s.name}</td>
                        <td class="${cls(s.changePercent)}" style="text-align:right">${pctOf(s.changePercent)}</td>
                        <td style="text-align:right">${s.availableCount ?? s.stockCount}</td>
                        <td style="font-family:var(--font-sans)">${s.stocks[0]?.symbol || '—'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}
