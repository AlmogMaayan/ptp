---
description: Orchestrate plan-multiple then per-slice review-plan-full across every slice of an oversized change — read-only planning, never applies code or archives (requires codex CLI on PATH)
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

1. The `codex` CLI must be on PATH (the per-slice `review-plan-full` stage requires it). Run `codex --version` to check. If missing, **STOP** and tell the user to install it — do **not** fall back to a Superpowers-only plan review, and do **not** invoke `ptp:plan-multiple`.

## What this command does

1. **Decompose.** Invoke the `ptp:plan-multiple` skill with `$ARGUMENTS`. It produces an ordered set of slice change-ids (`XXXX_NN_…` epic-then-story order under one allocated epic) and writes each slice's OpenSpec artifacts. Capture that ordered id list using the full `XXXX_NN_<desc>` ids.
   - **Single-change fallback.** If `plan-multiple` determines the work is one coherent unit, it falls back to a single `/ptp:plan` and reports exactly one change id (`XXXX_01_<desc>`). That is fine — the slice set is one id and step 2 runs `review-plan-full` once.

2. **Plan-review each slice, in order.** For each slice id in the captured order, invoke the `ptp:review-plan-full` command. It runs the two-phase Superpowers→Codex artifact-review loop to its terminal state for that slice's `proposal.md` / `design.md` / `tasks.md` / spec deltas.
   - **Convergence gate (symmetric).** If a slice's `review-plan-full` terminates with `PHASE 2 ITERATION CAP REACHED`, **STOP** after that slice. Report which slice did not converge and do **not** start the plan review of any later slice.

3. **Report.** After the last slice (or at a convergence STOP), report:
   - The slices created, in order, each with its one-line scope.
   - Per-slice plan-review terminal state (`BOTH PHASES DONE` / `PHASE 2 ITERATION CAP REACHED`).
   - The exact next command: `/ptp:full-run` (which applies each slice at the model from its `effort.md` automatically — the apply runs in a workflow agent that carries that model).

## Model/effort posture

`full-plan` has **no apply stage** — every stage it runs (planning via `plan-multiple`, plan review via `review-plan-full`) targets `opus.high`, the policy default for all non-apply stages. It therefore has **no effort gate** and there is deliberately **no `full-plan-effort` variant**: the gate only exists to honor `effort.md` at apply time, which this command never reaches. It runs entirely at the current session model/effort (expected `opus.high`). If the session is below `opus.high`, **note a reminder** but do **not** stop.

## Hard rules

- Do **not** apply code. This command plans and plan-reviews only; the next command is `/ptp:full-run`.
- Do **not** archive any change. Archiving is always an explicit `/ptp:archive <id>` user action.
- Do **not** auto-commit any edits made during planning or plan review.
- Do **not** start a later slice's plan review if an earlier slice did not converge (`PHASE 2 ITERATION CAP REACHED`).
- Fail fast without `codex` — check `codex --version` before any work and STOP if missing; no Superpowers-only fallback.
- Do **not** stop to switch models — `full-plan` has no effort gate; at most it reminds when the session is below `opus.high`.
