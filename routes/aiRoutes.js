// routes/aiRoutes.js - AI Assistant, Model Selection, Sentiment & Risk Gate Endpoints
const express = require('express');
const router = express.Router();
const axios = require('axios');
const aiCopilot = require('../algorithms/aiCopilot');
const sentimentEngine = require('../algorithms/sentimentEngine');
const newsService = require('../services/newsService');
const riskGateService = require('../services/riskGateService');
const { authenticateToken } = require('../middlewares/auth');

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';
const LLAMA3_MODEL = 'llama3:latest';
const QWEN_MODEL = 'qwen2.5:latest';

// GET /api/ai/models - List available local Ollama models
router.get('/ai/models', async (req, res) => {
    try {
        const info = await aiCopilot.getAvailableModels();
        return res.json({ success: true, ...info });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/ai/model - Select active AI model
router.post('/ai/model', (req, res) => {
    const { model } = req.body;
    if (!model) return res.status(400).json({ success: false, message: 'Model name required' });
    const result = aiCopilot.setModel(model);
    return res.json(result);
});

// POST /api/chat - AI Quantitative Copilot (Llama 3 / Qwen 2.5 / Rule-engine)
router.post('/chat', authenticateToken, async (req, res) => {
    try {
        const { message, symbol = 'RELIANCE', userBalance = 100000, portfolio = {}, model = null } = req.body;
        const response = await aiCopilot.handlePrompt({ message, symbol, userBalance, portfolio, model });
        return res.json({ success: true, ...response });
    } catch (err) {
        console.error('AI Chat Error:', err);
        return res.status(500).json({ success: false, message: 'AI copilot error: ' + err.message });
    }
});

// GET /api/sentiment - News Sentiment Analysis
router.get('/sentiment', (req, res) => {
    try {
        const { symbol = 'RELIANCE' } = req.query;
        const headlines = newsService.getHeadlines('all');
        const analysis = sentimentEngine.evaluateSymbolSentiment(symbol, headlines);
        return res.json({ success: true, analysis });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/analyze-thesis
//
// The AI "Risk Gate" endpoint. A mandatory pre-trade analysis step.
//
// Request body:
//   { symbol, thesis, direction, quantity, entryPrice, userBalance }
//
// Response:
//   { success, report, confidenceScore, convergenceMatrix, riskGateToken,
//     behavioralCheck, quantContext, expiresAt, source }
//
// If revenge trading is detected → returns cooloffMinutes, NO token.
// If Ollama is offline → returns deterministic fallback report WITH token.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analyze-thesis', authenticateToken, async (req, res) => {
    try {
        const {
            symbol = 'RELIANCE',
            thesis = '',
            direction = 'BUY',
            quantity = 1,
            entryPrice = null,
            userBalance = 100000
        } = req.body;

        const email = req.user?.email || req.body.email;

        if (!thesis || thesis.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a trade thesis of at least 10 characters.'
            });
        }

        // ── 1. Build Quantitative Context ─────────────────────────────────────
        const quantCtx = riskGateService.buildQuantContext(
            symbol,
            direction.toUpperCase(),
            userBalance,
            parseFloat(quantity)
        );

        // ── 2. Behavioral Check (Revenge Trading) ─────────────────────────────
        // TradingJournal is a class — instantiate a per-request view if not globally shared
        let behavioralCheck = {
            isRevenge: false, consecutiveLosses: 0, positionEscalation: false,
            cooloffMinutes: 0, details: 'No journal data available for this session.'
        };
        try {
            // Attempt to pull from in-memory journal singleton if it exists
            if (global._tradingJournal) {
                const trades = global._tradingJournal.getTrades(email);
                behavioralCheck = riskGateService.detectRevengeTradingPattern(trades);
            }
        } catch (_) { }

        // Block the gate if revenge trading detected
        if (behavioralCheck.isRevenge) {
            return res.status(200).json({
                success: true,
                blocked: true,
                cooloffMinutes: behavioralCheck.cooloffMinutes,
                behavioralCheck,
                message: behavioralCheck.details,
                confidenceScore: 0,
                report: null,
                riskGateToken: null
            });
        }

        // ── 3. Convergence Matrix (3 Truths) ──────────────────────────────────
        const { signals, trendTruth, zScoreData } = quantCtx;

        // Quant Truth — Z-Score signal
        let quantTruth = 'YELLOW';
        let quantTruthLabel = 'No pair data available';
        if (zScoreData) {
            quantTruthLabel = `Z-Score ${zScoreData.currentZScore}σ — ${zScoreData.signal}`;
            if (zScoreData.signal === 'LONG_SPREAD' && direction === 'BUY') quantTruth = 'GREEN';
            else if (zScoreData.signal === 'SHORT_SPREAD' && direction === 'SELL') quantTruth = 'GREEN';
            else if (zScoreData.signal === 'MEAN_REVERTED') quantTruth = 'YELLOW';
            else if (zScoreData.signal !== 'NEUTRAL') quantTruth = 'RED';
        }

        // Technical Truth — Trend + RSI
        let techTruth = 'YELLOW';
        let techTruthLabel = `RSI: ${signals.indicators.rsi}, Trend: ${trendTruth}`;
        const rsiVal = signals.indicators.rsi;
        const trendAligned = (direction === 'BUY' && trendTruth === 'BULLISH') || (direction === 'SELL' && trendTruth === 'BEARISH');
        const rsiGood = (direction === 'BUY' && rsiVal < 65) || (direction === 'SELL' && rsiVal > 35);
        if (trendAligned && rsiGood) techTruth = 'GREEN';
        else if (!trendAligned && !rsiGood) techTruth = 'RED';

        // Behavioral Truth
        let behaviorTruth = 'GREEN';
        let behaviorTruthLabel = 'No pattern violations in 24h';
        if (behavioralCheck.consecutiveLosses >= 2) {
            behaviorTruth = 'YELLOW';
            behaviorTruthLabel = `${behavioralCheck.consecutiveLosses} consecutive losses — elevated caution`;
        }
        if (behavioralCheck.consecutiveLosses >= 3) {
            behaviorTruth = 'RED';
            behaviorTruthLabel = `3+ losses — emotional bias risk detected`;
        }

        const convergenceMatrix = {
            quantTruth: { status: quantTruth, label: quantTruthLabel, icon: '📐' },
            techTruth: { status: techTruth, label: techTruthLabel, icon: '📊' },
            behaviorTruth: { status: behaviorTruth, label: behaviorTruthLabel, icon: '🧠' },
            allGreen: [quantTruth, techTruth, behaviorTruth].every(s => s === 'GREEN')
        };

        // ── 4. AI Report (Llama3 or Fallback) ────────────────────────────────
        let report = '';
        let confidenceScore = 50;
        let source = 'rule-engine-fallback';

        try {
            const systemPrompt = `You are a Cold, Analytical Hedge Fund Risk Manager. You are reviewing a retail trader's pre-trade thesis before they execute. Your job is to act as a "Devil's Advocate" — find flaws, challenge assumptions, and provide a rigorous risk assessment. You are NOT a cheerleader. You prioritize capital preservation above all else.

RESPONSE FORMAT (strictly follow this):
1. THESIS CRITIQUE: [2-3 sentences challenging the trader's reasoning]
2. KEY RISKS: [3 bullet points — specific, quantitative risks]
3. STOP-LOSS RECOMMENDATION: [State exact price level based on ATR data below]
4. CONFIDENCE SCORE: [Single number 0-100, where 100 = perfect setup]

Keep the total response under 250 words. Be direct and unemotional.`;

            const userPrompt = `TRADE THESIS TO REVIEW:
"${thesis}"

VERIFIED MARKET DATA:
- Symbol: ${quantCtx.symbol}
- Current Price: ₹${quantCtx.currentPrice}
- Direction: ${direction}
- Quantity: ${quantity}
- Position Value: ₹${quantCtx.positionValue}

QUANTITATIVE INDICATORS:
- Algorithmic Signal: ${signals.signal} (${signals.confidence}% confidence)
- RSI(14): ${rsiVal} | MACD Histogram: ${signals.indicators.macdHistogram}
- Trend Structure: ${trendTruth} | EMA20: ₹${quantCtx.ema20} | EMA50: ₹${quantCtx.ema50}
- Z-Score (Pairs): ${zScoreData ? zScoreData.currentZScore + 'σ — ' + zScoreData.signal : 'N/A'}

VOLATILITY & RISK METRICS:
- 14-period ATR: ₹${quantCtx.atr}
- Annualised Volatility: ${quantCtx.historicalVolatility}%
- ATR-Based Stop-Loss: ₹${quantCtx.sizing.stopLoss}
- ATR-Based Take-Profit: ₹${quantCtx.sizing.takeProfit}
- Max Recommended Size: ${quantCtx.sizing.quantity} units
- 95% VaR (1-day): ₹${quantCtx.varResult.varAmount}

BEHAVIORAL STATUS:
- ${behavioralCheck.details}

Critique this thesis ruthlessly. End with a Confidence Score on the last line as: "CONFIDENCE SCORE: XX/100"`;

            const ollamaRes = await axios.post(`${OLLAMA_URL}/api/generate`, {
                model: LLAMA3_MODEL,
                prompt: `[SYSTEM]: ${systemPrompt}\n\n[USER]: ${userPrompt}`,
                stream: false,
                options: { temperature: 0.2, num_predict: 450 }
            }, { timeout: 2000 });

            const rawReply = ollamaRes.data?.response || '';
            if (rawReply.length > 20) {
                report = rawReply;
                source = `ollama:${LLAMA3_MODEL}`;

                // Extract confidence score
                const scoreMatch = rawReply.match(/CONFIDENCE\s+SCORE[:\s]+(\d{1,3})\s*(?:\/\s*100)?/i);
                if (scoreMatch) {
                    confidenceScore = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)));
                }
            }
        } catch (ollamaErr) {
            // Ollama offline or timed out — use fallback
            console.log(`⚠️  Ollama unavailable for /analyze-thesis: ${ollamaErr.message}. Switching to rule engine.`);
        }

        // Fallback if LLM gave no useful output
        if (!report || report.length < 20) {
            const fallback = riskGateService.buildFallbackReport(thesis, quantCtx, behavioralCheck);
            report = fallback.report;
            confidenceScore = fallback.confidenceScore;
            source = fallback.source;
        }

        // ── 5. Issue Risk Gate Token ──────────────────────────────────────────
        const { token, expiresAt } = riskGateService.generateToken(email, symbol);

        return res.json({
            success: true,
            blocked: false,
            report,
            confidenceScore,
            convergenceMatrix,
            behavioralCheck,
            quantContext: {
                symbol: quantCtx.symbol,
                currentPrice: quantCtx.currentPrice,
                atr: quantCtx.atr,
                sizing: quantCtx.sizing,
                varResult: quantCtx.varResult,
                trendTruth: quantCtx.trendTruth
            },
            riskGateToken: token,
            expiresAt,
            source
        });

    } catch (err) {
        console.error('Risk Gate Analysis Error:', err);
        return res.status(500).json({ success: false, message: 'Risk Gate analysis failed: ' + err.message });
    }
});

module.exports = router;
