import type { ComponentType } from "react";
import type {
  ModuleCardProps,
  ModuleDefinition,
  ModuleSettingsProps,
  RegisteredModuleDefinition,
} from "@/app/registry/moduleTypes";
import { useModuleSettings } from "@/app/hooks/useModuleSettings";
import { useModuleState } from "@/app/hooks/useModuleState";
import { useLayoutStore } from "@/app/state/layoutStore";

type ModuleCardHostProps = {
  moduleDefinition: RegisteredModuleDefinition;
};

type HostModuleDefinition = ModuleDefinition<Record<string, unknown>, Record<string, unknown>>;

export function ModuleCardHost({ moduleDefinition }: ModuleCardHostProps) {
  const hostModuleDefinition = moduleDefinition as HostModuleDefinition;
  const { state, patchState } = useModuleState(
    moduleDefinition.manifest.id,
    hostModuleDefinition,
  );
  const { settings, updateSettings } = useModuleSettings(
    moduleDefinition.manifest.id,
    hostModuleDefinition,
  );
  const expandedModuleId = useLayoutStore((store) => store.expandedModuleId);
  const toggleExpandedModule = useLayoutStore((store) => store.toggleExpandedModule);
  const CardComponent = moduleDefinition.CardComponent as ComponentType<
    ModuleCardProps<Record<string, unknown>>
  >;
  const SettingsComponent = moduleDefinition.SettingsComponent as ComponentType<
    ModuleSettingsProps<Record<string, unknown>>
  >;

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
