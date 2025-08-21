@echo off
echo ======== Node.js Process Cleanup ========
echo.

echo Current Node.js processes:
tasklist | findstr node
echo.

echo Stopping all PM2 processes...
pm2 stop all 2>nul
pm2 delete all 2>nul
pm2 kill 2>nul
echo.

echo Killing remaining Node.js processes...
echo WARNING: This will stop ALL Node.js processes on your system!
set /p "confirm=Continue? (y/n): "
if /i "%confirm%" == "y" (
    taskkill /f /im node.exe 2>nul
    echo All Node.js processes stopped.
) else (
    echo Skipped killing Node.js processes.
)
echo.

echo After cleanup:
tasklist | findstr node
echo.

echo PM2 status after cleanup:
pm2 list
echo.

echo Cleanup completed.
pause