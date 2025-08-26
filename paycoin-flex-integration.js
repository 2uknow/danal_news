// 페이코인 기술분석 알림을 Flex Message로 전송하는 통합 모듈

const PaycoinAlertSystem = require('./paycoin-alert-system');

// 🎨 페이코인 기술분석 Flex Message 생성 함수
async function sendPaycoinTechnicalAnalysisFlexMessage(alert, webhookUrl) {
    console.log(`\n📤 [페이코인 기술분석] Flex Message 알림 발송 시작...`);
    
    // 알림 타입별 색상 및 이모지 설정
    const alertStyles = {
        volume_spike: { color: '#FF6B35', emoji: '🔥📈', bgColor: '#FFF5F3' },
        rsi_overbought: { color: '#FF4757', emoji: '🔴', bgColor: '#FFF1F2' },
        rsi_oversold: { color: '#2ED573', emoji: '🟢💎', bgColor: '#F0FFF4' },
        golden_cross: { color: '#FFA502', emoji: '🌟📈', bgColor: '#FFFBF0' },
        dead_cross: { color: '#747D8C', emoji: '⚠️📉', bgColor: '#F8F9FA' },
        bb_upper_breakout: { color: '#3742FA', emoji: '🚀', bgColor: '#F0F2FF' },
        bb_lower_breakout: { color: '#2ED573', emoji: '💎', bgColor: '#F0FFF4' },
        overall_signal: { color: '#5F27CD', emoji: '🎯', bgColor: '#F8F5FF' },
        // 고급 기술지표
        advanced_macd_golden_cross: { color: '#FFA502', emoji: '🌟📈', bgColor: '#FFFBF0' },
        advanced_macd_dead_cross: { color: '#FF4757', emoji: '⚠️📉', bgColor: '#FFF1F2' },
        advanced_stochastic_oversold: { color: '#2ED573', emoji: '🟢💎', bgColor: '#F0FFF4' },
        advanced_stochastic_overbought: { color: '#FF4757', emoji: '🔴⚠️', bgColor: '#FFF1F2' },
        advanced_fibonacci_level: { color: '#9C88FF', emoji: '🌀', bgColor: '#F5F3FF' },
        advanced_ichimoku_bullish: { color: '#20BF6B', emoji: '☁️📈', bgColor: '#F0FFF4' },
        advanced_ichimoku_bearish: { color: '#FF4757', emoji: '☁️📉', bgColor: '#FFF1F2' },
        advanced_obv_bullish_divergence: { color: '#0FB9B1', emoji: '📊💡', bgColor: '#F0FFFE' },
        advanced_obv_bearish_divergence: { color: '#F53B57', emoji: '📊⚠️', bgColor: '#FFF1F2' },
        advanced_vwap_deviation: { color: '#3C40C6', emoji: '💰', bgColor: '#F0F2FF' }
    };
    
    const style = alertStyles[alert.type.replace('paycoin_', '')] || 
                  { color: '#1E3A8A', emoji: '📊', bgColor: '#F0F9FF' };
    
    const kstTime = new Date(alert.timestamp).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Flex Message 구조 (app.js와 동일한 구조로 수정)
    const flexMessage = {
        "content": {
            "type": "flex",
            "altText": alert.title,
            "contents": {
            type: "bubble",
            size: "kilo",
            header: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `${style.emoji} 페이코인 기술분석`,
                        weight: "bold",
                        size: "md",
                        color: "#FFFFFF"
                    },
                    {
                        type: "text",
                        text: alert.level.toUpperCase(),
                        size: "xs",
                        color: "#FFFFFF",
                        margin: "xs"
                    }
                ],
                backgroundColor: style.color,
                paddingAll: "12px"
            },
            body: {
                type: "box",
                layout: "vertical",
                spacing: "md",
                paddingAll: "16px",
                backgroundColor: style.bgColor,
                contents: [
                    {
                        type: "text",
                        text: alert.title.replace(/^[🔥📈🟢💎🌟📈⚠️📉🚀💎🎯☁️🌀📊💰]\s*/, ''),
                        weight: "bold",
                        size: "lg",
                        color: "#2C3E50",
                        wrap: true
                    },
                    {
                        type: "separator",
                        margin: "md"
                    }
                ]
            },
            footer: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: `⏰ ${kstTime}`,
                        size: "xs",
                        color: "#888888",
                        align: "end"
                    }
                ],
                paddingAll: "8px"
            }
            }
        }
    };
    
    // 알림 메시지 내용을 본문에 추가
    const messageLines = alert.message.split('\n');
    messageLines.forEach(line => {
        if (line.trim()) {
            flexMessage.content.contents.body.contents.push({
                type: "text",
                text: line,
                size: "sm",
                color: "#34495E",
                wrap: true,
                margin: "xs"
            });
        }
    });
    
    // 액션 버튼 추가 (빗썸 페이코인 페이지 링크)
    flexMessage.content.contents.footer.contents.unshift({
        type: "button",
        action: {
            type: "uri",
            label: "빗썸에서 페이코인 보기",
            uri: "https://www.bithumb.com/trade/order/PCI_KRW"
        },
        style: "primary",
        color: style.color,
        margin: "sm"
    });
    
    try {
        // app.js의 sendFlexNotification 함수와 동일한 방식 사용
        const fetch = require('node-fetch');
        const https = require('https');
        
        const agent = new https.Agent({
            rejectUnauthorized: false
        });
        
        const messageBody = JSON.stringify(flexMessage, null, 2);
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            agent: agent,
            headers: {
                'Content-Type': 'application/json',
            },
            body: messageBody
        });
        
        if (response.ok) {
            console.log(`✅ 페이코인 기술분석 Flex Message 전송 성공`);
            console.log(`   제목: ${alert.title}`);
            console.log(`   레벨: ${alert.level}`);
            console.log(`   시간: ${kstTime}`);
            return true;
        } else {
            console.error(`❌ Flex Message 전송 실패: ${response.status} ${response.statusText}`);
            
            // 🔄 폴백: 일반 텍스트로 전송 시도
            console.log('🔄 일반 텍스트로 폴백 전송 시도...');
            const altText = flexMessage.content.altText;
            const bodyContents = flexMessage.content.contents.body.contents;
            
            let fallbackMessage = altText + '\n\n';
            bodyContents.forEach(content => {
                if (content.type === 'text') {
                    fallbackMessage += content.text + '\n';
                }
            });
            
            const fallbackResponse = await fetch(webhookUrl, {
                method: 'POST',
                agent: agent,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: fallbackMessage })
            });
            
            if (fallbackResponse.ok) {
                console.log('✅ 폴백 텍스트 메시지 전송 성공');
                return true;
            } else {
                console.error(`❌ 폴백 메시지 전송도 실패: ${fallbackResponse.status}`);
                return false;
            }
        }
        
    } catch (error) {
        console.error(`❌ Flex Message 전송 오류: ${error.message}`);
        return false;
    }
}

