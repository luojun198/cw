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
- **后端地址**：http://localhost:5000
- **启动方式**：双击桌面 `CW Finance` 快捷方式，或运行 `start-services.bat`

## 开发规范

- 前端代码位于 `client/src/`
- 后端代码位于 `server/src/`
- 账簿查询逻辑在 `server/src/services/ledgerQuery.ts`
- 账簿路由在 `server/src/routes/ledger.ts`
