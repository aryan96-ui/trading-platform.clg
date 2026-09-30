/**
 * ProTrader — core/nav
 *
 * The navigation registry. One place decides which views exist. switchView is
 * the only way a view changes, and every navigation path (navbar, palette,
 * sidebar, watchlist, screener row) ends here.
 */

const NAV = {
    dashboard:  { label: 'Dashboard',     icon: '📊', render: () => renderDashboard() },
    chart:      { label: 'Chart',         icon: '📈', render: () => renderChart() },
    markets:    { label: 'Markets',       icon: '🌐', render: () => renderMarkets() },
    screener:   { label: 'Screener',      icon: '🔍', render: () => renderScreener() },
    heatmap:    { label: 'Heatmap',       icon: '🗺️', render: () => renderHeatmap() },
    signals:    { label: 'Signals',       icon: '📡', render: () => renderSignals() },
    strategies: { label: 'Strategy Lab',  icon: '🔬', render: () => renderStrategies() },
    portfolio:  { label: 'Portfolio',     icon: '💼', render: () => renderPortfolio() },
    regime:     { label: 'Regime',        icon: '🌦️', render: () => renderRegime() },
    behavior:   { label: 'Behaviour',     icon: '🧠', render: () => renderBehavior() },
    risk:       { label: 'Risk',          icon: '⚠️', render: () => renderRisk() },
    claims:     { label: 'Claim Check',   icon: '🔎', render: () => renderClaims() },
    reviews:    { label: 'Trade Reviews', icon: '📋', render: () => renderReviews() },
    journal:    { label: 'Journal',       icon: '📓', render: () => renderJournal() },
    ai:         { label: 'AI Copilot',    icon: '🤖', render: () => openAiView() }
};

const ORDERED_NAV = Object.keys(NAV);

/** Render the top navbar — every view visible, horizontally scrollable. */
function renderNav() {
    const el = $('navbar');
    if (!el) return;
    el.innerHTML = ORDERED_NAV.map(k =>
        `<div class="nav-btn" data-view="${k}" onclick="switchView('${k}')" title="${NAV[k].label}">${NAV[k].icon} ${NAV[k].label}</div>`
    ).join('') +
        `<div class="sep"></div>
         <div class="nav-btn" onclick="toggleSidebar()" title="Show/hide the left rail">☰</div>
         <div class="nav-btn" onclick="toggleRightPane()" title="Show/hide the intelligence panel">🧠</div>`;
}

/**
 * Switch the active view. Views are rendered into the centre panel; the
 * sidebar, right panel and dock are chrome and stay put.
 */
function switchView(view) {
    if (!NAV[view]) view = 'dashboard';
    state.view = view;

    document.querySelectorAll('.nav-btn[data-view]').forEach(b =>
        b.classList.toggle('active', b.dataset.view === view)
    );

    const center = $('centerPanel');
    if (center) center.scrollTop = 0;

    const r = NAV[view].render();
    if (r && typeof r.catch === 'function') {
        r.catch(err => {
            if (center) center.innerHTML = `<div style="padding:20px;color:var(--red)">${escapeHtml(err.message)}</div>`;
        });
    }
}

function toggleSidebar() { $('sidebar')?.classList.toggle('collapsed'); }
function toggleRightPane() { $('rightCol')?.classList.toggle('collapsed'); }

/** Open the chart for a symbol — used by the palette's `open <symbol>` form. */
function openChart(symbol) {
    if (symbol) state.selectedSymbol = symbol;
    switchView('chart');
}

/** Switch the right-hand panel tab. Every pane id lives in the shell. */
function rightTab(pane) {
    state.rightPane = pane;
    document.querySelectorAll('#rightTabs .tab').forEach(t =>
        t.classList.toggle('active', t.dataset.pane === pane)
    );
    ['aiPane', 'tapePane', 'alertsPane'].forEach(id => {
        const el = $(id);
        if (el) el.classList.toggle('hidden', id !== pane);
    });
    if (pane === 'alertsPane') renderAlertsPane();
}
