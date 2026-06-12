import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Ban, ChevronLeft, ListPlus, Plus, Search, Volume2, X } from "lucide-react";
import type { ModuleSettingsProps } from "@/app/registry/moduleTypes";
import {
  AUTO_MIXING_DUCKED_VOLUME_MAX,
  AUTO_MIXING_DUCKED_VOLUME_MIN,
  AUTO_MIXING_FADE_DURATION_MAX,
  AUTO_MIXING_FADE_DURATION_MIN,
  autoMixingMusicAppLibrary,
  autoMixingSettingsEqual,
  normalizeAutoMixingSettings,
  normalizeExecutableName,
  type AutoMixingLibraryApp,
  type AutoMixingSettings,
} from "@/modules/auto-mixing/defaults";

type AutoMixingTarget = {
  executableName: string;
  displayName: string;
  processId?: number;
  hasAudioSession: boolean;
  isRunning: boolean;
};

type SettingsPage = "select" | "add" | "exclude";
type CandidateAction = "select" | "exclude";
type SliderKind = "volume" | "fade";

type CandidateEntry = {
  executableName: string;
  displayName: string;
  note: string;
  aliases: string[];
  live: boolean;
};

const RECOMMENDED_EXECUTABLES = [
  "spotify.exe",
  "qqmusic.exe",
  "cloudmusic.exe",
  "applemusic.exe",
  "foobar2000.exe",
];

function targetLabel(target: { displayName: string; executableName: string }) {
  return target.displayName || target.executableName.replace(/\.exe$/i, "");
}

function uniqueByExecutable<T extends { executableName: string }>(entries: T[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.executableName)) {
      return false;
    }

    seen.add(entry.executableName);
    return true;
  });
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function matchesCandidate(candidate: CandidateEntry, query: string) {
  if (!query) {
    return false;
  }

  const haystacks = [
    candidate.displayName,
    candidate.executableName,
    ...candidate.aliases,
  ].map((entry) => normalizeSearchText(entry));

  return haystacks.some((entry) => entry.includes(query));
}

function withSelectedRule(
  settings: AutoMixingSettings,
  executableName: string,
): AutoMixingSettings {
  const normalizedExecutable = normalizeExecutableName(executableName);

  return {
    ...settings,
    anchorExecutables: Array.from(
      new Set([...settings.anchorExecutables, normalizedExecutable]),
    ),
    excludedExecutables: settings.excludedExecutables.filter(
      (entry) => entry !== normalizedExecutable,
    ),
  };
}

function withBlockedRule(
  settings: AutoMixingSettings,
  executableName: string,
): AutoMixingSettings {
  const normalizedExecutable = normalizeExecutableName(executableName);

  return {
    ...settings,
    excludedExecutables: Array.from(
      new Set([...settings.excludedExecutables, normalizedExecutable]),
    ),
    anchorExecutables: settings.anchorExecutables.filter(
      (entry) => entry !== normalizedExecutable,
    ),
  };
}

function withoutRule(
  settings: AutoMixingSettings,
  executableName: string,
): AutoMixingSettings {
  const normalizedExecutable = normalizeExecutableName(executableName);

  return {
    ...settings,
    anchorExecutables: settings.anchorExecutables.filter(
      (entry) => entry !== normalizedExecutable,
    ),
    excludedExecutables: settings.excludedExecutables.filter(
      (entry) => entry !== normalizedExecutable,
    ),
  };
}

