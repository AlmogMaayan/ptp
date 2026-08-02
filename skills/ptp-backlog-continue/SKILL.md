---
name: ptp-backlog-continue
description: Own the settle-the-epic path behind /ptp:backlog-continue — the one command that finishes a backlog epic left `blocked` or `in-review` by /ptp:backlog-run once a human has performed the manual verification no agent could. Owns the target-selection rule (the candidate predicate `status === "blocked" || status === "in-review"` with a non-empty `changeEpics`, `blocked` taking precedence with its zero / one / many outcomes refusing rather than guessing, and several `in-review` candidates resolving to the canonical-order head), the invocation-shape split under which a bare invocation is the user's sign-off and free text is a problem report, the unwrapped outer-session execution contract that keeps `/ptp:review-full`'s and `/ptp:archive`'s own spawns at one nesting level, the bare flow (per-prefix folder lookup, checkbox sign-off, re-verification before the sign-off is trusted, the review-full convergence gate, archive, then the single `blocked → done` or `in-review → done` write once every prefix has archived), the issue-text fix-pass flow that transitions nothing, and the four terminal report shapes. Delegates the backlog store identity, entry model, read protocol, validator vocabulary, and the status transition table with its `blocked → done` and `in-review → done` rows under guard 3 to the shared ptp-backlog skill; the reviewer gate to ptp-codex-mode; branch safety to ptp-branch-guard; the spawn-and-relay mechanics to ptp-run-at-model; and review and archival to /ptp:review-full and /ptp:archive, which it drives rather than reimplements.
---

# ptp-backlog-continue — finish (or fix) the epic `/ptp:backlog-run` halted on

## Purpose

`/ptp:backlog-run` halts an epic whose `/ptp:full` did not converge, marks it `blocked`, and records
the change-epic prefixes that attempt produced in `changeEpics` (`ptp-backlog-run`, `ptp-backlog`'s
`in-progress` → `blocked` row). A converged epic it leaves **`in-review`** — converged but neither
archived nor committed, since the runner performs neither. Both are this command's to settle.
The most common cause of a halt is not a broken implementation: it is an
apply agent that correctly refused to check off a **manual-only** verification task — a live-app
walkthrough no tool in the session can perform — so `agents/ptp-apply.md`'s "every task shows `[x]`"
rule made `completed` unreachable and the halt was recorded.

Once a human actually performs that walkthrough, there was no way back: out of `blocked` the table
offered only `blocked → ready` (a full reset that discards nothing but re-runs everything), and no row
into `done` existed for a human to take. This
skill is the contract for the missing path: **finish the halted epic from where it stopped**, or, if
the walkthrough surfaced a real problem, **drive one scoped fix pass** and leave it halted for the
next check.

