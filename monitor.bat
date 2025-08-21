@echo off
setlocal enabledelayedexpansion

:main
cls
echo ========================================
echo    Danal News Monitoring System
echo ========================================
echo.
echo 1. Start (PM2)
echo 2. Status Check
echo 3. View Logs (Real-time)
echo 4. View Error Logs
echo 5. Restart (smart)
echo 6. Stop (smart)
echo 7. Delete All
echo 8. Memory Check
echo 9. Monitor Dashboard
echo c. Safe PM2 Cleanup Only
echo f. Fix process name (restart with correct name)
echo p. Start on different port
echo s. Install PM2 as Service (admin needed)
echo t. Test app.js (manual)
echo 0. Exit
echo.

set /p "choice=Select option (0-9,c,f,p,s,t): "

if "!choice!" == "1" goto start
if "!choice!" == "2" goto status
if "!choice!" == "3" goto logs
if "!choice!" == "4" goto error_logs
if "!choice!" == "5" goto restart
if "!choice!" == "6" goto stop
if "!choice!" == "7" goto delete
if "!choice!" == "8" goto memory
if "!choice!" == "9" goto monitor
if "!choice!" == "c" goto cleanup
if "!choice!" == "C" goto cleanup
if "!choice!" == "f" goto fix_name
if "!choice!" == "F" goto fix_name
if "!choice!" == "p" goto port_start
if "!choice!" == "P" goto port_start
if "!choice!" == "s" goto service
if "!choice!" == "S" goto service
if "!choice!" == "t" goto test
if "!choice!" == "T" goto test
if "!choice!" == "0" goto exit

echo.
echo Invalid choice. Please enter: 0-9, c (cleanup), f (fix name), p (port), s (service), or t (test).
echo.
pause
goto main

:start
cls
echo.
echo Starting Danal News Monitoring System...
echo.
echo Checking PM2 status...
echo.

echo PM2 version check (if this hangs, PM2 has issues):
timeout /t 1 >nul
pm2 --version
echo.

echo PM2 basic test:
timeout /t 1 >nul  
pm2 list >nul 2>&1
if errorlevel 1 (
    echo WARNING: PM2 may not be working properly
    echo Continuing anyway...
) else (
    echo PM2 is responding
)
echo.

if not exist "ecosystem.config.js" (
    echo ERROR: ecosystem.config.js file not found!
    echo.
    echo Press any key to return to menu...
    pause >nul
    goto main
)

if not exist "app.js" (
    echo ERROR: app.js file not found!
    echo.
    echo Press any key to return to menu...
    pause >nul
    goto main
)

echo All required files found.
echo.

if not exist "logs" (
    echo Creating logs directory...
    mkdir logs
)

echo Stopping existing processes...
pm2 stop danal-news 2>nul
pm2 delete danal-news 2>nul
echo.

echo Starting new process...
echo Method 1: Using ecosystem.config.js
echo Command: pm2 start ecosystem.config.js
echo.
pm2 start ecosystem.config.js
set START_RESULT=%errorlevel%
echo.
echo Exit code: %START_RESULT%
echo.

if %START_RESULT% neq 0 (
    echo Method 1 failed. Trying Method 2: Direct app.js start
    echo Command: pm2 start app.js --name danal-news
    echo.
    pm2 start app.js --name danal-news
    set START_RESULT2=%errorlevel%
    echo.
    echo Method 2 exit code: %START_RESULT2%
    echo.
    
    if %START_RESULT2% neq 0 (
        echo Method 2 failed. Trying Method 3: Simple ecosystem config
        echo Command: pm2 start ecosystem-simple.config.js
        echo.
        pm2 start ecosystem-simple.config.js
        set START_RESULT3=%errorlevel%
        echo.
        echo Method 3 exit code: %START_RESULT3%
        echo.
    )
)

REM Check if any method succeeded
set FINAL_RESULT=1
if %START_RESULT% equ 0 (
    set FINAL_RESULT=0
    echo Method 1 succeeded: ecosystem.config.js
) else if defined START_RESULT2 (
    if %START_RESULT2% equ 0 (
        set FINAL_RESULT=0
        echo Method 2 succeeded: direct app.js
    ) else if defined START_RESULT3 (
        if %START_RESULT3% equ 0 (
            set FINAL_RESULT=0
            echo Method 3 succeeded: simple ecosystem config
        )
    )
)

if %FINAL_RESULT% neq 0 (
    echo Both methods failed!
    echo.
    echo Debugging information:
    echo PM2 version:
    pm2 --version
    echo.
    echo PM2 process list:
    pm2 list
    echo.
    echo Ecosystem config check:
    if exist "ecosystem.config.js" (
        echo ecosystem.config.js exists
        echo First few lines:
        type ecosystem.config.js | head -5
    ) else (
        echo ecosystem.config.js not found!
    )
    echo.
    echo Press any key to return to menu...
    pause >nul
    goto main
)

