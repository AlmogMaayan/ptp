---
description: Read-only investigation of a bug or question, writing an evidence-backed analysis doc into the change folder
argument-hint: "<bug / observation / problem / question to investigate> [model:<model>.<effort>] [--workspace <path>]"
---

## Arguments

Take `$ARGUMENTS` as the free-text subject to investigate — a bug, an observation, a problem, or a question. It carries no change selector. It MAY also carry an optional `model:<model>.<effort>` override token; see `skills/ptp-analyze/SKILL.md` for how it is parsed and honored.

## Owner

Invoke the `ptp-analyze` skill (`skills/ptp-analyze/SKILL.md`).

Its bug-route investigation drives `ptp-systematic-debugging` (or `superpowers:systematic-debugging` when the skill-set directive names `tdd-plugin=superpowers`).

**`superpowers-output-override`** (autonomy-only): when the `tdd-plugin=superpowers` arm ran and Superpowers drove the debugging investigation, the analysis stays in the `ptp-analyze`-governed change-folder doc (never `docs/superpowers`); do not `git commit`/`git add` and do not stop at a human approval gate — this runs autonomously and ptp reviews afterward.

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
