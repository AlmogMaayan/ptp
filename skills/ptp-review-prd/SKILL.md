---
name: ptp-review-prd
description: Own one main-agent review pass over a requirements document and the findings it reports
---

# ptp-review-prd — the PRD-quality gate methodology

## Purpose

**Model dispatch target.** `/ptp:review-prd` runs this skill's work at `opus.high` via `ptp-run-at-model` (`skills/ptp-run-at-model/SKILL.md`), which owns the spawn-and-relay mechanics and requires its caller to supply the target. This names the target only; it restates none of that contract.

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

## Role resolution

Resolve `{ main, reviewer }` from `roles.main` via the **`ptp-agent-roles`** skill. At the default
`main = claude` the review pass below is run **in-session by Claude**, byte-identical to before this
change. At `main = codex`, the review pass is instead a **read-only** `codex exec -s read-only`
dispatch over this skill's own rubric — the `(kind = prd, reviewer = codex)` dispatch
`ptp-review-loop` already defines — assembled per the **`ptp-codex-mode`** skill's canonical
flag-append rule (append resolved `-m <model>` / `-c model_reasoning_effort=<effort>` before the
trailing `-` when `codex.model` / `codex.reasoningEffort` are configured), taking its model and
effort from `codex.model` / `codex.reasoningEffort`. This is the **read-only reviewer invocation**,
never `ptp-run-at-model`'s write-capable `-s workspace-write` main-implementer invocation — this
review edits nothing in either direction, runs no `openspec validate` in either direction, and
triggers no other ptp command. At `main = codex`, run the `codex-review-plan.md` closed-book
protocol inline, retargeted to the PRD file `openspec/changes/<id>/prd.md` and with **NO**
`openspec validate` (a PRD precedes any proposal/spec): read the PRD file and any cited context
yourself, build one self-contained prompt carrying the rubric below plus the full PRD text and
cited excerpts, and pipe it to `codex exec -s read-only` over stdin. A *main* phase carries no
`codex.mode` gate (that gates a *reviewer*), so this skill owns its own precondition: when the
resolved dispatch is `codex`, verify `codex --version` is on PATH before running the pass; if
`codex` is absent, **STOP** and tell the user to install `codex` or set `roles.main = claude` in
`/ptp:config`, rather than silently falling back to a Claude pass. This skill's description stays a
"main-agent" pass in both directions.

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

The rubric above and this classification are **unchanged** by the severity threshold: every finding
is classified and listed exactly as before regardless of the configured threshold. The threshold
applies only at the **Verdict** step, and only to what **blocks**.

---

## Verdict

**Severity threshold.** Resolve `review.minSeverity` from layered ptp config **once**, at the start
of this pass, and hold it fixed for the pass — layered as **`ptp-workspace`**
(`skills/ptp-workspace/SKILL.md`) defines, whose layer list and precedence this skill restates not at
all; default `low`; a missing file, missing key, unparseable JSON, or unrecognized value falls back
to the prior valid value (ultimately `low`) rather than erroring, and **never** STOPs the review. The `/ptp:config` parameter registry (`commands/config.md`,
`skills/ptp-config/`) owns the key, its domain, and its validation — this is a pointer to that
contract, not a second reader definition. Severity order is `low < medium < high < critical`. A
finding is **actionable** when its severity is **at or above** the resolved threshold. Findings
**below** the threshold are still classified and still listed under their own severity, marked
*(below the configured `review.minSeverity` — reported, non-blocking)*; they never by themselves
produce a `WARN` or a `FAIL`. Because this verdict never counted Medium or Low toward its outcome,
`low`, `medium`, and `high` behave identically here; only `critical` changes a verdict, by demoting
High to reported-only — do **not** "repair" that apparent no-op by making Medium findings `WARN`.
State the resolved threshold **and the layer it resolved from**, named by one of the provenance
labels `ptp-workspace` defines, in the
report, and when the threshold demoted at least one finding out of the blocking set, say so beside
the verdict. For an empty-argument or multi-epic run, one threshold governs the whole pass, so the
summary table can never mix thresholds across rows.

- **PASS** — no **actionable** Critical and no **actionable** High findings.
- **WARN** — an **actionable** High is present, but no actionable Critical.
- **FAIL** — any **actionable** Critical is present.

Same vocabulary as `/ptp:review-plan` and `/ptp:review-brainstorm`.

**The missing-PRD Critical is never threshold-able away.** The "no PRD to review" finding is
**Critical**, and Critical is the top of the order, so it is actionable at **every** threshold —
including `critical`. The *FAIL due to a missing PRD* branch of *Report + next step* below is
therefore unchanged by this section.

---

## Deliberate difference from review-plan: NO `openspec validate`

`/ptp:review-plan`'s rubric runs `npx -y openspec validate <id> --strict` against the change's
proposal/spec. **A PRD precedes any proposal or spec delta, so there is nothing to validate.** This
skill **omits that step deliberately** and states the omission explicitly here so a maintainer does not
"fix" the skill by adding a validate call — there is no proposal to validate, and such a call would
error. This mirrors `ptp-review-brainstorm`.

---

## Report + next step

- **Single epic:** the **resolved threshold and its source layer** → findings **grouped by severity**
  (below-threshold findings still listed under their own severity, marked non-blocking; a report in
  which every finding is below the threshold still enumerates them and is never rendered as "no
  findings") → the **verdict** → the **next step**:
  - **PASS** → recommend `/ptp:plan <change-id>` (the epic's lowest-numbered story id) — the PRD is
    sound; proceed to author the OpenSpec artifacts.
  - **FAIL due to a missing PRD** (the Critical "no PRD to review" finding) → recommend authoring it via
    **`/ptp:prd <epic>`** *first* (there is nothing to revise yet — the PRD must be authored before this
    gate or `/ptp:plan` has a source).
  - **WARN/FAIL otherwise** (a PRD exists but is thin/placeholder/inconsistent) → recommend
    **re-running `/ptp:prd <epic>`** to revise. **Never hand-edit the PRD here** — this mirrors
    `/ptp:review-plan`'s "report, don't silently fix" rule. The user revises by re-running the
    PRD-author step.

- **All epics (empty argument / multi-epic selector):** the resolved threshold and its source layer
  stated **once for the pass**, a **summary table** first (`epic → PASS/WARN/FAIL` + finding counts),
  then a **detail block for each non-PASS epic**. PASS epics need no detail — except a PASS carrying
  **any** below-threshold finding: it gets a detail block listing those findings under their own
  severity, marked non-blocking, so the threshold never makes a finding invisible; and a PASS that
  only passes because the threshold **demoted** a finding additionally says so on its row. (At the
  default `low` no finding is ever below the threshold, so this exception never fires and the table
  reads exactly as today.)

---

## Hard rules

- **Read-only.** Edit nothing, fix nothing, write no file (including the PRD).
- **No git.** Run no git operation.
- **No branch guard.** Run **no** `ptp-branch-guard` and **never** launch `ptp-branch-prep` — this is a
  read-only review (like `/ptp:review-plan`, `/ptp:review-brainstorm`, and `/ptp:status`).
- **No `openspec validate`.** A PRD precedes any proposal/spec — there is nothing to validate.
- **Trigger no other ptp command.** Do not invoke `/ptp:plan`, `/ptp:prd`, or any other ptp command.
  Recommend the next command in **text only**; the user runs it explicitly.
