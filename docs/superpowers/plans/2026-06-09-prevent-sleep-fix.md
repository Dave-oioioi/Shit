# Prevent Sleep Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prevent-sleep card use native keep-awake behavior without click side effects and expose reliable runtime status.

**Architecture:** Rust owns the real prevent-sleep runtime and health state. React remains a thin command/status client. Tests cover both the native status contract and the card's error-clearing behavior.

**Tech Stack:** Tauri 2, Rust, React, Vitest

---

### Task 1: Correct Native Runtime Semantics

**Files:**
- Modify: `src-tauri/src/prevent_sleep.rs`

- [ ] **Step 1: Write failing native tests**
- [ ] **Step 2: Run Rust tests to verify the new assertions fail or are missing**
- [ ] **Step 3: Remove synthetic mouse click behavior and tighten runtime status semantics**
- [ ] **Step 4: Run Rust tests to verify they pass**

### Task 2: Correct Card State Behavior

**Files:**
- Modify: `src/modules/prevent-sleep/PreventSleepCard.tsx`
- Modify: `src/modules/prevent-sleep/PreventSleepCard.test.tsx`

- [ ] **Step 1: Add failing UI tests for stale-error clearing and degraded status handling**
- [ ] **Step 2: Run targeted Vitest checks to verify failure first**
- [ ] **Step 3: Implement minimal UI state fixes**
- [ ] **Step 4: Re-run targeted Vitest checks**

### Task 3: Sync Documentation

**Files:**
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Update handoff notes to reflect real module status and remaining risks**
- [ ] **Step 2: Re-read doc for contradictions with current code**

### Task 4: Verify End To End

**Files:**
- Verify only

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `cargo test --manifest-path src-tauri/Cargo.toml`**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Report remaining risks honestly**
