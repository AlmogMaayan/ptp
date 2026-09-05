---
name: ptp-review-brainstorm-full
description: Own the dual-reviewer brainstorm review, running the main loop and then the reviewer loop
---

# ptp-review-brainstorm-full — the dual-reviewer inline-fix brainstorm-review methodology

## Purpose

This skill owns the **dual-reviewer (main agent + reviewer agent; default Claude + Codex)
inline-fix convergence loop**
brainstorm-review contract and is the **single source of truth** the thin
`/ptp:review-brainstorm-full` command delegates to — the same command-backed-by-a-skill split as
`commands/config.md` → `skills/ptp-config/SKILL.md`. The command is a front door; this skill holds the
substance. Resolve `{ main, reviewer }` from `roles.main` via the **`ptp-agent-roles`** skill; at the
default `roles.main=claude` the main agent is Claude and the reviewer is Codex, so Phase 1 is the
main-agent loop and Phase 2 is the gated Codex loop — byte-identical to before this change.

It is the **dual-reviewer variant of `/ptp:review-brainstorm`**, exactly as `/ptp:review-plan-full` is
to `/ptp:review-plan` and `/ptp:review-full` is to `/ptp:review`. It reviews a change's
**`brainstorm.md`** with two independent reviewers — the main agent's loop then the reviewer agent's
loop — **editing
`brainstorm.md` inline** to resolve confirmed findings until each phase converges to zero confirmed
findings or the configured iteration cap is reached, before any proposal/spec artifacts exist, so a
thin or hand-wavy brainstorm is caught and *fixed* (now from two angles) *before* it silently yields
thin OpenSpec artifacts.

This mirrors the `review-plan-full.md → ptp-review-plan-full → ptp-review-loop(kind=artifact)` chain
exactly — its shape is `review-brainstorm-full.md → ptp-review-brainstorm-full →
ptp-review-loop(kind=brainstorm)`. The only structural difference from the artifact `-full` is the
brainstorm `kind` and its one divergence: **no** `openspec validate` (a brainstorm precedes any
proposal/spec).

The whole two-phase orchestration is wrapped via `ptp-run-at-model` at `opus.high` (driven by the
command); this skill is its substance.

---

## Phase 1 — main-agent brainstorm loop

Phase 1 is the **main agent's** brainstorm loop (always runs). At the default `roles.main=claude` the
main agent is Claude and runs the PTP phase, so pass `reviewer = ptp`; when `roles.main=codex` the main
agent is Codex, so pass `reviewer = codex`. Invoke the **`ptp-review-loop`** skill with:

