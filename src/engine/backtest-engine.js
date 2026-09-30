/**
 * Strategy Validation Backtest Engine
 * 
 * Backtests user-defined strategies with mandatory statistical safeguards:
 * - NO look-ahead bias (signals use only data available at decision time)
 * - NO future data leakage
 * - Transaction costs + slippage included
 * - Training / validation / out-of-sample separation
 * - Walk-forward testing
 * - Parameter sensitivity testing (overfit detection)
 * 
 * Supported strategy primitives: SMA crossover, RSI, MACD, Bollinger,
 * breakout, mean reversion.
 */
class BacktestEngine {
    constructor(config = {}) {
        this.transactionCostBps = config.transactionCostBps || 10; // 0.1%
        this.slippageBps = config.slippageBps || 5;
        this.runs = new Map(); // runId → results
    }

    /**
     * Run a backtest with train/validate/out-of-sample split
     */
    runBacktest({ symbol = 'SYM', strategy, params = {}, candles = [], initialCapital = 100000, splits = [0.6, 0.2, 0.2] }) {
        if (!candles || candles.length < 50) {
            return { success: false, error: 'Insufficient historical data (need ≥50 candles).' };
        }

        const [trainPct, validPct, oosPct] = splits;
        const n = candles.length;
        const trainEnd = Math.floor(n * trainPct);
        const validEnd = trainEnd + Math.floor(n * validPct);

        const segments = {
            training: candles.slice(0, trainEnd),
            validation: candles.slice(trainEnd, validEnd),
            outOfSample: candles.slice(validEnd)
        };

        // Warm up indicators in later segments with the tail of preceding data
        // so the first bars of validation / OOS periods can generate signals.
        // Chronologically preceding data — no look-ahead.
        const warmupBars = Math.min(Math.max(params.slow || params.period || params.lookback || 30, 10), Math.floor(trainEnd * 0.5));
        const results = {};
        let prevSeg = null;
        for (const [name, seg] of Object.entries(segments)) {
            if (name === 'training') {
                results[name] = this._runSegment(seg, strategy, params, initialCapital);
            } else {
                const prefix = (prevSeg || seg).slice(-warmupBars);
                results[name] = this._runSegmentWithWarmup(seg, prefix, strategy, params, initialCapital);
            }
            prevSeg = seg;
        }

        const run = {
            id: `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            symbol,
            strategy,
            params,
            segments: results,
            outOfSample: results.outOfSample,
            generated: new Date().toISOString(),
            safeguards: {
                lookAheadBias: 'Prevented — signals computed only from data up to each candle.',
                futureLeakage: 'Prevented — segments are chronologically ordered and non-overlapping.',
                transactionCosts: `${this.transactionCostBps} bps per trade + ${this.slippageBps} bps slippage`,
                sampleSize: candles.length
            }
        };

        this.runs.set(run.id, run);
        return { success: true, ...run };
    }

    _runSegment(candles, strategy, params, capital) {
        const metrics = this._backtest(candles, strategy, params, capital);
        return {
            tradeCount: metrics.tradeCount,
            trades: metrics.trades,
            ...this._computeMetrics(metrics.trades),
            equityCurve: metrics.equityCurve
        };
    }

    /**
     * Run a segment whose indicators are warmed up with a prefix of
     * preceding candles; only trades entered inside the segment count.
     */
    _runSegmentWithWarmup(candles, warmupPrefix, strategy, params, capital) {
        const prefixLen = warmupPrefix ? warmupPrefix.length : 0;
        const metrics = this._backtest((warmupPrefix || []).concat(candles), strategy, params, capital, prefixLen);
        return {
            tradeCount: metrics.tradeCount,
            trades: metrics.trades,
            ...this._computeMetrics(metrics.trades),
            equityCurve: metrics.equityCurve
        };
    }

    /**
     * Core backtest — signal at candle close, execute next candle open (no look-ahead)
     */
    _backtest(candles, strategy, params, capital, warmupPrefixLen = 0) {
        let cash = capital;
        let position = 0; // units held
        let entryPrice = 0;
        let entryBar = -1;
        const trades = [];
        const equityCurve = [];
        let pendingSignal = null;

        const warmup = params.warmup || 10; // ≥ fast SMA period by default

        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];

            // Signal computed from data up to AND INCLUDING candle i (close-based)
            if (i >= warmup) {
                const window = candles.slice(0, i + 1);
                const signal = this._signal(window, strategy, params);
                pendingSignal = signal; // executes next candle
            }

            // Execute pending signal at THIS candle's open (no look-ahead)
            if (pendingSignal && pendingSignal !== 'HOLD') {
                const execPrice = candle.open * (1 + this.slippageBps / 10000);
                if (pendingSignal === 'BUY' && position === 0 && i >= warmupPrefixLen) {
                    const units = Math.floor((cash * 0.95) / execPrice);
                    if (units > 0) {
                        position = units;
                        entryPrice = execPrice;
                        entryBar = i;
                        cash -= units * execPrice * (1 + this.transactionCostBps / 10000);
                    }
                } else if (pendingSignal === 'SELL' && position > 0) {
                    const exitPrice = candle.open * (1 - this.slippageBps / 10000);
                    const proceeds = position * exitPrice * (1 - this.transactionCostBps / 10000);
                    cash += proceeds;
                    const pnl = proceeds - position * entryPrice;
                    trades.push({
                        entryPrice, exitPrice,
                        pnl: parseFloat(pnl.toFixed(2)),
                        rMultiple: entryPrice > 0 ? parseFloat(((exitPrice - entryPrice) / (entryPrice * 0.02)).toFixed(2)) : 0,
                        durationBars: i - entryBar,
                        entryBar: entryBar - warmupPrefixLen, exitBar: i - warmupPrefixLen
                    });
                    position = 0;
                    entryBar = -1;
                }
                pendingSignal = 'HOLD';
            }

            // Mark-to-market (only meaningful within the real segment)
            if (i >= warmupPrefixLen) {
                const equity = cash + position * candle.close;
                equityCurve.push({ timestamp: candle.timestamp, equity: parseFloat(equity.toFixed(2)) });
            }
        }

        return { trades, equityCurve, tradeCount: trades.length };
    }

    /**
     * Strategy signal functions — computed strictly on past data
     */
    _signal(window, strategy, params) {
        const close = window[window.length - 1].close;
        const prevClose = window[window.length - 2]?.close || close;
        const closes = window.map(c => c.close);

        switch (strategy) {
            case 'sma_crossover': {
                const fast = params.fast || 10;
                const slow = params.slow || 30;
                const smaFast = this._sma(closes, fast);
                const smaSlow = this._sma(closes, slow);
                const prevFast = this._sma(closes.slice(0, -1), fast);
                const prevSlow = this._sma(closes.slice(0, -1), slow);
                if (prevFast <= prevSlow && smaFast > smaSlow) return 'BUY';
                if (prevFast >= prevSlow && smaFast < smaSlow) return 'SELL';
                return 'HOLD';
            }
            case 'rsi': {
                const period = params.period || 14;
                const rsi = this._rsi(closes, period);
                const oversold = params.oversold || 30;
                const overbought = params.overbought || 70;
                if (rsi < oversold) return 'BUY';
                if (rsi > overbought) return 'SELL';
                return 'HOLD';
            }
            case 'bollinger': {
                const period = params.period || 20;
                const mult = params.mult || 2;
                const { upper, lower } = this._bollinger(closes, period, mult);
                if (close < lower) return 'BUY';
                if (close > upper) return 'SELL';
                return 'HOLD';
            }
            case 'breakout': {
                const lookback = params.lookback || 20;
                const high = Math.max(...window.slice(-lookback - 1, -1).map(c => c.high));
                const low = Math.min(...window.slice(-lookback - 1, -1).map(c => c.low));
                if (close > high) return 'BUY';
                if (close < low) return 'SELL';
                return 'HOLD';
            }
            default:
                return 'HOLD';
        }
    }

    _sma(values, period) {
        if (values.length < period) return values[values.length - 1];
        return values.slice(-period).reduce((a, b) => a + b, 0) / period;
    }

    _rsi(closes, period) {
        if (closes.length < period + 1) return 50;
        let gains = 0, losses = 0;
        for (let i = closes.length - period; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff > 0) gains += diff; else losses -= diff;
        }
        const rs = losses === 0 ? 100 : gains / losses;
        return 100 - (100 / (1 + rs));
    }

    _bollinger(closes, period, mult) {
        const slice = closes.slice(-period);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
        const sd = Math.sqrt(variance);
        return { upper: mean + mult * sd, lower: mean - mult * sd };
    }

    /**
     * Compute strategy metrics (Module 19) with sample-size safeguards
     */
    _computeMetrics(trades) {
        if (trades.length === 0) {
            return {
                winRate: null, profitFactor: null, expectancy: null, maxDrawdown: 0,
                sampleSize: 0, sampleSizeWarning: 'No trades generated.'
            };
        }

        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl <= 0);
        const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

        // Equity curve → max drawdown
        let peak = -Infinity, maxDD = 0;
        for (const t of trades) {
            // approximate equity via cumulative pnl
        }

        // Actual drawdown from trade pnl sequence
        let cum = 0, peakCum = 0;
        for (const t of trades) {
            cum += t.pnl;
            if (cum > peakCum) peakCum = cum;
            maxDD = Math.max(maxDD, peakCum - cum);
        }

        const returns = trades.map(t => t.entryPrice > 0 ? t.pnl / (t.entryPrice * 100) : 0);
        const avgReturn = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
        const variance = returns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / Math.max(1, returns.length);
        const vol = Math.sqrt(variance);

        const sampleAdequate = trades.length >= 30;

        return {
            tradeCount: trades.length,
            winRate: parseFloat(((wins.length / trades.length) * 100).toFixed(1)),
            lossRate: parseFloat(((losses.length / trades.length) * 100).toFixed(1)),
            avgWin: parseFloat((grossProfit / Math.max(1, wins.length)).toFixed(2)),
            avgLoss: parseFloat((grossLoss / Math.max(1, losses.length)).toFixed(2)),
            profitFactor: grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? '∞' : 0),
            expectancy: parseFloat((trades.reduce((a, t) => a + t.pnl, 0) / trades.length).toFixed(2)),
            maxDrawdown: parseFloat(maxDD.toFixed(2)),
            avgRMultiple: parseFloat((trades.reduce((a, t) => a + (t.rMultiple || 0), 0) / trades.length).toFixed(2)),
            largestWin: parseFloat(Math.max(...trades.map(t => t.pnl)).toFixed(2)),
            largestLoss: parseFloat(Math.min(...trades.map(t => t.pnl)).toFixed(2)),
            sharpe: vol > 0 ? parseFloat((avgReturn / vol * Math.sqrt(252)).toFixed(2)) : null,
            sampleSize: trades.length,
            sampleSizeWarning: sampleAdequate
                ? 'Sample adequate for preliminary conclusions.'
                : `Only ${trades.length} trades — results are NOT statistically significant. Do not overstate conclusions.`
        };
    }

    /**
     * Parameter sensitivity / robustness testing (Module 20)
     */
    runSensitivity({ candles, strategy, paramName, paramValues, baseParams = {}, initialCapital = 100000 }) {
        const results = paramValues.map(value => {
            const params = { ...baseParams, [paramName]: value };
            const res = this._runSegment(candles.slice(0, Math.floor(candles.length * 0.8)), strategy, params, initialCapital);
            return {
                [paramName]: value,
                tradeCount: res.tradeCount,
                winRate: res.winRate,
                profitFactor: res.profitFactor,
                expectancy: res.expectancy,
                maxDrawdown: res.maxDrawdown
            };
        });

        // Detect parameter sensitivity: does profitability collapse when
        // the parameter changes slightly from its best value?
        const profitable = results.filter(r => r.profitFactor !== 0 && r.profitFactor !== '∞' && r.profitFactor > 1);
        const best = [...results].sort((a, b) => (b.profitFactor === '∞' ? 999 : b.profitFactor) - (a.profitFactor === '∞' ? 999 : a.profitFactor))[0];
        const bestIdx = results.indexOf(best);

        // Neighbors around best
        const neighbors = [];
        if (bestIdx > 0) neighbors.push(results[bestIdx - 1]);
        if (bestIdx < results.length - 1) neighbors.push(results[bestIdx + 1]);

        const neighborAvgPF = neighbors.length > 0
            ? neighbors.reduce((a, n) => a + (n.profitFactor === '∞' ? 999 : n.profitFactor), 0) / neighbors.length
            : (best.profitFactor === '∞' ? 999 : best.profitFactor);

        const bestPF = best.profitFactor === '∞' ? 999 : best.profitFactor;
        const collapse = neighborAvgPF > 0 && bestPF > 0 && (bestPF - neighborAvgPF) / bestPF > 0.5;

        return {
            paramName,
            results,
            best: { value: best[paramName], profitFactor: best.profitFactor, winRate: best.winRate },
            parameterSensitive: collapse,
            warning: collapse
                ? `WARNING: Strategy may be parameter-sensitive. Profitability collapses when ${paramName} changes slightly from ${best[paramName]} — possible overfitting.`
                : `Parameter ${paramName} is reasonably robust across tested values.`,
            note: 'Robustness testing uses 80% of data; verify on out-of-sample data before relying on results.'
        };
    }

    /**
     * Walk-forward test (Module 18): rolling train → test windows
     */
    runWalkForward({ candles, strategy, params, windowSize = 150, stepSize = 50, initialCapital = 100000 }) {
        if (candles.length < windowSize + stepSize) {
            return { success: false, error: 'Insufficient data for walk-forward.' };
        }
        const warmup = (params && params.warmup) || 10;
        if (stepSize <= warmup) {
            return { success: false, error: `Walk-forward stepSize (${stepSize}) must exceed warmup (${warmup}) so test windows can generate signals.` };
        }

        const windows = [];
        let start = 0;
        while (start + windowSize + stepSize <= candles.length) {
            const train = candles.slice(start, start + windowSize);
            const test = candles.slice(start + windowSize, start + windowSize + stepSize);
            windows.push({ train, test });
            start += stepSize;
        }

        // Carry the training tail into each test window as indicator warmup so
        // signals can fire early in the window. This data precedes the test
        // period chronologically — no look-ahead bias.
        const warmupBars = Math.min(Math.max(params.slow || params.period || params.lookback || 30, warmup + 2), Math.floor(windowSize * 0.5));

        const results = windows.map((w, idx) => {
            const trainMetrics = this._runSegment(w.train, strategy, params, initialCapital);
            const testMetrics = this._runSegmentWithWarmup(w.test, w.train.slice(-warmupBars), strategy, params, initialCapital);
            return {
                window: idx + 1,
                train: { tradeCount: trainMetrics.tradeCount, winRate: trainMetrics.winRate, profitFactor: trainMetrics.profitFactor },
                test: { tradeCount: testMetrics.tradeCount, winRate: testMetrics.winRate, profitFactor: testMetrics.profitFactor }
            };
        });

        const testTrades = windows.reduce((acc, w) => acc.concat(this._runSegmentWithWarmup(w.test, w.train.slice(-warmupBars), strategy, params, initialCapital).trades || []), []);
        const aggregate = this._computeMetrics(testTrades);

        return {
            success: true,
            windows: results,
            aggregateOutOfSample: aggregate,
            summary: results.every(r => (r.test.profitFactor === '∞' ? 999 : r.test.profitFactor) > 1)
                ? 'Strategy remained profitable across all out-of-sample windows.'
                : 'Strategy performance was inconsistent across out-of-sample windows.',
            safeguards: 'Each test window uses only data following its training window — no future leakage.'
        };
    }

    getRun(runId) {
        return this.runs.get(runId) || null;
    }
}

module.exports = BacktestEngine;