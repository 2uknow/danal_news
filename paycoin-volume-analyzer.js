const fetch = require('node-fetch');
const https = require('https');

// 사내망 HTTPS 에이전트
const agent = new https.Agent({
    rejectUnauthorized: false
});

class PaycoinVolumeAnalyzer {
    constructor() {
        this.volumeHistory = []; // 거래량 히스토리 저장
        this.priceHistory = [];  // 가격 히스토리 저장
        this.maxHistorySize = 100; // 최대 100개 데이터 보관
        
        // 알림 설정
        this.alertThresholds = {
            volumeSpike: 3.0,      // 평균 대비 3배 이상
            priceChange: 0.05,     // 5% 이상 변동
            consecutiveSpikes: 3,   // 연속 급증 횟수
            minVolume: 1000000     // 최소 거래량 (100만개)
        };
        
        // 상태 변수
        this.lastAlert = 0;
        this.alertCooldown = 30 * 60 * 1000; // 30분 알림 쿨다운
        this.consecutiveSpikeCount = 0;
    }
    
    // 🪙 빗썸에서 페이코인 데이터 가져오기
    async fetchPaycoinData() {
        try {
            console.log('📊 페이코인 데이터 수집 중...');
            
            // 현재가 및 거래량
            const tickerResponse = await fetch('https://api.bithumb.com/public/ticker/PCI_KRW', {
                method: 'GET',
                agent: agent,
                timeout: 10000
            });
            
            if (!tickerResponse.ok) {
                throw new Error(`API 응답 오류: ${tickerResponse.status}`);
            }
            
            const tickerData = await tickerResponse.json();
            
            if (tickerData.status !== '0000') {
                throw new Error('빗썸 API 오류');
            }
            
            const ticker = tickerData.data;
            const currentTime = Date.now();
            
            const data = {
                timestamp: currentTime,
                price: parseFloat(ticker.closing_price),
                volume24h: parseFloat(ticker.units_traded_24H),
                volumeValue24h: parseFloat(ticker.acc_trade_value_24H),
                changeRate: parseFloat(ticker.fluctate_rate_24H),
                high24h: parseFloat(ticker.max_price),
                low24h: parseFloat(ticker.min_price),
                openPrice: parseFloat(ticker.opening_price)
            };
            
            console.log(`   💰 현재가: ${data.price.toLocaleString()}원`);
            console.log(`   📊 24h 거래량: ${data.volume24h.toLocaleString()} PCI`);
            console.log(`   💵 24h 거래대금: ${(data.volumeValue24h/100000000).toFixed(1)}억원`);
            console.log(`   📈 24h 변동률: ${data.changeRate.toFixed(2)}%`);
            
            return data;
            
        } catch (error) {
            console.error(`❌ 데이터 수집 실패: ${error.message}`);
            return null;
        }
    }
    