- `kind = brainstorm`
- `reviewer = <the dispatch of the agent playing main>` (`ptp` by default; `codex` when `roles.main=codex` — the `reviewer` input names the review dispatch running the pass, per `ptp-review-loop` **## Inputs**)
- `change-id` = the resolved change id

The loop drives the full iteration: review→confirm→fix-`brainstorm.md`→verify(N/A) until it terminates
`DONE` (zero confirmed findings) or `ITERATION CAP REACHED` (the configured `review.maxIterations`,
default 5). For each iteration's review pass the loop applies the existing **`ptp-review-brainstorm`**
rubric inline over the located `brainstorm.md` — **defer** to that skill for the rubric; do **not**
re-author it here, so the brainstorm-quality criteria live in exactly one place. Confirmed findings are
fixed by minimal targeted edits to `brainstorm.md` (corrections only — add a missing option, expand a
thin tradeoff, document a missing assumption); the brainstorm is **never** regenerated via
`/ptp:brainstorm`. Verification is **N/A** — the loop runs no `openspec validate`.

Only the **disposition of findings** (inline fix vs. report) changes relative to the report-only
`/ptp:review-brainstorm` — the rubric itself is unchanged.

---

## Phase-1-gates-Phase-2 gate (convergence-based)

Phase 2 starts **only if Phase 1 terminates `DONE`** — the convergence-based gate, mirroring
`/ptp:review-plan-full`:

- **Phase 1 `DONE`** → proceed to the Phase 2 mode gate.
- **Phase 1 `ITERATION CAP REACHED`** → **STOP**. Report the Phase 1 outcome and the open findings. Do
  **not** start Phase 2. The user should resolve the remaining brainstorm issues (e.g. by re-running
  `/ptp:brainstorm` or hand-revising) and then re-run `/ptp:review-brainstorm-full`.
- **Phase 1 `ARTIFACT BUDGET EXCEEDED`** → **STOP** the same way, and recommend a **split**
  (`/ptp:plan-multiple`), never another review round. Neither halt is convergence and neither is a
  silent failure.

**What "converges" means here.** A phase converges on findings **at or above the configured
severity threshold**; findings below it are **reported**, not fixed, and do not block
convergence. The threshold, its resolution, and the partition rule live in `ptp-review-loop`,
which this skill delegates the whole loop protocol to — they are deliberately not restated here.

**Missing-brainstorm case.** A `brainstorm.md` that does not exist surfaces inside Phase 1 as the
Critical "no brainstorm to review" finding. The loop **cannot fix it** — there is nothing to edit and
nothing to validate — so convergence to zero confirmed findings is impossible and Phase 1 terminates
at the **iteration-cap backstop** (`ITERATION CAP REACHED`), **not** an infinite loop. In that case the
skill recommends **authoring the brainstorm first** via `/ptp:brainstorm <change-id>`, and Phase 2 does
**not** start (Phase 1 did not reach `DONE`). This is distinct from a `codex.mode` mode-skip.

---

## Phase 2 — reviewer-agent brainstorm loop (gated for a Codex reviewer, closed-book, no validate)

**Reviewer gate (per `ptp-codex-mode`).** Apply the `ptp-codex-mode` symmetric decision contract to the
reviewer the command resolved in its outer preconditions. The gate applies **only when the reviewer is
Codex**; a Claude reviewer is never gated and always runs.

- **Skip** the reviewer phase when the reviewer is Codex and the decision is to skip (`off`, or `auto`
  with `codex` not on PATH): do **not**
  start Phase 2 and add the non-silent `Codex phase skipped (mode=…)` line to the combined summary. When
  Phase 1 reached `DONE`, the combined terminal state is then the green
  `PHASE 1 DONE — CODEX SKIPPED (mode=…)`.
- (`required` + `codex` missing already **STOPped** in the command's outer preconditions — it never
  reaches this skill.)

**If and only if Phase 1 terminated `DONE` and the gate permits the reviewer phase,** invoke the
**`ptp-review-loop`** skill with:

- `kind = brainstorm`
- `reviewer = <the dispatch of the agent playing reviewer>` (`codex` by default; `ptp` when `roles.main=codex`)
- `change-id` = the resolved change id

Phase 2 starts with **fresh loop state**: Phase 1's `rejected_findings` do **not** carry over — the
reviewer agent is an independent reviewer and its findings are evaluated on their own merits. When the
reviewer is Codex, the loop drives the
closed-book Codex review retargeted to `brainstorm.md` with **no** `openspec validate` (the caller
reads `brainstorm.md` + any cited context, builds one self-contained prompt carrying the brainstorm
rubric as the audit instructions, and pipes it to `codex exec -s read-only` over stdin (assembled per
the `ptp-codex-mode` flag-append rule — resolved `-m`/`-c` flags appended before the trailing `-` when
configured); Codex runs no commands), and confirmed findings are fixed by editing `brainstorm.md`
until it terminates `DONE` or `ITERATION CAP REACHED`.

**Deliberate difference — NO `openspec validate`.** `codex-review-plan.md` inlines an authoritative
`openspec validate --strict` result; this brainstorm loop **omits it**, because a brainstorm precedes
any proposal/spec — there is nothing to validate. Stated explicitly so a maintainer does not add a
validate call that would error.

---

## Combined terminal state + report

After the phases complete, fold them into **one** combined terminal state in the loop vocabulary:

| Combined terminal state | When | Class |
|-------------------------|------|-------|
| `BOTH PHASES DONE` | Phase 1 `DONE` and Phase 2 `DONE` | green |
| `PHASE 1 DONE — CODEX SKIPPED (mode=…)` | Phase 1 `DONE` and Codex skipped by mode | green |
| `PHASE 2 ITERATION CAP REACHED` | Phase 1 `DONE`, Phase 2 ran but did not converge | non-green |
| `ITERATION CAP REACHED` | Phase 1 capped (never reached `DONE`); Phase 2 not started | non-green |
| `PHASE 2 ARTIFACT BUDGET EXCEEDED` | Phase 1 `DONE`, Phase 2 halted on the artifact budget | non-green |
| `ARTIFACT BUDGET EXCEEDED` | Phase 1 halted on the artifact budget; Phase 2 not started | non-green |

The two green states both mean Phase 1 converged (the main agent signed off on the brainstorm); the
`PHASE 1 DONE — CODEX SKIPPED (mode=…)` state is a **success** state (a converged single-reviewer run),
not a halt. The `Codex phase skipped (mode=…)` line is always reported (never silent).

**Report shape:**

- **Single change:**
  1. Phase 1 loop summary — per-iteration table, total fixes, rejected/carry-over set, terminal state.
  2. Phase 2 loop summary (same) — or, if Codex was mode-skipped, the `Codex phase skipped (mode=…)`
     line in place of a Phase 2 table.
  3. The aggregate **review tally**, rendered in the shared tally format
     (`skills/ptp-review-loop/references/review-tally-table.md`) over the aggregate built by
     `ptp-review-loop`'s **### Combined review tally** rule — cited, not restated here. **All four
     rows** of the combined-terminal-state table above print it (`BOTH PHASES DONE`,
     `PHASE 1 DONE — CODEX SKIPPED (mode=…)`, `PHASE 2 ITERATION CAP REACHED`, and the Phase-1
     `ITERATION CAP REACHED`).
  4. The combined terminal state.
  5. The **next step**:
     - `/ptp:plan <change-id>` on **either** green state — `BOTH PHASES DONE` or
       `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (both mean the brainstorm is sound; proceed to author the
       OpenSpec artifacts).
     - On `ITERATION CAP REACHED` (Phase 1 capped — including the missing-brainstorm Critical): resolve
       the remaining findings (author the brainstorm via `/ptp:brainstorm <change-id>` first in the
       missing-brainstorm case, or hand-revise a thin one), then re-run
       `/ptp:review-brainstorm-full <change-id>`.
     - On `PHASE 2 ITERATION CAP REACHED`: resolve the remaining Codex findings, then re-run
       `/ptp:review-brainstorm-full <change-id>`.
     - On either `ARTIFACT BUDGET EXCEEDED` state: `/ptp:plan-multiple <change-id>` — the resolved **id**, so re-cut mode applies; the
       brainstorm is over budget or still growing, and more review rounds is the thing that failed.
- **All changes / multi-change (empty argument):** a **summary table** first
  (`change-id → combined terminal state`), then a **detail block for each change that did not reach a
  green state** (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`) — fully-converged
  changes need no detail.

