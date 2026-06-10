export type AutoMixingState = {
  enabled: boolean;
  status: "idle" | "running" | "error";
  lastActionAt: string | null;
  runtimeError: string | null;
  activeDuckCount: number;
  observedSessionCount: number;
};

export type AutoMixingSourceView = "audio-sessions" | "all-processes";

export type AutoMixingSettings = {
  selectedExecutables: string[];
  blockedExecutables: string[];
  duckedVolumePercent: number;
  restoreDurationMs: number;
  sourceView: AutoMixingSourceView;
};

const DEFAULT_DUCKED_VOLUME_PERCENT = 15;
const DEFAULT_RESTORE_DURATION_MS = 300;

export const autoMixingState: AutoMixingState = {
  enabled: false,
  status: "idle",
  lastActionAt: null,
  runtimeError: null,
  activeDuckCount: 0,
  observedSessionCount: 0,
};

export const autoMixingSettings: AutoMixingSettings = {
  selectedExecutables: [],
  blockedExecutables: [],
  duckedVolumePercent: DEFAULT_DUCKED_VOLUME_PERCENT,
  restoreDurationMs: DEFAULT_RESTORE_DURATION_MS,
  sourceView: "audio-sessions",
};

function normalizeExecutableList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
        .filter((entry) => entry.endsWith(".exe")),
    ),
  );
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeAutoMixingSettings(
  settings: Record<string, unknown> | AutoMixingSettings,
): AutoMixingSettings {
  const blockedExecutables = normalizeExecutableList(settings.blockedExecutables);
  const selectedExecutables = normalizeExecutableList(settings.selectedExecutables).filter(
    (entry) => !blockedExecutables.includes(entry),
  );
  const sourceView =
    settings.sourceView === "all-processes" ? "all-processes" : "audio-sessions";

  return {
    selectedExecutables,
    blockedExecutables,
    duckedVolumePercent: normalizeNumber(
      settings.duckedVolumePercent,
      DEFAULT_DUCKED_VOLUME_PERCENT,
      1,
      100,
    ),
    restoreDurationMs: normalizeNumber(
      settings.restoreDurationMs,
      DEFAULT_RESTORE_DURATION_MS,
      0,
      10_000,
    ),
    sourceView,
  };
}

export function autoMixingSettingsEqual(
  left: AutoMixingSettings,
  right: Record<string, unknown> | AutoMixingSettings,
) {
  const normalizedRight = normalizeAutoMixingSettings(right);

  return (
    left.duckedVolumePercent === normalizedRight.duckedVolumePercent &&
    left.restoreDurationMs === normalizedRight.restoreDurationMs &&
    left.sourceView === normalizedRight.sourceView &&
    left.selectedExecutables.length === normalizedRight.selectedExecutables.length &&
    left.blockedExecutables.length === normalizedRight.blockedExecutables.length &&
    left.selectedExecutables.every((entry, index) => entry === normalizedRight.selectedExecutables[index]) &&
    left.blockedExecutables.every((entry, index) => entry === normalizedRight.blockedExecutables[index])
  );
}
