---
description: Loop Superpowers artifact review + inline fixes until zero open findings at all severities or iteration cap reached (reviews proposal/design/tasks/spec-deltas, not code)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running the **loop variant of `/ptp:review-plan`** — a Superpowers artifact-quality loop that alternates planning-artifact review, confirmation, and fix passes automatically until every finding at all severities (Critical, High, Medium, Low) in `proposal.md`, `design.md`, `tasks.md`, and spec deltas is resolved or the iteration cap (5) is reached. This replaces the manual alternation of `/ptp:review-plan` → `/ptp:review-fix` → `/ptp:review-plan` → … that a non-trivial set of artifact findings otherwise requires.

This is **not** a code-review loop. It reviews the *planning artifacts*, not source code. Use `/ptp:review-loop` or `/ptp:codex-review-loop` to review implemented code.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This loop applies inline artifact fixes, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first — do not fabricate a change folder.

## What this command does

Invoke the `ptp-review-loop` skill with:

- `kind = artifact`
- `reviewer = superpowers`
- `change-id = $ARGUMENTS`

The skill drives the full loop. For each iteration's review pass it runs the `review-plan.md` rubric inline: existence & validation, `proposal.md` completeness, cross-artifact consistency, spec-delta format, `tasks.md` quality, reasoning depth, and `TLDR.md` sanity. After confirmation, confirmed findings are fixed via minimal targeted edits and `npx -y openspec validate <change-id> --strict` is run as per-iteration verification.

## Hard rules

- Do **not** invoke `/ptp:apply`. This loop fixes artifacts, not source code; it is not a substitute for the implementation step.
- Do **not** archive the change. Archiving is always an explicit user action.
- Do **not** auto-commit any edits.
- Do **not** fix any finding that was not independently CONFIRMED during the confirmation step. Rejected findings' stable keys are carried over within this invocation to prevent re-confirmation across iterations; carry-over resets on a new `/ptp:review-plan-loop` run.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence.
- Do **not** regenerate artifacts via `/ptp:plan`. All artifact fixes are minimal targeted hand-edits — correct a thin section, add a missing scenario, map a goal to a task, fix a spec-delta format error. Re-fabrication is not permitted.
- Do **not** review source code in this command. If source code findings appear, note them as out-of-scope for this loop and do not fix them here.
- Per-iteration verification is `npx -y openspec validate <change-id> --strict`. A failing run is reported in the iteration summary but does NOT abort the loop.
- Iteration cap is **5** and is not configurable.
