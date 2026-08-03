---
description: Loop Codex artifact review + inline fixes until zero open findings at or above the configured `review.minSeverity` floor (default `low` = every severity) or configured iteration cap reached (default 5; reviews proposal/design/tasks/spec-deltas, not code; requires codex CLI on PATH)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running the **Codex-powered loop variant of `/ptp:codex-review-plan`** — an external Codex CLI artifact-quality loop that alternates closed-book planning-artifact review, confirmation, and fix passes automatically until every finding at or above the configured `review.minSeverity` floor (default `low` — Critical, High, Medium, Low) in `proposal.md`, `design.md`, `tasks.md`, and spec deltas is resolved or the configured iteration cap (default 5) is reached. Findings below the floor are reported but never auto-fixed.

This is **not** a code-review loop. It reviews the *planning artifacts*, not source code. Use `/ptp:codex-review-loop` to review implemented code.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This loop applies inline artifact fixes, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- The `codex` CLI must be on PATH. Run `codex --version` to check. If missing, **STOP** and tell the user to install it — do **not** silently fall back to a different reviewer.
- `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first — do not fabricate a change folder.

## What this command does

The codex-review-plan-loop work runs **at a deterministic model** via the **`ptp-run-at-model`**
skill at `opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the `codex --version` presence check (STOP if missing), the
change-folder existence check, and selector disambiguation that must STOP and ask the user — so a
guaranteed abort never spawns a subagent. It then invokes
**`ptp-run-at-model`** with target `opus.high` and the work below; that spawns one foreground `opus`
subagent (high effort directive) which runs the loop (the Claude-side closed-book prompt
construction, confirmation, and relay; the external `codex exec` remains a Bash subprocess governed
by its own CLI config), and its terminal state (DONE or ITERATION CAP REACHED) is relayed back per
`ptp-run-at-model`'s *Result relay* — never downgraded to success.

The subagent invokes the `ptp-review-loop` skill with:

- `kind = artifact`
- `reviewer = codex`
- `change-id = $ARGUMENTS`
- `fixDispatch = inline`
- `runningTarget = <this command's resolved main-run target per ptp-agent-roles>`

**Fix target.** The fix pass runs at a freshly evaluated fix target rather than at this command's
review target; because this whole orchestration already runs inside one `ptp-run-at-model` main run,
it passes `fixDispatch = inline` and never spawns a second run. The evaluation rule, the dispatch
modes, the fallback, and the reporting obligation live in `ptp-review-loop` — this command does not
restate them.

The skill drives the full loop. For each iteration's review pass it runs the `codex-review-plan.md` closed-book protocol inline: you (the caller) read all artifacts, run `npx -y openspec validate <change-id> --strict`, collect cited source excerpts, build a single self-contained prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin. Findings are confirmed via `superpowers:receiving-code-review` before any artifact is touched.

**Review-convergence marker:** this is a `kind = artifact` loop, so on its terminal state it stamps `reviews/plan.json` (`terminalState` converged / cap-reached, `reviewers: ["codex"]`), surfaced by `/ptp:status`'s plan-review column.

## Hard rules

- Do **not** spawn a second `ptp-run-at-model` run for the fix pass — this command's orchestration already occupies the one Agent-nesting level.
- Do **not** invoke `/ptp:apply`. This loop fixes artifacts, not source code.
- Do **not** archive the change. Archiving is always an explicit user action.
- Do **not** auto-commit any edits.
- Do **not** fix any finding — especially a Codex finding — that was not independently CONFIRMED against the actual artifact text. Codex can be wrong; confirmation is mandatory. Rejected findings' stable keys are carried over within this invocation to prevent re-confirmation across iterations; carry-over resets on a new `/ptp:codex-review-plan-loop` run.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence.
- Do **not** regenerate artifacts via `/ptp:plan`. All artifact fixes are minimal targeted hand-edits only.
- Do **not** review source code in this command. If Codex surfaces code findings, note them as out-of-scope and do not fix them here.
- Per-iteration verification is `npx -y openspec validate <change-id> --strict` (run by you, the caller, never by Codex). A failing run is reported in the iteration summary but does NOT abort the loop.
- **You (the caller) assemble the closed-book prompt each iteration.** This means you read all artifacts yourself (via Read), run `openspec validate` yourself (via Bash), collect cited source excerpts yourself (via Read/Grep), and inline everything into one prompt piped to `codex exec -s read-only` over stdin. Codex runs **no** commands — no `npx`, no network, no installs.
- Run Codex under `codex exec -s read-only` with the prompt piped over **stdin** (`-`), assembled per the `ptp-codex-mode` flag-append rule (resolved `-m`/`-c` flags before the trailing `-` when configured). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- Iteration cap is configurable via `review.maxIterations` in ptp config; default 5.
