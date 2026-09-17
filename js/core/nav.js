/**
 * ProTrader — core/nav
 *
 * The navigation registry. One place decides which views exist, which appear
 * in the primary bar and which live under "More"; switchView is the only way a
 * view changes.
 */

const NAV = {
    dashboard: { label: 'Dashboard', icon: '📊', render: () => renderOverview() },
    chart: { label: 'Chart', icon: '📈', render: () => renderChart() },
    markets: { label: 'Markets', icon: '🌐', render: () => renderMarkets() },
    portfolio: { label: 'Portfolio', icon: '💼', render: () => renderPortfolio() },
    screener: { label: 'Screener', icon: '🔍', render: () => renderScreener() },
    heatmap: { label: 'Heatmap', icon: '🗺️', render: () => renderHeatmap() },
    signals: { label: 'Signals', icon: '📡', render: () => renderSignals() },
    strategies: { label: 'Strategy Lab', icon: '🔬', render: () => renderStrategies() },
    ai: { label: 'AI Copilot', icon: '🤖', render: () => renderAI() },

    // Secondary views — kept, not removed, but behind "More" so the primary
    // bar stays at the eight decisions a trader actually makes each session.
    regime: { label: 'Market Regime', icon: '🌦️', render: () => renderRegime(), secondary: true },
    behavior: { label: 'Behavior', icon: '🧠', render: () => renderBehavior(), secondary: true },
    risk: { label: 'Risk', icon: '⚠️', render: () => renderRisk(), secondary: true },
    claims: { label: 'Claim Check', icon: '🔎', render: () => renderClaims(), secondary: true },
    reviews: { label: 'Trade Reviews', icon: '📋', render: () => renderReviews(), secondary: true },
    journal: { label: 'Journal', icon: '📓', render: () => renderJournal(), secondary: true }
};

const PRIMARY_NAV = Object.keys(NAV).filter(k => !NAV[k].secondary);

/** Render the top navbar. */
function renderNav() {
    const el = $('navbar');
    if (!el) return;
    el.innerHTML =
        PRIMARY_NAV.map(k => `<div class="nav-btn" data-view="${k}" onclick="switchView('${k}')">${NAV[k].icon} ${NAV[k].label}</div>`).join('') +
        `<div class="nav-more">
            <div class="nav-btn" data-view="__more" onclick="toggleMoreMenu(event)">⋯ More</div>
            <div class="nav-menu" id="moreMenu">
                ${Object.keys(NAV).filter(k => NAV[k].secondary).map(k =>
                    `<div onclick="switchView('${k}');toggleMoreMenu()">${NAV[k].icon} ${NAV[k].label}</div>`).join('')}
            </div>
        </div>`;
}

function toggleMoreMenu(e) {
    if (e) e.stopPropagation();
    const menu = $('moreMenu');
    if (!menu) return;
    menu.classList.toggle('open');
}

document.addEventListener('click', (e) => {
    const menu = $('moreMenu');
    if (menu && menu.classList.contains('open') && !e.target.closest('.nav-more')) menu.classList.remove('open');
});

/**
 * Switch the active view. Every navigation path (navbar, palette, sidebar,
 * watchlist, screener row) ends here.
 */
function switchView(view) {
    if (!NAV[view]) view = 'dashboard';
    state.view = view;

    document.querySelectorAll('.nav-btn').forEach(b => {
        const isMore = b.dataset.view === '__more';
        b.classList.toggle('active', !isMore && b.dataset.view === view);
        if (isMore && NAV[view]?.secondary) b.classList.add('active');
    });

    const center = $('centerPanel');
    center.scrollTop = 0;
    NAV[view].render();
}

/** Open the chart for a symbol — used by the palette's `open <symbol>` form. */
function openChart(symbol) {
    if (symbol) {
        state.selectedSymbol = symbol;
        loadChartData(symbol, state.chart.interval);
    }
    switchView('chart');
}
