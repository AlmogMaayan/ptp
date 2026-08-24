---
description: Loop Codex requirements review and inline fixes until findings clear or the iteration cap is reached
argument-hint: "<epic-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN (omit to loop over all active epics' PRDs)"
---

## Arguments

Take `$ARGUMENTS` as an optional epic selector, empty meaning every active epic. Resolve the epic selector through the `ptp-change-selector` skill. Run the loop with kind `prd` and reviewer `codex`, whose review pass runs the `commands/codex-review-prd.md` protocol inline.

## Owner

Invoke the `ptp-review-loop` skill (`skills/ptp-review-loop/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
