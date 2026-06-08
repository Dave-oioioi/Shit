import type { ModuleDefinition } from "@/app/registry/moduleTypes";
import { PreventSleepCard } from "@/modules/prevent-sleep/PreventSleepCard";
import { PreventSleepSettings } from "@/modules/prevent-sleep/PreventSleepSettings";
import { preventSleepSettings, preventSleepState } from "@/modules/prevent-sleep/defaults";

const moduleDefinition: ModuleDefinition<
  typeof preventSleepState,
  typeof preventSleepSettings
> = {
  manifest: {
    id: "prevent-sleep",
    name: "prevent-sleep",
    version: "0.1.0",
    title: "防止休眠",
    description: "",
    themeColor: "#a7d77b",
    icon: "moon-star",
    defaultSize: "2x1",
    minSize: "2x1",
    order: 2,
    enabledByDefault: true,
    hasSettings: true,
  },
  CardComponent: PreventSleepCard,
  SettingsComponent: PreventSleepSettings,
  defaultState: preventSleepState,
  defaultSettings: preventSleepSettings,
};

export default moduleDefinition;
