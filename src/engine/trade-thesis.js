/**
 * Trade Thesis Service
 * 
 * Before an important paper trade, the trader records a structured thesis:
 * Why am I entering? Entry, Target, Stop, R:R, Strategy, Market thesis,
 * Invalidation, Expected holding period.
 * 
 * After the trade closes, the ORIGINAL THESIS is compared with ACTUAL
 * BEHAVIOR — producing measurable decision-quality data.
 */
const EvidenceEngine = require('./evidence-engine');

class TradeThesisService {
    constructor() {
        this.theses = new Map(); // email → [thesis]
        this.resolved = new Map(); // thesisId → { thesis, outcome, comparison }
    }

    /**
     * Create a thesis for a trade
     */
    createThesis(email, thesis) {
        const required = ['symbol', 'entry', 'stop', 'target', 'reason'];
        for (const field of required) {
            if (thesis[field] === undefined || thesis[field] === null || thesis[field] === '') {
                throw new Error(`Thesis requires: ${field}`);
            }
        }

        const entry = {
            id: `thesis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            email,
            symbol: thesis.symbol,
            direction: thesis.direction || 'long',
            entry: thesis.entry,
            stop: thesis.stop,
            target: thesis.target,
            reason: thesis.reason,
            strategy: thesis.strategy || 'discretionary',
            marketThesis: thesis.marketThesis || '',
            invalidation: thesis.invalidation || '',
            expectedHoldingHours: thesis.expectedHoldingHours || 24,
            expectedRiskReward: Math.abs(thesis.target - thesis.entry) / Math.max(0.0001, Math.abs(thesis.entry - thesis.stop)),
            expectedRMultiple: thesis.expectedRMultiple || 1,
            created: new Date().toISOString(),
            tradeId: thesis.tradeId || null,
            status: 'OPEN'
        };

        const list = this.theses.get(email) || [];
        list.push(entry);
        this.theses.set(email, list);
        return entry;
    }

    /**
     * Resolve a thesis against the actual trade outcome
     */
    resolveThesis(email, thesisId, outcome) {
        const list = this.theses.get(email) || [];
        const idx = list.findIndex(t => t.id === thesisId);
        if (idx === -1) throw new Error('Thesis not found');

        const thesis = list[idx];
        const actual = {
            exitPrice: outcome.exitPrice,
            pnl: outcome.pnl,
            pnlPercent: outcome.pnlPercent,
            holdingHours: outcome.holdingHours,
            actualRR: outcome.riskReward || (thesis.stop ? Math.abs(outcome.exitPrice - thesis.entry) / Math.abs(thesis.entry - thesis.stop) : 0),
            maxAdverseExcursion: outcome.maxAdverseExcursion,
            maxFavorableExcursion: outcome.maxFavorableExcursion,
            followedPlan: outcome.followedPlan !== false
        };

        // Compare thesis vs actual
        const entrySlippage = thesis.entry ? ((actual.exitPrice && actual.exitPrice > 0 ? 0 : 0)) : 0;
        const hitTarget = thesis.target !== undefined && outcome.exitPrice >= thesis.target;
        const hitStop = thesis.stop !== undefined && outcome.exitPrice <= thesis.stop;
        const holdingAdherence = Math.abs(actual.holdingHours - thesis.expectedHoldingHours) <= Math.max(8, thesis.expectedHoldingHours * 0.5);

        const comparison = {
            thesisId,
            symbol: thesis.symbol,
            expectedRR: parseFloat(thesis.expectedRiskReward.toFixed(2)),
            actualRR: parseFloat(actual.actualRR.toFixed(2)),
            hitTarget,
            hitStop,
            holdingAdherence,
            thesisQuality: this._scoreThesis(thesis),
            verdict: this._verdict(thesis, actual, { hitTarget, hitStop, holdingAdherence }),
            evidence: [
                EvidenceEngine.create({ type: 'claim', source: 'trade-thesis', value: { expected: thesis.expectedRiskReward, actual: actual.actualRR }, interpretation: `Expected R:R ${thesis.expectedRiskReward.toFixed(1)} vs actual ${actual.actualRR.toFixed(1)}`, reliability: 'MEDIUM' })
            ],
            resolved: new Date().toISOString()
        };

        thesis.status = 'RESOLVED';
        thesis.outcome = outcome;
        thesis.comparison = comparison;
        this.resolved.set(thesisId, { thesis, outcome, comparison });

        return comparison;
    }

    _scoreThesis(thesis) {
        let score = 50;
        if (thesis.expectedRiskReward >= 2) score += 20;
        else if (thesis.expectedRiskReward >= 1.5) score += 10;
        if (thesis.invalidation) score += 10;
        if (thesis.marketThesis) score += 10;
        if (thesis.expectedHoldingHours) score += 5;
        return Math.min(100, score);
    }

    _verdict(thesis, actual, flags) {
        const parts = [];
        if (flags.hitTarget) parts.push('Target was reached — the thesis played out as planned.');
        if (flags.hitStop) parts.push('Stop was hit — the invalidation triggered correctly.');
        if (!flags.holdingAdherence) parts.push(`Holding time (${actual.holdingHours}h) deviated from plan (${thesis.expectedHoldingHours}h).`);
        if (Math.abs(actual.actualRR - thesis.expectedRiskReward) > 0.5) {
            parts.push(`Actual R:R (${actual.actualRR.toFixed(1)}) differed materially from thesis (${thesis.expectedRiskReward.toFixed(1)}).`);
        }
        if (parts.length === 0) parts.push('Trade outcome aligned with the recorded thesis.');
        return parts.join(' ');
    }

    getTheses(email, status) {
        let list = this.theses.get(email) || [];
        if (status) list = list.filter(t => t.status === status);
        return list;
    }

    /**
     * Thesis adherence statistics — decision-quality data
     */
    getThesisStats(email) {
        const list = this.getTheses(email);
        const resolvedList = list.filter(t => t.status === 'RESOLVED');
        if (resolvedList.length === 0) return { thesisCount: 0, message: 'No resolved theses yet' };

        const avgExpectedRR = resolvedList.reduce((a, t) => a + t.expectedRiskReward, 0) / resolvedList.length;
        const avgActualRR = resolvedList.reduce((a, t) => a + t.comparison.actualRR, 0) / resolvedList.length;
        const targetsHit = resolvedList.filter(t => t.comparison.hitTarget).length;
        const holdingAdherence = resolvedList.filter(t => t.comparison.holdingAdherence).length;

        return {
            thesisCount: resolvedList.length,
            avgExpectedRR: parseFloat(avgExpectedRR.toFixed(2)),
            avgActualRR: parseFloat(avgActualRR.toFixed(2)),
            targetHitRate: parseFloat(((targetsHit / resolvedList.length) * 100).toFixed(1)),
            holdingAdherenceRate: parseFloat(((holdingAdherence / resolvedList.length) * 100).toFixed(1)),
            message: resolvedList.length < 10
                ? `${resolvedList.length} resolved thesis(es) — sample too small for conclusions.`
                : 'Sample adequate for preliminary decision-quality analysis.'
        };
    }
}

module.exports = TradeThesisService;