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

This command never fixes, so the fix-target contract in `ptp-review-loop` is a **no-op** here: no
fix pass is dispatched and this command's `opus.high` review target is unchanged.

## Inputs

Change id (optional): $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change. Preserve the existing empty-argument default: omitting `$ARGUMENTS` reviews all active changes.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes). Its artifact-audit
work runs **at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer
session runs only the abort-guaranteeing preconditions first — selector disambiguation that must STOP
and ask the user, and (per resolved change) change-folder existence — while the empty-argument
review-all-active default is preserved (see *Inputs* and step 1). It then invokes
**`ptp-run-at-model`** with target `opus.high` to run the review work below **over the
already-resolved scope** (the audit work of steps 2–6; step 1's scope resolution and its STOP-and-ask
disambiguation are the outer precondition above, so the subagent does not re-decide scope); that
spawns one foreground `opus` subagent (high effort directive) which runs the inline rubric, per-change
verdict, and summary table, **editing nothing**, and the subagent's outcome is relayed back per
`ptp-run-at-model`'s *Result relay*. (For a multi-change or empty-argument review-all selector, the
one subagent handles the whole per-change pass.)

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

   Classification is **threshold-independent**: every finding is classified by this unchanged rubric
   and listed regardless of the configured severity threshold. The threshold applies only at step 5,
   and only to what **blocks**.

5. **Assign a verdict** per change:

   **Severity threshold.** Resolve `review.minSeverity` from layered ptp config **once**, at the
   start of this pass, and hold it fixed for the pass — global `~/.claude/ptp/config.json`, then
   project `<repo>/.claude/ptp/config.json` overriding, default `low`; a missing file, missing key,
   unparseable JSON, or unrecognized value falls back to the prior valid value (ultimately `low`)
   rather than erroring, and **never** STOPs the review. The `/ptp:config` parameter registry
   (`commands/config.md`, `skills/ptp-config/`) owns the key, its domain, and its validation — this
   is a pointer to that contract, not a second reader definition. Severity order is
   `low < medium < high < critical`. A finding is **actionable** when its severity is **at or above**
   the resolved threshold. Findings **below** the threshold are still classified and still listed
   under their own severity, marked *(below the configured `review.minSeverity` — reported,
   non-blocking)*; they never by themselves produce a `WARN` or a `FAIL`. Because this verdict never
   counted Medium or Low toward its outcome, `low`, `medium`, and `high` behave identically here;
   only `critical` changes a verdict, by demoting High to reported-only — do **not** "repair" that
   apparent no-op by making Medium findings `WARN`. State the resolved threshold **and the layer it
   resolved from** (default / global / project) in the report, and when the threshold demoted at
   least one finding out of the blocking set, say so beside the verdict.

   One threshold governs the **whole pass**: for a multi-change or empty-argument review-all run it
   is resolved once, before the first change, and applied uniformly, so the summary table can never
   mix thresholds across rows.

   - **PASS** — no **actionable** Critical or High findings.
   - **WARN** — **actionable** High present, no actionable Critical.
   - **FAIL** — any **actionable** Critical.

6. **Report.**
   - **Single change:** the resolved threshold and its source layer, then findings grouped by severity (below-threshold findings still listed under their own severity, marked non-blocking — a report in which every finding is below the threshold still enumerates them and is never rendered as "no findings"), then the verdict, then the next step:
     - PASS → `/ptp:apply <change-id>`
     - WARN/FAIL → `/ptp:plan` to revise the artifacts (do not hand-edit them here).
   - **All changes:** the resolved threshold and its source layer stated **once for the pass** alongside the summary table (`change-id → PASS/WARN/FAIL` + finding counts), then a detail block for **each non-PASS change**. PASS changes need no detail — except a PASS carrying **any** below-threshold finding: it gets a detail block listing those findings under their own severity, marked non-blocking, so the threshold never makes a finding invisible; and a PASS that only passes because the threshold **demoted** a finding additionally says so on its row. (At the default `low` no finding is ever below the threshold, so this exception never fires and the table reads exactly as today.)

## Hard rules

- This command is **read-only**. Do **not** edit any files. Do **not** run `openspec apply` / `openspec archive`.
- Do **not** fix the artifacts here. Findings are reported; the user fixes them by re-running `/ptp:plan` (the artifact-author step). This mirrors `/ptp:review`'s "report, don't silently fix" rule.
- Do **not** review code — that is `/ptp:review` after `/ptp:apply`. If the change is already implemented, you still review only the artifacts.
- This gate is **advisory**, not enforced: a non-PASS verdict does not block `/ptp:apply`, but you must clearly recommend revising first.
- Do **not** invoke or trigger any other ptp command (`/ptp:plan`, `/ptp:apply`, etc.). Recommend the next command in text; the user runs it explicitly.
