# Modular Shell

`Modular Shell` 是一个基于 `Tauri + React + TypeScript` 规划的插件化桌面 App 壳。

当前阶段的目标不是先实现“电脑管家功能”，而是先把一个稳定的 `Plugin-Based Lego Dashboard Shell` 搭好，让后续新增功能遵守唯一扩展路径：

```text
创建模块 -> 注册模块 -> 自动渲染
```

这意味着后续新增功能时：
- 不修改 `App Shell` 主逻辑
- 不修改首页页面结构
- 不手写新的 dashboard 渲染分支
- 只新增一个模块目录并暴露标准 contract

目前已经内置两个 UI 壳模块：
- `auto-mixing`
- `prevent-sleep`

## 当前状态

- 已完成 `Vite + React + TypeScript` 前端壳
- 已完成 `Zustand` 状态层
- 已完成基于 `import.meta.glob` 的模块自动发现
- 已完成两张模块卡片和统一右侧设置抽屉
- 已完成基础测试与生产构建
- 已预留 `src-tauri/` 宿主结构

注意：
- 当前机器未安装 `Rust / Cargo`
- 所以前端壳可运行、可构建
- 但本地还不能直接启动 Tauri 原生窗口

## 技术栈

- `React 18`
- `TypeScript`
- `Vite`
- `Zustand`
- `Vitest`
- `Tauri 2` 占位宿主

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动前端开发环境

```bash
npm run dev
```

### 3. 运行测试

```bash
npm test
```

### 4. 构建前端产物

```bash
npm run build
```

## 目录结构

```text
src/
  app/
    shell/
      AppShell.tsx
      DashboardPage.tsx
      ModuleCardHost.tsx
      ModuleSettingsDrawer.tsx
    registry/
      moduleTypes.ts
      validateModule.ts
      loadModuleRegistry.ts
    layout/
      gridConfig.ts
      layoutEngine.ts
    state/
      registryStore.ts
      layoutStore.ts
      moduleStateStore.ts
      moduleSettingsStore.ts
    hooks/
      useRegisteredModules.ts
      useModuleState.ts
      useModuleSettings.ts
      useOpenModuleSettings.ts
      useToggleModuleEnabled.ts
    ui/
      CardFrame.tsx
      SettingsSection.tsx
  modules/
    auto-mixing/
      module.ts
      AutoMixingCard.tsx
      AutoMixingSettings.tsx
      defaults.ts
    prevent-sleep/
      module.ts
      PreventSleepCard.tsx
      PreventSleepSettings.tsx
      defaults.ts
src-tauri/
  src/
    main.rs
```

## 核心原则

### 1. Shell 只做壳，不做业务判断

Shell 只负责：
- 发现模块
- 校验模块 contract
- 注入统一上下文
- 自动渲染卡片和设置抽屉

Shell 不负责：
- 写死某个模块的 dashboard 逻辑
- 针对某个模块写条件分支
- 单独维护某个模块的路由

### 2. 模块是第一等公民

每个模块必须自带：
- `manifest`
- `CardComponent`
- `SettingsComponent`
- `defaultState`
- `defaultSettings`

### 3. Registry 驱动一切

Dashboard、模块排序、设置抽屉、模块显隐，全部来自 registry。

## 如何新增一个模块

后续新增模块时，只走这一条路径：

### 1. 新建模块目录

```text
src/modules/your-module/
```

### 2. 添加 4 个文件

```text
module.ts
YourModuleCard.tsx
YourModuleSettings.tsx
defaults.ts
```

### 3. 在 `module.ts` 导出标准定义

示意：

```ts
import type { ModuleDefinition } from "@/app/registry/moduleTypes";

const moduleDefinition: ModuleDefinition = {
  manifest: {
    id: "your-module",
    name: "your-module",
    version: "0.1.0",
    title: "Your Module",
    description: "Module description",
    themeColor: "#66ccff",
    icon: "box",
    defaultSize: "2x1",
    minSize: "2x1",
    order: 3,
    enabledByDefault: true,
    hasSettings: true,
  },
  CardComponent: YourModuleCard,
  SettingsComponent: YourModuleSettings,
  defaultState,
  defaultSettings,
};

export default moduleDefinition;
```

### 4. 不需要改任何 Shell 文件

你不需要修改：
- `src/app/shell/AppShell.tsx`
- `src/app/shell/DashboardPage.tsx`
- `src/app/shell/ModuleSettingsDrawer.tsx`
- `src/app/registry/loadModuleRegistry.ts`

因为 registry 会自动发现：

```ts
import.meta.glob("/src/modules/*/module.ts", { eager: true })
```

## 已实现验证

当前测试已覆盖：
- 自动发现有效模块
- 非法模块被 registry 跳过但不会让应用崩掉
- 首页自动渲染 `auto-mixing` 和 `prevent-sleep`
- 点击卡片设置按钮可以打开统一抽屉

## 下一步建议

接下来最合理的推进顺序是：

1. 接入 Rust toolchain，让 `src-tauri` 真正可运行
2. 抽象 `Host API`，为模块暴露系统能力边界
3. 继续新增第 3 个示例模块，验证扩展路径
4. 为模块设置持久化补更多测试
5. 开始实现 `auto-mixing` 和 `prevent-sleep` 的真实系统能力
