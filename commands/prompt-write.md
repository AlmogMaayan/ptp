---
description: Write this conversation's accumulated /ptp:prompt understanding to a prompt file
argument-hint: "[change-id | selector] [model:<model>.<effort>]"
---

## Arguments

Take the argument, if any, as a change selector. Resolve it through the `ptp-change-selector` skill.
An empty argument, or one resolving to no existing change (an epic container counts as existing), allocates a fresh epic instead. The
argument MAY also carry an optional `model:<model>.<effort>` override token; see
`skills/ptp-prompt-write/SKILL.md` for how it is parsed and honored. No other selector grammar is
introduced here.

## Owner

Invoke the `ptp-prompt-write` skill (`skills/ptp-prompt-write/SKILL.md`).

## Report

Report the change id where `prompt.md` was written (resolved or newly allocated), the resulting
state, any failures, and the next command to run.

If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report.
