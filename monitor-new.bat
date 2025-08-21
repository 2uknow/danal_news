@echo off
setlocal enabledelayedexpansion

:menu
cls
echo ========================================
echo    다날 뉴스 모니터링 시스템 관리
echo ========================================
echo.
echo [1] 시작하기
echo [2] 상태 확인
echo [3] 로그 보기
echo [4] 에러 로그
echo [5] 재시작
echo [6] 중지
echo [7] 완전 제거
echo [8] 메모리 확인
echo [9] 모니터링
echo [0] 종료
echo.

set /p "choice=선택하세요 (0-9): "

if "!choice!"=="1" goto start
if "!choice!"=="2" goto status
if "!choice!"=="3" goto logs
if "!choice!"=="4" goto error_logs
if "!choice!"=="5" goto restart
if "!choice!"=="6" goto stop
if "!choice!"=="7" goto delete
if "!choice!"=="8" goto memory
if "!choice!"=="9" goto monitor
if "!choice!"=="0" goto exit

echo 잘못된 선택입니다.
pause
goto menu

:start
echo PM2로 시작 중...
pm2 start ecosystem.config.js
pause
goto menu

:status
pm2 list
pause
goto menu

:logs
pm2 logs danal-news
goto menu

:error_logs
pm2 logs danal-news --err
pause
goto menu

:restart
pm2 restart danal-news
pause
goto menu

:stop
pm2 stop danal-news
pause
goto menu

:delete
pm2 delete danal-news
pause
goto menu

:memory
pm2 monit
goto menu

:monitor
pm2 monit
goto menu

:exit
echo 종료합니다.
pause
exit