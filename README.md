# SHIT VAULT

SHIT VAULT 是一个 Windows 桌面托盘应用，基于 Tauri 2、React、TypeScript、Zustand、Vitest 和 Rust 构建。

当前正式版本：`v1.0.0`

## 1.0 状态

- Windows 托盘优先：应用启动后默认隐藏，从托盘打开。
- 托盘菜单中文本地化：打开、设置、退出。
- 托盘右键“设置”会直接打开软件设置页。
- 主壳层固定为 `455 x 660` 的右下角弹出窗口。
- 关闭窗口、失焦和 `Esc` 默认隐藏窗口，不退出托盘进程。
- 运行时只能存在一个 `shit-vault.exe` 实例；重复启动会唤起已运行的窗口，不会再开一个进程。
- 安装包固定为当前用户安装模式，保持同一个产品身份，避免 current-user/per-machine 两套安装并存。
- 安装或更新前会检测正在运行的 `shit-vault.exe`，如果程序还在托盘运行，会提示先退出，避免覆盖运行中的 exe。
- `prevent-sleep` 已完成并冻结。
- `auto-mixing` 已完成 1.0 收尾：选择应用、添加应用、排除应用、系统声音开关和双端点音频监听。

## 功能模块

### prevent-sleep

`prevent-sleep` 是原生 Windows 保活模块。它通过 Rust/Tauri 命令执行真实系统行为，不由 React 假装状态。

功能状态：已完成并冻结。除非明确重新打开该功能，否则不要修改原生 keepalive 行为、命令语义、状态模型或设置语义。

当前行为：

- 默认模式是 `idle-keepalive`。
- 默认空闲激活阈值是 `2 分钟 30 秒`。
- 激活后的默认重复间隔是 `5 秒`。
- 空闲检测同时使用键盘和鼠标不活动状态。
- 保活动作使用当前屏幕，并以左下角安全点为目标，内缩 `48px`。
- 满足空闲条件时执行双击保活。
- 支持由 `PgDn` 控制的连续点击模式。
- 卡片启用时锁定设置。
- Windows execution-state API 作为静默备份层使用。

### auto-mixing

`auto-mixing` 是 1.0 重点模块，用来在其它应用发声时自动压低用户选择的音乐/BGM 应用。

当前行为：

- 开关只负责启动和停止模块。
- 设置只能在模块关闭时编辑。
- 选择的应用是需要被压低音量的 duck targets。
- 排除的应用永不触发压低。
- 其它正在发声的应用可以作为触发源。
- 系统声音是否触发由独立开关控制。
- 同时监听默认多媒体和通信渲染端点。
- 模块不会在应用重启后自动恢复启用状态。

## 分发

可直接运行的 release exe：

```text
src-tauri/target/release/shit-vault.exe
```

NSIS 安装包：

```text
src-tauri/target/release/bundle/nsis/SHIT VAULT_1.0.0_x64-setup.exe
```

GitHub Release：

```text
https://github.com/Dave-oioioi/SHIT/releases/tag/v1.0.0
```

## 开发

安装依赖：

```bash
npm install
```

运行前端开发服务：

```bash
npm run dev
```

运行 Tauri 开发应用：

```bash
npm run tauri:dev
```

运行测试：

```bash
npm test
```

构建前端：

```bash
npm run build
```

构建不带安装包的 exe：

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

## 验证

发布前运行：

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build-exe
npm run tauri:build
git diff --check
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
  nsis/
  src/
    main.rs
    auto_mixing.rs
    prevent_sleep.rs
docs/
```

## 模块契约

每个模块必须从 `module.ts` 导出 `ModuleDefinition`：

- `manifest`
- `CardComponent`
- `SettingsComponent`
- `defaultState`
- `defaultSettings`

壳层会自动发现模块。新功能逻辑应保留在 `src/modules/<module-id>/` 和对应 Tauri/Rust 命令中，不应移动到 `AppShell`、`DashboardPage`、托盘代码或全局布局代码里。

## 文档

- [Agent 操作指南](AGENTS.md)
- [术语表](CONTEXT.md)
- [交接文档](docs/HANDOFF.md)
- [Prevent Sleep PRD](docs/PRD-prevent-sleep.md)
- [1.0 发布交接](docs/handoff-v1.0-release.md)
