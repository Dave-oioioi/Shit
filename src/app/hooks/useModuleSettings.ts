import { useEffect } from "react";
import type { ModuleDefinition, ModuleId } from "@/app/registry/moduleTypes";
import { useModuleSettingsStore } from "@/app/state/moduleSettingsStore";

export function useModuleSettings<TSettings extends Record<string, unknown>>(
  moduleId: ModuleId,
  moduleDefinition: ModuleDefinition<Record<string, unknown>, TSettings>,
) {
  const initializeSettings = useModuleSettingsStore((state) => state.initializeSettings);
  const updateSettings = useModuleSettingsStore((state) => state.updateSettings);
  const settings = useModuleSettingsStore(
    (store) =>
      (store.settingsById[moduleId] as TSettings | undefined) ?? moduleDefinition.defaultSettings,
  );

  useEffect(() => {
    initializeSettings(moduleId, moduleDefinition.defaultSettings);
  }, [initializeSettings, moduleDefinition.defaultSettings, moduleId]);

  return {
    settings,
    updateSettings: (nextSettings: TSettings) =>
      updateSettings(moduleId, nextSettings as Record<string, unknown>),
  };
}
