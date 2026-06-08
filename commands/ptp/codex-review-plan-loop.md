---
description: Loop Codex artifact review + inline fixes until zero open findings at all severities or iteration cap reached (reviews proposal/design/tasks/spec-deltas, not code; requires codex CLI on PATH)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running the **Codex-powered loop variant of `/ptp:codex-review-plan`** — an external Codex CLI artifact-quality loop that alternates closed-book planning-artifact review, confirmation, and fix passes automatically until every finding at all severities in `proposal.md`, `design.md`, `tasks.md`, and spec deltas is resolved or the iteration cap (5) is reached.

This is **not** a code-review loop. It reviews the *planning artifacts*, not source code. Use `/ptp:codex-review-loop` to review implemented code.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This loop applies inline artifact fixes, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- The `codex` CLI must be on PATH. Run `codex --version` to check. If missing, **STOP** and tell the user to install it — do **not** silently fall back to a different reviewer.
- `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first — do not fabricate a change folder.

## What this command does

Invoke the `ptp-review-loop` skill with:

- `kind = artifact`
- `reviewer = codex`
- `change-id = $ARGUMENTS`

The skill drives the full loop. For each iteration's review pass it runs the `codex-review-plan.md` closed-book protocol inline: you (the caller) read all artifacts, run `npx -y openspec validate <change-id> --strict`, collect cited source excerpts, build a single self-contained prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin. Findings are confirmed via `superpowers:receiving-code-review` before any artifact is touched.

## Hard rules

- Do **not** invoke `/ptp:apply`. This loop fixes artifacts, not source code.
- Do **not** archive the change. Archiving is always an explicit user action.
- Do **not** auto-commit any edits.
- Do **not** fix any finding — especially a Codex finding — that was not independently CONFIRMED against the actual artifact text. Codex can be wrong; confirmation is mandatory. Rejected findings' stable keys are carried over within this invocation to prevent re-confirmation across iterations; carry-over resets on a new `/ptp:codex-review-plan-loop` run.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence.
- Do **not** regenerate artifacts via `/ptp:plan`. All artifact fixes are minimal targeted hand-edits only.
- Do **not** review source code in this command. If Codex surfaces code findings, note them as out-of-scope and do not fix them here.
- Per-iteration verification is `npx -y openspec validate <change-id> --strict` (run by you, the caller, never by Codex). A failing run is reported in the iteration summary but does NOT abort the loop.
- **You (the caller) assemble the closed-book prompt each iteration.** This means you read all artifacts yourself (via Read), run `openspec validate` yourself (via Bash), collect cited source excerpts yourself (via Read/Grep), and inline everything into one prompt piped to `codex exec -s read-only` over stdin. Codex runs **no** commands — no `npx`, no network, no installs.
- Run Codex under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- Iteration cap is **5** and is not configurable.
