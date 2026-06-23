---
description: Loop Superpowers artifact review + inline fixes until zero open findings at all severities or iteration cap reached (reviews proposal/design/tasks/spec-deltas, not code)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running the **loop variant of `/ptp:review-plan`** — a Superpowers artifact-quality loop that alternates planning-artifact review, confirmation, and fix passes automatically until every finding at all severities (Critical, High, Medium, Low) in `proposal.md`, `design.md`, `tasks.md`, and spec deltas is resolved or the configured iteration cap (default 5) is reached. This replaces the manual alternation of `/ptp:review-plan` → `/ptp:review-fix` → `/ptp:review-plan` → … that a non-trivial set of artifact findings otherwise requires.

This is **not** a code-review loop. It reviews the *planning artifacts*, not source code. Use `/ptp:review-loop` or `/ptp:codex-review-loop` to review implemented code.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This loop applies inline artifact fixes, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first — do not fabricate a change folder.

## What this command does

The review-plan-loop work runs **at a deterministic model** via the **`ptp-run-at-model`** skill at
`opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the change-folder existence check, and selector disambiguation
that must STOP and ask the user — so a guaranteed abort never spawns a subagent. It then invokes **`ptp-run-at-model`** with target `opus.high` and the work
below; that spawns one foreground `opus` subagent (high effort directive) which runs the loop, and
its terminal state (DONE or ITERATION CAP REACHED) is relayed back per `ptp-run-at-model`'s *Result
relay* — never downgraded to success.

The subagent invokes the `ptp-review-loop` skill with:

- `kind = artifact`
- `reviewer = superpowers`
- `change-id = $ARGUMENTS`

The skill drives the full loop. For each iteration's review pass it runs the `review-plan.md` rubric inline: existence & validation, `proposal.md` completeness, cross-artifact consistency, spec-delta format, `tasks.md` quality, reasoning depth, and `TLDR.md` sanity. After confirmation, confirmed findings are fixed via minimal targeted edits and `npx -y openspec validate <change-id> --strict` is run as per-iteration verification.

**Review-convergence marker:** this is a `kind = artifact` loop, so on its terminal state it stamps `reviews/plan.json` (`terminalState` converged / cap-reached, `reviewers: ["superpowers"]`), surfaced by `/ptp:status`'s plan-review column.

## Hard rules

- Do **not** invoke `/ptp:apply`. This loop fixes artifacts, not source code; it is not a substitute for the implementation step.
- Do **not** archive the change. Archiving is always an explicit user action.
- Do **not** auto-commit any edits.
- Do **not** fix any finding that was not independently CONFIRMED during the confirmation step. Rejected findings' stable keys are carried over within this invocation to prevent re-confirmation across iterations; carry-over resets on a new `/ptp:review-plan-loop` run.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence.
- Do **not** regenerate artifacts via `/ptp:plan`. All artifact fixes are minimal targeted hand-edits — correct a thin section, add a missing scenario, map a goal to a task, fix a spec-delta format error. Re-fabrication is not permitted.
- Do **not** review source code in this command. If source code findings appear, note them as out-of-scope for this loop and do not fix them here.
- Per-iteration verification is `npx -y openspec validate <change-id> --strict`. A failing run is reported in the iteration summary but does NOT abort the loop.
- Iteration cap is configurable via `review.maxIterations` in ptp config; default 5.
