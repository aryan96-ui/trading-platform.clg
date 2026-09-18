/**
 * Behavioral Guardrails
 * 
 * Controlled trading friction: when the trader's recent behavior trips a
 * rule, ProTrader shows a DISCIPLINE CHECK requiring an explicit reason
 * and confirmation before the paper trade proceeds.
 * 
 * Rules (configurable per user):
 * - maxDailyTrades
 * - maxDailyLoss
 * - maxPositionSize
 * - maxPortfolioConcentration
 * - maxRiskPerTrade
 * - maxConsecutiveLosses
 * - cooldownAfterLossStreak (minutes)
 * 
 * Every override is logged with timestamp, reason, and trade outcome.
 */
class GuardrailEngine {
    constructor() {
        this.settings = new Map(); // email → settings
        this.logs = new Map(); // email → [guardrail events]
        this.cooldowns = new Map(); // email → cooldownUntil
    }

    getSettings(email) {
        return this.settings.get(email) || {
            maxDailyTrades: 10,
            maxDailyLossPct: -3,
            maxPositionSizePct: 25,
            maxPortfolioConcentrationPct: 35,
            maxRiskPerTradePct: 2,
            maxConsecutiveLosses: 3,
            cooldownAfterLossStreakMin: 30,
            enabled: true
        };
    }

    updateSettings(email, updates) {
        const current = this.getSettings(email);
        const updated = { ...current, ...updates };
        this.settings.set(email, updated);
        return updated;
    }

