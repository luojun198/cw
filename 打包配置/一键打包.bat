@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   CW Finance - Build Deployment Package
echo ========================================
echo.

set "NODE_VER=25.9.0"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip"
set "NODE_ZIP=node-v%NODE_VER%-win-x64.zip"
set "DEPLOY=deploy-final"

cd /d "%~dp0.."
set "PROJ_DIR=%CD%"

echo [1/6] Building frontend (Vite - deploy mode, skip type check) ...
cd /d "%PROJ_DIR%"
call npm run build:deploy --workspace=client
if errorlevel 1 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)
echo       OK
echo.

echo [2/6] Building backend bundle (esbuild) ...
cd /d "%PROJ_DIR%\server"
call node scripts\buildBundle.mjs
if errorlevel 1 (
    echo ERROR: Backend bundle failed
    pause
    exit /b 1
)
echo       OK
echo.

echo [3/6] Preparing deploy directory ...
cd /d "%PROJ_DIR%"
if exist "%DEPLOY%" rmdir /s /q "%DEPLOY%"
mkdir "%DEPLOY%"
mkdir "%DEPLOY%\client"
mkdir "%DEPLOY%\server"
mkdir "%DEPLOY%\data"
mkdir "%DEPLOY%\uploads"
echo       OK
echo.

echo [4/6] Downloading Node.js %NODE_VER% ...
if not exist "%PROJ_DIR%\%NODE_ZIP%" (
    echo       Downloading from %NODE_URL% ...
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%PROJ_DIR%\%NODE_ZIP%'"
    if errorlevel 1 (
        echo ERROR: Node.js download failed
        echo Please download manually: %NODE_URL%
        pause
        exit /b 1
    )
)
echo       Extracting ...
if exist "%PROJ_DIR%\node-v%NODE_VER%-win-x64" rmdir /s /q "%PROJ_DIR%\node-v%NODE_VER%-win-x64"
powershell -Command "Expand-Archive -Path '%PROJ_DIR%\%NODE_ZIP%' -DestinationPath '%PROJ_DIR%' -Force"
if exist "%DEPLOY%\node" rmdir /s /q "%DEPLOY%\node"
move "%PROJ_DIR%\node-v%NODE_VER%-win-x64" "%DEPLOY%\node" >nul
echo       OK
echo.

echo [5/6] Installing production dependencies (portable Node.js %NODE_VER%) ...
copy /y "%PROJ_DIR%\server\package.json" "%PROJ_DIR%\%DEPLOY%\server\package.json" >nul
if exist "%PROJ_DIR%\server\package-lock.json" (
    copy /y "%PROJ_DIR%\server\package-lock.json" "%PROJ_DIR%\%DEPLOY%\server\package-lock.json" >nul
)
cd /d "%PROJ_DIR%\%DEPLOY%\server"

echo       Portable Node version:
"%PROJ_DIR%\%DEPLOY%\node\node.exe" -v

echo       Installing dependencies ...
set "PATH=%PROJ_DIR%\%DEPLOY%\node;%PATH%"
set "npm_config_target_arch=x64"
set "npm_config_target_platform=win32"
call npm install --omit=dev
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
    echo       Prebuilt binary not downloaded, trying local build...
    if exist "%PROJ_DIR%\node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
        copy /y "%PROJ_DIR%\node_modules\better-sqlite3\build\Release\better_sqlite3.node" "node_modules\better-sqlite3\build\Release\better_sqlite3.node" >nul 2>nul
    )
    if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
        echo ERROR: better-sqlite3 binary not found after fallback!
        pause
        exit /b 1
    )
    echo       OK (copied from local build)
)
echo       ABI verified:
"%PROJ_DIR%\%DEPLOY%\node\node.exe" -e "var m = require('./node_modules/better-sqlite3'); m(':memory:').close(); console.log('       ABI: ' + process.versions.modules)"
echo       OK
echo.

echo [6/6] Copying files ...
cd /d "%PROJ_DIR%"

copy /y "server\dist\bundle.cjs" "%DEPLOY%\server\" >nul

copy /y "server\src\db\schema.sql" "%DEPLOY%\server\schema.sql" >nul

echo # CW Finance - Deployment .env > "%DEPLOY%\server\.env"
echo # JWT Secret - change to a strong random string in production >> "%DEPLOY%\server\.env"
echo JWT_SECRET=your-secret-key-change-this-in-production >> "%DEPLOY%\server\.env"

xcopy "client\dist\*" "%DEPLOY%\client\dist\" /E /I /Y >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\copy-deploy-templates.ps1" "%PROJ_DIR%" "%DEPLOY%"
if errorlevel 1 (
    echo ERROR: Template copy failed
    pause
    exit /b 1
)

copy /y "QR.png" "%DEPLOY%\QR.png" >nul 2>nul

if /I "%INCLUDE_SAMPLE_DB%"=="1" (
    if exist "data\finance.db" (
        echo       Copying sample database because INCLUDE_SAMPLE_DB=1 ...
        copy /y "data\finance.db" "%DEPLOY%\data\finance.db" >nul
        echo       Sample database copied: data\finance.db
    ) else (
        echo       INCLUDE_SAMPLE_DB=1 but data\finance.db was not found
    )
) else (
    echo       Clean package: no database copied. Set INCLUDE_SAMPLE_DB=1 to include data\finance.db.
)

echo       OK
echo.

echo Creating start.bat ...
(
echo @echo off
echo title CW Finance Server
echo echo ========================================
echo echo   CW Finance - Starting...
echo echo ========================================
echo echo.
echo echo   Login  : admin / admin123
echo echo ========================================
echo echo.
echo set "PATH=%%~dp0node;%%PATH%%"
echo echo Starting server...
echo start "" /b "%%~dp0node\node.exe" server\bundle.cjs
echo echo Waiting for server to be ready...
echo :wait_loop
echo timeout /t 2 /nobreak ^>nul
echo "%%~dp0node\node.exe" -e "var h=require('http');h.get('http://localhost:3005/api/health',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)}).setTimeout(3000,function(){process.exit(1)})" ^>nul 2^>nul
echo if errorlevel 1 goto wait_loop
echo start http://localhost:3005
echo echo.
echo echo Server is ready! Opening browser...
echo echo Do not close this window.
echo pause
) > "%DEPLOY%\start.bat"

echo.
echo ========================================
echo   BUILD SUCCESS
echo ========================================
echo.
echo   Output : %PROJ_DIR%\%DEPLOY%\
echo   Node.js: v%NODE_VER% (portable)
echo   Start  : %PROJ_DIR%\%DEPLOY%\start.bat
echo.
echo   Next steps:
echo   1. Copy '%DEPLOY%' folder to target server
echo   2. Double-click start.bat
echo   3. Open http://localhost:3005
echo   4. Login: admin / admin123
echo.
pause
