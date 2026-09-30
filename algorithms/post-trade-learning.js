/**
 * Post-Trade Learning Engine
 * 
 * Every completed paper trade gets a full structured review that classifies
 * the DECISION quality separately from the RESULT:
 * 
 *   GOOD TRADE / GOOD RESULT
 *   GOOD TRADE / BAD RESULT
 *   BAD TRADE / GOOD RESULT
 *   BAD TRADE / BAD RESULT
 * 
 * Profit ≠ good decision. A losing trade can be good (followed strategy,
 * acceptable risk). A profitable trade can be bad (violated rules).
 */
const EvidenceEngine = require('./evidence-engine');

class PostTradeLearningEngine {
    /**
     * Generate a complete post-trade review
     * @param {object} trade - closed trade (from TradingJournal.closeTrade)
     * @param {object} context - { regime, benchmarkReturn, strategyAdherence }
     */
    generateReview(trade, context = {}) {
        // ===== Decision quality =====
        const decision = this._assessDecision(trade, context);
        // ===== Result quality =====
        const result = this._assessResult(trade);
        // ===== Component quality =====
        const entryQuality = this._entryQuality(trade);
        const exitQuality = this._exitQuality(trade);
        const riskQuality = this._riskQuality(trade);
        // ===== Relative performance =====
        const relative = this._relativePerformance(trade, context);

        const classification = `${decision.label} / ${result.label}`;

        const review = {
            tradeId: trade.id,
            symbol: trade.symbol,
            direction: trade.direction,
            classification,
            decision,
            result,
            entryQuality,
            exitQuality,
            riskQuality,
            relative,
            sections: this._buildSections(trade, { decision, result, entryQuality, exitQuality, riskQuality, relative, context }),
            evidence: this._buildEvidence(trade, { decision, result, relative, context }),
            aiLesson: this._aiLesson(trade, { decision, result, relative, exitQuality }),
            timestamp: new Date().toISOString()
        };

        return review;
    }

    // ===== Decision quality: did the trader follow strategy + manage risk? =====
    _assessDecision(trade, context) {
        let score = 50;
        const factors = [];

        // Risk management
        if (trade.stopLoss) { score += 15; factors.push('Stop-loss was defined'); }
        else { score -= 20; factors.push('No stop-loss defined'); }

        // Risk/reward
        const rr = trade.riskReward || 0;
        if (rr >= 1.5) { score += 10; factors.push(`Risk/reward ${rr.toFixed(1)} acceptable`); }
        else if (rr > 0 && rr < 1) { score -= 10; factors.push(`Risk/reward ${rr.toFixed(1)} poor`); }

        // Position size sanity
        const positionRisk = trade.riskTaken || 0;
        const accountValue = context.accountValue || 100000;
        const riskPct = accountValue > 0 ? (positionRisk / accountValue) * 100 : 0;
        if (riskPct > 0 && riskPct <= 2) { score += 5; factors.push(`Risk per trade ${riskPct.toFixed(1)}% within limits`); }
        else if (riskPct > 5) { score -= 10; factors.push(`Risk per trade ${riskPct.toFixed(1)}% exceeds limits`); }

        // Strategy adherence (explicit flag or default reasonable)
        const adherence = context.strategyAdherence;
        if (adherence === true) { score += 10; factors.push('Setup matched strategy'); }
        else if (adherence === false) { score -= 15; factors.push('Setup deviated from strategy'); }

        // Regime awareness
        const regime = context.regime || {};
        if (regime.regime === 'HIGH VOLATILITY') {
            score -= 5;
            factors.push('Traded during high-volatility regime');
        }

        score = Math.max(0, Math.min(100, score));
        const label = score >= 60 ? 'GOOD TRADE' : 'BAD TRADE';
        const summary = label === 'GOOD TRADE'
            ? 'Decision followed the strategy with acceptable risk management.'
            : 'Decision quality was below standard (risk or strategy violations).';

        return { label, score, factors, summary };
    }

