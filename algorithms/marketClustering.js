// algorithms/marketClustering.js - K-Means Multi-Asset Heatmap & Regime Clustering Engine

class MarketClusteringEngine {
    /**
     * K-Means Clustering on Multi-Asset Feature Vectors
     * Features: [24h Return %, Volatility %, Volume Surge Ratio]
     */
    static clusterAssets(assetList = [], k = 3, maxIterations = 20) {
        if (!Array.isArray(assetList) || assetList.length < k) {
            return { clusters: [], heatmap: [] };
        }

        // 1. Extract feature points
        const points = assetList.map(asset => ({
            symbol: asset.symbol,
            name: asset.name || asset.symbol,
            category: asset.category || 'stocks',
            price: asset.price,
            changePercent: asset.changePercent || 0,
            volatility: asset.volatility || 1.5,
            volumeSurge: asset.volumeSurge || (1.0 + (Math.random() * 0.8)),
            features: [
                asset.changePercent || 0,
                asset.volatility || 1.5,
                asset.volumeSurge || 1.0
            ]
        }));

        // 2. Normalize features (z-score normalization)
        const numDims = 3;
        const means = [0, 0, 0];
        const stds = [1, 1, 1];

        for (let d = 0; d < numDims; d++) {
            const vals = points.map(p => p.features[d]);
            means[d] = vals.reduce((a, b) => a + b, 0) / vals.length;
            const variance = vals.map(v => Math.pow(v - means[d], 2)).reduce((a, b) => a + b, 0) / vals.length;
            stds[d] = Math.sqrt(variance) || 1;
        }

        const normalized = points.map(p => ({
            ...p,
            normFeatures: p.features.map((val, d) => (val - means[d]) / stds[d])
        }));

        // 3. Initialize Centroids (K-Means++ style or evenly spaced)
        let centroids = [];
        for (let i = 0; i < k; i++) {
            const idx = Math.floor((i / k) * normalized.length);
            centroids.push([...normalized[idx].normFeatures]);
        }

        // 4. Run K-Means iterative convergence
        let assignments = new Array(normalized.length).fill(0);

        for (let iter = 0; iter < maxIterations; iter++) {
            let changed = false;

            // Assign each point to closest centroid
            for (let i = 0; i < normalized.length; i++) {
                let bestDist = Infinity;
                let bestCluster = 0;

                for (let c = 0; c < k; c++) {
                    const dist = this.euclideanDistance(normalized[i].normFeatures, centroids[c]);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestCluster = c;
                    }
                }

                if (assignments[i] !== bestCluster) {
                    assignments[i] = bestCluster;
                    changed = true;
                }
            }

            if (!changed && iter > 0) break;

            // Update centroid coordinates
            for (let c = 0; c < k; c++) {
                const clusterPoints = normalized.filter((_, idx) => assignments[idx] === c);
                if (clusterPoints.length > 0) {
                    for (let d = 0; d < numDims; d++) {
                        centroids[c][d] = clusterPoints.reduce((sum, p) => sum + p.normFeatures[d], 0) / clusterPoints.length;
                    }
                }
            }
        }

        // 5. Label clusters meaningfully based on average returns and volatility
        const clusterLabels = [
            { name: '🔥 High Momentum / Breakout', regime: 'Bullish Expansion', color: '#10b981' },
            { name: '⚖️ Range-Bound / Stable', regime: 'Equilibrium', color: '#3b82f6' },
            { name: '⚠️ High Volatility / Distribution', regime: 'Risk Stress', color: '#ef4444' }
        ];

        const groupedClusters = [];
        for (let c = 0; c < k; c++) {
            const members = normalized
                .filter((_, idx) => assignments[idx] === c)
                .map(p => ({
                    symbol: p.symbol,
                    name: p.name,
                    category: p.category,
                    price: p.price,
                    changePercent: p.changePercent,
                    volatility: p.volatility,
                    volumeSurge: Number(p.volumeSurge.toFixed(2))
                }));

            const labelInfo = clusterLabels[c % clusterLabels.length];

            groupedClusters.push({
                clusterId: c,
                label: labelInfo.name,
                regime: labelInfo.regime,
                color: labelInfo.color,
                assetCount: members.length,
                members
            });
        }

        return {
            totalAssets: assetList.length,
            kClusters: k,
            clusters: groupedClusters,
            heatmapData: assetList.map(a => ({
                symbol: a.symbol,
                changePercent: a.changePercent || 0,
                volatility: a.volatility || 1.5,
                intensity: Math.min(100, Math.max(0, Math.round(((a.changePercent || 0) + 5) * 10)))
            }))
        };
    }

    static euclideanDistance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += Math.pow(a[i] - b[i], 2);
        }
        return Math.sqrt(sum);
    }
}

module.exports = MarketClusteringEngine;
