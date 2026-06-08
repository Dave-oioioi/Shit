import { create } from "zustand";
import type { ModuleId } from "@/app/registry/moduleTypes";

type LayoutStore = {
  settingsDrawerModuleId: ModuleId | null;
  expandedModuleId: ModuleId | null;
  moduleOrder: ModuleId[];
  openSettingsDrawer: (moduleId: ModuleId) => void;
  closeSettingsDrawer: () => void;
  toggleExpandedModule: (moduleId: ModuleId) => void;
  setModuleOrder: (moduleIds: ModuleId[]) => void;
};

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  settingsDrawerModuleId: null,
  expandedModuleId: null,
  moduleOrder: [],
  openSettingsDrawer: (moduleId) => set({ settingsDrawerModuleId: moduleId }),
  closeSettingsDrawer: () => set({ settingsDrawerModuleId: null }),
  toggleExpandedModule: (moduleId) =>
    set({
      expandedModuleId: get().expandedModuleId === moduleId ? null : moduleId,
    }),
  setModuleOrder: (moduleIds) => set({ moduleOrder: moduleIds }),
}));
