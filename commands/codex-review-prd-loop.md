---
description: Loop Codex PRD review + inline fixes until zero open findings at all severities or configured iteration cap reached (default 5; reviews the epic PRD openspec/changes/<id>/prd.md, not artifacts or code; requires codex CLI on PATH)
argument-hint: "<epic-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN (omit to loop over all active epics' PRDs)"
---

You are running the **Codex-powered loop variant of `/ptp:codex-review-prd`** — an external Codex CLI
PRD-quality loop that alternates closed-book PRD review, confirmation, and inline-fix passes
automatically until every finding at all severities in the epic PRD `openspec/changes/<id>/prd.md`
(where `<id>` is the epic's lowest-numbered story) is resolved or the configured iteration cap
(default 5) is reached.

This is **not** a code- or artifact-review loop. It reviews the *epic PRD*, which precedes any
proposal/spec. Use `/ptp:codex-review-plan-loop` for the OpenSpec artifacts and `/ptp:codex-review-loop`
for implemented code.

## Inputs

Epic selector: $ARGUMENTS

Resolve `$ARGUMENTS` via the `ptp-prd` selector→epic projection (a bare id / `story:NN` → the change's
epic; `epic:XXXX` → that epic; `epic:all` / omitted → all active epics). Resolve to epics in the outer
session and drive the loop **once per resolved epic**, reporting per epic. A legacy/unprefixed id that
cannot project to an epic is reported unsupported and skipped (per `ptp-prd`).

## Branch safety (first step)

This loop applies inline PRD fixes, so before any fix run the **`ptp-branch-guard`** preamble: check
`git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved
epic (→ `ptp/<change-id>` using the epic's lowest-numbered story id) and launch the minimal
`ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing
anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives
in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

- The `codex` CLI must be on PATH. Run `codex --version` to check. If missing, **STOP** and tell the
  user to install it — do **not** silently fall back to a different reviewer.
- For each targeted epic, resolve the PRD at `openspec/changes/<id>/prd.md` (where `<id>` is the
  epic's lowest-numbered story across active + archived changes, per `ptp-prd`). The **PRD-file
  existence is NOT an abort precondition**: a missing PRD is an unfixable Critical "no PRD to review"
  inside the loop that the iteration cap backstops.

## What this command does

The codex-review-prd-loop work runs **at a deterministic model** via the **`ptp-run-at-model`** skill
at `opus.high`. The outer session runs only the abort-guaranteeing preconditions first — the
`ptp-branch-guard` preamble (above), the `codex --version` presence check (STOP if missing), and
selector disambiguation that must STOP and ask the user — so a guaranteed abort never spawns a
subagent. It then invokes **`ptp-run-at-model`** with target `opus.high` and the work below; that spawns
one foreground `opus` subagent (high effort directive) which runs the loop (the Claude-side closed-book
prompt construction, confirmation, and inline PRD edits; the external `codex exec` remains a Bash
subprocess governed by its own CLI config), and its terminal state (DONE or ITERATION CAP REACHED) is
relayed back per `ptp-run-at-model`'s *Result relay* — never downgraded to success.

For each resolved epic, the subagent invokes the `ptp-review-loop` skill with:

- `kind = prd`
- `reviewer = codex`
- the resolved **epic** and the **PRD file path** `openspec/changes/<id>/prd.md` (the change-folder
  PRD input variant, in place of a brainstorm/artifact change folder)

The skill drives the full loop. For each iteration's review pass it runs the `codex-review-plan.md`
closed-book protocol inline, **retargeted to the PRD file and with NO `openspec validate`**: you (the
caller) read the PRD, build a single self-contained prompt with the PRD text and the PRD rubric as the
audit instructions, and pipe it to `codex exec -s read-only` over stdin. A missing PRD is surfaced as a
Critical "no PRD to review" finding in place of the PRD text. Findings are confirmed via
`superpowers:receiving-code-review` before any PRD edit. Per-iteration verification is **N/A** — the
loop runs **no** `openspec validate` and records `verify = N/A (PRD precedes any spec)`.

**Review-convergence marker:** this is a `kind = prd` loop, so on its terminal state a standalone run
stamps the marker at `openspec/changes/<id>/reviews/prd.json` (`terminalState` converged / cap-reached,
`kind: "prd"`, `reviewers: ["codex"]`), via the same atomic write-temp-then-rename protocol — one marker
per epic. The `openspec/changes/<id>/reviews/` subfolder is created on demand.

## Hard rules

- Do **not** invoke `/ptp:apply`. This loop fixes the PRD, not source code or OpenSpec artifacts.
- Do **not** archive any change. Archiving is always an explicit user action.
- Do **not** auto-commit any edits.
- Do **not** fix any finding — especially a Codex finding — that was not independently CONFIRMED against
  the actual PRD text. Codex can be wrong; confirmation is mandatory. Rejected findings' stable keys are
  carried over within this invocation to prevent re-confirmation across iterations; carry-over resets on
  a new `/ptp:codex-review-prd-loop` run.
- Do **not** count findings whose only suggested remediation is a manual check or a missing test against
  convergence.
- Do **not** regenerate the PRD via `/ptp:prd`. All PRD fixes are minimal targeted hand-edits to
  `openspec/changes/<id>/prd.md` only. A missing-PRD Critical has nothing to edit and the iteration
  cap is the backstop.
- Do **not** run `openspec validate` — a PRD precedes any proposal/spec, so per-iteration verification
  is `N/A` (the one divergence from `/ptp:codex-review-plan-loop`).
- **You (the caller) assemble the closed-book prompt each iteration.** You read the PRD yourself (via
  Read) and inline everything into one prompt piped to `codex exec -s read-only` over stdin. Codex runs
  **no** commands — no `npx`, no `openspec validate`, no network, no installs.
- Run Codex under `codex exec -s read-only` with the prompt piped over **stdin** (`-`). Never pass
  `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- Iteration cap is configurable via `review.maxIterations` in ptp config; default 5.
