---
description: Full dual-reviewer code-review loop — runs Superpowers loop then Codex loop in sequence; Phase 2 starts only if Phase 1 converges (requires codex CLI on PATH)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **`/ptp:review-full`** — a two-phase code-review loop that first runs the Superpowers review loop to convergence, then runs the Codex review loop to convergence, in a single invocation. Both reviewers must sign off before the change is ready to archive.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

Both phases apply inline code fixes, so before Phase 1 run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Check both before Phase 1 begins:

1. The `codex` CLI must be on PATH. Run `codex --version` to check. If missing, **STOP** and tell the user to install it — do **not** fall back to Superpowers-only and do **not** start Phase 1.
2. `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first.

## What this command does

### Phase 1 — Superpowers code-review loop

Invoke the `ptp-review-loop` skill with:

- `kind = code`
- `reviewer = superpowers`
- `change-id = $ARGUMENTS`

The skill drives the full loop: per-iteration Superpowers code review, manual/test-only finding filter, rejection carry-over check, confirmation via `superpowers:receiving-code-review`, inline fix pass on confirmed findings, test/lint/typecheck verification, and termination at DONE or ITERATION CAP REACHED.

**Gate:** If Phase 1 terminates with `ITERATION CAP REACHED`, **STOP** here. Report the Phase 1 outcome and open findings. Do NOT start Phase 2. The user should resolve the remaining issues (e.g., via `/ptp:review-fix`) and then re-run `/ptp:review-full` or run `/ptp:review-loop` directly.

### Phase 2 — Codex code-review loop

If and only if Phase 1 terminates with `DONE`, invoke the `ptp-review-loop` skill with:

- `kind = code`
- `reviewer = codex`
- `change-id = $ARGUMENTS`

The skill drives the full loop. For each iteration's review pass it runs the `codex-review.md` protocol inline: you (the caller) read the contract, capture the merge-base diff, run `npx -y openspec validate <change-id> --strict` and relevant tests, build a single closed-book prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin. Findings are confirmed via `superpowers:receiving-code-review` before any fix is applied.

**Note:** Phase 2 starts with fresh loop state. The `rejected_findings` list from Phase 1 does NOT carry over into Phase 2 — Codex is an independent reviewer and its findings should be evaluated on their own merits.

### Combined summary

After both phases complete, report:

1. Phase 1 summary (per-iteration table, total fixes, rejected/carry-over set, terminal state).
2. Phase 2 summary (same).
3. Overall verdict: BOTH PHASES DONE (both converged) or PHASE 2 ITERATION CAP REACHED (Phase 1 converged, Phase 2 did not).
4. Next command:
   - If BOTH PHASES DONE → `/ptp:archive $ARGUMENTS` (or `/ptp:status` first).
   - If PHASE 2 ITERATION CAP REACHED → resolve remaining Codex findings (e.g., `/ptp:review-fix`), then re-run `/ptp:review-full $ARGUMENTS` or run `/ptp:codex-review-loop $ARGUMENTS` directly.

## Hard rules

- Do **not** start Phase 2 if Phase 1 did not terminate with `DONE`.
- Do **not** invoke `/ptp:apply`. Code fixes are applied inline by each loop phase.
- Do **not** archive the change. Archiving is always an explicit user action (`/ptp:archive <change-id>`).
- Do **not** auto-commit any edits made during either phase.
- Do **not** fix any finding that was not independently CONFIRMED during the confirmation step. Rejected findings stay in the code; their stable keys are carried over within each phase to prevent re-confirmation in subsequent iterations of that phase.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence in either phase.
- Do **not** edit spec deltas or planning artifacts (`proposal.md`, `design.md`, `tasks.md`) in this command — this is a code-review loop. Use `/ptp:review-plan-full` for artifact fixes.
- Iteration cap per phase is **5** and is not configurable. Each phase has its own independent cap.
- Run Codex under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- You (the caller) assemble the closed-book prompt each Codex iteration — capture the merge-base diff (via Bash), run `openspec validate` yourself (via Bash), read all relevant source files yourself (via Read), and inline everything into one self-contained prompt. Codex runs no commands — no `npx`, no network, no installs.