echo Successfully started!
echo.
echo Current processes:
pm2 list
echo.
echo Process details:
pm2 describe danal-news
echo.
echo Press any key to return to menu...
pause >nul
goto main

:status
cls
echo.
echo ======== Current Status ========
echo.
pm2 list
echo.
echo ======== Detailed Info ========
echo.
pm2 describe danal-news
echo.
echo Press any key to return to menu...
pause >nul
goto main

:logs
cls
echo.
echo ======== Real-time Logs ========
echo.
echo Note: You can check process status with option 2 in main menu
echo.

echo Log viewing options:
echo 1. All logs (recommended)
echo 2. Output logs only
echo 3. Error logs only
echo 4. Last 50 lines
echo 5. Last 100 lines
echo 0. Back to main menu
echo.

set /p "log_choice=Select log option (0-5): "

if "!log_choice!" == "1" goto logs_all
if "!log_choice!" == "2" goto logs_out
if "!log_choice!" == "3" goto logs_err
if "!log_choice!" == "4" goto logs_50
if "!log_choice!" == "5" goto logs_100
if "!log_choice!" == "0" goto main

echo Invalid choice.
echo.
echo Press any key to try again...
pause >nul
goto logs

:logs_all
cls
echo.
echo ======== All Logs (Real-time) ========
echo Press Ctrl+C to stop viewing logs
echo.
pm2 logs 0
echo.
echo Logs stopped. Press any key to return to logs menu...
pause >nul
goto logs

:logs_out
cls
echo.
echo ======== Output Logs Only ========
echo Press Ctrl+C to stop viewing logs
echo.
pm2 logs 0 --out
echo.
echo Logs stopped. Press any key to return to logs menu...
pause >nul
goto logs

:logs_err
cls
echo.
echo ======== Error Logs Only ========
echo Press Ctrl+C to stop viewing logs
echo.
pm2 logs 0 --err
echo.
echo Logs stopped. Press any key to return to logs menu...
pause >nul
goto logs

:logs_50
cls
echo.
echo ======== Last 50 Lines ========
echo.
pm2 logs 0 --lines 50
echo.
echo Press any key to return to logs menu...
pause >nul
goto logs

:logs_100
cls
echo.
echo ======== Last 100 Lines ========
echo.
pm2 logs 0 --lines 100
echo.
echo Press any key to return to logs menu...
pause >nul
goto logs

:error_logs
cls
echo.
echo ======== Error Logs ========
echo.
echo Note: You can check process status with option 2 in main menu
echo.

echo Error log options:
echo 1. PM2 Error logs (last 50 lines)
echo 2. PM2 Error logs (last 100 lines)
echo 3. Local error.log file
echo 4. Local crash.log file
echo 5. All error sources
echo 0. Back to main menu
echo.

set /p "err_choice=Select error log option (0-5): "

if "!err_choice!" == "1" goto err_pm2_50
if "!err_choice!" == "2" goto err_pm2_100
if "!err_choice!" == "3" goto err_local_error
if "!err_choice!" == "4" goto err_local_crash
if "!err_choice!" == "5" goto err_all
if "!err_choice!" == "0" goto main

echo Invalid choice.
echo.
echo Press any key to try again...
pause >nul
goto error_logs

:err_pm2_50
cls
echo.
echo ======== PM2 Error Logs (Last 50 lines) ========
echo.
pm2 logs 0 --err --lines 50
echo.
echo Press any key to return to error logs menu...
pause >nul
goto error_logs

:err_pm2_100
cls
echo.
echo ======== PM2 Error Logs (Last 100 lines) ========
echo.
pm2 logs 0 --err --lines 100
echo.
echo Press any key to return to error logs menu...
pause >nul
goto error_logs

:err_local_error
cls
echo.
echo ======== Local error.log File ========
echo.
if exist "logs\error.log" (
    echo === Latest error.log (last 20 lines) ===
    powershell -Command "Get-Content 'logs\error.log' -Tail 20"
) else (
    echo No error.log file found in logs directory.
)
echo.
echo Press any key to return to error logs menu...
pause >nul
goto error_logs

:err_local_crash
cls
echo.
echo ======== Local crash.log File ========
echo.
if exist "logs\crash.log" (
    echo === Latest crash.log (last 10 lines) ===
    powershell -Command "Get-Content 'logs\crash.log' -Tail 10"
) else (
    echo No crash.log file found in logs directory.
)
echo.
echo Press any key to return to error logs menu...
pause >nul
goto error_logs

