import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/app/shell/AppShell";
import { useLayoutStore } from "@/app/state/layoutStore";
import { useModuleSettingsStore } from "@/app/state/moduleSettingsStore";
import { useModuleStateStore } from "@/app/state/moduleStateStore";
import { useRegistryStore } from "@/app/state/registryStore";

const { eventListeners, hideMock, invokeMock, shellNavigationResponse } = vi.hoisted(() => {
  const shellNavigationResponse = { value: { view: "home" } };

  return {
    eventListeners: new Map<string, (event: { payload?: unknown }) => void>(),
    hideMock: vi.fn(async () => undefined),
    invokeMock: vi.fn(async (command: string, args?: unknown) => {
      if (command === "app_shell_navigation") {
        return shellNavigationResponse.value;
      }

      if (command === "app_settings_status") {
        return { launchOnStartup: false };
      }

      if (command === "app_set_launch_on_startup") {
        const enabled =
          typeof args === "object" &&
          args !== null &&
          "enabled" in args &&
          Boolean(args.enabled);
        return { launchOnStartup: enabled };
      }

      return undefined;
    }),
    shellNavigationResponse,
  };
});

const AUTO_MIXING = "\u81ea\u52a8\u6df7\u97f3";
const PREVENT_SLEEP = "\u9632\u6b62\u4f11\u7720";
const SETTINGS = "\u8bbe\u7f6e";
const MAIN_STALL = "\u4e3b\u5751\u4f4d";
const EXPAND_SETTINGS = "\u5c55\u5f00\u8bbe\u7f6e";
const SELECT_APPS = "\u9009\u62e9\u5e94\u7528";
const ADD_APPS = "\u6dfb\u52a0\u5e94\u7528";
const EXCLUDE_APPS = "\u6392\u9664\u5e94\u7528";
const LAUNCH_ON_STARTUP = "\u5f00\u673a\u542f\u52a8";
const CHINESE_NAME = "\u7caa\u5e93";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (eventName: string, handler: (event: { payload?: unknown }) => void) => {
    eventListeners.set(eventName, handler);
    return () => {
      eventListeners.delete(eventName);
    };
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    hide: hideMock,
  })),
}));

describe("AppShell", () => {
  beforeEach(() => {
    eventListeners.clear();
    hideMock.mockClear();
    invokeMock.mockClear();
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
    shellNavigationResponse.value = { view: "home" };
  });

  it("renders auto-discovered modules and shows inline settings on expand", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: PREVENT_SLEEP })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: EXPAND_SETTINGS })[0]!);

    expect(screen.getByRole("heading", { name: SELECT_APPS })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /添加应用/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /排除应用/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${AUTO_MIXING} \u5f00\u5173` })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /添加应用/ }));

    expect(screen.getByRole("heading", { name: ADD_APPS })).toBeInTheDocument();
    expect(screen.getByLabelText("Search app candidates")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "\u8fd4\u56de\u9009\u62e9\u5e94\u7528" }));
    await user.click(screen.getByRole("button", { name: /排除应用/ }));

    expect(screen.getByRole("heading", { name: EXCLUDE_APPS })).toBeInTheDocument();
  });

  it("keeps settings visibility in sync with toolset drawers", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: SETTINGS }));
    expect(await screen.findByRole("heading", { name: "\u5168\u5c40\u8bbe\u7f6e" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: LAUNCH_ON_STARTUP })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: `${MAIN_STALL} \u8bbe\u7f6e\u680f` })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: AUTO_MIXING }));
    await user.click(screen.getByRole("button", { name: MAIN_STALL }));

    expect(screen.queryByRole("heading", { name: AUTO_MIXING })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: PREVENT_SLEEP })).toBeInTheDocument();
  });

  it("opens vault info when the top-left logo is clicked", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: SETTINGS }));
    expect(await screen.findByRole("heading", { name: SETTINGS })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Shit Vault" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Shit Vault" })).toBeInTheDocument();
    expect(screen.getByText(CHINESE_NAME)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dave-oioioi/SHIT" })).toHaveAttribute(
      "href",
      "https://github.com/Dave-oioioi/SHIT",
    );
    expect(screen.getByText("v1.0.0")).toBeInTheDocument();
  });

  it("switches to settings when tray navigation requests it", async () => {
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    await act(async () => {
      eventListeners.get("shell:navigate")?.({ payload: { view: "settings" } });
    });

    expect(await screen.findByRole("heading", { name: SETTINGS })).toBeInTheDocument();
  });

  it("opens settings from the pending tray navigation target on mount", async () => {
    shellNavigationResponse.value = { view: "settings" };

    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: SETTINGS })).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("app_shell_navigation");
  });

  it("uses the whole topbar as a drag region", async () => {
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    const topbar = document.querySelector(".shell__topbar");
    expect(topbar).toHaveAttribute("data-tauri-drag-region");
  });

  it("suppresses the browser context menu", async () => {
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    const wasNotPrevented = fireEvent(window, contextMenuEvent);

    expect(wasNotPrevented).toBe(false);
    expect(contextMenuEvent.defaultPrevented).toBe(true);
  });
});
