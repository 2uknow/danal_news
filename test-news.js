const util = require('util');
const exec = util.promisify(require('child_process').exec);
const cheerio = require('cheerio');
const https = require('https');
const fetch = require('node-fetch');

// 테스트용 설정
const TEST_ASSETS = [
    { name: '다날', type: 'stock' },
    { name: '페이코인', type: 'crypto' },
    { name: '비트코인', type: 'crypto' }
];

// 🔥 네이버웍스 훅 URL - config.json에서 로드
let NAVER_WORKS_HOOK_URL = 'https://naverworks.danal.co.kr/message/direct/service/channels/2uknow_test'; // 기본값

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

const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

// 🎯 언론사 추출 함수 - 다양한 선택자로 범용적 추출 (app.js에서 복사)
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
    
    // 🎯 언론사명 후보 검증 함수 (app.js와 동일)
    function isValidPressName(text) {
        if (!text || text.length < 2 || text.length > 30) return false;
        
        // 시간 정보 제외
        if (text.includes('전') || text.includes('시간') || text.includes('분') || text.includes('일')) return false;
        if (text.match(/\d+[시분일]/)) return false;
        if (text.match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/)) return false;
        
        // 일반적인 언론사 단어 키워드
        if (text === '뉴스' || text === '기사' || text === '네이버뉴스') return false;
        
        // 너무 많이 과분한 내용 제외 (제목이나 내용으로 보이는 경우)
        if (text.includes('비트코인') || text.includes('하락') || text.includes('달러')) return false;
        
        // 언론사 특징 없거나 짧고 의미있는 이름 (예: '뉴스', '타임스', '인덕의', '전자신문' 등 포함)
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

// 🎯 URL에서 언론사 추출 함수 - 동적으로 도메인에서 추출 (app.js에서 복사)
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
    
    // 매핑에 없는 경우 도메인에서 추출
    try {
        const domain = url.replace(/https?:\/\//, '').split('/')[0];
        const parts = domain.split('.');
        
        if (parts.length >= 2) {
            // 도메인의 주요 부분을 언론사명으로 사용 (간단한 매핑)
            const mainDomain = parts[parts.length - 2];
            const domainToPress = {
                'chosun': '조선일보',
                'joongang': '중앙일보',
                'donga': '동아일보',
                'hani': '한겨레',
                'khan': '경향신문',
                'sbs': 'SBS',
                'kbs': 'KBS',
                'mbc': 'MBC',
                'ytn': 'YTN'
            };
            
            return domainToPress[mainDomain] || null;
        }
    } catch (e) {
        return null;
    }
    
    return null;
}

// 🎯 설명 텍스트 클리닝 함수 - 중복된 언론사명과 시간 정보 제거 (app.js에서 복사)
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
    
    // 🎯 네이버 뉴스 특수 패턴들 제거 (app.js에서 복사)
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

// 🎯 시간 추출 함수 - app.js에서 복사
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
    
    // 2. 전체 텍스트에서 시간 패턴 찾기 (폴백)
    try {
        const allText = $el.text();
        return extractTimeFromText(allText);
    } catch (e) {
        // 무시
    }
    
    return null;
}

