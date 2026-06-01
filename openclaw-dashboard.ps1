$gwProc = Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -eq "" -and (netstat -ano | Select-String "$($_.Id).*18789.*LISTENING") }

$needStart = -not $gwProc

if ($needStart) {
    $tmpdir = "C:\Users\Administrator\AppData\Local\Temp\2"
    if (-not (Test-Path $tmpdir)) { New-Item -ItemType Directory -Path $tmpdir -Force | Out-Null }
    $env:HOME = "C:\Users\Administrator"
    $env:TMPDIR = $tmpdir
    $env:OPENCLAW_GATEWAY_PORT = "18789"
    Start-Process -FilePath "C:\Program Files\nodejs\node.exe" -ArgumentList "C:\Users\Administrator\AppData\Roaming\npm\node_modules\openclaw\dist\index.js", "gateway", "--port", "18789" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

$url = "http://127.0.0.1:18789/#token=3081beadf52e529a77d9ddde7f5ca5a7b2fb43e52078277d"
Start-Process $url
