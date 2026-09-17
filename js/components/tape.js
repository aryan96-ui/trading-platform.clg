/**
 * ProTrader — components/tape
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== TAPE ====================
async function refreshTape() {
    const params = new URLSearchParams({ limit: '30' });
    if (state.tape.anomaliesOnly) params.set('anomaliesOnly', 'true');
    if (state.tape.largeOnly) params.set('largePrintsOnly', 'true');
    const r = await api('/api/v2/tape?' + params);
    if (r.success && r.data.length) {
        const el = $('tape');
        if (!el) return;
        el.innerHTML = `<div style="display:grid;grid-template-columns:70px 90px 1fr 52px;padding:4px 8px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px"><span>TIME</span><span>PRICE</span><span>SIZE</span><span>CHG</span></div>` +
            r.data.slice(0, 25).map(e => `
                <div class="tape-row ${e.isLargePrint?'large':''} ${e.isVolumeAnomaly?'anomaly':''}">
                    <span class="tape-time">${new Date(e.time).toLocaleTimeString()}</span>
                    <span class="tape-px ${cls(e.change)}">${fmt(e.price)}</span>
                    <span style="color:${e.isLargePrint?'var(--orange)':e.isVolumeAnomaly?'var(--blue)':'var(--text-secondary)'}">${fmt(e.size)}${e.isLargePrint?' 📣':e.isVolumeAnomaly?' 🔍':''}</span>
                    <span class="${cls(e.change)}">${sign(e.changePercent)}%</span>
                </div>`).join('');
    }
}

function toggleTapePause() {
    state.tape.paused = !state.tape.paused;
    api('/api/v2/tape/pause', 'POST', { pause: state.tape.paused });
    $('tapePauseBtn').textContent = state.tape.paused ? '▶ Resume' : '⏸ Pause';
}
function toggleTapeAnomalies() {
    state.tape.anomaliesOnly = !state.tape.anomaliesOnly;
    $('tapeAnomBtn').classList.toggle('primary', state.tape.anomaliesOnly);
    refreshTape();
}
function toggleTapeLarge() {
    state.tape.largeOnly = !state.tape.largeOnly;
    $('tapeLargeBtn').classList.toggle('primary', state.tape.largeOnly);
    refreshTape();
}
