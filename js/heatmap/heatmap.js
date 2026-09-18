/**
 * ProTrader — heatmap/heatmap
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== HEATMAP ====================
async function renderHeatmap() {
    const p = $('centerPanel');
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading heatmap...</div>';
    const r = await api('/api/v2/heatmap');
    if (!r.success) { p.innerHTML = `<div style="color:var(--red)">${r.error}</div>`; return; }
    const data = r.data;

    // Unrated instruments (no quote available) get a neutral tile, never a colour
    const colorFor = (chg) => {
        if (typeof chg !== 'number' || !isFinite(chg)) return 'rgba(120,130,145,0.15)';
        const t = Math.min(Math.abs(chg) / 3, 1);
        return chg >= 0 ? `rgba(0,200,83,${0.12 + t * 0.65})` : `rgba(255,61,61,${0.12 + t * 0.65})`;
    };

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Advancers</div><div class="value up">${data.stats.advancers}</div></div>
                <div class="stat-card"><div class="label">Decliners</div><div class="value down">${data.stats.decliners}</div></div>
                <div class="stat-card"><div class="label">Top Sector</div><div class="value" style="font-size:13px">${data.stats.topSector || '—'}</div></div>
                <div class="stat-card"><div class="label">Bottom Sector</div><div class="value" style="font-size:13px;color:var(--red)">${data.stats.bottomSector || '—'}</div></div>
                ${data.stats.unavailable ? `<div class="stat-card"><div class="label">Unavailable</div><div class="value" style="color:var(--text-muted)">${data.stats.unavailable}</div></div>` : ''}
            </div>
            <div class="section-title">Market Heatmap — click a sector to expand</div>
            <div class="heatmap">
                ${data.sectors.map(s => `
                    <div class="heat-sector">
                        <div class="heat-sector-head" style="background:${colorFor(s.changePercent)}" onclick="this.nextElementSibling.classList.toggle('hidden')">
                            <span>${s.name}</span>
                            <span class="${cls(s.changePercent)}" style="font-family:var(--font-mono)">${pctOf(s.changePercent)} · ${s.availableCount}/${s.stockCount} rated</span>
                        </div>
                        <div class="heat-stocks hidden">
                            ${s.stocks.slice(0, 12).map(st => `
                                <div class="heat-stock" style="background:${colorFor(st.changePercent)}" onclick="selectSymbol('${st.symbol}')" title="${st.available ? (st.source || '') + ' · ' + (st.dataQuality || '') : 'DATA UNAVAILABLE'}">
                                    <div class="s">${st.symbol}</div>
                                    <div class="c ${cls(st.changePercent)}">${pctOf(st.changePercent)}</div>
                                </div>`).join('')}
                        </div>
                    </div>`).join('')}
            </div>
            ${heatProvenance(data.provenance)}
        </div>`;
}
