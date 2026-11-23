---
description: Run one main-agent review pass over a brainstorm and report its findings
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active changes' brainstorms)"
---

## Arguments

Take `$ARGUMENTS` as an optional change selector, empty meaning every active change. Resolve the change selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-review-brainstorm` skill (`skills/ptp-review-brainstorm/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.

If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report.
