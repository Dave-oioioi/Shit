# Handoff

## Current Goal

The SHIT VAULT main shell is complete. The next goal is to develop real card functionality, starting with the `prevent-sleep` module.

## Completed

- Converted the project into a Windows desktop Tauri tray app.
- Added Tauri scripts and dependencies.
- Configured the app name, identifier, tray behavior, hidden startup, and bottom-right shell opening.
- Built a polished tray-first shell UI with left drawers, toolsets, cards, settings, and a Shit Vault info page.
- Refined transparent window corners, shell radius, shadows, and card controls.
- Added a desktop launch script and synced the desktop shortcut to the release exe.
- Localized tray menu items to Chinese: `打开`, `设置`, `退出`.
- Cleaned registry typing, test encoding, `.gitignore` comments, and debug residue.
- Added this documentation set and README updates.

## Key Files

- `AGENTS.md` - future agent operating guide.
- `CONTEXT.md` - project glossary.
- `docs/PRD-prevent-sleep.md` - PRD for the next feature.
- `src-tauri/src/main.rs` - tray behavior, menu, window show/hide, position.
- `src-tauri/tauri.conf.json` - Tauri app/window config.
- `src/app/shell/AppShell.tsx` - main shell navigation and layout.
- `src/app/ui/CardFrame.tsx` - shared module card frame.
- `src/app/registry/*` - module contract, validation, discovery.
- `src/modules/prevent-sleep/*` - next feature module.

## Important Decisions

- SHIT VAULT is a tray-first Windows desktop app.
- The shell is now protected product infrastructure.
- Future features should be implemented as modules, not shell edits.
- The registry remains automatic via `import.meta.glob`.
- Real OS behavior must go through Tauri/Rust commands.
- Card switches should reflect real command success, not only optimistic UI state.
- `prevent-sleep` is the next feature to implement.

## Open Issues

- `prevent-sleep` now calls native Windows keep-awake APIs, but its runtime semantics should continue to be treated carefully because the card is promising real OS behavior.
- App install/update flow is intentionally not finalized.
- Module state persistence beyond current stores may need design once real behavior exists.
- The old `ModuleSettingsDrawer` still exists for compatibility but the current UI uses inline settings.

## Suggested Skills

- `grill-with-docs` when changing project language or architectural rules.
- `tdd` for implementing `prevent-sleep` behavior.
- `diagnose` if Windows API behavior is inconsistent.
- `frontend-design` only if the user explicitly requests visual changes.

## Next Step Recommendation

Implement the Rust/Tauri command surface for `prevent-sleep`, then wire the existing card switch to that command and show error/status feedback in the card.
