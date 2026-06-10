# Ubiquitous Language

## SHIT VAULT

The desktop tray application shell. It is the product container, not a single feature module.

## Shell

The permanent host UI that owns tray behavior, window positioning, navigation, registry loading, and shared card presentation. The shell must not contain feature-specific business logic.

## Module

A feature package under `src/modules/<module-id>/`. A module exports a manifest, card component, settings component, default state, and default settings.

## Card

The visible daily-use surface for a module. Cards use the shared `CardFrame` visual and interaction pattern.

## Settings

Module configuration shown inline from the card settings button. Settings are user preferences, not live runtime state.

## State

Runtime module state, such as enabled, status, and last action time. State is separate from settings.

## Registry

The automatic module discovery and validation layer driven by `import.meta.glob`.

## Prevent Sleep

A completed and functionally frozen module. It keeps the Windows machine awake while enabled and releases that behavior when disabled. Future work is UI-only unless the user explicitly reopens the feature.

## Auto Mixing

The current feature development focus. This module manages Windows audio-session mixing behavior from `src/modules/auto-mixing/` and native Tauri commands in `src-tauri/src/auto_mixing.rs`.

## Tray

The Windows notification area entry point. The tray owns opening the shell, opening settings, and exiting the app.
