---
description: Gate-bypassing escape hatch for archiving changes that cannot pass the standard archive gates (unchecked tasks, unreviewed, failing validation) — still syncs delta specs. Use /ptp:archive for the default safe path.
argument-hint: "id, epic:XXXX, story:NN, epic:XXXX story:NN, or empty for all active changes"
---

You are running the `/ptp:archive-force` command — the gate-bypassing counterpart to `/ptp:archive`. Your job is to **resolve the selector, then delegate to the `ptp-archive-force` skill**.

This command bypasses the three `/ptp:archive` gates (tasks-complete, review-clean, validation-passes) but **still syncs delta specs** via the OpenSpec CLI. Every force-archive reports which gates were bypassed — force is never silent. Use `/ptp:archive` for the default safe path.

## Inputs

Change selector: $ARGUMENTS

Resolve `$ARGUMENTS` via the `ptp-change-selector` skill (§2/§3 selector grammar and resolution algorithm):

- `epic:XXXX` → all active changes in epic `XXXX`, ascending by story
- `epic:XXXX story:NN` → the single change `XXXX_NN_*`
- `story:NN` → the one active change with that story (if unambiguous)
- bare id → that exact change folder
- **empty** → all active changes ordered `(epic, story)` ascending, with legacy/unprefixed ids appended

Set `from_all = true` if and only if `$ARGUMENTS` was empty.

## Branch safety (first step)

Force-archiving moves change folders and rewrites `openspec/specs/`, so before any move run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Resolve the selector** to a list of change ids using the `ptp-change-selector` skill. If resolution fails (no match, ambiguous), stop and surface the error — do not guess.

2. **Delegate to the `ptp-archive-force` skill**, passing:
   - The resolved id list (story order)
   - `from_all` (true iff `$ARGUMENTS` was empty)

3. **Surface the skill's per-change reports and end-of-run summary** to the user.

## Hard rules

- This command **never enforces** the ptp archive gates — that is `/ptp:archive`.
- This command **never deletes** changes — archive means move-to-`archive/` + sync specs.
- This command **always reports** the bypassed gates for each change.
- The scope-confirmation stop (empty/all path) is managed by the `ptp-archive-force` skill — do not add a second stop here.
- Do **not** invoke `/ptp:archive` from this command.
