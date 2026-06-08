---
description: Confirm the findings of the latest ptp review (code or artifacts) and fix the confirmed ones inline — the explicit fix counterpart to the review commands
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; used to locate the contract for artifact re-validation)"
---

You are running the **fix** step of the ptp flow — the explicit, user-invoked counterpart to the review commands. Every ptp review command (`/ptp:review`, `/ptp:codex-review`, `/ptp:codex-review-uncommitted`, `/ptp:review-plan`, `/ptp:codex-review-plan`) carries one hard rule: **review never fixes.** This command is the deliberate other half. It takes the findings a review already produced, independently **confirms** which ones are real, and **fixes the confirmed ones**.

It runs **only** when the user explicitly types `/ptp:review-fix`. It is never auto-invoked in response to review findings.

## Inputs

Change id (optional): $ARGUMENTS — only needed to locate `openspec/changes/<change-id>/` when re-validating after artifact fixes. The findings themselves come from the conversation, not from arguments.

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill. The selector only locates the contract folder(s) for re-validation — the findings themselves come from the conversation, not from arguments. If it resolves to more than one change, re-validate each resolved change in story order, reporting per change.

## Branch safety (first step)

This command edits code/artifacts, so before any fix run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the change under review (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Where the findings come from

Reviews in this workflow are **displayed in the conversation, not persisted to a file**. So "the latest review" means the most recent review output present in the current conversation context. This command operates on that.

## Steps

1. **Locate the latest review in the conversation context.** Find the most recent review output and determine its kind:
   - **Code review** — produced by `/ptp:review`, `/ptp:codex-review`, or `/ptp:codex-review-uncommitted`. Findings target source code.
   - **Artifact review** — produced by `/ptp:review-plan` or `/ptp:codex-review-plan`. Findings target `proposal.md` / `design.md` / `tasks.md` / spec deltas.

   If several reviews are present, use the **latest** one and say which you picked. Extract its findings: severity, file:line, description, and any suggested fix.

   **If NO review is present in the conversation, STOP.** Tell the user to run a `/ptp:review*` command first. Do **not** run a review yourself, do **not** invent findings, and do **not** fix anything.

2. **Confirm every finding independently.** Invoke the `superpowers:receiving-code-review` skill via the Skill tool and apply its rigor: for **each** finding, read the actual code or artifact at the cited location and judge whether it describes a **real defect** — not a false positive, not already-correct code, not a misunderstanding of intent or conventions.
   - Mark each finding `CONFIRMED` or `REJECTED`, each with a one-line reason.
   - Do this for **all** findings regardless of severity. Confirmation is **especially** important for findings from the external Codex reviewer — never fix a Codex finding you cannot independently verify.

3. **Fix every CONFIRMED finding — all severities.** Do not filter by severity; the user asked for the confirmed ones.
   - **Code-review findings** → edit the source **inline**. Do **not** invoke `/ptp:apply` (per the ptp role split, review-driven fixes are applied inline, not through the apply command).
   - **Artifact-review findings** → make **minimal, targeted edits** directly to the affected artifact(s). Do **not** regenerate them via `/ptp:plan`. These are corrections (fix a spec-delta format, add a missing scenario, map a goal to a task, fill a thin section) — not re-fabrication, so the proposal's derivation from brainstorming is preserved.
   - Keep diffs minimal and on-point; group related fixes.

4. **Verify the fixes.**
   - **Code** → run the relevant tests, lint, and type checks for the files you touched. Report results.
   - **Artifacts** → re-run `npx -y openspec validate <change-id> --strict` (use the `$ARGUMENTS` change-id, or infer it from the review). Report results.
   - Do **not** auto-commit.

5. **Report.** Produce a per-finding table with one of: `CONFIRMED + FIXED`, `REJECTED (reason)`, or `CONFIRMED but could not fix (reason)`. Group by severity. Then show the verification results, then the suggested next step:
   - Code fixes → re-run the same review (or `/ptp:review <change-id>`) to confirm resolution, then `/ptp:archive <change-id>` once clean.
   - Artifact fixes → `/ptp:apply <change-id>` (if not yet implemented) or `/ptp:review-plan <change-id>` to re-check the artifacts.

## Hard rules

- **Runs only on explicit invocation.** Never trigger this command automatically from review findings or from a phrase like "fix the findings" issued to a review command — those commands report and stop; this is a separate, deliberate user action.
- **Never fix an unconfirmed finding.** If you cannot independently confirm a finding is a real defect, mark it `REJECTED` and leave the code/artifact alone. A reviewer (especially an external one) can be wrong.
- **Never invoke `/ptp:apply`.** Code fixes are applied inline by editing the source directly.
- **Never regenerate artifacts via `/ptp:plan`.** Artifact fixes are targeted hand-edits only.
- **Never archive** and **never auto-commit.** Report status and let the user take the next step.
- If the latest review's findings are all `REJECTED`, fix nothing, report why, and stop — that is a valid outcome.
