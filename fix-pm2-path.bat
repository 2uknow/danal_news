@echo off
chcp 65001 >nul
title Fix PM2 PATH Issue
cd /d "%~dp0"

echo ========================================
echo   Fix PM2 PATH for Health Check
echo ========================================

:: Check current PM2 path
echo Checking PM2 location...
where pm2
echo.

:: Add PM2 to system PATH if not exists
echo Adding PM2 to PATH for health check...
set PM2_PATH=C:\Users\2uknow\AppData\Roaming\npm

:: Check if PATH already contains PM2 directory
echo %PATH% | findstr /i "%PM2_PATH%" >nul
if %errorlevel% neq 0 (
    echo PM2 path not found in PATH, adding...
    setx PATH "%PATH%;%PM2_PATH%" /M >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ PM2 path added to system PATH
        echo ⚠️ Restart required for system-wide effect
    ) else (
        echo ⚠️ Failed to add to system PATH, trying user PATH...
        setx PATH "%PATH%;%PM2_PATH%" >nul 2>&1
        echo ✅ PM2 path added to user PATH
    )
) else (
    echo ✅ PM2 path already exists in PATH
)

:: Create environment setup script for health check
echo.
echo Creating environment setup for health check...
set ENV_SCRIPT=%~dp0setup-env.bat

(
echo @echo off
echo :: Add PM2 to PATH for this session
echo set PATH=%%PATH%%;%PM2_PATH%
echo :: Start health check with proper environment
echo node auto-health-check.js
) > "%ENV_SCRIPT%"

echo ✅ Environment setup script created: %ENV_SCRIPT%

echo.
echo ========================================
echo   PATH Fix Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Test: setup-env.bat
echo 2. Or restart Windows for permanent fix
echo 3. Health check should now find PM2 properly
echo.
pause