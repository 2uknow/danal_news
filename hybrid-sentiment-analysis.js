// 🧠 하이브리드 감정분석 시스템
// 1단계: 빠른 키워드 필터링 → 2단계: AI API 정밀 분석

/**
 * 하이브리드 감정분석 엔진
 * - 1차: 키워드 기반 빠른 스크리닝 
 * - 2차: 애매한 경우만 AI API 호출 (비용 최적화)
 */

// === 1단계: 확실한 경우만 키워드로 처리 ===
function quickSentimentFilter(text) {
    const lowerText = text.toLowerCase();
    
    // 🔴 100% 확실한 부정 (API 호출 불필요)
    const definiteNegative = [
        /폭락|급락|붕괴|추락/, // 가격 폭락
        /사기|피싱|해킹|범죄/, // 범죄
        /보이스피싱|전화사기|투자사기/, // 사기
        /상장폐지|거래정지|출금중단/, // 거래소 문제
        /해킹|도용|유출|보안사고/ // 보안 문제
    ];
    
    // 🟢 100% 확실한 긍정 (API 호출 불필요)  
    const definitePositive = [
        /폭등|급등|치솟|신고가/, // 가격 급등
        /상장|리스팅/, // 거래소 상장
        /파트너십|제휴|협력|계약/, // 사업 협력
        /투자유치|펀딩|자금조달/, // 투자 유치
        /흑자전환|실적개선/ // 실적 개선
    ];
    
    // 확실한 부정
    for (let pattern of definiteNegative) {
        if (pattern.test(lowerText)) {
            return { 
                sentiment: 'negative', 
                confidence: 95, 
                method: 'keyword_certain',
                reason: pattern.source 
            };
        }
    }
    
    // 확실한 긍정
    for (let pattern of definitePositive) {
        if (pattern.test(lowerText)) {
            return { 
                sentiment: 'positive', 
                confidence: 90, 
                method: 'keyword_certain',
                reason: pattern.source
            };
        }
    }
    
    // 🔵 명백한 중립 (API 호출 불필요)
    const obviousNeutral = [
        /발표|공시|보고서|분석|전망/, // 단순 보도
        /일정|예정|계획|준비/, // 미래 계획
        /인터뷰|기자회견|컨퍼런스/ // 언론 활동
    ];
    
    const hasNeutralPattern = obviousNeutral.some(pattern => pattern.test(lowerText));
    if (hasNeutralPattern && !(/상승|하락|급등|급락/.test(lowerText))) {
        return { 
            sentiment: 'neutral', 
            confidence: 75, 
            method: 'keyword_neutral',
            reason: 'obvious_neutral' 
        };
    }
    
    // 애매한 경우 → AI API 필요
    return null;
}

// === 2단계: AI API 호출 (시뮬레이션) ===
async function callAISentimentAPI(text) {
    // 실제로는 네이버 클로바, OpenAI, 구글 등 API 호출
    console.log(`   🤖 AI API 호출: "${text.substring(0, 50)}..."`);
    
    // API 호출 시뮬레이션 (실제로는 HTTP 요청)
    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 지연
    
    // 시뮬레이션된 AI 분석 결과
    const aiResult = simulateAIAnalysis(text);
    
    return {
        sentiment: aiResult.sentiment,
        confidence: aiResult.confidence,
        method: 'ai_api',
        reason: 'contextual_analysis'
    };
}

// AI 분석 시뮬레이션 (실제로는 API 응답)
function simulateAIAnalysis(text) {
    const lowerText = text.toLowerCase();
    
    // 복잡한 문맥 분석 시뮬레이션
    if (lowerText.includes('우려') && lowerText.includes('해소')) {
        return { sentiment: 'positive', confidence: 80 }; // "우려 해소" = 긍정
    }
    
    if (lowerText.includes('전망') && lowerText.includes('밝')) {
        return { sentiment: 'positive', confidence: 85 }; // "전망 밝아" = 긍정
    }
    
    if (lowerText.includes('가능성') || lowerText.includes('예상')) {
        return { sentiment: 'neutral', confidence: 70 }; // 추측성 = 중립
    }
    
    // 기본값
    return { sentiment: 'neutral', confidence: 60 };
}

// === 메인 하이브리드 분석 함수 ===
async function hybridSentimentAnalysis(title, description = '') {
    const text = title + ' ' + (description || '');
    console.log(`🔄 하이브리드 감정분석: "${title.substring(0, 50)}..."`);
    
    // 1단계: 키워드 빠른 필터링
    const keywordResult = quickSentimentFilter(text);
    
    if (keywordResult) {
        console.log(`   ⚡ 키워드 확정: ${keywordResult.sentiment} (${keywordResult.confidence}%)`);
        return keywordResult;
    }
    
    // 2단계: AI API 정밀 분석
    console.log(`   🤔 애매한 경우 → AI API 호출`);
    const aiResult = await callAISentimentAPI(text);
    console.log(`   🎯 AI 결과: ${aiResult.sentiment} (${aiResult.confidence}%)`);
    
    return aiResult;
}

