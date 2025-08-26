// danal-integration.js
// 다날 주식 기술분석 시스템을 기존 app.js에 통합

const DanalStockAPIYahoo = require('./danal-stock-api-yahoo');
const { DanalRealtimePrice } = require('./danal-realtime-price');
const AdvancedTechnicalIndicators = require('./advanced-technical-indicators');
const DanalAlertSystem = require('./danal-alert-system');
const DanalFlexIntegration = require('./danal-flex-integration');

class DanalIntegration {
    constructor(webhookUrl, logger = console) {
        this.stockAPI = new DanalStockAPIYahoo();
        this.realtimeAPI = new DanalRealtimePrice(); // 🚀 실시간 가격 API 추가
        this.technicalIndicators = new AdvancedTechnicalIndicators();
        this.alertSystem = new DanalAlertSystem(logger); // logger 전달
        this.flexIntegration = new DanalFlexIntegration(webhookUrl, logger);
        this.logger = logger;
        
        // 알림 시스템 웹훅 설정
        this.alertSystem.setWebhookUrl(webhookUrl);
        
        // 마지막 분석 시간
        this.lastAnalysisTime = null;
        this.analysisInterval = 5 * 60 * 1000; // 5분
        
        // 다날 전용 모니터링 설정
        this.monitoringConfig = {
            enablePriceAlert: true,        // 가격 알림
            enableTechnicalAlert: true,    // 기술적 지표 알림
            enablePatternAlert: true,      // 패턴 알림
            enableVolumeAlert: true,       // 거래량 알림
            
            // 알림 임계값 (기존 ASSETS_TO_WATCH와 호환)
            spikeThreshold: 3.0,           // 3% 급등락
            trendThreshold: 2.5,           // 2.5% 추세 이탈
            volumeThreshold: 2.0           // 평균 거래량 2배
        };
    }

    // 다날 종합 모니터링 (기존 app.js의 모니터링 사이클에 통합)
    async performDanalMonitoring() {
        try {
            this.logger.info && this.logger.info('🔍 다날 종합 기술분석 시작');
            
            const results = {
                timestamp: new Date().toISOString(),
                price: null,
                technical: null,
                alerts: [],
                errors: []
            };

            // 1. 실시간 주가 데이터 조회 (네이버 금융 API 우선 사용)
            try {
                results.price = await this.realtimeAPI.getCurrentPrice();
                this.logger.info && this.logger.info('다날 실시간 주가 조회 성공', {
                    source: results.price.source,
                    price: results.price.currentPrice,
                    changeRate: results.price.changeRate,
                    marketStatus: results.price.marketStatus
                });
            } catch (error) {
                this.logger.error && this.logger.error('다날 실시간 주가 조회 실패:', error.message);
                
                // 폴백: 기존 야후 API 시도
                try {
                    this.logger.info && this.logger.info('야후 API 폴백 시도...');
                    results.price = await this.stockAPI.getCurrentPrice();
                    this.logger.info && this.logger.info('다날 야후 API 폴백 성공', {
                        price: results.price.currentPrice,
                        changeRate: results.price.changeRate
                    });
                } catch (fallbackError) {
                    this.logger.error && this.logger.error('다날 주가 조회 완전 실패:', fallbackError.message);
                    results.errors.push({ type: 'PRICE_ERROR', message: `실시간: ${error.message}, 폴백: ${fallbackError.message}` });
                    return results; // 주가 데이터가 없으면 분석 불가
                }
            }

            // 2. 기술적 분석 (충분한 데이터가 있을 때만)
            if (this.shouldPerformTechnicalAnalysis()) {
                try {
                    const dailyData = await this.stockAPI.getDailyChartData(50);
                    if (dailyData && dailyData.length >= 20) {
                        results.technical = this.technicalIndicators.performComprehensiveAnalysis(dailyData);
                        this.logger.info && this.logger.info('다날 기술분석 완료', {
                            signals: Object.keys(results.technical.signals).length,
                            score: results.technical.overallScore.score
                        });
                        this.lastAnalysisTime = Date.now();
                    } else {
                        this.logger.warn && this.logger.warn('다날 기술분석용 데이터 부족');
                    }
                } catch (error) {
                    this.logger.error && this.logger.error('다날 기술분석 실패:', error.message);
                    results.errors.push({ type: 'TECHNICAL_ERROR', message: error.message });
                }
            }

            // 3. 알림 체크
            const alerts = await this.checkDanalAlerts(results.price, results.technical);
            results.alerts = alerts;

            // 4. 알림 발송
            for (const alert of alerts) {
                await this.sendDanalAlert(alert, results.price, results.technical);
                await this.sleep(1000); // 알림 간 1초 대기
            }

            this.logger.info && this.logger.info('다날 종합 모니터링 완료', {
                price: results.price?.currentPrice,
                alerts: results.alerts.length,
                errors: results.errors.length
            });

            return results;

        } catch (error) {
            this.logger.error && this.logger.error('다날 종합 모니터링 실패:', error.message);
            return {
                timestamp: new Date().toISOString(),
                price: null,
                technical: null,
                alerts: [],
                errors: [{ type: 'SYSTEM_ERROR', message: error.message }]
            };
        }
    }

