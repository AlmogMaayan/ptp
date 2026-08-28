---
name: ptp-review-brainstorm
description: Own one main-agent review pass over a brainstorm and the findings it reports
---

# ptp-review-brainstorm — the brainstorm-quality gate methodology

## Purpose

**Model dispatch target.** `/ptp:review-brainstorm` runs this skill's work at `opus.high` via `ptp-run-at-model` (`skills/ptp-run-at-model/SKILL.md`), which owns the spawn-and-relay mechanics and requires its caller to supply the target. This names the target only; it restates none of that contract.

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

## The rubric (semantic sufficiency, aligned with review-plan's — NOT copied)

This is the brainstorm-side counterpart of the artifact rubric authored in `commands/review-plan.md`:
the same principle — block on what a reader genuinely needs, never on prose volume, option count, or
section count. It asks whether the brainstorm is **semantically sufficient**, checking that it
records:

- **the decision** — one direction is actually stated, not merely surveyed;
- **the alternatives that were materially available** — each named, with the reason it was not taken;
- **the assumptions** taken autonomously, captured inline;
- **a usable handoff to `/ptp:plan`** — enough substance to transcribe into artifacts without
  re-deciding apply-level direction;
- **internal consistency** — the file does not contradict itself and does not carry current and
  obsolete truth side by side.

There is **no fixed option count** and **no fixed set of tradeoff axes**. Where no material design
choice existed, a brainstorm recording a single direction is sufficient on its own: no "only one
viable" incantation is required and its absence is not a finding. Sections populated with `None` are
never required. What blocks is an alternative a reader can see was **materially available** being
neither compared nor named, or a decision that is not stated or not usable.

**Blocking conditions — exhaustive.** Only these may block: a missing or placeholder brainstorm; a
missing decision; a materially available alternative that is neither compared nor named; a decision
unusable as a handoff to `/ptp:plan` (apply-level direction would have to be re-decided); an internal
contradiction; coexisting current and obsolete truth. Prose depth, option count, and section count
never block.

---

## Classification (vocabulary shared with `/ptp:review-plan`, retargeted)

- **Critical** — the brainstorm file is **missing entirely** (nothing to review; `/ptp:plan` has no
  source).
- **High** — placeholder/empty content; **no stated decision**; a **materially available** alternative
  that is neither compared nor named; an internal contradiction; coexisting current and obsolete
  truth; or **not a usable handoff**.
- **Medium** — undocumented assumptions; a usable-but-gappy handoff.
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
the verdict. For an empty-argument review-all run, one threshold governs the whole pass, so the
summary table can never mix thresholds across rows.

- **PASS** — no **actionable** Critical and no **actionable** High findings.
- **WARN** — an **actionable** High is present, but no actionable Critical.
- **FAIL** — any **actionable** Critical is present.

Same vocabulary as `/ptp:review-plan`.

**The missing-brainstorm Critical is never threshold-able away.** The "no brainstorm to review"
finding is **Critical**, and Critical is the top of the order, so it is actionable at **every**
threshold — including `critical`. The *FAIL due to a missing brainstorm* branch of *Report + next
step* below is therefore unchanged by this section.

---

## Deliberate difference from review-plan: NO `openspec validate`

`/ptp:review-plan`'s rubric runs `npx -y openspec validate <id> --strict` against the change's
proposal/spec. **A brainstorm precedes any proposal or spec delta, so there is nothing to validate.**
This skill **omits that step deliberately** and states the omission explicitly here so a maintainer
does not "fix" the skill by adding a validate call — there is no proposal to validate, and such a
call would error.

---

## Report + next step

- **Single change/file:** the **resolved threshold and its source layer** → findings **grouped by
  severity** (below-threshold findings still listed under their own severity, marked non-blocking; a
  report in which every finding is below the threshold still enumerates them and is never rendered as
  "no findings") → the **verdict** → the **next step**:
  - **PASS** → recommend `/ptp:plan <change-id>`.
  - **FAIL due to a missing brainstorm** (the Critical "no brainstorm to review" finding) → recommend
    running **`/ptp:brainstorm <change-id>`** *first* (there is nothing to revise yet — the brainstorm
    must be authored before `/ptp:plan` has a source).
  - **WARN/FAIL otherwise** (a brainstorm exists but is thin/placeholder/unusable) → recommend
    **re-running `/ptp:brainstorm <change-id>`** to revise. **Never hand-edit the brainstorm here** —
    this mirrors `/ptp:review-plan`'s "report, don't silently fix" rule. The user revises by re-running
    the brainstorm-author step.

- **All changes (empty argument):** the resolved threshold and its source layer stated **once for the
  pass**, a **summary table** first (`change-id → PASS/WARN/FAIL` + finding counts), then a **detail
  block for each non-PASS change**. PASS changes need no detail — except a PASS carrying **any**
  below-threshold finding: it gets a detail block listing those findings under their own severity,
  marked non-blocking, so the threshold never makes a finding invisible; and a PASS that only passes
  because the threshold **demoted** a finding additionally says so on its row. (At the default `low`
  no finding is ever below the threshold, so this exception never fires and the table reads exactly
  as today.)

---

## Hard rules

- **Read-only.** Edit nothing, fix nothing, write no file (including the brainstorm).
- **No git.** Run no git operation.
- **No branch guard.** Run **no** `ptp-branch-guard` and **never** launch `ptp-branch-prep` — this is
  a read-only review (like `/ptp:review-plan`, the other read-only reviewers, and `/ptp:status`).
- **No `openspec validate`.** A brainstorm precedes any proposal/spec — there is nothing to validate.
- **Trigger no other ptp command.** Do not invoke `/ptp:plan`, `/ptp:brainstorm`, or any other ptp
  command. Recommend the next command in **text only**; the user runs it explicitly.
