---
name: ptp-prompt-write-to-backlog
description: Persist a /ptp:prompt understanding as one new backlog board entry
---

Owns command: /ptp:prompt-write-to-backlog

# ptp-prompt-write-to-backlog — persist the accumulated prompt understanding as a backlog entry

## Purpose

`/ptp:prompt-write` persists a `/ptp:prompt` conversation's accumulated understanding to a `prompt.md` file. This command persists the **same accumulated understanding** to the backlog board instead. It creates one new backlog entry whose instructions are that understanding, by doing exactly what `/ptp:backlog-add` does for one entry.

It does not restate the backlog contract. The entry model, the board mapping, the validator, the ordered write sequence, and the `status: backlog` commit all belong to `ptp-backlog` and `ptp-backlog-write` and are cited, never copied. The accumulated-understanding source, and its STOP when nothing has accumulated, are `ptp-prompt-write`'s and are reused unchanged.

## No accumulated understanding — STOP

If this conversation holds no accumulated understanding from a prior `/ptp:prompt` / `/ptp:prompt-fix` turn, **STOP** in the outer session and say so. Never create an empty or fabricated entry.

## Run at model

Run in this order:

1. **Parse-and-strip** an optional `model:<model>.<effort>` token per `ptp-run-at-model`'s caller-side override section. An invalid or duplicate token STOPs here.
2. **Check the STOP** above, before any spawn.
3. **Start one foreground `ptp-run-at-model` main run** at the resolved target, `opus.high` by default or the valid override. The main run does not inherit this conversation, so its prompt MUST carry the accumulated understanding verbatim (the current restated understanding plus the assumptions list, if any). The main run starts no further main run.
4. **Inside the main run**, persist that understanding as `/ptp:backlog-add` persists one entry, taking the accumulated understanding as the free-text epic description. That is one item creation carrying the composed title and body, followed by `status: backlog` as the single commit, with its own pre-dispatch snapshot, pre-write field check, and write journal. The body carries the full accumulated understanding as the entry's instructions, never a summary of it.
5. **Relay** the main run's terminal result per `ptp-run-at-model`'s result relay.

## Branch guard

Do **not** run the `ptp-branch-guard` preamble. Like `/ptp:backlog-add`, this command writes one GitHub Projects v2 board item over `gh` and creates or modifies no repo file. It never writes `prompt.md`.

## What this command does NOT do

- It writes no `prompt.md` and touches no change folder.
- It asks no clarifying question.
- It never chains `/ptp:backlog-run`, `/ptp:plan`, `/ptp:full`, or any other step after the entry settles. It does not commit and does not archive.
- It creates the entry parked in `Backlog`, so it is not yet ready to run.

## Report

Report the entry's `id`, `title`, and `status`, state that it is not yet ready to run, and name `/ptp:backlog-edit` performing `backlog` → `ready` as the promotion that lets `/ptp:backlog-run` take it.

## Hard rules

- **Never create an entry without accumulated understanding.** No understanding → STOP.
- **Create exactly one entry.** Touch no other entry.
- **Carry the understanding in full.** The entry body is the accumulated understanding, not a summary.
- **Never write `prompt.md`.**
