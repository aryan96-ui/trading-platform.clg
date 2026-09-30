// algorithms/historicalReplay.js - Historical Market Simulation & Bar-by-Bar Replay Engine

class HistoricalReplayEngine {
    /**
     * Initialize a replay session for historical backtesting
     */
    static createReplaySession(candles = [], initialIndex = 20) {
        if (!Array.isArray(candles) || candles.length === 0) {
            return null;
        }

        const startIndex = Math.min(initialIndex, candles.length - 1);
        return {
            totalBars: candles.length,
            currentIndex: startIndex,
            visibleCandles: candles.slice(0, startIndex + 1),
            isCompleted: startIndex >= candles.length - 1
        };
    }

    /**
     * Advance replay session by 1 or N bars
     */
    static stepForward(session, allCandles, stepSize = 1) {
        if (!session || !Array.isArray(allCandles)) return session;

        const nextIndex = Math.min(allCandles.length - 1, session.currentIndex + stepSize);
        return {
            totalBars: allCandles.length,
            currentIndex: nextIndex,
            currentBar: allCandles[nextIndex],
            visibleCandles: allCandles.slice(0, nextIndex + 1),
            isCompleted: nextIndex >= allCandles.length - 1
        };
    }
}

module.exports = HistoricalReplayEngine;