    // 기술분석 실행 여부 결정
    shouldPerformTechnicalAnalysis() {
        if (!this.lastAnalysisTime) return true;
        return (Date.now() - this.lastAnalysisTime) > this.analysisInterval;
    }

    // 다날 알림 체크 (기존 스파이크 체크와 통합)
    async checkDanalAlerts(priceData, technicalData) {
        const alerts = [];

        try {
            // 1. 가격 스파이크 체크 (기존 로직과 호환)
            if (this.monitoringConfig.enablePriceAlert && priceData) {
                const priceAlert = this.checkPriceSpike(priceData);
                if (priceAlert) alerts.push(priceAlert);
            }

            // 2. 거래량 급증 체크
            if (this.monitoringConfig.enableVolumeAlert && priceData) {
                const volumeAlert = await this.checkVolumeSpike(priceData);
                if (volumeAlert) alerts.push(volumeAlert);
            }

            // 3. 기술적 지표 알림 체크
            if (this.monitoringConfig.enableTechnicalAlert && technicalData) {
                const technicalAlert = this.checkTechnicalSignals(technicalData);
                if (technicalAlert) alerts.push(technicalAlert);
            }

            // 4. 패턴 알림 체크
            if (this.monitoringConfig.enablePatternAlert && technicalData) {
                const patternAlert = this.checkPatternSignals(technicalData);
                if (patternAlert) alerts.push(patternAlert);
            }

        } catch (error) {
            this.logger.error && this.logger.error('다날 알림 체크 실패:', error.message);
        }

        return alerts;
    }

    // 가격 스파이크 체크 (기존 앱과 호환되는 형식)
    checkPriceSpike(priceData) {
        const { changeRate, currentPrice, previousClose, volume } = priceData;
        const { spikeThreshold } = this.monitoringConfig;

        if (Math.abs(changeRate) >= spikeThreshold) {
            const alertType = changeRate > 0 ? 'SURGE' : 'DROP';
            const severity = Math.abs(changeRate) >= 5 ? 'HIGH' : 'MEDIUM';

            return {
                type: 'PRICE_ALERT',
                alertType: alertType,
                severity: severity,
                title: `다날 주가 ${changeRate > 0 ? '급등' : '급락'}`,
                message: `${Math.abs(changeRate).toFixed(2)}% ${changeRate > 0 ? '상승' : '하락'}`,
                data: {
                    currentPrice,
                    changeRate,
                    changeAmount: currentPrice - previousClose,
                    threshold: spikeThreshold
                },
                timestamp: new Date().toISOString()
            };
        }

        return null;
    }

