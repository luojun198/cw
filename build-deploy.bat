@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "NODE_VER=25.9.0"
set "NODE_URL=https://nodejs.org/dist/v%NODE_VER%/node-v%NODE_VER%-win-x64.zip"
set "NODE_ZIP=node-v%NODE_VER%-win-x64.zip"
set "DEPLOY=deploy-final"

echo.
echo ========================================
echo   CW Finance - Build Deployment Package
echo ========================================
echo.

echo [0/6] Cleaning old deploy processes and required ports ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$root = '%ROOT%'; $deployNode = Join-Path $root 'deploy-final\node\node.exe'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $deployNode -or ($_.CommandLine -like '*deploy-final\start.bat*' -and $_.ProcessId -ne $PID) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; foreach ($port in @(3005,5175,5173,5174)) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Seconds 1"
if errorlevel 1 (
    echo ERROR: Failed to clean old deploy processes or ports
    exit /b 1
)
echo       OK
echo.

echo [1/6] Building frontend (Vite - deploy mode, skip type check) ...
cd /d "%ROOT%"
call npm run build:deploy --workspace=client
if errorlevel 1 (
    echo ERROR: Frontend build failed
    exit /b 1
)
echo       OK
echo.

echo [2/6] Building backend bundle (esbuild) ...
cd /d "%ROOT%\server"
call node scripts\buildBundle.mjs
if errorlevel 1 (
    echo ERROR: Backend bundle failed
    exit /b 1
)
cd /d "%ROOT%"
echo       OK
echo.

echo [3/6] Preparing deploy directory ...
if exist "%ROOT%\%DEPLOY%" rmdir /s /q "%ROOT%\%DEPLOY%"
if exist "%ROOT%\%DEPLOY%" (
    echo ERROR: Failed to remove old deploy directory: %ROOT%\%DEPLOY%
    echo Please close any running package window and try again.
    exit /b 1
)
mkdir "%ROOT%\%DEPLOY%"
mkdir "%ROOT%\%DEPLOY%\client"
mkdir "%ROOT%\%DEPLOY%\server"
mkdir "%ROOT%\%DEPLOY%\data"
mkdir "%ROOT%\%DEPLOY%\uploads"
echo       OK
echo.

echo [4/6] Downloading Node.js %NODE_VER% ...
if not exist "%ROOT%\%NODE_ZIP%" (
    echo       Downloading from %NODE_URL% ...
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%ROOT%\%NODE_ZIP%'"
    if errorlevel 1 (
        echo ERROR: Node.js download failed
        echo Please download manually: %NODE_URL%
        exit /b 1
    )
)
echo       Extracting ...
if exist "%ROOT%\node-v%NODE_VER%-win-x64" rmdir /s /q "%ROOT%\node-v%NODE_VER%-win-x64"
powershell -Command "Expand-Archive -Path '%ROOT%\%NODE_ZIP%' -DestinationPath '%ROOT%' -Force"
if exist "%ROOT%\%DEPLOY%\node" rmdir /s /q "%ROOT%\%DEPLOY%\node"
move "%ROOT%\node-v%NODE_VER%-win-x64" "%ROOT%\%DEPLOY%\node" >nul
echo       OK
echo.

echo [5/6] Installing production dependencies (portable Node.js %NODE_VER%) ...
copy /y "%ROOT%\server\package.json" "%ROOT%\%DEPLOY%\server\package.json" >nul
if exist "%ROOT%\server\package-lock.json" (
    copy /y "%ROOT%\server\package-lock.json" "%ROOT%\%DEPLOY%\server\package-lock.json" >nul
)
cd /d "%ROOT%\%DEPLOY%\server"

echo       Portable Node version:
"%ROOT%\%DEPLOY%\node\node.exe" -v

echo       Installing dependencies ...
set "PATH=%ROOT%\%DEPLOY%\node;%PATH%"
set "npm_config_target_arch=x64"
set "npm_config_target_platform=win32"
call npm install --omit=dev
if errorlevel 1 (
    echo ERROR: npm install failed
    exit /b 1
)

if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
    echo       Prebuilt binary not downloaded, trying local build...
    if exist "%ROOT%\node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
        copy /y "%ROOT%\node_modules\better-sqlite3\build\Release\better_sqlite3.node" "node_modules\better-sqlite3\build\Release\better_sqlite3.node" >nul 2>nul
    )
    if not exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
        echo ERROR: better-sqlite3 binary not found after fallback!
        exit /b 1
    )
    echo       OK (copied from local build)
)
echo       ABI verified:
"%ROOT%\%DEPLOY%\node\node.exe" -e "var m = require('./node_modules/better-sqlite3'); m(':memory:').close(); console.log('       ABI: ' + process.versions.modules)"
echo       OK
echo.

