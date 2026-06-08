import { create } from "zustand";
import type { ModuleId } from "@/app/registry/moduleTypes";
import { readStorage, writeStorage } from "@/lib/store/appStorage";

const SETTINGS_KEY = "modular-shell-settings";

type SettingsById = Record<string, Record<string, unknown>>;

type ModuleSettingsStore = {
  settingsById: SettingsById;
  initializeSettings: (moduleId: ModuleId, defaults: Record<string, unknown>) => void;
  updateSettings: (moduleId: ModuleId, nextSettings: Record<string, unknown>) => void;
};

const persistedSettings = readStorage<SettingsById>(SETTINGS_KEY, {});

export const useModuleSettingsStore = create<ModuleSettingsStore>((set) => ({
  settingsById: persistedSettings,
  initializeSettings: (moduleId, defaults) =>
    set((state) => {
      if (state.settingsById[moduleId]) {
        return state;
      }

      const nextSettings = {
        ...state.settingsById,
        [moduleId]: defaults,
      };
      writeStorage(SETTINGS_KEY, nextSettings);
      return { settingsById: nextSettings };
    }),
  updateSettings: (moduleId, nextSettings) =>
    set((state) => {
      const settingsById = {
        ...state.settingsById,
        [moduleId]: nextSettings,
      };
      writeStorage(SETTINGS_KEY, settingsById);
      return { settingsById };
    }),
}));
