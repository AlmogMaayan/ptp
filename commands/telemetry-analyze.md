---
description: Analyse recorded ptp telemetry and answer a question about model, effort, and cost patterns
argument-hint: "(takes no selector; the analysis engine's own non-selector flags are passed through)"
---

## Arguments

Take `$ARGUMENTS` as the question to answer; the analysis engine's own flags pass through unchanged. It carries no selector.

## Owner

Invoke the `ptp-telemetry-analyze` skill (`skills/ptp-telemetry-analyze/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
