---
description: Implement an OpenSpec change sequentially from tasks.md with Superpowers implementation discipline
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **step 3** of the ptp flow. The OpenSpec change has been planned and validated. Your job is to **execute the tasks sequentially**, verifying each one before checking it off. The per-task implementation work runs as the **resolved main agent** (`ptp-run-at-model` resolves it via `ptp-agent-roles`) — by default a Claude **subagent** at the model and effort from the change's own `effort.md`, or a write-capable `codex exec` main run (model/effort from `codex.model`/`codex.reasoningEffort`) when `roles.main=codex` — so apply quality is no longer incidental to the session's model.

## Inputs

Change id: $ARGUMENTS

## Outer-session preconditions (run once, before any subagent spawns)

These two steps are **abort-guaranteeing preconditions** that MUST run in the outer session. A subagent cannot launch the `ptp-branch-prep` Workflow, so branch cutting must happen here. A guaranteed abort must never spawn a subagent.

1. **Resolve the selector.** Invoke the **`ptp-change-selector`** skill on `$ARGUMENTS` → an ordered list of change ids (ascending by `(epic, story)`). Any selector that STOPs — no such change, ambiguous bare `story:NN`, or empty with no command default — aborts here, in the outer session, **before spawning anything**.

2. **Branch safety.** Run the **`ptp-branch-guard`** preamble once, in the outer session: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change id (→ `ptp/<change-id>` for a single change, `ptp/epic-XXXX` for an epic selector) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** spawning anything; if already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Per change — invoke `ptp-run-at-model` (sequentially, ascending story order)

For **each resolved change** in order (one change fully applied before starting the next), invoke the **`ptp-run-at-model`** skill with:

- **target** = "read from `effort.md`" for this change id — `ptp-run-at-model` reads line 1 of `openspec/changes/<id>/effort.md`, parses `{model}.{effort}` (missing or unparseable → `opus.high`, **noted**), and — for the default `roles.main=claude` — spawns one foreground subagent at the resolved model with the effort directive (when `roles.main=codex`, model/effort instead come from `codex.model`/`codex.reasoningEffort` per the main-agent branch below); and
- **work** = "run the `/ptp:apply` per-task implementation protocol for this single change" (see *Subagent responsibilities* below).

`ptp-run-at-model` owns the run-and-relay mechanism — reference that skill for the contract (effort directive mapping, relay states, branch-guard ordering, and the **main-agent branch**). Do not restate its mechanism here.

**Who implements is the resolved main agent.** `ptp-run-at-model` resolves the main agent via `ptp-agent-roles`: by default (`roles.main=claude`) the per-task implementation runs in a foreground Claude Agent-tool subagent exactly as before this text; when `roles.main=codex` the same per-task protocol below is performed instead by a **write-capable `codex exec`** main run (model/effort from `codex.model`/`codex.reasoningEffort`). The *Subagent responsibilities* protocol (TDD discipline, task sequencing, re-validation, no-archive/no-commit) is the work handed to whichever main agent runs — it is unchanged in both directions; "subagent" below names the Claude default and reads as "the Codex main run" when `roles.main=codex`.

The **main run's own `ptp-branch-guard` check is a no-op**: HEAD is already on the feature branch when the main work runs, so the subagent (or the shelled-out Codex) **must not** attempt to launch `ptp-branch-prep`.

**Relay** the subagent's terminal result per `ptp-run-at-model`: a refusal or `needs-human-action` state is surfaced verbatim and does **not** silently proceed to the next change.

## Subagent responsibilities (the apply per-task implementation protocol)

The subagent runs the following steps for the single change assigned to it:

1. **Read the change artifacts** under `openspec/changes/<change-id>/`:
   - `proposal.md` — what and why
   - `design.md` (if present) — decisions and tradeoffs
   - `tasks.md` — the execution order (source of truth)
   - `specs/**/spec.md` — the behavior contract being established
2. **Re-validate** before starting:
   - `npx -y openspec validate <change-id> --strict`
   - If validation fails, **stop** and surface the error. Do not edit the spec deltas to make it pass — that would defeat the planning step. Return to `/ptp:plan` if the artifacts genuinely need to change.
3. **Implement tasks in order**:
   - One task at a time. Do not jump ahead.
   - After each task: run the relevant tests/linters/type checks for the files you touched.
   - Update the checkbox in `tasks.md` to `[x]` only after the task has been verified — not just written.
   - If a task reveals that the plan was wrong, **stop**, document what changed, and bounce back to `/ptp:plan` to update the artifacts before continuing. Do not silently drift from the spec.
4. **Final verification**:
   - All tasks checked.
   - Project test/lint/type suites pass.
   - `npx -y openspec validate <change-id> --strict` still passes.
5. **Return** the terminal result. Do **not** archive. Do **not** commit (apply defers commit to deploy — this is reinforced here, matching `ptp-full-run`'s instruction to its apply agent). Report status.

## Closing report

After all changes have been processed, the outer session reports per change: the change id, the model used (from its `effort.md` by default; when `roles.main=codex`, `codex.model` if set, otherwise report "Codex CLI default (`codex.model` unset)" rather than naming a specific model), and the outcome (completed / refused / needs-human-action). For a **completed** change, tell the user the next command is **`/ptp:review <change-id>`**; for a **refused** or **needs-human-action** outcome, surface that terminal state (and, for `needs-human-action`, the exact follow-up) per the relay above instead of recommending `/ptp:review`.

## Hard rules

- Do **not** invent new tasks not in `tasks.md`. If a needed task is missing, stop and update the plan.
- Do **not** archive in this command. Archiving happens only after review and only on explicit confirmation.
- Do **not** check off a task until its acceptance condition has actually been verified.
- Do **not** commit (apply defers commit to deploy — the subagent is instructed accordingly).
