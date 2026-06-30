---
description: Dual-reviewer inline-fix PRD-review loop — runs the Superpowers PRD loop then (per codex.mode) the Codex PRD loop, editing the epic PRD openspec/prds/<epic>-<slug>.md to resolve confirmed findings until each phase converges or the iteration cap is reached; Phase 2 starts only if Phase 1 converges; epic-scoped; runs no openspec validate (a PRD precedes any spec — the one divergence from /ptp:review-plan-full)
argument-hint: "[epic-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active epics' PRDs)"
---

You are running **`/ptp:review-prd-full`** — the **dual-reviewer** (Superpowers + Codex) variant of
`/ptp:review-prd`, exactly as `/ptp:review-plan-full` is to `/ptp:review-plan` and
`/ptp:review-brainstorm-full` is to `/ptp:review-brainstorm`. It audits an epic's **PRD**
(`openspec/prds/<epic>-<slug>.md`), before any proposal/spec/brainstorm artifacts for the epic plan
exist, with two independent reviewers run as **inline-fix convergence loops** — **editing the PRD** to
resolve confirmed findings until each phase converges to zero confirmed findings or the configured
iteration cap is reached — so a thin or placeholder PRD is caught *and fixed* from two angles *before*
it silently yields a thin epic plan.

This mirrors `/ptp:review-plan-full` (which loops over the plan artifacts) and
`/ptp:review-brainstorm-full` (which loops over the brainstorm) — the `-full` suffix means a
dual-reviewer inline-fix loop. It differs from `/ptp:review-plan-full` in **two** deliberate ways: it
audits the **epic PRD** (epic-scoped, not change-scoped), and it runs **no** `openspec validate` — a PRD
precedes any proposal/spec, so there is nothing to validate.

## Inputs

Epic selector (optional): $ARGUMENTS

Resolve `$ARGUMENTS` via the `ptp-prd` selector→epic projection (the additive layer over
`ptp-change-selector`): a bare id / `story:NN` projects to the change's epic; `epic:XXXX` is that epic;
`epic:all` / **omitted** = **all active epics' PRDs**. The empty-argument review-all default is
preserved. The command is **selector-only** — it takes epic selectors, never standalone file paths. If
it resolves to more than one epic, run the loop below for each, reporting per epic.

## Branch safety (first step)

Both phases apply inline edits to the PRD, so before Phase 1 run the **`ptp-branch-guard`** preamble:
check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the
resolved epic (→ `ptp/<change-id>` using the epic's lowest-numbered story id) and launch the minimal
`ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing
anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives
in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

The outer session runs only the abort-guaranteeing preconditions first — so a guaranteed abort never
spawns a subagent:

1. **Selector disambiguation that STOPs and asks.** Resolve `$ARGUMENTS` via the `ptp-prd` selector→epic
   projection. If it is ambiguous in a way that must STOP and ask the user, do that here (the subagent
   is non-interactive and cannot ask). Preserve the empty-argument review-all-active default. A
   legacy/unprefixed id that cannot project to an epic is reported unsupported and skipped (per
   `ptp-prd`).
2. **Resolve `codex.mode` per the `ptp-codex-mode` skill** and apply its decision contract — do not
   hard-require Codex here. Phase 1 (the Superpowers PRD loop) always runs regardless of mode. **Only
   `required` + `codex` missing STOPs** here (with the install-or-change-mode message). Under `auto` +
   `codex` missing or `off`, Phase 2 is skipped **inside** the subagent (not an outer STOP), and the
   skip is reported (never silent). The full resolution + decision rule lives in the `ptp-codex-mode`
   skill — do not restate it here.

The per-epic **PRD-file existence** check is part of Phase 1's rubric (a missing PRD is a Critical
finding the loop cannot fix, not an outer abort), so it runs **inside** the subagent — exactly as
`/ptp:review-prd` does. **PRD-file existence is NOT an outer abort.**

## What this command does

This entire two-phase orchestration runs **at a deterministic model** via the **`ptp-run-at-model`**
skill at `opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the selector disambiguation, and the `codex.mode` resolution per
`ptp-codex-mode` (including the `required` + `codex` missing STOP) — so a guaranteed abort never spawns a
subagent. It then invokes **`ptp-run-at-model`** with target `opus.high`, passing the already-resolved
`codex.mode` decision and the resolved epic(s) + PRD path(s), and the work being "run the
**`ptp-review-prd-full`** skill over the already-resolved scope." That spawns one foreground `opus`
subagent (high effort directive) which performs Phase 1 (the Superpowers `kind = prd` loop) → the
convergence-based Phase-1-gates-Phase-2 gate → Phase 2 (the Codex `kind = prd` loop, per the resolved
mode) → the combined terminal state + single combined marker write + report, **editing the PRD inline**,
and the subagent's outcome (including the mode-skip success state
`PHASE 1 DONE — CODEX SKIPPED (mode=…)`) is relayed back per `ptp-run-at-model`'s *Result relay* — never
downgraded to or away from its true meaning. Do **not** split the phases across multiple subagents and
do **not** add a nesting guard — every inner step is inline skill work or an external `codex exec` Bash
subprocess, neither of which spawns an Agent or a Workflow. For a multi-epic or empty-argument
review-all selector, the one subagent handles the whole per-epic pass.

