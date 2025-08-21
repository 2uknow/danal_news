module.exports = {
  apps: [{
    name: 'danal-news',
    script: 'app.js',
    cwd: '.',
    
    // 인스턴스 설정
    instances: 1,
    exec_mode: 'fork',
    
    // 자동 재시작 설정
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // 환경 변수
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // 로그 설정
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // 고급 설정
    node_args: '--max-old-space-size=512',
    kill_timeout: 3000,
    listen_timeout: 3000,
    
    // 크론 재시작 (매일 새벽 4시)
    cron_restart: '0 4 * * *',
    
    // 에러 처리
    ignore_watch: ['node_modules', 'logs', '*.log'],
    
    // 성능 모니터링
    pmx: true,
    
    // 추가 옵션
    time: true,
    combine_logs: true,
    
    // CMD 창 숨기기 강화
    windowsHide: true,
    silent: false,  // 로그는 보되 창만 숨김
    detached: false,
    
    // Windows 전용 설정
    windows_verbatim_arguments: true
  }]
};