It owns only what is genuinely its own: **target selection**, the **invocation-shape split**, the
**bare flow** and its gates, the **issue-text flow**, and the **report contract**. It owns **no** part
of the backlog store contract (that is `ptp-backlog`'s, referenced throughout and restated nowhere),
**no** review methodology (`/ptp:review-full`'s), and **no** archive methodology (`/ptp:archive`'s).

## Execution contract — unwrapped, outer session only

`/ptp:backlog-continue` is **never wrapped in a `ptp-run-at-model` main run of its own.** The
argument classification, the backlog read and validation, target selection, the branch guard, the
checkbox sign-off, the re-verification commands, the drive of `/ptp:review-full` and `/ptp:archive`,
the single backlog write, and the terminal report all happen **in the outer session**.

**Why, precisely.** `ptp-run-at-model`'s *Nesting caveat* forbids naively wrapping a command whose
work itself spawns a subagent or a Workflow. This command's work does exactly that, twice:
`/ptp:review-full` runs its whole two-phase orchestration inside one `ptp-run-at-model` subagent at
`opus.high`, and `/ptp:archive` runs its already-confirmed archive operation inside one at
`sonnet.medium`. Both of those spawns are level 1 **only because this command took no level of its
own**. The issue-text flow's fix-pass main run is the same: one level-1 run started from this outer
session.

```
PERMITTED (what this skill requires):
outer session (level 0)  →  /ptp:review-full's opus.high main run          = level 1  OK
                         →  /ptp:archive's sonnet.medium main run          = level 1  OK
                         →  the issue-text fix-pass main run               = level 1  OK

FORBIDDEN (what wrapping this command would produce):
wrapper subagent (level 1) → review-full / archive / fix-pass main run     = level 2  THROWS
```

A second consequence of staying outer: `/ptp:archive`'s **interactive** outer-session steps are
reachable at all (a subagent is non-interactive), exactly as `ptp-archive-and-deploy` keeps them
outer for the same reason.

## Invocation shape — the bare/issue-text split is the signal

The command takes **one optional free-text argument** and **no selector of any kind**: no change id,
no `epic:` / `story:` selector, no backlog entry identifier. *Which* epic is acted on is target
selection's answer, read from the store — never the caller's.

- **Bare** — `$ARGUMENTS` absent, empty, or whitespace-only → the **bare flow**. The invocation
  itself is the user's sign-off on the manual verification that the halted change's remaining tasks
  describe.
- **Non-empty free text** → the **issue-text flow**. The text is a report of problems the manual
  verification surfaced, and it is carried **verbatim** into the fix pass as its brief.

**No token is parsed.** `model:`, `fast:`, `parallel:`, and `rounds:` are **not** recognized here;
this command resolves its own targets and never accepts an override, and text containing such a
substring is ordinary issue text (a real issue report may legitimately quote one). The single
exception exists to avoid a silent misreading: an argument consisting **solely** of one or more
token-shaped words (`<lowercase-word>:<body>`) and whitespace is a **refusal** naming them as
unaccepted arguments — never treated as an issue brief and never treated as a bare invocation.
Interpreting `/ptp:backlog-continue model:opus.high` as "fix the problem described as
`model:opus.high`" would spend a fix pass on nothing; interpreting it as bare would archive an epic
the user never signed off. This is `ptp-backlog-run`'s residual-argument judgment call reached from
the other direction: there, everything after the token is residue; here, everything is the brief.

## Target selection — one candidate, or a refusal

Read the backlog store through `ptp-backlog`'s **read protocol** and **tolerant read**, and apply
its **writer-eligibility rule** unchanged: STOP exactly where that rule obliges a writer to STOP — on
any **fatal** problem, and on **no structural problem at all** — having
written nothing. **Proceed** over **every** structural defect, and **name every
outstanding structural problem in the report**: the candidate predicate is per-entry, and no ready set
is ever computed to choose an action, so such a defect cannot mislead it, and refusing over one would
make a halted epic unfinishable until an unrelated repair happened. The one place a ready set is
*mentioned* at all is report shape 1's closing pointer at the rest of the ready set **as the store
already holds it**, and that naming is **withheld** under exactly `ptp-backlog`'s own rule
(*Fatal vs. structural*: a structural problem withholds the ready set) — see *Report contract*.

Two exclusions the read applies before the predicate:

- An entry carrying a `malformed-entry` on its own **`status`** or **`changeEpics`** is **never a
  candidate** — the predicate below would be evaluating a value the reader is forbidden to coerce.
  Name it in the report as excluded, with `/ptp:backlog-edit` as the repair path.
- No other status is ever touched. This command reads every entry and may write **at most one**.

The candidate set:

```
candidates = epics.filter(e => (e.status === "blocked" || e.status === "in-review")
                            && e.changeEpics.length > 0)
blocked    = candidates.filter(e => e.status === "blocked")
```

Resolve in **two steps**:

**`blocked` takes precedence.** If `blocked` is non-empty, selection proceeds over **`blocked` alone**
under the table below — exactly one proceeds; **zero** cannot occur on this branch; **more than one**
refuses, naming every `blocked` candidate's `id`, `title`, and `changeEpics`. The report
**additionally names every `in-review` candidate it did not select**, so they are never silently
ignored. Selection is therefore **byte-identical to its pre-`0046_03` behavior whenever a `blocked`
candidate exists**, and the `in-review` path is purely additive.

| `blocked` candidates | Outcome |
|---|---|
| **exactly one** | proceed, acting on it |
| **more than one** | **refuse**, naming **every** `blocked` candidate's `id`, `title`, and `changeEpics`, and acting on none |

**Otherwise, among the `in-review` candidates, take the head of `ptp-backlog`'s canonical order.** No
refusal for multiplicity. The report names the entry chosen, the count remaining, and
`/ptp:backlog-continue` as the way to take the next one.

**Zero candidates of either status** **refuse** — "no epic is waiting to be settled: no `blocked`
entry carries a recorded change, and no `in-review` entry carries one either." Point at
`/ptp:backlog-edit` when the user believes one should exist and the store disagrees (e.g. it was
already reset to `ready`, or its `changeEpics` was dispositioned away). **Both limbs are worded over
the recorded change**, not over the status alone — an `in-review` entry with an empty `changeEpics` is
not a candidate, so a message saying *no entry is `in-review`* would be false in exactly the case
`/ptp:backlog`'s Recommendation qualifier exists for.

**Why `blocked` first:** a `blocked` entry is the one that **halted the run**, so settling it is what
unblocks further progress — and the command's own purpose is to continue that halt. An `in-review`
entry blocks nothing.

**No tie-break exists among `blocked` candidates, and none may be invented.** `ptp-backlog` persists
no attempt id, no attempt
boundary, and no per-attempt grouping of `changeEpics` (guard 1 states this explicitly), so there is
no field on which "the most recent halt" could be computed. Ranking `blocked` candidates by folder
mtime, `updatedAt`, or id order would be exactly the undocumented heuristic `ptp-backlog-run`'s
*Antichain reading note* warns against replicating ad hoc. The user resolves the ambiguity — with
`/ptp:backlog-edit` on the entry they do not mean — and re-invokes.

**That argument is about `blocked`, and it does not reach `in-review`.** Among `blocked` candidates
the open question is **which halt the user means** — a question of *intent* that no stored field can
answer, the store persisting no attempt id, no attempt boundary, and no per-attempt grouping of
`changeEpics`. Among `in-review` candidates there is **no question of intent**: every one of them
needs the identical treatment — review-full, archive, settle — and the only open question is *which
one first*. That is a **schedule**, and `ptp-backlog` already owns a total order for it: the
**canonical order** — `createdAt` ascending, an entry whose `createdAt` is unusable ordering after
every entry with a usable one, and the node id as the final tie-break in every case — the same order
the ready set and the entries table use. Taking its head is therefore **not** an invented heuristic;
it is the order this contract already publishes. **The order is cited, never redefined**: this
paragraph names it, and `ptp-backlog`'s own *Order* section remains the sole definition of its
components — the unusable-stamp clause and the exact node-id comparison included. Nothing new is
defined here.

**The store is the only memory.** This command holds no state across invocations and has no notion of
which halt is "current" beyond what the store says at the moment it reads. A stale `blocked` entry
left over from an old session is therefore as eligible as a fresh one — intentional, and the reason
the multiple-`blocked`-candidate case refuses instead of guessing.

**A prefix in `changeEpics` may expand to several change folders.** The recorded `id` is a **4-digit
change-epic prefix** (`ptp-backlog`'s schema), and a multi-slice `/ptp:full` run produces
`<prefix>_01`, `<prefix>_02`, … Both flows below act on **every** prefix in `changeEpics`, in array
order (which the canonical write makes ascending numeric), and, within a prefix, on **every** matching
change folder in ascending story order — never only the first.

## Precondition order

In the outer session, in **exactly this order**:

1. **Classify the invocation** — bare vs issue-text, and the token-only refusal above.
2. **The transport preconditions, as an ordered pair — never as one conjoined check**, because
   "resolve X **and** evaluate Y" cannot express that a failing X precludes Y, and because the
   configuration resolver is contractually forbidden from stopping anything itself. **The gate
   precedes selection on purpose:** a command that provably cannot write should not select a target
   and thereby imply it might act — and that rationale covers the configuration gate as well as the
   preflight.

   **2a. Take the configuration gate.** Resolve the `backlog.*` configuration per
   `ptp-github-projects-gh` — that skill owns the `backlog.*` keys and the completeness verdict — and
   take `ptp-backlog`'s *Read protocol* **step 0**, refusing non-silently on either of its **two**
   grounds: an **incomplete `backlog.*` configuration** and a **colliding resolved status-option
   table**. **Name the ground; do not restate the rule.** **No `gh` command is run**, and this
   precedes 2b absolutely.

   **2b. Evaluate the capability preflight verdict**, per `ptp-github-projects-gh` — reached **only**
   when 2a passed. The **verdict disposition table is `ptp-backlog-run`'s**, reused here **by
   citation** and not copied: `ready` proceeds, and `read-only` and `unavailable` both **STOP**
   through that skill's non-silent STOP message.
3. **Read, validate, and select the target** — every refusal in *Target selection* fires here.
4. **Run the `ptp-branch-guard` preamble**, once, per that skill.

Steps 1, 2a, 2b, and 3 are **all** aborting preconditions and **all of them precede the branch
guard**, so no refusable invocation cuts a branch or edits a file.

**`codex.mode` is deliberately *not* resolved here.** It is `/ptp:review-full`'s to resolve and apply,
per `ptp-codex-mode`; this command neither re-resolves it nor gates on it, the same discipline every
other ptp orchestrator keeps. The consequence is stated rather than hidden: a `required` + `codex`
missing STOP surfaces from inside `/ptp:review-full`, **after** that prefix's checkbox sign-off has
already been written. See *The sign-off is durable* below.

## Branch safety — and its known sharp edge

Standard `ptp-branch-guard` preamble, referenced not restated. **In practice it is a no-op:** the halt
that produced the `blocked` entry left the session on that epic's feature branch, and this command is
meant to be invoked from there.

The sharp edge, documented rather than solved: the guard knows only what `git` reports. It cannot
discover *which* feature branch the halted change's work actually lives on — `ptp-backlog` persists no
branch field — so a user invoking this command from a stale checkout of the base branch gets the
guard's normal behavior (a **new** branch derived from the change id) and **not** the branch the work
is on. The re-verification step below will usually catch that immediately (the change's code is not
there), and, regardless, **the report always names the branch the command ran on**, so a wrong branch
is visible at a glance rather than discovered after an archive.

## The bare flow — "I checked it, it's fine"

For each prefix in the candidate's `changeEpics`, in array order, and for each of that prefix's change
folders in ascending story order:

1. **Locate the change folder** `openspec/changes/<prefix>_*`. If a prefix names **no** folder on disk
   — already archived by hand, archived by an earlier partial run of this same command, or moved —
   **skip it, note it in the report as already-archived/absent, and continue**. A missing folder is
   not a failure of the invocation; it is the expected shape of a retry after a partial run.
2. **Check off the remaining tasks.** Re-read `tasks.md` and flip every remaining `- [ ]` to `- [x]`.
   The bare invocation **is** the sign-off for exactly those boxes and for nothing else. **No task
   line is invented, reworded, reordered, or removed** — only existing checkboxes are toggled.

   **On an `in-review` target this step is expected to be a no-op.** Convergence required **every**
   slice in `ptp-full-apply`'s `processed` bucket, so every box should already be `- [x]`. A residual
   `- [ ]` is a **contradiction with the convergence that produced `in-review`**: the bare invocation
   is still the sign-off and the box is still flipped, and the report **names it prominently** — the
   entry, the change folder, and the task line — rather than passing over it. It is **not** a refusal:
   refusing would strand the entry with no writer able to move it, and the sign-off is genuine either
   way.
3. **Re-verify before the sign-off is trusted**, in that change's context:
   - `npx -y openspec validate <change-id> --strict`
   - the project's build and test suites, discovered the same way `ptp-apply` discovers them (the
     repository's own tooling conventions).

   **Any failure stops this prefix** and is reported as a refusal **naming the failing check**. The
   entry's status does not change. This is not a re-run of the manual walkthrough — that was the
   user's job and is already done — it is a re-confirmation that the **automated** half still holds
   after the flip, so a stale build break is never waved through because the user typed the confirm
   command.
4. **Drive `/ptp:review-full <change-id>`** and require its convergence gate: **`BOTH PHASES DONE`**,
   or the `ptp-codex-mode` mode-skip terminal state **`PHASE 1 DONE — CODEX SKIPPED (mode=…)`**, which
   is a success state and is never downgraded. **Anything else** — an iteration cap, a STOP from
   `/ptp:review-full`'s own preconditions — **stops this prefix**: nothing is archived for it and the
   entry's status does not change.
5. **Drive `/ptp:archive <change-id>`** once review converges.

### Driving `/ptp:archive`

`/ptp:archive`'s flow is used **as it is written** — its gates are never weakened, reordered, or
removed, exactly as `ptp-archive-and-deploy` reuses them. Two notes on its two outer-session
confirmations, which are reachable because this command stayed unwrapped:

- **Review-clean** — **performed, never self-answered.** `ptp-archive-and-deploy` runs this
  confirmation rather than deciding it, and so does this command: it is put to the user in the outer
  session, carrying **this invocation's own converged `/ptp:review-full`** for this very change,
  moments earlier, as its **evidence**. That terminal state supplies the confirmation's *substance*,
  not its *answer* — keeping it reachable is the whole point of staying unwrapped, and auto-answering
  it would hollow that rationale out. **Withheld or declined → that prefix stops** exactly as an
  archive gate refusal does, and the entry stays in its existing status (`blocked` or `in-review`).
  The report names the terminal state that
  was offered as evidence. This is the same durable proof guard 3 rests on.
- **Confirm-action** — the user's own `/ptp:backlog-continue` invocation is the intent, mirroring
  `/ptp:archive` step 5's own "the user invoking this command counts as intent, but show the summary
  first". **"First" is honored literally**: the summary (what moves, whether `--skip-specs` applies)
  is shown in the session **before** that change's archive runs — never deferred to the terminal
  report, which would show it only after the fact and would be exactly the gate weakening the hard
  rules forbid. The report then **restates** it per *Report contract* shape 1.

The tasks-complete and validation gates are re-enforced by `/ptp:archive` itself, inside its
subagent, unchanged. An archive **refusal** stops that prefix exactly as a review non-convergence
does.

### The transition, and only then

**Only once every prefix in `changeEpics` has been settled** — archived in this invocation, or found
absent at step 1 — does the command perform the `blocked → done` **or** `in-review → done` write, per
the target's own source status. If **any** prefix stalls at
step 3, 4, or 5, the entry stays in its existing status (`blocked` or `in-review`), its `changeEpics`
is untouched, and the report says exactly which prefixes finished and which did not.

Immediately before the write, **re-read and re-validate the store** and re-confirm the target is still
in **the status it was selected in** with the same `changeEpics`. If it changed under the command,
**refuse** rather than write:
the store contract has no locking, and a blind write would be exactly the never-a-blind-write violation
`ptp-backlog` forbids.

**That mandated pre-write step maps onto `ptp-backlog-write`'s two re-reads, and adds nothing to
them.** The **pre-dispatch snapshot** *is* the re-read-and-re-confirm; the **pre-write field check**
covers `status` and `runBaseline`. `changeEpics` needs **no check**, because **no write is planned for
it**.

**The write shape is `ptp-backlog`'s `blocked → done` / `in-review → done` row under guard 3**, which
**owns** it;
the recap below adds nothing to that skill and `ptp-backlog` wins outright on any divergence. One
single write group setting `status: done`, clearing `runBaseline` (already `null` on
an entry reached through either `in-progress` → `blocked` or `in-progress` → `in-review`, so a no-op
in the common case), and **retaining `changeEpics` as-is**
— sending **no** `updatedAt`, which `ptp-backlog` makes board-maintained. **No `notes` line is appended** — unlike the runner's WRITE 2 — and **no other
entry and no other field is touched**. There is no second write group and no deferred write.

#### The stage mapping

| Payload | Commit |
|---|---|
| the `runBaseline` clear — normally `skipped-identical` | `status: done` |

The **guard owns the write shape**; this adds **only** the dispatch mapping onto
`ptp-backlog-write`'s ordered sequence, and restates none of the guard's numbered steps.

**Retain means plan no write.** *Retain `changeEpics` exactly as-is* means **plan no row for that
field**: it therefore **never appears in the journal**, can **never be a `failed` row**, and needs
**no pre-write check**. The payoff is what makes the retry shape work with no new machinery: the
**candidate predicate** — `blocked` **or** `in-review` with a non-empty `changeEpics` — therefore
**survives every partial failure of this write**, from either source.

#### When the resume write does not complete

A resume write whose verdict is neither `complete` **nor `unresolved-commit`** leaves the entry in its
existing status (`blocked` or `in-review`) with `changeEpics` **intact** — which is **exactly what the
guard already prescribes** when a
prefix fails to settle. Recovery is this command's own § *Retry shape*, cited and not rewritten: a
later **bare** re-invocation re-selects the same candidate, finds every prefix absent (step 1 skips
them and notes them as already-archived), and reaches the write again, where the baseline clear
re-dispatches as `skipped-identical`. **No new flow is added.**

**`unresolved-commit` is the exception**, per `ptp-backlog-write`'s scoping rule. The `done` commit
**may or may not** have landed, so the report **names both possible statuses**, **asserts neither**,
does **not** claim the entry remains in its existing status (`blocked` or `in-review`), does **not**
promise convergence — that promise rests on
the candidate predicate still holding, which a landed `done` would falsify — does **not** report the
epic finished, and **directs the user to inspect the entry** before re-invoking.

### The sign-off is durable

The step-2 checkbox flip is a real edit to `tasks.md` and **is never reverted** when a later step
stalls. That is deliberate: the manual verification genuinely happened, and re-asking for it because
an unrelated build broke would be the opposite of this command's purpose. The report therefore
**names every change folder whose tasks it signed off**, so a user who stalls at step 3 or 4 knows the
boxes are checked and a later bare re-invocation will find them so — and knows equally that a repeat
invocation re-runs steps 3–5 from the top for every prefix whose folder still exists.

### Retry shape

A later bare re-invocation after a partial run is **safe and idempotent by construction**: the
prefixes that archived have no folder left, so step 1 skips them and notes them; the ones that stalled
are re-attempted from step 2 (where the flip is already a no-op) through step 5. Successfully archived
prefixes are **never** re-processed.

## The issue-text flow — "I found problems"

Given non-empty free text, this command **touches backlog status not at all**. **This flow is untouched
by the write path** except through the step-2 preflight gate, because it writes **no backlog entry at
all**.

1. **Choose the change.** Take the **first** prefix in `changeEpics` whose change folder still exists.
   If **more than one** prefix still exists, **list them and ask the user which one the issue text
   concerns** rather than guessing — a multi-prefix halt is unusual, and issue text written about one
   slice must not be handed to another as its brief.

   **Within** the chosen prefix the **lowest** surviving story is taken **deterministically** — no ask.
   Several stories under one prefix is the *ordinary* shape of a multi-slice `/ptp:full`, not an
   anomaly, and the contract's disambiguation is scoped to prefixes; turning the common case into a
   question would make the flow interactive nearly every time. The cost is bounded and made visible
   instead: the report **names the story chosen and every sibling story of that prefix it did not
   touch**, so a brief that actually concerned a sibling is obvious at once, and the user re-invokes
   with issue text that says which.

   **That ask is an in-session interactive question, not a terminal refusal** — the same outer-session
   interactivity that keeps `/ptp:archive`'s confirmations reachable (see *Execution contract*). The
   user's answer is consumed **in this same invocation**, which then proceeds against the named change
   with the issue text unchanged. It is deliberately **not** a "re-invoke with a selector" instruction:
   this command accepts no selector, so a re-invocation would meet the identical ambiguity and ask
   again. Only if no answer is given does the invocation end, as report shape 3's unresolved variant,
   with nothing changed.

   **If *no* prefix has a surviving folder, this flow REFUSES** — every recorded change was already
   archived (by hand, or by an earlier bare run), so there is nothing to fix a pass against and there
   is no folder in which a fix could even be written. **No fix pass runs, nothing changes, and the
   entry stays in its existing status (`blocked` or `in-review`) with its `changeEpics` untouched.**
   The refusal names every prefix and says
   it was found absent, and points at the two real next steps: a **bare** `/ptp:backlog-continue` if
   the archived work is in fact finished (its step 1 skips absent prefixes, so it can still settle the
   entry), or `/ptp:plan` for a **new** change if the reported issue needs work that no longer has a
   home (the entry stays in its existing status, `blocked` or `in-review`). This is the one asymmetry
   with the bare flow, and it is forced: an absent folder is a
   *settled* prefix there and an *unworkable* one here.
2. **Run one fix pass.** Invoke `ptp-run-at-model` with the target read from that change's
   `effort.md` (the same target `/ptp:apply` uses), carrying:
   - the resolved change id,
   - `tasks.md`'s current state,
   - the user's issue text **verbatim** as the brief for what to fix, and
   - `agents/ptp-apply.md`'s **hard rules, reused verbatim** — TDD discipline, **no invented tasks**
     (a genuinely new task means **stop and report**, never fabricate a line), never archive, never
     commit, never stage.

   Three deliberate deltas from that agent file: the fix pass reports **in prose to this command**,
   not in the workflow's structured-JSON return shape (no workflow is consuming it); it **starts no
   further main run**, so the one nesting level is respected; and **its all-tasks-checked completion
   rule does not apply** — that agent may not return `completed` while any `- [ ]` remains and is told
   to "edit the file before returning", which on a halted change would mean checking off the very
   manual-only boxes step 4 forbids. On this path an unchecked manual-only task is the **expected**
   end state, not a blocker: the fix pass checks off only boxes whose acceptance condition **it itself
   verified**, leaves every other one `- [ ]`, and reports that rather than treating it as
   incompleteness. Every other hard rule — TDD discipline, **no invented tasks**, re-verification
   before claiming success, never archive, never commit, never stage — applies verbatim.
3. **Require re-verification before success** — the relevant build/test/lint for the files touched,
   and `npx -y openspec validate <change-id> --strict`.
4. **Check off nothing manual.** The fix pass **never** re-checks a manual-only task box on the user's
   behalf. That box needs a human, and refusing to fabricate that verification is the whole reason
   this command exists.
5. **No status transition, no review, no archive.** The entry stays exactly as it was, `blocked` or
   `in-review`, with
   `changeEpics` unchanged, and `/ptp:review-full` and `/ptp:archive` are **not** invoked on this
   path. The report states what was fixed and that the epic is waiting on another manual check,
   followed by a **bare** `/ptp:backlog-continue` — the next step from **either** status — once that
   check is done.

A fix pass that itself fails — cannot validate, or hits work it cannot do without inventing a task —
is reported as a **refusal**, mirroring the bare flow's step-3 failure and `ptp-full-apply`'s
"convergence gate halts the run" posture. Either way the entry stays in its existing status
(`blocked` or `in-review`).

## Codex mode

Both flows reach Codex only through commands that resolve it themselves: the bare flow's
`/ptp:review-full` applies `ptp-codex-mode`'s decision contract, and the issue-text flow's fix pass
runs under `ptp-run-at-model`, which resolves the main agent per `ptp-agent-roles`. This skill
**neither resolves nor gates on `codex.mode`** and passes no pre-resolved mode to anything —
referenced, never restated, never second-guessed.

## Telemetry

**No new write point.** The runs this command drives — `/ptp:review-full`'s, `/ptp:archive`'s, and the
fix pass's — use their existing `ptp-telemetry` write points unchanged. This skill mints no `run_id`,
opens no ledger line, and resolves no telemetry key of its own.

## Report contract

Every report names the **branch the command ran on** and **every outstanding structural problem** the
load-time validation found. It also names the **candidate entry** (`id` and `title`) **whenever one
was resolved** — which is every shape except the refusals that fire before or instead of a resolution:
a **token-only argument** (refused at classification, before the store is even read), **zero
candidates** (there is no entry to name — the report says so), and **multiple `blocked` candidates**
(none is
selected — the report names them **all** instead, per *Target selection*). Beyond that, four shapes:

1. **Bare flow, full success** — the target's **source status** (`blocked` or `in-review`), so a
   reader can tell which proof the guard supplied; every prefix and story processed, each one's
   `/ptp:review-full`
   terminal state (with a mode-skip kept visibly distinct from `BOTH PHASES DONE`, never flattened),
   each archive result and whether specs were synced or `--skip-specs` applied, any prefix skipped as
   already-archived, and that the backlog entry is now **`done`** with its `changeEpics` retained.
   When `in-review` candidates remain **unselected**, it names them and points at a further
   `/ptp:backlog-continue` to take the next one.
   Closes by pointing at `/ptp:backlog-run` — **without invoking it** — and, when the store carries
   **no** outstanding structural problem, by naming **the rest of the ready set as the store already
   holds it** per `ptp-backlog`'s ready-set definition: those entries are ready because they already
   carry the `ready` status, and this transition made no entry ready. When a structural problem **is** outstanding, that naming is
   **withheld** exactly as `ptp-backlog` requires (the graph is not trustworthy), the report says so
   and points at `/ptp:backlog` for the view once the defect is repaired — the transition itself is
   unaffected, since it never depended on the graph.
2. **Bare flow, partial** — which prefixes finished, which stalled and **exactly why** (the failing
   `openspec validate` / build / test check by name, a review non-convergence and its terminal state,
   or an archive gate refusal), **which change folders were signed off** (see *The sign-off is
   durable*), and that the entry **remains in its existing status (`blocked` or `in-review`)** with
   `changeEpics` unchanged.

   **Where the resume write itself did not complete**, this shape additionally carries the write
   group's **verdict**, its **journal**, and the entry's **status — phrased as what this invocation
   knows**: it committed no transition, so the entry is at the status the snapshot observed, normally
   the status it was selected in, with the **actual** value printed where the group halted on a
   `status` pre-write-check
   difference. It is **never** phrased as a claim that the entry is certainly still at that status. It also
   states that a later **bare** re-invocation converges — except under `unresolved-commit`, where the
   scoping rule above governs instead and no convergence is promised.
3. **Issue-text flow** — the change the fix pass ran against and **why it was chosen** (including, when
   the flow had to ask, which candidates were listed and which the user named). Its **unresolved
   variant**: the ambiguity was raised and no answer was given, so **no fix pass ran** and nothing at
   all changed. Otherwise: what it changed, its re-verification result, any manual-only task boxes left
   deliberately unchecked, that the entry **remains in its existing status (`blocked` or
   `in-review`)**, and the reminder that a **bare**
   `/ptp:backlog-continue` is the next step once the user has re-verified.
4. **No candidate / multiple `blocked` candidates / an excluded entry / a token-only argument / an issue-text
   invocation whose every recorded prefix is already archived** — the refusal exactly as *Target
   selection*, *Invocation shape*, and *The issue-text flow* step 1 specify, naming every `blocked`
   candidate where there is more than one — **and, in that same refusal, every `in-review` candidate it
   did not select**, per *Target selection*, so they are never silently ignored — and every absent
   prefix where none survives, and performing
   no action on any entry. **Several `in-review` candidates are not a refusal** — they resolve to the
   canonical-order head and produce a shape-1 or shape-2 report.

**A refusal is never relayed as success**, and a partial run is never reported as a full one.

## Hard rules

- **Never act on an entry that is not `blocked` or `in-review` with a non-empty `changeEpics`.**
- **Never write more than one backlog entry per invocation**, and never more than **one** write.
- **Never perform `blocked → done` or `in-review → done`** except as the direct, same-invocation result
  of this command's own
  review-full → archive sequence settling **every** recorded prefix. There is no free "mark it done".
- **Never invent, remove, reword, or reorder a `tasks.md` task** on either flow — the bare flow toggles
  existing checkboxes only.
- **Never silently swallow a re-verification failure** on the bare flow: a stale automated failure is a
  refusal naming the check, not a skip.
- **Never weaken `/ptp:archive`'s or `/ptp:review-full`'s gates**, and never reimplement either — they
  are driven, not copied.
- **Never chain into `/ptp:backlog-run`**, and never process a second backlog epic.
- **Never commit, push, merge, or deploy.** The one archive this command performs is `/ptp:archive`'s,
  driven under its own gates.
- **Never wrap this command in a `ptp-run-at-model` main run** — see the execution contract.
- **Never report the epic as finished on a non-`complete` resume write.** The guard permits `done`
  only as **this invocation's own result**, and an uncommitted-partial write has not produced it.
- **Never own or amend `ptp-backlog`'s contract here** — the entry model, the read protocol, the problem
  codes, the writer-eligibility rule, the transition table, and the recovery machinery are **that
  skill's**. Where this file recaps one of them (the writer-eligibility STOP set, the
  `blocked → done` / `in-review → done` write shape)
  the recap is a **pointer, never a second source**: it adds no rule, and on **any** divergence
  `ptp-backlog` is correct and this file is the bug. Never copy the transition table, the problem-code
  list, or the recovery machinery here at all.

## Delegated methodology — do not restate it here

| Concern | Owner |
|---|---|
| backlog store identity, entry model, tolerant read, read protocol, validator vocabulary, writer eligibility | `ptp-backlog` |
| the ordered write sequence, the two re-reads, the journal, its six outcomes and six terminal verdicts, fail-stop, and the no-compensating-writes rule | `ptp-backlog-write` |
| the `backlog.*` configuration, the acting identity and the `gh` surface, and the capability preflight with its verdict record | `ptp-github-projects-gh` |
| the preflight **verdict disposition table** this command reuses by citation | `ptp-backlog-run` |
| the status transition table, the **`blocked → done`** and **`in-review → done`** rows under **guard 3**, and every other row's guard | `ptp-backlog` |
| the halt that produces a `blocked` entry, the convergence write that produces an `in-review` one, its `changeEpics` write, and the terminal-state vocabulary | `ptp-backlog-run` |
| branch safety and the `ptp-branch-prep` workflow | `ptp-branch-guard` |
| the reviewer gate, `codex.model` / `codex.reasoningEffort`, and the mode-skip terminal state | `ptp-codex-mode` |
| spawn-and-relay, effort directives, the nesting caveat | `ptp-run-at-model` |
| the two-phase review loop and its convergence gate | `/ptp:review-full` |
| the archive gates, the confirmations, and the spec sync | `/ptp:archive` |
| the fix pass's implementation discipline and hard rules | `agents/ptp-apply.md` |
