import type { ComponentType } from "react";
import { X } from "lucide-react";
import type {
  ModuleDefinition,
  ModuleSettingsProps,
  RegisteredModuleDefinition,
} from "@/app/registry/moduleTypes";
import { useModuleSettings } from "@/app/hooks/useModuleSettings";
import { useToggleModuleEnabled } from "@/app/hooks/useToggleModuleEnabled";
import { useLayoutStore } from "@/app/state/layoutStore";
import { useRegistryStore } from "@/app/state/registryStore";

export function ModuleSettingsDrawer() {
  const settingsDrawerModuleId = useLayoutStore((state) => state.settingsDrawerModuleId);
  const modules = useRegistryStore((state) => state.modules);
  const moduleDefinition = modules.find(
    (candidate) => candidate.manifest.id === settingsDrawerModuleId,
  );

  if (!moduleDefinition) {
    return <aside className="drawer drawer--hidden" aria-hidden="true" />;
  }

  return <ActiveModuleSettingsDrawer moduleDefinition={moduleDefinition} />;
}

type ActiveModuleSettingsDrawerProps = {
  moduleDefinition: RegisteredModuleDefinition;
};

function ActiveModuleSettingsDrawer({
  moduleDefinition,
}: ActiveModuleSettingsDrawerProps) {
  const closeSettingsDrawer = useLayoutStore((state) => state.closeSettingsDrawer);
  const isEnabled = useRegistryStore((state) => state.isEnabled);
  const toggleModuleEnabled = useToggleModuleEnabled();
  const hostModuleDefinition = moduleDefinition as ModuleDefinition<
    Record<string, unknown>,
    Record<string, unknown>
  >;
  const { settings, updateSettings } = useModuleSettings(
    moduleDefinition.manifest.id,
    hostModuleDefinition,
  );
  const SettingsComponent = moduleDefinition.SettingsComponent as ComponentType<
    ModuleSettingsProps<Record<string, unknown>>
  >;

  return (
    <aside className="drawer">
      <div className="drawer__header">
        <div>
          <p className="dashboard__eyebrow">模块设置</p>
          <h2>{moduleDefinition.manifest.title}</h2>
          <p className="drawer__lead">{moduleDefinition.manifest.description}</p>
        </div>
        <button
          type="button"
          className="drawer__close"
          onClick={closeSettingsDrawer}
          aria-label="关闭设置抽屉"
        >
          <X size={18} />
        </button>
      </div>

      <div className="drawer__meta">
        <div>
          <span>版本</span>
          <strong>{moduleDefinition.manifest.version}</strong>
        </div>
        <div>
          <span>模块 ID</span>
          <strong>{moduleDefinition.manifest.id}</strong>
        </div>
        <div>
          <span>显示状态</span>
          <strong>{isEnabled(moduleDefinition.manifest.id) ? "显示中" : "已隐藏"}</strong>
        </div>
      </div>

      <label className="drawer__toggle">
        <span>在首页显示该模块</span>
        <input
          type="checkbox"
          checked={isEnabled(moduleDefinition.manifest.id)}
          onChange={() => toggleModuleEnabled(moduleDefinition.manifest.id)}
        />
      </label>

      <SettingsComponent
        moduleId={moduleDefinition.manifest.id}
        manifest={moduleDefinition.manifest}
        settings={settings}
        onChange={updateSettings}
      />
    </aside>
  );
}
