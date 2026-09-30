/**
 * riskGateService.js — Pre-Trade Intelligence Gate
 *
 * Responsibilities:
 *  1. Issue short-lived Risk Gate Tokens after a successful analysis
 *  2. Validate those tokens on the /api/trade execution route
 *  3. Detect revenge-trading behavioural patterns from journal history
 *  4. Compose a rich ATR / VaR / Kelly risk context object for the AI prompt
 */

const crypto = require('crypto');
const RiskEngine  = require('../algorithms/riskEngine');
const PairsTradingEngine = require('../algorithms/pairsTrading');
const TechnicalIndicators = require('../algorithms/technicalIndicators');
const marketDataService   = require('./marketDataService');

// ─────────────────────────────────────────────────────────────────────────────
// In-memory token store  { email → { token, symbol, expiresAt } }
// ─────────────────────────────────────────────────────────────────────────────
const _tokenStore = new Map();
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a short-lived one-time-use token tied to (email, symbol) */
function generateToken(email, symbol) {
    const raw   = `${email}:${symbol}:${Date.now()}:${Math.random()}`;
    const token = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40);
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    _tokenStore.set(email, { token, symbol: symbol.toUpperCase(), expiresAt });

    // Auto-cleanup after TTL
    setTimeout(() => {
        const entry = _tokenStore.get(email);
        if (entry && entry.token === token) {
            _tokenStore.delete(email);
        }
    }, TOKEN_TTL_MS + 1000);

    return { token, expiresAt: new Date(expiresAt).toISOString() };
}

/**
 * Validate a token submitted with a trade execution request.
 * Consumes the token on success (one-time use).
 */
