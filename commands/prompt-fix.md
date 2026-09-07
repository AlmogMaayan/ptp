---
description: Correct or extend the understanding held from a prior /ptp:prompt turn in this conversation, then restate it
argument-hint: "<correction or clarification>"
---

## Arguments

Take the entire argument as free-text. No selector, no token parsing.

## Owner

Invoke the `ptp-prompt-draft` skill (`skills/ptp-prompt-draft/SKILL.md`).

## Report

Restate the updated understanding and ask the user to confirm or keep correcting; write no file.
There is no change id, since nothing is persisted. Report the resulting state, any failures, and the
next command to run (another `/ptp:prompt-fix` to correct further, or proceed once confirmed).
