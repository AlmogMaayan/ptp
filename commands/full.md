---
description: Plan-and-run an oversized change end to end in one invocation — full-plan (decompose + per-slice plan-review) then, on full plan convergence, continue without stopping into full-run (apply + code-review per slice). Read-then-write; never archives (uses Codex per codex.mode — only required hard-requires the codex CLI)
argument-hint: "<big-change-id-or-request>"
---

`/ptp:full` is the union of `/ptp:full-plan` and `/ptp:full-run`: it runs the full-plan flow and then **continues without stopping** into the full-run flow. The per-flow detail lives in the `/ptp:full-plan` command, the `ptp-full-run` skill, and the shared `ptp-full` skill — this command defers to them rather than restating their detail. The seam between the two is the whole reason this command exists: the slice ids produced by planning are handed to the run phase as an **explicit id list**, so the run phase skips the scope-confirmation stop it would do on a no-arg invocation.

## Inputs

The oversized change id or request: $ARGUMENTS

Interpret it both ways, exactly as `/ptp:plan-multiple` does: if `$ARGUMENTS` names an existing `openspec/changes/<id>/` folder, treat it as a monolithic plan to re-cut; otherwise treat it as a fresh request to plan as multiple slices.

## Branch safety (first step)

Run the **`ptp-branch-guard`** preamble **once up front**, before either phase writes: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from this request (or the fresh epic → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** the plan phase runs; if you are already on a feature branch it is a **no-op** — proceed as-is. The delegated `plan` / `apply` commands and the run workflow's agents re-run the guard as a no-op once HEAD is on the branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Check before doing any work:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** (one resolution covers the whole command). Apply its decision contract: under **`required`** the `codex` CLI must be on PATH — run `codex --version`, and if missing **STOP** up front with the install-or-change-mode message, doing no work in either phase. Under **`auto`** or **`off`** the command **proceeds**: each phase's `review-plan-full` / `review-full` then applies the per-phase Codex skip itself (Superpowers-only, non-silent), and a mode-skipped phase is treated as convergence by the gates. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.

## What this command does

Drive the `ptp-full` skill, which orchestrates two phases with two gates and the glue between them:

1. **Plan phase (the `/ptp:full-plan` flow).** Invoke `ptp:plan-multiple` with `$ARGUMENTS`, capture the ordered slice ids (`XXXX_NN_<desc>`, epic-then-story order; single-change fallback → one id), then invoke `ptp:review-plan-full` for each slice in order to its terminal state.
2. **Plan-convergence gate.** A slice's `review-plan-full` ends in one of these states: `BOTH PHASES DONE` (green), `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (green — Codex intentionally skipped by `codex.mode`; per `ptp-codex-mode` this is gate-success), `ITERATION CAP REACHED` (Phase-1 cap), or `PHASE 2 ITERATION CAP REACHED` (Phase-2 cap). Treat **both** green states (`BOTH PHASES DONE` and `PHASE 1 DONE — CODEX SKIPPED`) as converged and proceed. If a slice ends in **any non-green state**, **STOP after that slice** — do not plan-review later slices and **do not enter the run phase**. Applying code from a plan that did not fully converge is exactly what this prevents.
3. **Run phase (the `ptp-full-run` flow), only on full plan convergence.** Read each captured slice's `effort.md` (line 1 = `{model}.{effort}`; missing/unparseable → default `opus.high`, noted), build `stories = [{ id, model, effort }, …]` in plan order, and launch:
   ```
   Workflow({ name: 'ptp-full-run', args: { stories } })
   ```
   The workflow runs `apply → review-full` per slice sequentially. Because the ids are passed explicitly, **there is no scope-confirmation stop** — the handoff is automatic.
4. **Report.** Per the `ptp-full` skill's *Terminal report*: at a plan-convergence STOP, report the slices and which one did not converge and that the run phase was not entered; on completion/run-halt, report the plan summary then the `ptp-full-run` three-bucket terminal report (plus a `/ptp:archive <id>` recommendation per fully-processed slice, never auto-run).

## Model/effort posture

`/ptp:full` has **no effort gate** and no `full-effort` variant. The plan phase targets `opus.high`; the run phase's apply agents each carry their own model from `effort.md` and review at `opus`, all inside workflow agents — nothing to gate. If the session is below `opus.high` when the plan phase runs, **note a reminder** but do **not** stop.

## Hard rules

- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only `required` hard-requires Codex (STOP with no work if `codex --version` fails). Under `auto`/`off` the command proceeds and each phase applies its own non-silent Codex skip.
- **The plan-convergence gate blocks the run phase** — enter the run phase only if every slice reached a green state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED`); never apply code from a plan that ended in `ITERATION CAP REACHED` or `PHASE 2 ITERATION CAP REACHED`.
- **Never apply code in the plan phase**; code is applied only in the run phase, only after full plan convergence.
- **Never archive** any slice — archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during planning, plan review, apply, or code review.
- **Never re-confirm scope between phases** — the captured slice ids are passed explicitly so the run phase does not stop.
- **The run-convergence gate halts the whole run** — a slice whose review is not `BOTH_PHASES_DONE` stops the loop.
- **A missing/unparseable `effort.md` defaults to `opus.high`** and is noted — never crash, never stop on it.
