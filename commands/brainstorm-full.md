---
description: Explore a change and then review the brainstorm with both reviewers until it converges
argument-hint: "<short description of the change> (or a fully-formed XXXX_NN_<desc> id to re-run on an existing change)"
---

## Arguments

Parse and strip the per-invocation `model:<model>.<effort>` token, then take the remainder as a short description or a fully-formed change id.

## Owner

Invoke the `ptp-brainstorm-full` skill (`skills/ptp-brainstorm-full/SKILL.md`).

Its wrapped exploration drives `ptp-brainstorming` (or `superpowers:brainstorming` when the skill-set directive names `tdd-plugin=superpowers`).

**`superpowers-output-override`** (path-override): when the `tdd-plugin=superpowers` arm ran and Superpowers produced the brainstorm, override Superpowers' default output path and write the brainstorm instead to `<workspace root>/openspec/changes/<change-id>/brainstorm.md` (workspace root carried verbatim via `ptp-run-at-model` part (g); never re-derive it; never write to `docs/superpowers/specs/...` or `docs/plans/`); do not `git commit`/`git add` and do not stop at a human approval gate — this runs autonomously and ptp reviews afterward.

## Report

Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.

Also report the **review tally** the `ptp-brainstorm-full` skill relayed from its wrapped review step, at **every** terminal state — the two iteration caps included. Render it in the shared tally format (`skills/ptp-review-loop/references/review-tally-table.md`); that document and the skill own the table's rules, which are cited here, not restated. On the brainstorm-gate STOP, where the review phase never ran, print the non-table line `Review tally: unknown` instead of a table.
