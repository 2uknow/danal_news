const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const https = require('https');
const cron = require('node-cron');

// 🪙 페이코인 기술분석 시스템 추가
const { integratePaycoinMonitoring } = require('./paycoin-flex-integration');

// 🏢 다날 주식 기술분석 시스템 추가
const { integrateDanalMonitoring, getDanalPriceForApp, checkDanalHealthForApp, startDanalTechnicalMonitoring } = require('./danal-integration');

// 로깅 시스템 추가
const { logger, logHelper } = require('./logger');

// --- 1. 설정 (Configuration) ---
let NAVER_WORKS_HOOK_URL = 'https://naverworks.danal.co.kr/message/direct/service/channels/danal_test'; // 기본값

// config.json에서 webhook URL 로드 시도
try {
    const config = require('./config.json');
    if (config.webhookUrl) {
        NAVER_WORKS_HOOK_URL = config.webhookUrl;
        console.log('✅ config.json에서 webhook URL 로드됨');
    }
} catch (error) {
    console.log('⚠️ config.json 로드 실패, 기본 URL 사용');
}

const NEWS_QUERY = '다날';

// 🚀 완전 자동화! 여기에 자산 추가하면 자동으로 모든 기능 작동!
const ASSETS_TO_WATCH = [
    { 
        name: '페이코인',   
        query: '페이코인 시세',   
        type: 'crypto', 
        spikeThreshold: 0.9,      // 급등락 임계값
        trendThreshold: 1.8,      // 추세 이탈 임계값
        enabled: true,            // 가격 모니터링 활성화/비활성화
        newsEnabled: false         // 🔥 뉴스 검색 활성화/비활성화
    },
    { 
        name: '다날',       
        query: '다날 주가',       
        type: 'stock',  
        spikeThreshold: 0.5,      
        trendThreshold: 1.0,      
        enabled: true,
        newsEnabled: true         // 🔥 뉴스 검색 활성화/비활성화
    },
    { 
        name: '카카오페이', 
        query: '카카오페이 주가', 
        type: 'stock',  
        spikeThreshold: 3.0,      
        trendThreshold: 2.5,      
        enabled: false,
        newsEnabled: false        // 🔥 뉴스 검색 비활성화
    },
    { 
        name: '카이아',     
        query: '카이아 시세',     
        type: 'crypto', 
        spikeThreshold: 3.0,      
        trendThreshold: 2.0,      
        enabled: false,
        newsEnabled: false        // 🔥 뉴스 검색 비활성화
    },{ 
        name: '비트코인',   
        query: '비트코인 시세',   
        type: 'crypto', 
        spikeThreshold: 3.0,      
        trendThreshold: 2.0,      
        enabled: true,
        newsEnabled: true         // 🔥 뉴스 검색 활성화/비활성화
    },
     { 
        name: '이더리움',   
        query: '이더리움 시세',   
        type: 'crypto', 
        spikeThreshold: 3.0,      
        trendThreshold: 2.0,      
        enabled: true,
        newsEnabled: false        // 🔥 뉴스 검색 비활성화 (가격만 모니터링)
    }, { 
        name: '리플',   
        query: '리플 시세',   
        type: 'crypto', 
        spikeThreshold: 3.0,      
        trendThreshold: 2.0,      
        enabled: true,
        newsEnabled: false         // 🔥 뉴스 검색 활성화/비활성화
    }
];

const MA_PERIOD = 60;  // 다시 60분으로 복원 (원래대로) 
const PERIODIC_REPORT_INTERVAL = 60;
const STATE_FILE = 'monitoring_state_final.json';
const MAX_NEWS_HISTORY = 1000;
const MAX_NEWS_AGE_HOURS = 24; // 6시간에서 24시간으로 확대

// 🕐 NXT/KRX 자동 전환 설정
const TRADING_SCHEDULE = {
    autoMode: false,           // true: 시간대별 자동 전환, false: 수동 모드
    forceMode: 'krx',        // 'auto', 'krx', 'nxt' - 수동 모드 시 강제 사용할 거래소
    regularHours: {           // 정규장 시간 (KRX)
        start: 900,           // 09:00
        end: 1530            // 15:30
    },
    nxtHours: {              // NXT 시간
        start: 800,           // 08:00  
        end: 2000            // 20:00
    }
};

// 중복 실행 방지를 위한 플래그
let isRunning = false;

// --- 2. 자동 확장 헬퍼 함수 (Auto-Expansion Helper Functions) ---
// HTTP Agent 최적화 (메모리 누수 방지)
const insecureAgent = new https.Agent({ 
    rejectUnauthorized: false, 
    keepAlive: false,
    maxSockets: 5,
    maxFreeSockets: 2,
    timeout: 30000,
    freeSocketTimeout: 15000
});

// 🎯 언론사 추출 함수 - 다양한 선택자로 범용적 추출
function extractPressFromElement($el) {
    const pressSelectors = [
        // 특화 선택자 (네이버 뉴스 최신 구조)
        '.sds-comps-text:not(.sds-comps-text-type-headline1)',  // SDS 텍스트 (제목 제외)
        'div > span:first-child',          // 첫 번째 스팬 (언론사명 패턴)
        '[class*="info"]:not([href])',    // info 클래스 (링크 아닌 것)
        
        // 기존 선택자들 (호환성)
        '.news_info .press',               // 뉴스 정보의 언론사
        '.info_group .press',              // 정보 그룹의 언론사
        '.info_group .info:first-child',   // 정보 그룹의 첫 번째 (보통 언론사)
        '.press',                          // 언론사
        '.source',                         // 뉴스 소스
        '.press_name',                     // 언론사명
        '.cp_name',                        // 공급사 이름
        '.news_item .info:first-child',    // 뉴스 아이템의 첫 번째 정보
        'a[class*="info"]:first-child',    // 정보 링크의 첫 번째
        'span[class*="press"]',            // 언론사 스팬
        '.outlet',                         // 언론사 아웃렛
        '.source_name'                     // 소스 이름
    ];
    
    // 🎯 언론사명 후보 검증 함수
    function isValidPressName(text) {
        if (!text || text.length < 2 || text.length > 30) return false;
        
        // 시간 정보 제외
        if (text.includes('전') || text.includes('시간') || text.includes('분') || text.includes('일')) return false;
        if (text.match(/\d+[시분일]/)) return false;
        if (text.match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/)) return false;
        
        // 일반적인 언론사 단어 킨워드
        if (text === '뉴스' || text === '기사' || text === '네이버뉴스') return false;
        
        // 너무 많이 과분한 내용 제외 (제목이나 내용으로 보이는 경우)
        if (text.includes('비트코인') || text.includes('하락') || text.includes('달러')) return false;
        
        // 언론사 특징 업거나 짧고 의미있는 이름 (예: '뉴스', '타임스', '인덕의', '전자신문' 등 포함)
        const pressKeywords = ['뉴스', '일보', '경제', '타임스', '투데이', '신문', '미디어', '저널', '매일', '주간'];
        const hasPressSuffix = pressKeywords.some(keyword => text.includes(keyword));
        
        // 짧지만 의미있는 언론사명이거나, 언론사 키워드가 포함된 경우
        return (text.length <= 10 && text.match(/[\uac00-\ud7a3]/)) || hasPressSuffix;
    }
    
    for (const selector of pressSelectors) {
        try {
            const extracted = $el.find(selector).text().trim();
            if (isValidPressName(extracted)) {
                return extracted;
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

// 🎯 URL에서 언론사 추출 함수 - 동적으로 도메인에서 추출
function extractPressFromUrl(url) {
    if (!url) return null;
    
    // 주요 언론사 도메인 매핑
    const pressMapping = {
        'yna.co.kr': '연합뉴스',
        'newsis.com': '뉴시스', 
        'mk.co.kr': '매일경제',
        'edaily.co.kr': '이데일리',
        'news1.kr': '뉴스1',
        'dailian.co.kr': '데일리안',
        'topstarnews.net': '톱스타뉴스',
        'newspim.com': '뉴스핌',
        'finomy.com': '파이낸셜뉴스',
        'hankyung.com': '한국경제',
        'etnews.com': '전자신문',
        'mt.co.kr': '머니투데이',
        'inews24.com': '아이뉴스24',
        'biz.chosun.com': '조선비즈',
        'sedaily.com': '서울경제',
        'fnnews.com': 'FN뉴스',
        'ajunews.com': '아주경제',
        'businesspost.co.kr': '비즈니스포스트',
        'asiatoday.co.kr': '아시아투데이',
        'dt.co.kr': '디지털타임스'
    };
    
    // 도메인 매핑에서 찾기
    for (const [domain, press] of Object.entries(pressMapping)) {
        if (url.includes(domain)) {
            return press;
        }
    }
    
    // 도메인에서 직접 추출 시도
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        const parts = domain.split('.');
        
        if (parts.length >= 2) {
            // 도메인의 주요 부분을 언론사명으로 사용 (간단한 매핑)
            const mainDomain = parts[parts.length - 2];
            const domainToPress = {
                'chosun': '조선일보',
                'donga': '동아일보', 
                'joongang': '중앙일보',
                'hani': '한겨레',
                'khan': '경향신문',
                'segye': '세계일보',
                'kmib': '국민일보'
            };
            
            return domainToPress[mainDomain] || null;
        }
    } catch (e) {
        return null;
    }
    
    return null;
}

// 🎯 설명 텍스트 클리닝 함수 - 중복된 언론사명과 시간 정보 제거
function cleanDescriptionText(text, pressName, timeText) {
    if (!text) return text;
    
    let cleaned = text;
    
    // 언론사명 제거 (정확한 일치와 부분 일치 모두)
    if (pressName && pressName !== '언론사 미상') {
        // 언론사명이 반복되는 패턴 제거
        const pressPattern = new RegExp(pressName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        cleaned = cleaned.replace(pressPattern, '').trim();
    }
    
    // 시간 정보 제거 (정확한 일치)
    if (timeText && timeText !== '시간 미상') {
        const timePattern = new RegExp(timeText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        cleaned = cleaned.replace(timePattern, '').trim();
    }
    
    // 일반적인 시간 패턴들 제거
    const timePatterns = [
        /\d+시간\s*전/g,
        /\d+분\s*전/g,
        /\d+일\s*전/g,
        /\d+주\s*전/g,
        /\d+개월\s*전/g,
        /\d{4}-\d{2}-\d{2}/g,
        /\d{1,2}월\s*\d{1,2}일/g
    ];
    
    timePatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '').trim();
    });
    
    // 🎯 네이버 뉴스 특수 패턴들 제거
    const naverPatterns = [
        /네이버뉴스/g,                    // "네이버뉴스" 제거
        /네이버\s*뉴스/g,                 // "네이버 뉴스" 제거
        /Keep에\s*저장/g,                // "Keep에 저장" 제거
        /Keep에\s*바로가기/g,            // "Keep에 바로가기" 제거
        /바로가기/g,                     // "바로가기" 제거
        /저장/g,                         // "저장" 제거 (단독)
        /언론사\s*선정/g,                // "언론사 선정" 제거
        /주요기사/g,                     // "주요기사" 제거
        /심층기획/g,                     // "심층기획" 제거
        /[A-Z]\d+면\s*\d+단/g,           // "A18면 1단" 등 신문 면 정보 제거
        /\d+면\s*\d+단/g,               // "18면 1단" 등 신문 면 정보 제거
        /[A-Z]\d+면\s*TOP/g,              // "A28면 TOP" 등 신문 면 정보 제거
        /\d+면\s*TOP/g,                  // "15면 TOP" 등 신문 면 정보 제거
        /면\s*TOP/g,                     // "면 TOP" 등 신문 면 정보 제거
    ];
    
    naverPatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '').trim();
    });
    
    // 연속된 공백 정리
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // 시작이나 끝의 불필요한 구두점 제거
    cleaned = cleaned.replace(/^[.,;:\s]+|[.,;:\s]+$/g, '').trim();
    
    // 너무 짧은 텍스트는 빈 문자열 반환 (의미 없는 텍스트)
    if (cleaned.length < 10) {
        return '';
    }
    
    return cleaned;
}

// 🎯 시간 추출 함수 - 다양한 형태의 시간 정보 추출 (네이버 뉴스 최적화)
function extractTimeFromElement($el) {
    const timeSelectors = [
        // 네이버 뉴스 검색 결과 페이지 전용 선택자들
        '.sds-comps-text-type-body2',        // 본문 텍스트 (시간 포함)
        '.info_group .info:last-child',      // 정보 그룹의 마지막 (보통 시간)  
        '.info_group .info:nth-child(2)',    // 정보 그룹의 두 번째 (언론사 다음이 시간)
        '.news_info .info:last-child',       // 뉴스 정보의 마지막 항목
        '.info_group .txt_inline',           // 정보 그룹의 텍스트
        '.date_time',                        // 날짜 시간
        '.time',                             // 시간
        '.news_date',                        // 뉴스 날짜
        'span[class*="time"]',               // 시간 관련 스팬
        'span[class*="date"]',               // 날짜 관련 스팬
        '.news_item .info:last-child',       // 뉴스 아이템의 마지막 정보
        '.publish_date',                     // 발행 날짜
        '.article_date',                     // 기사 날짜
        // 추가 네이버 선택자들
        '.press_date',                       // 언론사 날짜
        '.txt_inline',                       // 인라인 텍스트
        '.sub_txt',                          // 서브 텍스트
        '.desc_txt'                          // 설명 텍스트
    ];
    
    // 1. 특정 선택자에서 시간 추출
    for (const selector of timeSelectors) {
        try {
            const extracted = $el.find(selector).text().trim();
            if (extracted && isValidTimeText(extracted)) {
                // 시간 정보만 추출 (설명 텍스트에서 시간 패턴 찾기)
                const timeFromText = extractTimeFromText(extracted);
                if (timeFromText) {
                    return timeFromText;
                }
            }
        } catch (e) {
            continue;
        }
    }
    
    // 2. 제한된 범위에서 시간 패턴 찾기 (전체 텍스트 대신 처음 300자만)
    try {
        const allText = $el.text();
        const limitedText = allText.substring(0, 300); // 처음 300자만 검색하여 다른 뉴스 시간과 혼동 방지
        console.log(`   🔍 제한된 텍스트에서 시간 검색: "${limitedText.substring(0, 100)}..."`);
        return extractTimeFromText(limitedText);
    } catch (e) {
        // 무시
    }
    
    return null;
}

// 🎯 텍스트에서 시간 정보 추출하는 헬퍼 함수
function extractTimeFromText(text) {
    if (!text) return null;
    
    const timePatterns = [
        // 🔥 수정: 더 구체적이고 최신 시간부터 우선 검사 (분 -> 시간 -> 일 -> 주 -> 개월 순서)
        /(\d+)분\s*전/g,                        // "30분 전" (가장 최근)
        /(\d+)시간\s*전/g,                      // "5시간 전"
        /(\d+)일\s*전/g,                        // "1일 전"
        /(\d+)주\s*전/g,                        // "1주 전", "2주 전" 
        /(\d+)개월\s*전/g,                      // "2개월 전" (가장 오래전)
        
        // 뉴스 기사 특화 패턴들
        /(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2})시\s*(\d{1,2})분/g, // "8월 19일 오전 10시 57분"
        /(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2})[:：]\s*(\d{2})/g,   // "8월 19일 오전 10:57"
        /(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/g,                      // "2025년 8월 19일"
        
        // 기본 시간 형태
        /(오전|오후)\s*\d{1,2}[:：]\d{2}/g,      // "오전 10:30"
        /\d{1,2}[:：]\d{2}/g,                   // "14:30"
        /\d{1,2}월\s*\d{1,2}일/g,               // "1월 15일"
        /(오늘|어제|그제)\s*\d{1,2}[:：]\d{2}/g, // "오늘 14:30"
        /\d{4}[-./]\d{1,2}[-./]\d{1,2}/g       // "2024-01-01"
    ];
    
    // 🔥 개선된 방법: 모든 패턴을 찾아서 가장 최근 시간을 선택
    let bestMatch = null;
    let bestScore = Infinity; // 낮을수록 더 최근
    
    for (const pattern of timePatterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
            const timeText = matches[0].trim();
            const score = getTimeScore(timeText); // 시간을 분 단위로 변환해서 점수 계산
            
            if (score < bestScore) {
                bestMatch = timeText;
                bestScore = score;
            }
        }
    }
    
    return bestMatch;
}

