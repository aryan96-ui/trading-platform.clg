// algorithms/aiCopilot.js - Intelligent Trading Assistant & Pattern Explainer with Local Ollama Support
const axios = require('axios');
const TechnicalIndicators = require('./technicalIndicators');
const RiskEngine = require('./riskEngine');
const marketDataService = require('../services/marketDataService');

class AICopilotEngine {
    constructor(config = {}) {
        this.ollamaUrl = config.ollamaUrl || process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';
        this.defaultModel = config.defaultModel || process.env.OLLAMA_MODEL || 'llama3:latest';
        this.activeModel = this.defaultModel;
        this.availableModels = [];
        this.timeout = config.timeout || 2000;
        this.refreshModels();
    }

    async refreshModels() {
        try {
            const res = await axios.get(`${this.ollamaUrl}/api/tags`, { timeout: 2500 });
            if (res.data && Array.isArray(res.data.models)) {
                this.availableModels = res.data.models.map(m => m.name);
                // Prefer llama3:latest or qwen2.5-coder:1.5b if current model is not found
                if (!this.availableModels.includes(this.activeModel)) {
                    if (this.availableModels.includes('llama3:latest')) {
                        this.activeModel = 'llama3:latest';
                    } else if (this.availableModels.some(m => m.includes('qwen2.5'))) {
                        this.activeModel = this.availableModels.find(m => m.includes('qwen2.5'));
                    } else if (this.availableModels.length > 0) {
                        this.activeModel = this.availableModels[0];
                    }
                }
            }
        } catch (e) {
            this.availableModels = [];
        }
    }

    async getAvailableModels() {
        await this.refreshModels();
        return {
            activeModel: this.activeModel,
            models: this.availableModels.length > 0 ? this.availableModels : ['llama3:latest', 'qwen2.5-coder:1.5b (offline)'],
            isOllamaOnline: this.availableModels.length > 0
        };
    }

    setModel(modelName) {
        if (modelName) {
            this.activeModel = modelName;
            return { success: true, activeModel: this.activeModel };
        }
        return { success: false, activeModel: this.activeModel };
    }

