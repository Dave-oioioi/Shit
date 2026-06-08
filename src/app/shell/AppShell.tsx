import { useEffect } from "react";
import { Blocks, MoonStar, Settings2, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { DashboardPage } from "@/app/shell/DashboardPage";
import { useRegistryStore } from "@/app/state/registryStore";

export function AppShell() {
  const initialize = useRegistryStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="shell">
      <div className="shell__frame">
        <aside className="shell__rail">
          <div className="shell__brand-logo-shell" aria-hidden="true">
            <img src="/assets/icon-work/shit-symbol-extract-test.png" alt="" />
          </div>

          <div className="shell__rail-divider" aria-hidden="true" />

          <div className="shell__rail-stack">
            <button
              type="button"
              className="shell__rail-button shell__rail-button--active"
              aria-label="首页"
            >
              <Blocks size={18} />
            </button>
            <button type="button" className="shell__rail-button" aria-label="自动混音">
              <Waves size={18} />
            </button>
            <button type="button" className="shell__rail-button" aria-label="防止休眠">
              <MoonStar size={18} />
            </button>
            <button type="button" className="shell__rail-button" aria-label="模块规划">
              <Sparkles size={18} />
            </button>
            <button type="button" className="shell__rail-button" aria-label="安全规则">
              <ShieldCheck size={18} />
            </button>
          </div>

          <div className="shell__rail-spacer" />

          <div className="shell__rail-divider shell__rail-divider--bottom" aria-hidden="true" />

          <button
            type="button"
            className="shell__rail-button shell__rail-button--settings"
            aria-label="设置"
          >
            <Settings2 size={18} />
          </button>
        </aside>

        <div className="shell__content">
          <main className="shell__main">
            <DashboardPage />
          </main>
        </div>
      </div>
    </div>
  );
}
