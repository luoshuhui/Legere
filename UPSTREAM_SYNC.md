# Legere 上游同步与维护工作流指南

本文档记录了 Legere 与官方上游 [readest/readest](https://github.com/readest/readest) 同步更新的标准操作流程与常见问题处理方案。

---

## 一、Git 仓库与分支拓扑

### 1. 远端配置 (Remotes)
- **`origin`**：个人仓库 `https://github.com/luoshuhui/Legere.git`
- **`upstream`**：官方上游 `https://github.com/readest/readest.git`

可通过以下命令验证配置：
```bash
git remote -v
```
若缺少 `upstream`，可执行添加：
```bash
git remote add upstream https://github.com/readest/readest.git
```

### 2. 分支职责 (Branches)
- **`main`**：纯净的上游镜像分支，不包含任何个人定制代码，专用于拉取官方更新。
- **`custom-legere`**：工作与发布分支，包含 Legere 应用重命名、Kindle 图标、全功能权限解锁、窗口尺寸记忆与顶部拖拽体验优化、以及中文 README 等定制提交。

---

## 二、标准同步更新工作流

当官方 Readest 发布新版本或重要更新时，按以下三步执行同步：

### 步骤 1：同步上游最新代码到 main 分支
```bash
# 切换到 main 分支
git checkout main

# 从官方上游拉取最新主干提交
git pull upstream main

# 同步推送到个人仓库的 main 分支
git push origin main
```

### 步骤 2：将定制功能 Rebase 到最新主干上
```bash
# 切换回定制分支
git checkout custom-legere

# 将定制分支的基线变基（rebase）到最新的 main 上
git rebase main
```

> **注意：若遇到冲突（Conflict）：**
> 1. 查看冲突文件：`git status`
> 2. 编辑并解决冲突；
> 3. 标记解决：`git add <冲突文件>`
> 4. 继续变基：`git rebase --continue`
> 5. 如需中止并恢复：`git rebase --abort`

### 步骤 3：更新 Git 子模块（Submodules）
上游项目（如 Tauri 相关依赖）可能更新了 Git 子模块引用，需确保本地子模块同步：
```bash
git submodule update --init --recursive
```

### 步骤 4：推送变基后的定制分支到个人远程仓库
由于执行了 `rebase` 重写了提交历史，推送时需使用 `--force-with-lease`（带安全锁的强制推送），并建议加上 `--no-verify` 跳过耗时的 pre-push 单元测试：
```bash
git push --force-with-lease origin custom-legere --no-verify
```

---

## 三、更新后本地验证与构建

同步完成后，在本地测试并打包构建以验证兼容性：

### 1. 开发模式运行
```bash
# 启动本地开发服务验证功能
pnpm tauri dev
```

### 2. 生产包打包构建
```bash
# 构建 macOS 应用程序 (.app)
pnpm tauri build --bundles app
```
构建产物位于：
`apps/readest-app/src-tauri/target/release/bundle/macos/Legere.app`

---

## 四、定制功能提交清单与修改文件备查

在 Rebase 时，如涉及以下文件冲突，请保留 Legere 的定制逻辑：

| 定制功能 | 修改的核心文件 | 定制内容说明 |
| :--- | :--- | :--- |
| **应用名称与标识符** | `apps/readest-app/src-tauri/tauri.conf.json`<br>`apps/readest-app/src/app/layout.tsx` | 名称为 `Legere`，标识符 `com.luoshuhui.legere` |
| **应用图标** | `apps/readest-app/src-tauri/icons/` | Kindle 风格的 `.icns` 和全套 `.png` |
| **全功能特权解锁** | `apps/readest-app/src/utils/access.ts` | 启用 `isSelfHosted = (): boolean => true` |
| **阅读窗口尺寸记忆** | `apps/readest-app/src/utils/nav.ts`<br>`apps/readest-app/src/app/reader/page.tsx` | 本地存储记录宽度与高度，再次打开读取恢复 |
| **阅读器顶栏拖动优化** | `apps/readest-app/src/app/reader/components/HeaderBar.tsx` | 添加 `data-tauri-drag-region` 增大可拖拽区域 |
| **文档首页** | `README.md`<br>`README_en.md` | 默认首页为中文文档，原英文另存为 `README_en.md` |
