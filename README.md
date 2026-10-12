# Legere 电子书阅读器

[简体中文](README.md) | [English](README_en.md)

Legere 是基于开源电子书阅读器 [Readest](https://github.com/readest/readest) 定制的轻量、无限制个人桌面端阅读器。

---

## 一、项目目的

官方原版 Readest 是一款优秀的跨平台电子书阅读器，但在默认桌面端体验中存在部分功能门禁（如第三方网盘同步、自定义 AI 翻译需付费订阅解锁）以及窗口尺寸不记忆、macOS 顶栏拖拽困难等使用痛点。

本项目旨在：
1. **解除客户端所有功能限制**：无需注册登录官方账号，即可自由使用 WebDAV 同步、自定义大模型翻译、离线语音缓存等全部高级功能。
2. **优化桌面端阅读与交互体验**：解决阅读窗口每次打开被重置为 800x600 的缺陷，并改善 macOS 无边框窗口难于拖动的交互手感。
3. **保持轻量与上游同步能力**：所有改动严格遵循极简（KISS）原则，不侵入复杂底层架构，确保可以长期无缝跟进上游代码的最新迭代与 Bug 修复。

---

## 二、修改与定制功能清单

### 1. 应用品牌与外观定制
- **应用名称**：修改为 **Legere**（包含应用窗口标题、Web 元数据、macOS 安装包名称）。
- **应用标识符**：调整为独立 Bundle ID，避免与官方原版安装包冲突。
- **应用图标**：替换为定制 Kindle 风格图标（`.icns`），并自动生成了各分辨率（16x16 至 512x512）的全套配套图标文件。

### 2. 客户端全功能特权解锁（免登录）
利用官方预留的自托管（Self-Hosted）机制，在客户端代码层开启全特权直通：
- **第三方云存储同步自由**：解除原版对 Free 用户的暂停限制，完整支持 WebDAV（坚果云、群晖 NAS 等）、Google Drive、OneDrive、S3 等个人网盘双向同步，不再受官方云盘 500MB 的容量约束。
- **自定义 AI 翻译与语境词典**：解除自定义翻译器的 Premium 置灰限制，支持自由接入个人私有的 OpenAI、DeepSeek、本地 Ollama 或自建大模型 API。
- **离线 TTS 章节音频下载**：解锁按章节预先批量下载朗读音频的功能。
- **Audiobookshelf 离线下载**：支持将 ABS 媒体库的有声书与电子书下载至本地离线收听和阅读。
- **局域网 Nearby BookDrop 配对**：解锁信任设备配对，设备间通过局域网传输书籍无需每次手动确认。

### 3. 阅读窗口尺寸与几何状态记忆
- **问题根源**：原版在点击图书新开窗口时，硬编码写死了 `width: 800, height: 600, center: true`，且窗口关闭即销毁，每次打开都被重置。
- **优化方案**：在阅读窗口组件中监听窗口尺寸变更并自动持久化；再次创建阅读窗口时优先读取上次调节的尺寸。
- **使用体验**：自由拖动调节窗口大小后，再次打开任意图书均能精准恢复为上次设定的窗口尺寸。

### 4. macOS 窗口拖拽体验优化
- **问题根源**：macOS 采用 Overlay 隐藏原生系统标题栏设计，加上沉浸式阅读时控制条自动隐藏，导致整个窗口顶部没有任何拖拽手柄，用户只能小心翼翼寻找窗口最上边缘 1 像素的极窄缝隙。
- **优化方案**：在顶部控制栏容器、中间图书标题区域以及顶部感应条上全面声明 Tauri 标准拖拽属性（`data-tauri-drag-region`）。
- **使用体验**：鼠标移至顶部浮出控制栏后，抓取中间书名或任意空白区域即可随心拖拽移动窗口，操作自然流畅。

---

## 三、保持跟进上游更新的机制

本项目采用独立分支（`custom-legere`）隔离维护，未对 `main` 主分支造成任何污染。后续上游官方有版本更新或修复时，通过 Git Rebase 即可快速同步：

```bash
# 步骤 1：同步上游主分支代码
git checkout main
git pull origin main

# 步骤 2：将个人定制分支变基到最新上游
git checkout custom-legere
git rebase main
```

如需撤销或回退任何定制修改，可直接通过 Git 进行秒级安全回滚：
```bash
# 撤销最近一次定制提交
git revert HEAD

# 或者重置到指定提交
git reset --hard <commit-hash>
```

---

## 四、本地编译与打包发布指南（macOS）

### 1. 环境准备
确保本机已安装 Node.js (20+)、pnpm 以及 Rust stable 工具链：
```bash
node -v
pnpm -v
rustc -vV
```

### 2. 初始化子模块与依赖
本项目使用了 Git Submodules 管理部分底层依赖（如 foliate-js、tauri 等），首次克隆需完整拉取：
```bash
# 拉取并初始化所有子模块
git submodule update --init --recursive

# 安装依赖
pnpm install

# 初始化内置阅读器引擎静态资源
pnpm --filter @readest/readest-app setup-vendors
```

### 3. 编译 Release 安装包
进入应用目录执行 Tauri 构建：
```bash
cd apps/readest-app

# 编译生成 Legere.app（速度最快，适合本地直接使用）
pnpm tauri build --bundles app

# 或者编译生成 Legere.dmg 安装磁盘映像
pnpm tauri build --bundles dmg
```

构建产物将保存在项目根目录的 `target/release/bundle/` 中：
- `target/release/bundle/macos/Legere.app`
- `target/release/bundle/dmg/Legere_*.dmg`

### 4. 首次打开免签名提示处理
由于本地自主编译缺少苹果商业开发者证书，首次打开若遇系统安全提示，可在终端运行去除隔离属性：
```bash
xattr -cr /Applications/Legere.app
```
或者前往 macOS **系统设置 -> 隐私与安全性**，点击页面底部的 **“仍要打开”**。
