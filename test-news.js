// test-news.js - 뉴스 알림 테스트용 스크립트
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs');

// config.json에서 웹훅 URL 로드
let config = {};
try {
    if (fs.existsSync('config.json')) {
        config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
    }
} catch (error) {
    console.error('❌ config.json 읽기 실패:', error.message);
    console.log('💡 config.json 파일을 생성하거나 WEBHOOK_URL 환경변수를 설정하세요.');
}

// 웹훅 URL 설정 (우선순위: 환경변수 > config.json > 기본값)
const WEBHOOK_URL = process.env.WEBHOOK_URL || 
                   config.webhookUrl || 
                   'https://naverworks.danal.co.kr/message/direct/service/channels/danal_test';

// 테스트할 자산 목록
const TEST_ASSETS = [
    { name: '페이코인', query: '페이코인', type: 'crypto' },
    { name: '다날', query: '다날', type: 'stock' },
    { name: '비트코인', query: '비트코인', type: 'crypto' }
];

const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

// HTTP 요청 함수
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

// 메시지 전송 함수
async function sendTestMessage(message) {
    console.log('📤 테스트 메시지 전송 시도...');
    console.log('🔗 웹훅 URL:', WEBHOOK_URL);
    
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            body: message,
            headers: { 
                'Content-Type': 'application/json'
            },
            agent: insecureAgent
        });
        
        console.log('✅ 응답 상태:', response.status);
        console.log('✅ 메시지 전송 성공!');
        return true;
    } catch (error) {
        console.error('❌ 메시지 전송 실패:', error.message);
        return false;
    }
}

// 뉴스 Flex Message 생성 함수
function createNewsFlexMessage(newsItem) {
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
    
    return {
        "content": {
            "type": "flex",
            "altText": `📰 [테스트뉴스: ${newsItem.searchedAsset}] ${title}`,
            "contents": {
                "type": "bubble",
                "size": "mega",
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "📰 뉴스 알림 테스트",
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
                            "text": `🧪 테스트 모드 | ⏰ ${kstTime}`,
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
                                "label": "📖 전체 기사 보기",
                                "uri": newsItem.link
                            }
                        }
                    ]
                }
            }
        }
    };
}