---

## Review-convergence marker (single combined write)

This orchestrator drives **both** phase loops with **`deferMarker = true`** (per `ptp-review-loop`'s
**## Review-convergence marker** section), so **no phase writes the marker itself** — each phase instead
returns its terminal outcome (`terminalState`, `reviewer`, `iterations`, `minSeverity`, `reviewTally`) to this orchestrator. After the
run resolves (after Phase 2, or after Phase 1 if Phase 2 is gated off), the orchestrator performs
**exactly ONE** combined `stages/brainstorm.json` write per the combined-outcome rule:

- `reviewers` = the **union of phases that actually ran**, each named by the phase rather than by the
  agent that ran it — the main phase alone (`["ptp"]`) if Phase 1 capped (Phase 2 never ran) or a
  Codex reviewer was mode-skipped, else both phases that ran (`["ptp","codex"]`). The same two values
  are written in either `roles.main` direction; the agent that filled each role travels separately.
  A reader accepts the legacy literal `"superpowers"` as naming the same identity as `"ptp"`.
- `terminalState` = that of the **last phase that ran** (`converged` if the last phase that ran reached
  `DONE`, else `cap-reached`).
- `iterations` = the **last phase's** iteration count.
- `minSeverity` = the **last phase that ran**'s severity threshold (lowercase canonical), the same last-phase rule as `iterations`. In the normal case both phases resolve the same value and the rule is a no-op.
- `reviewTally` = **the same aggregate** the report's tally item renders, built by `ptp-review-loop`'s
  **### Combined review tally** rule — cited, not restated. Only its two marker-side consequences are
  stated here: it is **not** resolved last-phase-wins the way `iterations` / `minSeverity` above are,
  and, whenever the field is written at all, its key set equals `reviewers`. It rides the **same single atomic write** below —
  **no second write**, no additional file, no change to the write-temp-then-rename protocol. Any
  `unknown` the table prints is a **print-side** rendering only: the written record instead follows
  the `stage-records` capability's **unproducible-tally rule**, per `ptp-review-loop`'s
  **## Review-convergence marker** *omit, never fabricate* note, which also owns where the omission is
  reported; the note is reported but not fatal and changes no terminal state. `reviewTally` is
  non-deciding.

The combined write uses the **same atomic write-temp-then-rename protocol** as `ptp-review-loop`
(serialize to a uniquely named temp file in `stages/`, then replace `stages/brainstorm.json` via a
replace-if-exists rename only after the complete write succeeds; on any failure clean up the temp file
and leave the live marker untouched), so a failed overwrite cannot truncate or
corrupt the prior marker.

Because there is **never a provisional per-phase marker on disk** (every phase defers), there is no
window within a single run in which the marker under-reports the reviewer set. Failure semantics: on a **first** review (no prior marker) a failed single write leaves **no** marker — and
status falls back to the inferred value — **never** a fabricated single-reviewer marker; on a
**re-review** a failed overwrite leaves the **prior run's real marker** in place (the accepted staleness
case — there is no freshness/expiry mechanism per the non-goals). A marker-write failure is reported but
does not change the terminal state the run reached.

