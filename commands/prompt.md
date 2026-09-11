---
description: Restate the assistant's understanding of a free-text request, conversationally, writing no file
argument-hint: "<free-text request> [model:<model>.<effort>]"
---

## Arguments

Take the entire argument as free-text. It MAY also carry an optional `model:<model>.<effort>`
override token; see `skills/ptp-prompt-draft/SKILL.md` for how it is parsed and honored.

## Owner

Invoke the `ptp-prompt-draft` skill (`skills/ptp-prompt-draft/SKILL.md`).

## Report

Restate the assistant's understanding of the request and ask the user to confirm or correct it (via
`/ptp:prompt-fix`); write no file. There is no change id, since nothing is persisted. Report the
resulting state, any failures, and the next command to run (`/ptp:prompt-fix` to correct, or proceed
straight to `/ptp:brainstorm`/`/ptp:plan` once confirmed).
