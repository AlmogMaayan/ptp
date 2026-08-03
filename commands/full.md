---
description: Plan-and-apply an oversized change end to end in one invocation — full-plan (decompose + per-slice plan-review) then, on full plan convergence, continue without stopping into full-apply (apply + code-review per slice). Read-then-write; never archives (uses Codex per codex.mode — only required hard-requires the codex CLI)
argument-hint: "<big-change-id-or-request>"
---

`/ptp:full` is the union of `/ptp:full-plan` and `/ptp:full-apply`: it runs the full-plan flow and then **continues without stopping** into the full-apply flow. The per-flow detail lives in the `/ptp:full-plan` command, the `ptp-full-apply` skill, and the shared `ptp-full` skill — this command defers to them rather than restating their detail. The seam between the two is the whole reason this command exists: the slice ids produced by planning are handed to the apply phase as an **explicit id list**, so the apply phase skips the scope-confirmation stop it would do on a no-arg invocation.

## Inputs

The oversized change id or request: $ARGUMENTS

Interpret it both ways, exactly as `/ptp:plan-multiple` does: if `$ARGUMENTS` names an existing `openspec/changes/<id>/` folder, treat it as a monolithic plan to re-cut; otherwise treat it as a fresh request to plan as multiple slices. `$ARGUMENTS` may additionally carry an anywhere-in-text `fast:on` / `fast:off` switch (default off) declaring that this invocation's opus agents should run in Claude Code fast mode. `$ARGUMENTS` may also carry an anywhere-in-text `parallel:on` / `parallel:off` switch declaring whether the **plan phase's** per-item main runs may overlap. Both tokens are stripped **before** `$ARGUMENTS` is interpreted as an existing change folder or a fresh request — see "Parse the per-invocation switches" below (precondition 2); neither grammar/validation/refusal contract is restated here — `fast:` lives in `ptp-run-at-model`'s `fast:` section and `parallel:` lives in the **`ptp-parallel-fanout`** skill (§ *The per-invocation `parallel:on` / `parallel:off` token*, which itself defines it by reference to that same `fast:` section).

## Preconditions

Check before doing any work, **in this order**:

1. **Resolve `codex.mode` per the `ptp-codex-mode` skill** (one resolution covers the whole command). Apply its decision contract: under **`required`** the `codex` CLI must be on PATH — run `codex --version`, and if missing **STOP** up front with the install-or-change-mode message, doing no work in either phase. Under **`auto`** or **`off`** the command **proceeds**: each phase's `review-plan-full` / `review-full` then applies the per-phase reviewer skip itself (main-agent-only when a Codex reviewer is skipped, non-silent), and a mode-skipped reviewer phase is treated as convergence by the gates. A Claude reviewer is never gated and always runs. The full resolution + decision rule lives in the `ptp-codex-mode` skill — do not restate it here.

