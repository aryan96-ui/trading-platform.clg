/**
 * Finfluencer Claim Verification Engine
 * 
 * Verifies MARKET CLAIMS against available evidence. This is NOT a system
 * for declaring whether a person is fraudulent — it verifies claims.
 * 
 * Flow:
 * 1. User submits a claim ("XYZ is breaking out because institutional
 *    buying is increasing.")
 * 2. Claims are extracted (simple NLP heuristics).
 * 3. Each claim is checked against available datasets:
 *    price, volume, relative volume, technicals, news (if available).
 * 4. Verdict: SUPPORTED | PARTIALLY SUPPORTED | NOT SUPPORTED | INSUFFICIENT DATA
 * 
 * Institutional-flow data is NEVER fabricated. If unavailable, that
 * sub-claim is INSUFFICIENT DATA.
 */
const EvidenceEngine = require('./evidence-engine');

// Claim patterns mapped to verifiable data points
const CLAIM_PATTERNS = [
    { pattern: /unusual volume|high volume|volume spike/i, field: 'volume', label: 'Unusual volume' },
    { pattern: /break(?:ing)? ?out|breaking out/i, field: 'breakout', label: 'Breakout' },
    { pattern: /trend(?:ing)? up|uptrend|rally/i, field: 'trend', label: 'Uptrend' },
    { pattern: /institutional (?:buying|accumulation)/i, field: 'institutional', label: 'Institutional buying' },
    { pattern: /oversold|undervalued/i, field: 'oversold', label: 'Oversold condition' },
    { pattern: /overbought|overvalued/i, field: 'overbought', label: 'Overbought condition' },
    { pattern: /support (?:level|at)|holding support/i, field: 'support', label: 'Support holding' },
    { pattern: /resistance (?:level|at)/i, field: 'resistance', label: 'Resistance' },
    { pattern: /momentum|strong move/i, field: 'momentum', label: 'Momentum' }
];

