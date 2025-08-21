#!/usr/bin/env node

/**
 * 다날 뉴스 모니터링 시스템 헬스체크 스크립트
 * 
 * 용도:
 * - 시스템 상태 자동 점검
 * - 이상 상황 감지 및 알림
 * - 자동 복구 시도
 * - 성능 메트릭 수집
 */

const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

class HealthChecker {
    constructor() {
        this.config = {
            processName: 'danal-news',
            maxMemoryMB: 500,
            maxCpuPercent: 80,
            logDir: './logs',
            stateFile: './monitoring_state_final.json',
            alertThresholds: {
                memoryWarning: 400,
                memoryCritical: 500,
                cpuWarning: 60,
                cpuCritical: 80,
                uptimeMinimum: 60 // 최소 가동시간 (초)
            }
        };
        
        this.metrics = {
            timestamp: new Date().toISOString(),
            status: 'unknown',
            memory: 0,
            cpu: 0,
            uptime: 0,
            errors: [],
            warnings: []
        };
    }

    async checkProcessStatus() {
        try {
            const { stdout } = await execAsync('pm2 jlist');
            const processes = JSON.parse(stdout);
            const danialProcess = processes.find(p => p.name === this.config.processName);
            
            if (!danialProcess) {
                this.metrics.status = 'not_running';
                this.metrics.errors.push('프로세스가 실행되지 않음');
                return false;
            }

            const monit = danialProcess.monit;
            this.metrics.memory = Math.round(monit.memory / 1024 / 1024); // MB
            this.metrics.cpu = monit.cpu;
            this.metrics.uptime = Math.round((Date.now() - danialProcess.pm2_env.pm_uptime) / 1000);
            this.metrics.restarts = danialProcess.pm2_env.restart_time;
            this.metrics.status = danialProcess.pm2_env.status;

            return true;
        } catch (error) {
            this.metrics.errors.push(`프로세스 상태 확인 실패: ${error.message}`);
            return false;
        }
    }

    checkMemoryUsage() {
        const { memoryWarning, memoryCritical } = this.config.alertThresholds;
        
        if (this.metrics.memory >= memoryCritical) {
            this.metrics.errors.push(`메모리 사용량 임계 초과: ${this.metrics.memory}MB (임계값: ${memoryCritical}MB)`);
            return 'critical';
        } else if (this.metrics.memory >= memoryWarning) {
            this.metrics.warnings.push(`메모리 사용량 경고: ${this.metrics.memory}MB (경고값: ${memoryWarning}MB)`);
            return 'warning';
        }
        
        return 'ok';
    }

    checkCpuUsage() {
        const { cpuWarning, cpuCritical } = this.config.alertThresholds;
        
        if (this.metrics.cpu >= cpuCritical) {
            this.metrics.errors.push(`CPU 사용량 임계 초과: ${this.metrics.cpu}% (임계값: ${cpuCritical}%)`);
            return 'critical';
        } else if (this.metrics.cpu >= cpuWarning) {
            this.metrics.warnings.push(`CPU 사용량 경고: ${this.metrics.cpu}% (경고값: ${cpuWarning}%)`);
            return 'warning';
        }
        
        return 'ok';
    }

    checkUptime() {
        const { uptimeMinimum } = this.config.alertThresholds;
        
        if (this.metrics.uptime < uptimeMinimum) {
            this.metrics.warnings.push(`가동시간이 짧음: ${this.metrics.uptime}초 (최소: ${uptimeMinimum}초)`);
            return 'warning';
        }
        
        return 'ok';
    }

    async checkLogFiles() {
        const logFiles = ['error.log', 'crash.log', 'combined.log'];
        let hasRecentErrors = false;
        
        for (const logFile of logFiles) {
            const logPath = `${this.config.logDir}/${logFile}`;
            
            try {
                if (!fs.existsSync(logPath)) continue;
                
                const stats = fs.statSync(logPath);
                const fileAgeMins = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
                
                // 최근 5분 내에 수정된 에러 로그가 있는지 확인
                if (logFile.includes('error') && fileAgeMins < 5) {
                    hasRecentErrors = true;
                    this.metrics.warnings.push(`최근 에러 로그 발견: ${logFile} (${Math.round(fileAgeMins)}분 전)`);
                }
                
                // 로그 파일 크기 확인
                const fileSizeMB = stats.size / 1024 / 1024;
                if (fileSizeMB > 100) { // 100MB 초과
                    this.metrics.warnings.push(`로그 파일 크기 큼: ${logFile} (${Math.round(fileSizeMB)}MB)`);
                }
                
            } catch (error) {
                this.metrics.warnings.push(`로그 파일 확인 실패: ${logFile} - ${error.message}`);
            }
        }
        
        return !hasRecentErrors;
    }

    async checkStateFile() {
        try {
            if (!fs.existsSync(this.config.stateFile)) {
                this.metrics.warnings.push('상태 파일이 존재하지 않음');
                return false;
            }
            
            const stats = fs.statSync(this.config.stateFile);
            const fileAgeMins = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
            
            // 상태 파일이 10분 이상 업데이트되지 않았다면 경고
            if (fileAgeMins > 10) {
                this.metrics.warnings.push(`상태 파일이 오래됨: ${Math.round(fileAgeMins)}분 전 업데이트`);
                return false;
            }
            
            return true;
        } catch (error) {
            this.metrics.errors.push(`상태 파일 확인 실패: ${error.message}`);
            return false;
        }
    }

