@echo off
setlocal enabledelayedexpansion

echo Starting debug test...
echo.

echo Step 1: Basic echo test
echo This is working
echo.

echo Step 2: PM2 version test
echo About to run pm2 --version
pm2 --version
echo PM2 version completed
echo.

echo Step 3: File existence test
if exist "ecosystem.config.js" (
    echo ecosystem.config.js found
) else (
    echo ecosystem.config.js NOT found
)

if exist "app.js" (
    echo app.js found
) else (
    echo app.js NOT found
)
echo.

echo Step 4: Simple PM2 test
echo About to run pm2 list
pm2 list
echo PM2 list completed
echo.

echo Debug test completed.
pause