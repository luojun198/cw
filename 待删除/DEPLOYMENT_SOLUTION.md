# Windows Server 2012 零依赖部署解决方案

## 问题分析

### 核心问题

better-sqlite3 是一个包含 C++ 原生模块的 npm 包，需要针对特定的 Node.js 版本编译。当前遇到的问题：

1. **PKG 方式**：PKG 使用 Node 18.5.0，但 better-sqlite3 v12.8.0 需要 Node 20+
2. **Portable Node.js 方式**：better-sqlite3 v11.7.0 支持 Node 18，但需要预编译的二进制文件或 Python 环境来编译

### 版本兼容性矩阵

| better-sqlite3 版本 | 支持的 Node.js 版本 | 预编译二进制 |
|-------------------|------------------|------------|
| v12.8.0           | 20.x, 22.x, 23.x, 24.x, 25.x | ✓ |
| v11.7.0           | 18.x, 20.x, 22.x | ✓ |
| v9.6.0            | 16.x, 18.x, 20.x | ✓ |

## 推荐解决方案

### 方案 1：使用 Node.js 20 + better-sqlite3 v12（推荐）

**优点**：
- 使用最新稳定版本
- 有预编译二进制文件
- 性能最优

**步骤**：

1. 下载 Node.js 20.18.3 LTS（Windows Server 2012 支持）
   ```
   https://nodejs.org/dist/v20.18.3/node-v20.18.3-win-x64.zip
   ```

2. 在有网络的机器上安装依赖：
   ```bash
   # 解压 Node.js 20
   # 设置环境变量
   set PATH=D:\node-v20.18.3-win-x64;%PATH%

   # 进入项目目录
   cd d:\kf\cw\server

   # 安装生产依赖（会自动下载预编译的 better-sqlite3）
   npm install --production
   ```

3. 打包部署：
   ```
   deploy-portable/
   ├── node/                   # Node.js 20.18.3
   ├── server/
   │   ├── bundle.cjs
   │   ├── schema.sql
   │   └── node_modules/       # 包含 better-sqlite3 预编译版本
   ├── client/dist/
   ├── data/
   ├── uploads/
   └── start.bat
   ```

### 方案 2：使用预编译的 better-sqlite3 二进制

如果无法重新安装依赖，可以手动下载预编译的二进制文件：

1. 访问 better-sqlite3 releases：
   ```
   https://github.com/WiseLibs/better-sqlite3/releases
   ```

2. 下载对应版本的预编译文件：
   - Node 18: `better-sqlite3-v11.7.0-node-v108-win32-x64.tar.gz`
   - Node 20: `better-sqlite3-v12.8.0-node-v115-win32-x64.tar.gz`

3. 解压到 `node_modules/better-sqlite3/build/Release/better_sqlite3.node`

### 方案 3：使用 Docker（如果目标服务器支持）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY server/dist/bundle.cjs ./
COPY server/schema.sql ./
COPY client/dist ./client/dist
EXPOSE 3005
CMD ["node", "bundle.cjs"]
```

## 当前项目状态

### 已完成

1. ✅ 修复 PKG 构建脚本配置（bundle.mjs → bundle.cjs）
2. ✅ 前端构建完成（client/dist/，约 2.4MB）
3. ✅ 后端 bundle 构建完成（server/dist/bundle.cjs，1.67MB）
4. ✅ 创建自动化打包脚本（scripts/package-portable.bat）
5. ✅ 下载 Node.js 18.20.5 portable 版本

### 待解决

1. ❌ better-sqlite3 原生模块兼容性问题
   - 当前系统：Node 25.9.0
   - 目标环境：Node 18.20.5
   - 需要：Node 18 编译的 better-sqlite3 二进制文件

## 快速解决步骤（推荐）

### 在有网络的 Windows 机器上执行：

```batch
@echo off
echo 准备 Windows Server 2012 部署包...

:: 1. 下载 Node.js 20 LTS
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.3/node-v20.18.3-win-x64.zip' -OutFile 'node20.zip'"
powershell -Command "Expand-Archive -Path 'node20.zip' -DestinationPath '.'"

:: 2. 使用 Node 20 安装依赖
cd server
..\node-v20.18.3-win-x64\npm.cmd install --production
cd ..

