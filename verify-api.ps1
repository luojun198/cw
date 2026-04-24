$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlYmNkNjYyYi1kYTJjLTQwMzAtYmEzZS1lMWE2YjM1M2E0ZWUiLCJ1c2VyTmFtZSI6IueuoeeQhuWRmCIsImFjY291bnRTZXRJZCI6IjVhZmNmYWNiLTE3M2EtNDJlMC1iOGVhLTc2ZTM1MjEwYzIwMyIsInJvbGVJZCI6IjM1OTc3YTQxLWUxYzMtNDM0OS05ZDlhLTFhNTY4MGYwYWM3MCIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzc2NDEwMjY0LCJleHAiOjE3NzY0MzkwNjR9.OsEkx3_FLVsKm0sNblzAmzJgmcMEcJr7ZJyvN8Jwpww"
}

Write-Host "=== 查询所有凭证 ===" -ForegroundColor Cyan
$vouchers = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers?pageSize=10" -Method GET -Headers $headers
$vouchers | ConvertTo-Json -Depth 10

Write-Host "`n=== 查询凭证详情 (最后一张) ===" -ForegroundColor Cyan
if ($vouchers.data.Count -gt 0) {
    $lastVoucher = $vouchers.data[0]
    $voucherDetail = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers/$($lastVoucher.id)" -Method GET -Headers $headers
    $voucherDetail | ConvertTo-Json -Depth 10
}

Write-Host "`n=== 查询余额表 ===" -ForegroundColor Cyan
$balances = Invoke-RestMethod -Uri "http://localhost:3005/api/ledger/balance" -Method GET -Headers $headers
$balances | ConvertTo-Json -Depth 10

Write-Host "`n=== 查询操作日志 ===" -ForegroundColor Cyan
$logs = Invoke-RestMethod -Uri "http://localhost:3005/api/system/logs?pageSize=10" -Method GET -Headers $headers
$logs | ConvertTo-Json -Depth 10