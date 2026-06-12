# Handoff: Auto Mixing Slider Plan

## Context

Workspace: `D:\Project_Dave\SHIT`

This handoff captures the implemented `auto-mixing` UI/runtime tuning-control follow-up.

It builds on:

- `docs/handoff-auto-mixing-product-reset.md`
  - Current product/runtime contract for `auto-mixing`
- `docs/handoff-auto-mixing-ui-polish.md`
  - Current UI structure and visual direction
- `AGENTS.md`
  - Shell protection, module boundaries, and verification standard

Important: this handoff now reflects implemented behavior.

## Goal

Expose two user-facing `auto-mixing` tuning controls in the settings UI:

- `压低比例`
- `渐入渐出`

The controls should fit the existing `auto-mixing` design language without reopening shell design or the `prevent-sleep` freeze.

## Agreed Product Decisions

The following decisions were explicitly confirmed with the user.

- The new controls belong to the main `auto-mixing` settings page, not a secondary page.
- They should be placed at the top of the main settings page so they are immediately visible.
- They should be merged into one compact panel, not split into multiple cards.
- The panel title was removed during design polish; the two sliders appear directly above `选择应用`.
- The controls should be shown directly by default; no expand/collapse step.
- The two labels should be:
  - `压低比例`
  - `渐入渐出`
- `压低比例` means the remaining ducked volume after triggering.
  - Example: `15%` means the BGM is reduced to 15% volume while ducked.
- `渐入渐出` should control both the duck-in and restore-out timing together.
- Default values and ranges:
  - `压低比例`: default `15%`, range `10% - 40%`
  - `渐入渐出`: default `120ms`, range `0ms - 600ms`
- The current slider value should not be permanently visible in the UI.
- The current value should appear automatically near the thumb on hover and while dragging.
- The sliders should not show textual tick labels such as `�?/ 慢` or `�?/ 深`.
- The track itself should carry the visual meaning instead of helper text.
- While `auto-mixing` is running, the controls should remain visible but disabled.

## Intended UI Shape

Main page ordering is:

1. Two compact tuning sliders
2. Page heading: `选择应用`
3. Existing selected duck-target panel
4. Existing add/exclude navigation rows
5. Existing standalone system-sounds toggle

The new panel should stay visually light and compact:

- one panel
- two stacked slider rows
- no large cards
- no always-on numeric badges
- no helper copy below each control unless later proven necessary

## Visual Direction

This should remain inside the existing lightweight audio-console direction from `docs/handoff-auto-mixing-ui-polish.md`.

Recommended treatment:

- Use a thin framed panel that matches the current `auto-mixing` console surfaces.
- Each slider row should use a clean label-plus-track layout.
- Value bubbles should only appear on hover, focus, or active drag.
- `压低比例` track should visually suggest stronger attenuation as the thumb moves toward the stronger end.
- `渐入渐出` track should visually suggest a slower, softer transition toward the slower end.
- Avoid adding explanatory text labels below the track.

## Runtime Mapping

The user wants this shipped as real behavior, not UI-only.

Native state:

- `src-tauri/src/auto_mixing.rs` already accepts:
  - `ducked_volume_percent`
  - `restore_duration_ms`
- Duck attack timing is configurable through `attack_duration_ms`.

Implemented mapping:

- Frontend settings model should gain:
  - `duckedVolumePercent`
  - `fadeDurationMs`
- Tauri enable request should send:
  - `duckedVolumePercent -> ducked_volume_percent`
  - `fadeDurationMs -> restore_duration_ms`
  - `fadeDurationMs -> attack_duration_ms` (new field to add)

This keeps the user-facing UI to exactly two sliders while letting one timing control govern both directions.

## Implemented Code Areas

Frontend:

- `src/modules/auto-mixing/defaults.ts`
  - extend settings shape and normalization
- `src/modules/auto-mixing/AutoMixingSettings.tsx`
  - render the new top panel and slider controls
- `src/modules/auto-mixing/AutoMixingCard.tsx`
  - include the new settings values in the enable request
- `src/styles.css`
  - add slider panel and hover bubble styling
- `src/modules/auto-mixing/AutoMixingCard.test.tsx`
  - add settings defaults, slider interaction, and enable-payload coverage
- `src/app/shell/AppShell.test.tsx`
  - optionally assert the top-level `混音设置` panel if needed

Native:

- `src-tauri/src/auto_mixing.rs`
  - `attack_duration_ms` was added to `AutoMixingRequest`
  - `WorkerConfig` carries attack duration
  - hard-coded attack duration usage was replaced
  - restore-duration compatibility behavior remains intact

## Guardrails

- Do not redesign the shell or change module layout outside `src/modules/auto-mixing/`.
- Do not reopen `prevent-sleep`.
- Keep the main `auto-mixing` page compact; avoid turning it back into a diagnostics dashboard.
- Keep runtime state and settings separate.
- Treat this as a focused `auto-mixing` enhancement, not a broader product reset.

## Verification To Run After Future Changes

```powershell
npm test
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build-exe
git diff --check
```

Live validation should also confirm:

- `压低比例` audibly changes the ducked target volume
- `渐入渐出` changes both ducking and restoration timing
- controls lock correctly while running
- hover/drag bubbles appear and disappear as intended

## Current Status

At the time of this handoff:

- the decisions above are implemented
- full unit tests, frontend build, Rust check, and Tauri bundle build passed during release closeout
- the final installer target is `src-tauri/target/release/bundle/nsis/SHIT VAULT_1.1.0_x64-setup.exe`
