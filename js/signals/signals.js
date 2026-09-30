/**
 * ProTrader — signals/signals
 *
 * Split from the terminal monolith; behaviour unchanged.
 */
// ==================== SIGNALS (ranked + conflict) ====================

/**
 * Fetch quotes and rank the moves as signals. One owner of signal shaping:
 * the signals view, the dashboard widget and the alert feed all call this, so
 * a signal is scored the same everywhere.
 */
async function fetchRankedSignals(symbols = []) {
    if (!symbols.length) return { quotes: [], ranked: [], alerts: null, error: 'No symbols to scan' };

    const q = await api('/api/v2/quotes?symbols=' + symbols.join(','));
    const quotes = q.success ? q.data : [];
    const signals = quotes
        .filter(x => x.price && x.changePercent !== undefined && Math.abs(x.changePercent) >= 0.15)
        .map(x => ({
            symbol: x.symbol,
            type: x.changePercent > 0 ? 'momentum_breakout' : 'momentum_fade',
            strategy: x.changePercent > 0 ? 'momentum_breakout' : 'mean_reversion',
            direction: x.changePercent > 0 ? 'bullish' : 'bearish',
            price: x.price,
            changePercent: x.changePercent,
            volumeRatio: x.volumeRatio || 1,
            created: new Date().toISOString(),
            evidenceFrom: x.dataQuality || x.source || 'live'
        }));

    if (!signals.length) return { quotes, ranked: [], alerts: null };

    const ctx = { regime: {}, watchlist: symbols.slice(0, 8), portfolioSymbols: state.quotes && Object.keys(state.quotes) };
    const r = await api('/api/signals/ranked', 'POST', { signals, context: ctx });
    if (!r.success) return { quotes, ranked: [], alerts: null, error: r.error };
    return { quotes, ranked: r.data.ranked, alerts: r.data.alerts };
}

async function renderSignals() {
    const p = $('centerPanel');
    p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">Loading signal radar...</div>';
    const symbols = state.instruments.slice(0, 18).map(i => i.symbol);
    const { quotes, ranked, alerts, error } = await fetchRankedSignals(symbols);

    if (error) { p.innerHTML = `<div style="padding:20px;color:var(--red)">${escapeHtml(error)}</div>`; return; }
    if (!ranked.length) {
        p.innerHTML = '<div style="padding:20px;color:var(--text-muted)">No qualifying moves right now — wait for the next quote refresh or lower the move threshold.</div>';
        return;
    }

    const tierBadge = (t) => t === 'TOP_PRIORITY' ? '<span class="badge green">TOP</span>' : t === 'MEDIUM' ? '<span class="badge orange">MED</span>' : '<span class="badge blue">LOW</span>';
    const bars = (s) => `
        <div style="display:grid;grid-template-columns:120px 1fr 40px;gap:6px;font-size:10px;color:var(--text-muted);margin:2px 0">
            ${['freshness','volumeConfirmation','regimeCompatibility','strategyMatch','liquidity','risk','relevance'].map(k => `
                <div style="display:contents"><span>${k.replace(/([A-Z])/g,' $1').toLowerCase()}</span>
                <div style="background:var(--bg-base);border-radius:2px;height:6px;align-self:center"><div style="height:6px;width:${Math.round(s.scoreBreakdown[k]||0)}%;border-radius:2px;background:${(s.scoreBreakdown[k]||0)>=60?'var(--green)':(s.scoreBreakdown[k]||0)>=35?'var(--orange)':'var(--red)'}"></div></div>
                <span style="font-family:var(--font-mono);text-align:right">${Math.round(s.scoreBreakdown[k]||0)}</span></div>`).join('')}
        </div>`;

    // Conflict analysis for the top signal
    const top = ranked[0];
    const cq = quotes.find(x => x.symbol === top.symbol);
    const conflictR = await api('/api/signals/conflict', 'POST', { factors: {
        price: cq && cq.changePercent > 0 ? 'bullish' : cq && cq.changePercent < 0 ? 'bearish' : 'neutral',
        volume: 'neutral', rsi: 'neutral', sector: 'neutral', market: 'neutral'
    }});

    p.innerHTML = `
        <div style="padding:16px">
            <div class="stat-grid">
                <div class="stat-card"><div class="label">Signals</div><div class="value">${ranked.length}</div></div>
                <div class="stat-card"><div class="label">TOP Priority</div><div class="value" style="color:var(--green)">${alerts.counts.top}</div></div>
                <div class="stat-card"><div class="label">MEDIUM</div><div class="value" style="color:var(--orange)">${alerts.counts.medium}</div></div>
                <div class="stat-card"><div class="label">LOW</div><div class="value">${alerts.counts.low}</div></div>
            </div>
            <div class="section-title">Smart Alerts — ranked by quality, not direction</div>
            ${['TOP_PRIORITY','MEDIUM','LOW'].map(tier => alerts.tiers[tier].length ? `
                <div class="card" style="border-color:${tier==='TOP_PRIORITY'?'var(--green)':tier==='MEDIUM'?'var(--orange)':'var(--border)'}">
                    <h4>${tierBadge(tier)} ${tier.replace('_',' ').toLowerCase()} — ${alerts.tiers[tier].length}</h4>
                    ${alerts.tiers[tier].map(s => `
                        <div style="border:1px solid var(--border);border-radius:6px;padding:8px;margin:6px 0">
                            <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="selectSymbol('${s.symbol}')">
                                <span style="font-family:var(--font-mono);font-weight:600">${s.symbol}</span>
                                <span style="font-size:11px">${s.type} · ${s.direction}</span>
                                <span style="font-family:var(--font-mono);font-size:13px;color:${s.direction==='bullish'?'var(--green)':'var(--red)'}">${sign(s.changePercent)}%</span>
                                <span style="font-family:var(--font-mono)"><b>${s.qualityScore}</b>/100</span>
                            </div>
                            ${bars(s)}
                            <div style="color:var(--text-secondary);font-size:10.5px;margin-top:3px">${s.reasons.join(' · ')}</div>
                            <div style="color:var(--text-muted);font-size:10px;margin-top:2px">evidence: ${s.evidenceFrom}</div>
                        </div>`).join('')}
                </div>` : '').join('')}

            ${conflictR.success && conflictR.data ? `
            <div class="section-title">Signal Conflict — top signal factors</div>
            <div class="card" style="border-color:${conflictR.data.hasConflict?'var(--orange)':'var(--border-accent)'}">
                <div style="font-size:12px">${conflictR.data.conflict}</div>
                <div class="metric-row"><span class="metric-label">Lean</span><span class="metric-value" style="color:${conflictR.data.lean.includes('bull')?'var(--green)':conflictR.data.lean.includes('bear')?'var(--red)':'var(--text-secondary)'}">${conflictR.data.lean}</span></div>
                <div style="margin-top:6px;font-size:11px;color:var(--text-secondary)">${conflictR.data.recommendation}</div>
                <div style="margin-top:6px;font-size:10px;color:var(--text-muted)">Volume/RSI/sector factors: DATA UNAVAILABLE in demo — shown neutral, never assumed.</div>
            </div>` : ''}
        </div>`;
}
