---
description: Dual-reviewer inline-fix brainstorm-review loop — runs the main-agent brainstorm loop then the reviewer-agent brainstorm loop (default roles.main=claude: Superpowers then Codex; a Codex reviewer gated per codex.mode), editing brainstorm.md to resolve confirmed findings until each phase converges or the iteration cap is reached; Phase 2 starts only if Phase 1 converges; runs no openspec validate (a brainstorm precedes any spec — the one divergence from /ptp:review-plan-full)
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active changes' brainstorms)"
---

You are running **`/ptp:review-brainstorm-full`** — the **dual-reviewer** (main agent + reviewer
agent; default Superpowers + Codex) variant of `/ptp:review-brainstorm`, exactly as
`/ptp:review-plan-full` is to `/ptp:review-plan`. Resolve `{ main, reviewer }` from `roles.main` via
the **`ptp-agent-roles`** skill; at the default `roles.main=claude` Phase 1 is the Superpowers loop
and Phase 2 is the gated Codex loop (byte-identical to before). It
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
preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from
the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash →
checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature
branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do
not restate it here.

## Preconditions

The outer session runs only the abort-guaranteeing preconditions first — so a guaranteed abort never
spawns a subagent:

1. **Selector disambiguation that STOPs and asks.** Resolve `$ARGUMENTS` per `ptp-change-selector`. If
   it is ambiguous in a way that must STOP and ask the user, do that here (the subagent is
   non-interactive and cannot ask). Preserve the empty-argument review-all-active default.
2. **Resolve `{ main, reviewer }` per `ptp-agent-roles`, then resolve the reviewer gate per the
   `ptp-codex-mode` skill** and apply its symmetric decision contract — do not
   hard-require Codex here. Phase 1 (the main agent's brainstorm loop) always runs regardless of mode.
   The reviewer phase is gated only when the reviewer is Codex: **only `required` + `codex` missing
   STOPs** here (with the install-or-change-mode message). Under
   `auto` + `codex` missing or `off`, Phase 2 is skipped **inside** the subagent (not an outer STOP),
   and the skip is reported (never silent). A Claude reviewer is never gated and always runs. The full
   resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.
3. **`openspec/changes/<change-id>/` must exist.** If it does not, **STOP** and redirect the user to run
   `/ptp:brainstorm` first (the loop requires the change folder, which `/ptp:brainstorm` creates — it
   precedes `/ptp:plan` in the stage order, so redirecting to `/ptp:plan` here would skip the brainstorm).

The per-change **brainstorm-file existence** check is part of Phase 1's rubric (a missing brainstorm is
a Critical finding the loop cannot fix, not an outer abort), so it runs **inside** the subagent — exactly
as `/ptp:review-brainstorm` does.

## What this command does

This entire two-phase orchestration runs **at a deterministic model** via the **`ptp-run-at-model`**
skill at `opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the role resolution per `ptp-agent-roles` and the reviewer-gate
resolution per `ptp-codex-mode` (including the `required` + `codex` missing STOP for a Codex reviewer),
and the change-folder existence check. It then invokes
**`ptp-run-at-model`** with target `opus.high`, passing the already-resolved role pair and reviewer-gate
decision, and
the work being "run the **`ptp-review-brainstorm-full`** skill over the already-resolved scope." That
spawns one foreground `opus` subagent (high effort directive) which performs Phase 1 (the main agent's
brainstorm loop) → the convergence-based Phase-1-gates-Phase-2 gate → Phase 2 (the reviewer agent's
brainstorm loop, gated per the reviewer gate) → the combined terminal state + report, **editing `brainstorm.md` inline**,
and the subagent's outcome (including the mode-skip success state
`PHASE 1 DONE — CODEX SKIPPED (mode=…)`) is relayed back per `ptp-run-at-model`'s *Result relay* — never
downgraded to or away from its true meaning. Do **not** split the phases across multiple subagents and
do **not** add a nesting guard — every inner step is inline skill work or an external `codex exec` Bash
subprocess, neither of which spawns an Agent or a Workflow. For a multi-change or empty-argument
review-all selector, the one subagent handles the whole per-change pass.

**Fix dispatch (both phases).** Each phase's `ptp-review-loop` invocation is additionally passed:

- Phase 1 — `fixDispatch = inline`, `runningTarget = <this command's resolved main-run target per ptp-agent-roles>`
- Phase 2 — `fixDispatch = inline`, `runningTarget = <this command's resolved main-run target per ptp-agent-roles>`

**Fix target.** The fix pass runs at a freshly evaluated fix target rather than at this command's
review target; because this whole orchestration already runs inside one `ptp-run-at-model` main run,
it passes `fixDispatch = inline` and never spawns a second run. The evaluation rule, the dispatch
modes, the fallback, and the reporting obligation live in `ptp-review-loop` — this command does not
restate them.

Keep this command **thin**: the two phases, the rubric, the convergence-based Phase-1-gates-Phase-2
gate, the combined terminal state, the report shape, and the deliberate no-`openspec validate`
divergence all live in the **`ptp-review-brainstorm-full`** skill (the `commands/config.md` →
`skills/ptp-config` split). Do not restate the skill's methodology here.

On completion the run stamps the combined `stages/brainstorm.json` review-convergence marker once (per
the `ptp-review-brainstorm-full` skill's single-combined-write protocol), surfaced by `/ptp:status`'s
brainstorm-review column.

## Hard rules

- Do **not** spawn a second `ptp-run-at-model` run for the fix pass — this command's orchestration already occupies the one Agent-nesting level.
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
- A phase converges on findings **at or above the configured severity threshold**; findings below it are
  **reported**, not fixed, and do not block convergence. The threshold, its resolution, and the
  partition rule live in `ptp-review-loop` — this command does not restate them.
- Iteration cap per phase is `review.maxIterations` in ptp config; default 5. Each phase has its own
  independent cap.
- Run Codex only under `codex exec -s read-only` with the prompt piped over **stdin** (`-`), assembled
  per the `ptp-codex-mode` flag-append rule (resolved `-m`/`-c` flags before the trailing `-` when
  configured). Never pass `--full-auto`, `--sandbox workspace-write`, or
  `--dangerously-bypass-approvals-and-sandbox`. Codex runs **no** commands.
- Recommend the next command in **text only** (the user runs it explicitly): `/ptp:plan <change-id>` on
  either green state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`); on a cap
  (`ITERATION CAP REACHED` — including the missing-brainstorm Critical, author it via
  `/ptp:brainstorm <change-id>` first — or `PHASE 2 ITERATION CAP REACHED`), resolve the remaining
  findings then re-run `/ptp:review-brainstorm-full <change-id>`.
