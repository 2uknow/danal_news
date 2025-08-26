// danal-alert-system.js
// 다날 주식 전용 알림 시스템

const logger = require('./logger');
const DanalStockAPI = require('./danal-stock-api');
const AdvancedTechnicalIndicators = require('./advanced-technical-indicators');

class DanalAlertSystem {
    constructor(logger = console) {
        this.stockAPI = new DanalStockAPI();
        this.technicalIndicators = new AdvancedTechnicalIndicators();
        this.webhookUrl = null;
        this.logger = logger;
        
        // 다날 전용 알림 설정
        this.alertSettings = {
            // 가격 알림
            priceAlert: {
                enabled: true,
                spikeThreshold: 3.0,      // 3% 이상 급등/급락
                volumeSpikeThreshold: 2.5, // 평균 거래량 대비 2.5배
                consecutiveLimit: 3        // 연속 3회 같은 방향 움직임
            },
            
            // 기술적 지표 알림
            technicalAlert: {
                enabled: true,
                rsiOverbought: 75,        // RSI 과매수
                rsiOversold: 25,          // RSI 과매도
                macdCrossover: true,      // MACD 골든/데드크로스
                bollingerBreakout: true,  // 볼린저 밴드 돌파
                volumeConfirmation: true  // 거래량 확인 필요
            },
            
            // 패턴 알림
            patternAlert: {
                enabled: true,
                supportResistance: true,  // 지지/저항 터치
                trendReversal: true,      // 추세 반전 신호
                consolidationBreakout: true // 횡보 구간 돌파
            },
            
            // 뉴스 기반 알림
            newsAlert: {
                enabled: true,
                keywords: ['다날', '064260', '디지털결제', '핀테크', '전자결제'],
                sentimentAnalysis: true,
                marketImpact: true
            }
        };
        
        // 알림 발송 제한 (스팸 방지)
        this.alertLimits = {
            maxAlertsPerHour: 10,
            minIntervalMinutes: 5,
            lastAlertTime: null,
            alertCount: 0,
            resetTime: Date.now()
        };
        
        // 알림 히스토리
        this.alertHistory = [];
        this.maxHistorySize = 100;
    }

    // 웹훅 URL 설정
    setWebhookUrl(url) {
        this.webhookUrl = url;
        this.logger.info && this.logger.info('다날 알림 시스템 웹훅 URL 설정', { url: url });
    }

    // 종합 알림 체크
    async checkAllAlerts() {
        try {
            this.logger.debug && this.logger.debug('다날 종합 알림 체크 시작');

            // 알림 제한 확인
            if (!this.canSendAlert()) {
                this.logger.debug && this.logger.debug('알림 발송 제한으로 스킵');
                return null;
            }

            const alerts = [];

            // 1. 가격 알림 체크
            if (this.alertSettings.priceAlert.enabled) {
                const priceAlert = await this.checkPriceAlerts();
                if (priceAlert) alerts.push(priceAlert);
            }

            // 2. 기술적 지표 알림 체크
            if (this.alertSettings.technicalAlert.enabled) {
                const technicalAlert = await this.checkTechnicalAlerts();
                if (technicalAlert) alerts.push(technicalAlert);
            }

            // 3. 패턴 알림 체크
            if (this.alertSettings.patternAlert.enabled) {
                const patternAlert = await this.checkPatternAlerts();
                if (patternAlert) alerts.push(patternAlert);
            }

            // 4. 뉴스 알림 체크
            if (this.alertSettings.newsAlert.enabled) {
                const newsAlert = await this.checkNewsAlerts();
                if (newsAlert) alerts.push(newsAlert);
            }

            // 우선순위 알림 발송
            if (alerts.length > 0) {
                const prioritizedAlert = this.prioritizeAlerts(alerts);
                await this.sendAlert(prioritizedAlert);
                return prioritizedAlert;
            }

            return null;

        } catch (error) {
            this.logger.error && this.logger.error(`다날 알림 체크 실패: ${error.message}`);
            return null;
        }
    }

