import { MoonStar, Sparkles } from "lucide-react";
import type { ModuleCardProps } from "@/app/registry/moduleTypes";
import { CardFrame } from "@/app/ui/CardFrame";

type PreventSleepState = {
  enabled: boolean;
  status: string;
  lastActionAt: string | null;
};

export function PreventSleepCard({
  manifest,
  state,
  isExpanded,
  isActive,
  settingsContent,
  onToggleActive,
  onToggleExpand,
}: ModuleCardProps<PreventSleepState>) {
  const status = isActive
    ? "常亮守护运行中"
    : state.lastActionAt
      ? `最近切换于 ${new Date(state.lastActionAt).toLocaleTimeString()}`
      : state.status;

  return (
    <CardFrame
      accent={manifest.themeColor}
      title={manifest.title}
      status={status}
      icon={<MoonStar size={24} />}
      isExpanded={isExpanded}
      isActive={isActive}
      settingsContent={settingsContent}
      onToggleActive={onToggleActive}
      onToggleExpand={onToggleExpand}
      switchLabel="防止休眠"
    >
      <div className="module-preview">
        <div className="module-preview__line">
          <Sparkles size={16} />
          <span>保持唤醒策略已预留，后续接入宿主 API。</span>
        </div>
        <div className="module-preview__chips">
          <span>屏幕常亮</span>
          <span>系统唤醒</span>
          <span>工作预设</span>
        </div>
      </div>
    </CardFrame>
  );
}
