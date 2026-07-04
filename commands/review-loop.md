---
description: Loop Superpowers code review + inline fixes until zero open findings at all severities or iteration cap reached
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running the **loop variant of `/ptp:review`** — a Superpowers code-review loop that alternates review, confirmation, and fix passes automatically until every finding at all severities (Critical, High, Medium, Low) is resolved or the configured iteration cap (default 5) is reached. This replaces the manual alternation of `/ptp:review` → `/ptp:review-fix` → `/ptp:review` → … that a non-trivial change otherwise requires.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change. Pass the **resolved change id** — never the raw `$ARGUMENTS` selector — into `ptp-review-loop` (`ptp-change-selector` mandates the resolved id; the loop processes exactly one change per invocation).

## Branch safety (first step)

This loop applies inline code fixes, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first — do not fabricate a change folder or proceed with a missing contract.

## What this command does

The review-loop work runs **at a deterministic model** via the **`ptp-run-at-model`** skill at
`opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the change-folder existence check, and selector disambiguation
that must STOP and ask the user — so a guaranteed abort never spawns a subagent. It then invokes **`ptp-run-at-model`** with target `opus.high` and the work
below; that spawns one foreground `opus` subagent (high effort directive) which runs the loop, and
its terminal state (DONE or ITERATION CAP REACHED) is relayed back per `ptp-run-at-model`'s *Result
relay* — never downgraded to success.

The subagent invokes the `ptp-review-loop` skill with:

- `kind = code`
- `reviewer = superpowers`
- `change-id = <the resolved change id>` (the single id being processed this pass — not the raw `$ARGUMENTS` selector)

The skill drives the full loop: per-iteration Superpowers code review, manual/test-only finding filter, rejection carry-over check, confirmation via `superpowers:receiving-code-review`, inline fix pass on confirmed findings, test/lint/typecheck verification, and termination at DONE or ITERATION CAP REACHED.

**Review-convergence marker:** this is a `kind = code` loop, so it writes **NO** review-column marker (there is no code-review column in `/ptp:status`).

## Hard rules

- Do **not** invoke `/ptp:apply`. Code fixes are applied inline; the loop is never a substitute for the apply step.
- Do **not** archive the change, no matter the terminal state. Archiving is always an explicit user action (`/ptp:archive <change-id>`).
- Do **not** auto-commit any edits made during the loop.
- Do **not** fix any finding that was not independently CONFIRMED during the confirmation step. Rejected findings stay in the code; their stable keys are carried over to prevent re-confirmation in subsequent iterations within this invocation. Carry-over is scoped to this run only — starting a new `/ptp:review-loop` resets the rejected list.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence.
- Do **not** edit spec deltas or planning artifacts (`proposal.md`, `design.md`, `tasks.md`) in this command — this is a code-review loop, not an artifact-review loop. Use `/ptp:review-plan-loop` for artifact fixes.
- Iteration cap is configurable via `review.maxIterations` in ptp config; default 5.
