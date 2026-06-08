import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type CardFrameProps = PropsWithChildren<{
  accent: string;
  title: string;
  icon: ReactNode;
  status: string;
  isExpanded: boolean;
  isActive: boolean;
  settingsContent: ReactNode;
  onToggleActive: () => void;
  onToggleExpand: () => void;
  switchLabel: string;
}>;

export function CardFrame({
  accent,
  title,
  icon,
  status,
  isExpanded,
  isActive,
  settingsContent,
  onToggleActive,
  onToggleExpand,
  switchLabel,
  children,
}: CardFrameProps) {
  return (
    <article
      style={{ "--card-accent": accent } as CSSProperties}
      className="card-frame"
    >
      <div className="card-frame__studs" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className="card-frame__header">
        <div className="card-frame__identity">
          <div className="card-frame__icon">{icon}</div>
          <h2>{title}</h2>
        </div>
      </header>

      <div className="card-frame__status-row">
        <strong>{status}</strong>
      </div>

      <div className="card-frame__toggle-row">
        <button
          type="button"
          className="card-switch"
          data-on={isActive}
          onClick={onToggleActive}
          aria-label={`${switchLabel} 开关`}
          aria-pressed={isActive}
        >
          <span className="card-switch__track" aria-hidden="true">
            <span className="card-switch__thumb" />
          </span>
        </button>

        <button
          type="button"
          className="card-frame__expand-button"
          onClick={onToggleExpand}
          aria-label={isExpanded ? "收起设置" : "展开设置"}
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      <div className="card-frame__expandable" data-expanded={isExpanded}>
        <div className="card-frame__expanded-stack">
          {children}
          <div className="module-settings-inline">{settingsContent}</div>
        </div>
      </div>
    </article>
  );
}
