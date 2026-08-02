---
description: Finish (or fix) the single backlog epic /ptp:backlog-run left `blocked` or `in-review`. Bare invocation = "I performed the manual verification, it's fine" — sign off the change's remaining tasks, re-verify, run /ptp:review-full to convergence, archive, and land the entry on done. With free text = "I found problems" — drive one scoped fix pass against the same change and leave the epic in whatever status it had for another manual check. Identifies the target entry from the backlog store itself, preferring a `blocked` entry, and refuses, naming candidates, when none qualifies or more than one `blocked` entry does. Never commits, pushes, merges, deploys, or chains into /ptp:backlog-run. Delegates every rule to the ptp-backlog-continue skill.
argument-hint: "[what went wrong during the manual check — omit entirely to sign off]"
---

You are running **`/ptp:backlog-continue`** — the settle path for an epic `/ptp:backlog-run` left
`blocked` or `in-review`. **The methodology lives in the `ptp-backlog-continue` skill and is not
restated here**:
target selection, the bare/issue-text split, the bare flow and its gates, the issue-text fix pass, the
`blocked → done` / `in-review → done` write, and the four report shapes are all that skill's. It in
turn defers the backlog
store contract and the **status transition table's `blocked → done` and `in-review → done` rows under
guard 3** to
`ptp-backlog`, branch safety to
`ptp-branch-guard`, the reviewer gate to `ptp-codex-mode`, spawn-and-relay to `ptp-run-at-model`, and
review and archival to `/ptp:review-full` and `/ptp:archive`, which it **drives rather than
reimplements**. (That store is a GitHub Projects board; `ptp-backlog` owns the contract.)

> **Contrast with its siblings:** `/ptp:backlog` is the read-only view. `/ptp:backlog-add` creates an
> entry; `/ptp:backlog-edit` changes one at the user's direction and is the **recovery** command for a
> stale `in-progress` entry; `/ptp:backlog-run` executes ready epics and is what left this one
> `blocked` or `in-review` — it reaches `done` nowhere. This command is the **only** one that can
> reach `done`, from **either** `blocked` or `in-review`, and only by
> performing, in this same invocation, the review and archive that prove it.

## The refusal contract — exactly one, and it names its own cause

**The board write path has shipped**, so this command writes. What survives from the refusal that stood
while it had not is the **shape** of the refusal, not its wording:

- **Exactly one refusal exists in this file**, issued **non-silently and up front**, naming the
  **specific** reason it cannot write. No second, divergently-worded refusal is added beside it.
- The grounds are their owning contracts' and are **cited, never restated**: `ptp-backlog`'s
  **writer-eligibility** rule; `ptp-github-projects-mcp`'s **`read-only`** and **`unavailable`**
  preflight verdicts (precondition 2 below); an entry whose **content type offers no path to update
  a carrier** a planned field rides; and `ptp-backlog-write`'s refusal when **the resolved
  status-option row does not identify exactly one board `Status` option**. Each is a **condition within
  this one refusal contract**, naming
  its own cause when it fires. **Degraded scope is not among them**: this command consumes no ready set,
  so it **proceeds** under it.
- **No ground is worded over the write path being unshipped**, that antecedent having lapsed.
- **No fallback of any kind.** No local backlog file is read, created, or written, and no other store
  is substituted — under any verdict, any problem, any refusal, and **any write outcome**, the error
  path included.

## Inputs

Request: $ARGUMENTS — an **optional** free-text description of problems found during the manual
verification. **Empty or whitespace-only means the bare flow** (the invocation is the sign-off).
There is **no selector and no token**: no change id, no `epic:` / `story:` selector, no backlog entry
identifier, and no `model:` / `fast:` / `parallel:` / `rounds:` override. Which epic is acted on is
target selection's answer, read from the backlog store. The argument-shape rules — including the
refusal for an argument made **solely** of token-shaped words — live in the **`ptp-backlog-continue`**
skill.

## Preconditions

Check in this order, all in the outer session:

1. **Classify the invocation** — bare vs issue-text, applying the skill's token-only refusal.
2. **Resolve the backlog configuration and evaluate the capability preflight verdict**, per
   **`ptp-github-projects-mcp`**, applying the verdict disposition table **`ptp-backlog-run`** owns.
   The gate precedes selection on purpose: a command that provably cannot write should not select a
   target and thereby imply it might act.
