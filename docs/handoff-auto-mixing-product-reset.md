# Handoff: Auto Mixing Product Reset

## Context

Workspace: `D:\Project_Dave\SHIT`

This session rewired `auto-mixing` around the product semantics agreed in live testing:

- shell and tray stay protected
- `prevent-sleep` remains frozen
- `auto-mixing` owns its own module logic and native behavior
- the card switch only starts and stops the worker
- settings are editable only while the module is off

## Why This Change Happened

The previous `auto-mixing` UI and runtime were still shaped around diagnostics-first investigation:

- settings stayed editable while running
- the user-facing surface depended on runtime diagnostics
- native listening only followed one default audio endpoint role
- manual override semantics did not restore the original BGM volume at the end of the trigger round

Live testing showed a more basic failure: the diagnostics and scan list could be empty even while Windows volume mixer clearly showed active app sessions. That pushed the implementation from "tune trigger timing" to "reset the product contract and endpoint model".

## Landed Product Semantics

- `anchorExecutables` means the apps that should be ducked.
- `excludedExecutables` means apps that should never trigger ducking.
- Any other audible app becomes a trigger source.
- Selected duck targets do not trigger each other.
- The card switch refuses to enable when there are no duck targets.
- In that case the switch snaps back and opens inline settings instead of showing an error toast.
- While running, settings are locked.
- No runtime diagnostics are shown in the user UI.
- No waiting/status copy is shown during normal operation.
- A fixed music-app candidate library is always visible in settings.
- A live scanned app list is also shown, based on current audio-session targets.
- Manual add is fuzzy-search based, but final stored values are normalized `*.exe`.
- System sounds are trigger sources by default, behind a user-visible toggle.
- The module does not auto-resume enabled state on app restart.

## Native Runtime Changes

Changed file:

- `src-tauri/src/auto_mixing.rs`

Key runtime changes:

- Listen to both `eMultimedia` and `eCommunications` default render endpoints.
- Deduplicate identical endpoint devices before enumerating sessions.
- Keep trigger matching global by executable name even when the same app spans multiple sessions or endpoints.
- Allow system sounds into trigger evaluation through a dedicated `include_system_sounds` request flag.
- Keep system-sound sessions out of the candidate app list.
- Reject native enable requests when no duck target is configured.
- Preserve "manual override during the active trigger round", but still restore the original pre-duck volume when the round ends or the module stops.

## Frontend Changes

Changed files:

- `src/modules/auto-mixing/defaults.ts`
- `src/modules/auto-mixing/AutoMixingCard.tsx`
- `src/modules/auto-mixing/AutoMixingSettings.tsx`
- `src/styles.css`

Key UI changes:

- Removed duck/restore tuning controls from the user settings model.
- Added a fixed music-player candidate library.
- Added a live scanned app list driven by `auto_mixing_list_targets`.
- Added fuzzy manual search with normalized exe output.
- Added a system-sounds trigger toggle.
- Removed user-facing diagnostics panels.
- Added switch bounce-back behavior when no duck target exists.

## Test Changes

Changed files:

- `src/modules/auto-mixing/AutoMixingCard.test.tsx`
- `src/app/shell/AppShell.test.tsx`

Coverage now checks:

- enable payload includes normalized rules and system-sounds toggle
- switch bounce-back when no duck target is configured
- settings UI shows rule area, candidate library, scan list, and manual search
- settings disable correctly while the module is running
- manual add and system-sounds toggle both patch settings correctly
- shell expand test matches the new inline settings structure

## Verification Already Run

These passed:

```powershell
npm test -- src/modules/auto-mixing/AutoMixingCard.test.tsx
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo check --manifest-path src-tauri\Cargo.toml
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo test --manifest-path src-tauri\Cargo.toml
npm test
git diff --check
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; npm run tauri:build-exe
```

Built executable:

```text
src-tauri\target\release\shit-vault.exe
```

One build retry was needed:

- The first `npm run tauri:build-exe` failed because `shit-vault.exe` was still running and Windows refused to overwrite it.
- After stopping the running process, the second build succeeded.

## Expected Worktree

Expected local modified files before commit:

```text
M docs/HANDOFF.md
M docs/handoff-auto-mixing-peak-trigger.md
A docs/handoff-auto-mixing-product-reset.md
M src-tauri/src/auto_mixing.rs
M src/app/shell/AppShell.test.tsx
M src/modules/auto-mixing/AutoMixingCard.test.tsx
M src/modules/auto-mixing/AutoMixingCard.tsx
M src/modules/auto-mixing/AutoMixingSettings.tsx
M src/modules/auto-mixing/defaults.ts
M src/styles.css
```

No commit has been made.

## Live Verification Still Needed

1. Launch `src-tauri\target\release\shit-vault.exe`.
2. Add at least one duck target from the fixed library, scan list, or manual search.
3. Confirm the switch snaps back and opens settings when no duck target exists.
4. Confirm settings become read-only after enabling.
5. Confirm apps on the default device and default communications device are both seen by the scan list.
6. Confirm a non-excluded trigger app ducks selected BGM apps across both endpoint roles.
7. Confirm system sounds trigger ducking when enabled and stop doing so when disabled.
8. Confirm manual volume adjustment during an active trigger round is respected immediately, but original volume still restores after all triggers stop.

## Remaining Risks

- `IAudioMeterInformation` casting or peak reads can still fail for specific apps or sessions; if that happens, capture the exact runtime error.
- Cross-endpoint behavior is compiled and test-covered at the unit level, but still needs real Windows validation with actual app/device routing.
- The fixed music-app library is intentionally conservative; user feedback may still require expanding or trimming it.
