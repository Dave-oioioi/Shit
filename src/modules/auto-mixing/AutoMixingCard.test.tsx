import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      isExpanded={false}
      isActive={state.enabled}
      settingsContent={null}
      onPatchState={onPatchState}
      onToggleActive={vi.fn()}
      onToggleExpand={vi.fn()}
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
        selectedExecutables: ["Spotify.exe"],
        blockedExecutables: ["Discord.exe"],
        duckedVolumePercent: 15,
        restoreDurationMs: 300,
        sourceView: "audio-sessions",
      },
    });

    await user.click(screen.getByRole("button", { name: TOGGLE_LABEL }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_set_enabled", {
        request: {
          enabled: true,
          selectedExecutables: ["spotify.exe"],
          blockedExecutables: ["discord.exe"],
          duckedVolumePercent: 15,
          restoreDurationMs: 300,
        },
      });
    });
  });

  it("keeps the old enabled state and reports an error when enabling fails", async () => {
    const user = userEvent.setup();
    invokeMock.mockRejectedValue("boom");

    renderCard();

    await user.click(screen.getByRole("button", { name: TOGGLE_LABEL }));

    await waitFor(() => {
      expect(screen.getByRole("article", { name: /boom/i })).toBeInTheDocument();
    });
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
    invokeMock.mockResolvedValue([
      {
        executableName: "spotify.exe",
        displayName: "Spotify",
        hasAudioSession: true,
        isRunning: true,
      },
      {
        executableName: "discord.exe",
        displayName: "Discord",
        hasAudioSession: true,
        isRunning: true,
      },
      {
        executableName: "foobar2000.exe",
        displayName: "foobar2000",
        hasAudioSession: false,
        isRunning: true,
      },
    ]);
  });

  it("switches source view cards correctly", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StatefulAutoMixingSettings onChangeSpy={onChange} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_list_targets");
    });

    expect(screen.getByRole("tab", { name: /有音频的应用/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: /所有进程/ }));

    expect(onChange).toHaveBeenLastCalledWith({
      selectedExecutables: [],
      blockedExecutables: [],
      duckedVolumePercent: 15,
      restoreDurationMs: 300,
      sourceView: "all-processes",
    });
  });

  it("adds an app to the auto-lower rules", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<StatefulAutoMixingSettings onChangeSpy={onChange} />);

    await waitFor(() => {
      expect(screen.getAllByText("Spotify").length).toBeGreaterThan(0);
    });

    const spotifyEntry = screen
      .getAllByRole("option")
      .find((element) => element.textContent?.includes("spotify.exe"));
    expect(spotifyEntry).toBeTruthy();

    await user.click(spotifyEntry!);
    await user.click(screen.getByRole("button", { name: "加入自动降低" }));

    expect(onChange).toHaveBeenLastCalledWith({
      selectedExecutables: ["spotify.exe"],
      blockedExecutables: [],
      duckedVolumePercent: 15,
      restoreDurationMs: 300,
      sourceView: "audio-sessions",
    });
  });

  it("moves the same exe from selected to blocked without duplication", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <StatefulAutoMixingSettings
        settings={{
          selectedExecutables: ["spotify.exe"],
          blockedExecutables: [],
          duckedVolumePercent: 15,
          restoreDurationMs: 300,
          sourceView: "audio-sessions",
        }}
        onChangeSpy={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Spotify").length).toBeGreaterThan(0);
    });

    const spotifyEntry = screen
      .getAllByRole("option")
      .find((element) => element.textContent?.includes("spotify.exe"));
    expect(spotifyEntry).toBeTruthy();

    await user.click(spotifyEntry!);
    await user.click(screen.getByRole("button", { name: "加入屏蔽" }));

    expect(onChange).toHaveBeenLastCalledWith({
      selectedExecutables: [],
      blockedExecutables: ["spotify.exe"],
      duckedVolumePercent: 15,
      restoreDurationMs: 300,
      sourceView: "audio-sessions",
    });
  });

  it("locks all action buttons while the card is enabled", async () => {
    render(<AutoMixingSettings moduleId="auto-mixing" manifest={manifest} settings={autoMixingSettings} disabled onChange={vi.fn()} />);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("auto_mixing_list_targets");
    });

    expect(screen.getAllByRole("tab").every((element) => (element as HTMLButtonElement).disabled)).toBe(
      true,
    );
    expect(
      screen
        .getAllByRole("button")
        .filter((element) =>
          ["加入自动降低", "加入屏蔽", "从规则中移除"].some((label) =>
            (element as HTMLButtonElement).textContent?.includes(label),
          ),
        )
        .every((element) => (element as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
