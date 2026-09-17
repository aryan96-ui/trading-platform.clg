/**
 * ProTrader — orders/ticket
 *
 * The order panel. It never prices anything itself: the estimate uses the
 * gateway quote already in `state.quotes`, and the risk/guardrail verdict comes
 * from the server's pre-check. Placing an order that trips a guardrail shows a
 * DISCIPLINE CHECK requiring a stated reason — friction, not a silent block.
 */

const TICKET = {
    side: 'buy',
    orderType: 'market',
    quantity: 1,
    limitPrice: null,
    stopLoss: null,
    target: null,
    strategy: 'momentum-breakout',
    thesis: '',
    invalidation: ''
};

const STRATEGIES = ['momentum-breakout', 'trend-following', 'mean-reversion', 'breakout-retest', 'discretionary'];

function ticketHtml() {
    const symbol = state.selectedSymbol || '—';
    return `
    <div class="ticket" id="ticket">
        <div style="display:flex;align-items:center;gap:8px">
            <b class="mono" style="font-size:13px">${symbol}</b>
            <span class="badge gray" id="ticketPrice">loading…</span>
        </div>

        <div class="seg">
            <button class="buy ${TICKET.side === 'buy' ? 'active' : ''}" onclick="setTicketSide('buy')">BUY</button>
            <button class="sell ${TICKET.side === 'sell' ? 'active' : ''}" onclick="setTicketSide('sell')">SELL</button>
        </div>

        <div class="seg">
            <button class="${TICKET.orderType === 'market' ? 'active' : ''}" onclick="setTicketType('market')">MARKET</button>
            <button class="${TICKET.orderType === 'limit' ? 'active' : ''}" onclick="setTicketType('limit')">LIMIT</button>
        </div>

        <div class="field-row">
            <div class="field">
                <label>Quantity</label>
                <input id="tQty" type="number" min="1" step="1" value="${TICKET.quantity}" oninput="ticketChanged()">
            </div>
            <div class="field" id="tLimitWrap" style="${TICKET.orderType === 'limit' ? '' : 'display:none'}">
                <label>Limit price</label>
                <input id="tLimit" type="number" step="0.05" value="${TICKET.limitPrice ?? ''}" oninput="ticketChanged()">
            </div>
        </div>

        <div class="field-row">
            <div class="field">
                <label>Stop loss</label>
                <input id="tStop" type="number" step="0.05" value="${TICKET.stopLoss ?? ''}" oninput="ticketChanged()" placeholder="required for risk">
            </div>
            <div class="field">
                <label>Target</label>
                <input id="tTarget" type="number" step="0.05" value="${TICKET.target ?? ''}" oninput="ticketChanged()" placeholder="optional">
            </div>
        </div>

        <div class="field">
            <label>Strategy</label>
            <select id="tStrategy" onchange="ticketChanged()">
                ${STRATEGIES.map(s => `<option value="${s}" ${s === TICKET.strategy ? 'selected' : ''}>${s.replace(/-/g, ' ')}</option>`).join('')}
            </select>
        </div>

        <div class="field">
            <label>Why am I entering? (thesis)</label>
            <textarea id="tThesis" rows="2" oninput="ticketChanged()" placeholder="Setup, expected driver, invalidation…">${TICKET.thesis}</textarea>
        </div>

        <div class="ticket-summary" id="ticketSummary"></div>

        <div id="ticketCheck"></div>

        <button class="btn-order ${TICKET.side}" id="tSubmit" onclick="ticketSubmit()">REVIEW ORDER</button>
        <div style="font-size:9.5px;color:var(--text-muted);line-height:1.5">
            Simulated paper execution. Fills price at the live quote plus a 0.05% simulated commission.
            No exchange connectivity, no real money.
        </div>
    </div>`;
}

function setTicketSide(side) {
    TICKET.side = side;
    document.querySelectorAll('#ticket .seg button.buy, #ticket .seg button.sell')
        .forEach(b => b.classList.remove('active'));
    document.querySelector('#ticket .seg button.' + side)?.classList.add('active');
    const submit = $('tSubmit');
    if (submit) { submit.className = 'btn-order ' + side; submit.textContent = side === 'buy' ? 'REVIEW BUY' : 'REVIEW SELL'; }
    ticketChanged();
}

function setTicketType(type) {
    TICKET.orderType = type;
    document.querySelectorAll('#ticket .seg')[1]?.querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b.textContent.trim().toLowerCase() === type));
    const wrap = $('tLimitWrap');
    if (wrap) wrap.style.display = type === 'limit' ? '' : 'none';
    ticketChanged();
}

