import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/app/shell/AppShell";
import { useLayoutStore } from "@/app/state/layoutStore";
import { useModuleSettingsStore } from "@/app/state/moduleSettingsStore";
import { useModuleStateStore } from "@/app/state/moduleStateStore";
import { useRegistryStore } from "@/app/state/registryStore";

const eventListeners = new Map<string, (event: { payload?: unknown }) => void>();
const hideMock = vi.fn(async () => undefined);

const AUTO_MIXING = "\u81ea\u52a8\u6df7\u97f3";
const PREVENT_SLEEP = "\u9632\u6b62\u4f11\u7720";
const SETTINGS = "\u8bbe\u7f6e";
const MAIN_STALL = "\u4e3b\u5751\u4f4d";
const EXPAND_SETTINGS = "\u5c55\u5f00\u8bbe\u7f6e";
const SCENE_CONFIG = "\u573a\u666f\u914d\u7f6e";
const DEFAULT_SCENE = "\u9ed8\u8ba4\u573a\u666f";
const MODULE_BEHAVIOR = "\u6a21\u5757\u884c\u4e3a";

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

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: PREVENT_SLEEP })).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: EXPAND_SETTINGS })[0]!);

    expect(screen.getByText(SCENE_CONFIG)).toBeInTheDocument();
    expect(screen.getByText(DEFAULT_SCENE)).toBeInTheDocument();
    expect(screen.getByText(MODULE_BEHAVIOR)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${AUTO_MIXING} \u5f00\u5173` })).toBeInTheDocument();
  });

  it("keeps settings visibility in sync with toolset drawers", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: SETTINGS }));
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
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
  });

  it("switches to settings when tray navigation requests it", async () => {
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    await act(async () => {
      eventListeners.get("shell:navigate")?.({ payload: { view: "settings" } });
    });

    expect(await screen.findByRole("heading", { name: SETTINGS })).toBeInTheDocument();
  });

  it("uses the whole topbar as a drag region", async () => {
    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: AUTO_MIXING })).toBeInTheDocument();

    const topbar = document.querySelector(".shell__topbar");
    expect(topbar).toHaveAttribute("data-tauri-drag-region");
  });
});
