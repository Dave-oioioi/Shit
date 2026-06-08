import { SlidersHorizontal, Waves } from "lucide-react";
import type { ModuleCardProps } from "@/app/registry/moduleTypes";
import { CardFrame } from "@/app/ui/CardFrame";

type AutoMixingState = {
  enabled: boolean;
  status: string;
  lastActionAt: string | null;
};

export function AutoMixingCard({
  manifest,
  state,
  isExpanded,
  isActive,
  settingsContent,
  onToggleActive,
  onToggleExpand,
}: ModuleCardProps<AutoMixingState>) {
  const status = isActive
    ? "自动混音运行中"
    : state.lastActionAt
      ? `最近切换于 ${new Date(state.lastActionAt).toLocaleTimeString()}`
      : state.status;

  return (
    <CardFrame
      accent={manifest.themeColor}
      title={manifest.title}
      status={status}
      icon={<Waves size={24} />}
      isExpanded={isExpanded}
      isActive={isActive}
      settingsContent={settingsContent}
      onToggleActive={onToggleActive}
      onToggleExpand={onToggleExpand}
      switchLabel="自动混音"
    >
      <div className="module-preview">
        <div className="module-preview__line">
          <SlidersHorizontal size={16} />
          <span>智能场景已预留，后续接入宿主 API。</span>
        </div>
        <div className="module-preview__chips">
          <span>演示</span>
          <span>会议</span>
          <span>媒体</span>
        </div>
      </div>
    </CardFrame>
  );
}
