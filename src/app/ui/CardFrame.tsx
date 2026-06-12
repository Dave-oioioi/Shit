import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type CardFrameProps = PropsWithChildren<{
  accent: string;
  title: string;
  icon: ReactNode;
  status: string;
  className?: string;
  isExpanded: boolean;
  isActive: boolean;
  settingsContent: ReactNode;
  onToggleActive: () => void;
  onToggleExpand: () => void;
  switchLabel: string;
  switchFeedback?: "idle" | "reject";
}>;

export function CardFrame({
  accent,
  title,
  icon,
  status,
  className,
  isExpanded,
  isActive,
  settingsContent,
  onToggleActive,
  onToggleExpand,
  switchLabel,
  switchFeedback = "idle",
  children,
}: CardFrameProps) {
  return (
    <article
      style={{ "--card-accent": accent } as CSSProperties}
      className={className ? `card-frame ${className}` : "card-frame"}
      data-active={isActive}
      aria-label={`${title} ${isActive ? "ON" : "OFF"} ${status}`}
    >
      <div className="card-frame__glow" aria-hidden="true" />
      <div className="card-frame__edge-flow" aria-hidden="true" />

      <header className="card-frame__header">
        <div className="card-frame__identity">
          <div className="card-frame__icon">{icon}</div>
          <div className="card-frame__heading">
            <h2>{title}</h2>
          </div>
        </div>
      </header>

      <div className="card-frame__body">{children}</div>

      <div className="card-frame__toggle-row">
        <div className="card-frame__actions">
          <button
            type="button"
            className="card-switch"
            data-on={isActive}
            data-feedback={switchFeedback}
            onClick={onToggleActive}
            aria-label={`${switchLabel} \u5f00\u5173`}
            aria-pressed={isActive}
          >
            <span className="card-switch__track" aria-hidden="true">
              <span className="card-switch__state card-switch__state--off">OFF</span>
              <span className="card-switch__state card-switch__state--on">ON</span>
              <span className="card-switch__thumb" />
            </span>
          </button>

          <button
            type="button"
            className="card-frame__settings-button"
            data-expanded={isExpanded}
            onClick={onToggleExpand}
            aria-label={isExpanded ? "\u6536\u8d77\u8bbe\u7f6e" : "\u5c55\u5f00\u8bbe\u7f6e"}
            aria-expanded={isExpanded}
          >
            <ChevronDown className="card-frame__settings-glyph" size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="card-frame__expandable" data-expanded={isExpanded}>
        <div className="card-frame__expanded-stack">
          {isExpanded ? <div className="module-settings-inline">{settingsContent}</div> : null}
        </div>
      </div>
    </article>
  );
}
