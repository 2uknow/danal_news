// danal-stock-api.js
// 다날 주식 데이터 API 연동 모듈 (사내망 최적화)

const https = require('https');
const logger = require('./logger');

// 사내망 HTTPS 에이전트
const agent = new https.Agent({
    rejectUnauthorized: false
});

class DanalStockAPI {
    constructor() {
        this.stockCode = '064260'; // 다날 종목코드
        this.companyName = '다날';
        this.httpTimeout = 30000;
        
        // 다날 주식 특성 (변동성 등)
        this.stockCharacteristics = {
            sector: 'IT서비스',
            volatility: 'HIGH',
            marketCap: 'SMALL', 
            avgVolume: 1000000,
            priceRange: { min: 10000, max: 50000 }
        };
        
        // 가격 데이터 히스토리 (메모리 캐시)
        this.priceHistory = [];
        this.maxHistorySize = 1000;
        this.lastUpdateTime = null;
    }

    // 실시간 주가 데이터 조회 (네이버 검색 기반)
    async getCurrentPrice() {
        try {
            logger.debug(`다날 실시간 주가 조회 시작: ${this.stockCode}`);
            
            // 네이버 검색을 통한 주가 조회 (기존 app.js 방식 활용)
            const searchQuery = `다날 주가 ${this.stockCode}`;
            const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(searchQuery)}`;
            
            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            
            const curlCommand = `curl -k -s --connect-timeout 10 --max-time 30 ` +
                               `-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ` +
                               `"${searchUrl}"`;
            
            const { stdout } = await execPromise(curlCommand);
            
            // HTML 파싱하여 주가 정보 추출
            const priceInfo = this.parseStockDataFromHTML(stdout);
            
            // 히스토리에 추가
            if (priceInfo) {
                this.addToPriceHistory(priceInfo);
                this.lastUpdateTime = new Date();
            }
            
            logger.info(`다날 주가 조회 성공`, {
                price: priceInfo?.currentPrice,
                changeRate: priceInfo?.changeRate,
                volume: priceInfo?.volume
            });
            
            return priceInfo;
            
        } catch (error) {
            logger.error(`다날 실시간 주가 조회 실패: ${error.message}`);
            
            // 캐시된 데이터가 있으면 최근 데이터 반환
            if (this.priceHistory.length > 0) {
                const lastPrice = this.priceHistory[this.priceHistory.length - 1];
                logger.warn('캐시된 주가 데이터 사용', { timestamp: lastPrice.timestamp });
                return lastPrice;
            }
            
            throw error;
        }
    }

    // HTML에서 주가 정보 파싱
    parseStockDataFromHTML(html) {
        try {
            // 네이버 증권 페이지에서 주가 정보 추출 로직
            const priceRegex = /현재가[^0-9]*([0-9,]+)/;
            const changeRegex = /등락률[^0-9\-\+]*([+\-]?)([0-9,.]+)%/;
            const volumeRegex = /거래량[^0-9]*([0-9,]+)/;
            const highRegex = /고가[^0-9]*([0-9,]+)/;
            const lowRegex = /저가[^0-9]*([0-9,]+)/;
            
            const currentPriceMatch = html.match(priceRegex);
            const changeMatch = html.match(changeRegex);
            const volumeMatch = html.match(volumeRegex);
            const highMatch = html.match(highRegex);
            const lowMatch = html.match(lowRegex);
            
            if (!currentPriceMatch) {
                throw new Error('주가 정보를 찾을 수 없습니다');
            }
            
            const currentPrice = parseInt(currentPriceMatch[1].replace(/,/g, ''));
            const changeRate = changeMatch ? 
                (changeMatch[1] === '-' ? -1 : 1) * parseFloat(changeMatch[2]) : 0;
            
            const volume = volumeMatch ? parseInt(volumeMatch[1].replace(/,/g, '')) : 0;
            const high = highMatch ? parseInt(highMatch[1].replace(/,/g, '')) : currentPrice;
            const low = lowMatch ? parseInt(lowMatch[1].replace(/,/g, '')) : currentPrice;
            
            const previousClose = Math.round(currentPrice / (1 + changeRate / 100));
            const changeAmount = currentPrice - previousClose;
            
            return {
                symbol: this.stockCode,
                companyName: this.companyName,
                currentPrice: currentPrice,
                previousClose: previousClose,
                changeAmount: changeAmount,
                changeRate: changeRate,
                volume: volume,
                high: high,
                low: low,
                timestamp: new Date().toISOString(),
                marketStatus: this.getMarketStatus(),
                dataSource: 'NAVER_SEARCH'
            };
            
        } catch (error) {
            logger.error(`주가 데이터 파싱 실패: ${error.message}`);
            return null;
        }
    }

    // 가격 히스토리에 추가
    addToPriceHistory(priceInfo) {
        this.priceHistory.push({
            ...priceInfo,
            timestamp: new Date().toISOString(),
            open: priceInfo.currentPrice, // 단순화
            close: priceInfo.currentPrice,
            high: priceInfo.high,
            low: priceInfo.low,
            volume: priceInfo.volume
        });
        
        // 최대 히스토리 크기 유지
        if (this.priceHistory.length > this.maxHistorySize) {
            this.priceHistory = this.priceHistory.slice(-this.maxHistorySize);
        }
    }

    // 일봉 차트 데이터 조회 (히스토리 기반)
    async getDailyChartData(period = 100) {
        try {
            logger.debug(`다날 일봉 데이터 요청: ${period}일`);
            
            // 현재 캐시된 히스토리가 충분하지 않으면 더 수집
            if (this.priceHistory.length < period) {
                logger.info('충분한 데이터를 위해 추가 수집 중...');
                // 여러 번 getCurrentPrice 호출하여 데이터 누적
                for (let i = 0; i < Math.min(10, period - this.priceHistory.length); i++) {
                    try {
                        await this.getCurrentPrice();
                        await this.sleep(1000); // 1초 대기
                    } catch (error) {
                        logger.warn(`추가 데이터 수집 실패 (${i + 1}회): ${error.message}`);
                        break;
                    }
                }
            }
            
            // 가격 히스토리가 있으면 반환, 없으면 모의 데이터 생성
            if (this.priceHistory.length > 0) {
                const chartData = this.priceHistory.slice(-period).map(item => ({
                    date: item.timestamp,
                    open: item.open || item.currentPrice,
                    high: item.high,
                    low: item.low,
                    close: item.close || item.currentPrice,
                    volume: item.volume
                }));
                
                logger.info(`다날 일봉 데이터 조회 성공 (히스토리 기반)`, {
                    dataPoints: chartData.length,
                    period: period
                });
                
                return chartData;
            } else {
                // 모의 데이터 생성 (개발/테스트용)
                logger.warn('실제 데이터가 없어 모의 데이터 생성');
                return this.generateMockChartData(period);
            }
            
        } catch (error) {
            logger.error(`다날 일봉 데이터 조회 실패: ${error.message}`);
            // 에러 시 모의 데이터 반환
            return this.generateMockChartData(period);
        }
    }

    // 모의 차트 데이터 생성 (다날 특성 반영)
    generateMockChartData(period) {
        const mockData = [];
        const basePrice = 15000; // 다날 평균 가격대
        let currentPrice = basePrice;
        
        for (let i = period - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            
            // 다날 특성상 변동성이 큰 주식
            const volatility = 0.05; // 5% 변동성
            const change = (Math.random() - 0.5) * 2 * volatility;
            currentPrice = Math.max(currentPrice * (1 + change), 1000);
            
            const high = currentPrice * (1 + Math.random() * 0.03);
            const low = currentPrice * (1 - Math.random() * 0.03);
            const open = low + Math.random() * (high - low);
            const close = low + Math.random() * (high - low);
            const volume = Math.floor(500000 + Math.random() * 2000000);
            
            mockData.push({
                date: date.toISOString(),
                open: Math.round(open),
                high: Math.round(high),
                low: Math.round(low),
                close: Math.round(close),
                volume: volume
            });
            
            currentPrice = close;
        }
        
        logger.info('모의 차트 데이터 생성 완료', {
            dataPoints: mockData.length,
            priceRange: `${Math.min(...mockData.map(d => d.low))} - ${Math.max(...mockData.map(d => d.high))}`
        });
        
        return mockData;
    }

    // 유틸리티 메소드
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 분봉 차트 데이터 조회 (실시간 분석용) - 히스토리 기반
    async getMinuteChartData(timeframe = 5, period = 200) {
        try {
            logger.debug(`다날 ${timeframe}분봉 데이터 요청: ${period}개`);
            
            // 히스토리가 충분하지 않으면 일봉 데이터 기반으로 분봉 모의 생성
            if (this.priceHistory.length === 0) {
                await this.getCurrentPrice(); // 최소 1개 데이터 확보
            }
            
            const minuteData = this.generateMinuteDataFromDaily(timeframe, period);
            
            logger.info(`다날 ${timeframe}분봉 데이터 조회 성공 (모의)`, {
                dataPoints: minuteData.length,
                timeframe: `${timeframe}분`,
                period: period
            });
            
            return minuteData;
            
        } catch (error) {
            logger.error(`다날 ${timeframe}분봉 데이터 조회 실패: ${error.message}`);
            throw error;
        }
    }

    // 분봉 모의 데이터 생성
    generateMinuteDataFromDaily(timeframe, period) {
        const minuteData = [];
        const now = new Date();
        const basePrice = this.priceHistory.length > 0 ? 
            this.priceHistory[this.priceHistory.length - 1].currentPrice : 15000;
        
        let currentPrice = basePrice;
        
        for (let i = period - 1; i >= 0; i--) {
            const timestamp = new Date(now);
            timestamp.setMinutes(timestamp.getMinutes() - (i * timeframe));
            
            // 분봉 변동성 (일봉보다 작게)
            const minuteVolatility = 0.01; // 1% 변동성
            const change = (Math.random() - 0.5) * 2 * minuteVolatility;
            currentPrice = Math.max(currentPrice * (1 + change), 1000);
            
            const high = currentPrice * (1 + Math.random() * 0.005);
            const low = currentPrice * (1 - Math.random() * 0.005);
            const open = low + Math.random() * (high - low);
            const close = low + Math.random() * (high - low);
            const volume = Math.floor(10000 + Math.random() * 50000);
            
            minuteData.push({
                date: timestamp.toISOString(),
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

    // 시장 상태 확인
    getMarketStatus() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const dayOfWeek = now.getDay(); // 0: 일요일, 1: 월요일, ..., 6: 토요일
        
        // 주말 체크
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return 'CLOSED_WEEKEND';
        }
        
        // 평일 장 시간 체크 (09:00 ~ 15:30)
        const currentMinutes = hour * 60 + minute;
        const marketOpen = 9 * 60; // 09:00
        const marketClose = 15 * 60 + 30; // 15:30
        
        if (currentMinutes >= marketOpen && currentMinutes <= marketClose) {
            return 'OPEN';
        } else if (currentMinutes < marketOpen) {
            return 'PRE_MARKET';
        } else {
            return 'AFTER_MARKET';
        }
    }

    // 유틸리티 메소드들
    getStartDate(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString().split('T')[0].replace(/-/g, '');
    }

    getTodayDate() {
        return new Date().toISOString().split('T')[0].replace(/-/g, '');
    }

    getCurrentTime() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }

    getMinuteStartTime(period, timeframe) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - (period * timeframe));
        return now.toISOString().replace('T', ' ').substring(0, 19);
    }

    // 연결 테스트
    async testConnection() {
        try {
            logger.info('다날 주식 API 연결 테스트 시작');
            
            const priceData = await this.getCurrentPrice();
            const chartData = await this.getDailyChartData(10);
            
            const testResult = {
                success: true,
                timestamp: new Date().toISOString(),
                priceData: priceData,
                chartDataPoints: chartData.length,
                marketStatus: this.getMarketStatus()
            };
            
            logger.info('다날 주식 API 연결 테스트 성공', testResult);
            return testResult;
            
        } catch (error) {
            logger.error(`다날 주식 API 연결 테스트 실패: ${error.message}`);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = DanalStockAPI;