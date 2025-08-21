# 다날 뉴스 모니터링 시스템 안정성 개선 가이드

## 🚀 개선된 기능

### 1. PM2 프로세스 관리
- **자동 재시작**: 크래시 시 즉시 재시작
- **메모리 제한**: 500MB 초과 시 자동 재시작
- **로그 관리**: 구조화된 로그 파일 저장
- **성능 모니터링**: CPU, 메모리 사용량 추적

### 2. 강화된 에러 핸들링
- **uncaughtException**: 예상치 못한 에러 처리
- **unhandledRejection**: Promise 거부 처리
- **SIGINT/SIGTERM**: 안전한 종료 처리
- **메모리 모니터링**: 자동 가비지 컬렉션

### 3. 고급 로깅 시스템
- **Winston**: 구조화된 로그 기록
- **로그 레벨**: error, warn, info, debug
- **로그 회전**: 크기별 자동 분할
- **크래시 리포트**: 상세한 에러 추적

### 4. 메모리 누수 방지
- **HTTP Agent 최적화**: 연결 제한 및 타임아웃
- **파일 크기 제한**: 10MB 제한으로 메모리 보호
- **상태 파일 관리**: 자동 백업 및 정리
- **재시도 로직**: 지수 백오프로 네트워크 안정성

## 📁 파일 구조

```
danal_news/
├── app.js                    # 메인 애플리케이션 (개선됨)
├── ecosystem.config.js       # PM2 설정 파일
├── logger.js                 # Winston 로거 설정
├── health-check.js           # 헬스체크 스크립트
├── monitor.bat               # 모니터링 관리 도구
├── setup-monitoring.bat      # 자동 설정 스크립트
├── start.bat                 # 간단 시작 스크립트
├── logs/                     # 로그 디렉토리
│   ├── combined.log          # 전체 로그
│   ├── error.log             # 에러 로그
│   ├── crash.log             # 크래시 로그
│   └── exceptions.log        # 예외 로그
└── health-reports/           # 헬스체크 리포트
```

## 🛠️ 설치 및 설정

### 1. 자동 설정 (권장)
```bash
# 프로젝트 디렉토리에서 실행
setup-monitoring.bat
```

### 2. 수동 설정
```bash
# 1. PM2 설치
npm install -g pm2

# 2. 의존성 설치
npm install winston

# 3. 디렉토리 생성
mkdir logs health-reports

# 4. 시작
pm2 start ecosystem.config.js
```

## 🎮 사용 방법

### 1. 모니터링 도구 사용
```bash
# 통합 관리 도구 실행
monitor.bat

# 메뉴 옵션:
# [1] 시작하기 (PM2로 실행)
# [2] 상태 확인
# [3] 로그 보기 (실시간)
# [4] 로그 보기 (에러만)
# [5] 재시작
# [6] 중지
# [7] 완전 제거
# [8] 메모리 사용량 확인
# [9] 성능 모니터링 대시보드
```

### 2. 직접 PM2 명령어
```bash
# 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 list
pm2 describe danal-news

# 로그 보기
pm2 logs danal-news
pm2 logs danal-news --err  # 에러만

# 성능 모니터링
pm2 monit

# 재시작
pm2 restart danal-news

# 중지
pm2 stop danal-news

# 완전 제거
pm2 delete danal-news
```

### 3. 헬스체크
```bash
# 수동 헬스체크
node health-check.js

# 자동 복구 포함
node health-check.js --auto-recover

# 상세 출력
node health-check.js --verbose
```

## 📊 모니터링 지표

### 시스템 메트릭
- **메모리 사용량**: 400MB 경고, 500MB 임계
- **CPU 사용량**: 60% 경고, 80% 임계
- **가동시간**: 최소 60초
- **재시작 횟수**: 추적 및 분석

### 로그 분석
- **에러 로그**: 최근 발생한 오류 추적
- **크래시 로그**: 시스템 중단 원인 분석
- **성능 로그**: 응답 시간 및 처리량 측정

### 자동 알림
- **메모리 임계 초과**: 자동 재시작
- **프로세스 중지**: 자동 시작
- **연속 실패**: 관리자 알림

## 🔧 문제 해결

### 자주 발생하는 문제

#### 1. 메모리 부족
```bash
# 현재 메모리 사용량 확인
pm2 monit

# 강제 재시작
pm2 restart danal-news

# 로그 확인
pm2 logs danal-news | grep "메모리"
```

#### 2. 네트워크 에러
```bash
# 에러 로그 확인
cat logs/error.log | tail -50

# 네트워크 상태 확인
ping naver.com
curl -I https://search.naver.com
```

#### 3. 프로세스 자주 재시작
```bash
# 재시작 원인 분석
pm2 describe danal-news

# 크래시 로그 확인
cat logs/crash.log | tail -20

# 시스템 리소스 확인
wmic OS get TotalVisibleMemorySize,FreePhysicalMemory
```

### 디버깅 도구

#### 로그 레벨 조정
```javascript
// logger.js에서 수정
logger.level = 'debug';  // 더 상세한 로그
```

#### 메모리 프로파일링
```bash
# Node.js 가비지 컬렉션 로그 활성화
pm2 start ecosystem.config.js --node-args="--expose-gc --trace-gc"
```

#### 성능 추적
```bash
# PM2 모니터링
pm2 install pm2-server-monit

# 웹 인터페이스
pm2 web
```

## 🔄 업그레이드 가이드

### 기존 설치에서 업그레이드
```bash
# 1. 현재 프로세스 중지
pm2 stop danal-news

# 2. 백업 생성
copy app.js app.js.backup

# 3. 새 파일들 복사
# (ecosystem.config.js, logger.js, health-check.js 등)

# 4. 새로운 의존성 설치
npm install winston

# 5. 새 설정으로 시작
pm2 start ecosystem.config.js
```

### 롤백 방법
```bash
# 1. 문제가 있는 프로세스 중지
pm2 stop danal-news
pm2 delete danal-news

# 2. 백업 파일 복원
copy app.js.backup app.js

# 3. 기본 방식으로 시작
node app.js
```

## 📈 성능 최적화

### 권장 설정
- **PM2 인스턴스**: 1개 (단일 프로세스)
- **메모리 제한**: 500MB
- **CPU 사용률**: 80% 미만
- **로그 회전**: 자동 (20MB/파일)

### 모니터링 주기
- **헬스체크**: 5분마다 자동
- **메모리 체크**: 1분마다
- **로그 정리**: 일주일마다

### 알림 설정
- **임계 상황**: 즉시 알림
- **경고 상황**: 5분 지연 후 알림
- **복구 완료**: 확인 알림

## 🆘 지원 및 문의

### 로그 수집
문제 발생 시 다음 정보를 수집해주세요:

```bash
# 시스템 정보
pm2 describe danal-news > system-info.txt
pm2 logs danal-news --lines 100 > recent-logs.txt

# 헬스체크 리포트
node health-check.js > health-report.txt

# 시스템 리소스
wmic OS get TotalVisibleMemorySize,FreePhysicalMemory > memory-info.txt
```

### 응급 복구
```bash
# 완전 재시작
pm2 kill
pm2 start ecosystem.config.js

# 수동 실행 (테스트용)
node app.js
```

이제 시스템이 훨씬 안정적으로 운영될 것입니다! 🎉