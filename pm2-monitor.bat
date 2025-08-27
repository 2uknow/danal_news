@echo off
title PM2 Danal News Monitor
echo ========================================
echo   PM2 Danal News 모니터링 도구
echo ========================================
echo.

:menu
echo [1] PM2 상태 확인
echo [2] 메모리 사용량 확인
echo [3] 최근 재시작 이력
echo [4] 실시간 로그 보기
echo [5] 에러 로그만 보기
echo [6] 프로세스 재시작
echo [7] 자동 재시작 (메모리 부족시)
echo [8] 종료
echo.
set /p choice="선택하세요 (1-8): "

if "%choice%"=="1" goto status
if "%choice%"=="2" goto memory
if "%choice%"=="3" goto restarts
if "%choice%"=="4" goto logs
if "%choice%"=="5" goto errors
if "%choice%"=="6" goto restart
if "%choice%"=="7" goto auto_restart
if "%choice%"=="8" goto exit

:status
echo.
echo === PM2 상태 ===
pm2 list
echo.
pause
goto menu

:memory
echo.
echo === 메모리 사용량 ===
pm2 show danal-news | findstr "Used Heap\|Heap Usage\|Memory"
echo.
pause
goto menu

:restarts
echo.
echo === 재시작 이력 ===
pm2 show danal-news | findstr "restarts\|uptime\|created"
echo.
pause
goto menu

:logs
echo.
echo === 실시간 로그 (Ctrl+C로 중지) ===
pm2 logs danal-news --lines 20
pause
goto menu

:errors
echo.
echo === 에러 로그 (최근 50줄) ===
pm2 logs danal-news --err --lines 50
echo.
pause
goto menu

:restart
echo.
echo === 프로세스 재시작 ===
pm2 restart danal-news
echo 재시작 완료!
echo.
pause
goto menu

:auto_restart
echo.
echo === 메모리 사용량 체크 후 자동 재시작 ===
for /f "tokens=*" %%i in ('pm2 show danal-news ^| findstr "Heap Usage"') do (
    echo %%i
    echo %%i | findstr "9[0-9]\." > nul
    if not errorlevel 1 (
        echo 메모리 사용량이 90%% 이상입니다. 재시작합니다...
        pm2 restart danal-news
        echo 재시작 완료!
    ) else (
        echo 메모리 사용량이 정상 범위입니다.
    )
)
echo.
pause
goto menu

:exit
echo 모니터링 도구를 종료합니다.
exit