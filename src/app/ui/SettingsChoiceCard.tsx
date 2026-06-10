type SettingsChoiceCardProps = {
  title: string;
  description: string;
  meta: string;
  statusLabel: string;
  selected: boolean;
  disabled?: boolean;
  controlsId?: string;
  onClick: () => void;
};

export function SettingsChoiceCard({
  title,
  description,
  meta,
  statusLabel,
  selected,
  disabled = false,
  controlsId,
  onClick,
}: SettingsChoiceCardProps) {
  return (
    <button
      type="button"
      className="settings-choice-card"
      data-selected={selected}
      role="tab"
      aria-selected={selected}
      aria-controls={controlsId}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="settings-choice-card__header">
        <strong>{title}</strong>
        <span>{statusLabel}</span>
      </span>
      <span className="settings-choice-card__body">{description}</span>
      <span className="settings-choice-card__meta">{meta}</span>
    </button>
  );
}
