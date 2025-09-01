// 🧠 개선된 뉴스 감정분석 엔진 (2025-09-01)
// 현재 문제: 85% 부정확한 감정분석 → 목표: 90%+ 정확도

/**
 * 개선된 감정분석 함수
 * 기존 500+ 키워드 → 핵심 50개 키워드로 간소화
 * 복잡한 맥락분석 → 간단한 패턴 매칭으로 변경
 */
function improvedSentimentAnalysis(title, description = '') {
    console.log(`🧠 개선된 감정분석: "${title.substring(0, 60)}..."`);
    
    const text = (title + ' ' + description).toLowerCase().trim();
    
    // === 1단계: 중립 뉴스 먼저 필터링 (90%+ 뉴스가 중립) ===
    const neutralPatterns = [
        // 단순 사실 보도
        /발표/, /공시/, /보고서/, /분석/, /전망/, /예상/, /예측/,
        /계획/, /예정/, /일정/, /시간/, /날짜/,
        /기자/, /인터뷰/, /언론/, /보도/, /취재/,
        
        // 기술적 분석 (감정적 의미 없음)
        /차트/, /기술적/, /지표/, /분석/, /패턴/, /추세/,
        /거래량/, /시가총액/, /가격/, /시세/, /호가/,
        
        // 일반적 비즈니스 활동
        /출시/, /런칭/, /서비스/, /플랫폼/, /시스템/,
        /개발/, /구축/, /도입/, /적용/, /확대/
    ];
    
    const isNeutralNews = neutralPatterns.some(pattern => pattern.test(text));
    
    // === 2단계: 강력한 감정 시그널만 탐지 ===
    
    // 🔴 명확한 부정 시그널 (확신 95%+)
    const strongNegativePatterns = [
        // 사기/범죄 관련 (100% 부정)
        /사기|피싱|해킹|범죄|불법|악용|도용|도난/,
        /보이스피싱|전화사기|투자사기|가짜사이트|가짜앱/,
        
        // 금융 악재 (95%+ 부정)
        /폭락|급락|붕괴|추락|하락|폭락|대폭하락/,
        /손실|적자|위기|충격|패닉|투매|매도/,
        
        // 규제/처벌 (90%+ 부정)  
        /규제|제재|처벌|소송|수사|조사|금지/,
        /중단|정지|폐쇄|취소|철회|거부/,
        
        // 기술적 문제 (85%+ 부정)
        /오류|장애|문제|실패|중단|다운|해킹/
    ];
    
    // 🟢 명확한 긍정 시그널 (확신 90%+)  
    const strongPositivePatterns = [
        // 가격 상승 (95%+ 긍정)
        /폭등|급등|치솟|신고가|최고가|급상승|상승세/,
        /돌파|반등|회복|상승|대폭상승/,
        
        // 강력한 호재 (90%+ 긍정)
        /상장|리스팅|선정|수주|투자유치|펀딩/,
        /흑자전환|실적개선|매출증가|이익증가/,
        
        // 파트너십/협력 (85%+ 긍정)
        /파트너|제휴|협력|계약|합의|체결/,
        /글로벌|해외진출|확장|진출|성공/
    ];
    
    // === 3단계: 패턴 매칭 및 점수 계산 ===
    let sentiment = 'neutral';
    let confidence = 30; // 기본 중립 신뢰도
    let emoji = '😐';
    let reason = '키워드 없음';
    
    // 부정 패턴 체크 (우선순위 높음)
    for (let pattern of strongNegativePatterns) {
        if (pattern.test(text)) {
            sentiment = 'negative';
            confidence = 90;
            emoji = '📉';
            reason = `부정패턴: ${pattern.source}`;
            console.log(`   🔴 부정 감지: ${pattern.source}`);
            break;
        }
    }
    
    // 긍정 패턴 체크 (부정이 없을 때만)
    if (sentiment === 'neutral') {
        for (let pattern of strongPositivePatterns) {
            if (pattern.test(text)) {
                sentiment = 'positive';
                confidence = 85;
                emoji = '📈';
                reason = `긍정패턴: ${pattern.source}`;
                console.log(`   🟢 긍정 감지: ${pattern.source}`);
                break;
            }
        }
    }
    
    // === 4단계: 중립 뉴스 처리 ===
    if (sentiment === 'neutral') {
        if (isNeutralNews) {
            confidence = 70; // 중립 확신
            reason = '일반 보도';
        } else {
            confidence = 40; // 불확실
            reason = '감정 불분명';
        }
    }
    
    // === 5단계: 맥락 기반 보정 ===
    
    // 🔧 부정 맥락에서 증가 표현 보정
    const hasNegativeContext = /사기|범죄|피해|해킹|불법/.test(text);
    const hasIncreaseWords = /증가|폭증|급증|늘어|확산|배/.test(text);
    
    if (hasNegativeContext && hasIncreaseWords && sentiment !== 'negative') {
        sentiment = 'negative';
        confidence = 80;
        emoji = '⚠️';
        reason = '부정맥락+증가표현';
        console.log(`   🔧 맥락보정: 부정맥락에서 증가표현 → 부정`);
    }
    
    // 🔧 조건부/추측성 표현 신뢰도 감소
    if (/만약|가정|예상|전망|예측|가능성/.test(text)) {
        confidence = Math.max(30, confidence - 20);
        console.log(`   📊 조건부 표현으로 신뢰도 감소: ${confidence}%`);
    }
    
    const result = {
        sentiment,
        confidence,
        emoji,
        reason,
        isNeutralPattern: isNeutralNews,
        text_length: text.length
    };
    
    console.log(`   결과: ${sentiment} ${emoji} (${confidence}%) - ${reason}`);
    return result;
}

