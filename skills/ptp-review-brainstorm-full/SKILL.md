---
name: ptp-review-brainstorm-full
description: Use this skill when running the dual-reviewer inline-fix brainstorm loop behind /ptp:review-brainstorm-full — the Superpowers + Codex variant of /ptp:review-brainstorm. Owns the dual-reviewer brainstorm-review contract as an inline-fix convergence loop: Phase 1 Superpowers brainstorm loop (driving ptp-review-loop kind=brainstorm), a convergence-based Phase-1-gates-Phase-2 gate, Phase 2 Codex closed-book read-only brainstorm loop (mode-gated per ptp-codex-mode, no openspec validate), and a combined terminal state. Edits brainstorm.md inline to resolve confirmed findings until each phase converges or the iteration cap is reached; never archives, never commits, never regenerates the brainstorm via /ptp:brainstorm, runs no openspec validate.
---

# ptp-review-brainstorm-full — the dual-reviewer inline-fix brainstorm-review methodology

## Purpose

This skill owns the **dual-reviewer (Superpowers + Codex) inline-fix convergence loop**
brainstorm-review contract and is the **single source of truth** the thin
`/ptp:review-brainstorm-full` command delegates to — the same command-backed-by-a-skill split as
`commands/config.md` → `skills/ptp-config/SKILL.md`. The command is a front door; this skill holds the
substance.

It is the **dual-reviewer variant of `/ptp:review-brainstorm`**, exactly as `/ptp:review-plan-full` is
to `/ptp:review-plan` and `/ptp:review-full` is to `/ptp:review`. It reviews a change's
**`brainstorm.md`** with two independent reviewers — a Superpowers loop then a Codex loop — **editing
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

## Phase 1 — Superpowers brainstorm loop

Invoke the **`ptp-review-loop`** skill with:

- `kind = brainstorm`
- `reviewer = superpowers`
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

**Missing-brainstorm case.** A `brainstorm.md` that does not exist surfaces inside Phase 1 as the
Critical "no brainstorm to review" finding. The loop **cannot fix it** — there is nothing to edit and
nothing to validate — so convergence to zero confirmed findings is impossible and Phase 1 terminates
at the **iteration-cap backstop** (`ITERATION CAP REACHED`), **not** an infinite loop. In that case the
skill recommends **authoring the brainstorm first** via `/ptp:brainstorm <change-id>`, and Phase 2 does
**not** start (Phase 1 did not reach `DONE`). This is distinct from a `codex.mode` mode-skip.

---

## Phase 2 — Codex brainstorm loop (mode-gated, closed-book, no validate)

**Mode gate (per `ptp-codex-mode`).** Apply the `ptp-codex-mode` decision contract to the mode the
command resolved in its outer preconditions:

- **Skip** Codex when the decision is to skip (`off`, or `auto` with `codex` not on PATH): do **not**
  start Phase 2 and add the non-silent `Codex phase skipped (mode=…)` line to the combined summary. When
  Phase 1 reached `DONE`, the combined terminal state is then the green
  `PHASE 1 DONE — CODEX SKIPPED (mode=…)`.
- (`required` + `codex` missing already **STOPped** in the command's outer preconditions — it never
  reaches this skill.)

**If and only if Phase 1 terminated `DONE` and the mode permits Codex,** invoke the **`ptp-review-loop`**
skill with:

- `kind = brainstorm`
- `reviewer = codex`
- `change-id` = the resolved change id

Phase 2 starts with **fresh loop state**: Phase 1's `rejected_findings` do **not** carry over — Codex
is an independent reviewer and its findings are evaluated on their own merits. The loop drives the
closed-book Codex review retargeted to `brainstorm.md` with **no** `openspec validate` (the caller
reads `brainstorm.md` + any cited context, builds one self-contained prompt carrying the brainstorm
rubric as the audit instructions, and pipes it to `codex exec -s read-only` over stdin; Codex runs no
commands), and confirmed findings are fixed by editing `brainstorm.md` until it terminates `DONE` or
`ITERATION CAP REACHED`.

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

The two green states both mean Phase 1 converged (Superpowers signed off on the brainstorm); the
`PHASE 1 DONE — CODEX SKIPPED (mode=…)` state is a **success** state (a converged single-reviewer run),
not a halt. The `Codex phase skipped (mode=…)` line is always reported (never silent).

**Report shape:**

- **Single change:**
  1. Phase 1 loop summary — per-iteration table, total fixes, rejected/carry-over set, terminal state.
  2. Phase 2 loop summary (same) — or, if Codex was mode-skipped, the `Codex phase skipped (mode=…)`
     line in place of a Phase 2 table.
  3. The combined terminal state.
  4. The **next step**:
     - `/ptp:plan <change-id>` on **either** green state — `BOTH PHASES DONE` or
       `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (both mean the brainstorm is sound; proceed to author the
       OpenSpec artifacts).
     - On `ITERATION CAP REACHED` (Phase 1 capped — including the missing-brainstorm Critical): resolve
       the remaining findings (author the brainstorm via `/ptp:brainstorm <change-id>` first in the
       missing-brainstorm case, or hand-revise a thin one), then re-run
       `/ptp:review-brainstorm-full <change-id>`.
     - On `PHASE 2 ITERATION CAP REACHED`: resolve the remaining Codex findings, then re-run
       `/ptp:review-brainstorm-full <change-id>`.
- **All changes / multi-change (empty argument):** a **summary table** first
  (`change-id → combined terminal state`), then a **detail block for each change that did not reach a
  green state** (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`) — fully-converged
  changes need no detail.

---

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
- **Don't start Phase 2 unless Phase 1 terminated `DONE`.** A Phase 1 `ITERATION CAP REACHED` STOPs the
  run — Phase 2 does not start.
- **Phase 2 uses fresh loop state.** Phase 1 `rejected_findings` do not carry into Phase 2.
- **Iteration cap per phase** is `review.maxIterations` from ptp config (default 5); each phase has its
  own independent cap.
- **Don't re-author the rubric.** The brainstorm-quality rubric stays in `ptp-review-brainstorm`; only
  the disposition of findings (inline fix vs. report) changes here.
- **Codex only read-only over stdin.** Run Codex only under `codex exec -s read-only` with the prompt
  piped over **stdin** (`-`). Never `--full-auto`, `--sandbox workspace-write`, or
  `--dangerously-bypass-approvals-and-sandbox`. Codex runs **no** commands.
