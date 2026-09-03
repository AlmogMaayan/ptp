---
description: Run one main-agent review pass over a change's planning artifacts and report its findings
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
   - `proposal.md`; `design.md` (may be absent — its absence is never itself a finding); `tasks.md`;
     `specs/**/spec.md` (may be absent); and **line 1 only** of `effort.md` (may be absent — absence or
     a first line that does not match `{model}.{effort}` is at most Medium, never a High or Critical,
     and SHALL NOT block `/ptp:apply`; lines 2 and beyond are ignored, never validated).
   - Do **not** load `TLDR.md`. It is not an input to this review, and a legacy folder carrying one is not a finding.
   - `brainstorm.md` is **not** a default input: read it only to adjudicate a **disputed** decision
     source. A `Source` path that does not resolve is **not** a blocking condition.

3. **Run the rubric** against each change. This is a structured artifact audit authored inline — do **not** invoke the `ptp-requesting-code-review` skill (it targets code; artifacts are a different object). Apply that same rigor to the reasoning, not the code.

   This file is the **single author** of the artifact rubric. Every other artifact-review surface —
   `commands/review-plan-loop.md`, `commands/review-plan-full.md`, `commands/codex-review-plan.md`,
   `commands/codex-review-plan-loop.md`, and the `artifact` dispatch bullets of
   `skills/ptp-review-loop/SKILL.md` — **references** the two closed lists below and never restates
   them.

   **Order of the pass.** Per iteration, run exactly this, in this order:

   1. `npx -y openspec validate <change-id> --strict`.
   2. The deterministic **compactness lint** published by the `compact-artifact-contract` capability
      (defined by `0057_02_compact-artifact-contract-and-schema`):
      `node scripts/ptp-compact-lint.js --workspace <resolved workspace root> --change <change-id>`
      — the root resolved at entry (`ptp-workspace`), passed as an argument, never as a `cd`.
   3. Exactly **one** model review pass, which receives the validation result and the lint report as
      inputs and returns **all** findings for that iteration in **one structured** emission — no
      incremental drip, and no second model review pass over the same artifact state.

   Lint output is **not** a separate finding stream: each lint report is classified by the step-4
   severity mapping like any other observation, so a lint report matching a blocking condition below
   becomes a blocking finding and every other lint report is Medium or Low. If the lint is
   unavailable, errors, or cannot be run, record a **non-blocking note** and continue — it never
   STOPs the review, never changes a verdict, and never changes a terminal state.

   **Testability mode (`tdd`).** Resolve `tdd` from layered ptp config **once**, at the start of this
   pass, and hold it fixed — layered exactly as `review.minSeverity` above (`ptp-workspace`,
   forgiving read, default `advisory`; a missing file, missing key, unparseable JSON, or unrecognized
   value falls back to `advisory` rather than erroring, and never STOPs the review). It re-classifies
   the missing-testability-shape observation in condition 5 between High-inside-5 and Medium-outside;
   it changes nothing else.

   **Blocking conditions — exhaustive.** A finding may block only when at least one of these eight
   holds. Nothing outside this list may block:

   1. **Validation fails** — the change folder is missing, or `npx -y openspec validate <change-id> --strict` does not pass.
   2. **Scope/capability mapping is missing or contradictory** — `proposal.md` does not name the
      capabilities the spec deltas touch, or names capabilities the spec deltas do not touch.
   3. **A normative requirement has no scenario** — a `### Requirement:` carrying SHALL/MUST text with no `#### Scenario:` block.
   4. **A requirement has no implementing task** in `tasks.md`.
   5. **A task is not agent-executable, or is not verifiable by an automated check.**

      **Banned-manual-task check.** This is the detection half of this blocking condition — not a
      separate rubric item — so the block-list above stays exhaustive. Flag any checkbox whose
      completion depends on a person acting **outside the reach of the agent** that runs `/ptp:apply`.
      The test is *who must act*, never which words appear. The normative source of the authoring ban
      is the `tasks-authoring` capability (`0053_01_no-manual-tasks-authoring`) — this check detects
      violations of that existing rule, it is not a second rule. Illustrative banned shapes, carried
      over from that capability: **manual QA**; **manual or exploratory testing**; **"manually
      verify"**; **"verify by hand"**; **"check in the browser"**; **"have a human confirm"**; **"ask
      the user to try"** — plus further illustrations in the same spirit ("visually inspect"; a human
      sign-off or approval step; "test on a physical device"). These are **illustrations of the
      executor test, not the test itself**: a checkbox matching no listed phrase ("confirm with the
      design team before shipping") is still flagged, and the check is never applied as a word
      blacklist. A banned manual task is classified **High** (see step 4).

      **Exception (narrow).** A task that **authors an automated test**, or that runs a command and
      asserts on its output, is acceptable even when its prose describes user-facing behavior, because
      its executor is the implementing agent. The exception is narrow: it applies only where the
      checkbox is otherwise completable by the agent unaided, and the executor test is applied to the
      checkbox **as a whole** rather than to the clause naming the test — so a mixed checkbox that
      authors a test *and* additionally asks a human to perform, observe, or confirm anything is still
      flagged.

      **Finding shape.** Every banned-manual-task finding SHALL quote the **exact offending
      checkbox**, identified as a task line inside the change's own `tasks.md`, and SHALL state a
      concrete **intent-preserving** remedy drawn from `0053_01_no-manual-tasks-authoring`'s ordered
      **two-branch** rule: **(1) substitute** — an automatable replacement checkbox the implementing
      agent can execute (where an existing task already carries the intent, fold the offending
      checkbox into it); else, **if and only if** no automated equivalent exists, **(2) relocate** —
      remove the checkbox and record its intent in `proposal.md > Success criteria` as a plain
      **non-checkbox** note. There is **no third branch**: the remedy SHALL NOT be stated as
      **deletion** and SHALL NOT propose silently dropping the verification intent — `0053_01`'s rule
      is *substituted, and only otherwise relocated — never deleted*.
      Why this shape: it satisfies **both** conjunctive conditions of the `(c1)` carve-out established
      by `0053_02_manual-finding-filter-carveout` — the finding's **subject** is a banned task line
      inside the change's own `tasks.md` (quoted as evidence) and its **remedy** is a concrete edit to
      that same `tasks.md` — so the finding reads as a concrete artifact-defect pointer rather than a
      bare "check this by hand" suggestion, and survives `ptp-review-loop`'s per-iteration
      manual-check / tests-required filter (step `(c1)`).

      **What counts as a fix.** When a fixing loop resolves the finding it applies the same ordered
      two-branch rule: the offending checkbox is **rewritten in place** into something the
      implementing agent can execute (an automated test, a command plus an assertion on its output, or
      a file/content check) — which, where an existing task already carries the intent, means folding
      the offending checkbox into that task; else its intent is **relocated out of `tasks.md`** into
      `proposal.md > Success criteria` as a non-checkbox note. Deleting the checkbox while preserving
      its intent nowhere, annotating the task ("(manual)"), moving it under a "manual follow-up"
      heading **inside `tasks.md`**, marking it optional, or demoting it to a note that stays in
      `tasks.md` does **not** count as a fix. Relocation **out of** `tasks.md` per branch 2 *is* a
      fix, and is not to be confused with that banned in-file move. This fix contract governs the fix
      pass of the fixing loops (`/ptp:review-plan-loop`, `/ptp:codex-review-plan-loop`,
      `/ptp:review-plan-full`) — **not** `/ptp:review-plan` itself, which stays read-only and edits
      nothing (see *Hard rules*).

      **Missing-testability-shape check.** This is a second detection half of this same blocking
      condition — not a separate rubric item — so the block-list above stays exhaustive. The
      `tasks-authoring` capability (`openspec/specs/tasks-authoring/spec.md`) requires every checkbox
      to declare its testability through **exactly one of two shapes**, chosen by whether it changes
      executable behavior: a behavior-changing checkbox ends its `verify:` clause **naming the
      specific test file and test case** it adds or extends; a prose-only checkbox instead carries the
      literal marker `[prose-exempt: <reader it binds>]` naming its reader. A checkbox that only gates
      is exempt from both. Flag a **behavior-changing** checkbox that names no test case **and** carries
      no `[prose-exempt: …]` marker: **High**, blocking as an instance of this condition, when the
      resolved `tdd` value is `mandatory`; **Medium**, a reported non-blocking observation outside the
      block list, when it is `advisory`. Quote the exact offending checkbox and state its fix (name the
      test file and case, or add the `[prose-exempt: <reader>]` marker). This re-classifies one
      observation between High-inside-5 and Medium-outside; it does not add a ninth block condition.
   6. **A non-obvious implementation decision or invariant is missing** — apply could not proceed
      without asking a human to re-decide it.
   7. **Two artifacts disagree.**
   8. **One artifact carries current and obsolete truth at the same time** — an obsolete statement
      together with its correction is defective even when the later statement is right.

   **Must not be required — closed list.** This rubric does **not** require, and no reader may block
   or raise a finding at any severity on, any of these six retired pressures — each of which
   **MUST NOT be required**, here or on any surface referencing this rubric:

   - a fixed number of alternatives;
   - boilerplate sections populated with `None`;
   - rationale present in both `proposal.md` and `design.md`;
   - effort justification;
   - `TLDR.md` presence or consistency — a legacy folder carrying one raises nothing;
   - restated happy-path / unhappy-path prose where the spec scenarios already express those cases.

   **Legacy tolerance.** A change folder created under the pre-compaction contract may carry
   a legacy `TLDR.md`, a legacy multi-line `effort.md`, and a `design.md` written for mechanical
   work. None of those legacy shapes is a finding at any severity, and none affects a verdict, a convergence decision, or a
   terminal state. An absent `effort.md`, or a first line that does not match
   `^(haiku|sonnet|opus)\.(low|medium|high|xhigh)$`, stays at most a **Medium** finding and never
   blocks `/ptp:apply`; content on lines 2 and beyond is ignored rather than validated.

4. **Classify each finding** (vocabulary shared with `/ptp:review`, retargeted to artifacts). The four
   labels are unchanged by the rubric rewrite; the blocking conditions map onto them as:
   - **Critical** — `proposal.md` missing; blocking condition 1 (`validate --strict` fails); a spec delta contradicting the proposal's stated scope (the contradictory half of condition 2).
   - **High** — blocking conditions 2 (missing mapping), 3, 4, 5, 6, 7, and 8 — including a `tasks.md` checkbox with a human executor, flagged by the banned-manual-task check inside condition 5, which stays **High**; and, under resolved `tdd: mandatory`, a behavior-changing checkbox carrying neither testability shape, flagged by the missing-testability-shape check inside condition 5.
   - **Medium** — an observation outside the block-list a reader should still see: a vague or uncheckable success criterion, an absent or malformed `effort.md` first line, a compactness-lint report matching no blocking condition, and — under resolved `tdd: advisory` — a behavior-changing checkbox carrying neither testability shape.
   - **Low** — nits: wording, formatting, ordering; the remaining compactness-lint reports.

   Medium and Low findings never by themselves produce a `WARN` or a `FAIL`.

   Classification is **threshold-independent**: every finding is classified by this rubric
   and listed regardless of the configured severity threshold. The threshold applies only at step 5,
   and only to what **blocks**.

5. **Assign a verdict** per change:

   **Severity threshold.** Resolve `review.minSeverity` from layered ptp config **once**, at the
   start of this pass, and hold it fixed for the pass — layered as `ptp-workspace`
   (`skills/ptp-workspace/SKILL.md`) defines, default `low`; a missing file, missing key,
   unparseable JSON, or unrecognized value falls back to the prior valid value (ultimately `low`)
   rather than erroring, and **never** STOPs the review. The `/ptp:config` parameter registry
   (`commands/config.md`, `skills/ptp-config/`) owns the key, its domain, and its validation — this
   is a pointer to that contract, not a second reader definition. Severity order is `low < medium <
   high < critical`. A finding is **actionable** when its severity is **at or above** the resolved
   threshold. Findings **below** the threshold are still classified and still listed under their own
   severity, marked *(below the configured `review.minSeverity` — reported, non-blocking)*; they
   never by themselves produce a `WARN` or a `FAIL`. Because this verdict never counted Medium or
   Low toward its outcome, `low`, `medium`, and `high` behave identically here; only `critical`
   changes a verdict, by demoting High to reported-only — do **not** "repair" that apparent no-op by
   making Medium findings `WARN`. State the resolved threshold **and the layer it resolved from** (a
   `ptp-workspace` provenance label) in the report, and when the threshold demoted at least one
   finding out of the blocking set, say so beside the verdict.

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
