---
name: ptp-prd-full
description: Own writing a product requirements document and running its dual-reviewer review in one pass
---

# ptp-prd-full — PRD author-then-review two-phase orchestration

## Purpose

This skill is the orchestration contract behind the single `/ptp:prd-full` command. It is the union of
`/ptp:prd` and `/ptp:review-prd-full`: it runs the PRD-authoring phase (producing
`openspec/changes/<id>/prd.md`, where `<id>` is the epic's lowest-numbered story) and — without a user
re-invocation in between — continues into the dual-reviewer (main agent + reviewer agent; default Claude + Codex) inline-fix PRD-review
loop. The seam between the two commands is exactly why this skill exists: the epic resolved by the
authoring phase is passed *explicitly* into the review phase, so the review phase skips any
scope-confirmation stop. "Run the PRD author and continue without stopping to review-prd-full."

It is the PRD-stage analog of `ptp-brainstorm-full`. The `/ptp:prd-full` command is the thin front door;
this skill holds the substance. The command has already resolved `codex.mode`, resolved the epic
selector, and run the branch guard before invoking this skill — the skill receives these as inputs and
does **not** redo them.

---

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| resolved epic | the projected epic(s) (and the original selector for reporting) | Resolved by the outer session via the `ptp-prd` selector→epic projection; passed in verbatim. The skill does NOT re-resolve or re-project it. |
| original selector | the user's `$ARGUMENTS` | Threaded through for reporting / next-step text. |
| `codex.mode` decision | already-resolved mode decision from `ptp-codex-mode` | Resolved once in the outer session; threaded through to Phase B so the review subagent does not re-resolve it. |
| `target` | A `<model>.<effort>` literal — `opus.high` by default, or the caller's resolved `model:` override | Resolved once by `commands/prd-full.md`'s outer session, reused for every epic. |

Both phases run at the resolved `target` (default `opus.high`) via `ptp-run-at-model`. This skill
consumes the already-resolved target as given — it does **not** re-parse a `model:` token (the
command's outer session parsed and stripped it; see the "Optional caller-side `model:` override token"
section of `ptp-run-at-model` for the token's grammar, validation, and refusal contract), mirroring
`skills/ptp-prd/SKILL.md`.

---

## Precondition

`codex.mode`, the epic selector, and the branch guard are **pre-resolved** by the command's outer
session. The skill does NOT re-resolve any of them. The outer session guarantees:

- Under `required` with `codex` not on PATH: the command already STOPped before invoking this skill —
  this skill is never entered in that case (no PRD authored, no subagent spawned).
- Under `auto` or `off`: this skill proceeds; Phase B applies the pre-resolved mode decision to determine
  whether the Codex loop runs.
- HEAD is already on a feature branch (the outer branch guard ran) — the Phase A and Phase B subagents'
  own branch guards are **no-ops** that must NOT launch `ptp-branch-prep`.

---

## Phase A — author

Invoke **`ptp-run-at-model`** at the resolved `target` with the work being "run the **`ptp-prd`** skill over the
resolved epic." That writes `openspec/changes/<id>/prd.md` (where `<id>` is the epic's lowest-numbered
story across active + archived changes, per `ptp-prd`'s naming rule). The subagent runs the full
`ptp-prd` protocol (Phase-0 prd-taskmaster backend detection, epic-context pre-load, `prd:generate`
invocation and output relocation into the change folder, and the inline auto-degrade fallback).

**The `/ptp:prd` terminal STOP / `/ptp:plan` next-step recommendation is suppressed** — the PRD subagent
writes the PRD and returns its terminal result to the outer session; the outer session continues to the
prd-gate. The subagent prompt MUST carry: the resolved epic (so the subagent does not re-project the
selector); the branch guard is a **no-op** (HEAD is already on the feature branch from the outer guard);
the subagent MUST NOT attempt to launch the `ptp-branch-prep` workflow; the `ptp-prd` work invokes
`prd:generate` (or the inline fallback) as inline work — no nesting concern; the PRD is written to
`openspec/changes/<id>/prd.md` (not to any `openspec/prds/` folder).

Relay the Phase A result: the absolute path of the written PRD at `openspec/changes/<id>/prd.md` (or
the failure description if the subagent did not write it).

---

## prd-gate

After Phase A returns, read `openspec/changes/<id>/prd.md`:

- **Present** → proceed to Phase B.
- **Missing** → **STOP**. Do NOT invoke `ptp-run-at-model` for Phase B.
  Report: Phase A failed to write the PRD. Recommend `/ptp:prd <epic>` to debug and produce the PRD
  manually, then re-run `/ptp:review-prd-full <epic>` for the review.

---

## Phase B — review (the `/ptp:review-prd-full` flow)

**Only if the prd-gate passed**, invoke **`ptp-run-at-model`** at the resolved `target` with the work being "run
the `ptp-review-prd-full` skill over the resolved epic with the pre-resolved `codex.mode`." Pass the
already-resolved `codex.mode` decision and the resolved epic + PRD path (`openspec/changes/<id>/prd.md`)
so the review subagent does not re-resolve them.

The subagent prompt MUST carry:
- The branch guard is a **no-op** (HEAD is already on the feature branch).
- The epic and PRD path (`openspec/changes/<id>/prd.md`) are pre-resolved (the PRD was just written by
  Phase A) — do NOT re-project the selector.
- `codex.mode` is pre-resolved: `<decision>`. Apply it directly; do NOT re-resolve via `ptp-codex-mode`.

The subagent runs the full `ptp-review-prd-full` skill: Phase 1 main-agent `kind = prd` loop →
Phase-1-gates-Phase-2 gate → Phase 2 reviewer-agent `kind = prd` loop (gated for a Codex reviewer) →
combined terminal state +
single combined epic-scoped marker write + report. At the default `roles.main=claude` this is Phase 1
Claude → Phase 2 Codex, byte-identical to before.

Relay the Phase B terminal state exactly as `ptp-review-prd-full` emits it — never downgrade or
misreport it, and never collapse the mode-skip green state.

---

## Terminal report

Report at whichever terminal point is reached (`<change-id>` = the epic's lowest-numbered story id):

| Terminal state | Meaning | Next-step recommendation |
|---|---|---|
| `BOTH PHASES DONE` | Phase A wrote the PRD; Phase 1 (main agent) and Phase 2 (reviewer agent) both converged (default: Claude then Codex) | `/ptp:plan <change-id>` |
| `PHASE 1 DONE — CODEX SKIPPED (mode=…)` | Phase A wrote the PRD; Phase 1 converged; a Codex reviewer skipped per `codex.mode` | `/ptp:plan <change-id>` |
| `ITERATION CAP REACHED` | Phase A wrote the PRD; Phase 1 hit the iteration cap before converging; Phase 2 not started | Fix remaining Phase 1 findings (re-run `/ptp:prd <epic>` to revise) → re-run `/ptp:review-prd-full <epic>` |
| `PHASE 2 ITERATION CAP REACHED` | Phase A wrote the PRD; Phase 1 converged; Phase 2 hit the cap | Fix remaining Phase 2 findings → re-run `/ptp:review-prd-full <epic>` |
| prd-gate STOP | Phase A completed but `openspec/changes/<id>/prd.md` is absent | Debug Phase A → run `/ptp:prd <epic>`, then re-run `/ptp:review-prd-full <epic>` |

Report format:
1. Phase A result — absolute path of the PRD written (or gate-stop reason if missing).
2. prd-gate status.
3. Phase B combined terminal state and loop summary (per `ptp-review-prd-full`'s report shape) — or
   omitted (with the gate-stop note) if the prd-gate fired.
4. The relayed **review tally** — the aggregate Phase B's `ptp-review-prd-full` returned, rendered in
   the shared tally format (`skills/ptp-review-loop/references/review-tally-table.md`) — cited, not
   restated here. Printed at **every** terminal state in the table above, the two caps
   (`ITERATION CAP REACHED`, `PHASE 2 ITERATION CAP REACHED`) included: a capped run is exactly when
   the counts matter most, so the tally is never dropped for not being green. On the **prd-gate
   STOP** row Phase B never ran and returned no tally, so this item is the non-table line
   `Review tally: unknown` — no caption, no header, no rows, no zero counts.
5. The next-step recommendation (one of the five rows above).

---

## Multi-epic selector

For a multi-epic selector, run **author → gate → review per epic in sequence** — Phase A authors the
PRD for one epic, the prd-gate checks it, Phase B reviews it (one combined marker per epic), then move
to the next epic. Never re-resolve the epic set between phases.

Because the aggregate a wrapped review step returns is scoped to one change, the relayed
**review tally** is likewise one table per epic, printed **inside that epic's own report block** (report-format
item 4 above) and **never merged** across epics into a single combined table. An epic whose prd-gate
STOPped carries the non-table `Review tally: unknown` line in its own block while the other epics
still print their real tables.

---

## Hard rules

- **Branch safety is the outer session's responsibility.** The command runs the `ptp-branch-guard`
  preamble before invoking this skill. The Phase A and Phase B subagents' own branch guards are
  **no-ops** — both subagent prompts MUST carry this note (do NOT launch `ptp-branch-prep`).
- **`codex.mode` is pre-resolved.** Do NOT invoke `ptp-codex-mode` in this skill. Apply the pre-resolved
  decision the command passed in.
- **Never re-allocate or re-resolve the epic.** The outer session resolved it; the skill uses it
  verbatim and does not re-project the selector.
- **prd-gate blocks Phase B.** If the PRD is missing after Phase A, do NOT invoke `ptp-run-at-model` for
  Phase B — STOP and report.
- **Never archive** the change. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during authoring or PRD review.
- **Never re-confirm scope between phases.** The resolved epic is passed explicitly; Phase B does not
  stop to ask the user.
- **No `openspec validate`.** A PRD precedes any proposal/spec — there is nothing to validate.
- **Relay terminal states accurately.** Do not collapse `PHASE 1 DONE — CODEX SKIPPED (mode=…)` into a
  plain done state — the mode-skip must remain visible in the terminal report.
- **Relay the review tally, never reconstruct it.** Print what Phase B's terminal result carried and
  nothing else. Never substitute **zero** counts for a tally that was not returned, never **recompute**
  the tally from `stages/` records, and never re-derive it from the phase summaries' prose — a missing
  tally renders `unknown` so a relay bug is visible instead of a plausible wrong number.
- **One `ptp-run-at-model` call per phase.** Phase A and Phase B are sequential; the outer session calls
  `ptp-run-at-model` twice in sequence (per epic), never concurrently. No nesting concern.
