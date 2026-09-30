// algorithms/sentimentEngine.js - Financial Natural Language Sentiment Engine (VADER-inspired)

class SentimentEngine {
    constructor() {
        // Financial Lexicon with polarity weights
        this.lexicon = {
            // Strong positive (+2 to +4)
            'surge': 3.0, 'surges': 3.0, 'skyrocket': 3.5, 'breakout': 2.5, 'rally': 2.8,
            'record': 2.0, 'profit': 2.5, 'profits': 2.5, 'gain': 2.0, 'gains': 2.0,
            'bullish': 3.0, 'outperform': 2.8, 'dividend': 1.8, 'upgrade': 2.5,
            'expansion': 2.0, 'growth': 2.2, 'soars': 3.2, 'strong': 1.8, 'beat': 2.4,

            // Moderate positive (+1 to +2)
            'positive': 1.5, 'steady': 1.0, 'stabilize': 1.2, 'rebound': 1.8,
            'boost': 1.6, 'inflows': 2.0, 'all-time-high': 3.5,

            // Strong negative (-2 to -4)
            'crash': -3.8, 'crashes': -3.8, 'plunge': -3.5, 'plunges': -3.5,
            'collapse': -4.0, 'slump': -2.8, 'tumble': -2.6, 'loss': -2.5,
            'losses': -2.5, 'bearish': -3.0, 'downgrade': -2.8, 'deficit': -2.0,
            'default': -3.8, 'probe': -2.5, 'investigation': -2.0, 'fraud': -4.0,
            'crisis': -3.5, 'panic': -3.5, 'liquidation': -3.0, 'sell-off': -2.8,

            // Moderate negative (-1 to -2)
            'negative': -1.5, 'drop': -1.8, 'drops': -1.8, 'decline': -1.8,
            'fear': -2.0, 'recession': -2.5, 'inflation': -1.5, 'halt': -2.0
        };

        this.intensifiers = {
            'heavily': 1.5, 'massively': 1.6, 'sharply': 1.4, 'drastically': 1.5,
            'strongly': 1.3, 'extremely': 1.6, 'slightly': 0.5, 'mildly': 0.6
        };

        this.negations = new Set(['not', 'no', 'never', 'neither', 'hardly', 'barely', 'failed', 'cannot', "didn't", "wasn't"]);
    }

    /**
     * Analyze text headline and compute normalized polarity [-1.0, +1.0]
     */
    analyzeText(text) {
        if (!text || typeof text !== 'string') {
            return { compound: 0, sentiment: 'Neutral', label: 'Neutral' };
        }

        const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
        let score = 0;
        let wordCount = 0;

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            let wordVal = this.lexicon[word] || 0;

            if (wordVal !== 0) {
                // Check for preceding intensifier (e.g. "sharply plunge")
                if (i > 0 && this.intensifiers[words[i - 1]]) {
                    wordVal *= this.intensifiers[words[i - 1]];
                }

                // Check for preceding negation (e.g. "not plunge", "failed to surge")
                if (i > 0 && this.negations.has(words[i - 1])) {
                    wordVal *= -0.75;
                } else if (i > 1 && this.negations.has(words[i - 2])) {
                    wordVal *= -0.75;
                }

                score += wordVal;
                wordCount++;
            }
        }

        // Standard VADER normalization formula: score / sqrt(score^2 + alpha)
        const alpha = 15;
        const compound = Number((score / Math.sqrt(Math.pow(score, 2) + alpha)).toFixed(3));

        let sentiment = 'Neutral';
        let label = 'NEUTRAL';
        if (compound >= 0.15) {
            sentiment = compound >= 0.5 ? 'Very Bullish' : 'Bullish';
            label = 'BULLISH';
        } else if (compound <= -0.15) {
            sentiment = compound <= -0.5 ? 'Very Bearish' : 'Bearish';
            label = 'BEARISH';
        }

        return {
            compound,
            sentiment,
            label,
            wordMatches: wordCount,
            fearGreedIndex: Math.round(((compound + 1) / 2) * 100) // 0 to 100 Fear & Greed index
        };
    }

    /**
     * Compute Aggregate Symbol Sentiment across multiple news headlines
     */
    evaluateSymbolSentiment(symbol, headlines = []) {
        const matching = headlines.filter(h => !h.symbol || h.symbol.toUpperCase() === symbol.toUpperCase());
        if (matching.length === 0) {
            return { symbol, compound: 0.2, sentiment: 'Mildly Bullish', fearGreedIndex: 60, articleCount: 0 };
        }

        const scores = matching.map(h => this.analyzeText(h.title).compound);
        const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3));

        const fearGreed = Math.round(((avgScore + 1) / 2) * 100);
        return {
            symbol,
            compound: avgScore,
            sentiment: avgScore >= 0.15 ? 'Bullish' : avgScore <= -0.15 ? 'Bearish' : 'Neutral',
            fearGreedIndex: fearGreed,
            articleCount: matching.length,
            marketTone: fearGreed > 70 ? 'Extreme Greed' : fearGreed > 55 ? 'Greed' : fearGreed < 30 ? 'Extreme Fear' : fearGreed < 45 ? 'Fear' : 'Neutral'
        };
    }
}

module.exports = new SentimentEngine();
