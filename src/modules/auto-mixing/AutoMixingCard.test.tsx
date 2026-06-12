import { useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleManifest } from "@/app/registry/moduleTypes";
import { AutoMixingCard } from "@/modules/auto-mixing/AutoMixingCard";
import { AutoMixingSettings } from "@/modules/auto-mixing/AutoMixingSettings";
import {
  autoMixingSettings,
  autoMixingState,
  type AutoMixingSettings as AutoMixingSettingsModel,
  type AutoMixingState as AutoMixingStateModel,
} from "@/modules/auto-mixing/defaults";

const invokeMock = vi.fn();
const MODULE_TITLE = "自动混音";
const TOGGLE_LABEL = "自动混音 开关";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const manifest: ModuleManifest = {
  id: "auto-mixing",
  name: "auto-mixing",
  version: "0.1.0",
  title: MODULE_TITLE,
  description: "",
  themeColor: "#58c6ff",
  icon: "waves",
  defaultSize: "2x1",
  minSize: "2x1",
  order: 1,
  enabledByDefault: true,
  hasSettings: true,
};

function StatefulAutoMixingCard(
  props: Partial<Parameters<typeof AutoMixingCard>[0]> & {
    onPatchStateSpy: ReturnType<typeof vi.fn>;
  },
) {
  const {
    onPatchStateSpy,
    state: initialState,
    settings,
    onPatchState: _onPatchState,
    ...overrides
  } = props;
  const [state, setState] = useState({
    ...autoMixingState,
    ...initialState,
  });

  const onPatchState = (partialState: Partial<AutoMixingStateModel>) => {
    onPatchStateSpy(partialState);
    setState((currentState) => ({ ...currentState, ...partialState }));
  };

  return (
    <AutoMixingCard
      moduleId="auto-mixing"
      manifest={manifest}
      {...overrides}
      state={state}
      settings={{ ...autoMixingSettings, ...settings }}
      isExpanded={Boolean(overrides.isExpanded)}
      isActive={state.enabled}
      settingsContent={null}
      onPatchState={onPatchState}
      onToggleActive={vi.fn()}
      onToggleExpand={overrides.onToggleExpand ?? vi.fn()}
    />
  );
}

function StatefulAutoMixingSettings(
  props: Partial<Parameters<typeof AutoMixingSettings>[0]> & {
    onChangeSpy: ReturnType<typeof vi.fn>;
  },
) {
  const {
    onChangeSpy,
    settings: initialSettings,
    onChange: _onChange,
    ...overrides
  } = props;
  const [settings, setSettings] = useState({
    ...autoMixingSettings,
    ...initialSettings,
  });

  const onChange = (nextSettings: AutoMixingSettingsModel) => {
    onChangeSpy(nextSettings);
    setSettings(nextSettings);
  };

  return (
    <AutoMixingSettings
      moduleId="auto-mixing"
      manifest={manifest}
      {...overrides}
      settings={settings}
      onChange={onChange}
    />
  );
}

function renderCard(overrides: Partial<Parameters<typeof AutoMixingCard>[0]> = {}) {
  const onPatchState = vi.fn();

  render(
    <StatefulAutoMixingCard
      {...overrides}
      state={{
        ...autoMixingState,
        enabled: Boolean(overrides.isActive),
        ...overrides.state,
      }}
      onPatchStateSpy={onPatchState}
    />,
  );

  return { onPatchState };
}

describe("AutoMixingCard", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the normalized rule payload when enabling", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue({
      enabled: true,
      status: "running",
      runtimeError: null,
      activeDuckCount: 0,
      observedSessionCount: 2,
      lastActionAt: "2026-06-10T03:00:00.000Z",
    });
    renderCard({
      settings: {
        anchorExecutables: ["Spotify.exe"],
        excludedExecutables: ["Discord.exe"],
        systemSoundsTriggerEnabled: false,
      },
    });

    await user.click(screen.getByRole("button", { name: TOGGLE_LABEL }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_set_enabled", {
        request: {
          enabled: true,
          anchorExecutables: ["spotify.exe"],
          excludedExecutables: ["discord.exe"],
          systemSoundsTriggerEnabled: false,
        },
      });
    });
  });

  it("opens settings instead of enabling when no duck target is configured", async () => {
    vi.useFakeTimers();
    const onToggleExpand = vi.fn();

    renderCard({
      onToggleExpand,
    });

    const toggleButton = screen.getByRole("button", { name: TOGGLE_LABEL });
    act(() => {
      toggleButton.click();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(toggleButton).toHaveAttribute("data-feedback", "reject");
    expect(onToggleExpand).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(toggleButton).toHaveAttribute("data-feedback", "idle");
  });

  it("polls runtime status while running and updates duck/session counts", async () => {
    invokeMock.mockResolvedValue({
      enabled: true,
      status: "running",
      runtimeError: null,
      activeDuckCount: 2,
      observedSessionCount: 5,
      lastActionAt: "2026-06-10T03:00:00.000Z",
    });
    const { onPatchState } = renderCard({
      state: {
        ...autoMixingState,
        enabled: true,
        status: "running",
      },
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_status");
      expect(onPatchState).toHaveBeenCalledWith(
        expect.objectContaining({
          activeDuckCount: 2,
          observedSessionCount: 5,
          enabled: true,
        }),
      );
    });
  });
});

