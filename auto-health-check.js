#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// 설정
const CHECK_INTERVAL = 30000; // 30초마다 체크
const MEMORY_THRESHOLD = 85; // 메모리 85% 이상시 재시작
const RESTART_COOLDOWN = 300000; // 5분 재시작 쿨다운
const LOG_FILE = './logs/health-check.log';

let lastRestartTime = 0;

function log(message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logMessage = `${timestamp}: ${message}`;
    console.log(`🏥 ${logMessage}`);
    
    // 로그 파일에 기록
    fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

function checkPM2Status() {
    return new Promise((resolve) => {
        // PM2 정확한 경로 사용
        const pm2Paths = [
            '"C:\\Users\\2uknow\\AppData\\Roaming\\npm\\pm2.cmd" jlist',
            'pm2 jlist',
            'npx pm2 jlist'
        ];
        
        let tryIndex = 0;
        function tryPM2Command() {
            if (tryIndex >= pm2Paths.length) {
                resolve({ error: 'PM2 명령어를 찾을 수 없습니다' });
                return;
            }
            
            exec(pm2Paths[tryIndex], { windowsHide: true }, (error, stdout, stderr) => {
                if (error) {
                    tryIndex++;
                    tryPM2Command(); // 다음 경로 시도
                    return;
                }
                
                try {
                    const processes = JSON.parse(stdout);
                    const danalProcess = processes.find(p => p.name === 'danal-news');
                    resolve({ process: danalProcess, command: pm2Paths[tryIndex] });
                } catch (parseError) {
                    tryIndex++;
                    tryPM2Command(); // 다음 경로 시도
                }
            });
        }
        
        tryPM2Command(); // 첫 번째 시도 시작
    });
}

function restartProcess() {
    return new Promise((resolve) => {
        const now = Date.now();
        if (now - lastRestartTime < RESTART_COOLDOWN) {
            log(`재시작 쿨다운 중... (${Math.floor((RESTART_COOLDOWN - (now - lastRestartTime)) / 1000)}초 남음)`);
            resolve(false);
            return;
        }
        
        log('🔄 PM2 프로세스 재시작 시작...');
        exec('"C:\\Users\\2uknow\\AppData\\Roaming\\npm\\pm2.cmd" restart danal-news', { cwd: process.cwd(), windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                log(`❌ 재시작 실패: ${error.message}`);
                resolve(false);
            } else {
                log('✅ 재시작 성공');
                lastRestartTime = now;
                resolve(true);
            }
        });
    });
}

async function healthCheck() {
    const status = await checkPM2Status();
    
    if (status.error) {
        log(`❌ PM2 상태 체크 실패: ${status.error}`);
        return;
    }
    
    if (!status.process) {
        log('❌ danal-news 프로세스가 PM2에 없음 - 시작 시도');
        exec('pm2 start ecosystem.config.js', { windowsHide: true }, (error) => {
            if (error) {
                log(`❌ 프로세스 시작 실패: ${error.message}`);
            } else {
                log('✅ 프로세스 시작 성공');
            }
        });
        return;
    }
    
    const proc = status.process;
    
    // 프로세스 상태 체크
    if (proc.pm2_env.status !== 'online') {
        log(`⚠️ 프로세스 상태가 비정상: ${proc.pm2_env.status}`);
        await restartProcess();
        return;
    }
    
    // 메모리 사용량 체크
    if (proc.monit && proc.monit.memory) {
        const memoryMB = Math.round(proc.monit.memory / 1024 / 1024);
        const memoryPercent = Math.round((proc.monit.memory / (400 * 1024 * 1024)) * 100);
        
        if (memoryPercent >= MEMORY_THRESHOLD) {
            log(`🔥 메모리 사용량 높음: ${memoryMB}MB (${memoryPercent}%) - 재시작 필요`);
            await restartProcess();
            return;
        }
        
        // 정상 상태 로깅 (5분마다만)
        if (Date.now() % 300000 < CHECK_INTERVAL) {
            log(`✅ 정상 상태 - 메모리: ${memoryMB}MB (${memoryPercent}%), CPU: ${proc.monit.cpu}%`);
        }
    }
    
    // 재시작 횟수 체크
    if (proc.pm2_env.restart_time > 5) {
        log(`⚠️ 재시작 횟수 많음: ${proc.pm2_env.restart_time}회`);
    }
}

function startHealthCheck() {
    log('🚀 자동 헬스체크 시작 (30초 간격)');
    log(`📊 메모리 임계값: ${MEMORY_THRESHOLD}%`);
    log(`⏰ 재시작 쿨다운: ${RESTART_COOLDOWN/1000}초`);
    
    // 즉시 첫 체크 실행
    healthCheck();
    
    // 주기적 체크 시작
    setInterval(healthCheck, CHECK_INTERVAL);
}

// 프로세스 종료시 정리
process.on('SIGINT', () => {
    log('🛑 헬스체크 종료');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('🛑 헬스체크 종료 (SIGTERM)');
    process.exit(0);
});

// 에러 처리
process.on('uncaughtException', (error) => {
    log(`💥 예외 발생: ${error.message}`);
});

// 시작
startHealthCheck();