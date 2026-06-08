import { useRegistryStore } from "@/app/state/registryStore";

export function useRegisteredModules() {
  const modules = useRegistryStore((state) => state.modules);
  const enabledModuleIds = useRegistryStore((state) => state.enabledModuleIds);

  return modules.filter((moduleDefinition) =>
    enabledModuleIds.includes(moduleDefinition.manifest.id),
  );
}
