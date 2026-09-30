// algorithms/pairsTrading.js - Statistical Arbitrage & Mean-Reversion Pairs Engine

class PairsTradingEngine {
    // Calculate Pearson Correlation Coefficient between two price series
    static calculatePearsonCorrelation(seriesA, seriesB) {
        if (!Array.isArray(seriesA) || !Array.isArray(seriesB) || seriesA.length !== seriesB.length || seriesA.length < 5) {
            return 0;
        }

        const n = seriesA.length;
        const meanA = seriesA.reduce((sum, v) => sum + v, 0) / n;
        const meanB = seriesB.reduce((sum, v) => sum + v, 0) / n;

        let numerator = 0;
        let denomA = 0;
        let denomB = 0;

        for (let i = 0; i < n; i++) {
            const diffA = seriesA[i] - meanA;
            const diffB = seriesB[i] - meanB;
            numerator += diffA * diffB;
            denomA += diffA * diffA;
            denomB += diffB * diffB;
        }

        const denom = Math.sqrt(denomA * denomB);
        if (denom === 0) return 0;
        return Number((numerator / denom).toFixed(4));
    }

    // Calculate OLS Hedge Ratio (beta)
    static calculateHedgeRatio(seriesA, seriesB) {
        const n = seriesA.length;
        const meanA = seriesA.reduce((sum, v) => sum + v, 0) / n;
        const meanB = seriesB.reduce((sum, v) => sum + v, 0) / n;

        let cov = 0;
        let varA = 0;

        for (let i = 0; i < n; i++) {
            cov += (seriesA[i] - meanA) * (seriesB[i] - meanB);
            varA += Math.pow(seriesA[i] - meanA, 2);
        }

        return varA !== 0 ? Number((cov / varA).toFixed(4)) : 1.0;
    }

    // Analyze a pair of assets for statistical arbitrage
    static analyzePair(symbolA, seriesA, symbolB, seriesB) {
        const correlation = this.calculatePearsonCorrelation(seriesA, seriesB);
        const hedgeRatio = this.calculateHedgeRatio(seriesA, seriesB);

        // Compute rolling spread: Spread = SeriesB - (hedgeRatio * SeriesA)
        const spread = [];
        for (let i = 0; i < seriesA.length; i++) {
            spread.push(Number((seriesB[i] - (hedgeRatio * seriesA[i])).toFixed(4)));
        }

        // Spread mean and std deviation
        const spreadMean = spread.reduce((a, b) => a + b, 0) / spread.length;
        const variance = spread.map(s => Math.pow(s - spreadMean, 2)).reduce((a, b) => a + b, 0) / spread.length;
        const spreadStd = Math.sqrt(variance);

        // Compute rolling Z-scores
        const zScores = spread.map(s => spreadStd > 0 ? Number(((s - spreadMean) / spreadStd).toFixed(2)) : 0);
        const currentZScore = zScores[zScores.length - 1];

        let signal = 'NEUTRAL';
        let recommendation = 'Spread within normal standard deviation bounds.';

        if (currentZScore > 2.0) {
            signal = 'SHORT_SPREAD';
            recommendation = `Spread is +${currentZScore}σ overextended. Strategy: SELL ${symbolB}, BUY ${symbolA} for mean reversion.`;
        } else if (currentZScore < -2.0) {
            signal = 'LONG_SPREAD';
            recommendation = `Spread is ${currentZScore}σ depressed. Strategy: BUY ${symbolB}, SELL ${symbolA} for mean reversion.`;
        } else if (Math.abs(currentZScore) < 0.5) {
            signal = 'MEAN_REVERTED';
            recommendation = 'Spread has converged to equilibrium mean. Consider closing active pair positions.';
        }

        return {
            pair: `${symbolA} / ${symbolB}`,
            symbolA,
            symbolB,
            correlation,
            isCointegrated: Math.abs(correlation) > 0.70,
            hedgeRatio,
            currentSpread: spread[spread.length - 1],
            currentZScore,
            spreadMean: Number(spreadMean.toFixed(4)),
            spreadStdDev: Number(spreadStd.toFixed(4)),
            signal,
            recommendation,
            historicalSpread: spread.slice(-50),
            historicalZScore: zScores.slice(-50)
        };
    }

    // Build correlation matrix across a multi-symbol universe
    static buildCorrelationMatrix(symbolsDataMap) {
        const symbols = Object.keys(symbolsDataMap);
        const matrix = {};

        for (let i = 0; i < symbols.length; i++) {
            const symA = symbols[i];
            matrix[symA] = {};
            for (let j = 0; j < symbols.length; j++) {
                const symB = symbols[j];
                if (symA === symB) {
                    matrix[symA][symB] = 1.0;
                } else {
                    matrix[symA][symB] = this.calculatePearsonCorrelation(symbolsDataMap[symA], symbolsDataMap[symB]);
                }
            }
        }

        return { symbols, matrix };
    }
}

module.exports = PairsTradingEngine;
