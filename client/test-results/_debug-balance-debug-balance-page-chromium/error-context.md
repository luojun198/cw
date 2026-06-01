# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: _debug-balance.spec.ts >> debug balance page
- Location: e2e\_debug-balance.spec.ts:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.el-select-dropdown__item').first()
    - locator resolved to <li role="option" data-v-08aaad4e="" id="el-id-8012-19" aria-selected="true" class="el-select-dropdown__item is-selected is-hovering">…</li>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    52 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - heading "盛于智 · 行政事业单位财务专业版" [level=2] [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e11]:
        - generic:
          - combobox [ref=e13]
          - generic [ref=e14]: 盛于智
        - img [ref=e17] [cursor=pointer]
      - generic [ref=e22]:
        - generic [ref=e23]:
          - combobox [expanded] [active] [ref=e25]
          - generic [ref=e26]: 请选择操作员
        - img [ref=e29] [cursor=pointer]
      - generic [ref=e34]:
        - img [ref=e37]
        - textbox "密码" [ref=e40]
      - generic [ref=e42]:
        - generic [ref=e43] [cursor=pointer]:
          - generic [ref=e44]:
            - checkbox "记住账号密码"
          - generic [ref=e46]: 记住账号密码
        - button "登 录" [ref=e47] [cursor=pointer]:
          - generic [ref=e48]: 登 录
    - generic [ref=e49]:
      - button "新增账套" [ref=e50] [cursor=pointer]:
        - generic [ref=e51]:
          - img [ref=e53]
          - text: 新增账套
      - button "导入账套" [ref=e55] [cursor=pointer]:
        - generic [ref=e56]:
          - img [ref=e58]
          - text: 导入账套
    - paragraph [ref=e60]: v1.0.0 · 开发模式 · b2619e8
  - tooltip [ref=e61]:
    - listbox [ref=e65]:
      - option "1 制单人员" [ref=e66] [cursor=pointer]:
        - generic [ref=e67]: "1"
        - generic [ref=e68]: 制单人员
      - option "2 审核人员" [ref=e69] [cursor=pointer]:
        - generic [ref=e70]: "2"
        - generic [ref=e71]: 审核人员
      - option "3 记账人员" [ref=e72] [cursor=pointer]:
        - generic [ref=e73]: "3"
        - generic [ref=e74]: 记账人员
      - option "4 查询账号" [ref=e75] [cursor=pointer]:
        - generic [ref=e76]: "4"
        - generic [ref=e77]: 查询账号
      - option "5 超级" [ref=e78] [cursor=pointer]:
        - generic [ref=e79]: "5"
        - generic [ref=e80]: 超级
      - option "admin 系统管理员" [ref=e81] [cursor=pointer]:
        - generic [ref=e82]: admin
        - generic [ref=e83]: 系统管理员
```

# Test source

```ts
  1  | import { test } from '@playwright/test'
  2  | 
  3  | test('debug balance page', async ({ page }) => {
  4  |   const errors: string[] = []
  5  |   page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`))
  6  |   page.on('console', (m) => {
  7  |     if (m.type() === 'error') errors.push(`CON: ${m.text()}`)
  8  |   })
  9  | 
  10 |   await page.goto('http://localhost:5175/')
  11 |   await page.waitForSelector('h2')
  12 | 
  13 |   // 选择第一个账套
  14 |   const accountSetSelect = page.locator('.el-select').first()
  15 |   await accountSetSelect.click()
  16 |   await page.locator('.el-select-dropdown__item').first().click()
  17 |   await page.waitForTimeout(500)
  18 | 
  19 |   // 选择操作员
  20 |   const userSelect = page.locator('.el-select').nth(1)
  21 |   await userSelect.click()
> 22 |   await page.locator('.el-select-dropdown__item').first().click()
     |                                                           ^ Error: locator.click: Test timeout of 30000ms exceeded.
  23 | 
  24 |   await page.fill('input[type="password"]', 'admin123')
  25 |   await page.click('button[type="submit"]')
  26 |   await page.waitForURL(/\/dashboard/, { timeout: 15000 })
  27 | 
  28 |   await page.goto('http://localhost:5175/ledger/balance', { waitUntil: 'networkidle' })
  29 |   await page.waitForTimeout(3000)
  30 | 
  31 |   const h3 = await page.locator('h3').innerText().catch(() => 'NO h3')
  32 |   const pageText = await page.locator('.page').innerText().catch(() => 'NO .page')
  33 |   const tableRows = await page.locator('.el-table__body tr').count()
  34 |   const html = await page.locator('.main-view').innerHTML().catch(() => 'NO main-view')
  35 | 
  36 |   console.log('H3:', h3)
  37 |   console.log('PAGE snippet:', pageText.slice(0, 300))
  38 |   console.log('TABLE ROWS:', tableRows)
  39 |   console.log('MAIN-VIEW len:', html.length)
  40 |   console.log('ERRORS:', JSON.stringify(errors, null, 2))
  41 | })
  42 | 
```