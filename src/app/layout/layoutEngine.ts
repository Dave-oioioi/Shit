import { DASHBOARD_COLUMNS, CARD_SPAN_MAP } from "@/app/layout/gridConfig";
import type { ModuleId, RegisteredModuleDefinition } from "@/app/registry/moduleTypes";

export type LayoutItem = {
  moduleId: ModuleId;
  gridColumn: string;
  gridRow: string;
};

export function buildDashboardLayout(
  modules: RegisteredModuleDefinition[],
  order: ModuleId[],
): LayoutItem[] {
  const sorted = [...modules].sort((left, right) => {
    const leftIndex = order.indexOf(left.manifest.id);
    const rightIndex = order.indexOf(right.manifest.id);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.manifest.order - right.manifest.order;
    }

    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  let currentColumn = 1;
  let currentRow = 1;

  return sorted.map((moduleDefinition) => {
    const span = CARD_SPAN_MAP[moduleDefinition.manifest.defaultSize];

    if (currentColumn + span.columns - 1 > DASHBOARD_COLUMNS) {
      currentColumn = 1;
      currentRow += 1;
    }

    const item = {
      moduleId: moduleDefinition.manifest.id,
      gridColumn: `${currentColumn} / span ${span.columns}`,
      gridRow: `${currentRow} / span ${span.rows}`,
    };

    currentColumn += span.columns;
    if (currentColumn > DASHBOARD_COLUMNS) {
      currentColumn = 1;
      currentRow += 1;
    }

    return item;
  });
}
