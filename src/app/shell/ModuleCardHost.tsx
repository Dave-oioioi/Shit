import type { ModuleDefinition } from "@/app/registry/moduleTypes";
import { useModuleSettings } from "@/app/hooks/useModuleSettings";
import { useModuleState } from "@/app/hooks/useModuleState";
import { useLayoutStore } from "@/app/state/layoutStore";

type ModuleCardHostProps = {
  moduleDefinition: ModuleDefinition;
};

export function ModuleCardHost({ moduleDefinition }: ModuleCardHostProps) {
  const { state, patchState } = useModuleState(
    moduleDefinition.manifest.id,
    moduleDefinition,
  );
  const { settings, updateSettings } = useModuleSettings(
    moduleDefinition.manifest.id,
    moduleDefinition,
  );
  const expandedModuleId = useLayoutStore((store) => store.expandedModuleId);
  const toggleExpandedModule = useLayoutStore((store) => store.toggleExpandedModule);
  const CardComponent = moduleDefinition.CardComponent;
  const SettingsComponent = moduleDefinition.SettingsComponent;

  return (
    <CardComponent
      moduleId={moduleDefinition.manifest.id}
      manifest={moduleDefinition.manifest}
      state={state}
      isExpanded={expandedModuleId === moduleDefinition.manifest.id}
      isActive={Boolean((state as Record<string, unknown>).enabled)}
      settingsContent={
        <SettingsComponent
          moduleId={moduleDefinition.manifest.id}
          manifest={moduleDefinition.manifest}
          settings={settings}
          onChange={updateSettings}
        />
      }
      onToggleActive={() =>
        patchState({
          enabled: !Boolean((state as Record<string, unknown>).enabled),
          lastActionAt: new Date().toISOString(),
        })
      }
      onToggleExpand={() => toggleExpandedModule(moduleDefinition.manifest.id)}
    />
  );
}
