---
description: Edit exactly one backlog entry from a free-text instruction, including recovery of a stale entry
argument-hint: "<board-item-node-id> <what to change> [model:<model>.<effort>]"
---

## Arguments

Parse and strip the per-invocation `model:<model>.<effort>` token, then take the first remaining word as the board item node id and the rest as the instruction. A missing node id or an empty instruction is a STOP in the outer session — report what is required and never invent a mutation to fill it.

## Owner

Invoke the `ptp-backlog` skill (`skills/ptp-backlog/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