:err_all
cls
echo.
echo ======== All Error Sources ========
echo.
echo === PM2 Error Logs (last 20 lines) ===
pm2 logs 0 --err --lines 20
echo.
echo === Local error.log (last 10 lines) ===
if exist "logs\error.log" (
    powershell -Command "Get-Content 'logs\error.log' -Tail 10"
) else (
    echo No error.log file found.
)
echo.
echo === Local crash.log (last 5 lines) ===
if exist "logs\crash.log" (
    powershell -Command "Get-Content 'logs\crash.log' -Tail 5"
) else (
    echo No crash.log file found.
)
echo.
echo Press any key to return to error logs menu...
pause >nul
goto error_logs

:restart
cls
echo.
echo ======== Restarting Service ========
echo.
echo Finding running processes...
pm2 list
echo.

echo Method 1: Restart by process ID (most reliable)
pm2 restart 0 --update-env
echo.

if errorlevel 1 (
    echo Method 1 failed. Trying Method 2: Restart all processes...
    pm2 restart all --update-env
    echo.
    
    if errorlevel 1 (
        echo Method 2 failed! Trying Method 3: Specific names...
        echo.
        pm2 restart danal-news 2>nul
        pm2 restart danal-news-3002 2>nul
        pm2 restart danal-news-3003 2>nul
        pm2 restart danal-news-8080 2>nul
        pm2 restart "danal-news-!APP_PORT!" 2>nul
    )
) else (
    echo Restart completed successfully!
)

echo.
echo Current status after restart:
pm2 list
echo.
echo Press any key to return to menu...
pause >nul
goto main

:stop
cls
echo.
echo ======== Stopping Service ========
echo.
echo Finding running processes...
pm2 list
echo.

echo Method 1: Stop by process ID (most reliable)
pm2 stop 0
echo.

if errorlevel 1 (
    echo Method 1 failed. Trying Method 2: Stop all processes...
    pm2 stop all
    echo.
    
    if errorlevel 1 (
        echo Method 2 failed! Trying Method 3: Specific names...
        echo.
        pm2 stop danal-news 2>nul
        pm2 stop danal-news-3002 2>nul
        pm2 stop danal-news-3003 2>nul
        pm2 stop danal-news-8080 2>nul
        pm2 stop "danal-news-!APP_PORT!" 2>nul
    )
) else (
    echo Stop completed successfully!
)

echo.
echo Current status after stop:
pm2 list
echo.
echo Press any key to return to menu...
pause >nul
goto main

:delete
cls
echo.
echo ======== WARNING ========
echo All processes and logs will be PERMANENTLY removed!
echo.
set /p "confirm=Are you sure? (y/n): "
if /i "!confirm!" == "y" (
    echo.
    echo Removing all processes and logs...
    pm2 stop danal-news 2>nul
    pm2 delete danal-news 2>nul
    pm2 flush 2>nul
    echo.
    echo Removal completed!
    echo.
    echo Current status:
    pm2 list
) else (
    echo.
    echo Operation cancelled.
)
echo.
echo Press any key to return to menu...
pause >nul
goto main

:memory
cls
echo.
echo ======== Memory Usage Check ========
echo.
echo Starting PM2 monitoring (press 'q' to exit)...
echo.
pm2 monit
echo.
echo Monitoring stopped. Press any key to return to menu...
pause >nul
goto main

:monitor
cls
echo.
echo ======== Performance Monitoring Dashboard ========
echo.
echo Starting PM2 dashboard (press 'q' to exit)...
echo.
pm2 monit
echo.
echo Dashboard closed. Press any key to return to menu...
pause >nul
goto main

:cleanup
cls
echo.
echo ======== Safe PM2 Cleanup ========
echo.
echo This will only clean PM2 processes, not other Node.js apps.
echo.

echo Step 1: Current PM2 status
pm2 list
echo.

echo Step 2: Stopping PM2 daemon safely...
pm2 kill
echo.

echo Step 3: Checking common app ports...
echo Port 3000 (default):
netstat -ano | findstr :3000 | findstr LISTENING
echo Port 3002:
netstat -ano | findstr :3002 | findstr LISTENING  
echo Port 3003:
netstat -ano | findstr :3003 | findstr LISTENING
echo Port 8080:
netstat -ano | findstr :8080 | findstr LISTENING
echo.

echo Step 4: Restarting PM2 daemon...
pm2 ping
echo.

echo Step 5: Final PM2 status
pm2 list
echo.

echo Safe cleanup completed!
echo.
echo If any port is still in use by another process, 
echo you can either:
echo   - Stop that process manually
echo   - Change the port in config.json
echo   - Use 'p' option to start on different port (3002, 3003, 8080)
echo.
echo Press any key to return to menu...
pause >nul
goto main

:port_start
cls
echo.
echo ======== Start on Different Port ========
echo.
echo Current port usage check:
netstat -ano | findstr :3000 | findstr LISTENING
netstat -ano | findstr :3002 | findstr LISTENING
netstat -ano | findstr :3003 | findstr LISTENING
netstat -ano | findstr :8080 | findstr LISTENING
echo.

