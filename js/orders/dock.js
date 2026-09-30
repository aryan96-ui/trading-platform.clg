/**
 * ProTrader — orders/dock
 *
 * The bottom dock: open orders, order history, trade history, holdings,
 * portfolio analytics and P&L. Every table renders from `state` — which
 * core/account owns — so a fill, the sidebar and the dock never disagree.
 */

const DOCK_TABS = [
    { id: 'openOrders',   label: 'Open Orders',         badge: () => openOrders().length },
    { id: 'orderHistory', label: 'Order History',       badge: () => state.orders.length },
    { id: 'tradeHistory', label: 'Trade History',       badge: () => state.fills.length },
    { id: 'holdings',     label: 'Holdings',            badge: () => positions().length },
    { id: 'analytics',    label: 'Portfolio Analytics', badge: null },
    { id: 'pnl',          label: 'P&L',                 badge: null }
];

function positions() { return state.account?.positions || []; }
function openOrders() { return state.orders.filter(o => o.status === 'open'); }

const timeOf = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const sideBadge = (s) => `<span class="badge ${s === 'buy' ? 'green' : 'red'}">${s}</span>`;

function dockTab(id) {
    state.dock.tab = id;
    if (id === 'analytics' && !state.analytics) refreshAnalytics();
    if (id === 'pnl' && !state.pnl) refreshPnl();
    renderDock();
}

function renderDock() {
    const head = $('dockHead');
    const body = $('dockBody');
    if (!head || !body) return;

    const tab = DOCK_TABS.find(t => t.id === state.dock.tab) || DOCK_TABS[0];

    head.innerHTML =
        DOCK_TABS.map(t => {
            const n = t.badge ? t.badge() : null;
            return `<div class="dock-tab ${t.id === tab.id ? 'active' : ''}" onclick="dockTab('${t.id}')">${t.label}${n ? `<span class="n">${n}</span>` : ''}</div>`;
        }).join('') +
        `<div class="dock-actions">
            <span class="dim" style="font-size:10.5px">${state.account ? 'Equity ₹' + fmt(state.account.equity) + ' · ' + sign(state.account.returnPercent) + '%' : ''}</span>
            <button class="btn small" onclick="refreshAccountData();refreshAnalytics();refreshPnl()">↻ Refresh</button>
            <button class="btn small" onclick="toggleDock()" id="dockToggle">${state.dock.collapsed ? '▲' : '▼'}</button>
        </div>`;

    body.innerHTML = (DOCK_RENDER[tab.id] || DOCK_RENDER.openOrders)();
}

const EMPTY = (msg) => `<div class="empty-state"><div class="icon">🗂️</div><div class="desc">${msg}</div></div>`;

