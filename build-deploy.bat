@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "NODE_VER=20.18.3"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip"
set "NODE_ZIP=node-v%NODE_VER%-win-x64.zip"
set "DEPLOY=deploy-final"

echo.
echo ========================================
echo   CW Finance - Build Deployment Package
echo ========================================
echo.

echo [1/6] Building frontend (Vite) ...
call npm run build --workspace=client
if errorlevel 1 exit /b 1
echo       OK
echo.

echo [2/6] Building backend bundle (esbuild) ...
cd /d "%ROOT%\server"
call node scripts\buildBundle.mjs
if errorlevel 1 exit /b 1
cd /d "%ROOT%"
echo       OK
echo.

echo [3/6] Preparing deploy directory ...
if exist "%ROOT%\%DEPLOY%" rmdir /s /q "%ROOT%\%DEPLOY%"
mkdir "%ROOT%\%DEPLOY%"
mkdir "%ROOT%\%DEPLOY%\client"
mkdir "%ROOT%\%DEPLOY%\server"
mkdir "%ROOT%\%DEPLOY%\data"
mkdir "%ROOT%\%DEPLOY%\uploads"
mkdir "%ROOT%\%DEPLOY%\模版"
echo       OK
echo.

echo [4/6] Downloading Node.js %NODE_VER% ...
if not exist "%ROOT%\%NODE_ZIP%" (
  powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%ROOT%\%NODE_ZIP%'"
  if errorlevel 1 exit /b 1
)
if exist "%ROOT%\node-v%NODE_VER%-win-x64" rmdir /s /q "%ROOT%\node-v%NODE_VER%-win-x64"
powershell -Command "Expand-Archive -Path '%ROOT%\%NODE_ZIP%' -DestinationPath '%ROOT%' -Force"
if exist "%ROOT%\%DEPLOY%\node" rmdir /s /q "%ROOT%\%DEPLOY%\node"
move "%ROOT%\node-v%NODE_VER%-win-x64" "%ROOT%\%DEPLOY%\node" >nul
echo       OK
echo.

echo [5/6] Installing production dependencies ...
copy /y "%ROOT%\server\package.json" "%ROOT%\%DEPLOY%\server\package.json" >nul
cd /d "%ROOT%\%DEPLOY%\server"
set "PATH=%ROOT%\%DEPLOY%\node;%PATH%"
call npm install --omit=dev
if errorlevel 1 exit /b 1
if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" exit /b 1
echo       OK
echo.

echo [6/6] Copying files ...
cd /d "%ROOT%"
copy /y "server\dist\bundle.cjs" "%ROOT%\%DEPLOY%\server\" >nul
copy /y "server\schema.sql" "%ROOT%\%DEPLOY%\server\" >nul
xcopy "client\dist\*" "%ROOT%\%DEPLOY%\client\dist\" /E /I /Y >nul
xcopy "模版\*.acd" "%ROOT%\%DEPLOY%\模版\" /Y >nul
(
  echo @echo off
  echo title CW Finance Server
  echo echo ========================================
  echo echo   CW Finance Server - Starting...
  echo echo ========================================
  echo echo.
  echo echo   URL: http://localhost:3005
  echo echo   User: admin / admin123
  echo echo.
  echo echo   Press Ctrl+C to stop
  echo echo ========================================
  echo echo.
  echo set "PATH=%%~dp0node;%%PATH%%"
  echo node server\bundle.cjs
  echo pause
) > "%ROOT%\%DEPLOY%\start.bat"
echo       OK
echo.

echo ========================================
echo   BUILD SUCCESS
echo ========================================
echo Output : %ROOT%\%DEPLOY%\
echo Start  : %ROOT%\%DEPLOY%\start.bat
exit /b 0
