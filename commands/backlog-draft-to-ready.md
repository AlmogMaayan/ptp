---
description: Promote every backlog (parked) entry to ready in one invocation, without touching any other entry
argument-hint: "[model:<model>.<effort>]"
---

## Arguments

Parse and strip the per-invocation `model:<model>.<effort>` token; an invalid or duplicated candidate is a STOP in the outer session — before the branch guard and before any main run. The command takes no positional argument and does not STOP for a missing one.

Run the `ptp-branch-guard` preamble, then start exactly one `ptp-run-at-model` main run at the resolved target, defaulting to `opus.high`. The main run's prompt states that the main run's own branch-guard check is a no-op and that it must not launch `ptp-branch-prep`. The main run starts no further main run.

## Owner

Invoke the `ptp-backlog` skill (`skills/ptp-backlog/SKILL.md`). Inside the main run, read the board and validate it through the store's writer-eligibility rule, refusing past any fatal problem and proceeding over every structural defect while naming every outstanding structural problem in the report. Enumerate every entry whose `status` is `backlog` — the enum's starting status, which the user calls "draft" — and perform one `backlog` → `ready` transition per such entry, touching no entry in any other status. The selection predicate is a single equality on `status`.

Each promotion is its own operation of the ordered write sequence — the item already existing, no payload row changing, `status: ready` written as the single commit — with the pre-dispatch snapshot, the `status` pre-write field check, and the write journal applying, exactly as `/ptp:backlog-edit` performs the same row, unconditionally and guard-free. No operation carries more than one `status` write. No guard of the command's own is added: an entry a concurrent edit has moved out of `backlog` fails the `status` pre-write field check and halts its own operation, needing no guard of the command's own.

Run the per-entry operations in enumeration order and, on the first operation whose verdict is not a success, halt with no compensating write. Entries already promoted remain `ready`. A board with no `backlog` entry is a reported no-op, not a defect.

## Hard rules

The command is autonomous — ask no clarifying question and pause for no approval. Do not chain `/ptp:backlog-run`, `/ptp:plan`, `/ptp:full`, or any implementation step. Do not commit and do not archive.

## Report

Name each entry's outcome and, on a halt, the halting entry with its reason. Do not describe a mid-run failure as leaving the store unchanged, and scope the refusal-writes-nothing guarantee to the backlog store, since the outer-session branch guard may already have cut a feature branch. Report the resulting state, any failures, and the next command to run.
