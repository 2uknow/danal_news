// 금융 전문용어가 강화된 감정분석 테스트
const fs = require('fs');

// 테스트할 샘플 뉴스
const testNews = [
    {
        title: "다날 주가 8월 26일 7,840원 거래 중 4.51% 내림세",
        expected: "negative"
    },
    {
        title: "비트코인 '美 개인소비지출 지수 상승'에 10만8천달러대 하락", 
        expected: "negative"
    },
    {
        title: "보이스피싱, 비트코인·테더도 뜯는다…1년새 6배 넘게 폭증",
        expected: "negative" // 범죄 관련이므로 부정
    },
    {
        title: "다날, 스테이블코인 생태계 구축…엑셀라 파트너사 선정",
        expected: "positive"
    },
    {
        title: "다날, 엑셀라와 협력해 글로벌 스테이블코인 결제 생태계 구축",
        expected: "positive"
    }
];

function improvedAnalyzeNewsSentiment(title, description = '') {
    console.log(`🤖 강화된 감정분석: "${title}"`);
    
    const text = (title + ' ' + description).toLowerCase();
    
    // 🔥 금융 전문용어가 강화된 키워드 사전
    const positiveKeywords = {
        // 초강력 상승 (가중치 5)
        '폭등': 5, '급등': 4, '치솟': 4, '상한가': 5, '신고가': 4, '최고가': 4,
        
        // 강력 상승 (가중치 3) 
        '급상승': 3, '돌파': 3, '뛰어올라': 3, '강세': 3, '상승세': 3, '대폭상승': 3,
        
        // 일반 상승 (가중치 2)
        '상승': 2, '오름': 2, '증가': 2, '호재': 2, '플러스': 2, '상승폭': 2, '상승률': 2,
        '개선': 2, '회복': 2, '반등': 2, '성장': 2,
        
        // 비즈니스 긍정 (가중치 2-3)
        '협력': 2, '파트너': 2, '제휴': 2, '계약': 2, '선정': 3, '구축': 2, '확장': 2,
        '런칭': 2, '출시': 2, '도입': 2, '투자': 2, '수주': 3,
        
        // 약한 상승 (가중치 1)
        '양호': 1, '긍정': 1, '좋': 1, '우상향': 1, '견고': 1
    };

    const negativeKeywords = {
        // 초강력 하락 (가중치 5)
        '폭락': 5, '급락': 4, '추락': 4, '하한가': 5, '최저가': 4,
        
        // 강력 하락 (가중치 3)
        '급하락': 3, '붕괴': 3, '급반락': 3, '약세': 3, '하락세': 3, '대폭하락': 3,
        
        // 일반 하락 (가중치 2)
        '하락': 2, '내림': 2, '내림세': 2, '감소': 2, '악재': 2, '마이너스': 2, 
        '하락폭': 2, '하락률': 2, '떨어짐': 2, '하회': 2,
        
        // 부정적 사건 (가중치 2-3)
        '사기': 3, '피싱': 3, '범죄': 3, '해킹': 3, '위험': 2, '우려': 2, '경고': 2,
        '제재': 3, '규제': 2, '금지': 3, '중단': 2, '취소': 2,
        
        // 약한 하락 (가중치 1)
        '부진': 1, '둔화': 1, '조정': 1, '부정': 1, '나쁨': 1
    };

    // 중립 키워드
    const neutralKeywords = {
        '보합': 1, '횡보': 1, '안정': 1, '유지': 1, '변동없음': 1, '소폭': 1,
        '거래': 1, '기록': 1, '발표': 1
    };

    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;
    
    let foundPositive = [];
    let foundNegative = [];
    let foundNeutral = [];

    // 🔥 개선된 키워드 매칭 (부분 매칭 지원)
    function findKeywords(text, keywords, type) {
        let score = 0;
        let found = [];
        
        for (const [keyword, weight] of Object.entries(keywords)) {
            // 정확 매칭 우선
            const exactMatches = (text.match(new RegExp(keyword, 'g')) || []).length;
            
            if (exactMatches > 0) {
                score += exactMatches * weight;
                found.push(`${keyword}(${exactMatches}×${weight}=${exactMatches * weight})`);
                console.log(`   ✅ [${type}] 발견: "${keyword}" (${exactMatches}회, ${exactMatches * weight}점)`);
            }
            
            // 부분 매칭 시도 (더 유연한 매칭)
            else if (keyword.length > 2) {
                const partialRegex = new RegExp(keyword.substring(0, keyword.length-1), 'g');
                const partialMatches = (text.match(partialRegex) || []).length;
                
                if (partialMatches > 0 && !found.some(f => f.includes(keyword.substring(0, keyword.length-1)))) {
                    const partialScore = Math.ceil(partialMatches * weight * 0.7); // 부분매칭은 70% 점수
                    score += partialScore;
                    found.push(`${keyword.substring(0, keyword.length-1)}*(${partialMatches}×${weight}×0.7=${partialScore})`);
                    console.log(`   🔍 [${type}] 부분매칭: "${keyword.substring(0, keyword.length-1)}" (${partialMatches}회, ${partialScore}점)`);
                }
            }
        }
        
        return { score, found };
    }

    // 각 키워드 타입별 분석
    const positiveResult = findKeywords(text, positiveKeywords, '긍정');
    const negativeResult = findKeywords(text, negativeKeywords, '부정');  
    const neutralResult = findKeywords(text, neutralKeywords, '중립');

    positiveScore = positiveResult.score;
    negativeScore = negativeResult.score;
    neutralScore = neutralResult.score;
    foundPositive = positiveResult.found;
    foundNegative = negativeResult.found;
    foundNeutral = neutralResult.found;
    
    // 🔥 퍼센트 패턴 분석 (4.51%, -3.2% 등)
    const percentMatches = text.match(/[-+]?\d+\.?\d*%/g);
    if (percentMatches) {
        percentMatches.forEach(percent => {
            const value = parseFloat(percent.replace('%', ''));
            if (percent.includes('-') || (value < 0)) {
                negativeScore += 2;
                foundNegative.push(`${percent}(하락률=2점)`);
                console.log(`   📊 [부정] 하락률 발견: "${percent}" (2점)`);
            } else if (value > 3) {
                positiveScore += 2;
                foundPositive.push(`${percent}(상승률=2점)`);
                console.log(`   📊 [긍정] 상승률 발견: "${percent}" (2점)`);
            }
        });
    }

    // 감정 분류 및 신뢰도 계산 (개선된 버전)
    const totalScore = positiveScore + negativeScore + neutralScore;
    let sentiment, confidence, emoji;
    
    if (totalScore === 0) {
        sentiment = 'neutral';
        confidence = 0.3;
        emoji = '😐';
    } else if (positiveScore > negativeScore) {
        sentiment = 'positive';
        
        const scoreStrength = Math.min(positiveScore, 5) / 5;
        const dominanceRatio = (positiveScore - negativeScore) / (positiveScore + negativeScore);
        confidence = Math.min(0.85, 0.3 + scoreStrength * 0.4 + dominanceRatio * 0.15);
        
        if (positiveScore >= 3) emoji = '🚀';
        else if (positiveScore >= 2) emoji = '📈'; 
        else emoji = '😊';
    } else if (negativeScore > positiveScore) {
        sentiment = 'negative';
        
        const scoreStrength = Math.min(negativeScore, 5) / 5;
        const dominanceRatio = (negativeScore - positiveScore) / (positiveScore + negativeScore);
        confidence = Math.min(0.85, 0.3 + scoreStrength * 0.4 + dominanceRatio * 0.15);
        
        if (negativeScore >= 3) emoji = '💀';
        else if (negativeScore >= 2) emoji = '📉';
        else emoji = '😰';
    } else {
        sentiment = 'neutral';
        confidence = 0.6;
        emoji = '🤔';
    }
    
    const result = {
        sentiment: sentiment,
        confidence: Math.round(confidence * 100),
        emoji: emoji,
        scores: {
            positive: positiveScore,
            negative: negativeScore,
            neutral: neutralScore
        },
        keywords: {
            positive: foundPositive,
            negative: foundNegative,
            neutral: foundNeutral
        }
    };
    
    // 결과 출력
    console.log(`   감정: ${sentiment} (${emoji})`);
    console.log(`   신뢰도: ${result.confidence}%`);
    console.log(`   점수: 긍정 ${positiveScore}, 부정 ${negativeScore}, 중립 ${neutralScore}`);
    if (foundPositive.length > 0) console.log(`   🟢 긍정 키워드: ${foundPositive.join(', ')}`);
    if (foundNegative.length > 0) console.log(`   🔴 부정 키워드: ${foundNegative.join(', ')}`);
    if (foundNeutral.length > 0) console.log(`   ⚪ 중립 키워드: ${foundNeutral.join(', ')}`);
    
    return result;
}