// 🎯 시간 텍스트를 점수로 변환하는 함수 (낮을수록 더 최근)
function getTimeScore(timeText) {
    if (!timeText) return Infinity;
    
    // 분 전
    let match = timeText.match(/(\d+)분\s*전/);
    if (match) {
        return parseInt(match[1]); // 분 그대로 반환 (5분 전 = 5점)
    }
    
    // 시간 전
    match = timeText.match(/(\d+)시간\s*전/);
    if (match) {
        return parseInt(match[1]) * 60; // 시간을 분으로 변환 (5시간 전 = 300점)
    }
    
    // 일 전
    match = timeText.match(/(\d+)일\s*전/);
    if (match) {
        return parseInt(match[1]) * 24 * 60; // 일을 분으로 변환 (3일 전 = 4320점)
    }
    
    // 주 전
    match = timeText.match(/(\d+)주\s*전/);
    if (match) {
        return parseInt(match[1]) * 7 * 24 * 60; // 주를 분으로 변환
    }
    
    // 개월 전
    match = timeText.match(/(\d+)개월\s*전/);
    if (match) {
        return parseInt(match[1]) * 30 * 24 * 60; // 개월을 분으로 변환 (대략 30일로 계산)
    }
    
    // 기타 패턴들은 보통 최근 시간이므로 중간 점수 부여
    return 1440; // 1일 정도의 점수 (24시간 * 60분)
}

// 🎯 유효한 시간 텍스트인지 판단하는 함수
function isValidTimeText(text) {
    if (!text || text.length > 30) return false;
    
    // 시간 관련 키워드 포함 여부
    const timeKeywords = ['전', '시간', '분', '일', '오늘', '어제', '월', '일'];
    const hasTimeKeyword = timeKeywords.some(keyword => text.includes(keyword));
    
    // 날짜/시간 패턴 매치 여부
    const timePatterns = [
        /\d+[개월주일분시]\s*전/,             // "2개월 전", "1주 전", "5분 전", "2시간 전"
        /\d{4}[-./]\d{1,2}[-./]\d{1,2}/,      // "2024-01-01"
        /\d{1,2}[:．]\d{2}/,                  // "14:30"
        /\d{1,2}월\s*\d{1,2}일/               // "1월 15일"
    ];
    const hasTimePattern = timePatterns.some(pattern => pattern.test(text));
    
    return hasTimeKeyword || hasTimePattern;
}

// 🎯 뉴스 검색용 활성화된 자산만 필터링하는 함수
function getNewsEnabledAssets() {
    const newsEnabledAssets = ASSETS_TO_WATCH.filter(asset => asset.newsEnabled);
    console.log(`📰 뉴스 검색 활성화된 자산: ${newsEnabledAssets.length}/${ASSETS_TO_WATCH.length}개`);
    newsEnabledAssets.forEach(asset => {
        console.log(`   📰 ${asset.name} (${asset.type}) - 뉴스 검색 활성화`);
    });
    
    const newsDisabledAssets = ASSETS_TO_WATCH.filter(asset => !asset.newsEnabled);
    if (newsDisabledAssets.length > 0) {
        console.log(`📰 뉴스 검색 비활성화된 자산: ${newsDisabledAssets.length}개`);
        newsDisabledAssets.forEach(asset => {
            console.log(`   ❌ ${asset.name} (${asset.type}) - 뉴스 검색 안함`);
        });
    }
    
    return newsEnabledAssets;
}


// 주말/공휴일 체크 함수 (한국 시간 기준)
function isKoreanBusinessDay() {
    const now = new Date();
    const kstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const dayOfWeek = kstNow.getDay(); // 0=일요일, 6=토요일
    
    // 주말 체크 (토요일, 일요일)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log(`-> 📅 주말입니다 (${dayOfWeek === 0 ? '일요일' : '토요일'}) - 주식 알림 제외`);
        return false;
    }
    
    // 한국 공휴일 체크 (주요 공휴일만 포함)
    const month = kstNow.getMonth() + 1;
    const date = kstNow.getDate();
    
    // 신정
    if (month === 1 && date === 1) return false;
    
    // 설날 연휴 (음력이라 정확하지 않음 - 필요시 라이브러리 사용)
    // 추석 연휴 (음력이라 정확하지 않음 - 필요시 라이브러리 사용)
    
    // 어린이날
    if (month === 5 && date === 5) return false;
    
    // 현충일
    if (month === 6 && date === 6) return false;
    
    // 광복절
    if (month === 8 && date === 15) return false;
    
    // 개천절
    if (month === 10 && date === 3) return false;
    
    // 한글날
    if (month === 10 && date === 9) return false;
    
    // 크리스마스
    if (month === 12 && date === 25) return false;
    
    console.log(`-> 📅 평일입니다 - 주식 알림 허용`);
    return true;
}


// 🎯 자동 상태 초기화 - 새로운 자산이 추가되면 자동으로 상태 생성
function initializeAssetStates(currentState) {
    let newAssetsAdded = 0;
    
    // 🔥 뉴스 검색 상태 초기화
    if (!currentState.newsSearchState) {
        currentState.newsSearchState = {
            currentAssetIndex: 0,
            lastSearchTime: 0
        };
        console.log(`🆕 뉴스 검색 상태 초기화`);
    }
    
    ASSETS_TO_WATCH.forEach(asset => {
        if (!currentState.assetStates[asset.name]) {
            currentState.assetStates[asset.name] = {
                priceHistory: [],
                lastAlertPrice: 0,
                lastReportPrice: 0,
                wasInDeviation: false,
                lastTrendAlertTime: 0,      // 🔥 추가: 마지막 추세이탈 알림 시간
                lastTrendAlertPrice: 0,     // 🔥 추가: 마지막 추세이탈 알림 가격
                trendAlertDirection: null,  // 🔥 추가: 마지막 추세이탈 방향 ('up' 또는 'down')
                openingPrice: 0,
                openingPriceDate: '',
                // 🚀 자동 추가 정보
                addedDate: new Date().toISOString(),
                totalAlerts: 0,
                lastUpdate: null
            };
            newAssetsAdded++;
            console.log(`🆕 새 자산 상태 초기화: ${asset.name} (${asset.type})`);
        } else {
            // 기존 자산에 새 필드 추가 (호환성)
            if (!currentState.assetStates[asset.name].hasOwnProperty('lastTrendAlertTime')) {
                currentState.assetStates[asset.name].lastTrendAlertTime = 0;
                currentState.assetStates[asset.name].lastTrendAlertPrice = 0;
                currentState.assetStates[asset.name].trendAlertDirection = null;
                console.log(`🔄 ${asset.name}에 추세이탈 추적 필드 추가`);
            }
        }
    });
    
    if (newAssetsAdded > 0) {
        console.log(`✅ ${newAssetsAdded}개의 새 자산 상태가 초기화되었습니다.`);
    }
    
    return currentState;
}

// 활성화된 자산만 필터링하는 함수 (가격 모니터링용)
function getEnabledAssets() {
    const enabledAssets = ASSETS_TO_WATCH.filter(asset => asset.enabled);
    console.log(`📊 가격 모니터링 활성화된 자산: ${enabledAssets.length}/${ASSETS_TO_WATCH.length}개`);
    enabledAssets.forEach(asset => {
        console.log(`   ✅ ${asset.name} (${asset.type}) - 급등락:±${asset.spikeThreshold}%, 추세이탈:±${asset.trendThreshold}%`);
    });
    
    const disabledAssets = ASSETS_TO_WATCH.filter(asset => !asset.enabled);
    if (disabledAssets.length > 0) {
        console.log(`📊 가격 모니터링 비활성화된 자산: ${disabledAssets.length}개`);
        disabledAssets.forEach(asset => {
            console.log(`   ❌ ${asset.name} (${asset.type}) - 가격 모니터링 안함`);
        });
    }
    
    return enabledAssets;
}

// 🎯 스마트 가격 선택자 - 자산 타입과 거래 시간에 따라 자동으로 적절한 선택자 사용
function getPriceSelectors(assetType, assetName) {
    const selectors = {
        // 암호화폐용 선택자들
        crypto: [
            '.coin_rate .price_value',
            '.spt_con strong', 
            '.price_now strong',
            '.coin_price',
            '.price em',
            '.coinone_price',
            '.coin_info .price'
        ],
        // 주식용 선택자들 (거래 시간대별)
        stock: {
            // 정규장 시간 (9:00-15:30) - KRX 정규장 가격 우선
            regular: [
                '.spt_con:has(.store_name:contains("KRX")) strong',    // KRX 가격
                '.stock_info:has(.store_name:contains("KRX")) + * strong', // KRX 영역의 strong
                '.spt_con strong',              // 첫 번째 spt_con (보통 KRX)
                '.price em',
                '.stock_price .price',
                '.price_now strong'
            ],
            // NXT 시간 (8:00-20:00, 정규장 외) - NXT 가격 우선  
            nxt: [
                '.spt_con:has(.store_name:contains("NXT")) strong',    // NXT 가격
                '.stock_info:has(.store_name:contains("NXT")) + * strong', // NXT 영역의 strong
                '.spt_con:nth-child(2) strong', // 두 번째 spt_con (보통 NXT)
                '.spt_con strong',              // 폴백: 첫 번째 spt_con
                '.price em'
            ]
        }
    };
    
    if (assetType === 'crypto') {
        return selectors.crypto;
    } else if (assetType === 'stock') {
        // 🕐 NXT/KRX 전환 모드 확인
        let tradingSession = 'regular'; // 기본값
        
        if (!TRADING_SCHEDULE.autoMode) {
            // 🔧 수동 모드: 강제 설정 사용
            if (TRADING_SCHEDULE.forceMode === 'nxt') {
                tradingSession = 'nxt';
                console.log(`-> 🔧 ${assetName} 수동 모드 - NXT 강제 사용`);
            } else if (TRADING_SCHEDULE.forceMode === 'krx') {
                tradingSession = 'regular';
                console.log(`-> 🔧 ${assetName} 수동 모드 - KRX 강제 사용`);
            } else {
                // forceMode가 'auto'인 경우 기본값 사용
                tradingSession = 'regular';
                console.log(`-> 🔧 ${assetName} 수동 모드 - 기본값(KRX) 사용`);
            }
        } else {
            // 🕐 자동 모드: 시간대별 전환
            const now = new Date();
            const kstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
            const hour = kstNow.getHours();
            const minute = kstNow.getMinutes();
            const currentTime = hour * 100 + minute; // HHMM 형식
            
            if (currentTime >= TRADING_SCHEDULE.regularHours.start && currentTime <= TRADING_SCHEDULE.regularHours.end) {
                // 정규장 시간
                tradingSession = 'regular';
                console.log(`-> 📈 ${assetName} 정규장 시간 (${hour}:${minute.toString().padStart(2, '0')}) - 정규장 가격 우선`);
            } else if (currentTime >= TRADING_SCHEDULE.nxtHours.start && currentTime <= TRADING_SCHEDULE.nxtHours.end) {
                // NXT 시간 (정규장 외)
                tradingSession = 'nxt';
                console.log(`-> 🌙 ${assetName} NXT 시간 (${hour}:${minute.toString().padStart(2, '0')}) - NXT 가격 우선`);
            } else {
                // 거래 시간 외
                tradingSession = 'regular'; // 기본값으로 정규장 가격
                console.log(`-> 😴 ${assetName} 거래 시간 외 (${hour}:${minute.toString().padStart(2, '0')}) - 정규장 가격 사용`);
            }
        }
        
        return selectors.stock[tradingSession];
    }
    
    // 기본 선택자
    return ['.spt_con strong', '.price em', '.price_value'];
}

// 🎯 자동 가격 파싱 - 여러 선택자를 자동으로 시도 (주식 시간대별 지원)
function parsePrice($, asset) {
    const selectors = getPriceSelectors(asset.type, asset.name);
    
    console.log(`🔍 ${asset.name} 가격 파싱 시도 중...`);
    
    // 🔥 주식의 경우 KRX/NXT 구분 파싱
    if (asset.type === 'stock') {
        return parseStockPrice($, asset, selectors);
    }
    
    // 기존 방식 (암호화폐 등)
    for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        const priceText = $(selector).first().text().trim();
        
        if (priceText) {
            console.log(`   시도 ${i + 1}: ${selector} → "${priceText}"`);
            
            // 숫자 추출 및 검증
            const cleanedText = priceText.replace(/[^\d.,]/g, '').replace(/,/g, '');
            const price = parseFloat(cleanedText);
            
            if (!isNaN(price) && price > 0) {
                console.log(`   ✅ 성공! 선택자: ${selector}, 가격: ${price.toLocaleString()}원`);
                return price;
            } else {
                console.log(`   ❌ 숫자 변환 실패: "${cleanedText}"`);
            }
        } else {
            console.log(`   시도 ${i + 1}: ${selector} → 텍스트 없음`);
        }
    }
    
    console.log(`   ❌ 모든 선택자 실패 (${selectors.length}개 시도)`);
    return null;
}

// 🔥 주식 전용 가격 파싱 함수 (KRX/NXT 구분) - 수정된 부분
// 🔥 수정된 주식 전용 가격 파싱 함수 (NXT Pre Market 지원)
function parseStockPrice($, asset, selectors) {
    // 현재 시간 확인 (한국 시간)
    const now = new Date();
    const kstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const hour = kstNow.getHours();
    const minute = kstNow.getMinutes();
    const currentTime = hour * 100 + minute;
    
    const isRegularHours = currentTime >= 900 && currentTime <= 1530;
    const isNxtHours = currentTime >= 800 && currentTime <= 2000;
    
    console.log(`   📊 현재 시간: ${hour}:${minute.toString().padStart(2, '0')} (정규장: ${isRegularHours}, NXT: ${isNxtHours})`);
    
    // 🎯 방법 1: KRX/NXT 구분해서 가격 추출
    let krxPrice = null;
    let nxtPrice = null;
    
    // KRX 및 NXT 가격 찾기
    $('.spt_con').each((index, element) => {
        const $element = $(element);
        const storeName = $element.find('.store_name').text().trim();
        const priceText = $element.find('strong').text().trim();
        
        console.log(`   🔍 발견된 거래소: "${storeName}", 가격: "${priceText}"`);
        
        if (storeName === 'KRX' && priceText) {
            const cleanedText = priceText.replace(/[^\d.,]/g, '').replace(/,/g, '');
            const price = parseFloat(cleanedText);
            if (!isNaN(price) && price > 0) {
                krxPrice = price;
                console.log(`   ✅ KRX 가격 발견: ${krxPrice.toLocaleString()}원`);
            }
        }
        
        // 🔥 수정: NXT Pre Market도 인식하도록 변경
        if ((storeName === 'NXT' || storeName === 'NXT Pre Market' || storeName.includes('NXT')) && priceText) {
            const cleanedText = priceText.replace(/[^\d.,]/g, '').replace(/,/g, '');
            const price = parseFloat(cleanedText);
            if (!isNaN(price) && price > 0) {
                nxtPrice = price;
                console.log(`   ✅ NXT 가격 발견: ${nxtPrice.toLocaleString()}원 (거래소명: "${storeName}")`);
            }
        }
    });
    
    // 🎯 시간대에 따른 가격 선택
    if (isRegularHours && krxPrice) {
        console.log(`   🏛️ 정규장 시간 - KRX 가격 사용: ${krxPrice.toLocaleString()}원`);
        return krxPrice;
    } else if (isNxtHours && nxtPrice) {
        console.log(`   🌙 NXT 시간 - NXT 가격 사용: ${nxtPrice.toLocaleString()}원`);
        return nxtPrice;
    } else if (krxPrice) {
        console.log(`   🏛️ 기본값 - KRX 가격 사용: ${krxPrice.toLocaleString()}원`);
        return krxPrice;
    } else if (nxtPrice) {
        console.log(`   🌙 대체값 - NXT 가격 사용: ${nxtPrice.toLocaleString()}원`);
        return nxtPrice;
    }
    
    // 🎯 방법 2: 기존 선택자들로 폴백
    console.log(`   ⚠️ KRX/NXT 구분 실패, 기존 방식으로 시도...`);
    
    for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        const priceText = $(selector).first().text().trim();
        
        if (priceText) {
            console.log(`   시도 ${i + 1}: ${selector} → "${priceText}"`);
            
            const cleanedText = priceText.replace(/[^\d.,]/g, '').replace(/,/g, '');
            const price = parseFloat(cleanedText);
            
            if (!isNaN(price) && price > 0) {
                console.log(`   ✅ 폴백 성공! 선택자: ${selector}, 가격: ${price.toLocaleString()}원`);
                return price;
            }
        }
    }
    
    console.log(`   ❌ 모든 방법 실패`);
    return null;
}

