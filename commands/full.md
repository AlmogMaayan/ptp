---
description: Brainstorm, plan and apply an oversized change end to end in one invocation
argument-hint: "<big-change-id-or-request> [scout:on|off] [--workspace <path>]"
---

## Arguments

Parse and strip the per-invocation `parallel:`, `fast:` and `scout:on|off` tokens, before the branch guard. The `scout:` token follows `skills/ptp-run-at-model/references/scout-prestep.md` § *The scout gate*: an invalid or duplicated token refuses before any work, and an absent token resolves the layered `brainstorm.scout` key. Pass the effective decision to `ptp-full` as `scout`. Then take the remainder as a change id, a bare epic container id (planned into its epic), or a free-text request. Resolve the change selector through the `ptp-change-selector` skill. If the resolved id names an existing change folder holding `prompt.md`, `ptp-full` reads it as the request when no richer planning artifact exists yet — see that skill for the precedence rule.

## Owner

Invoke the `ptp-full` skill (`skills/ptp-full/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
