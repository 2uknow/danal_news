// danal-stock-api-yahoo.js  
// 다날 주식 데이터 API - Yahoo Finance 사용

const https = require('https');
const logger = require('./logger');

// 사내망 HTTPS 에이전트
const agent = new https.Agent({
    rejectUnauthorized: false
});

class DanalStockAPIYahoo {
    constructor() {
        this.stockCode = '064260'; // 다날 종목코드
        this.yahooSymbol = '064260.KS'; // Yahoo Finance 심볼
        this.companyName = '다날';
        this.httpTimeout = 30000;
        
        // 다날 주식 특성
        this.stockCharacteristics = {
            sector: 'IT서비스',
            volatility: 'HIGH',
            marketCap: 'SMALL',
            avgVolume: 1000000,
            priceRange: { min: 2000, max: 10000 }
        };
        
        // 가격 데이터 히스토리
        this.priceHistory = [];
        this.maxHistorySize = 1000;
        this.lastUpdateTime = null;
    }

    // 실시간 주가 데이터 조회 (Yahoo Finance)
    async getCurrentPrice() {
        try {
            logger.debug(`다날 Yahoo Finance 주가 조회: ${this.yahooSymbol}`);
            
            const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${this.yahooSymbol}?range=1d&interval=1d`;
            
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            
            const curlCommand = `curl -k -s --connect-timeout 15 --max-time 30 ` +
                               `-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ` +
                               `-H "Accept: application/json" ` +
                               `"${chartUrl}"`;
            
            const { stdout } = await execPromise(curlCommand);
            
            if (!stdout || stdout.length === 0) {
                throw new Error('Yahoo Finance 응답 없음');
            }
            
            // JSON 파싱
            const data = JSON.parse(stdout);
            
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                throw new Error('Yahoo Finance 차트 데이터 없음');
            }
            
            const result = data.chart.result[0];
            const meta = result.meta;
            
            if (!meta) {
                throw new Error('Yahoo Finance 메타 데이터 없음');
            }
            
            // 현재가 정보 추출
            const currentPrice = meta.regularMarketPrice || meta.previousClose;
            const previousClose = meta.previousClose;
            const changeAmount = currentPrice - previousClose;
            const changeRate = ((changeAmount / previousClose) * 100);
            
            // 고가/저가 정보
            const dayHigh = meta.regularMarketDayHigh || currentPrice;
            const dayLow = meta.regularMarketDayLow || currentPrice;
            
            // 거래량 정보 (최신 데이터에서 추출)
            let volume = 0;
            if (result.indicators && result.indicators.quote && result.indicators.quote[0].volume) {
                const volumes = result.indicators.quote[0].volume.filter(v => v != null);
                volume = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
            }
            
            const priceInfo = {
                symbol: this.stockCode,
                yahooSymbol: this.yahooSymbol,
                companyName: this.companyName,
                currentPrice: Math.round(currentPrice),
                previousClose: Math.round(previousClose),
                changeAmount: Math.round(changeAmount),
                changeRate: parseFloat(changeRate.toFixed(2)),
                high: Math.round(dayHigh),
                low: Math.round(dayLow),
                volume: volume,
                currency: meta.currency || 'KRW',
                exchangeName: meta.exchangeName || 'KOE',
                timestamp: new Date().toISOString(),
                marketStatus: this.getMarketStatus(),
                dataSource: 'YAHOO_FINANCE'
            };
            
            // 히스토리에 추가
            this.addToPriceHistory(priceInfo);
            this.lastUpdateTime = new Date();
            
            logger.info('다날 Yahoo Finance 주가 조회 성공', {
                price: priceInfo.currentPrice,
                changeRate: priceInfo.changeRate,
                volume: priceInfo.volume,
                source: 'Yahoo Finance'
            });
            
            return priceInfo;
            
        } catch (error) {
            logger.error(`다날 Yahoo Finance 주가 조회 실패: ${error.message}`);
            
            // 캐시된 데이터 반환
            if (this.priceHistory.length > 0) {
                const lastPrice = this.priceHistory[this.priceHistory.length - 1];
                logger.warn('캐시된 주가 데이터 사용', { timestamp: lastPrice.timestamp });
                return lastPrice;
            }
            
            throw error;
        }
    }

    // 일봉 차트 데이터 조회 (Yahoo Finance)
    async getDailyChartData(period = 100) {
        try {
            logger.debug(`다날 Yahoo Finance 일봉 데이터 요청: ${period}일`);
            
            // period를 Yahoo Finance 형식으로 변환
            let range = '1y'; // 기본값
            if (period <= 5) range = '5d';
            else if (period <= 30) range = '1mo';
            else if (period <= 90) range = '3mo';
            else if (period <= 180) range = '6mo';
            else if (period <= 365) range = '1y';
            else range = '2y';
            
            const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${this.yahooSymbol}?range=${range}&interval=1d`;
            
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            
            const curlCommand = `curl -k -s --connect-timeout 15 --max-time 30 ` +
                               `-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ` +
                               `-H "Accept: application/json" ` +
                               `"${chartUrl}"`;
            
            const { stdout } = await execPromise(curlCommand);
            const data = JSON.parse(stdout);
            
            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                throw new Error('Yahoo Finance 차트 데이터 없음');
            }
            
            const result = data.chart.result[0];
            const timestamps = result.timestamp;
            const indicators = result.indicators.quote[0];
            
            if (!timestamps || !indicators) {
                throw new Error('Yahoo Finance 시계열 데이터 없음');
            }
            
            // 차트 데이터 구성
            const chartData = [];
            for (let i = 0; i < timestamps.length; i++) {
                const timestamp = timestamps[i];
                const open = indicators.open[i];
                const high = indicators.high[i];
                const low = indicators.low[i];
                const close = indicators.close[i];
                const volume = indicators.volume[i];
                
                // null 값 체크
                if (open != null && high != null && low != null && close != null) {
                    chartData.push({
                        date: new Date(timestamp * 1000).toISOString(),
                        timestamp: timestamp,
                        open: Math.round(open),
                        high: Math.round(high),
                        low: Math.round(low),
                        close: Math.round(close),
                        volume: volume || 0
                    });
                }
            }
            
            // 최신 N개만 반환
            const recentData = chartData.slice(-period);
            
            logger.info(`다날 Yahoo Finance 일봉 데이터 조회 성공`, {
                totalPoints: chartData.length,
                returnedPoints: recentData.length,
                period: period,
                range: range,
                startDate: recentData[0]?.date,
                endDate: recentData[recentData.length - 1]?.date
            });
            
            return recentData;
            
        } catch (error) {
            logger.error(`다날 Yahoo Finance 일봉 데이터 조회 실패: ${error.message}`);
            
            // 캐시된 히스토리가 있으면 반환
            if (this.priceHistory.length > 0) {
                const chartData = this.priceHistory.slice(-period).map(item => ({
                    date: item.timestamp,
                    open: item.currentPrice,
                    high: item.high,
                    low: item.low,
                    close: item.currentPrice,
                    volume: item.volume
                }));
                
                logger.warn('캐시된 히스토리로 차트 데이터 생성', { points: chartData.length });
                return chartData;
            }
            
            // 마지막 대안: 모의 데이터
            logger.warn('모의 차트 데이터 생성');
            return this.generateMockChartData(period);
        }
    }

    // 분봉 데이터 조회 (Yahoo Finance - 제한적)
    async getMinuteChartData(timeframe = 5, period = 200) {
        try {
            logger.debug(`다날 Yahoo Finance 분봉 데이터 요청: ${timeframe}분, ${period}개`);
            
            // Yahoo Finance는 분봉 데이터가 제한적이므로 일봉 기반으로 분봉 모의 생성
            const dailyData = await this.getDailyChartData(5); // 최근 5일
            
            if (dailyData && dailyData.length > 0) {
                const minuteData = this.generateMinuteDataFromDaily(dailyData, timeframe, period);
                
                logger.info(`다날 Yahoo Finance 분봉 데이터 생성 완료`, {
                    timeframe: `${timeframe}분`,
                    dataPoints: minuteData.length
                });
                
                return minuteData;
            } else {
                throw new Error('일봉 데이터를 기반으로 분봉 데이터를 생성할 수 없음');
            }
            
        } catch (error) {
            logger.error(`다날 Yahoo Finance 분봉 데이터 조회 실패: ${error.message}`);
            return this.generateMockMinuteData(timeframe, period);
        }
    }

    // 일봉 기반 분봉 모의 데이터 생성
    generateMinuteDataFromDaily(dailyData, timeframe, period) {
        const minuteData = [];
        const latestDaily = dailyData[dailyData.length - 1];
        
        if (!latestDaily) return [];
        
        const basePrice = latestDaily.close;
        const dailyRange = latestDaily.high - latestDaily.low;
        const minuteVolatility = dailyRange * 0.001; // 일간 변동폭의 0.1%
        
        let currentPrice = basePrice;
        const now = new Date();
        
        for (let i = period - 1; i >= 0; i--) {
            const timestamp = new Date(now);
            timestamp.setMinutes(timestamp.getMinutes() - (i * timeframe));
            
            // 미세한 변동 적용
            const change = (Math.random() - 0.5) * minuteVolatility;
            currentPrice = Math.max(currentPrice + change, latestDaily.low * 0.95);
            currentPrice = Math.min(currentPrice, latestDaily.high * 1.05);
            
            const high = currentPrice + (Math.random() * minuteVolatility * 0.5);
            const low = currentPrice - (Math.random() * minuteVolatility * 0.5);
            const open = low + Math.random() * (high - low);
            const close = low + Math.random() * (high - low);
            const volume = Math.floor((latestDaily.volume / 100) + Math.random() * (latestDaily.volume / 50));
            
            minuteData.push({
                date: timestamp.toISOString(),
                timestamp: Math.floor(timestamp.getTime() / 1000),
                open: Math.round(open),
                high: Math.round(high),
                low: Math.round(low),
                close: Math.round(close),
                volume: volume
            });
            
            currentPrice = close;
        }
        
        return minuteData;
    }

    // 가격 히스토리에 추가
    addToPriceHistory(priceInfo) {
        this.priceHistory.push({
            ...priceInfo,
            timestamp: new Date().toISOString(),
            open: priceInfo.currentPrice,
            close: priceInfo.currentPrice,
            high: priceInfo.high,
            low: priceInfo.low,
            volume: priceInfo.volume
        });
        
        if (this.priceHistory.length > this.maxHistorySize) {
            this.priceHistory = this.priceHistory.slice(-this.maxHistorySize);
        }
    }

    // 시장 상태 확인
    getMarketStatus() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const dayOfWeek = now.getDay();
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return 'CLOSED_WEEKEND';
        }
        
        const currentMinutes = hour * 60 + minute;
        const marketOpen = 9 * 60;
        const marketClose = 15 * 60 + 30;
        
        if (currentMinutes >= marketOpen && currentMinutes <= marketClose) {
            return 'OPEN';
        } else if (currentMinutes < marketOpen) {
            return 'PRE_MARKET';
        } else {
            return 'AFTER_MARKET';
        }
    }

    // 모의 차트 데이터 생성 (백업용)
    generateMockChartData(period) {
        const mockData = [];
        const basePrice = 3815; // Yahoo Finance에서 확인된 현재가
        let currentPrice = basePrice;
        
        for (let i = period - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            const volatility = 0.03; // 3% 변동성
            const change = (Math.random() - 0.5) * 2 * volatility;
            currentPrice = Math.max(currentPrice * (1 + change), 1000);
            
            const high = currentPrice * (1 + Math.random() * 0.02);
            const low = currentPrice * (1 - Math.random() * 0.02);
            const open = low + Math.random() * (high - low);
            const close = low + Math.random() * (high - low);
            const volume = Math.floor(800000 + Math.random() * 1500000);
            
            mockData.push({
                date: date.toISOString(),
                timestamp: Math.floor(date.getTime() / 1000),
                open: Math.round(open),
                high: Math.round(high),
                low: Math.round(low),
                close: Math.round(close),
                volume: volume
            });
            
            currentPrice = close;
        }
        
        return mockData;
    }

    // 모의 분봉 데이터 생성
    generateMockMinuteData(timeframe, period) {
        const mockData = [];
        const basePrice = 3815;
        let currentPrice = basePrice;
        const now = new Date();
        
        for (let i = period - 1; i >= 0; i--) {
            const timestamp = new Date(now);
            timestamp.setMinutes(timestamp.getMinutes() - (i * timeframe));
            
            const volatility = 0.005; // 0.5% 변동성
            const change = (Math.random() - 0.5) * 2 * volatility;
            currentPrice = Math.max(currentPrice * (1 + change), basePrice * 0.95);
            currentPrice = Math.min(currentPrice, basePrice * 1.05);
            
            const high = currentPrice * (1 + Math.random() * 0.003);
            const low = currentPrice * (1 - Math.random() * 0.003);
            const open = low + Math.random() * (high - low);
            const close = low + Math.random() * (high - low);
            const volume = Math.floor(5000 + Math.random() * 25000);
            
            mockData.push({
                date: timestamp.toISOString(),
                timestamp: Math.floor(timestamp.getTime() / 1000),
                open: Math.round(open),
                high: Math.round(high),
                low: Math.round(low),
                close: Math.round(close),
                volume: volume
            });
            
            currentPrice = close;
        }
        
        return mockData;
    }

    // 연결 테스트
    async testConnection() {
        try {
            logger.info('다날 Yahoo Finance API 연결 테스트 시작');
            
            const priceData = await this.getCurrentPrice();
            const chartData = await this.getDailyChartData(10);
            
            const testResult = {
                success: true,
                timestamp: new Date().toISOString(),
                priceData: priceData,
                chartDataPoints: chartData.length,
                marketStatus: this.getMarketStatus(),
                dataSource: 'Yahoo Finance'
            };
            
            logger.info('다날 Yahoo Finance API 연결 테스트 성공', testResult);
            return testResult;
            
        } catch (error) {
            logger.error(`다날 Yahoo Finance API 연결 테스트 실패: ${error.message}`);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // 유틸리티
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = DanalStockAPIYahoo;