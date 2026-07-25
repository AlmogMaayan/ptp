---
description: Plan-and-apply an oversized change end to end in one invocation — full-plan (decompose + per-slice plan-review) then, on full plan convergence, continue without stopping into full-apply (apply + code-review per slice). Read-then-write; never archives (uses Codex per codex.mode — only required hard-requires the codex CLI)
argument-hint: "<big-change-id-or-request>"
---

`/ptp:full` is the union of `/ptp:full-plan` and `/ptp:full-apply`: it runs the full-plan flow and then **continues without stopping** into the full-apply flow. The per-flow detail lives in the `/ptp:full-plan` command, the `ptp-full-apply` skill, and the shared `ptp-full` skill — this command defers to them rather than restating their detail. The seam between the two is the whole reason this command exists: the slice ids produced by planning are handed to the apply phase as an **explicit id list**, so the apply phase skips the scope-confirmation stop it would do on a no-arg invocation.

## Inputs

The oversized change id or request: $ARGUMENTS

Interpret it both ways, exactly as `/ptp:plan-multiple` does: if `$ARGUMENTS` names an existing `openspec/changes/<id>/` folder, treat it as a monolithic plan to re-cut; otherwise treat it as a fresh request to plan as multiple slices. `$ARGUMENTS` may additionally carry an anywhere-in-text `fast:on` / `fast:off` switch (default off) declaring that this invocation's opus agents should run in Claude Code fast mode. The token is stripped **before** `$ARGUMENTS` is interpreted as an existing change folder or a fresh request — see "Parse the `fast:` switch" below (precondition 2); the grammar/validation/refusal contract is not restated here — it lives in `ptp-run-at-model`'s `fast:` section.

## Preconditions

Check before doing any work, **in this order**:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** (one resolution covers the whole command). Apply its decision contract: under **`required`** the `codex` CLI must be on PATH — run `codex --version`, and if missing **STOP** up front with the install-or-change-mode message, doing no work in either phase. Under **`auto`** or **`off`** the command **proceeds**: each phase's `review-plan-full` / `review-full` then applies the per-phase reviewer skip itself (main-agent-only when a Codex reviewer is skipped, non-silent), and a mode-skipped reviewer phase is treated as convergence by the gates. A Claude reviewer is never gated and always runs. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.

2. **Parse the `fast:` switch.** Scan the raw `$ARGUMENTS` text for an optional `fast:on` / `fast:off` candidate per the "Optional caller-side `fast:` switch" section of **`ptp-run-at-model`** — do not restate that grammar/validation here.

   - **Absent** → fast off; behavior unchanged; nothing to strip.
   - **`fast:off`** → strip the token from `$ARGUMENTS`, resolve the boolean to `false`; run **no** preflight and emit **no** announcement (an unstripped `fast:off` would contaminate the request-text handoff to `ptp:plan-multiple` exactly as `fast:on` would).
   - **`fast:on`** → strip the token from `$ARGUMENTS`, resolve the boolean to `true`, and run the fast-mode preflight **once**, emitting its single announcement (see the preflight-input pin below).
   - **Invalid** (bad value or two or more candidates) → **STOP in the outer session** — before the request-text handoff to `ptp:plan-multiple`, before branch-name derivation and the branch guard, before launching the workflow, and before spawning any agent — reporting the offending candidate(s) and the two valid values (`on`, `off`).

   **Preflight-input pin.** `/ptp:full` also launches the workflow (its apply phase), so this command has no single target model and its implementer is never Codex: the **non-opus no-op never fires** (the spawn set always contains an opus agent — the review agent is hardcoded `model: 'opus'`, and the plan phase targets `opus.high`), so the settings read is never skipped; and the **`main=codex` no-op never fires**, because the workflow always spawns the Claude `ptp:ptp-apply` / `ptp:ptp-review` agents regardless of `roles.main`. So the announced outcome here is always **verified-on** or the **non-blocking advisory**. See `ptp-run-at-model`'s outcome list — its precedence rules are not restated here.

   This parse runs after the `codex.mode` guaranteed-abort (precondition 1) and before the `plan-multiple` handoff, so no derived slice description, change id, or branch name can contain the token — and before the branch guard, so an invalid token aborts before a branch is cut.

## Branch safety (first write-affecting step)