    // 가격 알림 체크
    async checkPriceAlerts() {
        try {
            const currentPrice = await this.stockAPI.getCurrentPrice();
            if (!currentPrice) return null;

            const alerts = [];
            const { spikeThreshold, volumeSpikeThreshold } = this.alertSettings.priceAlert;

            // 급등/급락 체크
            if (Math.abs(currentPrice.changeRate) >= spikeThreshold) {
                const alertType = currentPrice.changeRate > 0 ? 'PRICE_SURGE' : 'PRICE_DROP';
                const severity = Math.abs(currentPrice.changeRate) >= 5 ? 'HIGH' : 'MEDIUM';

                alerts.push({
                    type: alertType,
                    severity: severity,
                    title: `다날 주가 ${currentPrice.changeRate > 0 ? '급등' : '급락'}`,
                    message: `현재가: ${currentPrice.currentPrice.toLocaleString()}원 (${currentPrice.changeRate > 0 ? '+' : ''}${currentPrice.changeRate.toFixed(2)}%)`,
                    data: currentPrice,
                    timestamp: new Date().toISOString(),
                    category: 'PRICE'
                });
            }

            // 거래량 급증 체크
            const dailyData = await this.stockAPI.getDailyChartData(20);
            if (dailyData && dailyData.length >= 5) {
                const avgVolume = dailyData.slice(-5).reduce((sum, d) => sum + d.volume, 0) / 5;
                const volumeRatio = currentPrice.volume / avgVolume;

                if (volumeRatio >= volumeSpikeThreshold) {
                    alerts.push({
                        type: 'VOLUME_SPIKE',
                        severity: volumeRatio >= 4 ? 'HIGH' : 'MEDIUM',
                        title: '다날 거래량 급증',
                        message: `현재 거래량: ${currentPrice.volume.toLocaleString()}주 (평균 대비 ${volumeRatio.toFixed(1)}배)`,
                        data: { currentVolume: currentPrice.volume, avgVolume, ratio: volumeRatio },
                        timestamp: new Date().toISOString(),
                        category: 'VOLUME'
                    });
                }
            }

            return alerts.length > 0 ? alerts[0] : null;

        } catch (error) {
            this.logger.error && this.logger.error(`가격 알림 체크 실패: ${error.message}`);
            return null;
        }
    }