console.log('🧪 강화된 감정분석 테스트 시작:\n');

let correct = 0;
let total = testNews.length;

testNews.forEach((news, index) => {
    console.log(`[${index + 1}/${total}] 테스트 뉴스:`);
    console.log(`제목: ${news.title}`);
    console.log(`예상: ${news.expected}`);
    
    const result = improvedAnalyzeNewsSentiment(news.title);
    const isCorrect = result.sentiment === news.expected;
    
    if (isCorrect) {
        correct++;
        console.log(`✅ 정답! (${result.sentiment})`);
    } else {
        console.log(`❌ 오답: ${result.sentiment} (예상: ${news.expected})`);
    }
    
    console.log('='.repeat(80));
});

console.log(`\n📊 테스트 결과: ${correct}/${total} (${Math.round(correct/total*100)}% 정확도)`);

// 이제 실제 저장된 뉴스들도 테스트
console.log('\n📰 실제 저장된 뉴스 재분석:\n');

const stateData = JSON.parse(fs.readFileSync('monitoring_state_final.json', 'utf8'));
const newsHistory = stateData.newsHistory || [];

// 영향도가 높은 뉴스 선별 (부정/긍정 점수 2점 이상)
const significantNews = [];

newsHistory.forEach((news, index) => {
    const result = improvedAnalyzeNewsSentiment(news.title, news.description || '');
    
    // 영향도가 높은 뉴스 (점수 2점 이상 또는 신뢰도 50% 이상)
    if (result.scores.positive >= 2 || result.scores.negative >= 2 || result.confidence >= 50) {
        significantNews.push({
            ...news,
            sentiment: result
        });
        console.log(`📌 영향도 높은 뉴스로 선별됨!`);
    }
    
    console.log('-'.repeat(50));
});

console.log(`\n🎯 영향도 높은 뉴스: ${significantNews.length}/${newsHistory.length}개 선별됨`);

if (significantNews.length > 0) {
    console.log('\n📤 선별된 뉴스들:');
    significantNews.forEach((news, index) => {
        console.log(`${index + 1}. [${news.asset}] ${news.title}`);
        console.log(`   감정: ${news.sentiment.sentiment} ${news.sentiment.emoji} (${news.sentiment.confidence}%)`);
        console.log(`   점수: +${news.sentiment.scores.positive} -${news.sentiment.scores.negative}`);
    });
}