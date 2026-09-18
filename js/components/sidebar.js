/**
 * ProTrader — components/sidebar
 *
 * The left rail: asset classes, watchlist, live portfolio, holdings, open
 * positions, the order book, alerts and the screener entry point. Every
 * section is collapsible and every number comes from `state` (owned by
 * core/account) or the gateway — the sidebar computes nothing itself.
 */

const SIDEBAR_SECTIONS = ['assetClasses', 'watchlist', 'portfolio', 'holdings', 'positions', 'orders', 'alerts', 'scanner'];

function renderSidebar() {
    const el = $('sidebar');
    if (!el) return;
    el.innerHTML = `
        <!-- asset classes -->
        <div class="side-section">
            <div class="side-head" data-widget="side_assetClasses">Asset Class <span class="chev">▼</span></div>
            <div class="side-body">
                <div class="asset-grid" id="assetGrid">
                    <div class="asset-btn active" data-type="stock" onclick="setAssetType('stock')">📈 Stocks</div>
                    <div class="asset-btn" data-type="crypto" onclick="setAssetType('crypto')">₿ Crypto</div>
                    <div class="asset-btn" data-type="forex" onclick="setAssetType('forex')">💱 Forex</div>
                    <div class="asset-btn" data-type="index" onclick="setAssetType('index')">📊 Indices</div>
                </div>
            </div>
        </div>

        <!-- watchlist -->
        <div class="side-section">
            <div class="side-head" data-widget="side_watchlist">👁 Watchlist <span class="side-count" id="watchCount">0</span><span class="chev">▼</span></div>
            <div class="side-body"><div id="watchlist"></div></div>
        </div>

        <!-- portfolio -->
        <div class="side-section">
            <div class="side-head" data-widget="side_portfolio">💼 Portfolio <span class="side-count" id="sidePnlPct">—</span><span class="chev">▼</span></div>
            <div class="side-body" id="sideAccount"><div class="mini-empty">Loading account…</div></div>
        </div>

        <!-- holdings -->
        <div class="side-section">
            <div class="side-head" data-widget="side_holdings">📦 Holdings <span class="side-count" id="holdCount">0</span><span class="chev">▼</span></div>
            <div class="side-body" id="sideHoldings"><div class="mini-empty">No holdings</div></div>
        </div>

        <!-- positions -->
        <div class="side-section">
            <div class="side-head" data-widget="side_positions">📍 Positions <span class="side-count" id="posCount">0</span><span class="chev">▼</span></div>
            <div class="side-body" id="sidePositions"><div class="mini-empty">No open positions</div></div>
        </div>

        <!-- orders -->
        <div class="side-section">
            <div class="side-head" data-widget="side_orders">🧾 Orders <span class="side-count" id="ordCount">0</span><span class="chev">▼</span></div>
            <div class="side-body" id="sideOrders"><div class="mini-empty">No working orders</div></div>
        </div>

        <!-- alerts -->
        <div class="side-section">
            <div class="side-head" data-widget="side_alerts">🔔 Alerts <span class="side-count" id="alertCount">0</span><span class="chev">▼</span></div>
            <div class="side-body" id="sideAlerts"><div class="mini-empty">Loading…</div></div>
        </div>

        <!-- scanner -->
        <div class="side-section">
            <div class="side-head" data-widget="side_scanner">🔎 Market Scanner <span class="chev">▼</span></div>
            <div class="side-body">
                <div style="display:flex;flex-direction:column;gap:6px">
                    <button class="btn small" onclick="switchView('screener')">Open screener</button>
                    <button class="btn small" onclick="openPalette('screen RSI<30')">Quick: RSI &lt; 30</button>
                    <button class="btn small" onclick="openPalette('screen volume>2x')">Quick: volume spike</button>
                    <button class="btn small" onclick="openPalette('screen sector=IT')">Quick: IT sector</button>
                </div>
            </div>
        </div>`;

    // Keep the sidebar's asset-class buttons and the watchlist in sync with state
    document.querySelectorAll('#assetGrid .asset-btn').forEach(b => b.classList.toggle('active', b.dataset.type === state.assetType));
}