// === 실제 API 연동 예시 (주석 처리) ===
/*
// 네이버 클로바 감정분석 API 실제 호출
async function callNaverClovaSentiment(text) {
    try {
        const response = await fetch('https://naveropenapi.apigw.ntruss.com/sentiment-analysis/v1/analyze', {
            method: 'POST',
            headers: {
                'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID,
                'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: text })
        });
        
        const result = await response.json();
        
        return {
            sentiment: result.document.sentiment, // positive/negative/neutral
            confidence: Math.round(result.document.confidence.positive * 100),
            method: 'naver_clova',
            raw: result
        };
    } catch (error) {
        console.error('네이버 클로바 API 호출 실패:', error);
        return { sentiment: 'neutral', confidence: 50, method: 'fallback' };
    }
}

// OpenAI GPT 감정분석
async function callOpenAISentiment(text) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{
                role: "system",
                content: "당신은 한국 금융뉴스 감정분석 전문가입니다. positive/negative/neutral 중 하나와 0-100% 신뢰도를 JSON 형태로 답해주세요."
            }, {
                role: "user", 
                content: `뉴스: "${text}"`
            }],
            temperature: 0.1,
            max_tokens: 100
        });
        
        const aiText = response.choices[0].message.content;
        const parsed = JSON.parse(aiText);
        
        return {
            sentiment: parsed.sentiment,
            confidence: parsed.confidence,
            method: 'openai_gpt',
            reasoning: parsed.reason || ''
        };
    } catch (error) {
        console.error('OpenAI API 호출 실패:', error);
        return { sentiment: 'neutral', confidence: 50, method: 'fallback' };
    }
}
*/

// === 성능 및 비용 최적화 ===
class SentimentCache {
    constructor(maxSize = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    
    get(text) {
        return this.cache.get(this.hash(text));
    }
    
    set(text, result) {
        const key = this.hash(text);
        
        // 캐시 크기 제한
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, result);
    }
    
    hash(text) {
        // 간단한 해시 함수 (실제로는 crypto 모듈 사용 권장)
        return text.toLowerCase().replace(/\s+/g, '').substring(0, 50);
    }
}

const cache = new SentimentCache();

// 캐시 적용된 하이브리드 분석
async function cachedHybridSentiment(title, description = '') {
    const text = title + ' ' + (description || '');
    
    // 캐시 확인
    const cached = cache.get(text);
    if (cached) {
        console.log(`💾 캐시 히트: ${cached.sentiment} (${cached.confidence}%)`);
        return cached;
    }
    
    // 새로운 분석
    const result = await hybridSentimentAnalysis(title, description);
    
    // 캐시 저장 (확신도 높은 경우만)
    if (result.confidence >= 80) {
        cache.set(text, result);
    }
    
    return result;
}

module.exports = { 
    hybridSentimentAnalysis, 
    cachedHybridSentiment,
    quickSentimentFilter 
};

// === 테스트 실행 ===
if (require.main === module) {
    console.log('🔄 하이브리드 감정분석 테스트\n');
    
    const testCases = [
        "페이코인 폭등! 신고가 돌파", // 확실한 긍정 → 키워드만으로 처리
        "비트코인 사기 급증, 피해자 속출", // 확실한 부정 → 키워드만으로 처리  
        "다날 실적 개선 전망에 투자자 관심", // 애매한 경우 → AI API 호출
        "페이코인 가격 하락 우려 해소", // 복잡한 문맥 → AI API 호출
        "비트코인 9월 반등 가능성 제기" // 조건부 표현 → AI API 호출
    ];
    
    async function runTests() {
        for (let i = 0; i < testCases.length; i++) {
            console.log(`${i+1}. 테스트 케이스`);
            const result = await cachedHybridSentiment(testCases[i]);
            console.log(`   최종 결과: ${result.sentiment} (${result.confidence}%) [${result.method}]\n`);
        }
        
        console.log('📊 API 호출 최적화:');
        console.log('- 확실한 경우: 키워드만으로 즉시 처리 (비용 0원)');
        console.log('- 애매한 경우: AI API 호출 (비용 발생)');
        console.log('- 캐시 적용: 동일 뉴스 재분석 방지');
    }
    
    runTests();
}