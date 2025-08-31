// 저장된 뉴스들을 개선된 감정분석으로 재분석하는 테스트 스크립트
const fs = require('fs');

// monitoring_state_final.json에서 뉴스 히스토리 읽기
const stateData = JSON.parse(fs.readFileSync('monitoring_state_final.json', 'utf8'));
const newsHistory = stateData.newsHistory || [];

console.log('📰 저장된 뉴스 개수:', newsHistory.length);
console.log('\n🧪 개선된 감정분석으로 뉴스 재분석 시작:\n');

// app.js에서 감정분석 함수 복사 (개선된 버전)
function analyzeNewsSentiment(title, description = '') {
    console.log(`🤖 뉴스 감정 분석 시작: "${title.substring(0, 50)}..."`);
    
    const text = (title + ' ' + description).toLowerCase();
    
    // 문장 단위 분리
    const sentences = text.split(/[.!?;,\n]/).filter(s => s.trim().length > 0);
    
    // 호재 키워드 (긍정) - 가중치 시스템
    const positiveKeywords = {
        // 초강력 상승 (가중치 5)
        '폭등': 5, '급등': 4, '치솟': 4, '상한가': 5, '신고가': 4,
        
        // 강력 상승 (가중치 3)
        '급상승': 3, '돌파': 3, '최고가': 3, '뛰어올라': 3, '강세': 3,
        
        // 일반 상승 (가중치 2)
        '상승': 2, '오름': 2, '증가': 2, '상승세': 2, '호재': 2, '플러스': 2, '상승폭': 2,
        
        // 약한 상승 (가중치 1)
        '양호': 1, '개선': 1, '회복': 1, '반등': 1, '긍정': 1, '좋': 1, '성장': 1
    };

    // 악재 키워드 (부정) - 가중치 시스템
    const negativeKeywords = {
        // 초강력 하락 (가중치 5)
        '폭락': 5, '급락': 4, '추락': 4, '하한가': 5, '최저가': 4,
        
        // 강력 하락 (가중치 3)
        '급하락': 3, '붕괴': 3, '추락': 3, '급반락': 3, '약세': 3,
        
        // 일반 하락 (가중치 2)
        '하락': 2, '내림': 2, '감소': 2, '하락세': 2, '악재': 2, '마이너스': 2, '하락폭': 2,
        
        // 약한 하락 (가중치 1)
        '우려': 1, '부진': 1, '둔화': 1, '조정': 1, '부정': 1, '나쁨': 1
    };

    // 중립 키워드 (가중치 1)
    const neutralKeywords = {
        '보합': 1, '횡보': 1, '안정': 1, '유지': 1, '변동없음': 1, '소폭': 1
    };

    // 부정사 패턴 (키워드 의미 반전)
    const negationPatterns = ['안', '못', '불', '비', '무', '없', '아니', '아직', '여전히'];
    
    // 강도 수식어 (가중치 조절)
    const intensityPatterns = {
        '매우': 1.5, '극도로': 2.0, '크게': 1.3, '대폭': 1.8, '소폭': 0.5,
        '약간': 0.6, '다소': 0.7, '상당히': 1.4, '현저히': 1.6, '급격히': 1.7
    };

    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;
    
    let foundPositive = [];
    let foundNegative = [];
    let foundNeutral = [];

    // 고급 감정 분석 함수 (맥락 고려)
    function processAdvancedSentiment(text, keywords, isPositive) {
        let score = 0;
        let found = [];
        
        for (const [keyword, weight] of Object.entries(keywords)) {
            const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
            
            if (matches > 0) {
                // 키워드 앞뒤 10글자 범위에서 맥락 분석
                const keywordRegex = new RegExp(`(.{0,10})${keyword}(.{0,10})`, 'g');
                const contexts = [...text.matchAll(keywordRegex)];
                
                let positiveMatches = 0;
                let negativeMatches = 0;
                let totalIntensityMultiplier = 1.0;
                
                contexts.forEach(match => {
                    const before = match[1] || '';
                    const after = match[2] || '';
                    const context = (before + after).toLowerCase();
                    
                    // 부정사 확인
                    let hasNegation = false;
                    for (const negation of negationPatterns) {
                        if (context.includes(negation)) {
                            hasNegation = true;
                            break;
                        }
                    }
                    
                    // 강도 수식어 확인
                    let contextMultiplier = 1.0;
                    for (const [intensifier, multiplier] of Object.entries(intensityPatterns)) {
                        if (context.includes(intensifier)) {
                            contextMultiplier *= multiplier;
                        }
                    }
                    
                    totalIntensityMultiplier *= contextMultiplier;
                    
                    if (hasNegation) {
                        negativeMatches++;
                    } else {
                        positiveMatches++;
                    }
                });
                
                if (positiveMatches > 0) {
                    const baseScore = positiveMatches * weight;
                    const finalScore = Math.round(baseScore * totalIntensityMultiplier);
                    score += isPositive ? finalScore : -finalScore;
                    
                    const multiplierText = totalIntensityMultiplier !== 1.0 ? `×${totalIntensityMultiplier.toFixed(1)}` : '';
                    found.push(`${keyword}(${positiveMatches}×${weight}${multiplierText}=${finalScore})`);
                }
                
                if (negativeMatches > 0) {
                    const baseScore = negativeMatches * weight;
                    const finalScore = Math.round(baseScore * totalIntensityMultiplier);
                    score += isPositive ? -finalScore : finalScore;
                    
                    const multiplierText = totalIntensityMultiplier !== 1.0 ? `×${totalIntensityMultiplier.toFixed(1)}` : '';
                    found.push(`[부정]${keyword}(${negativeMatches}×${weight}${multiplierText}=${finalScore})`);
                }
            }
        }
        
        return { score: Math.max(0, score), found };
    }

    // 맥락 기반 감정 분석 함수
    function analyzeContextualSentiment() {
        let totalPositiveScore = 0;
        let totalNegativeScore = 0;
        let totalNeutralScore = 0;
        let allFoundPositive = [];
        let allFoundNegative = [];
        let allFoundNeutral = [];
        
        // 문장별로 감정 분석
        sentences.forEach((sentence, index) => {
            if (sentence.trim().length < 3) return;
            
            console.log(`   문장 ${index + 1}: "${sentence.trim()}"`);
            
            const sentencePositive = processAdvancedSentiment(sentence, positiveKeywords, true);
            const sentenceNegative = processAdvancedSentiment(sentence, negativeKeywords, false);
            const sentenceNeutral = processAdvancedSentiment(sentence, neutralKeywords, true);
            
            // 문장별 감정 우세도 계산
            const sentenceTotal = Math.abs(sentencePositive.score) + Math.abs(sentenceNegative.score);
            let sentenceWeight = 1.0;
            
            // 문장 길이에 따른 가중치
            if (sentence.length > 30) sentenceWeight *= 1.2;
            else if (sentence.length < 10) sentenceWeight *= 0.8;
            
            // 감정이 혼재된 경우 처리
            if (sentenceTotal > 0) {
                const positiveRatio = Math.abs(sentencePositive.score) / sentenceTotal;
                const negativeRatio = Math.abs(sentenceNegative.score) / sentenceTotal;
                
                const adjustedPositive = Math.round(sentencePositive.score * sentenceWeight * positiveRatio);
                const adjustedNegative = Math.round(sentenceNegative.score * sentenceWeight * negativeRatio);
                const adjustedNeutral = Math.round(sentenceNeutral.score * sentenceWeight);
                
                totalPositiveScore += adjustedPositive;
                totalNegativeScore += adjustedNegative;
                totalNeutralScore += adjustedNeutral;
                
                console.log(`     → 감정점수: 긍정=${adjustedPositive}, 부정=${adjustedNegative}, 중립=${adjustedNeutral}`);
                
                sentencePositive.found.forEach(item => 
                    allFoundPositive.push(`[문장${index + 1}]${item}`));
                sentenceNegative.found.forEach(item => 
                    allFoundNegative.push(`[문장${index + 1}]${item}`));
                sentenceNeutral.found.forEach(item => 
                    allFoundNeutral.push(`[문장${index + 1}]${item}`));
            }
        });
        
        return {
            positiveScore: Math.max(0, totalPositiveScore),
            negativeScore: Math.max(0, totalNegativeScore),
            neutralScore: Math.abs(totalNeutralScore),
            foundPositive: allFoundPositive,
            foundNegative: allFoundNegative,
            foundNeutral: allFoundNeutral
        };
    }
    
    // 맥락 기반 감정 분석 실행
    const contextualResult = analyzeContextualSentiment();
    
    positiveScore = contextualResult.positiveScore;
    negativeScore = contextualResult.negativeScore;
    neutralScore = contextualResult.neutralScore;
    foundPositive = contextualResult.foundPositive;
    foundNegative = contextualResult.foundNegative;
    foundNeutral = contextualResult.foundNeutral;
    
    // 감정 분류 및 신뢰도 계산 (개선된 버전)
    const totalScore = positiveScore + negativeScore + neutralScore;
    let sentiment, confidence, emoji;
    
    if (totalScore === 0) {
        sentiment = 'neutral';
        confidence = 0.3;
        emoji = '😐';
    } else if (positiveScore > negativeScore) {
        sentiment = 'positive';
        
        // 🔧 개선된 신뢰도 계산
        const scoreStrength = Math.min(positiveScore, 5) / 5; // 0~1 
        const dominanceRatio = (positiveScore - negativeScore) / (positiveScore + negativeScore);
        confidence = Math.min(0.85, 0.3 + scoreStrength * 0.4 + dominanceRatio * 0.15); // 30~85%
        
        if (positiveScore >= 3) emoji = '🚀';
        else if (positiveScore >= 2) emoji = '📈'; 
        else emoji = '😊';
    } else if (negativeScore > positiveScore) {
        sentiment = 'negative';
        
        // 🔧 개선된 신뢰도 계산
        const scoreStrength = Math.min(negativeScore, 5) / 5; // 0~1
        const dominanceRatio = (negativeScore - positiveScore) / (positiveScore + negativeScore);
        confidence = Math.min(0.85, 0.3 + scoreStrength * 0.4 + dominanceRatio * 0.15); // 30~85%
        
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
    
    // 로그 출력
    console.log(`   감정: ${sentiment} (${emoji})`);
    console.log(`   신뢰도: ${result.confidence}%`);
    console.log(`   점수: 긍정 ${positiveScore}, 부정 ${negativeScore}, 중립 ${neutralScore}`);
    if (foundPositive.length > 0) console.log(`   🟢 긍정 키워드: ${foundPositive.join(', ')}`);
    if (foundNegative.length > 0) console.log(`   🔴 부정 키워드: ${foundNegative.join(', ')}`);
    if (foundNeutral.length > 0) console.log(`   ⚪ 중립 키워드: ${foundNeutral.join(', ')}`);
    
    return result;
}

// 최신 뉴스들에 대해 개선된 감정분석 수행
newsHistory.forEach((news, index) => {
    console.log(`\n[${index + 1}/${newsHistory.length}] ${news.asset}: ${news.title}`);
    console.log(`   링크: ${news.link}`);
    console.log(`   언론사: ${news.press}`);
    console.log(`   시간: ${news.time}`);
    console.log(`   발송: ${news.sentAt}\n`);
    
    // 개선된 감정분석 수행
    const sentimentResult = analyzeNewsSentiment(news.title, news.description || '');
    
    console.log('='.repeat(80));
});

console.log('\n✅ 모든 저장된 뉴스의 감정분석 완료!');