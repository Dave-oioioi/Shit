# Agent Operating Guide

This document is the action standard for future agents working on SHIT VAULT.

## Product Direction

SHIT VAULT is now a Windows desktop tray app. The main shell is considered complete enough to protect. Future work should focus on module functionality, starting with `prevent-sleep`.

## Non-Negotiables

- Do not redesign the shell unless the user explicitly asks for shell design work.
- Do not move feature logic into `AppShell`, `DashboardPage`, tray code, or global layout code.
- Add or modify features through modules under `src/modules/<module-id>/`.
- Preserve the current tray-first behavior: the app starts hidden, opens from tray, and hides on close/focus loss.
- Keep card UI on the shared `CardFrame` pattern unless the user explicitly approves a new card system.
- Keep module state and module settings separate.
- Do not commit unless the user explicitly asks.
- Do not use destructive git commands.

## Module Contract

Every module must export a `ModuleDefinition` from `module.ts`:

- `manifest`
- `CardComponent`
- `SettingsComponent`
- `defaultState`
- `defaultSettings`

The registry discovers modules automatically. New modules should not require edits to shell navigation or dashboard rendering.

## State And Settings

Use state for runtime facts:

- enabled
- status
- last action time
- runtime error

Use settings for user preferences:

- mode
- presets
- startup behavior
- strategy toggles

Do not store live runtime status in settings.

## Native Capability Pattern

When a module needs OS behavior, expose it through Tauri commands. React should not fake native behavior.

Recommended flow:

1. Card invokes a Tauri command.
2. Rust performs the Windows API work.
3. Rust returns success or a clear error.
4. React updates module state only after success.
5. On failure, React preserves or rolls back state and shows a concise error.

## Prevent Sleep Plan Guardrails

For `prevent-sleep`, implement Windows behavior in Rust first. The target behavior is:

- Enable: prevent system sleep while the module is active.
- Disable: release the keep-awake request.
- Exit: always release keep-awake state.
- Failure: show a module-level error state.

Avoid implementing startup/install workflows until the core keep-awake behavior is stable.

## Testing Standard

Prefer behavior tests at the highest useful seam:

- Registry tests for module discovery and validation.
- Shell tests for navigation and card/settings behavior.
- Rust checks for Tauri build health.
- Module tests for state transitions and command integration seams.

Before handoff or commit, run:

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build-exe
git diff --check
```

On this Windows machine, if `cargo` is not in PATH for the shell, temporarily prepend:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

## Current Known Risk

The registry stores heterogeneous modules behind a type-erased boundary. Keep the unsafe boundary small and localized to host rendering code. Do not spread casts through feature modules.
