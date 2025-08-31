// 맥락 보정이 적용된 감정분석 테스트
const fs = require('fs');

// 다양한 맥락의 테스트 뉴스들
const testNews = [
    {
        title: "보이스피싱, 비트코인·테더도 뜯는다…1년새 6배 넘게 폭증",
        expected: "negative", // 범죄 + 폭증 = 부정
        context: "범죄 증가"
    },
    {
        title: "코로나19 확진자 급증, 병원 입원율 3배 상승",
        expected: "negative", // 질병 + 증가 = 부정
        context: "질병 증가"
    },
    {
        title: "해킹 공격 급증으로 보안 위험 확산", 
        expected: "negative", // 해킹 + 증가 = 부정
        context: "보안 위험 증가"
    },
    {
        title: "다날 매출 급증, 전년대비 300% 상승",
        expected: "positive", // 매출 + 증가 = 긍정 (정상)
        context: "매출 증가"
    },
    {
        title: "투자자 관심 폭증, 주가 연일 상승세",
        expected: "positive", // 투자 관심 + 증가 = 긍정 (정상)  
        context: "관심 증가"
    },
    {
        title: "교통사고 사망자 급증, 안전 우려 확산",
        expected: "negative", // 사고 + 증가 = 부정
        context: "사고 증가"
    },
    {
        title: "실업률 급상승, 경제 불안 가중",
        expected: "negative", // 실업 + 상승 = 부정
        context: "실업 증가"
    }
];

// app.js에서 감정분석 함수 복사하되 맥락 보정이 강화된 버전
function contextualSentimentAnalysis(title, description = '') {
    console.log(`🤖 맥락 강화 감정분석: "${title}"`);
    
    const text = (title + ' ' + description).toLowerCase();
    
    // 키워드 사전
    const positiveKeywords = {
        '폭등': 5, '급등': 4, '치솟': 4, '상한가': 5, '신고가': 4, '최고가': 4,
        '급상승': 3, '돌파': 3, '뛰어올라': 3, '강세': 3, '상승세': 3,
        '상승': 2, '증가': 2, '호재': 2, '성장': 2, '개선': 2, '회복': 2,
        '협력': 2, '파트너': 2, '선정': 3, '구축': 2, '투자': 2, '매출증가': 3
    };

    const negativeKeywords = {
        '폭락': 5, '급락': 4, '추락': 4, '하한가': 5, '최저가': 4,
        '급하락': 3, '붕괴': 3, '약세': 3, '하락세': 3,
        '하락': 2, '내림': 2, '내림세': 2, '감소': 2, '악재': 2,
        '사기': 3, '피싱': 3, '범죄': 3, '해킹': 3, '위험': 2, '우려': 2
    };

    // 기본 키워드 분석
    let positiveScore = 0;
    let negativeScore = 0;
    let foundPositive = [];
    let foundNegative = [];

    // 긍정 키워드 검색
    for (const [keyword, weight] of Object.entries(positiveKeywords)) {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        if (matches > 0) {
            const score = matches * weight;
            positiveScore += score;
            foundPositive.push(`${keyword}(${matches}×${weight}=${score})`);
            console.log(`   ✅ [긍정] 발견: "${keyword}" (${matches}회, ${score}점)`);
        }
    }

    // 부정 키워드 검색
    for (const [keyword, weight] of Object.entries(negativeKeywords)) {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        if (matches > 0) {
            const score = matches * weight;
            negativeScore += score;
            foundNegative.push(`${keyword}(${matches}×${weight}=${score})`);
            console.log(`   ❌ [부정] 발견: "${keyword}" (${matches}회, ${score}점)`);
        }
    }

    // 🔥 강화된 맥락 보정 시스템
    function applyAdvancedContextualCorrection() {
        const fullText = title.toLowerCase() + ' ' + (description || '').toLowerCase();
        
        // 부정적 주제/맥락 카테고리
        const negativeContextCategories = {
            // 범죄/보안
            crime: ['범죄', '사기', '피싱', '보이스피싱', '해킹', '공격', '악용', '불법', '위반'],
            // 질병/건강
            health: ['코로나', '확진', '감염', '바이러스', '질병', '환자', '사망', '병원'],
            // 사고/재해
            accident: ['사고', '화재', '폭발', '붕괴', '추락', '충돌', '재해', '피해'],
            // 경제 부정
            economic: ['실업', '파산', '도산', '적자', '손실', '위기', '불황', '침체'],
            // 사회 문제
            social: ['갈등', '분쟁', '시위', '폭동', '테러', '전쟁', '분열', '대립']
        };
        
        // 증가/상승을 나타내는 표현들
        const increaseExpressions = [
            '증가', '급증', '폭증', '상승', '급상승', '치솟', '늘어', '확산', '번져',
            '배', '배증', '배늘', '증가율', '상승률', '늘어나', '커지', '확대', 
            '급등', '폭등', '치솟아', '뛰어올라'
        ];
        
        let contextCorrections = [];
        let totalCorrectionScore = 0;
        
        // 각 카테고리별로 맥락 분석
        Object.entries(negativeContextCategories).forEach(([category, keywords]) => {
            let hasNegativeContext = false;
            let foundContext = '';
            
            // 부정적 맥락 확인
            for (const keyword of keywords) {
                if (fullText.includes(keyword)) {
                    hasNegativeContext = true;
                    foundContext = keyword;
                    break;
                }
            }
            
            if (hasNegativeContext) {
                // 증가 표현 확인
                for (const increaseWord of increaseExpressions) {
                    if (fullText.includes(increaseWord)) {
                        const correctionScore = 3; // 맥락 보정 점수
                        totalCorrectionScore += correctionScore;
                        contextCorrections.push(`${category}:${foundContext}+${increaseWord}(+${correctionScore}점)`);
                        
                        console.log(`   🔧 [${category}] 맥락 보정: "${foundContext}" + "${increaseWord}" → 부정 +${correctionScore}점`);
                        break;
                    }
                }
            }
        });
        
        // 긍정 점수를 부정으로 전환 + 추가 부정 점수
        if (totalCorrectionScore > 0) {
            const transferredScore = positiveScore;
            positiveScore = 0;
            negativeScore += transferredScore + totalCorrectionScore;
            
            foundNegative.push(`맥락보정(${contextCorrections.join(',')},이전긍정${transferredScore}점전환)`);
            
            console.log(`   🔄 맥락 보정 완료: 긍정 ${transferredScore}점 전환 + 추가 ${totalCorrectionScore}점 = 총 부정 ${transferredScore + totalCorrectionScore}점 추가`);
        }
        
        return {
            correctedPositive: positiveScore,
            correctedNegative: negativeScore,
            correctionApplied: totalCorrectionScore > 0,
            corrections: contextCorrections
        };
    }
    
    // 맥락 보정 적용
    const correction = applyAdvancedContextualCorrection();
    positiveScore = correction.correctedPositive;
    negativeScore = correction.correctedNegative;

    // 감정 분류
    let sentiment, confidence, emoji;
    
    if (positiveScore === 0 && negativeScore === 0) {
        sentiment = 'neutral';
        confidence = 30;
        emoji = '😐';
    } else if (positiveScore > negativeScore) {
        sentiment = 'positive';
        const scoreStrength = Math.min(positiveScore, 5) / 5;
        const dominanceRatio = (positiveScore - negativeScore) / (positiveScore + negativeScore);
        confidence = Math.min(85, 30 + scoreStrength * 40 + dominanceRatio * 15);
        emoji = positiveScore >= 3 ? '🚀' : (positiveScore >= 2 ? '📈' : '😊');
    } else {
        sentiment = 'negative';
        const scoreStrength = Math.min(negativeScore, 5) / 5;
        const dominanceRatio = (negativeScore - positiveScore) / (positiveScore + negativeScore);
        confidence = Math.min(85, 30 + scoreStrength * 40 + dominanceRatio * 15);
        emoji = negativeScore >= 3 ? '💀' : (negativeScore >= 2 ? '📉' : '😰');
    }
    
    const result = {
        sentiment,
        confidence: Math.round(confidence),
        emoji,
        scores: { positive: positiveScore, negative: negativeScore },
        keywords: { positive: foundPositive, negative: foundNegative },
        contextCorrection: correction.correctionApplied ? correction.corrections : null
    };
    
    console.log(`   감정: ${sentiment} (${emoji}) 신뢰도: ${result.confidence}%`);
    console.log(`   점수: 긍정 ${positiveScore}, 부정 ${negativeScore}`);
    if (foundPositive.length > 0) console.log(`   🟢 긍정: ${foundPositive.join(', ')}`);
    if (foundNegative.length > 0) console.log(`   🔴 부정: ${foundNegative.join(', ')}`);
    if (correction.correctionApplied) console.log(`   🔧 맥락보정: ${correction.corrections.join(', ')}`);
    
    return result;
}

