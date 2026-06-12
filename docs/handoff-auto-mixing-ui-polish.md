# Handoff: Auto Mixing UI Polish

## Context

Workspace: `D:\Project_Dave\SHIT`

This handoff covers the latest `auto-mixing` frontend/UI polish pass. It builds on:

- `docs/handoff-auto-mixing-product-reset.md`
  - Current product/runtime contract.
- `docs/handoff-auto-mixing-peak-trigger.md`
  - Historical trigger/audibility context only.
- `AGENTS.md`
  - Project operating rules.

Do not re-open shell redesign or `prevent-sleep` behavior from this handoff. The scope of this pass was intentionally narrowed to `auto-mixing` card/settings UI.

For the next planned tuning-controls follow-up, see:

- `docs/handoff-auto-mixing-slider-plan.md`
  - Planning-only handoff for the top-level `混音设置` slider panel

## Product Decisions From This Pass

- `auto-mixing` feature behavior is in finish-up mode.
- Current work should be frontend/UI polish, mainly `auto-mixing`.
- Keep the SHIT VAULT brand concept, but reduce noise.
- The collapsed `auto-mixing` card should not show runtime information.
  - Keep identity, ambient visual, switch, and settings affordance.
  - Do not show selected count, duck count, session count, waiting copy, or diagnostics.
- Expanded settings should not show every control flat.
- Main settings page is `选择应用`.
- Secondary pages are `添加应用` and `排除应用`.
- `系统声音触发` remains a standalone switch.
- Main page primarily displays selected duck targets.
- Selected apps use compact rows, not large cards.
- Visual direction is a lightweight audio console, not a diagnostics dashboard.
- Running/locked state can still browse secondary pages, but editing controls remain disabled.
- All `auto-mixing` scrollbars should be visually integrated.
  - Default scrollbar arrow buttons should not show.

## Frontend Changes

Changed files in this UI pass:

- `src/modules/auto-mixing/AutoMixingSettings.tsx`
- `src/modules/auto-mixing/AutoMixingCard.test.tsx`
- `src/app/shell/AppShell.test.tsx`
- `src/styles.css`

### Settings Structure

`AutoMixingSettings.tsx` now uses an internal page model:

- `select`
  - Default page.
  - Heading: `选择应用`.
  - Shows compact selected duck-target rows.
  - Shows an empty state when no target is selected.
  - Shows a short recommended-app chip strip.
  - Shows entry rows for `添加应用` and `排除应用`.
  - Shows the standalone `系统声音触发` switch.
- `add`
  - Secondary page.
  - Back button returns to `选择应用`.
  - Search box at top.
  - Default order: `正在发声`, then `常用音乐应用`.
  - Search combines scanned apps, fixed library candidates, and typed `*.exe` fallback.
- `exclude`
  - Secondary page.
  - Back button returns to `选择应用`.
  - Existing excluded apps are shown as compact rows.
  - Candidate/search flow mirrors add page, but action is exclusion.
  - Excluding an app removes it from selected duck targets through the existing settings model.

### Scrollbar Follow-Up

The user highlighted the native scrollbar endpoint arrows in screenshots and asked to remove them.

`src/styles.css` now adds `auto-mixing`-scoped scrollbar styling for:

- `.auto-mixing-recommend-strip`
- `.auto-mixing-console .auto-mixing-candidate-list`

The latest fix hides:

- `::-webkit-scrollbar-button`
- `::-webkit-scrollbar-button:single-button`
- `::-webkit-scrollbar-button:horizontal`
- `::-webkit-scrollbar-button:vertical`
- `::-webkit-scrollbar-button:decrement`
- `::-webkit-scrollbar-button:increment`

Intent: only track and thumb should remain, matching the card switch visual language.

If Chrome still shows endpoint arrows after refresh, consider replacing the native horizontal scrollbar with one of:

- hidden native scrollbar plus fade masks,
- custom left/right icon buttons,
- wrapping recommendation chips to avoid horizontal scroll.

## Tests Updated

`src/modules/auto-mixing/AutoMixingCard.test.tsx` now covers:

- main `选择应用` page first
- navigation into `添加应用` and `排除应用`
- recommended app add flow
- scanned app exclude flow
- selected app moved into excluded via exclude page
- running state keeps pages viewable but disables edits
- typed executable search inside add page
- system-sounds toggle

`src/app/shell/AppShell.test.tsx` now expects the new inline settings structure:

- `选择应用`
- navigation to `添加应用`
- navigation to `排除应用`

## Verification

After the main UI rewrite:

```powershell
npm test
npm run build
git diff --check
```

Passed:

- `npm test`: 25 tests
- `npm run build`
- `git diff --check` with CRLF conversion warnings only

After the final scrollbar-arrow fix:

```powershell
npm run build
npm test -- src/modules/auto-mixing/AutoMixingCard.test.tsx
```

Passed:

- build
- targeted `auto-mixing` test: 10 tests

Full test suite was not re-run after the final CSS-only scrollbar fix.

## Browser Preview

Vite dev server was started at:

```text
http://127.0.0.1:5173/
```

At the time of the user preview, port `5173` was owned by process `38212`.

The user previewed in external Chrome and provided screenshots of the scrollbar issues.

Plain Chrome/Vite preview may show console errors from Tauri APIs not existing in a normal browser context. Do not treat those as desktop runtime failures unless reproduced inside Tauri.

## Current Worktree Notes

This UI handoff is layered on top of the broader uncommitted `auto-mixing` product-reset work. Dirty files include both pre-existing product-reset changes and this UI pass.

Expected dirty files include:

```text
M docs/HANDOFF.md
M docs/handoff-auto-mixing-peak-trigger.md
A docs/handoff-auto-mixing-product-reset.md
A docs/handoff-auto-mixing-ui-polish.md
M src-tauri/src/auto_mixing.rs
M src/app/shell/AppShell.test.tsx
M src/app/ui/CardFrame.tsx
M src/modules/auto-mixing/AutoMixingCard.test.tsx
M src/modules/auto-mixing/AutoMixingCard.tsx
M src/modules/auto-mixing/AutoMixingSettings.tsx
M src/modules/auto-mixing/defaults.ts
M src/styles.css
```

Do not assume every dirty file was modified in the UI pass.

## Next Steps

0. If the work is about exposing `压低比例` / `渐入渐出`, follow `docs/handoff-auto-mixing-slider-plan.md` instead of reopening this pass from scratch.
1. Ask the user to refresh Chrome and confirm the scrollbar endpoint arrows are gone.
2. If arrows persist, replace the recommended-app native scrollbar with a custom or hidden-scrollbar pattern.
3. Run full verification before handoff/commit:

```powershell
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build-exe
git diff --check
```

If `cargo` is missing in PATH:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

## Suggested Skills

- `frontend-design`
  - Continue `auto-mixing` UI polish or shell noise reduction only if the user asks.
- `playwright`
  - Browser-level visual verification.
- `diagnose`
  - Only for real Windows audio-session behavior issues.
- `handoff`
  - Update docs again before context growth or commit.
