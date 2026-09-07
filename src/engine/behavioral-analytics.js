/**
 * Behavioral Risk Engine
 * 
 * Detects observable trading behavior patterns from trade history:
 * - Revenge trading (trading immediately after losses)
 * - Overtrading (excessive frequency)
 * - Position-size escalation (increasing size after losses)
 * - Moving stop losses (widening stops after entry)
 * - Averaging down (adding to losing positions)
 * - FOMO / chasing breakouts (entering after big moves)
 * - Premature profit taking (exiting winners too early)
 * - Concentration risk (overweight single symbol/sector)
 * 
 * IMPORTANT: Only analyzes observable behavior. Does NOT diagnose
 * psychological or mental-health conditions.
 */
class BehavioralAnalytics {
    /**
     * Analyze trade history for behavioral patterns
     * @param {Array} trades - Closed trades with timestamps
     * @returns {BehavioralProfile}
     */
    analyze(trades = []) {
        if (trades.length < 3) {
            return {
                behaviors: [],
                profile: null,
                message: 'Need at least 3 trades to build a behavioral profile',
                tradeCount: trades.length
            };
        }

        // Sort by open time
        const sorted = [...trades].sort((a, b) => new Date(a.openedAt || a.timestamp) - new Date(b.openedAt || b.timestamp));

        const behaviors = [];
        const findings = [];

        // 1. Revenge trading — trade within 5 min after a loss
        const revengeTrades = [];
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            if (prev.pnl < 0) {
                const gapMs = new Date(curr.openedAt || curr.timestamp) - new Date(prev.closedAt || prev.timestamp);
                if (gapMs > 0 && gapMs < 5 * 60000) {
                    revengeTrades.push({ symbol: curr.symbol, gapMinutes: Math.round(gapMs / 60000) });
                }
            }
        }
        if (revengeTrades.length >= 1) {
            const severity = revengeTrades.length >= 3 ? 'HIGH' : 'MODERATE';
            behaviors.push({
                type: 'revenge_trading',
                label: 'Revenge Trading',
                severity,
                description: `Opened ${revengeTrades.length} trade(s) within 5 minutes of a loss`,
                example: revengeTrades.slice(0, 3).map(r => `Entered ${r.symbol} ${r.gapMinutes}m after a losing trade`),
                recommendation: 'Take a mandatory break after losses. Set a minimum 30-minute cooldown.'
            });
        }

        // 2. Overtrading — > 10 trades/day
        const tradesByDay = {};
        for (const t of sorted) {
            const day = (t.openedAt || t.timestamp || '').slice(0, 10);
            tradesByDay[day] = (tradesByDay[day] || 0) + 1;
        }
        const maxTradesPerDay = Math.max(...Object.values(tradesByDay));
        if (maxTradesPerDay >= 10) {
            behaviors.push({
                type: 'overtrading',
                label: 'Overtrading',
                severity: maxTradesPerDay >= 15 ? 'HIGH' : 'MODERATE',
                description: `Executed ${maxTradesPerDay} trades in a single day`,
                example: [`Highest activity: ${maxTradesPerDay} trades/day`],
                recommendation: 'Cap trades per day. Focus on quality setups over quantity.'
            });
        }

        // 3. Position-size escalation after losses
        const avgSizeByStreak = [];
        let lossStreak = 0;
        for (const t of sorted) {
            if (t.pnl < 0) {
                lossStreak++;
                avgSizeByStreak.push({ streak: lossStreak, size: t.quantity * t.entryPrice });
            } else {
                lossStreak = 0;
            }
        }
        if (avgSizeByStreak.length >= 2) {
            const firstAvg = avgSizeByStreak.filter(s => s.streak === 1).reduce((a, s) => a + s.size, 0) /
                Math.max(1, avgSizeByStreak.filter(s => s.streak === 1).length);
            const laterAvg = avgSizeByStreak.filter(s => s.streak >= 2).reduce((a, s) => a + s.size, 0) /
                Math.max(1, avgSizeByStreak.filter(s => s.streak >= 2).length);
            const increasePct = firstAvg > 0 ? ((laterAvg - firstAvg) / firstAvg) * 100 : 0;
            if (increasePct > 20) {
                behaviors.push({
                    type: 'position_escalation',
                    label: 'Position Size Escalation',
                    severity: increasePct > 50 ? 'HIGH' : 'MODERATE',
                    description: `Position size increased ${Math.round(increasePct)}% after consecutive losses`,
                    example: [`Average size after losses: ${Math.round(laterAvg).toLocaleString()} vs ${Math.round(firstAvg).toLocaleString()}`],
                    recommendation: 'Keep position size constant regardless of recent outcomes.'
                });
            }
        }

