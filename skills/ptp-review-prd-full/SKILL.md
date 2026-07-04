---
name: ptp-review-prd-full
description: "Use this skill when running the dual-reviewer inline-fix PRD-review loop behind /ptp:review-prd-full — the Superpowers + Codex variant of /ptp:review-prd. Owns the dual-reviewer PRD-review contract as an inline-fix convergence loop over the epic PRD openspec/changes/<id>/prd.md: Phase 1 Superpowers PRD loop (driving ptp-review-loop kind=prd), a convergence-based Phase-1-gates-Phase-2 gate, Phase 2 Codex closed-book read-only PRD loop (mode-gated per ptp-codex-mode, no openspec validate), a single combined change-folder marker write, and a combined terminal state. Edits the PRD inline to resolve confirmed findings until each phase converges or the iteration cap is reached; never archives, never commits, never regenerates the PRD via /ptp:prd, runs no openspec validate."
---

# ptp-review-prd-full — the dual-reviewer inline-fix PRD-review methodology

## Purpose

This skill owns the **dual-reviewer (Superpowers + Codex) inline-fix convergence loop** PRD-review
contract and is the **single source of truth** the thin `/ptp:review-prd-full` command delegates to —
the same command-backed-by-a-skill split as `commands/config.md` → `skills/ptp-config/SKILL.md`. The
command is a front door; this skill holds the substance.

It is the **dual-reviewer variant of `/ptp:review-prd`**, exactly as `/ptp:review-plan-full` is to
`/ptp:review-plan` and `/ptp:review-brainstorm-full` is to `/ptp:review-brainstorm`. It reviews an
epic's **PRD** (`openspec/changes/<id>/prd.md`, authored by `/ptp:prd`, where `<id>` is the epic's
lowest-numbered story) with two independent reviewers — a Superpowers loop then a Codex loop —
**editing the PRD inline** to resolve confirmed findings until each phase converges to zero confirmed
findings or the configured iteration cap is reached, before any proposal/spec/brainstorm artifacts for
the epic plan exist, so a thin or placeholder PRD is caught *and fixed* (now from two angles) *before*
it silently yields a thin epic plan.

This mirrors the `review-brainstorm-full.md → ptp-review-brainstorm-full →
ptp-review-loop(kind=brainstorm)` chain exactly — its shape is `review-prd-full.md →
ptp-review-prd-full → ptp-review-loop(kind=prd)`. PRDs share the brainstorm's one divergence from the
artifact `-full`: **no** `openspec validate` (a PRD precedes any proposal/spec). Like the brainstorm
`-full`, the PRD review marker is written into the change folder (`openspec/changes/<id>/reviews/prd.json`)
rather than an epic-scoped standalone location.

The whole two-phase orchestration is wrapped via `ptp-run-at-model` at `opus.high` (driven by the
command); this skill is its substance.

