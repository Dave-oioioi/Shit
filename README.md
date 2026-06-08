# SHIT VAULT

SHIT VAULT is a Windows desktop tray app built with Tauri, React, TypeScript, Zustand, and Vitest.

The main shell is now considered complete enough to protect. Future work should focus on feature modules, starting with the real `prevent-sleep` card behavior.

## Current State

- Tray-first Windows desktop app.
- Starts hidden and opens from the tray.
- Tray menu: `打开`, `设置`, `退出`.
- Main shell UI is polished and fixed at `455 x 660`.
- Left drawer navigation contains: `主坑位`, `大便位`, `小便池`, `洗手台`.
- `主坑位` contains `自动混音` and `防止休眠`.
- Main logo opens the `Shit Vault` info page.
- Module discovery is registry-driven via `import.meta.glob`.
- Existing cards are UI shells; `prevent-sleep` does not yet call native Windows APIs.

## Documentation

- [Agent operating guide](AGENTS.md)
- [Glossary](CONTEXT.md)
- [Handoff](docs/HANDOFF.md)
- [Prevent Sleep PRD](docs/PRD-prevent-sleep.md)

## Tech Stack

- React 18
- TypeScript
- Vite
- Zustand
- Vitest
- Tauri 2
- Rust

## Quick Start

Install dependencies:

```bash
npm install
```

Run frontend dev server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Build frontend:

```bash
npm run build
```

Run Tauri dev app:

```bash
npm run tauri:dev
```

Build a runnable exe without installer bundling:

```bash
npm run tauri:build-exe
```

If `cargo` is not available in the current PowerShell session:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

## Desktop Launch

The release executable is:

```text
src-tauri/target/release/shit-vault.exe
```

The helper script is:

```text
launch-shit-vault.cmd
```

## Project Structure

```text
src/
  app/
    shell/
    registry/
    layout/
    state/
    hooks/
    ui/
  modules/
    auto-mixing/
    prevent-sleep/
src-tauri/
  src/
    main.rs
docs/
```

## Module Contract

Every module exports a `ModuleDefinition` from `module.ts`:

- `manifest`
- `CardComponent`
- `SettingsComponent`
- `defaultState`
- `defaultSettings`

The shell discovers modules automatically. Adding a normal module should not require editing `AppShell`, `DashboardPage`, or tray code.

## Development Rules

- Keep shell code stable.
- Put feature behavior inside modules and Tauri commands.
- Keep module state separate from module settings.
- Update card enabled state only after real command success.
- Show concise error feedback when a native command fails.
- Preserve the shared `CardFrame` visual language.

## Verification

Recommended checks before commit:

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build-exe
git diff --check
```

## Next Feature

Implement real Windows behavior for `prevent-sleep`:

1. Add Tauri command(s) for enable/disable/status.
2. Implement Windows keep-awake behavior in Rust.
3. Wire the existing card switch to command success/failure.
4. Show status and errors in the card.
5. Ensure exit disables or releases keep-awake state.
