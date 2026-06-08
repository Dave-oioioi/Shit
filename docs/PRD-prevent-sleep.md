# PRD: Prevent Sleep Module

## Problem Statement

Users need SHIT VAULT to keep their Windows machine awake during daily work without opening a browser or managing a full settings-heavy utility. The current `prevent-sleep` card is only visual; enabling it does not yet affect system sleep behavior.

## Solution

Implement real Windows keep-awake behavior for the `prevent-sleep` module. The existing card switch will call a Tauri command. Rust will perform the native Windows operation, report success or failure, and the card will reflect the real runtime state.

## User Stories

1. As a desktop user, I want to enable prevent sleep from the card, so that my machine stays awake while I work.
2. As a desktop user, I want to disable prevent sleep from the card, so that the system returns to normal power behavior.
3. As a desktop user, I want the card state to reflect whether prevent sleep is actually active, so that I can trust the shell.
4. As a desktop user, I want a clear error if prevent sleep fails, so that I understand the feature did not take effect.
5. As a tray app user, I want prevent sleep to keep working while the shell window is hidden, so that I do not need to keep the UI open.
6. As a tray app user, I want the app to release prevent sleep when I exit, so that the machine is not left in an unexpected state.
7. As a future maintainer, I want prevent sleep logic isolated in the module and native command layer, so that shell code stays stable.
8. As a future maintainer, I want tests around the state and command seam, so that regressions are caught before release.

## Implementation Decisions

- Keep the existing `prevent-sleep` module directory and card shell.
- Add Tauri command(s) for enabling, disabling, and optionally reading prevent-sleep status.
- Use Rust for Windows power-management behavior.
- Keep React responsible for UI state, command invocation, and error display only.
- Update module state only after command success.
- Preserve the shared `CardFrame` switch/settings visual language.
- Do not add installer, auto-start, or updater behavior in this PRD.
- Do not modify shell navigation or drawer naming for this feature.

## Testing Decisions

- Keep existing shell tests focused on external behavior: visible cards, navigation, settings expansion.
- Add tests at the module seam for switch behavior and failure display.
- Use mocks for Tauri command invocation in frontend tests.
- Run `cargo check` for Rust command compilation.
- Add native behavior tests only if a reliable non-flaky seam is available.

## Out Of Scope

- Full installer workflow.
- Auto-start on login.
- Cross-platform sleep prevention.
- System tray status badge.
- Persistent long-term analytics or history.
- Redesigning the shell or card visual system.

## Further Notes

The shell is now considered complete product infrastructure. Keep future work module-first. Any change that requires editing `AppShell`, tray window behavior, or global card style should be treated as a separate shell change and explicitly approved.
