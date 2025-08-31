const PaycoinVolumeAnalyzer = require('./paycoin-volume-analyzer');
const PaycoinTechnicalIndicators = require('./paycoin-technical-indicators');
const AdvancedTechnicalIndicators = require('./advanced-technical-indicators');

class PaycoinAlertSystem {
    constructor() {
        this.volumeAnalyzer = new PaycoinVolumeAnalyzer();
        this.technicalIndicators = new PaycoinTechnicalIndicators();
        this.advancedIndicators = new AdvancedTechnicalIndicators();
        
        // 알림 설정
        this.alertConfig = {
            // 거래량 알림 설정
            volume: {
                enabled: true,
                spikeThreshold: 3.0,      // 평균 대비 3배 이상
                minVolume: 1000000,       // 최소 100만 PCI
                cooldown: 30 * 60 * 1000  // 30분 쿨다운
            },
            
            // 기술적 지표 알림 설정
            technical: {
                enabled: true,
                rsi: {
                    overbought: 75,           // RSI 75 이상 (과매수)
                    oversold: 25              // RSI 25 이하 (과매도)
                },
                movingAverage: {
                    goldenCross: true,        // 골든크로스 알림
                    deadCross: true           // 데드크로스 알림
                },
                bollingerBands: {
                    upperBreakout: true,      // 상단 밴드 돌파
                    lowerBreakout: true       // 하단 밴드 돌파
                }
            },
            
            // 고급 기술지표 알림 설정
            advanced: {
                enabled: true,
                macd: {
                    crossoverAlert: true,     // MACD 크로스오버
                    divergenceAlert: true     // 다이버전스
                },
                stochastic: {
                    extremeAlert: true,       // 극단값 (과매수/과매도)
                    crossoverAlert: true      // %K/%D 크로스오버
                },
                fibonacci: {
                    levelAlert: true,         // 주요 레벨 근접
                    breakoutAlert: true       // 레벨 돌파
                },
                ichimoku: {
                    cloudAlert: true,         // 구름 돌파
                    crossoverAlert: true      // 전환선/기준선 크로스
                },
                williams: {
                    extremeAlert: true        // 극단값 알림
                },
                cci: {
                    extremeAlert: true        // 극단값 알림
                },
                obv: {
                    divergenceAlert: true,     // 다이버전스
                    minConfidence: 0.7,        // 최소 신뢰도 70%
                    cooldownHours: 6           // 6시간 쿨다운
                },
                vwap: {
                    deviationAlert: true,     // VWAP 이탈
                    cooldownHours: 3          // 3시간 쿨다운 (VWAP 알림 빈도 감소)
                },
                cooldown: 45 * 60 * 1000     // 45분 쿨다운
            },
            
            // 종합 분석 알림
            overall: {
                enabled: true,
                strongSignalOnly: false,    // 강한 시그널만 알림
                advancedAnalysis: true      // 고급 분석 포함
            }
        };
        
        this.lastAlerts = {
            volume: 0,
            rsi: 0,
            ma: 0,
            bb: 0,
            overall: 0,
            advanced: 0
        };
        
        // 기본 지표별 마지막 상태 추적 (중복 방지용)
        this.lastIndicatorStates = {
            rsi: { lastValue: null, lastSignal: null },
            ma: { lastCross: null, ma5: null, ma20: null },
            bb: { lastPosition: null, lastPrice: null },
            volume: { lastRatio: null, lastAlert: 0 }
        };
        
        // 고급 지표별 마지막 알림 상태 추적
        this.advancedAlertStates = {
            macd: { lastSignal: null, lastAlert: 0 },
            stochastic: { lastSignal: null, lastAlert: 0 },
            fibonacci: { lastLevel: null, lastPrice: null, lastAlert: 0 },
            ichimoku: { lastSignal: null, lastCloudColor: null, lastAlert: 0 },
            obv: { lastDivergence: null, lastAlert: 0 },
            vwap: { lastDeviation: null, lastAlert: 0 }
        };
        
        // 상태 파일 경로
        this.stateFile = 'paycoin_alert_states.json';
        
        // 상태 로드
        this.loadAlertStates();
        
        this.monitoringInterval = null;
    }
    
