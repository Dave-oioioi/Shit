import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModuleSettingsProps } from "@/app/registry/moduleTypes";
import { SettingsStatusPill } from "@/app/ui/SettingsStatusPill";
import {
  autoMixingSettingsEqual,
  normalizeAutoMixingSettings,
  type AutoMixingSettings,
} from "@/modules/auto-mixing/defaults";

type AutoMixingTarget = {
  executableName: string;
  displayName: string;
  processId?: number;
  hasAudioSession: boolean;
  isRunning: boolean;
};

type AutoMixingDiagnosticSession = {
  sessionKey: string;
  executableName: string;
  displayName: string;
  processId?: number;
  active: boolean;
  currentVolume: number;
};

type AutoMixingDuckedSession = {
  sessionKey: string;
  executableName: string;
  displayName: string;
  processId?: number;
  currentVolume: number;
  originalVolume: number;
  expectedDuckedVolume: number;
  manualOverride: boolean;
};

type AutoMixingDiagnostics = {
  currentSessions: AutoMixingDiagnosticSession[];
  duckedSessions: AutoMixingDuckedSession[];
};

type CachedSession = AutoMixingDiagnosticSession & {
  cachedAt: number;
};

const SESSION_CACHE_MS = 8_000;

function normalizeExecutable(value: string) {
  return value.trim().toLowerCase();
}

