---
name: ptp-full
description: End-to-end plan-then-run orchestration for /ptp:full. Runs the full-plan flow (plan-multiple → per-slice review-plan-full) and, only if every slice's plan-review converges, continues without stopping into the full-run flow (apply → review-full per slice) by passing the captured slice ids explicitly. Stops before applying any code if a slice's plan-review does not converge. Never commits, never archives.
---

# ptp-full — plan-then-run end-to-end orchestration

## Purpose

This skill is the orchestration contract behind the single `/ptp:full` command. It is the union of `/ptp:full-plan` and `/ptp:full-run`: it decomposes an oversized change into slices and plan-reviews each (the **plan phase**), then — without a user re-invocation in between — applies and code-reviews each slice (the **run phase**). The point of having one command is the **automatic handoff**: the slice ids produced by planning are passed *explicitly* into the run phase, so the run phase skips the scope-confirmation stop that `/ptp:full-run` performs on a no-arg invocation. "Run full-plan and continue without stopping to full-run."

It does not restate the detail of the two underlying flows. The plan phase **is** the `/ptp:full-plan` command's flow; the run phase **is** the `ptp-full-run` skill's flow. This skill owns only the **two gates and the glue between them**:

- the single up-front `codex.mode` resolution (per the `ptp-codex-mode` skill) that covers both phases,
- capturing the ordered slice ids out of the plan phase,
- the **plan-convergence gate** that refuses to enter the run phase if any slice's plan-review did not converge,
- handing the captured ids to the run phase as an explicit id list (which suppresses the run phase's scope-confirmation stop).

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `big-change-id-or-request` | an existing `openspec/changes/<id>/` folder to re-cut, **or** a fresh request to plan as multiple slices | Passed through from `$ARGUMENTS`. Interpreted both ways exactly as `ptp:plan-multiple` interprets it. |

There is no effort/model input. The plan phase runs at the session model (expected `opus.high`); the run phase reads each slice's `effort.md` for its apply model and reviews at `opus.high`. There is **no effort gate** — see *Model/effort posture*.

## Precondition (checked once, up front)

**Resolve `codex.mode` once, up front, per the `ptp-codex-mode` skill** (it is the single source of truth for resolution + the decision contract). One resolution covers the whole command; nothing in the run changes the mode, so it is not re-resolved before the run phase.

- **`required`** — Codex is mandatory in both phases (plan phase's `review-plan-full` Codex artifact loop and run phase's `review-full` Codex code loop). Run `codex --version`; if missing → **STOP** immediately with the install-or-change-mode message and do **no** work: do not invoke `ptp:plan-multiple`, do not launch the run workflow.
- **`auto` / `off`** — **proceed**; do not STOP up front. Each phase's `review-plan-full` / `review-full` applies the per-phase Codex skip itself (Superpowers-only, non-silent), and a mode-skipped phase is treated as convergence by both gates (see the gates below). Under `auto`, a phase probes PATH and skips only if `codex` is absent; under `off`, it skips without probing.

## Phase A — plan (the `/ptp:full-plan` flow)

Run the `/ptp:full-plan` flow exactly as that command specifies:

1. **Decompose.** Invoke the `ptp:plan-multiple` skill with `$ARGUMENTS`. Capture the ordered set of full slice change-ids (`XXXX_NN_<desc>`, epic-then-story order under one allocated epic). **Single-change fallback:** if the work is one coherent unit, `plan-multiple` falls back to one `/ptp:plan` and reports exactly one id — that is fine, the slice set is one id.
2. **Plan-review each slice, in order.** For each captured slice id, invoke the `ptp:review-plan-full` command (two-phase Superpowers→Codex artifact-review loop) to its terminal state.
3. **Plan-convergence gate (symmetric, and it also gates the run phase).** A slice's `review-plan-full` has these terminal outcomes: `BOTH PHASES DONE` (green), `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (green — Phase 1 converged and Codex was intentionally skipped by `codex.mode`; per `ptp-codex-mode` this is gate-success), `ITERATION CAP REACHED` (Phase 1 capped, Phase 2 never ran), or `PHASE 2 ITERATION CAP REACHED` (Phase 1 converged, Phase 2 capped). Treat **both green states** (`BOTH PHASES DONE` and `PHASE 1 DONE — CODEX SKIPPED`) as converged. If a slice terminates in **any non-green state** (`ITERATION CAP REACHED` or `PHASE 2 ITERATION CAP REACHED`), **STOP after that slice**: do not plan-review any later slice, **and do not enter the run phase at all**. Keying the gate on the green states — not just on the Phase-2 cap — is deliberate: a Phase-1 cap is equally non-converged, and applying code from a plan that did not fully converge is exactly what this gate prevents; a mode-skip, by contrast, is a legitimate convergence and must NOT be misread as a halt. Report which slice did not converge and its terminal state (see *Terminal report*).

Phase A is read-only: it never applies code and never archives. It always writes each slice's OpenSpec artifacts including `effort.md` (the run phase depends on `effort.md` existing).

## Phase B — run (the `ptp-full-run` flow), only on full plan convergence

Enter Phase B **only if every** captured slice reached a green plan-convergence state in Phase A (`BOTH PHASES DONE` **or** `PHASE 1 DONE — CODEX SKIPPED (mode=…)` — both are gate-success per `ptp-codex-mode`). Then run the `ptp-full-run` skill's flow with the captured slice ids treated as an **explicit, ordered id list** (the plan order *is* the apply/dependency order):

1. **Read each slice's effort.** For each captured id, `Read` `openspec/changes/<id>/effort.md` and parse line 1 as `{model}.{effort}`. Missing or unparseable → default to `opus.high` and **note the defaulting** (never crash, never stop on it). This yields `{ id, model, effort }` per slice.
2. **Launch the run workflow** with the slices in plan order:
   ```
   Workflow({ name: 'ptp-full-run', args: { stories } })
   ```
   where `stories = [{ id, model, effort }, …]`. The workflow loops the slices in order, spawning `agentType:'ptp:ptp-apply'` at each slice's `model` (effort injected as a prompt directive) then `agentType:'ptp:ptp-review'` at `opus`, one slice fully before the next, and returns `{ results, halted, total }`.
3. **Run-convergence gate (the workflow's `halted`).** A slice whose apply does not reach `stageReached === 'completed'`, or whose review `terminalState !== 'BOTH_PHASES_DONE'`, halts the **whole run** — the workflow stops the loop. This is the run phase's own gate, identical to `/ptp:full-run`; it is independent of the plan-convergence gate.

**No scope-confirmation stop.** Because the captured slice ids are passed as an explicit id list, the run phase skips the one-time no-arg scope confirmation that `ptp-full-run` performs only on discovery. This is what makes the handoff seamless — there is no second user invocation between planning and running.

## Terminal report

Report at whichever terminal point is reached:

- **`required` + `codex` missing** → the install-or-change-mode message only (no work done). Under `auto`/`off` there is no up-front stop.
- **Plan-convergence STOP** (a slice reached a non-green state) → the slices created so far, in order, each with its one-line scope and per-slice plan-review terminal state (`BOTH PHASES DONE` / `PHASE 1 DONE — CODEX SKIPPED (mode=…)` / `ITERATION CAP REACHED` / `PHASE 2 ITERATION CAP REACHED`); state plainly that the run phase was **not** entered. A slice that ended in `PHASE 1 DONE — CODEX SKIPPED` is **converged**, not a reason to stop. Recommend fixing the non-converged slice's artifacts (return to `/ptp:plan` for a Phase-1 cap, or `/ptp:review-fix` for Phase-2 Codex findings) and re-running `/ptp:full` (or `/ptp:review-plan-full <id>` for just that slice). The earlier slices that already reached `BOTH PHASES DONE` can be run on their own with `/ptp:full-run <converged-ids…>` if the user prefers to proceed with them first.
- **Ran to completion / run-phase halt** → first the plan-phase summary (slices in order, each one-line scope, each with its actual green plan-convergence state — `BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`; never collapse a mode-skipped slice into a plain both-phases label, so the skip stays visible), then the `ptp-full-run` **three-bucket terminal report** exactly as that skill specifies — `processed` / `applied (review pending)` / `never-started`, the per-slice outcome table, the resume command for the unprocessed tail, and a `/ptp:archive <id>` recommendation per fully-processed slice (never auto-run). Defer the bucket math to `ptp-full-run`; do not restate it here.

## Model/effort posture

There is **no effort gate** and no model/effort-switch suggestion. The plan phase targets `opus.high` (the policy default for all non-apply stages); the run phase's apply agents each carry their own model from `effort.md` and review agents run at `opus` — both inside workflow agents, so there is no single-dial session thrash to gate against. If the *session* model is below `opus.high` when the plan phase runs, **note a reminder** but do **not** stop. There is deliberately no `full-effort` variant.

## Hard rules

- **Branch safety, once up front.** Before either phase writes, run the `ptp-branch-guard` preamble: if HEAD is `master`, cut a feature branch (`ptp/epic-XXXX`) via the `ptp-branch-prep` workflow before the plan phase begins; if already on a feature branch, no-op. The delegated `plan`/`apply` commands and the run workflow's agents re-run the guard as a no-op once HEAD is on the branch. Defined once in the `ptp-branch-guard` skill.
- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only `required` hard-requires Codex (STOP with no work if `codex --version` fails). Under `auto`/`off` the command proceeds and each phase applies its own non-silent Codex skip — a mode-skipped phase is convergence, not a fallback failure.
- **The plan-convergence gate blocks the run phase.** Enter the run phase only if **every** slice reached a green state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED`). If any slice ends in `ITERATION CAP REACHED` (Phase-1 cap) or `PHASE 2 ITERATION CAP REACHED` (Phase-2 cap), do not apply any code — STOP after the plan phase and report. A `PHASE 1 DONE — CODEX SKIPPED` slice is converged and does NOT block the run phase.
- **Never apply code in the plan phase.** Code is applied only in Phase B, and only after full plan convergence.
- **Never archive** any slice. Archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during planning, plan review, apply, or code review.
- **Never re-confirm scope between phases.** The handoff is automatic; the captured slice ids are passed explicitly so the run phase does not stop.
- **The run-convergence gate halts the whole run** — a slice whose review is not `BOTH_PHASES_DONE` stops the loop; do not continue to the next slice.
- **A missing/unparseable `effort.md` defaults to `opus.high`** and is noted — never crash, never stop on it.