    // 거래량 급증 체크
    async checkVolumeSpike(priceData) {
        try {
            // 최근 5일 평균 거래량과 비교
            const dailyData = await this.stockAPI.getDailyChartData(5);
            if (!dailyData || dailyData.length < 3) return null;

            const avgVolume = dailyData.slice(0, -1).reduce((sum, d) => sum + d.volume, 0) / (dailyData.length - 1);
            const currentVolume = priceData.volume;
            const volumeRatio = currentVolume / avgVolume;

            if (volumeRatio >= this.monitoringConfig.volumeThreshold) {
                return {
                    type: 'VOLUME_ALERT',
                    alertType: 'VOLUME_SPIKE',
                    severity: volumeRatio >= 3 ? 'HIGH' : 'MEDIUM',
                    title: '다날 거래량 급증',
                    message: `평균 대비 ${volumeRatio.toFixed(1)}배 거래량 증가`,
                    data: {
                        currentVolume,
                        avgVolume,
                        ratio: volumeRatio,
                        threshold: this.monitoringConfig.volumeThreshold
                    },
                    timestamp: new Date().toISOString()
                };
            }

        } catch (error) {
            this.logger.error && this.logger.error('거래량 체크 실패:', error.message);
        }

        return null;
    }

    // 기술적 지표 신호 체크
    checkTechnicalSignals(technicalData) {
        if (!technicalData || !technicalData.signals) return null;

        const { signals, overallScore } = technicalData;
        const strongSignals = [];

        // 강한 시그널 체크
        if (signals.macd?.crossover === 'BULLISH_CROSSOVER') {
            strongSignals.push('MACD 골든크로스');
        } else if (signals.macd?.crossover === 'BEARISH_CROSSOVER') {
            strongSignals.push('MACD 데드크로스');
        }

        if (signals.rsi?.signal === 'OVERSOLD' && signals.rsi.value <= 25) {
            strongSignals.push('RSI 과매도');
        } else if (signals.rsi?.signal === 'OVERBOUGHT' && signals.rsi.value >= 75) {
            strongSignals.push('RSI 과매수');
        }

        if (signals.bollingerBands?.breakout === 'UPPER_BREAKOUT') {
            strongSignals.push('볼린저 밴드 상단 돌파');
        } else if (signals.bollingerBands?.breakout === 'LOWER_BREAKOUT') {
            strongSignals.push('볼린저 밴드 하단 이탈');
        }

        // 종합 점수가 높거나 강한 시그널이 있을 때 알림
        if (overallScore.confidence === 'HIGH' || strongSignals.length > 0) {
            return {
                type: 'TECHNICAL_ALERT',
                alertType: 'TECHNICAL_SIGNAL',
                severity: overallScore.confidence === 'HIGH' ? 'HIGH' : 'MEDIUM',
                title: '다날 기술적 분석 신호',
                message: strongSignals.length > 0 ? 
                    strongSignals.join(', ') : 
                    `종합 점수: ${overallScore.score}점 (${overallScore.sentiment})`,
                data: {
                    signals: strongSignals,
                    overallScore,
                    key_signals: {
                        rsi: signals.rsi?.value,
                        macd: signals.macd?.crossover,
                        bollinger: signals.bollingerBands?.breakout
                    }
                },
                timestamp: new Date().toISOString()
            };
        }

        return null;
    }

    // 패턴 신호 체크
    checkPatternSignals(technicalData) {
        if (!technicalData || !technicalData.patterns) return null;

        const strongPatterns = technicalData.patterns.filter(p => 
            p.type.includes('BREAKOUT') || 
            p.type.includes('REVERSAL') || 
            p.severity === 'HIGH'
        );

        if (strongPatterns.length > 0) {
            const pattern = strongPatterns[0];
            return {
                type: 'PATTERN_ALERT',
                alertType: pattern.type,
                severity: pattern.severity || 'MEDIUM',
                title: '다날 차트 패턴',
                message: pattern.message,
                data: pattern,
                timestamp: new Date().toISOString()
            };
        }

        return null;
    }