    // 🚨 페이코인 통합 알림 생성
    async generatePaycoinAlerts() {
        console.log('🪙 페이코인 통합 기술분석 알림 시스템 시작...');
        console.log('📊 분석 항목: 거래량 급증, RSI 과매수/과매도, 이동평균 골든/데드크로스, 볼린저밴드 돌파');
        console.log('⚙️ 알림 설정: 거래량 임계값 2배, RSI 70/30, 볼린저밴드 상하단 돌파\n');
        
        const alerts = [];
        const now = Date.now();
        
        try {
            // 1. 거래량 분석
            console.log('🔍 [1/4] 페이코인 거래량 분석 중...');
            if (this.alertConfig.volume.enabled) {
                const volumeData = await this.volumeAnalyzer.fetchPaycoinData();
                if (volumeData) {
                    const volumeAnalysis = this.volumeAnalyzer.analyzeVolumeSpike(volumeData);
                    console.log(`📈 현재 거래량: ${volumeData.volume24h?.toLocaleString() || 'N/A'}, 평균 대비: ${volumeAnalysis.volumeRatio?.toFixed(2) || 'N/A'}배`);
                    
                    if (volumeAnalysis.isSpike && 
                        volumeAnalysis.volumeRatio >= this.alertConfig.volume.spikeThreshold &&
                        volumeData.volume24h >= this.alertConfig.volume.minVolume &&
                        now - this.lastAlerts.volume > this.alertConfig.volume.cooldown) {
                        
                        const alert = this.createVolumeAlert(volumeAnalysis, volumeData);
                        alerts.push(alert);
                        this.lastAlerts.volume = now;
                        console.log(`🔥 거래량 급증 알림 생성! (${volumeAnalysis.volumeRatio.toFixed(1)}배 증가)`);
                    } else {
                        console.log('📊 거래량: 정상 범위 내');
                    }
                } else {
                    console.log('⚠️ 거래량 데이터 조회 실패');
                }
            } else {
                console.log('⏸️ 거래량 분석 비활성화됨');
            }
            
            // 2. 기술적 지표 분석
            console.log('\n🔍 [2/4] 페이코인 기술적 지표 분석 중...');
            if (this.alertConfig.technical.enabled) {
                const technicalAnalysis = await this.technicalIndicators.performFullAnalysis();
                
                if (technicalAnalysis) {
                    console.log(`📊 현재 RSI: ${typeof technicalAnalysis.rsi === 'number' ? technicalAnalysis.rsi.toFixed(2) : 'N/A'}`);
                    console.log(`📊 이동평균선: MA5(${typeof technicalAnalysis.movingAverages?.ma5 === 'number' ? technicalAnalysis.movingAverages.ma5.toFixed(0) : 'N/A'}) MA20(${typeof technicalAnalysis.movingAverages?.ma20 === 'number' ? technicalAnalysis.movingAverages.ma20.toFixed(0) : 'N/A'})`);
                    console.log(`📊 볼린저밴드: 상단(${typeof technicalAnalysis.bollingerBands?.upper === 'number' ? technicalAnalysis.bollingerBands.upper.toFixed(0) : 'N/A'}) 하단(${typeof technicalAnalysis.bollingerBands?.lower === 'number' ? technicalAnalysis.bollingerBands.lower.toFixed(0) : 'N/A'})`);
                    
                    // RSI 알림
                    const rsiAlert = this.checkRSIAlert(technicalAnalysis, now);
                    if (rsiAlert) {
                        alerts.push(rsiAlert);
                        this.lastAlerts.rsi = now;
                        console.log(`🔴 RSI 기술적 분석 알림 생성! (RSI: ${typeof technicalAnalysis.rsi === 'number' ? technicalAnalysis.rsi.toFixed(2) : 'N/A'})`);
                    } else {
                        console.log('📊 RSI: 정상 범위 내 (30-70)');
                    }
                    
                    // 이동평균 알림
                    const maAlert = this.checkMovingAverageAlert(technicalAnalysis.movingAverages, now);
                    if (maAlert) {
                        alerts.push(maAlert);
                        this.lastAlerts.ma = now;
                        const crossType = maAlert.type.includes('golden') ? '골든크로스' : '데드크로스';
                        const ma5 = typeof technicalAnalysis.movingAverages?.ma5 === 'number' ? technicalAnalysis.movingAverages.ma5.toFixed(0) : 'N/A';
                        const ma20 = typeof technicalAnalysis.movingAverages?.ma20 === 'number' ? technicalAnalysis.movingAverages.ma20.toFixed(0) : 'N/A';
                        console.log(`🌟 이동평균 ${crossType} 알림 생성! (MA5: ${ma5}, MA20: ${ma20})`);
                    } else {
                        console.log('📊 이동평균선: 정상 상태 (크로스오버 없음)');
                    }
                    
                    // 볼린저 밴드 알림
                    const bbAlert = this.checkBollingerBandAlert(technicalAnalysis.bollingerBands, now);
                    if (bbAlert) {
                        alerts.push(bbAlert);
                        this.lastAlerts.bb = now;
                        const bandType = bbAlert.type.includes('upper') ? '상단 돌파' : '하단 이탈';
                        const currentPrice = typeof technicalAnalysis.currentPrice === 'number' ? technicalAnalysis.currentPrice.toFixed(0) : 'N/A';
                        console.log(`🚀 볼린저밴드 ${bandType} 알림 생성! (현재가: ${currentPrice})`);
                    } else {
                        console.log('📊 볼린저밴드: 정상 범위 내');
                    }
                    
                    // 종합 분석 알림
                    if (this.alertConfig.overall.enabled) {
                        const overallAlert = this.checkOverallSignalAlert(technicalAnalysis.overallSignal, now);
                        if (overallAlert) {
                            alerts.push(overallAlert);
                            this.lastAlerts.overall = now;
                            const sentiment = technicalAnalysis.overallSignal?.sentiment || technicalAnalysis.overallSignal || 'N/A';
                            console.log(`🎯 종합 기술적 분석 알림 생성! (신호: ${sentiment})`);
                        } else {
                            console.log('📊 종합 분석: 중립적 신호');
                        }
                    }
                } else {
                    console.log('⚠️ 기술적 지표 데이터 조회 실패');
                }
            } else {
                console.log('⏸️ 기술적 지표 분석 비활성화됨');
            }
            
            // 3. 고급 기술지표 분석
            console.log('\n🔍 [3/4] 페이코인 고급 기술지표 분석 중...');
            if (this.alertConfig.advanced.enabled && 
                now - this.lastAlerts.advanced > this.alertConfig.advanced.cooldown) {
                const advancedAnalysis = await this.advancedIndicators.performAdvancedAnalysis();
                
                if (advancedAnalysis && advancedAnalysis.advanced) {
                    console.log('📊 MACD, 스토캐스틱, 피보나치, 일목균형표, OBV, VWAP 분석 완료');
                    const signalStrength = advancedAnalysis.advanced?.signalStrength || 'N/A';
                    const confidence = advancedAnalysis.advanced?.confidence || 'N/A';
                    console.log(`📊 고급 신호 강도: ${signalStrength}`);
                    console.log(`📊 고급 신뢰도: ${confidence}`);
                    
                    const advancedAlerts = this.checkAdvancedIndicatorAlerts(advancedAnalysis.advanced, now);
                    if (advancedAlerts.length > 0) {
                        alerts.push(...advancedAlerts);
                        this.lastAlerts.advanced = now;
                        console.log(`🔬 고급 기술지표 알림 ${advancedAlerts.length}개 생성 (${advancedAlerts.map(a => a.type.replace('paycoin_advanced_', '')).join(', ')})`);
                    } else {
                        console.log('📊 고급 기술지표: 알림 조건 미달성');
                    }
                } else {
                    console.log('⚠️ 고급 기술지표 데이터 조회 실패');
                }
            } else {
                console.log('⏸️ 고급 기술지표 분석 비활성화됨 또는 쿨다운 중');
            }
            
        } catch (error) {
            console.error(`❌ 알림 생성 오류: ${error.message}`);
        }
        
        console.log('\n🔍 [4/4] 페이코인 알림 생성 결과 집계 중...');
        if (alerts.length > 0) {
            console.log(`🚨 총 ${alerts.length}개 알림 생성됨:`);
            alerts.forEach((alert, index) => {
                const alertTypeKr = {
                    'paycoin_volume_spike': '거래량 급증',
                    'paycoin_rsi_overbought': 'RSI 과매수',
                    'paycoin_rsi_oversold': 'RSI 과매도',
                    'paycoin_golden_cross': '골든크로스',
                    'paycoin_dead_cross': '데드크로스',
                    'paycoin_bb_upper_breakout': '볼린저밴드 상단돌파',
                    'paycoin_bb_lower_breakout': '볼린저밴드 하단돌파',
                    'paycoin_overall_signal': '종합분석신호'
                };
                const typeKr = alertTypeKr[alert.type] || alert.type;
                console.log(`   ${index + 1}. ${typeKr} - ${alert.title}`);
            });
        } else {
            console.log('😌 현재 알림 조건을 만족하는 상황 없음 (모든 지표가 정상 범위 내)');
        }
        
        console.log('\n✅ 페이코인 통합 기술분석 알림 시스템 완료\n');
        
        return alerts;
    }
    