---

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| resolved epic + PRD path | the epic and `openspec/changes/<id>/prd.md` (where `<id>` is the epic's lowest-numbered story across active + archived changes, per `ptp-prd`) | Resolved by the command's outer session via the `ptp-prd` selector→epic projection; passed in. |
| `codex.mode` decision | already-resolved mode decision from `ptp-codex-mode` | Resolved once in the outer session; threaded through to Phase 2 so this skill does not re-resolve it. |

The skill does **not** re-run the branch guard, re-resolve `codex.mode`, or re-resolve the epic — the
outer session pre-resolved all three. **PRD-file existence is NOT checked as an abort here**: a missing
PRD surfaces inside Phase 1 as the Critical "no PRD to review" finding the loop cannot fix (the
iteration-cap backstop handles it).

---

## Phase 1 — Superpowers `kind = prd` loop

Invoke the **`ptp-review-loop`** skill with:

- `kind = prd`
- `reviewer = superpowers`
- the resolved **epic** and the **PRD file path** `openspec/changes/<id>/prd.md` (the change-folder
  PRD path, in place of a change folder's `brainstorm.md` or artifact)
- `deferMarker = true`

The loop drives the full iteration: review→confirm→fix-PRD→verify(N/A) until it terminates `DONE` (zero
confirmed findings) or `ITERATION CAP REACHED` (the configured `review.maxIterations`, default 5). For
each iteration's review pass the loop applies the existing **`ptp-review-prd`** rubric inline over the
located PRD — **defer** to that skill for the rubric; do **not** re-author it here, so the PRD-quality
criteria live in exactly one place. Confirmed findings are fixed by minimal targeted edits to the PRD
(corrections only — fill a missing schema section, sharpen a vague acceptance criterion, add a
measurable goal); the PRD is **never** regenerated via `/ptp:prd`. Verification is **N/A** — the loop
runs no `openspec validate` and records `verify = N/A (PRD precedes any spec)`.

Only the **disposition of findings** (inline fix vs. report) changes relative to the report-only
`/ptp:review-prd` — the rubric itself is unchanged.

---

## Phase-1-gates-Phase-2 gate (convergence-based)

Phase 2 starts **only if Phase 1 terminates `DONE`** — the convergence-based gate, mirroring
`/ptp:review-plan-full` and `/ptp:review-brainstorm-full`:

- **Phase 1 `DONE`** → proceed to the Phase 2 mode gate.
- **Phase 1 `ITERATION CAP REACHED`** → **STOP**. Report the Phase 1 outcome and the open findings. Do
  **not** start Phase 2. The user should resolve the remaining PRD issues (re-run `/ptp:prd <epic>` to
  revise a thin PRD, or author it first in the missing-PRD case) and then re-run
  `/ptp:review-prd-full <epic>`.

**Missing-PRD case.** A `openspec/changes/<id>/prd.md` that does not exist surfaces inside Phase 1 as
the Critical "no PRD to review" finding. The loop **cannot fix it** — there is nothing to edit and
nothing to validate — so convergence to zero confirmed findings is impossible and Phase 1 terminates at
the **iteration-cap backstop** (`ITERATION CAP REACHED`), **not** an infinite loop. In that case the
skill recommends **authoring the PRD first** via `/ptp:prd <epic>`, and Phase 2 does **not** start
(Phase 1 did not reach `DONE`). This is distinct from a `codex.mode` mode-skip.

---

## Phase 2 — Codex `kind = prd` loop (mode-gated, closed-book, no validate)

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

- `kind = prd`
- `reviewer = codex`
- the resolved **epic** and the **PRD file path** `openspec/changes/<id>/prd.md`
- `deferMarker = true`

Phase 2 starts with **fresh loop state**: Phase 1's `rejected_findings` do **not** carry over — Codex is
an independent reviewer and its findings are evaluated on their own merits. The loop drives the
closed-book Codex review retargeted to the PRD file with **no** `openspec validate` (the caller reads
the PRD + any cited context, builds one self-contained prompt carrying the PRD rubric as the audit
instructions, and pipes it to `codex exec -s read-only` over stdin; Codex runs no commands), and
confirmed findings are fixed by editing the PRD until it terminates `DONE` or `ITERATION CAP REACHED`.

**Deliberate difference — NO `openspec validate`.** `codex-review-plan.md` inlines an authoritative
`openspec validate --strict` result; this PRD loop **omits it**, because a PRD precedes any
proposal/spec — there is nothing to validate. Stated explicitly so a maintainer does not add a validate
call that would error. This mirrors `ptp-review-brainstorm-full`.

---

## Combined terminal state + report

After the phases complete, fold them into **one** combined terminal state in the loop vocabulary:

| Combined terminal state | When | Class |
|-------------------------|------|-------|
| `BOTH PHASES DONE` | Phase 1 `DONE` and Phase 2 `DONE` | green |
| `PHASE 1 DONE — CODEX SKIPPED (mode=…)` | Phase 1 `DONE` and Codex skipped by mode | green |
| `PHASE 2 ITERATION CAP REACHED` | Phase 1 `DONE`, Phase 2 ran but did not converge | non-green |
| `ITERATION CAP REACHED` | Phase 1 capped (never reached `DONE`); Phase 2 not started | non-green |

The two green states both mean Phase 1 converged (Superpowers signed off on the PRD); the
`PHASE 1 DONE — CODEX SKIPPED (mode=…)` state is a **success** state (a converged single-reviewer run),
not a halt. The `Codex phase skipped (mode=…)` line is always reported (never silent).

**Report shape:**

- **Single epic:**
  1. Phase 1 loop summary — per-iteration table, total fixes, rejected/carry-over set, terminal state.
  2. Phase 2 loop summary (same) — or, if Codex was mode-skipped, the `Codex phase skipped (mode=…)`
     line in place of a Phase 2 table.
  3. The combined terminal state.
  4. The **next step** (`<change-id>` = the epic's lowest-numbered story id):
     - `/ptp:plan <change-id>` on **either** green state — `BOTH PHASES DONE` or
       `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (both mean the PRD is sound; proceed to author the
       OpenSpec artifacts).
     - On `ITERATION CAP REACHED` (Phase 1 capped — including the missing-PRD Critical): resolve the
       remaining findings (author the PRD via `/ptp:prd <epic>` first in the missing-PRD case, or re-run
       `/ptp:prd <epic>` to revise a thin one), then re-run `/ptp:review-prd-full <epic>`.
     - On `PHASE 2 ITERATION CAP REACHED`: resolve the remaining Codex findings, then re-run
       `/ptp:review-prd-full <epic>`.
- **Multi-epic selector:** a **summary table** first (`epic → combined terminal state`), then a
  **detail block for each epic that did not reach a green state** (`BOTH PHASES DONE` or
  `PHASE 1 DONE — CODEX SKIPPED (mode=…)`) — fully-converged epics need no detail. One combined marker
  per epic (see below).

---

## Review-convergence marker (single combined write)

This orchestrator drives **both** phase loops with **`deferMarker = true`** (per `ptp-review-loop`'s
**## Review-convergence marker** section), so **no phase writes the marker itself** — each phase instead
returns its terminal outcome (`terminalState`, `reviewer`, `iterations`) to this orchestrator. After the
run resolves (after Phase 2, or after Phase 1 if Phase 2 is gated off), the orchestrator performs
**exactly ONE** combined marker write per epic to
`openspec/changes/<id>/reviews/prd.json` (the `reviews/` subfolder created on demand, sibling to
`reviews/brainstorm.json` and `reviews/plan.json`), per the combined-outcome rule:

- `kind: "prd"`.
- `reviewers` = the **union of phases that actually ran** — `["superpowers"]` if Phase 1 capped (Phase 2
  never ran) or Codex was mode-skipped, `["superpowers","codex"]` if both phases ran.
- `terminalState` = that of the **last phase that ran** (`converged` if the last phase that ran reached
  `DONE`, else `cap-reached`).
- `iterations` = the **last phase's** iteration count.

The combined write uses the **same atomic write-temp-then-rename protocol** as `ptp-review-loop`
(serialize to a uniquely named temp file in `openspec/changes/<id>/reviews/`, then replace
`openspec/changes/<id>/reviews/prd.json` via a replace-if-exists rename only after the complete write
succeeds; on any failure clean up the temp file and leave the live marker untouched), so a failed
overwrite cannot truncate or corrupt the prior marker.

Because there is **never a provisional per-phase marker on disk** (every phase defers), there is no
window within a single run in which the marker under-reports the reviewer set. Failure semantics: on a
**first** review (no prior marker) a failed single write leaves **no** marker — and status falls back to
the inferred value — **never** a fabricated single-reviewer marker; on a **re-review** a failed
overwrite leaves the **prior run's real marker** in place (the accepted staleness case — there is no
freshness/expiry mechanism). A marker-write failure is reported but does not change the terminal state
the run reached. There is no `/ptp:status` PRD-review column requirement for this marker to be written.

For a **multi-epic selector**, iterate Phase 1 → gate → Phase 2 → combined marker per epic, writing
**one** combined marker per epic.

## Hard rules

- **Edits the PRD inline.** Each phase resolves confirmed findings by minimal targeted edits to
  `openspec/changes/<id>/prd.md` (corrections only — fill a missing schema section, sharpen a vague
  acceptance criterion, add a measurable goal).
- **Never regenerate the PRD via `/ptp:prd`.** Targeted hand-edits only — not re-fabrication. A
  missing-PRD Critical has nothing to edit and the iteration cap is the backstop.
- **Never run `openspec validate`.** A PRD precedes any proposal/spec — there is nothing to validate
  (the one deliberate divergence from `/ptp:review-plan-full`). Record
  `verify = N/A (PRD precedes any spec)`.
- **Never archive** the change. Archiving is always an explicit user action (`/ptp:archive`).
- **Never auto-commit** any edits made during either phase.
- **Don't start Phase 2 unless Phase 1 terminated `DONE`.** A Phase 1 `ITERATION CAP REACHED` STOPs the
  run — Phase 2 does not start.
- **Phase 2 uses fresh loop state.** Phase 1 `rejected_findings` do not carry into Phase 2.
- **Iteration cap per phase** is `review.maxIterations` from ptp config (default 5); each phase has its
  own independent cap.
- **Don't re-author the rubric.** The PRD-quality rubric stays in `ptp-review-prd`; only the disposition
  of findings (inline fix vs. report) changes here.
- **Both phases defer the marker; exactly one combined write per epic.** No phase writes its own
  marker; the orchestrator writes one combined `openspec/changes/<id>/reviews/prd.json` per epic.
- **Does not redo outer-session work.** Do not re-run the branch guard, re-resolve `codex.mode`, or
  re-resolve the epic — use the values the outer session passed in.
- **Codex only read-only over stdin.** Run Codex only under `codex exec -s read-only` with the prompt
  piped over **stdin** (`-`). Never `--full-auto`, `--sandbox workspace-write`, or
  `--dangerously-bypass-approvals-and-sandbox`. Codex runs **no** commands.