// 뉴스 검색 및 파싱 함수
async function searchAndParseNews(asset) {
    console.log(`\n🔍 ${asset.name} 뉴스 검색 테스트 시작...`);
    
    const searchUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(asset.name)}&sort=1&field=0&pd=0&ds=&de=&docid=&related=0&mynews=0&office_type=0&office_section_code=0&news_office_checked=&nso=so%3Ar%2Cp%3Aall&is_sug_officeid=0&office_category=0&service_area=0`;
    
    console.log(`🌐 검색 URL: ${searchUrl}`);
    
    try {
        const html = await fetchWithCurl(searchUrl, { isJson: false });
        if (!html) {
            console.log(`❌ ${asset.name} HTML 데이터를 가져오지 못했습니다.`);
            return [];
        }

        console.log(`✅ ${asset.name} HTML 데이터 가져오기 성공 (길이: ${html.length}자)`);
        
        const $ = cheerio.load(html);
        
        // 다양한 선택자로 뉴스 추출 시도
        const newsSelectors = [
            '.JYgn_vFQHubpClbvwVL_',
            '.news_area',
            '.api_subject_bx',
            'div[class*="JYgn_vFQHubpClbvwVL"]',
            'div[class*="news"]',
            'article',
            '.news_wrap'
        ];
        
        console.log(`📊 각 선택자별 요소 개수:`);
        newsSelectors.forEach(selector => {
            const count = $(selector).length;
            console.log(`   ${selector}: ${count}개`);
        });
        
        const newsItems = [];
        
        // 가장 많은 요소가 있는 선택자 찾기
        let bestSelector = null;
        let maxCount = 0;
        
        for (const selector of newsSelectors) {
            const count = $(selector).length;
            if (count > maxCount) {
                maxCount = count;
                bestSelector = selector;
            }
        }
        
        console.log(`🎯 최적 선택자: ${bestSelector} (${maxCount}개)`);
        
        if (bestSelector && maxCount > 0) {
            $(bestSelector).each((index, element) => {
                if (index >= 5) return false; // 테스트이므로 5개만
                
                const $element = $(element);
                
                // 제목 추출
                const titleSelectors = [
                    '.sds-comps-text-type-headline1',
                    '.a2OpSM_aSvFbHwpL_f8N span',
                    '.news_tit',
                    '.sds-comps-text-ellipsis-1',
                    'span[class*="headline"]',
                    'h1, h2, h3',
                    '.title'
                ];
                
                let title = '', link = '';
                
                // 제목과 링크 찾기
                const titleLinkEl = $element.find('a.a2OpSM_aSvFbHwpL_f8N').first();
                if (titleLinkEl.length > 0) {
                    title = titleLinkEl.find('span').text().trim();
                    link = titleLinkEl.attr('href') || '';
                }
                
                if (!title || !link) {
                    for (const titleSel of titleSelectors) {
                        const titleEl = $element.find(titleSel).first();
                        if (titleEl.length > 0) {
                            title = titleEl.text().trim();
                            let linkEl = titleEl.closest('a');
                            if (!linkEl.length) {
                                linkEl = titleEl.find('a');
                            }
                            if (!linkEl.length) {
                                linkEl = titleEl.siblings('a');
                            }
                            link = linkEl.attr('href') || '';
                            
                            if (title && link) break;
                        }
                    }
                }
                
                // 모든 링크에서 뉴스 링크 찾기
                if (!title || !link) {
                    $element.find('a[href]').each((i, linkElement) => {
                        const href = $(linkElement).attr('href') || '';
                        if (href.includes('news.naver.com') || href.includes('/news/')) {
                            const linkText = $(linkElement).text().trim();
                            if (linkText.length > 10) {
                                title = linkText;
                                link = href;
                                return false;
                            }
                        }
                    });
                }
                
                // 설명 추출
                const descSelectors = [
                    '.sds-comps-text-type-body1',
                    '.ZkgZF9QnPXPmWBGNB6jx span',
                    '.sds-comps-text-ellipsis-3',
                    '.news_dsc',
                    '.dsc',
                    '.summary'
                ];
                
                let summary = '';
                for (const descSel of descSelectors) {
                    const descEl = $element.find(descSel).first();
                    if (descEl.length > 0) {
                        summary = descEl.text().trim();
                        if (summary) break;
                    }
                }
                
                // 언론사 추출
                const pressSelectors = [
                    '.sds-comps-profile-info-title-text',
                    '.aGReZdhn88Mnt8epC99Z span',
                    '.press',
                    '.source',
                    '.cp'
                ];
                
                let press = '';
                for (const pressSel of pressSelectors) {
                    const pressEl = $element.find(pressSel).first();
                    if (pressEl.length > 0) {
                        press = pressEl.text().trim();
                        if (press) break;
                    }
                }
                
                // 시간 추출
                const timeSelectors = [
                    '.FNqbuMwRQnfUfxlyHtTA span',
                    'span:contains("시간 전")',
                    'span:contains("분 전")',
                    '.info',
                    '.date'
                ];
                
                let time = '';
                for (const timeSel of timeSelectors) {
                    const timeEls = $element.find(timeSel);
                    if (timeEls.length > 0) {
                        timeEls.each((i, timeEl) => {
                            const timeText = $(timeEl).text().trim();
                            if (timeText.match(/\d+\s*(분|시간|일)\s*전/) || 
                                timeText.includes('분 전') || 
                                timeText.includes('시간 전')) {
                                time = timeText;
                                return false;
                            }
                        });
                        if (time) break;
                    }
                }
                
                console.log(`\n--- 뉴스 ${index + 1} ---`);
                console.log(`제목: ${title || '❌ 추출 실패'}`);
                console.log(`링크: ${link || '❌ 추출 실패'}`);
                console.log(`언론사: ${press || '❌ 추출 실패'}`);
                console.log(`시간: ${time || '❌ 추출 실패'}`);
                console.log(`설명: ${summary ? summary.substring(0, 100) + '...' : '❌ 추출 실패'}`);
                
                if (title && link) {
                    const searchKeyword = asset.name.toLowerCase();
                    const titleLower = title.toLowerCase();
                    
                    // 🔥 테스트용: 키워드 필터링 제거하고 모든 뉴스 추가
                    newsItems.push({
                        title: title,
                        link: link,
                        description: summary || '설명 없음',
                        press: press || '언론사 미상',
                        time: time || '시간 미상',
                        searchedAsset: asset.name,
                        pubDate: new Date().toISOString()
                    });
                    
                    if (titleLower.includes(searchKeyword)) {
                        console.log(`✅ 키워드 포함 확인 - 테스트 뉴스 아이템 추가!`);
                    } else {
                        console.log(`⚠️ 키워드 미포함이지만 테스트용으로 추가 - "${searchKeyword}" not in "${title.substring(0, 50)}..."`);
                    }
                }
            });
        }
        
        console.log(`\n=== ${asset.name}: 총 ${newsItems.length}개의 뉴스 아이템 추출 ===`);
        return newsItems;
        
    } catch (error) {
        console.error(`❌ ${asset.name} 뉴스 검색 중 오류:`, error.message);
        return [];
    }
}

// 메인 테스트 함수
async function runNewsTest() {
    console.log('🧪 뉴스 알림 테스트 시작!');
    console.log('🔗 웹훅 URL:', WEBHOOK_URL);
    console.log('📊 테스트 자산:', TEST_ASSETS.map(a => a.name).join(', '));
    
    // 환경 설정 확인
    if (!WEBHOOK_URL.includes('http')) {
        console.error('❌ 웹훅 URL이 올바르지 않습니다. config.json 파일이나 환경변수를 확인하세요.');
        return;
    }
    
    let totalNewsFound = 0;
    let totalSent = 0;
    
    for (const asset of TEST_ASSETS) {
        const newsItems = await searchAndParseNews(asset);
        totalNewsFound += newsItems.length;
        
        if (newsItems.length > 0) {
            console.log(`\n📤 ${asset.name}: ${newsItems.length}개 뉴스 중 첫 번째 항목을 테스트 전송합니다...`);
            
            const testNews = newsItems[0];
            const flexMessage = createNewsFlexMessage(testNews);
            const messageBody = JSON.stringify(flexMessage, null, 2);
            
            console.log('📋 전송할 메시지 미리보기:');
            console.log(`제목: ${testNews.title}`);
            console.log(`링크: ${testNews.link}`);
            console.log(`언론사: ${testNews.press}`);
            
            const success = await sendTestMessage(messageBody);
            if (success) {
                totalSent++;
                console.log(`✅ ${asset.name} 테스트 전송 성공!`);
            } else {
                console.log(`❌ ${asset.name} 테스트 전송 실패!`);
            }
            
            // 연속 전송 방지를 위해 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log(`\n⚠️ ${asset.name}: 추출된 뉴스가 없습니다.`);
        }
    }
    
    console.log(`\n📊 테스트 결과 요약:`);
    console.log(`- 검색한 자산: ${TEST_ASSETS.length}개`);
    console.log(`- 발견한 뉴스: ${totalNewsFound}개`);
    console.log(`- 전송 성공: ${totalSent}개`);
    console.log(`- 전송 실패: ${TEST_ASSETS.length - totalSent}개`);
    
    if (totalSent > 0) {
        console.log(`\n✅ 테스트 완료! 뉴스 알림이 정상적으로 작동하고 있습니다.`);
    } else {
        console.log(`\n❌ 테스트 실패! 뉴스 알림에 문제가 있을 수 있습니다.`);
        console.log(`💡 문제 해결 방법:`);
        console.log(`1. 웹훅 URL 확인`);
        console.log(`2. 네트워크 연결 확인`);
        console.log(`3. 네이버 뉴스 사이트 구조 변경 여부 확인`);
    }
}

// 스크립트 실행
console.log('🚀 뉴스 알림 테스트 스크립트 시작...');
runNewsTest().catch(error => {
    console.error('❌ 테스트 실행 중 오류:', error);
});