---
description: Archive a completed, reviewed OpenSpec change — syncs delta specs into main specs via the OpenSpec CLI
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **step 5** (the final step) of the ptp flow. The change has been implemented and reviewed. Your job is to **enforce the ptp archive gates, then archive the change via the OpenSpec CLI** (which also syncs the delta specs into the main specs).

Archiving uses the native `openspec` CLI, not opsx — consistent with every other ptp command, and `openspec archive` already does "move to archive + update main specs + validate" in one step. There is no cross-plugin dependency.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change (e.g. `epic:XXXX`), archive each in story order, each through the existing per-change archive gates below. Preserve the existing empty-argument default: omitting `$ARGUMENTS` falls back to the `openspec list` disambiguation.

## Branch safety (first step)

Archiving moves the change folder and rewrites `openspec/specs/`, so before any move run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

The archive work runs **at a deterministic model** via the **`ptp-run-at-model`** skill at
`sonnet.medium` — but only the **non-interactive, already-confirmed** archive operation runs inside
that subagent. Everything that needs the outer session (id resolution, the branch guard, the gate
*inspection* that builds the confirmation, and the two interactive confirmations) runs **first, in
the outer session**, in this exact order:

1. **Resolve the change id** (outer session). The branch guard and the spawn both need the resolved
   id, so resolve it first:
   - If `$ARGUMENTS` is empty, run `npx -y openspec list` and, if it is ambiguous, ask the user which change to archive. **Never** guess or auto-select. (This is an abort-guaranteeing precondition — a guaranteed abort must never spawn a subagent.)

2. **Run the `ptp-branch-guard` preamble** (outer session) per the *Branch safety* section above —
   the subagent cannot cut the branch (it cannot launch the `ptp-branch-prep` Workflow), so HEAD must
   already be on the feature branch before the spawn.

3. **Inspect the ptp archive gates** (outer session — *inspection only*, to build the confirmation
   payload; the gates are **re-enforced as hard refusals inside the subagent**, step 6):
   - **Tasks complete** — read `openspec/changes/<change-id>/tasks.md`. If any `- [ ]` remain, **STOP**, list them, and refuse — without spawning. (ptp hard prohibition: never archive with unchecked tasks.)
   - **Validation passes** — run `npx -y openspec validate <change-id> --strict`. If it fails, **STOP** and surface the error without spawning; do not archive a failing change.
   - **Spec-delta path** — determine whether `openspec/changes/<change-id>/specs/` contains at least one delta `<capability>/spec.md` (so the confirmation can state whether the archive will use `--skip-specs`).

4. **Review-clean confirmation** (outer session — interactive). `/ptp:review <change-id>` must have been run with no unresolved **Critical** or **High** findings. OpenSpec does not track review state, so **ask the user to confirm** review is done and Critical/High are resolved before continuing. If they haven't reviewed, redirect them to `/ptp:review <change-id>` first. This confirmation must happen in the outer session — the subagent is non-interactive and cannot ask the user.

5. **Confirm the action** (outer session — interactive) — show the user exactly what will happen (which change moves to `openspec/changes/archive/`, that delta specs under `specs/` will be merged into `openspec/specs/`, and whether `--skip-specs` will be used per the step-3 inspection). Proceed once confirmed (the user invoking this command counts as intent, but show the summary first).

6. **Run the already-confirmed archive operation via `ptp-run-at-model` at `sonnet.medium`.** Invoke
   the **`ptp-run-at-model`** skill with target `sonnet.medium` and the work below; it spawns one
   foreground `sonnet` subagent (medium effort directive) that performs **only the non-interactive
   archive operation** and **re-enforces the gates as hard refusals** (any refusal relays back per
   `ptp-run-at-model`'s *Result relay*):
   - **Re-enforce tasks-complete and validation as hard refusals** — if `tasks.md` still has any `- [ ]`, or `npx -y openspec validate <change-id> --strict` fails, **refuse** (return a `refused` terminal state) and do not archive.
   - **Archive via the CLI**: `npx -y openspec archive <change-id> --yes` — this moves the change to `openspec/changes/archive/` **and** updates the main specs from the delta specs, then validates. For changes with no spec deltas (per the step-3 inspection), add `--skip-specs`.
   - **Fallback if the CLI rejects the change** (e.g. an older change folder whose name does not start with a letter, which the CLI refuses): perform the archive manually, preserving the CLI's semantics — sync each delta spec in `openspec/changes/<change-id>/specs/<capability>/spec.md` into `openspec/specs/<capability>/spec.md` (apply ADDED/MODIFIED/REMOVED/RENAMED; a pure-ADDED delta with no existing main spec becomes a new canonical spec); then move `openspec/changes/<change-id>` → `openspec/changes/archive/<YYYY-MM-DD>-<change-id>` (using today's date; fail clearly if the target already exists).
   - **Report** — change id, archive location, whether specs were synced (or skipped), and any gate warnings.

7. **Relay** the subagent's result to the user verbatim in meaning — the success report, or a gate
   refusal — never reporting a refusal as success. The flow is then complete.

If `$ARGUMENTS` resolved to more than one change, repeat steps 1–7 per change in story order — one
sequential `ptp-run-at-model` invocation (one blocking subagent) per change, never a parallel
fan-out (the branch guard is a no-op after the first cut).

## Hard rules

- **Never** archive a change with unchecked tasks or unresolved Critical/High review findings. Refuse and redirect.
- **Never** silently skip the spec sync. Use `--skip-specs` only for changes that genuinely have no spec deltas, and say so in the report.
- Do **not** edit the spec deltas to make validation pass — if validation fails, bounce back to `/ptp:plan`.
- Prefer the `openspec` CLI; only fall back to a manual move when the CLI cannot handle the change name.
