# Handoff

## Latest Handoff

- `docs/handoff-auto-mixing-peak-trigger.md`
  - Current `auto-mixing` investigation and implementation handoff.
  - Covers the switch from `AudioSessionStateActive` trigger detection to peak-based `IAudioMeterInformation::GetPeakValue()` audibility checks.
  - Use this first when continuing `auto-mixing` work on another device.

## Current Goal

SHIT VAULT main shell is complete enough to protect. The first real module, `prevent-sleep`, is now landed end-to-end, functionally frozen, and the project has also been packaged for desktop distribution with a GitHub Release.

The next session should treat the shell and `prevent-sleep` behavior as stable infrastructure. Current feature development should focus on `auto-mixing`.

## Current Status

- Branch: `main`
- Latest pushed commit: `dc8d76a` - `Add installer packaging and update prevent sleep docs`
- Previous major feature commit: `f8aecb5` - `Refine prevent sleep module and card controls`
- GitHub Release: `v0.1.0`
- Release page: `https://github.com/Dave-oioioi/SHIT/releases/tag/v0.1.0`

## Completed

- Converted the project into a Windows desktop Tauri tray app.
- Locked the product into a tray-first flow:
  - app starts hidden
  - opens from tray
  - hides instead of behaving like a normal desktop window
- Built and polished the shell UI:
  - left drawer navigation
  - protected shared `CardFrame`
  - bottom-right popup shell presentation
  - transparent rounded window treatment
  - tightened control styling and visual consistency
- Localized tray menu items to Chinese.
- Added a working native `prevent-sleep` runtime in Rust.
- Wired the `prevent-sleep` card to real Tauri commands.
- Implemented mode-locked settings behavior while the card is enabled.
- Froze `prevent-sleep` functionality; future changes are UI-only unless the feature is explicitly reopened.
- Packaged the app as:
  - runnable release exe
  - NSIS installer
- Published GitHub Release `v0.1.0` with installer asset attached.
- Updated `README.md` to reflect the actual landed feature set.

## Prevent Sleep: Real Product Meaning

`prevent-sleep` is now a keepalive / mouse activity module, not a pure literal system sleep toggle.

Functional status: complete and frozen. Do not change native behavior, command semantics, state semantics, or settings semantics unless the user explicitly asks to reopen this feature. UI-only polish is allowed when requested.

Current implemented behavior:

- Default mode is `idle-keepalive`.
- Default idle activation threshold is `150s`.
- Default idle repeat interval is `5s`.
- Idle detection uses both keyboard and mouse input.
- Keepalive targets the current monitor.
- Safe click position is the bottom-left work area with `48px` inset.
- Idle keepalive performs a double-click pulse when triggered.
- Continuous clicking mode is also supported.
- Continuous mode is hotkey-gated and defaults to `PgDn`.
- Press once to start continuous clicking.
- Press again to stop.
- Moving the mouse also stops continuous clicking.
- Only one mode can be armed at a time.
- Settings are disabled while the module is enabled.
- Windows execution-state API is used as a hidden fallback layer.
- Inline UI text should appear only for real error or degraded states.

## Distribution State

Release executable:

- `src-tauri/target/release/shit-vault.exe`

Installer:

- `src-tauri/target/release/bundle/nsis/SHIT VAULT_0.1.0_x64-setup.exe`

Published release asset:

- `https://github.com/Dave-oioioi/SHIT/releases/download/v0.1.0/SHIT.VAULT_0.1.0_x64-setup.exe`

Important note:

- `src-tauri/tauri.conf.json` now explicitly enables bundling with NSIS through:
  - `bundle.active = true`
  - `bundle.targets = "nsis"`

## Key Files

- `AGENTS.md`
  - project operating rules and non-negotiables
- `README.md`
  - current product and distribution overview
- `docs/PRD-prevent-sleep.md`
  - older PRD; still useful for context but now partially outdated in semantics
- `src-tauri/src/main.rs`
  - tray behavior, window show/hide, menu, command registration
- `src-tauri/src/prevent_sleep.rs`
  - native keepalive runtime and Windows input behavior
- `src-tauri/tauri.conf.json`
  - app name, window config, installer bundling
- `src/app/ui/CardFrame.tsx`
  - shared card control UI
- `src/styles.css`
  - shared shell and card styling, including unified control language
- `src/modules/prevent-sleep/PreventSleepCard.tsx`
  - command invocation, status polling, runtime feedback
- `src/modules/prevent-sleep/PreventSleepSettings.tsx`
  - keepalive mode and timing settings UI
- `src/modules/prevent-sleep/defaults.ts`
  - default runtime state and default user settings
- `src-tauri/src/auto_mixing.rs`
  - native Windows audio-session runtime for `auto-mixing`
- `src/modules/auto-mixing/AutoMixingCard.tsx`
  - command invocation, polling, and runtime feedback for `auto-mixing`
- `src/modules/auto-mixing/AutoMixingSettings.tsx`
  - target selection and rule management UI for `auto-mixing`
- `src/modules/auto-mixing/defaults.ts`
  - default runtime state and user settings for `auto-mixing`

## Important Decisions

- Shell code is protected infrastructure. Do not redesign it casually.
- New feature behavior should be implemented as modules, not shell edits.
- Native desktop behavior must live behind Tauri/Rust commands.
- Card switches should only reflect actual native command success.
- Shared card interaction language should stay centralized in `CardFrame` and shared styles.
- `prevent-sleep` and its real keepalive semantics are intentionally divergent in naming; the behavior is now frozen.
- Do not modify `prevent-sleep` functionality unless the user explicitly reopens it.
- Current feature work belongs in `auto-mixing`.
- Installer flow is now active and valid for distribution.

## Open Issues / Risks

- `prevent-sleep` is frozen, so older improvement plans for that module should be treated as historical unless the user explicitly reopens the feature.
- `auto-mixing` changes should avoid leaking module-specific behavior back into shell code.
- The next module work should avoid leaking module-specific behavior back into shell code.

## Suggested Skills

- `grill-me`
  - for pressure-testing product semantics and future module behavior
- `tdd`
  - for `auto-mixing` module/runtime interaction changes
- `diagnose`
  - if Windows audio sessions, COM, process enumeration, or volume restore behavior becomes inconsistent
- `frontend-design`
  - only when the user explicitly requests more shell/card visual work
- `ui-ux-pro-max`
  - when card interaction quality or settings clarity needs another pass

## Next Step Recommendation

Develop `auto-mixing` next:

1. Keep the shell untouched.
2. Keep React changes inside `src/modules/auto-mixing/`.
3. Keep native behavior inside `src-tauri/src/auto_mixing.rs`.
4. Preserve the React -> Tauri -> Rust pattern.
5. Treat `prevent-sleep` as frozen except for explicit UI-only work.