    // 기술적 지표 알림 체크
    async checkTechnicalAlerts() {
        try {
            const dailyData = await this.stockAPI.getDailyChartData(50);
            if (!dailyData || dailyData.length < 20) return null;

            const analysis = this.technicalIndicators.performComprehensiveAnalysis(dailyData);
            if (!analysis) return null;

            const alerts = [];
            const { signals, overallScore, recommendation } = analysis;

            // RSI 과매수/과매도 체크
            if (signals.rsi) {
                const { value, signal } = signals.rsi;
                
                if (signal === 'OVERBOUGHT' && value >= this.alertSettings.technicalAlert.rsiOverbought) {
                    alerts.push({
                        type: 'RSI_OVERBOUGHT',
                        severity: 'MEDIUM',
                        title: '다날 RSI 과매수 구간',
                        message: `RSI: ${value.toFixed(1)} (과매수 구간, 조정 가능성)`,
                        data: { rsi: value, threshold: this.alertSettings.technicalAlert.rsiOverbought },
                        timestamp: new Date().toISOString(),
                        category: 'TECHNICAL'
                    });
                } else if (signal === 'OVERSOLD' && value <= this.alertSettings.technicalAlert.rsiOversold) {
                    alerts.push({
                        type: 'RSI_OVERSOLD',
                        severity: 'MEDIUM',
                        title: '다날 RSI 과매도 구간',
                        message: `RSI: ${value.toFixed(1)} (과매도 구간, 반등 기대)`,
                        data: { rsi: value, threshold: this.alertSettings.technicalAlert.rsiOversold },
                        timestamp: new Date().toISOString(),
                        category: 'TECHNICAL'
                    });
                }
            }

            // MACD 크로스오버 체크
            if (signals.macd && this.alertSettings.technicalAlert.macdCrossover) {
                const { crossover } = signals.macd;
                
                if (crossover === 'BULLISH_CROSSOVER') {
                    alerts.push({
                        type: 'MACD_GOLDEN_CROSS',
                        severity: 'HIGH',
                        title: '다날 MACD 골든크로스',
                        message: 'MACD 골든크로스 발생 - 상승 모멘텀 기대',
                        data: signals.macd,
                        timestamp: new Date().toISOString(),
                        category: 'TECHNICAL'
                    });
                } else if (crossover === 'BEARISH_CROSSOVER') {
                    alerts.push({
                        type: 'MACD_DEAD_CROSS',
                        severity: 'HIGH',
                        title: '다날 MACD 데드크로스',
                        message: 'MACD 데드크로스 발생 - 하락 모멘텀 주의',
                        data: signals.macd,
                        timestamp: new Date().toISOString(),
                        category: 'TECHNICAL'
                    });
                }
            }

            // 볼린저 밴드 돌파 체크
            if (signals.bollingerBands && this.alertSettings.technicalAlert.bollingerBreakout) {
                const { breakout } = signals.bollingerBands;
                
                if (breakout === 'UPPER_BREAKOUT') {
                    alerts.push({
                        type: 'BOLLINGER_UPPER_BREAKOUT',
                        severity: 'MEDIUM',
                        title: '다날 볼린저 밴드 상단 돌파',
                        message: '볼린저 밴드 상단 돌파 - 강한 상승 모멘텀',
                        data: signals.bollingerBands,
                        timestamp: new Date().toISOString(),
                        category: 'TECHNICAL'
                    });
                } else if (breakout === 'LOWER_BREAKOUT') {
                    alerts.push({
                        type: 'BOLLINGER_LOWER_BREAKOUT',
                        severity: 'MEDIUM',
                        title: '다말 볼린저 밴드 하단 이탈',
                        message: '볼린저 밴드 하단 이탈 - 약세 지속 우려',
                        data: signals.bollingerBands,
                        timestamp: new Date().toISOString(),
                        category: 'TECHNICAL'
                    });
                }
            }

            // 종합 점수 기반 강한 신호 체크
            if (overallScore.confidence === 'HIGH') {
                const scoreAlert = {
                    type: overallScore.sentiment.includes('BULLISH') ? 'STRONG_BUY_SIGNAL' : 'STRONG_SELL_SIGNAL',
                    severity: 'HIGH',
                    title: `다날 종합 기술분석: ${overallScore.sentiment}`,
                    message: `종합점수: ${overallScore.score}점 (${overallScore.confidence} 신뢰도)`,
                    data: { overallScore, recommendation },
                    timestamp: new Date().toISOString(),
                    category: 'COMPREHENSIVE'
                };
                alerts.push(scoreAlert);
            }

            return alerts.length > 0 ? this.prioritizeAlerts(alerts) : null;

        } catch (error) {
            this.logger.error && this.logger.error(`기술적 지표 알림 체크 실패: ${error.message}`);
            return null;
        }
    }

    // 패턴 알림 체크
    async checkPatternAlerts() {
        try {
            const dailyData = await this.stockAPI.getDailyChartData(30);
            if (!dailyData || dailyData.length < 20) return null;

            const alerts = [];
            const currentPrice = dailyData[dailyData.length - 1];
            const recentPrices = dailyData.slice(-10);

            // 지지/저항선 터치 체크
            if (this.alertSettings.patternAlert.supportResistance) {
                const supportResistance = this.findSupportResistanceLevels(dailyData);
                const touchAlert = this.checkSupportResistanceTouch(currentPrice, supportResistance);
                if (touchAlert) alerts.push(touchAlert);
            }

            // 추세 반전 패턴 체크
            if (this.alertSettings.patternAlert.trendReversal) {
                const reversalAlert = this.checkTrendReversal(recentPrices);
                if (reversalAlert) alerts.push(reversalAlert);
            }

            // 횡보 구간 돌파 체크
            if (this.alertSettings.patternAlert.consolidationBreakout) {
                const breakoutAlert = this.checkConsolidationBreakout(recentPrices);
                if (breakoutAlert) alerts.push(breakoutAlert);
            }

            return alerts.length > 0 ? alerts[0] : null;

        } catch (error) {
            this.logger.error && this.logger.error(`패턴 알림 체크 실패: ${error.message}`);
            return null;
        }
    }

