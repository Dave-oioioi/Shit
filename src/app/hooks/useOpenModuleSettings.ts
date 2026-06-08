import type { ModuleId } from "@/app/registry/moduleTypes";
import { useLayoutStore } from "@/app/state/layoutStore";

export function useOpenModuleSettings() {
  const openSettingsDrawer = useLayoutStore((state) => state.openSettingsDrawer);
  return (moduleId: ModuleId) => openSettingsDrawer(moduleId);
}
