import type { ModuleId } from "@/app/registry/moduleTypes";
import { useRegistryStore } from "@/app/state/registryStore";

export function useToggleModuleEnabled() {
  const toggleModuleEnabled = useRegistryStore((state) => state.toggleModuleEnabled);
  return (moduleId: ModuleId) => toggleModuleEnabled(moduleId);
}
