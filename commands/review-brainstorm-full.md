---
description: Review a brainstorm with both reviewers in sequence, fixing findings inline until each phase converges
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active changes' brainstorms)"
---

## Arguments

Take `$ARGUMENTS` as an optional change selector, empty meaning every active change. Resolve the change selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-review-brainstorm-full` skill (`skills/ptp-review-brainstorm-full/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