    /**
     * Check a proposed trade against all guardrails
     * @returns {GuardrailCheck}
     */
    checkTrade(email, trade, context = {}) {
        if (!this.getSettings(email).enabled) {
            return { passed: true, blocks: [], warnings: [], overrideRequired: false };
        }

        const settings = this.getSettings(email);
        const blocks = [];
        const warnings = [];

        // Recent trades (from context)
        const recentTrades = context.recentTrades || [];
        const todayTrades = recentTrades.filter(t => {
            const d = new Date(t.closedAt || t.timestamp || Date.now());
            return d.toDateString() === new Date().toDateString();
        });

        // 1. Consecutive losses
        const streak = this._consecutiveLosses(recentTrades);
        if (streak >= settings.maxConsecutiveLosses) {
            blocks.push({
                type: 'consecutive_losses',
                severity: 'HIGH',
                message: `${streak} consecutive losing trades`,
                evidence: `Consecutive losses: ${streak}`
            });
        }

        // 2. Cooldown after loss streak
        const cooldownUntil = this.cooldowns.get(email);
        if (cooldownUntil && Date.now() < cooldownUntil) {
            const minsLeft = Math.ceil((cooldownUntil - Date.now()) / 60000);
            blocks.push({
                type: 'cooldown',
                severity: 'HIGH',
                message: `Cooldown active after loss streak (${minsLeft} min remaining)`,
                evidence: `Cooldown until ${new Date(cooldownUntil).toLocaleTimeString()}`
            });
        }

        // 3. Daily loss limit
        const dayPnl = context.dayPnlPercent || 0;
        if (dayPnl <= settings.maxDailyLossPct) {
            blocks.push({
                type: 'daily_loss_limit',
                severity: 'HIGH',
                message: `Daily loss ${dayPnl.toFixed(1)}% hits the ${settings.maxDailyLossPct}% limit`,
                evidence: `Daily P&L: ${dayPnl.toFixed(1)}%`
            });
        }

        // 4. Daily trade count
        if (todayTrades.length >= settings.maxDailyTrades) {
            blocks.push({
                type: 'daily_trade_limit',
                severity: 'MEDIUM',
                message: `${todayTrades.length} trades today hits the ${settings.maxDailyTrades} limit`,
                evidence: `Trades today: ${todayTrades.length}`
            });
        }

        // 5. Position size
        const accountValue = context.accountValue || 100000;
        const positionValue = (trade.quantity || 0) * (trade.entryPrice || 0);
        const posPct = accountValue > 0 ? (positionValue / accountValue) * 100 : 0;
        if (posPct > settings.maxPositionSizePct) {
            blocks.push({
                type: 'position_size',
                severity: 'HIGH',
                message: `Position would be ${posPct.toFixed(1)}% of account (limit ${settings.maxPositionSizePct}%)`,
                evidence: `Position value ${positionValue.toFixed(0)} / account ${accountValue.toFixed(0)}`
            });
        }

        // 6. Risk per trade
        //
        // Risk is only measurable when a stop is defined. Treating a missing
        // stop as a stop at zero would report the whole notional as risk and
        // block every order without one, so that case is raised as a warning
        // instead.
        if (trade.stopLoss) {
            const riskValue = Math.abs((trade.entryPrice || 0) - trade.stopLoss) * (trade.quantity || 0);
            const riskPct = accountValue > 0 ? (riskValue / accountValue) * 100 : 0;
            if (riskPct > settings.maxRiskPerTradePct) {
                blocks.push({
                    type: 'risk_per_trade',
                    severity: 'HIGH',
                    message: `Risk per trade ${riskPct.toFixed(1)}% exceeds ${settings.maxRiskPerTradePct}%`,
                    evidence: `Risk amount ${riskValue.toFixed(0)}`
                });
            }
        } else {
            warnings.push({
                type: 'no_stop_loss',
                severity: 'MEDIUM',
                message: 'No stop loss defined for this trade',
                evidence: 'Risk per trade cannot be measured without a stop'
            });
        }

        // 7. Position escalation after losses (warning)
        const sizeGrowth = this._positionEscalation(recentTrades, positionValue);
        if (sizeGrowth > 0.3) {
            warnings.push({
                type: 'position_escalation',
                severity: 'MEDIUM',
                message: `Position size is ${Math.round(sizeGrowth * 100)}% above your average post-loss size`,
                evidence: `Size growth factor: ${sizeGrowth.toFixed(2)}x`
            });
        }

        const overrideRequired = blocks.length > 0;

        return {
            passed: blocks.length === 0,
            overrideRequired,
            blocks,
            warnings,
            cooldownMinutes: this._cooldownMinutes(email),
            reasonOptions: ['Strategy Setup', 'Portfolio Hedge', 'Other'],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Trader confirms (or overrides) the discipline check
     */
    confirmTrade(email, trade, { blockIds = [], reason = '', notes = '', context = {} }) {
        const check = this.checkTrade(email, trade, context);
        const overridden = check.blocks.filter(b => blockIds.includes(b.type));

        const entry = {
            email,
            symbol: trade.symbol,
            timestamp: new Date().toISOString(),
            warningCount: check.blocks.length,
            warningsShown: check.blocks.map(b => b.type),
            overriddenTypes: overridden.map(b => b.type),
            userResponse: {
                reason: reason || (check.blocks.length ? 'unconfirmed' : 'no_warning'),
                notes: notes || ''
            },
            allowed: check.blocks.length === 0 || overridden.length > 0,
            tradeOutcome: null // filled later via recordOutcome
        };

        const logs = this.logs.get(email) || [];
        logs.push(entry);
        this.logs.set(email, logs);

        // Set cooldown if consecutive losses hit limit and not overridden
        if (check.blocks.some(b => b.type === 'consecutive_losses') && !overridden.some(b => b.type === 'consecutive_losses')) {
            const settings = this.getSettings(email);
            this.cooldowns.set(email, Date.now() + settings.cooldownAfterLossStreakMin * 60000);
        }

        return entry;
    }

    /**
     * Record trade outcome against a guardrail event (for learning)
     */
    recordOutcome(email, guardrailEventId, outcome) {
        // outcome: { pnl, result }
        const logs = this.logs.get(email) || [];
        // Match by timestamp proximity — simplest: record latest unrecorded
        const target = [...logs].reverse().find(l => l.tradeOutcome === null);
        if (target) {
            target.tradeOutcome = outcome;
            target.resolvedAt = new Date().toISOString();
        }
    }

    getLogs(email) {
        return (this.logs.get(email) || []).slice().reverse();
    }

    _consecutiveLosses(trades) {
        let streak = 0;
        for (const t of trades) {
            if ((t.pnl || 0) < 0) streak++;
            else break;
        }
        return streak;
    }

    _positionEscalation(trades, currentValue) {
        const losing = trades.filter(t => (t.pnl || 0) < 0);
        if (losing.length < 2) return 0;
        const avgSize = losing.reduce((a, t) => a + (t.quantity || 1) * (t.entryPrice || 0), 0) / losing.length;
        return avgSize > 0 ? currentValue / avgSize : 0;
    }

    _cooldownMinutes(email) {
        const until = this.cooldowns.get(email);
        if (!until) return 0;
        return Math.max(0, Math.ceil((until - Date.now()) / 60000));
    }
}

module.exports = GuardrailEngine;