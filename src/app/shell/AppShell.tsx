import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings2 } from "lucide-react";
import { DashboardPage } from "@/app/shell/DashboardPage";
import { ModuleCardHost } from "@/app/shell/ModuleCardHost";
import { ShellContent } from "@/app/shell/ShellContent";
import { useRegisteredModules } from "@/app/hooks/useRegisteredModules";
import { useModuleStateStore } from "@/app/state/moduleStateStore";
import { useRegistryStore } from "@/app/state/registryStore";
import shitLogoUrl from "../../../assets/icon-work/shit-symbol-extract-test.png";
import packageInfo from "../../../package.json";

type ViewId =
  | "intro"
  | "home"
  | "toolset-01"
  | "toolset-02"
  | "toolset-03"
  | "toolset-04"
  | "settings";

type ShellNavigationPayload = {
  view?: ViewId;
};

const WINDOW_REVEAL_EVENT = "shell:will-show";

type RailItem = {
  id: Exclude<ViewId, "intro" | "home" | "settings">;
  label: string;
  logo: "stall" | "poop" | "urinal" | "sink";
};

const railItems: RailItem[] = [
  {
    id: "toolset-01",
    label: "\u4e3b\u5751\u4f4d",
    logo: "stall",
  },
  {
    id: "toolset-02",
    label: "\u5927\u4fbf\u4f4d",
    logo: "poop",
  },
  {
    id: "toolset-03",
    label: "\u5c0f\u4fbf\u6c60",
    logo: "urinal",
  },
  {
    id: "toolset-04",
    label: "\u6d17\u624b\u53f0",
    logo: "sink",
  },
];

const viewStatusLabel: Record<ViewId, string> = {
  intro: "Vault Ready",
  home: "Workspace Live",
  "toolset-01": "Toolset Live",
  "toolset-02": "Standby Slot",
  "toolset-03": "Standby Slot",
  "toolset-04": "Standby Slot",
  settings: "Settings Live",
};

type ToolsetViewProps = {
  moduleIds?: string[];
  placeholderTitle?: string;
};

function ToolsetPlaceholderCard({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <article className={className ? `toolset-placeholder-card ${className}` : "toolset-placeholder-card"}>
      <div className="toolset-placeholder-card__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p>{"\u9884\u7559\u5361\u7247"}</p>
        <h3>{title}</h3>
      </div>
    </article>
  );
}

function ToolsetView({ moduleIds = [], placeholderTitle }: ToolsetViewProps) {
  const modules = useRegisteredModules();
  const selectedModules = moduleIds
    .map((moduleId) => modules.find((module) => module.manifest.id === moduleId))
    .filter((module): module is NonNullable<typeof module> => Boolean(module));

  return (
    <ShellContent bare>
      <div className="toolset-card-stack">
        {selectedModules.map((moduleDefinition) => (
          <ModuleCardHost
            key={moduleDefinition.manifest.id}
            moduleDefinition={moduleDefinition}
          />
        ))}
        {placeholderTitle ? <ToolsetPlaceholderCard title={placeholderTitle} /> : null}
      </div>
    </ShellContent>
  );
}

function IntroView() {
  return (
    <ShellContent bare>
      <article className="vault-info-card intro-card">
        <div className="vault-info-card__mark" aria-hidden="true">
          <img src={shitLogoUrl} alt="" draggable={false} />
        </div>
        <div className="vault-info-card__content">
          <p className="vault-info-card__eyebrow">Shell Identity</p>
          <h3>Shit Vault</h3>
          <dl className="vault-info-card__meta" aria-label={"\u7248\u672c\u4fe1\u606f"}>
            <div>
              <dt>{"\u7248\u672c"}</dt>
              <dd>v{packageInfo.version}</dd>
            </div>
          </dl>
        </div>
      </article>
    </ShellContent>
  );
}

