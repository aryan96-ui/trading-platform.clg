/**
 * Evidence Engine
 * 
 * A common, traceable evidence structure used by:
 * AI copilot, signal engine, trade quality, claim verification, regime engine.
 * 
 * Evidence {
 *   type,        // 'price' | 'volume' | 'indicator' | 'regime' | 'portfolio' | 'behavior' | 'news' | 'claim'
 *   source,      // provider/engine name
 *   timestamp,
 *   value,
 *   interpretation,
 *   reliability  // 'HIGH' | 'MEDIUM' | 'LOW'
 * }
 * 
 * Every conclusion in ProTrader must be traceable to evidence items.
 */
class EvidenceEngine {
    /**
     * Create a single evidence item
     */
    static create({ type, source, value, interpretation, reliability = 'MEDIUM', timestamp }) {
        if (!type || !source) {
            throw new Error('Evidence requires type and source');
        }
        return {
            id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
            type,
            source,
            timestamp: timestamp || new Date().toISOString(),
            value: value === undefined ? null : value,
            interpretation: interpretation || '',
            reliability
        };
    }

    /**
     * Build evidence from indicator values with a shared interpretation vocabulary
     */
    static fromIndicator({ name, value, bullishIf, bearishIf, neutralMin, neutralMax, unit }) {
        let interpretation;
        let reliability = 'MEDIUM';

        if (value === null || value === undefined || isNaN(value)) {
            interpretation = `Insufficient data to evaluate ${name}.`;
            reliability = 'LOW';
        } else if (neutralMin !== undefined && value >= neutralMin && value <= neutralMax) {
            interpretation = `${name} ${value.toFixed ? value.toFixed(1) : value} is neutral.`;
        } else if (bullishIf !== undefined && value >= bullishIf) {
            interpretation = `${name} ${value.toFixed ? value.toFixed(1) : value} is supportive (bullish).`;
        } else if (bearishIf !== undefined && value <= bearishIf) {
            interpretation = `${name} ${value.toFixed ? value.toFixed(1) : value} is adverse (bearish).`;
        } else {
            interpretation = `${name} ${value.toFixed ? value.toFixed(1) : value}.`;
        }

        return EvidenceEngine.create({
            type: 'indicator',
            source: 'indicator-engine',
            value,
            interpretation,
            reliability
        });
    }

    /**
     * Aggregate evidence by type
     */
    static groupByType(evidenceList) {
        const groups = {};
        for (const ev of evidenceList || []) {
            if (!groups[ev.type]) groups[ev.type] = [];
            groups[ev.type].push(ev);
        }
        return groups;
    }

    /**
     * Count supporting vs contradicting evidence based on interpretation polarity
     */
    static polarity(evidenceList) {
        let supporting = 0, contradicting = 0, neutral = 0, insufficient = 0;
        for (const ev of evidenceList || []) {
            const text = (ev.interpretation || '').toLowerCase();
            if (ev.reliability === 'LOW' || text.includes('insufficient')) {
                insufficient++;
            } else if (text.includes('supportive') || text.includes('bullish') || text.includes('positive') || text.includes('confirm')) {
                supporting++;
            } else if (text.includes('adverse') || text.includes('bearish') || text.includes('negative') || text.includes('contradict')) {
                contradicting++;
            } else {
                neutral++;
            }
        }
        return { supporting, contradicting, neutral, insufficient };
    }

    /**
     * Format evidence for an AI prompt (structured, no invented numbers)
     */
    static toAIContext(evidenceList, maxItems = 25) {
        return (evidenceList || []).slice(0, maxItems).map(ev => ({
            type: ev.type,
            source: ev.source,
            timestamp: ev.timestamp,
            value: ev.value,
            interpretation: ev.interpretation,
            reliability: ev.reliability
        }));
    }

    /**
     * Check data freshness for provenance display
     */
    static freshness(timestamp) {
        if (!timestamp) return { status: 'UNKNOWN', ageSeconds: null };
        const ageMs = Date.now() - new Date(timestamp).getTime();
        const ageSeconds = Math.max(0, Math.round(ageMs / 1000));
        if (ageMs < 0) return { status: 'UNKNOWN', ageSeconds };
        if (ageSeconds < 60) return { status: 'LIVE', ageSeconds };
        if (ageSeconds < 300) return { status: 'REALTIME', ageSeconds };
        if (ageSeconds < 3600) return { status: 'DELAYED', ageSeconds };
        if (ageSeconds < 86400) return { status: 'STALE', ageSeconds };
        return { status: 'UNAVAILABLE', ageSeconds };
    }

    /**
     * Attach provenance block to any payload
     */
    static provenance({ source, timestamp, status }) {
        const f = EvidenceEngine.freshness(timestamp);
        return {
            source: source || 'unknown',
            timestamp: timestamp || null,
            status: status || f.status,
            freshness: f
        };
    }
}

module.exports = EvidenceEngine;