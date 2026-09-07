---
description: Write this conversation's accumulated /ptp:prompt understanding to a prompt file
argument-hint: "[change-id | selector]"
---

## Arguments

Take the argument, if any, as a change selector. Resolve it through the `ptp-change-selector` skill.
An empty argument, or one resolving to no existing active change, allocates a fresh epic instead.

## Owner

Invoke the `ptp-prompt-write` skill (`skills/ptp-prompt-write/SKILL.md`).

## Report

Report the change id where `prompt.md` was written (resolved or newly allocated), the resulting
state, any failures, and the next command to run.