    // 📊 거래량 알림 생성
    createVolumeAlert(volumeAnalysis, volumeData) {
        const emoji = this.volumeAnalyzer.getVolumeEmoji(volumeAnalysis.volumeRatio, volumeData.changeRate);
        
        return {
            type: 'paycoin_volume_spike',
            title: `${emoji} 페이코인 거래량 ${volumeAnalysis.volumeRatio.toFixed(1)}배 급증!`,
            message: [
                `💰 현재가: ${volumeData.price.toLocaleString()}원`,
                `📈 24h 변동: ${volumeData.changeRate > 0 ? '+' : ''}${volumeData.changeRate.toFixed(2)}%`,
                `📊 24h 거래량: ${volumeData.volume24h.toLocaleString()} PCI`,
                `⚡ 거래량 급증: 평균 대비 ${volumeAnalysis.volumeRatio.toFixed(1)}배`,
                `💵 24h 거래대금: ${(volumeData.volumeValue24h/100000000).toFixed(1)}억원`,
                `🎯 신뢰도: ${volumeAnalysis.confidence}%`,
                ``,
                `📖 거래량 분석 해설:`,
                `• 거래량 급증은 주요 뉴스나 시장 관심 증가를 의미`,
                `• 평균 대비 2배 이상 시 단기 변동성 증가 가능`,
                `• 가격 상승과 함께 거래량 증가 = 상승 모멘텀 강화`,
                `• 가격 하락과 함께 거래량 증가 = 매도 압력 증가`,
                ``,
                `🔍 급증 사유: ${volumeAnalysis.reasons.join(', ')}`
            ].join('\n'),
            level: volumeAnalysis.confidence >= 80 ? 'high' : volumeAnalysis.confidence >= 60 ? 'medium' : 'low',
            timestamp: Date.now(),
            data: { volumeAnalysis, volumeData }
        };
    }
    
    // 📊 RSI 알림 체크
    checkRSIAlert(technicalAnalysis, now) {
        if (!technicalAnalysis || typeof technicalAnalysis.rsi !== 'number') return null;
        
        const rsi = technicalAnalysis.rsi;
        const rsiState = this.lastIndicatorStates.rsi;
        
        // RSI 신호 판단
        let signal = 'neutral';
        if (rsi >= this.alertConfig.technical.rsi.overbought) {
            signal = 'overbought';
        } else if (rsi <= this.alertConfig.technical.rsi.oversold) {
            signal = 'oversold';
        }
        
        // 중복 방지: 같은 신호이고 RSI 값이 크게 변하지 않았으면 패스
        const rsiChangeThreshold = 5; // RSI 5 이상 변화 시에만 알림
        const timeCooldown = 2 * 60 * 60 * 1000; // 2시간 쿨다운
        
        if (rsiState.lastSignal === signal && 
            rsiState.lastValue !== null &&
            Math.abs(rsi - rsiState.lastValue) < rsiChangeThreshold &&
            now - this.lastAlerts.rsi < timeCooldown) {
            return null;
        }
        
        if (signal === 'overbought' && rsi >= this.alertConfig.technical.rsi.overbought) {
            // 상태 업데이트
            rsiState.lastValue = rsi;
            rsiState.lastSignal = signal;
            this.lastAlerts.rsi = now;
            
            return {
                type: 'paycoin_rsi_overbought',
                title: '🔴 페이코인 RSI 과매수 신호!',
                message: [
                    `📊 RSI: ${rsi.toFixed(2)} (${this.alertConfig.technical.rsi.overbought} 이상)`,
                    `⚠️ 과매수 구간 진입 - 단기 조정 신호`,
                    ``,
                    `📖 RSI 과매수 구간 해설:`,
                    `• RSI 70 이상 = 과도한 매수세, 조정 가능성 높음`,
                    `• 단기 매도 타이밍 또는 관망 구간`,
                    `• 80 이상 시 강력한 조정 압력 예상`,
                    `• 지지선 근처에서 재매수 기회 대기 권장`,
                    ``,
                    `💡 투자 전략: 단기 이익실현 고려, 추가 매수 자제`
                ].join('\n'),
                level: 'medium',
                timestamp: now
            };
        }
        
        if (signal === 'oversold' && rsi <= this.alertConfig.technical.rsi.oversold) {
            // 상태 업데이트
            rsiState.lastValue = rsi;
            rsiState.lastSignal = signal;
            this.lastAlerts.rsi = now;
            
            return {
                type: 'paycoin_rsi_oversold',
                title: '🟢 페이코인 RSI 과매도 신호!',
                message: [
                    `📊 RSI: ${rsi.toFixed(2)} (${this.alertConfig.technical.rsi.oversold} 이하)`,
                    `💎 과매도 구간 진입 - 반등 신호`,
                    ``,
                    `📖 RSI 과매도 구간 해설:`,
                    `• RSI 30 이하 = 과도한 매도세, 반등 가능성 높음`,
                    `• 단기 매수 타이밍 포착 구간`,
                    `• 20 이하 시 강력한 반등 모멘텀 예상`,
                    `• 분할 매수를 통한 평균단가 낮추기 전략 유효`,
                    ``,
                    `💡 투자 전략: 단기 매수 기회, 손절매 준비 필수`
                ].join('\n'),
                level: 'medium',
                timestamp: now
            };
        }
        
        return null;
    }
    
