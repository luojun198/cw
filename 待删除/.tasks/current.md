# 当前任务

> 纯 Web 版行政事业单位财务记账系统 - 重构中

## 进行中

### 阶段一：代码质量提升（1-2周）

#### 路由层重构（3-4天）
- [x] Day 1-2: Voucher.ts 拆分（761行 → 242行，减少68.1%）
  - [x] 创建 voucherBatch.ts (182行) - 批量审核/删除
  - [x] 创建 voucherAudit.ts (55行) - 单条审核/反审核
  - [x] 创建 voucherPosting.ts (96行) - 过账/反过账
  - [x] 创建 voucherPeriod.ts (80行) - 月结/反月结
  - [x] 创建 voucherAi.ts (53行) - AI智能摘要
  - [x] 创建 voucherAutoTransfer.ts (123行) - 自动结转
  - [x] 更新 index.ts 路由挂载
  - [x] 测试验证所有接口正常工作
- [x] Day 3: Base.ts 拆分（647行 → 13行，减少98%）
  - [x] 创建 baseValidation.ts (52行) - 共享工具函数
  - [x] 创建 baseAccount.ts (233行) - 会计科目管理
  - [x] 创建 baseVoucherType.ts (56行) - 凭证类型管理
  - [x] 创建 baseProject.ts (220行) - 辅助核算管理
  - [x] 创建 baseInitBalance.ts (118行) - 期初余额管理
  - [x] 更新 index.ts 路由挂载
  - [x] 测试验证所有接口正常工作
- [x] Day 4: Report.ts 拆分（665行 → 14行，减少98%）
  - [x] 创建 reportBalanceSheet.ts (177行) - 资产负债表
  - [x] 创建 reportIncomeStatement.ts (268行) - 收入费用表、现金流量表
  - [x] 创建 reportEquity.ts (161行) - 净资产变动表、财政拨款收入支出表
  - [x] 创建 reportAux.ts (29行) - 辅助余额表
  - [x] 创建 reportAi.ts (108行) - AI功能
  - [x] 更新 index.ts 路由挂载
  - [x] 测试验证所有接口正常工作

#### 前端组件优化（2-3天）
- [x] Entry.vue 重构（1091行 → 254行，减少77%）
  - [x] 创建 useVoucherForm.ts (130行) - 凭证表单逻辑
  - [x] 创建 useAuxiliaryAccounting.ts (120行) - 辅助核算逻辑
  - [x] 创建 VoucherDraftList.vue (120行) - 未审核凭证列表
  - [x] 创建 VoucherBatchDelete.vue (170行) - 批量删除对话框
  - [x] 创建 VoucherEntryForm.vue (350行) - 凭证录入表单
- [x] BalanceSheet.vue 重构（816行 → 113行，减少86%）
  - [x] 创建 useBalanceSheetData.ts (220行) - 数据映射和计算
  - [x] 创建 useBalanceSheetExport.ts (100行) - 导出和打印
  - [x] 创建 BalanceSheetTable.vue (280行) - 报表表格组件
- [x] Account.vue 重构（600行 → 220行，减少63%）
  - [x] 创建 useAccountTree.ts (130行) - 树形数据和展开/折叠
  - [x] 创建 useAccountForm.ts (150行) - 表单管理和辅助核算
  - [x] 创建 AccountDialog.vue (180行) - 科目编辑对话框
- [x] Audit.vue 重构（579行 → 180行，减少69%）
  - [x] 创建 useVoucherAuditData.ts (160行) - 数据管理和表格逻辑
  - [x] 创建 useVoucherAuditActions.ts (160行) - 审核/过账操作
  - [x] 创建 useBatchAuditDialog.ts (100行) - 批量审核对话框逻辑
  - [x] 创建 VoucherAuditTable.vue (90行) - 审核表格组件
  - [x] 创建 BatchAuditDialog.vue (90行) - 批量审核对话框
  - [x] 创建 VoucherDetailDialog.vue (60行) - 凭证详情对话框

#### 测试覆盖提升（3-4天）
- [x] 后端集成测试（服务层测试全部通过）
- [x] 前端单元测试（29个用例全部通过）
  - [x] 配置 Vitest + Vue Test Utils 测试框架
  - [x] useVoucherForm 测试（8个用例）
  - [x] useAccountTree 测试（5个用例）
  - [x] useAccountForm 测试（9个用例）
  - [x] useBalanceSheetData 测试（3个用例）
  - [x] useVoucherAuditData 测试（4个用例）
