/**
 * ProTrader — views/reviews
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== TRADE REVIEWS (post-trade learning) ====================
async function renderReviews() {
    const p = $('centerPanel');
    const r = await api('/api/v2/journal/demo@college.com');
    const trades = (r.success ? r.data : []).filter(t => t.exitPrice !== undefined).slice().reverse();
    if (!trades.length) {
        p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">No closed trades yet — open and close a trade in the Journal tab.</div>';
        return;
    }
    const clsColor = (c) => c && c.includes('GOOD TRADE') ? 'var(--green)' : 'var(--red)';
    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Reviews</div><div class="value">${trades.length}</div></div>
                <div class="stat-card"><div class="label">Good decisions</div><div class="value" style="color:var(--green)">${trades.filter(t => t.review && t.review.decision && t.review.decision.label === 'GOOD TRADE').length}</div></div>
                <div class="stat-card"><div class="label">Rule violations</div><div class="value" style="color:var(--red)">${trades.filter(t => t.review && t.review.decision && t.review.decision.label === 'BAD TRADE').length}</div></div>
            </div>
            <div class="section-title">Trade Reviews — decision quality is separate from P&L</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px">A profitable trade can be a BAD decision (rules violated). A losing trade can be a GOOD decision (followed strategy, controlled risk). Click a trade for the full review.</div>
            <table>
                <thead><tr><th>Symbol</th><th>Decision</th><th>Result</th><th>P&L</th><th>R:R</th><th>Entry</th><th>Exit</th><th>Regime</th><th></th></tr></thead>
                <tbody>
                ${trades.slice(0, 40).map(t => {
                    const review = t.review || {};
                    const decision = review.decision || {};
                    const result = review.result || {};
                    return `<tr style="cursor:pointer" onclick="showTradeReview('${t.id}')">
                        <td style="font-weight:600">${t.symbol}</td>
                        <td style="color:${decision.label === 'GOOD TRADE' ? 'var(--green)' : 'var(--red)'}">${decision.label || '—'}</td>
                        <td style="color:${t.pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${result.label || (t.pnl >= 0 ? 'GOOD RESULT' : 'BAD RESULT')}</td>
                        <td class="${cls(t.pnl)}">${sign(t.pnl)}</td>
                        <td>${(t.riskReward||0).toFixed(1)}</td>
                        <td>${t.entryPrice}</td>
                        <td>${t.exitPrice}</td>
                        <td style="font-size:10px">${t.marketRegime || '—'}</td>
                        <td style="color:var(--blue)">→</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
            <div id="tradeReviewDetail" style="margin-top:14px"></div>
        </div>`;
}

async function showTradeReview(tradeId) {
    const el = $('tradeReviewDetail');
    el.innerHTML = '<div style="color:var(--text-secondary);padding:6px">Loading review...</div>';
    const [revR, execR] = await Promise.all([
        api('/api/trades/' + tradeId + '/review'),
        api('/api/execution/' + tradeId)
    ]);
    if (!revR.success) { el.innerHTML = `<div style="color:var(--red)">${revR.error}</div>`; return; }
    const t = revR.data;
    const rev = t.review;
    const exec = execR.success ? execR.data : null;
    const q = (label, v) => v !== undefined && v !== null && v !== '' ? `<div class="ev-row"><span class="k">${label}</span><span class="v">${v}</span></div>` : '';
    el.innerHTML = `
        <div style="border:1px solid var(--border-accent);border-radius:8px;padding:12px;background:var(--bg-elevated)">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                <b style="font-size:13px">${rev.symbol} — ${rev.classification}</b>
                <span style="font-size:11px;color:var(--text-muted)">reviewed ${new Date(rev.timestamp).toLocaleString()}</span>
            </div>
            <div style="margin-top:10px">
                <div class="ev-row"><span class="k">What happened</span><span class="v">${rev.sections.whatHappened}</span></div>
                <div class="ev-row"><span class="k">Why it happened</span><span class="v">${rev.sections.whyItHappened}</span></div>
                <div class="ev-row"><span class="k">Strategy followed</span><span class="v">${rev.sections.strategyFollowed}</span></div>
                <div class="ev-row"><span class="k">Market regime</span><span class="v">${rev.sections.marketRegime}</span></div>
                ${q('Entry quality', rev.entryQuality.score + '/100 ' + rev.entryQuality.quality)}
                ${q('Exit quality', rev.exitQuality.score + '/100 ' + rev.exitQuality.quality)}
                ${q('Risk quality', rev.riskQuality.score + '/100 ' + rev.riskQuality.quality)}
                ${rev.relative && rev.relative.available ? q('vs benchmark', rev.relative.interpretation) : ''}
            </div>
            <div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap">
                <div style="flex:1;min-width:220px">
                    <div style="font-size:10px;color:var(--green);text-transform:uppercase">Went well / repeat</div>
                    ${(rev.sections.whatWentWell || []).map(x => `<div style="font-size:11px;padding:1px 0">• ${x}</div>`).join('') || '<div style="font-size:10px;color:var(--text-muted)">—</div>'}
                    ${(rev.sections.shouldRepeat || []).map(x => `<div style="font-size:11px;padding:1px 0;color:var(--text-secondary)">↻ ${x}</div>`).join('')}
                </div>
                <div style="flex:1;min-width:220px">
                    <div style="font-size:10px;color:var(--red);text-transform:uppercase">Went wrong / avoid</div>
                    ${(rev.sections.whatWentWrong || []).map(x => `<div style="font-size:11px;padding:1px 0">• ${x}</div>`).join('') || '<div style="font-size:10px;color:var(--text-muted)">—</div>'}
                    ${(rev.sections.shouldAvoid || []).map(x => `<div style="font-size:11px;padding:1px 0;color:var(--text-secondary)">✕ ${x}</div>`).join('')}
                </div>
            </div>
            ${rev.aiLesson && rev.aiLesson.length ? `<div style="margin-top:10px;font-size:12px;color:var(--cyan)"><b>AI lesson:</b> ${rev.aiLesson.join(' ')}</div>` : ''}

            ${exec ? `
            <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">
                <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase">Execution quality ${exec.simulated ? '(simulated — paper trade)' : ''}</div>
                <div class="ev-row"><span class="k">Entry slippage</span><span class="v">${exec.entrySlippage} (${exec.entrySlippageBps} bps)</span></div>
                <div class="ev-row"><span class="k">Exit slippage</span><span class="v">${exec.exitSlippage} (${exec.exitSlippageBps} bps)</span></div>
                <div class="ev-row"><span class="k">Est. total cost</span><span class="v">${fmt(exec.totalEstimatedCost)}</span></div>
                <div class="ev-row"><span class="k">Quality</span><span class="v" style="color:${exec.quality.score >= 70 ? 'var(--green)' : exec.quality.score >= 45 ? 'var(--orange)' : 'var(--red)'}">${exec.quality.score}/100 — ${exec.quality.grade}</span></div>
                <div style="font-size:10.5px;color:var(--text-secondary);margin-top:4px">${exec.explanation}</div>
                <div style="font-size:9.5px;color:var(--text-muted);margin-top:3px">${exec.disclaimer}</div>
            </div>` : ''}
        </div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
