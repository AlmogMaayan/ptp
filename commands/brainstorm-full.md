---
description: Explore a change and then review the brainstorm with both reviewers until it converges
argument-hint: "<short description of the change> (or a fully-formed XXXX_NN_<desc> id to re-run on an existing change)"
---

## Arguments

Parse and strip the per-invocation `model:<model>.<effort>` token, then take the remainder as a short description or a fully-formed change id.

## Owner

Invoke the `ptp-brainstorm-full` skill (`skills/ptp-brainstorm-full/SKILL.md`).

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
