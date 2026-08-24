---
description: Summarise recorded ptp telemetry into a readable report of runs, models, and durations
argument-hint: "[write] [selector]   (write is a literal keyword, stripped before the selector; selector: id | epic:XXXX | story:NN | epic:XXXX story:NN | epic:all — omit for every active epic)"
---

## Arguments

Strip a leading literal `write` keyword, then take the remainder as an optional selector. Resolve the change selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-telemetry-report` skill (`skills/ptp-telemetry-report/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
