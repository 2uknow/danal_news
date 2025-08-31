@echo off
chcp 65001 >nul
echo ========================================
echo    다날 뉴스 모니터링 시스템 설정
echo ========================================
echo.

echo 📦 설정 중...

REM 1. 필요한 디렉토리 생성
echo 📁 디렉토리 생성 중...
if not exist "logs" mkdir logs
if not exist "health-reports" mkdir "health-reports"
echo ✅ 디렉토리 생성 완료

REM 2. Node.js 및 npm 버전 확인
echo.
echo 🔍 시스템 요구사항 확인 중...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js가 설치되지 않았습니다.
    echo    https://nodejs.org에서 Node.js를 설치해주세요.
    pause
    exit /b 1
)

npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm이 설치되지 않았습니다.
    pause
    exit /b 1
)

echo ✅ Node.js 버전: 
node --version
echo ✅ npm 버전:
npm --version

REM 3. 패키지 설치 확인
echo.
echo 📦 패키지 설치 확인 중...
if not exist "node_modules" (
    echo 📥 패키지 설치 중...
    npm install
    if errorlevel 1 (
        echo ❌ 패키지 설치 실패!
        pause
        exit /b 1
    )
    echo ✅ 패키지 설치 완료
) else (
    echo ✅ 패키지가 이미 설치되어 있습니다.
)

REM 4. PM2 설치
echo.
echo 🔧 PM2 설치 확인 중...
pm2 --version >nul 2>&1
if errorlevel 1 (
    echo 📥 PM2 설치 중...
    npm install -g pm2
    if errorlevel 1 (
        echo ❌ PM2 설치 실패! 관리자 권한으로 다시 시도해주세요.
        echo    또는 수동으로 'npm install -g pm2'를 실행해주세요.
        pause
        exit /b 1
    )
    echo ✅ PM2 설치 완료
) else (
    echo ✅ PM2가 이미 설치되어 있습니다.
    pm2 --version
)

REM 5. 설정 파일 확인
echo.
echo 📋 설정 파일 확인 중...
if not exist "ecosystem.config.js" (
    echo ❌ ecosystem.config.js 파일이 없습니다!
    echo    다시 프로젝트를 설정해주세요.
    pause
    exit /b 1
)
echo ✅ ecosystem.config.js 존재

if not exist "logger.js" (
    echo ❌ logger.js 파일이 없습니다!
    echo    다시 프로젝트를 설정해주세요.
    pause
    exit /b 1
)
echo ✅ logger.js 존재

if not exist "health-check.js" (
    echo ❌ health-check.js 파일이 없습니다!
    echo    다시 프로젝트를 설정해주세요.
    pause
    exit /b 1
)
echo ✅ health-check.js 존재

REM 6. 윈도우 작업 스케줄러 등록 (헬스체크)
echo.
echo ⏰ 자동 헬스체크 스케줄 등록...
set TASK_NAME="Danal News Health Check"
set SCRIPT_PATH="%CD%\health-check.js"

schtasks /query /tn %TASK_NAME% >nul 2>&1
if errorlevel 1 (
    echo 📅 작업 스케줄러에 헬스체크 등록 중...
    schtasks /create /tn %TASK_NAME% /tr "node %SCRIPT_PATH% --auto-recover" /sc minute /mo 5 /ru SYSTEM >nul 2>&1
    if errorlevel 1 (
        echo ⚠️ 작업 스케줄러 등록 실패 (권한 부족일 수 있음)
        echo    수동으로 헬스체크를 실행할 수 있습니다: node health-check.js
    ) else (
        echo ✅ 5분마다 자동 헬스체크가 설정되었습니다.
    )
) else (
    echo ✅ 헬스체크 작업이 이미 등록되어 있습니다.
)

REM 7. 바탕화면 바로가기 생성
echo.
echo 🖥️ 바탕화면 바로가기 생성...
set DESKTOP=%USERPROFILE%\Desktop
set SHORTCUT_NAME="다날 뉴스 모니터"

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\CreateShortcut.vbs"
echo sLinkFile = "%DESKTOP%\%SHORTCUT_NAME%.lnk" >> "%TEMP%\CreateShortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\CreateShortcut.vbs"
echo oLink.TargetPath = "%CD%\monitor.bat" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.WorkingDirectory = "%CD%" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Description = "다날 뉴스 모니터링 시스템 관리" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Save >> "%TEMP%\CreateShortcut.vbs"

cscript //nologo "%TEMP%\CreateShortcut.vbs" >nul 2>&1
del "%TEMP%\CreateShortcut.vbs" >nul 2>&1

if exist "%DESKTOP%\%SHORTCUT_NAME%.lnk" (
    echo ✅ 바탕화면에 바로가기가 생성되었습니다.
) else (
    echo ⚠️ 바탕화면 바로가기 생성 실패
)

REM 8. 초기 테스트
echo.
echo 🧪 초기 테스트 실행...
node health-check.js
if errorlevel 1 (
    echo ⚠️ 헬스체크에서 문제가 발견되었습니다.
    echo    시스템을 시작하기 전에 문제를 해결해주세요.
) else (
    echo ✅ 헬스체크 통과
)

echo.
echo ========================================
echo          설정 완료!
echo ========================================
echo.
echo 💡 사용 방법:
echo   1. monitor.bat 실행 (또는 바탕화면 바로가기 사용)
echo   2. 메뉴에서 원하는 작업 선택
echo   3. 로그는 logs/ 폴더에서 확인
echo.
echo 🚀 지금 시작하시겠습니까? (y/n)
set /p start_now="답변: "
if /i "%start_now%"=="y" (
    echo.
    echo 🎉 다날 뉴스 모니터링 시스템을 시작합니다!
    call monitor.bat
) else (
    echo.
    echo 📋 나중에 monitor.bat을 실행하여 시작하세요.
    echo    또는 바탕화면의 '%SHORTCUT_NAME%' 바로가기를 사용하세요.
)

echo.
pause