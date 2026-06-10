import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ModuleSettingsProps } from "@/app/registry/moduleTypes";
import { SettingsChoiceCard } from "@/app/ui/SettingsChoiceCard";
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
    selectedExecutables: Array.from(
      new Set([...settings.selectedExecutables, normalizedExecutable]),
    ),
    blockedExecutables: settings.blockedExecutables.filter(
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
    blockedExecutables: Array.from(
      new Set([...settings.blockedExecutables, normalizedExecutable]),
    ),
    selectedExecutables: settings.selectedExecutables.filter(
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
    selectedExecutables: settings.selectedExecutables.filter(
      (entry) => entry !== normalizedExecutable,
    ),
    blockedExecutables: settings.blockedExecutables.filter(
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
    ...settings.selectedExecutables,
    ...settings.blockedExecutables,
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
    return "当前检测到音频会话";
  }

  if (target.isRunning) {
    return "当前正在运行，等待它开始出声";
  }

  return "规则已保存，等待它下次出现";
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
                  放到自动降低
                </button>
                <button
                  type="button"
                  className="auto-mixing-action"
                  disabled={disabled}
                  onClick={() => onMoveToBlocked(target.executableName)}
                >
                  放到屏蔽
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
  const [targets, setTargets] = useState<AutoMixingTarget[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedExecutable, setSelectedExecutable] = useState<string | null>(null);

  useEffect(() => {
    if (!autoMixingSettingsEqual(normalizedSettings, settings)) {
      onChange(normalizedSettings);
    }
  }, [normalizedSettings, onChange, settings]);

  useEffect(() => {
    let cancelled = false;

    const syncTargets = async () => {
      try {
        const nextTargets = await invoke<AutoMixingTarget[]>("auto_mixing_list_targets");
        if (cancelled) {
          return;
        }

        setTargets(nextTargets);
        setListError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setListError(error instanceof Error ? error.message : "应用扫描失败");
      }
    };

    const interval = window.setInterval(syncTargets, 8_000);
    void syncTargets();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const allTargets = useMemo(() => {
    const merged = mergeRuleOnlyTargets(targets, normalizedSettings);
    return merged.sort((left, right) => {
      return Number(right.hasAudioSession) - Number(left.hasAudioSession) ||
        targetLabel(left).localeCompare(targetLabel(right)) ||
        left.executableName.localeCompare(right.executableName);
    });
  }, [normalizedSettings, targets]);

  const sourceTargets = useMemo(() => {
    if (normalizedSettings.sourceView === "all-processes") {
      return allTargets;
    }

    return allTargets.filter((target) => target.hasAudioSession);
  }, [allTargets, normalizedSettings.sourceView]);

  useEffect(() => {
    if (sourceTargets.length === 0) {
      setSelectedExecutable(null);
      return;
    }

    const stillExists = sourceTargets.some(
      (target) => target.executableName === selectedExecutable,
    );
    if (!stillExists) {
      setSelectedExecutable(sourceTargets[0]!.executableName);
    }
  }, [selectedExecutable, sourceTargets]);

  const activeTarget =
    sourceTargets.find((target) => target.executableName === selectedExecutable) ??
    allTargets.find((target) => target.executableName === selectedExecutable) ??
    null;

  const selectedTargets = useMemo(
    () =>
      normalizedSettings.selectedExecutables.map((entry) => {
        return (
          allTargets.find((target) => target.executableName === entry) ?? {
            executableName: entry,
            displayName: entry.replace(/\.exe$/i, ""),
            hasAudioSession: false,
            isRunning: false,
          }
        );
      }),
    [allTargets, normalizedSettings.selectedExecutables],
  );

  const blockedTargets = useMemo(
    () =>
      normalizedSettings.blockedExecutables.map((entry) => {
        return (
          allTargets.find((target) => target.executableName === entry) ?? {
            executableName: entry,
            displayName: entry.replace(/\.exe$/i, ""),
            hasAudioSession: false,
            isRunning: false,
          }
        );
      }),
    [allTargets, normalizedSettings.blockedExecutables],
  );

  const updateSettings = (nextSettings: AutoMixingSettings) => {
    if (disabled) {
      return;
    }

    onChange(nextSettings);
  };

  const selectionState = activeTarget
    ? normalizedSettings.blockedExecutables.includes(activeTarget.executableName)
      ? "已在屏蔽"
      : normalizedSettings.selectedExecutables.includes(activeTarget.executableName)
        ? "已在自动降低"
        : "尚未加入规则"
    : "先选一个应用";

  return (
    <div className="settings-flow">
      <section className="settings-section settings-flow__section settings-flow__section--picker">
        <div className="settings-choice-grid" role="tablist" aria-label="自动混音扫描来源">
          <SettingsChoiceCard
            title="有音频的应用"
            description="优先扫描当前有音频会话的音乐、播放器、会议和浏览器标签页。"
            meta="音乐软件优先"
            statusLabel={
              normalizedSettings.sourceView === "audio-sessions" ? "当前查看" : "点击切换"
            }
            selected={normalizedSettings.sourceView === "audio-sessions"}
            disabled={disabled}
            controlsId="auto-mixing-source-area"
            onClick={() =>
              updateSettings({
                ...normalizedSettings,
                sourceView: "audio-sessions",
              })
            }
          />
          <SettingsChoiceCard
            title="所有进程"
            description="补充还没出声的应用规则，等它们出现音频会话后自动生效。"
            meta="补规则"
            statusLabel={
              normalizedSettings.sourceView === "all-processes" ? "当前查看" : "点击切换"
            }
            selected={normalizedSettings.sourceView === "all-processes"}
            disabled={disabled}
            controlsId="auto-mixing-source-area"
            onClick={() =>
              updateSettings({
                ...normalizedSettings,
                sourceView: "all-processes",
              })
            }
          />
        </div>
      </section>

      <section
        id="auto-mixing-source-area"
        className="settings-section settings-flow__section settings-flow__section--active auto-mixing-section"
      >
        <div className="settings-section__header">
          <h3>扫描与选择</h3>
          <p>先从来源里点选一个应用，再把它放进自动降低或屏蔽规则。</p>
        </div>

        <SettingsStatusPill
          label="当前来源"
          value={
            normalizedSettings.sourceView === "audio-sessions" ? "有音频的应用" : "所有进程"
          }
        />

        {listError ? <div className="auto-mixing-empty auto-mixing-empty--error">{listError}</div> : null}

        <div className="auto-mixing-layout">
          <SourceList
            targets={sourceTargets}
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
                加入自动降低
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
                加入屏蔽
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
          <p>把已经选中的应用集中管理。自动降低和屏蔽在这里统一查看和调整。</p>
        </div>

        <div className="auto-mixing-rule-grid">
          <RuleList
            title="自动降低"
            emptyLabel="还没有要被自动降低的应用。"
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
            title="屏蔽"
            emptyLabel="还没有屏蔽应用。"
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
    </div>
  );
}
