# Handoff: Auto Mixing Peak Trigger

## Context

Workspace: `D:\Project_Dave\SHIT`

The current work is focused on `auto-mixing`. The shell and `prevent-sleep` should remain protected. Follow `AGENTS.md`:

- Do not redesign shell/tray/global layout unless explicitly asked.
- Do not modify `prevent-sleep` behavior.
- Keep feature logic under `src/modules/<module-id>/` and native behavior behind Tauri commands.
- Do not commit unless explicitly asked.

## Problem

`auto-mixing` release/recovery appeared too slow. The likely cause was not fade tuning. The trigger condition used `AudioSessionStateActive`, but Windows audio sessions can remain Active after playback stops. That means a paused browser/player can still be treated as a trigger source, keeping BGM ducked.

## Current Change

Changed files:

- `src-tauri/Cargo.toml`
- `src-tauri/src/auto_mixing.rs`
- `src/modules/auto-mixing/AutoMixingSettings.tsx`
- `src/modules/auto-mixing/AutoMixingCard.test.tsx`

Native change:

- Added the `Win32_Media_Audio_Endpoints` feature to the `windows` crate.
- Cast each audio session to `IAudioMeterInformation`.
- Read `IAudioMeterInformation::GetPeakValue()`.
- Added `AUDIBLE_PEAK_THRESHOLD: f32 = 0.001`.
- Added `SessionSnapshot.audible` and `SessionSnapshot.peak_value`.
- Trigger detection now uses `audible_trigger_executables`, derived from actual peak-based audibility, instead of raw `AudioSessionStateActive`.
- `audible` currently means `session_active && peak_value >= AUDIBLE_PEAK_THRESHOLD`.
- BGM target eligibility still checks the BGM session's Active state, so quiet passages in the BGM do not make the target disappear. Only non-BGM trigger detection moved to peak-based audibility.

Diagnostics UI change:

- `AutoMixingDiagnosticSession` now includes `audible` and `peakValue`.
- Runtime diagnostics now show:
  - current audible/not-audible status from `audible`
  - Windows session state, `Active` or `Inactive`
  - peak value
  - current volume
- Source list copy was adjusted to avoid treating a visible audio session as actual sound output.

Tests changed:

- Frontend diagnostics fixtures now include `audible` and `peakValue`.
- Rust trigger tests were renamed from Active-state terminology to audible-trigger terminology.
- Added a Rust unit test that audibility requires both Active state and peak at/above threshold.

## Verification Already Run

These passed:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo check --manifest-path src-tauri\Cargo.toml
npm test -- src/modules/auto-mixing/AutoMixingCard.test.tsx
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo test --manifest-path src-tauri\Cargo.toml auto_mixing
git diff --check
npm test
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo test --manifest-path src-tauri\Cargo.toml
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; npm run tauri:build-exe
```

`npm run tauri:build-exe` built:

```text
src-tauri\target\release\shit-vault.exe
```

One command did not run:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo fmt --manifest-path src-tauri\Cargo.toml
```

Reason: `cargo-fmt.exe` is not installed for the stable toolchain on this machine. `git diff --check` passed.

## Expected Worktree

Expected modified files:

```text
M src-tauri/Cargo.toml
M src-tauri/src/auto_mixing.rs
M src/modules/auto-mixing/AutoMixingCard.test.tsx
M src/modules/auto-mixing/AutoMixingSettings.tsx
A docs/handoff-auto-mixing-peak-trigger.md
M docs/HANDOFF.md
```

No commit has been made.

## Next Steps

1. Live-verify on Windows:
   - Run `src-tauri\target\release\shit-vault.exe` or `npm run tauri:dev`.
   - Enable `auto-mixing`.
   - Set the BGM app, for example Spotify or QQMusic, as the BGM target.
   - Play audio from a trigger app, for example a browser or Discord.
   - Pause the trigger app while keeping it open.
   - Open diagnostics and confirm the trigger can remain `state Active` while `peak` drops to zero and audible status becomes not audible.
   - Confirm BGM restores promptly after trigger peak drops below threshold.

2. If release still feels delayed:
   - Do not tune fade curves first.
   - Check the diagnostics peak value for the trigger source.
   - If a source has a non-zero noise floor, adjust `AUDIBLE_PEAK_THRESHOLD` deliberately and retest.

3. If some apps fail with `IAudioMeterInformation cast failed` or `GetPeakValue failed`:
   - Capture the exact runtime error.
   - Decide whether the worker should skip only that broken session or keep hard-failing. Current implementation hard-fails to avoid silently falling back to the old Active-state behavior.

## Suggested Skills

- `diagnose`: use if live behavior still does not match expected release timing.
- `qa`: use for app-level QA after launching the Tauri app.
- `handoff`: use before further context growth or before changing devices/sessions again.
