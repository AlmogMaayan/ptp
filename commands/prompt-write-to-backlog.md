---
description: Write the /ptp:prompt understanding to the backlog as an entry
argument-hint: "[model:<model>.<effort>]"
---

## Arguments

Parse and strip the optional per-invocation `model:<model>.<effort>` token. No other argument is accepted; the request text comes from the conversation, not from the argument. See `skills/ptp-prompt-write-to-backlog/SKILL.md` for how the token is honored.

## Owner

Invoke the `ptp-prompt-write-to-backlog` skill (`skills/ptp-prompt-write-to-backlog/SKILL.md`).

## Report

Report the change id where the command resolved one (none is allocated here), the created entry's `id`, `title`, and `status` as the resulting state, any failures, and the next command to run.
