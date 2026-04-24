$headers = @{
    "Content-Type" = "application/json"
}

# Login
$loginBody = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

Write-Host "Sending login request..."
$loginResult = Invoke-RestMethod -Uri "http://localhost:3005/api/auth/login" -Method POST -Headers $headers -Body $loginBody -Debug -Verbose
Write-Host "Login result:"
Write-Host ($loginResult | ConvertTo-Json -Depth 10)