echo [6/6] Copying files ...
cd /d "%ROOT%"

copy /y "server\dist\bundle.cjs" "%DEPLOY%\server\" >nul

copy /y "server\src\db\schema.sql" "%DEPLOY%\server\schema.sql" >nul

echo # CW Finance - Deployment .env > "%DEPLOY%\server\.env"
echo # JWT Secret - change to a strong random string in production >> "%DEPLOY%\server\.env"
echo JWT_SECRET=your-secret-key-change-this-in-production >> "%DEPLOY%\server\.env"
echo # Keep deployment package database blank; users create account sets on first use >> "%DEPLOY%\server\.env"
echo SEED_DEFAULT_ACCOUNT_SET=false >> "%DEPLOY%\server\.env"

xcopy "client\dist\*" "%DEPLOY%\client\dist\" /E /I /Y >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\copy-deploy-templates.ps1" "%ROOT%" "%DEPLOY%"
if errorlevel 1 (
    echo ERROR: Template copy failed
    exit /b 1
)

copy /y "QR.png" "%DEPLOY%\QR.png" >nul 2>nul

"%ROOT%\%DEPLOY%\node\node.exe" "scripts\create-blank-deploy-db.cjs" "%ROOT%\%DEPLOY%"
if errorlevel 1 (
    echo ERROR: Blank database creation failed
    exit /b 1
)

(
  echo $ports = @(3005, 5175, 5173, 5174^)
  echo foreach ^($port in $ports^) {
  echo   $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  echo   $pids = $connections ^| Select-Object -ExpandProperty OwningProcess -Unique
  echo   foreach ^($processId in $pids^) {
  echo     if ^($processId -and $processId -ne $PID^) {
  echo       try {
  echo         Stop-Process -Id $processId -Force -ErrorAction Stop
  echo         Write-Host "Stopped process ${processId} on port ${port}"
  echo       } catch {
  echo         Write-Host "Failed to stop process ${processId} on port ${port}: $($_.Exception.Message)"
  echo       }
  echo     }
  echo   }
  echo }
  echo Start-Sleep -Seconds 1
) > "%DEPLOY%\stop-ports.ps1"

(
  echo @echo off
  echo title CW Finance Server
  echo echo ========================================
  echo echo   CW Finance - Starting...
  echo echo ========================================
  echo echo.
  echo echo   First use: create an account set, then login admin / admin123
  echo echo ========================================
  echo echo.
  echo set "PATH=%%~dp0node;%%PATH%%"
  echo echo Cleaning occupied ports 3005, 5175, 5173, 5174...
  echo powershell -NoProfile -ExecutionPolicy Bypass -File "%%~dp0stop-ports.ps1"
  echo if errorlevel 1 ^(
  echo   echo.
  echo   echo Failed to clean required ports. This package was NOT started.
  echo   pause
  echo   exit /b 1
  echo ^)
  echo echo Starting server...
  echo start "" /b "%%~dp0node\node.exe" server\bundle.cjs
  echo echo Waiting for server to be ready...
  echo :wait_loop
  echo timeout /t 2 /nobreak ^>nul
  echo "%%~dp0node\node.exe" -e "var h=require('http');h.get('http://localhost:3005/api/health',function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)}).setTimeout(3000,function(){process.exit(1)})" ^>nul 2^>nul
  echo if errorlevel 1 goto wait_loop
  echo start http://localhost:3005
  echo echo.
  echo echo Server is ready. Opening browser...
  echo echo Do not close this window.
  echo pause
) > "%DEPLOY%\start.bat"
echo       OK
echo.

echo ========================================
echo   BUILD SUCCESS
echo ========================================
echo.
echo   Output : %ROOT%\%DEPLOY%\
echo   Node.js: v%NODE_VER% (portable)
echo   Start  : %ROOT%\%DEPLOY%\start.bat
echo.
echo   Next steps:
echo   1. Copy '%DEPLOY%' folder to target server
echo   2. Double-click start.bat
echo   3. Open http://localhost:3005
echo   4. Create an account set first, then login with admin / admin123
echo.
exit /b 0
