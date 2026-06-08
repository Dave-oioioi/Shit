import type { PropsWithChildren } from "react";

type SettingsSectionProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <header className="settings-section__header">
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="settings-section__content">{children}</div>
    </section>
  );
}