// 🔄 페이코인 기술분석 모니터링을 app.js에 통합하는 함수
async function integratePaycoinMonitoring(webhookUrl, intervalMinutes = 15) {
    console.log('🪙 페이코인 기술분석 모니터링을 app.js에 통합 시작...');
    
    const alertSystem = new PaycoinAlertSystem();
    
    // 기존 다날 뉴스 체크와 함께 실행되도록 간격 설정
    const monitoringInterval = setInterval(async () => {
        try {
            console.log(`\n🔍 [${new Date().toLocaleString('ko-KR')}] 페이코인 기술분석 체크...`);
            
            // 페이코인 기술분석 알림 생성
            const alerts = await alertSystem.generatePaycoinAlerts();
            
            // 각 알림을 Flex Message로 전송
            for (const alert of alerts) {
                const success = await sendPaycoinTechnicalAnalysisFlexMessage(alert, webhookUrl);
                
                if (success) {
                    console.log(`📤 페이코인 알림 전송 완료: ${alert.type}`);
                    
                    // 전송 간격 조정 (너무 빠르게 연속 전송 방지)
                    if (alerts.indexOf(alert) < alerts.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기
                    }
                } else {
                    console.error(`❌ 페이코인 알림 전송 실패: ${alert.type}`);
                }
            }
            
            if (alerts.length === 0) {
                console.log('😌 현재 페이코인 기술분석 알림 조건 미충족');
            }
            
        } catch (error) {
            console.error(`❌ 페이코인 모니터링 오류: ${error.message}`);
        }
    }, intervalMinutes * 60 * 1000);
    
    // 첫 실행 (5초 후)
    setTimeout(async () => {
        console.log('🚀 페이코인 기술분석 첫 실행...');
        try {
            const alerts = await alertSystem.generatePaycoinAlerts();
            for (const alert of alerts) {
                await sendPaycoinTechnicalAnalysisFlexMessage(alert, webhookUrl);
            }
        } catch (error) {
            console.error(`❌ 페이코인 첫 실행 오류: ${error.message}`);
        }
    }, 5000);
    
    console.log(`✅ 페이코인 기술분석 모니터링 시작 (${intervalMinutes}분 간격)`);
    
    return monitoringInterval;
}

