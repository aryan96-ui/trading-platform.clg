/**
 * ProTrader — views/risk
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== RISK ====================
async function renderRisk() {
    const p = $('centerPanel');
    // Build a demo portfolio from journal trades
    const journalR = await api('/api/v2/journal/demo@college.com');
    const trades = journalR.success ? journalR.data : [];

    const holdings = [
        { symbol: 'RELIANCE', quantity: 10, avgPrice: 2400, currentPrice: state.quotes['RELIANCE']?.price || 2450, sector: 'Energy', assetType: 'stock' },
        { symbol: 'TCS', quantity: 5, avgPrice: 3200, currentPrice: state.quotes['TCS']?.price || 3280, sector: 'IT', assetType: 'stock' },
        { symbol: 'BTC', quantity: 0.1, avgPrice: 60000, currentPrice: state.quotes['BTC']?.price || 65000, sector: 'Cryptocurrency', assetType: 'crypto' }
    ];

    const riskR = await api('/api/v2/risk/analyze', 'POST', { portfolio: { holdings } });

    if (!riskR.success) { p.innerHTML = `<div style="color:var(--red)">${riskR.error}</div>`; return; }
    const d = riskR.data;

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Total Value</div><div class="value">₹${fmt(d.summary.totalValue)}</div></div>
                <div class="stat-card"><div class="label">Total P&L</div><div class="value ${cls(d.summary.totalPnl)}">${sign(d.summary.totalPnl)}</div></div>
                <div class="stat-card"><div class="label">Concentration</div><div class="value" style="font-size:12px;color:${d.concentration.risk==='HIGH'?'var(--red)':d.concentration.risk==='MODERATE'?'var(--orange)':'var(--green)'}">${d.concentration.risk}</div></div>
                <div class="stat-card"><div class="label">Diversification</div><div class="value" style="font-size:12px">${d.summary.sectorDiversification}</div></div>
            </div>
            <div class="section-title">Sector Exposure</div>
            <div class="card">
                ${d.sectorExposure.map(s => `
                    <div class="metric-row">
                        <span class="metric-label">${s.name}</span>
                        <span class="metric-value">${s.weight.toFixed(1)}% · ${fmt(s.value)}</span>
                    </div>`).join('')}
            </div>
            <div class="section-title">Stress Tests — what happens if...</div>
            <table>
                <thead><tr><th>Scenario</th><th>Impact</th><th style="text-align:right">Portfolio After</th></tr></thead>
                <tbody>
                ${d.stressTests.map(s => `
                    <tr>
                        <td style="font-family:var(--font-sans)">${s.name}<div style="color:var(--text-muted);font-size:10px">${s.description}</div></td>
                        <td class="down">${s.impact.toFixed(0)}</td>
                        <td style="text-align:right">₹${fmt(s.portfolioAfter)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="section-title">Recommendations</div>
            <div class="card" style="border-color:var(--blue)">
                <div class="metric-row"><span class="metric-label">Risk per trade (2%)</span><span class="metric-value">₹${fmt(d.recommendations.riskPerTrade)}</span></div>
                <div class="metric-row"><span class="metric-label">Max position size</span><span class="metric-value">₹${fmt(d.recommendations.maxPositionSize)}</span></div>
                <div style="margin-top:8px;color:var(--text-secondary);font-size:12px">${d.recommendations.suggestion}</div>
            </div>
        </div>`;
}
