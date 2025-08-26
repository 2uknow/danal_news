const fetch = require('node-fetch');
const https = require('https');

// 사내망 HTTPS 에이전트
const agent = new https.Agent({
    rejectUnauthorized: false
});

class PaycoinTechnicalIndicators {
    constructor() {
        this.candleHistory = []; // 캔들 데이터 히스토리
        this.indicators = {}; // 계산된 지표들
        this.maxHistorySize = 200; // 최대 200개 캔들 보관
        
        // 지표 설정
        this.settings = {
            rsi: {
                period: 14,        // RSI 기간
                overbought: 70,    // 과매수 기준
                oversold: 30       // 과매도 기준
            },
            ma: {
                short: 5,          // 단기 이동평균
                medium: 10,        // 중기 이동평균
                long: 20           // 장기 이동평균
            },
            bb: {
                period: 20,        // 볼린저 밴드 기간
                stdDev: 2          // 표준편차 배수
            },
            volume: {
                maPeriod: 20       // 거래량 이동평균 기간
            }
        };
    }
    
    // 🕯️ 캔들 데이터 수집 (빗썸 24시간 캔들)
    async fetchCandleData() {
        try {
            console.log('🕯️ 페이코인 캔들 데이터 수집 중...');
            
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
            
            // 캔들 데이터 파싱 [timestamp, open, close, high, low, volume]
            const candles = data.data.map(candle => ({
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                close: parseFloat(candle[2]),
                high: parseFloat(candle[3]),
                low: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
            
            // 시간순 정렬
            candles.sort((a, b) => a.timestamp - b.timestamp);
            
            console.log(`   📊 캔들 데이터: ${candles.length}개`);
            console.log(`   🕐 기간: ${new Date(candles[0].timestamp).toLocaleDateString()} ~ ${new Date(candles[candles.length-1].timestamp).toLocaleDateString()}`);
            console.log(`   💰 현재가: ${candles[candles.length-1].close.toLocaleString()}원`);
            
            // 히스토리에 추가
            this.candleHistory = candles;
            if (this.candleHistory.length > this.maxHistorySize) {
                this.candleHistory = this.candleHistory.slice(-this.maxHistorySize);
            }
            
            return candles;
            
        } catch (error) {
            console.error(`❌ 캔들 데이터 수집 실패: ${error.message}`);
            return null;
        }
    }
    
    // 📊 RSI 계산
    calculateRSI(period = this.settings.rsi.period) {
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
        if (currentRSI >= this.settings.rsi.overbought) {
            signal = 'overbought'; // 과매수
        } else if (currentRSI <= this.settings.rsi.oversold) {
            signal = 'oversold'; // 과매도
        }
        
        return {
            rsi: currentRSI,
            signal,
            history: rsiValues.slice(-10), // 최근 10개
            overbought: this.settings.rsi.overbought,
            oversold: this.settings.rsi.oversold
        };
    }
    
    // 📈 이동평균선 계산
    calculateMovingAverages() {
        const { short, medium, long } = this.settings.ma;
        
        if (this.candleHistory.length < long) {
            return { mas: null, signal: 'insufficient_data' };
        }
        
        const closes = this.candleHistory.map(candle => candle.close);
        
        // 각 이동평균 계산
        const shortMA = this.simpleMovingAverage(closes, short);
        const mediumMA = this.simpleMovingAverage(closes, medium);
        const longMA = this.simpleMovingAverage(closes, long);
        
        const currentPrice = closes[closes.length - 1];
        const currentShortMA = shortMA[shortMA.length - 1];
        const currentMediumMA = mediumMA[mediumMA.length - 1];
        const currentLongMA = longMA[longMA.length - 1];
        
        // 골든크로스/데드크로스 분석
        let signal = 'neutral';
        let crossover = null;
        
        if (shortMA.length >= 2 && mediumMA.length >= 2) {
            const prevShort = shortMA[shortMA.length - 2];
            const prevMedium = mediumMA[mediumMA.length - 2];
            
            // 골든크로스 (단기가 중기를 상향 돌파)
            if (prevShort <= prevMedium && currentShortMA > currentMediumMA) {
                signal = 'golden_cross';
                crossover = 'bullish';
            }
            // 데드크로스 (단기가 중기를 하향 돌파)  
            else if (prevShort >= prevMedium && currentShortMA < currentMediumMA) {
                signal = 'dead_cross';
                crossover = 'bearish';
            }
        }
        
        // 정렬 분석 (상승/하락 정렬)
        let alignment = 'mixed';
        if (currentShortMA > currentMediumMA && currentMediumMA > currentLongMA) {
            alignment = 'bullish'; // 상승 정렬
        } else if (currentShortMA < currentMediumMA && currentMediumMA < currentLongMA) {
            alignment = 'bearish'; // 하락 정렬
        }
        
        return {
            mas: {
                short: { period: short, value: currentShortMA, history: shortMA.slice(-5) },
                medium: { period: medium, value: currentMediumMA, history: mediumMA.slice(-5) },
                long: { period: long, value: currentLongMA, history: longMA.slice(-5) }
            },
            signal,
            crossover,
            alignment,
            currentPrice,
            pricePosition: {
                aboveShort: currentPrice > currentShortMA,
                aboveMedium: currentPrice > currentMediumMA,
                aboveLong: currentPrice > currentLongMA
            }
        };
    }
    
    // 📊 볼린저 밴드 계산
    calculateBollingerBands(period = this.settings.bb.period, stdDev = this.settings.bb.stdDev) {
        if (this.candleHistory.length < period) {
            return { bb: null, signal: 'insufficient_data' };
        }
        
        const closes = this.candleHistory.map(candle => candle.close);
        const sma = this.simpleMovingAverage(closes, period);
        
        const bands = [];
        
        for (let i = period - 1; i < closes.length; i++) {
            const periodCloses = closes.slice(i - period + 1, i + 1);
            const mean = sma[i - period + 1];
            
            // 표준편차 계산
            const variance = periodCloses.reduce((sum, close) => sum + Math.pow(close - mean, 2), 0) / period;
            const standardDeviation = Math.sqrt(variance);
            
            bands.push({
                middle: mean,
                upper: mean + (standardDeviation * stdDev),
                lower: mean - (standardDeviation * stdDev),
                bandwidth: (standardDeviation * stdDev * 2) / mean * 100
            });
        }
        
        const currentBand = bands[bands.length - 1];
        const currentPrice = closes[closes.length - 1];
        
        // 시그널 분석
        let signal = 'neutral';
        let position = 'middle';
        
        if (currentPrice >= currentBand.upper) {
            signal = 'overbought';
            position = 'upper';
        } else if (currentPrice <= currentBand.lower) {
            signal = 'oversold';
            position = 'lower';
        }
        
        // 밴드 폭 분석 (변동성)
        const avgBandwidth = bands.slice(-10).reduce((sum, band) => sum + band.bandwidth, 0) / Math.min(10, bands.length);
        const volatility = currentBand.bandwidth > avgBandwidth ? 'high' : 'low';
        
        return {
            bb: currentBand,
            signal,
            position,
            volatility,
            currentPrice,
            history: bands.slice(-5)
        };
    }
    
    // 📊 거래량 분석
    calculateVolumeAnalysis() {
        if (this.candleHistory.length < this.settings.volume.maPeriod) {
            return { volume: null, signal: 'insufficient_data' };
        }
        
        const volumes = this.candleHistory.map(candle => candle.volume);
        const volumeMA = this.simpleMovingAverage(volumes, this.settings.volume.maPeriod);
        
        const currentVolume = volumes[volumes.length - 1];
        const currentVolumeMA = volumeMA[volumeMA.length - 1];
        const volumeRatio = currentVolume / currentVolumeMA;
        
        // 가격과 거래량 관계 분석
        const recentCandles = this.candleHistory.slice(-5);
        const priceVolumeCorrelation = this.calculatePriceVolumeCorrelation(recentCandles);
        
        let signal = 'neutral';
        if (volumeRatio >= 2.0) {
            signal = 'volume_spike';
        } else if (volumeRatio <= 0.5) {
            signal = 'volume_dry';
        }
        
        return {
            volume: {
                current: currentVolume,
                ma: currentVolumeMA,
                ratio: volumeRatio
            },
            signal,
            correlation: priceVolumeCorrelation,
            trend: volumeRatio > 1.2 ? 'increasing' : volumeRatio < 0.8 ? 'decreasing' : 'stable'
        };
    }
    
    // 🔄 단순 이동평균 계산 헬퍼
    simpleMovingAverage(data, period) {
        const result = [];
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((sum, val) => sum + val, 0);
            result.push(sum / period);
        }
        return result;
    }
    
    // 📊 가격-거래량 상관관계 계산
    calculatePriceVolumeCorrelation(candles) {
        if (candles.length < 3) return 0;
        
        const priceChanges = [];
        const volumeChanges = [];
        
        for (let i = 1; i < candles.length; i++) {
            const priceChange = (candles[i].close - candles[i-1].close) / candles[i-1].close;
            const volumeChange = (candles[i].volume - candles[i-1].volume) / candles[i-1].volume;
            
            priceChanges.push(priceChange);
            volumeChanges.push(volumeChange);
        }
        
        // 피어슨 상관계수 계산
        const n = priceChanges.length;
        const sumX = priceChanges.reduce((sum, x) => sum + x, 0);
        const sumY = volumeChanges.reduce((sum, y) => sum + y, 0);
        const sumXY = priceChanges.reduce((sum, x, i) => sum + x * volumeChanges[i], 0);
        const sumX2 = priceChanges.reduce((sum, x) => sum + x * x, 0);
        const sumY2 = volumeChanges.reduce((sum, y) => sum + y * y, 0);
        
        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        
        return denominator === 0 ? 0 : numerator / denominator;
    }
    
    // 🎯 종합 기술적 분석
    async performFullAnalysis() {
        console.log('🎯 페이코인 종합 기술적 분석 시작...\n');
        
        // 캔들 데이터 수집
        const candles = await this.fetchCandleData();
        if (!candles) return null;
        
        // 각 지표 계산
        const rsi = this.calculateRSI();
        const mas = this.calculateMovingAverages();
        const bb = this.calculateBollingerBands();
        const volume = this.calculateVolumeAnalysis();
        
        console.log('📊 기술적 지표 결과:');
        
        // RSI 결과
        if (rsi.rsi) {
            console.log(`\n🎯 RSI (${this.settings.rsi.period}): ${rsi.rsi.toFixed(2)}`);
            console.log(`   시그널: ${this.formatSignal(rsi.signal)}`);
            if (rsi.signal === 'overbought') {
                console.log(`   ⚠️  과매수 구간 (${this.settings.rsi.overbought} 이상)`);
            } else if (rsi.signal === 'oversold') {
                console.log(`   💎 과매도 구간 (${this.settings.rsi.oversold} 이하)`);
            }
        }
        
        // 이동평균 결과
        if (mas.mas) {
            console.log(`\n📈 이동평균선:`);
            console.log(`   단기(${mas.mas.short.period}일): ${mas.mas.short.value.toFixed(2)}원`);
            console.log(`   중기(${mas.mas.medium.period}일): ${mas.mas.medium.value.toFixed(2)}원`);
            console.log(`   장기(${mas.mas.long.period}일): ${mas.mas.long.value.toFixed(2)}원`);
            console.log(`   현재가: ${mas.currentPrice.toFixed(2)}원`);
            console.log(`   정렬: ${this.formatAlignment(mas.alignment)}`);
            if (mas.signal !== 'neutral') {
                console.log(`   🎯 ${mas.signal === 'golden_cross' ? '골든크로스 발생!' : '데드크로스 발생!'}`);
            }
        }
        
        // 볼린저 밴드 결과
        if (bb.bb) {
            console.log(`\n📊 볼린저 밴드:`);
            console.log(`   상단: ${bb.bb.upper.toFixed(2)}원`);
            console.log(`   중간: ${bb.bb.middle.toFixed(2)}원`);
            console.log(`   하단: ${bb.bb.lower.toFixed(2)}원`);
            console.log(`   현재가: ${bb.currentPrice.toFixed(2)}원 (${bb.position})`);
            console.log(`   변동성: ${bb.volatility} (밴드폭 ${bb.bb.bandwidth.toFixed(2)}%)`);
            if (bb.signal !== 'neutral') {
                console.log(`   🎯 ${bb.signal === 'overbought' ? '상단 밴드 터치 (과매수)' : '하단 밴드 터치 (과매도)'}`);
            }
        }
        
        // 거래량 분석 결과
        if (volume.volume) {
            console.log(`\n📊 거래량 분석:`);
            console.log(`   현재 거래량: ${volume.volume.current.toLocaleString()}`);
            console.log(`   평균 거래량: ${volume.volume.ma.toLocaleString()}`);
            console.log(`   거래량 비율: ${volume.volume.ratio.toFixed(2)}x`);
            console.log(`   거래량 추세: ${this.formatVolumeTrend(volume.trend)}`);
            console.log(`   가격-거래량 상관관계: ${volume.correlation.toFixed(3)}`);
            if (volume.signal !== 'neutral') {
                console.log(`   🎯 ${volume.signal === 'volume_spike' ? '거래량 급증!' : '거래량 감소'}`);
            }
        }
        
        // 종합 판단
        const overallSignal = this.generateOverallSignal(rsi, mas, bb, volume);
        console.log(`\n🎯 종합 판단: ${this.formatOverallSignal(overallSignal)}`);
        
        return {
            timestamp: Date.now(),
            rsi,
            movingAverages: mas,
            bollingerBands: bb,
            volumeAnalysis: volume,
            overallSignal
        };
    }
    
    // 🎯 종합 시그널 생성
    generateOverallSignal(rsi, mas, bb, volume) {
        let bullishSignals = 0;
        let bearishSignals = 0;
        let totalSignals = 0;
        
        // RSI 시그널
        if (rsi.signal === 'oversold') bullishSignals++;
        else if (rsi.signal === 'overbought') bearishSignals++;
        if (rsi.signal !== 'insufficient_data') totalSignals++;
        
        // 이동평균 시그널
        if (mas.signal === 'golden_cross' || mas.alignment === 'bullish') bullishSignals++;
        else if (mas.signal === 'dead_cross' || mas.alignment === 'bearish') bearishSignals++;
        if (mas.signal !== 'insufficient_data') totalSignals++;
        
        // 볼린저 밴드 시그널
        if (bb.signal === 'oversold') bullishSignals++;
        else if (bb.signal === 'overbought') bearishSignals++;
        if (bb.signal !== 'insufficient_data') totalSignals++;
        
        // 거래량 시그널
        if (volume.signal === 'volume_spike' && volume.correlation > 0) bullishSignals++;
        else if (volume.signal === 'volume_spike' && volume.correlation < 0) bearishSignals++;
        if (volume.signal !== 'insufficient_data') totalSignals++;
        
        // 종합 판단
        const bullishRatio = bullishSignals / totalSignals;
        const bearishRatio = bearishSignals / totalSignals;
        
        if (bullishRatio >= 0.6) return 'strong_bullish';
        else if (bullishRatio >= 0.4) return 'bullish';
        else if (bearishRatio >= 0.6) return 'strong_bearish';
        else if (bearishRatio >= 0.4) return 'bearish';
        else return 'neutral';
    }
    
    // 포맷팅 헬퍼 함수들
    formatSignal(signal) {
        const signals = {
            'overbought': '🔴 과매수',
            'oversold': '🟢 과매도',
            'neutral': '🟡 중립',
            'golden_cross': '🟢 골든크로스',
            'dead_cross': '🔴 데드크로스',
            'volume_spike': '📈 거래량 급증',
            'volume_dry': '📉 거래량 감소',
            'insufficient_data': '❓ 데이터 부족'
        };
        return signals[signal] || signal;
    }
    
    formatAlignment(alignment) {
        const alignments = {
            'bullish': '🟢 상승 정렬',
            'bearish': '🔴 하락 정렬',
            'mixed': '🟡 혼재'
        };
        return alignments[alignment] || alignment;
    }
    
    formatVolumeTrend(trend) {
        const trends = {
            'increasing': '📈 증가',
            'decreasing': '📉 감소',
            'stable': '🟡 안정'
        };
        return trends[trend] || trend;
    }
    
    formatOverallSignal(signal) {
        const signals = {
            'strong_bullish': '🚀 강한 상승',
            'bullish': '📈 상승',
            'neutral': '🟡 중립',
            'bearish': '📉 하락',
            'strong_bearish': '💀 강한 하락'
        };
        return signals[signal] || signal;
    }
}

module.exports = PaycoinTechnicalIndicators;