# Dream Skin Codex

[![CI](https://github.com/zz555z/dream-skin-codex/actions/workflows/ci.yml/badge.svg)](https://github.com/zz555z/dream-skin-codex/actions/workflows/ci.yml)
[![Release](https://github.com/zz555z/dream-skin-codex/actions/workflows/release.yml/badge.svg)](https://github.com/zz555z/dream-skin-codex/actions/workflows/release.yml)

面向 **Codex / ChatGPT 桌面端** 的一键换肤工具（Tauri 2 + React 18 + Vite + TypeScript + Rust）。

**内置 Dream Skin 引擎（macOS + Windows）**：打开应用即可安装、换肤、切换主题，无需再单独下载引擎仓库。

<p align="center">
  <img src="src-tauri/icons/icon-preview-256.png" alt="Dream Skin icon" width="128" />
</p>

## 功能

- 一键安装 / 重装引擎（应用内置资源）
- 应用皮肤 / 暂停 / 恢复官方外观
- 导入纯背景图，自动保存到主题库
- 内置 4 套预设主题，可一键切换
- 复制 AI 生图提示词（尺寸 + 禁止项模板）
- macOS / Windows 双端支持

## 内置预设

| 预设 | 说明 |
| --- | --- |
| 桥本有菜 | 柔光人像示例 |
| Gothic Void Crusade | 哥特虚空远征 |
| 小猫咪 | 软萌治愈 |
| 河北彩花 | 清透彩花 |

> 预设与自定义主题都会出现在应用「主题库」中。上传图片后点「应用已选图片」会自动保存为自定义主题。

## 使用（最终用户）

1. 安装并至少启动过一次官方 **Codex / ChatGPT 桌面端**
2. **Windows 额外要求**：安装 [Node.js 22+](https://nodejs.org)（勾选 *Add to PATH*），装好后重新打开本应用
   macOS 可直接使用系统/应用内运行时，一般无需单独装 Node
3. **完全退出** Codex / ChatGPT
4. 打开 Dream Skin → 点 **一键安装引擎**
5. 安装完成后选择主题并 **应用皮肤**

### 背景图建议

- 尺寸：`2560 × 1440`（16:9）
- 纯壁纸，不要带侧栏 / 按钮 / 文字 / 水印
- 处理后建议 ≤ 16MB

应用右上角有 **复制生图提示词**，可直接丢给 AI 生图。

### 不会做什么

- 不修改官方 `.app` / `app.asar` / WindowsApps
- CDP 仅绑定本机 loopback
- 与 API 中转 / 代理配置互相独立

## 下载发布包

GitHub Releases：

https://github.com/zz555z/dream-skin-codex/releases

| 系统 | 建议下载 |
| --- | --- |
| macOS Apple Silicon | `*_aarch64.dmg` |
| macOS Intel | `*_x64.dmg` |
| Windows 64 位 | `*_x64-setup.exe` |

### macOS 打开提示

若提示“已损坏 / 无法打开”，把 App 拖到「应用程序」后执行：

```bash
xattr -cr /Applications/Dream\ Skin.app
```

## 开发环境

需要：

- Node.js 20+
- npm
- Rust / Cargo
- macOS：Xcode Command Line Tools
- Windows：WebView2 + Visual Studio C++ Build Tools

```bash
npm install
npm run tauri:dev
```

仅前端：

```bash
npm run dev
```

类型检查：

```bash
npm run check
```

## 本地打包

```bash
npm run tauri:build
```

产物目录：

- macOS：`src-tauri/target/release/bundle/dmg/`、`.../macos/`
- Windows：`src-tauri/target/release/bundle/nsis/`

## GitHub Actions 自动打包

本仓库已包含：

- `.github/workflows/ci.yml`：push / PR 时做前端 typecheck + Rust `cargo check`
- `.github/workflows/release.yml`：打 `v*` 标签后自动构建

  - macOS Intel（x86_64）
  - macOS Apple Silicon（aarch64）
  - Windows NSIS 安装包

发布方式：

```bash
git tag v1.0.0
git push origin v1.0.0
```

或在 GitHub Actions 页面手动运行 **Release**，填写 tag（例如 `v1.0.1`）。

构建完成后会自动创建 / 更新 GitHub Release，并上传安装包。

## 内置引擎与路径

打包资源：

```text
src-tauri/resources/engine/
  macos/     # Dream Skin macOS 引擎
  windows/   # Dream Skin Windows 引擎
```

安装后运行位置：

| 平台 | 引擎 | 状态 / 主题库 |
| --- | --- | --- |
| macOS | `~/.codex/codex-dream-skin-studio` | `~/Library/Application Support/CodexDreamSkinStudio` |
| Windows | `%LOCALAPPDATA%\CodexDreamSkin\engine` | `%LOCALAPPDATA%\CodexDreamSkin` |

同步上游 `Codex-Dream-Skin` 引擎（开发者）：

```bash
npm run sync:engine
# 或
bash scripts/sync-engine.sh
```

手动补种 4 套预设到本机主题库（macOS）：

```bash
bash scripts/seed-four-presets.sh
```

## 技术栈

- Tauri 2
- React 18
- Vite
- TypeScript
- Rust

## 相关项目

- 引擎源码（若本地 monorepo 中存在）：`Codex-Dream-Skin`
- 网页版工具（若存在）：`dream-skin-tool`

## License

本仓库默认按源码可见方式分发。预设图片素材请自行确认再分发权利；公开再发布前建议核对人物 / 素材授权。

---

仓库地址：https://github.com/zz555z/dream-skin-codex
