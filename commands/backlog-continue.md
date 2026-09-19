---
description: Resume the epic whose backlog entry is in progress, from wherever the previous run stopped
argument-hint: "[phase:apply] [what went wrong during the manual check — omit entirely to sign off]"
---

## Arguments

Take `$ARGUMENTS` as what went wrong during the manual check; an empty argument signs the check off.
Prefix `phase:apply` to instead apply a `planned` epic's slices via `/ptp:full-apply` — settling the entry to `in-review` on convergence or `blocked` on halt — with any accompanying text passed verbatim as a brief to that apply work.

## Owner

Invoke the `ptp-backlog-continue` skill (`skills/ptp-backlog-continue/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
