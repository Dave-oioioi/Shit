import type { ModuleDefinition } from "@/app/registry/moduleTypes";
import { AutoMixingCard } from "@/modules/auto-mixing/AutoMixingCard";
import { AutoMixingSettings } from "@/modules/auto-mixing/AutoMixingSettings";
import {
  autoMixingSettings,
  autoMixingState,
  type AutoMixingSettings as AutoMixingSettingsModel,
  type AutoMixingState as AutoMixingStateModel,
} from "@/modules/auto-mixing/defaults";

const moduleDefinition: ModuleDefinition<
  AutoMixingStateModel,
  AutoMixingSettingsModel
> = {
  manifest: {
    id: "auto-mixing",
    name: "auto-mixing",
    version: "0.1.0",
    title: "自动混音",
    description: "直接读取系统音量合成器，并以主音应用为锚点自动压低其它会话。",
    themeColor: "#58c6ff",
    icon: "waves",
    defaultSize: "2x1",
    minSize: "2x1",
    order: 1,
    enabledByDefault: true,
    hasSettings: true,
  },
  CardComponent: AutoMixingCard,
  SettingsComponent: AutoMixingSettings,
  defaultState: autoMixingState,
  defaultSettings: autoMixingSettings,
};

export default moduleDefinition;