    // 알림 발송
    async sendDanalAlert(alert, priceData, technicalData) {
        try {
            switch (alert.type) {
                case 'PRICE_ALERT':
                    await this.flexIntegration.sendPriceAlert(priceData, alert.alertType);
                    break;

                case 'VOLUME_ALERT':
                    await this.sendVolumeAlert(alert, priceData);
                    break;

                case 'TECHNICAL_ALERT':
                    await this.flexIntegration.sendTechnicalAlert(alert);
                    break;

                case 'PATTERN_ALERT':
                    await this.flexIntegration.sendPatternAlert(alert);
                    break;

                default:
                    this.logger.warn && this.logger.warn('알 수 없는 알림 타입:', alert.type);
            }

            this.logger.info && this.logger.info('다날 알림 발송 완료', {
                type: alert.type,
                title: alert.title
            });

        } catch (error) {
            this.logger.error && this.logger.error('다날 알림 발송 실패:', error.message);
        }
    }

    // 거래량 알림 발송 (간단한 형태)
    async sendVolumeAlert(alert, priceData) {
        const simpleAlert = {
            type: 'VOLUME_SPIKE',
            title: alert.title,
            message: alert.message,
            data: alert.data,
            severity: alert.severity
        };

        return await this.flexIntegration.sendTechnicalAlert(simpleAlert);
    }

    // 기존 app.js와 호환되는 함수 (간단한 가격 조회)
    async getDanalPrice() {
        try {
            // 🚀 실시간 API를 우선적으로 사용
            let priceData;
            try {
                priceData = await this.realtimeAPI.getCurrentPrice();
                this.logger.info && this.logger.info('실시간 API로 다날 주가 조회 성공', {
                    price: priceData.currentPrice,
                    changeRate: priceData.changeRate,
                    source: priceData.source
                });
            } catch (error) {
                this.logger.warn && this.logger.warn('실시간 API 실패, Yahoo API로 폴백:', error.message);
                priceData = await this.stockAPI.getCurrentPrice();
            }
            
            // 기존 앱에서 기대하는 형식으로 변환
            return {
                name: '다날',
                price: priceData.currentPrice,
                change: priceData.changeRate,
                changeAmount: priceData.changeAmount,
                volume: priceData.volume,
                marketStatus: priceData.marketStatus,
                timestamp: priceData.timestamp,
                success: true
            };
        } catch (error) {
            this.logger.error && this.logger.error('다날 가격 조회 실패:', error.message);
            return {
                name: '다날',
                price: null,
                change: null,
                error: error.message,
                success: false
            };
        }
    }

