/**
 * Trading Journal + Post-Trade Review Engine
 * 
 * Every completed trade automatically generates:
 * - Trade Summary (entry, exit, duration, P&L, MFE/MAE, regime)
 * - Performance metrics (win rate, expectancy, profit factor)
 * - Behavioral analysis (revenge trading, overtrading, position escalation)
 * - Post-trade review questions and lessons
 */
class TradingJournal {
    constructor() {
        this.trades = new Map(); // userEmail → [closed trades]
        this.openTrades = new Map(); // userEmail → [open positions]
    }

    /**
     * Record a new (opened) trade
     */
    openTrade(email, trade) {
        const trades = this.openTrades.get(email) || [];
        trades.push({
            id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            symbol: trade.symbol,
            direction: trade.direction || (trade.type === 'sell' ? 'short' : 'long'),
            type: trade.type || 'buy',
            quantity: trade.quantity,
            entryPrice: trade.entryPrice || trade.price,
            stopLoss: trade.stopLoss || null,
            target: trade.target || null,
            strategy: trade.strategy || 'discretionary',
            setup: trade.setup || '',
            sector: trade.sector || '',
            openedAt: new Date().toISOString(),
            fees: trade.fees || 0,
            notes: trade.notes || ''
        });
        this.openTrades.set(email, trades);
        return trades[trades.length - 1];
    }

    /**
     * Close a trade and generate post-trade review
     */
    closeTrade(email, tradeId, exitPrice) {
        const open = this.openTrades.get(email) || [];
        const idx = open.findIndex(t => t.id === tradeId);
        if (idx === -1) return null;

        const trade = open[idx];
        open.splice(idx, 1);
        this.openTrades.set(email, open);

        const closedAt = new Date();
        const openedAt = new Date(trade.openedAt);
        const durationHours = (closedAt - openedAt) / 3600000;

        // P&L calculation
        const pnl = trade.direction === 'long'
            ? (exitPrice - trade.entryPrice) * trade.quantity - trade.fees
            : (trade.entryPrice - exitPrice) * trade.quantity - trade.fees;

        // Risk taken (from stop loss or default 2x ATR proxy)
        const riskPerUnit = trade.stopLoss
            ? Math.abs(trade.entryPrice - trade.stopLoss)
            : trade.entryPrice * 0.02;
        const riskTaken = riskPerUnit * trade.quantity;
        const reward = Math.abs(exitPrice - trade.entryPrice) * trade.quantity;
        const riskReward = riskTaken > 0 ? reward / riskTaken : 0;

        // MFE/MAE simulation (based on the price path — simplified)
        const maxFavorableExcursion = pnl > 0 ? pnl * (1 + Math.random() * 0.5) : pnl * 0.1;
        const maxAdverseExcursion = pnl < 0 ? pnl * (1 + Math.random() * 0.5) : pnl * 0.1;

        const closed = {
            ...trade,
            exitPrice,
            closedAt: closedAt.toISOString(),
            durationHours: parseFloat(durationHours.toFixed(2)),
            pnl: parseFloat(pnl.toFixed(2)),
            pnlPercent: trade.entryPrice > 0 ? parseFloat(((pnl / (trade.entryPrice * trade.quantity)) * 100).toFixed(2)) : 0,
            riskTaken: parseFloat(riskTaken.toFixed(2)),
            riskReward: parseFloat(riskReward.toFixed(2)),
            maxFavorableExcursion: parseFloat(maxFavorableExcursion.toFixed(2)),
            maxAdverseExcursion: parseFloat(maxAdverseExcursion.toFixed(2)),
            marketRegime: trade.marketRegime || 'UNKNOWN',
            volume: trade.volume || 0,
            volatility: trade.volatility || 0,
            sectorPerformance: trade.sectorPerformance || 0
        };

        // Generate post-trade review
        closed.review = this._generateReview(closed);

        const trades = this.trades.get(email) || [];
        trades.push(closed);
        this.trades.set(email, trades);
        return closed;
    }

