# NPM Store 📦

一个基于 Lerna 的 monorepo 项目，包含多个高质量的 npm 包，支持 GitHub Actions 自动化发包。

## 🏗️ 项目结构

```
npm-store/
├── packages/
│   ├── cc-cli-run/           # CLI 运行工具
│   ├── cc-git-tag/           # Git 标签工具
│   ├── cc-vite-progress/     # Vite 进度条插件
│   ├── fetch-event-source/   # 事件源请求库
│   └── git-pro/              # Git 增强工具
├── .github/workflows/        # GitHub Actions 工作流
└── lerna.json               # Lerna 配置
```

## 📦 包列表

| 包名 | 版本 | 描述 |
|------|------|------|
| `cc-cli-run` | ![npm](https://img.shields.io/npm/v/cc-cli-run) | CLI 命令运行工具 |
| `cc-git-tag` | ![npm](https://img.shields.io/npm/v/cc-git-tag) | Git 标签管理工具 |
| `cc-vite-progress` | ![npm](https://img.shields.io/npm/v/cc-vite-progress) | Vite 构建进度条插件 |
| `@cjh0/fetch-event-source` | ![npm](https://img.shields.io/npm/v/@cjh0/fetch-event-source) | 增强的事件源请求库 |
| `@cjh0/git-pro` | ![npm](https://img.shields.io/npm/v/@cjh0/git-pro) | Git 工作流增强工具 |

## 🚀 自动化发包

本项目支持 GitHub Actions 自动化发包，提供三种触发方式：

### 🤖 自动触发（推荐）
推送代码到 `main/master` 分支时自动检测变更并发布：

```bash
git add .
git commit -m "feat: 新功能"  # 使用 conventional commits 格式
git push origin master
```

### 🖱️ 手动触发
在 GitHub Actions 页面手动选择包进行发布：

1. 进入 **Actions** → **📦 Publish Packages**
2. 点击 **Run workflow**
3. 选择要发布的包（支持单包或多包）

### 🏷️ 标签触发
为特定包创建标签并推送：

```bash
# 为 git-pro 包创建 1.2.0 版本标签
git tag @cjh0/git-pro@1.2.0
git push origin @cjh0/git-pro@1.2.0
```

## ⚙️ 配置要求

### NPM Token 配置
1. 获取 NPM Token：
   - 访问 [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens)
   - 生成 **Automation** 类型的 token

2. 配置 GitHub Secret：
   - 仓库 **Settings** → **Secrets and variables** → **Actions**
   - 添加 `NPM_TOKEN` secret

### 包权限确认
确保 NPM 账号对所有包有发布权限。

## 🛠️ 本地开发

### 安装依赖
```bash
yarn install
```

### 构建所有包
```bash
# 构建需要构建的包
yarn build  # 或者到各包目录执行构建
```

### 发布预演（本地测试）
```bash
npx lerna publish --dry-run
```

## 📋 版本管理

- **版本策略**: Independent（每个包独立版本）
- **版本规则**: 基于 [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat:` → minor 版本
  - `fix:` → patch 版本
  - `BREAKING CHANGE:` → major 版本

## 🔧 工作流特性

✅ **智能检测**: 自动识别变更的包并发布
✅ **版本管理**: 基于提交信息自动生成版本号
✅ **质量保证**: 发布前自动构建和验证
✅ **详细报告**: 提供完整的发布总结和统计
✅ **错误处理**: 智能错误诊断和恢复建议
✅ **跨平台**: 支持 Windows/Linux/macOS 环境

## 📊 发布统计

每次发布都会生成详细的统计报告，包括：

- 📦 发布的包名和版本号
- ✅ 成功/失败统计
- 🔗 NPM 链接和文档链接
- ⏱️ 执行时间和环境信息

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'feat: 添加新功能'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

## 📄 许可证

[MIT License](LICENSE)

## 🔗 相关链接

- [📦 NPM Registry](https://www.npmjs.com/search?q=%40cjh0)
- [📝 Lerna 文档](https://lerna.js.org/)
- [🏷️ GitHub Releases](https://github.com/cjh-store/npm-store/releases)