// ========================================
// PORTFOLIO (sidebar summary)
// ========================================
function renderSidebarAccount() {
    const el = $('sideAccount');
    if (!el) return;
    const a = state.account;
    const badge = $('sidePnlPct');

    if (!a) {
        el.innerHTML = `<div class="mini-empty">${state.accountError ? escapeHtml(state.accountError) : 'Loading account…'}</div>`;
        if (badge) badge.textContent = '—';
        return;
    }

    if (badge) {
        badge.textContent = sign(a.returnPercent) + '%';
        badge.style.color = a.returnPercent >= 0 ? 'var(--green)' : 'var(--red)';
    }

    el.innerHTML = `
        <div class="side-kv"><span class="k">Equity</span><span class="v">₹${fmt(a.equity)}</span></div>
        <div class="side-kv"><span class="k">Cash</span><span class="v">₹${fmt(a.balance)}</span></div>
        <div class="side-kv"><span class="k">Invested</span><span class="v">₹${fmt(a.marketValue)}</span></div>
        <div class="side-kv"><span class="k">Unrealised</span><span class="v ${cls(a.unrealizedPnl)}">₹${fmt(a.unrealizedPnl)}</span></div>
        <div class="side-kv"><span class="k">Realised</span><span class="v ${cls(a.realizedPnl)}">₹${fmt(a.realizedPnl)}</span></div>
        <div class="side-kv"><span class="k">Fees</span><span class="v">₹${fmt(a.feesPaid)}</span></div>
        <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn small" style="flex:1" onclick="switchView('portfolio')">Details</button>
            <button class="btn small" style="flex:1" onclick="dockTab('pnl')">P&amp;L</button>
        </div>`;

    renderSidebarHoldings();
    renderSidebarPositions();
}

// ========================================
// HOLDINGS — allocation view of the same positions
// ========================================
function renderSidebarHoldings() {
    const el = $('sideHoldings');
    if (!el) return;
    const positions = state.account?.positions || [];
    const count = $('holdCount');
    if (count) count.textContent = String(positions.length);

    if (!positions.length) {
        el.innerHTML = '<div class="mini-empty">No holdings</div>';
        return;
    }

    const total = positions.reduce((s, p) => s + (p.marketValue || 0), 0) || 1;
    el.innerHTML = positions
        .slice()
        .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
        .map(p => {
            const weight = p.marketValue === null ? null : (p.marketValue / total) * 100;
            return `<div class="mini-row" onclick="selectSymbol('${p.symbol}')">
                <span class="sym">${p.symbol}</span>
                <span class="val">${p.marketValue === null ? '—' : '₹' + fmt(p.marketValue)}</span>
                <span class="val">${weight === null ? '—' : weight.toFixed(1) + '%'}</span>
            </div>`;
        }).join('');
}

// ========================================
// POSITIONS — live P&L with one-click close
// ========================================
function renderSidebarPositions() {
    const el = $('sidePositions');
    if (!el) return;
    const positions = state.account?.positions || [];
    const count = $('posCount');
    if (count) count.textContent = String(positions.length);

    if (!positions.length) {
        el.innerHTML = '<div class="mini-empty">No open positions</div>';
        return;
    }

    el.innerHTML = positions.map(p => `
        <div class="mini-row" onclick="selectSymbol('${p.symbol}')">
            <span class="sym">${p.symbol} <span class="dim" style="font-weight:400">×${p.quantity}</span></span>
            <span class="val ${cls(p.unrealizedPnl)}">${p.unrealizedPnl === null ? '—' : sign(p.unrealizedPnlPercent) + '%'}</span>
            <span class="val ${cls(p.unrealizedPnl)}">${p.unrealizedPnl === null ? '—' : '₹' + fmt(p.unrealizedPnl)}</span>
        </div>
        <div style="display:flex;gap:4px;margin:0 8px 6px 8px">
            <button class="btn small" style="flex:1" onclick="event.stopPropagation();quickClose('${p.symbol}',${p.quantity})">Close</button>
            <button class="btn small" style="flex:1" onclick="event.stopPropagation();promptStop('${p.symbol}',${p.stopLoss || 0})">Stop</button>
        </div>`).join('');
}

// ========================================
// ORDERS — working orders
// ========================================
function renderSidebarOrders() {
    const el = $('sideOrders');
    if (!el) return;
    const open = state.orders.filter(o => o.status === 'open');
    const count = $('ordCount');
    if (count) count.textContent = String(open.length);

    if (!open.length) {
        el.innerHTML = '<div class="mini-empty">No working orders</div>';
        return;
    }
    el.innerHTML = open.map(o => `
        <div class="mini-row">
            <span class="sym">${o.symbol} <span class="badge ${o.side === 'buy' ? 'green' : 'red'}" style="font-size:8px">${o.side}</span></span>
            <span class="val">${o.quantity} @ ${fmt(o.limitPrice)}</span>
            <span class="val" style="cursor:pointer;color:var(--red)" onclick="cancelOrder('${o.id}')" title="Cancel">✕</span>
        </div>`).join('');
}

// The alerts section is rendered by components/alerts, which owns the feed
// (`state.alerts`) for both the sidebar and the right-hand Alerts pane.

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
