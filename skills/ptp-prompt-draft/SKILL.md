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

Both commands run their restatement work through the **`ptp-run-at-model`** skill in one foreground
main run at a resolved target (see *Run at model* below), rather than inline at the session's model.
Because that main run is non-interactive, `AskUserQuestion` moves to the **outer session**, after the
main run's restatement is relayed — see *Run at model*. Unlike `ptp-config`, this skill writes no
file — there is no merge-write step at all.

## What this skill does NOT do

- It does **not** run the `ptp-branch-guard` preamble. Neither command writes a tracked artifact, so
  there is nothing to protect `master` from (the wrap's branch-guard step is therefore a no-op).
- It does **not** write `prompt.md` or any other file. State lives **only** in this conversation's
  context, across `/ptp:prompt` → `/ptp:prompt-fix` → `/ptp:prompt-fix` → … turns in one session.
  Persisting it is out of scope here — see `/ptp:prompt-write` (epic `0068`, story `02`).
- It does **not** invoke `/ptp:brainstorm`, `/ptp:plan`, or any other producer. It only restates
  understanding and waits for the user's next turn.

## `/ptp:prompt <free text>`

1. In the **outer session**: parse-and-strip an optional `model:<model>.<effort>` override token
   from the argument text per `ptp-run-at-model`'s "Optional caller-side `model:` override token"
   section (referenced, not restated) — this is simply the first outer-session step, since the
   command is read-only. An invalid or duplicate token STOPs here, before the main run.
2. Run the restatement work — reading the token-stripped free-text request — through **one
   foreground `ptp-run-at-model` main run** at the resolved target (the `prompt` family default target per `skills/ptp-run-at-model/references/family-default-target.md` by default, or the
   valid override), per *Run at model* below. The main run produces the structured summary:
   - **What it will do** — the concrete outcome, in the user's own terms where possible.
   - **Key assumptions** — anything filled in that the user did not say explicitly.
   - **Open questions**, if any remain — but the main run does not block on them; it states the
     assumption it would make absent an answer, exactly as `/ptp:brainstorm`'s autonomous mode
     documents its own assumptions rather than stopping to ask.
3. In the **outer session**, after relaying the main run's restatement: ask the user to confirm this
   is right, or to correct it via `/ptp:prompt-fix`.
4. Write no file. The restated understanding lives in this turn's response and the conversation's
   context — nothing is persisted here.

## `/ptp:prompt-fix <correction>`

1. In the **outer session**: parse-and-strip an optional `model:<model>.<effort>` override token
   from the argument text, exactly as `/ptp:prompt` step 1.
2. Run the merge-and-restate work — reading the token-stripped correction text and the accumulated
   understanding held from this same conversation's prior `/ptp:prompt` / `/ptp:prompt-fix` turns —
   through **one foreground `ptp-run-at-model` main run** at the resolved target, per *Run at model*
   below. A correction narrows, replaces, or adds to what was previously understood — it does not
   start over from nothing unless the user's correction plainly says to. The main run restates the
   updated understanding in the same structured shape as `/ptp:prompt` step 2.
3. In the **outer session**, after relaying the main run's restatement: ask the user to confirm
   again, or to keep correcting.
4. Write no file.

**If `/ptp:prompt-fix` is invoked with no prior `/ptp:prompt` or `/ptp:prompt-fix` turn in this
conversation** — i.e. no understanding has been established yet — treat its argument as the first
request: the main run restates understanding exactly as `/ptp:prompt` step 2 would, rather than
refusing for lack of prior context. Once an understanding exists (from either command), every later
`/ptp:prompt-fix` call merges into it per step 2 above; the fallback never fires again for that
conversation, so an established correction loop is never reset back to a first request.

## Run at model

Both `/ptp:prompt` and `/ptp:prompt-fix` run their restatement work through the **`ptp-run-at-model`**
skill, referenced here rather than restated:

1. **Outer session**: parse-and-strip the optional `model:` override token (see each command's step 1
   above) — the first outer-session step, since both commands are read-only and have no other
   abort-guaranteeing precondition.
2. **Branch guard**: a no-op for both commands — neither writes a tracked artifact.
3. **Resolve the target**: the token-stripped override if one was given and valid, else the `prompt` family default target per `family-default-target.md` (`models.prompt`, else `opus.high`).
4. **Run the main work**: one foreground `ptp-run-at-model` main run (the Claude subagent by default,
   or the `codex exec` shell-out when `main=codex`), carrying the token-stripped argument text and —
   for `/ptp:prompt-fix` — the accumulated understanding from this conversation's prior turns. The
   main run performs the restatement (or merge-and-restatement) work described above and returns it
   as its terminal result; it writes no file and invokes no other command.
5. **Relay**: the outer session surfaces the main run's restatement verbatim, then performs the
   "confirm, or correct via `/ptp:prompt-fix`" ask itself — `AskUserQuestion` is **not** used inside
   the main run, since the main run is non-interactive in both directions (neither the Agent-tool
   subagent nor the `codex exec` shell-out can pause mid-run). A main run that reaches a real choice
   records it as an assumption or open question inside its restatement instead of pausing.

The accumulated understanding continues to live **only** in the outer session's context across turns
— the main run holds no cross-turn state of its own; the outer session passes the prior understanding
into the main run's prompt each time.

## Hard rules

- **No branch guard.** Neither command writes anything git needs to protect against; the wrap's
  branch-guard step is a no-op.
- **Run through `ptp-run-at-model`.** Both commands run their restatement work in one foreground main
  run at the resolved target (the `prompt` family default target per `family-default-target.md` by default, or a valid `model:` override) — see *Run at
  model*.
- **No file writes.** The understanding lives in conversational context only, until `/ptp:prompt-write`
  persists it.
- **No autonomous chaining.** Do not invoke `/ptp:brainstorm`, `/ptp:plan`, `/ptp:prompt-write`, or any
  other command automatically. Report the restated understanding and stop.
- **`AskUserQuestion` is not used inside the main run.** The main run is non-interactive; it records
  assumptions and open questions in its restatement instead. The **outer session**, after relaying
  that restatement, performs the confirm-or-correct ask.
