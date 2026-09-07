---
name: ptp-prompt-draft
description: Own the conversational, no-file understanding loop behind /ptp:prompt and /ptp:prompt-fix
---

Owns command: /ptp:prompt
Owns command: /ptp:prompt-fix

# ptp-prompt-draft — conversational prompt-drafting loop

## Purpose

A user who wants to describe a change before running `/ptp:brainstorm` (which autonomously plans and
persists a decision to a change folder) or `/ptp:plan` has no lightweight way to check that ptp
understood their request first. `/ptp:prompt` restates that understanding directly, in the main
session; `/ptp:prompt-fix` lets the user correct it. Neither writes anything to disk — persisting the
result is `/ptp:prompt-write`'s job (a later slice).

This skill is **interactive**, like `ptp-config`: it is not part of the autonomous plan/apply
pipeline. `AskUserQuestion` is permitted here (contrast with plan/apply/review commands, where it is
forbidden). Unlike `ptp-config`, it writes no file — there is no merge-write step at all.

## What this skill does NOT do

- It does **not** run the `ptp-branch-guard` preamble. Neither command writes a tracked artifact, so
  there is nothing to protect `master` from.
- It does **not** invoke `ptp-run-at-model`. The point is a direct, low-latency conversational turn
  in the main session — not a deterministic-model background run. There is no subagent dispatch.
- It does **not** write `prompt.md` or any other file. State lives **only** in this conversation's
  context, across `/ptp:prompt` → `/ptp:prompt-fix` → `/ptp:prompt-fix` → … turns in one session.
  Persisting it is out of scope here — see `/ptp:prompt-write` (epic `0068`, story `02`).
- It does **not** invoke `/ptp:brainstorm`, `/ptp:plan`, or any other producer. It only restates
  understanding and waits for the user's next turn.

## `/ptp:prompt <free text>`

1. Read the free-text request the user gave.
2. Restate the assistant's understanding of it as a short structured summary, covering:
   - **What it will do** — the concrete outcome, in the user's own terms where possible.
   - **Key assumptions** — anything filled in that the user did not say explicitly.
   - **Open questions**, if any remain — but do not block on them; state the assumption you'd make
     absent an answer, exactly as `/ptp:brainstorm`'s autonomous mode documents its own assumptions
     rather than stopping to ask.
3. Ask the user to confirm this is right, or to correct it via `/ptp:prompt-fix`.
4. Write no file. The restated understanding lives in this turn's response and the conversation's
   context — nothing is persisted here.

## `/ptp:prompt-fix <correction>`

1. Read the correction or clarification text.
2. Merge it into the understanding held from this same conversation's prior `/ptp:prompt` /
   `/ptp:prompt-fix` turns. A correction narrows, replaces, or adds to what was previously understood
   — it does not start over from nothing unless the user's correction plainly says to.
3. Restate the updated understanding, in the same structured shape as `/ptp:prompt` step 2.
4. Ask the user to confirm again, or to keep correcting.
5. Write no file.

**If `/ptp:prompt-fix` is invoked with no prior `/ptp:prompt` or `/ptp:prompt-fix` turn in this
conversation** — i.e. no understanding has been established yet — treat its argument as the first
request: restate understanding exactly as `/ptp:prompt` step 2 would, rather than refusing for lack of
prior context. Once an understanding exists (from either command), every later `/ptp:prompt-fix` call
merges into it per step 2 above; the fallback never fires again for that conversation, so an established
correction loop is never reset back to a first request.

## Hard rules

- **No branch guard.** Neither command writes anything git needs to protect against.
- **No `ptp-run-at-model` wrap.** Both commands run directly in the main session, not in a subagent.
- **No file writes.** The understanding lives in conversational context only, until `/ptp:prompt-write`
  persists it.
- **No autonomous chaining.** Do not invoke `/ptp:brainstorm`, `/ptp:plan`, `/ptp:prompt-write`, or any
  other command automatically. Report the restated understanding and stop.
- **`AskUserQuestion` is permitted and expected** — this is an ordinary interactive command, the same
  posture `ptp-config` documents for itself.
