/**
 * Signal Intelligence Engine
 * 
 * Two responsibilities:
 * 1. SignalRankingEngine — scores signals by relevance, strategy match,
 *    freshness, regime compatibility, volume confirmation, liquidity, risk.
 *    Ranks into TOP PRIORITY / MEDIUM / LOW smart alerts (no alert spam).
 * 2. SignalConflictEngine — detects conflicting evidence across factors
 *    (price/volume/RSI/sector/market) and explains the conflict instead of
 *    collapsing it into a blind BUY/SELL.
 */
const EvidenceEngine = require('./evidence-engine');

// ============================================================
// SIGNAL RANKING
// ============================================================
class SignalRankingEngine {
    /**
     * Score and rank a list of raw signals
     * @param {Array} signals - [{ symbol, type, direction, created, strategy, volume, price, ... }]
     * @param {object} context - { regime, strategies: [{name, bestRegime}], quoteMap }
     */
    rankSignals(signals, context = {}) {
        if (!signals || signals.length === 0) return [];

        const scored = signals.map(signal => this._scoreSignal(signal, context));
        scored.sort((a, b) => b.qualityScore - a.qualityScore);

        // Assign priority tiers
        const tier = (s) => s.qualityScore >= 70 ? 'TOP_PRIORITY' : s.qualityScore >= 45 ? 'MEDIUM' : 'LOW';

        return scored.map((s, i) => ({
            ...s,
            tier: tier(s),
            rank: i + 1
        }));
    }

    _scoreSignal(signal, context) {
        const scores = {};
        const reasons = [];

        // 1. Freshness (0-100)
        const ageMs = Date.now() - new Date(signal.created || Date.now()).getTime();
        scores.freshness = Math.max(0, Math.min(100, 100 - ageMs / 60000)); // decays 1%/minute
        if (scores.freshness > 90) reasons.push('Signal is fresh');
        else if (scores.freshness < 40) reasons.push('Signal is aging');

        // 2. Volume confirmation (0-100)
        const relVol = signal.relativeVolume || (signal.volume ? signal.volume / (context.avgVolume || signal.volume) : 1);
        scores.volumeConfirmation = relVol >= 2 ? 90 : relVol >= 1.5 ? 70 : relVol >= 1.2 ? 55 : relVol >= 0.8 ? 40 : 25;
        if (relVol >= 1.5) reasons.push(`Volume confirms move (${relVol.toFixed(1)}x)`);
        else if (relVol < 0.8) reasons.push('Volume does not confirm move');

        // 3. Regime compatibility (0-100)
        const regime = context.regime || {};
        scores.regimeCompatibility = this._regimeCompatibility(signal, regime);
        if (scores.regimeCompatibility >= 70) reasons.push(`Compatible with ${regime.regime || 'current'} regime`);
        else if (scores.regimeCompatibility < 40) reasons.push(`Poor fit for ${regime.regime || 'current'} regime`);

        // 4. Strategy match (0-100)
        scores.strategyMatch = this._strategyMatch(signal, context.strategies);
        if (scores.strategyMatch >= 70) reasons.push('Strong match to your strategies');

        // 5. Liquidity (0-100)
        const liq = signal.liquidity || (signal.volume ? Math.min(100, signal.volume / 500000 * 100) : 40);
        scores.liquidity = liq;
        if (liq < 30) reasons.push('Liquidity may be insufficient');

        // 6. Risk (0-100, higher = lower risk)
        const vol = signal.volatility || 0.02;
        scores.risk = vol <= 0.015 ? 85 : vol <= 0.03 ? 65 : vol <= 0.05 ? 45 : 25;
        if (vol > 0.05) reasons.push('Elevated volatility increases risk');

        // 7. Relevance to user's portfolio/watchlist (0-100)
        const watchlist = context.watchlist || [];
        const portfolio = context.portfolioSymbols || [];
        scores.relevance = (watchlist.includes(signal.symbol) || portfolio.includes(signal.symbol)) ? 80 : 60;

        // Weighted total
        const weights = {
            freshness: 0.15, volumeConfirmation: 0.20, regimeCompatibility: 0.20,
            strategyMatch: 0.20, liquidity: 0.10, risk: 0.10, relevance: 0.05
        };
        const qualityScore = Math.round(
            Object.entries(weights).reduce((acc, [k, w]) => acc + (scores[k] || 0) * w, 0)
        );

        return {
            ...signal,
            qualityScore: Math.max(0, Math.min(100, qualityScore)),
            scoreBreakdown: scores,
            reasons,
            evidence: [
                EvidenceEngine.create({ type: 'volume', source: 'signal-engine', value: relVol, interpretation: `Relative volume ${relVol.toFixed(2)}x`, reliability: 'MEDIUM' }),
                EvidenceEngine.create({ type: 'regime', source: 'signal-engine', value: regime.regime, interpretation: `Regime compatibility ${scores.regimeCompatibility}/100`, reliability: 'MEDIUM' })
            ]
        };
    }

