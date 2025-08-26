// danal-realtime-price.js
// 다날 실시간 주가 조회 (네이버 금융 직접 API)

const https = require('https');
const { exec } = require('child_process');
const util = require('util');

// 사내망 HTTPS 에이전트
const agent = new https.Agent({
    rejectUnauthorized: false
});

class DanalRealtimePrice {
    constructor() {
        this.stockCode = '064260'; // 다날 종목코드
        this.execPromise = util.promisify(exec);
    }

    // 🏆 방법 1: 네이버 금융 실시간 API (가장 정확)
    async getPriceFromNaverFinance() {
        try {
            // 네이버 금융 실시간 데이터 API
            const realtimeUrl = `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${this.stockCode}`;
            
            const curlCommand = `curl -k -s --connect-timeout 5 --max-time 15 ` +
                               `-H "User-Agent: Mozilla/5.0" ` +
                               `-H "Referer: https://finance.naver.com/" ` +
                               `"${realtimeUrl}"`;

            const { stdout } = await this.execPromise(curlCommand);
            const data = JSON.parse(stdout);

            if (data && data.result && data.result.areas && data.result.areas[0]) {
                const item = data.result.areas[0].datas[0];
                
                return {
                    success: true,
                    source: 'NaverFinance_Realtime',
                    currentPrice: parseInt(item.nv),
                    changePrice: parseInt(item.cv),
                    changeRate: parseFloat(item.cr),
                    volume: parseInt(item.aq),
                    timestamp: new Date().toISOString(),
                    marketStatus: item.ms // 장 상태
                };
            }
        } catch (error) {
            console.log('네이버 금융 실시간 API 실패:', error.message);
        }
        return null;
    }

    // 🥈 방법 2: 네이버 금융 페이지 직접 파싱
    async getPriceFromNaverPage() {
        try {
            const financeUrl = `https://finance.naver.com/item/sise.nhn?code=${this.stockCode}`;
            
            const curlCommand = `curl -k -s --connect-timeout 5 --max-time 15 ` +
                               `-H "User-Agent: Mozilla/5.0" ` +
                               `"${financeUrl}"`;

            const { stdout } = await this.execPromise(curlCommand);
            
            // 현재가 추출 (더 정확한 선택자)
            const priceMatch = stdout.match(/class="no_up".*?<em>.*?<span class="blind">현재가<\/span>\s*(\d{1,3}(?:,\d{3})*)/);
            const changeMatch = stdout.match(/class="no_up".*?<em>.*?<span class="blind">전일대비<\/span>\s*([+-]?\d{1,3}(?:,\d{3})*)/);
            const rateMatch = stdout.match(/class="no_up".*?<em>.*?<span class="blind">등락률<\/span>\s*([+-]?\d+\.?\d*)/);
            
            if (priceMatch) {
                const currentPrice = parseInt(priceMatch[1].replace(/,/g, ''));
                const changePrice = changeMatch ? parseInt(changeMatch[1].replace(/[,+-]/g, '')) : 0;
                const changeRate = rateMatch ? parseFloat(rateMatch[1]) : 0;
                
                return {
                    success: true,
                    source: 'NaverFinance_Page',
                    currentPrice,
                    changePrice,
                    changeRate,
                    timestamp: new Date().toISOString()
                };
            }
        } catch (error) {
            console.log('네이버 금융 페이지 파싱 실패:', error.message);
        }
        return null;
    }

    // 🥉 방법 3: 네이버 검색 최적화 (현재 방식 개선)
    async getPriceFromNaverSearch() {
        try {
            const searchQuery = `다날 주가 064260`;
            const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(searchQuery)}`;
            
            const curlCommand = `curl -k -s --connect-timeout 5 --max-time 15 ` +
                               `-H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" ` +
                               `"${searchUrl}"`;

            const { stdout } = await this.execPromise(curlCommand);
            
            // 개선된 파싱 로직
            const patterns = [
                // 패턴 1: 일반적인 주가 표시
                /현재가[^0-9]*(\d{1,3}(?:,\d{3})*)/,
                // 패턴 2: 가격 정보 영역
                /class="price"[^>]*>.*?(\d{1,3}(?:,\d{3})*)/,
                // 패턴 3: 종목 정보 영역
                /종목.*?(\d{1,3}(?:,\d{3})*)원/
            ];
            
            for (const pattern of patterns) {
                const match = stdout.match(pattern);
                if (match) {
                    const currentPrice = parseInt(match[1].replace(/,/g, ''));
                    
                    // 변동률도 찾기
                    const ratePattern = /([+-]?\d+\.?\d*)%/;
                    const rateMatch = stdout.match(ratePattern);
                    const changeRate = rateMatch ? parseFloat(rateMatch[1]) : 0;
                    
                    return {
                        success: true,
                        source: 'NaverSearch_Optimized',
                        currentPrice,
                        changeRate,
                        timestamp: new Date().toISOString()
                    };
                }
            }
        } catch (error) {
            console.log('네이버 검색 최적화 실패:', error.message);
        }
        return null;
    }

    // 🔄 통합 조회 (폴백 체인)
    async getCurrentPrice() {
        const methods = [
            { name: '네이버금융실시간', func: () => this.getPriceFromNaverFinance() },
            { name: '네이버금융페이지', func: () => this.getPriceFromNaverPage() },
            { name: '네이버검색최적화', func: () => this.getPriceFromNaverSearch() }
        ];

        for (const method of methods) {
            try {
                console.log(`🔍 ${method.name} 방식으로 다날 주가 조회 중...`);
                const result = await method.func();
                
                if (result && result.success && result.currentPrice > 5000) { // 합리적 가격 범위 체크
                    console.log(`✅ ${method.name} 성공: ${result.currentPrice.toLocaleString()}원 (${result.changeRate > 0 ? '+' : ''}${result.changeRate}%)`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ ${method.name} 실패:`, error.message);
                continue;
            }
        }
        
        throw new Error('모든 다날 주가 조회 방식 실패');
    }
}

// 간단한 테스트 함수
async function testDanalPrice() {
    console.log('🏢 다날 실시간 주가 조회 테스트\n');
    
    const priceAPI = new DanalRealtimePrice();
    
    try {
        const result = await priceAPI.getCurrentPrice();
        console.log('\n📊 최종 결과:');
        console.log('='.repeat(40));
        console.log(`회사: 다날 (064260)`);
        console.log(`현재가: ${result.currentPrice.toLocaleString()}원`);
        console.log(`변동률: ${result.changeRate > 0 ? '+' : ''}${result.changeRate}%`);
        console.log(`데이터원: ${result.source}`);
        console.log(`조회시각: ${result.timestamp}`);
        console.log('='.repeat(40));
        
    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
    }
}

// 메인 함수로 실행시 테스트
if (require.main === module) {
    testDanalPrice();
}

module.exports = {
    DanalRealtimePrice
};