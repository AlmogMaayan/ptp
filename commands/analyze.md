---
description: Read-only investigation of a bug or question, writing an evidence-backed analysis doc into the change folder
argument-hint: "<bug / observation / problem / question to investigate> [model:<model>.<effort>] [--workspace <path>]"
---

## Arguments

Take `$ARGUMENTS` as the free-text subject to investigate — a bug, an observation, a problem, or a question. It carries no change selector. It MAY also carry an optional `model:<model>.<effort>` override token; see `skills/ptp-analyze/SKILL.md` for how it is parsed and honored.

## Owner

Invoke the `ptp-analyze` skill (`skills/ptp-analyze/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
