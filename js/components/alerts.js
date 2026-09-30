/**
 * ProTrader — components/alerts
 *
 * One owner of the alert feed. `loadAlerts` fetches the ranked signals and the
 * behavioural flags once into `state.alerts`, then the sidebar section and the
 * right-hand Alerts pane render from that same object — so the two can never
 * show different counts.
 *
 * Note: /api/signals/ranked requires a `signals` array. The old sidebar call
 * sent only a `context` and always came back 400, which is why the alerts
 * section used to be permanently empty.
 */

async function loadAlerts() {
    const symbols = state.instruments.slice(0, 12).map(i => i.symbol);
    if (!symbols.length) return;

    const [sig, beh] = await Promise.all([
        fetchRankedSignals(symbols),
        api('/api/trader/behavior?email=' + encodeURIComponent(state.email))
    ]);

    state.alerts = {
        ranked: sig.ranked || [],
        error: sig.error || null,
        behaviors: beh.success ? (beh.data.behaviors || []) : [],
        at: Date.now()
    };

    renderAlertsPane();
    renderSidebarAlerts();
}

function alertCount() {
    return (state.alerts.ranked?.length || 0) + (state.alerts.behaviors?.length || 0);
}

/** Right-hand pane: ranked signals + behavioural flags. */
function renderAlertsPane() {
    const host = $('alertsList');
    const behHost = $('alertsBehavior');
    const badge = $('alertPaneCount');
    if (!host) return;
    if (badge) badge.textContent = String(alertCount());

    if (state.alerts.error) {
        host.innerHTML = `<div class="mini-empty">${escapeHtml(state.alerts.error)}</div>`;
    } else if (!state.alerts.ranked.length) {
        host.innerHTML = '<div class="mini-empty">No signal above the move threshold right now.</div>';
    } else {
        host.innerHTML = state.alerts.ranked.slice(0, 8).map(s => `
            <div class="metric-row" style="cursor:pointer" onclick="selectSymbol('${s.symbol}')">
                <span class="metric-label"><b class="mono">${s.symbol}</b> <span class="dim">${escapeHtml((s.type || '').replace(/_/g, ' '))}</span></span>
                <span class="metric-value">
                    <span class="${cls(s.changePercent)}">${sign(s.changePercent)}%</span>
                    <span class="badge ${s.tier === 'TOP_PRIORITY' ? 'green' : s.tier === 'MEDIUM' ? 'orange' : 'blue'}" title="quality score">${Math.round(s.qualityScore)}</span>
                </span>
            </div>`).join('');
    }

    if (behHost) {
        behHost.innerHTML = state.alerts.behaviors.length
            ? state.alerts.behaviors.slice(0, 4).map(b => `
                <div class="metric-row" style="cursor:pointer" onclick="switchView('behavior')">
                    <span class="metric-label" style="color:${b.severity === 'HIGH' ? 'var(--red)' : 'var(--orange)'}">⚠ ${escapeHtml(b.label || b.type)}</span>
                    <span class="metric-value">${b.severity || ''}</span>
                </div>`).join('')
            : '<div class="mini-empty">No behavioural patterns detected.</div>';
    }
}

/** Sidebar section: the same feed, trimmed. */
function renderSidebarAlerts() {
    const el = $('sideAlerts');
    if (!el) return;
    const count = $('alertCount');
    if (count) count.textContent = String(alertCount());

    const rows = [];

    state.alerts.behaviors.slice(0, 2).forEach(b => rows.push(`
        <div class="mini-row" style="grid-template-columns:1fr" onclick="switchView('behavior')">
            <span style="font-size:11px;color:${b.severity === 'HIGH' ? 'var(--red)' : 'var(--orange)'}">⚠ ${escapeHtml(b.label || b.type)}</span>
        </div>`));

    state.alerts.ranked.slice(0, 4).forEach(s => rows.push(`
        <div class="mini-row" style="grid-template-columns:1fr auto" onclick="selectSymbol('${s.symbol}')">
            <span class="sym">${s.symbol} <span class="dim" style="font-weight:400">${escapeHtml((s.type || '').replace(/_/g, ' ').slice(0, 20))}</span></span>
            <span class="val">${s.qualityScore != null ? Math.round(s.qualityScore) : '—'}</span>
        </div>`));

    el.innerHTML = rows.length ? rows.join('') : '<div class="mini-empty">No active alerts</div>';
}