// 🧪 Flex Message 테스트 함수
async function testPaycoinFlexMessage() {
    console.log('🧪 페이코인 Flex Message 테스트 시작...\n');
    
    // 테스트용 알림 데이터
    const testAlerts = [
        {
            type: 'paycoin_volume_spike',
            title: '🔥📈 페이코인 거래량 3.2배 급증!',
            message: [
                '💰 현재가: 119원',
                '📈 24h 변동: +5.8%',
                '📊 24h 거래량: 21,652,843 PCI',
                '⚡ 거래량 급증: 평균 대비 3.2배',
                '💵 24h 거래대금: 25.8억원',
                '🎯 신뢰도: 85%',
                '',
                '🔍 급증 사유: 평균 대비 3.2배 급증, 상위 5.2% 거래량, 가격 상승 5.8%'
            ].join('\n'),
            level: 'high',
            timestamp: Date.now(),
            data: {
                volumeAnalysis: { volumeRatio: 3.2, confidence: 85 }
            }
        },
        {
            type: 'paycoin_rsi_oversold',
            title: '🟢💎 페이코인 RSI 과매도 신호!',
            message: [
                '📊 RSI: 22.5',
                '💎 과매도 구간 진입 (25 이하)',
                '💡 기술적 반등 가능성이 높습니다',
                '📈 단기 지지 구간에서 매수 기회 포착'
            ].join('\n'),
            level: 'medium',
            timestamp: Date.now()
        },
        {
            type: 'paycoin_golden_cross',
            title: '🌟📈 페이코인 골든크로스 발생!',
            message: [
                '📈 단기(5일) 이동평균이 중기(10일) 이동평균을 상향 돌파',
                '💰 현재가: 119.00원',
                '📊 단기 이평: 117.20원',
                '📊 중기 이평: 116.80원',
                '📊 장기 이평: 115.50원',
                '🎯 상승 추세 전환 신호',
                '💡 중장기 상승 랠리 기대'
            ].join('\n'),
            level: 'high',
            timestamp: Date.now()
        }
    ];
    
    console.log('📱 생성될 Flex Message 미리보기:');
    
    testAlerts.forEach((alert, index) => {
        console.log(`\n🎨 Flex Message ${index + 1}:`);
        console.log(`   타입: ${alert.type}`);
        console.log(`   제목: ${alert.title}`);
        console.log(`   레벨: ${alert.level}`);
        console.log(`   색상: ${alert.type === 'paycoin_volume_spike' ? '주황색' : alert.type === 'paycoin_rsi_oversold' ? '초록색' : '금색'} 헤더`);
        console.log(`   버튼: "빗썸에서 페이코인 보기" 링크`);
        console.log(`   시간: ${new Date(alert.timestamp).toLocaleString('ko-KR')}`);
    });
    
    console.log('\n💡 실제 사용법:');
    console.log('1. app.js에서 integratePaycoinMonitoring(webhookUrl, 15) 호출');
    console.log('2. 기존 다날 뉴스와 함께 15분마다 페이코인 기술분석 체크');
    console.log('3. 알림 조건 충족시 자동으로 Flex Message 전송');
    console.log('4. 네이버 웍스 채널에서 기존 뉴스 알림과 함께 수신');
    
    console.log('\n🚀 테스트 완료!');
}

module.exports = {
    sendPaycoinTechnicalAnalysisFlexMessage,
    integratePaycoinMonitoring,
    testPaycoinFlexMessage
};

// 직접 실행시 테스트 모드
if (require.main === module) {
    testPaycoinFlexMessage().catch(console.error);
}