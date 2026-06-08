import type {
  ModuleDefinition,
  ModuleId,
  ValidationResult,
} from "@/app/registry/moduleTypes";
import { validateModule } from "@/app/registry/validateModule";

type ModuleFile = {
  default?: ModuleDefinition<any, any>;
  moduleDefinition?: ModuleDefinition<any, any>;
};

export type RegistryDiagnostics = Record<ModuleId | string, ValidationResult>;

export type RegistryLoadResult = {
  modules: ModuleDefinition[];
  diagnostics: RegistryDiagnostics;
};

export function createLoadResult(rawFiles: Record<string, ModuleFile>): RegistryLoadResult {
  const diagnostics: RegistryDiagnostics = {};
  const modules = Object.values(rawFiles)
    .map((file) => file.default ?? file.moduleDefinition)
    .filter(
      (candidate): candidate is ModuleDefinition<any, any> => candidate !== undefined,
    )
    .flatMap((candidate) => {
      const validation = validateModule(candidate);
      const key = candidate.manifest?.id ?? "unknown";
      diagnostics[key] = validation;
      return validation.valid ? [candidate] : [];
    })
    .sort((left, right) => left.manifest.order - right.manifest.order);

  return { modules, diagnostics };
}

export function loadModuleRegistry(): RegistryLoadResult {
  const moduleFiles = import.meta.glob<ModuleFile>("/src/modules/*/module.ts", {
    eager: true,
  });

  return createLoadResult(moduleFiles);
}
