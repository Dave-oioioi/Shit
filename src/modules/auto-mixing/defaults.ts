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

export const autoMixingSettings: AutoMixingSettings = {
  anchorExecutables: [],
  excludedExecutables: [],
  systemSoundsTriggerEnabled: true,
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

  return {
    anchorExecutables,
    excludedExecutables,
    systemSoundsTriggerEnabled: normalizeBoolean(
      rawSettings.systemSoundsTriggerEnabled,
      true,
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
