@echo off
chcp 65001 >nul
title CW Finance - Starting Services

echo.
echo ========================================
echo  CW Finance - Start Services
echo ========================================
echo.

echo [1/4] Releasing ports...
for %%p in (3005 5173 5174 5175) do (
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
        taskkill /PID %%a /F >nul 2>&1
    )
)
echo Done.
timeout /t 2 /nobreak >nul

echo.
echo [2/4] Starting backend...
start "CW Backend" cmd /k "cd /d D:\kf\cw0423 && npm run dev:server"
timeout /t 4 /nobreak >nul

echo.
echo [3/4] Starting frontend...
start "CW Frontend" cmd /k "cd /d D:\kf\cw0423 && npm run dev:client"
timeout /t 5 /nobreak >nul

echo.
echo [4/4] Opening homepage in Microsoft Edge...
start msedge http://localhost:5175

echo.
echo ========================================
echo  All services started successfully!
echo  Frontend : http://localhost:5175
echo  Backend  : http://localhost:3005
echo ========================================
echo.
