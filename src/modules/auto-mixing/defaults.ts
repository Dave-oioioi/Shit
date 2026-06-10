export type AutoMixingState = {
  enabled: boolean;
  status: "idle" | "running" | "error";
  lastActionAt: string | null;
  runtimeError: string | null;
  activeDuckCount: number;
  observedSessionCount: number;
};

export type AutoMixingSettings = {
  anchorExecutables: string[];
  excludedExecutables: string[];
  duckedVolumePercent: number;
  restoreDurationMs: number;
};

const DEFAULT_DUCKED_VOLUME_PERCENT = 15;
const DEFAULT_RESTORE_DURATION_MS = 120;
const LEGACY_DEFAULT_RESTORE_DURATION_MS = 300;

export const autoMixingState: AutoMixingState = {
  enabled: false,
  status: "idle",
  lastActionAt: null,
  runtimeError: null,
  activeDuckCount: 0,
  observedSessionCount: 0,
};

export const autoMixingSettings: AutoMixingSettings = {
  anchorExecutables: [],
  excludedExecutables: [],
  duckedVolumePercent: DEFAULT_DUCKED_VOLUME_PERCENT,
  restoreDurationMs: DEFAULT_RESTORE_DURATION_MS,
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

function normalizeRestoreDuration(value: unknown) {
  const duration = normalizeNumber(value, DEFAULT_RESTORE_DURATION_MS, 0, 10_000);
  return duration === LEGACY_DEFAULT_RESTORE_DURATION_MS
    ? DEFAULT_RESTORE_DURATION_MS
    : duration;
}

export function normalizeAutoMixingSettings(
  settings: Record<string, unknown> | AutoMixingSettings,
): AutoMixingSettings {
  const rawSettings = settings as Record<string, unknown>;
  const excludedExecutables = normalizeExecutableList(
    rawSettings.excludedExecutables ?? rawSettings.blockedExecutables,
  );
  const anchorExecutables = normalizeExecutableList(
    rawSettings.anchorExecutables ?? rawSettings.selectedExecutables,
  ).filter(
    (entry) => !excludedExecutables.includes(entry),
  );

  return {
    anchorExecutables,
    excludedExecutables,
    duckedVolumePercent: normalizeNumber(
      rawSettings.duckedVolumePercent,
      DEFAULT_DUCKED_VOLUME_PERCENT,
      1,
      100,
    ),
    restoreDurationMs: normalizeRestoreDuration(rawSettings.restoreDurationMs),
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
    left.anchorExecutables.length === normalizedRight.anchorExecutables.length &&
    left.excludedExecutables.length === normalizedRight.excludedExecutables.length &&
    left.anchorExecutables.every((entry, index) => entry === normalizedRight.anchorExecutables[index]) &&
    left.excludedExecutables.every((entry, index) => entry === normalizedRight.excludedExecutables[index])
  );
}
