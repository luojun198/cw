Start-Sleep -Seconds 3
try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3005/api/account-sets' -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "Server is UP - Status: $($response.StatusCode)"
} catch {
    Write-Host "Server is DOWN: $($_.Exception.Message)"
}