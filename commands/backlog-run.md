---
description: Run ready backlog epics one at a time through the full plan-and-apply flow
argument-hint: "[rounds:{count}]"
---

## Arguments

Parse and strip the per-invocation `rounds:{count}` token, defaulting to five rounds. No other argument is accepted.

## Owner

Invoke the `ptp-backlog-run` skill (`skills/ptp-backlog-run/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
