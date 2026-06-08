import type {
  ModuleId,
  RegisteredModuleDefinition,
  ValidationResult,
} from "@/app/registry/moduleTypes";
import { validateModule } from "@/app/registry/validateModule";

type ModuleFile = {
  default?: unknown;
  moduleDefinition?: unknown;
};

export type RegistryDiagnostics = Record<ModuleId | string, ValidationResult>;

export type RegistryLoadResult = {
  modules: RegisteredModuleDefinition[];
  diagnostics: RegistryDiagnostics;
};

export function createLoadResult(rawFiles: Record<string, ModuleFile>): RegistryLoadResult {
  const diagnostics: RegistryDiagnostics = {};
  const modules = Object.values(rawFiles)
    .map((file) => file.default ?? file.moduleDefinition)
    .filter(
      (candidate): candidate is unknown => candidate !== undefined,
    )
    .flatMap((candidate) => {
      const validation = validateModule(candidate);
      const moduleDefinition = candidate as Partial<RegisteredModuleDefinition>;
      const key = moduleDefinition.manifest?.id ?? "unknown";
      diagnostics[key] = validation;
      return validation.valid ? [moduleDefinition as RegisteredModuleDefinition] : [];
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
