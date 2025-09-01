// 🔄 기존 감정분석 함수 백업 (2025-09-01)
// app.js에서 1200-1688 라인 함수 백업

// 기존 뉴스 감정 분석 함수 (복잡한 500+ 키워드 시스템)
function analyzeNewsSentiment_OLD(title, description = '') {
    console.log(`🤖 뉴스 감정 분석 시작: "${title.substring(0, 50)}..."`);
    
    const text = (title + ' ' + description).toLowerCase();
    
    // 문장 단위 분리 (마침표, 느낌표, 물음표, 쉼표 등으로 구분)
    const sentences = text.split(/[.!?;,\n]/).filter(s => s.trim().length > 0);
    
    // 🔥 강화된 금융 전문용어 키워드 사전 - 호재 (긍정)
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
        
        // 강력 호재 (가중치 4-5)
        '흑자전환': 5, '실적개선': 4, '투자유치': 4, '펀딩': 4,
        '신사업': 3, '업계최초': 4, '1위': 3,
        
        // 시장 긍정 (가중치 2-3)
        '관심집중': 2, '주목받': 2, '기대감': 2, '전망밝': 3, '낙관': 2,
        '회복': 3, '반등': 3, '바닥': 2, '저점': 2, '매수': 2, '투자매력': 2, '기회': 2,
        
        // 기업 긍정 (가중치 2-3)
        '특허': 3, '기술개발': 3, '혁신': 3, '선도': 2,
        '글로벌': 2, '해외진출': 2, '수출': 2, '파트너십': 2,
        
        // 🏢 다날 특화 키워드 (가중치 3-5)
        '다날': 2, '페이코인': 3, '페이플러스': 3, '간편결제': 4,
        '핀테크': 3, '결제솔루션': 4, '디지털페이먼트': 4, '페이테크': 3,
        '코인원': 3, '거래소': 2, '암호화폐결제': 4, '블록체인결제': 4,
        
        // 🪙 암호화폐 특화 (가중치 3-5)
        '상장': 4, '리스팅': 4, '거래량증가': 4, '신규상장': 5,
        '코인': 2, '토큰': 2, '알트코인': 2, '메인넷': 4,
        '업비트': 3, '빗썸': 3, '바이낸스': 4, 'dex': 3,
        '스테이킹': 3, '디파이': 3, 'nft': 3, '메타버스': 3,
        
        // 💳 핀테크 특화 (가중치 2-4)
        '디지털뱅킹': 3, '모바일페이': 3, '전자지갑': 3, '페이앱': 3,
        '온라인결제': 2, '모바일결제': 3, 'qr결제': 3, '비접촉결제': 3,
        '금융혁신': 4, '핀테크허브': 3, '스마트뱅킹': 3, '오픈뱅킹': 3
    };
    
    // 부정 키워드들...
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
        
        // 강력 악재 (가중치 4-5)
        '실적악화': 5, '적자': 4, '손실': 3, '위기': 4, '충격': 4, '패닉': 5, '투매': 4,
        
        // 시장 부정 (가중치 2-3)
        '매도': 2, '공포': 3, '불신': 2, '의구심': 2,
        '경계': 2, '주의': 2, '위험': 3, '버블': 3, '거품': 3,
        
        // 기업 부정 (가중치 3-4)
        '소송': 3, '분쟁': 3, '제재': 4, '처벌': 4, '감사': 2, '수사': 4,
        '횡령': 5, '비리': 4, '스캔들': 4, '논란': 2, '규제': 3,
        
        // 🏢 다날/핀테크 특화 악재 (가중치 3-5)
        '결제오류': 4, '시스템장애': 4, '보안사고': 5, '해킹': 5,
        '개인정보유출': 5, '금융사고': 5, '서비스중단': 4, '장애발생': 4,
        '페이앱오류': 3, '결제실패': 3, '인증오류': 3, '금융당국': 4,
        
        // 🪙 암호화폐 특화 악재 (가중치 3-5)
        '상장폐지': 5, '델리스팅': 5, '거래정지': 5, '출금중단': 5,
        '코인해킹': 5, '거래소해킹': 5, '지갑해킹': 5, '스캠': 5,
        '폰지': 5, '러그풀': 5, '코인사기': 5, '가상화폐규제': 4,
        '채굴금지': 4, '거래금지': 4, '암호화폐금지': 4,
        
        // 🚨 사기/범죄 관련 악재 (가중치 4-5) 
        '보이스피싱': 5, '전화사기': 5, '투자사기': 5, '피싱': 4,
        '사기': 4, '피해': 3, '범죄': 4, '불법': 4, '악용': 3, '도용': 4,
        
        // 💳 핀테크 규제 악재 (가중치 3-4)
        '핀테크규제': 4, '금융규제': 4, '결제규제': 3, '라이선스취소': 5,
        '영업정지': 5, '업무개선명령': 4, '과징금': 3, '제재조치': 4
    };

    // 간단한 점수 계산 (기존 복잡한 로직 생략)
    let positiveScore = 0;
    let negativeScore = 0;
    
    Object.entries(positiveKeywords).forEach(([keyword, weight]) => {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        positiveScore += matches * weight;
    });
    
    Object.entries(negativeKeywords).forEach(([keyword, weight]) => {
        const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
        negativeScore += matches * weight;
    });

    // 감정 분류 및 신뢰도 계산
    const totalScore = positiveScore + negativeScore;
    let sentiment, confidence, emoji;
    
    if (totalScore === 0) {
        sentiment = 'neutral';
        confidence = 30;
        emoji = '😐';
    } else if (positiveScore > negativeScore) {
        sentiment = 'positive';
        const ratio = positiveScore / (positiveScore + negativeScore);
        confidence = Math.min(85, 30 + ratio * 55);
        emoji = positiveScore >= 3 ? '🚀' : '📈';
    } else {
        sentiment = 'negative';
        const ratio = negativeScore / (positiveScore + negativeScore);
        confidence = Math.min(85, 30 + ratio * 55);
        emoji = negativeScore >= 3 ? '💀' : '📉';
    }
    
    const result = {
        sentiment: sentiment,
        confidence: Math.round(confidence),
        emoji: emoji,
        scores: {
            positive: positiveScore,
            negative: negativeScore,
            neutral: 0
        }
    };
    
    console.log(`   감정: ${sentiment} (${emoji})`);
    console.log(`   신뢰도: ${result.confidence}%`);
    console.log(`   점수: 긍정 ${positiveScore}, 부정 ${negativeScore}`);
    
    return result;
}

module.exports = { analyzeNewsSentiment_OLD };