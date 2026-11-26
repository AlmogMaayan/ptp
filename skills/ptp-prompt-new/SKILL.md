---
name: ptp-prompt-new
description: Own /ptp:prompt-new, which discards the held prompt understanding and restates a new request with no link to the old one
---

Owns command: /ptp:prompt-new

# ptp-prompt-new — discard the held understanding and restate a new request

## Purpose

A user who has been shaping one request with `/ptp:prompt` and `/ptp:prompt-fix` may want to start a
different request in the same conversation. `/ptp:prompt-fix` would merge the new text into the old
understanding. `/ptp:prompt-new` instead discards the held understanding and restates the new text as
a first request.

The held understanding, and how a `/ptp:prompt-new` turn resets it, are defined once in
`ptp-prompt-draft`'s *Held understanding* section (`skills/ptp-prompt-draft/SKILL.md`). This skill
cites that definition and restates none of it. The `model:` token, the target resolution and the main
run belong to **`ptp-run-at-model`** and are cited, not restated.

## Data flow

The outer session runs these steps in order.

1. **Parse and strip** the optional `model:<model>.<effort>` token, per `ptp-run-at-model`'s
   *Optional caller-side `model:` override token* section. An invalid or duplicate token STOPs here
   with state `refused`. No discard line is printed, and the held understanding is unchanged.
2. **Print the discard line**, exactly: `Earlier /ptp:prompt understanding discarded.` From this
   point nothing earlier is held.
3. **Empty text forgets only.** If the token-stripped text is empty or whitespace only, report state
   `nothing held` and name `/ptp:prompt` as next. No read-back and no main run start.
4. **Restate.** Run `/ptp:prompt` steps 2 to 4 of `skills/ptp-prompt-draft/SKILL.md` on the
   token-stripped text. The read-back, the main run at the `prompt` family target of
   `skills/ptp-run-at-model/references/family-default-target.md` (or the valid override), the relay
   and the confirm-or-correct ask are `/ptp:prompt`'s, cited and not restated. The report state is
   `restated`.

When nothing was held before this turn, the command behaves exactly as `/ptp:prompt` and never
refuses.

## Payload invariant

The earlier turns stay in the outer session's context, and nothing can remove them. So the rule binds
what crosses into the main run: its prompt carries the token-stripped text and part (j) when the
read-back produced one, and no part of any turn from before this one — no earlier restatement,
correction or assumption.

## Failure

Once step 1 succeeds, the reset holds even if the main run fails. A failed run established nothing,
so nothing is held: a later `/ptp:prompt-write` or `/ptp:prompt-write-to-backlog` STOPs, and a later
`/ptp:prompt-fix` takes its first-request fallback. The report state is `failed`.

A failed read-back follows `/ptp:prompt`'s rule: one `learned insights omitted: <reason>` line, and
the command continues.

## Report

The report states are `restated`, `nothing held`, `refused` and `failed`. There is no change id,
since nothing is persisted. The next command is `/ptp:prompt-fix` to correct a restatement, or
`/ptp:prompt` after `nothing held`.

## Hard rules

- **No file.** The command writes no file, `prompt.md` or other.
- **No lesson.** It records no lesson in any `learning-mode`; only a correcting `/ptp:prompt-fix`
  turn does that, per `ptp-prompt-draft`'s *Lesson recording*.
- **No branch guard.** It writes nothing git needs to protect, so the guard step is a no-op.
- **No chaining.** It invokes no other command — not `/ptp:prompt-write`, `/ptp:brainstorm`,
  `/ptp:plan` or any producer. It reports the restatement and stops.
- **`AskUserQuestion` is not used inside the main run.** The outer session asks, as for `/ptp:prompt`.
