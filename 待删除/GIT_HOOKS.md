# Git Hooks 使用说明

## 启用 pre-commit hook

将 `.git/hooks/pre-commit.sample` 重命名为 `.git/hooks/pre-commit` 并添加执行权限：

### Linux/macOS

```bash
mv .git/hooks/pre-commit.sample .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Windows (Git Bash)

```bash
mv .git/hooks/pre-commit.sample .git/hooks/pre-commit
```

## 功能

启用后，每次 `git commit` 时会自动：

1. 运行 ESLint 检查代码规范
2. 运行 Prettier 检查代码格式

如果检查失败，提交会被阻止，需要修复问题后重新提交。

## 跳过检查（不推荐）

如果确实需要跳过检查，可以使用：

```bash
git commit --no-verify -m "commit message"
```

## 推荐工作流

1. 开发时保持 VS Code 的自动格式化开启
2. 提交前运行 `npm run lint:fix` 和 `npm run format`
3. 让 pre-commit hook 作为最后一道防线
