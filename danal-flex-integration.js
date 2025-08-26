// danal-flex-integration.js
// 다날 주식 Flex 메시지 통합 모듈

const https = require('https');

// 사내망 HTTPS 에이전트
const agent = new https.Agent({
    rejectUnauthorized: false
});

class DanalFlexIntegration {
    constructor(webhookUrl = null, logger = console) {
        this.webhookUrl = webhookUrl;
        this.logger = logger;
        this.httpTimeout = 30000;
        
        // 알림 색상 정의
        this.colors = {
            SURGE: '#FF4444',      // 급등 - 빨간색
            DROP: '#4444FF',       // 급락 - 파란색
            NEWS: '#8A2BE2',       // 뉴스 - 보라색
            TECHNICAL: '#FF8C00',  // 기술분석 - 주황색
            PATTERN: '#32CD32',    // 패턴 - 연두색
            VOLUME: '#FFD700',     // 거래량 - 황금색
            WARNING: '#FFA500',    // 경고 - 주황색
            INFO: '#20B2AA',       // 정보 - 청록색
            SUCCESS: '#228B22',    // 성공 - 녹색
            ERROR: '#DC143C'       // 오류 - 진홍색
        };
    }

    // 웹훅 URL 설정
    setWebhookUrl(url) {
        this.webhookUrl = url;
        this.logger.info && this.logger.info('다날 Flex 웹훅 URL 설정', { url });
    }