// 자산 설정 변경 함수들
function enableAsset(assetName) {
    const asset = ASSETS_TO_WATCH.find(a => a.name === assetName);
    if (asset) {
        asset.enabled = true;
        console.log(`✅ ${assetName} 가격 모니터링 활성화됨 - 다음 모니터링부터 적용`);
        return true;
    } else {
        console.log(`❌ ${assetName}을 찾을 수 없습니다.`);
        console.log(`📋 사용 가능한 자산: ${ASSETS_TO_WATCH.map(a => a.name).join(', ')}`);
        return false;
    }
}

function disableAsset(assetName) {
    const asset = ASSETS_TO_WATCH.find(a => a.name === assetName);
    if (asset) {
        asset.enabled = false;
        console.log(`❌ ${assetName} 가격 모니터링 비활성화됨 - 다음 모니터링부터 적용`);
        return true;
    } else {
        console.log(`❌ ${assetName}을 찾을 수 없습니다.`);
        console.log(`📋 사용 가능한 자산: ${ASSETS_TO_WATCH.map(a => a.name).join(', ')}`);
        return false;
    }
}

function toggleAsset(assetName) {
    const asset = ASSETS_TO_WATCH.find(a => a.name === assetName);
    if (asset) {
        asset.enabled = !asset.enabled;
        console.log(`🔄 ${assetName} 가격 모니터링 ${asset.enabled ? '활성화' : '비활성화'}됨 - 다음 모니터링부터 적용`);
        return asset.enabled;
    } else {
        console.log(`❌ ${assetName}을 찾을 수 없습니다.`);
        console.log(`📋 사용 가능한 자산: ${ASSETS_TO_WATCH.map(a => a.name).join(', ')}`);
        return false;
    }
}

// 🔥 뉴스 검색 설정 변경 함수들
function enableNews(assetName) {
    const asset = ASSETS_TO_WATCH.find(a => a.name === assetName);
    if (asset) {
        asset.newsEnabled = true;
        console.log(`📰 ${assetName} 뉴스 검색 활성화됨 - 다음 뉴스 검색부터 적용`);
        return true;
    } else {
        console.log(`❌ ${assetName}을 찾을 수 없습니다.`);
        console.log(`📋 사용 가능한 자산: ${ASSETS_TO_WATCH.map(a => a.name).join(', ')}`);
        return false;
    }
}

function disableNews(assetName) {
    const asset = ASSETS_TO_WATCH.find(a => a.name === assetName);
    if (asset) {
        asset.newsEnabled = false;
        console.log(`📰 ${assetName} 뉴스 검색 비활성화됨 - 다음 뉴스 검색부터 적용`);
        return true;
    } else {
        console.log(`❌ ${assetName}을 찾을 수 없습니다.`);
        console.log(`📋 사용 가능한 자산: ${ASSETS_TO_WATCH.map(a => a.name).join(', ')}`);
        return false;
    }
}

function toggleNews(assetName) {
    const asset = ASSETS_TO_WATCH.find(a => a.name === assetName);
    if (asset) {
        asset.newsEnabled = !asset.newsEnabled;
        console.log(`📰 ${assetName} 뉴스 검색 ${asset.newsEnabled ? '활성화' : '비활성화'}됨 - 다음 뉴스 검색부터 적용`);
        return asset.newsEnabled;
    } else {
        console.log(`❌ ${assetName}을 찾을 수 없습니다.`);
        console.log(`📋 사용 가능한 자산: ${ASSETS_TO_WATCH.map(a => a.name).join(', ')}`);
        return false;
    }
}

// 전체 자산 상태 보기
function showAssetStatus() {
    console.log('\n📊 전체 자산 모니터링 상태:');
    console.log('='.repeat(80));
    ASSETS_TO_WATCH.forEach((asset, index) => {
        const priceStatus = asset.enabled ? '🟢 활성화' : '🔴 비활성화';
        const newsStatus = asset.newsEnabled ? '📰 활성화' : '📰 비활성화';
        const typeIcon = asset.type === 'crypto' ? '₿' : '📈';
        console.log(`${index + 1}. ${typeIcon} ${asset.name} (${asset.type})`);
        console.log(`   가격 모니터링: ${priceStatus}`);
        console.log(`   뉴스 검색: ${newsStatus}`);
        console.log(`   검색어: "${asset.query}"`);
        console.log(`   급등락: ±${asset.spikeThreshold}%, 추세이탈: ±${asset.trendThreshold}%`);
        console.log('');
    });
    console.log('='.repeat(80));
    
    const priceEnabled = ASSETS_TO_WATCH.filter(a => a.enabled).length;
    const newsEnabled = ASSETS_TO_WATCH.filter(a => a.newsEnabled).length;
    const total = ASSETS_TO_WATCH.length;
    console.log(`📊 요약:`);
    console.log(`   가격 모니터링: ${priceEnabled}개 / 전체 ${total}개`);
    console.log(`   뉴스 검색: ${newsEnabled}개 / 전체 ${total}개`);
}

// 메모리 효율적인 상태 관리
function readState() {
    try {
        if (fs.existsSync(STATE_FILE)) { 
            const data = fs.readFileSync(STATE_FILE, 'utf-8');
            
            // 파일 크기 체크 (10MB 제한)
            if (data.length > 10 * 1024 * 1024) {
                console.warn('⚠️ 상태 파일이 너무 큽니다. 백업 후 재생성...');
                
                // 백업 생성
                const backupFile = `${STATE_FILE}.backup.${Date.now()}`;
                fs.writeFileSync(backupFile, data);
                
                // 새 상태로 재생성
                const newState = { 
                    newsLink: null, 
                    newsHistory: [],
                    assetStates: {}, 
                    lastPeriodicReportTime: 0 
                };
                return initializeAssetStates(newState);
            }
            
            const state = JSON.parse(data);
            
            if (!state.newsHistory) {
                state.newsHistory = [];
            }
            
            // 메모리 사용량 최적화: 오래된 뉴스 히스토리 정리
            if (state.newsHistory && state.newsHistory.length > MAX_NEWS_HISTORY) {
                console.log(`🗑️ 오래된 뉴스 히스토리 정리: ${state.newsHistory.length} -> ${MAX_NEWS_HISTORY}`);
                state.newsHistory = state.newsHistory.slice(-MAX_NEWS_HISTORY);
            }
            
            // 🚀 새 자산 자동 초기화
            return initializeAssetStates(state);
        }
    } catch (error) { 
        console.error('상태 파일 읽기 오류:', error.message); 
        
        // 손상된 파일 백업 후 재생성
        if (fs.existsSync(STATE_FILE)) {
            const backupFile = `${STATE_FILE}.corrupted.${Date.now()}`;
            try {
                fs.copyFileSync(STATE_FILE, backupFile);
                console.log(`📋 손상된 상태 파일을 ${backupFile}로 백업했습니다.`);
            } catch (backupError) {
                console.error('백업 실패:', backupError.message);
            }
        }
    }
    
    const newState = { 
        newsLink: null, 
        newsHistory: [],
        assetStates: {}, 
        lastPeriodicReportTime: 0 
    };
    
    // 🚀 새 상태 파일 생성 시에도 자동 초기화
    return initializeAssetStates(newState);
}

function writeState(newState) { 
    try { 
        fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), 'utf-8'); 
    } catch (error) { 
        console.error('상태 파일 쓰기 오류:', error.message); 
    } 
}

async function sendNotification(message) { 
    console.log('📤 네이버웍스로 메시지 전송 시도...'); 
    try { 
        await fetch(NAVER_WORKS_HOOK_URL, { 
            method: 'POST', 
            body: message, 
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, 
            agent: insecureAgent 
        }); 
        console.log('✅ 메시지 전송 성공!'); 
    } catch (error) { 
        console.error('❌ 네이버웍스 메시지 전송 실패:', error.message); 
    } 
}

// 🎯 새로운 Flex Message 전송 함수
async function sendFlexNotification(flexMessage) { 
    console.log('📤 네이버웍스로 Flex Message 전송 시도...'); 
    try { 
        // Flex Message를 JSON 문자열로 변환
        const messageBody = JSON.stringify(flexMessage, null, 2);
        
        await fetch(NAVER_WORKS_HOOK_URL, { 
            method: 'POST', 
            body: messageBody, 
            headers: { 
                'Content-Type': 'application/json'  // JSON 형태로 전송
            }, 
            agent: insecureAgent 
        }); 
        console.log('✅ Flex Message 전송 성공!'); 
        
        // 디버깅용 로그
        console.log('📋 전송된 Flex Message:');
        console.log(messageBody.substring(0, 500) + '...');
        
    } catch (error) { 
        console.error('❌ 네이버웍스 Flex Message 전송 실패:', error.message); 
        
        // 🔄 폴백: 일반 텍스트로 전송
        console.log('🔄 일반 텍스트로 폴백 전송 시도...');
        const altText = flexMessage.content.altText;
        const bodyContents = flexMessage.content.contents.body.contents;
        
        let fallbackMessage = altText + '\n\n';
        bodyContents.forEach(content => {
            if (content.type === 'text' && !content.text.startsWith('⏰')) {
                fallbackMessage += content.text + '\n';
            } else if (content.type === 'text' && content.text.startsWith('⏰')) {
                fallbackMessage += '\n' + content.text;
            }
        });
        
        await sendNotification(fallbackMessage);
        console.log('✅ 폴백 텍스트 메시지 전송 완료');
    } 
}

// 🎯 급등락 알림을 Flex Message로 전송하는 함수
async function sendPriceAlertFlexMessage(asset, currentPrice, alertReason, alertEmoji, analysisInfo) {
    console.log('📤 급등락 알림 Flex Message 전송 시도...');
    
    // 🎨 상승/하락에 따른 색상 결정
    let backgroundColor = "#0E71EB"; // 기본 파란색
    let alertType = "시세 변동";
    
    // alertReason에서 상승/하락 판단
    if (alertReason.includes('+') || 
        alertReason.includes('상승') || 
        alertReason.includes('급등') || 
        alertReason.includes('폭등') || 
        alertReason.includes('대폭등')) {
        backgroundColor = "#FF4444"; // 빨간색 (상승)
        alertType = "급등 알림";
    } else if (alertReason.includes('-') || 
               alertReason.includes('하락') || 
               alertReason.includes('급락') || 
               alertReason.includes('폭락') || 
               alertReason.includes('대폭락')) {
        backgroundColor = "#4444FF"; // 파란색 (하락)
        alertType = "급락 알림";
    }
    
    const typeIcon = asset.type === 'crypto' ? '₿' : '📈';
    
    // 한국 시간 가져오기
    const now = new Date();
    const kstTime = now.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true
    });
    
    // 🎯 급등락 Flex Message 구조
    const flexMessage = {
        "content": {
            "type": "flex",
            "altText": `${alertEmoji} [${alertType}] ${typeIcon} ${asset.name} - ${alertReason}`,
            "contents": {
                "type": "bubble",
                "size": "mega",
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": `${alertEmoji} ${alertType}`,
                            "weight": "bold",
                            "size": "lg",
                            "color": "#FFFFFF"
                        },
                        {
                            "type": "text",
                            "text": `${typeIcon} ${asset.name}`,
                            "size": "md",
                            "color": "#E0E0E0"
                        }
                    ],
                    "backgroundColor": backgroundColor,
                    "paddingAll": "15px"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": `💰 현재가: ${currentPrice.toLocaleString()}원`,
                            "wrap": true,
                            "size": "md",
                            "weight": "bold",
                            "color": "#222222"
                        },
                        {
                            "type": "text",
                            "text": `📊 사유: ${alertReason}`,
                            "wrap": true,
                            "size": "sm",
                            "color": "#333333"
                        },
                        {
                            "type": "text",
                            "text": `⚙️ 설정값: 급등락 ±${asset.spikeThreshold}%, 추세이탈 ±${asset.trendThreshold}%`,
                            "wrap": true,
                            "size": "xs",
                            "color": "#666666"
                        },
                        {
                            "type": "text",
                            "text": `🔍 ${analysisInfo}`,
                            "wrap": true,
                            "size": "xs",
                            "color": "#666666"
                        },
                        {
                            "type": "separator",
                            "margin": "md"
                        },
                        {
                            "type": "text",
                            "text": `⏰ ${kstTime}`,
                            "size": "xs",
                            "color": "#888888",
                            "align": "end"
                        }
                    ]
                }
            }
        }
    };
    
    await sendFlexNotification(flexMessage);
}