function AppSettingsView() {
  const modules = useRegistryStore((state) => state.modules);
  const enabledModuleIds = useRegistryStore((state) => state.enabledModuleIds);
  const toggleModuleEnabled = useRegistryStore((state) => state.toggleModuleEnabled);

  return (
    <ShellContent bare>
      <div className="settings-compact">
        <div className="settings-compact__head">
          <div>
            <p className="drawer-card__eyebrow">Workspace</p>
            <h3>{"\u9996\u9875\u663e\u793a"}</h3>
          </div>
          <span className="drawer-card__meta">
            {enabledModuleIds.length} / {modules.length}
          </span>
        </div>

        <div className="settings-list">
          {modules.map((moduleDefinition) => {
            const enabled = enabledModuleIds.includes(moduleDefinition.manifest.id);
            return (
              <label key={moduleDefinition.manifest.id} className="settings-list__item">
                <strong>{moduleDefinition.manifest.title}</strong>
                <input
                  className="settings-list__toggle"
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleModuleEnabled(moduleDefinition.manifest.id)}
                />
                <span className="settings-list__slider" aria-hidden="true" />
              </label>
            );
          })}
        </div>
      </div>
    </ShellContent>
  );
}

export function AppShell() {
  const initialize = useRegistryStore((state) => state.initialize);
  const modules = useRegisteredModules();
  const moduleStateById = useModuleStateStore((state) => state.stateById);
  const [activeView, setActiveView] = useState<ViewId>("home");
  const [isWindowVisible, setIsWindowVisible] = useState(true);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let removeRevealListener: (() => void) | undefined;

    void listen<ShellNavigationPayload>("shell:navigate", (event) => {
      const nextView = event.payload?.view;
      if (nextView) {
        setActiveView(nextView);
      }
    }).then((unlisten) => {
      removeListener = unlisten;
    });

    void listen(WINDOW_REVEAL_EVENT, () => {
      setIsWindowVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsWindowVisible(true);
        });
      });
    }).then((unlisten) => {
      removeRevealListener = unlisten;
    });

    return () => {
      void removeListener?.();
      void removeRevealListener?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      void getCurrentWindow().hide();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const activeCardCount = useMemo(
    () =>
      modules.filter((moduleDefinition) =>
        Boolean(moduleStateById[moduleDefinition.manifest.id]?.enabled),
      ).length,
    [moduleStateById, modules],
  );

  const topbar = useMemo(() => {
    switch (activeView) {
      case "toolset-01":
        return {
          kicker: "SHIT VAULT",
          title: "\u4e3b\u5751\u4f4d",
          subtitle: "\u5728\u72ec\u7acb\u62bd\u5c49\u91cc\u7ef4\u62a4\u9ed8\u8ba4\u573a\u666f\u3001\u7b56\u7565\u548c\u8fd0\u884c\u72b6\u6001\u3002",
        };
      case "toolset-02":
        return {
          kicker: "SHIT VAULT",
          title: "\u5927\u4fbf\u4f4d",
          subtitle: "\u628a\u5e38\u4eae\u4e0e\u7cfb\u7edf\u5524\u9192\u7b56\u7565\u653e\u8fdb\u53ef\u6bcf\u65e5\u4f7f\u7528\u7684\u7ba1\u7406\u9762\u677f\u3002",
        };
      case "toolset-03":
        return {
          kicker: "SHIT VAULT",
          title: "\u5c0f\u4fbf\u6c60",
          subtitle: "\u5728\u540c\u4e00\u4e2a\u58f3\u5c42\u91cc\u7ba1\u7406\u63a5\u4e0b\u6765\u7684\u6269\u5c55\u8def\u7ebf\u548c\u5f00\u53d1\u8282\u594f\u3002",
        };
      case "toolset-04":
        return {
          kicker: "SHIT VAULT",
          title: "\u6d17\u624b\u53f0",
          subtitle: "\u5148\u5b9a\u4e49\u597d\u7cfb\u7edf\u7ea7\u80fd\u529b\u7684\u8fb9\u754c\uff0c\u518d\u63a5\u5165\u771f\u6b63\u7684\u5bbf\u4e3b\u529f\u80fd\u3002",
        };
      case "settings":
        return {
          kicker: "SHIT VAULT",
          title: "\u8bbe\u7f6e",
          subtitle: "\u96c6\u4e2d\u7ba1\u7406\u5de5\u4f5c\u533a\u504f\u597d\u3001\u9996\u9875\u663e\u793a\u548c\u58f3\u5c42\u57fa\u7840\u9009\u9879\u3002",
        };
      case "intro":
        return {
          kicker: "SHIT VAULT",
          title: "Shit Vault",
          subtitle: "\u54c1\u724c\u4e0e\u58f3\u5c42\u4fe1\u606f\u5165\u53e3\u3002",
        };
      case "home":
      default:
        return {
          kicker: "SHIT VAULT",
          title: "\u5de5\u5177\u7a7a\u95f4",
          subtitle: "\u4fdd\u6301\u514b\u5236\u3001\u6e05\u6670\u3001\u80fd\u5929\u5929\u6253\u5f00\u4f7f\u7528\u7684\u6a21\u5757\u5316\u58f3\u5c42\u3002",
        };
    }
  }, [activeView]);

  const content = useMemo(() => {
    switch (activeView) {
      case "toolset-01":
        return (
          <ToolsetView
            moduleIds={["auto-mixing", "prevent-sleep"]}
          />
        );
      case "toolset-02":
        return (
          <ToolsetView
            placeholderTitle={"\u5927\u4fbf\u4f4d\u9884\u7559\u4f4d"}
          />
        );
      case "toolset-03":
        return (
          <ToolsetView
            placeholderTitle={"\u5c0f\u4fbf\u6c60\u9884\u7559\u4f4d"}
          />
        );
      case "toolset-04":
        return (
          <ToolsetView
            placeholderTitle={"\u6d17\u624b\u53f0\u9884\u7559\u4f4d"}
          />
        );
      case "settings":
        return <AppSettingsView />;
      case "intro":
        return <IntroView />;
      case "home":
      default:
        return <DashboardPage />;
    }
  }, [activeView]);

  return (
    <div className={isWindowVisible ? "shell shell--visible" : "shell"}>
      <div className="shell__surface">
        <div className="shell__drag-cap">
          <span className="shell__drag-notch" data-tauri-drag-region aria-hidden="true" />
        </div>
        <div className="shell__frame">
          <aside className="shell__rail">
            <button
              type="button"
              className="shell__brand-logo-shell"
              data-active={activeView === "intro"}
              aria-label="Shit Vault"
              title="Shit Vault"
              onClick={() => setActiveView("intro")}
            >
              <img className="shell__brand-logo" src={shitLogoUrl} alt="" draggable={false} />
            </button>

            <div className="shell__rail-divider" aria-hidden="true" />

            <div className="shell__rail-stack">
              {railItems.map(({ id, label, logo }) => (
                <button
                  key={id}
                  type="button"
                  className={
                    activeView === id
                      ? "shell__rail-button shell__rail-button--active"
                      : "shell__rail-button"
                  }
                  aria-label={label}
                  title={label}
                  onClick={() => setActiveView(id)}
                >
                  <span
                    className={`shell__toolset-logo shell__toolset-logo--${logo}`}
                    aria-hidden="true"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="shell__rail-label">{label}</span>
                </button>
              ))}
            </div>

            <div className="shell__rail-spacer" />

            <div className="shell__rail-caption" data-live={activeCardCount > 0}>
              <span className="shell__rail-caption-kicker">Ready</span>
              <strong>{activeCardCount}</strong>
              <span className="shell__rail-caption-label">Active Cards</span>
            </div>

            <div className="shell__rail-divider shell__rail-divider--bottom" aria-hidden="true" />

            <button
              type="button"
              className={
                activeView === "settings"
                  ? "shell__rail-button shell__rail-button--active shell__rail-button--settings"
                  : "shell__rail-button shell__rail-button--settings"
              }
              aria-label={"\u8bbe\u7f6e"}
              title={"\u8bbe\u7f6e"}
              onClick={() => setActiveView("settings")}
            >
              <Settings2 size={18} />
              <span className="shell__rail-label">{"\u8bbe\u7f6e"}</span>
            </button>
          </aside>

          <div className="shell__content">
            <header className="shell__topbar">
              <div className="shell__topbar-copy">
                <p className="shell__topbar-kicker">{topbar.kicker}</p>
                <div className="shell__topbar-title-row">
                  <h1 className="shell__topbar-title">{topbar.title}</h1>
                  <div className="shell__topbar-status" aria-label={"\u7cfb\u7edf\u72b6\u6001"}>
                    <span className="shell__status-dot" aria-hidden="true" />
                    <strong>{viewStatusLabel[activeView]}</strong>
                  </div>
                </div>
              </div>
            </header>

            <main className="shell__main">{content}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