2. **Parse the per-invocation switches — `fast:` and `parallel:`.** Both are parsed and stripped here, in this command's outer session, from the raw `$ARGUMENTS` text. They are independent of each other: any combination may appear, both are stripped, and an invalid candidate of **either** kind refuses.

   **a. The `fast:` switch.** Scan the raw `$ARGUMENTS` text for an optional `fast:on` / `fast:off` candidate per the "Optional caller-side `fast:` switch" section of **`ptp-run-at-model`** — do not restate that grammar/validation here.

   - **Absent** → fast off; behavior unchanged; nothing to strip.
   - **`fast:off`** → strip the token from `$ARGUMENTS`, resolve the boolean to `false`; run **no** preflight and emit **no** announcement (an unstripped `fast:off` would contaminate the request-text handoff to `ptp:plan-multiple` exactly as `fast:on` would).
   - **`fast:on`** → strip the token from `$ARGUMENTS`, resolve the boolean to `true`, and run the fast-mode preflight **once**, emitting its single announcement (see the preflight-input pin below).
   - **Invalid** (bad value or two or more candidates) → **STOP in the outer session** — before the request-text handoff to `ptp:plan-multiple`, before branch-name derivation and the branch guard, before launching the workflow, and before spawning any agent — reporting the offending candidate(s) and the two valid values (`on`, `off`).

   **Preflight-input pin.** `/ptp:full` also launches the workflow (its apply phase), so this command has no single target model and its implementer is never Codex: the **non-opus no-op is decided from the union of this invocation's resolved spawn targets** — its plan-phase stages plus its resolved apply targets plus its resolved review targets. For this command that union **always** contains the plan phase's `opus.high`, so the no-op **never fires** and the settings read is never skipped, even when every slice's resolved apply and review target is below `opus`; and the **`main=codex` no-op never fires**, because the workflow always spawns the Claude `ptp:ptp-apply` / `ptp:ptp-review` agents regardless of `roles.main`. So the announced outcome here is always **verified-on** or the **non-blocking advisory**. See `ptp-run-at-model`'s outcome list — its precedence rules are not restated here.

   **b. The `parallel:` switch.** Scan the raw `$ARGUMENTS` text for an optional `parallel:on` / `parallel:off` candidate per the **`ptp-parallel-fanout`** skill (§ *The per-invocation `parallel:on` / `parallel:off` token*) — its grammar, two-stage detect-then-validate recognition, lowercase-prefix-only candidate rule, at-most-one-candidate rule, and strip-before-use ordering are that skill's, and are **not** restated here.

   - **Absent** → the resolved `parallel.mode` applies. **Absent is not `off`** (see the skill).
   - **Valid `parallel:on` / `parallel:off`** → **strip the token from `$ARGUMENTS`** and use it as this invocation's parallel posture; read no config file for a written value and write none.
   - **Invalid** (a recognized candidate with a bad value, e.g. `parallel:true`, or two or more candidates such as both `parallel:on` and `parallel:off`) → **STOP in the outer session** — before the request-text handoff to `ptp:plan-multiple`, before branch-name derivation and the branch guard, before launching the workflow, and **before any member or subagent is started** (phrased this way rather than "before any agent is spawned" because under `roles.main=codex` a plan-phase member is a `codex exec` run, not a subagent) — reporting **every** detected candidate and the two valid values (`on`, `off`).

   **Why `/ptp:full` must parse this token rather than defer to config.** Phase A forwards `$ARGUMENTS` to `ptp:plan-multiple`, and that command parses `parallel:` itself. Leaving `/ptp:full` unaware would therefore mean `/ptp:full <request> parallel:on` fanned out the decompose's per-slice planning while Phase A's per-slice plan reviews stayed on the resolved `parallel.mode` — the exact half-effect `/ptp:full-plan` parses the token to prevent, arrived at by omission. Refusing the token here instead would be user-hostile for a token the sibling entrypoint accepts.

   Both parses run after the `codex.mode` guaranteed-abort (precondition 1) and before the `plan-multiple` handoff, so no derived slice description, change id, or branch name can contain either token — and before the branch guard, so an invalid token of either kind aborts before a branch is cut.

## Branch safety (first write-affecting step)

