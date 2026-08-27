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

Also report the **review tally** the `ptp-prd-full` skill relayed from its wrapped review step, at **every** terminal state — the two iteration caps included, and one table per epic inside that epic's own report block on a multi-epic selector. Render it in the shared tally format (`skills/ptp-review-loop/references/review-tally-table.md`); that document and the skill own the table's rules, which are cited here, not restated. On the prd-gate STOP, where the review phase never ran, print the non-table line `Review tally: unknown` instead of a table.