`kind = brainstorm` always feeds `stages/brainstorm.json`; there is no `code` exemption here because
this orchestrator only ever drives the brainstorm kind.

## Hard rules

- **Edits `brainstorm.md` inline.** Each phase resolves confirmed findings by minimal targeted edits to
  `brainstorm.md` (corrections only — add a missing option, expand a thin tradeoff, document an
  assumption).
- **Never regenerate the brainstorm via `/ptp:brainstorm`.** Targeted hand-edits only — not
  re-fabrication.
- **Never run `openspec validate`.** A brainstorm precedes any proposal/spec — there is nothing to
  validate (the one deliberate divergence from `/ptp:review-plan-full`).
- **Never archive** the change. Archiving is always an explicit user action (`/ptp:archive`).
- **Never auto-commit** any edits made during either phase.
- **Don't start Phase 2 unless Phase 1 terminated `DONE`.** A Phase 1 `ITERATION CAP REACHED` or
  `ARTIFACT BUDGET EXCEEDED` STOPs the run — Phase 2 does not start.
- **Never treat `ARTIFACT BUDGET EXCEEDED` as convergence or as a silent stop.** Report it under its
  own name and recommend a split, never another review round.
- **Phase 2 uses fresh loop state.** Phase 1 `rejected_findings` do not carry into Phase 2.
- **Iteration cap per phase** is `review.maxIterations` from ptp config (default 5); each phase has its
  own independent cap.
- **Don't re-author the rubric.** The brainstorm-quality rubric stays in `ptp-review-brainstorm`; only
  the disposition of findings (inline fix vs. report) changes here.
- **Codex only read-only over stdin.** Run Codex only under `codex exec -s read-only` with the prompt
  piped over **stdin** (`-`), assembled per the `ptp-codex-mode` flag-append rule (resolved `-m`/`-c`
  flags before the trailing `-` when `codex.model`/`codex.reasoningEffort` are configured). Never
  `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`. Codex
  runs **no** commands.
