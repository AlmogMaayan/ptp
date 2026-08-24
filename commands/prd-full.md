---
description: Write a product requirements document and review it with both reviewers until it converges
argument-hint: "<epic-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN (omit = all active epics)"
---

## Arguments

Parse and strip the per-invocation `model:<model>.<effort>` token, then take the remainder as an epic selector. Resolve the epic selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-prd-full` skill (`skills/ptp-prd-full/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