- [x] E2E测试（4个测试文件）
  - [x] 配置 Playwright 测试框架
  - [x] login.spec.ts - 登录功能测试
  - [x] voucher.spec.ts - 凭证管理测试
  - [x] account.spec.ts - 科目管理测试
  - [x] report.spec.ts - 报表管理测试
- [x] CI/CD集成
  - [x] 创建 GitHub Actions 工作流
  - [x] 配置客户端测试和构建
  - [x] 配置服务端测试和构建
  - [x] 配置代码检查和类型检查

#### 安全审查（2-3天）
- [x] SQL注入防护（已验证：所有查询使用参数化）
- [x] XSS/CSRF防护（已配置：CORS、JWT认证）
- [x] 敏感数据加密（已实现：bcryptjs密码加密、JWT签名）
- [x] 认证授权加固（已实现：authMiddleware、操作日志、权限检查）


- [x] 新增手工动态报表模板“资产负债表”（编码 `1`，来源 `资产表.XLS`），已写入 `report_definitions/report_sheets/report_cells` 并可在动态报表列表中展示
- [x] 按固定资产负债表双栏结构重排动态模板“资产负债表”（编码 `1`）的 `report_cells` 布局，保留 `@ye/@nc` 与汇总公式，当前模板已调整为更接近 Excel 的左右对照版式
- [x] 进一步按“每一行、每一段、空行、标题位置”重建动态模板“资产负债表”（编码 `1`）的手工 `report_cells`：现已拆出“负债：/净资产：”独立标题区，重排流动/非流动/净资产段落，并将客户端的平衡列宽样式仅对 `code=1` 模板启用；当前模板为 34 行 × 8 列、184 个 cells，前端构建通过
- [x] 动态报表编辑器支持按坐标选中任意单元格、从 Excel 复制文本区域后直接批量粘贴到草稿，并允许保存到新坐标单元格；前端构建通过
- [x] 动态报表编辑器进一步支持粘贴时自动识别文本/数字/公式，并可将单元格复制或移动到任意目标坐标；前端构建通过
- [x] 动态报表编辑器进一步支持类似 Excel 的点击单元格直接编辑、失焦/回车写入草稿，并可继续移走、复制、粘贴后统一存盘；前端构建通过
- [x] 动态报表编辑器已取消右侧编辑器，改为仅保留表格内嵌编辑；单元格与批量粘贴现统一按“`@`/`=` 开头为公式，否则为文本”识别，前端构建通过
- [x] 修复动态报表内嵌编辑失焦后界面未显示草稿的问题：表格显示改为优先读取 `draftCells` 中对应坐标，前端构建通过
- [x] 动态报表表格现支持列宽拖动与本地记忆：`DynamicReport.vue` 已接入列尾拖拽手柄、按模板/工作表/列索引持久化宽度，并完成前端构建验证
- [x] 动态报表表格现支持行高拖动与本地记忆：行号区已接入行高拖拽手柄，按模板/工作表/行索引持久化高度，并完成前端构建验证
- [x] 优化动态报表拖拽交互与视觉：`DynamicReport.vue` 已移除底部独立列拖拽行，改为在顶部列标头直接拖动列边界，拖拽提示线默认隐藏仅在悬停时显示，前端构建通过
- [x] 修复动态报表列宽拖拽会联动其他列的问题：`DynamicReport.vue` 已将渲染层从 table 改为 CSS Grid，列宽由统一 `gridTemplateColumns` 与记忆值驱动，彻底绕开浏览器 table 布局重分配，并完成前端构建验证
- [x] 增加类似 Excel 的全选后批量调整列宽/行高功能：左上角新增全选角按钮，激活后拖动任一列宽或行高手柄会将相同增量应用到当前 sheet 的全部列或全部行，前端构建通过
- [x] 增加单列/单行选择与对齐工具：可点击列标题或行号选中整列/整行并单独拖拽调整尺寸，顶部新增“靠左 / 居中 / 靠右”按钮批量写入对齐样式，前端构建通过
- [x] 修复动态报表对齐按钮前端不生效：`DynamicReport.vue` 改为按坐标合并 `draftCells` 与原始 cell 后再计算 `textAlign`，`useDynamicReportEditor.ts` 保存 payload 现包含 `style_key`，前端构建通过
- [x] 增加双击自动适配列宽/行高：双击任一列宽或行高手柄时，会按当前内容自动估算并设置该列或该行尺寸，前端构建通过
- [x] 修改报表分组导航为纯动态报表：`client/src/router/index.ts` 删除固定报表路由，改为 5 个动态报表入口；`client/src/views/Layout.vue` 与 `client/src/views/Dashboard.vue` 已同步切换为动态报表导航，前端构建通过
- [x] 动态报表支持点击菜单后直接提示期间并生成：`client/src/views/report/DynamicReport.vue` 已根据路由进入直达报表模式，自动弹出年份和月份输入框并执行模板生成，同时隐藏模板选择/导入/结构编辑按钮，前端构建通过
- [x] 将动态报表生成改为单个年月模态框：`client/src/views/report/DynamicReport.vue` 已把原来的两个连续 prompt 改成一个弹窗内同时输入年份和月份，再统一校验后生成报表，前端构建通过
- [x] 美化动态报表生成年月弹框：`client/src/views/report/DynamicReport.vue` 已为生成弹框增加头部说明区、卡片化年月输入区和统一按钮样式，前端构建通过
- [x] 将生成年月弹框改为下拉选择并优化布局：`client/src/views/report/DynamicReport.vue` 已将年份/月份输入改为下拉选择器并使用更紧凑的双列表单布局，前端构建通过
- [x] 调整报表导航与模板维护入口：`client/src/router/index.ts` 新增 `/report/run/{code}` 直达生成路由用于菜单点击弹出期间生成，`client/src/views/Layout.vue` 新增“报表模板维护”入口保留编辑器；`client/src/views/Dashboard.vue` 的快捷入口同步改为直达生成路由，前端构建通过
- [x] 修复直达生成页面因 keep-alive 未重复弹窗的问题：`client/src/views/report/DynamicReport.vue` 新增按 `route.fullPath` 跟踪的自动触发标记，确保每次进入 `/report/run/{code}` 都会弹出期间选择并可直接生成数据，前端构建通过
- [x] 修复直达报表路由的 code 识别来源：`DynamicReport.vue` 改为从 `route.meta.dynamicReportCode` 判断直达运行模式，并补齐按 `route.fullPath` 切换时的重新加载/自动弹窗逻辑
- [x] 执行前端验证：`npm run build --workspace=client` 通过
- [x] 执行 E2E 验证：`npm run test:e2e --workspace=client -- report-direct-run.spec.ts` 通过
- [x] 在桌面创建一键启动脚本（`/Users/luojun/Desktop/启动CW财务系统.command`），可分别启动前后端开发服务
- [x] 新增报表过账诊断接口 `GET /api/report/diagnostics/posting-status`，覆盖凭证/分录/余额计数、金额汇总、报表科目覆盖率与差异提示，并完成鉴权联调验证
- [x] 修复凭证审核页批量审核逻辑：已勾选凭证时不再强制校验日期区间与凭证类型
- [x] 修复凭证审核页批量过账前端过滤：仅排除已过账凭证，其余交由后端统一校验
- [x] 修复凭证审核页批量过账逐条刷新导致仅处理一张：批量过账改为循环时跳过刷新、完成后统一刷新列表
- [x] 调整导航文案：将“凭证审核”改为“凭证管理”
- [x] 修复导航硬编码：Layout 侧边栏与 Dashboard 快捷入口中的“凭证审核”统一改为“凭证管理”
- [x] 完善审计日志与可追溯信息（记录预览参数、执行人、来源）
- [x] 补齐自动结转服务测试：边界场景/并发场景/配置缺失场景
- [x] 增加前端交互完善：执行前二次确认信息、执行后结果明细与失败原因提示
- [x] 增加允许直接过账的参数配置（允许跳过审核直接过账）
- [x] 新增 ACD 导入当前账套脚本：增加 `server/src/scripts/importAcdToCurrentAccountSet.ts` 与 `db:import:acd` 命令，支持解析 `xt.txt` / `pzlx.txt` / `kmbm.txt` / `nc.txt` 并进行 dry-run 导入校验
- [x] 为 ACD 报表模板导入补充基础存储骨架：`server/src/db/schema.sql` 新增 `report_definitions` / `report_sheets` / `report_template_sources` / `report_cells` / `report_formula_functions`，`importAcdToCurrentAccountSet.ts` 已接入 `bbml.txt` 与 `bb*.vts` 的基础导入脚手架并完成 dry-run 验证
- [x] 为 ACD 报表模板导入补充 VTS 结构化落库：`server/src/scripts/importAcdToCurrentAccountSet.ts` 新增 VTS sheet/cell/formula 解析与 `report_cells`、`report_formula_functions` 写入逻辑，并在 dry-run 中输出 `report_templates` 统计
- [x] 按真实 VTS 样本调整 ACD 报表解析：改为从二进制模板中抽取可读字符串、Sheet 名称与 `@函数(...)` 公式，dry-run 已识别 `definitions=4, sheets=6, cells=7705, formulas=5`
- [x] 完成 ACD 报表模板正式导入：补齐目标库报表表结构后执行 `db:import:acd`，当前账套已写入 `report_definitions=4`、`report_sheets=6`、`report_cells=7705`、`report_formula_functions=5`
- [x] 新增动态报表模板查看链路：后端增加 `GET /api/report/templates` 与 `GET /api/report/templates/:code`，前端新增 `/report/dynamic/:code?` 页面与菜单入口，可读取已导入 ACD 模板的 sheet/cell/formula 原始结构
- [x] 优化 ACD 动态报表 VTS 解析过滤：`importAcdToCurrentAccountSet.ts` 新增 VTS 噪音 token 过滤规则，dry-run 已将 `report_cells` 从 7705 降至 969，保留中文项目名、Sheet 标记与 `@函数(...)` 公式主干
- [x] 将 ACD 动态报表 VTS 提取收紧为白名单策略：仅保留 `Sheet` 标记、`@函数(...)` 公式、中文项目名与少量报表标题字段，重新导入后 `report_cells` 收敛到 742，`收入费用表` 已能按“标题/项目/公式”主干展示
- [x] 改进 ACD 动态报表 sheet 命名与行列布局启发式：VTS 解析按标题 token 推断 sheet 名，并将标题/项目行与公式值按两列骨架分行落库；重新导入后 `收入费用表` 主体行已更接近“项目在左、公式在右”的阅读顺序
- [x] 清理 ACD 动态报表孤立标题 sheet 与命名优先级：避免将 `制表：`、负责人字段用作 sheet 名；重新导入后主 sheet 已命名为 `收 入 费 用 表`，但 `(...定义)` 孤立标题 sheet 仍保留，后续需继续决定是合并还是直接忽略
- [x] 继续过滤 ACD 动态报表 `(...定义)` 孤立标题 sheet：`server/src/scripts/importAcdToCurrentAccountSet.ts` 跳过仅含 `(...定义)` 的 token/sheet 后，重新 dry-run/import 结果收敛为 `definitions=4, sheets=4, cells=741, formulas=5`，`收入费用表` 现仅保留主 sheet `收 入 费 用 表`（296 cells）
- [x] 收紧 ACD 动态报表 sheet 命名候选规则：`resolvePreferredSheetName` 现排除“请根据…填写此表的公式”与说明类长文本，dry-run 结果保持 `definitions=4, sheets=4, cells=741, formulas=5`；但现有数据库仍保留旧导入结果，后续需在不触发行列唯一约束冲突的前提下完成正式重导入验证
- [x] 修复 ACD 动态报表行列唯一约束冲突：`buildVtsCellsFromStrings` 改为显式按列落位、逐行推进，导入阶段再按 `(rowIndex,colIndex)` 去重后写入；正式重导入已成功，当前 `2/3/4/7` 号模板分别为 `收 入 费 用 表` / `净资产变动表` / `现 金 流 量 表` / `财政拨款预算收入支出表`
- [x] 复核最新动态报表布局启发式结果：重导入后 `3` 号模板的“从预算结余中提取 / 设置专用基金”已落到右列，`7` 号模板的表头碎片集中在右列但主体项目仍保持左列，当前仍需继续优化表头分组策略

