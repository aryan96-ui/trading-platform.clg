/**
 * Excursion measurement (MFE / MAE)
 *
 * Maximum favorable / adverse excursion is the best and worst unrealized
 * move a position actually saw while it was open. It is measured from the
 * real OHLC bars covering the holding period.
 *
 * When no bars cover the holding period — e.g. a position closed inside the
 * current bar — both values are null and `samples: 0`. The caller must render
 * that as unavailable rather than substituting an estimate.
 */

/**
 * @param {object} gateway  Market data gateway
 * @param {string} symbol
 * @param {object} opts     { openedAt, closedAt, entryPrice, direction, interval }
 */
async function computeExcursions(gateway, symbol, opts = {}) {
    const {
        openedAt, closedAt = new Date().toISOString(),
        entryPrice, direction = 'long', interval = '1D'
    } = opts;

    const unavailable = {
        mfe: null, mae: null, mfePercent: null, maePercent: null,
        samples: 0, from: openedAt || null, to: closedAt,
        source: null, unavailable: 'no bars cover this holding period'
    };

    if (!gateway || !symbol || !isFinite(entryPrice) || entryPrice <= 0) return unavailable;

    let bars = [];
    try {
        bars = await gateway.getHistory(symbol, undefined, interval, 300) || [];
    } catch (e) {
        return { ...unavailable, unavailable: `history fetch failed: ${e.message}` };
    }
    if (!bars.length) return unavailable;

    const from = openedAt ? new Date(openedAt).getTime() : 0;
    const to = new Date(closedAt).getTime();
    const window = bars.filter(b => {
        const t = new Date(b.timestamp).getTime();
        return isFinite(t) && t >= from && t <= to;
    });

    // No bar in the window means the position lived inside the latest bar.
    // The entry price is still a real observation, so the excursion floor is
    // zero samples rather than a fabricated range.
    if (!window.length) {
        return { ...unavailable, source: bars[0]?.source || null };
    }

    let best = -Infinity;
    let worst = Infinity;
    for (const b of window) {
        if (!isFinite(b.high) || !isFinite(b.low)) continue;
        if (direction === 'long') {
            best = Math.max(best, b.high);
            worst = Math.min(worst, b.low);
        } else {
            best = Math.max(best, entryPrice - b.low);
            worst = Math.min(worst, entryPrice - b.high);
        }
    }
    if (best === -Infinity) return { ...unavailable, source: bars[0]?.source || null };

    const mfe = direction === 'long' ? best - entryPrice : best;
    const mae = direction === 'long' ? entryPrice - worst : worst;

    return {
        mfe: round(mfe),
        mae: round(mae),
        mfePercent: round((mfe / entryPrice) * 100),
        maePercent: round((mae / entryPrice) * 100),
        samples: window.length,
        direction,
        interval,
        from: new Date(Math.max(from, new Date(window[0].timestamp).getTime())).toISOString(),
        to,
        source: window[0].source || bars[0].source || null
    };
}

function round(n, dp = 2) {
    if (n === null || n === undefined || isNaN(n)) return null;
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

module.exports = { computeExcursions };
