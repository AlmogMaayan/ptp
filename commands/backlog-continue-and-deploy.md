---
description: Run the backlog-continue flow unchanged, then ship the branch once every epic prefix settled
argument-hint: "[phase:apply] [what went wrong during the manual check — omit entirely to sign off]"
disable-model-invocation: true
---

## Arguments

Take `$ARGUMENTS` exactly as `/ptp:backlog-continue` takes it: an empty argument signs the manual check off, issue text drives a fix pass, and `phase:apply` applies a `planned` epic. Pass it through verbatim.

## Owner

Invoke the `ptp-backlog-continue-and-deploy` skill (`skills/ptp-backlog-continue-and-deploy/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.

If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report.
