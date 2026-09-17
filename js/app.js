/**
 * ProTrader — app
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== VIEW SWITCHING ====================
function switchView(view) {
    state.view = view;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    const center = $('centerPanel');
    center.scrollTop = 0;
    const views = {
        overview: renderOverview, chart: renderChart, screener: renderScreener, heatmap: renderHeatmap,
        signals: renderSignals, regime: renderRegime, behavior: renderBehavior,
        risk: renderRisk, strategies: renderStrategies, claims: renderClaims,
        reviews: renderReviews, ai: renderAI, journal: renderJournal
    };
    (views[view] || renderOverview)();
}

// ==================== INIT ====================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); openShortcuts(); }
    if (e.key === 'Escape') { closePalette(); closeShortcuts(); }
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault(); $('searchInput').focus(); }
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault(); switchView(state.view); showToast('View refreshed', 'info', 1500); }
    // Number keys 1-9 switch tabs
    if (!e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
        const views = ['overview','chart','screener','heatmap','signals','regime','behavior','risk','strategies'];
        const num = parseInt(e.key);
        if (num >= 1 && num <= views.length) { switchView(views[num-1]); }
    }
});

(async function init() {
    refreshStatus();
    loadWatchlist();
    switchView('overview');
    refreshTape();
    renderStatusBar();
    initResizers();
    // Poll
    setInterval(refreshQuotes, 5000);
    setInterval(refreshTape, 4000);
    setInterval(refreshStatus, 30000);
    setInterval(renderStatusBar, 1000);
})();