    // 📈 이동평균 알림 체크
    checkMovingAverageAlert(maData, now) {
        if (!maData.mas || maData.signal === 'insufficient_data') return null;
        if (now - this.lastAlerts.ma < 4 * 60 * 60 * 1000) return null; // 4시간 쿨다운
        
        const { signal, mas, currentPrice, alignment } = maData;
        
        if (signal === 'golden_cross' && this.alertConfig.technical.movingAverage.goldenCross) {
            return {
                type: 'paycoin_golden_cross',
                title: '🌟 페이코인 골든크로스 발생!',
                message: [
                    `📈 단기(${mas.short.period}일) 이평이 중기(${mas.medium.period}일) 이평을 상향 돌파`,
                    `💰 현재가: ${currentPrice.toFixed(2)}원`,
                    `📊 단기 이평: ${mas.short.value.toFixed(2)}원`,
                    `📊 중기 이평: ${mas.medium.value.toFixed(2)}원`,
                    `📊 장기 이평: ${mas.long.value.toFixed(2)}원`,
                    ``,
                    `📖 골든크로스 해설:`,
                    `• 단기 이평선이 장기 이평선을 위로 뚫고 올라가는 현상`,
                    `• 강력한 상승 추세 전환 신호로 인식`,
                    `• 매수 타이밍으로 활용되는 대표적 기술적 신호`,
                    `• 거래량 증가 동반 시 신뢰도 ↑`,
                    ``,
                    `💡 투자 전략: 상승 모멘텀 포착, 목표가 설정 후 진입`
                ].join('\n'),
                level: 'high',
                timestamp: now
            };
        }
        
        if (signal === 'dead_cross' && this.alertConfig.technical.movingAverage.deadCross) {
            return {
                type: 'paycoin_dead_cross',
                title: '⚠️ 페이코인 데드크로스 발생!',
                message: [
                    `📉 단기(${mas.short.period}일) 이평이 중기(${mas.medium.period}일) 이평을 하향 돌파`,
                    `💰 현재가: ${currentPrice.toFixed(2)}원`,
                    `📊 단기 이평: ${mas.short.value.toFixed(2)}원`,
                    `📊 중기 이평: ${mas.medium.value.toFixed(2)}원`,
                    `📊 장기 이평: ${mas.long.value.toFixed(2)}원`,
                    ``,
                    `📖 데드크로스 해설:`,
                    `• 단기 이평선이 장기 이평선을 아래로 뚫고 내려가는 현상`,
                    `• 하락 추세 전환 신호로 해석`,
                    `• 매도 타이밍 또는 관망 신호로 활용`,
                    `• 추가 하락 압력 가능성 높음`,
                    ``,
                    `💡 투자 전략: 손절매 고려, 지지선 확인 후 재진입`
                ].join('\n'),
                level: 'medium',
                timestamp: now
            };
        }
        
        return null;
    }
    
    // 📊 볼린저 밴드 알림 체크
    checkBollingerBandAlert(bbData, now) {
        if (!bbData.bb || bbData.signal === 'insufficient_data') return null;
        if (now - this.lastAlerts.bb < 2 * 60 * 60 * 1000) return null; // 2시간 쿨다운
        
        const { signal, bb, currentPrice, position, volatility } = bbData;
        
        if (signal === 'overbought' && position === 'upper' && this.alertConfig.technical.bollingerBands.upperBreakout) {
            return {
                type: 'paycoin_bb_upper_breakout',
                title: '🚀 페이코인 볼린저 밴드 상단 돌파!',
                message: [
                    `📊 현재가: ${currentPrice.toFixed(2)}원`,
                    `📈 상단 밴드: ${bb.upper.toFixed(2)}원 돌파`,
                    `📊 중간선: ${bb.middle.toFixed(2)}원`,
                    `📉 하단 밴드: ${bb.lower.toFixed(2)}원`,
                    `📊 변동성: ${volatility} (밴드폭 ${bb.bandwidth.toFixed(2)}%)`,
                    ``,
                    `📖 볼린저 밴드 상단 돌파 해설:`,
                    `• 강력한 상승 모멘텀과 매수 압력을 의미`,
                    `• 단기적 과열 상태, 조정 가능성도 존재`,
                    `• 밴드폭 확장 시 = 변동성 증가, 추세 강화`,
                    `• 거래량 동반 시 신뢰도 ↑`,
                    ``,
                    `💡 투자 전략: 단기 수익실현 고려, 저항선 돌파 확인`
                ].join('\n'),
                level: 'high',
                timestamp: now
            };
        }
        
        if (signal === 'oversold' && position === 'lower' && this.alertConfig.technical.bollingerBands.lowerBreakout) {
            return {
                type: 'paycoin_bb_lower_breakout',
                title: '💎 페이코인 볼린저 밴드 하단 터치!',
                message: [
                    `📊 현재가: ${currentPrice.toFixed(2)}원`,
                    `📈 상단 밴드: ${bb.upper.toFixed(2)}원`,
                    `📊 중간선: ${bb.middle.toFixed(2)}원`,
                    `📉 하단 밴드: ${bb.lower.toFixed(2)}원 터치`,
                    `📊 변동성: ${volatility} (밴드폭 ${bb.bandwidth.toFixed(2)}%)`,
                    ``,
                    `📖 볼린저 밴드 하단 터치 해설:`,
                    `• 과매도 구간으로 반등 가능성을 시사`,
                    `• 지지선 역할, 매수 타이밍 포착 구간`,
                    `• 밴드폭 수축 시 = 변동성 감소, 박스권 진입`,
                    `• 하단 이탈 시 추가 하락 가능성 주의`,
                    ``,
                    `💡 투자 전략: 분할 매수 전략, 손절매 라인 설정`
                ].join('\n'),
                level: 'medium',
                timestamp: now
            };
        }
        
        return null;
    }
    
