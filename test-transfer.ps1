$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlYmNkNjYyYi1kYTJjLTQwMzAtYmEzZS1lMWE2YjM1M2E0ZWUiLCJ1c2VyTmFtZSI6IueuoeeQhuWRmCIsImFjY291bnRTZXRJZCI6IjVhZmNmYWNiLTE3M2EtNDJlMC1iOGVhLTc2ZTM1MjEwYzIwMyIsInJvbGVJZCI6IjM1OTc3YTQxLWUxYzMtNDM0OS05ZDlhLTFhNTY4MGYwYWM3MCIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzc2NDEwMjY0LCJleHAiOjE3NzY0MzkwNjR9.OsEkx3_FLVsKm0sNblzAmzJgmcMEcJr7ZJyvN8Jwpww"
    "Content-Type" = "application/json"
}

$cashId = "bc6d5c2d-e104-463e-841d-3ec2a1d99e1c"
$revenueId = "207abd65-b17a-409e-85ea-206247ff06d6"
$expenseId = "b94d5ca7-8b06-42ae-86ec-6bc3d7a1dbbd"
$surplusId = "58c69141-6952-4a27-ad10-96a0ec803d20"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Transfer Flow Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n=== Step 1: Create Income Voucher ===" -ForegroundColor Yellow
$incomeVoucher = @{
    voucher_type_id = "f0546be8-fe45-414c-9fd2-5b9f41a7b2d9"
    voucher_date = "2026-04-15"
    remark = "Test Income"
    entries = @(
        @{account_id = $cashId; account_code = "1001"; account_name = "Cash"; direction = "debit"; amount = 50000; summary = "Grant"},
        @{account_id = $revenueId; account_code = "4001"; account_name = "Revenue"; direction = "credit"; amount = 50000; summary = "Grant"}
    )
} | ConvertTo-Json -Depth 10

$incomeResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers" -Method POST -Headers $headers -Body $incomeVoucher
$incomeResult | ConvertTo-Json -Depth 10
if ($incomeResult.code -eq 0) { Write-Host "Income voucher OK: $($incomeResult.data.voucherNo)" -ForegroundColor Green }
else { Write-Host "Income FAILED: $($incomeResult.message)" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Step 2: Create Expense Voucher ===" -ForegroundColor Yellow
$expenseVoucher = @{
    voucher_type_id = "f0546be8-fe45-414c-9fd2-5b9f41a7b2d9"
    voucher_date = "2026-04-16"
    remark = "Test Expense"
    entries = @(
        @{account_id = $expenseId; account_code = "5001"; account_name = "Expense"; direction = "debit"; amount = 30000; summary = "Activity"},
        @{account_id = $cashId; account_code = "1001"; account_name = "Cash"; direction = "credit"; amount = 30000; summary = "Activity"}
    )
} | ConvertTo-Json -Depth 10

$expenseResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers" -Method POST -Headers $headers -Body $expenseVoucher
$expenseResult | ConvertTo-Json -Depth 10
if ($expenseResult.code -eq 0) { Write-Host "Expense voucher OK: $($expenseResult.data.voucherNo)" -ForegroundColor Green }
else { Write-Host "Expense FAILED: $($expenseResult.message)" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Step 3: Check Transfer Status ===" -ForegroundColor Yellow
$statusUrl = "http://localhost:3005/api/voucher/auto-transfer/status" + "?year=2026&period=4"
$status = Invoke-RestMethod -Uri $statusUrl -Method GET -Headers $headers
$status | ConvertTo-Json -Depth 5

Write-Host "`n=== Step 4: Preview Transfer ===" -ForegroundColor Yellow
$previewBody = @{year = 2026; period = 4} | ConvertTo-Json
$preview = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/auto-transfer/preview" -Method POST -Headers $headers -Body $previewBody
$preview | ConvertTo-Json -Depth 15

Write-Host "`n=== Step 5: Execute Transfer ===" -ForegroundColor Yellow
$runBody = @{year = 2026; period = 4} | ConvertTo-Json
$runResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/auto-transfer/run" -Method POST -Headers $headers -Body $runBody
$runResult | ConvertTo-Json -Depth 10

if ($runResult.code -eq 0) {
    $transferNo = $runResult.data.voucher_no
    Write-Host "Transfer SUCCESS! Voucher: $transferNo" -ForegroundColor Green

    Write-Host "`n=== Step 6: Transfer Voucher Details ===" -ForegroundColor Yellow
    $detail = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers/$($runResult.data.voucher_id)" -Method GET -Headers $headers
    $detail | ConvertTo-Json -Depth 10

    Write-Host "`nTransfer Entries:" -ForegroundColor Cyan
    $detail.data.entries | ForEach-Object {
        $d = if ($_.direction -eq "debit") { "DR" } else { "CR" }
        Write-Host "  $d $($_.account_code): $($_.amount)" -ForegroundColor White
    }
} else {
    Write-Host "Transfer FAILED: $($runResult.message)" -ForegroundColor Red
}

Write-Host "`n=== Step 7: Balance Sheet ===" -ForegroundColor Yellow
$bs = Invoke-RestMethod -Uri "http://localhost:3005/api/report/balance-sheet?year=2026&period=4" -Method GET -Headers $headers
$bs | ConvertTo-Json -Depth 10

Write-Host "`n=== Step 8: All Vouchers ===" -ForegroundColor Yellow
$vouchers = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers?pageSize=50" -Method GET -Headers $headers
Write-Host "Total: $($vouchers.total)" -ForegroundColor White
$vouchers.data | ForEach-Object { Write-Host "  $($_.voucher_no) - $($_.remark) - $($_.status) - $($_.total_amount)" -ForegroundColor White }

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan