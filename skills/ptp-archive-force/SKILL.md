---
name: ptp-archive-force
description: Force-archives one or more changes, bypassing the ptp archive gates (tasks-complete, review-clean, validation-passes), while still syncing delta specs. Used by /ptp:archive-force.
---

# ptp-archive-force — gate-bypassing force-archive protocol

## Purpose

This is the gate-bypass escape hatch for abandoned, superseded, or done-but-never-reviewed changes that cannot pass `/ptp:archive`'s three gates. It archives (moves to `openspec/changes/archive/` and syncs delta specs) without requiring tasks to be complete, review to be clean, or `openspec validate --strict` to pass.

**`/ptp:archive` stays the default safe path.** This skill is invoked only by `/ptp:archive-force` — an explicit escape hatch, never the default archive route.

## Inputs

This skill receives from the calling command `/ptp:archive-force`:

- **`resolved-ids`** — an ordered list of change folder names (story order) already resolved via the `ptp-change-selector` skill. Do **not** re-resolve the selector grammar here; ids arrive fully resolved.
- **`from_all`** — boolean; `true` if the command was invoked with no argument (the empty/all default), `false` for any explicit selector.

## Gate-bypass contract

For every change in `resolved-ids`, this skill:

- **Does NOT** block on unchecked `- [ ]` items in `tasks.md`.
- **Does NOT** ask for review-clean confirmation.
- **Does NOT** block on `openspec validate --strict` failure.

These gates are bypassed by design. They are still **reported** per change (see Reporting), but they never prevent archiving.

## Scope confirmation

**Only when `from_all` is `true`:**

1. Print the full resolved id list.
2. **STOP** (conversational stop) and ask the user to confirm they want to force-archive all listed changes.
3. On the user's in-conversation confirmation, proceed with that **same already-resolved list** — do **not** re-resolve the empty selector. This ensures the confirmed run cannot re-trigger the stop.

**When `from_all` is `false`** (explicit selector: `id`, `epic:XXXX`, `story:NN`, `epic:XXXX story:NN`): proceed immediately — no scope stop.

## Per-change procedure

Process each id in `resolved-ids` in the given (story) order. **Continue on error** — a failure on one change does not abort the rest; record it and proceed.

For each `<id>`:

### a. Compute the bypassed-gate report (record only — not a blocker)

1. Count unchecked items: read `openspec/changes/<id>/tasks.md` and count lines matching `- [ ]`. Record this count.
2. Capture validation errors: run `npx -y openspec validate <id> --strict` and capture any output. Record the errors. This run is **for reporting only** — a non-zero exit does not stop the archive.

### b. Archive via CLI

- Check whether `openspec/changes/<id>/specs/` contains at least one delta `<capability>/spec.md` file (search recursively — deltas always live one level down at `specs/<capability>/spec.md`, never directly in `specs/`).
  - If it does: `npx -y openspec archive <id> --yes`
  - If it does not: `npx -y openspec archive <id> --yes --skip-specs`
- On CLI success: record the archive location and whether specs were synced.

### c. Fallback on CLI rejection

If the CLI exits non-zero (rejects the change — e.g. a legacy name not starting with a letter, or a structural issue), perform a **best-effort manual move**. To guarantee the main specs are **never half-synced**, do this in two phases — **dry-run every delta before writing any**:

1. **Dry-run phase (no writes).** For every delta spec at `openspec/changes/<id>/specs/<capability>/spec.md`, check that it can be mechanically applied to `openspec/specs/<capability>/spec.md` (ADDED/MODIFIED/REMOVED/RENAMED markers parse cleanly; a pure-ADDED delta with no existing main spec would become a new canonical spec at that path). Do **not** write anything in this phase.
   - **If any delta is malformed and cannot be mechanically applied**: abort the fallback for this change **before any write**. Record it as a **per-change failure**, leave the change folder in place (do not move it) and leave all main specs untouched, and skip to the next id. Warn clearly. (Because nothing was written, no main spec is half-synced even when an earlier delta in the same change applied cleanly in the dry run.)
2. **Apply phase.** Only if every delta passed the dry-run (or there are no spec deltas): apply each delta to its `openspec/specs/<capability>/spec.md`, then move `openspec/changes/<id>` → `openspec/changes/archive/<YYYY-MM-DD>-<id>` (today's date; **fail clearly if the target already exists** — do NOT overwrite or merge into it; record this change as a per-change failure and leave the folder in place). Warn that the CLI rejected the change and the manual fallback was used.

## Reporting

### Per-change report (after each id is processed)

- Archive location (e.g. `openspec/changes/archive/2026-06-03-<id>`) or FAILED.
- Specs synced (list of capabilities) or skipped (no spec deltas) or FAILED (malformed delta).
- Bypassed gates:
  - Tasks: `N unchecked items` (or `0 — tasks complete`).
  - Validation: list of captured errors (or `passed`).

### End-of-run summary

- Total processed, succeeded, failed.
- For any failed id: the id and the reason for failure.

## Hard rules

- **Never delete** a change — archive means move to `openspec/changes/archive/`, not removal.
- **Never silently skip a real spec sync.** Use `--skip-specs` only when `openspec/changes/<id>/specs/` contains no delta `<capability>/spec.md` file (searched recursively), and report it.
- **On a malformed delta, do NOT half-sync** the main spec. The manual fallback dry-runs every delta before writing any, so a malformed delta aborts the change with all main specs untouched (even if an earlier delta in the same change applied cleanly in the dry run). Record the change as a per-change failure and leave the folder in place.
- **Always report bypassed gates** — force is never silent.
- **Scope-confirm once on empty/all** (conversational STOP), then proceed with the already-resolved list. Do not re-resolve the empty selector after confirmation.
- **`/ptp:archive` remains the default safe path.** `/ptp:archive-force` is the explicit escape hatch — it is never the default archive route.
- **Continue on error** across a batch — a per-change failure does not abort remaining changes.
