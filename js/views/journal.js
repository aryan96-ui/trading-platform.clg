/**
 * ProTrader — views/journal
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== JOURNAL ====================
async function renderJournal() {
    const p = $('centerPanel');
    const [journalR, openR] = await Promise.all([
        api('/api/v2/journal/demo@college.com'),
        api('/api/v2/journal/open')
    ]);
    const trades = journalR.success ? journalR.data : [];
    const openTrades = openR.success && Array.isArray(openR.data) ? openR.data : [];

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Closed Trades</div><div class="value">${trades.length}</div></div>
                <div class="stat-card"><div class="label">Open Positions</div><div class="value">${openTrades.length}</div></div>
            </div>
            <div class="card" style="border-color:var(--border-accent)">
                <h4>📝 Demo: Record a Trade</h4>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <select id="journalSym" onchange="journalPrefill()" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                        ${['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK'].map(s => `<option>${s}</option>`).join('')}
                    </select>
                    <input id="journalQty" type="number" value="10" style="width:70px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <input id="journalEntry" type="number" placeholder="Entry" style="width:80px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <input id="journalStop" type="number" placeholder="Stop" style="width:80px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <input id="journalTarget" type="number" placeholder="Target" style="width:80px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <button class="btn primary small" onclick="recordDemoTrade()">Open Trade</button>
                </div>
                <div id="journalQuoteNote" style="font-size:10px;color:var(--text-muted);margin-top:6px">Entry, stop and target are prefilled from the live gateway quote — edit them if you are logging a past trade.</div>
            </div>
            <div class="section-title">Trade History</div>
            <table>
                <thead><tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&L</th><th>R:R</th><th>Review</th></tr></thead>
                <tbody>
                ${trades.slice().reverse().map(t => `
                    <tr>
                        <td style="font-weight:600">${t.symbol}</td>
                        <td class="${t.direction==='long'?'up':'down'}">${t.direction}</td>
                        <td>${fmt(t.entryPrice)}</td>
                        <td>${t.exitPrice == null ? '<span class="dim">open</span>' : fmt(t.exitPrice)}</td>
                        <td class="${cls(t.pnl)}">${t.pnl == null ? '—' : sign(t.pnl)}</td>
                        <td>${t.riskReward?.toFixed(1) || '—'}</td>
                        <td style="font-family:var(--font-sans);font-size:11px;color:var(--text-secondary)" title="${t.review?.summary||''}">${t.review?.score || '—'}/100</td>
                    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No trades yet — record one above</td></tr>'}
                </tbody>
            </table>
        </div>`;

    journalPrefill();
}

/** Prefill the log form from the live quote so a logged trade starts from real prices. */
async function journalPrefill() {
    const symbol = ($('journalSym')?.value || '').trim().toUpperCase();
    const note = $('journalQuoteNote');
    if (!symbol) return;
    const q = await api('/api/v2/quote/' + encodeURIComponent(symbol));
    const price = q.success ? Number(q.data?.price) : NaN;
    if (!isFinite(price)) {
        if (note) note.innerHTML = `<span style="color:var(--orange)">No quote for ${escapeHtml(symbol)} — enter prices manually.</span>`;
        return;
    }
    $('journalEntry').value = price.toFixed(2);
    $('journalStop').value = (price * 0.97).toFixed(2);
    $('journalTarget').value = (price * 1.06).toFixed(2);
    if (note) note.innerHTML = `Prefilled from the live ${(q.data.source || 'gateway').toUpperCase()} quote (${fmt(price)}) — edit if you are logging a past trade.`;
}

async function recordDemoTrade() {
    const symbol = ($('journalSym').value || '').trim().toUpperCase();
    if (!symbol) return showToast('Enter a symbol first', 'warning');

    const entryPrice = parseFloat($('journalEntry').value);
    if (!isFinite(entryPrice) || entryPrice <= 0) {
        return showToast('Enter or prefill an entry price — the journal never invents one', 'warning');
    }

    const r = await api('/api/v2/journal/open', 'POST', {
        email: 'demo@college.com',
        trade: {
            symbol,
            type: 'buy',
            quantity: parseInt($('journalQty').value) || 10,
            entryPrice,
            stopLoss: parseFloat($('journalStop').value) || null,
            target: parseFloat($('journalTarget').value) || null,
            strategy: 'demo',
            sector: 'Energy'
        }
    });
    if (!r.success) {
        showToast(r.error || 'Could not record the trade', 'error');
        return;
    }

    // Close against the live gateway quote. This used to invent an exit price
    // with Math.random(), which wrote a fabricated outcome into the journal that
    // the behaviour and strategy analytics then reasoned over.
    const q = await api('/api/v2/quote/' + encodeURIComponent(symbol));
    const price = q.success ? Number(q.data?.price) : NaN;
    if (!isFinite(price)) {
        showToast(`${symbol} left open — no quote available to close against`, 'warning');
        renderJournal();
        return;
    }

    await api('/api/v2/journal/close', 'POST', { email: 'demo@college.com', tradeId: r.data.id, exitPrice: price });
    showToast(`Closed ${symbol} at the live ${(q.data.source || 'gateway').toUpperCase()} quote ${price}`, 'info');
    renderJournal();
}