    // 🎯 종합 시그널 알림 체크
    checkOverallSignalAlert(overallSignal, now) {
        if (now - this.lastAlerts.overall < 6 * 60 * 60 * 1000) return null; // 6시간 쿨다운
        
        // 강한 시그널만 알림 설정이 켜져 있으면
        if (this.alertConfig.overall.strongSignalOnly && 
            !['strong_bullish', 'strong_bearish'].includes(overallSignal)) {
            return null;
        }
        
        const signalData = {
            'strong_bullish': {
                title: '🚀 페이코인 강한 상승 시그널!',
                message: [
                    '📊 여러 기술적 지표가 강한 상승 신호를 보이고 있습니다',
                    '',
                    '📖 종합 분석 해설:',
                    '• RSI, 이동평균, 볼린저밴드, 거래량 종합 분석 결과',
                    '• 3개 이상 지표가 동시에 상승 신호 = 강한 상승',
                    '• 단기~중기 상승 모멘텀 기대 가능',
                    '• 목표가 설정 후 진입 전략 권장',
                    '',
                    '💡 투자 전략: 적극적 매수 타이밍, 분할 진입 고려'
                ].join('\n'),
                level: 'high'
            },
            'bullish': {
                title: '📈 페이코인 상승 시그널',
                message: [
                    '📊 기술적 지표들이 상승 신호를 보이고 있습니다',
                    '',
                    '📖 종합 분석 해설:',
                    '• 2개 이상 지표에서 상승 신호 감지',
                    '• 단기 상승 가능성 존재',
                    '• 신중한 매수 타이밍 포착 구간',
                    '',
                    '💡 투자 전략: 보수적 매수, 리스크 관리 필수'
                ].join('\n'),
                level: 'medium'
            },
            'strong_bearish': {
                title: '💀 페이코인 강한 하락 시그널!',
                message: [
                    '📊 여러 기술적 지표가 강한 하락 신호를 보이고 있습니다',
                    '',
                    '📖 종합 분석 해설:',
                    '• 3개 이상 지표가 동시에 하락 신호 = 강한 하락',
                    '• 단기~중기 하락 압력 예상',
                    '• 손절매 또는 관망 권장 구간',
                    '• 지지선 확인 후 재진입 고려',
                    '',
                    '💡 투자 전략: 매도 또는 관망, 추가 매수 자제'
                ].join('\n'),
                level: 'high'
            },
            'bearish': {
                title: '📉 페이코인 하락 시그널',
                message: [
                    '📊 기술적 지표들이 하락 신호를 보이고 있습니다',
                    '',
                    '📖 종합 분석 해설:',
                    '• 2개 이상 지표에서 하락 신호 감지',
                    '• 단기 조정 가능성 존재',
                    '• 신중한 매도 타이밍 고려 구간',
                    '',
                    '💡 투자 전략: 보수적 관망, 손절매 준비'
                ].join('\n'),
                level: 'medium'
            }
        };
        
        const signal = signalData[overallSignal];
        if (signal) {
            return {
                type: 'paycoin_overall_signal',
                title: signal.title,
                message: signal.message,
                level: signal.level,
                timestamp: now
            };
        }
        
        return null;
    }
    
    // 🔄 자동 모니터링 시작
    startAutoMonitoring(intervalMinutes = 10) {
        console.log(`🎯 페이코인 기술분석 자동 모니터링 시작 (${intervalMinutes}분 간격)`);
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        this.monitoringInterval = setInterval(async () => {
            try {
                console.log(`\n${'='.repeat(80)}`);
                console.log(`🪙 ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} - 페이코인 기술분석 알림 체크`);
                
                const alerts = await this.generatePaycoinAlerts();
                
                // 알림이 있으면 처리 (여기서는 콘솔 출력)
                for (const alert of alerts) {
                    console.log(`\n🚨 [${alert.level.toUpperCase()}] ${alert.title}`);
                    console.log(alert.message);
                    console.log(`⏰ ${new Date(alert.timestamp).toLocaleString('ko-KR')}`);
                    
                    // TODO: 실제 알림 전송 (네이버 웍스, 슬랙 등)
                    // await this.sendAlert(alert);
                }
                
            } catch (error) {
                console.error(`❌ 자동 모니터링 오류: ${error.message}`);
            }
        }, intervalMinutes * 60 * 1000);
        
        // 첫 실행
        setTimeout(() => {
            this.generatePaycoinAlerts();
        }, 5000);
        
        return this.monitoringInterval;
    }
    