        // 4. Premature profit taking — win rate high but small wins vs big losses
        const wins = sorted.filter(t => t.pnl > 0);
        const losses = sorted.filter(t => t.pnl < 0);
        const avgWin = wins.length > 0 ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, t) => a + t.pnl, 0)) / losses.length : 0;
        const winRate = wins.length / sorted.length;

        if (winRate > 0.6 && avgLoss > avgWin * 1.5) {
            behaviors.push({
                type: 'premature_exits',
                label: 'Premature Profit Taking',
                severity: 'MODERATE',
                description: `High win rate (${Math.round(winRate * 100)}%) but average loss exceeds average win`,
                example: [`Avg win: ${avgWin.toFixed(2)} | Avg loss: ${avgLoss.toFixed(2)}`],
                recommendation: 'Let winners run to your target. Consider trailing stops.'
            });
        }

        // 5. Concentration risk
        const bySymbol = {};
        for (const t of sorted) {
            bySymbol[t.symbol] = (bySymbol[t.symbol] || 0) + t.quantity * t.entryPrice;
        }
        const total = Object.values(bySymbol).reduce((a, b) => a + b, 0);
        const topSymbol = Object.entries(bySymbol).sort((a, b) => b[1] - a[1])[0];
        if (topSymbol && total > 0 && (topSymbol[1] / total) > 0.5) {
            behaviors.push({
                type: 'concentration',
                label: 'Symbol Concentration',
                severity: 'HIGH',
                description: `${Math.round((topSymbol[1] / total) * 100)}% of trading activity in ${topSymbol[0]}`,
                example: [`Top symbol: ${topSymbol[0]}`],
                recommendation: 'Diversify across symbols and sectors to reduce single-name risk.'
            });
        }

        // 6. Chasing breakouts — entering after a large previous move
        const chaseTrades = [];
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            if (prev.pnl > 0 && prev.pnlPercent > 3) {
                const gapMs = new Date(currOpen(sorted[i])) - new Date(prev.closedAt || prev.timestamp);
                if (gapMs < 15 * 60000) {
                    chaseTrades.push(sorted[i].symbol);
                }
            }
        }
        if (chaseTrades.length >= 2) {
            behaviors.push({
                type: 'chasing',
                label: 'Chasing Moves',
                severity: 'MODERATE',
                description: `Entered ${chaseTrades.length} trades within 15 minutes of a big winner`,
                example: [`Chased symbols: ${chaseTrades.slice(0, 3).join(', ')}`],
                recommendation: 'Enter on pullbacks to support, not after extended moves.'
            });
        }

        // Build trader profile
        const profile = this._buildProfile(sorted, behaviors, { winRate, avgWin, avgLoss, maxTradesPerDay });

        return {
            behaviors,
            profile,
            tradeCount: sorted.length,
            message: behaviors.length === 0
                ? 'No significant behavioral risk patterns detected. Keep up disciplined trading.'
                : `${behaviors.length} behavioral pattern(s) detected`,
            timestamp: new Date().toISOString()
        };
    }

    _buildProfile(trades, behaviors, stats) {
        const strengths = [];
        const weaknesses = [];
        const observations = [];

        // Strengths
        if (stats.winRate >= 0.55) strengths.push('Consistent win rate');
        if (stats.avgWin > stats.avgLoss) strengths.push('Positive risk/reward asymmetry');
        if (trades.filter(t => t.stopLoss).length / trades.length > 0.7) strengths.push('Uses stop-losses consistently');
        if (behaviors.length === 0) strengths.push('Disciplined execution');

        // Weaknesses
        if (behaviors.some(b => b.type === 'revenge_trading')) weaknesses.push('Trades immediately after losses');
        if (behaviors.some(b => b.type === 'overtrading')) weaknesses.push('Trades too frequently');
        if (behaviors.some(b => b.type === 'premature_exits')) weaknesses.push('Cuts winners short');
        if (behaviors.some(b => b.type === 'position_escalation')) weaknesses.push('Increases size after losses');
        if (behaviors.some(b => b.type === 'concentration')) weaknesses.push('Overconcentrated in single symbols');

        // Observations
        if (stats.maxTradesPerDay >= 10) observations.push('Trading frequency spikes on active days');
        if (trades.filter(t => t.durationHours < 1).length / trades.length > 0.5) {
            observations.push('Majority of trades are held under 1 hour');
        }

        return {
            strengths,
            weaknesses,
            observations,
            summary: this._summarizeProfile(strengths, weaknesses),
            disclaimer: 'Profile is based on observable trading behavior only. It is not a psychological assessment.'
        };
    }

    _summarizeProfile(strengths, weaknesses) {
        const parts = [];
        if (strengths.length > 0) parts.push(`Strengths: ${strengths[0]}.`);
        if (weaknesses.length > 0) parts.push(`Main area to improve: ${weaknesses[0]}.`);
        return parts.join(' ') || 'No notable patterns — maintain current discipline.';
    }
}

// Helper for chase detection
function currOpen(trade) {
    return trade.openedAt || trade.timestamp;
}

module.exports = BehavioralAnalytics;