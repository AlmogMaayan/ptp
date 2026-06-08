---
description: Review OpenSpec change artifacts (proposal/design/tasks/spec-deltas) for completeness, consistency, and validation — read-only, no code
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active changes)"
---

You are running the **artifact-quality gate** of the ptp flow — an optional read-only step that sits **between `/ptp:plan` (step 2) and `/ptp:apply` (step 3)**. Your job is to audit a change's **planning artifacts** (`proposal.md`, `design.md`, `tasks.md`, spec deltas), NOT its code.

This is **not** `/ptp:review`. That command grades implemented code against the artifacts (step 4, after apply). This command grades the *artifacts themselves*, before any code exists.

| | reviews | when | target |
| --- | --- | --- | --- |
| `/ptp:review-plan` (this) | the artifacts | after plan, before apply | the plan |
| `/ptp:review` | code vs artifacts | after apply | the diff |

## Inputs

Change id (optional): $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change. Preserve the existing empty-argument default: omitting `$ARGUMENTS` reviews all active changes.

## Steps

1. **Resolve scope:**
   - If `$ARGUMENTS` names a change, review just that change.
   - If `$ARGUMENTS` is empty, run `npx -y openspec list` and review **every** active change. Do not stop at the first failure — review all of them.

2. **For each change in scope, load its artifacts** from `openspec/changes/<change-id>/`:
   - `proposal.md`, `design.md` (may be absent), `tasks.md`, `specs/**/spec.md` (may be absent), `effort.md` (may be absent on changes predating this artifact — absence or a malformed first line that does not match `{model}.{effort}` is at most Medium, never a High or Critical, and SHALL NOT block `/ptp:apply`), `TLDR.md` (may be absent on changes predating this artifact — absence is at most Medium, never a High or Critical).

3. **Run the rubric** against each change. This is a structured artifact audit authored inline — do **not** invoke the Superpowers code-review skill (it targets code; artifacts are a different object). Apply Superpowers-style rigor to the reasoning, not the code.

   1. **Existence & validation** — the change folder exists; `npx -y openspec validate <change-id> --strict` passes.
   2. **`proposal.md` completeness** — all required sections present **and non-placeholder** (real content, not a restated heading): `Context`, `Goals`, `Non-goals`, `Alternatives considered`, `Design`, `Risks & edge cases`, `Impact`, `Success criteria`, `Source`.
   3. **Cross-artifact consistency:**
      - Every `Goal` maps to ≥1 task in `tasks.md`.
      - Every spec-delta requirement (`### Requirement: ...`) has an implementing task.
      - `proposal.md > Impact` names the capabilities the spec deltas actually touch.
      - `design.md` (if present) does not contradict `proposal.md`.
      - The `Source` path resolves to a real brainstorm doc — `openspec/changes/<change-id>/brainstorm.md` (the change-scoped brainstorm) or an `openspec/brainstorms/*-brainstorm.md` general brainstorm (proposal must be derived from brainstorming, not the raw request).
   4. **Spec-delta quality** — correct OpenSpec format (`## ADDED/MODIFIED/REMOVED/RENAMED Requirements` → `### Requirement:` with SHALL/MUST → `#### Scenario:`); every requirement has ≥1 scenario.
   5. **`tasks.md` quality** — small, sequential, independently verifiable tasks; ends with a verification task that maps to `Success criteria`.
   6. **Reasoning depth** — `Alternatives considered` has ≥2 options with tradeoffs (or an explicit statement that only one was viable, with the reason); `Risks & edge cases` covers both happy-path edges and unhappy paths.
   7. **`effort.md` sanity check** (advisory, non-blocking) — if `effort.md` is present, verify: (a) the first line matches `^(haiku|sonnet|opus)\.(low|medium|high|xhigh)$` with no prefix, suffix, or decoration; (b) the second line is empty; (c) lines 3+ contain a non-empty justification. A missing `effort.md` or a malformed first line is at most a **Medium** finding and SHALL NOT block `/ptp:apply` — parallel to the `TLDR.md` treatment below.
   8. **`TLDR.md` sanity check** (advisory, non-blocking) — if `TLDR.md` is present, verify: (a) the `**In one sentence:**` line is filled in (not a placeholder); (b) the `## Surface area` section lists Files and the three component categories (**Classes / components**, **Methods / functions**, **Models / data**), each either populated or `None`; (c) the Files listed in `## Surface area` are not obviously contradicting `proposal.md > Impact`; (d) the Files listed are not obviously contradicting the files named in `tasks.md` (the tasks are the concrete proxy for what the change actually touches). A missing or stale `TLDR.md` is at most a **Medium** finding and SHALL NOT block `/ptp:apply`.

4. **Classify each finding** (vocabulary shared with `/ptp:review`, retargeted to artifacts):
   - **Critical** — `proposal.md` missing; `validate --strict` fails; a spec delta contradicts the stated `Goals`.
   - **High** — a required `proposal.md` section missing/empty; a spec-delta requirement with no implementing task; a requirement with no scenario; `Source` doesn't resolve.
   - **Medium** — shallow content: only one alternative, vague/uncheckable success criteria, missing `design.md` where decisions are non-obvious.
   - **Low** — nits: wording, formatting, ordering.

5. **Assign a verdict** per change:
   - **PASS** — no Critical or High findings.
   - **WARN** — High present, no Critical.
   - **FAIL** — any Critical.

6. **Report.**
   - **Single change:** findings grouped by severity, then the verdict, then the next step:
     - PASS → `/ptp:apply <change-id>`
     - WARN/FAIL → `/ptp:plan` to revise the artifacts (do not hand-edit them here).
   - **All changes:** a summary table first (`change-id → PASS/WARN/FAIL` + finding counts), then a detail block for **each non-PASS change**. PASS changes need no detail.

## Hard rules

- This command is **read-only**. Do **not** edit any files. Do **not** run `openspec apply` / `openspec archive`.
- Do **not** fix the artifacts here. Findings are reported; the user fixes them by re-running `/ptp:plan` (the artifact-author step). This mirrors `/ptp:review`'s "report, don't silently fix" rule.
- Do **not** review code — that is `/ptp:review` after `/ptp:apply`. If the change is already implemented, you still review only the artifacts.
- This gate is **advisory**, not enforced: a non-PASS verdict does not block `/ptp:apply`, but you must clearly recommend revising first.
- Do **not** invoke or trigger any other ptp command (`/ptp:plan`, `/ptp:apply`, etc.). Recommend the next command in text; the user runs it explicitly.
