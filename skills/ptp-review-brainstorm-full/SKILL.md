---
name: ptp-review-brainstorm-full
description: Use this skill when running the dual-reviewer report-only brainstorm review behind /ptp:review-brainstorm-full — the Superpowers + Codex variant of /ptp:review-brainstorm. Owns the dual-reviewer brainstorm-review contract: Phase 1 Superpowers brainstorm review (composing the ptp-review-brainstorm rubric), a Phase-1-gates-Phase-2 gate, Phase 2 Codex closed-book read-only brainstorm review (mode-gated per ptp-codex-mode, no openspec validate), and a combined verdict. Report-only: runs each reviewer once, never loops, never hand-edits the brainstorm, runs no openspec validate, runs no branch guard, and triggers no other ptp command.
---

# ptp-review-brainstorm-full — the dual-reviewer report-only brainstorm-review methodology

## Purpose

This skill owns the **dual-reviewer (Superpowers + Codex) report-only** brainstorm-review contract
and is the **single source of truth** the thin `/ptp:review-brainstorm-full` command delegates to —
the same command-backed-by-a-skill split as `commands/config.md` → `skills/ptp-config/SKILL.md`. The
command is a front door; this skill holds the substance.

It is the **dual-reviewer variant of `/ptp:review-brainstorm`**, exactly as `/ptp:review-plan-full`
is to `/ptp:review-plan` and `/ptp:review-full` is to `/ptp:review`. It reviews a change's
**`brainstorm.md`** with two independent reviewers — a Superpowers pass and a Codex pass — and emits
a **combined verdict**, before any proposal/spec artifacts exist, so a thin or hand-wavy brainstorm is
caught (now from two angles) *before* it silently yields thin OpenSpec artifacts.

---

## Resolved tension: report-only, NOT a fix loop

`-full` elsewhere means "run both reviewers as inline-fixing convergence loops" — `/ptp:review-full`
and `/ptp:review-plan-full` both drive `ptp-review-loop` with a fix pass plus an iteration cap. The
shipped `/ptp:review-brainstorm` is **deliberately report-only**: it never hand-edits the brainstorm;
on a non-pass it tells the user to re-run `/ptp:brainstorm`.

This skill resolves that tension in favor of **report-only**, to stay internally consistent with the
shipped `/ptp:review-brainstorm`. It runs **each reviewer once** and emits a **combined verdict** — it
does **not** loop, does **not** count findings to zero, and does **not** edit the brainstorm.
Consequences, stated explicitly here so a maintainer does not "restore" loop/fix machinery that would
contradict the sibling command:

- **No iteration cap.** There is **no** `review.maxIterations`, **no** `ITERATION CAP REACHED`, and
  **no** `PHASE 2 ITERATION CAP REACHED` terminal state — those belong to fix loops, and there is no
  fix loop here.
- **No `ptp-review-loop` involvement.** This skill does **not** invoke `ptp-review-loop` and does
  **not** add a `brainstorm` kind to it. The shared loop skill is untouched.
- **No inline fixing.** Neither phase edits the brainstorm. Findings are reported; the user revises by
  re-running `/ptp:brainstorm`.

What *is* reused from the `-full` family is its **orchestration shape and vocabulary** where it
genuinely applies: two phases with Phase 1 gating Phase 2, `ptp-codex-mode` gating of the Codex phase,
the whole orchestration wrapped via `ptp-run-at-model` at `opus.high` (driven by the command), and the
mode-skip terminal state `PHASE 1 DONE — CODEX SKIPPED (mode=…)` with its non-silent
`Codex phase skipped (mode=…)` summary line.

---

## Phase 1 — Superpowers brainstorm review (composed, not re-authored)

Phase 1 runs the existing **`ptp-review-brainstorm`** skill's methodology over the resolved scope.
**Defer** to that skill — do **not** restate the rubric here, so it lives in exactly one place:

- **Locate the brainstorm** — change-scoped `openspec/changes/<id>/brainstorm.md` preferred; the
  deterministic general `openspec/brainstorms/*-brainstorm.md` fallback only when unambiguously
  associated; empty-argument scope = every active change. (The exact ordering and the association rule
  are the `ptp-review-brainstorm` skill's.)
- **Apply the rubric** — existence & non-placeholder; ≥2 real options with the four tradeoff axes plus
  spec-interaction; recommendation with rationale; assumptions; scope/blast-radius; spec interaction;
  usable handoff to `/ptp:plan`.
- **Classify** Critical / High / Medium / Low.
- **Assign** the PASS / WARN / FAIL verdict.

Phase 1 is **report-only** — it never hand-edits the brainstorm.

---

## Phase-1-gates-Phase-2 gate

Phase 2 proceeds **only when a brainstorm was located** — the gate is "was a brainstorm located and
reviewed," **not** "did Phase 1 converge to zero findings" (there is no fix loop here, so there is no
`DONE`-to-converge gate as in the inline-fix `-full` siblings):

