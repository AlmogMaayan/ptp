---
description: Show the ptp telemetry surface and route to its setup, start, stop, and report commands
argument-hint: "status | report | analyze | setup | start | stop | export   (the rest of the argument is passed to the leaf verbatim)"
---

## Arguments

Take the first word of `$ARGUMENTS` as the leaf name — `status`, `report`, `analyze`, `setup`, `start`, `stop`, or `export` — and pass the remainder to that leaf verbatim.

## Owner

Invoke the `ptp-telemetry` skill (`skills/ptp-telemetry/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
