---
description: Archive changes while bypassing the archive gates, still syncing delta specs into the main specs
argument-hint: "id, epic:XXXX, story:NN, epic:XXXX story:NN, or empty for all active changes"
disable-model-invocation: true
---

## Arguments

Take `$ARGUMENTS` as a change selector, empty meaning every active change. Resolve the change selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-archive-force` skill (`skills/ptp-archive-force/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