// 🎯 텍스트에서 시간 정보 추출하는 헬퍼 함수
function extractTimeFromText(text) {
    if (!text) return null;
    
    const timePatterns = [
        // 상대적 시간 표현 (긴 단위부터)
        /(\d+)개월\s*전/g,                      // "2개월 전"
        /(\d+)주\s*전/g,                        // "1주 전", "2주 전" 🔥 새로 추가
        /(\d+)일\s*전/g,                        // "1일 전"
        /(\d+)시간\s*전/g,                      // "5시간 전"
        /(\d+)분\s*전/g,                        // "30분 전"
        
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
    
    for (const pattern of timePatterns) {
        const matches = text.match(pattern);
        if (matches && matches.length > 0) {
            return matches[0].trim();
        }
    }
    
    return null;
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

// 🎯 네이버웍스 메시지 전송 함수들
async function sendNotification(message) { 
    console.log('📤 네이버웍스로 일반 메시지 전송 시도...'); 
    try { 
        await fetch(NAVER_WORKS_HOOK_URL, { 
            method: 'POST', 
            body: message, 
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, 
            agent: insecureAgent 
        }); 
        console.log('✅ 일반 메시지 전송 성공!'); 
    } catch (error) { 
        console.error('❌ 네이버웍스 일반 메시지 전송 실패:', error.message); 
    } 
}

// 🎯 Flex Message 전송 함수
async function sendFlexNotification(flexMessage) { 
    console.log('📤 네이버웍스로 Flex Message 전송 시도...'); 
    try { 
        const messageBody = JSON.stringify(flexMessage, null, 2);
        
        await fetch(NAVER_WORKS_HOOK_URL, { 
            method: 'POST', 
            body: messageBody, 
            headers: { 
                'Content-Type': 'application/json'
            }, 
            agent: insecureAgent 
        }); 
        console.log('✅ Flex Message 전송 성공!'); 
        
        console.log('📋 전송된 Flex Message 미리보기:');
        console.log(messageBody.substring(0, 300) + '...');
        
    } catch (error) { 
        console.error('❌ 네이버웍스 Flex Message 전송 실패:', error.message); 
        
        // 폴백: 일반 텍스트로 전송
        console.log('🔄 일반 텍스트로 폴백 전송 시도...');
        const altText = flexMessage.content.altText;
        await sendNotification(altText);
        console.log('✅ 폴백 텍스트 메시지 전송 완료');
    } 
}

// 🎯 뉴스 알림을 Flex Message로 전송하는 함수  
async function sendNewsFlexMessage(newsItem) {
    console.log('📤 뉴스 알림 Flex Message 생성 중...');
    
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
    
    const title = newsItem.title.length > 80 ? newsItem.title.substring(0, 77) + '...' : newsItem.title;
    const description = newsItem.description.length > 150 ? newsItem.description.substring(0, 147) + '...' : newsItem.description;
    
    const flexMessage = {
        "content": {
            "type": "flex",
            "altText": `📰 [테스트 뉴스: ${newsItem.searchedAsset}] ${title}`,
            "contents": {
                "type": "bubble",
                "size": "mega",
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "📰 테스트 뉴스 알림",
                            "weight": "bold",
                            "size": "lg",
                            "color": "#FFFFFF"
                        },
                        {
                            "type": "text",
                            "text": `🎯 ${newsItem.searchedAsset} 관련`,
                            "size": "sm",
                            "color": "#E0E0E0"
                        }
                    ],
                    "backgroundColor": "#8B5CF6",
                    "paddingAll": "15px"
                },
                "body": {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "md",
                    "contents": [
                        {
                            "type": "text",
                            "text": title,
                            "wrap": true,
                            "size": "md",
                            "weight": "bold",
                            "color": "#222222"
                        },
                        {
                            "type": "text",
                            "text": `📍 ${newsItem.press} | ${newsItem.time}`,
                            "wrap": true,
                            "size": "xs",
                            "color": "#666666"
                        },
                        {
                            "type": "text",
                            "text": `💬 ${description}`,
                            "wrap": true,
                            "size": "sm",
                            "color": "#333333"
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
                            "align": "end",
                            "margin": "sm"
                        }
                    ]
                },
                "footer": {
                    "type": "box",
                    "layout": "vertical",
                    "spacing": "sm",
                    "contents": [
                        {
                            "type": "button",
                            "style": "primary",
                            "color": "#8B5CF6",
                            "height": "sm",
                            "action": {
                                "type": "uri",
                                "label": "📰 뉴스 전문 보기",
                                "uri": newsItem.link
                            }
                        }
                    ]
                }
            }
        }
    };
    
    await sendFlexNotification(flexMessage);
}

async function fetchWithCurl(url, options = { isJson: true }) { 
    const headers = options.headers || {}; 
    let headerString = ''; 
    for (const key in headers) { 
        headerString += `-H "${key}: ${headers[key]}" `; 
    } 
    const command = `curl -s -k -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" ${headerString} "${url}"`;
    
    try { 
        const { stdout } = await exec(command, { timeout: 15000 }); 
        return options.isJson ? JSON.parse(stdout) : stdout; 
    } catch (error) { 
        if (error instanceof SyntaxError) { 
            console.error(`❌ 응답이 JSON 형식이 아닙니다. (URL: ${url})`); 
        } else { 
            console.error(`❌ curl 실행 오류 (URL: ${url}):`, error.message); 
        } 
        return null; 
    } 
}