Run the **`ptp-branch-guard`** preamble **once**, after the abort-guaranteeing preconditions above, before either phase writes: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from this request (or the fresh epic → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** the plan phase runs; if you are already on a feature branch it is a **no-op** — proceed as-is. The delegated `plan` / `apply` commands and the run workflow's agents re-run the guard as a no-op once HEAD is on the branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## What this command does

Drive the `ptp-full` skill, which orchestrates two phases with two gates and the glue between them. The resolved `fast` boolean from precondition 2 is passed to the `ptp-full` skill and applies to **both** phases.

1. **Plan phase (the `/ptp:full-plan` flow).** Invoke `ptp:plan-multiple` with `$ARGUMENTS`, capture the ordered slice ids (`XXXX_NN_<desc>`, epic-then-story order; single-change fallback → one id), then invoke `ptp:review-plan-full` for each slice in order to its terminal state.
2. **Plan-convergence gate.** A slice's `review-plan-full` ends in one of these states: `BOTH PHASES DONE` (green), `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (green — Codex intentionally skipped by `codex.mode`; per `ptp-codex-mode` this is gate-success), `ITERATION CAP REACHED` (Phase-1 cap), or `PHASE 2 ITERATION CAP REACHED` (Phase-2 cap). Treat **both** green states (`BOTH PHASES DONE` and `PHASE 1 DONE — CODEX SKIPPED`) as converged and proceed. If a slice ends in **any non-green state**, **STOP after that slice** — do not plan-review later slices and **do not enter the apply phase**. Applying code from a plan that did not fully converge is exactly what this prevents.
3. **Apply phase (the `ptp-full-apply` flow), only on full plan convergence.** Read each captured slice's `effort.md` (line 1 = `{model}.{effort}`; missing/unparseable → default `opus.high`, noted), build `stories = [{ id, model, effort }, …]` in plan order, run the **`ptp-workflow-cache-heal` step** (see that skill for the canonical Bash command) via the Bash tool, and launch:
   ```
   Workflow({ name: 'ptp:ptp-full-apply', args: { stories, fast } })
   ```
   where `fast` is the resolved invocation-level boolean from precondition 2 (top-level, **not** per story; the `stories` shape is unchanged) — an omitted `fast` is read as `false` by the script. The workflow runs `apply → review-full` per slice sequentially. Because the ids are passed explicitly, **there is no scope-confirmation stop** — the handoff is automatic.
4. **Report.** Per the `ptp-full` skill's *Terminal report*: at a plan-convergence STOP, report the slices and which one did not converge and that the apply phase was not entered; on completion/run-halt, report the plan summary then the `ptp-full-apply` three-bucket terminal report (plus a `/ptp:archive <id>` recommendation per fully-processed slice, never auto-run).

## Model/effort posture

`/ptp:full` has **no effort gate** and no `full-effort` variant. The plan phase targets `opus.high`; the apply phase's apply agents each carry their own model from `effort.md` and review at `opus`, all inside workflow agents — nothing to gate. If the session is below `opus.high` when the plan phase runs, **note a reminder** but do **not** stop. Fast mode is an orthogonal, session-level posture — it changes neither the plan phase's `opus.high` target nor the apply agents' `effort.md` models — and the switch is per-invocation with no persisted state.

## Hard rules

- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only `required` hard-requires Codex (STOP with no work if `codex --version` fails). Under `auto`/`off` the command proceeds and each phase applies its own non-silent Codex skip.
- The `fast:` switch is parsed once in the outer session and the preflight/announcement happens once per invocation that resolves `fast:on` (absent / `fast:off` → no preflight, no announcement) — never per phase or per slice; the switch never enables fast mode and never writes any settings file (per `ptp-run-at-model`).
- **The plan-convergence gate blocks the apply phase** — enter the apply phase only if every slice reached a green state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED`); never apply code from a plan that ended in `ITERATION CAP REACHED` or `PHASE 2 ITERATION CAP REACHED`.
- **Never apply code in the plan phase**; code is applied only in the apply phase, only after full plan convergence.
- **Never archive** any slice — archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during planning, plan review, apply, or code review.
- **Never re-confirm scope between phases** — the captured slice ids are passed explicitly so the apply phase does not stop.
- **The apply-convergence gate halts the whole run** — a slice whose review is not `BOTH_PHASES_DONE` stops the loop.
- **A missing/unparseable `effort.md` defaults to `opus.high`** and is noted — never crash, never stop on it.
