/**
 * ProTrader — portfolio/portfolio
 *
 * The Portfolio view: account summary, exposure analytics, per-symbol P&L and
 * the live holdings table. It renders `state.account`, `state.analytics` and
 * `state.pnl` — all owned by core/account — and asks that owner to refresh.
 */

async function renderPortfolio() {
    const p = $('centerPanel');
    if (!p) return;
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading portfolio…</div>';

    await Promise.all([refreshAccountData(), refreshAnalytics(), refreshPnl()]);

    const a = state.account;
    const an = state.analytics;
    const pnl = state.pnl;

    if (!a) {
        p.innerHTML = `<div style="padding:20px" class="mini-empty">${state.accountError || 'Account data unavailable'}</div>`;
        return;
    }

    const positions = a.positions || [];
    const equity = a.equity || 1;

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                ${stat('Equity', '₹' + fmt(a.equity))}
                ${stat('Total P&L', '₹' + fmt(a.totalPnl), colorOf(a.totalPnl))}
                ${stat('Return', sign(a.returnPercent) + '%', colorOf(a.returnPercent))}
                ${stat('Unrealised', '₹' + fmt(a.unrealizedPnl), colorOf(a.unrealizedPnl))}
                ${stat('Realised', '₹' + fmt(a.realizedPnl), colorOf(a.realizedPnl))}
                ${stat('Cash', '₹' + fmt(a.balance))}
                ${stat('Invested', '₹' + fmt(a.marketValue))}
                ${stat('Fees paid', '₹' + fmt(a.feesPaid))}
            </div>

            <div style="display:flex;gap:8px;margin-bottom:4px">
                <button class="btn small primary" onclick="switchView('chart')">Open order ticket</button>
                <button class="btn small" onclick="dockTab('holdings')">Holdings dock</button>
                <button class="btn small" onclick="dockTab('pnl')">P&amp;L dock</button>
                <button class="btn small" onclick="refreshAccountData();refreshAnalytics();refreshPnl()">↻ Refresh</button>
            </div>

            <div class="section-title">Holdings — ${positions.length} position${positions.length === 1 ? '' : 's'}</div>
            ${positions.length ? table(['Symbol', 'Qty', 'Avg', 'LTP', 'Value', 'Weight', 'Unrealised', 'Source', 'Actions'],
                positions.map(q => `<tr>
                    <td onclick="selectSymbol('${q.symbol}')" style="cursor:pointer"><b>${q.symbol}</b> <span class="dim" style="font-family:var(--font-sans)">${q.sector || ''}</span></td>
                    <td>${q.quantity}</td>
                    <td>${fmt(q.avgPrice)}</td>
                    <td>${q.currentPrice === null ? '<span class="dim">UNAVAILABLE</span>' : fmt(q.currentPrice)}</td>
                    <td>${q.marketValue === null ? '—' : '₹' + fmt(q.marketValue)}</td>
                    <td>${q.marketValue === null ? '—' : ((q.marketValue / equity) * 100).toFixed(1) + '%'}</td>
                    <td class="${cls(q.unrealizedPnl)}">${q.unrealizedPnl === null ? '—' : '₹' + fmt(q.unrealizedPnl)}</td>
                    <td style="font-family:var(--font-sans)"><span class="badge ${q.priceSource === 'gateway' ? 'blue' : 'purple'}">${q.priceSource || '—'}</span></td>
                    <td>
                        <span class="btn small" onclick="quickClose('${q.symbol}',${q.quantity})">Close</span>
                        <span class="btn small" onclick="promptStop('${q.symbol}',${q.stopLoss || 0})">Stop</span>
                    </td>
                </tr>`))
                : `<div class="empty-state"><div class="icon">📦</div><div class="title">No positions yet</div><div class="desc">Place a paper order from the chart's order ticket — it is priced from the same gateway quote the chart uses, and appears here immediately.</div></div>`}

            <div class="section-title">Exposure analytics</div>
            ${an ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div>
                    <div class="kv-grid" style="margin-bottom:10px">
                        ${kv('Gross', '₹' + fmt(an.exposure.gross))}
                        ${kv('Invested', an.exposure.investedPercent + '%')}
                        ${kv('Concentration', an.concentration.hhi + ' · ' + an.concentration.level, an.concentration.level === 'HIGH' ? 'var(--red)' : an.concentration.level === 'MODERATE' ? 'var(--orange)' : 'var(--green)')}
                    </div>
                    ${(an.bySector || []).map(s => barRow(s.sector, s.percent, '₹' + fmt(s.value))).join('') || '<div class="mini-empty">No sector exposure</div>'}
                </div>
                <div>
                    ${an.concentration.largestPosition ? `<div class="card"><h4>Largest position</h4>
                        <div class="metric-row"><span class="metric-label">${an.concentration.largestPosition.symbol}</span><span class="metric-value">${an.concentration.largestPosition.percent}% of equity</span></div>
                    </div>` : ''}
                    <div class="card"><h4>P&amp;L by symbol</h4>
                        ${pnl && pnl.bySymbol.length
                            ? pnl.bySymbol.map(s => `<div class="metric-row"><span class="metric-label">${s.symbol}</span>
                                <span class="metric-value ${cls(s.realized)}">realised ₹${fmt(s.realized)} <span class="dim">· unreal ${s.unrealized == null ? '—' : '₹' + fmt(s.unrealized)}</span></span></div>`).join('')
                            : '<div class="mini-empty">No fills yet</div>'}
                    </div>
                </div>
            </div>` : '<div class="mini-empty">Analytics unavailable</div>'}
        </div>`;
}

function stat(label, value, color) {
    return `<div class="stat-card"><div class="label">${label}</div><div class="value" style="${color ? 'color:' + color + ';-webkit-text-fill-color:' + color : ''}">${value}</div></div>`;
}