- **Located brainstorm (PASS / WARN / FAIL all count).** Phase 2 proceeds. A thin-brainstorm
  WARN/FAIL does **not** block the Codex second opinion — the value of a dual review is getting *both*
  independent verdicts on the *same* brainstorm.
- **No brainstorm located (the Critical "no brainstorm to review" FAIL).** Phase 2 is **skipped** —
  there is no brainstorm text for Codex to second-opinion, so a second opinion is impossible. The run
  goes straight to the combined `REVIEW FINDINGS — REVISE BRAINSTORM` state, recommending
  `/ptp:brainstorm <change-id>` **first** (the brainstorm must be authored before there is anything to
  second-opinion). This Phase-2 skip is caused by the **missing brainstorm** and is reported
  **distinctly** from a `codex.mode` mode-skip — via the `Codex phase skipped (no brainstorm located)`
  line in the report (see *Combined verdict + report*), **not** the `Codex phase skipped (mode=…)` line.

The locate / missing-file rule itself is the existing `ptp-review-brainstorm` skill's — this skill
does not re-author it.

---

## Phase 2 — Codex brainstorm review (mode-gated, closed-book, no validate)

**Mode gate (per `ptp-codex-mode`).** Apply the `ptp-codex-mode` decision contract to the mode the
command resolved in its outer preconditions:

- **Skip** Codex when the decision is to skip (`off`, or `auto` with `codex` not on PATH): do **not**
  start Phase 2 and add the non-silent `Codex phase skipped (mode=…)` line to the summary. The
  combined terminal state is then the green `PHASE 1 DONE — CODEX SKIPPED (mode=…)` **only when
  Superpowers PASSed**; a Superpowers WARN/FAIL with Codex mode-skipped is `REVIEW FINDINGS — REVISE
  BRAINSTORM` per the precedence below.
- (`required` + `codex` missing already **STOPped** in the command's outer preconditions — it never
  reaches this skill.)

**Closed-book mechanics (from `codex-review-plan.md`, retargeted to the brainstorm).** When the mode
permits Codex, the caller (the subagent) does **all** the reading and assembles **one** self-contained
prompt:

1. **Read** the brainstorm (and any cited existing specs/changes for context) — you, via Read.
2. **Build ONE closed-book prompt** containing, in order:
   - the **brainstorm rubric** as the audit instructions — the same rubric `ptp-review-brainstorm`
     defines (≥2 options with the four tradeoff axes plus spec-interaction; recommendation with
     rationale; assumptions; scope/blast-radius; spec interaction; usable handoff), instructing Codex
     to classify findings Critical / High / Medium / Low and to **end with exactly one line**
     `VERDICT: PASS` | `VERDICT: WARN` | `VERDICT: FAIL`;
   - the **full text of the brainstorm** under a clear delimiter (e.g. `=== brainstorm.md ===`);
   - any cited context excerpts under `--- SOURCE <path> ---` delimiters;
   - a **hard instruction block**: *"Do NOT run any commands. Review only the text provided above.
     There is NO `openspec validate` step — a brainstorm precedes any proposal or spec, so there is
     nothing to validate. If a check needs data not provided here, report it as 'unverifiable from
     provided context' rather than trying to run a command."*
3. **Run Codex closed-book over stdin** (you, via Bash from the repo root):
   ```bash
   printf '%s' "$PROMPT" | codex exec -s read-only -
   ```
   - Always pipe the prompt via **stdin** (`-`), never as a quoted argv string.
   - Keep `-s read-only`. **Never** pass `--full-auto`, `--sandbox workspace-write`, or
     `--dangerously-bypass-approvals-and-sandbox` — loosening the sandbox is the wrong fix for a
     review. Codex runs **no** commands here, so any sandbox noise (`blocked by policy`,
     `spawn setup refresh`) is harmless — proceed to relay the verdict.

**Deliberate difference — NO `openspec validate`.** `codex-review-plan.md` inlines an authoritative
`openspec validate --strict` result; this brainstorm review **omits it**, because a brainstorm
precedes any proposal/spec — there is nothing to validate. This omission is stated explicitly so a
maintainer does not add a validate call that would error, exactly as `ptp-review-brainstorm` does.

---

## Combined verdict + report

Fold the two per-reviewer verdicts (Superpowers PASS/WARN/FAIL; Codex PASS/WARN/FAIL **or** skipped)
into **one** combined terminal state. Evaluate the rows **top to bottom and take the first match** —
`REVIEW FINDINGS` has **precedence** over the green mode-skip state, so a non-pass is **never** masked
as green:

