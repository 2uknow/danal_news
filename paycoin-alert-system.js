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
                    divergenceAlert: true     // 다이버전스
                },
                vwap: {
                    deviationAlert: true      // VWAP 이탈
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
        console.log('🪙 페이코인 통합 알림 분석 시작...\n');
        
        const alerts = [];
        const now = Date.now();
        
        try {
            // 1. 거래량 분석
            if (this.alertConfig.volume.enabled) {
                const volumeData = await this.volumeAnalyzer.fetchPaycoinData();
                if (volumeData) {
                    const volumeAnalysis = this.volumeAnalyzer.analyzeVolumeSpike(volumeData);
                    
                    if (volumeAnalysis.isSpike && 
                        volumeAnalysis.volumeRatio >= this.alertConfig.volume.spikeThreshold &&
                        volumeData.volume24h >= this.alertConfig.volume.minVolume &&
                        now - this.lastAlerts.volume > this.alertConfig.volume.cooldown) {
                        
                        const alert = this.createVolumeAlert(volumeAnalysis, volumeData);
                        alerts.push(alert);
                        this.lastAlerts.volume = now;
                        console.log('✅ 거래량 급증 알림 생성');
                    }
                }
            }
            
            // 2. 기술적 지표 분석
            if (this.alertConfig.technical.enabled) {
                const technicalAnalysis = await this.technicalIndicators.performFullAnalysis();
                
                if (technicalAnalysis) {
                    // RSI 알림
                    const rsiAlert = this.checkRSIAlert(technicalAnalysis.rsi, now);
                    if (rsiAlert) {
                        alerts.push(rsiAlert);
                        this.lastAlerts.rsi = now;
                        console.log('✅ RSI 기술적 분석 알림 생성');
                    }
                    
                    // 이동평균 알림
                    const maAlert = this.checkMovingAverageAlert(technicalAnalysis.movingAverages, now);
                    if (maAlert) {
                        alerts.push(maAlert);
                        this.lastAlerts.ma = now;
                        console.log('✅ 이동평균 크로스오버 알림 생성');
                    }
                    
                    // 볼린저 밴드 알림
                    const bbAlert = this.checkBollingerBandAlert(technicalAnalysis.bollingerBands, now);
                    if (bbAlert) {
                        alerts.push(bbAlert);
                        this.lastAlerts.bb = now;
                        console.log('✅ 볼린저 밴드 돌파 알림 생성');
                    }
                    
                    // 종합 분석 알림
                    if (this.alertConfig.overall.enabled) {
                        const overallAlert = this.checkOverallSignalAlert(technicalAnalysis.overallSignal, now);
                        if (overallAlert) {
                            alerts.push(overallAlert);
                            this.lastAlerts.overall = now;
                            console.log('✅ 종합 기술적 분석 알림 생성');
                        }
                    }
                }
            }
            
            // 3. 고급 기술지표 분석
            if (this.alertConfig.advanced.enabled && 
                now - this.lastAlerts.advanced > this.alertConfig.advanced.cooldown) {
                const advancedAnalysis = await this.advancedIndicators.performAdvancedAnalysis();
                
                if (advancedAnalysis && advancedAnalysis.advanced) {
                    const advancedAlerts = this.checkAdvancedIndicatorAlerts(advancedAnalysis.advanced, now);
                    if (advancedAlerts.length > 0) {
                        alerts.push(...advancedAlerts);
                        this.lastAlerts.advanced = now;
                        console.log(`✅ 고급 기술지표 알림 ${advancedAlerts.length}개 생성`);
                    }
                }
            }
            
        } catch (error) {
            console.error(`❌ 알림 생성 오류: ${error.message}`);
        }
        
        if (alerts.length > 0) {
            console.log(`\n🚨 총 ${alerts.length}개 알림 생성됨`);
        } else {
            console.log('\n😌 현재 알림 조건을 만족하는 상황 없음');
        }
        
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
                `🔍 급증 사유: ${volumeAnalysis.reasons.join(', ')}`
            ].join('\n'),
            level: volumeAnalysis.confidence >= 80 ? 'high' : volumeAnalysis.confidence >= 60 ? 'medium' : 'low',
            timestamp: Date.now(),
            data: { volumeAnalysis, volumeData }
        };
    }
    
    // 📊 RSI 알림 체크
    checkRSIAlert(rsiData, now) {
        if (!rsiData.rsi || rsiData.signal === 'insufficient_data') return null;
        if (now - this.lastAlerts.rsi < 60 * 60 * 1000) return null; // 1시간 쿨다운
        
        const { rsi, signal } = rsiData;
        
        if (signal === 'overbought' && rsi >= this.alertConfig.technical.rsi.overbought) {
            return {
                type: 'paycoin_rsi_overbought',
                title: '🔴 페이코인 RSI 과매수 신호!',
                message: [
                    `📊 RSI: ${rsi.toFixed(2)}`,
                    `⚠️ 과매수 구간 진입 (${this.alertConfig.technical.rsi.overbought} 이상)`,
                    `💡 기술적 조정 가능성이 높습니다`,
                    `📈 단기 저항 구간에서 매도 압력 예상`
                ].join('\n'),
                level: 'medium',
                timestamp: now
            };
        }
        
        if (signal === 'oversold' && rsi <= this.alertConfig.technical.rsi.oversold) {
            return {
                type: 'paycoin_rsi_oversold',
                title: '🟢 페이코인 RSI 과매도 신호!',
                message: [
                    `📊 RSI: ${rsi.toFixed(2)}`,
                    `💎 과매도 구간 진입 (${this.alertConfig.technical.rsi.oversold} 이하)`,
                    `💡 기술적 반등 가능성이 높습니다`,
                    `📈 단기 지지 구간에서 매수 기회 포착`
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
                    `📈 단기(${mas.short.period}일) 이동평균이 중기(${mas.medium.period}일) 이동평균을 상향 돌파`,
                    `💰 현재가: ${currentPrice.toFixed(2)}원`,
                    `📊 단기 이평: ${mas.short.value.toFixed(2)}원`,
                    `📊 중기 이평: ${mas.medium.value.toFixed(2)}원`,
                    `📊 장기 이평: ${mas.long.value.toFixed(2)}원`,
                    `🎯 상승 추세 전환 신호`,
                    `💡 중장기 상승 랠리 기대`
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
                    `📉 단기(${mas.short.period}일) 이동평균이 중기(${mas.medium.period}일) 이동평균을 하향 돌파`,
                    `💰 현재가: ${currentPrice.toFixed(2)}원`,
                    `📊 단기 이평: ${mas.short.value.toFixed(2)}원`,
                    `📊 중기 이평: ${mas.medium.value.toFixed(2)}원`,
                    `📊 장기 이평: ${mas.long.value.toFixed(2)}원`,
                    `🎯 하락 추세 전환 신호`,
                    `💡 추가 조정 가능성 주의`
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
                    `📈 상단 밴드: ${bb.upper.toFixed(2)}원`,
                    `📊 중간선: ${bb.middle.toFixed(2)}원`,
                    `📉 하단 밴드: ${bb.lower.toFixed(2)}원`,
                    `🎯 강한 상승 모멘텀 발생`,
                    `📊 변동성: ${volatility} (밴드폭 ${bb.bandwidth.toFixed(2)}%)`,
                    `💡 추가 상승 가능성 있으나 과열 주의`
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
                    `📉 하단 밴드: ${bb.lower.toFixed(2)}원`,
                    `🎯 과매도 구간 진입`,
                    `📊 변동성: ${volatility} (밴드폭 ${bb.bandwidth.toFixed(2)}%)`,
                    `💡 반등 매수 기회 포착 가능`
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
                message: '📊 여러 기술적 지표가 강한 상승 신호를 보이고 있습니다',
                level: 'high'
            },
            'bullish': {
                title: '📈 페이코인 상승 시그널',
                message: '📊 기술적 지표들이 상승 신호를 보이고 있습니다',
                level: 'medium'
            },
            'strong_bearish': {
                title: '💀 페이코인 강한 하락 시그널!',
                message: '📊 여러 기술적 지표가 강한 하락 신호를 보이고 있습니다',
                level: 'high'
            },
            'bearish': {
                title: '📉 페이코인 하락 시그널',
                message: '📊 기술적 지표들이 하락 신호를 보이고 있습니다',
                level: 'medium'
            }
        };
        
        const signal = signalData[overallSignal];
        if (signal) {
            return {
                type: 'paycoin_overall_signal',
                title: signal.title,
                message: [
                    signal.message,
                    `🎯 종합 분석 결과: ${overallSignal}`,
                    `💡 RSI, 이동평균, 볼린저밴드, 거래량을 종합 분석한 결과입니다`,
                    `⚠️ 투자 시 신중한 판단이 필요합니다`
                ].join('\n'),
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
                        title: '🌟📈 페이코인 MACD 골든크로스 발생!',
                        message: [
                            `📊 MACD Line: ${macd.macd.line.toFixed(4)}`,
                            `📊 Signal Line: ${macd.macd.signal.toFixed(4)}`,
                            `📊 Histogram: ${macd.macd.histogram.toFixed(4)}`,
                            `🎯 상승 추세 전환 신호`,
                            `💡 중장기 상승 랠리 기대`
                        ].join('\n'),
                        level: 'high',
                        data: { macd }
                    }));
                } else if (macd.crossover === 'dead') {
                    alerts.push(this.createAdvancedAlert('macd_dead_cross', {
                        title: '⚠️📉 페이코인 MACD 데드크로스 발생!',
                        message: [
                            `📊 MACD Line: ${macd.macd.line.toFixed(4)}`,
                            `📊 Signal Line: ${macd.macd.signal.toFixed(4)}`,
                            `📊 Histogram: ${macd.macd.histogram.toFixed(4)}`,
                            `⚠️ 하락 추세 전환 신호`,
                            `🛡️ 리스크 관리 필요`
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
                        title: '💎 페이코인 스토캐스틱 과매도!',
                        message: [
                            `📊 %K: ${stoch.stochastic.k.toFixed(2)}`,
                            `📊 %D: ${stoch.stochastic.d.toFixed(2)}`,
                            `💎 과매도 구간 진입`,
                            `📈 단기 반등 가능성이 높습니다`,
                            `💡 매수 타이밍 검토`
                        ].join('\n'),
                        level: 'medium',
                        data: { stoch }
                    }));
                } else if (stoch.overbought) {
                    alerts.push(this.createAdvancedAlert('stochastic_overbought', {
                        title: '⚠️ 페이코인 스토캐스틱 과매수!',
                        message: [
                            `📊 %K: ${stoch.stochastic.k.toFixed(2)}`,
                            `📊 %D: ${stoch.stochastic.d.toFixed(2)}`,
                            `⚠️ 과매수 구간 진입`,
                            `📉 단기 조정 가능성`,
                            `🛡️ 수익 실현 검토`
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
                
                // 레벨 근접 체크
                if (fib.nearestLevel && Math.abs(fib.fibonacci.currentPrice - fib.nearestLevel.price) / fib.nearestLevel.price < 0.02) {
                    const levelType = ['strong_support', 'support'].includes(fib.signal) ? '지지' : 
                                     ['strong_resistance', 'resistance'].includes(fib.signal) ? '저항' : '주요';
                    
                    // 새로운 레벨이거나 가격이 크게 변했을 때만 알림
                    const isNewLevel = fibState.lastLevel !== fib.nearestLevel.name;
                    const priceChanged = !fibState.lastPrice || Math.abs(fib.fibonacci.currentPrice - fibState.lastPrice) / fibState.lastPrice > 0.01;
                    const cooldownPassed = now - fibState.lastAlert > 60 * 60 * 1000; // 1시간 쿨다운
                    
                    if ((isNewLevel || priceChanged) && cooldownPassed) {
                        alerts.push(this.createAdvancedAlert('fibonacci_level', {
                            title: `🌀 페이코인 피보나치 ${levelType} 레벨 ${isNewLevel ? '신규 접근' : '재접근'}!`,
                            message: [
                                `📊 현재가: ${fib.fibonacci.currentPrice.toFixed(2)}원`,
                                `🎯 ${isNewLevel ? '신규' : ''} 레벨: ${fib.nearestLevel.name} (${fib.nearestLevel.price.toFixed(2)}원)`,
                                `📊 위치: ${fib.fibonacci.pricePosition.toFixed(1)}%`,
                                `🌀 ${levelType} 구간에서 반응 예상`,
                                `💡 ${levelType} 레벨 돌파 여부 주목`
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
                                title: `☁️📈 페이코인 이치모쿠 ${isNewSignal ? '신규 ' : ''}강세 신호!`,
                                message: [
                                    `☁️ 가격이 강세 구름 위에서 거래${isNewSignal ? ' (신규 돌파!)' : ''}`,
                                    `📊 전환선: ${ichi.ichimoku.tenkanSen.toFixed(2)}원`,
                                    `📊 기준선: ${ichi.ichimoku.kijunSen.toFixed(2)}원`,
                                    `🟢 구름 색상: 상승 (${ichi.ichimoku.cloudColor})`,
                                    `🚀 강한 상승 추세 ${isNewSignal ? '전환' : '확인'}`
                                ].join('\n'),
                                level: 'high',
                                data: { ichi }
                            }));
                        } else if (currentSignal === 'bearish') {
                            alerts.push(this.createAdvancedAlert('ichimoku_bearish', {
                                title: `☁️📉 페이코인 이치모쿠 ${isNewSignal ? '신규 ' : ''}약세 신호!`,
                                message: [
                                    `☁️ 가격이 약세 구름 아래에서 거래${isNewSignal ? ' (신규 이탈!)' : ''}`,
                                    `📊 전환선: ${ichi.ichimoku.tenkanSen.toFixed(2)}원`,
                                    `📊 기준선: ${ichi.ichimoku.kijunSen.toFixed(2)}원`,
                                    `🔴 구름 색상: 하락 (${ichi.ichimoku.cloudColor})`,
                                    `⚠️ 약세 추세 ${isNewSignal ? '전환' : '지속'}`
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
            
            // OBV 다이버전스 알림
            if (this.alertConfig.advanced.obv.divergenceAlert && advancedData.obv) {
                const obv = advancedData.obv;
                if (obv.signal === 'bullish_divergence') {
                    alerts.push(this.createAdvancedAlert('obv_bullish_divergence', {
                        title: '📊💡 페이코인 OBV 상승 다이버전스!',
                        message: [
                            `📊 OBV: ${obv.obv.toLocaleString()}`,
                            `📈 거래량 추세: ${obv.trend === 'increasing' ? '증가' : '감소'}`,
                            `💡 가격 하락에도 거래량은 증가`,
                            `🎯 상승 전환 가능성 시사`,
                            `👀 추가 상승 신호 확인 필요`
                        ].join('\n'),
                        level: 'medium',
                        data: { obv }
                    }));
                } else if (obv.signal === 'bearish_divergence') {
                    alerts.push(this.createAdvancedAlert('obv_bearish_divergence', {
                        title: '📊⚠️ 페이코인 OBV 하락 다이버전스!',
                        message: [
                            `📊 OBV: ${obv.obv.toLocaleString()}`,
                            `📉 거래량 추세: ${obv.trend === 'increasing' ? '증가' : '감소'}`,
                            `⚠️ 가격 상승에도 거래량은 감소`,
                            `🚨 하락 전환 가능성 시사`,
                            `🛡️ 리스크 관리 검토`
                        ].join('\n'),
                        level: 'medium',
                        data: { obv }
                    }));
                }
            }
            
            // VWAP 편차 알림
            if (this.alertConfig.advanced.vwap.deviationAlert && advancedData.vwap) {
                const vwap = advancedData.vwap;
                if (Math.abs(vwap.deviation) > 3) {
                    const direction = vwap.deviation > 0 ? '상회' : '하회';
                    const emoji = vwap.deviation > 0 ? '🚀' : '📉';
                    alerts.push(this.createAdvancedAlert('vwap_deviation', {
                        title: `${emoji} 페이코인 VWAP 큰 편차 발생!`,
                        message: [
                            `💰 VWAP: ${vwap.vwap.toFixed(2)}원`,
                            `📊 현재가: ${vwap.currentPrice.toFixed(2)}원`,
                            `📊 편차: ${vwap.deviation.toFixed(2)}%`,
                            `${emoji} VWAP을 ${direction} (${Math.abs(vwap.deviation).toFixed(1)}%)`,
                            `💡 ${vwap.deviation > 0 ? '강한 매수세' : '강한 매도세'} 감지`
                        ].join('\n'),
                        level: vwap.deviation > 5 ? 'high' : 'medium',
                        data: { vwap }
                    }));
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