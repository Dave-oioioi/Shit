import type { ChangeEvent } from "react";
import type { ModuleSettingsProps } from "@/app/registry/moduleTypes";
import { SettingsSection } from "@/app/ui/SettingsSection";

type PreventSleepSettingsModel = {
  keepDisplayOn: boolean;
  keepSystemAwake: boolean;
  triggerPreset: string;
};

export function PreventSleepSettings({
  settings,
  onChange,
}: ModuleSettingsProps<PreventSleepSettingsModel>) {
  const updateField = <K extends keyof PreventSleepSettingsModel>(
    key: K,
    value: PreventSleepSettingsModel[K],
  ) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <>
      <SettingsSection title="常亮行为" description="设置保持唤醒的基础策略。">
        <label className="settings-switch">
          <span>保持屏幕常亮</span>
          <input
            type="checkbox"
            checked={settings.keepDisplayOn}
            onChange={(event) => updateField("keepDisplayOn", event.target.checked)}
          />
        </label>
        <label className="settings-switch">
          <span>保持系统唤醒</span>
          <input
            type="checkbox"
            checked={settings.keepSystemAwake}
            onChange={(event) => updateField("keepSystemAwake", event.target.checked)}
          />
        </label>
      </SettingsSection>

      <SettingsSection title="预设" description="选择默认使用的工作预设。">
        <label className="settings-field">
          <span>触发预设</span>
          <select
            value={settings.triggerPreset}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateField("triggerPreset", event.target.value)
            }
          >
            <option value="focus-session">专注会话</option>
            <option value="presentation">演示模式</option>
            <option value="download-window">下载时段</option>
          </select>
        </label>
      </SettingsSection>
    </>
  );
}
