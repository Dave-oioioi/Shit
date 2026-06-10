type SettingsStatusPillProps = {
  label: string;
  value: string;
};

export function SettingsStatusPill({
  label,
  value,
}: SettingsStatusPillProps) {
  return (
    <div className="settings-status-pill" aria-live="polite">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
