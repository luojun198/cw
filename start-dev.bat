@echo off
setlocal enabledelayedexpansion
title CW Finance - One-Click Dev Start

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo.
echo ========================================
echo   CW Finance - One-Click Dev Start
echo ========================================
echo.

:: -------------------------------------------------------
::  Step 1: Kill processes on port 3005 (backend) & 5175 (frontend)
:: -------------------------------------------------------
echo [1/4] Releasing ports 3005 and 5175 ...

for %%P in (3005 5175) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        echo       Killing PID %%a on port %%P
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo       Ports released.
echo.

:: -------------------------------------------------------
::  Step 2: Start backend server (port 3005)
:: -------------------------------------------------------
echo [2/4] Starting backend server on port 3005 ...

start "CW Backend" cmd /k "cd /d "%ROOT%" && npm run dev:server"

echo       Backend launching ...
echo.

:: -------------------------------------------------------
::  Step 3: Start frontend dev server (port 5175)
:: -------------------------------------------------------
echo [3/4] Starting frontend dev server on port 5175 ...

start "CW Frontend" cmd /k "cd /d "%ROOT%" && npm run dev:client"

echo       Frontend launching ...
echo.

:: -------------------------------------------------------
::  Step 4: Wait for servers to be ready, then open browser
:: -------------------------------------------------------
echo [4/4] Waiting for servers to be ready ...

set "READY=0"
for /L %%i in (1,1,30) do (
    if !READY! equ 0 (
        :: Check both ports are listening
        netstat -aon | findstr ":3005 " | findstr "LISTENING" >nul 2>&1
        if !errorlevel! equ 0 (
            netstat -aon | findstr ":5175 " | findstr "LISTENING" >nul 2>&1
            if !errorlevel! equ 0 (
                set "READY=1"
            )
        )
        if !READY! equ 0 (
            timeout /t 1 /nobreak >nul
        )
    )
)

if %READY% equ 1 (
    echo       Servers are ready!
    echo.
    echo ========================================
    echo   CW Finance is running!
    echo   Frontend : http://localhost:5175
    echo   Backend  : http://localhost:3005
    echo   Account  : admin / admin123
    echo ========================================
    echo.
    start http://localhost:5175
) else (
    echo.
    echo [WARN] Servers may still be starting. Opening browser anyway ...
    start http://localhost:5175
)

echo.
echo Press any key to close this window (servers will keep running) ...
pause >nul
