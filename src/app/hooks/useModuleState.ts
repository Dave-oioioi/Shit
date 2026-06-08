import { useEffect } from "react";
import type { ModuleDefinition, ModuleId } from "@/app/registry/moduleTypes";
import { useModuleStateStore } from "@/app/state/moduleStateStore";

export function useModuleState<TState extends Record<string, unknown>>(
  moduleId: ModuleId,
  moduleDefinition: ModuleDefinition<TState>,
) {
  const initializeState = useModuleStateStore((state) => state.initializeState);
  const patchState = useModuleStateStore((state) => state.patchState);
  const state = useModuleStateStore(
    (store) => (store.stateById[moduleId] as TState | undefined) ?? moduleDefinition.defaultState,
  );

  useEffect(() => {
    initializeState(moduleId, moduleDefinition.defaultState);
  }, [initializeState, moduleDefinition.defaultState, moduleId]);

  return {
    state,
    patchState: (partialState: Partial<TState>) =>
      patchState(moduleId, partialState as Record<string, unknown>),
  };
}
