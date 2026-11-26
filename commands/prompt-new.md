---
description: Discard the understanding held from earlier /ptp:prompt turns and restate a new request from scratch, writing no file
argument-hint: "<free-text request> [model:<model>.<effort>]"
---

## Arguments

Take the entire argument as free-text. It MAY also carry an optional `model:<model>.<effort>`
override token; see `skills/ptp-prompt-new/SKILL.md` for how it is parsed and honored. Empty text
after the token strip discards the held understanding only.

## Owner

Invoke the `ptp-prompt-new` skill (`skills/ptp-prompt-new/SKILL.md`).

## Report

Print the discard line, then restate the new request as a first request and ask the user to confirm
or correct it (via `/ptp:prompt-fix`); write no file. There is no change id, since nothing is
persisted. Report the resulting state (`restated`, `nothing held`, `refused` or `failed`), any
failures, and the next command to run (`/ptp:prompt-fix` to correct, or `/ptp:prompt` after
`nothing held`).

If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report.
