/**
 * ProTrader — views/journal
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== JOURNAL ====================
async function renderJournal() {
    const p = $('centerPanel');
    const [journalR, stratR] = await Promise.all([
        api('/api/v2/journal/demo@college.com'),
        api('/api/v2/strategy/dimensions')
    ]);
    const trades = journalR.success ? journalR.data : [];

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Closed Trades</div><div class="value">${trades.length}</div></div>
                <div class="stat-card"><div class="label">Open Positions</div><div class="value">${trades.length}</div></div>
            </div>
            <div class="card" style="border-color:var(--border-accent)">
                <h4>📝 Demo: Record a Trade</h4>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <select id="journalSym" style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                        ${['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK'].map(s => `<option>${s}</option>`).join('')}
                    </select>
                    <input id="journalQty" type="number" value="10" style="width:70px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <input id="journalEntry" type="number" placeholder="Entry" style="width:80px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <input id="journalStop" type="number" placeholder="Stop" style="width:80px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <input id="journalTarget" type="number" placeholder="Target" style="width:80px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:5px;padding:6px;color:var(--text-primary)">
                    <button class="btn primary small" onclick="recordDemoTrade()">Open Trade</button>
                </div>
            </div>
            <div class="section-title">Trade History</div>
            <table>
                <thead><tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&L</th><th>R:R</th><th>Review</th></tr></thead>
                <tbody>
                ${trades.slice().reverse().map(t => `
                    <tr>
                        <td style="font-weight:600">${t.symbol}</td>
                        <td class="${t.direction==='long'?'up':'down'}">${t.direction}</td>
                        <td>${t.entryPrice}</td>
                        <td>${t.exitPrice}</td>
                        <td class="${cls(t.pnl)}">${sign(t.pnl)}</td>
                        <td>${t.riskReward?.toFixed(1) || '—'}</td>
                        <td style="font-family:var(--font-sans);font-size:11px;color:var(--text-secondary)" title="${t.review?.summary||''}">${t.review?.score || '—'}/100</td>
                    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No trades yet — record one above</td></tr>'}
                </tbody>
            </table>
        </div>`;
}

async function recordDemoTrade() {
    const r = await api('/api/v2/journal/open', 'POST', {
        email: 'demo@college.com',
        trade: {
            symbol: $('journalSym').value,
            type: 'buy',
            quantity: parseInt($('journalQty').value) || 10,
            entryPrice: parseFloat($('journalEntry').value) || 2400,
            stopLoss: parseFloat($('journalStop').value) || null,
            target: parseFloat($('journalTarget').value) || null,
            strategy: 'demo',
            sector: 'Energy'
        }
    });
    if (r.success) {
        // Immediately close for demo demonstration
        const exitPrice = (parseFloat($('journalEntry').value) || 2400) * (1 + (Math.random() - 0.3) * 0.02);
        await api('/api/v2/journal/close', 'POST', { email: 'demo@college.com', tradeId: r.data.id, exitPrice });
        renderJournal();
    }
}
