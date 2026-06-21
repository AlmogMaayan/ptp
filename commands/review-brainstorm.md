---
description: Read-only brainstorm-quality gate between /ptp:brainstorm and /ptp:plan — audits a change's brainstorm.md (PASS/WARN/FAIL) before it becomes OpenSpec artifacts; delegates to the ptp-review-brainstorm skill, runs no branch guard, edits nothing
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active changes' brainstorms)"
---

You are running the **brainstorm-quality gate** of the ptp flow — an optional read-only step that
sits **between `/ptp:brainstorm` (step 1) and `/ptp:plan` (step 2)**. Your job is to audit a change's
**brainstorm** (`brainstorm.md`), before any proposal/spec artifacts exist, so a thin or hand-wavy
brainstorm is caught *before* it silently yields thin OpenSpec artifacts.

This is **not** `/ptp:review-plan`. That command audits the *artifacts* (`proposal.md` / `design.md`
/ `tasks.md` / spec deltas) after `/ptp:plan`, and runs `openspec validate`. This command audits the
*brainstorm itself*, before any artifacts exist — so there is **nothing to validate** (see the
skill).

| | reviews | when | validate? |
| --- | --- | --- | --- |
| `/ptp:review-brainstorm` (this) | the brainstorm | after brainstorm, before plan | no — nothing exists to validate |
| `/ptp:review-plan` | the plan artifacts | after plan, before apply | yes (`openspec validate --strict`) |

## Inputs

Change id (optional): $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill. Preserve the existing
empty-argument default: omitting `$ARGUMENTS` reviews **all active changes'** brainstorms. The
command is **selector-only** — it takes change selectors, never standalone file paths.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes). Its brainstorm-audit
work runs **at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer
session runs only the abort-guaranteeing preconditions first — selector disambiguation that must STOP
and ask the user — while the empty-argument review-all-active default is preserved (see *Inputs*).
The per-change **brainstorm-file existence** check is part of the rubric (a missing brainstorm is a
Critical finding, not an abort), so it runs **inside** the subagent, not as an outer abort
precondition.

The outer session then invokes **`ptp-run-at-model`** with target `opus.high` and the work being
"run the **`ptp-review-brainstorm`** skill over the already-resolved scope." That spawns one
foreground `opus` subagent (high effort directive) which performs the locate → rubric → classify →
verdict → report, **editing nothing**, and the subagent's outcome is relayed back per
`ptp-run-at-model`'s *Result relay*. The subagent runs **no** branch guard and must **not** launch
`ptp-branch-prep` (this is a read-only command — no guard ran outer, none should run inner). For a
multi-change or empty-argument review-all selector, the one subagent handles the whole per-change
pass.

The rubric, classification, verdict, report shape, the locate-the-brainstorm ordering, and the
deliberate **no-`openspec validate`** difference all live in the `ptp-review-brainstorm` skill — keep
this command thin (the `commands/config.md` → `skills/ptp-config` split). Do not restate the skill's
methodology here.

## Hard rules

- This command is **read-only**. Do **not** edit any file (including the brainstorm). Do **not** run
  any git operation.
- Do **not** run `ptp-branch-guard` and do **not** launch `ptp-branch-prep` — read-only reviewers are
  exempt from the branch guard, like `/ptp:review-plan` and `/ptp:status`.
- Do **not** run `openspec validate` — a brainstorm precedes any proposal/spec, so there is nothing
  to validate (a deliberate difference from `/ptp:review-plan`, stated in the skill).
- Do **not** fix the brainstorm here. Findings are reported; the user revises by re-running
  `/ptp:brainstorm` (the brainstorm-author step). This mirrors `/ptp:review-plan`'s "report, don't
  silently fix" rule.
- This gate is **advisory**, not enforced: a non-PASS verdict does not block `/ptp:plan`, but you
  must clearly recommend revising first.
- Do **not** invoke or trigger any other ptp command (`/ptp:plan`, `/ptp:brainstorm`, etc.).
  Recommend the next command in text — PASS → `/ptp:plan <change-id>`; WARN/FAIL → re-run
  `/ptp:brainstorm` — and the user runs it explicitly.
