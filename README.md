# 🚀 다날 뉴스 모니터링 시스템

완전 자동화된 암호화폐/주식 가격 모니터링 및 뉴스 알림 시스템  
PM2 기반 안정적인 백그라운드 실행 지원

## ✨ 주요 기능

### 📊 자산 가격 모니터링
- **완전 자동화**: 자산 추가 시 자동 검색 및 알림
- **다중 자산 지원**: 암호화폐(crypto) + 주식(stock) 동시 모니터링
- **스마트 가격 파싱**: 자산 타입과 거래 시간에 따른 자동 선택자 적용
- **시간대별 주식 가격**: 정규장(KRX) vs NXT 시간대 구분
- **실시간 급등락 감지**: 직전 가격 대비 변동률 분석
- **추세 이탈 분석**: 이동평균 기반 추세 분석 (쿨다운 30분)

### 📰 뉴스 모니터링 & 감정분석
- **자산별 순환 검색**: 1분에 하나씩 자산별로 순차 검색
- **다중 선택자 지원**: 2025년 네이버 뉴스 구조 대응
- **고급 감정분석**: 맥락 기반 키워드 분석 (보이스피싱, 사기 등 범죄 맥락 감지)
- **스마트 필터링**: 최근 24시간 이내 + 중복 제거 + 신뢰도 60% 이상
- **키워드 매칭**: 제목에 자산명 포함 여부 검증

### 🎨 Flex Message 지원
- **급등 알림**: 🔴 빨간색 헤더 (상승)
- **급락 알림**: 🔵 파란색 헤더 (하락)  
- **뉴스 알림**: 🟣 보라색 헤더
- **정기 리포트**: 🔵 파란색 헤더

### 🖥️ 이중 프로세스 관리 시스템
- **메인 앱**: PM2를 통한 안정적인 모니터링 실행
- **자동 헬스체크**: 30초 간격 시스템 상태 모니터링
- **GUI 관리 도구**: `monitor.bat`, `pm2-monitor.bat` 등 다양한 관리 스크립트
- **백그라운드 실행**: CMD 창 없이 완전 백그라운드 동작
- **자동 복구**: 메모리 85% 초과시 자동 재시작, 5분 쿨다운
- **로그 모니터링**: 실시간/에러 로그 다양한 옵션으로 확인
- **Windows 서비스**: PM2를 Windows 서비스로 설치 가능
- **CMD 창 숨김**: 백그라운드 실행 시 명령창 표시 안함

## 🛠️ 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 설정

#### 방법 1: config.json 파일 사용 (권장)
```json
{
  "webhookUrl": "https://naverworks.danal.co.kr/message/direct/service/channels/your_channel",
  "testMode": true,
  "description": "네이버웍스 알림 설정 파일"
}
```

#### 방법 2: app.js 파일에서 직접 설정
```javascript
const NAVER_WORKS_HOOK_URL = 'https://naverworks.danal.co.kr/message/direct/service/channels/danal_test';
```

### 3. 실행 방법

#### 🎯 추천: GUI 관리 도구 사용
```cmd
# 메인 GUI 관리 도구
monitor.bat

# PM2 전용 모니터링 도구 (NEW)
pm2-monitor.bat

# 백그라운드 실행 (PM2 대안)
start-background.bat
stop-background.bat

# PM2 문제 해결
fix-pm2-path.bat
```

**메뉴 옵션:**
- `1` - PM2로 시작 (자동 복구 시도)
- `2` - 상태 확인 (프로세스 및 상세 정보)
- `3` - 로그 보기 (5가지 옵션)
- `4` - 에러 로그 (5가지 소스)
- `5` - 재시작 (스마트 프로세스 감지)
- `6` - 중지 (스마트 프로세스 감지)
- `7` - 완전 삭제
- `8` - 메모리 사용량 확인
- `9` - PM2 모니터링 대시보드
- `c` - PM2 안전 정리
- `f` - 프로세스 이름 수정
- `p` - 다른 포트로 시작 (3002, 3003, 8080)
- `s` - PM2를 Windows 서비스로 설치
- `t` - 직접 테스트 실행

#### 일반 실행
```bash
# 직접 실행
node app.js

# PM2로 실행
pm2 start ecosystem.config.js

# 개발 모드
npm run dev
```