Keep this command **thin**: the two phases, the rubric, the convergence-based Phase-1-gates-Phase-2
gate, the combined terminal state, the report shape, the single-combined-marker-write protocol, and the
deliberate no-`openspec validate` divergence all live in the **`ptp-review-prd-full`** skill (the
`commands/config.md` → `skills/ptp-config` split). Do not restate the skill's methodology here.

On completion the run stamps the combined `openspec/prds/reviews/<epic>-<slug>.json` review-convergence
marker once per epic (per the `ptp-review-prd-full` skill's single-combined-write protocol).

## Hard rules

- Do **not** start Phase 2 unless Phase 1 terminated with `DONE`. A Phase 1 `ITERATION CAP REACHED`
  STOPs the run — Phase 2 does not start.
- Do **not** invoke `/ptp:apply`. This loop fixes the PRD, not source code or OpenSpec artifacts.
- This command **edits the PRD** inline to resolve confirmed findings. It does **not** archive the
  change (archiving is always an explicit `/ptp:archive <change-id>`), does **not** auto-commit any
  edits, and does **not** regenerate the PRD via `/ptp:prd` (targeted hand-edits only — fill a missing
  schema section, sharpen a vague acceptance criterion, add a measurable goal).
- Do **not** run `openspec validate` — a PRD precedes any proposal/spec, so there is nothing to validate
  (the one deliberate divergence from `/ptp:review-plan-full`); per-iteration verification is
  `N/A (PRD precedes any spec)`.
- Do **not** fix any finding — especially a Codex finding — that was not independently CONFIRMED against
  the actual PRD text. Rejected findings stay as-is; their stable keys are carried over within each
  phase to prevent re-confirmation in later iterations of that phase. Phase 2 starts with fresh loop
  state — Phase 1's rejected set does not carry into Phase 2.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against
  convergence in either phase.
- Iteration cap per phase is `review.maxIterations` in ptp config; default 5. Each phase has its own
  independent cap.
- Run Codex only under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never pass
  `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`. Codex
  runs **no** commands.
- Recommend the next command in **text only** (the user runs it explicitly): `/ptp:plan <change-id>` (the
  epic's lowest-numbered story id) on either green state (`BOTH PHASES DONE` or
  `PHASE 1 DONE — CODEX SKIPPED (mode=…)`); on a cap (`ITERATION CAP REACHED` — including the missing-PRD
  Critical, author it via `/ptp:prd <epic>` first — or `PHASE 2 ITERATION CAP REACHED`), resolve the
  remaining findings then re-run `/ptp:review-prd-full <epic>`.
