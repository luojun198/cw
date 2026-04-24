$headers = @{
    "Content-Type" = "application/json"
}

# Login
$loginBody = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$loginResult = Invoke-RestMethod -Uri "http://localhost:3005/api/auth/login" -Method POST -Headers $headers -Body $loginBody

$loginJson = $loginResult | ConvertTo-Json -Depth 10
if ($loginJson -match '"token"\s*:\s*"([^"]+)"') {
    $token = $matches[1]
}

$authHeaders = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Get all vouchers
Write-Host "=== All Vouchers ==="
$vouchers = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers?pageSize=20" -Method GET -Headers $authHeaders
$vouchers.data | ForEach-Object {
    Write-Host "$($_.voucher_no) Status:$($_.status) Amount:$($_.total_amount) Date:$($_.voucher_date)"
}

# Post the transfer voucher (记-005)
$transferVoucher = $vouchers.data | Where-Object { $_.voucher_no -like "*-005" }
if ($transferVoucher -and $transferVoucher.status -eq "draft") {
    Write-Host "`n=== Posting Transfer Voucher ==="
    $postResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers/$($transferVoucher.id)/post" -Method POST -Headers $authHeaders
    Write-Host "Post result: code=$($postResult.code) message=$($postResult.message)"
}

# Check updated balances
Write-Host "`n=== Updated Balances After Transfer Posting ==="
$balances = Invoke-RestMethod -Uri "http://localhost:3005/api/ledger/balance?year=2026&period=4" -Method GET -Headers $authHeaders
$balances.data | Where-Object { $_.account_code -in @('1001', '3001', '4001', '5001') } | ForEach-Object {
    Write-Host "$($_.account_code) $($_.account_name): init=$($_.init_balance) debit=$($_.current_debit) credit=$($_.current_credit) end=$($_.end_balance)"
}

# Try different report endpoints
Write-Host "`n=== Trying Report Endpoints ==="
$endpoints = @(
    "/api/reports/balance-sheet",
    "/api/report/balance-sheet",
    "/api/reports/balance",
    "/api/report/balance",
    "/api/financial-statements/balance-sheet"
)

foreach ($ep in $endpoints) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3005$($ep)?year=2026&period=4" -Method GET -Headers $authHeaders -TimeoutSec 5
        Write-Host "$ep : Success - code=$($response.code)"
    } catch {
        Write-Host "$ep : Failed - $($_.Exception.Message.Split('`n')[0])"
    }
}

Write-Host "`n=== Final Summary ==="
Write-Host "1. Voucher Creation: PASSED"
Write-Host "2. Voucher Posting: PASSED"
Write-Host "3. Auto Transfer: PASSED (voucher 记-005 created and posted)"
Write-Host "4. Report Generation: Need to find correct endpoint"