    // 다날 주가 급등/급락 알림
    async sendPriceAlert(priceData, alertType = 'SURGE') {
        try {
            const color = alertType === 'SURGE' ? this.colors.SURGE : this.colors.DROP;
            const emoji = alertType === 'SURGE' ? '🚀' : '📉';
            const title = alertType === 'SURGE' ? '급등' : '급락';
            const changeText = priceData.changeRate > 0 ? `+${priceData.changeRate}%` : `${priceData.changeRate}%`;
            
            const flexMessage = {
                "type": "flex",
                "altText": `다날 주가 ${title} 알림`,
                "contents": {
                    "type": "bubble",
                    "size": "kilo",
                    "header": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": `${emoji} 다날 주가 ${title}`,
                                        "weight": "bold",
                                        "size": "lg",
                                        "color": "#FFFFFF",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": priceData.marketStatus === 'OPEN' ? '🟢 장중' : '🔴 장외',
                                        "size": "sm",
                                        "color": "#FFFFFF",
                                        "align": "end"
                                    }
                                ]
                            }
                        ],
                        "backgroundColor": color,
                        "paddingAll": "12px"
                    },
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "현재가",
                                        "size": "sm",
                                        "color": "#666666",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": `${priceData.currentPrice.toLocaleString()}원`,
                                        "weight": "bold",
                                        "size": "lg",
                                        "color": "#333333",
                                        "align": "end"
                                    }
                                ],
                                "margin": "md"
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "변동",
                                        "size": "sm",
                                        "color": "#666666",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": `${priceData.changeAmount > 0 ? '+' : ''}${priceData.changeAmount.toLocaleString()}원 (${changeText})`,
                                        "weight": "bold",
                                        "size": "md",
                                        "color": priceData.changeRate > 0 ? "#FF4444" : "#4444FF",
                                        "align": "end"
                                    }
                                ],
                                "margin": "sm"
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "고가/저가",
                                        "size": "sm",
                                        "color": "#666666",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": `${priceData.high.toLocaleString()} / ${priceData.low.toLocaleString()}`,
                                        "size": "sm",
                                        "color": "#333333",
                                        "align": "end"
                                    }
                                ],
                                "margin": "sm"
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "거래량",
                                        "size": "sm",
                                        "color": "#666666",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": `${priceData.volume.toLocaleString()}주`,
                                        "size": "sm",
                                        "color": "#333333",
                                        "align": "end"
                                    }
                                ],
                                "margin": "sm"
                            }
                        ],
                        "spacing": "sm",
                        "paddingAll": "12px"
                    },
                    "footer": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": new Date().toLocaleString(),
                                "size": "xs",
                                "color": "#999999",
                                "align": "center"
                            }
                        ],
                        "paddingAll": "8px"
                    }
                }
            };

            return await this.sendFlexMessage(flexMessage);
            
        } catch (error) {
            this.logger.error && this.logger.error('다날 가격 알림 생성 실패:', error.message);
            return false;
        }
    }

    // 다날 기술적 분석 알림
    async sendTechnicalAlert(analysisData, alertType = 'TECHNICAL') {
        try {
            const { type, title, message, data, severity } = analysisData;
            
            let color = this.colors.TECHNICAL;
            let emoji = '📊';
            
            // 알림 유형에 따른 색상과 이모지 설정
            if (type.includes('BULLISH') || type.includes('GOLDEN')) {
                color = this.colors.SUCCESS;
                emoji = '🟢';
            } else if (type.includes('BEARISH') || type.includes('DEAD')) {
                color = this.colors.ERROR;
                emoji = '🔴';
            } else if (type.includes('OVERBOUGHT')) {
                color = this.colors.WARNING;
                emoji = '⚠️';
            } else if (type.includes('OVERSOLD')) {
                color = this.colors.INFO;
                emoji = '💎';
            }

            const flexMessage = {
                "type": "flex",
                "altText": `다날 ${title}`,
                "contents": {
                    "type": "bubble",
                    "size": "kilo",
                    "header": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": `${emoji} ${title}`,
                                "weight": "bold",
                                "size": "lg",
                                "color": "#FFFFFF"
                            },
                            {
                                "type": "text",
                                "text": `심각도: ${this.getSeverityText(severity)}`,
                                "size": "sm",
                                "color": "#FFFFFF",
                                "margin": "xs"
                            }
                        ],
                        "backgroundColor": color,
                        "paddingAll": "12px"
                    },
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": message,
                                "size": "md",
                                "color": "#333333",
                                "wrap": true,
                                "margin": "md"
                            }
                        ],
                        "paddingAll": "12px"
                    }
                }
            };

            // 기술적 지표 상세 정보 추가
            if (data) {
                const details = this.formatTechnicalData(data, type);
                if (details.length > 0) {
                    flexMessage.contents.body.contents.push({
                        "type": "separator",
                        "margin": "md"
                    });
                    
                    details.forEach(detail => {
                        flexMessage.contents.body.contents.push({
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": detail.label,
                                    "size": "sm",
                                    "color": "#666666",
                                    "flex": 1
                                },
                                {
                                    "type": "text",
                                    "text": detail.value,
                                    "size": "sm",
                                    "color": "#333333",
                                    "align": "end"
                                }
                            ],
                            "margin": "sm"
                        });
                    });
                }
            }

            // 푸터 추가
            flexMessage.contents.footer = {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": `기술분석 • ${new Date().toLocaleString()}`,
                        "size": "xs",
                        "color": "#999999",
                        "align": "center"
                    }
                ],
                "paddingAll": "8px"
            };

            return await this.sendFlexMessage(flexMessage);
            
        } catch (error) {
            this.logger.error && this.logger.error('다날 기술분석 알림 생성 실패:', error.message);
            return false;
        }
    }

    // 다날 패턴 분석 알림
    async sendPatternAlert(patternData) {
        try {
            const { type, title, message, data } = patternData;
            
            let color = this.colors.PATTERN;
            let emoji = '📈';
            
            if (type.includes('REVERSAL_UP') || type.includes('BREAKOUT_UPWARD')) {
                color = this.colors.SUCCESS;
                emoji = '🚀';
            } else if (type.includes('REVERSAL_DOWN') || type.includes('BREAKOUT_DOWNWARD')) {
                color = this.colors.ERROR;
                emoji = '📉';
            } else if (type.includes('SUPPORT')) {
                color = this.colors.INFO;
                emoji = '🛡️';
            } else if (type.includes('RESISTANCE')) {
                color = this.colors.WARNING;
                emoji = '🚧';
            }

            const flexMessage = {
                "type": "flex",
                "altText": `다날 ${title}`,
                "contents": {
                    "type": "bubble",
                    "size": "kilo",
                    "header": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": `${emoji} ${title}`,
                                "weight": "bold",
                                "size": "lg",
                                "color": "#FFFFFF"
                            }
                        ],
                        "backgroundColor": color,
                        "paddingAll": "12px"
                    },
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": message,
                                "size": "md",
                                "color": "#333333",
                                "wrap": true,
                                "margin": "md"
                            }
                        ],
                        "paddingAll": "12px"
                    },
                    "footer": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": `패턴 분석 • ${new Date().toLocaleString()}`,
                                "size": "xs",
                                "color": "#999999",
                                "align": "center"
                            }
                        ],
                        "paddingAll": "8px"
                    }
                }
            };

            return await this.sendFlexMessage(flexMessage);
            
        } catch (error) {
            this.logger.error && this.logger.error('다날 패턴 알림 생성 실패:', error.message);
            return false;
        }
    }

    // 다날 종합 분석 리포트
    async sendComprehensiveReport(analysisData) {
        try {
            const { currentPrice, signals, overallScore, recommendation, patterns } = analysisData;
            
            let color = this.colors.INFO;
            let emoji = '📊';
            
            if (overallScore.sentiment.includes('BULLISH')) {
                color = this.colors.SUCCESS;
                emoji = '🟢';
            } else if (overallScore.sentiment.includes('BEARISH')) {
                color = this.colors.ERROR;
                emoji = '🔴';
            }

            const flexMessage = {
                "type": "flex",
                "altText": "다날 종합 기술분석 리포트",
                "contents": {
                    "type": "bubble",
                    "size": "giga",
                    "header": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "text",
                                "text": `${emoji} 다날 종합 분석`,
                                "weight": "bold",
                                "size": "xl",
                                "color": "#FFFFFF"
                            },
                            {
                                "type": "text",
                                "text": `현재가: ${currentPrice.toLocaleString()}원`,
                                "size": "md",
                                "color": "#FFFFFF",
                                "margin": "sm"
                            }
                        ],
                        "backgroundColor": color,
                        "paddingAll": "16px"
                    },
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "종합 점수",
                                        "size": "md",
                                        "color": "#666666",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": `${overallScore.score}점 (${overallScore.sentiment})`,
                                        "size": "md",
                                        "color": color,
                                        "weight": "bold",
                                        "align": "end"
                                    }
                                ],
                                "margin": "lg"
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "신뢰도",
                                        "size": "sm",
                                        "color": "#666666",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": overallScore.confidence,
                                        "size": "sm",
                                        "color": "#333333",
                                        "align": "end"
                                    }
                                ],
                                "margin": "sm"
                            }
                        ],
                        "spacing": "sm",
                        "paddingAll": "16px"
                    }
                }
            };

            // 주요 시그널 추가
            if (signals && Object.keys(signals).length > 0) {
                flexMessage.contents.body.contents.push({
                    "type": "separator",
                    "margin": "lg"
                });
                
                flexMessage.contents.body.contents.push({
                    "type": "text",
                    "text": "주요 시그널",
                    "size": "md",
                    "color": "#333333",
                    "weight": "bold",
                    "margin": "lg"
                });

                // RSI 시그널
                if (signals.rsi) {
                    flexMessage.contents.body.contents.push({
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {
                                "type": "text",
                                "text": "RSI",
                                "size": "sm",
                                "color": "#666666",
                                "flex": 1
                            },
                            {
                                "type": "text",
                                "text": `${signals.rsi.value.toFixed(1)} (${this.getSignalEmoji(signals.rsi.signal)})`,
                                "size": "sm",
                                "color": "#333333",
                                "align": "end"
                            }
                        ],
                        "margin": "sm"
                    });
                }

                // MACD 시그널
                if (signals.macd) {
                    flexMessage.contents.body.contents.push({
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {
                                "type": "text",
                                "text": "MACD",
                                "size": "sm",
                                "color": "#666666",
                                "flex": 1
                            },
                            {
                                "type": "text",
                                "text": `${this.getSignalEmoji(signals.macd.crossover)} ${signals.macd.crossover}`,
                                "size": "sm",
                                "color": "#333333",
                                "align": "end"
                            }
                        ],
                        "margin": "sm"
                    });
                }

                // 거래량 시그널
                if (signals.volume) {
                    flexMessage.contents.body.contents.push({
                        "type": "box",
                        "layout": "horizontal",
                        "contents": [
                            {
                                "type": "text",
                                "text": "거래량",
                                "size": "sm",
                                "color": "#666666",
                                "flex": 1
                            },
                            {
                                "type": "text",
                                "text": `${signals.volume.ratio}배 (${this.getSignalEmoji(signals.volume.signal)})`,
                                "size": "sm",
                                "color": "#333333",
                                "align": "end"
                            }
                        ],
                        "margin": "sm"
                    });
                }
            }

            // 추천 액션
            if (recommendation) {
                flexMessage.contents.body.contents.push({
                    "type": "separator",
                    "margin": "lg"
                });
                
                flexMessage.contents.body.contents.push({
                    "type": "text",
                    "text": "추천 액션",
                    "size": "md",
                    "color": "#333333",
                    "weight": "bold",
                    "margin": "lg"
                });

                flexMessage.contents.body.contents.push({
                    "type": "text",
                    "text": `${this.getActionEmoji(recommendation.action)} ${recommendation.action}`,
                    "size": "lg",
                    "color": this.getActionColor(recommendation.action),
                    "weight": "bold",
                    "margin": "sm"
                });

                if (recommendation.reasons && recommendation.reasons.length > 0) {
                    recommendation.reasons.slice(0, 2).forEach(reason => {
                        flexMessage.contents.body.contents.push({
                            "type": "text",
                            "text": `• ${reason}`,
                            "size": "xs",
                            "color": "#666666",
                            "wrap": true,
                            "margin": "xs"
                        });
                    });
                }
            }

            // 푸터 추가
            flexMessage.contents.footer = {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": `종합 분석 • ${new Date().toLocaleString()}`,
                        "size": "xs",
                        "color": "#999999",
                        "align": "center"
                    }
                ],
                "paddingAll": "8px"
            };

            return await this.sendFlexMessage(flexMessage);
            
        } catch (error) {
            this.logger.error && this.logger.error('다날 종합 리포트 생성 실패:', error.message);
            return false;
        }
    }

    // Flex 메시지 전송
    async sendFlexMessage(flexMessage) {
        try {
            if (!this.webhookUrl) {
                this.logger.warn && this.logger.warn('웹훅 URL이 설정되지 않음');
                return false;
            }

            const payload = {
                text: flexMessage.altText,
                attachments: [
                    {
                        contentType: "application/vnd.line.flex",
                        content: flexMessage.contents
                    }
                ]
            };

            const { exec } = require('child_process');
            const util = require('util');
            const execPromise = util.promisify(exec);
            
            const curlCommand = `curl -k -s -X POST "${this.webhookUrl}" ` +
                               `-H "Content-Type: application/json" ` +
                               `-d '${JSON.stringify(payload).replace(/'/g, "'\"'\"'")}'`;

            const { stdout, stderr } = await execPromise(curlCommand);
            
            if (stderr && stderr.includes('error')) {
                throw new Error(`웹훅 전송 오류: ${stderr}`);
            }

            this.logger.info && this.logger.info('다날 Flex 메시지 전송 성공');
            return true;
            
        } catch (error) {
            this.logger.error && this.logger.error('다날 Flex 메시지 전송 실패:', error.message);
            return false;
        }
    }

    // 유틸리티 메소드들
    getSeverityText(severity) {
        const severityMap = {
            'HIGH': '높음 🔴',
            'MEDIUM': '보통 🟡',
            'LOW': '낮음 🟢'
        };
        return severityMap[severity] || severity;
    }

    getSignalEmoji(signal) {
        if (!signal) return '';
        
        const emojiMap = {
            'BULLISH': '🟢',
            'BEARISH': '🔴',
            'OVERBOUGHT': '⚠️',
            'OVERSOLD': '💎',
            'NEUTRAL': '🟡',
            'GOLDEN_CROSSOVER': '✨',
            'DEAD_CROSSOVER': '💀',
            'BULLISH_CROSSOVER': '🚀',
            'BEARISH_CROSSOVER': '📉'
        };
        
        for (const [key, emoji] of Object.entries(emojiMap)) {
            if (signal.includes(key)) return emoji;
        }
        
        return '';
    }

    getActionEmoji(action) {
        const actionMap = {
            'BUY': '💰',
            'SELL': '💸',
            'HOLD': '✋'
        };
        return actionMap[action] || '';
    }

    getActionColor(action) {
        const colorMap = {
            'BUY': '#228B22',
            'SELL': '#DC143C',
            'HOLD': '#FF8C00'
        };
        return colorMap[action] || '#333333';
    }

    formatTechnicalData(data, type) {
        const details = [];
        
        try {
            if (type.includes('RSI') && typeof data.rsi === 'number') {
                details.push({
                    label: 'RSI 값',
                    value: data.rsi.toFixed(1)
                });
            }
            
            if (type.includes('MACD') && data.macd) {
                details.push({
                    label: 'MACD',
                    value: data.macd.toFixed(4)
                });
            }
            
            if (type.includes('BOLLINGER') && data.position) {
                details.push({
                    label: '밴드 위치',
                    value: `${(data.position * 100).toFixed(1)}%`
                });
            }
            
        } catch (error) {
            // 오류 무시
        }
        
        return details;
    }
}

module.exports = DanalFlexIntegration;