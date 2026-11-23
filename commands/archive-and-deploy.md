---
description: Archive a reviewed change and then ship the branch, combining the archive and deploy steps
argument-hint: "[change-selector] — id, epic:all, epic:XXXX, story:NN, or epic:XXXX story:NN; empty = `epic:all`"
disable-model-invocation: true
---

## Arguments

Take `$ARGUMENTS` as a change selector. Resolve the change selector through the `ptp-change-selector` skill.

## Owner

Invoke the `ptp-archive-and-deploy` skill (`skills/ptp-archive-and-deploy/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.

If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report.