    // 뉴스 알림 체크 (간단한 형태)
    async checkNewsAlerts() {
        try {
            // 실제로는 뉴스 API나 웹 스크래핑을 통해 구현
            // 여기서는 기본 구조만 제공
            
            const alerts = [];
            const { keywords } = this.alertSettings.newsAlert;

            // 뉴스 체크 로직 (실제 구현 필요)
            // const newsItems = await this.fetchDanalNews(keywords);
            // const importantNews = this.analyzeNewsImpact(newsItems);
            
            // if (importantNews.length > 0) {
            //     alerts.push({
            //         type: 'IMPORTANT_NEWS',
            //         severity: 'HIGH',
            //         title: '다날 주요 뉴스',
            //         message: importantNews[0].title,
            //         data: importantNews[0],
            //         timestamp: new Date().toISOString(),
            //         category: 'NEWS'
            //     });
            // }

            return alerts.length > 0 ? alerts[0] : null;

        } catch (error) {
            this.logger.error && this.logger.error(`뉴스 알림 체크 실패: ${error.message}`);
            return null;
        }
    }

    // 지지/저항선 계산
    findSupportResistanceLevels(data) {
        const prices = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);

        // 단순한 지지/저항선 계산 (고점/저점 기반)
        const resistance = Math.max(...highs.slice(-20));
        const support = Math.min(...lows.slice(-20));

