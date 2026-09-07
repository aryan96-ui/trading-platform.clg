/**
 * Strategy Performance Lab
 * 
 * Groups historical paper trades by:
 * - strategy, setup, symbol, sector, direction, market regime
 * 
 * Calculates per-group: win rate, profit factor, expectancy, avg gain/loss,
 * max drawdown, Sharpe ratio (where statistically appropriate), trade count.
 * 
 * Provides performance insights with explicit statistical-significance caveats.
 */
class StrategyLab {
    constructor(journal) {
        this.journal = journal;
        this.dimensions = ['strategy', 'setup', 'symbol', 'sector', 'direction', 'marketRegime'];
    }

    /**
     * Analyze trades grouped by a dimension
     * @param {Array} trades - Closed trades
     * @param {string} dimension - One of strategy/setup/symbol/sector/direction/marketRegime
     */
    analyzeByDimension(trades, dimension) {
        if (!this.dimensions.includes(dimension)) {
            throw new Error(`Unknown dimension: ${dimension}. Valid: ${this.dimensions.join(', ')}`);
        }
        if (trades.length === 0) return { dimension, groups: [], message: 'No trades to analyze' };

        const groups = this.journal.groupBy(trades, dimension);

        // Add performance insights per group
        const enriched = groups.map(g => ({
            ...g,
            insights: this._generateInsights(g)
        }));

        // Overall best/worst
        const best = enriched.filter(g => g.tradeCount >= 5).sort((a, b) => b.totalPnl - a.totalPnl)[0] || null;
        const worst = enriched.filter(g => g.tradeCount >= 5).sort((a, b) => a.totalPnl - b.totalPnl)[0] || null;

        return {
            dimension,
            groups: enriched,
            best,
            worst,
            message: this._summarize(enriched, best, worst),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Analyze all dimensions at once
     */
    analyzeAll(trades) {
        const results = {};
        for (const dim of this.dimensions) {
            results[dim] = this.analyzeByDimension(trades, dim);
        }
        return {
            results,
            tradeCount: trades.length,
            timestamp: new Date().toISOString()
        };
    }

    _generateInsights(group) {
        const insights = [];

        if (group.tradeCount < 5) {
            insights.push(`Only ${group.tradeCount} trades — not statistically significant. Treat results as anecdotal.`);
            return insights;
        }

        // Win rate assessment
        if (group.winRate >= 55 && group.totalPnl > 0) {
            insights.push(`Win rate ${group.winRate}% with positive P&L — edge may exist.`);
        } else if (group.winRate < 40 && group.totalPnl < 0) {
            insights.push(`Win rate ${group.winRate}% with negative P&L — consider retiring this approach.`);
        }

        // Profit factor
        if (group.profitFactor !== '∞' && group.profitFactor > 1.5) {
            insights.push(`Profit factor ${group.profitFactor} indicates strong risk-adjusted performance.`);
        } else if (group.profitFactor !== '∞' && group.profitFactor < 0.8) {
            insights.push(`Profit factor ${group.profitFactor} — losses exceed gains.`);
        }

        // Regime-specific notes
        if (group.key === 'TRENDING' && group.winRate >= 50) {
            insights.push('Performs well in trending markets — trend-following edge.');
        }
        if (group.key === 'HIGH VOLATILITY' && group.winRate < 45) {
            insights.push('Underperforms in high-volatility periods — reduce size or avoid.');
        }

        // R:R assessment
        if (group.avgRiskReward < 1 && group.winRate < 55) {
            insights.push(`Low R:R (${group.avgRiskReward.toFixed(1)}) combined with sub-55% win rate — poor expectancy structure.`);
        }

        return insights;
    }

    _summarize(enriched, best, worst) {
        if (!best && !worst) return 'No group has enough trades (5+) for meaningful comparison.';
        const parts = [];
        if (best) parts.push(`Best performer: "${best.key}" with ${best.totalPnl > 0 ? '+' : ''}${best.totalPnl} P&L (${best.tradeCount} trades, ${best.winRate}% win rate).`);
        if (worst && worst.key !== best.key) parts.push(`Worst performer: "${worst.key}" with ${worst.totalPnl} P&L (${worst.tradeCount} trades, ${worst.winRate}% win rate).`);
        if (best && worst && best.key === worst.key) parts.push('Only one group has sufficient data.');
        parts.push('Statistical significance requires larger samples — results are directional, not conclusive.');
        return parts.join(' ');
    }
}

module.exports = StrategyLab;