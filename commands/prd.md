---
description: Write a product requirements document for a change from a free-text request
argument-hint: "<changeid> | epic:XXXX | story:XX | \"<free-text description>\" [--workspace <path>] (one or more; free text allocates a fresh epic; omit = all active epics)"
---

## Arguments

Take `$ARGUMENTS` as one or more epic selectors or a free-text description; free text allocates a fresh epic. Resolve the epic selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-prd` skill (`skills/ptp-prd/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