3. **Resolve the target entry** — read and validate the backlog store through **`ptp-backlog`**
   and apply **`ptp-backlog-continue`**'s candidate predicate (`blocked` **or** `in-review` with a
   non-empty `changeEpics`), under that skill's **`blocked`-takes-precedence** rule, which it owns and
   this file does not restate. **Zero** candidates of either status and **more than one `blocked`**
   candidate each **refuse here**, naming
   what was found; never guess by recency or any other unstated heuristic. Several `in-review`
   candidates are **not** a refusal — the skill resolves them by `ptp-backlog`'s canonical order.

All three are aborting preconditions and **all three precede the branch guard**, so no refusable
invocation cuts a branch or edits a file.

`codex.mode` is **not** resolved by this command — it is `/ptp:review-full`'s to resolve and apply per
**`ptp-codex-mode`**, and the skill records the consequence.

## Branch safety

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble — do not restate it
here. In practice it is a **no-op**: the halt that produced the `blocked` entry left the session on
that epic's feature branch, and this command is meant to be invoked from there. The guard cannot
discover which branch the halted work actually lives on, so `ptp-backlog-continue` documents that
sharp edge and requires the report to name the branch the command ran on.

## What this command does

Drive the **`ptp-backlog-continue`** skill against the single resolved candidate entry:

- **Bare invocation** → the **bare flow**: per prefix in `changeEpics` (and per story folder within
  it), locate the change folder, flip the remaining `- [ ]` boxes to `- [x]`, re-verify
  (`npx -y openspec validate <change-id> --strict` plus the project's build and test suites), invoke
  **`/ptp:review-full <change-id>`** and require its convergence gate, then invoke
  **`/ptp:archive <change-id>`** — and, **only once every prefix has settled**, perform the single
  `blocked → done` **or** `in-review → done` write, per the target's own source status, under
  `ptp-backlog`'s guard 3. Any stall
  leaves the entry in its existing status.
- **Issue-text invocation** → the **fix-pass flow**: one `ptp-run-at-model` main run against the
  chosen change, carrying the issue text verbatim and `agents/ptp-apply.md`'s hard rules, then
  re-verification. **No status transition, no `/ptp:review-full`, no `/ptp:archive`.**

**This command is UNWRAPPED.** It starts **no `ptp-run-at-model` main run of its own** and does all of
the above in the outer session. **The reason:** `ptp-run-at-model`'s *Nesting caveat* forbids naively
wrapping a command whose work spawns a subagent, and this command's work spawns three kinds
(`/ptp:review-full`'s `opus.high` run, `/ptp:archive`'s `sonnet.medium` run, and the fix pass) — a
wrapper would push each to a second nesting level. Staying outer is also what keeps `/ptp:archive`'s
**interactive** confirmations reachable, since a subagent is non-interactive.

## Hard rules

- **Never act on an entry that is not `blocked` or `in-review` with a non-empty `changeEpics`**, and
  never on more
  than one entry per invocation.
- **Never reach `done` any other way** — the `blocked → done` and `in-review → done` writes happen only
  as the direct,
  same-invocation result of this command's own review-full → archive sequence settling every recorded
  prefix. `/ptp:backlog-edit` still refuses both transitions unconditionally.
- **Never guess the target** — zero candidates of either status, or **more than one `blocked`**
  candidate, is a refusal that names them. Several `in-review` candidates are not a guess: the skill
  takes the head of `ptp-backlog`'s **published** canonical order.
- **Never invent, remove, reword, or reorder a `tasks.md` task** on either flow.
- **Never wave through a re-verification failure** — a failing `openspec validate`, build, or test on
  the bare flow is a refusal naming the check, and the entry stays in its existing status.
- **Never weaken or reimplement `/ptp:review-full`'s or `/ptp:archive`'s gates.**
- **Never commit, push, merge, or deploy**, and **never chain into `/ptp:backlog-run`** — recommend it
  in the report instead.
- **Never wrap this command in a `ptp-run-at-model` main run.**
- **Never restate the `ptp-backlog` or `ptp-backlog-continue` contracts here** — cite them.
