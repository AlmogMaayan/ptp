---
description: Seam-free union of /ptp:prd and /ptp:review-prd-full in one uninterrupted flow — authors the epic PRD, then continues without a manual re-invocation into the dual-reviewer (Superpowers + Codex) inline-fix PRD-review loop. A prd-gate between phases blocks the review if no PRD was written. The PRD-stage analog of /ptp:brainstorm-full.
argument-hint: "<epic-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN (omit = all active epics)"
---

You are running **`/ptp:prd-full`** — the union of `/ptp:prd` and `/ptp:review-prd-full`, connected by a
prd-gate. It authors the epic PRD (`openspec/prds/<epic>-<slug>.md`) and — **without a manual
re-invocation in between** — continues into the dual-reviewer (Superpowers + Codex) inline-fix PRD-review
convergence loop. The point of having one command is the **automatic handoff**: no second
`/ptp:review-prd-full <epic>` needed. The orchestration detail lives in the **`ptp-prd-full`** skill —
this command is the thin front door. It is the PRD-stage analog of `/ptp:brainstorm-full`.

## Inputs

Epic selector: $ARGUMENTS (a bare change id, `epic:XXXX`, `story:NN`, `epic:XXXX story:NN`, or multiple
whitespace-separated selectors; omit = all active epics)

## Preconditions (outer session, abort-guaranteeing — checked first, in order)

The outer session runs only the abort-guaranteeing preconditions before doing any work, **in this
order**:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** — this check runs **first** because it is the
   only guaranteed-abort condition. Under **`required`** run `codex --version`; if `codex` is not on PATH
   → **STOP** immediately with the install-or-change-mode message and do **no** further work: do not
   author any PRD, do not write any file, do not launch any subagent. Under **`auto`** or **`off`**
   proceed — the review phase applies its own non-silent Codex skip. The full resolution + decision rule
   lives in the `ptp-codex-mode` skill — do not restate it here.

2. **Resolve the epic selector** via the `ptp-prd` selector→epic projection (a bare id / `story:NN` → the
   change's epic; `epic:XXXX` → that epic; `epic:all` / omitted → all active epics). If it resolves to
   **no active epic** (e.g. every supplied selector is a legacy/unprefixed id, or there are no active
   epics), report **nothing-to-do** and exit **without cutting a branch** (the
   abort-precondition-before-branch rule — cutting one ahead of a guaranteed abort just leaves a
   throwaway branch).

3. **Branch guard** — run the `ptp-branch-guard` preamble on the resolved epic: if HEAD is `master`,
   derive a feature-branch name from the resolved epic (→ `ptp/<change-id>` using the epic's
   lowest-numbered story id, or a `ptp/<≤5-kebab-word summary>` for a multi-epic/omitted selector) and
   launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch)
   **before** any file write; if already on a feature branch it is a **no-op** — proceed as-is. The full
   rule lives in the `ptp-branch-guard` skill — do not restate it here.

## What this command does

After the three outer preconditions above have settled, delegate the two-phase orchestration to the
**`ptp-prd-full`** skill. Pass the resolved epic, the original selector (`$ARGUMENTS`), and the resolved
`codex.mode` decision. The skill performs:

- **Phase A (author):** invokes `ptp-run-at-model` at `opus.high` to run the `ptp-prd` skill over the
  resolved epic, writing `openspec/prds/<epic>-<slug>.md`. The `/ptp:prd` terminal STOP and `/ptp:plan`
  recommendation are suppressed — the outer flow continues to the prd-gate. The subagent's branch guard
  is a no-op (HEAD is already on the feature branch); it must NOT launch `ptp-branch-prep`.
- **prd-gate:** reads `openspec/prds/<epic>-<slug>.md`; if missing → STOP (do not enter Phase B). Reports
  the authoring failure and recommends `/ptp:prd <epic>` to debug, then `/ptp:review-prd-full <epic>`.
- **Phase B (review):** invokes `ptp-run-at-model` at `opus.high` to run the `ptp-review-prd-full` skill
  over the resolved epic with the pre-resolved `codex.mode`. Relays the combined terminal state.

Keep this command **thin**: the two phases, the prd-gate, the terminal report, and the hard rules all
live in the **`ptp-prd-full`** skill. Do not restate the skill's methodology here. For a multi-epic
selector the skill runs author → gate → review per epic in sequence.

## Model/effort posture

This command has **no effort gate** and no `full-effort` variant. Both phases run at `opus.high` via
`ptp-run-at-model`. No `effort.md` is read — this is a PRD-phase command, not an apply command. If the
session is below `opus.high` when the outer preconditions run, **note a reminder** but do **not** stop
(same posture as `/ptp:brainstorm-full`).

## Hard rules

- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only
  `required` hard-requires Codex (STOP with no work if `codex --version` fails). Under `auto`/`off` the
  command proceeds and the review phase applies its own non-silent Codex skip.
- **prd-gate blocks Phase B** — do not enter the review phase if `openspec/prds/<epic>-<slug>.md` is
  missing after Phase A.
- **Never archive** the change. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during authoring or PRD review.
- **Never re-confirm scope between phases** — the handoff from Phase A to Phase B is automatic; the
  resolved epic is passed explicitly so Phase B does not stop.
- **No `openspec validate`** — a PRD precedes any proposal/spec; there is nothing to validate.
- **Never re-resolve the epic** in the skill — the outer session resolves it once and passes it through.
- On a green terminal state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`) recommend
  `/ptp:plan <change-id>` (the epic's lowest-numbered story id) in **text only**; the user runs it
  explicitly.
