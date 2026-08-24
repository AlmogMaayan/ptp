---
description: Add one epic to the backlog board from free text, without touching any other entry
argument-hint: "<free-text description of the epic to add> [model:<model>.<effort>]"
---

## Arguments

Parse and strip the per-invocation `model:<model>.<effort>` token, then take the remainder as the free-text description of the epic to add. An empty remainder is a STOP in the outer session — report that a free-text epic request is required and never invent an epic to fill it.

## Owner

Invoke the `ptp-backlog` skill (`skills/ptp-backlog/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
