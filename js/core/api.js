/**
 * ProTrader — core/api
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== UTILITIES ====================
const $ = id => document.getElementById(id);
// Percent cell: renders '—' (DATA UNAVAILABLE) when a value could not be sourced
const pctOf = (v) => typeof v === 'number' && isFinite(v)
    ? sign(v) + '%'
    : '<span style="color:var(--text-muted)" title="DATA UNAVAILABLE">—</span>';
// Data-provenance footer shared by the market breadth / heatmap views
const heatProvenance = (prov) => {
    if (!prov) return '';
    const q = !prov.qualities || !prov.qualities.length ? 'UNAVAILABLE'
        : (prov.qualities.length === 1 ? prov.qualities[0] : 'MIXED');
    const src = prov.sources && prov.sources.length ? prov.sources.join('/') : 'none';
    const total = (prov.rated || 0) + (prov.unavailable || 0);
    return `<div style="font-size:10px;color:var(--text-muted);margin-top:8px">Source: ${src} · ${q} · ${prov.rated || 0}/${total} instruments rated${prov.asOf ? ' · as of ' + new Date(prov.asOf).toLocaleTimeString() : ''}${prov.unavailable ? ' · ' + prov.unavailable + ' unavailable' : ''}</div>`;
};

const fmt = n => n === null || n === undefined || isNaN(n) ? '—' :
    (Math.abs(n) >= 10000000 ? (n/10000000).toFixed(2) + ' Cr' :
     Math.abs(n) >= 100000 ? (n/100000).toFixed(2) + ' L' :
     Math.abs(n) >= 1000 ? (n/1000).toFixed(1) + 'K' : n.toFixed(2));
const cls = (n) => n > 0 ? 'up' : n < 0 ? 'down' : '';
const sign = (n) => (n > 0 ? '+' : '') + (n === undefined || n === null || isNaN(n) ? '—' : parseFloat(n).toFixed(2));

async function api(path, method = 'GET', body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    try {
        const r = await fetch(path, opts);
        const j = await r.json();
        return j;
    } catch (e) { return { success: false, error: e.message }; }
}

// ==================== STATUS ====================
async function refreshStatus() {
    const r = await api('/api/v2/stream/stats');
    if (r.success) {
        const demo = r.data.isDemoMode;
        $('statusDot').className = 'status-dot ' + (demo ? 'demo' : 'live');
        $('statusText').textContent = demo ? 'DEMO DATA' : 'LIVE';
        $('aiMode').textContent = 'connected';
    }
}