:: 3. 打包
mkdir deploy-final
xcopy node-v20.18.3-win-x64 deploy-final\node\ /E /I /Y
xcopy server\dist\bundle.cjs deploy-final\server\ /Y
xcopy server\schema.sql deploy-final\server\ /Y
xcopy server\node_modules deploy-final\server\node_modules\ /E /I /Y
xcopy client\dist deploy-final\client\dist\ /E /I /Y
mkdir deploy-final\data
mkdir deploy-final\uploads

:: 4. 创建启动脚本
echo @echo off > deploy-final\start.bat
echo chcp 65001 ^>nul >> deploy-final\start.bat
echo title 财务记账系统 >> deploy-final\start.bat
echo set PATH=%%~dp0node;%%PATH%% >> deploy-final\start.bat
echo node server\bundle.cjs >> deploy-final\start.bat
echo pause >> deploy-final\start.bat

echo 完成！部署包位于 deploy-final 目录
pause
```

### 在目标 Windows Server 2012 上：

1. 复制整个 `deploy-final` 文件夹到服务器
2. 双击 `start.bat` 启动
3. 浏览器访问 http://localhost:3005

## 技术细节

### better-sqlite3 预编译二进制命名规则

```
better_sqlite3.node
位置：node_modules/better-sqlite3/build/Release/
或：node_modules/better-sqlite3/lib/binding/node-v{ABI}-{platform}-{arch}/
```

ABI 版本对应：
- Node 16: v93
- Node 18: v108
- Node 20: v115
- Node 22: v127

### 为什么 PKG 不适合

PKG 将 Node.js 和代码打包成单个可执行文件，但：
1. 原生模块需要在运行时动态加载
2. PKG 的 Node 版本固定（18.5.0），无法升级
3. better-sqlite3 v12 不支持 Node 18

### 为什么推荐 Portable Node.js

1. 完全控制 Node.js 版本
2. 可以使用预编译的原生模块
3. 部署包更小（~100MB vs ~50MB PKG）
4. 更容易调试和维护

## 文件清单

### 当前项目文件

```
d:\kf\cw/
├── client/dist/                    # ✅ 前端构建产物（2.4MB）
├── server/
│   ├── dist/
│   │   ├── bundle.cjs              # ✅ 后端 bundle（1.67MB）
│   │   └── cw-finance.exe          # ⚠️  PKG 可执行文件（49MB，有兼容性问题）
│   ├── schema.sql                  # ✅ 数据库 schema
│   ├── node_modules/               # ⚠️  Node 25 编译的依赖
│   └── package.json                # ✅ 已更新为 better-sqlite3 v11.7.0
├── deploy-portable/                # ⚠️  未完成（缺少正确的 better-sqlite3）
│   ├── node/                       # ✅ Node 18.20.5
│   ├── server/
│   │   ├── bundle.cjs              # ✅
│   │   ├── schema.sql              # ✅
│   │   └── node_modules/           # ❌ better-sqlite3 缺少二进制文件
│   ├── client/dist/                # ✅
│   ├── start.bat                   # ✅
│   └── README.md                   # ✅
├── node-v18.20.5-win-x64.zip       # ✅ 已下载
└── scripts/
    ├── package-deploy.bat          # ✅ PKG 打包脚本
    └── package-portable.bat        # ✅ Portable 打包脚本
```

## 下一步行动

### 选项 A：使用 Node 20（最简单）

1. 下载 Node 20.18.3
2. 重新安装依赖
3. 打包部署

### 选项 B：手动下载 better-sqlite3 二进制

1. 从 GitHub releases 下载 Node 18 版本的 better-sqlite3
2. 放入 `deploy-portable/server/node_modules/better-sqlite3/build/Release/`
3. 测试运行

### 选项 C：在有 Python 环境的机器上编译

1. 安装 Python 3.x 和 Visual Studio Build Tools
2. 使用 Node 18 运行 `npm rebuild better-sqlite3`
3. 复制编译好的 `better_sqlite3.node` 到部署包

## 联系与支持

如需进一步协助，请提供：
1. 目标服务器的 Windows 版本
2. 是否有网络访问
3. 是否可以安装 Python/编译工具
4. 首选的部署方式（单文件 exe vs portable Node.js）
