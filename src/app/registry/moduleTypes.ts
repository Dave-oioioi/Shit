import type { ComponentType, ReactNode } from "react";

export type ModuleId = "auto-mixing" | "prevent-sleep" | (string & {});

export type CardSize = "1x1" | "2x1" | "2x2";

export type ModuleManifest = {
  id: ModuleId;
  name: string;
  version: string;
  title: string;
  description: string;
  themeColor: string;
  icon: string;
  defaultSize: CardSize;
  minSize: CardSize;
  order: number;
  enabledByDefault: boolean;
  hasSettings: boolean;
};

export type ModuleCardProps<TState = Record<string, unknown>> = {
  moduleId: ModuleId;
  manifest: ModuleManifest;
  state: TState;
  isExpanded: boolean;
  isActive: boolean;
  settingsContent: ReactNode;
  onToggleActive: () => void;
  onToggleExpand: () => void;
};

export type ModuleSettingsProps<TSettings = Record<string, unknown>> = {
  moduleId: ModuleId;
  manifest: ModuleManifest;
  settings: TSettings;
  onChange: (nextSettings: TSettings) => void;
};

export type ModuleDefinition<
  TState = Record<string, unknown>,
  TSettings = Record<string, unknown>,
> = {
  manifest: ModuleManifest;
  CardComponent: ComponentType<ModuleCardProps<TState>>;
  SettingsComponent: ComponentType<ModuleSettingsProps<TSettings>>;
  defaultState: TState;
  defaultSettings: TSettings;
};

export type RegisteredModuleDefinition = {
  manifest: ModuleManifest;
  CardComponent: unknown;
  SettingsComponent: unknown;
  defaultState: Record<string, unknown>;
  defaultSettings: Record<string, unknown>;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};
