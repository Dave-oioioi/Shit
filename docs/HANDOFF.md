# Handoff

## Latest Handoff

- `docs/handoff-auto-mixing-slider-plan.md`
  - Implementation handoff for the completed `auto-mixing` tuning controls.
  - Covers `压低比例` and `渐入渐出`, runtime mapping, slider UI behavior, and verification.
  - Read this before changing the tuning-control behavior or visual treatment.

- `docs/handoff-v1.1-release.md`
  - Current release handoff for SHIT VAULT `v1.1.0`.
  - Covers single-instance runtime protection, single install mode, installer build, release asset, verification, and release sync status.
  - Use this first for future project maintenance or release follow-up.

- `docs/handoff-auto-mixing-ui-polish.md`
  - Latest detailed `auto-mixing` UI handoff.
  - Covers the current frontend direction: collapsed card without runtime info, `选择应用` as the primary settings page, `添加应用` / `排除应用` as secondary pages, standalone system-sounds toggle, compact selected rows, and integrated scrollbar styling.

- `docs/handoff-auto-mixing-product-reset.md`
  - Current detailed `auto-mixing` product/runtime handoff.
  - Covers the duck-target model, fixed candidate library, dual-endpoint listening, system-sounds toggle, and locked-while-running settings behavior.

- `docs/handoff-auto-mixing-peak-trigger.md`
  - Historical handoff for the earlier peak-trigger investigation.

## Current Goal

SHIT VAULT is being closed out as `v1.1.0`: a Windows tray-first desktop utility with protected shell behavior, frozen `prevent-sleep`, completed `auto-mixing`, single-instance runtime enforcement, one current-user NSIS install line, and a GitHub Release installer artifact.

## Current Auto Mixing Tuning Controls

The latest focused `auto-mixing` enhancement is implemented:

- `压低比例` controls the ducked target volume.
- `渐入渐出` controls both duck-in and restore-out timing.
- The sliders sit above `选择应用`, without a `混音设置` heading.
- Values appear only on hover/focus/drag.
- Controls remain visible but disabled while `auto-mixing` is running.
- Runtime wiring sends `duckedVolumePercent`, `restoreDurationMs`, and `attackDurationMs` through the Tauri enable request.

This is documented in `docs/handoff-auto-mixing-slider-plan.md`.

## Current Status

- Branch: `main`
- Version target: `v1.1.0`
- Previous pushed commit before this release work: `0566317` - `Refine auto mixing trigger and settings UI`
- Previous published release: `v1.0.0`
- Target release page: `https://github.com/Dave-oioioi/SHIT/releases/tag/v1.1.0`
- GitHub Pages site: `https://dave-oioioi.github.io/SHIT/`
- Local installer path: `src-tauri/target/release/bundle/nsis/SHIT VAULT_1.1.0_x64-setup.exe`
- Public release asset: `SHIT.VAULT_1.1.0_x64-setup.exe`

## Completed For 1.1

- Preserved tray-first behavior:
  - app starts hidden
  - opens from tray
  - hides on close, focus loss, and `Esc`
- Preserved protected shell/card architecture.
- Kept `prevent-sleep` behavior frozen.
- Completed `auto-mixing` product/UI reset:
  - switch starts/stops only
  - settings lock while running
  - selected apps are duck targets
  - excluded apps never trigger
  - system sounds have a standalone trigger toggle
  - default multimedia and communications render endpoints are monitored
- Fixed tray menu settings navigation:
  - tray right-click `设置` opens the shell directly on the software settings page
  - frontend also reads the pending native navigation target on mount so startup timing does not drop the request
- Added single-instance runtime enforcement:
  - `tauri-plugin-single-instance`
  - second launch is handed to the existing process and reveals the existing window
- Added installer safety:
  - NSIS install mode fixed to `currentUser`
  - stable product identity retained as `com.dave.shitvault`
  - installer preinstall hook blocks install/update while `shit-vault.exe` is running
- Updated project version metadata:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Updated README for 1.1.
- Added `auto-mixing` tuning sliders:
  - `压低比例`, default `15%`, range `10% - 40%`
  - `渐入渐出`, default `120ms`, range `0ms - 600ms`
  - one timing value controls both duck-in and restore-out.
- Updated shell identity card:
  - displays `屎包`
  - removes the `中文名` label
  - displays `官网地址`
  - opens the GitHub Pages site through the system browser.

## Release Files

- Release exe:
  - `src-tauri/target/release/shit-vault.exe`
- NSIS installer:
  - `src-tauri/target/release/bundle/nsis/SHIT VAULT_1.1.0_x64-setup.exe`
- GitHub Release installer asset:
  - `SHIT.VAULT_1.1.0_x64-setup.exe`
- Installer hook:
  - `src-tauri/nsis/installer-hooks.nsh`

## Key Files

- `src-tauri/src/main.rs`
  - tray behavior, show/hide behavior, command registration, pending shell navigation, single-instance callback
- `src-tauri/src/auto_mixing.rs`
  - native audio-session runtime for `auto-mixing`
- `src-tauri/src/prevent_sleep.rs`
  - frozen native keepalive runtime
- `src-tauri/tauri.conf.json`
  - app version, product identity, NSIS packaging configuration
- `src-tauri/nsis/installer-hooks.nsh`
  - blocks install/update when `shit-vault.exe` is still running
- `src/app/shell/AppShell.tsx`
  - software settings page, tray navigation target hydration, shell behavior
- `src/modules/auto-mixing/`
  - current 1.1 module UI/state/settings behavior
- `src/modules/prevent-sleep/`
  - frozen keepalive module

## Important Decisions

- Do not redesign the shell unless explicitly asked.
- Do not move feature logic into shell/global layout/tray code.
- `prevent-sleep` is complete and frozen.
- `auto-mixing` owns its module behavior and native runtime.
- Keep state and settings separate.
- Run only one app instance at a time.
- Ship one install line by keeping NSIS at `currentUser`; do not re-enable install-mode selection.
- Do not install/update while the tray app is running.

## Verification Standard

Run before future release handoff:

```bash
npm run check:release
```

## Final Release Sync

For final release sync, publish `v1.1.0`:

1. Commit the release changes.
2. Push `main`.
3. Upload the latest NSIS installer to GitHub Release `v1.1.0`.

If GitHub CLI or token authentication is unavailable on the machine, the code/build side is still complete, but release asset upload requires the user to authenticate.
