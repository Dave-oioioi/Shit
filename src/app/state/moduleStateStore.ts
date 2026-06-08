import { create } from "zustand";
import type { ModuleId } from "@/app/registry/moduleTypes";

type ModuleStateStore = {
  stateById: Record<string, Record<string, unknown>>;
  initializeState: (moduleId: ModuleId, defaults: Record<string, unknown>) => void;
  patchState: (moduleId: ModuleId, partialState: Record<string, unknown>) => void;
};

export const useModuleStateStore = create<ModuleStateStore>((set, get) => ({
  stateById: {},
  initializeState: (moduleId, defaults) =>
    set((state) => {
      if (state.stateById[moduleId]) {
        return state;
      }

      return {
        stateById: {
          ...state.stateById,
          [moduleId]: defaults,
        },
      };
    }),
  patchState: (moduleId, partialState) =>
    set({
      stateById: {
        ...get().stateById,
        [moduleId]: {
          ...get().stateById[moduleId],
          ...partialState,
        },
      },
    }),
}));
