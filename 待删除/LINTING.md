# ESLint 和 Prettier 配置说明

## 使用方法

### 检查代码规范

```bash
npm run lint
```

### 自动修复代码规范问题

```bash
npm run lint:fix
```

### 格式化代码

```bash
npm run format
```

### 检查代码格式

```bash
npm run format:check
```

## 配置文件

- `.eslintrc.cjs` - 根目录ESLint配置（适用于前端Vue代码）
- `server/.eslintrc.cjs` - 后端ESLint配置（适用于Node.js/TypeScript代码）
- `.prettierrc.json` - Prettier格式化配置
- `.prettierignore` - Prettier忽略文件
- `.editorconfig` - 编辑器统一配置

## 规则说明

### ESLint规则

- 基于 `eslint:recommended` 和 `@typescript-eslint/recommended`
- Vue 3 使用 `plugin:vue/vue3-recommended`
- `@typescript-eslint/no-explicit-any`: warn（允许使用any但会警告）
- `@typescript-eslint/no-unused-vars`: warn（未使用变量警告，以\_开头的参数除外）
- `no-console`: 生产环境警告，开发环境允许

### Prettier规则

- 不使用分号（semi: false）
- 使用单引号（singleQuote: true）
- 每行最大100字符（printWidth: 100）
- 2空格缩进（tabWidth: 2）
- ES5尾逗号（trailingComma: 'es5'）
- 箭头函数单参数不加括号（arrowParens: 'avoid'）
- LF换行符（endOfLine: 'lf'）

## IDE集成

### VS Code

安装以下扩展：

- ESLint (dbaeumer.vscode-eslint)
- Prettier - Code formatter (esbenp.prettier-vscode)
- EditorConfig for VS Code (editorconfig.editorconfig)

在 `.vscode/settings.json` 中添加：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## 安装依赖

首次使用需要安装依赖：

```bash
npm install
```
