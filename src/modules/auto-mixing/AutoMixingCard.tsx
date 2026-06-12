import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModuleCardProps } from "@/app/registry/moduleTypes";
import { CardFrame } from "@/app/ui/CardFrame";
import {
  normalizeAutoMixingSettings,
  type AutoMixingSettings,
  type AutoMixingState,
} from "@/modules/auto-mixing/defaults";

type AutoMixingStatus = {
  enabled: boolean;
  status: "idle" | "running" | "error";
  runtimeError: string | null;
  activeDuckCount: number;
  observedSessionCount: number;
  lastActionAt: string | null;
};

const STATE_IDLE = "idle";
const STATE_RUNNING = "running";
const STATE_ERROR = "error";
const SWITCH_LABEL = "自动混音";
const ERROR_FALLBACK = "自动混音启动失败";

function readableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return ERROR_FALLBACK;
}

function buildStatusLine(state: AutoMixingState) {
  return state.runtimeError ?? "";
}

export function AutoMixingCard({
  manifest,
  state,
  settings,
  isExpanded,
  isActive,
  settingsContent,
  onPatchState,
  onToggleExpand,
}: ModuleCardProps<AutoMixingState>) {
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchFeedback, setSwitchFeedback] = useState<"idle" | "reject">("idle");
  const onPatchStateRef = useRef(onPatchState);
  const rejectResetTimerRef = useRef<number | null>(null);
  const rejectExpandTimerRef = useRef<number | null>(null);
  const normalizedSettings = normalizeAutoMixingSettings(settings);
  const status = buildStatusLine(state);

  useEffect(() => {
    onPatchStateRef.current = onPatchState;
  }, [onPatchState]);

  useEffect(() => {
    return () => {
      if (rejectResetTimerRef.current !== null) {
        window.clearTimeout(rejectResetTimerRef.current);
      }

      if (rejectExpandTimerRef.current !== null) {
        window.clearTimeout(rejectExpandTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let cancelled = false;
    const syncStatus = async () => {
      try {
        const nextStatus = await invoke<AutoMixingStatus>("auto_mixing_status");
        if (cancelled) {
          return;
        }

        onPatchStateRef.current({
          enabled: nextStatus.enabled,
          status: nextStatus.runtimeError
            ? STATE_ERROR
            : nextStatus.enabled
              ? STATE_RUNNING
              : STATE_IDLE,
          runtimeError: nextStatus.runtimeError,
          activeDuckCount: nextStatus.activeDuckCount,
          observedSessionCount: nextStatus.observedSessionCount,
          lastActionAt: nextStatus.lastActionAt,
        });
      } catch {
        // Best-effort polling. Toggle path still reports hard errors.
      }
    };

    const interval = window.setInterval(syncStatus, 4_000);
    void syncStatus();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isActive]);

  const toggleAutoMixing = async () => {
    if (isSwitching || switchFeedback === "reject") {
      return;
    }

    if (!isActive && normalizedSettings.anchorExecutables.length === 0) {
      setSwitchFeedback("reject");

      if (rejectExpandTimerRef.current !== null) {
        window.clearTimeout(rejectExpandTimerRef.current);
      }
      if (rejectResetTimerRef.current !== null) {
        window.clearTimeout(rejectResetTimerRef.current);
      }

      rejectExpandTimerRef.current = window.setTimeout(() => {
        if (!isExpanded) {
          onToggleExpand();
        }
      }, 180);
      rejectResetTimerRef.current = window.setTimeout(() => {
        setSwitchFeedback("idle");
      }, 620);
      return;
    }

    const nextEnabled = !isActive;
    setIsSwitching(true);

    try {
      const nextStatus = await invoke<AutoMixingStatus>("auto_mixing_set_enabled", {
        request: {
          enabled: nextEnabled,
          anchorExecutables: normalizedSettings.anchorExecutables,
          excludedExecutables: normalizedSettings.excludedExecutables,
          includeSystemSounds: normalizedSettings.systemSoundsTriggerEnabled,
          duckedVolumePercent: normalizedSettings.duckedVolumePercent,
          restoreDurationMs: normalizedSettings.fadeDurationMs,
          attackDurationMs: normalizedSettings.fadeDurationMs,
        },
      });

      onPatchState({
        enabled: nextStatus.enabled,
        status: nextStatus.runtimeError
          ? STATE_ERROR
          : nextStatus.enabled
            ? STATE_RUNNING
            : STATE_IDLE,
        runtimeError: nextStatus.runtimeError,
        activeDuckCount: nextStatus.activeDuckCount,
        observedSessionCount: nextStatus.observedSessionCount,
        lastActionAt: nextStatus.lastActionAt ?? new Date().toISOString(),
      });
    } catch (error) {
      onPatchState({
        enabled: isActive,
        status: STATE_ERROR,
        runtimeError: readableError(error),
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
        <div className="module-mark module-mark--mix" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      }
      isExpanded={isExpanded}
      isActive={isActive}
      settingsContent={settingsContent}
      onToggleActive={toggleAutoMixing}
      onToggleExpand={onToggleExpand}
      switchLabel={SWITCH_LABEL}
      switchFeedback={switchFeedback}
    >
      <div className="module-ambient module-ambient--mix" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </CardFrame>
  );
}
