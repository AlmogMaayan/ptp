---
name: ptp-review-brainstorm
description: "Use this skill when reviewing a change's brainstorm.md quality before /ptp:plan — the read-only brainstorm-quality gate that sits one step earlier than /ptp:review-plan, between /ptp:brainstorm and /ptp:plan. Owns the brainstorm-review methodology (locate the brainstorm, the rubric, Critical/High/Medium/Low classification, the PASS/WARN/FAIL verdict, and the report + next-step recommendation) that the thin /ptp:review-brainstorm command delegates to. Read-only: edits nothing, runs no git, runs no branch guard, runs no openspec validate, and triggers no other ptp command."
---

# ptp-review-brainstorm — the brainstorm-quality gate methodology

## Purpose

This skill owns the **brainstorm-review methodology** and is the **single source of truth** the thin
`/ptp:review-brainstorm` command delegates to — the same command-backed-by-a-skill split as
`commands/config.md` → `skills/ptp-config/SKILL.md`. The command is a front door; this skill holds
the substance.

It is the **read-only quality gate one step earlier than `/ptp:review-plan`** — it sits **between
`/ptp:brainstorm` (step 1) and `/ptp:plan` (step 2)**. `/ptp:review-plan` audits the *artifacts*
(`proposal.md` / `design.md` / `tasks.md` / spec deltas) after `/ptp:plan`; this skill audits the
**brainstorm itself**, before any of those artifacts exist, so a thin or hand-wavy `brainstorm.md`
is caught *before* it silently yields thin OpenSpec artifacts.

This skill is **read-only**: it edits nothing, fixes nothing, runs no git, runs no
`ptp-branch-guard`, runs **no** `openspec validate` (see below), and triggers no other ptp command.
It reads the brainstorm (and existing specs/changes for context) and reports.

---

## Locating the brainstorm

Mirror `/ptp:plan`'s Preconditions ordering — a brainstorm lives in one of two places rather than a
fixed artifact folder:

1. **Change-scoped, preferred.** If the resolved scope is a **change id**, prefer
   `openspec/changes/<change-id>/brainstorm.md` (the `/ptp:brainstorm` output and the direct
   `/ptp:plan` source). When this file exists it wins outright — a general brainstorm is ignored for
   that change.

2. **General fallback, only when unambiguously associated.** If the change-scoped file is **absent**,
   fall back to a general `openspec/brainstorms/*-brainstorm.md` (the `/ptp:brainstorm-only` output)
   **only when exactly one** such general file is **unambiguously associated** with the change.
   **Unambiguously associated** is defined deterministically: a general file is associated **iff** it
   names the change id (or its `NN_` story token or `epic:` token) in its filename **or** its body,
   **and exactly one** general file matches. **Zero matches, or two-or-more matches (ambiguous),
   means no fallback** — the missing change-scoped brainstorm is the finding (Critical, "no
   brainstorm to review"). This rule is stated here so the review step never has to invent an
   association heuristic.

3. **Empty-argument default.** With no selector, the scope is **every active change**; review each
   active change's `brainstorm.md`. A general `openspec/brainstorms/` file with **no change folder**
   is **out of scope entirely** (there is no change id to key on). The command is **selector-only** —
   `ptp-change-selector` resolves change *selectors*, not file paths — so a general file enters
   review **only** through the deterministic association fallback (step 2) for a resolved change,
   **never** as a standalone file-path argument.

---

## The rubric (retargeted from review-plan, NOT copied)

| # | Check | Worst severity if failed |
|---|-------|--------------------------|
| 1 | **Existence & non-placeholder** — file exists, real content (not an empty stub or a restated heading) | Critical (missing) / High (placeholder) |
| 2 | **≥2 real options with tradeoffs** — each option carries the four tradeoff axes (what it changes / risk-blast-radius / effort / reversibility) **and** interaction-with-existing-specs; a single option is acceptable **only** with an explicit reasoned "only one viable" statement | High (no real second option, no "only one viable" rationale) / Medium (thin tradeoffs) |
| 3 | **Clear recommendation with rationale** — one option marked recommended, and it says *why* | High (no recommendation) / Medium (no rationale) |
| 4 | **Assumptions documented** — autonomous choices captured inline | Medium |
| 5 | **Scope / blast-radius addressed** | Medium |
| 6 | **Interaction with existing specs considered** | Medium |
| 7 | **Usable handoff to `/ptp:plan`** — enough substance to transcribe into artifacts without re-deciding direction | High (unusable) / Medium (gaps) |

---

## Classification (vocabulary shared with `/ptp:review-plan`, retargeted)

- **Critical** — the brainstorm file is **missing entirely** (nothing to review; `/ptp:plan` has no
  source).
- **High** — placeholder/empty content; **no real second option** (and no "only one viable"
  rationale); **no recommendation**; or **not a usable handoff**.
- **Medium** — shallow tradeoffs; recommendation without rationale; undocumented assumptions;
  scope/blast-radius unaddressed; spec-interaction not considered; a usable-but-gappy handoff.
- **Low** — nits: wording, formatting, ordering.

---

## Verdict

- **PASS** — no Critical and no High findings.
- **WARN** — a High is present, but no Critical.
- **FAIL** — any Critical is present.

Same vocabulary as `/ptp:review-plan`.

---

## Deliberate difference from review-plan: NO `openspec validate`

`/ptp:review-plan`'s rubric runs `npx -y openspec validate <id> --strict` against the change's
proposal/spec. **A brainstorm precedes any proposal or spec delta, so there is nothing to validate.**
This skill **omits that step deliberately** and states the omission explicitly here so a maintainer
does not "fix" the skill by adding a validate call — there is no proposal to validate, and such a
call would error.

---

## Report + next step

- **Single change/file:** findings **grouped by severity** → the **verdict** → the **next step**:
  - **PASS** → recommend `/ptp:plan <change-id>`.
  - **FAIL due to a missing brainstorm** (the Critical "no brainstorm to review" finding) → recommend
    running **`/ptp:brainstorm <change-id>`** *first* (there is nothing to revise yet — the brainstorm
    must be authored before `/ptp:plan` has a source).
  - **WARN/FAIL otherwise** (a brainstorm exists but is thin/placeholder/unusable) → recommend
    **re-running `/ptp:brainstorm <change-id>`** to revise. **Never hand-edit the brainstorm here** —
    this mirrors `/ptp:review-plan`'s "report, don't silently fix" rule. The user revises by re-running
    the brainstorm-author step.

- **All changes (empty argument):** a **summary table** first (`change-id → PASS/WARN/FAIL` + finding
  counts), then a **detail block for each non-PASS change**. PASS changes need no detail.

---

## Hard rules

- **Read-only.** Edit nothing, fix nothing, write no file (including the brainstorm).
- **No git.** Run no git operation.
- **No branch guard.** Run **no** `ptp-branch-guard` and **never** launch `ptp-branch-prep` — this is
  a read-only review (like `/ptp:review-plan`, the other read-only reviewers, and `/ptp:status`).
- **No `openspec validate`.** A brainstorm precedes any proposal/spec — there is nothing to validate.
- **Trigger no other ptp command.** Do not invoke `/ptp:plan`, `/ptp:brainstorm`, or any other ptp
  command. Recommend the next command in **text only**; the user runs it explicitly.