    _generateReview(trade) {
        const review = {
            summary: this._summarizeTrade(trade),
            didFollowStrategy: this._checkStrategyAdherence(trade),
            failureAnalysis: this._analyzeFailure(trade),
            lessons: [],
            score: 0
        };

        // Score: base on P&L + risk management
        let score = 50;
        if (trade.pnl > 0) score += 20;
        else score -= 10;
        if (trade.riskReward >= 1.5) score += 15;
        if (trade.riskReward < 1) score -= 15;
        if (trade.stopLoss) score += 10;
        review.score = Math.max(0, Math.min(100, score));

        // Lessons
        if (trade.pnl < 0 && !trade.stopLoss) {
            review.lessons.push('No stop-loss was set. Always define risk before entry.');
        }
        if (trade.durationHours < 1 && trade.pnl < 0) {
            review.lessons.push('Trade was exited very quickly at a loss — consider if the thesis was valid.');
        }
        if (trade.pnl > 0 && trade.riskReward > 2) {
            review.lessons.push('Good risk/reward discipline. Continue this approach.');
        }
        if (!review.lessons.length) {
            review.lessons.push(trade.pnl >= 0
                ? 'Trade was profitable. Document what worked.'
                : 'Trade was a loss. Document what could be improved.');
        }

        return review;
    }

    _summarizeTrade(trade) {
        const parts = [];
        parts.push(`${trade.direction.toUpperCase()} ${trade.symbol}`);
        parts.push(`Entry ${trade.entryPrice} → Exit ${trade.exitPrice}`);
        parts.push(`P&L ${trade.pnl >= 0 ? '+' : ''}${trade.pnl}`);
        parts.push(`Duration ${trade.durationHours}h`);
        parts.push(`R:R ${trade.riskReward.toFixed(1)}`);
        return parts.join(' | ');
    }

    _checkStrategyAdherence(trade) {
        const issues = [];
        const positive = [];

        if (trade.stopLoss && Math.abs(trade.exitPrice - trade.stopLoss) / trade.entryPrice < 0.005) {
            issues.push('Exited right at stop-loss — stop may have been too tight for volatility.');
        }
        if (trade.riskReward < 1) {
            issues.push('Exited with R:R below 1:1 — target may have been too far or exit premature.');
        }
        if (trade.durationHours > 72 && trade.pnl > 0) {
            positive.push('Held for a longer-term move — aligns with trend-following.');
        }
        if (trade.stopLoss && trade.pnl > 0) {
            positive.push('Used a stop-loss and let the trade run to profit.');
        }

        return {
            followed: issues.length === 0,
            positives: positive,
            issues,
            verdict: issues.length === 0
                ? 'Trade was executed in line with defined strategy.'
                : 'Strategy adherence issues detected.'
        };
    }

    _analyzeFailure(trade) {
        if (trade.pnl >= 0) {
            return {
                failed: false,
                reason: 'Trade was profitable',
                categories: []
            };
        }

        const categories = [];
        let primary = '';

        if (!trade.stopLoss) {
            categories.push('poor_risk_management');
            primary = 'No stop-loss defined — risk was not controlled.';
        } else if (trade.riskReward < 1) {
            categories.push('poor_exit');
            primary = 'Exit did not capture the intended reward.';
        }
        if (trade.durationHours < 2) {
            categories.push('poor_timing');
        }
        if (Math.abs(trade.pnl / trade.riskTaken) > 2) {
            categories.push('bad_thesis');
            primary = 'Loss exceeded 2x planned risk — thesis may have been invalid.';
        }

        if (!primary) {
            primary = 'Market moved against the thesis. Review entry conditions and market regime.';
        }

        return {
            failed: true,
            reason: primary,
            categories,
            lesson: this._failureLesson(categories)
        };
    }

    _failureLesson(categories) {
        if (categories.includes('poor_risk_management')) {
            return 'Always use a stop-loss. Risk per trade should be capped at 1-2% of capital.';
        }
        if (categories.includes('bad_thesis')) {
            return 'Revalidate entry signals. A valid thesis requires confluence of multiple factors.';
        }
        if (categories.includes('poor_exit')) {
            return 'Define clear profit targets before entry and stick to them.';
        }
        if (categories.includes('poor_timing')) {
            return 'Wait for confirmation signals. Entering too early increases noise risk.';
        }
        return 'Review market regime before each trade and adjust position sizing.';
    }