    async attemptRecovery() {
        console.log('🔧 자동 복구 시도 중...');
        
        try {
            // 1. 메모리 문제인 경우 재시작
            if (this.metrics.memory >= this.config.alertThresholds.memoryCritical) {
                console.log('💾 메모리 임계 초과로 인한 재시작...');
                await execAsync(`pm2 restart ${this.config.processName}`);
                console.log('✅ 재시작 완료');
                return true;
            }
            
            // 2. 프로세스가 중지된 경우 시작
            if (this.metrics.status === 'not_running') {
                console.log('🚀 프로세스 시작...');
                await execAsync(`pm2 start ecosystem.config.js`);
                console.log('✅ 프로세스 시작 완료');
                return true;
            }
            
            // 3. 프로세스가 중단된 경우 재시작
            if (this.metrics.status === 'stopped' || this.metrics.status === 'errored') {
                console.log('🔄 프로세스 재시작...');
                await execAsync(`pm2 restart ${this.config.processName}`);
                console.log('✅ 재시작 완료');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`❌ 자동 복구 실패: ${error.message}`);
            this.metrics.errors.push(`자동 복구 실패: ${error.message}`);
            return false;
        }
    }

    generateReport() {
        const report = {
            ...this.metrics,
            overallStatus: this.getOverallStatus(),
            recommendations: this.getRecommendations()
        };
        
        return report;
    }

    getOverallStatus() {
        if (this.metrics.errors.length > 0) return 'critical';
        if (this.metrics.warnings.length > 0) return 'warning';
        if (this.metrics.status === 'online') return 'healthy';
        return 'unknown';
    }

    getRecommendations() {
        const recommendations = [];
        
        if (this.metrics.memory >= this.config.alertThresholds.memoryWarning) {
            recommendations.push('메모리 사용량 모니터링 강화 필요');
        }
        
        if (this.metrics.cpu >= this.config.alertThresholds.cpuWarning) {
            recommendations.push('CPU 사용량 최적화 필요');
        }
        
        if (this.metrics.restarts > 5) {
            recommendations.push('빈번한 재시작 원인 조사 필요');
        }
        
        return recommendations;
    }

    async run(options = {}) {
        console.log('🏥 다날 뉴스 모니터링 헬스체크 시작...');
        console.log('=' .repeat(50));
        
        // 1. 프로세스 상태 확인
        const processOk = await this.checkProcessStatus();
        
        if (processOk) {
            // 2. 리소스 사용량 확인
            const memoryStatus = this.checkMemoryUsage();
            const cpuStatus = this.checkCpuUsage();
            const uptimeStatus = this.checkUptime();
            
            // 3. 로그 파일 확인
            await this.checkLogFiles();
            
            // 4. 상태 파일 확인
            await this.checkStateFile();
        }
        
        // 5. 리포트 생성
        const report = this.generateReport();
        
        // 6. 결과 출력
        this.printReport(report);
        
        // 7. 자동 복구 시도 (옵션)
        if (options.autoRecover && report.overallStatus === 'critical') {
            const recovered = await this.attemptRecovery();
            if (recovered) {
                console.log('✅ 자동 복구 성공');
            }
        }
        
        // 8. 리포트 저장
        this.saveReport(report);
        
        return report;
    }

    printReport(report) {
        console.log('\n📊 헬스체크 결과:');
        console.log('-' .repeat(30));
        
        const statusEmoji = {
            'healthy': '✅',
            'warning': '⚠️',
            'critical': '🚨',
            'unknown': '❓'
        };
        
        console.log(`전체 상태: ${statusEmoji[report.overallStatus]} ${report.overallStatus.toUpperCase()}`);
        console.log(`프로세스 상태: ${report.status}`);
        console.log(`메모리 사용량: ${report.memory}MB`);
        console.log(`CPU 사용량: ${report.cpu}%`);
        console.log(`가동시간: ${Math.floor(report.uptime / 3600)}시간 ${Math.floor((report.uptime % 3600) / 60)}분`);
        console.log(`재시작 횟수: ${report.restarts || 0}회`);
        
        if (report.errors.length > 0) {
            console.log('\n🚨 에러:');
            report.errors.forEach(error => console.log(`  - ${error}`));
        }
        
        if (report.warnings.length > 0) {
            console.log('\n⚠️ 경고:');
            report.warnings.forEach(warning => console.log(`  - ${warning}`));
        }
        
        if (report.recommendations.length > 0) {
            console.log('\n💡 권장사항:');
            report.recommendations.forEach(rec => console.log(`  - ${rec}`));
        }
        
        console.log('\n' + '=' .repeat(50));
    }

    saveReport(report) {
        try {
            const reportsDir = './health-reports';
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir);
            }
            
            const filename = `${reportsDir}/health-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            fs.writeFileSync(filename, JSON.stringify(report, null, 2));
            
            // 오래된 리포트 정리 (7일 이상)
            const files = fs.readdirSync(reportsDir);
            files.forEach(file => {
                const filePath = `${reportsDir}/${file}`;
                const stats = fs.statSync(filePath);
                const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                
                if (ageInDays > 7) {
                    fs.unlinkSync(filePath);
                }
            });
            
        } catch (error) {
            console.error(`❌ 리포트 저장 실패: ${error.message}`);
        }
    }
}

// CLI 실행
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        autoRecover: args.includes('--auto-recover') || args.includes('-r'),
        verbose: args.includes('--verbose') || args.includes('-v')
    };
    
    const checker = new HealthChecker();
    
    checker.run(options)
        .then(report => {
            const exitCode = report.overallStatus === 'critical' ? 1 : 0;
            process.exit(exitCode);
        })
        .catch(error => {
            console.error('❌ 헬스체크 실행 실패:', error);
            process.exit(1);
        });
}

module.exports = HealthChecker;