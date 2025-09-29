# NPM Store 📦

一个基于 Lerna 的 monorepo 项目，包含多个高质量的 npm 包。

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

## 📋 版本管理

- **版本策略**: Independent（每个包独立版本）
- **版本规则**: 基于 [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat:` → minor 版本
  - `fix:` → patch 版本
  - `BREAKING CHANGE:` → major 版本

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
