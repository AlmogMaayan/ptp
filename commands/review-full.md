---
description: Full dual-reviewer code-review loop — runs the main-agent loop then the reviewer-agent loop in sequence (default roles.main=claude: Superpowers then Codex); Phase 2 starts only if Phase 1 converges (a Codex reviewer per codex.mode — only required hard-requires the codex CLI; auto-missing/off runs main-only)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **`/ptp:review-full`** — a two-phase code-review loop that first runs the **main agent's** review loop to convergence, then (when the reviewer gate permits) runs the **reviewer agent's** review loop to convergence, in a single invocation. Resolve `{ main, reviewer }` from `roles.main` via the **`ptp-agent-roles`** skill; at the default `roles.main=claude` the main agent is Superpowers (Claude) and the reviewer is Codex, so this is byte-identical to "Superpowers loop then Codex loop." Both reviewers must sign off before the change is ready to archive — except when the reviewer gate skips the reviewer phase (only possible for a Codex reviewer: `auto` with `codex` absent, or `off`), in which case a converged main phase alone is a successful single-reviewer run (the skip is reported, never silent). A Claude reviewer (`roles.main=codex`) is never gated and always runs.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change. Pass the **resolved change id** — never the raw `$ARGUMENTS` selector — into every inner skill and next-command below (`ptp-change-selector` mandates the resolved id; `ptp-review-loop` processes exactly one change per invocation).

## Branch safety (first step)

Both phases apply inline code fixes, so before Phase 1 run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Check both before Phase 1 begins:

1. **Resolve `{ main, reviewer }` per `ptp-agent-roles`, then resolve the reviewer gate per the `ptp-codex-mode` skill** and apply its symmetric decision contract — do not hard-require Codex here. Phase 1 (the main agent) always runs regardless of mode. The reviewer phase is gated only when the reviewer is Codex: only `required` + `codex` missing **STOPs** (with the install-or-change-mode message); under `auto` + `codex` missing or `off`, Phase 2 is skipped and the run proceeds main-only (see Phase 2 below). A Claude reviewer is never gated and always runs. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.
2. `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first.

## What this command does

This entire two-phase orchestration runs **at a deterministic model** via the **`ptp-run-at-model`**
skill at `opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the role resolution per `ptp-agent-roles` and the reviewer-gate
resolution per `ptp-codex-mode` (including the `required` + `codex` missing STOP for a Codex
reviewer), and the change-folder existence check — so a guaranteed abort
never spawns a subagent. It then invokes **`ptp-run-at-model`** with target `opus.high`, passing the
already-resolved role pair and reviewer-gate decision, and the **whole** orchestrator below (Phase 1, the
Phase-1-gates-Phase-2 gate, Phase 2 per the resolved mode, and the combined summary) runs inside that
**single** foreground `opus` subagent (high effort directive). Do **not** split the phases across
multiple subagents and do **not** add a nesting guard — every inner step is inline skill work or an
external `codex exec` Bash subprocess, neither of which spawns an Agent or a Workflow. The subagent's
terminal state (including the mode-skip success state `PHASE 1 DONE — CODEX SKIPPED (mode=…)`) is
relayed back per `ptp-run-at-model`'s *Result relay* — never downgraded to or away from its true
meaning.

### Phase 1 — main-agent code-review loop

Phase 1 is the **main agent's** review loop (always runs). At the default `roles.main=claude` the main agent is Superpowers, so pass `reviewer = superpowers`; when `roles.main=codex` the main agent is Codex, so pass `reviewer = codex`. Invoke the `ptp-review-loop` skill with:

- `kind = code`
- `reviewer = <the main agent>` (`superpowers` by default; `codex` when `roles.main=codex`)
- `change-id = <the resolved change id>` (the single id being processed this pass — not the raw `$ARGUMENTS` selector)

The skill drives the full loop: per-iteration code review by the main agent, manual/test-only finding filter, rejection carry-over check, confirmation via `superpowers:receiving-code-review`, inline fix pass on confirmed findings, test/lint/typecheck verification, and termination at DONE or ITERATION CAP REACHED.

**Gate:** If Phase 1 terminates with `ITERATION CAP REACHED`, **STOP** here. Report the Phase 1 outcome and open findings. Do NOT start Phase 2. The user should resolve the remaining issues (e.g., via `/ptp:review-fix`) and then re-run `/ptp:review-full` or run `/ptp:review-loop` directly.

### Phase 2 — reviewer-agent code-review loop