## 📋 자산 설정

### 자산 추가 방법
`ASSETS_TO_WATCH` 배열에 새 자산 추가:

```javascript
{
    name: '자산명',                    // 표시될 이름
    query: '자산명 시세',              // 네이버 검색 쿼리
    type: 'crypto' 또는 'stock',       // 자산 타입
    spikeThreshold: 2.0,             // 급등락 임계값 (%)
    trendThreshold: 1.5,             // 추세이탈 임계값 (%)
    enabled: true,                   // 가격 모니터링 활성화
    newsEnabled: true                // 뉴스 검색 활성화
}
```

### 현재 설정된 자산
- **페이코인** (crypto): 급등락 ±0.9%, 추세이탈 ±1.0%
- **다날** (stock): 급등락 ±0.5%, 추세이탈 ±1.0%
- **비트코인** (crypto): 급등락 ±3.0%, 추세이탈 ±2.0%
- **이더리움** (crypto): 급등락 ±3.0%, 추세이탈 ±2.0%
- **리플** (crypto): 급등락 ±3.0%, 추세이탈 ±2.0%

## 🎮 관리 명령어

### 가격 모니터링 제어
```bash
status              # 전체 자산 상태 확인
enable [자산명]      # 가격 모니터링 활성화
disable [자산명]     # 가격 모니터링 비활성화
toggle [자산명]      # 가격 모니터링 상태 전환
```

### 뉴스 검색 제어
```bash
news-enable [자산명]   # 뉴스 검색 활성화
news-disable [자산명]  # 뉴스 검색 비활성화
news-toggle [자산명]   # 뉴스 검색 상태 전환
```

### 기타 명령어
```bash
help               # 전체 도움말
add                # 새 자산 추가 방법 안내
```

## 📊 PM2 설정

### ecosystem.config.js 설정
```javascript
module.exports = {
  apps: [{
    name: 'danal-news',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '500M',
    windowsHide: true,           // Windows에서 CMD 창 숨김
    silent: false,               // 로그는 유지
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    cron_restart: '0 4 * * *'    // 매일 새벽 4시 재시작
  }]
};
```

### 로그 관리
- **실시간 로그**: `pm2 logs danal-news`
- **에러 로그**: `pm2 logs danal-news --err`
- **로그 파일**: `./logs/` 디렉토리
- **로그 정리**: `pm2 flush`

## 🖥️ monitor.bat 사용법

### 기본 사용
1. `monitor.bat` 실행
2. 메뉴에서 원하는 옵션 선택
3. 각 작업 완료 후 자동으로 메뉴로 돌아감

### 로그 보기 옵션 (3번 메뉴)
- **1** - 모든 로그 (실시간)
- **2** - 출력 로그만
- **3** - 에러 로그만  
- **4** - 최근 50줄
- **5** - 최근 100줄

### 에러 로그 옵션 (4번 메뉴)
- **1** - PM2 에러 로그 (50줄)
- **2** - PM2 에러 로그 (100줄)
- **3** - 로컬 error.log 파일
- **4** - 로컬 crash.log 파일
- **5** - 모든 에러 소스 통합

### 고급 기능
- **다른 포트 실행**: 포트 충돌 시 3002, 3003, 8080 포트 사용
- **프로세스 이름 수정**: 잘못된 프로세스 이름 자동 수정
- **Windows 서비스**: 완전한 백그라운드 실행을 위한 서비스 설치

## 📁 파일 구조

```
danal_news/
├── app.js                      # 메인 애플리케이션
├── monitor.bat                 # PM2 관리 GUI 도구
├── ecosystem.config.js         # PM2 설정 파일
├── ecosystem-simple.config.js  # PM2 간단 설정 (백업용)
├── test-news.js               # 뉴스 검색 테스트 스크립트
├── package.json               # 의존성 정보
├── config.json                # 웹훅 설정 파일 (선택사항)
├── logs/                      # 로그 파일 디렉토리
│   ├── combined.log           # 통합 로그
│   ├── out.log                # 출력 로그
│   └── error.log              # 에러 로그
├── monitoring_state_final.json # 상태 저장 파일 (자동 생성)
└── README.md                  # 이 파일
```

