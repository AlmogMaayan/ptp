---
description: Finish (or fix) the single backlog epic /ptp:backlog-run left `blocked` or `in-review`. Bare invocation = "I performed the manual verification, it's fine" — sign off the change's remaining tasks, re-verify, archive, and land the entry on done. Never re-runs code review here: /ptp:full already drove /ptp:review-full to convergence for the change before it could reach `blocked`/`in-review`. With free text = "I found problems" — drive one scoped fix pass against the same change and leave the epic in whatever status it had for another manual check. Identifies the target entry from the backlog store itself, preferring a `blocked` entry, and refuses, naming candidates, when none qualifies or more than one `blocked` entry does. Never commits, pushes, merges, deploys, or chains into /ptp:backlog-run. Delegates every rule to the ptp-backlog-continue skill.
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
`ptp-branch-guard`, spawn-and-relay to `ptp-run-at-model`, and
archival to `/ptp:archive`, which it **drives rather than
reimplements**. Code review is **never** driven from here — `/ptp:full` already ran
`/ptp:review-full` to convergence for the change before it could reach `blocked` or `in-review`.
(That store is a GitHub Projects board; `ptp-backlog` owns the contract.)

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
  **writer-eligibility** rule; the **`gh` transport contract**'s (`ptp-github-projects-gh`)
  **`read-only`** and **`unavailable`**
  preflight verdicts (precondition 2b below);
  `ptp-backlog-write`'s refusal when **the resolved
  status-option row does not identify exactly one board `Status` option**; and the `ptp-backlog`
  skill's *Read protocol* **step-0 configuration grounds, both of them** — an **incomplete `backlog.*`
  configuration** (its missing keys being only ever `backlog.projectOwner` and/or
  `backlog.projectNumber`) and a **colliding resolved status-option table**, taken at
  **precondition 2a below**, ahead of the preflight, ahead of target selection and
  ahead of the branch guard. Each is a **condition within
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
2. **The transport preconditions, taken as an ordered pair — never as one conjoined check**, because
   "resolve X **and** evaluate Y" cannot express that a failing X precludes Y, and because the
   configuration resolver is contractually forbidden from stopping anything itself. The gate precedes
   selection on purpose: a command that provably cannot write should not select a target and thereby
   imply it might act — and that rationale now covers the configuration gate as well as the preflight.

   **2a. Take the configuration gate.** Resolve the `backlog.*` configuration per
   **`ptp-github-projects-gh`** — that skill owns the `backlog.*` keys and the completeness verdict —
   and take **`ptp-backlog`**'s *Read protocol* **step 0**, refusing non-silently on either of its
   **two** grounds: an **incomplete `backlog.*` configuration** (its missing keys being only ever
   `backlog.projectOwner` and/or `backlog.projectNumber`) and a
   **colliding resolved status-option table** (which names `backlog.statusOptions`, the colliding
   option name, and every status claiming it). **Name the ground; do not restate the rule.** **No
   `gh` command is run.** This precedes 2b **absolutely**: the resolver never STOPs, so the refusal
   is this command's obligation, and running the preflight on a configuration that names no board
   would report a transport failure in place of a one-line configuration fix. Any board identity
   rendered here carries its **provenance**, per `ptp-github-projects-gh` §*The acting
   identity*.

   **2b. Evaluate the capability preflight verdict**, per the **`gh` transport contract**
   (**`ptp-github-projects-gh`**), applying the
   verdict disposition table **`ptp-backlog-run`** owns — reached **only** when 2a passed.
3. **Resolve the target entry** — read and validate the backlog store through **`ptp-backlog`**
   and apply **`ptp-backlog-continue`**'s candidate predicate (`blocked` **or** `in-review` with a
   non-empty `changeEpics`), under that skill's **`blocked`-takes-precedence** rule, which it owns and
   this file does not restate. **Zero** candidates of either status and **more than one `blocked`**
   candidate each **refuse here**, naming
   what was found; never guess by recency or any other unstated heuristic. Several `in-review`
   candidates are **not** a refusal — the skill resolves them by `ptp-backlog`'s canonical order.

Steps 1, 2a, 2b, and 3 are **all** aborting preconditions and **all of them precede the branch
guard**, so no refusable invocation cuts a branch or edits a file. An unactionable `backlog.*`
configuration is exactly such an invocation — decided at 2a from configuration alone, at zero
transport cost.

`codex.mode` is **never** resolved by this command — it governs `/ptp:review-full`'s Codex phase, and
this command never invokes `/ptp:review-full`.

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
  (`npx -y openspec validate <change-id> --strict` plus the project's build and test suites), then
  invoke **`/ptp:archive <change-id>`** — **`/ptp:review-full` is never invoked here**: `/ptp:full`'s
  apply phase already drove it to convergence for this change before the entry could reach `blocked` or
  `in-review`, and the manual verification this invocation signs off is a separate, human-only
  concern — and, **only once every prefix has settled**, perform the single
  `blocked → done` **or** `in-review → done` write, per the target's own source status, under
  `ptp-backlog`'s guard 3. Any stall
  leaves the entry in its existing status.
- **Issue-text invocation** → the **fix-pass flow**: one `ptp-run-at-model` main run against the
  chosen change, carrying the issue text verbatim and `agents/ptp-apply.md`'s hard rules, then
  re-verification. **No status transition, no `/ptp:review-full`, no `/ptp:archive`.**

**This command is UNWRAPPED.** It starts **no `ptp-run-at-model` main run of its own** and does all of
the above in the outer session. **The reason:** `ptp-run-at-model`'s *Nesting caveat* forbids naively
wrapping a command whose work spawns a subagent, and this command's work spawns two kinds
(`/ptp:archive`'s `sonnet.medium` run and the fix pass) — a
wrapper would push each to a second nesting level. Staying outer is also what keeps `/ptp:archive`'s
**interactive** confirmations reachable, since a subagent is non-interactive.

## Hard rules

- **Never act on an entry that is not `blocked` or `in-review` with a non-empty `changeEpics`**, and
  never on more
  than one entry per invocation.
- **Never reach `done` any other way** — the `blocked → done` and `in-review → done` writes happen only
  as the direct,
  same-invocation result of this command's own sign-off → archive sequence settling every recorded
  prefix — resting on the review `/ptp:full` already drove to convergence for the change, never on any
  review this command runs itself. `/ptp:backlog-edit` still refuses both transitions unconditionally.
- **Never guess the target** — zero candidates of either status, or **more than one `blocked`**
  candidate, is a refusal that names them. Several `in-review` candidates are not a guess: the skill
  takes the head of `ptp-backlog`'s **published** canonical order.
- **Never invent, remove, reword, or reorder a `tasks.md` task** on either flow.
- **Never wave through a re-verification failure** — a failing `openspec validate`, build, or test on
  the bare flow is a refusal naming the check, and the entry stays in its existing status.
- **Never invoke `/ptp:review-full` from this command, on either flow, for any reason** — code review
  is already converged by `/ptp:full` before a change can reach `blocked` or `in-review`.
- **Never weaken or reimplement `/ptp:archive`'s gates.**
- **Never commit, push, merge, or deploy**, and **never chain into `/ptp:backlog-run`** — recommend it
  in the report instead.
- **Never wrap this command in a `ptp-run-at-model` main run.**
- **Never restate the `ptp-backlog` or `ptp-backlog-continue` contracts here** — cite them.
