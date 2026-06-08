import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "@/app/shell/AppShell";
import { useLayoutStore } from "@/app/state/layoutStore";
import { useModuleSettingsStore } from "@/app/state/moduleSettingsStore";
import { useModuleStateStore } from "@/app/state/moduleStateStore";
import { useRegistryStore } from "@/app/state/registryStore";

describe("AppShell", () => {
  beforeEach(() => {
    useRegistryStore.setState({
      modules: [],
      enabledModuleIds: [],
      diagnostics: {},
    });
    useLayoutStore.setState({
      settingsDrawerModuleId: null,
      expandedModuleId: null,
      moduleOrder: [],
    });
    useModuleStateStore.setState({ stateById: {} });
    useModuleSettingsStore.setState({ settingsById: {} });
    window.localStorage.clear();
  });

  it("renders auto-discovered modules and shows inline settings on expand", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: "自动混音" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "防止休眠" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "展开设置" })[0]!);

    expect(screen.getByText("场景配置")).toBeInTheDocument();
    expect(screen.getByText("默认场景")).toBeInTheDocument();
    expect(screen.getByText("模块行为")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动混音 开关" })).toBeInTheDocument();
  });
});