## 🔧 기술 스택

- **Node.js** (>=16)
- **PM2**: 프로세스 관리자
- **cheerio**: HTML 파싱
- **node-cron**: 스케줄링
- **node-fetch**: HTTP 요청
- **curl**: 안정적인 웹 요청 (windowsHide 지원)

## 🎯 알림 유형

### 급등락 알림
- 직전 가격 대비 설정 임계값 초과 시
- 단계별 이모지: 🔴(대폭등) → 🟥(폭등) → 📈(급등) → 🔺(상승)
- 하락: 🔵(대폭락) → 🟦(폭락) → 📉(급락) → 🔻(하락)

### 추세이탈 알림
- 이동평균 대비 설정 임계값 초과 시
- 30분 쿨다운으로 재알림 방지

### 뉴스 알림
- 자산별 키워드 매칭된 새 뉴스 발견 시
- 중복 제거 및 시간 필터링 적용

## ⚠️ 주의사항

1. **네이버웍스 웹훅 URL** 설정 필수
2. **Node.js 16 이상** 필요
3. **PM2 전역 설치**: `npm install -g pm2`
4. **curl 명령어** 시스템에 설치되어 있어야 함
5. **방화벽** 설정에서 아웃바운드 HTTPS 허용 필요

## 🚀 운영 권장사항

### 안정적인 운영
1. **PM2 서비스 설치**: `monitor.bat` → `s` 선택
2. **로그 모니터링**: 주기적으로 에러 로그 확인
3. **메모리 관리**: 500MB 초과 시 자동 재시작
4. **정기 재시작**: 매일 새벽 4시 자동 재시작

### 포트 관리
- **기본 포트**: 3000
- **대체 포트**: 3002, 3003, 8080
- **포트 충돌 시**: `monitor.bat` → `p` 선택

### 로그 관리
- **로그 크기**: 자동 로테이션
- **로그 정리**: `pm2 flush` 명령어 사용
- **에러 추적**: 다양한 로그 소스 통합 확인

## 🧪 테스트

### 뉴스 검색 테스트
```bash
node test-news.js
```

### 배치 도구 테스트
```cmd
test-logs-menu.bat  # 로그 메뉴 테스트
```

### PM2 직접 제어
```bash
# 기본 PM2 명령어
pm2 start ecosystem.config.js
pm2 list
pm2 logs danal-news
pm2 restart danal-news
pm2 stop danal-news
pm2 delete danal-news
```

## 🆕 최신 업데이트 (2025-08-28)

### ✨ 새로운 기능
- **🛡️ 자동 헬스체크 시스템**: 30초 간격으로 시스템 상태 모니터링 및 자동 복구
- **🧠 고급 감정분석**: 맥락 기반 뉴스 감정 분석 ("보이스피싱 6배 폭증" → 부정적 인식)
- **🔧 다양한 관리 도구**: PM2 전용 도구, 백그라운드 실행, 문제 해결 스크립트
- **👻 완전 백그라운드 실행**: CMD 창 없는 조용한 백그라운드 동작

### 🗑️ 정리된 파일들
- 중복/실험적 BAT 파일 제거 (setup-monitoring.bat, simple-auto-start.bat 등)
- 프로젝트 구조 최적화 및 관리 도구 통합

## 📞 문제 해결

### 일반적인 문제
1. **프로세스가 시작되지 않음**: `fix-pm2-path.bat` 실행 후 `monitor.bat` 사용
2. **포트 충돌**: `monitor.bat` → `p` (다른 포트 사용)
3. **로그가 안 보임**: `monitor.bat` → `3` → `1` (모든 로그)
4. **CMD 창이 계속 뜸**: 헬스체크 시스템으로 해결됨

### 고급 문제 해결
1. **PM2 권한 문제**: 관리자 권한 CMD에서 `pm2 kill` 후 재시작
2. **메모리 누수**: 자동 헬스체크가 85% 초과시 자동 재시작
3. **완전 백그라운드 실행**: `start-background.bat` 사용
4. **로그 파일 손상**: `pm2 flush` 후 재시작

문제가 지속되면 `monitor.bat`의 테스트 기능을 활용하거나 PM2 공식 문서를 참조하세요.