    // ===== Result quality =====
    _assessResult(trade) {
        const pnl = trade.pnl || 0;
        const label = pnl > 0 ? 'GOOD RESULT' : 'BAD RESULT';
        return {
            label,
            pnl,
            pnlPercent: trade.pnlPercent || 0,
            summary: pnl > 0 ? `Profit ${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}` : `Loss ${pnl.toFixed(2)}`
        };
    }

    // ===== Entry quality =====
    _entryQuality(trade) {
        let score = 50;
        const notes = [];

        // MFE vs eventual exit: good entries run favorably
        const mfe = Math.abs(trade.maxFavorableExcursion || 0);
        const totalRange = mfe + Math.abs(trade.maxAdverseExcursion || 0);
        if (totalRange > 0) {
            const mfeRatio = mfe / totalRange;
            if (mfeRatio > 0.6) { score += 15; notes.push('Entry captured most of the favorable move'); }
            else if (mfeRatio < 0.3) { score -= 15; notes.push('Entry was poorly timed relative to move'); }
        }

        // Premature exit check: exited near the bottom of MFE
        if (trade.pnl && trade.pnl > 0 && trade.maxFavorableExcursion && trade.pnl < trade.maxFavorableExcursion * 0.4) {
            score -= 10;
            notes.push('Exited far below maximum favorable excursion — possible premature exit');
        }

        return { score: Math.max(0, Math.min(100, score)), notes, quality: score >= 60 ? 'GOOD' : 'WEAK' };
    }

    // ===== Exit quality =====
    _exitQuality(trade) {
        let score = 50;
        const notes = [];

        const rr = trade.riskReward || 0;
        if (rr >= 2) { score += 15; notes.push('Exit captured ≥2R'); }
        else if (rr >= 1) { score += 5; notes.push('Exit captured ≥1R'); }
        else if (rr > 0) { score -= 10; notes.push('Exit captured <1R'); }

        const mae = Math.abs(trade.maxAdverseExcursion || 0);
        const risk = trade.riskTaken || 1;
        if (mae > risk * 1.2) { score -= 10; notes.push('Adverse excursion exceeded planned risk'); }

        return { score: Math.max(0, Math.min(100, score)), notes, quality: score >= 60 ? 'GOOD' : 'WEAK' };
    }

    // ===== Risk quality =====
    _riskQuality(trade) {
        let score = 50;
        const notes = [];

        if (trade.stopLoss) { score += 20; notes.push('Risk was capped by stop-loss'); }
        if (trade.riskReward && trade.riskReward >= 1.5) { score += 10; notes.push('Reward justified risk'); }
        if (trade.pnl && trade.pnl < 0 && !trade.stopLoss) { score -= 20; notes.push('Loss taken without a stop — uncontrolled risk'); }

        return { score: Math.max(0, Math.min(100, score)), notes, quality: score >= 60 ? 'GOOD' : 'WEAK' };
    }

    // ===== Relative performance vs benchmark =====
    _relativePerformance(trade, context) {
        const benchmark = context.benchmarkReturn;
        if (benchmark === undefined || benchmark === null) {
            return {
                available: false,
                message: 'Insufficient data to evaluate relative performance.',
                tradeReturn: trade.pnlPercent || 0
            };
        }
        const tradeReturn = trade.pnlPercent || 0;
        const alpha = tradeReturn - benchmark;
        return {
            available: true,
            tradeReturn: parseFloat(tradeReturn.toFixed(2)),
            benchmarkReturn: parseFloat(benchmark.toFixed(2)),
            alpha: parseFloat(alpha.toFixed(2)),
            interpretation: alpha >= 0
                ? `Trade outperformed benchmark by ${alpha.toFixed(2)}%`
                : `Trade underperformed benchmark by ${Math.abs(alpha).toFixed(2)}%`
        };
    }