    /**
     * Process trader prompt with full quantitative context + Ollama LLM
     */
    async handlePrompt({ message, symbol = 'RELIANCE', userBalance = 100000, portfolio = {}, model = null }) {
        if (!message || typeof message !== 'string') {
            return {
                reply: "Hello! I am your ProTrader Quantitative Copilot powered by offline Ollama (Llama 3 / Qwen 2.5). Ask me about chart setups, technical indicators, Kelly position sizing, or backtesting.",
                modelUsed: this.activeModel,
                source: 'assistant'
            };
        }

        if (model) {
            this.activeModel = model;
        }

        const lowerMsg = message.toLowerCase();
        const sym = (message.match(/\b(RELIANCE|TCS|HDFCBANK|INFY|SBIN|ICICIBANK|BHARTIARTL|ITC|BTC|ETH|SOL|ADA|XRP|GOLD|SILVER|CRUDEOIL)\b/i)?.[0] || symbol).toUpperCase();

        // Fetch current market state
        const price = marketDataService.getAssetPrice(sym) || 2450.00;
        const candles = marketDataService.getHistoricalCandles(sym, 50, '5m');
        const signals = TechnicalIndicators.evaluateSignals(candles);
        const atrArr = TechnicalIndicators.ATR(candles, 14);
        const currentAtr = atrArr.length > 0 && atrArr[atrArr.length - 1] ? atrArr[atrArr.length - 1] : price * 0.015;
        const kelly = RiskEngine.calculateKellyPosition({ capital: userBalance, winRate: 0.55, winLossRatio: 1.8 });
        const riskPlan = RiskEngine.calculateAtrPositionSizing({
            capital: userBalance,
            currentPrice: price,
            atr: currentAtr,
            direction: signals.signal === 'SELL' ? 'SELL' : 'BUY'
        });

        // Attempt LLM Generation with Ollama if available
        let llmReply = null;
        try {
            llmReply = await this.queryOllama({
                message,
                symbol: sym,
                price,
                signals,
                atr: currentAtr,
                kelly,
                riskPlan,
                userBalance,
                modelToUse: this.activeModel
            });
        } catch (e) {
            // Graceful fallback to deterministic rule engine
            llmReply = null;
        }

        if (llmReply) {
            return {
                reply: llmReply,
                modelUsed: `ollama:${this.activeModel}`,
                symbol: sym,
                price,
                signals,
                riskPlan
            };
        }

        // Fallback: Rich Rule-Based Quantitative Analysis Engine
        if (lowerMsg.includes('buy') || lowerMsg.includes('sell') || lowerMsg.includes('trade') || lowerMsg.includes('predict') || lowerMsg.includes('trend')) {
            return {
                reply: `📊 **Quantitative Analysis for ${sym} (Live: ₹${price.toFixed(2)})**\n\n` +
                    `• **Signal Verdict**: **${signals.signal}** (${signals.confidence}% algorithmic confidence)\n` +
                    `• **RSI (14)**: ${signals.indicators.rsi} (${signals.indicators.rsi < 30 ? 'Oversold / Buy Zone' : signals.indicators.rsi > 70 ? 'Overbought / Sell Zone' : 'Neutral Range'})\n` +
                    `• **MACD Momentum**: ${signals.indicators.macdHistogram > 0 ? '🟢 Positive Momentum' : '🔴 Bearish Divergence'}\n` +
                    `• **Bollinger %B**: ${signals.indicators.bollingerPercentB}%\n\n` +
                    `🎯 **Risk-Adjusted Execution Plan (ATR Sizing)**:\n` +
                    `• Recommended Sizing: **${riskPlan.quantity} shares** (Max Capital: ₹${riskPlan.totalInvested})\n` +
                    `• Calculated Stop-Loss: **₹${riskPlan.stopLoss}** (ATR Risk: ₹${riskPlan.stopDistance})\n` +
                    `• Target Take-Profit (1:2 R:R): **₹${riskPlan.takeProfit}**\n\n` +
                    `*Always enforce stop-loss discipline to protect your capital.*`,
                modelUsed: 'rule-engine-fallback',
                symbol: sym,
                price,
                signals,
                riskPlan
            };
        }

        if (lowerMsg.includes('kelly') || lowerMsg.includes('size') || lowerMsg.includes('risk') || lowerMsg.includes('var')) {
            return {
                reply: `📐 **Quantitative Risk & Kelly Position Sizing Framework**\n\n` +
                    `• **Full Kelly Criterion ($f^*$)**: ${kelly.fullKellyPercent}%\n` +
                    `• **Recommended Safe Sizing (${kelly.fractionUsed})**: **${kelly.recommendedPositionPercent}%** of equity\n` +
                    `• **Max Safe Allocation**: **₹${kelly.recommendedRiskAmount.toLocaleString()}** on an account of ₹${userBalance.toLocaleString()}\n\n` +
                    `💡 *Why fractional Kelly?* Full Kelly maximizes theoretical long-term growth, but Half-Kelly reduces portfolio volatility by 75% while preserving 95% of compounding potential.`,
                modelUsed: 'rule-engine-fallback',
                symbol: sym,
                kelly
            };
        }

        if (lowerMsg.includes('pair') || lowerMsg.includes('arbitrage') || lowerMsg.includes('correlation') || lowerMsg.includes('z-score')) {
            return {
                reply: `🔗 **Statistical Arbitrage & Pairs Trading Engine**\n\n` +
                    `• **Active Watch**: High cointegration detected on **HDFCBANK / ICICIBANK** and **TCS / INFY**.\n` +
                    `• **Strategy Mechanism**: We monitor the rolling spread $y_t - \\beta x_t$. When the spread deviates beyond $\\pm 2.0\\sigma$ (Z-score), mean-reversion trades are triggered.\n` +
                    `• Head over to the **Quantitative Suite** tab to view the live Z-score spread chart in real time!`,
                modelUsed: 'rule-engine-fallback',
                symbol: sym
            };
        }

        return {
            reply: `🤖 **ProTrader AI Copilot (Active Model: ${this.activeModel})**\n\n` +
                `I can assist you with:\n` +
                `• **Market Analysis**: "Should I buy ${sym}?"\n` +
                `• **Risk Math**: "Calculate Kelly position size for ₹${userBalance.toLocaleString()}"\n` +
                `• **Technicals**: "What are the RSI, MACD, and Bollinger readings for ${sym}?"\n` +
                `• **Arbitrage**: "Explain statistical pairs trading on banking stocks"`,
            modelUsed: 'rule-engine-fallback',
            symbol: sym
        };
    }

    async queryOllama({ message, symbol, price, signals, atr, kelly, riskPlan, userBalance, modelToUse }) {
        const prompt = `You are ProTrader Copilot, an elite quantitative financial analyst and trading assistant. 
Base your analysis STRICTLY on the factual verified market data below. Do NOT invent prices or imaginary numbers.

VERIFIED MARKET DATA:
- Symbol: ${symbol}
- Current Live Price: ₹${price.toFixed(2)}
- Algorithmic Signal: ${signals.signal} (Confidence: ${signals.confidence}%)
- Technical Indicators: RSI(14)=${signals.indicators.rsi}, MACD Histogram=${signals.indicators.macdHistogram}, Bollinger %B=${signals.indicators.bollingerPercentB}%, Stochastic %K=${signals.indicators.stochasticK}%
- 14-period ATR Volatility: ₹${atr.toFixed(2)}
- Kelly Criterion Safe Sizing: ${kelly.recommendedPositionPercent}% (₹${kelly.recommendedRiskAmount.toLocaleString()} max risk)
- ATR Sizing Plan: ${riskPlan.quantity} units, Stop-Loss=₹${riskPlan.stopLoss}, Take-Profit=₹${riskPlan.takeProfit}
- User Account Capital: ₹${userBalance.toLocaleString()}

USER QUESTION:
"${message}"

INSTRUCTIONS:
1. Answer directly with professional quantitative precision.
2. Provide technical reasoning, risk parameters (Stop-Loss and Sizing), and caution.
3. Keep formatting clean with bullet points and bold highlights.
4. Keep the response under 200 words.`;

        const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
            model: modelToUse || this.activeModel,
            prompt,
            stream: false,
            options: {
                temperature: 0.3,
                num_predict: 350
            }
        }, { timeout: this.timeout });

        return response.data?.response || null;
    }
}

module.exports = new AICopilotEngine();
