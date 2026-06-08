import type { ModuleDefinition, ValidationResult } from "@/app/registry/moduleTypes";

const VALID_SIZES = new Set(["1x1", "2x1", "2x2"]);

export function validateModule(definition: unknown): ValidationResult {
  const errors: string[] = [];
  const moduleDefinition = definition as Partial<ModuleDefinition> | undefined;

  if (!moduleDefinition || typeof moduleDefinition !== "object") {
    return {
      valid: false,
      errors: ["Module export is missing or invalid."],
    };
  }

  const manifest = moduleDefinition.manifest;

  if (!manifest) {
    errors.push("Missing manifest.");
  } else {
    if (!manifest.id) errors.push("Manifest is missing id.");
    if (!manifest.name) errors.push(`Module "${manifest.id ?? "unknown"}" is missing name.`);
    if (!manifest.title) errors.push(`Module "${manifest.id ?? "unknown"}" is missing title.`);
    if (!manifest.version) {
      errors.push(`Module "${manifest.id ?? "unknown"}" is missing version.`);
    }
    if (!VALID_SIZES.has(manifest.defaultSize)) {
      errors.push(`Module "${manifest.id ?? "unknown"}" has invalid defaultSize.`);
    }
    if (!VALID_SIZES.has(manifest.minSize)) {
      errors.push(`Module "${manifest.id ?? "unknown"}" has invalid minSize.`);
    }
  }

  if (typeof moduleDefinition.CardComponent !== "function") {
    errors.push(`Module "${manifest?.id ?? "unknown"}" is missing CardComponent.`);
  }

  if (typeof moduleDefinition.SettingsComponent !== "function") {
    errors.push(`Module "${manifest?.id ?? "unknown"}" is missing SettingsComponent.`);
  }

  if (!moduleDefinition.defaultState || typeof moduleDefinition.defaultState !== "object") {
    errors.push(`Module "${manifest?.id ?? "unknown"}" is missing defaultState.`);
  }

  if (
    !moduleDefinition.defaultSettings ||
    typeof moduleDefinition.defaultSettings !== "object"
  ) {
    errors.push(`Module "${manifest?.id ?? "unknown"}" is missing defaultSettings.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
