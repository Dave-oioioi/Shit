import type { ChangeEvent } from "react";
import type { ModuleSettingsProps } from "@/app/registry/moduleTypes";
import { SettingsSection } from "@/app/ui/SettingsSection";

type AutoMixingSettingsModel = {
  mode: string;
  autoStart: boolean;
  aggressiveBalancing: boolean;
};

export function AutoMixingSettings({
  settings,
  onChange,
}: ModuleSettingsProps<AutoMixingSettingsModel>) {
  const updateField = <K extends keyof AutoMixingSettingsModel>(
    key: K,
    value: AutoMixingSettingsModel[K],
  ) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <>
      <SettingsSection title="场景配置" description="设置默认使用的音频场景。">
        <label className="settings-field">
          <span>默认场景</span>
          <select
            value={settings.mode}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateField("mode", event.target.value)
            }
          >
            <option value="presentation">演示</option>
            <option value="meeting">会议</option>
            <option value="media">媒体</option>
          </select>
        </label>
      </SettingsSection>

      <SettingsSection title="模块行为" description="控制模块启动和处理强度。">
        <label className="settings-switch">
          <span>启动时启用</span>
          <input
            type="checkbox"
            checked={settings.autoStart}
            onChange={(event) => updateField("autoStart", event.target.checked)}
          />
        </label>
        <label className="settings-switch">
          <span>强平衡模式</span>
          <input
            type="checkbox"
            checked={settings.aggressiveBalancing}
            onChange={(event) => updateField("aggressiveBalancing", event.target.checked)}
          />
        </label>
      </SettingsSection>
    </>
  );
}
