// routes/algoRoutes.js - Quantitative Analytics, Risk & Machine Learning Endpoints
const express = require('express');
const router = express.Router();
const TechnicalIndicators = require('../algorithms/technicalIndicators');
const RiskEngine = require('../algorithms/riskEngine');
const MonteCarloSimulator = require('../algorithms/monteCarlo');
const PairsTradingEngine = require('../algorithms/pairsTrading');
const MarketClusteringEngine = require('../algorithms/marketClustering');
const TimeSeriesForecastEngine = require('../algorithms/timeSeriesForecast');
const AnomalyDetector = require('../algorithms/anomalyDetector');
const marketDataService = require('../services/marketDataService');
const { authenticateToken, requirePremium } = require('../middlewares/auth');

// 1. GET /api/indicators - Technical Indicators Engine
router.get('/indicators', authenticateToken, async (req, res) => {
    try {
        const { symbol = 'RELIANCE', count = 100, interval = '5m' } = req.query;
        const sym = symbol.toUpperCase();
        const candles = marketDataService.getHistoricalCandles(sym, parseInt(count) || 100, interval);
        const closes = candles.map(c => c.close);
        const currentPrice = closes[closes.length - 1] || 1000;

        const rsi = TechnicalIndicators.RSI(closes, 14);
        const macd = TechnicalIndicators.MACD(closes, 12, 26, 9);
        const bb = TechnicalIndicators.BollingerBands(closes, 20, 2);
        const atr = TechnicalIndicators.ATR(candles, 14);
        const stoch = TechnicalIndicators.Stochastic(candles, 14, 3);
        const ichimoku = TechnicalIndicators.Ichimoku(candles);
        const vwap = TechnicalIndicators.VWAP(candles);
        const signals = TechnicalIndicators.evaluateSignals(candles);

        // Fibonacci levels
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const maxH = Math.max(...highs);
        const minL = Math.min(...lows);
        const diff = maxH - minL;

        const fibonacci = {
            level_0: Number(maxH.toFixed(2)),
            level_236: Number((maxH - diff * 0.236).toFixed(2)),
            level_382: Number((maxH - diff * 0.382).toFixed(2)),
            level_500: Number((maxH - diff * 0.500).toFixed(2)),
            level_618: Number((maxH - diff * 0.618).toFixed(2)),
            level_786: Number((maxH - diff * 0.786).toFixed(2)),
            level_100: Number(minL.toFixed(2))
        };

        return res.json({
            success: true,
            symbol: sym,
            currentPrice: Number(currentPrice.toFixed(2)),
            signals,
            indicators: {
                rsi: {
                    value: rsi[rsi.length - 1],
                    signal: rsi[rsi.length - 1] > 70 ? 'Overbought' : rsi[rsi.length - 1] < 30 ? 'Oversold' : 'Neutral',
                    series: rsi.slice(-30)
                },
                macd: {
                    line: macd.macdLine[macd.macdLine.length - 1],
                    signal: macd.signalLine[macd.signalLine.length - 1],
                    histogram: macd.histogram[macd.histogram.length - 1],
                    trend: macd.histogram[macd.histogram.length - 1] > 0 ? 'Bullish' : 'Bearish'
                },
                bollingerBands: {
                    upper: bb.upper[bb.upper.length - 1],
                    middle: bb.middle[bb.middle.length - 1],
                    lower: bb.lower[bb.lower.length - 1],
                    percentB: bb.percentB[bb.percentB.length - 1]
                },
                atr: {
                    value: atr[atr.length - 1] || 15.0,
                    percentOfPrice: Number((((atr[atr.length - 1] || 15.0) / currentPrice) * 100).toFixed(2)) + '%'
                },
                stochastic: {
                    k: stoch.k[stoch.k.length - 1],
                    d: stoch.d[stoch.d.length - 1]
                },
                ichimoku,
                vwap: vwap[vwap.length - 1],
                fibonacci
            }
        });
    } catch (err) {
        console.error('Indicators Error:', err);
        return res.status(500).json({ success: false, message: 'Indicator calculation failed' });
    }
});

