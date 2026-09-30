// algorithms/technicalIndicators.js - Production Mathematical Quantitative Indicator Suite

class TechnicalIndicators {
    // 1. Simple Moving Average (SMA)
    static SMA(data, length) {
        if (!Array.isArray(data) || data.length === 0 || length <= 0) return [];
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < length - 1) {
                result.push(null);
            } else {
                let sum = 0;
                for (let j = 0; j < length; j++) {
                    sum += data[i - j];
                }
                result.push(Number((sum / length).toFixed(4)));
            }
        }
        return result;
    }

    // 2. Exponential Moving Average (EMA)
    static EMA(data, length) {
        if (!Array.isArray(data) || data.length === 0 || length <= 0) return [];
        const result = [];
        const k = 2 / (length + 1);
        let ema = data[0];
        result.push(Number(ema.toFixed(4)));

        for (let i = 1; i < data.length; i++) {
            ema = (data[i] * k) + (ema * (1 - k));
            result.push(Number(ema.toFixed(4)));
        }
        return result;
    }

    // 3. Relative Strength Index (RSI - 14 period with Wilder's Smoothing)
    static RSI(prices, length = 14) {
        if (!Array.isArray(prices) || prices.length <= length) {
            return prices.map(() => 50);
        }

        const rsi = [];
        let gains = 0;
        let losses = 0;

        // First baseline average
        for (let i = 1; i <= length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }

        let avgGain = gains / length;
        let avgLoss = losses / length;

        for (let i = 0; i < length; i++) {
            rsi.push(50);
        }

        // Wilder's Smoothing for subsequent periods
        for (let i = length; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? -change : 0;

            avgGain = (avgGain * (length - 1) + gain) / length;
            avgLoss = (avgLoss * (length - 1) + loss) / length;

            if (avgLoss === 0) {
                rsi.push(100);
            } else {
                const rs = avgGain / avgLoss;
                const rsiVal = 100 - (100 / (1 + rs));
                rsi.push(Number(rsiVal.toFixed(2)));
            }
        }

        return rsi;
    }

    // 4. Moving Average Convergence Divergence (MACD 12, 26, 9)
    static MACD(prices, fast = 12, slow = 26, signalPeriod = 9) {
        if (!Array.isArray(prices) || prices.length === 0) {
            return { macdLine: [], signalLine: [], histogram: [] };
        }

        const emaFast = this.EMA(prices, fast);
        const emaSlow = this.EMA(prices, slow);

        const macdLine = [];
        for (let i = 0; i < prices.length; i++) {
            macdLine.push(Number((emaFast[i] - emaSlow[i]).toFixed(4)));
        }

        const signalLine = this.EMA(macdLine, signalPeriod);
        const histogram = [];
        for (let i = 0; i < prices.length; i++) {
            histogram.push(Number((macdLine[i] - signalLine[i]).toFixed(4)));
        }

        return { macdLine, signalLine, histogram };
    }

    // 5. Bollinger Bands (20, 2)
    static BollingerBands(prices, length = 20, stdMultiplier = 2) {
        if (!Array.isArray(prices) || prices.length === 0) {
            return { upper: [], middle: [], lower: [], percentB: [] };
        }

        const sma = this.SMA(prices, length);
        const upper = [];
        const lower = [];
        const percentB = [];

        for (let i = 0; i < prices.length; i++) {
            if (i < length - 1 || sma[i] === null) {
                upper.push(null);
                lower.push(null);
                percentB.push(50);
            } else {
                let sumSquareDiff = 0;
                for (let j = 0; j < length; j++) {
                    sumSquareDiff += Math.pow(prices[i - j] - sma[i], 2);
                }
                const stdDev = Math.sqrt(sumSquareDiff / length);
                const up = Number((sma[i] + (stdMultiplier * stdDev)).toFixed(4));
                const low = Number((sma[i] - (stdMultiplier * stdDev)).toFixed(4));
                upper.push(up);
                lower.push(low);

                const bandWidth = up - low;
                const pb = bandWidth > 0 ? ((prices[i] - low) / bandWidth) * 100 : 50;
                percentB.push(Number(pb.toFixed(2)));
            }
        }

        return { upper, middle: sma, lower, percentB };
    }

    // 6. Average True Range (ATR - 14)
    static ATR(candles, length = 14) {
        if (!Array.isArray(candles) || candles.length < 2) return [];

        const trueRanges = [candles[0].high - candles[0].low];
        for (let i = 1; i < candles.length; i++) {
            const h = candles[i].high;
            const l = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
            trueRanges.push(tr);
        }

        return this.SMA(trueRanges, length);
    }

    // 7. Stochastic Oscillator (%K, %D)
    static Stochastic(candles, kPeriod = 14, dPeriod = 3) {
        if (!Array.isArray(candles) || candles.length === 0) return { k: [], d: [] };

        const kLine = [];
        for (let i = 0; i < candles.length; i++) {
            if (i < kPeriod - 1) {
                kLine.push(50);
            } else {
                const slice = candles.slice(i - kPeriod + 1, i + 1);
                const lowestLow = Math.min(...slice.map(c => c.low));
                const highestHigh = Math.max(...slice.map(c => c.high));
                const currentClose = candles[i].close;

                const range = highestHigh - lowestLow;
                const k = range > 0 ? ((currentClose - lowestLow) / range) * 100 : 50;
                kLine.push(Number(k.toFixed(2)));
            }
        }

        const dLine = this.SMA(kLine, dPeriod).map((v, i) => v !== null ? v : kLine[i]);
        return { k: kLine, d: dLine };
    }

    // 8. Ichimoku Cloud (9, 26, 52)
    static Ichimoku(candles) {
        if (!Array.isArray(candles) || candles.length === 0) return null;

        const getMid = (slice) => {
            const highs = slice.map(c => c.high);
            const lows = slice.map(c => c.low);
            return (Math.max(...highs) + Math.min(...lows)) / 2;
        };

        const len = candles.length;
        const tenkanSen = len >= 9 ? getMid(candles.slice(-9)) : candles[len - 1].close;
        const kijunSen = len >= 26 ? getMid(candles.slice(-26)) : candles[len - 1].close;
        const senkouSpanA = (tenkanSen + kijunSen) / 2;
        const senkouSpanB = len >= 52 ? getMid(candles.slice(-52)) : (tenkanSen + kijunSen) / 2;

        return {
            tenkanSen: Number(tenkanSen.toFixed(2)),
            kijunSen: Number(kijunSen.toFixed(2)),
            senkouSpanA: Number(senkouSpanA.toFixed(2)),
            senkouSpanB: Number(senkouSpanB.toFixed(2))
        };
    }

    // 9. Volume Weighted Average Price (VWAP)
    static VWAP(candles) {
        if (!Array.isArray(candles) || candles.length === 0) return [];
        let cumulativeTPV = 0;
        let cumulativeVolume = 0;
        const vwap = [];

        for (const c of candles) {
            const typicalPrice = (c.high + c.low + c.close) / 3;
            cumulativeTPV += typicalPrice * c.volume;
            cumulativeVolume += c.volume;
            vwap.push(cumulativeVolume > 0 ? Number((cumulativeTPV / cumulativeVolume).toFixed(2)) : c.close);
        }
        return vwap;
    }

    // 10. Comprehensive Multi-Indicator Signal Evaluation
    static evaluateSignals(candles) {
        if (!Array.isArray(candles) || candles.length < 30) {
            return { signal: 'HOLD', confidence: 50, score: 0, details: {} };
        }

        const closes = candles.map(c => c.close);
        const currentPrice = closes[closes.length - 1];

        const rsiSeries = this.RSI(closes, 14);
        const currentRsi = rsiSeries[rsiSeries.length - 1];

        const macdObj = this.MACD(closes, 12, 26, 9);
        const currentMacdHist = macdObj.histogram[macdObj.histogram.length - 1];

        const bbObj = this.BollingerBands(closes, 20, 2);
        const currentPercentB = bbObj.percentB[bbObj.percentB.length - 1];

        const stoch = this.Stochastic(candles, 14, 3);
        const currentK = stoch.k[stoch.k.length - 1];

        let bullishVotes = 0;
        let bearishVotes = 0;

        // RSI vote
        if (currentRsi < 30) bullishVotes += 2.5;
        else if (currentRsi > 70) bearishVotes += 2.5;
        else if (currentRsi > 50) bullishVotes += 1.0;
        else bearishVotes += 1.0;

        // MACD Histogram vote
        if (currentMacdHist > 0) bullishVotes += 2.0;
        else bearishVotes += 2.0;

        // Bollinger Bands %B vote
        if (currentPercentB < 15) bullishVotes += 2.0;
        else if (currentPercentB > 85) bearishVotes += 2.0;

        // Stochastic vote
        if (currentK < 20) bullishVotes += 1.5;
        else if (currentK > 80) bearishVotes += 1.5;

        const totalVotes = bullishVotes + bearishVotes;
        const netScore = totalVotes > 0 ? (bullishVotes - bearishVotes) / totalVotes : 0;
        let signal = 'HOLD';
        let confidence = 50;

        if (netScore > 0.25) {
            signal = 'BUY';
            confidence = Math.min(95, Math.round(50 + (netScore * 50)));
        } else if (netScore < -0.25) {
            signal = 'SELL';
            confidence = Math.min(95, Math.round(50 + (Math.abs(netScore) * 50)));
        }

        return {
            signal,
            confidence,
            netScore: Number(netScore.toFixed(2)),
            currentPrice,
            indicators: {
                rsi: currentRsi,
                macdHistogram: currentMacdHist,
                bollingerPercentB: currentPercentB,
                stochasticK: currentK
            }
        };
    }
}

module.exports = TechnicalIndicators;