- [x] 增加自动结转撤销能力（仅允许撤销系统生成且未过账凭证）
- [x] 增强幂等与并发保护（run 接口并发请求下避免重复插入）

- [x] 增加结转目标科目可配置能力（结转结余/本期盈余科目映射）

- [x] 制定并评审“损益结转（自动结转）继续完善”实施计划
- [x] 完善期间参数校验（year/period 范围与会计期间合法性）并统一错误消息
- [x] 增加自动结转凭证类型可配置能力（独立参数或专用凭证字）
- [x] 修复本地前端 dev 脚本在 Windows 下启动 Vite 失败的问题
- [x] 验证变更并更新任务记录
- [x] 联调自动结转接口与页面（已确认当前 3005 在线服务未加载新路由，接口代码存在但运行环境仍是旧进程）
- [x] 补充自动结转结果跳转入口

- [x] 验证自动结转功能并更新任务记录
- [x] 实现凭证管理自动结转前端页面与路由
- [x] 实现自动结转后端数据结构与接口
- [x] 补充测试并验证结果
- [x] 探索 `voucher.ts` 剩余可清理逻辑
- [x] 实现下一轮 `voucher.ts` 重构
- [x] 补充测试并验证结果
- [x] 验证服务测试并更新任务记录
- [x] 清理 `voucher.ts` 中月结相关流程
- [x] 为月结相关 helper 增加自动化测试
- [x] 验证服务测试并更新任务记录
- [x] 清理 `voucher.ts` 中单条凭证详情读取流程
- [x] 为单条凭证详情读取 helper 增加自动化测试
- [x] 验证服务测试并更新任务记录
- [x] 为批量筛选查询 helper 增加自动化测试
- [x] 验证服务测试并更新任务记录
- [x] 为凭证号生成 helper 增加自动化测试
- [x] 清理 `voucher.ts` 中未使用的批量删除查询 helper
- [x] 验证服务测试并更新任务记录
- [x] 清理 `voucher.ts` 中按 id 读取凭证与已过账判断的重复逻辑
- [x] 为凭证读取与状态判断 helper 增加自动化测试
- [x] 清理 `voucher.ts` 中凭证列表分录组装逻辑
- [x] 为凭证列表分录组装 helper 增加自动化测试
- [x] 验证服务测试并更新任务记录
- [x] 清理 `voucher.ts` 中余额不允许为负的校验逻辑
- [x] 为余额校验 helper 增加自动化测试
- [x] 清理 `voucher.ts` 中录入与修改共用的辅助数据加载逻辑
- [x] 为辅助数据加载 helper 增加自动化测试
- [x] 清理 `voucher.ts` 中单条过账与反过账的共性逻辑
- [x] 为单条过账状态流转 helper 增加自动化测试
- [x] 清理 `voucher.ts` 中单条审核与反审核的共性逻辑
- [x] 为单条审核状态流转 helper 增加自动化测试
- [x] 继续清理 `voucher.ts` 中批量参数校验与查询构造重复逻辑
- [x] 为批量参数解析与查询 helper 增加自动化测试
- [x] 全局将凭证“登账”字样改为“过账”
- [x] 清理 `voucher.ts` 中批量审核与批量删除共享查询逻辑
- [x] 为批量凭证查询逻辑增加自动化测试
- [x] 清理 `voucher.ts` 中批量审核预览与执行的重复逻辑
- [x] 为批量审核查询与校验逻辑增加自动化测试
- [x] 清理 `voucher.ts` 中批量删除预览与执行的重复逻辑
- [x] 为批量删除查询与校验逻辑增加自动化测试
- [x] 继续拆分 `voucher.ts` 中修改凭证的写入逻辑
- [x] 为 `voucher` 修改写入逻辑增加自动化测试
- [x] 清理 `voucher.ts` 中删除与批量删除的重复逻辑
- [x] 为 `voucher` 删除逻辑增加自动化测试
- [x] 继续拆分 `voucher.ts` 中的录入与更新逻辑
- [x] 为 `voucher.ts` 新拆分逻辑增加自动化测试
- [x] 清理 `report.ts` 中辅助余额表查询构造
- [x] 为 `report.ts` 查询构造增加自动化测试
- [x] 清理 `system.ts` 中的高风险 SQL 拼接
- [x] 为 `system.ts` 查询构造增加自动化测试
- [x] 验证账簿查询重构后的端到端行为
- [x] 为 `voucherQuery.ts` 与 `ledgerQuery.ts` 增加查询构造测试
- [x] 清理 `ledger.ts` 明细账剩余 SQL 拼接
- [x] 继续拆分 `voucher.ts` 的查询与批量操作逻辑
- [x] 清理 `ledger.ts` 中的 SQL 拼接与分页构造
- [x] 梳理凭证与余额/月结的数据流和约束
- [x] 为核心后端 API 增加首批自动化验证
- [x] 拆分 `voucher.ts` 与 `report.ts` 超大文件
- [x] 后端基础设置模块第一轮重构：优先清理 `server/src/routes/base.ts` 中的高风险 SQL 拼接与查询构造
- [x] 初始化项目骨架（monorepo: client + server）
- [x] 设计数据库 schema（SQLite, 14 张表）
- [x] 后端核心架构：认证、中间件、路由骨架
- [x] 前端核心架构：Vue3 + Vite + TypeScript + 路由 + 状态管理
- [x] 系统管理视图（账套、用户、角色、参数、日志）
- [x] 基础设置视图（科目、凭证类型、核算项目、期初余额）
- [x] 凭证管理视图（录入、审核、查询）
- [x] 账簿管理视图（总账、明细账、余额表、日记账）
- [x] 辅助核算视图（部门、项目、往来单位等）
- [x] 报表管理视图（资产负债表、收入费用表、现金流量表、净资产变动表、财政拨款收支表）
- [x] Dashboard 工作台数据接入（统计 + 近期凭证）
- [x] 数据安全视图（备份恢复）
- [x] 政府会计制度标准化科目体系（268个科目，70个一级，192个二级，6个三级）
- [x] 收入费用表 API（支持财政拨款收入、事业收入、费用类等12个分类）
- [x] 辅助余额表 API（支持 dept/project/supplier/person/func_class 五种辅助核算）
- [x] AI 凭证异常检测 API
- [x] AI 辅助功能集成（智能摘要、异常检测）
- [x] 安装依赖并验证构建
- [x] 辅助核算类别动态化：新增 aux_categories 表，支持用户自定义核算维度；迁移5个默认类别和11个默认核算项目；科目辅助核算字段改为动态加载
- [x] base/account 页面新增按钮功能调整：将焦点选择的科目作为父科目
- [x] 科目前端界面字段显示统一使用科目名称（含新增科目上级科目显示）
- [x] 修复新增科目保存报错：accounts 表缺少 no_negative 列导致 500
- [x] 继续修复新增科目无法存盘：排查 500 报错根因
- [x] 编辑科目支持修改并保存现金、银行属性
- [x] 科目编辑弹窗中现金/银行/余额不允许负数三个字段横向一行排列
- [x] 修复科目编辑中现金/银行属性无法存盘
- [x] 修复科目保存后 restoreCurrentRow 空指针导致无法存盘
- [x] 凭证审核页面用户体验优化（P0级别）：集成表格搜索、性能监控、操作历史
  - [x] 为 `useVoucherAuditData.ts` 添加 `useTableSearch` 和 `performanceMonitor`
  - [x] 为 `useVoucherAuditActions.ts` 添加 `useOperationHistory` 操作记录
  - [x] 更新 `Audit.vue` 页面添加搜索输入框和使用 `filteredData`
