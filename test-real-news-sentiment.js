// 저장된 실제 뉴스로 개선된 감정분석 테스트
const fs = require('fs');
const { improvedSentimentAnalysis } = require('./improved-sentiment-analysis');

// 기존 감정분석 함수 (app.js에서 복사)
function analyzeNewsSentiment(title, description = '') {
    const text = (title + ' ' + description).toLowerCase();
    
    const positiveKeywords = {
        '폭등': 5, '급등': 4, '치솟': 4, '상한가': 5, '신고가': 4, '최고가': 4,
        '급상승': 3, '돌파': 3, '뛰어올라': 3, '강세': 3, '상승세': 3, '대폭상승': 3,
        '상승': 2, '오름': 2, '증가': 2, '호재': 2, '플러스': 2, '개선': 2, '회복': 2, '반등': 2, '성장': 2,
        '협력': 2, '파트너': 2, '제휴': 2, '계약': 2, '선정': 3, '구축': 2, '확장': 2,
        '흑자전환': 5, '실적개선': 4, '투자유치': 4, '펀딩': 4, '신사업': 3
    };
    
    const negativeKeywords = {
        '폭락': 5, '급락': 4, '추락': 4, '하한가': 5, '최저가': 4,
        '급하락': 3, '붕괴': 3, '약세': 3, '하락세': 3, '대폭하락': 3,
        '하락': 2, '내림': 2, '감소': 2, '악재': 2, '마이너스': 2, 
        '사기': 3, '피싱': 3, '범죄': 3, '해킹': 3, '위험': 2, '우려': 2,
        '실적악화': 5, '적자': 4, '손실': 3, '위기': 4, '충격': 4, '패닉': 5,
        '보이스피싱': 5, '전화사기': 5, '투자사기': 5, '불법': 4
    };
    
    let positiveScore = 0;
    let negativeScore = 0;
    
    // 간단한 키워드 매칭
    Object.entries(positiveKeywords).forEach(([keyword, weight]) => {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        positiveScore += matches * weight;
    });
    
    Object.entries(negativeKeywords).forEach(([keyword, weight]) => {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        negativeScore += matches * weight;
    });
    
    let sentiment, confidence, emoji;
    
    if (positiveScore > negativeScore) {
        sentiment = 'positive';
        const ratio = positiveScore / (positiveScore + negativeScore);
        confidence = Math.min(85, Math.round(30 + ratio * 55));
        emoji = positiveScore >= 3 ? '🚀' : '📈';
    } else if (negativeScore > positiveScore) {
        sentiment = 'negative'; 
        const ratio = negativeScore / (positiveScore + negativeScore);
        confidence = Math.min(85, Math.round(30 + ratio * 55));
        emoji = negativeScore >= 3 ? '💀' : '📉';
    } else {
        sentiment = 'neutral';
        confidence = 30;
        emoji = '😐';
    }
    
    return { sentiment, confidence, emoji };
}

console.log('📊 실제 뉴스 데이터로 감정분석 성능 비교\n');

// 저장된 뉴스 읽기
let newsHistory = [];
try {
    const state = JSON.parse(fs.readFileSync('monitoring_state_final.json', 'utf8'));
    newsHistory = state.newsHistory || [];
} catch (error) {
    console.error('뉴스 데이터 읽기 실패:', error.message);
    process.exit(1);
}

console.log(`📰 총 ${newsHistory.length}개 실제 뉴스로 테스트\n`);

// 수동으로 라벨링한 정답 데이터 (실제 뉴스 기준)
const groundTruth = {
    "페이코인, CU편의점 등 가상자산 실생활 결제 확대": 'positive', // 실용화 확대 = 긍정
    "다날, 스테이블코인 생태계 구축…엑셀라 파트너사 선정": 'positive', // 파트너십 = 긍정
    ""비트코인 회복력·수익성 입증 …1년 내 30만 달러 간다"": 'positive', // 강세 전망 = 긍정
    "다날, 엑셀라와 협력해 글로벌 스테이블코인 결제 생태계 구축": 'positive', // 협력 = 긍정
    "CNBC \"비트코인, 9월에 다시 단기 힘 받을 수도\"": 'neutral', // 조건부 예측 = 중립
    "비트코인, 단기 보유자 실현 가격 붕괴...8만 6,000달러까지 추락하나": 'negative', // 붕괴/추락 = 부정
    "페이코인 가격 상승세에 투자자 관심 증가": 'positive',
    "비트코인 해킹 사고로 거래소 피해 급증": 'negative'
};

let oldCorrect = 0;
let newCorrect = 0;
let total = 0;

console.log('=== 비교 결과 ===\n');

// 저장된 뉴스에서 테스트
newsHistory.slice(0, 20).forEach((news, i) => {
    const title = news.title;
    const expected = groundTruth[title];
    
    if (!expected) return; // 라벨링되지 않은 뉴스 제외
    
    total++;
    console.log(`${total}. "${title}"`);
    
    // 기존 시스템 테스트
    const oldResult = analyzeNewsSentiment(title);
    const oldCorrect_single = oldResult.sentiment === expected;
    if (oldCorrect_single) oldCorrect++;
    
    // 개선된 시스템 테스트  
    const newResult = improvedSentimentAnalysis(title);
    const newCorrect_single = newResult.sentiment === expected;
    if (newCorrect_single) newCorrect++;
    
    console.log(`   예상: ${expected}`);
    console.log(`   기존: ${oldResult.sentiment} (${oldResult.confidence}%) ${oldCorrect_single ? '✅' : '❌'}`);
    console.log(`   개선: ${newResult.sentiment} (${newResult.confidence}%) ${newCorrect_single ? '✅' : '❌'}`);
    console.log('');
});

console.log('📊 최종 성능 비교:');
console.log(`기존 시스템: ${oldCorrect}/${total} (${Math.round(oldCorrect/total*100)}%)`);
console.log(`개선 시스템: ${newCorrect}/${total} (${Math.round(newCorrect/total*100)}%)`);
console.log(`개선 효과: +${Math.round((newCorrect-oldCorrect)/total*100)}%p`);

// 추가 분석
if (newsHistory.length > 0) {
    console.log('\n📈 전체 뉴스 감정 분포 (개선된 시스템):');
    
    let sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    let totalConfidence = 0;
    
    newsHistory.forEach(news => {
        const result = improvedSentimentAnalysis(news.title);
        sentimentCounts[result.sentiment]++;
        totalConfidence += result.confidence;
    });
    
    const avgConfidence = Math.round(totalConfidence / newsHistory.length);
    
    console.log(`긍정: ${sentimentCounts.positive}개 (${Math.round(sentimentCounts.positive/newsHistory.length*100)}%)`);
    console.log(`부정: ${sentimentCounts.negative}개 (${Math.round(sentimentCounts.negative/newsHistory.length*100)}%)`);
    console.log(`중립: ${sentimentCounts.neutral}개 (${Math.round(sentimentCounts.neutral/newsHistory.length*100)}%)`);
    console.log(`평균 신뢰도: ${avgConfidence}%`);
    
    // 현실적인 분포 확인 (일반적으로 중립 60-80%, 긍정 10-25%, 부정 5-15%)
    const neutralRatio = sentimentCounts.neutral / newsHistory.length;
    console.log(`\n🎯 분포 평가: ${neutralRatio >= 0.6 && neutralRatio <= 0.8 ? '정상적' : '비정상적'} (중립 비율: ${Math.round(neutralRatio*100)}%)`);
}