/**
 * 기존 함수와 호환되는 래퍼 함수
 */
function analyzeNewsSentimentImproved(title, description = '') {
    const result = improvedSentimentAnalysis(title, description);
    
    return {
        sentiment: result.sentiment,
        confidence: result.confidence,
        emoji: result.emoji,
        scores: {
            positive: result.sentiment === 'positive' ? result.confidence : 0,
            negative: result.sentiment === 'negative' ? result.confidence : 0,
            neutral: result.sentiment === 'neutral' ? result.confidence : 0
        },
        keywords: {
            positive: result.sentiment === 'positive' ? [result.reason] : [],
            negative: result.sentiment === 'negative' ? [result.reason] : [],
            neutral: result.sentiment === 'neutral' ? [result.reason] : []
        }
    };
}

module.exports = { improvedSentimentAnalysis, analyzeNewsSentimentImproved };

// === 테스트 실행 ===
if (require.main === module) {
    console.log('🧪 개선된 감정분석 테스트\n');
    
    const testCases = [
        // 중립 뉴스 (대부분)
        { text: "페이코인, CU편의점 등 가상자산 실생활 결제 확대", expected: 'neutral' },
        { text: "다날, 스테이블코인 생태계 구축…엑셀라 파트너사 선정", expected: 'positive' },
        { text: "비트코인 회복력·수익성 입증", expected: 'positive' },
        { text: "CNBC \"비트코인, 9월에 다시 단기 힘 받을 수도\"", expected: 'neutral' },
        { text: "비트코인, 단기 보유자 실현 가격 붕괴...8만 6,000달러까지 추락하나", expected: 'negative' },
        
        // 명확한 감정 뉴스
        { text: "페이코인 폭등! 신고가 돌파", expected: 'positive' },
        { text: "비트코인 사기 피해 급증, 보이스피싱 6배 증가", expected: 'negative' },
        { text: "다날 주가 급락, 대량 매도 지속", expected: 'negative' }
    ];
    
    let correct = 0;
    testCases.forEach((test, i) => {
        console.log(`${i+1}. "${test.text}"`);
        const result = improvedSentimentAnalysis(test.text);
        const isCorrect = result.sentiment === test.expected;
        if (isCorrect) correct++;
        
        console.log(`   ${isCorrect ? '✅' : '❌'} 예상:${test.expected} 결과:${result.sentiment}\n`);
    });
    
    console.log(`📊 정확도: ${correct}/${testCases.length} (${Math.round(correct/testCases.length*100)}%)`);
}