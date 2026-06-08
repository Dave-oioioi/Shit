# Prevent Sleep Fix Design

## Goal

Align the `prevent-sleep` card with the product promise: native keep-awake behavior with no cursor-click side effects, trustworthy runtime status, and docs/tests that reflect the real implementation.

## Scope

- Remove synthetic mouse movement and click behavior from the native worker.
- Keep Windows execution-state requests as the only keep-awake mechanism.
- Make status semantics mean "currently active and healthy", not merely "worker thread exists".
- Clear stale runtime errors when the feature is disabled.
- Update tests and handoff documentation to match the current module.

## Approach

Rust remains the source of truth for runtime state. The worker will continuously refresh Windows execution state and expose a health-aware status model to React. The card will continue to update only from command results and status polling, but disabling the module must also clear old error presentation.

## Success Criteria

- Enabling the card does not move the cursor or click anywhere.
- A native runtime failure does not leave the UI appearing healthy.
- Disabling the card clears prior runtime error text and last pulse data.
- Tests cover the corrected status semantics.
- `docs/HANDOFF.md` no longer claims the module is UI-only.
