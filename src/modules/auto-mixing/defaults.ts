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
  systemSoundsTriggerEnabled: boolean;
  duckedVolumePercent: number;
  fadeDurationMs: number;
};

export type AutoMixingLibraryApp = {
  executableName: string;
  displayName: string;
  aliases: string[];
};

export const autoMixingMusicAppLibrary: AutoMixingLibraryApp[] = [
  {
    executableName: "spotify.exe",
    displayName: "Spotify",
    aliases: ["spotify"],
  },
  {
    executableName: "qqmusic.exe",
    displayName: "QQ Music",
    aliases: ["qqmusic", "qq music", "qq音乐"],
  },
  {
    executableName: "cloudmusic.exe",
    displayName: "NetEase Cloud Music",
    aliases: ["cloudmusic", "netease", "netease cloud music", "网易云", "网易云音乐"],
  },
  {
    executableName: "itunes.exe",
    displayName: "iTunes",
    aliases: ["itunes", "apple music"],
  },
  {
    executableName: "applemusic.exe",
    displayName: "Apple Music",
    aliases: ["apple music", "applemusic"],
  },
  {
    executableName: "foobar2000.exe",
    displayName: "foobar2000",
    aliases: ["foobar", "foobar2000"],
  },
  {
    executableName: "aimp.exe",
    displayName: "AIMP",
    aliases: ["aimp"],
  },
  {
    executableName: "musicbee.exe",
    displayName: "MusicBee",
    aliases: ["musicbee", "music bee"],
  },
  {
    executableName: "potplayermini64.exe",
    displayName: "PotPlayer",
    aliases: ["potplayer", "potplayer64"],
  },
];

export const autoMixingState: AutoMixingState = {
  enabled: false,
  status: "idle",
  lastActionAt: null,
  runtimeError: null,
  activeDuckCount: 0,
  observedSessionCount: 0,
};

export const AUTO_MIXING_DUCKED_VOLUME_MIN = 10;
export const AUTO_MIXING_DUCKED_VOLUME_MAX = 40;
export const AUTO_MIXING_DUCKED_VOLUME_DEFAULT = 15;
export const AUTO_MIXING_FADE_DURATION_MIN = 0;
export const AUTO_MIXING_FADE_DURATION_MAX = 600;
export const AUTO_MIXING_FADE_DURATION_DEFAULT = 120;
const LEGACY_AUTO_MIXING_RESTORE_DEFAULT = 300;

export const autoMixingSettings: AutoMixingSettings = {
  anchorExecutables: [],
  excludedExecutables: [],
  systemSoundsTriggerEnabled: true,
  duckedVolumePercent: AUTO_MIXING_DUCKED_VOLUME_DEFAULT,
  fadeDurationMs: AUTO_MIXING_FADE_DURATION_DEFAULT,
};

function normalizeExecutableList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeExecutableName(typeof entry === "string" ? entry : ""))
        .filter((entry) => entry.length > 0),
    ),
  );
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function isLegacyDefaultDuration(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return (
    Number.isFinite(numeric) &&
    Math.round(numeric) === LEGACY_AUTO_MIXING_RESTORE_DEFAULT
  );
}

export function normalizeExecutableName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  return normalized.endsWith(".exe") ? normalized : `${normalized}.exe`;
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
  ).filter((entry) => !excludedExecutables.includes(entry));
  const legacyFadeDuration =
    rawSettings.restoreDurationMs ?? rawSettings.restore_duration_ms;

  return {
    anchorExecutables,
    excludedExecutables,
    systemSoundsTriggerEnabled: normalizeBoolean(
      rawSettings.systemSoundsTriggerEnabled,
      true,
    ),
    duckedVolumePercent: normalizeInteger(
      rawSettings.duckedVolumePercent ?? rawSettings.ducked_volume_percent,
      AUTO_MIXING_DUCKED_VOLUME_DEFAULT,
      AUTO_MIXING_DUCKED_VOLUME_MIN,
      AUTO_MIXING_DUCKED_VOLUME_MAX,
    ),
    fadeDurationMs: normalizeInteger(
      rawSettings.fadeDurationMs ??
        (isLegacyDefaultDuration(legacyFadeDuration)
          ? AUTO_MIXING_FADE_DURATION_DEFAULT
          : legacyFadeDuration),
      AUTO_MIXING_FADE_DURATION_DEFAULT,
      AUTO_MIXING_FADE_DURATION_MIN,
      AUTO_MIXING_FADE_DURATION_MAX,
    ),
  };
}

export function autoMixingSettingsEqual(
  left: AutoMixingSettings,
  right: Record<string, unknown> | AutoMixingSettings,
) {
  const normalizedRight = normalizeAutoMixingSettings(right);

  return (
    left.systemSoundsTriggerEnabled === normalizedRight.systemSoundsTriggerEnabled &&
    left.duckedVolumePercent === normalizedRight.duckedVolumePercent &&
    left.fadeDurationMs === normalizedRight.fadeDurationMs &&
    left.anchorExecutables.length === normalizedRight.anchorExecutables.length &&
    left.excludedExecutables.length === normalizedRight.excludedExecutables.length &&
    left.anchorExecutables.every(
      (entry, index) => entry === normalizedRight.anchorExecutables[index],
    ) &&
    left.excludedExecutables.every(
      (entry, index) => entry === normalizedRight.excludedExecutables[index],
    )
  );
}