const DOCK_RENDER = {
    openOrders() {
        const rows = openOrders();
        if (!rows.length) return EMPTY('No working orders. Orders you place appear here until they fill or you cancel them.');
        return table(['Placed', 'Symbol', 'Side', 'Type', 'Qty', 'Limit', 'Value', '', ''],
            rows.map(o => `<tr>
                <td style="font-family:var(--font-sans)">${timeOf(o.createdAt)}</td>
                <td onclick="selectSymbol('${o.symbol}')" style="cursor:pointer"><b>${o.symbol}</b></td>
                <td>${sideBadge(o.side)}</td>
                <td style="font-family:var(--font-sans)">${o.orderType}</td>
                <td>${o.quantity}</td>
                <td>${o.limitPrice ? fmt(o.limitPrice) : '—'}</td>
                <td>₹${fmt(o.value)}</td>
                <td><span class="badge orange">open</span></td>
                <td><span class="btn small danger" onclick="cancelOrder('${o.id}')">Cancel</span></td>
            </tr>`));
    },

    orderHistory() {
        if (!state.orders.length) return EMPTY('No orders yet. Place a paper order from the Chart view order ticket.');
        return table(['Placed', 'Symbol', 'Side', 'Type', 'Qty', 'Fill', 'Value', 'Status', 'Realised'],
            state.orders.map(o => `<tr>
                <td style="font-family:var(--font-sans)">${timeOf(o.createdAt)}</td>
                <td onclick="selectSymbol('${o.symbol}')" style="cursor:pointer"><b>${o.symbol}</b></td>
                <td>${sideBadge(o.side)}</td>
                <td style="font-family:var(--font-sans)">${o.orderType}</td>
                <td>${o.quantity}</td>
                <td>${o.avgFillPrice ? fmt(o.avgFillPrice) : '—'}</td>
                <td>₹${fmt(o.value)}</td>
                <td><span class="badge ${o.status === 'filled' ? 'green' : o.status === 'rejected' ? 'red' : 'orange'}" title="${o.rejectReason || ''}">${o.status}</span></td>
                <td class="${cls(o.realizedPnl)}">${o.realizedPnl == null ? '—' : '₹' + fmt(o.realizedPnl)}</td>
            </tr>`));
    },

    tradeHistory() {
        if (!state.fills.length) return EMPTY('No fills yet. Every simulated execution is logged here with its price source.');
        return table(['Time', 'Symbol', 'Side', 'Qty', 'Price', 'Value', 'Fee', 'Source'],
            state.fills.map(f => `<tr>
                <td style="font-family:var(--font-sans)">${timeOf(f.at)}</td>
                <td onclick="selectSymbol('${f.symbol}')" style="cursor:pointer"><b>${f.symbol}</b></td>
                <td>${sideBadge(f.side)}</td>
                <td>${f.quantity}</td>
                <td>${fmt(f.price)}</td>
                <td>₹${fmt(f.price * f.quantity)}</td>
                <td>₹${fmt(f.fee)}</td>
                <td style="font-family:var(--font-sans)"><span class="badge ${f.source === 'demo' ? 'purple' : 'blue'}">${f.source || '—'}</span></td>
            </tr>`));
    },

    holdings() {
        const rows = positions().filter(p => p.quantity > 0);
        if (!rows.length) return EMPTY('No holdings. Buy something from the order ticket and it appears here, priced from the same gateway quote as the chart.');
        const equity = state.account?.equity || 1;
        return table(['Symbol', 'Qty', 'Avg', 'LTP', 'Stop', 'Value', 'Weight', 'Unrealised', 'Actions'],
            rows.map(p => `<tr>
                <td onclick="selectSymbol('${p.symbol}')" style="cursor:pointer"><b>${p.symbol}</b> <span class="dim" style="font-family:var(--font-sans)">${p.sector || ''}</span></td>
                <td>${p.quantity}</td>
                <td>${fmt(p.avgPrice)}</td>
                <td>${p.currentPrice === null ? '<span class="dim">DATA UNAVAILABLE</span>' : fmt(p.currentPrice)}</td>
                <td>${p.stopLoss ? fmt(p.stopLoss) : '<span class="dim">none</span>'}</td>
                <td>${p.marketValue === null ? '—' : '₹' + fmt(p.marketValue)}</td>
                <td>${p.marketValue === null ? '—' : ((p.marketValue / equity) * 100).toFixed(1) + '%'}</td>
                <td class="${cls(p.unrealizedPnl)}">${p.unrealizedPnl === null ? '—' : '₹' + fmt(p.unrealizedPnl)} <span class="dim">${p.unrealizedPnlPercent === null ? '' : '(' + sign(p.unrealizedPnlPercent) + '%)'}</span></td>
                <td>
                    <span class="btn small" onclick="quickClose('${p.symbol}',${p.quantity})">Close</span>
                    <span class="btn small" onclick="promptStop('${p.symbol}',${p.stopLoss || 0})">Stop</span>
                </td>
            </tr>`));
    },

    analytics() {
        const a = state.analytics;
        if (!a) return EMPTY(state.accountError || 'Loading portfolio analytics…');
        const conc = a.concentration || {};
        return `<div style="padding:10px 12px">
            <div class="kv-grid" style="margin-bottom:10px">
                ${kv('Gross exposure', '₹' + fmt(a.exposure.gross))}
                ${kv('Cash', '₹' + fmt(a.exposure.cash))}
                ${kv('Invested', a.exposure.investedPercent + '% of equity')}
                ${kv('Open positions', a.exposure.openPositions)}
                ${kv('Concentration (HHI)', conc.hhi + ' · ' + conc.level, conc.level === 'HIGH' ? 'var(--red)' : conc.level === 'MODERATE' ? 'var(--orange)' : 'var(--green)')}
                ${kv('Largest position', conc.largestPosition ? `${conc.largestPosition.symbol} · ${conc.largestPosition.percent}%` : 'none')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div>
                    <div class="section-title" style="margin-top:0">By sector</div>
                    ${(a.bySector || []).map(s => barRow(s.sector, s.percent, '₹' + fmt(s.value))).join('') || '<div class="mini-empty">No classified exposure</div>'}
                </div>
                <div>
                    <div class="section-title" style="margin-top:0">By asset class</div>
                    ${(a.byAssetClass || []).map(s => barRow(s.assetType, s.percent, '₹' + fmt(s.value))).join('') || '<div class="mini-empty">No classified exposure</div>'}
                </div>
            </div>
        </div>`;
    },

    pnl() {
        const p = state.pnl;
        if (!p) return EMPTY(state.accountError || 'Loading P&L…');
        return `<div style="padding:10px 12px">
            <div class="kv-grid" style="margin-bottom:10px">
                ${kv('Equity', '₹' + fmt(p.equity))}
                ${kv('Realised', '₹' + fmt(p.realizedPnl), colorOf(p.realizedPnl))}
                ${kv('Unrealised', '₹' + fmt(p.unrealizedPnl), colorOf(p.unrealizedPnl))}
                ${kv('Total', '₹' + fmt(p.totalPnl), colorOf(p.totalPnl))}
                ${kv('Return', sign(p.returnPercent) + '%', colorOf(p.returnPercent))}
                ${kv('Fees paid', '₹' + fmt(p.feesPaid))}
            </div>
            ${table(['Symbol', 'Bought', 'Sold', 'Fees', 'Realised', 'Unrealised', 'Open qty'],
                (p.bySymbol || []).map(s => `<tr>
                    <td><b>${s.symbol}</b></td>
                    <td>₹${fmt(s.bought)}</td>
                    <td>₹${fmt(s.sold)}</td>
                    <td>₹${fmt(s.fees)}</td>
                    <td class="${cls(s.realized)}">${sign(s.realized)}</td>
                    <td class="${cls(s.unrealized)}">${s.unrealized == null ? '—' : sign(s.unrealized)}</td>
                    <td>${s.openQuantity || 0}</td>
                </tr>`))}
        </div>`;
    }
};

// ========================================
// SHARED BITS
// ========================================
function table(headers, rows) {
    return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
function kv(k, v, color) {
    return `<div class="kv-box"><div class="k">${k}</div><div class="v" style="${color ? 'color:' + color : ''}">${v}</div></div>`;
}
function colorOf(n) { return n > 0 ? 'var(--green)' : n < 0 ? 'var(--red)' : undefined; }
function barRow(label, percent, value) {
    const w = Math.max(0, Math.min(100, percent || 0));
    return `<div style="margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;font-size:11px"><span>${label}</span><span class="mono dim">${value} · ${(percent || 0).toFixed(1)}%</span></div>
        <div class="progress" style="margin-top:3px"><div class="progress-fill" style="width:${w}%"></div></div>
    </div>`;
}