describe("AutoMixingSettings", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "auto_mixing_list_targets") {
        return [
          {
            executableName: "spotify.exe",
            displayName: "Spotify",
            processId: 101,
            hasAudioSession: true,
            isRunning: true,
          },
          {
            executableName: "discord.exe",
            displayName: "Discord",
            processId: 202,
            hasAudioSession: true,
            isRunning: true,
          },
        ];
      }

      return {
        enabled: true,
        status: "running",
        runtimeError: null,
        activeDuckCount: 2,
        observedSessionCount: 5,
        lastActionAt: "2026-06-10T03:00:00.000Z",
      };
    });
  });

  it("shows selected apps first and opens the add/exclude pages", async () => {
    const user = userEvent.setup();

    render(<StatefulAutoMixingSettings onChangeSpy={vi.fn()} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_list_targets");
    });

    expect(screen.getByRole("heading", { name: "选择应用" })).toBeInTheDocument();
    expect(screen.getByText("还没有选择应用")).toBeInTheDocument();
    expect(screen.getAllByText("Spotify").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /添加应用/ }));

    expect(screen.getByRole("heading", { name: "添加应用" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search app candidates")).toBeInTheDocument();
    expect(screen.getAllByText("Discord").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "返回选择应用" }));
    await user.click(screen.getByRole("button", { name: /排除应用/ }));

    expect(screen.getByRole("heading", { name: "排除应用" })).toBeInTheDocument();
  });

  it("adds a recommended library app as a selected rule", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StatefulAutoMixingSettings onChangeSpy={onChange} />);

    await waitFor(() => {
      expect(screen.getByText("Spotify")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Add foobar2000.exe to selected apps" }));

    expect(onChange).toHaveBeenLastCalledWith({
      anchorExecutables: ["foobar2000.exe"],
      excludedExecutables: [],
      systemSoundsTriggerEnabled: true,
    });
  });

  it("adds a scanned app to the excluded list", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StatefulAutoMixingSettings onChangeSpy={onChange} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_list_targets");
    });

    await user.click(screen.getByRole("button", { name: /排除应用/ }));
    expect(screen.getByText("Discord")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Exclude discord.exe from triggers" }));

    expect(onChange).toHaveBeenLastCalledWith({
      anchorExecutables: [],
      excludedExecutables: ["discord.exe"],
      systemSoundsTriggerEnabled: true,
    });
  });

  it("moves the same exe from duck target to excluded without duplication", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <StatefulAutoMixingSettings
        settings={{
          anchorExecutables: ["spotify.exe"],
          excludedExecutables: [],
          systemSoundsTriggerEnabled: true,
        }}
        onChangeSpy={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Spotify")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /排除应用/ }));
    await user.click(screen.getAllByRole("button", { name: "Exclude spotify.exe from triggers" })[0]);

    expect(onChange).toHaveBeenLastCalledWith({
      anchorExecutables: [],
      excludedExecutables: ["spotify.exe"],
      systemSoundsTriggerEnabled: true,
    });
  });

  it("keeps pages viewable but disables editing controls while running", async () => {
    const user = userEvent.setup();

    render(
      <AutoMixingSettings
        moduleId="auto-mixing"
        manifest={manifest}
        settings={autoMixingSettings}
        disabled
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_list_targets");
    });

    expect(screen.getByText("运行中，关闭后可编辑")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add spotify.exe to selected apps" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Toggle system sounds trigger" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /添加应用/ }));

    expect(screen.getByLabelText("Search app candidates")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add discord.exe to selected apps" })).toBeDisabled();
  });

  it("lets the user add a typed executable through the search flow", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StatefulAutoMixingSettings onChangeSpy={onChange} />);

    await user.click(screen.getByRole("button", { name: /添加应用/ }));
    await user.type(screen.getByLabelText("Search app candidates"), "custom-player");

    await user.click(screen.getByRole("button", { name: "Add custom-player.exe to selected apps" }));

    expect(onChange).toHaveBeenLastCalledWith({
      anchorExecutables: ["custom-player.exe"],
      excludedExecutables: [],
      systemSoundsTriggerEnabled: true,
    });
  });

  it("toggles whether system sounds can trigger ducking", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StatefulAutoMixingSettings onChangeSpy={onChange} />);

    await user.click(screen.getByRole("button", { name: "Toggle system sounds trigger" }));

    expect(onChange).toHaveBeenLastCalledWith({
      anchorExecutables: [],
      excludedExecutables: [],
      systemSoundsTriggerEnabled: false,
    });
  });
});
