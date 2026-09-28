---
description: Explore a change and then review the brainstorm with both reviewers until it converges
argument-hint: "<short description of the change> (free text yields an epic container XXXX_00_<desc>; a fully-formed XXXX_NN_<desc> id is kept, and a new _00 id STOPs when its epic already has another container)"
---

## Arguments

First parse and strip the `scout:on|off` token, before the branch guard, per the gate section of `skills/ptp-run-at-model/references/scout-prestep.md`, and pass the effective decision to the skill as `scout`.

Parse and strip the per-invocation `model:<model>.<effort>` token, then take the remainder as a short description or a fully-formed change id.

## Owner

Invoke the `ptp-brainstorm-full` skill (`skills/ptp-brainstorm-full/SKILL.md`).

Its wrapped exploration drives `ptp-brainstorming` under both `tdd-plugin` values.

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.

Also report the **review tally** the `ptp-brainstorm-full` skill relayed from its wrapped review step, at **every** terminal state — the two iteration caps included. Render it in the shared tally format (`skills/ptp-review-loop/references/review-tally-table.md`); that document and the skill own the table's rules, which are cited here, not restated. On the brainstorm-gate STOP, where the review phase never ran, print the non-table line `Review tally: unknown` instead of a table.
