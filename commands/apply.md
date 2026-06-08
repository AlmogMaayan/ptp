---
description: Implement an OpenSpec change sequentially from tasks.md with Superpowers implementation discipline
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **step 3** of the ptp flow. The OpenSpec change has been planned and validated. Your job is to **execute the tasks sequentially**, verifying each one before checking it off.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change (e.g. `epic:XXXX`), apply each story sequentially in ascending story order, running all steps below for each story before starting the next.

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

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
5. **STOP.** Do **not** archive. Report status and tell the user the next command is `/ptp:review <change-id>`.

## Hard rules

- Do **not** invent new tasks not in `tasks.md`. If a needed task is missing, stop and update the plan.
- Do **not** archive in this command. Archiving happens only after review and only on explicit confirmation.
- Do **not** check off a task until its acceptance condition has actually been verified.
