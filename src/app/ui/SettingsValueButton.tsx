type SettingsValueButtonProps = {
  label: string;
  value: string;
  unit: string;
  hint?: string;
  disabled?: boolean;
  ariaLabel: string;
  onClick: () => void;
};

export function SettingsValueButton({
  label,
  value,
  unit,
  hint,
  disabled = false,
  ariaLabel,
  onClick,
}: SettingsValueButtonProps) {
  return (
    <label className="settings-field settings-field--stacked">
      <span>{label}</span>
      <div className="settings-value-cycle">
        <button
          type="button"
          className="settings-value-button"
          disabled={disabled}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {value}
        </button>
        <em>{unit}</em>
      </div>
      {hint ? <small className="settings-field-hint">{hint}</small> : null}
    </label>
  );
}
