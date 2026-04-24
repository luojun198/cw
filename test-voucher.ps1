$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlYmNkNjYyYi1kYTJjLTQwMzAtYmEzZS1lMWE2YjM1M2E0ZWUiLCJ1c2VyTmFtZSI6IueuoeeQhuWRmCIsImFjY291bnRTZXRJZCI6IjVhZmNmYWNiLTE3M2EtNDJlMC1iOGVhLTc2ZTM1MjEwYzIwMyIsInJvbGVJZCI6IjM1OTc3YTQxLWUxYzMtNDM0OS05ZDlhLTFhNTY4MGYwYWM3MCIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzc2NDEwMjY0LCJleHAiOjE3NzY0MzkwNjR9.OsEkx3_FLVsKm0sNblzAmzJgmcMEcJr7ZJyvN8Jwpww"
    "Content-Type" = "application/json"
}

Write-Host "=== 获取账户信息 ===" -ForegroundColor Cyan
$accounts = Invoke-RestMethod -Uri "http://localhost:3005/api/base/accounts?pageSize=100" -Method GET -Headers $headers
$cashAccountId = ($accounts.data | Where-Object { $_.code -eq "1001" })[0].id
$bankAccountId = ($accounts.data | Where-Object { $_.code -eq "1002" })[0].id
Write-Host "Cash (1001) ID: $cashAccountId" -ForegroundColor Yellow
Write-Host "Bank (1002) ID: $bankAccountId" -ForegroundColor Yellow

$body = @{
    voucher_type_id = "f0546be8-fe45-414c-9fd2-5b9f41a7b2d9"
    voucher_date = "2026-04-17"
    remark = "测试凭证-模拟流程完整测试"
    entries = @(
        @{
            account_id = $cashAccountId
            account_code = "1001"
            account_name = "库存现金"
            direction = "debit"
            amount = 1000
            summary = "提取现金"
        },
        @{
            account_id = $bankAccountId
            account_code = "1002"
            account_name = "银行存款"
            direction = "credit"
            amount = 1000
            summary = "提取现金"
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "`n=== 步骤1: 创建凭证 ===" -ForegroundColor Cyan
$result = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers" -Method POST -Headers $headers -Body $body
$result | ConvertTo-Json -Depth 10

if ($result.code -eq 0) {
    $voucherId = $result.data.id
    $voucherNo = $result.data.voucherNo
    Write-Host "凭证创建成功! ID: $voucherId, 凭证号: $voucherNo" -ForegroundColor Green

    Write-Host "`n=== 注意: 由于制单人和审核人不能为同一人，跳过审核步骤 ===" -ForegroundColor Yellow
    Write-Host "=== 直接测试过账功能 ===" -ForegroundColor Yellow

    Write-Host "`n=== 步骤3: 过账凭证 ===" -ForegroundColor Cyan
    $postResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers/$voucherId/post" -Method POST -Headers $headers
    $postResult | ConvertTo-Json -Depth 10

    if ($postResult.code -eq 0) {
        Write-Host "过账成功!" -ForegroundColor Green

        Write-Host "`n=== 步骤4: 反过账 ===" -ForegroundColor Cyan
        $unpostResult = Invoke-RestMethod -Uri "http://localhost:3005/api/voucher/vouchers/$voucherId/unpost" -Method POST -Headers $headers
        $unpostResult | ConvertTo-Json -Depth 10

        if ($unpostResult.code -eq 0) {
            Write-Host "反过账成功!" -ForegroundColor Green
        } else {
            Write-Host "反过账失败: $($unpostResult.message)" -ForegroundColor Red
        }
    } else {
        Write-Host "过账失败: $($postResult.message)" -ForegroundColor Red
    }
} else {
    Write-Host "凭证创建失败: $($result.message)" -ForegroundColor Red
}

Write-Host "`n`n=== 测试结转功能 ===" -ForegroundColor Cyan
$transferUrl = "http://localhost:3005/api/voucher/auto-transfer/status" + "?year=2026&period=3"
$transferStatus = Invoke-RestMethod -Uri $transferUrl -Method GET -Headers $headers
$transferStatus | ConvertTo-Json -Depth 10

Write-Host "`n=== 测试报表生成 ===" -ForegroundColor Cyan
$reportUrl = "http://localhost:3005/api/report/balance-sheet" + "?year=2026&period=4"
$report = Invoke-RestMethod -Uri $reportUrl -Method GET -Headers $headers
$report | ConvertTo-Json -Depth 10