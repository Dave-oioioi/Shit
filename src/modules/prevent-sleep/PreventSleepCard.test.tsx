import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleManifest } from "@/app/registry/moduleTypes";
import { PreventSleepCard } from "@/modules/prevent-sleep/PreventSleepCard";
import { preventSleepSettings, preventSleepState } from "@/modules/prevent-sleep/defaults";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const manifest: ModuleManifest = {
  id: "prevent-sleep",
  name: "prevent-sleep",
  version: "0.1.0",
  title: "\u9632\u6b62\u4f11\u7720",
  description: "",
  themeColor: "#a7d77b",
  icon: "moon-star",
  defaultSize: "2x1",
  minSize: "2x1",
  order: 2,
  enabledByDefault: true,
  hasSettings: true,
};

function StatefulPreventSleepCard(
  props: Partial<Parameters<typeof PreventSleepCard>[0]> & {
    onPatchStateSpy: ReturnType<typeof vi.fn>;
  },
) {
  const {
    onPatchStateSpy,
    state: initialState,
    settings,
    isActive: _isActive,
    onPatchState: _onPatchState,
    ...overrides
  } = props;
  const [state, setState] = useState({ ...preventSleepState, ...initialState });
  const onPatchState = (partialState: Partial<typeof state>) => {
    onPatchStateSpy(partialState);
    setState((currentState) => ({ ...currentState, ...partialState }));
  };

  return (
    <PreventSleepCard
      moduleId="prevent-sleep"
      manifest={manifest}
      {...overrides}
      state={state}
      settings={{ ...preventSleepSettings, ...settings }}
      isExpanded={false}
      isActive={state.enabled}
      settingsContent={null}
      onPatchState={onPatchState}
      onToggleActive={vi.fn()}
      onToggleExpand={vi.fn()}
    />
  );
}

function renderCard(overrides: Partial<Parameters<typeof PreventSleepCard>[0]> = {}) {
  const onPatchState = vi.fn();
  const onToggleActive = vi.fn();

  render(
    <StatefulPreventSleepCard
      {...overrides}
      state={{
        ...preventSleepState,
        enabled: Boolean(overrides.isActive),
        ...overrides.state,
      }}
      onToggleActive={onToggleActive}
      onPatchStateSpy={onPatchState}
    />,
  );

  return { onPatchState, onToggleActive };
}

describe("PreventSleepCard", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("enables native prevent sleep before marking the card active", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue({ enabled: true, lastPulseAt: null, error: null });
    const { onPatchState, onToggleActive } = renderCard();

    await user.click(screen.getByRole("button", { name: "\u9632\u6b62\u4f11\u7720 \u5f00\u5173" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("prevent_sleep_set_enabled", {
        request: {
          enabled: true,
          idleThresholdSeconds: 150,
        },
      });
    });
    expect(onPatchState).toHaveBeenCalledWith({
      enabled: true,
      runtimeError: null,
      status: "\u540e\u53f0\u4fdd\u6d3b\u4e2d",
      lastActionAt: expect.any(String),
      lastPulseAt: null,
    });
    expect(onToggleActive).not.toHaveBeenCalled();
  });

  it("keeps the card inactive and shows an error when native enable fails", async () => {
    const user = userEvent.setup();
    invokeMock.mockRejectedValue(new Error("SendInput failed"));
    const { onPatchState } = renderCard();

    await user.click(screen.getByRole("button", { name: "\u9632\u6b62\u4f11\u7720 \u5f00\u5173" }));

    await waitFor(() => {
      expect(onPatchState).toHaveBeenCalledWith({
        enabled: false,
        runtimeError: "SendInput failed",
        status: "\u542f\u52a8\u5931\u8d25",
        lastActionAt: expect.any(String),
      });
    });
    expect(screen.getByText("SendInput failed")).toBeInTheDocument();
  });

  it("disables native prevent sleep before marking the card inactive", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "prevent_sleep_status") {
        return Promise.resolve({ enabled: true, lastPulseAt: null, error: null });
      }

      return Promise.resolve({ enabled: false, lastPulseAt: null, error: null });
    });
    const { onPatchState } = renderCard({
      isActive: true,
      state: {
        enabled: true,
        status: "\u540e\u53f0\u4fdd\u6d3b\u4e2d",
        lastActionAt: "2026-06-08T01:00:00.000Z",
        lastPulseAt: null,
        runtimeError: null,
      },
    });

    await user.click(screen.getByRole("button", { name: "\u9632\u6b62\u4f11\u7720 \u5f00\u5173" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("prevent_sleep_set_enabled", {
        request: {
          enabled: false,
          idleThresholdSeconds: 150,
        },
      });
    });
    expect(onPatchState).toHaveBeenCalledWith({
      enabled: false,
      runtimeError: null,
      status: "\u5f85\u547d",
      lastActionAt: expect.any(String),
      lastPulseAt: null,
    });
  });

  it("uses the selected preset seconds when enabling", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue({ enabled: true, lastPulseAt: null, error: null });
    renderCard({ settings: { idleThresholdSeconds: 300 } });

    await user.click(screen.getByRole("button", { name: "\u9632\u6b62\u4f11\u7720 \u5f00\u5173" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("prevent_sleep_set_enabled", {
        request: {
          enabled: true,
          idleThresholdSeconds: 300,
        },
      });
    });
  });

  it("clears a stale runtime error after a successful disable", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue({ enabled: false, lastPulseAt: null, error: null });
    const { onPatchState } = renderCard({
      isActive: true,
      state: {
        enabled: true,
        status: "\u540e\u53f0\u4fdd\u6d3b\u4e2d",
        lastActionAt: "2026-06-08T01:00:00.000Z",
        lastPulseAt: "2026-06-08T01:02:00.000Z",
        runtimeError: "temporary native error",
      },
    });

    await user.click(screen.getByRole("button", { name: "\u9632\u6b62\u4f11\u7720 \u5f00\u5173" }));

    await waitFor(() => {
      expect(onPatchState).toHaveBeenCalledWith({
        enabled: false,
        runtimeError: null,
        status: "\u5f85\u547d",
        lastActionAt: expect.any(String),
        lastPulseAt: null,
      });
    });
  });

  it("shows a native error returned by status polling even while previously active", async () => {
    invokeMock.mockResolvedValue({
      enabled: false,
      lastPulseAt: null,
      error: "SetThreadExecutionState failed",
    });
    const { onPatchState } = renderCard({
      isActive: true,
      state: {
        enabled: true,
        status: "\u540e\u53f0\u4fdd\u6d3b\u4e2d",
        lastActionAt: "2026-06-08T01:00:00.000Z",
        lastPulseAt: null,
        runtimeError: null,
      },
    });

    await waitFor(() => {
      expect(onPatchState).toHaveBeenCalledWith({
        enabled: false,
        runtimeError: "SetThreadExecutionState failed",
        status: "\u542f\u52a8\u5931\u8d25",
        lastPulseAt: null,
      });
    });
  });
});
