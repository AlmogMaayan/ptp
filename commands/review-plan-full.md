---
description: Full dual-reviewer artifact-review loop — runs Superpowers artifact loop then Codex artifact loop in sequence; Phase 2 starts only if Phase 1 converges (reviews proposal/design/tasks/spec-deltas, not code; Codex per codex.mode — only required hard-requires the codex CLI; auto-missing/off runs Superpowers-only)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **`/ptp:review-plan-full`** — a two-phase artifact-review loop that first runs the Superpowers artifact-quality loop to convergence, then (when `codex.mode` permits) runs the Codex artifact-quality loop to convergence, in a single invocation. Both reviewers must sign off on the planning artifacts before the change proceeds to implementation — except when `codex.mode` skips the Codex phase (`auto` with `codex` absent, or `off`), in which case a converged Superpowers phase alone is a successful single-reviewer run (the skip is reported, never silent).

This is **not** a code-review loop. It reviews the *planning artifacts* (`proposal.md`, `design.md`, `tasks.md`, and spec deltas), not source code. Use `/ptp:review-full` or `/ptp:codex-review-loop` to review implemented code.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

Both phases apply inline artifact fixes, so before Phase 1 run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Check both before Phase 1 begins:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** and apply its decision contract — do not hard-require Codex here. Phase 1 (the Superpowers artifact loop) always runs regardless of mode. Only `required` + `codex` missing **STOPs** (with the install-or-change-mode message); under `auto` + `codex` missing or `off`, Phase 2 is skipped and the run proceeds Superpowers-only (see Phase 2 below). The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.
2. `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first.

## What this command does

### Phase 1 — Superpowers artifact-review loop

Invoke the `ptp-review-loop` skill with:

- `kind = artifact`
- `reviewer = superpowers`
- `change-id = $ARGUMENTS`

The skill drives the full loop. For each iteration's review pass it runs the `review-plan.md` rubric inline: existence & validation, `proposal.md` completeness, cross-artifact consistency, spec-delta format, `tasks.md` quality, reasoning depth, and `TLDR.md` sanity. After confirmation, confirmed findings are fixed via minimal targeted edits and `npx -y openspec validate <change-id> --strict` is run as per-iteration verification.

**Gate:** If Phase 1 terminates with `ITERATION CAP REACHED`, **STOP** here. Report the Phase 1 outcome and open findings. Do NOT start Phase 2. The user should resolve the remaining artifact issues (e.g., by returning to `/ptp:plan`) and then re-run `/ptp:review-plan-full` or run `/ptp:review-plan-loop` directly.

### Phase 2 — Codex artifact-review loop

**Mode gate (per `ptp-codex-mode`).** Before starting Phase 2, apply the decision contract from the `ptp-codex-mode` skill to the mode resolved in Preconditions. If the decision is to **skip** Codex (`off`, or `auto` with `codex` not on PATH), do **not** start Phase 2: terminate in the mode-skip terminal state **`PHASE 1 DONE — CODEX SKIPPED (mode=…)`** (a green-class, success terminal state) and add the `Codex phase skipped (mode=…)` line to the combined summary. (`required` + `codex` missing already STOPped in Preconditions.)

If and only if Phase 1 terminates with `DONE` **and** the decision permits Codex, invoke the `ptp-review-loop` skill with:

- `kind = artifact`
- `reviewer = codex`
- `change-id = $ARGUMENTS`

The skill drives the full loop. For each iteration's review pass it runs the `codex-review-plan.md` closed-book protocol inline: you (the caller) read all artifacts, run `npx -y openspec validate <change-id> --strict`, collect cited source excerpts, build a single self-contained prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin. Findings are confirmed via `superpowers:receiving-code-review` before any artifact is touched.

**Note:** Phase 2 starts with fresh loop state. The `rejected_findings` list from Phase 1 does NOT carry over into Phase 2 — Codex is an independent reviewer and its findings should be evaluated on their own merits.

### Combined summary

After both phases complete, report:

1. Phase 1 summary (per-iteration table, total fixes, rejected/carry-over set, terminal state).
2. Phase 2 summary (same) — or, if Codex was mode-skipped, the `Codex phase skipped (mode=…)` line in place of a Phase 2 table.
3. Overall verdict: BOTH PHASES DONE (both converged), PHASE 1 DONE — CODEX SKIPPED (mode=…) (Phase 1 converged, Codex intentionally skipped by `codex.mode` — a success state), or PHASE 2 ITERATION CAP REACHED (Phase 1 converged, Phase 2 did not).
4. Next command:
   - If BOTH PHASES DONE → `/ptp:apply $ARGUMENTS` (or `/ptp:review-full $ARGUMENTS` if implementation is already complete).
   - If PHASE 1 DONE — CODEX SKIPPED → `/ptp:apply $ARGUMENTS` (Superpowers signed off on the artifacts; Codex was skipped by mode — a successful single-reviewer run, not a halt). To add the Codex artifact reviewer, set `codex.mode` via `/ptp:config` (and install `codex`) then run `/ptp:codex-review-plan-loop $ARGUMENTS`.
   - If PHASE 2 ITERATION CAP REACHED → resolve remaining Codex artifact findings (e.g., `/ptp:review-fix`), then re-run `/ptp:review-plan-full $ARGUMENTS` or run `/ptp:codex-review-plan-loop $ARGUMENTS` directly.

## Hard rules

- Do **not** start Phase 2 if Phase 1 did not terminate with `DONE`.
- Do **not** invoke `/ptp:apply`. This loop fixes artifacts, not source code; it is not a substitute for the implementation step.
- Do **not** archive the change. Archiving is always an explicit user action (`/ptp:archive <change-id>`).
- Do **not** auto-commit any edits made during either phase.
- Do **not** fix any finding — especially a Codex finding — that was not independently CONFIRMED against the actual artifact text. Rejected findings stay in the artifacts; their stable keys are carried over within each phase to prevent re-confirmation in subsequent iterations of that phase.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence in either phase.
- Do **not** review source code in this command. If findings about source code appear, note them as out-of-scope and do not fix them here. Use `/ptp:review-full` for code.
- Do **not** regenerate artifacts via `/ptp:plan`. All artifact fixes are minimal targeted hand-edits only — correct a thin section, add a missing scenario, fill a spec-delta gap.
- Per-iteration verification is `npx -y openspec validate <change-id> --strict`. A failing run is reported in the iteration summary but does NOT abort the loop.
- Iteration cap per phase is **5** and is not configurable. Each phase has its own independent cap.
- Run Codex under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- You (the caller) assemble the closed-book prompt each Codex iteration — read all artifacts yourself (via Read), run `openspec validate` yourself (via Bash), collect cited source excerpts yourself (via Read/Grep), and inline everything into one prompt. Codex runs **no** commands — no `npx`, no network, no installs.
