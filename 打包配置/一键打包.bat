@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo.
echo ========================================
echo   CW Finance - 一键完整打包（构建+压缩）
echo ========================================
echo.
echo 说明: 将先执行 build-deploy.bat 生成最新 deploy-final，
echo       再压缩为 deploy-output 下的 zip（避免只压旧包）。
echo.

call "%ROOT%\build-and-package.bat"
exit /b %ERRORLEVEL%