/** Recompute the estimate from the gateway quote already in state. */
function ticketChanged() {
    const qty = parseFloat($('tQty')?.value) || 0;
    const limit = parseFloat($('tLimit')?.value) || null;
    const stop = parseFloat($('tStop')?.value) || null;
    const target = parseFloat($('tTarget')?.value) || null;
    TICKET.quantity = qty;
    TICKET.limitPrice = limit;
    TICKET.stopLoss = stop;
    TICKET.target = target;
    TICKET.strategy = $('tStrategy')?.value || TICKET.strategy;
    TICKET.thesis = $('tThesis')?.value || '';

    const price = ticketPrice();
    const px = TICKET.orderType === 'limit' && limit ? limit : price;
    const value = px && qty ? px * qty : null;
    const fee = value === null ? null : value * 0.0005;
    const risk = stop && px ? Math.abs(px - stop) * qty : null;
    const reward = target && px ? Math.abs(target - px) * qty : null;
    const rr = risk && reward ? reward / risk : null;

    const summary = $('ticketSummary');
    if (summary) {
        summary.innerHTML = `
            <div class="row"><span class="k">${TICKET.orderType === 'limit' ? 'Limit price' : 'Reference price'}</span><span class="v">${px ? fmt(px) : '—'}</span></div>
            <div class="row"><span class="k">Estimated value</span><span class="v">${value === null ? '—' : '₹' + fmt(value)}</span></div>
            <div class="row"><span class="k">Est. commission</span><span class="v">${fee === null ? '—' : '₹' + fmt(fee)}</span></div>
            <div class="row"><span class="k">Risk if stopped</span><span class="v" style="color:${risk ? 'var(--orange)' : 'var(--text-muted)'}">${risk === null ? 'no stop set' : '₹' + fmt(risk)}</span></div>
            <div class="row"><span class="k">Planned R:R</span><span class="v">${rr === null ? '—' : rr.toFixed(2) + ' : 1'}</span></div>
            <div class="row"><span class="k">Cash after fill</span><span class="v">${value === null || !state.account ? '—' : '₹' + fmt(state.account.balance - (TICKET.side === 'buy' ? value + (fee || 0) : -value + (fee || 0)))}</span></div>`;
    }

    const submit = $('tSubmit');
    if (submit) submit.textContent = `REVIEW ${TICKET.side.toUpperCase()}`;
}

function ticketPrice() {
    const q = state.quotes[state.selectedSymbol];
    return q && isFinite(q.price) ? q.price : null;
}

/** Runs the server pre-check and renders risk + guardrail findings inline. */
async function ticketReview(afterBlock) {
    const host = $('ticketCheck');
    if (!host) return;
    host.innerHTML = '<div class="mini-empty">Running pre-trade checks…</div>';

    const r = await api('/api/v2/trades/pre-check', 'POST', {
        email: state.email,
        trade: {
            symbol: state.selectedSymbol, side: TICKET.side, quantity: TICKET.quantity,
            entryPrice: TICKET.orderType === 'limit' ? TICKET.limitPrice : ticketPrice(),
            stopLoss: TICKET.stopLoss, target: TICKET.target
        }
    });

    if (!r.success) {
        host.innerHTML = `<div class="discipline" style="border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.06)">
            <h5 style="color:var(--red)">Pre-trade check unavailable</h5>
            <div class="w">${escapeHtml(r.error || 'The risk engine could not price this trade.')}</div></div>`;
        return null;
    }

    const { risk, guardrail } = r.data;
    const blocks = (guardrail?.blocks || []);
    const warns = (guardrail?.warnings || []).concat(risk?.findings?.filter(f => f.level === 'MODERATE') || []);
    const levelColor = risk?.riskLevel === 'HIGH' ? 'var(--red)' : risk?.riskLevel === 'MODERATE' ? 'var(--orange)' : 'var(--green)';

    host.innerHTML = `
        <div class="discipline" style="border-color:${blocks.length ? 'rgba(245,158,11,.4)' : 'var(--border)'};background:${blocks.length ? 'rgba(245,158,11,.07)' : 'rgba(148,163,184,.03)'}">
            <h5 style="${blocks.length ? '' : 'color:var(--text-secondary)'}">
                ${blocks.length ? '⚠ Discipline check' : '✓ Pre-trade check'}
            </h5>
            <div class="w">Portfolio risk <b style="color:${levelColor}">${risk?.riskLevel || 'UNKNOWN'}</b>
                ${risk?.positionWeight != null ? `· this position would be <b>${risk.positionWeight}%</b> of the account` : ''}</div>
            ${blocks.map(b => `<div class="w">• <b>${escapeHtml(b.message)}</b><br><span class="dim" style="font-size:10.5px">${escapeHtml(b.evidence || '')}</span></div>`).join('')}
            ${warns.slice(0, 4).map(w => `<div class="w dim" style="font-size:10.5px">• ${escapeHtml(w.message)}</div>`).join('')}
            ${blocks.length ? `
                <div style="font-size:10.5px;color:var(--text-secondary)">Reason for this trade?</div>
                <div class="reason-opts" id="reasonOpts">
                    ${(guardrail.reasonOptions || ['Strategy Setup', 'Portfolio Hedge', 'Other']).map((o, i) =>
                        `<div class="chip-opt" onclick="pickReason(this)">${escapeHtml(o)}</div>`).join('')}
                </div>
                <button class="btn-order ${TICKET.side}" onclick="ticketSubmit(true)">CONFIRM OVERRIDE &amp; PLACE</button>`
            : ''}
        </div>`;

    return { risk, blocks };
}