Run the **`ptp-branch-guard`** preamble **once**, after the abort-guaranteeing preconditions above, before either phase writes: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from this request (or the fresh epic → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** the plan phase runs; if you are already on a feature branch it is a **no-op** — proceed as-is. The delegated `plan` / `apply` commands and the run workflow's agents re-run the guard as a no-op once HEAD is on the branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## What this command does

Drive the `ptp-full` skill, which orchestrates two phases with two gates and the glue between them. The resolved `fast` boolean from precondition 2 is passed to the `ptp-full` skill and applies to **both** phases. The resolved **`parallel` posture** from precondition 2 is likewise passed to the `ptp-full` skill as an explicit input — the handoff carries the **posture**, never the token, and the request text handed down is stripped — but it is a **Phase A input only**: Phase A threads it into the delegated `ptp:plan-multiple` and uses it for its own per-slice review fan-out decision, while Phase B, the workflow launch, and its `stories`/`fast` args receive no parallel input and stay strictly sequential.

1. **Plan phase (the `/ptp:full-plan` flow).** Invoke `ptp:plan-multiple` with the stripped `$ARGUMENTS` plus the resolved `parallel` posture, take the slice ids and one-line scopes from its step-6 report (`XXXX_NN_<desc>`, epic-then-story order; single-change fallback → one id), then run `ptp:review-plan-full` per slice — concurrently or serially per the `ptp-parallel-fanout` contract, as the `ptp-full` skill's Phase A specifies — to each slice's terminal state.
2. **Plan-convergence gate.** A slice's `review-plan-full` ends in one of these states: `BOTH PHASES DONE` (green), `PHASE 1 DONE — CODEX SKIPPED (mode=…)` (green — Codex intentionally skipped by `codex.mode`; per `ptp-codex-mode` this is gate-success), `ITERATION CAP REACHED` (Phase-1 cap), or `PHASE 2 ITERATION CAP REACHED` (Phase-2 cap). Treat **both** green states (`BOTH PHASES DONE` and `PHASE 1 DONE — CODEX SKIPPED`) as converged. The decision rule is the same on both paths — the gate passes only if **every** slice in the set is green — and **only the join point differs**:

   - **Serial plan phase** (the default): the gate is applied after each slice, so if a slice ends in **any non-green state**, **STOP after that slice** — do not plan-review later slices.
   - **Parallel plan phase**: the later members have already started, so there is nothing to stop. Join **every** member, run the post-join cross-slice recheck, and only then apply the gate over the whole joined set (see the `ptp-full` skill's Phase A) — never abandon or drop an in-flight member to short-circuit.

   Either way, a non-green slice anywhere in the set fails the gate and **the apply phase is not entered**. Applying code from a plan that did not fully converge is exactly what this prevents.
3. **Apply phase (the `ptp-full-apply` flow), only on full plan convergence.** Read each captured slice's `effort.md` (line 1 = `{model}.{effort}`; missing/unparseable → default `opus.high`, noted), derive each slice's review target from that same pair — `reviewModel` = `model` floored at `sonnet` (`haiku` → `sonnet`), `reviewEffort` = `effort` floored at `high` (`low`/`medium` → `high`) — build `stories = [{ id, model, effort, reviewModel, reviewEffort }, …]` in plan order, run the **`ptp-workflow-cache-heal` step** (see that skill for the canonical Bash command) via the Bash tool, and launch:
   ```
   Workflow({ name: 'ptp:ptp-full-apply', args: { stories, fast } })
   ```
   where `stories` carries the `{ id, model, effort, reviewModel, reviewEffort }` entries built above and `fast` is the resolved invocation-level boolean from precondition 2 (top-level, **not** per story) — an omitted `fast` is read as `false` by the script, and an omitted or unrecognized `reviewModel` / `reviewEffort` falls back to `opus` / `high`. The workflow runs `apply → review-full` per slice sequentially, re-spawning a slice's review **once** at a more capable model if that review's freshly evaluated fix target names one. Because the ids are passed explicitly, **there is no scope-confirmation stop** — the handoff is automatic.
4. **Report.** Per the `ptp-full` skill's *Terminal report*: at a plan-convergence STOP, report the slices and which one did not converge and that the apply phase was not entered; on completion/run-halt, report the plan summary then the `ptp-full-apply` three-bucket terminal report (plus a `/ptp:archive <id>` recommendation per fully-processed slice, never auto-run).

## Model/effort posture

`/ptp:full` has **no effort gate** and no `full-effort` variant. The plan phase targets `opus.high`; the apply phase's apply agents each carry their own model from `effort.md`, and each slice's review agent carries its own **resolved review target** derived from that same file (`reviewModel` = the model floored at `sonnet`, `reviewEffort` = the effort floored at `high`), with each review's **fix** work sized by a freshly evaluated fix target — all inside workflow agents, so there is nothing to gate. If the session is below `opus.high` when the plan phase runs, **note a reminder** but do **not** stop. Fast mode is an orthogonal, session-level posture — it changes neither the plan phase's `opus.high` target nor the apply agents' `effort.md` models — and the switch is per-invocation with no persisted state.

## Hard rules

- **Codex per `codex.mode`** (see the `ptp-codex-mode` skill) — resolve the mode once up front; only `required` hard-requires Codex (STOP with no work if `codex --version` fails). Under `auto`/`off` the command proceeds and each phase applies its own non-silent Codex skip.
- The `fast:` switch is parsed once in the outer session and the preflight/announcement happens once per invocation that resolves `fast:on` (absent / `fast:off` → no preflight, no announcement) — never per phase or per slice; the switch never enables fast mode and never writes any settings file (per `ptp-run-at-model`).
- The `parallel:` switch is parsed and stripped once in this outer session, before the `plan-multiple` handoff and before the branch guard; the resolved posture is handed to the `ptp-full` skill as an explicit input and is a **Phase A** input only — it never reaches Phase B, the workflow launch, or its `stories`/`fast` args, and no delegated command re-parses it. `parallel:on` is a permission, never a safety override: a stage that cannot establish the four `ptp-parallel-fanout` conditions runs serially regardless.
- **The plan-convergence gate blocks the apply phase** — enter the apply phase only if every slice reached a green state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED`); never apply code from a plan that ended in `ITERATION CAP REACHED` or `PHASE 2 ITERATION CAP REACHED`.
- **Never apply code in the plan phase**; code is applied only in the apply phase, only after full plan convergence.
- **Never archive** any slice — archiving is always an explicit `/ptp:archive <id>` user action.
- **Never auto-commit** any edits made during planning, plan review, apply, or code review.
- **Never re-confirm scope between phases** — the captured slice ids are passed explicitly so the apply phase does not stop.
- **The apply-convergence gate halts the whole run** — a slice whose review is not `BOTH_PHASES_DONE` stops the loop.
- **A missing/unparseable `effort.md` defaults to `opus.high`** and is noted — never crash, never stop on it.