    // 📈 거래량 급증 분석
    analyzeVolumeSpike(currentData) {
        console.log('\n🔍 거래량 급증 분석 시작...');
        
        // 히스토리에 현재 데이터 추가
        this.volumeHistory.push({
            timestamp: currentData.timestamp,
            volume: currentData.volume24h,
            price: currentData.price,
            volumeValue: currentData.volumeValue24h
        });
        
        // 히스토리 크기 제한
        if (this.volumeHistory.length > this.maxHistorySize) {
            this.volumeHistory.shift();
        }
        
        // 최소 5개 데이터가 있어야 분석 가능
        if (this.volumeHistory.length < 5) {
            console.log('   ⏳ 분석용 데이터 부족 (최소 5개 필요)');
            return {
                isSpike: false,
                reason: 'insufficient_data',
                confidence: 0
            };
        }
        
        // 평균 거래량 계산 (최근 20개 또는 전체)
        const recentHistory = this.volumeHistory.slice(-20);
        const excludeLatest = recentHistory.slice(0, -1); // 현재 데이터 제외
        const avgVolume = excludeLatest.reduce((sum, item) => sum + item.volume, 0) / excludeLatest.length;
        const maxVolume = Math.max(...excludeLatest.map(item => item.volume));
        const minVolume = Math.min(...excludeLatest.map(item => item.volume));
        
        // 현재 거래량과 평균 비교
        const currentVolume = currentData.volume24h;
        const volumeRatio = currentVolume / avgVolume;
        const volumePercentile = this.calculatePercentile(excludeLatest.map(item => item.volume), currentVolume);
        
        console.log(`   📊 현재 거래량: ${currentVolume.toLocaleString()}`);
        console.log(`   📊 평균 거래량: ${avgVolume.toLocaleString()}`);
        console.log(`   📊 거래량 비율: ${volumeRatio.toFixed(2)}x`);
        console.log(`   📊 거래량 백분위: ${volumePercentile.toFixed(1)}%`);
        
        // 급증 판정 로직
        let isSpike = false;
        let spikeReasons = [];
        let confidence = 0;
        
        // 1. 평균 대비 배수 체크
        if (volumeRatio >= this.alertThresholds.volumeSpike) {
            isSpike = true;
            spikeReasons.push(`평균 대비 ${volumeRatio.toFixed(1)}배 급증`);
            confidence += 30;
        }
        
        // 2. 백분위 체크 (상위 10%)
        if (volumePercentile >= 90) {
            isSpike = true;
            spikeReasons.push(`상위 ${(100-volumePercentile).toFixed(1)}% 거래량`);
            confidence += 25;
        }
        
        // 3. 절대값 체크 (최소 거래량)
        if (currentVolume >= this.alertThresholds.minVolume) {
            confidence += 15;
        }
        
        // 4. 가격 변동과의 연관성
        if (Math.abs(currentData.changeRate) >= this.alertThresholds.priceChange * 100) {
            spikeReasons.push(`가격 ${currentData.changeRate > 0 ? '상승' : '하락'} ${Math.abs(currentData.changeRate).toFixed(2)}%`);
            confidence += 20;
        }
        
        // 5. 연속 급증 체크
        if (isSpike) {
            this.consecutiveSpikeCount++;
            if (this.consecutiveSpikeCount >= this.alertThresholds.consecutiveSpikes) {
                spikeReasons.push(`${this.consecutiveSpikeCount}회 연속 급증`);
                confidence += 10;
            }
        } else {
            this.consecutiveSpikeCount = 0;
        }
        
        confidence = Math.min(confidence, 100);
        
        const result = {
            isSpike,
            volumeRatio,
            volumePercentile,
            confidence,
            reasons: spikeReasons,
            data: {
                currentVolume,
                avgVolume,
                maxVolume,
                minVolume,
                priceChange: currentData.changeRate,
                consecutiveSpikes: this.consecutiveSpikeCount
            }
        };
        
        console.log(`   🎯 급증 판정: ${isSpike ? '✅ 급증 감지' : '❌ 정상 수준'}`);
        if (isSpike) {
            console.log(`   🔍 급증 사유: ${spikeReasons.join(', ')}`);
            console.log(`   📊 신뢰도: ${confidence}%`);
        }
        
        return result;
    }
    
    // 백분위 계산 헬퍼 함수
    calculatePercentile(values, target) {
        const sorted = [...values].sort((a, b) => a - b);
        let count = 0;
        for (let value of sorted) {
            if (value <= target) count++;
            else break;
        }
        return (count / sorted.length) * 100;
    }
    
