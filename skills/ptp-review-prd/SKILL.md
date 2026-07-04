---
name: ptp-review-prd
description: "Use this skill when reviewing an epic's PRD quality before /ptp:plan — the read-only PRD-quality gate that mirrors /ptp:review-brainstorm one stage earlier, over the change-folder openspec/changes/<id>/prd.md. Owns the PRD-review methodology (locate the PRD via the ptp-prd selector→epic projection + lowest-story resolution, the rubric, Critical/High/Medium/Low classification, the PASS/WARN/FAIL verdict, and the report + next-step recommendation) that the thin /ptp:review-prd command delegates to. Read-only: edits nothing, runs no git, runs no branch guard, runs no openspec validate, and triggers no other ptp command."
---

# ptp-review-prd — the PRD-quality gate methodology

## Purpose

This skill owns the **PRD-review methodology** and is the **single source of truth** the thin
`/ptp:review-prd` command delegates to — the same command-backed-by-a-skill split as
`commands/config.md` → `skills/ptp-config/SKILL.md`. The command is a front door; this skill holds the
substance.

It is the **read-only PRD-quality gate** that audits an epic's **PRD**
(`openspec/changes/<id>/prd.md`, authored by `/ptp:prd`, where `<id>` is the epic's lowest-numbered
story) before it feeds `/ptp:plan`, so a thin or placeholder PRD is caught *before* it silently yields
a thin epic plan. It is the PRD-stage analogue of `/ptp:review-brainstorm` (which audits a change's
`brainstorm.md`) one stage earlier than `/ptp:review-plan` (which audits the OpenSpec artifacts and
runs `openspec validate`).

This skill is **read-only**: it edits nothing, fixes nothing, runs no git, runs no `ptp-branch-guard`,
runs **no** `openspec validate` (see below), and triggers no other ptp command. It reads the PRD (and
existing specs/changes for context) and reports.

---

## Locating the PRD

PRDs are **epic-scoped** (one per epic), anchored to the epic's lowest-numbered story change folder.
Resolve the target PRD(s) by reusing `ptp-prd`'s selector→epic projection and lowest-story rule —
do **not** invent a new resolution heuristic:

1. **Selector → epic projection (additive layer, owned by `ptp-prd`).** Resolve `$ARGUMENTS` to a set
   of epics:
   - **`<bare-id>`** or **`story:NN`** → the change's epic (PRDs are epic-scoped, not story-scoped).
   - **`epic:XXXX`** → that epic directly.
   - **`epic:all`** → all active epics.
   - **Multiple selectors** → the union of the projected epics (order- and grouping-independent).
   - **Omit (empty argument)** → **every active epic** (the review-all default, mirroring
     `/ptp:review-brainstorm`).
   - A **legacy/unprefixed id** that cannot project to an epic is reported **unsupported for PRD
     review** and **skipped** (per `ptp-prd`). If every supplied selector is a legacy id, report
     nothing-to-do and exit.

2. **`<id>` resolution.** For each epic, resolve `<id>` — the epic's **lowest-numbered story** —
   across **both active and archived** changes (scan `openspec/changes/<id>/` and
   `openspec/changes/archive/<date>-<id>/`, stripping any archive date prefix), so the anchor stays
   stable even after the first story is archived. Target the PRD at
   `openspec/changes/<id>/prd.md`. This is the same single naming rule `ptp-prd` writes to.

3. **Missing PRD file.** A missing `openspec/changes/<id>/prd.md` is **not** an abort — it is a
   **Critical** "no PRD to review" finding inside the rubric (check 1), mirroring the missing
   `brainstorm.md` handling in `ptp-review-brainstorm`.

The `<change-id>` used in the next-step recommendation is the epic's lowest-numbered story id.

---

## The rubric (retargeted from review-brainstorm/review-plan, NOT copied)

The PRD schema audited is the one `ptp-prd` authors: Problem/Why, Goals, Non-goals, Scope,
Users/Stakeholders, Requirements (functional + non-functional), Acceptance criteria, Dependencies,
Risks, Open questions.

