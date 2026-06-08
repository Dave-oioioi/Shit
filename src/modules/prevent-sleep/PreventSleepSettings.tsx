import type { ModuleSettingsProps } from "@/app/registry/moduleTypes";
import { SettingsSection } from "@/app/ui/SettingsSection";

type PreventSleepSettingsModel = {
  idleThresholdSeconds: number;
};

const PRESETS = [
  { label: "30\u79d2", seconds: 30 },
  { label: "1\u5206\u949f", seconds: 60 },
  { label: "2\u520630\u79d2", seconds: 150 },
  { label: "5\u5206\u949f", seconds: 300 },
  { label: "10\u5206\u949f", seconds: 600 },
];

export function PreventSleepSettings({
  settings,
  onChange,
}: ModuleSettingsProps<PreventSleepSettingsModel>) {
  const selectedSeconds = settings.idleThresholdSeconds;
  const selectedLabel =
    PRESETS.find((preset) => preset.seconds === selectedSeconds)?.label ?? "2\u520630\u79d2";

  return (
    <SettingsSection
      title="\u4fdd\u6d3b\u8282\u594f"
      description="\u7a7a\u95f2\u8fbe\u5230\u8bbe\u5b9a\u65f6\u95f4\u540e\uff0c\u6267\u884c\u4e00\u6b21\u5de6\u4e0b\u89d2\u5b89\u5168\u70b9\u51fb\u5e76\u8fd8\u539f\u5149\u6807\u3002"
    >
      <div className="prevent-sleep-console" aria-label="\u9632\u6b62\u4f11\u7720\u8bbe\u7f6e">
        <div className="prevent-sleep-console__readout">
          <span>\u7a7a\u95f2\u9608\u503c</span>
          <strong>{selectedLabel}</strong>
        </div>

        <div
          className="prevent-sleep-presets"
          role="radiogroup"
          aria-label="\u7a7a\u95f2\u89e6\u53d1\u65f6\u95f4"
        >
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.seconds}
              className="prevent-sleep-preset"
              data-selected={preset.seconds === selectedSeconds}
              role="radio"
              aria-checked={preset.seconds === selectedSeconds}
              onClick={() =>
                onChange({
                  ...settings,
                  idleThresholdSeconds: preset.seconds,
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="prevent-sleep-route" aria-label="\u4fdd\u6d3b\u52a8\u4f5c\u8def\u7ebf">
          <span>\u952e\u9f20\u7a7a\u95f2</span>
          <i />
          <span>\u5de6\u4e0b\u89d2\u8f7b\u70b9</span>
          <i />
          <span>\u5149\u6807\u8fd8\u539f</span>
        </div>
      </div>
    </SettingsSection>
  );
}
