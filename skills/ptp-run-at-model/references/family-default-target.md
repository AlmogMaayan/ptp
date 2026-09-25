# Family default target — `models.<family>`

This file is the single source of truth for how a Claude command family picks its default target.
Every consuming site cites this file and does not restate it.  `ptp-run-at-model`'s rule that the
caller supplies the target is unchanged: the rule below only decides which literal the caller supplies.

## The five families

The entry names and the command membership are owned by the `models.<family>` rows of
`skills/ptp-config/SKILL.md` (its *Family to command mapping* table).  In summary:

| Family | Config entry | Commands |
|--------|--------------|----------|
| `analyze` | `models.analyze` | `/ptp:analyze` |
| `prompt` | `models.prompt` | `/ptp:prompt`, `/ptp:prompt-fix`, `/ptp:prompt-write`, `/ptp:prompt-write-to-backlog` |
| `brainstorm` | `models.brainstorm` | `/ptp:brainstorm`, `/ptp:brainstorm-only`, `/ptp:brainstorm-full`, `/ptp:review-brainstorm`, `/ptp:review-brainstorm-full` |
| `plan-review` | `models.plan-review` | `/ptp:review-plan`, `/ptp:review-plan-loop`, `/ptp:review-plan-full` |
| `apply-review` | `models.apply-review` | `/ptp:review`, `/ptp:review-loop`, `/ptp:review-full` |

The review step inside `/ptp:full-apply` also reads `models.apply-review`, but by its own rule, in
`skills/ptp-full-apply/SKILL.md` (a valid entry replaces each story's review target; a `fable` entry is
skipped with a note).  It does not use the resolution below.

## Resolution

The outer session resolves the target **once, before it spawns anything**, in this order:

1. **A valid `model:` token** wins, only for a command that parses one today (`analyze`,
   `brainstorm`, `brainstorm-full`, and the prompt family).  The token's grammar, validation and
   refusal are unchanged: an invalid token still refuses.
2. **The `models.<family>` entry**, read through the `ptp-workspace` layered configuration contract.
   A layer's value is accepted only when it is a string matching the `<model>.<effort>` grammar of the
   `model:` token exactly — see *Grammar* under *Optional caller-side `model:` override token* in
   `skills/ptp-run-at-model/SKILL.md`; that grammar is cited, never copied.  Any other value (a
   non-string, `opus`, `opus.max`, `model:opus.high`) rejects that layer for that key only and leaves
   whatever an earlier layer validly set.
3. **The built-in `opus.high`.**

The read never throws and never stops the command.  A config typo falls through to the next layer or
to `opus.high`.

The resolved literal is the target the command passes to `ptp-run-at-model`.  A wrapped review command
passes it on to `ptp-review-loop` as its running target; the fix-target evaluation and its `opus.high`
fallback do not change.

A fan-out member that runs a family command's steps (for example a `/ptp:full` Phase A
`review-plan-full` member, or a `brainstorm-decompose` beat-3 member) is spawned at that family's
resolved target.

Where another requirement or passage names `opus.high` as a family command's default or wrapped
target, it means the target resolved here; `opus.high` stays the built-in last layer.

## `main=codex`

Under `main=codex` the `models.<family>` entry has no effect, just as the `model:` token has none.
Codex's model and effort are resolved per *The `main=codex` direction* in
`skills/ptp-run-at-model/SKILL.md`.

## Not a downgrade

A target set through a `models.<family>` entry is the user's own choice, like a `model:` token.  It
does not count as a downgrade under the judgment rule (*Choosing a target* in
`skills/ptp-run-at-model/SKILL.md`).  That rule, and the L128 spawn-site audit verdict, keep governing
the built-in targets.

## Commands that stay at their current targets

These commands read no `models.<family>` entry: `/ptp:plan`, `/ptp:plan-multiple`,
`/ptp:review-fix`, every `codex-review*` command (including `/ptp:codex-review-loop` and
`/ptp:codex-review-plan-loop`, which stay at `opus.high`), and every `backlog-*` command.
