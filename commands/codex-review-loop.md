---
description: Loop Codex code review and inline fixes until findings clear or the iteration cap is reached
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

## Arguments

Take `$ARGUMENTS` as a change selector. Resolve the change selector through the `ptp-change-selector` skill. Run the loop with kind `code` and reviewer `codex`, whose review pass runs the `commands/codex-review.md` protocol inline.

## Owner

Invoke the `ptp-review-loop` skill (`skills/ptp-review-loop/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
