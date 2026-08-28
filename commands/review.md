---
description: Run one main-agent review pass over a change's code diff and report its findings
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

You are running **step 4** of the ptp flow. The change has been implemented. Your job is to **invoke PTP code review** and grade the diff against the OpenSpec artifacts.

This command never fixes, so the fix-target contract in `ptp-review-loop` is a **no-op** here: no
fix pass is dispatched and this command's `opus.high` review target is unchanged.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Steps

This command is **read-only** — it runs **no** branch guard (it never writes). Its review work runs
**at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`. The outer session
runs only the abort-guaranteeing preconditions first — per resolved change, the change-folder
existence check (`openspec/changes/<change-id>/`; if absent, STOP and redirect to `/ptp:plan`) and
selector disambiguation that must STOP and ask the user — so a guaranteed abort never spawns a
subagent. It then invokes **`ptp-run-at-model`** with target `opus.high` and the work below (steps
1–6); that spawns one foreground `opus` subagent (high effort directive) which performs the read-only
review and classification, **fixing nothing**, and the subagent's outcome is relayed back per
`ptp-run-at-model`'s *Result relay*. (For a multi-change selector, the one subagent handles the whole
per-change pass, reporting per change.)

1. **Load the contract** from `openspec/changes/<change-id>/`:
   - `proposal.md` — intent
   - `design.md` — decisions
   - `tasks.md` — what was supposed to be done
   - `specs/**/spec.md` — the behavior contract
2. **Identify the diff** for this change. Prefer:
   - `git diff` against the merge base (if in a git repo and a feature branch is in use), OR
   - The files that the tasks explicitly touched.
3. **Invoke the `ptp-requesting-code-review` skill** via the Skill tool.
4. **Review against**:
   - The proposal — does the implementation match the stated intent?
   - The spec deltas — does the behavior match the contract? Are edge cases covered?
   - `tasks.md` — were all tasks actually done (not just checked)?
   - Project conventions — does the code fit the existing style/architecture?
   - Security, error handling at trust boundaries, test coverage.
5. **Classify each finding**:
   - **Critical** — must fix before merge (correctness, security, broken contract).
   - **High** — should fix before merge (clear bug, missing test for a stated behavior).
   - **Medium** — fix soon, doesn't block.
   - **Low** — nit / suggestion.

   Classification is **threshold-independent**: every finding is classified by this unchanged rubric
   and listed regardless of the configured severity threshold. The threshold applies only at step 6,
   and only to what **blocks**.
6. **Decide outcome**:

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
   never by themselves produce a do-not-archive outcome. Because this outcome never counted Medium
   or Low toward itself, `low`, `medium`, and `high` behave identically here; only `critical`
   changes an outcome, by demoting High to reported-only — do **not** "repair" that apparent no-op
   by making Medium findings block. State the resolved threshold **and the layer it resolved from**
   (a `ptp-workspace` provenance label) in the report, and when the threshold demoted at least one
   finding out of the blocking set, say so beside the outcome.

   - If **actionable** Critical or High findings exist: list them, suggest fixes, and tell the user to address them. Do **not** archive.
   - Otherwise (only Medium / Low, or a High demoted below the threshold — Critical is actionable at every threshold): report every finding — including the below-threshold ones, under their own severity and marked non-blocking — and tell the user the change is ready to archive via `/ptp:archive <change-id>` (or `/ptp:status` to double-check first). A report in which every finding is below the threshold still enumerates those findings; it is never rendered as "no findings".

## Hard rules

- Do **not** count required manual tests that have not yet been performed as findings. Manual tests are a future verification step; their absence is not a code defect.
- Do **not** archive in this command. Archiving is an explicit user action.
- **This command only reviews and classifies findings. It NEVER fixes anything.** It is read-only and runs no branch guard (the review subagent fixes nothing — see the flow above), so it must not edit code — not even for Critical/High findings, and not even if the user's phrasing sounds like "deal with it." Report the findings and stop. Fixing is a separate, explicit user action: route the user to `/ptp:review-fix <change-id>` (the same as the `codex-review` siblings).
- Do **not** judge the proposal itself in this step — that was the planning step's job. Judge the implementation **against** the proposal.
- Do **not** invoke `/ptp:apply` in response to findings, even if the user says "fix the findings," and do **not** edit code inline (this command is read-only and runs no branch guard). Route fixes to `/ptp:review-fix <change-id>` instead. `/ptp:apply` is only triggered by an explicit `/ptp:apply <change-id>` command from the user.
