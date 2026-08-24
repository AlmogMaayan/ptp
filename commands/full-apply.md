---
description: Apply every slice of an already-planned oversized change, reviewing the code of each slice
argument-hint: "[change-selector or id …] (epic:XXXX, id list, or omit to run all active changes)"
---

## Arguments

Parse and strip the per-invocation `fast:on`/`fast:off` token, then take the remainder as a change selector. Resolve the change selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-full-apply` skill (`skills/ptp-full-apply/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