function withSelectedRule(
  settings: AutoMixingSettings,
  executableName: string,
): AutoMixingSettings {
  const normalizedExecutable = normalizeExecutable(executableName);

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
  const normalizedExecutable = normalizeExecutable(executableName);

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
  const normalizedExecutable = normalizeExecutable(executableName);

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

function targetLabel(target: AutoMixingTarget) {
  return target.displayName || target.executableName.replace(/\.exe$/i, "");
}

function mergeRuleOnlyTargets(
  targets: AutoMixingTarget[],
  settings: AutoMixingSettings,
): AutoMixingTarget[] {
  const knownTargets = new Set(targets.map((target) => target.executableName));
  const ruleOnlyTargets = [
    ...settings.anchorExecutables,
    ...settings.excludedExecutables,
  ]
    .filter((entry, index, list) => list.indexOf(entry) === index)
    .filter((entry) => !knownTargets.has(entry))
    .map((entry) => ({
      executableName: entry,
      displayName: entry.replace(/\.exe$/i, ""),
      hasAudioSession: false,
      isRunning: false,
    }));

  return [...targets, ...ruleOnlyTargets];
}

function describeTarget(target: AutoMixingTarget) {
  if (target.hasAudioSession) {
    return "当前正在系统音量合成器中出声";
  }

  if (target.isRunning) {
    return "当前正在运行，等待它重新出现在音量合成器";
  }

  return "规则已保存，等待它下次出现在音量合成器";
}

function SourceList({
  targets,
  selectedExecutable,
  onSelect,
}: {
  targets: AutoMixingTarget[];
  selectedExecutable: string | null;
  onSelect: (executableName: string) => void;
}) {
  return (
    <div className="auto-mixing-source-list" role="listbox" aria-label="可选择的应用">
      {targets.length === 0 ? (
        <div className="auto-mixing-empty">当前没有可选择的应用。</div>
      ) : (
        targets.map((target) => {
          const selected = selectedExecutable === target.executableName;

          return (
            <button
              key={target.executableName}
              type="button"
              role="option"
              aria-selected={selected}
              className="auto-mixing-source-item"
              data-selected={selected}
              onClick={() => onSelect(target.executableName)}
            >
              <span className="auto-mixing-source-item__copy">
                <strong>{targetLabel(target)}</strong>
                <span>{target.executableName}</span>
              </span>
              <span className="auto-mixing-source-item__meta">
                <em>{target.hasAudioSession ? "有音频" : "未出声"}</em>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}

function RuleList({
  title,
  emptyLabel,
  entries,
  disabled,
  onMoveToSelected,
  onMoveToBlocked,
  onRemove,
}: {
  title: string;
  emptyLabel: string;
  entries: AutoMixingTarget[];
  disabled: boolean;
  onMoveToSelected: (executableName: string) => void;
  onMoveToBlocked: (executableName: string) => void;
  onRemove: (executableName: string) => void;
}) {
  return (
    <div className="auto-mixing-rule-panel">
      <div className="auto-mixing-rule-panel__header">
        <strong>{title}</strong>
      </div>
      <div className="auto-mixing-list" role="list">
        {entries.length === 0 ? (
          <div className="auto-mixing-empty">{emptyLabel}</div>
        ) : (
          entries.map((target) => (
            <div className="auto-mixing-target" key={`${title}-${target.executableName}`} role="listitem">
              <div className="auto-mixing-target__copy">
                <strong>{targetLabel(target)}</strong>
                <span>{target.executableName}</span>
                <em>{describeTarget(target)}</em>
              </div>
              <div className="auto-mixing-target__actions">
                <button
                  type="button"
                  className="auto-mixing-action auto-mixing-action--primary"
                  disabled={disabled}
                  onClick={() => onMoveToSelected(target.executableName)}
                >
                  设为BGM目标
                </button>
                <button
                  type="button"
                  className="auto-mixing-action"
                  disabled={disabled}
                  onClick={() => onMoveToBlocked(target.executableName)}
                >
                  忽略此声音
                </button>
                <button
                  type="button"
                  className="auto-mixing-action auto-mixing-action--quiet"
                  disabled={disabled}
                  onClick={() => onRemove(target.executableName)}
                >
                  移除
                </button>
              </div>
            </div>
          ))
        )}
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
  const [currentSessions, setCurrentSessions] = useState<AutoMixingDiagnosticSession[]>([]);
  const [duckedSessions, setDuckedSessions] = useState<AutoMixingDuckedSession[]>([]);
  const [cachedSessions, setCachedSessions] = useState<Record<string, CachedSession>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [selectedExecutable, setSelectedExecutable] = useState<string | null>(null);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);

  useEffect(() => {
    if (!autoMixingSettingsEqual(normalizedSettings, settings)) {
      onChange(normalizedSettings);
    }
  }, [normalizedSettings, onChange, settings]);

  useEffect(() => {
    let cancelled = false;

    const syncTargets = async () => {
      try {
        const diagnostics = await invoke<AutoMixingDiagnostics>("auto_mixing_diagnostics");
        if (cancelled) {
          return;
        }

        setCurrentSessions(diagnostics.currentSessions);
        setDuckedSessions(diagnostics.duckedSessions);
        setCachedSessions((currentCache) => {
          const now = Date.now();
          const nextCache: Record<string, CachedSession> = {};

          for (const session of diagnostics.currentSessions) {
            nextCache[session.sessionKey] = {
              ...session,
              cachedAt: now,
            };
          }

          for (const session of Object.values(currentCache)) {
            if (nextCache[session.sessionKey]) {
              continue;
            }

            if (now - session.cachedAt <= SESSION_CACHE_MS) {
              nextCache[session.sessionKey] = session;
            }
          }

          return nextCache;
        });
        setListError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setListError(error instanceof Error ? error.message : "读取音量合成器失败");
      }
    };

    const interval = window.setInterval(syncTargets, 8_000);
    void syncTargets();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const targets = useMemo<AutoMixingTarget[]>(
    () =>
      Object.values(cachedSessions).map((session) => ({
        executableName: session.executableName,
        displayName: session.displayName,
        processId: session.processId,
        hasAudioSession: session.active,
        isRunning: true,
      })),
    [cachedSessions],
  );

  const mixerTargets = useMemo(() => {
    return [...targets].sort((left, right) => {
      return Number(right.hasAudioSession) - Number(left.hasAudioSession) ||
        targetLabel(left).localeCompare(targetLabel(right)) ||
        left.executableName.localeCompare(right.executableName);
    });
  }, [targets]);

  const allTargets = useMemo(() => {
    const merged = mergeRuleOnlyTargets(targets, normalizedSettings);
    return merged.sort((left, right) => {
      return Number(right.hasAudioSession) - Number(left.hasAudioSession) ||
        targetLabel(left).localeCompare(targetLabel(right)) ||
        left.executableName.localeCompare(right.executableName);
    });
  }, [normalizedSettings, targets]);

  useEffect(() => {
    if (mixerTargets.length === 0) {
      setSelectedExecutable(null);
      return;
    }

    const stillExists = mixerTargets.some(
      (target) => target.executableName === selectedExecutable,
    );
    if (!stillExists) {
      setSelectedExecutable(mixerTargets[0]!.executableName);
    }
  }, [mixerTargets, selectedExecutable]);

  const activeTarget =
    mixerTargets.find((target) => target.executableName === selectedExecutable) ??
    allTargets.find((target) => target.executableName === selectedExecutable) ??
    null;

  const selectedTargets = useMemo(
    () =>
      normalizedSettings.anchorExecutables.map((entry) => {
        return (
          allTargets.find((target) => target.executableName === entry) ?? {
            executableName: entry,
            displayName: entry.replace(/\.exe$/i, ""),
            hasAudioSession: false,
            isRunning: false,
          }
        );
      }),
    [allTargets, normalizedSettings.anchorExecutables],
  );

  const blockedTargets = useMemo(
    () =>
      normalizedSettings.excludedExecutables.map((entry) => {
        return (
          allTargets.find((target) => target.executableName === entry) ?? {
            executableName: entry,
            displayName: entry.replace(/\.exe$/i, ""),
            hasAudioSession: false,
            isRunning: false,
          }
        );
      }),
    [allTargets, normalizedSettings.excludedExecutables],
  );

  const updateSettings = (nextSettings: AutoMixingSettings) => {
    if (disabled) {
      return;
    }

    onChange(nextSettings);
  };

  const selectionState = activeTarget
    ? normalizedSettings.excludedExecutables.includes(activeTarget.executableName)
      ? "已忽略触发"
      : normalizedSettings.anchorExecutables.includes(activeTarget.executableName)
        ? "已设为BGM目标"
        : "尚未加入规则"
    : "先选一个应用";

  return (
    <div className="settings-flow">
      <section
        id="auto-mixing-source-area"
        className="settings-section settings-flow__section settings-flow__section--active auto-mixing-section"
      >
        <div className="settings-section__header">
          <h3>系统音量合成器</h3>
          <p>这里直接读取 Windows 音量合成器里当前有音频会话的应用。先选一个应用，把它设为会被自动压低的 BGM；其它应用出声时就会触发压低。</p>
        </div>

        <SettingsStatusPill
          label="读取来源"
          value="系统音量合成器"
        />

        {listError ? <div className="auto-mixing-empty auto-mixing-empty--error">{listError}</div> : null}

        <div className="auto-mixing-layout">
          <SourceList
            targets={mixerTargets}
            selectedExecutable={selectedExecutable}
            onSelect={setSelectedExecutable}
          />

          <div className="auto-mixing-selection-card">
            <SettingsStatusPill
              label="当前选择"
              value={activeTarget ? targetLabel(activeTarget) : "未选择"}
            />
            <p className="auto-mixing-selection-card__summary">{selectionState}</p>
            <p className="auto-mixing-selection-card__hint">
              {activeTarget ? describeTarget(activeTarget) : "从左侧来源列表中选择一个应用。"}
            </p>
            <div className="auto-mixing-selection-card__actions">
              <button
                type="button"
                className="auto-mixing-action auto-mixing-action--primary"
                disabled={disabled || !activeTarget}
                onClick={() =>
                  activeTarget &&
                  updateSettings(withSelectedRule(normalizedSettings, activeTarget.executableName))
                }
              >
                设为BGM目标
              </button>
              <button
                type="button"
                className="auto-mixing-action"
                disabled={disabled || !activeTarget}
                onClick={() =>
                  activeTarget &&
                  updateSettings(withBlockedRule(normalizedSettings, activeTarget.executableName))
                }
              >
                忽略此声音
              </button>
              <button
                type="button"
                className="auto-mixing-action auto-mixing-action--quiet"
                disabled={disabled || !activeTarget}
                onClick={() =>
                  activeTarget &&
                  updateSettings(withoutRule(normalizedSettings, activeTarget.executableName))
                }
              >
                从规则中移除
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="settings-section auto-mixing-section">
        <div className="settings-section__header">
          <h3>已选规则</h3>
          <p>BGM 目标会在其它应用出声时被自动压低；被忽略的应用即使出声，也不会触发压低。</p>
        </div>

        <div className="auto-mixing-rule-grid">
          <RuleList
            title="BGM目标"
            emptyLabel="还没有会被自动压低的 BGM 应用。"
            entries={selectedTargets}
            disabled={disabled}
            onMoveToSelected={(entry) =>
              updateSettings(withSelectedRule(normalizedSettings, entry))
            }
            onMoveToBlocked={(entry) =>
              updateSettings(withBlockedRule(normalizedSettings, entry))
            }
            onRemove={(entry) => updateSettings(withoutRule(normalizedSettings, entry))}
          />

          <RuleList
            title="忽略触发"
            emptyLabel="还没有被忽略的触发应用。"
            entries={blockedTargets}
            disabled={disabled}
            onMoveToSelected={(entry) =>
              updateSettings(withSelectedRule(normalizedSettings, entry))
            }
            onMoveToBlocked={(entry) =>
              updateSettings(withBlockedRule(normalizedSettings, entry))
            }
            onRemove={(entry) => updateSettings(withoutRule(normalizedSettings, entry))}
          />
        </div>
      </section>

      <section className="settings-section auto-mixing-section">
        <div className="auto-mixing-diagnostics__header-row">
          <div className="settings-section__header">
            <h3>运行时诊断</h3>
            <p>默认折叠。这里只展示系统当前读到的会话，以及当前真正被压低的目标。</p>
          </div>
          <button
            type="button"
            className="auto-mixing-action auto-mixing-action--quiet"
            aria-expanded={diagnosticsExpanded}
            onClick={() => setDiagnosticsExpanded((value) => !value)}
          >
            {diagnosticsExpanded ? "收起诊断" : "展开诊断"}
          </button>
        </div>

        {diagnosticsExpanded ? (
          <div className="auto-mixing-diagnostics">
            <div className="auto-mixing-rule-panel">
              <div className="auto-mixing-rule-panel__header">
                <strong>当前会话</strong>
              </div>
              <div className="auto-mixing-list" role="list">
                {currentSessions.length === 0 ? (
                  <div className="auto-mixing-empty">系统音量合成器当前没有可见会话。</div>
                ) : (
                  currentSessions.map((session) => (
                    <div
                      className="auto-mixing-target"
                      key={`session-${session.sessionKey}`}
                      role="listitem"
                    >
                      <div className="auto-mixing-target__copy">
                        <strong>{session.displayName || session.executableName}</strong>
                        <span>{session.executableName}</span>
                        <em>
                          {session.active ? "当前出声" : "当前未出声"} · 音量 {Math.round(session.currentVolume * 100)}%
                        </em>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="auto-mixing-rule-panel">
              <div className="auto-mixing-rule-panel__header">
                <strong>当前被压低的BGM</strong>
              </div>
              <div className="auto-mixing-list" role="list">
                {duckedSessions.length === 0 ? (
                  <div className="auto-mixing-empty">当前没有正在被压低的会话。</div>
                ) : (
                  duckedSessions.map((session) => (
                    <div
                      className="auto-mixing-target"
                      key={`ducked-${session.sessionKey}`}
                      role="listitem"
                    >
                      <div className="auto-mixing-target__copy">
                        <strong>{session.displayName || session.executableName}</strong>
                        <span>{session.executableName}</span>
                        <em>
                          当前 {Math.round(session.currentVolume * 100)}% · 原始 {Math.round(session.originalVolume * 100)}% · 目标 {Math.round(session.expectedDuckedVolume * 100)}%
                          {session.manualOverride ? " · 手动接管" : ""}
                        </em>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
