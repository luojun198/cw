@echo off
title CW Finance Server
echo ========================================
echo   CW Finance - Starting...
echo ========================================
echo.
echo   Opening: http://localhost:3005
echo   Login  : admin / admin123
echo.
echo   Press Ctrl+C to stop server
echo ========================================
echo.
set "PATH=%~dp0node;%PATH%"
echo Starting server...
start http://localhost:3005
node server\bundle.cjs
pause
