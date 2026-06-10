# SHIT VAULT

SHIT VAULT 是一个 Windows 桌面托盘应用，基于 Tauri、React、TypeScript、Zustand、Vitest 和 Rust 构建。

主壳层现在已经是稳定的产品基础设施。第一个完整落地的模块是 `prevent-sleep`，从产品角度看，它是一个桌面保活工具，而不是字面意义上的睡眠开关。`prevent-sleep` 功能现在已经冻结；除非明确重新打开该功能，否则后续对该模块的修改默认只限 UI。

## 当前状态

- 托盘优先的 Windows 桌面应用。
- 启动后默认隐藏，并从托盘打开。
- 托盘菜单已中文本地化。
- 主壳层 UI 固定为 `455 x 660`。
- 右下角弹出式壳层，使用透明圆角窗口样式。
- 左侧抽屉导航和卡片系统已经完成到需要保护的程度。
- `prevent-sleep` 已经完整接入 Windows 原生行为。
- `prevent-sleep` 功能已经完成并冻结。
- `auto-mixing` 是当前功能开发重点。
- 已通过 Tauri NSIS bundling 启用安装包打包。

## 防止休眠

`prevent-sleep` 卡片已经不再是占位功能。它现在通过 Tauri 命令运行原生 Rust 保活运行时。

功能状态：已完成并冻结。除非用户明确重新打开该功能，否则不要修改原生行为、命令语义、运行时状态或设置行为。明确要求时可以做 UI 层面的打磨。

当前行为：

- 默认模式是 `idle-keepalive`。
- 默认空闲激活阈值是 `2 分钟 30 秒`。
- 激活后的默认重复间隔是 `5 秒`。
- 空闲检测同时使用键盘和鼠标不活动状态。
- 保活动作使用当前屏幕，并以左下角安全点为目标，内缩 `48px`。
- 满足空闲条件时，保活动作会执行双击。
- 也支持连续点击模式。
- 连续点击由热键控制，默认是 `PgDn`。
- 按一次开始连续点击，再按一次停止。
- 移动鼠标也会停止连续点击。
- 同一时间只能武装一种模式。
- 卡片启用时，设置会被锁定。
- Windows execution-state API 会作为静默备份层使用。
- 卡片只在真实错误或降级状态下显示内联文本。

## 分发

可直接运行的桌面可执行文件：

```text
src-tauri/target/release/shit-vault.exe
```

NSIS 安装包：

```text
src-tauri/target/release/bundle/nsis/SHIT VAULT_0.1.0_x64-setup.exe
```

辅助启动脚本：

```text
launch-shit-vault.cmd
```

## 文档

- [Agent 操作指南](AGENTS.md)
- [术语表](CONTEXT.md)
- [交接文档](docs/HANDOFF.md)
- [Prevent Sleep PRD](docs/PRD-prevent-sleep.md)

## 技术栈

- React 18
- TypeScript
- Vite
- Zustand
- Vitest
- Tauri 2
- Rust

## 快速开始

安装依赖：

```bash
npm install
```

运行前端开发服务器：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

构建前端：

```bash
npm run build
```

运行 Tauri 开发应用：

```bash
npm run tauri:dev
```

构建不带安装包的可运行 exe：

```bash
npm run tauri:build-exe
```

构建 NSIS 安装包：

```bash
npm run tauri:build
```

如果当前 PowerShell 会话中无法使用 `cargo`：

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

## 项目结构

```text
src/
  app/
    shell/
    registry/
    layout/
    state/
    hooks/
    ui/
  modules/
    auto-mixing/
    prevent-sleep/
src-tauri/
  src/
    main.rs
docs/
```

## 模块契约

每个模块都必须从 `module.ts` 导出一个 `ModuleDefinition`：

- `manifest`
- `CardComponent`
- `SettingsComponent`
- `defaultState`
- `defaultSettings`

壳层会自动发现模块。新增普通模块时，不应需要修改 `AppShell`、`DashboardPage` 或托盘代码。

## 开发规则

- 保持壳层代码稳定。
- 将功能行为放在模块和 Tauri 命令中。
- 将模块状态和模块设置分开。
- 只有在真实命令成功后才更新卡片启用状态。
- 原生命令失败时，显示简洁的错误反馈。
- 保持共享的 `CardFrame` 视觉语言。

## 验证

提交前建议运行：

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build-exe
git diff --check
```

## 下一步重点

在壳层和 `prevent-sleep` 模块已经落地并冻结后，当前功能工作应聚焦在 `auto-mixing`。保持壳层代码稳定，将功能逻辑保留在 `src/modules/auto-mixing/` 和 `src-tauri/src/auto_mixing.rs` 中，并延续现有 React -> Tauri -> Rust 命令模式。
