// 🧪 수정된 app.js의 감정분석 함수 테스트

// app.js의 감정분석 함수를 직접 테스트
const fs = require('fs');

// app.js에서 감정분석 함수만 추출해서 테스트
console.log('🔄 수정된 app.js의 감정분석 테스트\n');

// improved-sentiment.js를 직접 import
const { analyzeNewsSentiment } = require('./improved-sentiment.js');

// 테스트 케이스
const testCases = [
    "페이코인, CU편의점 등 가상자산 실생활 결제 확대",
    "다날, 스테이블코인 생태계 구축…엑셀라 파트너사 선정",
    "비트코인, 단기 보유자 실현 가격 붕괴...8만 6,000달러까지 추락하나",
    "CNBC \"비트코인, 9월에 다시 단기 힘 받을 수도\""
];

console.log('📊 app.js와 동일한 방식으로 감정분석 테스트:\n');

testCases.forEach((title, i) => {
    console.log(`${i+1}. "${title}"`);
    
    try {
        const result = analyzeNewsSentiment(title, '');
        console.log(`   결과: ${result.sentiment} ${result.emoji} (${result.confidence}%)`);
        console.log(`   점수: 긍정=${result.scores?.positive || 0}, 부정=${result.scores?.negative || 0}`);
    } catch (error) {
        console.error(`   ❌ 오류: ${error.message}`);
    }
    console.log('');
});

console.log('✅ app.js 감정분석 함수 테스트 완료!');
console.log('\n🚀 이제 PM2를 재시작하면 개선된 감정분석이 적용됩니다:');
console.log('pm2 restart danal-news');