class ClaimVerificationEngine {
    /**
     * Verify a claim text against available market data
     * @param {object} input - { claimText, symbol, data: { price, volume, avgVolume, rsi, high52w, low52w, atr, news: [] } }
     */
    verify(input) {
        const { claimText, symbol, data = {} } = input;
        if (!claimText || !symbol) {
            return { success: false, error: 'claimText and symbol required' };
        }

        const claims = this._extractClaims(claimText);
        if (claims.length === 0) {
            return {
                success: true,
                symbol,
                claims: [],
                verdict: 'INSUFFICIENT DATA',
                message: 'No verifiable market claims detected in the statement.',
                disclaimer: 'This engine verifies market claims against available data. It does not judge the person making the claim.'
            };
        }

        const results = claims.map(claim => this._verifyClaim(claim, data));

        // Overall verdict: weakest of the individual verdicts
        const rank = { 'NOT SUPPORTED': 0, 'PARTIALLY SUPPORTED': 1, 'SUPPORTED': 2, 'INSUFFICIENT DATA': 3 };
        const weakest = results.reduce((acc, r) => rank[r.verdict] < rank[acc] ? r.verdict : acc, 'SUPPORTED');

        return {
            success: true,
            symbol,
            claimText,
            claims: results,
            verdict: weakest,
            verdictExplanation: this._explainVerdict(weakest, results.length),
            disclaimer: 'Verification uses only actual available datasets. Institutional-flow data is not fabricated — if unavailable it is marked INSUFFICIENT DATA.',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Extract claims from statement text using pattern matching
     */
    _extractClaims(text) {
        const found = [];
        for (const cp of CLAIM_PATTERNS) {
            if (cp.pattern.test(text)) {
                // extract subject (before the pattern)
                const match = text.match(cp.pattern);
                const before = text.slice(0, match.index).trim().split(/\s+/).slice(-3).join(' ');
            found.push({
                claim: cp.label,
                field: cp.field,
                quoted: match[0],
                context: before
            });
            }
        }
        return found;
    }

    /**
     * Verify a single claim against available data
     */
    _verifyClaim(claim, data) {
        const evidence = [];
        let verdict = 'INSUFFICIENT DATA';

        switch (claim.field) {
            case 'volume': {
                const vol = data.volume;
                const avg = data.avgVolume;
                if (vol !== undefined && avg > 0) {
                    const ratio = vol / avg;
                    evidence.push(EvidenceEngine.create({
                        type: 'volume', source: 'claim-verification', value: ratio,
                        interpretation: `Current volume is ${ratio.toFixed(1)}x the 20-day average (${vol.toLocaleString()} vs ${avg.toLocaleString()})`,
                        reliability: 'HIGH'
                    }));
                    verdict = ratio >= 1.5 ? 'SUPPORTED' : ratio >= 1.1 ? 'PARTIALLY SUPPORTED' : 'NOT SUPPORTED';
                }
                break;
            }
            case 'breakout': {
                const price = data.price, high52w = data.high52w, avgVol = data.avgVolume, vol = data.volume;
                if (price !== undefined && high52w !== undefined) {
                    const nearHigh = (high52w - price) / high52w <= 0.05;
                    const volConfirm = vol !== undefined && avgVol > 0 ? vol / avgVol >= 1.2 : null;
                    evidence.push(EvidenceEngine.create({
                        type: 'price', source: 'claim-verification', value: price,
                        interpretation: `Price ${price} is ${nearHigh ? 'within 5% of' : 'away from'} the 52-week high (${high52w})`,
                        reliability: 'HIGH'
                    }));
                    if (volConfirm !== null) {
                        evidence.push(EvidenceEngine.create({
                            type: 'volume', source: 'claim-verification', value: volConfirm,
                            interpretation: volConfirm ? 'Volume confirms the move' : 'Volume does not confirm the move',
                            reliability: 'HIGH'
                        }));
                    }
                    if (nearHigh && volConfirm === true) verdict = 'SUPPORTED';
                    else if (nearHigh || volConfirm === true) verdict = 'PARTIALLY SUPPORTED';
                    else if (volConfirm === false) verdict = 'NOT SUPPORTED';
                }
                break;
            }
            case 'trend': {
                const price = data.price, ema50 = data.ema50, ema200 = data.ema200;
                if (price !== undefined && ema50 !== undefined) {
                    const above = price > ema50;
                    evidence.push(EvidenceEngine.create({
                        type: 'indicator', source: 'claim-verification', value: price,
                        interpretation: `Price ${above ? 'above' : 'below'} 50-day EMA (${ema50})`,
                        reliability: 'HIGH'
                    }));
                    const longTerm = ema200 === undefined ? null : price > ema200;
                    verdict = above && (longTerm === null || longTerm) ? 'SUPPORTED'
                        : above ? 'PARTIALLY SUPPORTED' : 'NOT SUPPORTED';
                }
                break;
            }
            case 'institutional': {
                // Never fabricate institutional flow data
                evidence.push(EvidenceEngine.create({
                    type: 'claim', source: 'claim-verification', value: null,
                    interpretation: 'Institutional order-flow data is not available from current providers. Cannot verify this claim.',
                    reliability: 'LOW'
                }));
                verdict = 'INSUFFICIENT DATA';
                break;
            }
            case 'oversold': {
                if (data.rsi !== undefined) {
                    const isOversold = data.rsi < 30;
                    evidence.push(EvidenceEngine.create({
                        type: 'indicator', source: 'claim-verification', value: data.rsi,
                        interpretation: `RSI is ${data.rsi.toFixed(1)} (${isOversold ? 'oversold' : 'not oversold'})`,
                        reliability: 'HIGH'
                    }));
                    verdict = isOversold ? 'SUPPORTED' : 'NOT SUPPORTED';
                }
                break;
            }
            case 'overbought': {
                if (data.rsi !== undefined) {
                    const isOverbought = data.rsi > 70;
                    evidence.push(EvidenceEngine.create({
                        type: 'indicator', source: 'claim-verification', value: data.rsi,
                        interpretation: `RSI is ${data.rsi.toFixed(1)} (${isOverbought ? 'overbought' : 'not overbought'})`,
                        reliability: 'HIGH'
                    }));
                    verdict = isOverbought ? 'SUPPORTED' : 'NOT SUPPORTED';
                }
                break;
            }
            case 'support':
            case 'resistance': {
                // Requires intraday/session lows or 52w lows — check if available
                const ref = claim.field === 'support' ? data.low52w : data.high52w;
                const price = data.price;
                if (ref !== undefined && price !== undefined) {
                    const near = Math.abs(price - ref) / ref <= 0.03;
                    evidence.push(EvidenceEngine.create({
                        type: 'price', source: 'claim-verification', value: price,
                        interpretation: `Price ${price} is ${near ? 'near' : 'away from'} the ${claim.field === 'support' ? '52-week low' : '52-week high'} (${ref})`,
                        reliability: 'MEDIUM'
                    }));
                    verdict = near ? 'PARTIALLY SUPPORTED' : 'INSUFFICIENT DATA';
                }
                break;
            }
            case 'momentum': {
                if (data.macdHistogram !== undefined && data.macdHistogram !== null) {
                    const positive = data.macdHistogram > 0;
                    evidence.push(EvidenceEngine.create({
                        type: 'indicator', source: 'claim-verification', value: data.macdHistogram,
                        interpretation: `MACD histogram is ${positive ? 'positive' : 'negative'} — ${positive ? 'supportive' : 'not supportive'} of momentum claim`,
                        reliability: 'MEDIUM'
                    }));
                    verdict = positive ? 'SUPPORTED' : 'NOT SUPPORTED';
                }
                break;
            }
            default:
                verdict = 'INSUFFICIENT DATA';
        }

        return {
            ...claim,
            verdict,
            evidence
        };
    }

    _explainVerdict(verdict, count) {
        const map = {
            'SUPPORTED': 'The claim is supported by available market data.',
            'PARTIALLY SUPPORTED': 'The claim is partially supported — some components verified, others did not.',
            'NOT SUPPORTED': 'The claim contradicts available market data.',
            'INSUFFICIENT DATA': 'Available data is insufficient to verify this claim.'
        };
        return map[verdict];
    }
}

module.exports = ClaimVerificationEngine;