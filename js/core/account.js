/**
 * ProTrader — core/account
 *
 * Single owner of the paper-trading account on the client: it fetches account,
 * order, fill, P&L and analytics data into `state`, and it is the only place
 * that sends an order. Sidebar, dock, portfolio view and ticket all render
 * from the state this file maintains — none of them fetch their own copy.
 */

let _accountInFlight = false;

async function refreshAccount() {
    const r = await api('/api/v2/account/' + encodeURIComponent(state.email));
    if (r.success) {
        state.account = r.data;
        state.accountError = null;
    } else {
        state.accountError = r.error || 'Account data unavailable';
    }
    renderProfileChip();
    renderSidebarAccount();
    renderSidebarPositions?.();
}

async function refreshOrders() {
    const r = await api('/api/v2/orders?email=' + encodeURIComponent(state.email) + '&limit=100');
    state.orders = r.success ? r.data.orders : [];
    renderSidebarOrders?.();
    renderDock?.();
}

async function refreshFills() {
    const r = await api('/api/v2/fills/' + encodeURIComponent(state.email) + '?limit=100');
    state.fills = r.success ? r.data.fills : [];
    renderDock?.();
}

async function refreshAnalytics() {
    const r = await api('/api/v2/account/' + encodeURIComponent(state.email) + '/analytics');
    state.analytics = r.success ? r.data : null;
    renderSidebarAccount?.();
    if (state.view === 'portfolio') renderPortfolio?.();
}

async function refreshPnl() {
    const r = await api('/api/v2/account/' + encodeURIComponent(state.email) + '/pnl');
    state.pnl = r.success ? r.data : null;
    renderDock?.();
}

/** Refresh everything the trading surfaces read. Safe to call on a timer. */
async function refreshAccountData() {
    if (_accountInFlight) return;
    _accountInFlight = true;
    try {
        await Promise.all([refreshAccount(), refreshOrders(), refreshFills()]);
    } finally {
        _accountInFlight = false;
    }
}

// ========================================
// ACTIONS
// ========================================

/**
 * Submit an order. A guardrail block is not an error: it is the discipline
 * check, and it is surfaced to the caller so the ticket can require an
 * explicit reason before retrying with acknowledgeGuardrails.
 */
async function submitOrder(order) {
    const r = await api('/api/v2/orders', 'POST', { ...order, email: state.email });
    if (r.success) {
        await refreshAccountData();
        return { ok: true, order: r.data.order, risk: r.data.risk };
    }
    if (r.code === 'GUARDRAIL_BLOCK') return { ok: false, blocked: true, warning: r.data };
    return { ok: false, error: r.error || 'Order rejected' };
}

async function cancelOrder(orderId) {
    const r = await api('/api/v2/orders/' + encodeURIComponent(orderId) + '?email=' + encodeURIComponent(state.email), 'DELETE');
    if (r.success) {
        showToast('Order cancelled', 'info');
        await refreshAccountData();
    } else {
        showToast(r.error || 'Cancel failed', 'error');
    }
    return r;
}

async function closePosition(symbol, quantity) {
    const r = await api('/api/v2/positions/' + encodeURIComponent(symbol) + '/close', 'POST',
        { email: state.email, quantity, reason: 'manual' });
    if (r.success) {
        const pnl = r.data.order?.realizedPnl;
        showToast(`Closed ${symbol}${pnl != null ? ` · realised ₹${fmt(pnl)}` : ''}`, pnl != null && pnl < 0 ? 'warning' : 'success');
        await refreshAccountData();
    } else {
        showToast(r.error || 'Close failed', 'error');
    }
    return r;
}

async function updatePositionStop(symbol, stopLoss) {
    const r = await api('/api/v2/positions/' + encodeURIComponent(symbol) + '/stop', 'PUT',
        { email: state.email, stopLoss });
    if (r.success) {
        showToast(`${symbol} stop moved to ${stopLoss}`, 'info');
        await refreshAccountData();
    } else {
        showToast(r.error || 'Stop update failed', 'error');
    }
    return r;
}

/** Header chip: account identity + live equity. */
function renderProfileChip() {
    const email = $('profileEmail');
    const equity = $('profileEquity');
    if (email) email.textContent = state.email;
    if (equity) {
        if (state.account) {
            equity.textContent = '₹' + fmt(state.account.equity);
            equity.className = 'mono ' + cls(state.account.totalPnl);
        } else {
            equity.textContent = state.accountError ? 'DATA UNAVAILABLE' : '…';
            equity.className = 'mono dim';
        }
    }
}
