import urllib.request, json, re, base64

# Get captcha
req = urllib.request.urlopen('http://localhost:3005/api/auth/captcha')
captcha = json.loads(req.read())
svg_b64 = captcha['captchaUrl'].split(',')[1]
svg = base64.b64decode(svg_b64).decode()
nums = re.findall(r'<text[^>]*>(.*?)</text>', svg)
nums = [n.strip() for n in nums if n.strip().replace('+','').replace(' ','').isdigit()]
answer = int(nums[0]) + int(nums[1]) if len(nums) >= 2 else 14
captcha_id = captcha['captchaId']

# Login
login_data = json.dumps({
    'username': 'admin', 'password': 'admin123',
    'captcha': str(answer), 'captchaId': captcha_id,
    'targetAccountSetId': '7d0ab121-b62c-461d-97d1-fb8404f771ab'
}).encode()
req = urllib.request.Request(
    'http://localhost:3005/api/auth/login',
    data=login_data,
    headers={'Content-Type': 'application/json'}
)
resp = json.loads(urllib.request.urlopen(req).read())
token = resp['token']
print(f"登录成功, userId={resp['user']['id']}")

# 获取一个科目
req = urllib.request.Request(
    'http://localhost:3005/api/base/accounts?is_enabled=',
    headers={'Authorization': f'Bearer {token}'}
)
accounts = json.loads(urllib.request.urlopen(req).read())['data']
# 找两个叶子科目（借方和贷方）
debit_acc = next((a for a in accounts if a['direction'] == 'debit' and a['level'] == 3), None)
credit_acc = next((a for a in accounts if a['direction'] == 'credit' and a['level'] == 3), None)
print(f"借方科目: {debit_acc['code']} {debit_acc['name']}")
print(f"贷方科目: {credit_acc['code']} {credit_acc['name']}")

# 录入凭证
voucher_data = json.dumps({
    'voucher_date': '2026-04-06',
    'entries': [
        {
            'account_id': debit_acc['id'],
            'account_code': debit_acc['code'],
            'account_name': debit_acc['name'],
            'direction': 'debit',
            'amount': 1000.00,
            'summary': '测试借方'
        },
        {
            'account_id': credit_acc['id'],
            'account_code': credit_acc['code'],
            'account_name': credit_acc['name'],
            'direction': 'credit',
            'amount': 1000.00,
            'summary': '测试贷方'
        }
    ],
    'remark': '自动化测试凭证'
}).encode()
req = urllib.request.Request(
    'http://localhost:3005/api/voucher/vouchers',
    data=voucher_data,
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
)
try:
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    print(f"\n凭证保存成功: {json.dumps(result, ensure_ascii=False, indent=2)}")
except urllib.error.HTTPError as e:
    print(f"\n凭证保存失败: {e.code} {e.read().decode()}")
