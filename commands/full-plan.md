---
description: Orchestrate plan-multiple then per-slice review-plan-full across every slice of an oversized change — read-only planning, never applies code or archives (Codex per codex.mode — only required hard-requires the codex CLI; auto-missing/off runs Superpowers-only)
argument-hint: "<big-change-id-or-request>"
---

You are running **`/ptp:full-plan`** — a planning orchestrator that decomposes an oversized change into slices and then runs the full two-phase plan review on every slice, in one invocation. It chains the existing `/ptp:plan-multiple` and `/ptp:review-plan-full` commands so a multi-slice change can be planned-and-plan-reviewed end to end without typing each stage by hand.

This is a **read-only planning** flow. It never applies code and never archives. The next step after it is `/ptp:full-run`.

## Inputs

The oversized change id or request: $ARGUMENTS

Interpret it both ways, exactly as `/ptp:plan-multiple` does: if `$ARGUMENTS` names an existing `openspec/changes/<id>/` folder, treat it as a monolithic plan to re-cut; otherwise treat it as a fresh request to plan as multiple slices.

## Branch safety (first step)

Run the **`ptp-branch-guard`** preamble **once up front**, before delegating to `plan-multiple`: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from this request (or the fresh epic → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** any sub-step runs; if you are already on a feature branch it is a **no-op** — proceed as-is. Delegated sub-commands re-run the guard as a no-op once HEAD is on the branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Check before doing any work:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** and apply its decision contract (the per-slice `review-plan-full` stage is the Codex consumer). Under **`required`**, run `codex --version`; if missing, **STOP** with the install-or-change-mode message and do **not** invoke `ptp:plan-multiple`. Under **`auto`** or **`off`**, **proceed**: each slice's `review-plan-full` applies the per-slice Codex skip itself (Superpowers-only, non-silent) and reports a mode-skipped review as a green terminal state. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.

## What this command does

1. **Decompose.** Invoke the `ptp:plan-multiple` skill with `$ARGUMENTS`. It produces an ordered set of slice change-ids (`XXXX_NN_…` epic-then-story order under one allocated epic) and writes each slice's OpenSpec artifacts. Capture that ordered id list using the full `XXXX_NN_<desc>` ids.
   - **Single-change fallback.** If `plan-multiple` determines the work is one coherent unit, it falls back to a single `/ptp:plan` and reports exactly one change id (`XXXX_01_<desc>`). That is fine — the slice set is one id and step 2 runs `review-plan-full` once.

2. **Plan-review each slice, in order.** For each slice id in the captured order, invoke the `ptp:review-plan-full` command. It runs the two-phase Superpowers→Codex artifact-review loop to its terminal state for that slice's `proposal.md` / `design.md` / `tasks.md` / spec deltas.
   - **Convergence gate (symmetric).** Both `BOTH PHASES DONE` and `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (Codex intentionally skipped by `codex.mode`; per `ptp-codex-mode` this is gate-success) are green and converged. If a slice's `review-plan-full` terminates with `PHASE 2 ITERATION CAP REACHED` (or `ITERATION CAP REACHED`), **STOP** after that slice. Report which slice did not converge and do **not** start the plan review of any later slice.

3. **Report.** After the last slice (or at a convergence STOP), report:
   - The slices created, in order, each with its one-line scope.
   - Per-slice plan-review terminal state (`BOTH PHASES DONE` / `PHASE 1 DONE — CODEX SKIPPED (mode=…)` / `PHASE 2 ITERATION CAP REACHED` / `ITERATION CAP REACHED`); never collapse a mode-skipped slice into a plain both-phases label, so the skip stays visible.
   - The exact next command: `/ptp:full-run` (which applies each slice at the model from its `effort.md` automatically — the apply runs in a workflow agent that carries that model).

## Model/effort posture

`full-plan` has **no apply stage** — every stage it runs (planning via `plan-multiple`, plan review via `review-plan-full`) targets `opus.high`, the policy default for all non-apply stages. It therefore has **no effort gate** and there is deliberately **no `full-plan-effort` variant**: the gate only exists to honor `effort.md` at apply time, which this command never reaches. It runs entirely at the current session model/effort (expected `opus.high`). If the session is below `opus.high`, **note a reminder** but do **not** stop.

## Hard rules

- Do **not** apply code. This command plans and plan-reviews only; the next command is `/ptp:full-run`.
- Do **not** archive any change. Archiving is always an explicit `/ptp:archive <id>` user action.
- Do **not** auto-commit any edits made during planning or plan review.
- Do **not** start a later slice's plan review if an earlier slice did not converge (`PHASE 2 ITERATION CAP REACHED`).
- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode before any work; only `required` hard-requires Codex (STOP without work if `codex --version` fails). Under `auto`/`off`, proceed and each slice's `review-plan-full` applies its own non-silent Codex skip.
- Do **not** stop to switch models — `full-plan` has no effort gate; at most it reminds when the session is below `opus.high`.
