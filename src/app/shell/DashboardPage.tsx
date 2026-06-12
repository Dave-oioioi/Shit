import { useEffect } from "react";
import { ModuleCardHost } from "@/app/shell/ModuleCardHost";
import { useRegisteredModules } from "@/app/hooks/useRegisteredModules";
import { useLayoutStore } from "@/app/state/layoutStore";

export function DashboardPage() {
  const modules = useRegisteredModules();
  const moduleOrder = useLayoutStore((state) => state.moduleOrder);
  const setModuleOrder = useLayoutStore((state) => state.setModuleOrder);

  useEffect(() => {
    if (moduleOrder.length === 0 && modules.length > 0) {
      setModuleOrder(modules.map((moduleDefinition) => moduleDefinition.manifest.id));
    }
  }, [moduleOrder.length, modules, setModuleOrder]);

  return (
    <section className="dashboard">
      <section className="dashboard__cards-section">
        <div className="dashboard__cards-column">
          {modules.map((moduleDefinition) => (
            <div key={moduleDefinition.manifest.id} className="dashboard__grid-item">
              <ModuleCardHost moduleDefinition={moduleDefinition} />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