**Reviewer gate (per `ptp-codex-mode`).** Before starting Phase 2, apply the symmetric decision contract from the `ptp-codex-mode` skill to the reviewer resolved in Preconditions. The gate applies **only when the reviewer is Codex**; a Claude reviewer is never gated and always runs. If the reviewer is Codex and the decision is to **skip** Codex (`off`, or `auto` with `codex` not on PATH), do **not** start Phase 2: terminate in the mode-skip terminal state **`PHASE 1 DONE — CODEX SKIPPED (mode=…)`** (a green-class, success terminal state) and add the `Codex phase skipped (mode=…)` line to the combined summary. (`required` + `codex` missing already STOPped in Preconditions.)

If and only if Phase 1 terminates with `DONE` **and** the gate permits the reviewer phase, invoke the `ptp-review-loop` skill with:

- `kind = code`
- `reviewer = <the reviewer agent>` (`codex` by default; `superpowers` when `roles.main=codex`)
- `change-id = <the resolved change id>` (the single id being processed this pass — not the raw `$ARGUMENTS` selector)

The skill drives the full loop. When the reviewer is Codex, each iteration's review pass runs the `codex-review.md` protocol inline: you (the caller) read the contract, capture the merge-base diff, run `npx -y openspec validate <change-id> --strict` and relevant tests, build a single closed-book prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin (assembled per the `ptp-codex-mode` flag-append rule — resolved `-m`/`-c` flags appended before the trailing `-` when `codex.model`/`codex.reasoningEffort` are configured). Findings are confirmed via `superpowers:receiving-code-review` before any fix is applied.

**Note:** Phase 2 starts with fresh loop state. The `rejected_findings` list from Phase 1 does NOT carry over into Phase 2 — the reviewer agent is an independent reviewer and its findings should be evaluated on their own merits.

### Combined summary

After both phases complete, report:

1. Phase 1 summary (per-iteration table, total fixes, rejected/carry-over set, terminal state).
2. Phase 2 summary (same) — or, if Codex was mode-skipped, the `Codex phase skipped (mode=…)` line in place of a Phase 2 table.
3. Overall verdict: BOTH PHASES DONE (both converged), PHASE 1 DONE — CODEX SKIPPED (mode=…) (Phase 1 converged, Codex intentionally skipped by `codex.mode` — a success state), or PHASE 2 ITERATION CAP REACHED (Phase 1 converged, Phase 2 did not).
4. Next command (using the **resolved `<change-id>`** for this pass, not the raw `$ARGUMENTS` selector):
   - If BOTH PHASES DONE → `/ptp:archive <change-id>` (or `/ptp:status` first).
   - If PHASE 1 DONE — CODEX SKIPPED → `/ptp:archive <change-id>` (Superpowers signed off; Codex was skipped by mode — this is a successful single-reviewer run, not a halt). To add the Codex reviewer, set `codex.mode` via `/ptp:config` (and install `codex`) then run `/ptp:codex-review-loop <change-id>`.
   - If PHASE 2 ITERATION CAP REACHED → resolve remaining Codex findings (e.g., `/ptp:review-fix`), then re-run `/ptp:review-full <change-id>` or run `/ptp:codex-review-loop <change-id>` directly.

## Hard rules

- Do **not** start Phase 2 if Phase 1 did not terminate with `DONE`.
- Do **not** invoke `/ptp:apply`. Code fixes are applied inline by each loop phase.
- Do **not** archive the change. Archiving is always an explicit user action (`/ptp:archive <change-id>`).
- Do **not** auto-commit any edits made during either phase.
- Do **not** fix any finding that was not independently CONFIRMED during the confirmation step. Rejected findings stay in the code; their stable keys are carried over within each phase to prevent re-confirmation in subsequent iterations of that phase.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence in either phase.
- A phase converges on findings **at or above the configured severity threshold**; findings below it are **reported**, not fixed, and do not block convergence. The threshold, its resolution, and the partition rule live in `ptp-review-loop` — this command does not restate them.
- Do **not** edit spec deltas or planning artifacts (`proposal.md`, `design.md`, `tasks.md`) in this command — this is a code-review loop. Use `/ptp:review-plan-full` for artifact fixes.
- Iteration cap per phase is configurable via `review.maxIterations` in ptp config; default 5. Each phase has its own independent cap.
- Run Codex under `codex exec -s read-only` with the prompt piped over **stdin** (`-`), assembled per the `ptp-codex-mode` flag-append rule (resolved `-m`/`-c` flags before the trailing `-` when configured). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- You (the caller) assemble the closed-book prompt each Codex iteration — capture the merge-base diff (via Bash), run `openspec validate` yourself (via Bash), read all relevant source files yourself (via Read), and inline everything into one self-contained prompt. Codex runs no commands — no `npx`, no network, no installs.