function validateToken(token, email, symbol) {
    const entry = _tokenStore.get(email);
    if (!entry) return { valid: false, reason: 'No active Risk Gate session. Run Pre-Trade Analysis first.' };
    if (Date.now() > entry.expiresAt) {
        _tokenStore.delete(email);
        return { valid: false, reason: 'Risk Gate token has expired. Please re-run analysis.' };
    }
    if (entry.token !== token) {
        return { valid: false, reason: 'Invalid Risk Gate token. Token mismatch.' };
    }
    if (symbol && entry.symbol !== symbol.toUpperCase()) {
        return { valid: false, reason: `Risk Gate was cleared for ${entry.symbol}, not ${symbol.toUpperCase()}.` };
    }

    // Consume token (one-time use)
    _tokenStore.delete(email);
    return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revenge Trading Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyse the last 24 hours of a user's closed trades from the TradingJournal.
 *
 * Triggers if ALL of:
 *   - ≥3 consecutive losses (chronological order, most recent last)
 *   - Each successive losing position size is ≥ 10% larger than the prior one
 *
 * @param {Array} recentTrades  - Closed trade objects from TradingJournal.getTrades()
 * @returns {{ isRevenge: boolean, consecutiveLosses: number, positionEscalation: boolean, cooloffMinutes: number, details: string }}
 */
function detectRevengeTradingPattern(recentTrades = []) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const last24h = recentTrades
        .filter(t => new Date(t.closedAt || t.openedAt).getTime() > cutoff)
        .sort((a, b) => new Date(a.closedAt || a.openedAt) - new Date(b.closedAt || b.openedAt));

    if (last24h.length < 3) {
        return { isRevenge: false, consecutiveLosses: 0, positionEscalation: false, cooloffMinutes: 0, details: 'Insufficient trade history in the last 24h.' };
    }

    // Walk backwards to find consecutive tail losses
    let tail = [];
    for (let i = last24h.length - 1; i >= 0; i--) {
        if ((last24h[i].pnl ?? last24h[i].realizedPnl ?? 0) < 0) {
            tail.unshift(last24h[i]);
        } else {
            break; // streak broken
        }
    }

    const consecutiveLosses = tail.length;
    if (consecutiveLosses < 3) {
        return { isRevenge: false, consecutiveLosses, positionEscalation: false, cooloffMinutes: 0, details: `Only ${consecutiveLosses} consecutive loss(es) detected.` };
    }

    // Check escalating position sizes
    let positionEscalation = false;
    const sizes = tail.map(t => (t.quantity || 1) * (t.entryPrice || 1));
    for (let i = 1; i < sizes.length; i++) {
        if (sizes[i] > sizes[i - 1] * 1.10) {
            positionEscalation = true;
            break;
        }
    }

    const isRevenge = positionEscalation;
    const totalLoss = tail.reduce((s, t) => s + Math.abs(t.pnl ?? t.realizedPnl ?? 0), 0);

    return {
        isRevenge,
        consecutiveLosses,
        positionEscalation,
        cooloffMinutes: isRevenge ? 30 : 0,
        totalLossAmount: parseFloat(totalLoss.toFixed(2)),
        details: isRevenge
            ? `⚠️ REVENGE TRADING DETECTED: ${consecutiveLosses} consecutive losses with escalating position sizes detected in the last 24h. Total loss: ₹${totalLoss.toFixed(2)}. A 30-minute cool-off period is now enforced.`
            : `${consecutiveLosses} consecutive losses detected but no escalating position size pattern. Proceed with caution.`
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantitative Context Builder (feeds the AI prompt)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assembles live market + quant data for a symbol to enrich the AI prompt.
 *
 * @param {string} symbol
 * @param {string} direction  'BUY' | 'SELL'
 * @param {number} capital    user's available balance
 * @param {number} quantity
 * @returns {object} quantContext
 */
function buildQuantContext(symbol, direction = 'BUY', capital = 100000, quantity = 1) {
    const sym   = symbol.toUpperCase();
    const price = marketDataService.getAssetPrice(sym) || 1000;
    const candles = marketDataService.getHistoricalCandles(sym, 60, '5m');

    // ── Technical Indicators ──────────────────────────────────────────────────
    let signals = { signal: 'NEUTRAL', confidence: 50, indicators: { rsi: 50, macdHistogram: 0, bollingerPercentB: 50, stochasticK: 50 } };
    try { signals = TechnicalIndicators.evaluateSignals(candles); } catch (_) {}

    const closes = candles.map(c => c.close || c[4] || price);
    const highs  = candles.map(c => c.high  || c[2] || price);
    const lows   = candles.map(c => c.low   || c[3] || price);

    // ── ATR (volatility) ──────────────────────────────────────────────────────
    let currentAtr = price * 0.015;
    try {
        const atrArr = TechnicalIndicators.ATR(candles, 14);
        if (atrArr.length > 0 && atrArr[atrArr.length - 1]) {
            currentAtr = atrArr[atrArr.length - 1];
        }
    } catch (_) {}

    // ── EMA Trend Truth ───────────────────────────────────────────────────────
    let ema20 = price;
    let ema50 = price;
    let trendTruth = 'NEUTRAL';
    try {
        const ema20Arr = TechnicalIndicators.EMA(closes, 20);
        const ema50Arr = TechnicalIndicators.EMA(closes, 50);
        ema20 = ema20Arr[ema20Arr.length - 1] || price;
        ema50 = ema50Arr[ema50Arr.length - 1] || price;
        if (price > ema20 && ema20 > ema50)      trendTruth = 'BULLISH';
        else if (price < ema20 && ema20 < ema50) trendTruth = 'BEARISH';
    } catch (_) {}

    // ── Pairs / Z-Score for symbol vs its closest correlated peer ─────────────
    let zScoreData = null;
    try {
        const peers = { RELIANCE: 'ITC', TCS: 'INFY', HDFCBANK: 'ICICIBANK', BTC: 'ETH', GOLD: 'SILVER' };
        const peerSym = peers[sym];
        if (peerSym) {
            const seriesA = marketDataService.getHistoricalCandles(sym, 60, '5m').map(c => c.close || c[4] || price);
            const seriesB = marketDataService.getHistoricalCandles(peerSym, 60, '5m').map(c => c.close || c[4] || price * 0.5);
            if (seriesA.length >= 10 && seriesB.length >= 10) {
                zScoreData = PairsTradingEngine.analyzePair(sym, seriesA, peerSym, seriesB);
            }
        }
    } catch (_) {}

    // ── Kelly + ATR Position Sizing ───────────────────────────────────────────
    const kelly = RiskEngine.calculateKellyPosition({ capital, winRate: 0.55, winLossRatio: 1.8 });
    const sizing = RiskEngine.calculateAtrPositionSizing({
        capital,
        currentPrice: price,
        atr: currentAtr,
        riskPercent: 1.5,
        atrMultiplier: 2.0,
        direction
    });

    // ── Historical Volatility (20-day annualised) ─────────────────────────────
    let historicalVolatility = 0;
    try {
        if (closes.length >= 20) {
            const returns = closes.slice(-20).map((c, i, arr) => i === 0 ? 0 : Math.log(c / arr[i - 1]));
            const mean = returns.slice(1).reduce((a, b) => a + b, 0) / (returns.length - 1);
            const variance = returns.slice(1).reduce((a, r) => a + Math.pow(r - mean, 2), 0) / (returns.length - 2);
            historicalVolatility = parseFloat((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(2));
        }
    } catch (_) {}

    // ── VaR ───────────────────────────────────────────────────────────────────
    const positionValue = price * quantity;
    const varResult = RiskEngine.calculateVaR([], positionValue, 0.95);

    return {
        symbol: sym,
        currentPrice: price,
        direction,
        quantity,
        positionValue: parseFloat((positionValue).toFixed(2)),
        // Technical
        signals,
        ema20: parseFloat(ema20.toFixed(2)),
        ema50: parseFloat(ema50.toFixed(2)),
        trendTruth,
        // Volatility
        atr: parseFloat(currentAtr.toFixed(2)),
        historicalVolatility,
        // Quant
        zScoreData,
        // Sizing
        kelly,
        sizing,
        varResult
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic Fallback Report (when Ollama is offline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a structured rule-based risk report when the LLM is unavailable.
 * Returns a string formatted identically to what the LLM would produce.
 */
function buildFallbackReport(thesis, quantCtx, behavioralCheck) {
    const { symbol, currentPrice, direction, signals, trendTruth, atr, historicalVolatility, sizing, kelly, varResult, zScoreData } = quantCtx;

    const rsiVal    = signals.indicators.rsi;
    const rsiStatus = rsiVal < 30 ? 'Oversold (potential reversal zone)' : rsiVal > 70 ? 'Overbought (elevated reversal risk)' : 'Neutral range';
    const trendIcon = trendTruth === 'BULLISH' ? '🟢' : trendTruth === 'BEARISH' ? '🔴' : '🟡';
    const signalMatch = (direction === 'BUY' && signals.signal === 'BUY') || (direction === 'SELL' && signals.signal === 'SELL');
    const zLine = zScoreData ? `- **Z-Score (Pairs)**: ${zScoreData.currentZScore}σ — Signal: ${zScoreData.signal}` : '';

    const weaknesses = [];
    const strengths  = [];
    if (!signalMatch)        weaknesses.push(`Algorithmic signal (${signals.signal}) contradicts your intended direction (${direction})`);
    if (rsiVal > 65)         weaknesses.push(`RSI at ${rsiVal} is approaching overbought territory, limiting upside before a natural pullback`);
    if (rsiVal < 35)         weaknesses.push(`RSI at ${rsiVal} suggests momentum is still bearish despite oversold conditions`);
    if (trendTruth === 'BEARISH' && direction === 'BUY') weaknesses.push('Price is below both EMA20 and EMA50 — buying into a downtrend is counter-trend risk');
    if (historicalVolatility > 40) weaknesses.push(`Annualised volatility of ${historicalVolatility}% is elevated — wider stops required`);
    if (behavioralCheck.consecutiveLosses >= 2) weaknesses.push(`${behavioralCheck.consecutiveLosses} recent losses detected — emotional bias risk is elevated`);

    if (signalMatch)         strengths.push(`Algorithmic signal aligns with your direction (${signals.signal})`);
    if (rsiVal >= 40 && rsiVal <= 60) strengths.push('RSI in neutral zone — room for directional move in either direction');
    if (trendTruth === 'BULLISH' && direction === 'BUY') strengths.push('Price above EMA20 > EMA50 — trend structure is intact');

    const score = Math.max(20, Math.min(90,
        50
        + (signalMatch ? 15 : -15)
        + (trendTruth === (direction === 'BUY' ? 'BULLISH' : 'BEARISH') ? 10 : -10)
        + (rsiVal > 30 && rsiVal < 70 ? 5 : -10)
        + (behavioralCheck.consecutiveLosses >= 3 ? -20 : 0)
    ));

    return {
        report: `## 🔍 RISK MANAGER ASSESSMENT — ${symbol} ${direction}

**Thesis Review**: "${thesis.slice(0, 180)}${thesis.length > 180 ? '...' : ''}"

### Market State
- **Current Price**: ₹${currentPrice}
- **Algo Signal**: ${signals.signal} (${signals.confidence}% confidence)
- **RSI (14)**: ${rsiVal} — ${rsiStatus}
- **MACD Histogram**: ${signals.indicators.macdHistogram > 0 ? '🟢 Positive' : '🔴 Negative'}
- **Trend Structure**: ${trendIcon} ${trendTruth} (EMA20: ₹${quantCtx.ema20}, EMA50: ₹${quantCtx.ema50})
${zLine}

### Risk Assessment
**Weaknesses in thesis:**
${weaknesses.length ? weaknesses.map(w => `- ⚠️ ${w}`).join('\n') : '- No major structural flaws detected in current conditions.'}

**Supporting factors:**
${strengths.length ? strengths.map(s => `- ✅ ${s}`).join('\n') : '- Limited technical confluence for this trade.'}

### Volatility-Based Stop-Loss Recommendation
Based on the current 14-period ATR of ₹${atr.toFixed(2)}, your stop-loss should be set at:
- **Stop-Loss**: ₹${sizing.stopLoss} (2× ATR below entry)
- **Take-Profit**: ₹${sizing.takeProfit} (1:2 Risk/Reward)
- **Max Position Size**: ${sizing.quantity} units (risking ≤1.5% of capital)
- **Max Loss on Trade**: ₹${sizing.maxLossAmount}
- **Annualised Volatility**: ${historicalVolatility}%
- **95% 1-Day VaR**: ₹${varResult.varAmount} (${varResult.varPercent}%)

*Mode: Manual Quant Check (Ollama offline — rule engine active)*`,
        confidenceScore: score,
        source: 'rule-engine-fallback'
    };
}

module.exports = {
    generateToken,
    validateToken,
    detectRevengeTradingPattern,
    buildQuantContext,
    buildFallbackReport
};
