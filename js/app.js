/**
 * ProTrader — app
 *
 * Bootstrap only: keyboard, chrome paint, poll loops. Navigation lives in
 * core/nav (switchView), client state in core/state, account data in
 * core/account. This file owns no view logic.
 */

const KEY_VIEWS = ['dashboard', 'chart', 'markets', 'screener', 'heatmap', 'signals', 'strategies', 'portfolio', 'risk'];

function isTyping() {
    const a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); return openShortcuts(); }
    if (e.key === 'Escape') { closePalette(); closeShortcuts(); return; }
    if (isTyping()) return;

    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); $('searchInput')?.focus(); return; }
    if (k === 'r') { e.preventDefault(); switchView(state.view); showToast('View refreshed', 'info', 1500); return; }

    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= KEY_VIEWS.length) switchView(KEY_VIEWS[n - 1]);
});

/** Paint everything that is not the centre view, then start the loops. */
async function boot() {
    renderNav();
    renderSidebar();
    // Narrow screens boot with the rail collapsed; ☰ in the navbar opens it.
    if (window.matchMedia('(max-width: 1200px)').matches) $('sidebar')?.classList.add('collapsed');
    renderProfileChip();
    renderDock();
    renderStatusBar();
    initResizers();

    await loadWatchlist();
    switchView('dashboard');

    refreshAccountData();
    refreshAnalytics();
    loadAlerts();
    refreshTape();
    refreshStatus();

    setInterval(refreshQuotes, 5000);
    setInterval(refreshTape, 4000);
    setInterval(refreshAccountData, 15000);
    setInterval(loadAlerts, 45000);
    setInterval(refreshStatus, 30000);
    setInterval(renderStatusBar, 1000);
}

// Keep the rail sensible across the 1200px boundary: collapse when a wide
// window narrows (rotate / resize), expand when it widens again. Firing only
// on the crossing avoids re-collapsing a drawer the user just opened while
// mobile URL bars shrink the viewport.
let _wasNarrow = window.innerWidth <= 1200;
window.addEventListener('resize', () => {
    const narrow = window.innerWidth <= 1200;
    if (narrow !== _wasNarrow) {
        document.querySelector('.sidebar')?.classList.toggle('collapsed', narrow);
        _wasNarrow = narrow;
    }
});

boot();
