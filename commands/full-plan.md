---
description: Decompose an oversized change into slices and review each slice's plan until it converges
argument-hint: "<big-change-id-or-request>"
---

## Arguments

Parse and strip the per-invocation `parallel:` and `fast:` tokens, then take the remainder as a change id or a free-text request. Resolve the change selector through the `ptp-change-selector` skill. Stop after planning; apply nothing.

## Owner

Invoke the `ptp-full` skill (`skills/ptp-full/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
