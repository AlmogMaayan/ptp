---
description: Loop Codex code review + inline fixes until zero open findings at all severities or iteration cap reached (requires codex CLI on PATH)
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running the **Codex-powered loop variant of `/ptp:codex-review`** — an external Codex CLI code-review loop that alternates closed-book review, confirmation, and fix passes automatically until every finding at all severities is resolved or the iteration cap (5) is reached. Use this when you want an independent second-opinion reviewer (a different model) to drive the review loop rather than Superpowers.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This loop applies inline code fixes, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- The `codex` CLI must be on PATH. Run `codex --version` to check. If missing, **STOP** and tell the user to install it — do **not** silently fall back to Superpowers.
- `openspec/changes/<change-id>/` must exist. If it does not, **STOP** and redirect the user to run `/ptp:plan` first.

## What this command does

Invoke the `ptp-review-loop` skill with:

- `kind = code`
- `reviewer = codex`
- `change-id = $ARGUMENTS`

The skill drives the full loop. For each iteration's review pass it runs the `codex-review.md` protocol inline: you (the caller) read the contract, capture the merge-base diff, run `npx -y openspec validate <change-id> --strict` and relevant tests, build a single closed-book prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin. Findings are confirmed via `superpowers:receiving-code-review` before any fix is applied.

## Hard rules

- Do **not** invoke `/ptp:apply`. Code fixes are applied inline.
- Do **not** archive the change. Archiving is always an explicit user action.
- Do **not** auto-commit any edits.
- Do **not** fix any finding that was not independently CONFIRMED — especially Codex findings, which must be verified against the actual code before touching anything. Rejected findings' stable keys are carried over within this invocation to prevent re-confirmation across iterations; carry-over resets on a new `/ptp:codex-review-loop` run.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against convergence.
- Do **not** edit spec deltas or planning artifacts in this command. Use `/ptp:codex-review-plan-loop` for artifact fixes.
- Iteration cap is **5** and is not configurable.
- Run Codex under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- **You (the caller) run `openspec validate` and all file reads** before each iteration. Codex receives an inlined, self-contained prompt and runs **no** `npx`, network, or install commands. Pass the prompt over stdin, not as an argv string.
