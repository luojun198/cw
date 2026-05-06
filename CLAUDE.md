# CLAUDE.md

## 语言规则

**所有交流必须使用中文**，包括：
- 回复和解释
- 计划（Plan）内容
- 任务列表（Todos）
- 代码注释（除非已有英文注释风格）
- 错误分析和建议

## 项目上下文

每次会话开始时，先读取以下文件了解项目状态：

1. 读取 `.claude-summary.md` 了解项目概述
2. 读取 `.tasks/current.md` 了解当前任务状态

## 项目信息

- **项目名称**：CW Finance（财务记账系统）
- **技术栈**：Vue 3 + TypeScript（前端）、Node.js + Express + SQLite（后端）
- **前端地址**：http://localhost:5175
- **后端地址**：http://localhost:3005
- **启动方式**：双击桌面 `CW Finance` 快捷方式，或运行 `start-services.bat`

## 开发规范

- 前端代码位于 `client/src/`
- 后端代码位于 `server/src/`
- 账簿查询逻辑在 `server/src/services/ledgerQuery.ts`
- 账簿路由在 `server/src/routes/ledger.ts`

## 重启服务规则

**凡是修改了后端代码（`server/src/` 下任何文件），必须在完成修改后自动重启前后端服务。**

重启命令（PowerShell）：
```powershell
# 关闭占用端口的进程
foreach ($port in @(3005, 5175, 5173, 5174)) {
    $pids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2
# 重新启动
Start-Process "cmd" -ArgumentList "/k cd /d D:\kf\cw0423 && npm run dev:server" -WindowStyle Normal
Start-Sleep -Seconds 3
Start-Process "cmd" -ArgumentList "/k cd /d D:\kf\cw0423 && npm run dev:client" -WindowStyle Normal
```

或直接调用：
```powershell
Start-Process "D:\kf\cw0423\start-services.bat"
```

## 优化日志更新规则

**每次完成功能修改、优化或 bug 修复后，必须同步更新 `优化日志.md` 文件。**

更新要求：
1. **时机**：在完成代码修改并测试通过后立即更新
2. **格式**：按日期分组，每项修改包含：
   - 修改标题（简明扼要）
   - 修改文件列表（完整路径）
   - 具体说明（详细描述修改内容、技术实现）
   - 修改原因（为什么要这样改）
   - 影响范围（如有）
3. **内容要求**：
   - 记录所有修改的文件路径
   - 说明关键代码逻辑变更
   - 如涉及快捷键，同步更新 `快捷键.md`
   - 如涉及数据库，说明迁移脚本或手动操作步骤
4. **特殊情况**：
   - 后端修改：注明是否需要重启服务
   - 数据库修改：注明是否需要运行迁移脚本
   - 配置修改：注明是否需要更新环境变量或配置文件

示例格式：
```markdown
## 2026-04-26

### 1. 功能名称

**修改文件：**
- `client/src/xxx.vue`
- `server/src/xxx.ts`

**具体说明：**
- 详细描述修改内容
- 关键代码逻辑说明

**原因：**
- 为什么要这样修改

**影响范围：**（可选）
- 对其他功能的影响
```