console.log('🧪 강화된 맥락 보정 감정분석 테스트:\n');

let correct = 0;
let total = testNews.length;

testNews.forEach((news, index) => {
    console.log(`[${index + 1}/${total}] ${news.context}`);
    console.log(`제목: ${news.title}`);
    console.log(`예상: ${news.expected}`);
    
    const result = contextualSentimentAnalysis(news.title);
    const isCorrect = result.sentiment === news.expected;
    
    if (isCorrect) {
        correct++;
        console.log(`✅ 정답! (${result.sentiment} ${result.emoji})`);
    } else {
        console.log(`❌ 오답: ${result.sentiment} ${result.emoji} (예상: ${news.expected})`);
    }
    
    console.log('='.repeat(80));
});

console.log(`\n📊 맥락 보정 테스트 결과: ${correct}/${total} (${Math.round(correct/total*100)}% 정확도)`);

// 실제 저장된 뉴스도 다시 테스트
console.log('\n📰 저장된 뉴스 맥락 보정 재분석:\n');

const stateData = JSON.parse(fs.readFileSync('monitoring_state_final.json', 'utf8'));
const newsHistory = stateData.newsHistory || [];

newsHistory.forEach((news, index) => {
    console.log(`[${index + 1}/${newsHistory.length}] [${news.asset}] ${news.title}`);
    const result = contextualSentimentAnalysis(news.title, news.description || '');
    console.log('-'.repeat(50));
});

console.log('\n✅ 맥락 보정 적용된 감정분석 테스트 완료!');