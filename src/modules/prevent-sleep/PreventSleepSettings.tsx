import type { ChangeEvent } from "react";
import type { ModuleSettingsProps } from "@/app/registry/moduleTypes";
import { SettingsChoiceCard } from "@/app/ui/SettingsChoiceCard";
import { SettingsStatusPill } from "@/app/ui/SettingsStatusPill";
import { SettingsValueButton } from "@/app/ui/SettingsValueButton";

type PreventSleepSettingsModel = {
  clickMode: "idle-keepalive" | "continuous";
  idleActivationSeconds: number;
  idleRepeatSeconds: number;
  continuousIntervalSeconds: number;
  continuousHotkey: string;
};

const HOTKEY_OPTIONS = ["PgDn", "PgUp", "End", "Home", "F8", "F9", "F10"] as const;

function clampSeconds(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(3600, Math.round(value)));
}

function normalizeHotkey(current: string) {
  const supportedHotkey = HOTKEY_OPTIONS.find((hotkey) => hotkey === current);
  return supportedHotkey ?? HOTKEY_OPTIONS[0];
}

function nextHotkey(current: string) {
  const currentIndex = HOTKEY_OPTIONS.indexOf(normalizeHotkey(current));
  return HOTKEY_OPTIONS[(currentIndex + 1) % HOTKEY_OPTIONS.length];
}

export function PreventSleepSettings({
  settings,
  disabled = false,
  onChange,
}: ModuleSettingsProps<PreventSleepSettingsModel>) {
  const isIdleKeepalive = settings.clickMode === "idle-keepalive";
  const currentModeName = isIdleKeepalive ? "空闲保活" : "鼠标连点";
  const currentHotkey = normalizeHotkey(settings.continuousHotkey);

  const updateField = <K extends keyof PreventSleepSettingsModel>(
    key: K,
    value: PreventSleepSettingsModel[K],
  ) => {
    if (disabled) {
      return;
    }

    onChange({
      ...settings,
      [key]: value,
    });
  };

  const updateSeconds =
    (key: "idleActivationSeconds" | "idleRepeatSeconds" | "continuousIntervalSeconds") =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const current = settings[key];
      updateField(key, clampSeconds(Number(event.target.value), current));
    };

  return (
    <div className="settings-flow">
      <section className="settings-section settings-flow__section settings-flow__section--picker">
        <div className="settings-choice-grid" role="tablist" aria-label="防止休眠运行方式">
          <SettingsChoiceCard
            title="空闲保活"
            description="检测到你一段时间没有操作后，自动进入保活。"
            meta="自动触发"
            statusLabel={isIdleKeepalive ? "当前使用" : "点击切换"}
            selected={isIdleKeepalive}
            disabled={disabled}
            controlsId="prevent-sleep-active-settings"
            onClick={() => updateField("clickMode", "idle-keepalive")}
          />
          <SettingsChoiceCard
            title="鼠标连点"
            description="通过快捷键主动开始或停止保活，更适合需要手动控制的场景。"
            meta="快捷键控制"
            statusLabel={isIdleKeepalive ? "点击切换" : "当前使用"}
            selected={!isIdleKeepalive}
            disabled={disabled}
            controlsId="prevent-sleep-active-settings"
            onClick={() => updateField("clickMode", "continuous")}
          />
        </div>
      </section>

      <section
        id="prevent-sleep-active-settings"
        className="settings-section settings-flow__section settings-flow__section--active"
      >
        <SettingsStatusPill label="当前模式" value={currentModeName} />

        <div className="prevent-sleep-fields">
          {isIdleKeepalive ? (
            <>
              <label className="prevent-sleep-field">
                <span>多久无操作后激活</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={disabled}
                  value={settings.idleActivationSeconds}
                  onChange={updateSeconds("idleActivationSeconds")}
                  aria-label="多久无操作后激活"
                />
                <em>秒</em>
              </label>

              <label className="prevent-sleep-field">
                <span>激活后每隔多久执行一次</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={disabled}
                  value={settings.idleRepeatSeconds}
                  onChange={updateSeconds("idleRepeatSeconds")}
                  aria-label="激活后每隔多久执行一次"
                />
                <em>秒</em>
              </label>
            </>
          ) : (
            <>
              <SettingsValueButton
                label="鼠标连点快捷键"
                value={currentHotkey}
                unit="键"
                hint={`点击切换 ${HOTKEY_OPTIONS.join(" / ")}`}
                disabled={disabled}
                ariaLabel="鼠标连点快捷键"
                onClick={() => updateField("continuousHotkey", nextHotkey(currentHotkey))}
              />

              <label className="prevent-sleep-field">
                <span>鼠标连点触发间隔</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  disabled={disabled}
                  value={settings.continuousIntervalSeconds}
                  onChange={updateSeconds("continuousIntervalSeconds")}
                  aria-label="鼠标连点触发间隔"
                />
                <em>秒</em>
              </label>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
