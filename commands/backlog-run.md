---
description: Run ready backlog epics one at a time through the full plan-and-apply flow
argument-hint: "[count:{count}] [ticket:<value>]"
---

## Arguments

Parse and strip the per-invocation `count:{count}` token, defaulting to five rounds. Optionally accept a `ticket:<value>` token that selects one `Ready` entry to run — by board node id or exact title (double-quote the title when it contains whitespace) — and is mutually exclusive with `count:{count}`. No other argument is accepted.

## Owner

Invoke the `ptp-backlog-run` skill (`skills/ptp-backlog-run/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