function PageHeader({
  title,
  eyebrow,
  locked,
  onBack,
}: {
  title: string;
  eyebrow: string;
  locked: boolean;
  onBack?: () => void;
}) {
  return (
    <div className="auto-mixing-settings-head">
      {onBack ? (
        <button
          type="button"
          className="auto-mixing-icon-button"
          aria-label="返回选择应用"
          onClick={onBack}
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}
      <div className="auto-mixing-settings-head__copy">
        <span>{eyebrow}</span>
        <h3>{title}</h3>
      </div>
      <em>{locked ? "运行中，关闭后可编辑" : "关闭时可编辑"}</em>
    </div>
  );
}

function SelectedAppRow({
  candidate,
  disabled,
  onRemove,
}: {
  candidate: CandidateEntry;
  disabled: boolean;
  onRemove: (executableName: string) => void;
}) {
  return (
    <div className="auto-mixing-app-row" role="listitem" data-live={candidate.live}>
      <span className="auto-mixing-app-row__signal" aria-hidden="true" />
      <div className="auto-mixing-app-row__copy">
        <strong>{targetLabel(candidate)}</strong>
        <span>{candidate.executableName}</span>
      </div>
      <button
        type="button"
        className="auto-mixing-icon-button auto-mixing-icon-button--quiet"
        disabled={disabled}
        aria-label={`Remove ${candidate.executableName} from selected apps`}
        onClick={() => onRemove(candidate.executableName)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function CandidateRow({
  candidate,
  action,
  disabled,
  onAction,
}: {
  candidate: CandidateEntry;
  action: CandidateAction;
  disabled: boolean;
  onAction: (executableName: string) => void;
}) {
  const isSelectAction = action === "select";

  return (
    <div className="auto-mixing-candidate-row" role="listitem" data-live={candidate.live}>
      <span className="auto-mixing-candidate-row__signal" aria-hidden="true" />
      <div className="auto-mixing-candidate-row__copy">
        <strong>{targetLabel(candidate)}</strong>
        <span>{candidate.executableName}</span>
        <em>{candidate.note}</em>
      </div>
      <button
        type="button"
        className={
          isSelectAction
            ? "auto-mixing-icon-button auto-mixing-icon-button--primary"
            : "auto-mixing-icon-button"
        }
        disabled={disabled}
        aria-label={
          isSelectAction
            ? `Add ${candidate.executableName} to selected apps`
            : `Exclude ${candidate.executableName} from triggers`
        }
        onClick={() => onAction(candidate.executableName)}
      >
        {isSelectAction ? <Plus size={15} /> : <Ban size={15} />}
      </button>
    </div>
  );
}

function NavEntry({
  icon,
  title,
  meta,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="auto-mixing-nav-entry" onClick={onClick}>
      <span className="auto-mixing-nav-entry__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="auto-mixing-nav-entry__copy">
        <strong>{title}</strong>
        <em>{meta}</em>
      </span>
      <ChevronLeft size={15} aria-hidden="true" />
    </button>
  );
}

function CandidateGroup({
  title,
  emptyLabel,
  entries,
  action,
  disabled,
  onAction,
}: {
  title: string;
  emptyLabel: string;
  entries: CandidateEntry[];
  action: CandidateAction;
  disabled: boolean;
  onAction: (executableName: string) => void;
}) {
  return (
    <section className="auto-mixing-candidate-group">
      <div className="auto-mixing-candidate-group__head">
        <strong>{title}</strong>
        <span>{entries.length}</span>
      </div>
      <div className="auto-mixing-candidate-list" role="list">
        {entries.length === 0 ? (
          <div className="auto-mixing-empty">{emptyLabel}</div>
        ) : (
          entries.map((candidate) => (
            <CandidateRow
              key={`${title}-${candidate.executableName}`}
              candidate={candidate}
              action={action}
              disabled={disabled}
              onAction={onAction}
            />
          ))
        )}
      </div>
    </section>
  );
}

function formatSliderValue(value: number, unit: "%" | "ms") {
  return `${value}${unit}`;
}

function sliderPercent(value: number, min: number, max: number) {
  if (max <= min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}

function MixingSlider({
  label,
  kind,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  kind: SliderKind;
  value: number;
  min: number;
  max: number;
  unit: "%" | "ms";
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const displayValue = formatSliderValue(value, unit);
  const percent = sliderPercent(value, min, max);
  const sliderStyle = {
    "--auto-mixing-slider-percent": `${percent}%`,
  } as CSSProperties;

  const releaseDrag = () => {
    setIsDragging(false);
  };

  return (
    <label
      className="auto-mixing-slider-row"
      data-kind={kind}
      data-active={isDragging}
      data-disabled={disabled}
    >
      <span className="auto-mixing-slider-row__head">
        <strong>{label}</strong>
      </span>
      <span className="auto-mixing-slider-row__control" style={sliderStyle}>
        <span className="auto-mixing-slider-row__track" aria-hidden="true" />
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={displayValue}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          onPointerDown={() => setIsDragging(true)}
          onPointerUp={releaseDrag}
          onPointerCancel={releaseDrag}
          onBlur={releaseDrag}
        />
        <span className="auto-mixing-slider-row__value" aria-hidden="true">
          {displayValue}
        </span>
      </span>
    </label>
  );
}

function MixingControlsPanel({
  settings,
  disabled,
  onChange,
}: {
  settings: AutoMixingSettings;
  disabled: boolean;
  onChange: (settings: AutoMixingSettings) => void;
}) {
  return (
    <div className="auto-mixing-mix-panel">
      <div className="auto-mixing-mix-panel__sliders">
        <MixingSlider
          label="压低比例"
          kind="volume"
          value={settings.duckedVolumePercent}
          min={AUTO_MIXING_DUCKED_VOLUME_MIN}
          max={AUTO_MIXING_DUCKED_VOLUME_MAX}
          unit="%"
          disabled={disabled}
          onChange={(duckedVolumePercent) =>
            onChange({ ...settings, duckedVolumePercent })
          }
        />
        <MixingSlider
          label="渐入渐出"
          kind="fade"
          value={settings.fadeDurationMs}
          min={AUTO_MIXING_FADE_DURATION_MIN}
          max={AUTO_MIXING_FADE_DURATION_MAX}
          unit="ms"
          disabled={disabled}
          onChange={(fadeDurationMs) => onChange({ ...settings, fadeDurationMs })}
        />
      </div>
    </div>
  );
}

export function AutoMixingSettings({
  settings,
  disabled = false,
  onChange,
}: ModuleSettingsProps<AutoMixingSettings>) {
  const normalizedSettings = normalizeAutoMixingSettings(settings);
  const [page, setPage] = useState<SettingsPage>("select");
  const [scannedTargets, setScannedTargets] = useState<AutoMixingTarget[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!autoMixingSettingsEqual(normalizedSettings, settings)) {
      onChange(normalizedSettings);
    }
  }, [normalizedSettings, onChange, settings]);

  useEffect(() => {
    let cancelled = false;

    const syncTargets = async () => {
      try {
        const targets = await invoke<AutoMixingTarget[]>("auto_mixing_list_targets");
        if (cancelled) {
          return;
        }

        setScannedTargets(
          uniqueByExecutable(
            targets.map((target) => ({
              ...target,
              executableName: normalizeExecutableName(target.executableName),
            })),
          ),
        );
        setListError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setListError(
          error instanceof Error ? error.message : "扫描当前发声应用失败",
        );
      }
    };

    const interval = window.setInterval(syncTargets, 8_000);
    void syncTargets();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setSearchQuery("");
  }, [page]);

  const configuredExecutables = useMemo(
    () =>
      new Set([
        ...normalizedSettings.anchorExecutables,
        ...normalizedSettings.excludedExecutables,
      ]),
    [normalizedSettings.anchorExecutables, normalizedSettings.excludedExecutables],
  );

  const excludedExecutableSet = useMemo(
    () => new Set(normalizedSettings.excludedExecutables),
    [normalizedSettings.excludedExecutables],
  );

  const libraryMap = useMemo(
    () =>
      new Map(
        autoMixingMusicAppLibrary.map((entry) => [
          entry.executableName,
          entry,
        ]),
      ),
    [],
  );

  const scannedMap = useMemo(
    () =>
      new Map(
        scannedTargets.map((entry) => [
          entry.executableName,
          entry,
        ]),
      ),
    [scannedTargets],
  );

  const describeConfiguredEntry = (executableName: string): CandidateEntry => {
    const libraryEntry = libraryMap.get(executableName);
    const scannedEntry = scannedMap.get(executableName);

    if (scannedEntry) {
      return {
        executableName,
        displayName: scannedEntry.displayName,
        note: scannedEntry.hasAudioSession
          ? "当前已扫描到音频会话"
          : "当前正在运行",
        aliases: libraryEntry?.aliases ?? [],
        live: true,
      };
    }

    if (libraryEntry) {
      return {
        executableName,
        displayName: libraryEntry.displayName,
        note: "来自常用音乐应用",
        aliases: libraryEntry.aliases,
        live: false,
      };
    }

    return {
      executableName,
      displayName: executableName.replace(/\.exe$/i, ""),
      note: "手动添加的应用规则",
      aliases: [],
      live: false,
    };
  };

  const selectedTargets = useMemo(
    () =>
      normalizedSettings.anchorExecutables.map((entry) =>
        describeConfiguredEntry(entry),
      ),
    [normalizedSettings.anchorExecutables, scannedMap],
  );

  const excludedTargets = useMemo(
    () =>
      normalizedSettings.excludedExecutables.map((entry) =>
        describeConfiguredEntry(entry),
      ),
    [normalizedSettings.excludedExecutables, scannedMap],
  );

  const libraryEntries = useMemo(
    () =>
      autoMixingMusicAppLibrary.map((entry) => ({
        executableName: entry.executableName,
        displayName: entry.displayName,
        note: "常用音乐应用",
        aliases: entry.aliases,
        live: Boolean(scannedMap.get(entry.executableName)?.hasAudioSession),
      })),
    [scannedMap],
  );

  const scannedEntries = useMemo(
    () =>
      scannedTargets.map((entry) => ({
        executableName: entry.executableName,
        displayName: entry.displayName,
        note: entry.hasAudioSession ? "当前有音频会话" : "当前正在运行",
        aliases: libraryMap.get(entry.executableName)?.aliases ?? [],
        live: entry.hasAudioSession,
      })),
    [libraryMap, scannedTargets],
  );

  const selectableScannedCandidates = useMemo(
    () =>
      scannedEntries.filter(
        (entry) => !configuredExecutables.has(entry.executableName),
      ),
    [configuredExecutables, scannedEntries],
  );

  const selectableLibraryCandidates = useMemo(
    () =>
      libraryEntries.filter(
        (entry) => !configuredExecutables.has(entry.executableName),
      ),
    [configuredExecutables, libraryEntries],
  );

  const excludeScannedCandidates = useMemo(
    () =>
      scannedEntries.filter(
        (entry) => !excludedExecutableSet.has(entry.executableName),
      ),
    [excludedExecutableSet, scannedEntries],
  );

  const excludeLibraryCandidates = useMemo(
    () =>
      libraryEntries.filter(
        (entry) => !excludedExecutableSet.has(entry.executableName),
      ),
    [excludedExecutableSet, libraryEntries],
  );

  const recommendedCandidates = useMemo(
    () =>
      RECOMMENDED_EXECUTABLES.map((executableName) =>
        libraryEntries.find((entry) => entry.executableName === executableName),
      )
        .filter((entry): entry is CandidateEntry => Boolean(entry))
        .filter((entry) => !configuredExecutables.has(entry.executableName))
        .slice(0, 5),
    [configuredExecutables, libraryEntries],
  );

  const searchCandidates = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) {
      return [];
    }

    const isExcludePage = page === "exclude";
    const pool = uniqueByExecutable<CandidateEntry>([
      ...(isExcludePage ? excludeScannedCandidates : selectableScannedCandidates),
      ...(isExcludePage ? excludeLibraryCandidates : selectableLibraryCandidates),
      ...autoMixingMusicAppLibrary.map((entry: AutoMixingLibraryApp) => ({
        executableName: entry.executableName,
        displayName: entry.displayName,
        note: "常用音乐应用",
        aliases: entry.aliases,
        live: Boolean(scannedMap.get(entry.executableName)?.hasAudioSession),
      })),
    ]).filter((entry) =>
      isExcludePage
        ? !excludedExecutableSet.has(entry.executableName)
        : !configuredExecutables.has(entry.executableName),
    );

    const matched = pool.filter((entry) => matchesCandidate(entry, query)).slice(0, 8);
    const typedExecutable = normalizeExecutableName(searchQuery);
    const canAddTyped = isExcludePage
      ? typedExecutable && !excludedExecutableSet.has(typedExecutable)
      : typedExecutable && !configuredExecutables.has(typedExecutable);

    if (
      canAddTyped &&
      !matched.some((entry) => entry.executableName === typedExecutable)
    ) {
      matched.push({
        executableName: typedExecutable,
        displayName: typedExecutable.replace(/\.exe$/i, ""),
        note: "按输入结果手动添加",
        aliases: [],
        live: false,
      });
    }

    return matched;
  }, [
    configuredExecutables,
    excludeLibraryCandidates,
    excludeScannedCandidates,
    excludedExecutableSet,
    page,
    scannedMap,
    searchQuery,
    selectableLibraryCandidates,
    selectableScannedCandidates,
  ]);

  const updateSettings = (nextSettings: AutoMixingSettings) => {
    onChange(nextSettings);
  };

  const selectExecutable = (entry: string) => {
    updateSettings(withSelectedRule(normalizedSettings, entry));
  };

  const excludeExecutable = (entry: string) => {
    updateSettings(withBlockedRule(normalizedSettings, entry));
  };

  const removeExecutable = (entry: string) => {
    updateSettings(withoutRule(normalizedSettings, entry));
  };

  const renderSearch = () => (
    <label className="auto-mixing-search auto-mixing-search--compact">
      <Search size={14} aria-hidden="true" />
      <input
        type="text"
        value={searchQuery}
        disabled={disabled}
        aria-label="Search app candidates"
        placeholder="搜索应用名或输入 exe"
        onChange={(event) => setSearchQuery(event.target.value)}
      />
    </label>
  );

  if (page === "add") {
    return (
      <div className="settings-flow auto-mixing-shell" data-locked={disabled}>
        <section className="settings-section auto-mixing-console">
          <PageHeader
            title="添加应用"
            eyebrow="Auto Mixing"
            locked={disabled}
            onBack={() => setPage("select")}
          />

          {renderSearch()}

          {listError ? (
            <div className="auto-mixing-empty auto-mixing-empty--error">{listError}</div>
          ) : null}

          {searchQuery.trim() ? (
            <CandidateGroup
              title="搜索结果"
              emptyLabel="没有匹配项。可以继续输入更完整的应用名或 exe。"
              entries={searchCandidates}
              action="select"
              disabled={disabled}
              onAction={selectExecutable}
            />
          ) : (
            <>
              <CandidateGroup
                title="正在发声"
                emptyLabel="当前还没有扫描到新的发声应用。"
                entries={selectableScannedCandidates}
                action="select"
                disabled={disabled}
                onAction={selectExecutable}
              />
              <CandidateGroup
                title="常用音乐应用"
                emptyLabel="常用候选都已经被分配到规则里了。"
                entries={selectableLibraryCandidates}
                action="select"
                disabled={disabled}
                onAction={selectExecutable}
              />
            </>
          )}
        </section>
      </div>
    );
  }

  if (page === "exclude") {
    return (
      <div className="settings-flow auto-mixing-shell" data-locked={disabled}>
        <section className="settings-section auto-mixing-console">
          <PageHeader
            title="排除应用"
            eyebrow="Auto Mixing"
            locked={disabled}
            onBack={() => setPage("select")}
          />

          <div className="auto-mixing-selected-list" role="list" aria-label="Excluded apps">
            {excludedTargets.length === 0 ? (
              <div className="auto-mixing-empty">还没有排除应用。</div>
            ) : (
              excludedTargets.map((candidate) => (
                <SelectedAppRow
                  key={`excluded-${candidate.executableName}`}
                  candidate={candidate}
                  disabled={disabled}
                  onRemove={removeExecutable}
                />
              ))
            )}
          </div>

          {renderSearch()}

          {searchQuery.trim() ? (
            <CandidateGroup
              title="搜索结果"
              emptyLabel="没有匹配项。可以继续输入更完整的应用名或 exe。"
              entries={searchCandidates}
              action="exclude"
              disabled={disabled}
              onAction={excludeExecutable}
            />
          ) : (
            <>
              <CandidateGroup
                title="正在发声"
                emptyLabel="当前还没有可排除的发声应用。"
                entries={excludeScannedCandidates}
                action="exclude"
                disabled={disabled}
                onAction={excludeExecutable}
              />
              <CandidateGroup
                title="常用应用"
                emptyLabel="没有更多可排除候选。"
                entries={excludeLibraryCandidates}
                action="exclude"
                disabled={disabled}
                onAction={excludeExecutable}
              />
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="settings-flow auto-mixing-shell" data-locked={disabled}>
      <MixingControlsPanel
        settings={normalizedSettings}
        disabled={disabled}
        onChange={updateSettings}
      />

      <section className="settings-section auto-mixing-console">
        <PageHeader title="选择应用" eyebrow="Auto Mixing" locked={disabled} />

        <div className="auto-mixing-selected-panel">
          <div className="auto-mixing-selected-panel__head">
            <strong>被压低的应用</strong>
            <span>{selectedTargets.length}</span>
          </div>

          <div className="auto-mixing-selected-list" role="list" aria-label="Selected apps">
            {selectedTargets.length === 0 ? (
              <div className="auto-mixing-selection-empty">
                <strong>还没有选择应用</strong>
                <span>先选择一个音乐或背景声应用，再打开卡片开关。</span>
              </div>
            ) : (
              selectedTargets.map((candidate) => (
                <SelectedAppRow
                  key={`selected-${candidate.executableName}`}
                  candidate={candidate}
                  disabled={disabled}
                  onRemove={removeExecutable}
                />
              ))
            )}
          </div>
        </div>

        {recommendedCandidates.length > 0 ? (
          <div className="auto-mixing-recommend-strip" role="list" aria-label="Recommended apps">
            {recommendedCandidates.map((candidate) => (
              <button
                key={`recommended-${candidate.executableName}`}
                type="button"
                className="auto-mixing-recommend-chip"
                disabled={disabled}
                aria-label={`Add ${candidate.executableName} to selected apps`}
                onClick={() => selectExecutable(candidate.executableName)}
              >
                <Plus size={13} aria-hidden="true" />
                <span>{targetLabel(candidate)}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="auto-mixing-nav-list">
          <NavEntry
            icon={<ListPlus size={16} />}
            title="添加应用"
            meta="扫描、常用库、手动 exe"
            onClick={() => setPage("add")}
          />
          <NavEntry
            icon={<Ban size={16} />}
            title="排除应用"
            meta={`${excludedTargets.length} 个应用`}
            onClick={() => setPage("exclude")}
          />
        </div>

        <div className="auto-mixing-system-toggle">
          <span className="auto-mixing-system-toggle__icon" aria-hidden="true">
            <Volume2 size={16} />
          </span>
          <div className="auto-mixing-system-toggle__copy">
            <strong>系统声音触发</strong>
            <span>通知音、提示音也参与触发判断。</span>
          </div>
          <button
            type="button"
            className="auto-mixing-toggle-chip"
            data-active={normalizedSettings.systemSoundsTriggerEnabled}
            disabled={disabled}
            aria-label="Toggle system sounds trigger"
            onClick={() =>
              updateSettings({
                ...normalizedSettings,
                systemSoundsTriggerEnabled:
                  !normalizedSettings.systemSoundsTriggerEnabled,
              })
            }
          >
            {normalizedSettings.systemSoundsTriggerEnabled ? "开启" : "关闭"}
          </button>
        </div>
      </section>
    </div>
  );
}
