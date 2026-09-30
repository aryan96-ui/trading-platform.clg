/**
 * Personal Trading Memory (TraderProfile)
 * 
 * Learns from the user's historical trading behavior:
 * - Preferred strategies and setups (by win rate + expectancy)
 * - Best/worst symbols and sectors
 * - Successful vs weak market regimes
 * - Average risk, holding period, R multiple
 * - Behavioral patterns
 * 
 * Used to personalize AI analysis (Module 23) and strategy × regime checks.
 */
class TraderProfile {
    constructor() {
        this.profiles = new Map(); // email → profile
    }

    /**
     * Build (or rebuild) a trader profile from closed trades
     */
    buildProfile(email, trades = []) {
        if (trades.length === 0) {
            const empty = {
                email,
                tradeCount: 0,
                message: 'No trading history yet — profile will form after your first trades.',
                disclaimer: 'Profile is based on observable trading behavior and outcomes only.',
                timestamp: new Date().toISOString()
            };
            this.profiles.set(email, empty);
            return empty;
        }

        const profile = {
            email,
            tradeCount: trades.length,
            builtFrom: trades.length >= 30 ? 'adequate_sample' : 'small_sample',
            sampleNote: trades.length < 30
                ? `${trades.length} trades — conclusions are directional, not statistically significant.`
                : 'Sample adequate for preliminary profile.',
            timestamp: new Date().toISOString(),
            disclaimer: 'Profile is based on observable trading behavior and outcomes only. It is not a psychological assessment.'
        };

        // ===== Strategy performance =====
        profile.strategies = this._groupPerformance(trades, 'strategy');

        // ===== Setup performance =====
        profile.setups = this._groupPerformance(trades, 'setup');

        // ===== Symbol performance =====
        profile.symbols = this._groupPerformance(trades, 'symbol');

        // ===== Sector performance =====
        profile.sectors = this._groupPerformance(trades, 'sector');

        // ===== Regime performance =====
        profile.regimes = this._groupPerformance(trades, 'marketRegime');

        // ===== Averages =====
        profile.averages = {
            riskPerTrade: parseFloat((trades.reduce((a, t) => a + (t.riskTaken || 0), 0) / trades.length).toFixed(2)),
            holdingHours: parseFloat((trades.reduce((a, t) => a + (t.durationHours || 0), 0) / trades.length).toFixed(2)),
            riskReward: parseFloat((trades.reduce((a, t) => a + (t.riskReward || 0), 0) / trades.length).toFixed(2)),
            positionValue: parseFloat((trades.reduce((a, t) => a + (t.quantity || 0) * (t.entryPrice || 0), 0) / trades.length).toFixed(2))
        };

        // ===== Best / worst =====
        profile.best = this._bestWorst(profile);
        profile.worst = this._bestWorst(profile, false);

        // ===== Behavior highlights =====
        profile.behaviorHighlights = this._behaviorHighlights(trades);

        // ===== Text summary =====
        profile.summary = this._summarize(profile);

        this.profiles.set(email, profile);
        return profile;
    }

    _groupPerformance(trades, key) {
        const groups = new Map();
        for (const t of trades) {
            const k = t[key] || 'unspecified';
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(t);
        }

        return [...groups.entries()]
            .filter(([, ts]) => ts.length >= 3) // need ≥3 trades for any signal
            .map(([name, ts]) => {
                const wins = ts.filter(t => (t.pnl || 0) > 0);
                const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
                const grossLoss = Math.abs(ts.filter(t => (t.pnl || 0) <= 0).reduce((a, t) => a + t.pnl, 0));
                return {
                    key: name,
                    tradeCount: ts.length,
                    winRate: parseFloat(((wins.length / ts.length) * 100).toFixed(1)),
                    totalPnl: parseFloat(ts.reduce((a, t) => a + (t.pnl || 0), 0).toFixed(2)),
                    expectancy: parseFloat((ts.reduce((a, t) => a + (t.pnl || 0), 0) / ts.length).toFixed(2)),
                    profitFactor: grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? '∞' : 0)
                };
            })
            .sort((a, b) => b.totalPnl - a.totalPnl);
    }

    _bestWorst(profile, best = true) {
        const candidates = [];
        for (const dim of ['strategies', 'setups', 'symbols', 'sectors', 'regimes']) {
            const list = profile[dim] || [];
            if (list.length > 0) {
                const top = best ? list[0] : list[list.length - 1];
                candidates.push({ dimension: dim.slice(0, -1), key: top.key, winRate: top.winRate, totalPnl: top.totalPnl, tradeCount: top.tradeCount });
            }
        }
        return candidates.slice(0, 3);
    }

    _behaviorHighlights(trades) {
        const highlights = [];
        const wins = trades.filter(t => (t.pnl || 0) > 0);
        const losses = trades.filter(t => (t.pnl || 0) < 0);

        // Premature exits: avg win R:R low despite win rate
        const winRate = wins.length / trades.length;
        const avgWinRR = wins.length > 0 ? wins.reduce((a, t) => a + (t.riskReward || 0), 0) / wins.length : 0;
        if (winRate > 0.55 && avgWinRR < 1.2) {
            highlights.push({ type: 'premature_exits', text: 'Wins are frequent but small — possible early exits on winners.' });
        }

        // Holding losers longer
        const avgWinHold = wins.length > 0 ? wins.reduce((a, t) => a + (t.durationHours || 0), 0) / wins.length : 0;
        const avgLossHold = losses.length > 0 ? losses.reduce((a, t) => a + (t.durationHours || 0), 0) / losses.length : 0;
        if (avgLossHold > avgWinHold * 1.5 && avgWinHold > 0) {
            highlights.push({ type: 'losers_longer', text: `Losing positions held ${(avgLossHold / avgWinHold).toFixed(1)}x longer than winners.` });
        }

        return highlights;
    }

    _summarize(profile) {
        const parts = [];
        if (profile.best && profile.best.length) {
            parts.push(`Best: ${profile.best[0].key} in ${profile.best[0].dimension} (${profile.best[0].winRate}% win rate).`);
        }
        if (profile.worst && profile.worst.length) {
            parts.push(`Weak: ${profile.worst[0].key} in ${profile.worst[0].dimension}.`);
        }
        if (profile.behaviorHighlights.length) {
            parts.push(`Behavior: ${profile.behaviorHighlights[0].text}`);
        }
        return parts.join(' ') || 'Profile forming — more trades needed.';
    }

    /**
     * Get a cached profile
     */
    getProfile(email) {
        return this.profiles.get(email) || null;
    }

    /**
     * Produce the AI-personalization context snippet
     */
    toAIContext(email) {
        const p = this.getProfile(email);
        if (!p || p.tradeCount === 0) {
            return { available: false, message: 'No personal trading history available.' };
        }
        return {
            available: true,
            tradeCount: p.tradeCount,
            sampleNote: p.sampleNote,
            best: p.best,
            worst: p.worst,
            averages: p.averages,
            strategies: p.strategies.slice(0, 3),
            behaviorHighlights: p.behaviorHighlights,
            summary: p.summary
        };
    }
}

module.exports = TraderProfile;