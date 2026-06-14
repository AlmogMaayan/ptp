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

The non-interactive force-archive work runs **at a deterministic model** via the
**`ptp-run-at-model`** skill at `sonnet.medium`. Everything that needs the outer session (selector
resolution, the branch guard, and the empty/all scope-confirmation STOP) runs **first, in the outer
session**, in this order:

1. **Resolve the selector** (outer session) to a list of change ids using the `ptp-change-selector` skill. If resolution fails (no match, ambiguous), **STOP** and surface the error without spawning — do not guess. (An abort-guaranteeing precondition: a guaranteed abort never spawns a subagent.) Set `from_all = true` iff `$ARGUMENTS` was empty.

2. **Run the `ptp-branch-guard` preamble** (outer session) per the *Branch safety* section above — the subagent cannot cut the branch, so HEAD must already be on the feature branch before the spawn.

3. **Scope-confirmation STOP** (outer session — interactive; **only when `from_all` is `true`**). Print the full resolved id list and **STOP** to ask the user to confirm they want to force-archive all listed changes. This is the `ptp-archive-force` skill's scope-confirm step, pulled into the outer session because the subagent is non-interactive and cannot service it. When `from_all` is `false` (any explicit selector), proceed immediately — no scope stop.

4. **Run the force-archive via `ptp-run-at-model` at `sonnet.medium`.** Invoke the
   **`ptp-run-at-model`** skill with target `sonnet.medium` and the work below; it spawns one
   foreground `sonnet` subagent (medium effort directive). To avoid re-triggering the scope-confirm
   STOP (which the non-interactive subagent cannot service), the subagent invokes the
   **`ptp-archive-force`** skill with the **already-resolved id list** and **`from_all = false`** — so
   the skill skips its own scope stop and does **not** re-resolve the selector. (Equivalently, the
   subagent may run the force-archive loop inline without the skill's scope-confirming entry point.)
   The subagent runs the non-interactive force-archive + the bypassed-gate reporting, and returns its
   per-change reports and end-of-run summary as the relay payload.

5. **Relay** the subagent's per-change reports and end-of-run summary to the user verbatim in
   meaning — including any per-change failures; never report a failure as success.

## Hard rules

- This command **never enforces** the ptp archive gates — that is `/ptp:archive`.
- This command **never deletes** changes — archive means move-to-`archive/` + sync specs.
- This command **always reports** the bypassed gates for each change.
- The empty/all scope-confirmation stop runs **once**, in the outer session (step 3), before the spawn; the subagent then invokes `ptp-archive-force` with `from_all = false` so the skill skips its own scope stop — never trigger the scope confirmation twice.
- Do **not** invoke `/ptp:archive` from this command.
