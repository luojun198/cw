# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cashier.spec.ts >> 出纳管理 >> 科目下拉包含现金和银行科目分组
- Location: e2e\cashier.spec.ts:21:3

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.el-select').first()

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic "回到首页" [ref=e5] [cursor=pointer]:
        - generic [ref=e6]:
          - img "盛于智" [ref=e8]
          - generic [ref=e9]:
            - generic [ref=e10]: 盛于智
            - generic [ref=e11]: 行政事业单位财务专业版
      - menubar [ref=e12]:
        - menuitem "凭证管理" [ref=e13]:
          - generic [ref=e14] [cursor=pointer]:
            - generic [ref=e15]:
              - img [ref=e17]
              - generic [ref=e19]: 凭证管理
            - img [ref=e21]
          - text: 👉 👉 👉 👉 👉
        - menuitem "账簿管理" [ref=e23]:
          - generic [ref=e24] [cursor=pointer]:
            - generic [ref=e25]:
              - img [ref=e27]
              - generic [ref=e29]: 账簿管理
            - img [ref=e31]
          - text: 👉 👉 👉 👉 👉
        - menuitem "辅助核算" [ref=e33]:
          - generic [ref=e34] [cursor=pointer]:
            - generic [ref=e35]:
              - img [ref=e37]
              - generic [ref=e39]: 辅助核算
            - img [ref=e41]
          - text: 👉 👉 👉
        - menuitem "报表管理" [ref=e43]:
          - generic [ref=e44] [cursor=pointer]:
            - generic [ref=e45]:
              - img [ref=e47]
              - generic [ref=e49]: 报表管理
            - img [ref=e51]
          - text: 👉 👉 👉
        - menuitem "出纳管理" [expanded] [ref=e53]:
          - generic [ref=e54] [cursor=pointer]:
            - generic [ref=e55]:
              - img [ref=e57]
              - generic [ref=e60]: 出纳管理
            - img [ref=e62]
          - menu [ref=e64]:
            - listitem [ref=e65]:
              - list [ref=e66]:
                - menuitem "👉 出纳日记账" [active] [ref=e67] [cursor=pointer]:
                  - generic [ref=e68]:
                    - text: 👉
                    - generic [ref=e69]: 出纳日记账
                - menuitem "👉 出纳日报" [ref=e70] [cursor=pointer]:
                  - generic [ref=e71]:
                    - text: 👉
                    - generic [ref=e72]: 出纳日报
                - menuitem "👉 出纳流水账" [ref=e73] [cursor=pointer]:
                  - generic [ref=e74]:
                    - text: 👉
                    - generic [ref=e75]: 出纳流水账
                - menuitem "👉 出纳期初" [ref=e76] [cursor=pointer]:
                  - generic [ref=e77]:
                    - text: 👉
                    - generic [ref=e78]: 出纳期初
                - menuitem "👉 对账单导入" [ref=e79] [cursor=pointer]:
                  - generic [ref=e80]:
                    - text: 👉
                    - generic [ref=e81]: 对账单导入
                - menuitem "👉 余额调节表" [ref=e82] [cursor=pointer]:
                  - generic [ref=e83]:
                    - text: 👉
                    - generic [ref=e84]: 余额调节表
        - menuitem "固定资产" [ref=e85]:
          - generic [ref=e86] [cursor=pointer]:
            - generic [ref=e87]:
              - img [ref=e89]
              - generic [ref=e93]: 固定资产
            - img [ref=e95]
          - text: 👉 👉 👉
        - menuitem "基础设置" [ref=e97]:
          - generic [ref=e98] [cursor=pointer]:
            - generic [ref=e99]:
              - img [ref=e101]
              - generic [ref=e105]: 基础设置
            - img [ref=e107]
          - text: 👉 👉 👉 👉 👉 👉 👉
        - menuitem "系统管理" [ref=e109]:
          - generic [ref=e110] [cursor=pointer]:
            - generic [ref=e111]:
              - img [ref=e113]
              - generic [ref=e115]: 系统管理
            - img [ref=e117]
          - text: 👉 👉 👉 👉 👉
        - menuitem "数据安全" [ref=e119]:
          - generic [ref=e120] [cursor=pointer]:
            - generic [ref=e121]:
              - img [ref=e123]
              - generic [ref=e127]: 数据安全
            - img [ref=e129]
          - text: 👉
      - button "收起菜单" [ref=e132] [cursor=pointer]:
        - img [ref=e133]
    - generic [ref=e135]:
      - generic [ref=e136]:
        - generic:
          - navigation "面包屑":
            - generic:
              - link
        - generic [ref=e137]:
          - generic [ref=e138]:
            - generic [ref=e139]: 当前账套：
            - img [ref=e141]
            - generic [ref=e144]: 未选账套
          - generic [ref=e145]:
            - generic [ref=e146]: 当前用户：
            - img [ref=e148]
            - generic [ref=e151]: 系统管理员
          - generic [ref=e152]:
            - button "切换操作员" [ref=e153] [cursor=pointer]:
              - img [ref=e155]
              - generic [ref=e158]: 切换操作员
            - button "切换账套" [ref=e159] [cursor=pointer]:
              - img [ref=e161]
              - generic [ref=e166]: 切换账套
          - generic [ref=e167]:
            - button "首页" [ref=e168] [cursor=pointer]:
              - img [ref=e170]
              - generic [ref=e173]: 首页
            - button "返回" [disabled] [ref=e174]:
              - img [ref=e176]
              - generic [ref=e178]: 返回
            - button "退出" [ref=e179] [cursor=pointer]:
              - img [ref=e181]
              - generic [ref=e184]: 退出
      - main [ref=e185]:
        - generic [ref=e187]:
          - generic [ref=e192]:
            - generic [ref=e193]:
              - generic [ref=e194]:
                - img [ref=e196]
                - text: 财务驾驶舱 · 盛于智
              - heading "晚上好，辛苦了" [level=1] [ref=e198]
              - generic [ref=e199]:
                - paragraph [ref=e200]: 2026年06月01日 星期一 20:37
                - generic [ref=e201]:
                  - generic [ref=e202]:
                    - generic [ref=e203]: 当前账套
                    - generic [ref=e204]: 未选账套
                  - generic [ref=e205]:
                    - generic [ref=e206]: 当前用户
                    - generic [ref=e207]: 系统管理员
                  - generic [ref=e208]:
                    - generic [ref=e209]: 会计区间
                    - generic [ref=e210]: 2026 年第 6 期
            - generic [ref=e211]:
              - button "凭证录入 新增凭证" [ref=e212] [cursor=pointer]:
                - img [ref=e215]
                - generic [ref=e217]:
                  - generic [ref=e218]: 凭证录入
                  - generic [ref=e219]: 新增凭证
                - img [ref=e220]
              - button "凭证管理 审核与记账" [ref=e222] [cursor=pointer]:
                - img [ref=e225]
                - generic [ref=e228]:
                  - generic [ref=e229]: 凭证管理
                  - generic [ref=e230]: 审核与记账
                - img [ref=e231]
              - button "余额表 打开科目余额表" [ref=e233] [cursor=pointer]:
                - img [ref=e236]
                - generic [ref=e238]:
                  - generic [ref=e239]: 余额表
                  - generic [ref=e240]: 打开科目余额表
                - img [ref=e241]
              - button "日记账 现金银行流水" [ref=e243] [cursor=pointer]:
                - img [ref=e246]
                - generic [ref=e248]:
                  - generic [ref=e249]: 日记账
                  - generic [ref=e250]: 现金银行流水
                - img [ref=e251]
          - generic [ref=e254]:
            - button "本月凭证 3 2026 年第 6 期" [ref=e255] [cursor=pointer]:
              - img [ref=e258]
              - generic [ref=e260]:
                - generic [ref=e261]: 本月凭证
                - generic [ref=e262]: "3"
                - generic [ref=e263]: 2026 年第 6 期
            - button "未记账凭证 3 草稿 + 已审核 3" [ref=e264] [cursor=pointer]:
              - img [ref=e267]
              - generic [ref=e269]:
                - generic [ref=e270]: 未记账凭证
                - generic [ref=e271]: "3"
                - generic [ref=e272]: 草稿 + 已审核
              - generic [ref=e273]: "3"
            - button "货币资金 ¥6,500.00 现金与银行余额" [ref=e274] [cursor=pointer]:
              - img [ref=e277]
              - generic [ref=e281]:
                - generic [ref=e282]: 货币资金
                - generic [ref=e283]: ¥6,500.00
                - generic [ref=e284]: 现金与银行余额
            - button "本月收入 ¥0.00 收入类发生额" [ref=e285] [cursor=pointer]:
              - img [ref=e288]
              - generic [ref=e292]:
                - generic [ref=e293]: 本月收入
                - generic [ref=e294]: ¥0.00
                - generic [ref=e295]: 收入类发生额
            - button "本月支出 ¥0.00 支出费用发生额" [ref=e296] [cursor=pointer]:
              - img [ref=e299]
              - generic [ref=e301]:
                - generic [ref=e302]: 本月支出
                - generic [ref=e303]: ¥0.00
                - generic [ref=e304]: 支出费用发生额
            - button "本月结余 ¥0.00 收支结余为正" [ref=e305] [cursor=pointer]:
              - img [ref=e308]
              - generic [ref=e311]:
                - generic [ref=e312]: 本月结余
                - generic [ref=e313]: ¥0.00
                - generic [ref=e314]: 收支结余为正
          - generic [ref=e315]:
            - generic [ref=e317]:
              - generic [ref=e318]:
                - img [ref=e320]
                - generic [ref=e323]:
                  - text: 趋势分析
                  - heading "近 6 期收入与支出结构" [level=3] [ref=e324]
                  - paragraph [ref=e325]:
                    - text: 取数口径：政府会计制度
                    - link "配置取数规则" [ref=e326] [cursor=pointer]:
                      - /url: /system/param?openDashboardRules=1
              - generic [ref=e327]:
                - generic [ref=e328]: 收入
                - generic [ref=e330]: 支出
                - generic [ref=e332]: 费用
                - generic [ref=e334]: 成本
                - generic [ref=e336]: 结余
            - generic [ref=e341]:
              - generic [ref=e342]:
                - generic [ref=e343]:
                  - img [ref=e345]
                  - generic [ref=e347]:
                    - text: 待办风险
                    - heading "处理提醒" [level=3] [ref=e348]
                - generic [ref=e349]: 2 项需关注
              - generic [ref=e350]:
                - generic [ref=e351]:
                  - generic [ref=e353]: 草稿凭证
                  - generic [ref=e354]: "3"
                - generic [ref=e355]:
                  - generic [ref=e357]: 待记账凭证
                  - generic [ref=e358]: "0"
                - generic [ref=e359]:
                  - generic [ref=e361]: 货币资金负数
                  - generic [ref=e362]: "1"
                - generic [ref=e363]:
                  - generic [ref=e365]: 辅助核算缺失
                  - generic [ref=e366]: "0"
          - generic [ref=e367]:
            - generic [ref=e368]:
              - generic [ref=e369]:
                - generic [ref=e370]:
                  - img [ref=e372]
                  - generic [ref=e375]:
                    - text: 业务流水
                    - heading "近期凭证" [level=3] [ref=e376]
                - button "查看全部" [ref=e377] [cursor=pointer]:
                  - text: 查看全部
                  - img [ref=e378]
              - generic [ref=e380]:
                - generic [ref=e381]:
                  - generic [ref=e382]: 日期
                  - generic [ref=e383]: 凭证号
                  - generic [ref=e384]: 摘要
                  - generic [ref=e385]: 状态
                  - generic [ref=e386]: 金额
                - button "06-28 003 出纳对账生成 — 100201 草稿 ¥4,500.00" [ref=e387] [cursor=pointer]:
                  - generic [ref=e388]: 06-28
                  - generic [ref=e389]: "003"
                  - generic "出纳对账生成 — 100201" [ref=e390]
                  - generic [ref=e391]: 草稿
                  - generic [ref=e392]: ¥4,500.00
                - button "06-25 记-002 E2E同步测试 草稿 ¥5,000.00" [ref=e393] [cursor=pointer]:
                  - generic [ref=e394]: 06-25
                  - generic [ref=e395]: 记-002
                  - generic "E2E同步测试" [ref=e396]
                  - generic [ref=e397]: 草稿
                  - generic [ref=e398]: ¥5,000.00
                - button "06-25 记-001 E2E凭证自动同步 草稿 ¥3,000.00" [ref=e399] [cursor=pointer]:
                  - generic [ref=e400]: 06-25
                  - generic [ref=e401]: 记-001
                  - generic "E2E凭证自动同步" [ref=e402]
                  - generic [ref=e403]: 草稿
                  - generic [ref=e404]: ¥3,000.00
            - generic [ref=e405]:
              - generic [ref=e407]:
                - img [ref=e409]
                - generic [ref=e412]:
                  - text: 资金洞察
                  - heading "现金银行结构" [level=3] [ref=e413]
              - generic [ref=e414]:
                - generic [ref=e415]:
                  - generic [ref=e416]:
                    - generic [ref=e417]: 现金
                    - generic [ref=e418]: ¥8,000.00
                  - generic [ref=e424]:
                    - generic [ref=e425]:
                      - generic "100101 现金" [ref=e428]
                      - generic [ref=e429]:
                        - strong [ref=e430]: ¥8,000.00
                        - emphasis [ref=e431]: 100%
                    - generic [ref=e432]:
                      - generic "100102 受托代理资产" [ref=e435]
                      - generic [ref=e436]:
                        - strong [ref=e437]: ¥0.00
                        - emphasis [ref=e438]: 0%
                - generic [ref=e439]:
                  - generic [ref=e440]:
                    - generic [ref=e441]: 银行
                    - generic [ref=e442]: ¥-1,500.00
                  - generic [ref=e448]:
                    - generic [ref=e449]:
                      - generic "100201 本单位" [ref=e452]
                      - generic [ref=e453]:
                        - strong [ref=e454]: ¥-1,500.00
                        - emphasis [ref=e455]: "-100%"
                    - generic [ref=e456]:
                      - generic "100202 受托代理资产" [ref=e459]
                      - generic [ref=e460]:
                        - strong [ref=e461]: ¥0.00
                        - emphasis [ref=e462]: 0%
            - generic [ref=e463]:
              - generic [ref=e465]:
                - img [ref=e467]
                - generic [ref=e468]:
                  - text: 科目活跃度
                  - heading "本期发生额 Top 5" [level=3] [ref=e469]
              - generic [ref=e470]:
                - generic [ref=e472]:
                  - generic [ref=e473]: 100201 本单位
                  - generic [ref=e474]: ¥4,500.00
                - generic [ref=e478]:
                  - generic [ref=e479]: 2001 短期借款
                  - generic [ref=e480]: ¥11,000.00
                - generic [ref=e484]:
                  - generic [ref=e485]: 100101 现金
                  - generic [ref=e486]: ¥8,000.00
          - generic [ref=e492]: 盛于智 · 行政事业单位财务专业版
  - generic [ref=e495]:
    - generic [ref=e496]: "[plugin:vite:import-analysis] Failed to resolve import \"element-plus/es/components/month-picker/style/css\" from \"src/views/cashier/Journal.vue\". Does the file exist?"
    - generic [ref=e497]: D:/BDKF/cw0523/client/src/views/cashier/Journal.vue:2:136
    - generic [ref=e498]: "1 | /* unplugin-vue-components disabled */import { ElTag as __unplugin_components_14 } from 'element-plus/es';import 'element-plus/es/components/base/style/css';import 'element-plus/es/components/tag/style/css'; 2 | import { ElMonthPicker as __unplugin_components_13 } from 'element-plus/es';import 'element-plus/es/components/base/style/css';import 'element-plus/es/components/month-picker/style/css'; | ^ 3 | import { ElDialog as __unplugin_components_12 } from 'element-plus/es';import 'element-plus/es/components/base/style/css';import 'element-plus/es/components/dialog/style/css'; 4 | import { ElForm as __unplugin_components_11 } from 'element-plus/es';import 'element-plus/es/components/base/style/css';import 'element-plus/es/components/form/style/css';"
    - generic [ref=e499]: at TransformPluginContext._formatError (file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:49258:41) at TransformPluginContext.error (file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:49253:16) at normalizeUrl (file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:64307:23) at process.processTicksAndRejections (node:internal/process/task_queues:104:5) at async file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:64439:39 at async Promise.all (index 5) at async TransformPluginContext.transform (file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:64366:7) at async PluginContainer.transform (file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:49099:18) at async loadAndTransform (file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51978:27) at async viteTransformMiddleware (file:///D:/BDKF/cw0523/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:62106:24
    - generic [ref=e500]:
      - text: Click outside, press Esc key, or fix the code to dismiss.
      - text: You can also disable this overlay by setting
      - code [ref=e501]: server.hmr.overlay
      - text: to
      - code [ref=e502]: "false"
      - text: in
      - code [ref=e503]: vite.config.js
      - text: .
```

# Test source

```ts
  1   | /**
  2   |  * 出纳管理 E2E 测试
  3   |  *
  4   |  * 覆盖：页面渲染 / 科目加载 / 日记账录入与查询 / 余额计算 / 银行对账 / 期初余额
  5   |  */
  6   | import { test, expect, waitForTable, navTo } from './fixtures'
  7   | 
  8   | const API = 'http://127.0.0.1:3005'
  9   | 
  10  | test.describe('出纳管理', () => {
  11  |   // ── 日记账页面 ─────────────────────────────────────────
  12  | 
  13  |   test('出纳日记账页面能正常渲染', async ({ loggedInPage: page }) => {
  14  |     await navTo(page, '出纳管理', '出纳日记账')
  15  |     await expect(page.locator('h3')).toContainText('出纳日记账')
  16  |     await expect(page.locator('.el-table')).toBeVisible()
  17  |     // 科目下拉自动加载现金/银行科目
  18  |     await expect(page.locator('.el-select').first()).toBeVisible()
  19  |   })
  20  | 
  21  |   test('科目下拉包含现金和银行科目分组', async ({ loggedInPage: page }) => {
  22  |     await navTo(page, '出纳管理', '出纳日记账')
> 23  |     await page.locator('.el-select').first().click()
      |                                              ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  24  |     await page.waitForSelector('.el-select-dropdown', { timeout: 5000 })
  25  |     // 期望有「现金科目」或「银行存款」分组标题
  26  |     const dropdown = page.locator('.el-select-dropdown')
  27  |     await expect(dropdown).toBeVisible()
  28  |     const optionCount = await dropdown.locator('.el-select-dropdown__item').count()
  29  |     expect(optionCount).toBeGreaterThan(0)
  30  |   })
  31  | 
  32  |   test('能录入出纳日记账并在列表显示', async ({ loggedInPage: page, request }) => {
  33  |     const asid = '5945a5a8-e9f2-4145-968f-86862ce54aa3'
  34  |     // 取 token
  35  |     const lr = await request.post(`${API}/api/auth/login`, {
  36  |       data: { username: 'admin', password: 'admin123', targetAccountSetId: asid },
  37  |     })
  38  |     const { token } = await lr.json()
  39  |     const headers = { Authorization: `Bearer ${token}`, 'x-account-set-id': asid }
  40  | 
  41  |     // API 直接创建一条日记账（UI 录入在前端测试覆盖）
  42  |     const createRes = await request.post(`${API}/api/cashier/journal`, {
  43  |       headers,
  44  |       data: {
  45  |         account_code: '1001',
  46  |         biz_date: '2026-06-15',
  47  |         summary: 'E2E测试-提取备用金',
  48  |         debit: 1500,
  49  |         credit: 0,
  50  |         counter_unit: 'E2E测试单位',
  51  |       },
  52  |     })
  53  |     expect(createRes.ok()).toBeTruthy()
  54  |     const { data: { id: journalId } } = await createRes.json()
  55  | 
  56  |     // 查询日记账 API 验证写入
  57  |     const listRes = await request.get(
  58  |       `${API}/api/cashier/journal?account_code=1001`,
  59  |       { headers }
  60  |     )
  61  |     const listData = await listRes.json()
  62  |     expect(listData.code).toBe(0)
  63  |     const row = listData.data.rows.find((r: any) => r.id === journalId)
  64  |     expect(row).toBeDefined()
  65  |     expect(row.debit).toBe(1500)
  66  |     expect(row.summary).toBe('E2E测试-提取备用金')
  67  |     expect(typeof row.balance).toBe('number')  // 逐行余额存在
  68  | 
  69  |     // 清理
  70  |     await request.delete(`${API}/api/cashier/journal/${journalId}`, { headers })
  71  |   })
  72  | 
  73  |   test('日记账余额计算正确（期初 + 借 - 贷）', async ({ request }) => {
  74  |     const asid = '5945a5a8-e9f2-4145-968f-86862ce54aa3'
  75  |     const lr = await request.post(`${API}/api/auth/login`, {
  76  |       data: { username: 'admin', password: 'admin123', targetAccountSetId: asid },
  77  |     })
  78  |     const { token } = await lr.json()
  79  |     const headers = { Authorization: `Bearer ${token}`, 'x-account-set-id': asid }
  80  | 
  81  |     // 查询期初余额
  82  |     const ibRes = await request.get(`${API}/api/cashier/init-balance`, { headers })
  83  |     const ibData = await ibRes.json()
  84  |     expect(ibData.code).toBe(0)
  85  | 
  86  |     // 查询日记账列表（含余额）
  87  |     const listRes = await request.get(`${API}/api/cashier/journal?account_code=1001`, { headers })
  88  |     const listData = await listRes.json()
  89  |     expect(listData.code).toBe(0)
  90  | 
  91  |     const { opening, rows, closing, totalDebit, totalCredit } = listData.data
  92  |     // 期末余额 = 期初 + 本期借 - 本期贷
  93  |     expect(Math.round((opening + totalDebit - totalCredit) * 100) / 100).toBeCloseTo(closing, 2)
  94  |     // 逐行余额最后一行应等于期末
  95  |     if (rows.length > 0) {
  96  |       expect(rows[rows.length - 1].balance).toBeCloseTo(closing, 2)
  97  |     }
  98  |   })
  99  | 
  100 |   test('银行对账 API 能自动勾对', async ({ request }) => {
  101 |     const asid = '5945a5a8-e9f2-4145-968f-86862ce54aa3'
  102 |     const lr = await request.post(`${API}/api/auth/login`, {
  103 |       data: { username: 'admin', password: 'admin123', targetAccountSetId: asid },
  104 |     })
  105 |     const { token } = await lr.json()
  106 |     const H = { Authorization: `Bearer ${token}`, 'x-account-set-id': asid }
  107 | 
  108 |     // 创建一条日记账 + 对应的银行对账单（金额相同、日期相同）
  109 |     const date = '2026-06-20'
  110 |     const jRes = await request.post(`${API}/api/cashier/journal`, {
  111 |       headers: H,
  112 |       data: { account_code: '1002', biz_date: date, debit: 0, credit: 8000, summary: 'E2E对账测试' },
  113 |     })
  114 |     const { data: { id: jId } } = await jRes.json()
  115 | 
  116 |     const sRes = await request.post(`${API}/api/cashier/bank-statement`, {
  117 |       headers: H,
  118 |       data: { account_code: '1002', biz_date: date, debit: 0, credit: 8000, bill_no: 'STMT001' },
  119 |     })
  120 |     const { data: { id: sId } } = await sRes.json()
  121 | 
  122 |     // 执行自动勾对
  123 |     const reconRes = await request.post(`${API}/api/cashier/reconcile/auto`, {
```