    _regimeCompatibility(signal, regime) {
        if (!regime.regime) return 60;
        const map = {
            'TRENDING': { 'breakout': 90, 'momentum': 85, 'trend': 90, 'dip': 40 },
            'RANGE-BOUND': { 'breakout': 30, 'momentum': 25, 'trend': 20, 'dip': 60, 'mean_reversion': 80 },
            'HIGH VOLATILITY': { 'breakout': 50, 'momentum': 40, 'trend': 35, 'dip': 55 },
            'LOW VOLATILITY': { 'breakout': 75, 'momentum': 60, 'trend': 50, 'dip': 45 }
        };
        const byRegime = map[regime.regime] || {};
        const strategy = (signal.strategy || signal.type || '').toLowerCase();
        for (const [key, val] of Object.entries(byRegime)) {
            if (strategy.includes(key)) return val;
        }
        return 55;
    }

    _strategyMatch(signal, strategies) {
        if (!strategies || strategies.length === 0) return 60;
        const signalStr = `${signal.type || ''} ${signal.strategy || ''}`.toLowerCase();
        const best = strategies.reduce((acc, s) => {
            const match = s.tags ? s.tags.filter(t => signalStr.includes(t.toLowerCase())).length : 0;
            return match > acc.match ? { name: s.name, match } : acc;
        }, { name: null, match: 0 });
        return best.match > 0 ? Math.min(95, 50 + best.match * 15) : 45;
    }

    /**
     * Build smart alert list from ranked signals
     */
    buildSmartAlerts(rankedSignals) {
        const tiers = { TOP_PRIORITY: [], MEDIUM: [], LOW: [] };
        for (const s of rankedSignals) {
            tiers[s.tier].push(s);
        }
        return {
            tiers,
            counts: { top: tiers.TOP_PRIORITY.length, medium: tiers.MEDIUM.length, low: tiers.LOW.length },
            generated: new Date().toISOString()
        };
    }
}

// ============================================================
// SIGNAL CONFLICT DETECTION
// ============================================================
class SignalConflictEngine {
    /**
     * Detect conflicting evidence across factors
     * @param {object} factors - { price, volume, rsi, sector, market, macd }
     *   each: 'bullish' | 'bearish' | 'neutral' | null
     */
    detectConflicts(factors = {}) {
        const labeled = {
            price: factors.price || 'neutral',
            volume: factors.volume || 'neutral',
            rsi: factors.rsi || 'neutral',
            sector: factors.sector || 'neutral',
            market: factors.market || 'neutral',
            macd: factors.macd || 'neutral'
        };

        const bullish = Object.entries(labeled).filter(([, v]) => v === 'bullish').map(([k]) => k);
        const bearish = Object.entries(labeled).filter(([, v]) => v === 'bearish').map(([k]) => k);
        const neutral = Object.entries(labeled).filter(([, v]) => v === 'neutral').map(([k]) => k);

        const hasConflict = bullish.length > 0 && bearish.length > 0;
        const balance = bullish.length - bearish.length;

        let lean = 'neutral';
        if (balance >= 2) lean = 'bullish';
        else if (balance <= -2) lean = 'bearish';
        else if (balance === 1) lean = 'mild_bullish';
        else if (balance === -1) lean = 'mild_bearish';

        return {
            hasConflict,
            lean,
            bullishFactors: bullish,
            bearishFactors: bearish,
            neutralFactors: neutral,
            conflict: hasConflict
                ? `Signal conflict detected: ${bullish.length} bullish factor(s) [${bullish.join(', ')}] vs ${bearish.length} bearish factor(s) [${bearish.join(', ')}].`
                : `No material conflict — ${bullish.length} bullish, ${bearish.length} bearish, ${neutral.length} neutral.`,
            recommendation: hasConflict
                ? 'Conflicting evidence. Do not treat this as a directional signal. Wait for convergence or reduce position size.'
                : lean === 'bullish' || lean === 'mild_bullish'
                    ? 'Evidence is broadly supportive.'
                    : lean === 'bearish' || lean === 'mild_bearish'
                        ? 'Evidence is broadly adverse.'
                        : 'Evidence is inconclusive.',
            evidence: [
                EvidenceEngine.create({ type: 'indicator', source: 'conflict-engine', value: labeled, interpretation: `${bullish.length} bullish vs ${bearish.length} bearish factors`, reliability: 'MEDIUM' })
            ],
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { SignalRankingEngine, SignalConflictEngine };