// 실제 뉴스 날짜 검증 (시간 표현 기반) - 개선된 버전
function isNewsRecentByTime(timeText, maxAgeHours = 6) { // 6시간으로 축소
    try {
        console.log(`⏰ 시간 텍스트 분석: "${timeText}"`);
        
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
                console.log(`❌ 너무 오래된 뉴스: ${hours}시간 전`);
                return false;
            } else {
                console.log(`✅ 허용 범위 내 뉴스: ${hours}시간 전`);
                return true;
            }
        }
        
        // 분 단위, 오늘, 어제는 최신으로 간주
        const recentKeywords = ['분 전', '분전', '오늘', 'today', '어제', 'yesterday'];
        const isRecent = recentKeywords.some(keyword => timeText.includes(keyword));
        
        if (isRecent) {
            console.log(`✅ 최신 뉴스 확인: ${timeText}`);
            return true;
        }
        
        // 확실하지 않은 경우도 허용 (더 관대하게)
        console.log(`❓ 불확실한 시간 표현, 허용: ${timeText}`);
        return true; // 더 관대하게 변경
        
    } catch (error) {
        console.error(`❌ 시간 파싱 오류: ${error.message}`);
        return true; // 오류 시 허용하도록 변경
    }
}

// 🔥 개선된 네이버 뉴스 검색 + 발송 테스트 함수
async function testNaverNewsSearchWithSend(assetName, sendMessages = false) {
    console.log(`\n🔍 [${assetName}] 뉴스 검색 + 발송 테스트 시작...`);
    console.log(`📤 메시지 발송: ${sendMessages ? '활성화' : '비활성화'}`);
    
    // 🎯 새로운 네이버 뉴스 검색 URL (ssc=tab.news.all 방식)
    const searchUrl = `https://search.naver.com/search.naver?ssc=tab.news.all&where=news&sm=tab_jum&query=${encodeURIComponent(assetName)}`;
    
    console.log(`🌐 검색 URL: ${searchUrl}`);
    
    try {
        const html = await fetchWithCurl(searchUrl, { isJson: false });
        if (!html) {
            console.log(`❌ ${assetName} 뉴스 페이지를 가져오지 못했습니다.`);
            return;
        }

        console.log(`✅ ${assetName} HTML 데이터 가져오기 성공 (길이: ${html.length}자)`);
        
        const $ = cheerio.load(html);
        
        // 🔍 새로운 네이버 뉴스 구조 분석
        console.log(`\n🔍 ${assetName} HTML 구조 분석...`);
        
        // 🎯 2025년 새로운 네이버 뉴스 선택자들 (실제 HTML 기반)
        const newsSelectors = [
            // 🔥 실제 HTML에서 확인된 선택자들 (우선순위 높음)
            '.sds-comps-vertical-layout.NYqAjUWdQsgkJBAODPln',    // 각 뉴스 항목의 메인 컨테이너
            '.sds-comps-vertical-layout.fds-news-item-list-tab',  // 뉴스 아이템 리스트 탭
            'div[data-template-id="layout"]',                     // 레이아웃 템플릿
            // 🎯 개별 뉴스 항목 선택자들 (KLPGA 같은 개별 뉴스 캐치)
            '.sds-comps-base-layout.sds-comps-full-layout',      // 개별 뉴스 컨테이너
            'div[class*="sds-comps-base-layout"][class*="sds-comps-full-layout"]', // 개별 뉴스 (부분 매칭)
            // 기존 선택자들 (호환성)
            '.news_wrap',                    // 뉴스 래퍼
            '.bx',                          // 뉴스 박스
            '.news_area',                   // 뉴스 영역
            '.group_news > li',             // 뉴스 리스트 아이템
            '.lst_news > li',               // 뉴스 목록
            '.news_tit',                    // 뉴스 제목 (직접)
            'div[class*="news"]',           // news 포함 div
            '.type01 > li',                 // type01 리스트
            '.list_news > li',              // 뉴스 리스트
            // 기존 선택자들 (호환성)
            '.JYgn_vFQHubpClbvwVL_',        
            '.fds-news-item-list-desk .JYgn_vFQHubpClbvwVL_',
            '.api_subject_bx',              
            'div[class*="JYgn_vFQHubpClbvwVL"]',
            '.sds-comps-vertical-layout:has(.sds-comps-text-type-headline1)',
            'article'                       
        ];
        
        console.log(`📊 ${assetName} 각 선택자별 요소 개수:`);
        newsSelectors.forEach(selector => {
            const count = $(selector).length;
            console.log(`   ${selector}: ${count}개`);
        });
        
        // 🎯 가장 많은 요소가 있는 선택자 찾기
        let bestSelector = null;
        let maxCount = 0;
        
        for (const selector of newsSelectors) {
            const count = $(selector).length;
            if (count > maxCount) {
                maxCount = count;
                bestSelector = selector;
            }
        }
        
        console.log(`🎯 ${assetName} 최적 선택자: ${bestSelector} (${maxCount}개)`);
        
        const newsItems = [];
        const processedLinks = new Set(); // 중복 링크 방지
        console.log(`\n=== ${assetName} 뉴스 아이템 추출 시작 (최대 10개) ===`);
        
        if (bestSelector && maxCount > 0) {
            console.log(`✅ ${assetName}: ${bestSelector} 선택자로 뉴스 추출 시도...`);
            
            const elements = $(bestSelector);
            for (let index = 0; index < Math.min(elements.length, 20) && newsItems.length < 10; index++) { // 더 많이 시도하되 유효한 뉴스는 10개까지
                const element = elements[index];
                const $element = $(element);
                
                // 🎯 뉴스 제목 추출 (다양한 선택자 시도) - 실제 HTML 기반
                const titleSelectors = [
                    // 🔥 실제 HTML에서 확인된 제목 선택자들
                    '.sds-comps-text-type-headline1',                  // 🔥 실제 제목 선택자!
                    'a[href*="news"] .sds-comps-text-type-headline1',  // 링크 안의 headline1
                    '.UpDjg8Q2DzdaIi4sfrjX .sds-comps-text-type-headline1', // 특정 클래스 안의 제목
                    // 기존 선택자들 (호환성)
                    '.news_tit',                       // 뉴스 제목 클래스
                    'a.news_tit',                      // 링크 형태의 뉴스 제목
                    '.tit',                            // 제목 축약
                    '.title',                          // 제목
                    'dt a',                            // dt 태그 안의 링크
                    'h2 a',                            // h2 안의 링크
                    'h3 a',                            // h3 안의 링크
                    '.a2OpSM_aSvFbHwpL_f8N span',     // 기존 선택자
                    'span[class*="headline"]',         // headline 포함 span
                    'a[href*="news"] span',           // 뉴스 링크 안의 span
                    '.headline',                       // 헤드라인
                    '.subject'                         // 주제
                ];
                
                let title = '', link = '';
                
                // 제목과 링크 추출
                for (const titleSel of titleSelectors) {
                    const titleEl = $element.find(titleSel).first();
                    if (titleEl.length > 0) {
                        if (titleEl.is('a')) {
                            // 링크 요소인 경우
                            title = titleEl.text().trim();
                            link = titleEl.attr('href') || '';
                        } else {
                            // 일반 요소인 경우
                            title = titleEl.text().trim();
                            // 부모나 형제에서 링크 찾기
                            let linkEl = titleEl.closest('a');
                            if (!linkEl.length) {
                                linkEl = titleEl.parent('a');
                            }
                            if (!linkEl.length) {
                                linkEl = titleEl.siblings('a');
                            }
                            if (!linkEl.length) {
                                linkEl = $element.find('a[href*="news"]').first();
                            }
                            link = linkEl.attr('href') || '';
                        }
                        
                        if (title && link) {
                            console.log(`   ✅ 제목 추출 성공 (${titleSel}): ${title.substring(0, 50)}...`);
                            break;
                        }
                    }
                }
                
                // 🎯 설명 추출 - 실제 HTML 기반
                const descSelectors = [
                    // 🔥 실제 HTML에서 확인된 설명 선택자들
                    '.sds-comps-text-type-body1',                      // 🔥 실제 설명 선택자!
                    '.qayQSl_GP1qS0BX8dYlm .sds-comps-text-type-body1', // 특정 클래스 안의 body1
                    'a[href*="news"] .sds-comps-text-type-body1',      // 링크 안의 body1
                    // 기존 선택자들 (호환성)
                    '.dsc',                            // 설명
                    '.desc',                           // 설명
                    '.api_txt_lines',                  // API 텍스트
                    '.summary',                        // 요약
                    '.news_dsc',                       // 뉴스 설명
                    '.ZkgZF9QnPXPmWBGNB6jx span',     // 기존 선택자
                    '.sds-comps-text-ellipsis-3',     // 3줄 말줄임 텍스트
                    'span[class*="body1"]',           // body1 포함 span
                    '.content'                         // 내용
                ];
                
                let summary = '';
                for (const descSel of descSelectors) {
                    const descEl = $element.find(descSel).first();
                    if (descEl.length > 0) {
                        summary = descEl.text().trim();
                        if (summary) break;
                    }
                }
                
                // 🎯 base-layout 요소에서 설명 추출 (제목 제외한 전체 텍스트) - app.js와 동일한 로직
                if (!summary && $element.hasClass('sds-comps-base-layout')) {
                    const fullText = $element.text().trim();
                    const firstLink = $element.find('a').first();
                    const titleText = firstLink.text().trim();
                    
                    if (fullText && titleText && fullText.length > titleText.length) {
                        // 제목 부분을 제거하고 나머지를 설명으로 사용
                        summary = fullText.replace(titleText, '').trim();
                        // 시작 부분의 불필요한 문자 제거
                        summary = summary.replace(/^[\s\n\r]+/, '').trim();
                    }
                }
                
                // 🎯 언론사 추출 - app.js와 동일한 로직 사용
                let press = extractPressFromElement($element) || extractPressFromUrl(link) || '언론사 미상';
                
                // 🎯 시간 추출 - app.js와 동일한 로직 사용
                let time = extractTimeFromElement($element);
                
                // 시간이 추출되지 않은 경우 설명 텍스트에서 직접 추출 시도
                if (!time && summary) {
                    const extractedFromSummary = extractTimeFromText(summary);
                    if (extractedFromSummary) {
                        time = extractedFromSummary;
                        console.log(`   🔧 설명에서 시간 추출: "${extractedFromSummary}"`);
                    }
                }
                
                time = time || '';

                console.log(`\n--- ${assetName} 뉴스 ${index + 1} (${bestSelector}) ---`);
                console.log(`제목: ${title || '❌ 추출 실패'}`);
                console.log(`링크: ${link || '❌ 추출 실패'}`);
                console.log(`언론사: ${press || '❌ 추출 실패'}`);
                console.log(`시간: ${time || '❌ 추출 실패'}`);
                console.log(`설명: ${summary ? summary.substring(0, 100) + '...' : '❌ 추출 실패'}`);

                // 키워드 필터링: 제목에 검색 키워드가 포함되어야 함 (개선된 매칭)
                if (title && link && !processedLinks.has(link)) { // 중복 링크 체크 추가
                    processedLinks.add(link); // 링크 추가
                    
                    const searchKeyword = assetName.toLowerCase();
                    const titleLower = title.toLowerCase();
                    const descLower = summary.toLowerCase();
                    
                    // 제목에서만 키워드 검색 (더 정확하게)
                    const titleMatch = titleLower.includes(searchKeyword);
                    
                    if (titleMatch) {
                        console.log(`✅ ${assetName} 키워드 포함 확인 (제목에서 발견)`);
                        
                        // 시간 필터링
                        const isRecent = isNewsRecentByTime(time, 6); // 6시간 이내만 허용
                        console.log(`⏰ 시간 필터링 결과: ${isRecent ? 'PASS' : 'FAIL'}`);
                        
                        const newsItem = {
                            title: title,
                            link: link,
                            description: summary || '설명 없음',
                            press: press || '언론사 미상',
                            time: time || '시간 미상',
                            isRecent: isRecent,
                            searchedAsset: assetName
                        };
                        
                        newsItems.push(newsItem);
                        console.log(`✅ ${assetName} 뉴스 아이템 추가!`);
                        
                        // 🚀 메시지 발송 (첫 번째 뉴스만, sendMessages가 true일 때)
                        if (sendMessages && newsItems.length === 1) {
                            console.log(`\n📤 첫 번째 뉴스 Flex Message 발송 시도...`);
                            await sendNewsFlexMessage(newsItem);
                            console.log(`✅ 뉴스 발송 완료!`);
                        }
                        
                    } else {
                        console.log(`🚫 ${assetName} 키워드 미포함으로 제외 (검색어: "${searchKeyword}")`);
                    }
                } else {
                    console.log(`❌ 필수 정보 부족으로 건너뜀`);
                }
            }
        } else {
            console.log(`❌ ${assetName}: 적절한 뉴스 선택자를 찾지 못했습니다.`);
        }

        console.log(`\n=== ${assetName} 테스트 결과 ===`);
        console.log(`📊 전체 추출된 뉴스: ${newsItems.length}개`);
        const recentNews = newsItems.filter(item => item.isRecent);
        console.log(`⏰ 최신 뉴스 (6시간 이내): ${recentNews.length}개`);
        
        if (recentNews.length > 0) {
            console.log(`\n🎉 ${assetName} 최신 뉴스 목록:`);
            recentNews.forEach((item, index) => {
                console.log(`${index + 1}. [${item.press}] ${item.title.substring(0, 50)}... (${item.time})`);
            });
        }

        // 🎯 테스트 요약 메시지 (선택사항)
        if (sendMessages && newsItems.length > 0) {
            const summaryMessage = `📊 [테스트 완료] ${assetName} 뉴스 검색 결과\n` +
                                 `• 전체 뉴스: ${newsItems.length}개\n` +
                                 `• 최신 뉴스: ${recentNews.length}개\n` +
                                 `• 최적 선택자: ${bestSelector}\n` +
                                 `• 검색 URL: ssc=tab.news.all 방식 ✅`;
            
            console.log(`\n📤 테스트 요약 메시지 발송...`);
            await sendNotification(summaryMessage);
            console.log(`✅ 요약 메시지 발송 완료!`);
        }

    } catch (error) {
        console.error(`❌ ${assetName} 뉴스 검색 테스트 중 오류:`, error.message);
        
        if (sendMessages) {
            const errorMessage = `❌ [테스트 오류] ${assetName} 뉴스 검색 실패\n오류: ${error.message}`;
            await sendNotification(errorMessage);
        }
    }
}

