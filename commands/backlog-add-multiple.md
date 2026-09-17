---
description: Add several epics to the backlog board from one free-text request, without touching any other entry
argument-hint: "<free-text request describing several epics> [model:<model>.<effort>]"
---

## Arguments

Parse and strip the per-invocation `model:<model>.<effort>` token, then take the remainder as the free-text request describing several epics. An empty remainder is a STOP in the outer session — before the branch guard and before any main run — report that a free-text request is required and never invent an epic to fill it.

Run the `ptp-branch-guard` preamble, then start exactly one `ptp-run-at-model` main run at the resolved target, defaulting to `opus.high`. The main run's prompt states that the main run's own branch-guard check is a no-op and that it must not launch `ptp-branch-prep`. The main run starts no further main run.

## Owner

Invoke the `ptp-backlog` skill (`skills/ptp-backlog/SKILL.md`). Inside the main run, segment the free-text request into N self-contained deliverable-epic descriptions autonomously — asking no clarifying question and imposing no delimiter grammar — and, for each description in order, persist it exactly as `/ptp:backlog-add` persists one entry: an item creation carrying the composed title and body, then `status: backlog` as the single commit, each as its own operation with its own pre-dispatch snapshot, pre-write field check, and write journal. A request that segments to exactly one description is created as one operation, behaving as `/ptp:backlog-add`.

Settle the operations sequentially and fail-stop across operations: on the first operation that does not settle, halt, report that operation's verdict, name the entries already created by `id`, `title`, and `status: backlog`, and report the remaining descriptions as not-attempted. Issue no compensating write, and do not claim a mid-run failure left the store unchanged.

## Hard rules

Ask no clarifying question and pause for no approval. Do not chain `/ptp:backlog-run`, `/ptp:plan`, `/ptp:full`, or any implementation step after the created entries settle. Do not commit and do not archive.

## Report

For each settled entry, report its `id`, `title`, and `status`, state that the entry is not yet ready to run, and name `/ptp:backlog-edit` performing `backlog` → `ready` — citing the status-transitions table's row, never copying it — as the promotion that makes `/ptp:backlog-run` able to take it. Report the change id where the command resolved one, the resulting state, any failures, and the next command to run.
