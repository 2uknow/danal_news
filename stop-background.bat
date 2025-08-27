@echo off
echo 🛑 백그라운드 프로세스 종료 중...

REM Node.js 프로세스 모두 종료
taskkill /f /im node.exe 2>nul

echo ✅ 백그라운드 프로세스 종료 완료
echo 📊 남은 프로세스:
tasklist | findstr node.exe
if errorlevel 1 echo (Node.js 프로세스 없음)

pause