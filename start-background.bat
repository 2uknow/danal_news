@echo off
echo ⚡ 다날 뉴스 모니터링 백그라운드 시작...

REM 기존 프로세스 정리
taskkill /f /im node.exe 2>nul

REM 메인 앱 백그라운드 실행
start /B /MIN node app.js

REM 헬스체크 백그라운드 실행 (5초 후)
timeout /t 5 /nobreak >nul
start /B /MIN node auto-health-check.js

echo ✅ 백그라운드 실행 완료
echo 📊 프로세스 상태 확인:
tasklist | findstr node.exe
echo.
echo 💡 종료하려면: stop-background.bat 실행
pause