    // 🚨 알림 생성
    generateAlert(analysisResult, currentData) {
        if (!analysisResult.isSpike) return null;
        
        // 알림 쿨다운 체크
        const now = Date.now();
        if (now - this.lastAlert < this.alertCooldown) {
            console.log('   ⏰ 알림 쿨다운 중 (30분)');
            return null;
        }
        
        const alertLevel = this.getAlertLevel(analysisResult.confidence);
        const emoji = this.getVolumeEmoji(analysisResult.volumeRatio, currentData.changeRate);
        
        const alert = {
            type: 'volume_spike',
            level: alertLevel,
            title: `${emoji} 페이코인 거래량 급증!`,
            message: this.formatAlertMessage(analysisResult, currentData),
            timestamp: now,
            data: {
                ...currentData,
                analysis: analysisResult
            }
        };
        
        this.lastAlert = now;
        console.log(`\n🚨 거래량 급증 알림 생성:`);
        console.log(`   제목: ${alert.title}`);
        console.log(`   레벨: ${alert.level}`);
        
        return alert;
    }
    
    // 알림 레벨 결정
    getAlertLevel(confidence) {
        if (confidence >= 80) return 'critical';
        if (confidence >= 60) return 'high';
        if (confidence >= 40) return 'medium';
        return 'low';
    }
    
    // 거래량 이모지 선택
    getVolumeEmoji(volumeRatio, priceChange) {
        if (volumeRatio >= 5) {
            return priceChange > 0 ? '🚀💥' : '💀⚡';
        } else if (volumeRatio >= 3) {
            return priceChange > 0 ? '🔥📈' : '🥶📉';
        } else {
            return priceChange > 0 ? '⚡📈' : '⚠️📉';
        }
    }
    
    // 알림 메시지 포맷
    formatAlertMessage(analysisResult, currentData) {
        const messages = [];
        
        messages.push(`현재가: ${currentData.price.toLocaleString()}원`);
        messages.push(`24h 변동: ${currentData.changeRate > 0 ? '+' : ''}${currentData.changeRate.toFixed(2)}%`);
        messages.push(`24h 거래량: ${currentData.volume24h.toLocaleString()} PCI`);
        messages.push(`거래량 급증: ${analysisResult.volumeRatio.toFixed(1)}배`);
        
        if (analysisResult.reasons.length > 0) {
            messages.push(`\n🔍 급증 사유:`);
            analysisResult.reasons.forEach(reason => {
                messages.push(`• ${reason}`);
            });
        }
        
        messages.push(`\n신뢰도: ${analysisResult.confidence}%`);
        
        return messages.join('\n');
    }
    
    // 🔄 실시간 모니터링 시작
    async startMonitoring(intervalMinutes = 5) {
        console.log('🎯 페이코인 거래량 모니터링 시작');
        console.log(`📅 체크 간격: ${intervalMinutes}분`);
        console.log(`🚨 급증 기준: 평균 대비 ${this.alertThresholds.volumeSpike}배 이상`);
        console.log(`📊 최소 거래량: ${this.alertThresholds.minVolume.toLocaleString()} PCI`);
        
        const interval = setInterval(async () => {
            try {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`🕐 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} - 페이코인 분석`);
                
                // 데이터 수집
                const currentData = await this.fetchPaycoinData();
                if (!currentData) return;
                
                // 거래량 급증 분석
                const analysisResult = this.analyzeVolumeSpike(currentData);
                
                // 알림 생성
                const alert = this.generateAlert(analysisResult, currentData);
                if (alert) {
                    // 여기서 실제 알림을 보낼 수 있음 (네이버 웍스, 슬랙 등)
                    console.log(`\n🚨 [${alert.level.toUpperCase()}] ${alert.title}`);
                    console.log(alert.message);
                }
                
            } catch (error) {
                console.error(`❌ 모니터링 오류: ${error.message}`);
            }
        }, intervalMinutes * 60 * 1000);
        
        // 첫 번째 실행
        setTimeout(async () => {
            const currentData = await this.fetchPaycoinData();
            if (currentData) {
                this.analyzeVolumeSpike(currentData);
            }
        }, 1000);
        
        return interval;
    }
}

module.exports = PaycoinVolumeAnalyzer;