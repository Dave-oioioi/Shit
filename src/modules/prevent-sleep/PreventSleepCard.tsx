import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModuleCardProps } from "@/app/registry/moduleTypes";
import { CardFrame } from "@/app/ui/CardFrame";

type PreventSleepState = {
  enabled: boolean;
  status: string;
  lastActionAt: string | null;
  lastPulseAt: string | null;
  runtimeError: string | null;
};

type PreventSleepSettings = {
  idleThresholdSeconds?: number;
};

type PreventSleepStatus = {
  enabled: boolean;
  lastPulseAt: string | null;
  error: string | null;
};

const DEFAULT_IDLE_THRESHOLD_SECONDS = 150;
const STATUS_IDLE = "\u5f85\u547d";
const STATUS_RUNNING = "\u540e\u53f0\u4fdd\u6d3b\u4e2d";
const STATUS_START_FAILED = "\u542f\u52a8\u5931\u8d25";
const STATUS_STOP_FAILED = "\u5173\u95ed\u5931\u8d25";
const ERROR_FALLBACK = "\u9632\u6b62\u4f11\u7720\u542f\u52a8\u5931\u8d25";
const SWITCH_LABEL = "\u9632\u6b62\u4f11\u7720";

function readableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return ERROR_FALLBACK;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PreventSleepCard({
  manifest,
  state,
  settings,
  isExpanded,
  isActive,
  settingsContent,
  onPatchState,
  onToggleExpand,
}: ModuleCardProps<PreventSleepState>) {
  const [isSwitching, setIsSwitching] = useState(false);
  const onPatchStateRef = useRef(onPatchState);
  const preventSleepSettings = settings as PreventSleepSettings;
  const idleThresholdSeconds =
    preventSleepSettings.idleThresholdSeconds ?? DEFAULT_IDLE_THRESHOLD_SECONDS;
  const status = state.runtimeError
    ? state.runtimeError
    : isActive
      ? state.lastPulseAt
        ? `\u6700\u8fd1\u4fdd\u6d3b ${formatTime(state.lastPulseAt)}`
        : STATUS_RUNNING
      : STATUS_IDLE;

  useEffect(() => {
    onPatchStateRef.current = onPatchState;
  }, [onPatchState]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let cancelled = false;
    const syncStatus = async () => {
      try {
        const nextStatus = await invoke<PreventSleepStatus>("prevent_sleep_status");
        if (cancelled) {
          return;
        }

        onPatchStateRef.current({
          enabled: nextStatus.enabled,
          runtimeError: nextStatus.error,
          status: nextStatus.enabled ? STATUS_RUNNING : STATUS_IDLE,
          lastPulseAt: nextStatus.lastPulseAt,
        });
      } catch {
        // Status polling is best-effort; switch actions still surface hard failures.
      }
    };

    const interval = window.setInterval(syncStatus, 10_000);
    void syncStatus();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isActive]);

  const togglePreventSleep = async () => {
    if (isSwitching) {
      return;
    }

    const nextEnabled = !isActive;
    setIsSwitching(true);

    try {
      const nextStatus = await invoke<PreventSleepStatus>("prevent_sleep_set_enabled", {
        request: {
          enabled: nextEnabled,
          idleThresholdSeconds,
        },
      });

      onPatchState({
        enabled: nextStatus.enabled,
        runtimeError: nextStatus.error,
        status: nextStatus.enabled ? STATUS_RUNNING : STATUS_IDLE,
        lastActionAt: new Date().toISOString(),
        lastPulseAt: nextStatus.lastPulseAt,
      });
    } catch (error) {
      onPatchState({
        enabled: isActive,
        runtimeError: readableError(error),
        status: nextEnabled ? STATUS_START_FAILED : STATUS_STOP_FAILED,
        lastActionAt: new Date().toISOString(),
      });
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <CardFrame
      accent={manifest.themeColor}
      title={manifest.title}
      status={status}
      icon={
        <div className="module-mark module-mark--sleep" aria-hidden="true">
          <i />
          <span />
          <span />
          <span />
        </div>
      }
      isExpanded={isExpanded}
      isActive={isActive}
      settingsContent={settingsContent}
      onToggleActive={togglePreventSleep}
      onToggleExpand={onToggleExpand}
      switchLabel={SWITCH_LABEL}
    >
      <div className="module-ambient module-ambient--sleep" aria-hidden="true">
        <i />
        <span />
        <span />
        <span />
      </div>
      {state.runtimeError ? (
        <p className="prevent-sleep-error" role="status">
          {state.runtimeError}
        </p>
      ) : null}
    </CardFrame>
  );
}