    // 다날 상태 체크 (헬스체크용)
    async checkDanalStatus() {
        try {
            const result = await this.stockAPI.testConnection();
            return {
                status: result.success ? 'OK' : 'ERROR',
                message: result.success ? '정상 동작' : result.error,
                timestamp: new Date().toISOString(),
                data: result
            };
        } catch (error) {
            return {
                status: 'ERROR',
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // 설정 업데이트
    updateMonitoringConfig(newConfig) {
        this.monitoringConfig = { ...this.monitoringConfig, ...newConfig };
        this.logger.info && this.logger.info('다날 모니터링 설정 업데이트', newConfig);
    }

    // 유틸리티
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 마지막 실행 시간 추적
let lastDanalMonitoringTime = 0;
const DANAL_MONITORING_INTERVAL = 5 * 60 * 1000; // 5분 (300초)

// 기존 app.js에서 쉽게 사용할 수 있는 함수들
async function integrateDanalMonitoring(webhookUrl, logger) {
    const now = Date.now();
    
    // 5분 간격 체크
    if (now - lastDanalMonitoringTime < DANAL_MONITORING_INTERVAL) {
        logger.debug && logger.debug(`다날 기술분석: ${Math.round((DANAL_MONITORING_INTERVAL - (now - lastDanalMonitoringTime)) / 1000)}초 후 실행 예정`);
        
        // 간단한 가격만 조회해서 반환 (기술분석은 스킵)
        const danalSystem = new DanalIntegration(webhookUrl, logger);
        const quickPrice = await danalSystem.getDanalPrice();
        
        return {
            name: '다날',
            type: 'stock', 
            enabled: true,
            monitoring_result: null, // 기술분석 스킵됨
            has_alerts: false,
            alert_count: 0,
            price: quickPrice.price,
            change_rate: quickPrice.change,
            timestamp: new Date().toISOString(),
            skipped: true,
            next_run: new Date(lastDanalMonitoringTime + DANAL_MONITORING_INTERVAL).toLocaleString()
        };
    }
    
    // 실제 기술분석 실행
    lastDanalMonitoringTime = now;
    logger.info && logger.info('🏢 다날 기술분석 실행 중...');
    
    const danalSystem = new DanalIntegration(webhookUrl, logger);
    
    // 다날 모니터링 실행
    const result = await danalSystem.performDanalMonitoring();
    
    // 기존 앱과 호환되는 형식으로 반환
    return {
        name: '다날',
        type: 'stock',
        enabled: true,
        monitoring_result: result,
        has_alerts: result.alerts.length > 0,
        alert_count: result.alerts.length,
        price: result.price?.currentPrice,
        change_rate: result.price?.changeRate,
        timestamp: result.timestamp
    };
}

async function getDanalPriceForApp(logger) {
    const danalSystem = new DanalIntegration(null, logger);
    return await danalSystem.getDanalPrice();
}

async function checkDanalHealthForApp(logger) {
    const danalSystem = new DanalIntegration(null, logger);
    return await danalSystem.checkDanalStatus();
}

// 🏢 다날 기술분석 모니터링을 app.js에 통합하는 함수 (페이코인 방식과 동일)
async function startDanalTechnicalMonitoring(webhookUrl, intervalMinutes = 5) {
    console.log('🏢 다날 기술분석 모니터링을 app.js에 통합 시작...');
    console.log(`   📅 실행 간격: ${intervalMinutes}분마다`);
    console.log(`   🎯 웹훅 URL: ${webhookUrl ? '설정됨' : '미설정'}`);
    
    // logger 설정 (app.js에서 호출되므로 logger 가져오기)
    const { logger } = require('./logger');
    
    // 기존 다날 뉴스 체크와 함께 실행되도록 간격 설정
    const monitoringInterval = setInterval(async () => {
        try {
            console.log(`\n🔍 [${new Date().toLocaleString('ko-KR')}] 다날 기술분석 체크...`);
            
            // 다날 기술분석 시스템 생성
            const danalSystem = new DanalIntegration(webhookUrl, logger);
            
            // 다날 종합 모니터링 실행
            const result = await danalSystem.performDanalMonitoring();
            
            if (result.alerts && result.alerts.length > 0) {
                console.log(`📊 다날 기술분석 완료: ${result.alerts.length}개 알림 발견`);
                
                // 각 알림을 Flex Message로 전송
                for (const alert of result.alerts) {
                    const success = await danalSystem.flexIntegration.sendTechnicalAlert(alert);
                    
                    if (success) {
                        console.log(`📤 다날 알림 전송 완료: ${alert.type}`);
                        
                        // 전송 간격 조정 (너무 빠르게 연속 전송 방지)
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        console.log(`❌ 다날 알림 전송 실패: ${alert.type}`);
                    }
                }
            } else {
                console.log('📊 다날 기술분석 완료: 알림 조건 미충족');
            }
            
        } catch (error) {
            console.error(`❌ 다날 기술분석 체크 실패: ${error.message}`);
            console.error('스택 트레이스:', error.stack);
        }
    }, intervalMinutes * 60 * 1000); // 분을 밀리초로 변환
    
    console.log(`✅ 다날 기술분석 모니터링 스케줄러 시작됨 (${intervalMinutes}분 간격)`);
    
    return monitoringInterval; // 필요시 나중에 clearInterval로 정지 가능
}

module.exports = {
    DanalIntegration,
    integrateDanalMonitoring,
    getDanalPriceForApp,
    checkDanalHealthForApp,
    startDanalTechnicalMonitoring
};