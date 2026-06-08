---
description: Loop Superpowers code review + inline fixes until zero open findings at all severities or iteration cap reached
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running the **loop variant of `/ptp:review`** — a Superpowers code-review loop that alternates review, confirmation, and fix passes automatically until every finding at all severities (Critical, High, Medium, Low) is resolved or the iteration cap (5) is reached. This replaces the manual alternation of `/ptp:review` → `/ptp:review-fix` → `/ptp:review` → … that a non-trivial change otherwise requires.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This loop applies inline code fixes, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first — do not fabricate a change folder or proceed with a missing contract.

## What this command does

Invoke the `ptp-review-loop` skill with:

- `kind = code`
- `reviewer = superpowers`
- `change-id = $ARGUMENTS`

The skill drives the full loop: per-iteration Superpowers code review, manual/test-only finding filter, rejection carry-over check, confirmation via `superpowers:receiving-code-review`, inline fix pass on confirmed findings, test/lint/typecheck verification, and termination at DONE or ITERATION CAP REACHED.

## Hard rules

- Do **not** invoke `/ptp:apply`. Code fixes are applied inline; the loop is never a substitute for the apply step.
- Do **not** archive the change, no matter the terminal state. Archiving is always an explicit user action (`/ptp:archive <change-id>`).
- Do **not** auto-commit any edits made during the loop.
- Do **not** fix any finding that was not independently CONFIRMED during the confirmation step. Rejected findings stay in the code; their stable keys are carried over to prevent re-confirmation in subsequent iterations within this invocation. Carry-over is scoped to this run only — starting a new `/ptp:review-loop` resets the rejected list.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence.
- Do **not** edit spec deltas or planning artifacts (`proposal.md`, `design.md`, `tasks.md`) in this command — this is a code-review loop, not an artifact-review loop. Use `/ptp:review-plan-loop` for artifact fixes.
- Iteration cap is **5** and is not configurable.
