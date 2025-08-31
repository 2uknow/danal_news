// 저장된 뉴스들을 개선된 감정분석으로 종합 분석
const fs = require('fs');

// monitoring_state_final.json에서 뉴스 히스토리 읽기
const stateData = JSON.parse(fs.readFileSync('monitoring_state_final.json', 'utf8'));
const newsHistory = stateData.newsHistory || [];

// 강화된 맥락 보정 감정분석 함수 (간소화)
function analyzeSentimentWithContext(title, description = '') {
    const text = (title + ' ' + description).toLowerCase();
    
    const positiveKeywords = {
        '협력': 2, '파트너': 2, '선정': 3, '구축': 2, '투자': 2,
        '상승': 2, '증가': 2, '호재': 2, '성장': 2, '개선': 2
    };

    const negativeKeywords = {
        '하락': 2, '내림': 2, '내림세': 2, '감소': 2, '악재': 2,
        '사기': 3, '피싱': 3, '범죄': 3, '해킹': 3, '위험': 2, '우려': 2,
        '하회': 2
    };

    let positiveScore = 0;
    let negativeScore = 0;
    let foundKeywords = [];

    // 키워드 매칭
    for (const [keyword, weight] of Object.entries(positiveKeywords)) {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        if (matches > 0) {
            positiveScore += matches * weight;
            foundKeywords.push(`+${keyword}(${matches}×${weight})`);
        }
    }

    for (const [keyword, weight] of Object.entries(negativeKeywords)) {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        if (matches > 0) {
            negativeScore += matches * weight;
            foundKeywords.push(`-${keyword}(${matches}×${weight})`);
        }
    }

    // 맥락 보정 (범죄+증가 패턴)
    const crimeWords = ['범죄', '사기', '피싱', '해킹'];
    const increaseWords = ['증가', '급증', '폭증', '상승', '늘어', '확산'];
    
    let contextCorrection = false;
    for (const crime of crimeWords) {
        if (text.includes(crime)) {
            for (const increase of increaseWords) {
                if (text.includes(increase)) {
                    const transferScore = positiveScore;
                    positiveScore = 0;
                    negativeScore += transferScore + 3;
                    foundKeywords.push(`맥락보정(${crime}+${increase})`);
                    contextCorrection = true;
                    break;
                }
            }
            if (contextCorrection) break;
        }
    }

    // 감정 분류
    let sentiment, emoji, confidence;
    
    if (positiveScore === 0 && negativeScore === 0) {
        sentiment = 'neutral'; emoji = '😐'; confidence = 30;
    } else if (positiveScore > negativeScore) {
        sentiment = 'positive';
        confidence = Math.min(85, 30 + (positiveScore / 5) * 40);
        emoji = positiveScore >= 3 ? '🚀' : (positiveScore >= 2 ? '📈' : '😊');
    } else {
        sentiment = 'negative';
        confidence = Math.min(85, 30 + (negativeScore / 5) * 40);
        emoji = negativeScore >= 3 ? '💀' : (negativeScore >= 2 ? '📉' : '😰');
    }

    return {
        sentiment,
        emoji,
        confidence: Math.round(confidence),
        positiveScore,
        negativeScore,
        foundKeywords,
        contextCorrection
    };
}

console.log('📰 저장된 뉴스 감정분석 결과 (총 ' + newsHistory.length + '개)\n');
console.log('=' + '='.repeat(80));

let sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
let significantNews = [];

newsHistory.forEach((news, index) => {
    const result = analyzeSentimentWithContext(news.title, news.description || '');
    
    console.log(`\n[${index + 1}] [${news.asset}] ${news.title}`);
    console.log(`감정: ${result.sentiment.toUpperCase()} ${result.emoji} (${result.confidence}%)`);
    console.log(`점수: 긍정 ${result.positiveScore}, 부정 ${result.negativeScore}`);
    console.log(`언론사: ${news.press} | 시간: ${news.time}`);
    
    if (result.foundKeywords.length > 0) {
        console.log(`키워드: ${result.foundKeywords.join(', ')}`);
    }
    
    if (result.contextCorrection) {
        console.log('🔧 맥락보정 적용됨');
    }
    
    // 통계 집계
    sentimentCounts[result.sentiment]++;
    
    // 영향도 높은 뉴스 (점수 2점 이상 또는 신뢰도 60% 이상)
    if (result.positiveScore >= 2 || result.negativeScore >= 2 || result.confidence >= 60) {
        significantNews.push({
            ...news,
            analysis: result
        });
    }
    
    console.log('-'.repeat(80));
});

console.log('\n📊 감정분석 통계');
console.log('=' + '='.repeat(80));
console.log(`긍정 뉴스: ${sentimentCounts.positive}개 (${Math.round(sentimentCounts.positive/newsHistory.length*100)}%)`);
console.log(`부정 뉴스: ${sentimentCounts.negative}개 (${Math.round(sentimentCounts.negative/newsHistory.length*100)}%)`);
console.log(`중립 뉴스: ${sentimentCounts.neutral}개 (${Math.round(sentimentCounts.neutral/newsHistory.length*100)}%)`);

console.log('\n🎯 영향도 높은 뉴스 (' + significantNews.length + '개)');
console.log('=' + '='.repeat(80));

significantNews.forEach((news, index) => {
    const analysis = news.analysis;
    console.log(`${index + 1}. [${news.asset}] ${news.title}`);
    console.log(`   ${analysis.sentiment.toUpperCase()} ${analysis.emoji} (${analysis.confidence}%) - 점수: +${analysis.positiveScore}/-${analysis.negativeScore}`);
    if (analysis.contextCorrection) {
        console.log('   🔧 맥락보정 적용');
    }
    console.log('');
});

console.log('✅ 감정분석 완료!');