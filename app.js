const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
const https = require('https');
const cron = require('node-cron');

// --- 1. 설정 (Configuration) ---
const NAVER_WORKS_HOOK_URL = 'https://naverworks.danal.co.kr/message/direct/service/channels/danal_test';

const NEWS_QUERY = '다날';

// 🚀 완전 자동화! 여기에 자산 추가하면 자동으로 모든 기능 작동!
const ASSETS_TO_WATCH = [
    { 
        name: '페이코인',   
        query: '페이코인 시세',   
        type: 'crypto', 
        spikeThreshold: 0.9,      // 급등락 임계값
        trendThreshold: 1.0,      // 추세 이탈 임계값
        enabled: true,            // 가격 모니터링 활성화/비활성화
        newsEnabled: true         // 🔥 뉴스 검색 활성화/비활성화
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
        newsEnabled: false         // 🔥 뉴스 검색 활성화/비활성화
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
const MAX_NEWS_HISTORY = 100;
const MAX_NEWS_AGE_HOURS = 6;

// 중복 실행 방지를 위한 플래그
let isRunning = false;

// --- 2. 자동 확장 헬퍼 함수 (Auto-Expansion Helper Functions) ---
const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });

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
        // 🕐 현재 시간 확인 (한국 시간 기준) - 수정된 부분
        const now = new Date();
        const kstNow = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const hour = kstNow.getHours();
        const minute = kstNow.getMinutes();
        const currentTime = hour * 100 + minute; // HHMM 형식
        
        // 정규장 시간: 09:00-15:30
        const marketOpen = 900;   // 09:00
        const marketClose = 1530; // 15:30
        
        // NXT 시간: 08:00-20:00 (정규장 제외)
        const nxtStart = 800;     // 08:00
        const nxtEnd = 2000;      // 20:00
        
        let tradingSession = 'regular'; // 기본값
        
        if (currentTime >= marketOpen && currentTime <= marketClose) {
            // 정규장 시간
            tradingSession = 'regular';
            console.log(`-> 📈 ${assetName} 정규장 시간 (${hour}:${minute.toString().padStart(2, '0')}) - 정규장 가격 우선`);
        } else if (currentTime >= nxtStart && currentTime <= nxtEnd) {
            // NXT 시간 (정규장 외)
            tradingSession = 'nxt';
            console.log(`-> 🌙 ${assetName} NXT 시간 (${hour}:${minute.toString().padStart(2, '0')}) - NXT 가격 우선`);
        } else {
            // 거래 시간 외
            tradingSession = 'regular'; // 기본값으로 정규장 가격
            console.log(`-> 😴 ${assetName} 거래 시간 외 (${hour}:${minute.toString().padStart(2, '0')}) - 정규장 가격 사용`);
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

function readState() {
    try {
        if (fs.existsSync(STATE_FILE)) { 
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            if (!state.newsHistory) {
                state.newsHistory = [];
            }
            
            // 🚀 새 자산 자동 초기화
            return initializeAssetStates(state);
        }
    } catch (error) { 
        console.error('상태 파일 읽기 오류:', error.message); 
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

// 🎯 뉴스 알림을 Flex Message로 전송하는 함수 (footer 링크 추가)
async function sendNewsFlexMessage(newsItem) {
    console.log('📤 뉴스 알림 Flex Message 전송 시도...');
    
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
    
    // 제목과 설명 길이 제한 (Flex Message용)
    const title = newsItem.title.length > 80 ? newsItem.title.substring(0, 77) + '...' : newsItem.title;
    const description = newsItem.description.length > 150 ? newsItem.description.substring(0, 147) + '...' : newsItem.description;
    
    // 🎯 뉴스 Flex Message 구조 (보라색, footer 링크 추가)
    const flexMessage = {
        "content": {
            "type": "flex",
            "altText": `📰 [새뉴스: ${newsItem.searchedAsset}] ${title}`,
            "contents": {
                "type": "bubble",
                "size": "mega",
                "header": {
                    "type": "box",
                    "layout": "vertical",
                    "contents": [
                        {
                            "type": "text",
                            "text": "📰 새로운 뉴스",
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
                    "backgroundColor": "#8B5CF6", // 보라색
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
                                "label": "📖 전체 기사 보기",
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

// 실제 뉴스 날짜 검증 (시간 표현 기반)
function isNewsRecentByTime(timeText, maxAgeHours = MAX_NEWS_AGE_HOURS) {
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
            }
        }
        
        // 분 단위, 오늘, 어제는 최신으로 간주
        const recentKeywords = ['분 전', '분전', '오늘', 'today', '어제', 'yesterday'];
        const isRecent = recentKeywords.some(keyword => timeText.includes(keyword));
        
        if (isRecent) {
            console.log(`✅ 최신 뉴스 확인: ${timeText}`);
            return true;
        }
        
        // 확실하지 않은 경우 보수적으로 false
        console.log(`❓ 불확실한 시간 표현, 안전하게 제외: ${timeText}`);
        return false;
        
    } catch (error) {
        console.error(`❌ 시간 파싱 오류: ${error.message}`);
        return false;
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

// 🔥 자산별 개별 뉴스 검색 - 1분에 하나씩 순환 검색
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
    
    const searchUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(searchQuery)}&sort=1&field=0&pd=0&ds=&de=&docid=&related=0&mynews=0&office_type=0&office_section_code=0&news_office_checked=&nso=so%3Ar%2Cp%3Aall&is_sug_officeid=0&office_category=0&service_area=0`;
    
    console.log(`🌐 검색 URL: ${searchUrl}`);
    
    try {
        const html = await fetchWithCurl(searchUrl, { isJson: false });
        if (!html) {
            console.log(`❌ ${targetAsset.name} 뉴스 페이지를 가져오지 못했습니다.`);
            return;
        }

        console.log(`✅ ${targetAsset.name} HTML 데이터 가져오기 성공 (길이: ${html.length}자)`);
        
        // 🔍 HTML 구조 분석을 위한 디버깅
        console.log(`\n🔍 ${targetAsset.name} HTML 구조 분석 중...`);
        const $ = cheerio.load(html);
        
        // 🎯 2025년 네이버 뉴스 정확한 선택자들 (실제 구조 기반)
        const newsSelectors = [
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
        
        console.log(`📊 ${targetAsset.name} 각 선택자별 요소 개수:`);
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
        
        console.log(`🎯 ${targetAsset.name} 최적 선택자: ${bestSelector} (${maxCount}개)`);
        
        const newsItems = [];
        console.log(`\n=== ${targetAsset.name} 뉴스 아이템 추출 시작 ===`);
        
        // 🚀 다중 선택자 방식으로 뉴스 추출
        if (bestSelector && maxCount > 0) {
            console.log(`✅ ${targetAsset.name}: ${bestSelector} 선택자로 뉴스 추출 시도...`);
            
            $(bestSelector).each((index, element) => {
                if (index >= 10) return false; // 개별 검색이므로 10개까지만 확인
                
                const $element = $(element);
                
                // 🎯 2025년 네이버 뉴스 정확한 제목 선택자들
                const titleSelectors = [
                    '.sds-comps-text-type-headline1',  // 🔥 실제 제목 선택자!
                    '.a2OpSM_aSvFbHwpL_f8N span',     // 제목 링크 안의 span
                    '.news_tit',                       // 기존 선택자 (호환성)
                    '.sds-comps-text-ellipsis-1',     // 말줄임 텍스트
                    'span[class*="headline"]',         // headline 포함 span
                    'h1, h2, h3',                     // 헤딩 태그
                    '.news_title',                     // 뉴스 타이틀
                    '.title',                          // 제목
                    '.subject',                        // 주제
                    'a[href*="news"] span',           // 뉴스 링크 안의 span
                    '.headline'                        // 헤드라인
                ];
                
                let title = '', link = '';
                
                // 제목과 링크를 함께 찾기 (2025년 네이버 구조)
                title = '';
                link = '';
                
                // 🔥 방법 1: 제목 링크를 직접 찾기
                const titleLinkEl = $element.find('a.a2OpSM_aSvFbHwpL_f8N').first();
                if (titleLinkEl.length > 0) {
                    title = titleLinkEl.find('span').text().trim();
                    link = titleLinkEl.attr('href') || '';
                    if (title && link) {
                        console.log(`   ✅ 직접 링크로 제목 추출 성공: ${title.substring(0, 50)}...`);
                    }
                }
                
                // 🔥 방법 2: 제목 선택자들 시도
                if (!title || !link) {
                    for (const titleSel of titleSelectors) {
                        const titleEl = $element.find(titleSel).first();
                        if (titleEl.length > 0) {
                            title = titleEl.text().trim();
                            // 링크는 부모나 형제 요소에서 찾기
                            let linkEl = titleEl.closest('a');
                            if (!linkEl.length) {
                                linkEl = titleEl.find('a');
                            }
                            if (!linkEl.length) {
                                linkEl = titleEl.siblings('a');
                            }
                            link = linkEl.attr('href') || '';
                            
                            if (title && link) {
                                console.log(`   ✅ 제목 추출 성공 (${titleSel}): ${title.substring(0, 50)}...`);
                                break;
                            }
                        }
                    }
                }
                
                // 🔥 방법 3: 모든 링크에서 뉴스 링크 찾기
                if (!title || !link) {
                    $element.find('a[href]').each((i, linkElement) => {
                        const href = $(linkElement).attr('href') || '';
                        if (href.includes('news.naver.com') || href.includes('/news/') || 
                            href.includes('newsis.com') || href.includes('mt.co.kr')) {
                            const linkText = $(linkElement).text().trim();
                            if (linkText.length > 10) { // 제목으로 보이는 긴 텍스트
                                title = linkText;
                                link = href;
                                console.log(`   ✅ 뉴스 링크로 제목 추출 성공: ${title.substring(0, 50)}...`);
                                return false; // break
                            }
                        }
                    });
                }
                
                // 🎯 2025년 네이버 뉴스 정확한 설명 선택자들
                const descSelectors = [
                    '.sds-comps-text-type-body1',      // 🔥 실제 설명 선택자!
                    '.ZkgZF9QnPXPmWBGNB6jx span',     // 설명 링크 안의 span
                    '.sds-comps-text-ellipsis-3',     // 3줄 말줄임 텍스트
                    '.news_dsc',                       // 기존 선택자 (호환성)
                    'span[class*="body1"]',           // body1 포함 span
                    '.dsc',                            // 설명
                    '.desc',                           // 설명  
                    '.summary',                        // 요약
                    '.content',                        // 내용
                    '.api_txt_lines'                   // API 텍스트 라인
                ];
                
                let summary = '';
                for (const descSel of descSelectors) {
                    const descEl = $element.find(descSel).first();
                    if (descEl.length > 0) {
                        summary = descEl.text().trim();
                        if (summary) break;
                    }
                }
                
                // 🎯 2025년 네이버 뉴스 정확한 언론사 선택자들
                const pressSelectors = [
                    '.sds-comps-profile-info-title-text', // 🔥 실제 언론사 선택자!
                    '.aGReZdhn88Mnt8epC99Z span',         // 언론사 링크 안의 span  
                    'span:contains("뉴시스")',            // 특정 언론사명 포함
                    'span:contains("머니투데이")',         // 특정 언론사명 포함
                    '.press',                              // 기존 선택자 (호환성)
                    '.source',                             // 소스
                    '.cp',                                 // 언론사 (축약)
                    '.origin',                             // 출처
                    '.media',                              // 미디어
                    '.publisher'                           // 퍼블리셔
                ];
                
                let press = '';
                for (const pressSel of pressSelectors) {
                    const pressEl = $element.find(pressSel).first();
                    if (pressEl.length > 0) {
                        press = pressEl.text().trim();
                        if (press) break;
                    }
                }
                
                // 🎯 2025년 네이버 뉴스 정확한 시간 선택자들
                const timeSelectors = [
                    '.FNqbuMwRQnfUfxlyHtTA span',         // 🔥 실제 시간 선택자!
                    'span:contains("시간 전")',           // "시간 전" 포함 span
                    'span:contains("일 전")',             // "일 전" 포함 span
                    'span:contains("분 전")',             // "분 전" 포함 span
                    '.sds-comps-text-type-body2:contains("전")', // "전" 포함 body2 텍스트
                    '.info',                               // 기존 선택자 (호환성)
                    '.date',                               // 날짜
                    '.time',                               // 시간
                    '.when',                               // 언제
                    '.datetime',                           // 날짜시간
                    '.ago'                                 // ~전
                ];
                
                let time = '';
                for (const timeSel of timeSelectors) {
                    const timeEls = $element.find(timeSel);
                    if (timeEls.length > 0) {
                        timeEls.each((i, timeEl) => {
                            const timeText = $(timeEl).text().trim();
                            // 🔥 시간 표현만 필터링 (네이버뉴스, 기자명 등 제외)
                            if (timeText.match(/\d+\s*(분|시간|일|주|개월|년)\s*전/) || 
                                timeText.includes('분 전') || 
                                timeText.includes('시간 전') || 
                                timeText.includes('일 전')) {
                                time = timeText;
                                return false; // break
                            }
                        });
                        if (time) break;
                    }
                }

                console.log(`\n--- ${targetAsset.name} 뉴스 ${index + 1} (${bestSelector}) ---`);
                console.log(`제목: ${title || '❌ 추출 실패'}`);
                console.log(`링크: ${link || '❌ 추출 실패'}`);
                console.log(`언론사: ${press || '❌ 추출 실패'}`);
                console.log(`시간: ${time || '❌ 추출 실패'}`);
                console.log(`설명: ${summary ? summary.substring(0, 100) + '...' : '❌ 추출 실패'}`);

                // 🔥 키워드 필터링: 제목에 검색 키워드가 포함되어야 함
                if (title && link) {
                    const searchKeyword = targetAsset.name.toLowerCase();
                    const titleLower = title.toLowerCase();
                    
                    if (titleLower.includes(searchKeyword)) {
                        console.log(`✅ ${targetAsset.name} 키워드 포함 확인: "${searchKeyword}" in "${title.substring(0, 50)}..."`);
                        
                        newsItems.push({
                            title: title,
                            link: link,
                            description: summary,
                            press: press,
                            time: time,
                            searchedAsset: targetAsset.name,  // 🔥 어떤 자산으로 검색했는지 기록
                            pubDate: new Date().toISOString()
                        });
                        console.log(`✅ ${targetAsset.name} 뉴스 아이템 추가 성공!`);
                    } else {
                        console.log(`🚫 ${targetAsset.name} 키워드 미포함으로 제외: "${searchKeyword}" not in "${title.substring(0, 50)}..."`);
                    }
                } else {
                    console.log(`❌ 필수 정보 부족으로 건너뜀`);
                }
            });
        } else {
            console.log(`❌ ${targetAsset.name}: 적절한 뉴스 선택자를 찾지 못했습니다.`);
        }

        console.log(`\n=== ${targetAsset.name}: 총 ${newsItems.length}개의 뉴스 아이템 추출 완료 ===`);

        if (newsItems.length === 0) {
            console.log(`❌ ${targetAsset.name} 추출된 뉴스가 없습니다.`);
            return;
        }

        // 각 뉴스 아이템에 대해 시간 기반 필터링 + 중복 체크
        let newNewsCount = 0;
        let filteredByDate = 0;
        let filteredByDuplicate = 0;
        
        console.log(`\n=== ${targetAsset.name} 뉴스 필터링 시작 ===`);
        
        for (const newsItem of newsItems) {
            console.log(`\n📄 ${targetAsset.name} 처리 중: ${newsItem.title.substring(0, 50)}...`);
            
            // 1단계: 시간 표현 기반 날짜 필터링
            if (!isNewsRecentByTime(newsItem.time)) {
                filteredByDate++;
                console.log(`🚫 시간 필터링으로 제외됨`);
                continue;
            }
            
            // 2단계: 중복 체크
            const isDuplicate = isNewsAlreadySent(newsItem, currentState.newsHistory);
            console.log(`✅ 중복 여부: ${isDuplicate ? '중복됨 (건너뜀)' : '새로운 뉴스'}`);
            
            if (isDuplicate) {
                filteredByDuplicate++;
                console.log(`🚫 중복 필터링으로 제외됨`);
                continue;
            }
            
            // 3단계: 새로운 뉴스 처리
            console.log(`🎉 ${targetAsset.name} 새로운 뉴스 발견!`);
            
            // ✅ Flex Message로 뉴스 알림 전송
            await sendNewsFlexMessage(newsItem);
            
            // 뉴스 히스토리에 추가
            addNewsToHistory(newsItem, currentState);
            
            newNewsCount++;
            console.log(`✅ ${targetAsset.name} 새 뉴스 Flex 알림 전송 및 히스토리 추가 완료`);
            
            // 개별 검색이므로 한 번에 최대 2개까지만 전송
            if (newNewsCount >= 2) {
                console.log(`⚠️ ${targetAsset.name}: 한 번에 최대 2개의 새 뉴스만 처리합니다.`);
                break;
            }
        }
        
        console.log(`\n=== ${targetAsset.name} 뉴스 처리 결과 ===`);
        console.log(`📊 전체 뉴스: ${newsItems.length}개`);
        console.log(`🚫 시간으로 필터링: ${filteredByDate}개`);
        console.log(`🚫 중복으로 필터링: ${filteredByDuplicate}개`);
        console.log(`🎉 새로 처리된 뉴스: ${newNewsCount}개`);

    } catch (error) {
        console.error(`❌ ${targetAsset.name} 뉴스 검색 처리 중 오류 발생:`, error.message);
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
       
       // 🚀 단계별 이모지 함수 (상승 빨강, 하락 파랑)
       function getEmojiByPercent(percent, isSpike = false) {
           const absPercent = Math.abs(percent);
           
           if (percent > 0) {
               // 상승 이모지 (빨간색 계열)
               if (absPercent >= 10) return '🔴';      // 10% 이상 대폭등
               if (absPercent >= 7) return '🟥';       // 7% 이상 폭등  
               if (absPercent >= 5) return '📈';       // 5% 이상 급등
               if (absPercent >= 3) return '🔺';       // 3% 이상 상승
               if (absPercent >= 1) return '🟠';       // 1% 이상 소폭상승
               return '🟢';                             // 1% 미만 미세상승
           } else {
               // 하락 이모지 (파란색 계열)
               if (absPercent >= 10) return '🔵';      // 10% 이상 대폭락
               if (absPercent >= 7) return '🟦';       // 7% 이상 폭락
               if (absPercent >= 5) return '📉';       // 5% 이상 급락
               if (absPercent >= 3) return '🔻';       // 3% 이상 하락
               if (absPercent >= 1) return '🟪';       // 1% 이상 소폭하락
               return '🔴';                             // 1% 미만 미세하락
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
       // 2. 🔥 수정된 추세 이탈 체크 (이동평균 대비) - 쿨다운 기능 추가
       else if (canAnalyzeTrend) {
           const isInDeviation = Math.abs(deviationPercent) >= asset.trendThreshold;
           const currentTime = Date.now();
           const timeSinceLastTrendAlert = currentTime - (assetState.lastTrendAlertTime || 0);
           const cooldownMinutes = 30; // 추세이탈 알림 후 30분 쿨다운
           const cooldownMs = cooldownMinutes * 60 * 1000;
           
           console.log(`-> 🎯 추세이탈 상태: ${isInDeviation ? '이탈중' : '정상'}`);
           console.log(`-> ⏰ 마지막 추세알림: ${assetState.lastTrendAlertTime ? new Date(assetState.lastTrendAlertTime).toLocaleTimeString() : '없음'}`);
           console.log(`-> ⏱️ 쿨다운 상태: ${timeSinceLastTrendAlert < cooldownMs ? `${Math.ceil((cooldownMs - timeSinceLastTrendAlert) / 60000)}분 남음` : '가능'}`);
           
           // 추세이탈 알림 조건:
           // 1. 현재 추세이탈 상태이고
           // 2. 이전에 추세이탈 상태가 아니었거나 (새로운 이탈)
           // 3. 마지막 추세이탈 알림 후 충분한 시간이 지났을 때 (쿨다운 완료)
           if (isInDeviation && (!wasInDeviation || timeSinceLastTrendAlert >= cooldownMs)) {
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
               
               // 추세이탈 알림 시간 업데이트
               assetState.lastTrendAlertTime = currentTime;
               console.log(`-> 🚨 추세이탈 알림 조건 충족! 다음 추세알림은 ${cooldownMinutes}분 후 가능`);
           } else if (isInDeviation && timeSinceLastTrendAlert < cooldownMs) {
               console.log(`-> 🔇 추세이탈 중이지만 쿨다운 시간 (${Math.ceil((cooldownMs - timeSinceLastTrendAlert) / 60000)}분 남음)`);
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
                   
                   // 변동률에 따른 이모지 결정 (상승 빨강, 하락 파랑)
                   const absPercent = Math.abs(changeFromLastReport);
                   if (changeFromLastReport > 0) {
                       // 상승 이모지 (빨간색 계열)
                       if (absPercent >= 10) statusEmoji = '🔴';      // 10% 이상 대폭등
                       else if (absPercent >= 7) statusEmoji = '🟥';  // 7% 이상 폭등  
                       else if (absPercent >= 5) statusEmoji = '📈';  // 5% 이상 급등
                       else if (absPercent >= 3) statusEmoji = '🔺';  // 3% 이상 상승
                       else if (absPercent >= 1) statusEmoji = '🟠';  // 1% 이상 소폭상승
                       else statusEmoji = '🟢';                       // 1% 미만 미세상승
                   } else {
                       // 하락 이모지 (파란색 계열)
                       if (absPercent >= 10) statusEmoji = '🔵';      // 10% 이상 대폭락
                       else if (absPercent >= 7) statusEmoji = '🟦';  // 7% 이상 폭락
                       else if (absPercent >= 5) statusEmoji = '📉';  // 5% 이상 급락
                       else if (absPercent >= 3) statusEmoji = '🔻';  // 3% 이상 하락
                       else if (absPercent >= 1) statusEmoji = '🟪';  // 1% 이상 소폭하락
                       else statusEmoji = '🔴';                       // 1% 미만 미세하락
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
           console.log('- 추세이탈 알림 쿨다운 (30분간 재알림 방지)');
           console.log('- 🎨 Flex Message 지원 (상승 빨강, 하락 파랑, 뉴스 보라색)');
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
console.log(`   - 추세이탈 쿨다운 시스템 (30분)`);
console.log(`   - 🎨 Flex Message 지원 (상승 빨강, 하락 파랑, 뉴스 보라색)`);

// 자산 상태 표시
showAssetStatus();

console.log(`📰 뉴스 검색: 자산별 순환 검색 (1분에 하나씩)`);
console.log(`📊 뉴스 검색 방식: 네이버 개별 검색 (다중 선택자 지원)`);
console.log(`📋 뉴스 히스토리: 최대 ${MAX_NEWS_HISTORY}개 저장`);
console.log(`⏰ 뉴스 필터링: 최근 ${MAX_NEWS_AGE_HOURS}시간 이내만 허용`);
console.log(`📊 검색 범위: 자산별 최신 10개 확인`);
console.log(`📤 최대 알림 수: 자산별 2개까지`);
console.log(`⏰ 정기 리포트: ${PERIODIC_REPORT_INTERVAL}분마다 (페이코인 급등락 기준 변동 시만)`);
console.log(`📊 이동평균: ${MA_PERIOD}분 기준`);
console.log(`🔇 추세이탈 쿨다운: 30분 (재알림 방지)`);

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

// 크론 스케줄링 (1분마다)
cron.schedule('* * * * *', runAllChecks);

// 초기 실행
runAllChecks();