| # | Check | Worst severity if failed |
|---|-------|--------------------------|
| 1 | **PRD file exists & non-placeholder** — file exists, real content (not an empty stub or restated headings) | Critical (missing) / High (placeholder) |
| 2 | **All schema sections present & non-placeholder** — Problem/Why, Goals, Non-goals, Scope, Users/Stakeholders, Requirements, Acceptance criteria, Dependencies, Risks, Open questions | High (a required section missing/empty) |
| 3 | **Requirements split into functional + non-functional and trace to Goals** | Medium |
| 4 | **Acceptance criteria are specific & testable** | High (vague/uncheckable) / Medium (thin) |
| 5 | **Scope vs Non-goals are consistent** — no contradiction between what's in scope and what's excluded | Medium |
| 6 | **Goals are measurable outcomes** — not restated section headings | Medium |
| 7 | **Dependencies / Risks / Open questions are real content** — not placeholders | Medium |

---

## Classification (vocabulary shared with `/ptp:review-plan` / `/ptp:review-brainstorm`, retargeted)

- **Critical** — the PRD file is **missing entirely** (nothing to review; `/ptp:plan` has no PRD
  source for the epic).
- **High** — placeholder/empty content; a **required schema section missing or empty**;
  **vague/uncheckable acceptance criteria**; an unusable handoff to `/ptp:plan`.
- **Medium** — shallow content; requirements not split functional/non-functional or untraced to goals;
  scope/non-goal inconsistency; goals that merely restate headings; placeholder
  Dependencies/Risks/Open questions.
- **Low** — nits: wording, formatting, ordering.

---

## Verdict

- **PASS** — no Critical and no High findings.
- **WARN** — a High is present, but no Critical.
- **FAIL** — any Critical is present.

Same vocabulary as `/ptp:review-plan` and `/ptp:review-brainstorm`.

---

## Deliberate difference from review-plan: NO `openspec validate`

`/ptp:review-plan`'s rubric runs `npx -y openspec validate <id> --strict` against the change's
proposal/spec. **A PRD precedes any proposal or spec delta, so there is nothing to validate.** This
skill **omits that step deliberately** and states the omission explicitly here so a maintainer does not
"fix" the skill by adding a validate call — there is no proposal to validate, and such a call would
error. This mirrors `ptp-review-brainstorm`.

---

## Report + next step

- **Single epic:** findings **grouped by severity** → the **verdict** → the **next step**:
  - **PASS** → recommend `/ptp:plan <change-id>` (the epic's lowest-numbered story id) — the PRD is
    sound; proceed to author the OpenSpec artifacts.
  - **FAIL due to a missing PRD** (the Critical "no PRD to review" finding) → recommend authoring it via
    **`/ptp:prd <epic>`** *first* (there is nothing to revise yet — the PRD must be authored before this
    gate or `/ptp:plan` has a source).
  - **WARN/FAIL otherwise** (a PRD exists but is thin/placeholder/inconsistent) → recommend
    **re-running `/ptp:prd <epic>`** to revise. **Never hand-edit the PRD here** — this mirrors
    `/ptp:review-plan`'s "report, don't silently fix" rule. The user revises by re-running the
    PRD-author step.

- **All epics (empty argument / multi-epic selector):** a **summary table** first (`epic → PASS/WARN/FAIL`
  + finding counts), then a **detail block for each non-PASS epic**. PASS epics need no detail.

---

## Hard rules

- **Read-only.** Edit nothing, fix nothing, write no file (including the PRD).
- **No git.** Run no git operation.
- **No branch guard.** Run **no** `ptp-branch-guard` and **never** launch `ptp-branch-prep` — this is a
  read-only review (like `/ptp:review-plan`, `/ptp:review-brainstorm`, and `/ptp:status`).
- **No `openspec validate`.** A PRD precedes any proposal/spec — there is nothing to validate.
- **Trigger no other ptp command.** Do not invoke `/ptp:plan`, `/ptp:prd`, or any other ptp command.
  Recommend the next command in **text only**; the user runs it explicitly.
