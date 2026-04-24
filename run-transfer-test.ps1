$headers = @{
    "Content-Type" = "application/json"
}

# Login
$loginBody = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$loginResult = Invoke-RestMethod -Uri "http://localhost:3005/api/auth/login" -Method POST -Headers $headers -Body $loginBody

# Check if token exists
if ($loginResult.code -eq 0) {
    # Extract token using regex since direct property access seems broken
    $loginJson = $loginResult | ConvertTo-Json -Depth 10
    if ($loginJson -match '"token"\s*:\s*"([^"]+)"') {
        $token = $matches[1]
        Write-Host "Login OK, token length: $($token.Length)"
    } else {
        Write-Host "Login OK but no token found"
        exit 1
    }

    $authHeaders = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }

    # Get vouchers
    Write-Host "`n=== Getting Vouchers ==="
    $vouchers = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers?pageSize=20" -Method GET -Headers $authHeaders
    Write-Host "Found $($vouchers.data.Count) vouchers"
    $vouchers.data | ForEach-Object {
        Write-Host "  $($_.voucher_no) Status:$($_.status) Amount:$($_.total_amount)"
    }

    # Get balances
    Write-Host "`n=== Getting Balances for period 4 ==="
    $balances = Invoke-RestMethod -Uri "http://localhost:3005/api/ledger/balance?year=2026&period=4" -Method GET -Headers $authHeaders
    $balances.data | Where-Object { $_.account_code -in @('1001', '4001', '5001') } | ForEach-Object {
        Write-Host "  $($_.account_code) $($_.account_name): init=$($_.init_balance) debit=$($_.current_debit) credit=$($_.current_credit) end=$($_.end_balance)"
    }

    # Try auto transfer preview
    Write-Host "`n=== Auto Transfer Preview ==="
    $previewBody = @{year = 2026; period = 4} | ConvertTo-Json
    try {
        $preview = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/auto-transfer/preview" -Method POST -Headers $authHeaders -Body $previewBody -TimeoutSec 10
        Write-Host "Preview result: code=$($preview.code) message=$($preview.message)"
        if ($preview.data) {
            Write-Host "Entries count: $($preview.data.entries.Count)"
            $preview.data.entries | ForEach-Object {
                Write-Host "  $($_.direction) $($_.account_code) $($_.amount)"
            }
            Write-Host "Totals: income=$($preview.data.totals.incomeTotal) expense=$($preview.data.totals.expenseTotal)"
        }
        if ($preview.blockedReason) {
            Write-Host "Blocked: $($preview.blockedReason)"
        }
    } catch {
        Write-Host "Preview error: $($_.Exception.Message)"
    }

    # Try execute transfer
    Write-Host "`n=== Execute Transfer ==="
    $runBody = @{year = 2026; period = 4} | ConvertTo-Json
    try {
        $runResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/auto-transfer/run" -Method POST -Headers $authHeaders -Body $runBody -TimeoutSec 10
        Write-Host "Run result: code=$($runResult.code) message=$($runResult.message)"
        if ($runResult.data) {
            Write-Host "Transfer voucher created: $($runResult.data.voucherNo)"
        }
    } catch {
        Write-Host "Run error: $($_.Exception.Message)"
    }
} else {
    Write-Host "Login failed - code=$($loginResult.code)"
}