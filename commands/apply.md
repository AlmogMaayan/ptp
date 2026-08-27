---
description: Implement one change sequentially from its task list, checking off each task as it is verified
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

1. **Read the change artifacts** under `openspec/changes/<change-id>/`, in this order and only when
   needed:
   - `tasks.md` — the execution order (source of truth)
   - `specs/**/spec.md` — the behavior contract being established
   - `design.md` — only when present — decisions and tradeoffs
   - `proposal.md` — only when a task's intent is unclear — what and why
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
5. **Write the `apply` stage record, then return** the terminal result. Do **not** archive. Do **not** commit (apply defers commit to deploy — this is reinforced here, matching `ptp-full-apply`'s instruction to its apply agent). Report status.
   - **Stage record.** Immediately before returning the terminal result — at **every** terminal state — write `openspec/changes/<change-id>/stages/apply.json` (creating `stages/` on demand) with `kind: "apply"`, a `terminalState`, an ISO-8601 UTC `timestamp`, and the optional `tasksChecked` / `tasksTotal` / `validationPassed` / `writer: "ptp-apply-command"` fields. This is the direct-path counterpart of the write `agents/ptp-apply.md` performs on the workflow path, differing only in the `writer` value.
   - **The mapping, because this path returns no `stageReached`.** This step returns the terminal result and the *Closing report* uses the `ptp-run-at-model` relay vocabulary `completed / refused / needs-human-action`, so derive `terminalState` from the same three definitions the workflow agent uses: `completed` when every task is checked and validation passed; `blocked` when the run stopped needing something it could not do itself (an unchecked task, a failed pre-flight validation, a plan that must bounce back to `/ptp:plan`); `failed` when the run ended in error. Relay states therefore map on as `completed` → `completed`, `refused` / `needs-human-action` → `blocked`, and an errored run → `failed`. This adds **no** new return value to `/ptp:apply` and changes **no** relay behavior — it only names which of the three enum values the record carries.
   - **Atomic and non-fatal.** Serialize to a uniquely named temp file in the same `stages/` directory, then replace `stages/apply.json` via a replace-if-exists rename only after the complete write succeeds; on failure clean up the temp file and leave any existing file untouched. A record-write failure is reported and **never** changes the terminal result. The record carries no `fingerprint` and no `gateState`, and nothing gates on it.

## Closing report

After all changes have been processed, the outer session reports per change: the change id, the model used (from its `effort.md` by default; when `roles.main=codex`, `codex.model` if set, otherwise report "Codex CLI default (`codex.model` unset)" rather than naming a specific model), and the outcome (completed / refused / needs-human-action). For a **completed** change, tell the user the next command is **`/ptp:review <change-id>`**; for a **refused** or **needs-human-action** outcome, surface that terminal state (and, for `needs-human-action`, the exact follow-up) per the relay above instead of recommending `/ptp:review`.

**This report carries no review tally**, at any outcome. `/ptp:apply` wraps no review orchestrator, so there is no tally to relay: print no tally table and no `unknown` placeholder in its place. `unknown` is reserved for a report whose wrapped review step returned nothing — it is not a stand-in for "no review ran". The code-stage tally appears in `/ptp:review-full`, which is where the code review actually happens.

## Hard rules

- Do **not** invent new tasks not in `tasks.md`. If a needed task is missing, stop and update the plan.
- Do **not** archive in this command. Archiving happens only after review and only on explicit confirmation.
- Do **not** check off a task until its acceptance condition has actually been verified.
- Do **not** commit (apply defers commit to deploy — the subagent is instructed accordingly).