function pickReason(el) {
    el.parentElement.querySelectorAll('.chip-opt').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
}

async function ticketSubmit(force) {
    if (!state.selectedSymbol) return showToast('Select a symbol first', 'warning');

    // First press reviews; the order only goes through after the checks are on
    // screen, and an override needs an explicit reason.
    let reason = null;
    if (force) {
        const active = document.querySelector('#reasonOpts .chip-opt.active');
        if (!active) return showToast('Choose a reason before overriding', 'warning');
        reason = active.textContent.trim();
    } else if (!$('ticketCheck')?.querySelector('.discipline')) {
        return ticketReview();
    }

    if (!TICKET.quantity || TICKET.quantity <= 0) return showToast('Quantity must be positive', 'warning');
    if (TICKET.orderType === 'limit' && !TICKET.limitPrice) return showToast('Enter a limit price', 'warning');

    const res = await submitOrder({
        symbol: state.selectedSymbol,
        side: TICKET.side,
        quantity: TICKET.quantity,
        orderType: TICKET.orderType,
        limitPrice: TICKET.orderType === 'limit' ? TICKET.limitPrice : undefined,
        stopLoss: TICKET.stopLoss || undefined,
        target: TICKET.target || undefined,
        strategy: TICKET.strategy,
        notes: TICKET.thesis || undefined,
        acknowledgeGuardrails: !!force,
        guardrailReason: reason || undefined
    });

    if (res.ok) {
        const o = res.order;
        showToast(`${o.side.toUpperCase()} ${o.quantity} ${o.symbol} · ${o.status}${o.avgFillPrice ? ' @ ' + fmt(o.avgFillPrice) : ''}`, 'success');
        captureThesis(o);
        const host = $('ticketCheck');
        if (host) host.innerHTML = '';
        dockTab('openOrders');
        return;
    }

    if (res.blocked) {
        renderBlockedCheck(res.warning);
        return;
    }

    showToast(res.error || 'Order rejected', 'error');
}

function renderBlockedCheck(warning) {
    const host = $('ticketCheck');
    if (!host) return;
    host.innerHTML = `
        <div class="discipline">
            <h5>⚠ Discipline check</h5>
            ${(warning.warnings || []).map(b => `<div class="w">• <b>${escapeHtml(b.message || b.type)}</b></div>`).join('')}
            <div style="font-size:10.5px;color:var(--text-secondary)">Reason for this trade?</div>
            <div class="reason-opts" id="reasonOpts">
                ${(warning.reasonOptions || ['Strategy Setup', 'Portfolio Hedge', 'Other']).map(o =>
                    `<div class="chip-opt" onclick="pickReason(this)">${escapeHtml(o)}</div>`).join('')}
            </div>
            <button class="btn-order ${TICKET.side}" onclick="ticketSubmit(true)">CONFIRM OVERRIDE &amp; PLACE</button>
        </div>`;
}

/**
 * Store the trade thesis against the order so the post-trade review can
 * compare what was planned with what actually happened.
 */
async function captureThesis(order) {
    if (!TICKET.thesis) return;
    const r = await api('/api/trades/thesis', 'POST', {
        email: state.email,
        thesis: {
            symbol: order.symbol,
            direction: order.side === 'buy' ? 'long' : 'short',
            entry: order.avgFillPrice || order.limitPrice,
            target: TICKET.target,
            stop: TICKET.stopLoss,
            strategy: TICKET.strategy,
            reasoning: TICKET.thesis,
            invalidation: TICKET.invalidation || null,
            orderId: order.id
        }
    });
    if (r.success) showToast('Thesis saved with the order', 'info', 2500);
}

// ========================================
// POSITION ACTIONS
// ========================================
async function quickClose(symbol, quantity) {
    const ok = await confirmDialog(`Close the entire ${symbol} position (${quantity} units) at the live quote?`);
    if (ok) closePosition(symbol, quantity);
}

function promptStop(symbol, current) {
    const next = window.prompt(`New stop loss for ${symbol}`, current || '');
    if (next === null) return;
    const v = parseFloat(next);
    if (!isFinite(v) || v <= 0) return showToast('Stop must be a positive number', 'warning');
    updatePositionStop(symbol, v);
}

/** Lightweight confirm dialog that resolves to a boolean. */
function confirmDialog(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `
            <div class="modal" style="max-width:420px">
                <div class="modal-header"><h3>Confirm</h3><span class="modal-close" data-close>✕</span></div>
                <div class="modal-body" style="font-size:12.5px;color:var(--text-secondary)">${escapeHtml(message)}</div>
                <div style="display:flex;gap:8px;padding:0 18px 18px">
                    <button class="btn" style="flex:1" data-close>Cancel</button>
                    <button class="btn primary" style="flex:1" data-ok>Confirm</button>
                </div>
            </div>`;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.hasAttribute('data-close')) { overlay.remove(); resolve(false); }
            if (e.target.hasAttribute('data-ok')) { overlay.remove(); resolve(true); }
        });
        document.body.appendChild(overlay);
    });
}
