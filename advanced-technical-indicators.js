const fetch = require('node-fetch');
const https = require('https');

// 사내망 HTTPS 에이전트
const agent = new https.Agent({
    rejectUnauthorized: false
});

class AdvancedTechnicalIndicators {
    constructor() {
        this.candleHistory = [];
        this.maxHistorySize = 300; // 더 많은 데이터 보관
        
        // 고급 지표 설정
        this.settings = {
            macd: {
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9
            },
            stochastic: {
                kPeriod: 14,
                dPeriod: 3,
                overbought: 80,
                oversold: 20
            },
            fibonacci: {
                levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
            },
            ichimoku: {
                tenkanPeriod: 9,
                kijunPeriod: 26,
                senkouBPeriod: 52,
                chikouPeriod: 26
            },
            williams: {
                period: 14,
                overbought: -20,
                oversold: -80
            },
            cci: {
                period: 20,
                overbought: 100,
                oversold: -100
            },
            vwap: {
                period: 20
            }
        };
    }
    
    // 🕯️ 확장된 캔들 데이터 수집
    async fetchExtendedCandleData() {
        try {
            console.log('🕯️ 고급 기술분석용 확장 캔들 데이터 수집 중...');
            
            const response = await fetch('https://api.bithumb.com/public/candlestick/PCI_KRW/24h', {
                method: 'GET',
                agent: agent,
                timeout: 15000
            });
            
            if (!response.ok) {
                throw new Error(`API 응답 오류: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.status !== '0000') {
                throw new Error('빗썸 API 오류');
            }
            
            // 캔들 데이터 파싱 및 추가 지표 계산용 데이터 생성
            const candles = data.data.map(candle => ({
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                close: parseFloat(candle[2]),
                high: parseFloat(candle[3]),
                low: parseFloat(candle[4]),
                volume: parseFloat(candle[5]),
                // 추가 계산 필드
                hl2: (parseFloat(candle[3]) + parseFloat(candle[4])) / 2, // (High + Low) / 2
                hlc3: (parseFloat(candle[3]) + parseFloat(candle[4]) + parseFloat(candle[2])) / 3, // (H+L+C) / 3
                ohlc4: (parseFloat(candle[1]) + parseFloat(candle[3]) + parseFloat(candle[4]) + parseFloat(candle[2])) / 4 // (O+H+L+C) / 4
            }));
            
            // 시간순 정렬
            candles.sort((a, b) => a.timestamp - b.timestamp);
            
            console.log(`   📊 확장 캔들 데이터: ${candles.length}개`);
            console.log(`   🕐 기간: ${new Date(candles[0].timestamp).toLocaleDateString()} ~ ${new Date(candles[candles.length-1].timestamp).toLocaleDateString()}`);
            
            this.candleHistory = candles;
            if (this.candleHistory.length > this.maxHistorySize) {
                this.candleHistory = this.candleHistory.slice(-this.maxHistorySize);
            }
            
            return candles;
            
        } catch (error) {
            console.error(`❌ 확장 캔들 데이터 수집 실패: ${error.message}`);
            return null;
        }
    }
    
    // 📊 MACD (Moving Average Convergence Divergence) 계산
    calculateMACD() {
        const { fastPeriod, slowPeriod, signalPeriod } = this.settings.macd;
        
        if (this.candleHistory.length < slowPeriod + signalPeriod) {
            return { macd: null, signal: 'insufficient_data' };
        }
        
        const closes = this.candleHistory.map(candle => candle.close);
        
        // EMA 계산 함수
        const calculateEMA = (data, period) => {
            const k = 2 / (period + 1);
            const ema = [data[0]];
            
            for (let i = 1; i < data.length; i++) {
                ema.push(data[i] * k + ema[i - 1] * (1 - k));
            }
            return ema;
        };
        
        // 빠른 EMA와 느린 EMA 계산
        const fastEMA = calculateEMA(closes, fastPeriod);
        const slowEMA = calculateEMA(closes, slowPeriod);
        
        // MACD 라인 계산
        const macdLine = [];
        const startIndex = Math.max(fastEMA.length, slowEMA.length) - Math.min(fastEMA.length, slowEMA.length);
        
        for (let i = startIndex; i < Math.min(fastEMA.length, slowEMA.length); i++) {
            macdLine.push(fastEMA[i] - slowEMA[i]);
        }
        
        // 시그널 라인 계산 (MACD의 EMA)
        const signalLine = calculateEMA(macdLine, signalPeriod);
        
        // 히스토그램 계산
        const histogram = [];
        const histogramStart = Math.max(0, macdLine.length - signalLine.length);
        
        for (let i = 0; i < signalLine.length; i++) {
            histogram.push(macdLine[histogramStart + i] - signalLine[i]);
        }
        
        // 현재 값들
        const currentMACD = macdLine[macdLine.length - 1];
        const currentSignal = signalLine[signalLine.length - 1];
        const currentHistogram = histogram[histogram.length - 1];
        
        // 이전 값들 (크로스오버 감지용)
        const prevMACD = macdLine.length > 1 ? macdLine[macdLine.length - 2] : currentMACD;
        const prevSignal = signalLine.length > 1 ? signalLine[signalLine.length - 2] : currentSignal;
        
        // 시그널 분석
        let signal = 'neutral';
        let crossover = null;
        
        // 골든크로스 (MACD가 시그널을 상향 돌파)
        if (prevMACD <= prevSignal && currentMACD > currentSignal) {
            signal = 'bullish_crossover';
            crossover = 'golden';
        }
        // 데드크로스 (MACD가 시그널을 하향 돌파)
        else if (prevMACD >= prevSignal && currentMACD < currentSignal) {
            signal = 'bearish_crossover';
            crossover = 'dead';
        }
        // MACD가 0선 위/아래
        else if (currentMACD > 0 && currentHistogram > 0) {
            signal = 'bullish';
        } else if (currentMACD < 0 && currentHistogram < 0) {
            signal = 'bearish';
        }
        
        return {
            macd: {
                line: currentMACD,
                signal: currentSignal,
                histogram: currentHistogram
            },
            signal,
            crossover,
            trend: currentMACD > 0 ? 'bullish' : 'bearish',
            momentum: currentHistogram > 0 ? 'increasing' : 'decreasing',
            history: {
                macd: macdLine.slice(-10),
                signal: signalLine.slice(-10),
                histogram: histogram.slice(-10)
            }
        };
    }
    
    // 📊 RSI (Relative Strength Index) 계산
    calculateRSI(period = 14) {
        if (this.candleHistory.length < period + 1) {
            return { rsi: null, signal: 'insufficient_data' };
        }
        
        const closes = this.candleHistory.map(candle => candle.close);
        const gains = [];
        const losses = [];
        
        // 가격 변화 계산
        for (let i = 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        if (gains.length < period) {
            return { rsi: null, signal: 'insufficient_data' };
        }
        
        // 첫 번째 RS 계산 (단순 평균)
        let avgGain = gains.slice(0, period).reduce((sum, gain) => sum + gain, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((sum, loss) => sum + loss, 0) / period;
        
        const rsiValues = [];
        
        for (let i = period; i < gains.length; i++) {
            // Wilder's smoothing
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            rsiValues.push(rsi);
        }
        
        const currentRSI = rsiValues[rsiValues.length - 1];
        
        // 시그널 분석
        let signal = 'neutral';
        if (currentRSI >= 70) {
            signal = 'overbought';
        } else if (currentRSI <= 30) {
            signal = 'oversold';
        }
        
        // 다이버전스 체크
        const recentRSI = rsiValues.slice(-5);
        const recentPrices = closes.slice(-5);
        let divergence = null;
        
        if (recentRSI.length >= 3 && recentPrices.length >= 3) {
            const rsiTrend = recentRSI[recentRSI.length - 1] - recentRSI[0];
            const priceTrend = recentPrices[recentPrices.length - 1] - recentPrices[0];
            
            if (rsiTrend > 0 && priceTrend < 0) {
                divergence = 'bearish';
            } else if (rsiTrend < 0 && priceTrend > 0) {
                divergence = 'bullish';
            }
        }
        
        return {
            value: currentRSI,
            signal,
            divergence,
            level: currentRSI >= 70 ? 'overbought' : currentRSI <= 30 ? 'oversold' : 'neutral',
            history: rsiValues.slice(-10)
        };
    }
    
    // 📊 볼린저 밴드 계산
    calculateBollingerBands(period = 20, multiplier = 2) {
        if (this.candleHistory.length < period) {
            return { bollinger: null, signal: 'insufficient_data' };
        }
        
        const closes = this.candleHistory.map(candle => candle.close);
        const bands = [];
        
        for (let i = period - 1; i < closes.length; i++) {
            const slice = closes.slice(i - period + 1, i + 1);
            const sma = slice.reduce((sum, price) => sum + price, 0) / period;
            
            // 표준편차 계산
            const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
            const stdDev = Math.sqrt(variance);
            
            bands.push({
                middle: sma,
                upper: sma + (stdDev * multiplier),
                lower: sma - (stdDev * multiplier),
                price: closes[i],
                width: (stdDev * multiplier * 2) / sma * 100
            });
        }
        
        const current = bands[bands.length - 1];
        const currentPrice = closes[closes.length - 1];
        
        // 시그널 분석
        let signal = 'neutral';
        let position = 'middle';
        
        if (currentPrice >= current.upper) {
            signal = 'overbought';
            position = 'upper_break';
        } else if (currentPrice <= current.lower) {
            signal = 'oversold';
            position = 'lower_break';
        } else if (currentPrice > current.middle) {
            position = 'upper_half';
        } else if (currentPrice < current.middle) {
            position = 'lower_half';
        }
        
        // 밴드 스퀴즈 감지 (변동성 감소)
        const avgWidth = bands.slice(-10).reduce((sum, band) => sum + band.width, 0) / 10;
        const squeeze = current.width < avgWidth * 0.8;
        
        return {
            upper: current.upper,
            middle: current.middle,
            lower: current.lower,
            width: current.width,
            position,
            signal,
            squeeze,
            history: bands.slice(-10)
        };
    }
    
    // 📊 이동평균선 계산 (SMA, EMA)
    calculateMovingAverages() {
        const periods = [5, 10, 20, 60, 120];
        const closes = this.candleHistory.map(candle => candle.close);
        const currentPrice = closes[closes.length - 1];
        
        if (closes.length < Math.max(...periods)) {
            return { ma: null, signal: 'insufficient_data' };
        }
        
        const smaValues = {};
        const emaValues = {};
        
        // SMA 계산
        periods.forEach(period => {
            if (closes.length >= period) {
                const slice = closes.slice(-period);
                smaValues[`sma${period}`] = slice.reduce((sum, price) => sum + price, 0) / period;
            }
        });
        
        // EMA 계산
        periods.forEach(period => {
            if (closes.length >= period) {
                const multiplier = 2 / (period + 1);
                let ema = closes.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
                
                for (let i = period; i < closes.length; i++) {
                    ema = (closes[i] * multiplier) + (ema * (1 - multiplier));
                }
                emaValues[`ema${period}`] = ema;
            }
        });
        
        // 시그널 분석
        let signal = 'neutral';
        let trend = 'sideways';
        
        // 골든크로스/데드크로스 감지 (SMA 20, 60)
        if (smaValues.sma20 && smaValues.sma60) {
            if (smaValues.sma20 > smaValues.sma60 && currentPrice > smaValues.sma20) {
                signal = 'bullish';
                trend = 'uptrend';
            } else if (smaValues.sma20 < smaValues.sma60 && currentPrice < smaValues.sma20) {
                signal = 'bearish';
                trend = 'downtrend';
            }
        }
        
        // 단기 vs 장기 이평선 배열
        const maArray = [];
        if (smaValues.sma5) maArray.push({ period: 5, value: smaValues.sma5 });
        if (smaValues.sma20) maArray.push({ period: 20, value: smaValues.sma20 });
        if (smaValues.sma60) maArray.push({ period: 60, value: smaValues.sma60 });
        
        const bullishAlignment = maArray.every((ma, index) => {
            if (index === 0) return true;
            return ma.value > maArray[index - 1].value;
        });
        
        const bearishAlignment = maArray.every((ma, index) => {
            if (index === 0) return true;
            return ma.value < maArray[index - 1].value;
        });
        
        return {
            sma: smaValues,
            ema: emaValues,
            currentPrice,
            signal,
            trend,
            alignment: bullishAlignment ? 'bullish' : bearishAlignment ? 'bearish' : 'mixed',
            support: Math.max(...Object.values(smaValues).filter(v => v < currentPrice)),
            resistance: Math.min(...Object.values(smaValues).filter(v => v > currentPrice))
        };
    }
    
    // 📊 스토캐스틱 오실레이터 계산
    calculateStochastic() {
        const { kPeriod, dPeriod, overbought, oversold } = this.settings.stochastic;
        
        if (this.candleHistory.length < kPeriod + dPeriod) {
            return { stochastic: null, signal: 'insufficient_data' };
        }
        
        const kValues = [];
        
        // %K 계산
        for (let i = kPeriod - 1; i < this.candleHistory.length; i++) {
            const periodData = this.candleHistory.slice(i - kPeriod + 1, i + 1);
            const highestHigh = Math.max(...periodData.map(candle => candle.high));
            const lowestLow = Math.min(...periodData.map(candle => candle.low));
            const currentClose = this.candleHistory[i].close;
            
            const kValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
            kValues.push(kValue);
        }
        
        // %D 계산 (%K의 이동평균)
        const dValues = [];
        for (let i = dPeriod - 1; i < kValues.length; i++) {
            const sum = kValues.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0);
            dValues.push(sum / dPeriod);
        }
        
        const currentK = kValues[kValues.length - 1];
        const currentD = dValues[dValues.length - 1];
        const prevK = kValues.length > 1 ? kValues[kValues.length - 2] : currentK;
        const prevD = dValues.length > 1 ? dValues[dValues.length - 2] : currentD;
        
        // 시그널 분석
        let signal = 'neutral';
        let crossover = null;
        
        if (currentK >= overbought && currentD >= overbought) {
            signal = 'overbought';
        } else if (currentK <= oversold && currentD <= oversold) {
            signal = 'oversold';
        } else if (prevK <= prevD && currentK > currentD) {
            signal = 'bullish_crossover';
            crossover = 'golden';
        } else if (prevK >= prevD && currentK < currentD) {
            signal = 'bearish_crossover';
            crossover = 'dead';
        }
        
        return {
            stochastic: {
                k: currentK,
                d: currentD
            },
            signal,
            crossover,
            overbought: currentK >= overbought,
            oversold: currentK <= oversold,
            history: {
                k: kValues.slice(-10),
                d: dValues.slice(-10)
            }
        };
    }
    
    // 📊 피보나치 되돌림 계산
    calculateFibonacciRetracement(lookbackDays = 30) {
        if (this.candleHistory.length < lookbackDays) {
            return { fibonacci: null, signal: 'insufficient_data' };
        }
        
        const recentCandles = this.candleHistory.slice(-lookbackDays);
        const high = Math.max(...recentCandles.map(candle => candle.high));
        const low = Math.min(...recentCandles.map(candle => candle.low));
        const currentPrice = this.candleHistory[this.candleHistory.length - 1].close;
        
        const range = high - low;
        const levels = {};
        
        // 피보나치 되돌림 레벨 계산
        this.settings.fibonacci.levels.forEach(level => {
            levels[`${(level * 100).toFixed(1)}%`] = high - (range * level);
        });
        
        // 현재 가격이 어떤 레벨 근처에 있는지 확인
        let nearestLevel = null;
        let nearestDistance = Infinity;
        
        Object.entries(levels).forEach(([levelName, levelPrice]) => {
            const distance = Math.abs(currentPrice - levelPrice);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestLevel = { name: levelName, price: levelPrice };
            }
        });
        
        // 지지/저항 신호 분석
        const pricePosition = (currentPrice - low) / range;
        let signal = 'neutral';
        
        if (pricePosition <= 0.236) {
            signal = 'strong_support';
        } else if (pricePosition <= 0.382) {
            signal = 'support';
        } else if (pricePosition >= 0.786) {
            signal = 'strong_resistance';
        } else if (pricePosition >= 0.618) {
            signal = 'resistance';
        }
        
        return {
            fibonacci: {
                high,
                low,
                range,
                levels,
                currentPrice,
                pricePosition: pricePosition * 100
            },
            signal,
            nearestLevel,
            trend: currentPrice > levels['50.0%'] ? 'uptrend' : 'downtrend'
        };
    }
    
    // 📊 이치모쿠 구름 계산
    calculateIchimokuCloud() {
        const { tenkanPeriod, kijunPeriod, senkouBPeriod, chikouPeriod } = this.settings.ichimoku;
        
        if (this.candleHistory.length < senkouBPeriod + chikouPeriod) {
            return { ichimoku: null, signal: 'insufficient_data' };
        }
        
        const candles = this.candleHistory;
        const currentIndex = candles.length - 1;
        
        // Tenkan-sen (전환선) - 9일 중간가
        const tenkanHigh = Math.max(...candles.slice(-tenkanPeriod).map(c => c.high));
        const tenkanLow = Math.min(...candles.slice(-tenkanPeriod).map(c => c.low));
        const tenkanSen = (tenkanHigh + tenkanLow) / 2;
        
        // Kijun-sen (기준선) - 26일 중간가
        const kijunHigh = Math.max(...candles.slice(-kijunPeriod).map(c => c.high));
        const kijunLow = Math.min(...candles.slice(-kijunPeriod).map(c => c.low));
        const kijunSen = (kijunHigh + kijunLow) / 2;
        
        // Senkou Span A (선행스팬A) - (전환선 + 기준선) / 2
        const senkouSpanA = (tenkanSen + kijunSen) / 2;
        
        // Senkou Span B (선행스팬B) - 52일 중간가
        const senkouBHigh = Math.max(...candles.slice(-senkouBPeriod).map(c => c.high));
        const senkouBLow = Math.min(...candles.slice(-senkouBPeriod).map(c => c.low));
        const senkouSpanB = (senkouBHigh + senkouBLow) / 2;
        
        // Chikou Span (후행스팬) - 26일 전 종가
        const chikouSpan = candles[currentIndex - chikouPeriod]?.close || candles[currentIndex].close;
        
        const currentPrice = candles[currentIndex].close;
        
        // 구름 분석
        const cloudTop = Math.max(senkouSpanA, senkouSpanB);
        const cloudBottom = Math.min(senkouSpanA, senkouSpanB);
        const cloudColor = senkouSpanA > senkouSpanB ? 'bullish' : 'bearish';
        
        // 시그널 분석
        let signal = 'neutral';
        const signals = [];
        
        // 가격이 구름 위/아래
        if (currentPrice > cloudTop) {
            signals.push('above_cloud');
            signal = 'bullish';
        } else if (currentPrice < cloudBottom) {
            signals.push('below_cloud');
            signal = 'bearish';
        } else {
            signals.push('in_cloud');
            signal = 'neutral';
        }
        
        // 전환선과 기준선 관계
        if (tenkanSen > kijunSen) {
            signals.push('tenkan_above_kijun');
        } else if (tenkanSen < kijunSen) {
            signals.push('tenkan_below_kijun');
        }
        
        // 후행스팬 분석
        if (chikouSpan > currentPrice) {
            signals.push('chikou_bullish');
        } else if (chikouSpan < currentPrice) {
            signals.push('chikou_bearish');
        }
        
        return {
            ichimoku: {
                tenkanSen,
                kijunSen,
                senkouSpanA,
                senkouSpanB,
                chikouSpan,
                cloudTop,
                cloudBottom,
                cloudColor
            },
            signal,
            signals,
            trend: cloudColor === 'bullish' && currentPrice > cloudTop ? 'strong_bullish' : 
                   cloudColor === 'bearish' && currentPrice < cloudBottom ? 'strong_bearish' : 'neutral'
        };
    }
    
    // 📊 Williams %R 계산
    calculateWilliamsR() {
        const { period, overbought, oversold } = this.settings.williams;
        
        if (this.candleHistory.length < period) {
            return { williamsR: null, signal: 'insufficient_data' };
        }
        
        const recentCandles = this.candleHistory.slice(-period);
        const highestHigh = Math.max(...recentCandles.map(c => c.high));
        const lowestLow = Math.min(...recentCandles.map(c => c.low));
        const currentClose = this.candleHistory[this.candleHistory.length - 1].close;
        
        const williamsR = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
        
        let signal = 'neutral';
        if (williamsR >= overbought) {
            signal = 'overbought';
        } else if (williamsR <= oversold) {
            signal = 'oversold';
        }
        
        return {
            williamsR: williamsR,
            signal,
            overbought: williamsR >= overbought,
            oversold: williamsR <= oversold
        };
    }
    
    // 📊 CCI (Commodity Channel Index) 계산
    calculateCCI() {
        const { period, overbought, oversold } = this.settings.cci;
        
        if (this.candleHistory.length < period) {
            return { cci: null, signal: 'insufficient_data' };
        }
        
        // Typical Price 계산
        const typicalPrices = this.candleHistory.map(candle => candle.hlc3);
        
        // 최근 기간의 평균 계산
        const recentTypicalPrices = typicalPrices.slice(-period);
        const sma = recentTypicalPrices.reduce((sum, price) => sum + price, 0) / period;
        
        // Mean Deviation 계산
        const meanDeviation = recentTypicalPrices.reduce((sum, price) => sum + Math.abs(price - sma), 0) / period;
        
        // CCI 계산
        const currentTypicalPrice = typicalPrices[typicalPrices.length - 1];
        const cci = (currentTypicalPrice - sma) / (0.015 * meanDeviation);
        
        let signal = 'neutral';
        if (cci >= overbought) {
            signal = 'overbought';
        } else if (cci <= oversold) {
            signal = 'oversold';
        }
        
        return {
            cci: cci,
            signal,
            overbought: cci >= overbought,
            oversold: cci <= oversold
        };
    }
    
    // 📊 OBV (On-Balance Volume) 계산
    calculateOBV() {
        if (this.candleHistory.length < 2) {
            return { obv: null, signal: 'insufficient_data' };
        }
        
        let obv = 0;
        const obvHistory = [0];
        
        for (let i = 1; i < this.candleHistory.length; i++) {
            const currentCandle = this.candleHistory[i];
            const prevCandle = this.candleHistory[i - 1];
            
            if (currentCandle.close > prevCandle.close) {
                obv += currentCandle.volume;
            } else if (currentCandle.close < prevCandle.close) {
                obv -= currentCandle.volume;
            }
            // 가격이 같으면 OBV 변화 없음
            
            obvHistory.push(obv);
        }
        
        // OBV 추세 분석
        const recentOBV = obvHistory.slice(-10);
        const obvTrend = recentOBV[recentOBV.length - 1] > recentOBV[0] ? 'increasing' : 'decreasing';
        
        // 가격과 OBV 다이버전스 체크
        const recentPrices = this.candleHistory.slice(-10).map(c => c.close);
        const priceTrend = recentPrices[recentPrices.length - 1] > recentPrices[0] ? 'increasing' : 'decreasing';
        
        let signal = 'neutral';
        if (priceTrend === 'increasing' && obvTrend === 'decreasing') {
            signal = 'bearish_divergence';
        } else if (priceTrend === 'decreasing' && obvTrend === 'increasing') {
            signal = 'bullish_divergence';
        } else if (priceTrend === obvTrend) {
            signal = 'confirmation';
        }
        
        return {
            obv: obv,
            signal,
            trend: obvTrend,
            divergence: signal.includes('divergence'),
            history: obvHistory.slice(-20)
        };
    }
    
    // 📊 VWAP (Volume Weighted Average Price) 계산
    calculateVWAP() {
        const { period } = this.settings.vwap;
        
        if (this.candleHistory.length < period) {
            return { vwap: null, signal: 'insufficient_data' };
        }
        
        const recentCandles = this.candleHistory.slice(-period);
        
        let totalVolume = 0;
        let totalVolumePrice = 0;
        
        recentCandles.forEach(candle => {
            const typicalPrice = candle.hlc3;
            totalVolume += candle.volume;
            totalVolumePrice += typicalPrice * candle.volume;
        });
        
        const vwap = totalVolumePrice / totalVolume;
        const currentPrice = this.candleHistory[this.candleHistory.length - 1].close;
        
        let signal = 'neutral';
        const deviation = ((currentPrice - vwap) / vwap) * 100;
        
        if (deviation > 2) {
            signal = 'above_vwap';
        } else if (deviation < -2) {
            signal = 'below_vwap';
        }
        
        return {
            vwap: vwap,
            currentPrice: currentPrice,
            deviation: deviation,
            signal,
            trend: currentPrice > vwap ? 'bullish' : 'bearish'
        };
    }
    
    // 🎯 모든 고급 지표 통합 분석
    async performAdvancedAnalysis() {
        console.log('🔬 페이코인 고급 기술분석 시작...\n');
        
        // 확장 캔들 데이터 수집
        const candles = await this.fetchExtendedCandleData();
        if (!candles) return null;
        
        console.log('📊 고급 기술지표 계산 중...');
        
        // 모든 지표 계산
        const macd = this.calculateMACD();
        const stochastic = this.calculateStochastic();
        const fibonacci = this.calculateFibonacciRetracement();
        const ichimoku = this.calculateIchimokuCloud();
        const williamsR = this.calculateWilliamsR();
        const cci = this.calculateCCI();
        const obv = this.calculateOBV();
        const vwap = this.calculateVWAP();
        
        console.log('\n📈 고급 기술지표 결과:');
        
        // MACD 결과
        if (macd.macd) {
            console.log(`\n🌊 MACD:`);
            console.log(`   MACD Line: ${macd.macd.line.toFixed(4)}`);
            console.log(`   Signal Line: ${macd.macd.signal.toFixed(4)}`);
            console.log(`   Histogram: ${macd.macd.histogram.toFixed(4)}`);
            console.log(`   시그널: ${this.formatSignal(macd.signal)}`);
            if (macd.crossover) {
                console.log(`   🎯 크로스오버: ${macd.crossover === 'golden' ? '골든크로스' : '데드크로스'}`);
            }
        }
        
        // 스토캐스틱 결과
        if (stochastic.stochastic) {
            console.log(`\n📊 스토캐스틱:`);
            console.log(`   %K: ${stochastic.stochastic.k.toFixed(2)}`);
            console.log(`   %D: ${stochastic.stochastic.d.toFixed(2)}`);
            console.log(`   시그널: ${this.formatSignal(stochastic.signal)}`);
            if (stochastic.overbought) console.log(`   ⚠️ 과매수 구간`);
            if (stochastic.oversold) console.log(`   💎 과매도 구간`);
        }
        
        // 피보나치 결과
        if (fibonacci.fibonacci) {
            console.log(`\n🌀 피보나치 되돌림:`);
            console.log(`   고점: ${fibonacci.fibonacci.high.toFixed(2)}원`);
            console.log(`   저점: ${fibonacci.fibonacci.low.toFixed(2)}원`);
            console.log(`   현재가: ${fibonacci.fibonacci.currentPrice.toFixed(2)}원`);
            console.log(`   위치: ${fibonacci.fibonacci.pricePosition.toFixed(1)}%`);
            console.log(`   시그널: ${this.formatSignal(fibonacci.signal)}`);
            if (fibonacci.nearestLevel) {
                console.log(`   가까운 레벨: ${fibonacci.nearestLevel.name} (${fibonacci.nearestLevel.price.toFixed(2)}원)`);
            }
        }
        
        // 이치모쿠 결과
        if (ichimoku.ichimoku) {
            console.log(`\n☁️ 이치모쿠 구름:`);
            console.log(`   전환선: ${ichimoku.ichimoku.tenkanSen.toFixed(2)}원`);
            console.log(`   기준선: ${ichimoku.ichimoku.kijunSen.toFixed(2)}원`);
            console.log(`   구름 상단: ${ichimoku.ichimoku.cloudTop.toFixed(2)}원`);
            console.log(`   구름 하단: ${ichimoku.ichimoku.cloudBottom.toFixed(2)}원`);
            console.log(`   구름 색상: ${ichimoku.ichimoku.cloudColor === 'bullish' ? '🟢 상승' : '🔴 하락'}`);
            console.log(`   시그널: ${this.formatSignal(ichimoku.signal)}`);
        }
        
        // Williams %R 결과
        if (williamsR.williamsR !== null) {
            console.log(`\n📉 Williams %R:`);
            console.log(`   값: ${williamsR.williamsR.toFixed(2)}%`);
            console.log(`   시그널: ${this.formatSignal(williamsR.signal)}`);
        }
        
        // CCI 결과
        if (cci.cci !== null) {
            console.log(`\n🌊 CCI:`);
            console.log(`   값: ${cci.cci.toFixed(2)}`);
            console.log(`   시그널: ${this.formatSignal(cci.signal)}`);
        }
        
        // OBV 결과
        if (obv.obv !== null) {
            console.log(`\n📊 OBV:`);
            console.log(`   값: ${obv.obv.toLocaleString()}`);
            console.log(`   추세: ${obv.trend === 'increasing' ? '📈 증가' : '📉 감소'}`);
            console.log(`   시그널: ${this.formatSignal(obv.signal)}`);
            if (obv.divergence) {
                console.log(`   🎯 다이버전스 감지!`);
            }
        }
        
        // VWAP 결과
        if (vwap.vwap !== null) {
            console.log(`\n💰 VWAP:`);
            console.log(`   VWAP: ${vwap.vwap.toFixed(2)}원`);
            console.log(`   현재가: ${vwap.currentPrice.toFixed(2)}원`);
            console.log(`   편차: ${vwap.deviation.toFixed(2)}%`);
            console.log(`   시그널: ${this.formatSignal(vwap.signal)}`);
        }
        
        // 종합 고급 시그널 생성
        const advancedSignal = this.generateAdvancedOverallSignal(macd, stochastic, fibonacci, ichimoku, williamsR, cci, obv, vwap);
        console.log(`\n🎯 고급 종합 판단: ${this.formatAdvancedSignal(advancedSignal)}`);
        
        return {
            timestamp: Date.now(),
            advanced: {
                macd,
                stochastic,
                fibonacci,
                ichimoku,
                williamsR,
                cci,
                obv,
                vwap
            },
            advancedSignal
        };
    }
    
    // 🎯 고급 종합 시그널 생성
    generateAdvancedOverallSignal(macd, stochastic, fibonacci, ichimoku, williamsR, cci, obv, vwap) {
        let bullishCount = 0;
        let bearishCount = 0;
        let totalIndicators = 0;
        
        // MACD
        if (macd.signal !== 'insufficient_data') {
            totalIndicators++;
            if (['bullish', 'bullish_crossover'].includes(macd.signal)) bullishCount++;
            else if (['bearish', 'bearish_crossover'].includes(macd.signal)) bearishCount++;
        }
        
        // 스토캐스틱
        if (stochastic.signal !== 'insufficient_data') {
            totalIndicators++;
            if (stochastic.signal === 'oversold' || stochastic.signal === 'bullish_crossover') bullishCount++;
            else if (stochastic.signal === 'overbought' || stochastic.signal === 'bearish_crossover') bearishCount++;
        }
        
        // 피보나치
        if (fibonacci.signal !== 'insufficient_data') {
            totalIndicators++;
            if (['support', 'strong_support'].includes(fibonacci.signal)) bullishCount++;
            else if (['resistance', 'strong_resistance'].includes(fibonacci.signal)) bearishCount++;
        }
        
        // 이치모쿠
        if (ichimoku.signal !== 'insufficient_data') {
            totalIndicators++;
            if (ichimoku.signal === 'bullish' || ichimoku.trend === 'strong_bullish') bullishCount++;
            else if (ichimoku.signal === 'bearish' || ichimoku.trend === 'strong_bearish') bearishCount++;
        }
        
        // Williams %R
        if (williamsR.williamsR !== null) {
            totalIndicators++;
            if (williamsR.signal === 'oversold') bullishCount++;
            else if (williamsR.signal === 'overbought') bearishCount++;
        }
        
        // CCI
        if (cci.cci !== null) {
            totalIndicators++;
            if (cci.signal === 'oversold') bullishCount++;
            else if (cci.signal === 'overbought') bearishCount++;
        }
        
        // OBV
        if (obv.obv !== null) {
            totalIndicators++;
            if (obv.signal === 'bullish_divergence' || (obv.signal === 'confirmation' && obv.trend === 'increasing')) bullishCount++;
            else if (obv.signal === 'bearish_divergence' || (obv.signal === 'confirmation' && obv.trend === 'decreasing')) bearishCount++;
        }
        
        // VWAP
        if (vwap.vwap !== null) {
            totalIndicators++;
            if (vwap.signal === 'above_vwap') bullishCount++;
            else if (vwap.signal === 'below_vwap') bearishCount++;
        }
        
        // 종합 판단
        const bullishRatio = bullishCount / totalIndicators;
        const bearishRatio = bearishCount / totalIndicators;
        
        if (bullishRatio >= 0.7) return 'very_strong_bullish';
        else if (bullishRatio >= 0.6) return 'strong_bullish';
        else if (bullishRatio >= 0.4) return 'bullish';
        else if (bearishRatio >= 0.7) return 'very_strong_bearish';
        else if (bearishRatio >= 0.6) return 'strong_bearish';  
        else if (bearishRatio >= 0.4) return 'bearish';
        else return 'neutral';
    }
    
    // 포맷팅 헬퍼 함수들
    formatSignal(signal) {
        const signals = {
            'bullish': '🟢 상승',
            'bearish': '🔴 하락',
            'bullish_crossover': '🟢 상승 크로스오버',
            'bearish_crossover': '🔴 하락 크로스오버',
            'overbought': '🔴 과매수',
            'oversold': '🟢 과매도',
            'neutral': '🟡 중립',
            'support': '🟢 지지',
            'resistance': '🔴 저항',
            'strong_support': '🟢 강한 지지',
            'strong_resistance': '🔴 강한 저항',
            'above_cloud': '🟢 구름 위',
            'below_cloud': '🔴 구름 아래',
            'in_cloud': '🟡 구름 안',
            'bullish_divergence': '🟢 상승 다이버전스',
            'bearish_divergence': '🔴 하락 다이버전스',
            'confirmation': '✅ 추세 확인',
            'above_vwap': '🟢 VWAP 상회',
            'below_vwap': '🔴 VWAP 하회',
            'insufficient_data': '❓ 데이터 부족'
        };
        return signals[signal] || signal;
    }
    
    formatAdvancedSignal(signal) {
        const signals = {
            'very_strong_bullish': '🚀🚀 매우 강한 상승',
            'strong_bullish': '🚀 강한 상승',
            'bullish': '📈 상승',
            'neutral': '🟡 중립',
            'bearish': '📉 하락',
            'strong_bearish': '💀 강한 하락',
            'very_strong_bearish': '💀💀 매우 강한 하락'
        };
        return signals[signal] || signal;
    }
}

module.exports = AdvancedTechnicalIndicators;