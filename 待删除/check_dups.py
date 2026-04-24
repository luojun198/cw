import urllib.request, json, re, base64
from collections import Counter

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
token = resp['data']['token']

# Fetch accounts
req = urllib.request.Request(
    'http://localhost:3005/api/base/accounts?is_enabled=',
    headers={'Authorization': f'Bearer {token}'}
)
data = json.loads(urllib.request.urlopen(req).read()).get('data', [])

print(f'API returned: {len(data)} accounts')
ids = [a['id'] for a in data]
print(f'Unique IDs: {len(set(ids))} / {len(ids)}')
c = Counter(ids)
dups = [(k, v) for k, v in c.items() if v > 1]
print(f'Duplicates: {len(dups)}')
for k, v in dups[:10]:
    row = next(x for x in data if x['id'] == k)
    print(f'  {v}x code={row["code"]} name={row["name"]}')

# Show first few
print('\nFirst 3:')
for a in data[:3]:
    print(f'  id={a["id"]} code={a["code"]} name={a["name"]} parent_id={a.get("parent_id")}')
print('\nLast 3:')
for a in data[-3:]:
    print(f'  id={a["id"]} code={a["code"]} name={a["name"]} parent_id={a.get("parent_id")}')

# Check account_set_id in response
set_ids = set(a.get('account_set_id') for a in data)
print(f'\nAccount set IDs in response: {set_ids}')
