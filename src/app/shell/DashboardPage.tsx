import { useEffect } from "react";
import { Activity, Box, LayoutGrid, Orbit, PanelRightOpen } from "lucide-react";
import { ModuleCardHost } from "@/app/shell/ModuleCardHost";
import { useRegisteredModules } from "@/app/hooks/useRegisteredModules";
import { useLayoutStore } from "@/app/state/layoutStore";
import { useRegistryStore } from "@/app/state/registryStore";

export function DashboardPage() {
  const modules = useRegisteredModules();
  const diagnostics = useRegistryStore((state) => state.diagnostics);
  const enabledModuleIds = useRegistryStore((state) => state.enabledModuleIds);
  const moduleOrder = useLayoutStore((state) => state.moduleOrder);
  const setModuleOrder = useLayoutStore((state) => state.setModuleOrder);

  useEffect(() => {
    if (moduleOrder.length === 0 && modules.length > 0) {
      setModuleOrder(modules.map((moduleDefinition) => moduleDefinition.manifest.id));
    }
  }, [moduleOrder.length, modules, setModuleOrder]);

  const invalidModules = Object.entries(diagnostics).filter(([, result]) => !result.valid);

  return (
    <section className="dashboard">
      <section className="dashboard__cards-section">
        <div className="dashboard__cards-header">
          <p className="dashboard__eyebrow">卡片积木区</p>
          <h2>从上往下竖向排列</h2>
        </div>

        <div className="dashboard__cards-column">
          {modules.map((moduleDefinition) => (
            <div key={moduleDefinition.manifest.id} className="dashboard__grid-item">
              <ModuleCardHost moduleDefinition={moduleDefinition} />
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard__bay">
        <div className="dashboard__bay-header">
          <div>
            <p className="dashboard__eyebrow">模块插槽区</p>
            <h3>挂载规则</h3>
          </div>
          <div className="dashboard__bay-hints">
            <span>
              <LayoutGrid size={13} />
              固定底板
            </span>
            <span>
              <Orbit size={13} />
              注册驱动
            </span>
            <span>
              <PanelRightOpen size={13} />
              折叠设置
            </span>
          </div>
        </div>

        <div className="dashboard__bay-metrics">
          <div className="dashboard__metric-pill">
            <LayoutGrid size={15} />
            <div>
              <span>已启用</span>
              <strong>{enabledModuleIds.length}</strong>
            </div>
          </div>
          <div className="dashboard__metric-pill">
            <Activity size={15} />
            <div>
              <span>诊断</span>
              <strong>{invalidModules.length}</strong>
            </div>
          </div>
          <div className="dashboard__metric-pill">
            <Box size={15} />
            <div>
              <span>画板</span>
              <strong>455 × 660</strong>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