// 🤖 뉴스 감정 분석 함수
function analyzeNewsSentiment(title, description = '') {
    console.log(`🤖 뉴스 감정 분석 시작: "${title.substring(0, 50)}..."`);
    
    const text = (title + ' ' + description).toLowerCase();
    
    // 문장 단위 분리 (마침표, 느낌표, 물음표, 쉼표 등으로 구분)
    const sentences = text.split(/[.!?;,\n]/).filter(s => s.trim().length > 0);
    
    // 호재 키워드 (긍정) - 가중치 시스템
    const positiveKeywords = {
        // 초강력 상승 (가중치 5)
        '폭등': 5, '급등': 4, '치솟': 4, '상한가': 5, '신고가': 4,
        
        // 강력 상승 (가중치 3)
        '급상승': 3, '돌파': 3, '최고가': 3, '뛰어올라': 3, '강세': 3,
        
        // 일반 상승 (가중치 2)
        '상승': 2, '오름': 2, '증가': 2, '고점': 2,
        
        // 강력 호재 (가중치 4-5)
        '흑자전환': 5, '실적개선': 4, '투자유치': 4, '펀딩': 4,
        '신사업': 3, '업계최초': 4, '1위': 3,
        
        // 일반 호재 (가중치 2-3)
        '호재': 3, '좋은소식': 2, '긍정적': 2, '성공': 3, '성과': 2,
        '매출증가': 3, '이익증가': 3, '수주': 3, '계약': 2, '협약': 2,
        '출시': 2, '론칭': 2, '확장': 2, '성장': 2, '개발완료': 2,
        
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
    
    // 악재 키워드 (부정) - 가중치 시스템
    const negativeKeywords = {
        // 초강력 하락 (가중치 5)
        '폭락': 5, '급락': 4, '붕괴': 5, '하한가': 5, '신저가': 4,
        
        // 강력 하락 (가중치 3)
        '급하락': 3, '추락': 3, '최저가': 3, '약세': 3, '하락세': 3,
        
        // 일반 하락 (가중치 2)
        '하락': 2, '떨어져': 2, '감소': 2, '저점': 2,
        
        // 강력 악재 (가중치 4-5)
        '실적악화': 5, '적자': 4, '손실': 3, '중단': 4, '취소': 4,
        '위기': 4, '충격': 4, '패닉': 5, '투매': 4,
        
        // 일반 악재 (가중치 2-3)
        '악재': 3, '나쁜소식': 2, '부정적': 2, '실패': 3,
        '매출감소': 3, '이익감소': 3, '연기': 2, '지연': 2,
        '문제': 2, '리스크': 2, '우려': 2, '불안': 2,
        
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
        
        // 💳 핀테크 규제 악재 (가중치 3-4)
        '핀테크규제': 4, '금융규제': 4, '결제규제': 3, '라이선스취소': 5,
        '영업정지': 5, '업무개선명령': 4, '과징금': 3, '제재조치': 4
    };
    
    // 중립 키워드 (팩트 위주) - 가중치 시스템
    const neutralKeywords = {
        '발표': 1, '공시': 1, '보고': 1, '예정': 1, '계획': 1, '전망': 1,
        '분석': 1, '예측': 1, '의견': 1, '평가': 1, '검토': 1, '논의': 1
    };
    
    // 시간/규모 수식어 패턴 정의 (임팩트 크기 조절)
    const timeScalePatterns = {
        // 시간 관련 수식어
        '단기': 0.7, '초단기': 0.5, '일시적': 0.6, '순간적': 0.5,
        '중기': 1.0, '단중기': 0.8, 
        '장기': 1.3, '장기적': 1.3, '지속적': 1.4, '지속가능': 1.5,
        '항구적': 1.6, '영구적': 1.8, '구조적': 1.7,
        
        // 규모 관련 수식어  
        '소규모': 0.6, '소폭': 0.5, '미소': 0.3, '제한적': 0.6, '부분적': 0.7,
        '중규모': 1.0, '적당한': 1.0, '보통': 1.0,
        '대규모': 1.8, '대폭': 2.0, '전면적': 2.2, '광범위': 2.0,
        '초대형': 2.5, '메가': 2.3, '기가': 2.5, '전체': 2.0, '전 세계': 2.8,
        
        // 빈도 관련 수식어
        '처음': 1.5, '최초': 1.6, '첫': 1.3, '신규': 1.2,
        '재차': 1.1, '다시': 1.0, '반복': 0.9, '또다시': 0.8,
        '연속': 1.4, '지속': 1.3, '계속': 1.2, '꾸준히': 1.3,
        
        // 강도 관련 수식어 (기존 intensityPatterns와 보완)
        '완전': 2.0, '절대': 2.2, '100%': 2.5, '전적으로': 2.1,
        '반': 0.5, '절반': 0.5, '부분': 0.7, '일부': 0.6
    };
    
    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;
    
    let foundPositive = [];
    let foundNegative = [];
    let foundNeutral = [];
    
    // 부정어 패턴 정의
    const negationPatterns = [
        '안', '않', '없', '못', '아니', '부족', '미흡', '불가', '금지', '중지'
    ];
    
    // 강도 표현 패턴 정의 (배수 적용)
    const intensityPatterns = {
        '매우': 2.0, '아주': 2.0, '상당히': 1.8, '크게': 1.8, '대폭': 2.2,
        '급격히': 2.0, '급속히': 1.8, '대규모': 2.0, '대량': 1.8,
        '엄청': 2.5, '극도로': 2.5, '심각하게': 2.2, '현저히': 1.8,
        '압도적으로': 2.3, '폭발적으로': 2.5, '기록적으로': 2.2,
        '사상최대': 3.0, '역대최고': 2.8, '역대최저': 2.8,
        '소폭': 0.5, '미미하게': 0.3, '약간': 0.6, '다소': 0.7, '조금': 0.5
    };
    
    // 부정어 및 강도 표현 처리 함수
    function processAdvancedSentiment(text, keywords, isPositive) {
        let score = 0;
        let found = [];
        
        Object.entries(keywords).forEach(([keyword, weight]) => {
            // 일반 매칭
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
                    const context = before + after;
                    
                    // 부정어가 있는지 확인
                    const hasNegation = negationPatterns.some(neg => context.includes(neg));
                    
                    // 강도 표현 확인 및 배수 계산
                    let intensityMultiplier = 1.0;
                    let timeScaleMultiplier = 1.0;
                    
                    // 강도 표현 패턴 확인
                    Object.entries(intensityPatterns).forEach(([pattern, multiplier]) => {
                        if (context.includes(pattern)) {
                            intensityMultiplier = Math.max(intensityMultiplier, multiplier);
                        }
                    });
                    
                    // 시간/규모 패턴 확인
                    Object.entries(timeScalePatterns).forEach(([pattern, multiplier]) => {
                        if (context.includes(pattern)) {
                            timeScaleMultiplier = Math.max(timeScaleMultiplier, multiplier);
                        }
                    });
                    
                    // 두 배수를 조합 (최대값 제한)
                    const combinedMultiplier = Math.min(intensityMultiplier * timeScaleMultiplier, 5.0);
                    totalIntensityMultiplier *= combinedMultiplier;
                    
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
                    found.push(`${keyword}_부정(${negativeMatches}×${weight}${multiplierText}=${finalScore})`);
                }
            }
        });
        
        return { score, found };
    }
    
    // 문장별 맥락 분석 함수
    function analyzeContextualSentiment() {
        let totalPositiveScore = 0;
        let totalNegativeScore = 0;
        let totalNeutralScore = 0;
        let allFoundPositive = [];
        let allFoundNegative = [];
        let allFoundNeutral = [];
        
        // 문장별로 감정 분석
        sentences.forEach((sentence, index) => {
            if (sentence.trim().length < 3) return; // 너무 짧은 문장 제외
            
            console.log(`   문장 ${index + 1}: "${sentence.trim()}"`);
            
            // 각 문장에 대해 고급 감정 분석 수행
            const sentencePositive = processAdvancedSentiment(sentence, positiveKeywords, true);
            const sentenceNegative = processAdvancedSentiment(sentence, negativeKeywords, false);
            const sentenceNeutral = processAdvancedSentiment(sentence, neutralKeywords, true);
            
            // 문장별 감정 우세도 계산 (한 문장에서 혼재된 감정 처리)
            const sentenceTotal = Math.abs(sentencePositive.score) + Math.abs(sentenceNegative.score);
            let sentenceWeight = 1.0;
            
            // 문장 길이에 따른 가중치 (긴 문장일수록 중요도 증가)
            if (sentence.length > 30) sentenceWeight *= 1.2;
            else if (sentence.length < 10) sentenceWeight *= 0.8;
            
            // 제목에 가까운 문장일수록 중요도 증가
            if (index === 0) sentenceWeight *= 1.5; // 첫 번째 문장 (제목 부분)
            
            // 조건부 문장 감지 ("만약", "가정하면" 등 - 가중치 감소)
            if (sentence.includes('만약') || sentence.includes('가정') || sentence.includes('예상') || 
                sentence.includes('전망') || sentence.includes('예측')) {
                sentenceWeight *= 0.7;
                console.log(`     → 조건부/예측 문장으로 가중치 감소: ${sentenceWeight.toFixed(1)}`);
            }
            
            // 감정이 혼재된 경우 처리
            if (sentenceTotal > 0) {
                const positiveRatio = Math.abs(sentencePositive.score) / sentenceTotal;
                const negativeRatio = Math.abs(sentenceNegative.score) / sentenceTotal;
                
                // 우세한 감정에 더 많은 가중치 부여
                const adjustedPositive = Math.round(sentencePositive.score * sentenceWeight * positiveRatio);
                const adjustedNegative = Math.round(sentenceNegative.score * sentenceWeight * negativeRatio);
                const adjustedNeutral = Math.round(sentenceNeutral.score * sentenceWeight);
                
                totalPositiveScore += adjustedPositive;
                totalNegativeScore += adjustedNegative;
                totalNeutralScore += adjustedNeutral;
                
                console.log(`     → 감정점수: 긍정=${adjustedPositive}, 부정=${adjustedNegative}, 중립=${adjustedNeutral}`);
                
                // 발견된 키워드에 문장 번호 추가
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
    
    // 맥락 분석 결과 적용
    positiveScore = contextualResult.positiveScore;
    negativeScore = contextualResult.negativeScore;
    neutralScore = contextualResult.neutralScore;
    
    // 발견된 키워드 목록 (문장 번호 포함)
    foundPositive = contextualResult.foundPositive;
    foundNegative = contextualResult.foundNegative;
    foundNeutral = contextualResult.foundNeutral;
    
    // 감정 분류 및 신뢰도 계산
    const totalScore = positiveScore + negativeScore + neutralScore;
    let sentiment, confidence, emoji;
    
    if (totalScore === 0) {
        sentiment = 'neutral';
        confidence = 0.3; // 키워드가 없으면 낮은 신뢰도
        emoji = '😐';
    } else if (positiveScore > negativeScore) {
        const ratio = positiveScore / (positiveScore + negativeScore);
        sentiment = 'positive';
        confidence = Math.min(0.9, 0.5 + ratio * 0.4); // 0.5~0.9
        
        if (positiveScore >= 3) emoji = '🚀'; // 강한 호재
        else if (positiveScore >= 2) emoji = '📈'; // 호재  
        else emoji = '😊'; // 약간 긍정
    } else if (negativeScore > positiveScore) {
        const ratio = negativeScore / (positiveScore + negativeScore);
        sentiment = 'negative';
        confidence = Math.min(0.9, 0.5 + ratio * 0.4); // 0.5~0.9
        
        if (negativeScore >= 3) emoji = '💀'; // 강한 악재
        else if (negativeScore >= 2) emoji = '📉'; // 악재
        else emoji = '😰'; // 약간 부정
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

// 기존 중복된 sendNewsFlexMessage 함수들을 모두 제거하고 이것으로 교체

// 🎯 뉴스 알림을 Flex Message로 전송하는 함수 (footer 링크 추가)
async function sendNewsFlexMessage(newsItem) {
    console.log(`\n📤 [${newsItem.searchedAsset}] Flex Message 뉴스 알림 발송 시작...`);
    
    // 🤖 뉴스 감정 분석 수행
    const sentimentAnalysis = analyzeNewsSentiment(newsItem.title, newsItem.description || '');
    
    // 감정에 따른 헤더 색상 결정
    let headerColor = '#1E3A8A'; // 기본 파란색 (뉴스)
    let headerText = '📰 뉴스 알림';
    
    if (sentimentAnalysis.confidence >= 60) { // 신뢰도 60% 이상일 때만 색상 변경
        switch (sentimentAnalysis.sentiment) {
            case 'positive':
                headerColor = '#059669'; // 초록색 (호재)
                headerText = `📰 뉴스 알림 ${sentimentAnalysis.emoji}`;
                break;
            case 'negative':
                headerColor = '#DC2626'; // 빨간색 (악재)
                headerText = `📰 뉴스 알림 ${sentimentAnalysis.emoji}`;
                break;
            default:
                headerText = `📰 뉴스 알림 ${sentimentAnalysis.emoji}`;
                break;
        }
    }
    
    const flexMessage = {
        "content": {
            "type": "flex",
            "altText": `📰 [${newsItem.searchedAsset}] ${newsItem.title}`,
            "contents": {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                paddingTop: 'md',
                paddingBottom: 'sm',
                backgroundColor: headerColor,
                contents: [
                    {
                        type: 'text',
                        text: headerText,
                        color: '#FFFFFF',
                        weight: 'bold',
                        size: 'md'
                    },
                    {
                        type: 'text',
                        text: `🎯 ${newsItem.searchedAsset}`,
                        color: '#93C5FD',
                        size: 'sm',
                        margin: 'xs'
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: 'md',
                contents: [
                    {
                        type: 'text',
                        text: newsItem.title,
                        weight: 'bold',
                        size: 'md',
                        wrap: true,
                        color: '#1F2937'
                    },
                    {
                        type: 'separator',
                        margin: 'md'
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'md',
                        contents: [
                            {
                                type: 'box',
                                layout: 'baseline',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '📰',
                                        size: 'sm',
                                        flex: 0
                                    },
                                    {
                                        type: 'text',
                                        text: newsItem.press,
                                        size: 'sm',
                                        color: '#6B7280',
                                        margin: 'sm',
                                        flex: 1
                                    }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                margin: 'sm',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '⏰',
                                        size: 'sm',
                                        flex: 0
                                    },
                                    {
                                        type: 'text',
                                        text: newsItem.time,
                                        size: 'sm',
                                        color: '#6B7280',
                                        margin: 'sm',
                                        flex: 1
                                    }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                margin: 'sm',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '🤖',
                                        size: 'sm',
                                        flex: 0
                                    },
                                    {
                                        type: 'text',
                                        text: `감정분석: ${sentimentAnalysis.emoji} ${sentimentAnalysis.sentiment} (${sentimentAnalysis.confidence}%)`,
                                        size: 'sm',
                                        color: sentimentAnalysis.sentiment === 'positive' ? '#059669' : 
                                               sentimentAnalysis.sentiment === 'negative' ? '#DC2626' : '#6B7280',
                                        margin: 'sm',
                                        flex: 1
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: 'text',
                        text: newsItem.description.length > 200 ? 
                              newsItem.description.substring(0, 200) + '...' : 
                              newsItem.description,
                        size: 'sm',
                        color: '#4B5563',
                        margin: 'md',
                        wrap: true
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#8B5CF6',
                        height: 'sm',
                        action: {
                            type: 'uri',
                            label: '📰 뉴스 전문 보기',
                            uri: newsItem.link
                        }
                    }
                ]
            }
        }
        }
    };
    
    try {
        await sendFlexNotification(flexMessage);
        console.log(`✅ [${newsItem.searchedAsset}] Flex 뉴스 알림 발송 완료!`);
    } catch (error) {
        console.error(`❌ [${newsItem.searchedAsset}] Flex 뉴스 알림 발송 실패:`, error.message);
        // 실패 시 일반 텍스트로 대체 발송
        const fallbackMessage = `📰 [${newsItem.searchedAsset}] ${newsItem.title}\n\n` +
                               `📰 ${newsItem.press} | ⏰ ${newsItem.time}\n\n` +
                               `${newsItem.description.substring(0, 100)}...\n\n` +
                               `🔗 ${newsItem.link}`;
        await sendNotification(fallbackMessage);
        console.log(`✅ [${newsItem.searchedAsset}] 대체 텍스트 뉴스 알림 발송 완료!`);
    }
}

// 메모리 효율적인 fetch 함수 (재시도 로직 추가)
async function fetchWithCurl(url, options = { isJson: true }) { 
    const headers = options.headers || {}; 
    let headerString = ''; 
    for (const key in headers) { 
        headerString += `-H "${key}: ${headers[key]}" `; 
    } 
    
    // 메모리 제한 및 타임아웃 설정 강화
    const command = `curl -s -k --max-time 15 --max-filesize 10485760 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" ${headerString} "${url}"`;
    
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try { 
            const { stdout } = await exec(command, { 
                timeout: 15000,
                maxBuffer: 10 * 1024 * 1024, // 10MB 제한
                killSignal: 'SIGTERM',
                windowsHide: true  // Windows에서 cmd 창 숨기기
            }); 
            
            // 응답 크기 체크
            if (stdout.length > 10 * 1024 * 1024) { // 10MB 초과
                console.warn(`⚠️ 응답 크기가 너무 큼: ${Math.round(stdout.length / 1024 / 1024)}MB`);
                return null;
            }
            
            return options.isJson ? JSON.parse(stdout) : stdout; 
        } catch (error) { 
            lastError = error;
            
            if (error instanceof SyntaxError) { 
                console.error(`❌ 응답이 JSON 형식이 아닙니다. (URL: ${url})`); 
                break; // JSON 파싱 오류는 재시도하지 않음
            } else if (attempt < maxRetries) {
                console.warn(`⚠️ 요청 실패 (${attempt}/${maxRetries}), 재시도 중... (URL: ${url})`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 지수 백오프
            } else {
                console.error(`❌ curl 실행 오류 (URL: ${url}):`, error.message); 
            }
        } 
    }
    
    return null; 
}

// 실제 뉴스 날짜 검증 (시간 표현 기반) - 개선된 버전
function isNewsRecentByTime(timeText, maxAgeHours = 6) { // 6시간으로 축소
    try {
        console.log(`⏰ 시간 텍스트 분석: "${timeText}" (기준: ${maxAgeHours}시간)`);
        
        // 명확하게 오래된 표현들 체크
        const oldKeywords = ['일 전', '일전', '주 전', '주전', '개월 전', '달 전', '년 전', '년전'];
        const isOld = oldKeywords.some(keyword => timeText.includes(keyword));
        
        if (isOld) {
            console.log(`❌ 오래된 뉴스 키워드 발견: ${timeText}`);
            return false;
        }
        
        // 시간 표현이 있는 경우 파싱해서 체크
        if (timeText.includes('시간 전') || timeText.includes('시간전')) {
            const hours = parseInt(timeText.match(/(\d+)시간/)?.[1] || '0');
            console.log(`⏰ ${hours}시간 전 뉴스 (기준: ${maxAgeHours}시간)`);
            if (hours > maxAgeHours) {
                console.log(`❌ 너무 오래된 뉴스: ${hours}시간 전 > ${maxAgeHours}시간`);
                return false;
            } else {
                console.log(`✅ 허용 범위 내 뉴스: ${hours}시간 전 ≤ ${maxAgeHours}시간`);
                return true;
            }
        }
        
        // 분 단위, 오늘, 어제, 최근은 최신으로 간주
        const recentKeywords = ['분 전', '분전', '오늘', 'today', '어제', 'yesterday', '최근'];
        const isRecent = recentKeywords.some(keyword => timeText.includes(keyword));
        
        if (isRecent) {
            console.log(`✅ 최신 뉴스 확인: ${timeText}`);
            return true;
        }
        
        // 🔥 "시간 미상"인 경우는 거부하도록 변경
        if (timeText.includes('시간 미상') || timeText.includes('미상')) {
            console.log(`❌ 시간 미상으로 제외: ${timeText}`);
            return false;
        }
        
        // 확실하지 않은 경우도 허용 (더 관대하게)
        console.log(`❓ 불확실한 시간 표현, 허용: ${timeText}`);
        return true; // 더 관대하게 변경
        
    } catch (error) {
        console.error(`❌ 시간 파싱 오류: ${error.message}`);
        return true; // 오류 시 허용하도록 변경
    }
}
// 뉴스 중복 체크
function isNewsAlreadySent(newsItem, newsHistory) {
    const isDuplicateByLink = newsHistory.some(historyItem => historyItem.link === newsItem.link);
    const isDuplicateByTitle = newsHistory.some(historyItem => 
        historyItem.title && newsItem.title && 
        historyItem.title.trim().toLowerCase() === newsItem.title.trim().toLowerCase()
    );
    
    return isDuplicateByLink || isDuplicateByTitle;
}

function addNewsToHistory(newsItem, currentState) {
    const newsHistoryItem = {
        title: newsItem.title,
        link: newsItem.link,
        timestamp: new Date().getTime(),
        pubDate: newsItem.pubDate,
        source: newsItem.source || newsItem.press || 'Unknown'
    };
    
    currentState.newsHistory.unshift(newsHistoryItem);
    
    if (currentState.newsHistory.length > MAX_NEWS_HISTORY) {
        currentState.newsHistory = currentState.newsHistory.slice(0, MAX_NEWS_HISTORY);
    }
    
    currentState.newsLink = newsItem.link;
    
    console.log(`📝 뉴스 히스토리에 추가: ${newsItem.title.substring(0, 50)}...`);
    console.log(`📊 현재 히스토리 개수: ${currentState.newsHistory.length}/${MAX_NEWS_HISTORY}`);
}

// --- 3. 핵심 기능 함수 (Core Feature Functions) ---

// 🔥 자산별 개별 뉴스 검색 - 1분에 하나씩 순환 검색 (개선된 버전)
async function checkNewsWithRotatingAssets(currentState) {
    console.log(`\n📰 [뉴스] 자산별 순환 뉴스 검색 시작...`);
    
    // 🔥 뉴스 검색 활성화된 자산 목록 가져오기
    const newsEnabledAssets = getNewsEnabledAssets();
    
    if (newsEnabledAssets.length === 0) {
        console.log('⚠️ 뉴스 검색 활성화된 자산이 없습니다. 뉴스 검색을 건너뜁니다.');
        return;
    }
    
    // 뉴스 검색 상태 확인
    const newsState = currentState.newsSearchState;
    const currentTime = Date.now();
    
    // 🎯 다음 검색할 자산 결정 (순환 방식)
    if (!newsState || newsState.currentAssetIndex >= newsEnabledAssets.length) {
        newsState.currentAssetIndex = 0;
    }
    
    const targetAsset = newsEnabledAssets[newsState.currentAssetIndex];
    const searchQuery = targetAsset.name;
    
    console.log(`🎯 현재 뉴스 검색 대상: ${targetAsset.name} (${newsState.currentAssetIndex + 1}/${newsEnabledAssets.length})`);
    console.log(`🔍 검색 쿼리: "${searchQuery}"`);
    console.log(`📋 현재 뉴스 히스토리: ${currentState.newsHistory.length}개`);
    console.log(`⏰ 뉴스 필터링: 최근 ${MAX_NEWS_AGE_HOURS}시간 이내만 허용`);
    
    // 🔄 다음 검색을 위해 인덱스 증가
    newsState.currentAssetIndex = (newsState.currentAssetIndex + 1) % newsEnabledAssets.length;
    newsState.lastSearchTime = currentTime;
    
    // 다음 검색 예정 자산 표시
    const nextAssetIndex = newsState.currentAssetIndex;
    const nextAsset = newsEnabledAssets[nextAssetIndex];
    console.log(`➡️ 다음 뉴스 검색 예정: ${nextAsset.name} (1분 후)`);
    
    // 🎯 새로운 네이버 뉴스 검색 URL (ssc=tab.news.all 방식)
    const searchUrl = `https://search.naver.com/search.naver?ssc=tab.news.all&where=news&sm=tab_jum&query=${encodeURIComponent(searchQuery)}`;
    
    console.log(`🌐 검색 URL: ${searchUrl}`);
    
    try {
        const html = await fetchWithCurl(searchUrl, { isJson: false });
        if (!html) {
            console.log(`❌ ${targetAsset.name} 뉴스 페이지를 가져오지 못했습니다.`);
            return;
        }

        console.log(`✅ ${targetAsset.name} HTML 데이터 가져오기 성공 (길이: ${html.length}자)`);
        
        const $ = cheerio.load(html);
        
        // 🔍 새로운 네이버 뉴스 구조 분석
        console.log(`\n🔍 ${targetAsset.name} HTML 구조 분석...`);
        
        // 🎯 2025년 새로운 네이버 뉴스 선택자들 (실제 HTML 기반)
        const newsSelectors = [
            // 🔥 개별 뉴스 아이템에 더 집중한 선택자들 (우선순위 높음)
            '.sds-comps-base-layout.sds-comps-full-layout',      // 개별 뉴스 컨테이너
            'div[class*="sds-comps-base-layout"][class*="sds-comps-full-layout"]', // 개별 뉴스 (부분 매칭)  
            '.news_item, .list_news li, .bx, .news',             // 전통적인 개별 뉴스 아이템
            'div[data-template-id="layout"]',                     // 레이아웃 템플릿
            // 🔥 더 구체적인 개별 뉴스 선택자들
            '.sds-comps-vertical-layout.NYqAjUWdQsgkJBAODPln',    // 각 뉴스 항목의 메인 컨테이너
            '.sds-comps-vertical-layout.fds-news-item-list-tab',  // 뉴스 아이템 리스트 탭
            // 기존 선택자들 (호환성)
            '.JYgn_vFQHubpClbvwVL_',    // 메인 뉴스 컨테이너 (새로운 네이버 구조)
            '.fds-news-item-list-desk .JYgn_vFQHubpClbvwVL_', // 더 구체적인 경로
            '.news_area',               // 기존 선택자 (호환성)
            '.api_subject_bx',          // API 뉴스 박스
            'div[class*="JYgn_vFQHubpClbvwVL"]', // 부분 매칭
            'div[class*="news"]',       // 뉴스 포함 클래스
            '.sds-comps-vertical-layout:has(.sds-comps-text-type-headline1)', // headline1 포함한 컨테이너
            'article',                  // HTML5 article 태그
            '.news_wrap',               // 뉴스 랩퍼
            '.group_news > li'          // 그룹 뉴스 리스트
        ];

        let newsItems = [];
        let bestSelector = '';
        const processedLinks = new Set(); // 중복 링크 방지

        // 선택자별로 시도하여 가장 좋은 결과 찾기
        for (const selector of newsSelectors) {
            console.log(`🔍 ${targetAsset.name} 선택자 시도: ${selector}`);
            const elements = $(selector);
            console.log(`   → 찾은 요소: ${elements.length}개`);
            
            if (elements.length > 0) {
                bestSelector = selector;
                console.log(`✅ ${targetAsset.name} 최적 선택자 발견: ${selector} (${elements.length}개 요소)`);
                
                // 각 뉴스 항목에서 데이터 추출
                elements.each((index, element) => {
                    if (index < Math.min(elements.length, 20) && newsItems.length < 10) { // 더 많은 요소를 시도
                        console.log(`\n📄 ${targetAsset.name} [${index + 1}] 처리 중...`);
                        
                        const $el = $(element);
                        
                        // 다양한 방법으로 정보 추출 시도
                        let title = '', link = '', summary = '', press = '', time = '';
                        
                        // 제목 추출 (여러 방법 시도) - 개선된 버전
                        title = $el.find('.sds-comps-text-type-headline1').text().trim() ||
                               $el.find('.news_tit').text().trim() ||
                               $el.find('a[class*="news"]').first().text().trim() ||
                               $el.find('a').first().text().trim() ||  // 🎯 base-layout에서 첫 번째 a 태그
                               $el.find('h2, h3').text().trim() ||
                               $el.find('.title').text().trim() ||
                               '';
                        
                        // 🔥 제목 길이 제한 - 너무 긴 제목(여러 뉴스가 연결된 경우) 방지
                        if (title && title.length > 200) {
                            // 첫 번째 문장이나 의미있는 부분만 추출
                            const sentences = title.split(/[.!?…]|\.\.\./).filter(s => s.trim().length > 0);
                            if (sentences.length > 0) {
                                title = sentences[0].trim();
                                console.log(`   ✂️ 제목 길이 제한: ${title.length}자로 단축`);
                            } else {
                                // 문장 분할이 안 되면 첫 100자만 사용
                                title = title.substring(0, 100).trim() + '...';
                                console.log(`   ✂️ 제목 길이 강제 제한: 100자`);
                            }
                        }
                        
                        // 링크 추출
                        link = $el.find('.sds-comps-text-type-headline1').parent().attr('href') ||
                              $el.find('a[href*="news"]').first().attr('href') ||
                              $el.find('a').first().attr('href') ||
                              '';
                        
                        // 링크가 상대경로인 경우 절대경로로 변환
                        if (link && link.startsWith('/')) {
                            link = 'https://search.naver.com' + link;
                        }
                        
                        // 요약/설명 추출 - 개선된 버전 (톱스타뉴스 패턴 지원)
                        summary = $el.find('.sds-comps-text-type-body1').text().trim() ||  // 톱스타뉴스 식 설명 (3줄 제한)
                                 $el.find('.sds-comps-text-type-body2').text().trim() ||
                                 $el.find('.news_dsc').text().trim() ||
                                 $el.find('.dsc_txt_wrap').text().trim() ||
                                 '';
                        
                        // 🎯 base-layout 요소에서 설명 추출 (제목 제외한 전체 텍스트)
                        if (!summary && $el.hasClass('sds-comps-base-layout')) {
                            const fullText = $el.text().trim();
                            const firstLink = $el.find('a').first();
                            const titleText = firstLink.text().trim();
                            
                            if (fullText && titleText && fullText.length > titleText.length) {
                                // 제목 부분을 제거하고 나머지를 설명으로 사용
                                summary = fullText.replace(titleText, '').trim();
                                // 시작 부분의 불필요한 문자 제거
                                summary = summary.replace(/^[\s\n\r]+/, '').trim();
                            }
                        }
                        
                        // 언론사 추출 - 네이버 뉴스 검색 결과 페이지 기준 (범용적 접근)
                        press = extractPressFromElement($el) || extractPressFromUrl(link) || '언론사 미상';
                        
                        // 시간 추출 - 개선된 방법 (더 정확한 범위에서 추출)
                        time = extractTimeFromElement($el);
                        
                        // 시간이 추출되지 않은 경우 설명 텍스트에서 직접 추출 시도
                        if (!time && summary) {
                            const extractedFromSummary = extractTimeFromText(summary);
                            if (extractedFromSummary) {
                                time = extractedFromSummary;
                                console.log(`   🔧 설명에서 시간 추출: "${extractedFromSummary}"`);
                            }
                        }
                        
                        // 여전히 시간이 없으면 전체 요소 텍스트에서 적극 검색
                        if (!time || time === '시간 미상') {
                            const fullElementText = $el.text();
                            const extractedFromFullText = extractTimeFromText(fullElementText);
                            if (extractedFromFullText) {
                                time = extractedFromFullText;
                                console.log(`   🔧 전체 요소에서 시간 추출: "${extractedFromFullText}"`);
                            } else {
                                // 🔥 시간 정보를 전혀 찾지 못한 경우에만 "시간 미상"으로 처리
                                // "최근"으로 처리하면 6시간 필터를 우회하므로 위험함
                                time = '시간 미상';
                                console.log(`   ❌ 시간 정보를 찾을 수 없음, "시간 미상"으로 처리`);
                            }
                        }
                        
                        time = time || '시간 미상';
                        
                        // 설명 텍스트 클리닝 - 중복된 언론사명과 시간 정보 제거
                        if (summary) {
                            const originalSummary = summary;
                            summary = cleanDescriptionText(summary, press, time);
                            if (originalSummary !== summary) {
                                console.log(`   🧹 설명 클리닝: "${originalSummary.substring(0, 50)}..." -> "${summary.substring(0, 50)}..."`);
                            }
                        }
                        
                        console.log(`   📝 제목: ${title ? title.substring(0, 50) + '...' : '❌ 추출 실패'}`);
                        console.log(`   🔗 링크: ${link ? link.substring(0, 50) + '...' : '❌ 추출 실패'}`);
                        console.log(`   📰 언론사: ${press || '❌ 추출 실패'}`);
                        console.log(`   ⏰ 시간: ${time || '❌ 추출 실패'}`);
                        console.log(`   📄 설명: ${summary ? summary.substring(0, 100) + '...' : '❌ 추출 실패'}`);

                        // 키워드 필터링: 제목 또는 설명에 검색 키워드가 포함되어야 함 (개선된 매칭)
                        if (title && link && !processedLinks.has(link)) { // 중복 링크 체크 추가
                            processedLinks.add(link); // 링크 추가
                            const searchKeyword = targetAsset.name.toLowerCase();
                            const titleLower = title.toLowerCase();
                            const descLower = (summary || '').toLowerCase();
                            
                            // 제목에서만 키워드 검색 (더 정확하게)
                            const titleMatch = titleLower.includes(searchKeyword);
                            
                            if (titleMatch) {
                                console.log(`✅ ${targetAsset.name} 키워드 포함 확인 (제목에서 발견)`);
                                
                                const newsItem = {
                                    title: title,
                                    link: link,
                                    description: summary || '설명 없음',
                                    press: press || '언론사 미상',
                                    time: time || '시간 미상',
                                    searchedAsset: targetAsset.name
                                };
                                
                                newsItems.push(newsItem);
                                console.log(`✅ ${targetAsset.name} 뉴스 아이템 추가!`);
                                
                            } else {
                                console.log(`🚫 ${targetAsset.name} 키워드 미포함으로 제외 (검색어: "${searchKeyword}")`);
                            }
                        } else {
                            console.log(`❌ 필수 정보 부족으로 건너뜀`);
                        }
                    }
                });
                
                // 🔥 충분한 뉴스를 찾았거나, 유효한 뉴스가 있으면 계속 시도하지 않음
                if (newsItems.length >= 3) {
                    console.log(`✅ ${targetAsset.name} 충분한 뉴스 확보 (${newsItems.length}개), 검색 중단`);
                    break;
                }
                // 적은 수의 뉴스라도 있으면 다음 선택자도 시도해볼 수 있도록 함
                console.log(`🔄 ${targetAsset.name} 더 많은 뉴스 찾기 위해 다음 선택자 시도 (현재: ${newsItems.length}개)`);
            }
        }

        if (newsItems.length === 0) {
            console.log(`❌ ${targetAsset.name} 추출된 뉴스가 없습니다.`);
            return;
        }

        console.log(`\n=== ${targetAsset.name}: 총 ${newsItems.length}개의 뉴스 아이템 추출 완료 ===`);

        // 🔥 첫 번째 뉴스만 확인하는 방식으로 변경
        let newNewsCount = 0;
        
        console.log(`\n=== ${targetAsset.name} 첫 번째 뉴스 확인 ===`);
        
        if (newsItems.length === 0) {
            console.log(`❌ ${targetAsset.name} 추출된 뉴스가 없습니다.`);
        } else {
            // 첫 번째 뉴스만 확인
            const firstNews = newsItems[0];
            console.log(`\n📄 ${targetAsset.name} 첫 번째 뉴스 확인: ${firstNews.title.substring(0, 50)}...`);
            console.log(`   🔗 링크: ${firstNews.link}`);
            console.log(`   ⏰ 시간: ${firstNews.time}`);
            
            // 중복 체크 (이미 발송했는지 확인)
            const isDuplicate = isNewsAlreadySent(firstNews, currentState.newsHistory);
            console.log(`✅ 중복 여부: ${isDuplicate ? '이미 발송함' : '새로운 뉴스'}`);
            
            if (!isDuplicate) {
                // 새로운 뉴스 발견! 알림 발송
                console.log(`🎉 ${targetAsset.name} 새로운 뉴스 발견!`);
                newNewsCount = 1;
                
                // 뉴스 히스토리에 추가
                currentState.newsHistory.push({
                    title: firstNews.title,
                    link: firstNews.link,
                    press: firstNews.press,
                    time: firstNews.time,
                    asset: targetAsset.name,
                    sentAt: new Date().toISOString()
                });
                
                // 히스토리 크기 제한
                if (currentState.newsHistory.length > MAX_NEWS_HISTORY) {
                    currentState.newsHistory = currentState.newsHistory.slice(-MAX_NEWS_HISTORY);
                    console.log(`📋 뉴스 히스토리 정리: 최대 ${MAX_NEWS_HISTORY}개 유지`);
                }
                
                // 🎯 Flex Message로 뉴스 발송
                await sendNewsFlexMessage(firstNews);
                
            } else {
                console.log(`🔄 ${targetAsset.name} 첫 번째 뉴스는 이미 발송했음. 넘어감.`);
            }
        }
        
        console.log(`\n=== ${targetAsset.name} 처리 결과 ===`);
        console.log(`📊 전체 수집: ${newsItems.length}개`);
        console.log(`🎉 새로운 뉴스: ${newNewsCount}개`);

    } catch (error) {
        console.error(`❌ ${targetAsset.name} 뉴스 검색 중 오류:`, error.message);
    }
}


// 🚀 완전 자동화된 자산 가격 체크 함수 (방법 2: 명시적 한국 시간 사용)
async function checkAllEnabledAssets(currentState) {
    console.log('\n📊 [자산] 완전 자동화된 자산 모니터링 시작...');
    
    // 활성화된 자산만 가져오기
    const enabledAssets = getEnabledAssets();
    
    if (enabledAssets.length === 0) {
        console.log('⚠️ 활성화된 자산이 없습니다. 자산 모니터링을 건너뜁니다.');
        return;
    }
    
    // ✅ 방법 2: 명시적으로 한국 시간 사용
    const now = new Date();
    const kstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const todayStr = kstNow.toISOString().split('T')[0];
    const currentHour = kstNow.getHours();

    for (const asset of enabledAssets) {
        console.log(`\n▶ ${asset.name} (${asset.type}) 자동 모니터링 중...`);
        console.log(`   검색어: "${asset.query}"`);
        console.log(`   급등락: ±${asset.spikeThreshold}%, 추세이탈: ±${asset.trendThreshold}%`);
        
        if (asset.type === 'stock' && !isKoreanBusinessDay()) {
        console.log(`-> 🚫 ${asset.name}: 주말/공휴일로 인해 주식 알림 제외`);
        continue;
    }


        const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(asset.query)}`;
        const html = await fetchWithCurl(url, { isJson: false });
        if (!html) { 
            console.log('-> ❌ HTML을 가져오지 못했습니다.'); 
            continue; 
        }
        
        const $ = cheerio.load(html);
        
        // 🚀 자동 가격 파싱 시도
        const currentPrice = parsePrice($, asset);
        if (currentPrice === null) {
            console.log(`-> ❌ ${asset.name} 가격 파싱 실패`);
            continue;
        }
        
        console.log(`-> ✅ ${asset.name} 현재가: ${currentPrice.toLocaleString()}원`);
        
        // 자산 상태 자동 초기화 및 업데이트
        if (!currentState.assetStates[asset.name]) {
            currentState.assetStates[asset.name] = { 
                priceHistory: [], 
                lastAlertPrice: 0, 
                lastReportPrice: 0, 
                wasInDeviation: false, 
                lastTrendAlertTime: 0,      // 🔥 추가: 마지막 추세이탈 알림 시간
                lastTrendAlertPrice: 0,     // 🔥 추가: 마지막 추세이탈 알림 가격
                trendAlertDirection: null,  // 🔥 추가: 마지막 추세이탈 방향 ('up' 또는 'down')
                openingPrice: 0, 
                openingPriceDate: '',
                addedDate: new Date().toISOString(),
                totalAlerts: 0,
                lastUpdate: null
            };
            console.log(`🆕 ${asset.name} 상태 자동 생성`);
        }
        
        const assetState = currentState.assetStates[asset.name];
        assetState.lastUpdate = new Date().toISOString();
        
        const marketOpenHour = asset.type === 'stock' ? 9 : 0;
        
        // ✅ 수정: 같은 시간대 기준으로 통일 (한국 시간)
        if (assetState.openingPriceDate !== todayStr && currentHour >= marketOpenHour) {
            assetState.openingPrice = currentPrice;
            assetState.openingPriceDate = todayStr;
            console.log(`-> 📈 ${asset.name} 금일 시가(${currentPrice.toLocaleString()}원) 자동 기록 (${currentHour}시)`);
        }
        
        assetState.priceHistory.push(currentPrice);
       if (assetState.priceHistory.length > MA_PERIOD) { 
           assetState.priceHistory.shift(); 
       }
       
       // 🎯 분석 1: 직전 가격 대비 급등락 (데이터 2개만 있어도 분석 가능)
       let spikePercent = 0;
       let canAnalyzeSpike = false;
       
       if (assetState.priceHistory.length >= 2) {
           // 직전 가격과 비교
           const prevPrice = assetState.priceHistory[assetState.priceHistory.length - 2];
           spikePercent = ((currentPrice - prevPrice) / prevPrice) * 100;
           canAnalyzeSpike = true;
           console.log(`-> 📊 직전 가격 대비: ${prevPrice.toLocaleString()}원 → ${currentPrice.toLocaleString()}원 (${spikePercent > 0 ? '+' : ''}${spikePercent.toFixed(2)}%)`);
       } else if (assetState.lastAlertPrice > 0) {
           // 마지막 알림 가격과 비교 (최초 데이터일 때)
           spikePercent = ((currentPrice - assetState.lastAlertPrice) / assetState.lastAlertPrice) * 100;
           canAnalyzeSpike = true;
           console.log(`-> 📊 이전 알림가 대비: ${assetState.lastAlertPrice.toLocaleString()}원 → ${currentPrice.toLocaleString()}원 (${spikePercent > 0 ? '+' : ''}${spikePercent.toFixed(2)}%)`);
       } else {
           console.log(`-> 📊 직전 가격 비교: 데이터 부족 (${assetState.priceHistory.length}/2)`);
       }
       
       // 🎯 분석 2: 이동평균 대비 추세 이탈 (충분한 데이터 필요)
       let deviationPercent = 0;
       let canAnalyzeTrend = false;
       let actualPeriod = 0;
       
       const minDataForTrend = Math.min(10, MA_PERIOD);  // 추세 분석은 최소 10개 필요
       if (assetState.priceHistory.length >= minDataForTrend) {
           actualPeriod = Math.min(assetState.priceHistory.length, MA_PERIOD);
           const recentPrices = assetState.priceHistory.slice(-actualPeriod);
           const movingAverage = recentPrices.reduce((a, b) => a + b, 0) / actualPeriod;
           deviationPercent = ((currentPrice - movingAverage) / movingAverage) * 100;
           canAnalyzeTrend = true;
           
           console.log(`-> 📊 ${actualPeriod}분 이동평균: ${movingAverage.toFixed(2)}원`);
           console.log(`-> 📊 평균 이탈률: ${deviationPercent > 0 ? '+' : ''}${deviationPercent.toFixed(2)}% (임계값: ±${asset.trendThreshold}%)`);
       } else {
           console.log(`-> 📊 추세 분석: 데이터 수집 중... (${assetState.priceHistory.length}/${minDataForTrend})`);
       }
       
       // 분석 가능 여부 표시
       console.log(`-> 🎯 분석 가능: 급등락 ${canAnalyzeSpike ? '✅' : '❌'}, 추세이탈 ${canAnalyzeTrend ? '✅' : '❌'}`);
       
       if (!canAnalyzeSpike && !canAnalyzeTrend) {
           console.log(`-> ⏳ 분석 대기 중... 급등락까지 ${Math.max(0, 2 - assetState.priceHistory.length)}분, 추세분석까지 ${Math.max(0, minDataForTrend - assetState.priceHistory.length)}분`);
           continue;
       };
       
       // 🎯 알림 조건 체크: 두 가지 분석 모두 확인
       let alertReason = null;
       let alertEmoji = '';
       let wasInDeviation = assetState.wasInDeviation || false;
       
       // 🚀 멋진 단계별 이모지 함수 (임팩트 & 에너지 강화)
       function getEmojiByPercent(percent, isSpike = false) {
           const absPercent = Math.abs(percent);
           
           if (percent > 0) {
               // 🔥 상승 이모지 (임팩트 & 에너지 강화)
               if (absPercent >= 15) return '🚀';    // 15% 이상 초대형 폭등
               if (absPercent >= 10) return '🚀';    // 10% 이상 대폭등
               if (absPercent >= 7) return '🔥';     // 7% 이상 폭등
               if (absPercent >= 5) return '⚡';     // 5% 이상 급등
               if (absPercent >= 3) return '💎';     // 3% 이상 상승
               if (absPercent >= 1) return '✨';     // 1% 이상 소폭상승
               return '🌟';                             // 1% 미만 미세상승 (별)
           } else {
               // 💀 하락 이모지 (임팩트 & 긴장감 강화)
               if (absPercent >= 15) return '💀';    // 15% 이상 초대형 폭락
               if (absPercent >= 10) return '💀';    // 10% 이상 대폭락
               if (absPercent >= 7) return '⚠️';     // 7% 이상 폭락
               if (absPercent >= 5) return '💥';     // 5% 이상 급락
               if (absPercent >= 3) return '❄️';     // 3% 이상 하락
               if (absPercent >= 1) return '😰';     // 1% 이상 소폭하락
               return '😔';                             // 1% 미만 미세하락 (아쉬움)
           }
       }
       
       // 1. 급등락 체크 (직전 가격 대비)
       if (canAnalyzeSpike && Math.abs(spikePercent) >= asset.spikeThreshold) {
           alertEmoji = getEmojiByPercent(spikePercent, true);
           if (spikePercent > 0) {
               // 상승 단계별 표현
               const absPercent = Math.abs(spikePercent);
               if (absPercent >= 10) alertReason = `🔥 대폭등 (+${spikePercent.toFixed(2)}%)`;
               else if (absPercent >= 7) alertReason = `폭등 (+${spikePercent.toFixed(2)}%)`;
               else if (absPercent >= 5) alertReason = `급등 (+${spikePercent.toFixed(2)}%)`;
               else if (absPercent >= 3) alertReason = `상승 (+${spikePercent.toFixed(2)}%)`;
               else alertReason = `소폭상승 (+${spikePercent.toFixed(2)}%)`;
           } else {
               // 하락 단계별 표현
               const absPercent = Math.abs(spikePercent);
               if (absPercent >= 10) alertReason = `💀 대폭락 (${spikePercent.toFixed(2)}%)`;
               else if (absPercent >= 7) alertReason = `폭락 (${spikePercent.toFixed(2)}%)`;
               else if (absPercent >= 5) alertReason = `급락 (${spikePercent.toFixed(2)}%)`;
               else if (absPercent >= 3) alertReason = `하락 (${spikePercent.toFixed(2)}%)`;
               else alertReason = `소폭하락 (${spikePercent.toFixed(2)}%)`;
           }
       }
       // 2. 🔥 수정된 추세 이탈 체크 (이동평균 대비) - 가격 기준 재알림 방식
       else if (canAnalyzeTrend) {
           const isInDeviation = Math.abs(deviationPercent) >= asset.trendThreshold;
           const currentDirection = deviationPercent > 0 ? 'up' : 'down';
           
           console.log(`-> 🎯 추세이탈 상태: ${isInDeviation ? '이탈중' : '정상'}`);
           console.log(`-> 📊 현재 가격: ${currentPrice}, 마지막 알림 가격: ${assetState.lastTrendAlertPrice || '없음'}`);
           console.log(`-> 🔄 마지막 알림 방향: ${assetState.trendAlertDirection || '없음'}, 현재 방향: ${currentDirection}`);
           
           let shouldAlert = false;
           
           if (isInDeviation) {
               // 첫 번째 추세이탈 알림 (아직 알림이 없었던 경우)
               if (!assetState.lastTrendAlertPrice || !assetState.trendAlertDirection) {
                   shouldAlert = true;
                   console.log(`-> 🆕 첫 번째 추세이탈 알림 조건 충족`);
               }
               // 방향이 바뀐 경우 (상승 -> 하락 또는 하락 -> 상승)
               else if (assetState.trendAlertDirection !== currentDirection) {
                   shouldAlert = true;
                   console.log(`-> 🔄 추세 방향 변경: ${assetState.trendAlertDirection} -> ${currentDirection}`);
               }
               // 같은 방향이지만 기준 가격을 더 초과한 경우
               else if (assetState.trendAlertDirection === currentDirection) {
                   const priceChangeFromLastAlert = ((currentPrice - assetState.lastTrendAlertPrice) / assetState.lastTrendAlertPrice) * 100;
                   const absChangeFromLastAlert = Math.abs(priceChangeFromLastAlert);
                   
                   // 마지막 알림 가격에서 추가로 trendThreshold% 이상 변동한 경우
                   if (absChangeFromLastAlert >= asset.trendThreshold) {
                       shouldAlert = true;
                       console.log(`-> 📈 기준가격 추가 초과: ${priceChangeFromLastAlert.toFixed(2)}% (기준: ${asset.trendThreshold}%)`);
                   } else {
                       console.log(`-> 🔇 기준가격 미달: ${priceChangeFromLastAlert.toFixed(2)}% < ${asset.trendThreshold}%`);
                   }
               }
           }
           
           if (shouldAlert) {
               alertEmoji = getEmojiByPercent(deviationPercent, false);
               if (deviationPercent > 0) {
                   const absPercent = Math.abs(deviationPercent);
                   if (absPercent >= 10) alertReason = `🔥 대상승 추세이탈 (+${deviationPercent.toFixed(2)}%)`;
                   else if (absPercent >= 7) alertReason = `강상승 추세이탈 (+${deviationPercent.toFixed(2)}%)`;
                   else if (absPercent >= 5) alertReason = `상승 추세이탈 (+${deviationPercent.toFixed(2)}%)`;
                   else alertReason = `상승 추세이탈 (+${deviationPercent.toFixed(2)}%)`;
               } else {
                   const absPercent = Math.abs(deviationPercent);
                   if (absPercent >= 10) alertReason = `💀 대하락 추세이탈 (${deviationPercent.toFixed(2)}%)`;
                   else if (absPercent >= 7) alertReason = `강하락 추세이탈 (${deviationPercent.toFixed(2)}%)`;
                   else if (absPercent >= 5) alertReason = `하락 추세이탈 (${deviationPercent.toFixed(2)}%)`;
                   else alertReason = `하락 추세이탈 (${deviationPercent.toFixed(2)}%)`;
               }
               
               // 알림 기준 가격과 방향 업데이트
               assetState.lastTrendAlertTime = Date.now();
               assetState.lastTrendAlertPrice = currentPrice;
               assetState.trendAlertDirection = currentDirection;
               console.log(`-> 🚨 추세이탈 알림 조건 충족! 기준 가격 ${currentPrice}으로 업데이트`);
           }
           
           assetState.wasInDeviation = isInDeviation;
       }
       
       if (alertReason) {
           console.log(`-> 🚨 ${asset.name} 알림 조건 충족! 사유: ${alertReason}`);
           
           // 🚀 자동 알림 메시지 생성
           const typeIcon = asset.type === 'crypto' ? '₿' : '📈';
           let analysisInfo = '';
           
           if (canAnalyzeSpike && canAnalyzeTrend) {
               analysisInfo = `분석: 급등락✅ + 추세이탈✅ (${actualPeriod}분 기준)`;
           } else if (canAnalyzeSpike) {
               analysisInfo = `분석: 급등락✅ (추세분석 대기중)`;
           } else if (canAnalyzeTrend) {
               analysisInfo = `분석: 추세이탈✅ (${actualPeriod}분 기준)`;
           }
           
           // ✅ Flex Message로 급등락 알림 전송
           await sendPriceAlertFlexMessage(asset, currentPrice, alertReason, alertEmoji, analysisInfo);
           
           assetState.lastAlertPrice = currentPrice;
           assetState.totalAlerts = (assetState.totalAlerts || 0) + 1;
           
           console.log(`-> ✅ ${asset.name} 급등락 Flex 알림 전송 완료 (총 ${assetState.totalAlerts}회째)`);
       } else {
           console.log(`-> ➡️ ${asset.name} 변동성 기준 미달`);
           if (canAnalyzeSpike) {
               console.log(`   급등락: ${Math.abs(spikePercent).toFixed(2)}% < ${asset.spikeThreshold}%`);
           }
           if (canAnalyzeTrend) {
               console.log(`   추세이탈: ${Math.abs(deviationPercent).toFixed(2)}% < ${asset.trendThreshold}%`);
           }
       }
   }
}

// 🔥 수정된 자동 정기 리포트 - Flex Message 형태로 전송
async function sendAutoPeriodicReport(currentState) {
   console.log('\n📋 [정기 리포트] 페이코인 급등락 기준으로 변동 체크 중...');
   
   // 활성화된 자산만 가져오기
   const enabledAssets = getEnabledAssets();
   
   if (enabledAssets.length === 0) {
       console.log('[정기 리포트] 활성화된 자산이 없어 리포트를 보내지 않습니다.');
       return;
   }
   
   // 🎯 페이코인 설정 찾기
   const paycoinAsset = ASSETS_TO_WATCH.find(asset => asset.name === '페이코인');
   if (!paycoinAsset) {
       console.log('[정기 리포트] ⚠️ 페이코인 설정을 찾을 수 없습니다. 기본 임계값(1.0%)을 사용합니다.');
   }
   // 🔥 주식 자산 필터링 (주말/공휴일 제외)
   const filteredAssets = enabledAssets.filter(asset => {
       if (asset.type === 'stock' && !isKoreanBusinessDay()) {
           console.log(`[정기 리포트] 🚫 ${asset.name}: 주말/공휴일로 인해 리포트에서 제외`);
           return false;
       }
       return true;
   });
   
   if (filteredAssets.length === 0) {
       console.log('[정기 리포트] 주말/공휴일로 인해 모든 자산이 제외되어 리포트를 보내지 않습니다.');
       return;
   }
   const reportThreshold = paycoinAsset ? paycoinAsset.spikeThreshold : 1.0; // 페이코인의 급등락 임계값 사용
   console.log(`[정기 리포트] 📊 변동 기준: ±${reportThreshold}% (페이코인 급등락 설정값 기준)`);
   
   // 🎯 스마트 리포트 조건: 직전 정기 리포트 가격과 현재 가격 비교
   let shouldSendReport = false;
   let changeReasons = [];
   let reportPrices = {}; // 이번 리포트에서 사용할 가격들 저장
   
   for (const asset of enabledAssets) {
       const assetState = currentState.assetStates[asset.name];
       
       if (assetState && assetState.priceHistory.length > 0) {
           // 현재 실제 가격 (가장 최신 가격)
           const currentPrice = assetState.priceHistory[assetState.priceHistory.length - 1];
           
           // 직전 정기 리포트에서 사용된 가격 (lastReportPrice)
           const lastReportPrice = assetState.lastReportPrice || 0;
           
           console.log(`-> ${asset.name}: 현재가 ${currentPrice.toLocaleString()}원, 직전 리포트가 ${lastReportPrice.toLocaleString()}원`);
           
           // 직전 정기 리포트 가격과 비교 (페이코인 급등락 퍼센트 기준)
           if (lastReportPrice > 0) {
               const changeFromLastReport = ((currentPrice - lastReportPrice) / lastReportPrice) * 100;
               console.log(`   변동률: ${changeFromLastReport > 0 ? '+' : ''}${changeFromLastReport.toFixed(2)}% (기준: ±${reportThreshold}%)`);
               
               if (Math.abs(changeFromLastReport) >= reportThreshold) {
                   shouldSendReport = true;
                   changeReasons.push(`${asset.name} ${changeFromLastReport > 0 ? '+' : ''}${changeFromLastReport.toFixed(2)}%`);
                   console.log(`   ✅ 변동 기준 충족!`);
               } else {
                   console.log(`   ➡️ 변동 기준 미달`);
               }
           } else {
               // 첫 번째 리포트인 경우 무조건 발송
               shouldSendReport = true;
               changeReasons.push(`${asset.name} 첫 리포트`);
               console.log(`   🆕 첫 리포트 - 무조건 발송`);
           }
           
           // 이번 리포트에서 사용할 가격 저장
           reportPrices[asset.name] = currentPrice;
       }
   }
   
   if (!shouldSendReport) {
       console.log(`[정기 리포트] 페이코인 급등락 기준(±${reportThreshold}%) 미달로 리포트를 보내지 않습니다.`);
       return;
   }
   
   console.log(`[정기 리포트] 🎯 변동 감지 (기준: ±${reportThreshold}%): ${changeReasons.join(', ')}`);
   
   // 🚀 Flex Message 형태로 리포트 생성
   const flexContents = [];
   let hasPrice = false;
   
   // 한국 시간으로 현재 시간 가져오기
   const now = new Date();
   const kstTime = now.toLocaleString('ko-KR', {
       timeZone: 'Asia/Seoul',
       year: 'numeric',
       month: 'numeric',
       day: 'numeric',
       hour: 'numeric',
       minute: 'numeric',
       second: 'numeric',
       hour12: true
   });
   
   for (const asset of enabledAssets) {
       const assetState = currentState.assetStates[asset.name];
       if (assetState && assetState.priceHistory.length > 0) {
           // 현재 실제 가격 사용 (60분 평균이 아님)
           const currentPrice = reportPrices[asset.name];
           const lastReportPrice = assetState.lastReportPrice || 0;
           
           // 한국 시간으로 날짜 계산
           const kstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
           const todayStr = kstNow.toISOString().split('T')[0];
           const openingPrice = assetState.openingPriceDate === todayStr ? assetState.openingPrice : null;
           
           let changeTexts = [];
           let statusEmoji = '🟢'; // 기본값
           
           // 직전 정기 리포트 대비 변동률 및 이모지 결정 (상승 빨강, 하락 파랑)
           if (lastReportPrice > 0) {
               const changeFromLastReport = ((currentPrice - lastReportPrice) / lastReportPrice) * 100;
               if (Math.abs(changeFromLastReport) > 0.01) {
                   changeTexts.push(`리포트: ${changeFromLastReport > 0 ? '+' : ''}${changeFromLastReport.toFixed(2)}%`);
                   
                   // 🚀 멋진 변동률 이모지 (임팩트 강화)
                   const absPercent = Math.abs(changeFromLastReport);
                   if (changeFromLastReport > 0) {
                       // 🔥 상승 이모지 (에너지 & 임팩트)
                       if (absPercent >= 15) statusEmoji = '🚀';      // 15% 이상 초대형 폭등
                       else if (absPercent >= 10) statusEmoji = '🚀'; // 10% 이상 대폭등
                       else if (absPercent >= 7) statusEmoji = '🔥';  // 7% 이상 폭등  
                       else if (absPercent >= 5) statusEmoji = '⚡';  // 5% 이상 급등
                       else if (absPercent >= 3) statusEmoji = '💎';  // 3% 이상 상승
                       else if (absPercent >= 1) statusEmoji = '✨';  // 1% 이상 소폭상승
                       else statusEmoji = '🌟';                         // 1% 미만 미세상승
                   } else {
                       // 💀 하락 이모지 (긴장감 & 임팩트)
                       if (absPercent >= 15) statusEmoji = '💀';      // 15% 이상 초대형 폭락
                       else if (absPercent >= 10) statusEmoji = '💀'; // 10% 이상 대폭락
                       else if (absPercent >= 7) statusEmoji = '⚠️';  // 7% 이상 폭락
                       else if (absPercent >= 5) statusEmoji = '💥';  // 5% 이상 급락
                       else if (absPercent >= 3) statusEmoji = '❄️';  // 3% 이상 하락
                       else if (absPercent >= 1) statusEmoji = '😰';  // 1% 이상 소폭하락
                       else statusEmoji = '😔';                         // 1% 미만 미세하락
                   }
               }
           }
           
           // 시가 대비 변동률 (참고용)
           if (openingPrice) {
               const changeFromOpen = ((currentPrice - openingPrice) / openingPrice) * 100;
               if (Math.abs(changeFromOpen) > 0.01) {
                   changeTexts.push(`시가: ${changeFromOpen > 0 ? '+' : ''}${changeFromOpen.toFixed(2)}%`);
               }
           }
           
           const changeString = changeTexts.length > 0 ? ` (${changeTexts.join(', ')})` : '';
           
           // Flex Message 콘텐츠에 추가
           flexContents.push({
               "type": "text",
               "text": `${statusEmoji} ${asset.name}: ${currentPrice.toLocaleString()}원${changeString}`,
               "wrap": true,
               "size": "sm",
               "color": "#222222"
           });
           
           hasPrice = true;
           
           // 이번 리포트 가격을 lastReportPrice에 저장
           assetState.lastReportPrice = currentPrice;
       }
   }
   
   if (hasPrice) {
       // 구분선과 시간 추가
       flexContents.push({
           "type": "separator",
           "margin": "md"
       });
       
       flexContents.push({
           "type": "text",
           "text": `⏰ ${kstTime}`,
           "size": "xs",
           "color": "#888888",
           "align": "end"
       });
       
       // 🎯 Flex Message 구조 생성
       const flexMessage = {
           "content": {
               "type": "flex",
               "altText": `🔔 정기 시세 리포트 (변동기준: ±${reportThreshold}%)`,
               "contents": {
                   "type": "bubble",
                   "size": "mega",
                   "header": {
                       "type": "box",
                       "layout": "vertical",
                       "contents": [
                           {
                               "type": "text",
                               "text": "🔔 정기 시세 리포트",
                               "weight": "bold",
                               "size": "lg",
                               "color": "#FFFFFF"
                           },
                           {
                               "type": "text",
                               "text": `변동기준: ±${reportThreshold}%`,
                               "size": "sm",
                               "color": "#E0E0E0"
                           }
                       ],
                       "backgroundColor": "#0E71EB",
                       "paddingAll": "15px"
                   },
                   "body": {
                       "type": "box",
                       "layout": "vertical",
                       "spacing": "md",
                       "contents": flexContents
                   }
               }
           }
       };

       // JSON 형태로 전송 (네이버웍스에서 Flex Message 지원하는 경우)
       await sendFlexNotification(flexMessage);
       console.log('[정기 리포트] Flex Message 형태로 리포트 전송 완료');
       console.log(`[정기 리포트] 각 자산의 lastReportPrice 업데이트 완료`);
   } else {
       console.log('[정기 리포트] 전송할 시세 정보가 없습니다.');
   }
}

// --- 4. 메인 실행 로직 (Main Execution) ---
async function runAllChecks() {
   // 중복 실행 방지
   if (isRunning) {
       console.log('⚠️ 이미 실행 중입니다. 중복 실행을 방지합니다.');
       return;
   }
   
   isRunning = true;
   
   try {
       console.log(`\n===== [${new Date().toLocaleString()}] 🚀 완전 자동화 모니터링 시작 =====`);
       
       // 활성화된 자산 상태 표시
       const enabledAssets = getEnabledAssets();
       console.log(`🎯 자동 모니터링 대상: ${enabledAssets.map(a => `${a.name}(${a.type})`).join(', ')}`);
       
       const currentState = readState();
       const now = new Date().getTime();
       const timeSinceLastReport = (now - (currentState.lastPeriodicReportTime || 0)) / (1000 * 60);
       
       if (!currentState.lastPeriodicReportTime || timeSinceLastReport >= PERIODIC_REPORT_INTERVAL) {
           await sendAutoPeriodicReport(currentState);
           currentState.lastPeriodicReportTime = now;
       }
       
       await Promise.all([
           checkNewsWithRotatingAssets(currentState),     // 🔥 변경: 자산별 순환 뉴스 검색
           checkAllEnabledAssets(currentState)            // 🚀 활성화된 모든 자산 자동 모니터링
           // 🏢 다날 기술분석은 별도 스케줄러에서 실행됨 (5분 간격)
       ]);
       
       writeState(currentState);
       console.log(`\n===== [${new Date().toLocaleString()}] ✅ 완전 자동화 모니터링 종료 =====`);
   } catch (error) {
       console.error("❌ runAllChecks 함수에서 예외 발생:", error);
       console.error("스택 트레이스:", error.stack);
   } finally {
       isRunning = false;  // 실행 완료 후 플래그 해제
   }
}

// --- 5. 자산 관리 명령어 처리 ---
function handleCommand(command) {
   const args = command.toLowerCase().split(' ');
   const action = args[0];
   
   switch (action) {
       case 'status':
       case '상태':
           showAssetStatus();
           break;
           
       case 'enable':
       case '활성화':
           if (args[1]) {
               const assetName = args.slice(1).join(' ');
               enableAsset(assetName);
           } else {
               console.log('사용법: enable [자산명] 또는 활성화 [자산명]');
               console.log(`예시: enable 카이아`);
           }
           break;
           
       case 'disable':
       case '비활성화':
           if (args[1]) {
               const assetName = args.slice(1).join(' ');
               disableAsset(assetName);
           } else {
               console.log('사용법: disable [자산명] 또는 비활성화 [자산명]');
               console.log(`예시: disable 카카오페이`);
           }
           break;
           
       case 'toggle':
       case '토글':
           if (args[1]) {
               const assetName = args.slice(1).join(' ');
               toggleAsset(assetName);
           } else {
               console.log('사용법: toggle [자산명] 또는 토글 [자산명]');
               console.log(`예시: toggle 다날`);
           }
           break;

       // 🔥 뉴스 검색 관련 명령어 추가
       case 'news-enable':
       case '뉴스활성화':
           if (args[1]) {
               const assetName = args.slice(1).join(' ');
               enableNews(assetName);
           } else {
               console.log('사용법: news-enable [자산명] 또는 뉴스활성화 [자산명]');
               console.log(`예시: news-enable 페이코인`);
           }
           break;
           
       case 'news-disable':
       case '뉴스비활성화':
           if (args[1]) {
               const assetName = args.slice(1).join(' ');
               disableNews(assetName);
           } else {
               console.log('사용법: news-disable [자산명] 또는 뉴스비활성화 [자산명]');
               console.log(`예시: news-disable 이더리움`);
           }
           break;
           
       case 'news-toggle':
       case '뉴스토글':
           if (args[1]) {
               const assetName = args.slice(1).join(' ');
               toggleNews(assetName);
           } else {
               console.log('사용법: news-toggle [자산명] 또는 뉴스토글 [자산명]');
               console.log(`예시: news-toggle 비트코인`);
           }
           break;
           
       case 'add':
       case '추가':
           console.log('\n🆕 새 자산 추가 방법:');
           console.log('1. 코드에서 ASSETS_TO_WATCH 배열에 다음 형태로 추가:');
           console.log(`{
   name: '새자산명',
   query: '새자산명 시세' 또는 '새자산명 주가',
   type: 'crypto' 또는 'stock',
   spikeThreshold: 2.0,     // 급등락 %
   trendThreshold: 1.5,     // 추세이탈 %  
   enabled: true,           // 가격 모니터링 활성화
   newsEnabled: true        // 뉴스 검색 활성화
}`);
           console.log('2. 재시작하면 자동으로 모니터링 시작!');
           break;
           
       case 'help':
       case '도움말':
           console.log('\n📖 완전 자동화 시스템 명령어:');
           console.log('=== 가격 모니터링 ===');
           console.log('- status 또는 상태: 모든 자산 상태 보기');
           console.log('- enable [자산명]: 가격 모니터링 활성화');
           console.log('- disable [자산명]: 가격 모니터링 비활성화');
           console.log('- toggle [자산명]: 가격 모니터링 상태 전환');
           console.log('');
           console.log('=== 뉴스 검색 ===');
           console.log('- news-enable [자산명]: 뉴스 검색 활성화');
           console.log('- news-disable [자산명]: 뉴스 검색 비활성화');
           console.log('- news-toggle [자산명]: 뉴스 검색 상태 전환');
           console.log('');
           console.log('=== 기타 ===');
           console.log('- add 또는 추가: 새 자산 추가 방법 안내');
           console.log('- help 또는 도움말: 이 도움말 보기');
           console.log('\n🚀 자동화 기능:');
           console.log('- 뉴스 자산별 순환 검색 (newsEnabled=true인 자산만)');
           console.log('- 자산별 맞춤 가격 파싱 (enabled=true인 자산만)');
           console.log('- 자동 상태 초기화 (새 자산 추가 시)');
           console.log('- 스마트 정기 리포트 (페이코인 급등락 기준 변동 시만 발송)');
           console.log('- 추세이탈 가격 기준 재알림 시스템 (울린 가격 기준으로 재설정)');
           console.log('- 🎨 Flex Message 지원 (상승 빨강, 하락 파랑, 뉴스 보라색)');
           console.log('');
           console.log('=== 🕐 NXT/KRX 거래소 전환 ===');
           console.log('- nxt-auto 또는 auto: 시간대별 자동 전환');
           console.log('- nxt-manual 또는 manual: 수동 모드 (기본 KRX)');
           console.log('- force-nxt 또는 nxt: NXT 강제 사용');
           console.log('- force-krx 또는 krx: KRX 강제 사용');
           console.log('- trading-status: 현재 거래소 설정 상태 확인');
           break;
           
       // 🕐 NXT/KRX 거래소 전환 관련 명령어 추가
       case 'nxt-auto':
       case 'auto':
           TRADING_SCHEDULE.autoMode = true;
           console.log('✅ NXT/KRX 자동 전환 모드 활성화 (시간대별 자동 전환)');
           break;
           
       case 'nxt-manual':
       case 'manual':
           TRADING_SCHEDULE.autoMode = false;
           TRADING_SCHEDULE.forceMode = 'auto';
           console.log('🔧 NXT/KRX 수동 모드 활성화 (기본값: KRX)');
           break;
           
       case 'force-nxt':
       case 'nxt':
           TRADING_SCHEDULE.autoMode = false;
           TRADING_SCHEDULE.forceMode = 'nxt';
           console.log('🌙 NXT 거래소 강제 사용 모드');
           break;
           
       case 'force-krx':
       case 'krx':
           TRADING_SCHEDULE.autoMode = false;
           TRADING_SCHEDULE.forceMode = 'krx';
           console.log('🏛️ KRX 거래소 강제 사용 모드');
           break;
           
       case 'trading-status':
       case '거래소상태':
           console.log('\n🕐 현재 거래소 설정:');
           console.log(`자동 모드: ${TRADING_SCHEDULE.autoMode ? '✅ 활성화' : '❌ 비활성화'}`);
           console.log(`강제 모드: ${TRADING_SCHEDULE.forceMode}`);
           console.log(`정규장 시간: ${Math.floor(TRADING_SCHEDULE.regularHours.start/100)}:${(TRADING_SCHEDULE.regularHours.start%100).toString().padStart(2,'0')} ~ ${Math.floor(TRADING_SCHEDULE.regularHours.end/100)}:${(TRADING_SCHEDULE.regularHours.end%100).toString().padStart(2,'0')}`);
           console.log(`NXT 시간: ${Math.floor(TRADING_SCHEDULE.nxtHours.start/100)}:${(TRADING_SCHEDULE.nxtHours.start%100).toString().padStart(2,'0')} ~ ${Math.floor(TRADING_SCHEDULE.nxtHours.end/100)}:${(TRADING_SCHEDULE.nxtHours.end%100).toString().padStart(2,'0')}`);
           
           // 현재 시간대 표시
           const now = new Date();
           const kstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
           const hour = kstNow.getHours();
           const minute = kstNow.getMinutes();
           const currentTime = hour * 100 + minute;
           
           let currentSession = '';
           if (currentTime >= TRADING_SCHEDULE.regularHours.start && currentTime <= TRADING_SCHEDULE.regularHours.end) {
               currentSession = '📈 정규장 시간 (KRX)';
           } else if (currentTime >= TRADING_SCHEDULE.nxtHours.start && currentTime <= TRADING_SCHEDULE.nxtHours.end) {
               currentSession = '🌙 NXT 시간';
           } else {
               currentSession = '😴 거래 시간 외';
           }
           
           console.log(`현재 시간: ${hour}:${minute.toString().padStart(2, '0')} - ${currentSession}`);
           break;
           
       default:
           console.log('알 수 없는 명령어입니다. "help" 또는 "도움말"을 입력하세요.');
   }
}

// --- 스크립트 실행 시작 ---
console.log(`🚀 완전 자동화 네이버웍스 알리미를 시작합니다!`);
console.log(`⚡ 실행 간격: 1분마다`);
console.log(`🎯 완전 자동화 기능:`);
console.log(`   - 자산 추가 시 자동 검색 및 알림`);
console.log(`   - 뉴스 자산별 순환 검색 (1분에 하나씩)`);
console.log(`   - 자산별 맞춤 가격 파싱`);
console.log(`   - 스마트 정기 리포트 (페이코인 급등락 기준)`);
console.log(`   - 추세이탈 가격 기준 재알림 시스템`);
console.log(`   - 🎨 Flex Message 지원 (상승 빨강, 하락 파랑, 뉴스 보라색)`);

// 자산 상태 표시
showAssetStatus();

console.log(`📰 뉴스 검색: 자산별 순환 검색 (1분에 하나씩)`);
console.log(`📊 뉴스 검색 방식: 네이버 개별 검색 (다중 선택자 지원)`);
console.log(`📋 뉴스 히스토리: 최대 ${MAX_NEWS_HISTORY}개 저장`);
console.log(`⏰ 뉴스 필터링: 최근 ${MAX_NEWS_AGE_HOURS}시간 이내만 허용`);
console.log(`📊 검색 범위: 자산별 최신 20개 확인`);
console.log(`📤 최대 알림 수: 자산별 2개까지`);
console.log(`⏰ 정기 리포트: ${PERIODIC_REPORT_INTERVAL}분마다 (페이코인 급등락 기준 변동 시만)`);
console.log(`📊 이동평균: ${MA_PERIOD}분 기준`);
console.log(`🔄 추세이탈 재알림: 가격 기준 재설정 방식`);

console.log(`\n💡 새 자산 추가 방법:`);
console.log(`1. ASSETS_TO_WATCH 배열에 추가`);
console.log(`2. enabled: true로 설정`);
console.log(`3. 재시작하면 자동 모니터링 시작! 🎉`);

console.log(`\n🎮 관리 명령어:`);
console.log(`- "status": 전체 자산 상태 확인`);
console.log(`- "enable 자산명": 가격 모니터링 시작`);
console.log(`- "news-enable 자산명": 뉴스 검색 시작`);
console.log(`- "disable 자산명": 가격 모니터링 중지`);
console.log(`- "news-disable 자산명": 뉴스 검색 중지`);
console.log(`- "help": 전체 도움말`);

console.log(`\n🕐 거래소 전환 설정:`);
console.log(`- 자동 모드: ${TRADING_SCHEDULE.autoMode ? '✅ 활성화' : '❌ 비활성화'}`);
console.log(`- 강제 모드: ${TRADING_SCHEDULE.forceMode}`);
console.log(`- "trading-status" 명령어로 상세 확인 가능`);

console.log(`\n🎨 Flex Message 색상 구분:`);
console.log(`- 🔴 급등 알림: 빨간색 헤더`);
console.log(`- 🔵 급락 알림: 파란색 헤더`);
console.log(`- 🟣 뉴스 알림: 보라색 헤더`);
console.log(`- 🔵 정기 리포트: 파란색 헤더`);

// 명령어 입력 처리 (선택사항 - 개발 시에만 사용)
if (process.argv.includes('--interactive')) {
   const readline = require('readline');
   const rl = readline.createInterface({
       input: process.stdin,
       output: process.stdout,
       prompt: '자동화시스템> '
   });
   
   console.log('\n🖥️ 인터랙티브 모드 활성화됨. "help"를 입력하세요.');
   rl.prompt();
   
   rl.on('line', (input) => {
       const command = input.trim();
       if (command === 'exit' || command === '종료') {
           console.log('🚀 완전 자동화 시스템을 종료합니다.');
           rl.close();
           process.exit(0);
       } else if (command) {
           handleCommand(command);
       }
       rl.prompt();
   });
}

// === 에러 핸들링 강화 ===
process.on('uncaughtException', (error) => {
    console.error('🚨 예상치 못한 에러 발생:', error);
    console.error('스택 트레이스:', error.stack);
    
    // 로거를 통한 크래시 리포트
    logHelper.crashReport(error, {
        type: 'uncaughtException',
        processId: process.pid,
        argv: process.argv
    });
    
    // 상태 저장 시도
    try {
        if (typeof writeState === 'function' && currentState) {
            writeState(currentState);
            console.log('💾 최종 상태 저장 완료');
            logger.info('최종 상태 저장 완료', { 
                context: 'uncaughtException',
                stateKeys: Object.keys(currentState)
            });
        }
    } catch (saveError) {
        console.error('❌ 상태 저장 실패:', saveError.message);
        logger.error('상태 저장 실패', { error: saveError.message });
    }
    
    // 5초 후 재시작 (PM2가 처리하도록)
    setTimeout(() => {
        console.log('🔄 5초 후 프로세스 종료... PM2가 자동 재시작합니다.');
        logHelper.systemStop('uncaughtException');
        process.exit(1);
    }, 5000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 처리되지 않은 Promise 거부:', reason);
    console.error('Promise:', promise);
    
    // 로거를 통한 에러 기록
    logger.error('처리되지 않은 Promise 거부', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        type: 'unhandledRejection',
        processId: process.pid,
        timestamp: new Date().toISOString()
    });
});

process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT 신호 수신. 안전하게 종료 중...');
    
    try {
        // 현재 상태 저장
        if (typeof writeState === 'function' && currentState) {
            writeState(currentState);
            console.log('💾 최종 상태 저장 완료');
        }
    } catch (error) {
        console.error('❌ 종료 시 상태 저장 실패:', error.message);
    }
    
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM 신호 수신. 안전하게 종료 중...');
    
    try {
        if (typeof writeState === 'function' && currentState) {
            writeState(currentState);
            console.log('💾 최종 상태 저장 완료');
        }
    } catch (error) {
        console.error('❌ 종료 시 상태 저장 실패:', error.message);
    }
    
    process.exit(0);
});

// 🔥 뉴스 자동 검색 타이머 - 중복 발송 방지를 위해 주석 처리
// (Promise.all에서 checkNewsWithRotatingAssets 함수가 이미 실행되므로 중복 제거)
/*
setInterval(async () => {
    try {
        const newsEnabledAssets = getNewsEnabledAssets();
        if (newsEnabledAssets.length === 0) {
            return; // 뉴스 검색이 활성화된 자산이 없으면 건너뜀
        }

        console.log(`\n📰 [뉴스] 자동 뉴스 검색 시작... (${newsEnabledAssets.length}개 자산)`);
        
        const currentState = readState();
        await checkNewsWithRotatingAssets(currentState);
    } catch (error) {
        console.error('❌ 뉴스 자동 검색 오류:', error.message);
    }
}, 60 * 1000); // 1분마다 실행
*/

// 메모리 사용량 모니터링
setInterval(() => {
    const memUsage = process.memoryUsage();
    const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    if (memoryMB > 400) { // 400MB 초과 시 경고
        console.warn(`⚠️ 메모리 사용량 높음: ${memoryMB}MB`);
        logHelper.memoryWarning(memoryMB, 400);
        
        // 500MB 초과 시 강제 가비지 컬렉션 시도
        if (memoryMB > 500 && global.gc) {
            console.log('🗑️ 가비지 컬렉션 실행...');
            logger.warn('가비지 컬렉션 실행', { 
                memoryBeforeGC: memoryMB,
                threshold: 500 
            });
            global.gc();
            
            // GC 후 메모리 사용량 확인
            const memAfterGC = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
            logger.info('가비지 컬렉션 완료', {
                memoryBefore: memoryMB,
                memoryAfter: memAfterGC,
                freed: memoryMB - memAfterGC
            });
        }
    }
}, 60000); // 1분마다 체크

// 크론 스케줄링 (1분마다) - 에러 핸들링 추가
cron.schedule('* * * * *', async () => {
    try {
        await runAllChecks();
    } catch (error) {
        console.error('🚨 크론 작업 중 에러 발생:', error);
        console.error('스택 트레이스:', error.stack);
        
        // 에러 로그 기록
        try {
            const errorLog = {
                timestamp: new Date().toISOString(),
                error: error.message,
                stack: error.stack,
                type: 'cronError'
            };
            
            const fs = require('fs');
            const errorLogFile = './logs/error_crash.log';
            fs.appendFileSync(errorLogFile, JSON.stringify(errorLog) + '\n');
        } catch (logError) {
            console.error('❌ 크론 에러 로그 저장 실패:', logError.message);
        }
    }
});

// 초기 실행 - 에러 핸들링 추가
(async () => {
    try {
        console.log('🚀 초기 실행 시작...');
        logHelper.systemStart();
        
        const startTime = Date.now();
        await runAllChecks();
        const duration = Date.now() - startTime;
        
        console.log('✅ 초기 실행 완료');
        logHelper.performance('초기 실행', duration);
        
        // 🪙 페이코인 기술분석 모니터링 시작 (15분 간격)
        console.log('🪙 페이코인 기술분석 모니터링 시작...');
        integratePaycoinMonitoring(NAVER_WORKS_HOOK_URL, 15);
        
        // 🏢 다날 주식 기술분석 모니터링 시작 (15분 간격) - DISABLED
        // console.log('🏢 다날 주식 기술분석 모니터링 시작...');
        // startDanalTechnicalMonitoring(NAVER_WORKS_HOOK_URL, 15);
        
    } catch (error) {
        console.error('🚨 초기 실행 중 에러 발생:', error);
        console.error('스택 트레이스:', error.stack);
        logHelper.crashReport(error, { context: '초기 실행' });
    }
})();