| Combined terminal state | When (first match wins) | Class |
|-------------------------|-------------------------|-------|
| `REVIEW FINDINGS — REVISE BRAINSTORM` | at least one reviewer returned WARN or FAIL (including a Superpowers WARN/FAIL when Codex was mode-skipped; including the missing-brainstorm Critical FAIL) | non-green |
| `BOTH REVIEWERS PASS` | Superpowers PASS **and** Codex PASS | green |
| `PHASE 1 DONE — CODEX SKIPPED (mode=…)` | Superpowers **PASS** and Codex skipped by mode | green |

The non-green `REVIEW FINDINGS` row is listed **first** deliberately: the green mode-skip state is
reached **only when Superpowers PASSed** and Codex was skipped — a Superpowers WARN/FAIL with Codex
mode-skipped is a `REVIEW FINDINGS — REVISE BRAINSTORM` outcome (the `Codex phase skipped (mode=…)`
line is still reported, but the combined state is non-green). One non-pass label covers both WARN and
FAIL because the remedy is identical — regenerate via `/ptp:brainstorm` — and brainstorm review, being
advisory and report-only, draws no apply/archive gate off the WARN/FAIL distinction.

**Always report each reviewer's outcome under the combined state** — the per-reviewer PASS/WARN/FAIL
verdict for every reviewer that **ran**, and an explicit skip line for any reviewer that did **not**
run (Codex when mode-skipped, or Codex when Phase 2 was skipped for a missing brainstorm) — so a
reviewer disagreement (one PASS, one WARN/FAIL) **and** a skipped second reviewer are both visible.
A skipped Codex reviewer has no PASS/WARN/FAIL verdict; report its skip line instead.

**Report shape:**

- **Single change:** the Phase 1 (Superpowers) findings grouped by severity + its verdict; then, for
  Phase 2, **one** of: the Codex findings + its verdict (Codex ran); the `Codex phase skipped
  (mode=…)` line (Codex mode-skipped per `ptp-codex-mode`); or the `Codex phase skipped (no brainstorm
  located)` line (Phase 2 skipped because no brainstorm was located — reported **distinctly** from a
  mode-skip per the gate above); the combined terminal
  state; the **next step**:
  - `/ptp:plan <change-id>` on **either** green state — `BOTH REVIEWERS PASS` or `PHASE 1 DONE — CODEX
    SKIPPED (mode=…)` — both of which mean Superpowers PASSed, so the user proceeds to plan.
  - On `REVIEW FINDINGS — REVISE BRAINSTORM`: re-run `/ptp:brainstorm <change-id>` to revise (when a
    brainstorm exists but is thin) or to author it first (the missing-brainstorm case), then re-run
    `/ptp:review-brainstorm-full <change-id>`.
- **All changes / multi-change (empty argument):** a **summary table** first (`change-id → combined
  state` + each reviewer's **outcome** — the PASS/WARN/FAIL verdict for a reviewer that ran, or its
  skip reason for a Codex reviewer that did not run: `skipped (mode=…)` or `skipped (no brainstorm
  located)`), then a **detail block for each change that is not `BOTH REVIEWERS PASS`** — mirroring
  `ptp-review-brainstorm`'s all-changes report. Both-PASS changes need no detail.

**Never hand-edit the brainstorm** — mirrors `/ptp:review-brainstorm`'s and `/ptp:review-plan`'s
"report, don't silently fix" rule.

---

## Hard rules

- **Read-only.** Edit nothing — including the brainstorm. Fix nothing. Write no file.
- **No git.** Run no git operation.
- **No branch guard.** Run **no** `ptp-branch-guard` and **never** launch `ptp-branch-prep` — this is
  a read-only review (like `/ptp:review-brainstorm`, `/ptp:review-plan`, the other read-only
  reviewers, and `/ptp:status`).
- **No `openspec validate`.** A brainstorm precedes any proposal/spec — there is nothing to validate.
- **No inline fix loop.** Run each reviewer **once**. Do not loop, do not count findings to zero, do
  not invoke `ptp-review-loop`, and have no iteration cap.
- **Trigger no other ptp command.** Do not invoke `/ptp:plan`, `/ptp:brainstorm`,
  `/ptp:review-brainstorm`, or any other ptp command. Recommend the next command in **text only**; the
  user runs it explicitly.
- **Codex only read-only over stdin.** Run Codex only under `codex exec -s read-only` with the prompt
  piped over **stdin** (`-`). Never `--full-auto`, writable, or bypassed sandbox. Codex runs **no**
  commands.
