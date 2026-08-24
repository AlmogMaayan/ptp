---
description: Review a product requirements document with both reviewers in sequence until each phase converges
argument-hint: "[epic-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit to review ALL active epics' PRDs)"
---

## Arguments

Take `$ARGUMENTS` as an optional epic selector, empty meaning every active epic. Resolve the epic selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-review-prd-full` skill (`skills/ptp-review-prd-full/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
