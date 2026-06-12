# SHIT VAULT v1.0.0 Release Handoff

## Summary

This handoff records the SHIT VAULT `v1.0.0` project closeout: runtime single-instance protection, single install mode, installer safety, README refresh, release build, and GitHub Release target.

## Product State

- SHIT VAULT is a Windows tray-first Tauri desktop app.
- The shell is protected infrastructure.
- `prevent-sleep` is functionally complete and frozen.
- `auto-mixing` is complete for 1.0 with duck-target selection, add/exclude flows, system-sounds trigger toggle, and dual endpoint listening.
- Tray menu `设置` opens directly to the software settings page.

## Runtime Single Instance

Implemented with `tauri-plugin-single-instance`.

Expected behavior:

- First launch starts the tray process.
- Second launch does not create another long-lived process.
- Second launch reveals/focuses the existing shell window.

Key file:

- `src-tauri/src/main.rs`

## Single Install Line

Installer configuration is fixed to current-user NSIS install mode.

Expected behavior:

- The installer uses the stable product identity `com.dave.shitvault`.
- The installer does not offer current-user/per-machine choice.
- Users do not get parallel per-user/per-machine installations through the packaged installer.
- Install/update is blocked while `shit-vault.exe` is running, so the release exe cannot be overwritten while locked.

Key files:

- `src-tauri/tauri.conf.json`
- `src-tauri/nsis/installer-hooks.nsh`

## Version Metadata

Updated to `1.0.0`:

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

## Build Outputs

Expected after `npm run tauri:build`:

- `src-tauri/target/release/shit-vault.exe`
- `src-tauri/target/release/bundle/nsis/SHIT VAULT_1.0.0_x64-setup.exe`

## Verification

Run:

```bash
npm test
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build-exe
npm run tauri:build
git diff --check
```

Optional live checks:

1. Launch `src-tauri/target/release/shit-vault.exe`.
2. Launch it again and confirm only one `shit-vault.exe` remains running.
3. Right-click tray icon, click `设置`, and confirm the software settings page opens.
4. Exit from the tray menu before running the installer.

## Release Target

- Tag: `v1.0.0`
- Release URL: `https://github.com/Dave-oioioi/SHIT/releases/tag/v1.0.0`
- Release asset: `SHIT VAULT_1.0.0_x64-setup.exe`

## Notes For Future Work

- Keep shell behavior stable unless explicitly reopened.
- Keep `prevent-sleep` native behavior frozen.
- Future feature changes should continue through `src/modules/<module-id>/` and Tauri commands.
- Do not re-enable NSIS install mode selection unless the product explicitly supports migration between install scopes.