echo Available options:
echo 1. Port 3002 (recommended)
echo 2. Port 3003
echo 3. Port 8080
echo 4. Custom port
echo.

set /p "port_choice=Select port option (1-4): "

if "!port_choice!" == "1" (
    set APP_PORT=3002
) else if "!port_choice!" == "2" (
    set APP_PORT=3003
) else if "!port_choice!" == "3" (
    set APP_PORT=8080
) else if "!port_choice!" == "4" (
    set /p "APP_PORT=Enter custom port number: "
) else (
    echo Invalid choice.
    echo.
    echo Press any key to return to menu...
    pause >nul
    goto main
)

echo.
echo Starting app on port !APP_PORT!...
echo.

echo Checking if port !APP_PORT! is available...
netstat -ano | findstr :!APP_PORT! | findstr LISTENING
if errorlevel 1 (
    echo Port !APP_PORT! is available.
) else (
    echo WARNING: Port !APP_PORT! is already in use!
    set /p "continue=Continue anyway? (y/n): "
    if /i "!continue!" neq "y" (
        echo Cancelled.
        echo.
        echo Press any key to return to menu...
        pause >nul
        goto main
    )
)

echo.
echo Method 1: PM2 with custom port
set PORT=!APP_PORT!
pm2 start app.js --name "danal-news-!APP_PORT!" -- --port=!APP_PORT!
echo.

if errorlevel 1 (
    echo PM2 start failed. Trying direct Node.js...
    echo Method 2: Direct Node.js start
    set PORT=!APP_PORT!
    echo Starting: PORT=!APP_PORT! node app.js
    echo Press Ctrl+C to stop
    echo.
    cmd /c "set PORT=!APP_PORT! && node app.js"
) else (
    echo Successfully started on port !APP_PORT!!
    echo.
    pm2 list
)

echo.
echo Press any key to return to menu...
pause >nul
goto main

:fix_name
cls
echo.
echo ======== Fix Process Name ========
echo.
echo This will stop the current process with wrong name
echo and restart it with the correct name 'danal-news'
echo.

echo Current processes:
pm2 list
echo.

echo Step 1: Stopping current process...
pm2 stop 0 2>nul
pm2 delete 0 2>nul
echo.

echo Step 2: Starting with correct name...
pm2 start app.js --name danal-news
echo.

if errorlevel 1 (
    echo Failed to start with correct name. Trying ecosystem config...
    pm2 start ecosystem.config.js
)

echo.
echo Process name fix completed!
echo.
echo New status:
pm2 list
echo.
echo Now logs should work with 'danal-news' name.
echo.
echo Press any key to return to menu...
pause >nul
goto main

:service
cls
echo.
echo ======== Install PM2 as Windows Service ========
echo.
echo This will install PM2 as a Windows Service to run in background
echo without showing any command windows.
echo.
echo IMPORTANT: This requires Administrator privileges!
echo.

echo Checking current user privileges...
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: Administrator privileges required!
    echo.
    echo Please:
    echo 1. Right-click Command Prompt
    echo 2. Select "Run as administrator"
    echo 3. Run this script again and select 's'
    echo.
    echo Press any key to return to menu...
    pause >nul
    goto main
)

echo Administrator privileges confirmed.
echo.

echo Step 1: Installing pm2-windows-service...
npm install -g pm2-windows-service
echo.

echo Step 2: Setting up PM2 service...
pm2-service-install -n "DanalNewsService"
echo.

echo Step 3: Starting service...
net start "DanalNewsService"
echo.

echo Service installation completed!
echo.
echo Now PM2 will run as a Windows Service in the background.
echo No command windows will appear during operation.
echo.
echo The service will automatically start when Windows boots.
echo.
echo Press any key to return to menu...
pause >nul
goto main

:test
cls
echo.
echo ======== Testing app.js manually ========
echo.
echo This will run the app directly with Node.js
echo Press Ctrl+C to stop the test
echo.
echo Checking Node.js version:
node --version
echo.
echo Checking if package.json exists:
if exist "package.json" (
    echo package.json found
) else (
    echo WARNING: package.json not found!
)
echo.
echo Checking node_modules:
if exist "node_modules" (
    echo node_modules directory found
) else (
    echo WARNING: node_modules not found! Run 'npm install' first
)
echo.
echo Starting app.js directly:
echo.
node app.js
echo.
echo App stopped. Press any key to return to menu...
pause >nul
goto main

:exit
cls
echo.
echo Exiting monitoring tool.
echo.
echo Useful commands:
echo   pm2 logs danal-news       - Real-time logs
echo   pm2 monit                 - Monitor dashboard
echo   pm2 restart danal-news    - Restart
echo   pm2 stop danal-news       - Stop
echo.
pause
exit /b 0