    // ===== Review sections =====
    _buildSections(trade, q) {
        return {
            whatHappened: `${trade.direction.toUpperCase()} ${trade.symbol}: entry ${trade.entryPrice}, exit ${trade.exitPrice}, ${q.result.label.toLowerCase()}, held ${trade.durationHours}h.`,
            whyItHappened: this._whyItHappened(trade, q),
            strategyFollowed: q.decision.factors.includes('Setup matched strategy') || q.decision.label === 'GOOD TRADE'
                ? 'The trade was executed in line with the defined strategy and risk rules.'
                : 'The trade deviated from strategy/risk rules — review the decision factors.',
            marketRegime: q.context?.regime?.regime ? `${q.context.regime.regime} (${q.context.regime.sub || ''})` : 'Insufficient data',
            whatWentWell: q.decision.factors.filter(f => !f.toLowerCase().includes('no') && !f.toLowerCase().includes('poor') && !f.toLowerCase().includes('exceed')).slice(0, 3),
            whatWentWrong: q.decision.factors.filter(f => f.toLowerCase().includes('no') || f.toLowerCase().includes('poor') || f.toLowerCase().includes('exceed')).slice(0, 3),
            shouldRepeat: q.decision.label === 'GOOD TRADE' ? ['Documented setup', 'Defined stop-loss', 'Controlled risk'] : ['Define risk before entry'],
            shouldAvoid: q.decision.label === 'BAD TRADE' ? ['Trading without stop', 'Poor risk/reward entries'] : []
        };
    }

    _whyItHappened(trade, q) {
        const parts = [];
        if (trade.pnl > 0) {
            parts.push(q.entryQuality.score >= 60 ? 'Entry timing was favorable.' : 'Profit occurred despite weak entry timing.');
        } else {
            parts.push(q.riskQuality.score < 60 ? 'Uncontrolled risk contributed to the loss.' : 'Market moved against a controlled-risk position.');
        }
        if (q.relative.available) parts.push(q.relative.interpretation + '.');
        return parts.join(' ');
    }

    _buildEvidence(trade, q) {
        return [
            EvidenceEngine.create({ type: 'indicator', source: 'post-trade-learning', value: trade.riskReward, interpretation: `Realized R:R ${(trade.riskReward || 0).toFixed(2)}`, reliability: 'HIGH' }),
            EvidenceEngine.create({ type: 'indicator', source: 'post-trade-learning', value: trade.pnlPercent, interpretation: `Trade return ${(trade.pnlPercent || 0).toFixed(2)}%`, reliability: 'HIGH' }),
            EvidenceEngine.create({ type: 'indicator', source: 'post-trade-learning', value: trade.maxFavorableExcursion, interpretation: `MFE ${trade.maxFavorableExcursion?.toFixed(2)}`, reliability: 'MEDIUM' }),
            EvidenceEngine.create({ type: 'indicator', source: 'post-trade-learning', value: trade.maxAdverseExcursion, interpretation: `MAE ${trade.maxAdverseExcursion?.toFixed(2)}`, reliability: 'MEDIUM' })
        ];
    }

    _aiLesson(trade, q) {
        const lessons = [];
        if (q.decision.label === 'GOOD TRADE' && q.result.label === 'BAD RESULT') {
            lessons.push('This was a good trade with a bad result — the process was correct. Repeat the process; the outcome is probabilistic.');
        } else if (q.decision.label === 'BAD TRADE' && q.result.label === 'GOOD RESULT') {
            lessons.push('This was a profitable trade that violated your rules. Profit here does not validate the approach — it increases the risk of repeating rule-breaking behavior.');
        } else if (q.decision.label === 'BAD TRADE' && q.result.label === 'BAD RESULT') {
            lessons.push('Both decision and result were poor. Identify which rule was violated (risk, entry, strategy) and correct it before the next trade.');
        } else {
            lessons.push('Good process and good result. Document what worked so it can be repeated.');
        }
        if (q.exitQuality.notes.some(n => n.includes('premature') || n.includes('<1R'))) {
            lessons.push('Consider letting winners run toward your predefined target.');
        }
        return lessons;
    }
}

module.exports = PostTradeLearningEngine;