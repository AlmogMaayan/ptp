---
description: Save one lesson from a pasted model message and your answer to both learnings files, when learning is on
argument-hint: "<pasted model message and your answer> [model:<model>.<effort>]"
---

## Arguments

Take the entire argument as the paste: a model message and the user's answer to it. It MAY also carry
an optional `model:<model>.<effort>` override token; see `skills/ptp-learn/SKILL.md` for how it is
parsed and honored.

## Owner

Invoke the `ptp-learn` skill (`skills/ptp-learn/SKILL.md`).

## Report

Report the state (`recorded`, `learning off` or `not recorded`), the lesson id, the written paths, any
named fallback, the git report sentence, any failures, and the next command to run. There is no change id.

If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report.
