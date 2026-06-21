---
description: Dual-reviewer inline-fix brainstorm-review loop — runs the Superpowers brainstorm loop then (per codex.mode) the Codex brainstorm loop, editing brainstorm.md to resolve confirmed findings until each phase converges or the iteration cap is reached; Phase 2 starts only if Phase 1 converges; runs no openspec validate (a brainstorm precedes any spec — the one divergence from /ptp:review-plan-full)
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active changes' brainstorms)"
---

You are running **`/ptp:review-brainstorm-full`** — the **dual-reviewer** (Superpowers + Codex)
variant of `/ptp:review-brainstorm`, exactly as `/ptp:review-plan-full` is to `/ptp:review-plan`. It
audits a change's **brainstorm** (`brainstorm.md`), before any proposal/spec artifacts exist, with two
independent reviewers run as **inline-fix convergence loops** — **editing `brainstorm.md`** to resolve
confirmed findings until each phase converges to zero confirmed findings or the configured iteration
cap is reached — so a thin or hand-wavy brainstorm is caught *and fixed* from two angles *before* it
silently yields thin OpenSpec artifacts.

This mirrors `/ptp:review-plan-full` (which loops over the plan artifacts) and `/ptp:review-full`
(which loops over code) — the `-full` suffix means a dual-reviewer inline-fix loop at every pipeline
stage. It differs from `/ptp:review-plan-full` in **one** deliberate way: it audits the **brainstorm**,
not the plan artifacts, and runs **no** `openspec validate` — a brainstorm precedes any proposal/spec,
so there is nothing to validate.

## Inputs

Change id (optional): $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill. Preserve the existing
empty-argument default: omitting `$ARGUMENTS` reviews **all active changes'** brainstorms. The command
is **selector-only** — it takes change selectors, never standalone file paths. If it resolves to more
than one change, run the loop below for each, in story order, reporting per change.

## Branch safety (first step)

Both phases apply inline edits to `brainstorm.md`, so before Phase 1 run the **`ptp-branch-guard`**
preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from
the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash →
checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature
branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do
not restate it here.

## Preconditions

The outer session runs only the abort-guaranteeing preconditions first — so a guaranteed abort never
spawns a subagent:

1. **Selector disambiguation that STOPs and asks.** Resolve `$ARGUMENTS` per `ptp-change-selector`. If
   it is ambiguous in a way that must STOP and ask the user, do that here (the subagent is
   non-interactive and cannot ask). Preserve the empty-argument review-all-active default.
2. **Resolve `codex.mode` per the `ptp-codex-mode` skill** and apply its decision contract — do not
   hard-require Codex here. Phase 1 (the Superpowers brainstorm loop) always runs regardless of mode.
   **Only `required` + `codex` missing STOPs** here (with the install-or-change-mode message). Under
   `auto` + `codex` missing or `off`, Phase 2 is skipped **inside** the subagent (not an outer STOP),
   and the skip is reported (never silent). The full resolution + decision rule lives in the
   `ptp-codex-mode` skill — do not restate it here.
3. **`openspec/changes/<change-id>/` must exist.** If it does not, **STOP** and redirect the user to run
   `/ptp:plan` first (the loop requires the change folder).

The per-change **brainstorm-file existence** check is part of Phase 1's rubric (a missing brainstorm is
a Critical finding the loop cannot fix, not an outer abort), so it runs **inside** the subagent — exactly
as `/ptp:review-brainstorm` does.

## What this command does

This entire two-phase orchestration runs **at a deterministic model** via the **`ptp-run-at-model`**
skill at `opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the `codex.mode` resolution per `ptp-codex-mode` (including the
`required` + `codex` missing STOP), and the change-folder existence check. It then invokes
**`ptp-run-at-model`** with target `opus.high`, passing the already-resolved `codex.mode` decision, and
the work being "run the **`ptp-review-brainstorm-full`** skill over the already-resolved scope." That
spawns one foreground `opus` subagent (high effort directive) which performs Phase 1 (the Superpowers
brainstorm loop) → the convergence-based Phase-1-gates-Phase-2 gate → Phase 2 (the Codex brainstorm
loop, per the resolved mode) → the combined terminal state + report, **editing `brainstorm.md` inline**,
and the subagent's outcome (including the mode-skip success state
`PHASE 1 DONE — CODEX SKIPPED (mode=…)`) is relayed back per `ptp-run-at-model`'s *Result relay* — never
downgraded to or away from its true meaning. Do **not** split the phases across multiple subagents and
do **not** add a nesting guard — every inner step is inline skill work or an external `codex exec` Bash
subprocess, neither of which spawns an Agent or a Workflow. For a multi-change or empty-argument
review-all selector, the one subagent handles the whole per-change pass.

Keep this command **thin**: the two phases, the rubric, the convergence-based Phase-1-gates-Phase-2
gate, the combined terminal state, the report shape, and the deliberate no-`openspec validate`
divergence all live in the **`ptp-review-brainstorm-full`** skill (the `commands/config.md` →
`skills/ptp-config` split). Do not restate the skill's methodology here.

## Hard rules

- Do **not** start Phase 2 unless Phase 1 terminated with `DONE`. A Phase 1 `ITERATION CAP REACHED`
  STOPs the run — Phase 2 does not start.
- This command **edits `brainstorm.md`** inline to resolve confirmed findings. It does **not** archive
  the change (archiving is always an explicit `/ptp:archive <change-id>`), does **not** auto-commit any
  edits, and does **not** regenerate the brainstorm via `/ptp:brainstorm` (targeted hand-edits only —
  add a missing option, expand a thin tradeoff, document an assumption).
- Do **not** run `openspec validate` — a brainstorm precedes any proposal/spec, so there is nothing to
  validate (the one deliberate divergence from `/ptp:review-plan-full`).
- Do **not** fix any finding — especially a Codex finding — that was not independently CONFIRMED against
  the actual brainstorm text. Rejected findings stay as-is; their stable keys are carried over within
  each phase to prevent re-confirmation in later iterations of that phase. Phase 2 starts with fresh
  loop state — Phase 1's rejected set does not carry into Phase 2.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against
  convergence in either phase.
- Iteration cap per phase is `review.maxIterations` in ptp config; default 5. Each phase has its own
  independent cap.
- Run Codex only under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never pass
  `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`. Codex
  runs **no** commands.
- Recommend the next command in **text only** (the user runs it explicitly): `/ptp:plan <change-id>` on
  either green state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`); on a cap
  (`ITERATION CAP REACHED` — including the missing-brainstorm Critical, author it via
  `/ptp:brainstorm <change-id>` first — or `PHASE 2 ITERATION CAP REACHED`), resolve the remaining
  findings then re-run `/ptp:review-brainstorm-full <change-id>`.