- [x] 修复凭证附件上传请求解析：上传路由挂载 `multer` 中间件并恢复 `req.files`
- [x] 修复附件静态访问路径：后端增加 `/uploads` 静态目录映射
- [x] 修复凭证表单附件回填：前端按上传接口返回数组追加附件
- [x] 完成附件接口联调验证：上传/列表/静态访问/删除全链路通过
- [x] 支持凭证先传附件后保存：新增凭证时附件先进入待上传队列，保存成功后自动上传并支持待上传附件删除
- [x] 完成附件流程联调复验：验证凭证新增后上传附件、附件列表查询、附件删除与凭证删除清理链路
- [x] 完成前端冒烟验证：凭证录入页“先上传附件→删除待上传→重新上传→保存后自动上传”流程通过，接口复核附件落库成功

- [x] 凭证录入页初始化增加 Loading 遮罩（fetchOptions + fetchDraftVouchers 并行加载，element-loading-text 提示）
- [x] 凭证录入页附件显示改为紧凑按钮标签格式：每个附件显示为可点击标签，点击预览，支持关闭删除
- [x] 凭证保存按钮增加 loading 状态，防止重复提交（新增 submitLoading ref，传入 VoucherEntryForm）
- [x] 凭证录入页借贷差额实时显示：不平衡时显示具体差额数字（如"借贷不平衡，差额 100.00"），平衡时显示 ✓
- [x] 凭证录入页顶部新增凭证导航与更多操作（首张/上一张/下一张/末张、复制/插入/删除），并将底部操作区精简为保存/取消
---

## 运行状态

- 后端: http://localhost:3005 (tsx, bash 02166d)
- 前端: http://localhost:5175 (Vite dev, bash aa163e)
- 默认账户: admin / admin123

## 使用说明

### 任务状态

- `- [ ]` 待办/进行中
- `- [x]` 已完成

### 分类

- **进行中**: 当前正在处理的任务
- **待办**: 计划要做但还没开始的任务
- **已完成**: 已经完成的任务