// 2. POST /api/monte-carlo - 10,000 Run Monte-Carlo Strategy Simulator
router.post('/monte-carlo', (req, res) => {
    try {
        const {
            initialCapital = 100000,
            numTrades = 100,
            numSimulations = 10000,
            winRate = 0.55,
            avgWinPercent = 3.5,
            avgLossPercent = 2.0,
            riskPerTrade = 0.02
        } = req.body;

        const results = MonteCarloSimulator.runSimulation({
            initialCapital: parseFloat(initialCapital) || 100000,
            numTrades: parseInt(numTrades) || 100,
            numSimulations: Math.min(10000, parseInt(numSimulations) || 10000),
            winRate: parseFloat(winRate) || 0.55,
            avgWinPercent: parseFloat(avgWinPercent) || 3.5,
            avgLossPercent: parseFloat(avgLossPercent) || 2.0,
            riskPerTrade: parseFloat(riskPerTrade) || 0.02
        });

        return res.json({ success: true, ...results });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 3. GET /api/pairs-trading - Statistical Arbitrage & Z-Score Spread
router.get('/pairs-trading', (req, res) => {
    try {
        const { pairA = 'HDFCBANK', pairB = 'ICICIBANK', count = 100 } = req.query;
        const candlesA = marketDataService.getHistoricalCandles(pairA.toUpperCase(), parseInt(count) || 100, '5m');
        const candlesB = marketDataService.getHistoricalCandles(pairB.toUpperCase(), parseInt(count) || 100, '5m');

        const seriesA = candlesA.map(c => c.close);
        const seriesB = candlesB.map(c => c.close);

        const analysis = PairsTradingEngine.analyzePair(pairA.toUpperCase(), seriesA, pairB.toUpperCase(), seriesB);

        // Also return full correlation matrix of top stocks
        const matrixUniverse = {
            'RELIANCE': marketDataService.getHistoricalCandles('RELIANCE', 50).map(c => c.close),
            'TCS': marketDataService.getHistoricalCandles('TCS', 50).map(c => c.close),
            'INFY': marketDataService.getHistoricalCandles('INFY', 50).map(c => c.close),
            'HDFCBANK': marketDataService.getHistoricalCandles('HDFCBANK', 50).map(c => c.close),
            'ICICIBANK': marketDataService.getHistoricalCandles('ICICIBANK', 50).map(c => c.close),
            'SBIN': marketDataService.getHistoricalCandles('SBIN', 50).map(c => c.close)
        };

        const correlationMatrix = PairsTradingEngine.buildCorrelationMatrix(matrixUniverse);

        return res.json({
            success: true,
            analysis,
            correlationMatrix
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 4. GET /api/heatmap - K-Means Market Heatmap
router.get('/heatmap', (req, res) => {
    try {
        const assetList = [];
        for (const [sym, state] of marketDataService.currentPrices.entries()) {
            assetList.push({
                symbol: sym,
                name: state.name,
                category: state.category,
                price: state.price,
                changePercent: state.changePercent,
                volatility: (state.category === 'crypto' ? 4.2 : state.category === 'forex' ? 0.6 : 1.8),
                volumeSurge: Number((1.0 + (Math.random() * 0.9)).toFixed(2))
            });
        }

        const clusterResults = MarketClusteringEngine.clusterAssets(assetList, 3);
        return res.json({ success: true, ...clusterResults });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 5. GET /api/forecast - Double Exponential Smoothing Forecast
router.get('/forecast', (req, res) => {
    try {
        const { symbol = 'RELIANCE', horizon = 12 } = req.query;
        const sym = symbol.toUpperCase();
        const candles = marketDataService.getHistoricalCandles(sym, 80, '5m');
        const prices = candles.map(c => c.close);

        const forecast = TimeSeriesForecastEngine.forecastPrices(prices, parseInt(horizon) || 12);

        return res.json({
            success: true,
            symbol: sym,
            ...forecast
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 6. GET /api/anomaly - Real-Time Anomaly & Flash Crash Scanner
router.get('/anomaly', (req, res) => {
    try {
        const { symbol = 'RELIANCE' } = req.query;
        const sym = symbol.toUpperCase();
        const candles = marketDataService.getHistoricalCandles(sym, 50, '5m');

        const scan = AnomalyDetector.scanCandles(sym, candles);
        return res.json({ success: true, scan });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 7. POST /api/risk/position-sizing - Kelly & ATR Position Sizing
router.post('/risk/position-sizing', (req, res) => {
    try {
        const { capital = 100000, currentPrice = 2500, atr = 35.0, winRate = 0.55, winLossRatio = 1.8, direction = 'BUY' } = req.body;

        const kelly = RiskEngine.calculateKellyPosition({
            capital: parseFloat(capital) || 100000,
            winRate: parseFloat(winRate) || 0.55,
            winLossRatio: parseFloat(winLossRatio) || 1.8
        });

        const atrSizing = RiskEngine.calculateAtrPositionSizing({
            capital: parseFloat(capital) || 100000,
            currentPrice: parseFloat(currentPrice) || 2500,
            atr: parseFloat(atr) || 35.0,
            direction
        });

        const varEstimate = RiskEngine.calculateVaR([], parseFloat(capital) || 100000, 0.95);

        return res.json({
            success: true,
            kelly,
            atrSizing,
            varEstimate
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// 8. POST /api/backtest - Comprehensive Strategy Backtesting
router.post('/backtest', (req, res) => {
    try {
        const { symbol = 'RELIANCE', strategy = 'sma_crossover', period = '1y', initialCapital = 100000 } = req.body;
        const sym = symbol.toUpperCase();
        const candles = marketDataService.getHistoricalCandles(sym, period === '1y' ? 250 : 100, '1D');

        let capital = parseFloat(initialCapital) || 100000;
        let shares = 0;
        const trades = [];
        const equityCurve = [];
        const closes = candles.map(c => c.close);

        const smaFast = TechnicalIndicators.SMA(closes, 10);
        const smaSlow = TechnicalIndicators.SMA(closes, 20);
        const rsi = TechnicalIndicators.RSI(closes, 14);

        for (let i = 20; i < candles.length; i++) {
            const price = candles[i].close;
            let signal = 'HOLD';

            if (strategy === 'sma_crossover') {
                if (smaFast[i - 1] <= smaSlow[i - 1] && smaFast[i] > smaSlow[i]) signal = 'BUY';
                else if (smaFast[i - 1] >= smaSlow[i - 1] && smaFast[i] < smaSlow[i]) signal = 'SELL';
            } else if (strategy === 'rsi') {
                if (rsi[i] < 30) signal = 'BUY';
                else if (rsi[i] > 70) signal = 'SELL';
            }

            if (signal === 'BUY' && capital > 0 && shares === 0) {
                shares = Math.floor(capital / price);
                const cost = shares * price;
                capital -= cost;
                trades.push({ date: new Date(candles[i].time).toLocaleDateString(), type: 'BUY', price, shares, cost });
            } else if (signal === 'SELL' && shares > 0) {
                const proceeds = shares * price;
                const lastCost = shares * trades[trades.length - 1].price;
                const pnl = proceeds - lastCost;
                capital += proceeds;
                trades.push({ date: new Date(candles[i].time).toLocaleDateString(), type: 'SELL', price, shares, pnl });
                shares = 0;
            }

            const currentEquity = capital + (shares * price);
            equityCurve.push({ date: new Date(candles[i].time).toLocaleDateString(), equity: Number(currentEquity.toFixed(2)) });
        }

        // Close final position
        if (shares > 0) {
            const lastPrice = candles[candles.length - 1].close;
            capital += shares * lastPrice;
            shares = 0;
        }

        const finalEquity = Number(capital.toFixed(2));
        const totalReturn = Number((((finalEquity - initialCapital) / initialCapital) * 100).toFixed(2));
        const winTrades = trades.filter(t => t.pnl && t.pnl > 0).length;
        const lossTrades = trades.filter(t => t.pnl && t.pnl <= 0).length;
        const winRate = (winTrades + lossTrades) > 0 ? Number(((winTrades / (winTrades + lossTrades)) * 100).toFixed(1)) : 0;

        return res.json({
            success: true,
            symbol: sym,
            strategy,
            initialCapital,
            finalEquity,
            totalReturnPercent: `${totalReturn}%`,
            winRate: `${winRate}%`,
            totalTrades: winTrades + lossTrades,
            winningTrades: winTrades,
            losingTrades: lossTrades,
            trades: trades.slice(-20),
            equityCurve: equityCurve.filter((_, i) => i % Math.max(1, Math.floor(equityCurve.length / 50)) === 0)
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
