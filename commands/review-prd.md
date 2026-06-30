---
description: Read-only PRD-quality gate before /ptp:plan — audits an epic's PRD (openspec/prds/<epic>-<slug>.md) for PASS/WARN/FAIL before it feeds the epic plan; delegates to the ptp-review-prd skill, runs no branch guard, runs no openspec validate, edits nothing
argument-hint: "[epic-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active epics' PRDs)"
---

You are running the **PRD-quality gate** of the ptp flow — an optional read-only step that audits an
epic's **PRD** (`openspec/prds/<epic>-<slug>.md`, authored by `/ptp:prd`), before any
proposal/spec/brainstorm artifacts for the plan exist, so a thin or placeholder PRD is caught *before*
it silently yields a thin epic plan.

This is the PRD-stage analogue of `/ptp:review-brainstorm`. It is **not** `/ptp:review-plan`: that
command audits the *artifacts* (`proposal.md` / `design.md` / `tasks.md` / spec deltas) after
`/ptp:plan` and runs `openspec validate`. This command audits the *PRD itself*, which precedes any
proposal/spec — so there is **nothing to validate** (see the skill).

| | reviews | scope | validate? |
| --- | --- | --- | --- |
| `/ptp:review-prd` (this) | the epic PRD | epic-scoped | no — a PRD precedes any proposal/spec |
| `/ptp:review-brainstorm` | the brainstorm | change-scoped | no — nothing exists to validate |
| `/ptp:review-plan` | the plan artifacts | change-scoped | yes (`openspec validate --strict`) |

## Inputs

Epic selector (optional): $ARGUMENTS

Resolve `$ARGUMENTS` via the `ptp-prd` selector→epic projection (the additive layer over
`ptp-change-selector`): a bare id / `story:NN` projects to the change's epic; `epic:XXXX` is that epic;
`epic:all` / **omitted** = **all active epics' PRDs**. The empty-argument review-all default is
preserved. The command is **selector-only** — it takes epic selectors, never standalone file paths.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes). Its PRD-audit work runs
**at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer session
runs only the abort-guaranteeing precondition first — selector disambiguation that must STOP and ask
the user — while the empty-argument review-all-active-epics default is preserved (see *Inputs*). The
per-epic **PRD-file existence** check is part of the rubric (a missing PRD is a Critical finding, not
an abort), so it runs **inside** the subagent, not as an outer abort precondition.

The outer session then invokes **`ptp-run-at-model`** with target `opus.high` and the work being "run
the **`ptp-review-prd`** skill over the already-resolved scope." That spawns one foreground `opus`
subagent (high effort directive) which performs the locate → rubric → classify → verdict → report,
**editing nothing**, and the subagent's outcome is relayed back per `ptp-run-at-model`'s *Result
relay*. The subagent runs **no** branch guard and must **not** launch `ptp-branch-prep` (this is a
read-only command — no guard ran outer, none should run inner). For a multi-epic or empty-argument
review-all selector, the one subagent handles the whole per-epic pass.

The selector→epic projection, the `<slug>`-from-lowest-story rule, the rubric, classification, verdict,
report shape, and the deliberate **no-`openspec validate`** difference all live in the `ptp-review-prd`
skill — keep this command thin (the `commands/config.md` → `skills/ptp-config` split). Do not restate
the skill's methodology here.

## Hard rules

- This command is **read-only**. Do **not** edit any file (including the PRD). Do **not** run any git
  operation.
- Do **not** run `ptp-branch-guard` and do **not** launch `ptp-branch-prep` — read-only reviewers are
  exempt from the branch guard, like `/ptp:review-plan`, `/ptp:review-brainstorm`, and `/ptp:status`.
- Do **not** run `openspec validate` — a PRD precedes any proposal/spec, so there is nothing to
  validate (a deliberate difference from `/ptp:review-plan`, stated in the skill).
- Do **not** fix the PRD here. Findings are reported; the user revises by re-running `/ptp:prd <epic>`
  (the PRD-author step). This mirrors `/ptp:review-plan`'s "report, don't silently fix" rule.
- This gate is **advisory**, not enforced: a non-PASS verdict does not block `/ptp:plan`, but you must
  clearly recommend revising first.
- Do **not** invoke or trigger any other ptp command (`/ptp:plan`, `/ptp:prd`, etc.). Recommend the
  next command in text — PASS → `/ptp:plan <change-id>`; a FAIL from a missing PRD → `/ptp:prd <epic>`
  first; WARN/FAIL otherwise → re-run `/ptp:prd <epic>` — and the user runs it explicitly.
