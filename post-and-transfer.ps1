$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlYmNkNjYyYi1kYTJjLTQwMzAtYmEzZS1lMWE2YjM1M2E0ZWUiLCJ1c2VyTmFtZSI6IueuoeeQhuWRmCIsImFjY291bnRTZXRJZCI6IjVhZmNmYWNiLTE3M2EtNDJlMC1iOGVhLTc2ZTM1MjEwYzIwMyIsInJvbGVJZCI6IjM1OTc3YTQxLWUxYzMtNDM0OS05ZDlhLTFhNTY4MGYwYWM3MCIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzc2NDEwMjY0LCJleHAiOjE3NzY0MzkwNjR9.OsEkx3_FLVsKm0sNblzAmzJgmcMEcJr7ZJyvN8Jwpww"
    "Content-Type" = "application/json"
}

Write-Host "=== Get All Vouchers ===" -ForegroundColor Cyan
$vouchers = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers?pageSize=50" -Method GET -Headers $headers
$vouchers.data | ForEach-Object {
    Write-Host "ID:$($_.id) No:$($_.voucher_no) Status:$($_.status) Amount:$($_.total_amount)"
}

Write-Host "`n=== Post Each Voucher ===" -ForegroundColor Cyan
foreach ($v in $vouchers.data) {
    if ($v.status -eq "draft") {
        Write-Host "Posting voucher $($v.voucher_no)..." -ForegroundColor Yellow
        $postResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers/$($v.id)/post" -Method POST -Headers $headers
        if ($postResult.code -eq 0) {
            Write-Host "  Posted OK" -ForegroundColor Green
        } else {
            Write-Host "  Post FAILED: $($postResult.message)" -ForegroundColor Red
        }
    }
}

Write-Host "`n=== Check Balances After Posting ===" -ForegroundColor Cyan
$balances = Invoke-RestMethod -Uri "http://localhost:3005/api/ledger/balance?year=2026&period=4" -Method GET -Headers $headers
$balances | ConvertTo-Json -Depth 10

Write-Host "`n=== Try Transfer Preview ===" -ForegroundColor Cyan
$previewBody = @{year = 2026; period = 4} | ConvertTo-Json
$preview = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/auto-transfer/preview" -Method POST -Headers $headers -Body $previewBody
$preview | ConvertTo-Json -Depth 15

Write-Host "`n=== Try Execute Transfer ===" -ForegroundColor Cyan
$runBody = @{year = 2026; period = 4} | ConvertTo-Json
$runResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/auto-transfer/run" -Method POST -Headers $headers -Body $runBody
$runResult | ConvertTo-Json -Depth 10

if ($runResult.code -eq 0) {
    Write-Host "Transfer SUCCESS: $($runResult.message)" -ForegroundColor Green
    $transferDetail = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers/$($runResult.data.voucher_id)" -Method GET -Headers $headers
    Write-Host "`nTransfer Voucher:" -ForegroundColor Cyan
    $transferDetail.data.entries | ForEach-Object {
        $d = if ($_.direction -eq "debit") { "DR" } else { "CR" }
        Write-Host "  $d $($_.account_code) - $($_.amount)"
    }
} else {
    Write-Host "Transfer FAILED: $($runResult.message)" -ForegroundColor Red
}

Write-Host "`n=== Final Vouchers ===" -ForegroundColor Cyan
$finalVouchers = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers?pageSize=50" -Method GET -Headers $headers
$finalVouchers.data | ForEach-Object {
    Write-Host "$($_.voucher_no) Status:$($_.status) Amount:$($_.total_amount)"
}