// HTML 구조 분석 함수
async function analyzeHTMLStructure(assetName) {
    console.log(`\n🔬 [${assetName}] HTML 구조 상세 분석...`);
    
    const searchUrl = `https://search.naver.com/search.naver?ssc=tab.news.all&where=news&sm=tab_jum&query=${encodeURIComponent(assetName)}`;
    
    try {
        const html = await fetchWithCurl(searchUrl, { isJson: false });
        if (!html) {
            console.log(`❌ HTML을 가져오지 못했습니다.`);
            return;
        }

        const $ = cheerio.load(html);
        
        console.log(`📄 HTML 길이: ${html.length}자`);
        console.log(`📄 전체 요소 개수: ${$('*').length}개`);
        
        // class나 id에 'news'가 포함된 모든 요소 찾기
        console.log(`\n🔍 'news' 포함 클래스/ID 요소들:`);
        $('[class*="news"], [id*="news"]').each((index, element) => {
            if (index < 10) { // 처음 10개만
                const tagName = $(element).prop('tagName').toLowerCase();
                const className = $(element).attr('class') || '';
                const id = $(element).attr('id') || '';
                const text = $(element).text().trim().substring(0, 50);
                console.log(`   ${tagName}.${className}#${id}: "${text}..."`);
            }
        });
        
        // ul, li 요소들 분석
        console.log(`\n📋 리스트 구조 분석:`);
        $('ul').each((index, element) => {
            if (index < 5) { // 처음 5개만
                const className = $(element).attr('class') || '';
                const liCount = $(element).find('li').length;
                console.log(`   ul.${className}: ${liCount}개의 li 요소`);
                
                if (liCount > 0) {
                    $(element).find('li').each((liIndex, liElement) => {
                        if (liIndex < 3) { // 각 ul당 처음 3개 li만
                            const liClass = $(liElement).attr('class') || '';
                            const linkCount = $(liElement).find('a').length;
                            console.log(`     li.${liClass}: ${linkCount}개의 링크`);
                        }
                    });
                }
            }
        });
        
        // 링크 분석 (href에 news가 포함된 것들)
        console.log(`\n🔗 뉴스 링크 분석:`);
        $('a[href*="news"]').each((index, element) => {
            if (index < 5) { // 처음 5개만
                const href = $(element).attr('href');
                const text = $(element).text().trim().substring(0, 30);
                const className = $(element).attr('class') || '';
                console.log(`   a.${className}: "${text}..." → ${href.substring(0, 50)}...`);
            }
        });

    } catch (error) {
        console.error(`❌ HTML 구조 분석 중 오류:`, error.message);
    }
}

