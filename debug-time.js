const cheerio = require('cheerio');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function debugNewsTime() {
    const url = 'https://search.naver.com/search.naver?ssc=tab.news.all&where=news&sm=tab_jum&query=비트코인';
    const command = `curl -s -k -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${url}"`;
    
    try {
        console.log('🔍 네이버 뉴스에서 비트코인 검색 중...');
        const { stdout } = await execAsync(command, { timeout: 15000 });
        const $ = cheerio.load(stdout);
        
        console.log('=== 시간 정보 디버깅 ===\n');
        
        // 전체 페이지에서 시간 패턴 찾기
        const pageText = $('body').text();
        console.log('전체 페이지에서 시간 패턴 검색:');
        
        const timePatterns = [
            /\d+시간\s*전/g,
            /\d+분\s*전/g, 
            /\d+일\s*전/g,
            /\d+주\s*전/g
        ];
        
        timePatterns.forEach(pattern => {
            const matches = pageText.match(pattern);
            if (matches) {
                console.log(`${pattern.toString()}: ${[...new Set(matches)].slice(0, 10).join(', ')}`);
            }
        });
        
        console.log('\n=== 구체적인 뉴스 아이템 분석 ===');
        
        $('.sds-comps-base-layout.sds-comps-full-layout').slice(0, 3).each((i, element) => {
            const $el = $(element);
            const allText = $el.text();
            
            // 제목이 있는 것만 분석
            const title = $el.find('.sds-comps-text-type-headline1').text().trim() ||
                         $el.find('a[href*="news"]').first().text().trim();
                         
            if (title && title.length > 10) {
                console.log(`\n--- 뉴스 ${i+1} ---`);
                console.log(`제목: ${title.substring(0, 50)}...`);
                
                // 전체 텍스트에서 시간 찾기
                timePatterns.forEach(pattern => {
                    const matches = allText.match(pattern);
                    if (matches) {
                        console.log(`  시간 발견: ${matches[0]}`);
                    }
                });
                
                // 텍스트 샘플 출력
                console.log(`  텍스트 샘플: ${allText.substring(0, 200).replace(/\s+/g, ' ')}...`);
            }
        });
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    }
}

debugNewsTime();