import { describe, expect, it } from "vitest";
import { createLoadResult } from "@/app/registry/loadModuleRegistry";
import validModule from "@/modules/auto-mixing/module";
import preventSleepModule from "@/modules/prevent-sleep/module";
import type { ModuleDefinition, RegisteredModuleDefinition } from "@/app/registry/moduleTypes";

describe("createLoadResult", () => {
  it("keeps valid modules and reports invalid ones without crashing", () => {
    const result = createLoadResult({
      "/src/modules/auto-mixing/module.ts": {
        default: validModule,
      },
      "/src/modules/bad/module.ts": {
        default: {
          manifest: {
            id: "bad-module",
            name: "bad-module",
            version: "0.0.1",
            title: "Bad module",
            defaultSize: "9x9",
            minSize: "1x1",
          },
        } as unknown as RegisteredModuleDefinition,
      },
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]?.manifest.id).toBe("auto-mixing");
    expect(result.diagnostics["bad-module"]?.valid).toBe(false);
  });

  it("accepts a newly added third module without changing shell code", () => {
    const focusLockModule: ModuleDefinition = {
      manifest: {
        id: "focus-lock",
        name: "focus-lock",
        version: "0.1.0",
        title: "Focus Lock",
        description: "Third module proving the registry path stays additive.",
        themeColor: "#ffb36b",
        icon: "focus",
        defaultSize: "2x1",
        minSize: "2x1",
        order: 3,
        enabledByDefault: true,
        hasSettings: true,
      },
      CardComponent: () => null,
      SettingsComponent: () => null,
      defaultState: {
        status: "idle",
      },
      defaultSettings: {
        enabled: true,
      },
    };

    const result = createLoadResult({
      "/src/modules/auto-mixing/module.ts": {
        default: validModule,
      },
      "/src/modules/prevent-sleep/module.ts": {
        default: preventSleepModule,
      },
      "/src/modules/focus-lock/module.ts": {
        default: focusLockModule,
      },
    });

    expect(result.modules.map((module) => module.manifest.id)).toEqual([
      "auto-mixing",
      "prevent-sleep",
      "focus-lock",
    ]);
  });
});