    // 🛑 자동 모니터링 중지
    stopAutoMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('⏹️ 페이코인 기술분석 자동 모니터링 중지');
        }
    }
    
    // 🔬 고급 기술지표 알림 체크
    checkAdvancedIndicatorAlerts(advancedData, now) {
        const alerts = [];
        
        try {
            // MACD 알림
            if (this.alertConfig.advanced.macd.crossoverAlert && advancedData.macd) {
                const macd = advancedData.macd;
                if (macd.crossover === 'golden') {
                    alerts.push(this.createAdvancedAlert('macd_golden_cross', {
                        title: '🌟 페이코인 MACD 골든크로스 발생!',
                        message: [
                            `📊 MACD Line: ${macd.macd.line.toFixed(4)}`,
                            `📊 Signal Line: ${macd.macd.signal.toFixed(4)}`,
                            `📊 Histogram: ${macd.macd.histogram.toFixed(4)}`,
                            ``,
                            `📖 MACD 골든크로스 해설:`,
                            `• MACD 라인이 시그널 라인을 상향 돌파`,
                            `• 단기 모멘텀이 중장기 추세를 뛰어넘음`,
                            `• 히스토그램 양수 전환 = 상승 가속화`,
                            `• 이동평균 기반 지표로 추세 변화 선행 신호`,
                            `• 0선 위에서 발생 시 더 강한 신호`,
                            ``,
                            `💡 투자 전략: 추세 전환 포착, 목표가 설정 후 진입`
                        ].join('\n'),
                        level: 'high',
                        data: { macd }
                    }));
                } else if (macd.crossover === 'dead') {
                    alerts.push(this.createAdvancedAlert('macd_dead_cross', {
                        title: '⚠️ 페이코인 MACD 데드크로스 발생!',
                        message: [
                            `📊 MACD Line: ${macd.macd.line.toFixed(4)}`,
                            `📊 Signal Line: ${macd.macd.signal.toFixed(4)}`,
                            `📊 Histogram: ${macd.macd.histogram.toFixed(4)}`,
                            ``,
                            `📖 MACD 데드크로스 해설:`,
                            `• MACD 라인이 시그널 라인을 하향 돌파`,
                            `• 단기 모멘텀이 중장기 추세 아래로 약화`,
                            `• 히스토그램 음수 전환 = 하락 가속화`,
                            `• 추세 반전 또는 조정 시작 신호`,
                            `• 0선 아래에서 발생 시 더 강한 하락 신호`,
                            ``,
                            `💡 투자 전략: 손절매 고려, 반등 확인 후 재진입`
                        ].join('\n'),
                        level: 'medium',
                        data: { macd }
                    }));
                }
            }
            
            // 스토캐스틱 알림
            if (this.alertConfig.advanced.stochastic.extremeAlert && advancedData.stochastic) {
                const stoch = advancedData.stochastic;
                if (stoch.oversold) {
                    alerts.push(this.createAdvancedAlert('stochastic_oversold', {
                        title: '💎 페이코인 스토캐스틱 과매도 신호!',
                        message: [
                            `📊 %K: ${stoch.stochastic.k.toFixed(2)}`,
                            `📊 %D: ${stoch.stochastic.d.toFixed(2)}`,
                            `💎 과매도 구간 진입 (20 이하)`,
                            ``,
                            `📖 스토캐스틱 과매도 해설:`,
                            `• 일정 기간 내 가격 변동폭에서 현재가의 상대적 위치`,
                            `• %K < 20 = 과매도, 단기 반등 가능성 높음`,
                            `• %D는 %K의 평활화된 값, 신호 확인용`,
                            `• %K가 %D를 상향 돌파 시 매수 신호 강화`,
                            `• RSI보다 민감한 반응, 단기 매매에 유용`,
                            ``,
                            `💡 투자 전략: 20 이하에서 매수 대기, 상향 돌파 시 진입`
                        ].join('\n'),
                        level: 'medium',
                        data: { stoch }
                    }));
                } else if (stoch.overbought) {
                    alerts.push(this.createAdvancedAlert('stochastic_overbought', {
                        title: '🔴 페이코인 스토캐스틱 과매수 경고!',
                        message: [
                            `📊 %K: ${stoch.stochastic.k.toFixed(2)}`,
                            `📊 %D: ${stoch.stochastic.d.toFixed(2)}`,
                            `⚠️ 과매수 구간 진입 (80 이상)`,
                            ``,
                            `📖 스토캐스틱 과매수 해설:`,
                            `• %K > 80 = 과매수, 단기 조정 가능성 높음`,
                            `• 가격이 최근 변동폭의 상위권에서 형성`,
                            `• %K가 %D를 하향 돌파 시 매도 신호 강화`,
                            `• 다이버전스 발생 시 추세 반전 가능성 ↑`,
                            `• 단기 오버슈팅 상황 경고`,
                            ``,
                            `💡 투자 전략: 80 이상에서 수익실현, 하향 돌파 시 매도`
                        ].join('\n'),
                        level: 'medium',
                        data: { stoch }
                    }));
                }
            }
            
            // 피보나치 알림 (상태 변화 감지)
            if (this.alertConfig.advanced.fibonacci.levelAlert && advancedData.fibonacci) {
                const fib = advancedData.fibonacci;
                const fibState = this.advancedAlertStates.fibonacci;
                
                // 레벨 근접 체크 (더 엄격한 기준 적용)
                if (fib.nearestLevel && Math.abs(fib.fibonacci.currentPrice - fib.nearestLevel.price) / fib.nearestLevel.price < 0.015) {
                    const levelType = ['strong_support', 'support'].includes(fib.signal) ? '지지' : 
                                     ['strong_resistance', 'resistance'].includes(fib.signal) ? '저항' : '주요';
                    
                    // 새로운 레벨이거나 가격이 크게 변했을 때만 알림 (더 엄격한 기준)
                    const isNewLevel = fibState.lastLevel !== fib.nearestLevel.name;
                    const priceChanged = !fibState.lastPrice || Math.abs(fib.fibonacci.currentPrice - fibState.lastPrice) / fibState.lastPrice > 0.025; // 2.5% 변화
                    const cooldownPassed = now - fibState.lastAlert > 4 * 60 * 60 * 1000; // 4시간 쿨다운
                    
                    if ((isNewLevel || priceChanged) && cooldownPassed) {
                        alerts.push(this.createAdvancedAlert('fibonacci_level', {
                            title: `🌀 페이코인 피보나치 ${levelType} 레벨 ${isNewLevel ? '신규 접근' : '재접근'}!`,
                            message: [
                                `📊 현재가: ${fib.fibonacci.currentPrice.toFixed(2)}원`,
                                `🎯 ${isNewLevel ? '신규' : ''} 레벨: ${fib.nearestLevel.name} (${fib.nearestLevel.price.toFixed(2)}원)`,
                                `📊 위치: ${fib.fibonacci.pricePosition.toFixed(1)}%`,
                                ``,
                                `📖 피보나치 ${levelType} 레벨 해설:`,
                                `• 피보나치 되돌림 = 자연계 황금비율을 주식에 적용`,
                                `• 주요 레벨: 23.6%, 38.2%, 50%, 61.8%, 78.6%`,
                                `• ${levelType} 레벨 = 기술적 반발/저항 구간`,
                                `• 61.8%(황금비율) 가장 중요, 50% 심리적 지지/저항`,
                                `• 레벨 근처에서 거래량 증가 일반적`,
                                ``,
                                `💡 투자 전략: ${levelType} 레벨 반응 확인 후 ${levelType === '지지' ? '매수' : '매도'} 고려`
                            ].join('\n'),
                            level: 'medium',
                            data: { fib }
                        }));
                        
                        // 상태 업데이트
                        fibState.lastLevel = fib.nearestLevel.name;
                        fibState.lastPrice = fib.fibonacci.currentPrice;
                        fibState.lastAlert = now;
                        this.saveAlertStates();
                    }
                }
            }
            
            // 이치모쿠 구름 알림 (상태 변화 감지)
            if (this.alertConfig.advanced.ichimoku.cloudAlert && advancedData.ichimoku) {
                const ichi = advancedData.ichimoku;
                const ichiState = this.advancedAlertStates.ichimoku;
                
                // 신호 변화 감지
                const currentSignal = ichi.signals.includes('above_cloud') && ichi.ichimoku.cloudColor === 'bullish' ? 'bullish' :
                                    ichi.signals.includes('below_cloud') && ichi.ichimoku.cloudColor === 'bearish' ? 'bearish' : null;
                
                if (currentSignal) {
                    const isNewSignal = ichiState.lastSignal !== currentSignal;
                    const isNewCloudColor = ichiState.lastCloudColor !== ichi.ichimoku.cloudColor;
                    const cooldownPassed = now - ichiState.lastAlert > 2 * 60 * 60 * 1000; // 2시간 쿨다운
                    
                    if ((isNewSignal || isNewCloudColor) && cooldownPassed) {
                        if (currentSignal === 'bullish') {
                            alerts.push(this.createAdvancedAlert('ichimoku_bullish', {
                                title: `☁️ 페이코인 일목균형표 ${isNewSignal ? '신규 ' : ''}강세 신호!`,
                                message: [
                                    `☁️ 가격이 강세 구름 위에서 거래${isNewSignal ? ' (신규 돌파!)' : ''}`,
                                    `📊 전환선: ${ichi.ichimoku.tenkanSen.toFixed(2)}원`,
                                    `📊 기준선: ${ichi.ichimoku.kijunSen.toFixed(2)}원`,
                                    `🟢 구름 색상: 상승 (${ichi.ichimoku.cloudColor})`,
                                    ``,
                                    `📖 일목균형표(Ichimoku) 해설:`,
                                    `• 일본에서 개발된 종합적 기술분석 지표`,
                                    `• 구름(Kumo) = 미래 지지/저항 구간을 나타냄`,
                                    `• 구름 위 = 강세, 구름 아래 = 약세`,
                                    `• 전환선 > 기준선 = 단기 상승 모멘텀`,
                                    `• 구름 색상 변화 = 중장기 추세 전환 신호`,
                                    ``,
                                    `💡 투자 전략: 구름 위 매수, 구름 아래 이탈 시 손절`
                                ].join('\n'),
                                level: 'high',
                                data: { ichi }
                            }));
                        } else if (currentSignal === 'bearish') {
                            alerts.push(this.createAdvancedAlert('ichimoku_bearish', {
                                title: `☁️ 페이코인 일목균형표 ${isNewSignal ? '신규 ' : ''}약세 신호!`,
                                message: [
                                    `☁️ 가격이 약세 구름 아래에서 거래${isNewSignal ? ' (신규 이탈!)' : ''}`,
                                    `📊 전환선: ${ichi.ichimoku.tenkanSen.toFixed(2)}원`,
                                    `📊 기준선: ${ichi.ichimoku.kijunSen.toFixed(2)}원`,
                                    `🔴 구름 색상: 하락 (${ichi.ichimoku.cloudColor})`,
                                    ``,
                                    `📖 일목균형표(Ichimoku) 해설:`,
                                    `• 구름 아래 거래 = 약세 추세 확인`,
                                    `• 전환선 < 기준선 = 단기 하락 모멘텀`,
                                    `• 구름이 저항선 역할, 반등 제한 요소`,
                                    `• 구름 색상 빨강 = 중장기 약세 신호`,
                                    `• 후행스팬이 가격 아래 = 추가 하락 압력`,
                                    ``,
                                    `💡 투자 전략: 구름 진입 시까지 관망, 손절매 유지`
                                ].join('\n'),
                                level: 'medium',
                                data: { ichi }
                            }));
                        }
                        
                        // 상태 업데이트
                        ichiState.lastSignal = currentSignal;
                        ichiState.lastCloudColor = ichi.ichimoku.cloudColor;
                        ichiState.lastAlert = now;
                        this.saveAlertStates();
                    }
                }
            }
            
            // OBV 다이버전스 알림 (쿨다운 및 중복 방지)
            if (this.alertConfig.advanced.obv.divergenceAlert && advancedData.obv) {
                const obv = advancedData.obv;
                const obvState = this.advancedAlertStates.obv;
                
                // OBV 다이버전스는 의미있는 변화일 때만 알림 (6시간 쿨다운, 신뢰도 체크)
                const obvCooldown = this.alertConfig.advanced.obv.cooldownHours * 60 * 60 * 1000;
                const canAlert = now - obvState.lastAlert > obvCooldown;
                const isNewSignal = obvState.lastDivergence !== obv.signal;
                const hasHighConfidence = (obv.confidence || 0) >= this.alertConfig.advanced.obv.minConfidence;
                
                console.log(`📊 OBV 다이버전스 체크: 신호=${obv.signal}, 신뢰도=${((obv.confidence || 0) * 100).toFixed(0)}%, 쿨다운=${canAlert}, 새신호=${isNewSignal}, 고신뢰=${hasHighConfidence}`);
                
                if (canAlert && isNewSignal && hasHighConfidence && obv.signal === 'bullish_divergence') {
                    alerts.push(this.createAdvancedAlert('obv_bullish_divergence', {
                        title: '💡 페이코인 OBV 상승 다이버전스 발생!',
                        message: [
                            `📊 OBV: ${obv.obv.toLocaleString()}`,
                            `📈 거래량 추세: ${obv.trend === 'increasing' ? '증가' : '감소'}`,
                            `🎯 신뢰도: ${((obv.confidence || 0) * 100).toFixed(0)}%`,
                            ``,
                            `📖 OBV 상승 다이버전스 해설:`,
                            `• On-Balance Volume = 거래량과 가격 변화 관계 분석`,
                            `• 가격 하락 + OBV 상승 = 매수세 유입 신호`,
                            `• 스마트머니가 저가 매집하고 있을 가능성`,
                            `• 추세 반전의 선행 지표로 활용`,
                            `• 다른 기술지표와 조합 시 신뢰도 ↑`,
                            ``,
                            `💡 투자 전략: 추가 상승 신호 확인 후 진입 고려`
                        ].join('\n'),
                        level: 'medium',
                        data: { obv }
                    }));
                    
                    // 상태 업데이트
                    obvState.lastDivergence = obv.signal;
                    obvState.lastAlert = now;
                    this.saveAlertStates();
                    
                } else if (canAlert && isNewSignal && hasHighConfidence && obv.signal === 'bearish_divergence') {
                    alerts.push(this.createAdvancedAlert('obv_bearish_divergence', {
                        title: '⚠️ 페이코인 OBV 하락 다이버전스 경고!',
                        message: [
                            `📊 OBV: ${obv.obv.toLocaleString()}`,
                            `📉 거래량 추세: ${obv.trend === 'increasing' ? '증가' : '감소'}`,
                            `🎯 신뢰도: ${((obv.confidence || 0) * 100).toFixed(0)}%`,
                            ``,
                            `📖 OBV 하락 다이버전스 해설:`,
                            `• 가격 상승 + OBV 하락 = 매도세 증가 신호`,
                            `• 상승 모멘텀이 약화되고 있음을 시사`,
                            `• 기관/대량보유자들의 물량 소화 가능성`,
                            `• 추세 반전 또는 조정 시작 경고 신호`,
                            `• 거래량 확인 필수 (거래량 ↓ = 신호 강화)`,
                            ``,
                            `💡 투자 전략: 수익실현 고려, 추가 매수 신중`
                        ].join('\n'),
                        level: 'medium',
                        data: { obv }
                    }));
                    
                    // 상태 업데이트
                    obvState.lastDivergence = obv.signal;
                    obvState.lastAlert = now;
                    this.saveAlertStates();
                }
            }
            
            // VWAP 편차 알림 (쿨다운 적용)
            if (this.alertConfig.advanced.vwap.deviationAlert && advancedData.vwap) {
                const vwap = advancedData.vwap;
                const vwapState = this.advancedAlertStates.vwap;
                
                // VWAP 3시간 쿨다운 적용
                const vwapCooldown = this.alertConfig.advanced.vwap.cooldownHours * 60 * 60 * 1000;
                const canAlert = now - vwapState.lastAlert > vwapCooldown;
                const isSignificantDeviation = Math.abs(vwap.deviation) > 3;
                
                console.log(`📊 VWAP 편차 체크: 편차=${vwap.deviation.toFixed(1)}%, 쿨다운=${canAlert}, 유의미=${isSignificantDeviation}`);
                
                if (canAlert && isSignificantDeviation) {
                    const direction = vwap.deviation > 0 ? '상회' : '하회';
                    const emoji = vwap.deviation > 0 ? '🚀' : '📉';
                    
                    // VWAP 상태 업데이트
                    vwapState.lastDeviation = vwap.deviation;
                    vwapState.lastAlert = now;
                    
                    alerts.push(this.createAdvancedAlert('vwap_deviation', {
                        title: `${emoji} 페이코인 VWAP 큰 편차 발생!`,
                        message: [
                            `💰 VWAP: ${vwap.vwap.toFixed(2)}원`,
                            `📊 현재가: ${vwap.currentPrice.toFixed(2)}원`,
                            `📊 편차: ${vwap.deviation.toFixed(2)}%`,
                            `${emoji} VWAP을 ${direction} (${Math.abs(vwap.deviation).toFixed(1)}%)`,
                            ``,
                            `📖 VWAP 편차 해설:`,
                            `• VWAP = 거래량 가중 평균가격, 기관투자자 벤치마크`,
                            `• VWAP 상회 = 평균보다 비싼 가격, 강한 매수세`,
                            `• VWAP 하회 = 평균보다 저렴한 가격, 매도 압력`,
                            `• 편차 3% 이상 = 단기 과열/과냉각 상태`,
                            `• 편차 5% 이상 = 강한 방향성, 추세 가속화 신호`,
                            ``,
                            `💡 투자 전략: ${vwap.deviation > 0 ? 'VWAP 회귀 시 수익실현' : 'VWAP 근처 매수 기회 포착'}`
                        ].join('\n'),
                        level: vwap.deviation > 5 ? 'high' : 'medium',
                        data: { vwap }
                    }));
                    
                    // 상태 저장
                    this.saveAlertStates();
                }
            }
            
        } catch (error) {
            console.error(`❌ 고급 기술지표 알림 체크 오류: ${error.message}`);
        }
        
        return alerts;
    }
    
    // 🚨 고급 알림 생성 헬퍼
    createAdvancedAlert(type, options) {
        return {
            type: `paycoin_advanced_${type}`,
            title: options.title,
            message: options.message,
            level: options.level || 'medium',
            timestamp: Date.now(),
            data: options.data || {}
        };
    }
    
    // ⚙️ 설정 업데이트
    updateConfig(newConfig) {
        this.alertConfig = { ...this.alertConfig, ...newConfig };
        console.log('⚙️ 페이코인 알림 설정 업데이트됨');
        console.log(JSON.stringify(this.alertConfig, null, 2));
    }
    
    // 🗂️ 알림 상태 로드
    loadAlertStates() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf8');
                const states = JSON.parse(data);
                this.advancedAlertStates = { ...this.advancedAlertStates, ...states };
                console.log('📂 페이코인 알림 상태 로드됨');
            }
        } catch (error) {
            console.error(`❌ 알림 상태 로드 실패: ${error.message}`);
        }
    }
    
    // 💾 알림 상태 저장
    saveAlertStates() {
        try {
            const fs = require('fs');
            fs.writeFileSync(this.stateFile, JSON.stringify(this.advancedAlertStates, null, 2));
        } catch (error) {
            console.error(`❌ 알림 상태 저장 실패: ${error.message}`);
        }
    }
}

module.exports = PaycoinAlertSystem;