        return { support, resistance };
    }

    // 지지/저항선 터치 체크
    checkSupportResistanceTouch(currentPrice, levels) {
        const tolerance = 0.02; // 2% 오차 허용
        
        // 저항선 터치
        if (Math.abs(currentPrice.close - levels.resistance) / levels.resistance <= tolerance) {
            return {
                type: 'RESISTANCE_TOUCH',
                severity: 'MEDIUM',
                title: '다날 저항선 터치',
                message: `현재가 ${currentPrice.close.toLocaleString()}원이 저항선 ${levels.resistance.toLocaleString()}원 근처`,
                data: { currentPrice: currentPrice.close, level: levels.resistance },
                timestamp: new Date().toISOString(),
                category: 'PATTERN'
            };
        }

        // 지지선 터치
        if (Math.abs(currentPrice.close - levels.support) / levels.support <= tolerance) {
            return {
                type: 'SUPPORT_TOUCH',
                severity: 'MEDIUM',
                title: '다날 지지선 터치',
                message: `현재가 ${currentPrice.close.toLocaleString()}원이 지지선 ${levels.support.toLocaleString()}원 근처`,
                data: { currentPrice: currentPrice.close, level: levels.support },
                timestamp: new Date().toISOString(),
                category: 'PATTERN'
            };
        }

        return null;
    }

    // 추세 반전 체크
    checkTrendReversal(recentPrices) {
        if (recentPrices.length < 5) return null;

        const prices = recentPrices.map(p => p.close);
        const isRising = prices.slice(0, 3).every((price, index) => index === 0 || price > prices[index - 1]);
        const isFalling = prices.slice(-3).every((price, index) => index === 0 || price < prices[prices.length - 3 + index - 1]);

        if (isRising && isFalling) {
            return {
                type: 'TREND_REVERSAL_DOWN',
                severity: 'HIGH',
                title: '다날 하향 추세 반전',
                message: '상승세에서 하락세로 전환 감지',
                data: { pattern: 'bearish_reversal', prices: prices.slice(-5) },
                timestamp: new Date().toISOString(),
                category: 'PATTERN'
            };
        }

        const wasFalling = prices.slice(0, 3).every((price, index) => index === 0 || price < prices[index - 1]);
        const nowRising = prices.slice(-3).every((price, index) => index === 0 || price > prices[prices.length - 3 + index - 1]);

        if (wasFalling && nowRising) {
            return {
                type: 'TREND_REVERSAL_UP',
                severity: 'HIGH',
                title: '다날 상향 추세 반전',
                message: '하락세에서 상승세로 전환 감지',
                data: { pattern: 'bullish_reversal', prices: prices.slice(-5) },
                timestamp: new Date().toISOString(),
                category: 'PATTERN'
            };
        }

        return null;
    }

    // 횡보 구간 돌파 체크
    checkConsolidationBreakout(recentPrices) {
        if (recentPrices.length < 10) return null;

        const prices = recentPrices.map(p => p.close);
        const consolidationPrices = prices.slice(0, -2);
        const currentPrice = prices[prices.length - 1];

        const maxPrice = Math.max(...consolidationPrices);
        const minPrice = Math.min(...consolidationPrices);
        const range = maxPrice - minPrice;
        const avgPrice = consolidationPrices.reduce((sum, p) => sum + p, 0) / consolidationPrices.length;

        // 횡보 구간 조건: 가격 범위가 평균가의 3% 이내
        if (range / avgPrice <= 0.03) {
            // 상향 돌파
            if (currentPrice > maxPrice * 1.01) {
                return {
                    type: 'BREAKOUT_UPWARD',
                    severity: 'HIGH',
                    title: '다날 횡보 구간 상향 돌파',
                    message: `${minPrice.toLocaleString()}-${maxPrice.toLocaleString()}원 횡보 구간 상향 돌파`,
                    data: { range: { min: minPrice, max: maxPrice }, currentPrice },
                    timestamp: new Date().toISOString(),
                    category: 'PATTERN'
                };
            }
            // 하향 돌파
            else if (currentPrice < minPrice * 0.99) {
                return {
                    type: 'BREAKOUT_DOWNWARD',
                    severity: 'HIGH',
                    title: '다날 횡보 구간 하향 이탈',
                    message: `${minPrice.toLocaleString()}-${maxPrice.toLocaleString()}원 횡보 구간 하향 이탈`,
                    data: { range: { min: minPrice, max: maxPrice }, currentPrice },
                    timestamp: new Date().toISOString(),
                    category: 'PATTERN'
                };
            }
        }

        return null;
    }

    // 알림 우선순위 결정
    prioritizeAlerts(alerts) {
        const severityWeight = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        const categoryWeight = { 
            'PRICE': 3, 
            'TECHNICAL': 2.5, 
            'PATTERN': 2, 
            'VOLUME': 2,
            'NEWS': 1.5, 
            'COMPREHENSIVE': 3 
        };

        alerts.sort((a, b) => {
            const scoreA = severityWeight[a.severity] * categoryWeight[a.category];
            const scoreB = severityWeight[b.severity] * categoryWeight[b.category];
            return scoreB - scoreA;
        });

        return alerts[0];
    }

    // 알림 발송 가능 체크
    canSendAlert() {
        const now = Date.now();
        const { maxAlertsPerHour, minIntervalMinutes, lastAlertTime, alertCount, resetTime } = this.alertLimits;

        // 1시간마다 카운트 리셋
        if (now - resetTime > 60 * 60 * 1000) {
            this.alertLimits.alertCount = 0;
            this.alertLimits.resetTime = now;
        }

        // 최대 알림 수 체크
        if (alertCount >= maxAlertsPerHour) {
            return false;
        }

        // 최소 간격 체크
        if (lastAlertTime && now - lastAlertTime < minIntervalMinutes * 60 * 1000) {
            return false;
        }

        return true;
    }

    // 알림 발송
    async sendAlert(alert) {
        try {
            if (!this.webhookUrl) {
                this.logger.warn && this.logger.warn('웹훅 URL이 설정되지 않음');
                return false;
            }

            // 알림 히스토리에 추가
            this.alertHistory.push(alert);
            if (this.alertHistory.length > this.maxHistorySize) {
                this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
            }

            // 발송 제한 업데이트
            this.alertLimits.lastAlertTime = Date.now();
            this.alertLimits.alertCount++;

            // Flex 메시지 생성 및 발송은 danal-flex-integration.js에서 처리
            this.logger.info && this.logger.info('다날 알림 발송', {
                type: alert.type,
                severity: alert.severity,
                title: alert.title,
                category: alert.category
            });

            return true;

        } catch (error) {
            this.logger.error && this.logger.error(`다날 알림 발송 실패: ${error.message}`);
            return false;
        }
    }

    // 알림 히스토리 조회
    getAlertHistory(limit = 20) {
        return this.alertHistory.slice(-limit);
    }

    // 알림 설정 업데이트
    updateAlertSettings(newSettings) {
        this.alertSettings = { ...this.alertSettings, ...newSettings };
        this.logger.info && this.logger.info('다날 알림 설정 업데이트', newSettings);
    }

    // 시스템 상태 조회
    getSystemStatus() {
        return {
            alertSettings: this.alertSettings,
            alertLimits: this.alertLimits,
            historyCount: this.alertHistory.length,
            webhookConfigured: !!this.webhookUrl,
            lastCheck: new Date().toISOString()
        };
    }
}

module.exports = DanalAlertSystem;