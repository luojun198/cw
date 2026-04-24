$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlYmNkNjYyYi1kYTJjLTQwMzAtYmEzZS1lMWE2YjM1M2E0ZWUiLCJ1c2VyTmFtZSI6IueuoeeQhuWRmCIsImFjY291bnRTZXRJZCI6IjVhZmNmYWNiLTE3M2EtNDJlMC1iOGVhLTc2ZTM1MjEwYzIwMyIsInJvbGVJZCI6IjM1OTc3YTQxLWUxYzMtNDM0OS05ZDlhLTFhNTY4MGYwYWM3MCIsInBlcm1pc3Npb25zIjpbIioiXSwiaWF0IjoxNzc2NDEwMjY0LCJleHAiOjE3NzY0MzkwNjR9.OsEkx3_FLVsKm0sNblzAmzJgmcMEcJr7ZJyvN8Jwpww"
    "Content-Type" = "application/json"
}

Write-Host "=== 获取所有科目 ===" -ForegroundColor Cyan
$accounts = Invoke-RestMethod -Uri "http://localhost:3005/api/base/accounts?pageSize=500" -Method GET -Headers $headers
$accounts.data | ForEach-Object {
    $code = $_.code
    $name = $_.name
    $dir = $_.direction
    $level = $_.level
    $indent = "  " * ($level - 1)
    Write-Host "$indent$code - $name ($dir)"
}