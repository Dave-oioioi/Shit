import { create } from "zustand";
import { loadModuleRegistry } from "@/app/registry/loadModuleRegistry";
import type {
  ModuleId,
  RegisteredModuleDefinition,
  ValidationResult,
} from "@/app/registry/moduleTypes";

type RegistryStore = {
  modules: RegisteredModuleDefinition[];
  enabledModuleIds: ModuleId[];
  diagnostics: Record<string, ValidationResult>;
  initialize: () => void;
  toggleModuleEnabled: (moduleId: ModuleId) => void;
  isEnabled: (moduleId: ModuleId) => boolean;
};

export const useRegistryStore = create<RegistryStore>((set, get) => ({
  modules: [],
  enabledModuleIds: [],
  diagnostics: {},
  initialize: () => {
    const { modules, diagnostics } = loadModuleRegistry();
    set({
      modules,
      diagnostics,
      enabledModuleIds: modules
        .filter((moduleDefinition) => moduleDefinition.manifest.enabledByDefault)
        .map((moduleDefinition) => moduleDefinition.manifest.id),
    });
  },
  toggleModuleEnabled: (moduleId) =>
    set((state) => {
      const nextIds = state.enabledModuleIds.includes(moduleId)
        ? state.enabledModuleIds.filter((id) => id !== moduleId)
        : [...state.enabledModuleIds, moduleId];

      return { enabledModuleIds: nextIds };
    }),
  isEnabled: (moduleId) => get().enabledModuleIds.includes(moduleId),
}));
