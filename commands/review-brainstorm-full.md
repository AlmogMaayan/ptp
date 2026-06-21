---
description: Dual-reviewer report-only brainstorm review — Superpowers then Codex per codex.mode — auditing a change's brainstorm.md and reporting each reviewer's outcome (PASS/WARN/FAIL, or a skip line for a Codex reviewer that did not run) plus a combined verdict; no inline fixing, no openspec validate, no branch guard, edits nothing
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active changes' brainstorms)"
---

You are running **`/ptp:review-brainstorm-full`** — the **dual-reviewer** (Superpowers + Codex)
variant of `/ptp:review-brainstorm`, exactly as `/ptp:review-plan-full` is to `/ptp:review-plan`. It
audits a change's **brainstorm** (`brainstorm.md`), before any proposal/spec artifacts exist, with two
independent reviewers, and reports a **combined verdict** — so a thin or hand-wavy brainstorm is caught
from two angles *before* it silently yields thin OpenSpec artifacts.

It differs from its siblings in two deliberate ways:

- Like `/ptp:review-brainstorm` (and unlike `/ptp:review-plan-full`), it audits the **brainstorm**,
  not the plan artifacts, and runs **no** `openspec validate` — a brainstorm precedes any
  proposal/spec, so there is nothing to validate.
- Unlike `/ptp:review-full` and `/ptp:review-plan-full` (which are inline-fixing convergence loops),
  it is **report-only**: it runs each reviewer **once** and reports. There is **no** inline fix loop
  and **no** iteration cap. It never hand-edits the brainstorm; the user revises by re-running
  `/ptp:brainstorm`.

## Inputs

Change id (optional): $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill. Preserve the existing
empty-argument default: omitting `$ARGUMENTS` reviews **all active changes'** brainstorms. The command
is **selector-only** — it takes change selectors, never standalone file paths.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes), like the other
read-only reviewers and `/ptp:status`. Its dual-reviewer brainstorm-audit work runs **at a
deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`.

The outer session runs only the abort-guaranteeing preconditions first — so a guaranteed abort never
spawns a subagent:

1. **Selector disambiguation that STOPs and asks.** Resolve `$ARGUMENTS` per `ptp-change-selector`. If
   it is ambiguous in a way that must STOP and ask the user, do that here (the subagent is
   non-interactive and cannot ask). Preserve the empty-argument review-all-active default.
2. **Resolve `codex.mode` per the `ptp-codex-mode` skill** and apply its decision contract — do not
   hard-require Codex here. **Only `required` + `codex` missing STOPs** here (with the
   install-or-change-mode message). Under `auto` + `codex` missing or `off`, the Codex phase is skipped
   **inside** the subagent (not an outer STOP), and the skip is reported (never silent). The full
   resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.

The per-change **brainstorm-file existence** check is part of Phase 1's rubric (a missing brainstorm
is a Critical finding, not an abort), so it runs **inside** the subagent, not as an outer abort
precondition — exactly as `/ptp:review-brainstorm` does.

The outer session then invokes **`ptp-run-at-model`** with target `opus.high`, passing the
already-resolved `codex.mode` decision, and the work being "run the **`ptp-review-brainstorm-full`**
skill over the already-resolved scope." That spawns one foreground `opus` subagent (high effort
directive) which performs Phase 1 (Superpowers) → the Phase-1-gates-Phase-2 gate → Phase 2 (Codex, per
the resolved mode) → the combined verdict + report, **editing nothing**, and the subagent's outcome
(including the mode-skip success state `PHASE 1 DONE — CODEX SKIPPED (mode=…)`) is relayed back per
`ptp-run-at-model`'s *Result relay*. The subagent runs **no** branch guard and must **not** launch
`ptp-branch-prep` (this is a read-only command — no guard ran outer, none should run inner). Do **not**
split the phases across multiple subagents and do **not** add a nesting guard — every inner step is
inline skill work or an external `codex exec` Bash subprocess, neither of which spawns an Agent or a
Workflow. For a multi-change or empty-argument review-all selector, the one subagent handles the whole
per-change pass.

Keep this command **thin**: the phases, the rubric, the Phase-1-gates-Phase-2 gate, the combined
verdict, the report shape, and the deliberate no-`openspec validate` / no-fix-loop divergences all
live in the **`ptp-review-brainstorm-full`** skill (the `commands/config.md` → `skills/ptp-config`
split). Do not restate the skill's methodology here.

## Hard rules

- This command is **read-only**. Do **not** edit any file (including the brainstorm). Do **not** run
  any git operation.
- Do **not** run `ptp-branch-guard` and do **not** launch `ptp-branch-prep` — read-only reviewers are
  exempt from the branch guard, like `/ptp:review-brainstorm`, `/ptp:review-plan`, and `/ptp:status`.
- Do **not** run `openspec validate` — a brainstorm precedes any proposal/spec, so there is nothing to
  validate (the same deliberate difference as `/ptp:review-brainstorm`, stated in the skill).
- Do **not** run any inline fix loop and do **not** hand-edit the brainstorm — this command is
  **report-only**, with **no** iteration cap (the deliberate divergence from `/ptp:review-full` /
  `/ptp:review-plan-full`). Findings are reported; the user revises by re-running `/ptp:brainstorm`.
- This gate is **advisory**, not enforced: a non-PASS combined verdict does not block `/ptp:plan`, but
  you must clearly recommend revising first.
- Do **not** invoke or trigger any other ptp command (`/ptp:plan`, `/ptp:brainstorm`,
  `/ptp:review-brainstorm`, etc.). Recommend the next command in text — `/ptp:plan <change-id>` on
  either green state (`BOTH REVIEWERS PASS` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`); re-run
  `/ptp:brainstorm <change-id>` on any non-pass — and the user runs it explicitly.
- Run Codex only under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never
  pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
  Codex runs **no** commands.
