---
name: ptp-verification-before-completion
description: Use before claiming work complete, fixed, or passing.
---

# Verification before completion

A completion claim is admitted only on fresh, risk-proportional evidence produced in the run making
the claim — never on assumption, hedging, or a delegated report.

## Rules

- VBC-1 No completion, success, or "fixed" claim without evidence produced in the current run.
- VBC-2 Report each claim as the claim, the command that establishes it, and that command's result —
  or as the unresolved gap.
- VBC-3 Evidence is proportional to risk: the higher the blast radius of the claim, the more
  complete the check backing it.
- VBC-4 A verification that genuinely does not apply is reported as `N/A: <reason>` — distinct
  from an unresolved gap, never a pass — and never used where a runnable check exists.
- VBC-5 An unresolved gap is stated explicitly and withholds the completion claim; report the
  partial state instead.
- VBC-6 "Should", "probably", "seems to", and satisfaction wording are not evidence and never
  precede it.
- VBC-7 A delegated run's own success report is not evidence; check the resulting files or diff
  before any completion claim, the per-kind verification step itself staying owned by
  `review-loop`.
- VBC-8 Evidence produced before the most recent edit is stale; re-run it.