// 🚀 발송 테스트 메인 함수
async function runTestsWithSend(sendMessages = false) {
    console.log('🚀 네이버 뉴스 검색 + 발송 테스트 시작');
    console.log(`📤 메시지 발송 모드: ${sendMessages ? '활성화 🟢' : '비활성화 🔴'}`);
    console.log('='.repeat(70));
    
    if (sendMessages) {
        console.log('⚠️ 실제 네이버웍스로 메시지가 발송됩니다!');
        console.log('🕒 3초 후 시작...');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    for (let i = 0; i < TEST_ASSETS.length; i++) {
        const asset = TEST_ASSETS[i];
        
        console.log(`\n🎯 [${i + 1}/${TEST_ASSETS.length}] ${asset.name} 테스트 중...`);
        
        // 뉴스 검색 + 발송 테스트
        await testNaverNewsSearchWithSend(asset.name, sendMessages);
        
        // HTML 구조 분석 (첫 번째 자산만)
        if (i === 0) {
            await analyzeHTMLStructure(asset.name);
        }
        
        console.log('\n' + '-'.repeat(70));
        
        // 다음 테스트까지 대기 (API 호출 간격 조절)
        if (i < TEST_ASSETS.length - 1) {
            console.log('⏳ 다음 테스트까지 3초 대기...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    console.log('\n🎉 모든 테스트 완료!');
    
    if (sendMessages) {
        const finalMessage = `🎉 [테스트 완료] 네이버 뉴스 검색 + 발송 테스트 완료\n` +
                           `• 테스트 자산: ${TEST_ASSETS.map(a => a.name).join(', ')}\n` +
                           `• 새 URL 방식: ssc=tab.news.all ✅\n` +
                           `• Flex Message 지원 ✅\n` +
                           `• 시간: ${new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}`;
        
        console.log(`\n📤 최종 완료 메시지 발송...`);
        await sendNotification(finalMessage);
        console.log(`✅ 최종 메시지 발송 완료!`);
    }
}

// 메인 테스트 실행 (기존 - 발송 없음)
async function runTests() {
    console.log('🚀 네이버 뉴스 검색 테스트 시작 (발송 없음)');
    console.log('='.repeat(70));
    
    for (const asset of TEST_ASSETS) {
        // 1. 뉴스 검색 테스트 (발송 없음)
        await testNaverNewsSearchWithSend(asset.name, false);
        
        // 2. HTML 구조 분석 (첫 번째 자산만)
        if (asset === TEST_ASSETS[0]) {
            await analyzeHTMLStructure(asset.name);
        }
        
        console.log('\n' + '-'.repeat(70));
        
        // 잠시 대기 (API 호출 간격 조절)
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🎉 모든 테스트 완료!');
}

// 스크립트 실행
if (require.main === module) {
    // 명령행 인수 확인
    const args = process.argv.slice(2);
    const sendMode = args.includes('--send') || args.includes('-s');
    
    if (sendMode) {
        console.log('🚀 발송 모드로 테스트를 시작합니다!');
        runTestsWithSend(true).catch(console.error);
    } else {
        console.log('🚀 일반 모드로 테스트를 시작합니다 (발송 없음)');
        console.log('💡 발송 테스트를 원하면: node test-news.js --send');
        runTests().catch(console.error);
    }
}

module.exports = { 
    testNaverNewsSearchWithSend, 
    analyzeHTMLStructure, 
    sendNewsFlexMessage,
    sendNotification,
    runTests,
    runTestsWithSend 
};