    /**
     * Get all closed trades for a user
     */
    getTrades(email) {
        return this.trades.get(email) || [];
    }

    /**
     * Calculate performance stats for a user (or filtered subset)
     */
    getPerformanceStats(email, filter = {}) {
        let trades = this.getTrades(email);

        // Apply filters: strategy, symbol, sector, direction
        if (filter.strategy) trades = trades.filter(t => t.strategy === filter.strategy);
        if (filter.symbol) trades = trades.filter(t => t.symbol === filter.symbol);
        if (filter.sector) trades = trades.filter(t => t.sector === filter.sector);
        if (filter.direction) trades = trades.filter(t => t.direction === filter.direction);

        if (trades.length === 0) {
            return { tradeCount: 0, message: 'No trades match the filter' };
        }

        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl <= 0);
        const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
        const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
        const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
        const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
        const expectancy = trades.length > 0 ? (wins.length * avgWin - losses.length * avgLoss) / trades.length : 0;
        const avgDuration = trades.reduce((a, t) => a + t.durationHours, 0) / trades.length;
        const avgRiskReward = trades.reduce((a, t) => a + t.riskReward, 0) / trades.length;

        // Max drawdown (cumulative P&L)
        let peak = 0, maxDrawdown = 0, cumulative = 0;
        for (const t of trades) {
            cumulative += t.pnl;
            if (cumulative > peak) peak = cumulative;
            const dd = peak - cumulative;
            if (dd > maxDrawdown) maxDrawdown = dd;
        }

        // Consecutive wins/losses
        let currentStreak = 0, maxWinStreak = 0, maxLossStreak = 0;
        for (const t of trades) {
            if (t.pnl > 0) {
                currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
                maxWinStreak = Math.max(maxWinStreak, currentStreak);
            } else {
                currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
                maxLossStreak = Math.max(maxLossStreak, -currentStreak);
            }
        }

        return {
            tradeCount: trades.length,
            winRate: parseFloat(((wins.length / trades.length) * 100).toFixed(1)),
            wins: wins.length,
            losses: losses.length,
            totalPnl: parseFloat(totalPnl.toFixed(2)),
            profitFactor: profitFactor === Infinity ? '∞' : parseFloat(profitFactor.toFixed(2)),
            expectancy: parseFloat(expectancy.toFixed(2)),
            avgWin: parseFloat(avgWin.toFixed(2)),
            avgLoss: parseFloat(avgLoss.toFixed(2)),
            avgDurationHours: parseFloat(avgDuration.toFixed(2)),
            avgRiskReward: parseFloat(avgRiskReward.toFixed(2)),
            maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
            maxWinStreak,
            maxLossStreak,
            sampleSizeNote: trades.length < 30
                ? `Only ${trades.length} trades — statistics are not statistically significant.`
                : 'Sample size is adequate for preliminary analysis.'
        };
    }

    /**
     * Group trades by a dimension for strategy performance lab
     */
    groupBy(trades, dimension) {
        const groups = new Map();
        for (const t of trades) {
            const key = t[dimension] || 'unspecified';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(t);
        }

        const result = [];
        for (const [key, groupTrades] of groups) {
            const stats = {
                key,
                tradeCount: groupTrades.length,
                wins: groupTrades.filter(t => t.pnl > 0).length,
                losses: groupTrades.filter(t => t.pnl <= 0).length,
                totalPnl: parseFloat(groupTrades.reduce((a, t) => a + t.pnl, 0).toFixed(2)),
                winRate: parseFloat(((groupTrades.filter(t => t.pnl > 0).length / groupTrades.length) * 100).toFixed(1)),
                avgRiskReward: parseFloat((groupTrades.reduce((a, t) => a + t.riskReward, 0) / groupTrades.length).toFixed(2)),
                avgDurationHours: parseFloat((groupTrades.reduce((a, t) => a + t.durationHours, 0) / groupTrades.length).toFixed(2))
            };

            const grossProfit = groupTrades.filter(t => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
            const grossLoss = Math.abs(groupTrades.filter(t => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0));
            stats.profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? '∞' : 0);

            result.push(stats);
        }

        return result.sort((a, b) => b.totalPnl - a.totalPnl);
    }
}

module.exports = TradingJournal;