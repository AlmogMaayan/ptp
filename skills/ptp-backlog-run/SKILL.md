---
name: ptp-backlog-run
description: Own the epic backlog runner behind /ptp:backlog-run — the rounds:{count} per-invocation token (default 5), the unwrapped outer-session execution contract under which the runner consumes zero Agent nesting levels and is never wrapped in a ptp-run-at-model main run (its own or per-epic), the five-step precondition order whose three aborting steps — codex.mode, the rounds:/residual refusals, and the backlog capability preflight gate — all precede the one branch guard, the recompute-after-every-epic loop over the ready set whose definition and deterministic order this skill does not own but references from ptp-backlog, the per-epic inline ptp-full skill invocation, the non-convergence halt gate, the two-write status write-back after the take (WRITE 1 records changeEpics and attributionWarnings, WRITE 2 persists the terminal status and clears runBaseline) with each of the three write points dispatched as one write group through ptp-backlog-write's ordered sequence, the three halt rules for a write group that does not complete, the five loop-terminal states including store-write halt at rung 0 and the store-defect halt rename, and the four-bucket terminal report — processed, halted, take-failed, never-started — with each epic's ptp-full-apply per-slice report nested verbatim and an every-rung listing of entries left in-progress. Delegates the backlog store identity, entry model, read protocol, validator vocabulary, change-prefix set, status transition table, recovery machinery, and ready-set rule to the shared ptp-backlog skill; the ordered write sequence, the re-reads, the journal, its outcomes and its terminal verdicts to ptp-backlog-write; the backlog configuration and the capability preflight to ptp-github-projects-mcp; and the rounds: grammar mechanics to ptp-run-at-model's fast: switch section.
---

# ptp-backlog-run — run backlog epics through `/ptp:full`, one at a time

## Purpose

The epic backlog (`ptp-backlog`, `0036_01`) records the epics a user intends to build, in ascending
backlog-id order. This skill is the contract for **executing** that backlog: taking ready epics one at a time,
running each through `/ptp:full`, writing the outcome back into the backlog store, and halting
the whole run the moment an epic does not converge.

It owns only what is genuinely the runner's: the **`rounds:{count}` token**, the
**recompute-after-every-epic loop**, the **per-epic inline `ptp-full` invocation**, the **halt gate**,
the **status write-back**, the **terminal-state classification**, and the **terminal report**. It
owns **neither** the ready-set definition nor its deterministic order — those are `ptp-backlog`'s and
are referenced here, never restated — and it owns none of the token grammar mechanics, which are
`ptp-run-at-model`'s.

The runner is **never wrapped in a `ptp-run-at-model` main run**, its own or per-epic. That is the
first thing to know about it and the section below is why.

## Execution contract — unwrapped, outer session only

Four points, and they are the whole contract:

1. **Outer session only, zero nesting levels.** `/ptp:backlog-run` performs the `rounds:` parse, the
   `codex.mode` resolution, the branch guard, every read and write of the backlog store, the
   ready-set loop, and the terminal report **itself**, in the real session. It **never wraps itself**
   in a `ptp-run-at-model` main run, in either the `claude` or the `codex` direction, and it **never
   wraps an individual backlog epic** in one either.
2. **Each epic is run by invoking the `ptp-full` skill inline** — the skill, driven in-session — never
   by delegating the epic to a nested agent that "runs the `/ptp:full` command".
3. **`ptp-full`'s own internal spawning is the one permitted nesting level.** Its per-slice
   `ptp-run-at-model` subagents and its `ptp-full-apply` Workflow launch are unchanged by this skill
   and governed entirely by `ptp-full`. They are reachable **only because the runner took no nesting
   level of its own**.
4. **No runner-level `model:` or `fast:` token in v1.** Model and effort selection stays inside each
   `ptp-full` run, whose apply agents read each slice's `effort.md`. See *Residual-argument refusal*
   for the two distinct grounds on which the tokens are declined.

**Why wrapping is forbidden rather than merely discouraged.** `ptp-run-at-model`'s § *Nesting caveat*
states that a command whose work itself spawns a subagent or a Workflow cannot be naively wrapped —
the inner spawn would be a second nesting level, which throws. `/ptp:full` does **both**: per-slice
`ptp-run-at-model` subagents *and* the `ptp-full-apply` Workflow launch. So a wrapped runner would
make **the first epic's Workflow launch throw**. `/ptp:backlog-run` is the escape hatch that same
caveat names — "the command must be wrapped at a boundary that keeps the nested spawn in the outer
session" — realized as *no wrapping at all*.

### Nesting budget

```
PERMITTED (what this skill requires):
outer session (level 0)  →  ptp-full skill, INLINE, still level 0
                         →  ptp-full's per-slice ptp-run-at-model subagents      = level 1  OK
                         →  ptp-full-apply Workflow + its agents                 = level 1  OK

FORBIDDEN (what wrapping the runner would produce):
wrapper subagent (level 1) → ptp-full inline, level 1
                           → its subagents / Workflow                            = level 2  THROWS
```

The failing shape is the second one: the Workflow launch at level 2 throws, and it throws on the
**first** epic, so a wrapped runner does not degrade — it fails outright.

## The `rounds:{count}` token

**Ownership.** This skill owns the `rounds:{count}` token, following the ownership precedent by which
`ptp-parallel-fanout` owns `parallel:` and `ptp-run-at-model` owns `model:` and `fast:` — *the skill
that owns the concept owns its token*.

**Defined by reference, not restated here.** The token's grammar, its two-stage
**detect-then-validate** recognition, the **lowercase-prefix-only** candidate rule, the
**at-most-one-candidate** rule with all-candidates reporting on refusal, the
**recognized-but-invalid-refuses** behavior, and the **outer-session strip-before-use ordering** are
defined **by reference** to `skills/ptp-run-at-model/SKILL.md` § *Optional caller-side `fast:`
switch* — **read `rounds:` for `fast:` throughout that section**. Not one of those mechanics is
stated here; for each of them the reader goes to that skill. Restating them would be the
multi-enumeration drift ptp's config contract already forbids.

### The four deltas from `fast:` — exactly four, and no fifth

| # | Delta |
|---|---|
| 1 | The body is a **positive integer ≥ 1**, not a boolean: valid **iff** the body matches `^[0-9]+$` **and** its integer value is at least 1. Leading zeros are accepted — `rounds:05` means **5**. |
| 2 | **Absent resolves to the default 5.** Absent has a positive meaning here, unlike `fast:`, where absent and `off` coincide. |
| 3 | The token **persists nothing**: no ptp config file is read for it or written by it, and there is **no `backlog.rounds` configuration parameter in v1**. |
| 4 | **One round is one backlog epic** run through `/ptp:full`, counting epics **started**, not epics that succeeded — so a halt consumes its round and the invocation. |

This skill registers **no configuration parameter**. `rounds:` is token-only.

The related property that the runner recognizes **no other token** is **not** a `rounds:` delta; it
belongs to *Residual-argument refusal* below, which is where it is stated.

### Worked recognition table

These rows are **worked examples of `ptp-run-at-model`'s rules applied to `rounds:`, not a second
statement of those rules.**

**The precedence rule is scoped.** If a row disagrees with `ptp-run-at-model` on a mechanic **that
skill owns** — candidacy, the lowercase-prefix rule, at-most-one-candidate, strip ordering,
recognized-but-invalid-refuses — then **that skill wins and the row is the bug**. But the
**body-validity verdict** in every row is delta 1 above and is **owned here**: `ptp-run-at-model`
supplies the *consequence* of an invalid body, not the *predicate* for one, and has no opinion about
integers. So the `rounds:0` verdict is this skill's, and no reader is sent elsewhere for it.

| Input | Candidate? | Outcome |
|---|---|---|
| *(absent)* | — | default **5** |
| `rounds:1` | yes | 1 |
| `rounds:5` | yes | 5 |
| `rounds:05` | yes | **5** — leading zeros accepted; `^[0-9]+$` with value ≥ 1 |
| `rounds:100` | yes | 100 — **no upper bound in v1** |
| `rounds:0` | yes | recognized-but-invalid → **REFUSE** |
| `rounds:-1` | yes | recognized-but-invalid → **REFUSE** (`-` fails `^[0-9]+$`) |
| `rounds:5.5` | yes | recognized-but-invalid → **REFUSE** |
| `rounds:abc` | yes | recognized-but-invalid → **REFUSE** |
| `rounds:` | yes | recognized-but-invalid → **REFUSE** |
| `rounds:3 rounds:4` | two | **REFUSE**, reporting **both** — never "last one wins" |
| `Rounds:3` | **no** | not a candidate → falls through as **absent** → default 5, **and then the residue refuses** per *Residual-argument refusal* — the fall-through settles candidate detection, not whether the run proceeds |
| `backgrounds:3` | **no** | `rounds:` inside a larger word is not a candidate → absent → 5, and the residue refuses |

No invalid row falls through to the default.

## Residual-argument refusal

`/ptp:backlog-run` takes **no selector and no free text**: no change id, no `epic:`/`story:` selector,
no backlog `BK-NNNN` id. Backlog ids are deliberately outside the `ptp-change-selector` grammar, and
*which* epics run is the ready set's job, not the caller's.

After `rounds:` is stripped, **any remaining non-whitespace text is a refusal** that names the
residue. The residue is **never silently ignored**. The refusal states why no other token is
accepted, and it keeps the two reasons **apart**:

- **`model:` — structurally impossible.** The token means "run this work at a named target", which
  means spawning a main run, which is exactly the wrapping the execution contract forbids.
- **`fast:` and `parallel:` — a v1 scope decision, not a structural impossibility.** `ptp-full`
  declares both as ordinary inline inputs, so either **could** be threaded through without wrapping
  anything. v1 declines to offer them — and the two are declined on **different** grounds:
  - **`fast`** is an invocation flag with **no** configuration key. With no runner token offered it is
    simply **fixed to `false`** and handed to `ptp-full` at that value. It is **not** config-derived.
    (The runner also spawns no opus agent of its own, so a `fast:` preflight here would announce
    nothing meaningful.)
  - **`parallel`** **is** config-derived: resolved once from `parallel.mode` and passed through
    unchanged.

A runner-level `parallel:` token would **not** imply fan-out across backlog epics; it would govern
each epic's own permitted per-slice fan-out, which `parallel.mode` continues to govern regardless.
Fan-out across backlog epics is forbidden separately and unconditionally (see *No fan-out*).

**`fast:on` is the case that matters most.** Every other write command in the `full` family accepts
it, so a user will reasonably type it. Silently ignoring it would leave them believing fast mode was
requested for this run. So `/ptp:backlog-run rounds:3 fast:on` **refuses**, names `fast:on` as
unaccepted residual text, and says v1 offers the runner no `fast:` token — **without** claiming such a
token would force a wrapper.

**Judgment call recorded:** the alternative — ignore the residue — was rejected. Refusing costs one
retyped command; ignoring costs a wrong mental model of what just ran.

## Preconditions — a fixed order, one branch guard

All five run in the outer session, in **exactly this order**:

1. **Resolve `codex.mode` once**, per the `ptp-codex-mode` skill (that skill owns the resolution and
   the decision contract; neither is restated here). Under **`required`**, run `codex --version`; if
   `codex` is missing, **STOP** with the install-or-change-mode message, doing **no** work and writing
   **nothing**. Under `auto` or `off`, proceed.

   This is a **fail-fast gate, not a hand-off.** `ptp-full` declares only `big-change-id-or-request`,
   `fast`, and `parallel` as inputs and resolves `codex.mode` **itself**, per the same
   `ptp-codex-mode` skill — and this skill may not modify it. So **there is no pre-resolved mode to
   pass into `ptp-full`, and nothing here claims one is passed.** Each epic re-resolves the same value
   from the same layered config, idempotently: nothing in a run mutates ptp config, so every
   resolution in one invocation yields the same value.

   **Why the gate exists anyway, and why it is step 1:** an environment failure must abort **before**
   the branch guard and **before WRITE 0**, so it can never mark a real backlog entry `blocked`.
   Without it, the first epic's own `ptp-full` STOP would land *after* that entry was already taken.
2. **Parse and strip `rounds:`**, then apply the *Residual-argument refusal*. An invalid token or a
   residue **refuses here**.
3. **Resolve the backlog configuration and evaluate the capability preflight verdict**, per
   `ptp-github-projects-mcp` — that skill owns the `backlog.*` keys, the completeness verdict, the
   namespace, the preflight algorithm, its three verdicts, its record, and its STOP-message shape, and
   **none of them is restated here**. See *Step 3 — the preflight gate* below.
4. **Resolve the `parallel` posture once** — see below.
5. **Run the `ptp-branch-guard` preamble exactly once**, for the whole run, per that skill. Every epic
   in the invocation runs on that **one** feature branch. The guard is **not** re-run per epic and
   **no** branch is cut per epic.

**All three aborting preconditions — steps 1, 2, and 3 — precede the branch guard**, so no invalid
invocation, and no invocation that provably cannot write, causes a branch to be cut.

**The placement is derived, not arbitrary.** Pure-argument refusals cost nothing and must precede any
act that touches the outside world, and the preflight is the **first such act**; the `parallel` posture
aborts nothing, so it stays adjacent to the guard.

### Step 3 — the preflight gate

The verdict dispositions, using `ptp-github-projects-mcp`'s own verdict names:

| Verdict | This runner |
|---|---|
| `ready` | **proceed** |
| `read-only` | **STOP**, through that skill's non-silent STOP message. A verdict permitting only reads STOPs a **writer**, and the runner's first act on a taken epic **is a write** — stating this converts a mysterious WRITE-0 failure into a clear precondition STOP |
| `unavailable` | **STOP**, through that skill's non-silent STOP message |

**The verdict is resolved once per invocation, never per epic** — the same discipline as the branch
guard and the `parallel` posture. A store degrading mid-run surfaces as a **write failure** or a
**store-defect halt**, never as a re-preflight.

### Step 4 — the `parallel` posture resolution

*(This step was numbered 3 before the preflight gate was inserted ahead of it; its text is otherwise
unchanged.)*

The runner resolves `parallel.mode` from layered ptp config **in the outer session**, accepting **no**
`parallel:` token of its own, and holds the resulting `on`/`off` posture **fixed for the whole
invocation** — **one resolution per run, never one per epic**, so every epic in an invocation behaves
identically. **That same posture value is supplied to every inline `ptp-full` invocation as that
skill's declared `parallel` input.**

This step **aborts nothing**: a missing or invalid config value resolves per the config reader's own
tolerant posture. Its position after the refusals and after the preflight gate is therefore immaterial
to safety and is fixed here only so that two implementations cannot order it differently.

## Backlog load and validation gate

After the branch guard, read and validate the backlog store **through the `ptp-backlog` skill**,
which owns the store identity, the entry model, the read protocol, and the
validator.

- **A store holding zero epics** → **STOP**, reported as a clean **no-op with respect
  to the backlog store** — **not a defect** — pointing the user at `/ptp:backlog-add`.
- **Any problem the `ptp-backlog` validator reports** → **STOP**, naming that problem **by its
  `ptp-backlog` code**. Never guess past one. The validator's problem-code vocabulary is
  `ptp-backlog`'s and **none of it is reproduced here** — a partial copy would be exactly the
  enumeration drift this skill avoids everywhere else.

**The stricter-than-eligible posture, stated as a decision.** This gate STOPs on **the
writer-eligible structural defect** too — the one `ptp-backlog` says a writer `SHALL NOT` refuse
over. That definition stays where `ptp-backlog` states it and is not copied here. The
eligibility exists so the **repair** path stays reachable: `/ptp:backlog-edit` is the repair tool and
a refusal there would make a defect permanent. **The runner repairs nothing.** It consumes
**`status`** to compute the ready set, and that one defect — a `malformed-entry`, which explicitly
covers an **out-of-enum `status`** — corrupts exactly that **input**, not merely its output. A runner
that guessed past an unreadable `status` could take an epic that is not `pending`, or skip one that
is. `0036_01`'s own read-only view is already calibrated against this posture — it withholds
the ready set on the same problems "so that the view can never present a ready set that a backlog
runner would refuse to consume". Declining an eligibility that is granted is therefore the designed
behavior, not an oversight.

**Scoping note.** This gate runs **after** the branch guard, which may already have stashed the
working tree and cut a feature branch. **Every "nothing was written" claim from here on is scoped to
the backlog store**, and none of them is described as leaving the repository untouched. The **three**
aborting preconditions — steps 1, 2, and 3 — sit **before** the guard precisely to keep that window as
small as the ordering allows.

## The ready set — referenced, never defined here

**`ptp-backlog` (`0036_01`) owns the ready-set definition *and* its deterministic order.** Its
`backlog` capability states normatively that any later backlog runner references that definition
rather than restating it, and this skill is that runner.

So this skill carries **no satisfaction table, no ordering rule, and no determinism claim of its
own**. For what "ready" means, and for the order in which ready entries are taken, **read
`ptp-backlog`'s *Ready set* section**. `commands/backlog-run.md` carries the same citation and the
same silence.

**Why:** `/ptp:backlog` and `/ptp:backlog-run` must never disagree about which epics are ready — one
rule, one owner. Two owners of one enumeration is exactly the drift this repository forbids, and it
is the same by-reference discipline the `rounds:` grammar applies toward `ptp-run-at-model`.

## Recomputation — before every iteration

**Re-read *and* re-validate the store, and recompute the ready set and its order, before every
iteration of the loop** — not once up front. **Never carry an in-memory model of the backlog across
iterations.** A validation defect found on a mid-run re-read **halts the run** and reports every epic
processed so far (see *store-defect halt* below).

Load-bearing, not an optimization, for two reasons — **mid-run defect detection** and the
**no-in-memory-model rule** — neither of which is about promotion:

> On a backlog holding three `pending` entries `BK-0001`, `BK-0002`, `BK-0003`, a `rounds:3` run
> processes all three. The re-read before each iteration is what lets a **hand edit** or a **store
> defect** arriving between epics be seen at all: without it the run would execute a picture of the
> backlog taken before the first epic started.

Recomputing loses nothing that `ptp-backlog`'s rule already guarantees: **that** rule is what makes a
ready set and its order deterministic for a given produced document — this skill claims no determinism
of its own — and each recomputation applies it to the store exactly as it then stands, the epic that just
finished having written its own status before the re-read.

**The detection claim is scoped, deliberately.** Re-reading rather than mutating an in-memory model is
what makes a mid-run hand edit **visible** — but only an edit **present at the mandated re-read** is
caught. `ptp-backlog`'s store contract has **no locking**, so an edit
arriving *after* that read and before the runner's next write may go undetected and be overwritten.
Re-reading shrinks the window to **a single iteration plus the duration of a write group** — a group
being many round trips rather than one write; **it does not close it**, and nothing here claims every
mid-run hand edit is caught. `ptp-backlog-write`'s pre-write check **narrows** that window for the
merge-written collections and for `status`, and **closes it for nothing**.

**Cost is reported, not capped.** The terminal report states the **number of store reads performed**,
and **no caching is introduced** — a mid-run hand edit is *more* likely on a board (one click) than in
a file, and re-reading is exactly what catches it. Nothing here permits treating the ready set as
static and cacheable.

**A withheld ready set is not an empty one.** When the recomputed read runs under `0042_03`'s
**degraded scope** — archived items unreachable, so the ready set is **withheld** — the runner
**refuses at the top of that iteration**, naming **archived unreachability** as the cause, per
`ptp-backlog-write`'s degraded-scope dispositions. It **does NOT** classify the iteration as the
empty-recomputed-ready-set terminal state: reporting the backlog exhausted when it is merely unreadable
in part would be false. The empty-ready-set rung's own trigger is otherwise unchanged.

## Terminal states

**Five** loop-terminal states. Each is reported distinctly; none is ever a silent no-op.

| Terminal state | Trigger | Defect? |
|---|---|---|
| **store-write halt** | a store **write group** returned a verdict other than `complete` | **no** — a transport or concurrency failure, reported |
| **rounds exhausted** | the round cap was consumed; ready epics may remain | no |
| **under-supply** | fewer than the cap were processed and the recomputed ready set is empty | no — clean exhaustion, **unless** an `in-progress` entry lingers (below) |
| **halted** | an epic's `/ptp:full` did not converge | run halted; at most one per invocation |
| **store-defect halt** | a **mid-run** re-read failed `ptp-backlog` validation | **yes** — a store defect, mid-loop rather than pre-loop |

**Two former starvation states are gone**, and neither can recur: the ready set **is** the `pending`
entries, so "the ready set is empty **and** `pending` entries remain" is a contradiction and both
states were unsatisfiable.

### `halted` takes control-flow priority over rungs 2–4, which is what makes "exactly one" well defined

These are **not** independent predicates ORed together. They are read off the **one** way the run
reached its end — a loop exit, **or** a run-start ready set that was already empty, which reaches the
same classification without the loop ever iterating. The ladder, in full:

0. If a store **write group** returned a verdict other than `complete` → **`store-write halt`**.
1. Otherwise, if an epic's `/ptp:full` did not converge, the loop exits **immediately** at WRITE 2 and
   the state is **`halted`** — the cap and the ready set are **not consulted**. A `rounds:1` run whose
   single epic failed is `halted`, **not** rounds exhausted; a halt that happens to leave no `pending`
   entries is `halted`, **not** under-supply.
2. Otherwise, if the round cap was consumed → **rounds exhausted**.
3. Otherwise, if a mid-run re-read failed `ptp-backlog` validation → **store-defect halt**.
4. Otherwise the loop exited on an empty recomputed ready set, and the terminal state is
   **under-supply**.

Step 4 fires **whenever** the recomputed ready set is empty — at run start and at every recomputation
alike.

**`halted`'s control-flow priority is over rungs 2–4 only, and rung 0 outranks it.** The reason is not
taste: on a non-converged epic whose WRITE 2 then **fails**, both conditions hold — but `halted`'s
bucket row asserts the entry's status is **`blocked`**, and it is **not**; it is still `in-progress`.
Reporting `halted` would be **false**. So `store-write halt` is evaluated first, and its report
**also names the non-convergence** WRITE 2 was recording, so that information is reported under the
honest label rather than lost.

**The convergence-decision section's sentence is scoped by this, and by nothing more.** *A non-converged
epic is marked `blocked` and halts the whole run* describes what a **completed** WRITE 2 group records.
A group that does **not** complete leaves the entry `in-progress` and classifies as `store-write halt`.
**The halt itself, the convergence decision, and the all-or-nothing slice-to-epic collapse are
unchanged.**

### The store-defect halt is the mid-run counterpart of the load-and-validate STOP

The store is re-validated at the top of **every** iteration, so **the same defect can end a run that
already processed epics**. When it fires mid-loop it is its **own classified outcome**, occupying its
own rung of the ladder above rather than being reported only as a pre-loop STOP. It reports the
defect **exactly as the pre-loop STOP would**, **plus every epic processed so far**. Because the
re-read sits at the **top** of an iteration — after the previous epic's WRITE 2 — **no epic is ever
in flight when it fires**, so it leaves **no `in-progress` entry of the runner's making**.

### Required report content per state

- **rounds exhausted** — the effective and consumed round counts, and the remaining-ready count, so
  the user can re-run to continue.
- **under-supply** — how many rounds were consumed of how many requested, and that the backlog holds
  no further `pending` epics. **But under-supply is not reported as clean exhaustion while an
  `in-progress` entry lingers**: its condition tests `pending` **only**, so a backlog whose sole
  remaining work is an entry left `in-progress` by an earlier crashed run satisfies it. That entry is
  un-reconciled work, not exhaustion — so when `pending` is empty and `in-progress` is not, the report
  **names those entries as un-reconciled and points at `/ptp:backlog-edit`** rather than calling the
  backlog exhausted.
- **halted** — the halted epic and the terminal state that halted it (see *Terminal report*).
- **store-defect halt** — the defect, named by its `ptp-backlog` code, **plus every epic processed so
  far**. Its trigger is a **mid-run** re-read that **completes** and fails validation against the read
  path's fatal conditions — a defect in the **data**, never a write failure.
- **store-write halt** — the per-write-group content below, additional to
  `ptp-backlog-write`'s journal obligation and **never replacing it**.

Under-supply is a **loop-terminal state, not a pre-loop STOP**: it can fire after epics have already
been processed, so it emits the full terminal report rather than a bare message.

#### `store-write halt` — required report content, per write group

Exactly **three** rows. Each names the entry's **resulting status** and a **repair path**. No
`/ptp:backlog-continue` report obligation appears in this skill — that command's failure report is its
own.

| Failed group | The report SHALL also state |
|---|---|
| **WRITE 0** | the epic was **not taken** and `ptp-full` was **not invoked**; whether a `runBaseline` was stranded on a **`pending`** entry; and that the stranded value is **inert** and the next take overwrites it — **except on `unresolved-commit`**, where the entry's status is **unknown**, both possibilities are named and neither asserted, no inertness and no next-take promise is made, and inspection is directed before any repair |
| **WRITE 1** | the entry is left **`in-progress` with `runBaseline` set**, **deliberately**, and WRITE 2 was **not dispatched**; **which dispatch failed** and therefore whether a durable link landed at all — or, where its rows are **`unresolved`**, that whether one landed is **unknown**, asserting neither, and where **nothing was dispatched at all** (verdict `refused`, every row `not-dispatched`), that **no dispatch failed because none was made**, naming instead the **halt cause** and the field or carrier it halted on; on a failed `attributionWarnings` dispatch, the **prefixes it was carrying** and the residual below; that a resuming `/ptp:backlog-run` **cannot take** the entry and will report it as un-reconciled, **naming which clause** will do so; and `/ptp:backlog-edit` as the repair |
| **WRITE 2** | the epic's **convergence verdict**; the entry's **actual status** — or, on `unresolved-commit`, both possible statuses with neither asserted; **which of the two shapes** resulted — the `notes` line's presence **following from that shape**, never reported as an independent fact — or, where the body row is **`unresolved`**, both shapes with neither asserted; and, for the null-baseline shape, `ptp-backlog-write`'s **full four-part report obligation**, its **part 3 scoped as below** |

**Part 3's convergence promise is scoped here, because this skill's own no-re-dispatch rule would
otherwise falsify it.** `ptp-backlog-write`'s obligation 3 promises that a **re-issued identical
instruction** converges. The runner **re-issues nothing**: it performs no write-group-level
re-dispatch, on the stated ground that the halt path's `notes` append is **not idempotent**, so a
re-dispatched WRITE 2 would **duplicate the line**. So the report SHALL state part 3 in the form that is
true here — **this runner will not retry the write**, the repair is **`/ptp:backlog-edit`** against the
entry, and it is **that** command's re-issued instruction that converges, the reconciliation appends and
the baseline clear re-dispatching as `skipped-identical` and leaving only the commit. The report SHALL
**NOT** invite the user to re-run `/ptp:backlog-run` to settle the entry. Parts 1, 2 and 4 are carried
**unchanged**, part 2's cleared value verbatim included.

**The remaining-ready count's basis for this state:** the **last successfully validated read**, adjusted
only by status changes the journal confirms were **committed** — none from the failed group, since
`status` is its last dispatch, but a **prior completed** group's does count. It is labelled **stale**,
never `unavailable`.

## The pre-run blast-radius announcement

Emitted **after the ready set is computed and before the first epic runs**, stating all six of:

1. the **effective round cap and its source** — the default, or the `rounds:` token;
2. the **feature branch** every epic will land on;
3. the **projected epic list** — the currently-ready epics in order, up to the cap — explicitly
   labelled a **projection**, because it is computed **once, before the loop**, while the ready set is
   recomputed from a fresh read before every iteration: a mid-run hand edit, or a mid-run store defect
   that ends the run early, can change what is actually processed;
4. the blast radius in plain words: **all of this lands on this one branch, uncommitted and
   unarchived; this command never commits, pushes, merges, archives, or deploys**;
5. what the user must do afterwards: review the branch, run `/ptp:archive <id>` per fully-processed
   slice, and ship manually;
6. that **backlog status writes land on a shared board, immediately, outside git, visible to the whole
   team**, and are **not undone by discarding the feature branch**. Item 4 is true of the **code** and
   is now **false of the backlog**, which is why this item exists. Where an entry's content type is an
   **issue** or a **pull request**, a backlog write to a body-carried field also edits **that issue's or
   pull request's own body**, outside the board (see `ptp-backlog-write`).

**This is an announcement, not a confirmation gate** — the run proceeds without waiting for user
input. **Judgment call recorded:** the counter-precedent is real, since `/ptp:full-apply` performs a
one-time scope confirmation on a no-arg invocation — but that stop exists because a no-arg
`/ptp:full-apply` has **unbounded** scope. Here the scope is bounded **twice**: by the round cap
(default 5) and by the store's own ready set. A reviewer who disagrees is disagreeing with a stated
choice, not discovering an omission.

## The write protocol

Three durable writes per epic, through `ptp-backlog`'s IO protocol. The protocol's name — *two-write
write-back* — counts the **two writes that follow the take**; WRITE 0 is the take itself.

**The per-write field lists below name only the fields this skill decides; they are not the complete
set of fields a write touches.** Each of the three is an ordinary `ptp-backlog` write, so it carries
that skill's writer obligations unchanged. `updatedAt` is **not** among them: `ptp-backlog` makes both
stamps board-maintained, so no write here sends a value for either. That rule and its consequences are
`ptp-backlog`'s and are **cited here, not restated**.

### Dispatch

Each of the three writes is **one write group**, dispatched through `ptp-backlog-write`'s **ordered
write sequence**. Its field-level decisions below are unchanged; what this subsection adds is the
mapping onto that sequence's stages, whose names are **cited, never redefined**.

| Write point | Payload stage | Commit stage |
|---|---|---|
| **WRITE 0** — take the epic | `runBaseline` (set) | `status: in-progress` |
| **WRITE 1** — record the link | `changeEpics`, `attributionWarnings` | — |
| **WRITE 2** — settle the run | the `runBaseline` **field-value clear**, and on the halt path the appended `notes` line | `status: done` \| `blocked` |

**WRITE 1 has no commit stage at all.**

Every one of the three touches **exactly one entry**, with two consequences: the sequence's multi-entry
ordering half is **never exercised**, and the **backstop refusal** is **trivially satisfied**.

**The creation stages are never reached** by any runner write point — every one edits an entry that
already exists.

### WRITE 0 — take the epic

**The epic taken is the *first* entry of the recomputed ready set** — first in the order
`ptp-backlog` defines, which this skill consumes and never re-sorts (see *Antichain reading note*).
One entry per iteration, never a batch.

Set `status: in-progress` **and** store `runBaseline` in **one write group** — `runBaseline` the
payload, `in-progress` the commit, per *Dispatch* above — **before**
`ptp-full` is invoked. A crash after this point is reconcilable; a crash before it leaves
the backlog store unchanged — scoped to the store, per the *Scoping note* above, since the
branch guard has already run and may have stashed the working tree and cut a branch.

`runBaseline` holds the 4-digit change-prefix snapshot **as `ptp-backlog` defines it** — see that
skill's *The change-prefix set* section. **This skill states no membership rule of its own and takes
no position on whether the set covers `openspec/changes/archive/`.** Its **storage shape** likewise
defers to `0036_01`'s schema.

**Why the membership rule cannot live here.** `/ptp:backlog-edit` (`0036_03`) computes
`recovered = current \ runBaseline` and requires `current` to use the **identical** definition the
snapshot used: a diff between two differently-defined sets is meaningless. The mismatch is not
symmetric, which is why this is stated rather than left to good intentions — a baseline **narrower**
than the set it is later diffed against would sweep **unrelated change prefixes** into a crashed
entry, minting bogus links that permanently gate it and force a disposition over folders that have
nothing to do with the epic. One definition, held by `ptp-backlog`, makes that unrepresentable.

The runner's own **corroborating after-snapshot uses that same `ptp-backlog` definition**, so
`diff = after \ runBaseline` is a diff between two identically-defined sets.

### The inline `ptp-full` invocation

Between WRITE 0 and WRITE 1, **invoke the `ptp-full` skill inline** — a skill invocation driven
in-session, **not** a spawned agent — with **exactly that skill's three declared inputs and no
others**:

| `ptp-full` input | Value |
|---|---|
| `big-change-id-or-request` | the epic's `description`, passed **verbatim** |
| `fast` | `false` — the runner accepts no `fast:` token, so it supplies this input at its default rather than leaving the posture inferred |
| `parallel` | the posture resolved once in precondition step 3 |

**`codex.mode` is not among them.** It is absent from `skills/ptp-full/SKILL.md`'s Inputs table;
`ptp-full` resolves it itself.

### WRITE 1 — record the link, still `in-progress`

Persist `changeEpics` and `attributionWarnings` while `status` **stays** `in-progress` and
`runBaseline` **stays** set. **On every epic, converged or not.**

Inputs: `/ptp:full`'s in-session terminal report (**authoritative**) and `diff = after \ runBaseline`
(**corroborating only** — forbidding fan-out prevents *this* run minting ids concurrently, but cannot
prevent a separate session doing so).

**Both inputs are reduced to change-epic prefixes before either is used.** `/ptp:full` reports
**slices**, so its report names slice-level change ids (`0041_01_…`); a `changeEpics` element's `id`,
an `attributionWarnings` element, and `runBaseline`'s snapshot are all the **4-digit change-epic
prefix** — `ptp-backlog`'s schema and its change-prefix set define that shape, and neither is restated
here. So *"the ids the report names"* below means **the 4-digit prefix of each slice id the report
names**, deduplicated (several slices of one epic contribute one id). Without that reduction the
table's own conditions would be ill-defined, since row 1 and row 2 turn on whether the report
*explains* a diff prefix — a comparison only possible once both sides are the same kind of value.

**Read every cell below as *this attempt's contribution*, never as the final array.** WRITE 1 merges,
so a re-taken entry arrives already holding the prior attempt's ids and warnings; a cell reading
*(nothing)* means "this attempt adds nothing here", not "the field ends up empty".

| # | Report | Diff | `changeEpics` | `attributionWarnings` |
|---|---|---|---|---|
| 1 | present, names ids | every diff prefix is named by the report | the reported ids, `terminal-report` | *(nothing)* |
| 2 | present, names ids | holds a prefix the report did **not** name | the reported ids, `terminal-report` | the unexplained prefix(es) |
| 3 | present, names **no** ids | non-empty | *(nothing)* | every diff prefix |
| 4 | **absent entirely** | non-empty | every diff prefix, `folder-diff-unconfirmed` | *(nothing)* — the diff is the only evidence there is; routing it to warnings would orphan the link |
| 5 | present, names ids | empty | the reported ids, `terminal-report` | *(nothing)* |
| 6 | present, names **no** ids | empty | *(nothing)* | *(nothing)* |
| 7 | **absent entirely** | empty | *(nothing)* — no prefix to record | *(nothing)* — but the entry is **still flagged attribution-unconfirmed** |

The table is **total** over the six report×diff combinations; the seventh row exists because *present,
names ids* splits by whether the diff holds an unexplained prefix.

**"Absent entirely" and "empty" are distinct conditions, and conflating them is the trap.** *Absent
entirely* means **no report exists to read** — the diff is the only evidence available, so its
prefixes become `folder-diff-unconfirmed` ids in `changeEpics` (row 4). *Empty* means **a report
exists and names no slices** — that is evidence *that nothing was produced*, so it takes the
"present, names no ids" row (row 3 or 6): **no `changeEpics` id from this attempt**, and every diff
prefix routed to `attributionWarnings`. Both are non-convergence, which is why the distinction has to
be stated rather than inferred: collapsing them would let a report that positively named nothing mint
links it explicitly declined to claim. Row 7 settles the only genuinely ambiguous case: an absent
report over an empty diff **still flags the entry attribution-unconfirmed**, because the flag records
*that no report was produced* — it is keyed on the missing report and **never** on the diff's content.

Two asymmetries, easy to get backwards:

- A **report-named id that does not appear in the diff is not a warning.** Warnings describe
  *unexplained diff prefixes* only, never unexplained report ids — the report is the authority.
- An **unexplained diff prefix is never unioned into `changeEpics`.** A union could absorb another
  session's change id and permanently mislink it.

**`attributionWarnings` is persisted, not printed.** A print-only warning would be lost the moment the
run ends, and with `runBaseline` cleared nothing could reconstruct it.

**WRITE 1 merges; it never replaces.** An epic re-taken after a `blocked` → `pending` reset still
carries the prior attempt's `changeEpics`: `0036_03` retains them "in full — never clearing, pruning,
or relabelling them" and persists **no** attempt id, boundary, or grouping, so those ids are the
**only** durable record that the epic is not a clean slate. A replacing write would destroy that
record irrecoverably. So this write **merges this attempt's ids into what is already there and never
drops, prunes, or relabels an id it did not itself add.** Ids remain unique within `changeEpics`, per
`0036_01`'s schema.

**The merge-collision attribution rule**, without which "keep the stored attribution" and
"report-named ids are `terminal-report`" would contradict each other on a re-take: **a stored
attribution stands**, with exactly one exception — a **`folder-diff-unconfirmed` id that *this
attempt's* report names is raised to `terminal-report`**, since a report naming it is strictly better
evidence than the diff that first inferred it. **`user-confirmed-reconciliation` is never
overwritten**: the runner does not write that value and must not displace a human's judgment. So the
runner only ever **raises** provenance, never lowers it.

**The runner never writes `user-confirmed-reconciliation`** — that value is only ever produced by
`/ptp:backlog-edit`'s disposition edit.

**Canonical field order already gives the safe order inside WRITE 1 — confirmed, not excepted.** The
schema places `changeEpics` **before** `attributionWarnings`, and that is also the safer partial order:
losing the **warning** keeps the durable backlog↔change link and keeps the entry **gated** (the gate
keys on *any* `changeEpics` id, whatever its attribution), whereas the reverse would **orphan real
change folders** from the entry that produced them. This **confirms** the inherited order and creates
**no exception**; **no second field-order rule exists anywhere.**

### The convergence decision

**Mechanical, not a judgment call.** From `/ptp:full`'s slice report:

- **converged** — **every** slice landed in `ptp-full-apply`'s `processed` bucket;
- **not converged** — anything else: any slice in `applied (review pending)`, any slice in
  `never-started`, **a plan-convergence STOP that never entered the apply phase**, an **empty**
  report, an **absent** report, or a **mixed** report.

**The slice-to-epic collapse is all-or-nothing, deliberately.** A slice in `applied (review pending)`
means code was applied but its review did not converge; calling that epic-level success would let the
runner start the *next* epic on top of unreviewed code — the exact hazard `ptp-full-apply` halts on.

### WRITE 2 — persist the terminal status

- **converged** → `status: done`, **clear `runBaseline`**, write.
- **not converged** → `status: blocked`, **append** a single line recording the terminal state to
  `notes`, **clear `runBaseline`**, write, and **HALT the run**: no further epic is taken and no ready
  set is recomputed.

**This is the only point at which the runner clears `runBaseline`.** The other clears are
`0036_03`'s, and its set is wider than "the disposition edit": **every** edit that settles a stale
`in-progress` entry clears the baseline in the same write — **any disposition**, the **ungated reset
of the availability table's first row**, and a **cancellation**. Two of those three carry no
disposition at all, so `/ptp:backlog-edit`'s disposition edit is **not** the sole other clear, and the
invariant below depends on the set being enumerated completely.

So a lingering `runBaseline` means an **un-reconciled crashed run and nothing else — once no backlog
run is live**. **That qualifier is required, and this skill of all artifacts must carry it:** WRITE 0
sets `in-progress` and `runBaseline` in one write *before* the epic's work begins, so between WRITE 0
and WRITE 2 a perfectly healthy in-flight run presents **identical stored state** to a crashed
one, and v1 has **no multi-writer locking** to tell them apart. `0036_01` words its stale flag
conditionally and `0036_03` words its gate refusals the same way; this runner is the component that
*creates* that ambiguity, so **no sentence here asserts that a lingering baseline proves a crash**.
The invariant states what a lingering baseline *means* once no run is live — never a claim the store
can tell.

**`notes` handling: append, never replace.** The runner appends **one** line and never replaces
existing content, and it **writes `notes` nowhere else**. `notes` is user-facing free text; clobbering
it would destroy the user's own record. A dedicated per-attempt terminal-state field is a v2 seam
belonging to `0036_01`'s schema, not something this skill invents.

**The baseline clear is a payload write, dispatched before the commit.** That keeps the inherited
*every settling edit clears `runBaseline`* enumeration **complete**: the clear is in the **same write
group**, merely not the same **dispatch**. The halt path's `notes` append is an **outright-set scalar**
and therefore carries **no** pre-write check.

### Why two writes, not one

**WRITE 1 is never coalesced into WRITE 2.** Coalescing them would mean a crash between `/ptp:full`
returning and the status write loses `changeEpics` entirely, **orphaning real change folders** from
the entry that produced them. The split makes the backlog↔change link durable **as early as
possible**.

### The crash shapes this runner hands to `/ptp:backlog-edit`

`/ptp:backlog-edit`'s reconciliation **gate** is the consumer of these shapes — it keys on *any*
`changeEpics` id, whatever its attribution, **or** any undispositioned `attributionWarnings` entry —
so the runner must leave exactly these shapes in the fields it writes:

| Killed at | `status` | `runBaseline` | `changeEpics` | `attributionWarnings` |
|---|---|---|---|---|
| during `/ptp:full` (after WRITE 0) | `in-progress` | set | **unchanged from before the take** — empty on a first attempt, the retained prior-attempt ids on a re-taken entry | unchanged from before the take |
| between WRITE 1 and WRITE 2, report named ids | `in-progress` | set | possibly **only `terminal-report` ids** | possibly non-empty |
| between WRITE 1 and WRITE 2, report present but naming **no** ids, **over a non-empty diff** | `in-progress` | set | **no id added by this attempt** (empty on a first attempt) | **non-empty** |

Row 1 is why WRITE 0 must not be read as a reset: a re-taken entry arrives carrying the prior
attempt's ids, so WRITE 1 **merges**. Row 2 is why the gate keys on *any* id rather than on
"unconfirmed ids exist" — an unconfirmed-only gate would wave that entry straight through to
`pending` and silently re-run work that already landed. Row 3 is the gate's warnings-only limb, and it
is this runner that produces it — the **non-empty diff** in its condition is what makes it that limb,
since the same kill point over an **empty** diff adds nothing at all (WRITE 1 row 6) and so presents as
row 1.

### The runner's transition scope

The status transition table is **owned by `ptp-backlog`** and is **cited, never restated**. The runner
performs **only the three rows whose performer is `/ptp:backlog-run`**:

- `pending` → `in-progress` (WRITE 0),
- `in-progress` → `done` (WRITE 2, converged),
- `in-progress` → `blocked` (WRITE 2, not converged).

It introduces **no transition rule of its own**. And it **never resets an entry**, **never revives a
`cancelled` entry**, **never retries a `blocked` entry**, and **never dispositions an
`attributionWarnings` entry** — those are `/ptp:backlog-edit`'s acts.

## When a write group does not complete

**The universal rule.** On any verdict other than `complete`, the runner **halts**, performs **no
write-group-level re-dispatch**, and **reports the journal in full**.

Two independent reasons re-dispatch is forbidden:

1. **Ambiguity is resolved by re-read, never by retry** — `ptp-backlog-write`'s rule, applied here.
2. **The halt path's `notes` append is not idempotent**, so a re-dispatched WRITE 2 would duplicate the
   line.

### WRITE 0 — the take

- The epic is **not taken** and **`ptp-full` is not invoked**.
- The round is **consumed**: the counting rule counts epics **started**, and that extends to an
  attempted-but-incomplete take.
- The run **halts rather than skipping** to the next ready epic. The transport is a **shared** resource,
  so the next epic almost certainly fails identically; skipping would burn rounds silently and scatter
  stranded baselines across several `pending` entries.
- A stranded `runBaseline` on a **`pending`** entry is **inert** — WRITE 0 precedes `ptp-full`, so **no
  work was done**. It is deliberately **not** a stale entry (staleness requires `in-progress`), **not**
  gated (the gate's trigger is `in-progress` with a status-changing instruction, or a non-null baseline
  under an out-of-enum repair), and **not** flagged; the next take overwrites it. **The report SHALL
  state all of that**, or a user meets an unexplained value with no way to know it is harmless. The
  stale definition and the gate trigger are `ptp-backlog`'s, **cited and neither amended**.
- **The `unresolved-commit` exception**, per `ptp-backlog-write`'s scoping rule, and it applies **here**
  as much as at WRITE 2: WRITE 0 **has** a commit (`status: in-progress`), so this is the one WRITE-0
  verdict on which the take may in fact have landed. The entry's status is then **unknown**, and the
  report SHALL name **both** possibilities and assert **neither**. In particular it SHALL NOT state
  that the entry is `pending`, SHALL NOT describe the baseline as inert, and SHALL NOT promise that
  *the next take overwrites it* — none of which holds on the `in-progress` branch, where the entry is
  instead the ordinary **stale** shape (`in-progress` with its baseline set) that the runner never
  takes. The report SHALL direct **inspection before any repair or retry**. Every other WRITE-0
  bullet above is scoped to the five verdicts on which no `status` write can have landed.
- **The unreachable shape:** `in-progress` with a **null** baseline can **never** arise from WRITE 0,
  because `status` is dispatched **last** and only after `runBaseline` landed. That is **derived from
  the ordering**, not asserted, and it holds on the `unresolved-commit` branch too — an `in-progress`
  entry there carries its baseline.

### WRITE 1 — the one genuinely new crash shape

> **When WRITE 1's verdict is not `complete`, the runner HALTS and does NOT dispatch WRITE 2.** The
> entry is left **`in-progress` with `runBaseline` still set**.

**Why that is right:** that state **is** the stale-entry definition, so the **entire recovery contract
applies with no new machinery**. The definition is `ptp-backlog`'s and is **cited, not restated**.

**What makes it genuinely new is the other half:** WRITE 1 has **no commit stage**, so the
status-commit invariant **has nothing to defend here**.

**What the landed carrier record makes of the dispatch split.** `changeEpics` and `attributionWarnings`
share the **body** carrier, so WRITE 1 is **one dispatch carrying two journal rows**, and the split
below is **unreachable through that carrier**. It is written as a **conditional** — the rule that
applies **if** the two ever become separately dispatchable — and **never as a live residual**.

**Conditionally, then, the two dispatch positions:**

| Failed dispatch | The entry holds | The report |
|---|---|---|
| `changeEpics` (the **first**) | no id and no warning from this attempt | SHALL say **no durable link landed this attempt**, and SHALL **NOT** report a lost-warning residual — nothing was skipped, because no warning was ever recorded |
| `attributionWarnings`, after `changeEpics` landed | the durable link, without its warnings | carries the residual below |

**And the case in which nothing was dispatched at all, which the table above cannot describe because it
is keyed on a failure.** A WRITE 1 group can end **`refused`** — a pre-write-check **difference** on
`changeEpics` or `attributionWarnings` at the first planned row, or a snapshot or compose read that
could not be completed within its bounded budget — with **every row `not-dispatched`**. The report SHALL
then state that **no durable link landed and no dispatch failed, because none was made**, and SHALL name
the **halt cause** — a difference, with the snapshot's value and the value found, or the read that could
not be completed — together with the **field or carrier** it halted on. It SHALL NOT name a failed
dispatch it never made.

**And the `unresolved` row, which is not a failed dispatch and is reachable through the shared carrier.**
Where WRITE 1's body write was dispatched, its response was ambiguous, and its verification read could
not be completed, its rows are `unresolved`: **whether a durable link landed is unknown**. The report
SHALL say so, SHALL NOT claim that no durable link landed this attempt, SHALL NOT claim one did, and
SHALL direct **inspection of the entry before any repair or retry**. The halt itself, and the entry being
left `in-progress` with `runBaseline` still set, are unchanged — nothing was dispatched after the failing
row.

**The residual, scoped to the failed-`attributionWarnings` case only and conditional on the two fields
being separately dispatchable at all.** Reconciliation **skips** a recovered prefix already present in
`attributionWarnings`. If the warning write was the one lost, that skip does not happen, and the prefix
is instead appended to `changeEpics` as `folder-diff-unconfirmed` — **a lost warning reappearing as a
provisional claim**, an inversion from *judged not ours* to *provisionally ours*. The **mitigation** is
that `disown` drops exactly the provisional ids, and the halt report **SHALL name the prefixes the
failed warning write was carrying**. This is a **residual, not an acceptable equivalence** — and while
the two fields share a carrier the halt report **SHALL NOT present it as a live outcome**.

### WRITE 2 — the terminal write

On any non-`complete` verdict **other than `unresolved-commit`**, the partial state is **`in-progress`**
— `status` is the group's last dispatch. WRITE 2 is **two carrier dispatches**, the body then `status`,
so **which** shape results depends on whether the **body write** landed.

**The table below is scoped to the normal case, in which the `runBaseline` row is a real planned
dispatch** — the entry's baseline was **non-null** at the snapshot, WRITE 0 having set it. Where the row
is instead `skipped-identical` the table does **not** apply and the paragraph after it governs.

| Body write | Resulting shape | Recovery |
|---|---|---|
| **landed** (`landed` or `landed (verified by re-read)`) | the **null-baseline residual**, **with the `notes` line appended** | not reconciled; the gate still applies **on existing holdings**, and every refusal states **no diff was possible** |
| **did not land** (`failed` or `not-dispatched`) | the baseline is **still set** and **no `notes` line was appended** — the ordinary **stale** shape | reconciled with a **diff available**, and with **no** such refusal wording |
| **`unresolved`** | **neither shape is known** — the body carrier write may or may not have landed, so the baseline may or may not be cleared and the `notes` line may or may not be present | **not asserted.** The report SHALL name **both** shapes, assert **neither**, prescribe **neither** recovery wording, and direct **inspection of the entry before any repair or retry** |

**The third row is not a hole in the split; it is the split stated honestly.** A body carrier write whose
response was ambiguous and whose verification read could not be completed is `unresolved` and carries the
verdict `uncommitted-partial` — a **payload** row, so the entry's status is still known to be
`in-progress` (nothing was dispatched after it), while **which** residual it holds is not. Reporting one
of the two known shapes there would assert an outcome this runner does not have, which is exactly what
`ptp-backlog-write`'s scoping rule forbids.

**The `notes` line is NOT an independent variable.** It rides the **same body carrier** as the clear, so
the two land together: **no report may describe the baseline cleared with the halt line lost, or the
reverse**.

**The case the table excludes: a `runBaseline` row that is `skipped-identical`.** That outcome means the
baseline was **already null before this write** — a hand edit, or a residual an earlier operation left —
so the null-baseline state is **pre-existing and was not produced here**, and it is null on **both**
branches of the body write rather than only where the body landed. The report SHALL say so, SHALL
**not** claim to have cleared a baseline, and SHALL **not** print a cleared value it never saw, exactly
as `ptp-backlog-write`'s detection rule excludes `skipped-identical` from layer 1. **The `notes` line
then varies alone**: the halt path's append is still a real planned row on the body carrier, so whether
it landed follows from that carrier write's own outcome — which is **not** a violation of *the `notes`
line is not an independent variable*, that rule pairing the line with a **clear this write actually
dispatched**, and here there is none. The entry is otherwise the ordinary **stale-shaped** entry with a
**null** baseline, so **no diff is available** and the gate's refusals state that no diff was possible.

**The `unresolved-commit` exception**, per `ptp-backlog-write`'s scoping rule: the entry's status is
**unknown**, so **neither shape is asserted**, the report names **both** possibilities and asserts
neither, and it directs inspection before any repair or retry.

The recovery machinery handles **both known** shapes unchanged, and because WRITE 1 landed the ids first,
the **gate fires on ids in both** — and on whichever of the two the unresolved case turns out to be, that
case resolving to one of them once the entry is inspected. **No disposition, gate row, or availability-table row is restated here.**

### The never-yields-`done` check

A **check**, not a restatement: a partial write can **never** reach `done`, because `status` is the
**single last dispatch** of its group, so `done` is either **fully committed or never written**. This
cites `ptp-backlog`'s *recovery never yields `done`* and **adds no rule to it**.

## Recovery is inherited whole

Every one of the following is **`ptp-backlog`'s**, cited here and restated nowhere: the
**stale-`in-progress` definition**, the **change-prefix set**, **additive change-folder
reconciliation**, **the gate**, **the availability table**, **the disposition outcomes**, ***every
settling edit clears `runBaseline`***, and ***recovery never yields `done`***.

**The change-prefix set is storage-independent because it describes the repository**, not the store. So
a board-backed backlog still snapshots and diffs **local change folders under `openspec/changes/`**, and
`diff = after \ runBaseline` remains a diff between **two identically-defined sets**.

Only **three** facts are store-specific, and each is a rule applied rather than a new one:
`runBaseline` is **one serialized collection field**; it is **merge-written and therefore
pre-write-checked**; and it is emptied as a **field-value clear**.

## The terminal report

**Two vocabularies, one stated mapping.** `ptp-full-apply`'s three buckets describe **slices inside
one `/ptp:full` run**; the runner needs buckets describing **backlog epics across the invocation**.

**Four** backlog-level buckets.

| Backlog-level bucket | Meaning | Entry status |
|---|---|---|
| `processed` | the epic's `/ptp:full` converged end to end | `done` |
| `halted` | the epic whose `/ptp:full` did not converge and stopped the run, **or** whose post-`ptp-full` write group failed **whether or not its `/ptp:full` converged** (at most one per invocation) | nominally `blocked` — but the entry's **actual** status is printed wherever a write group failed |
| `take-failed` | the epic whose **take** write group did not complete | **unchanged by this runner** — normally `pending`; the entry's **actual** status wherever the take halted on a `status` pre-write-check difference; and **unknown, with both possibilities named and neither asserted**, where the take ended `unresolved-commit` |
| `never-started` | ready or pending epics the invocation never reached (rounds exhausted or a halt) | unchanged `pending` |

**`take-failed` — at most one per invocation, and mutually exclusive with `halted`**: a take failure
halts **before** `ptp-full` runs, so no epic can both fail its take and fail to converge in one
invocation.

**Why it fits none of the three existing buckets:** not `processed` (no `ptp-full` ran); not `halted`
(that row asserts `blocked`); not `never-started` (a write **was** attempted and may have landed a
baseline).

**Why the two status cells print the actual value.** A nominal status cell must never assert what the
**detector-not-a-lock** pre-write check cannot know. For `halted` that matters twice over: a **WRITE-1
or WRITE-2** failure keeps the epic in this bucket while the entry is still `in-progress`, and the
bucket's **meaning** is widened above precisely because such a failure can happen on an epic whose
`/ptp:full` **did** converge. Such a row **prints the convergence verdict**, so a converged epic is
**never hidden behind a halt label**.

**`applied (review pending)` is deliberately not reused at backlog level** — it is a per-slice state
with no epic-level meaning; a backlog epic is either finished, the one that halted, or untouched. It
appears **only** inside an epic's nested per-slice report.

**Entries already `done`, `cancelled`, or `blocked` before the invocation began are outside the four
buckets** — the invocation neither processed them nor could have reached them. They appear only where
a terminal-state report names them (a lingering un-reconciled `in-progress` entry under
under-supply).

### Nesting the per-slice reports

Each **`processed` or `halted`** epic's own `/ptp:full` output is kept **verbatim and nested
underneath** its backlog row — `ptp-full-apply`'s three per-slice buckets unrenamed and
unreinterpreted, **with the per-slice resume hints surviving intact** (`/ptp:review-full <id>` for an
`applied (review pending)` slice, `/ptp:full-apply <ids…>` for the `never-started` tail). The runner
**adds a layer; it does not redefine the existing vocabulary**.

**Five row shapes have no `ptp-full-apply` three-bucket output to nest, and each says so under its own
label rather than fabricating buckets:**

- **`never-started`** — the epic ran **no** `/ptp:full` at all. Its row carries the entry id, its
  title, and the reason it was never reached (cap consumed, or the run halted).
  **No fabricated empty report.**
- **`take-failed`** — the epic's take write group did not complete, so **no `/ptp:full` ran**. Its row
  carries the entry id, its title, its actual status, and the write group's verdict. **No fabricated
  empty report.**
- **`halted` with an absent report** — labelled **"no `/ptp:full` terminal report was produced"**,
  carrying the `changeEpics` ids WRITE 1 recorded **plus the attribution-unconfirmed flag**, which is
  precisely the state the user must inspect. This row exists because an absent report is itself a halt
  cause under *The convergence decision*.
- **`halted` with an empty report** — labelled **"`/ptp:full` reported no slices"**, carrying the
  recorded `attributionWarnings` prefixes, with **no `changeEpics` id contributed by this attempt** (a
  re-taken entry still shows its retained ids, per the WRITE 1 merge rule) and **no**
  attribution-unconfirmed flag. Distinct from the absent-report row because **a report that named
  nothing is evidence, not missing evidence**.
- **`halted` at plan convergence** — that run never entered the apply phase, so `ptp-full-apply`
  produced no buckets. Labelled **"stopped at plan convergence — the apply phase was never entered"**,
  and it nests **`/ptp:full`'s own plan-convergence STOP report verbatim**, with its per-slice
  plan-review terminal states and its resume pointers. It is **not** an absent-report row and **not**
  an empty-report row: a plan-convergence STOP is a fully informative report of a different shape.

### Required report fields

Alongside the buckets, the report carries **every one of these**:

1. the **terminal state** — one of the five;
2. the **effective** and **consumed** round counts;
3. the **branch name**;
4. the **remaining-ready count**, with the as-of-last-validated-read semantics below;
5. **every `attributionWarnings` prefix recorded this run**;
6. **every entry flagged attribution-unconfirmed**;
7. a restatement that **nothing was committed and nothing was archived**;
8. the **next-step pointers** — `/ptp:backlog` to view; `/ptp:backlog-edit <id>` to disposition a
   halted entry; re-run `/ptp:backlog-run` once the halt or the remaining work is resolved;
9. **on every terminal state**, any entry left **`in-progress`** that this invocation did **not** take,
   named as **un-reconciled**, **distinguishing the baseline-set shape from the null-baseline residual**
   (`ptp-backlog-write`'s layer-2 predicate), and pointing at `/ptp:backlog-edit`. This is **one report
   clause and nothing else** — it adds **no** terminal state, **no** bucket, **no** field, **no**
   disposition, **no** gate trigger, and **no** ready-set rule. **Why it is needed rather than
   optional:** the pre-existing clauses fire only when the lingering entry **blocks** the remaining work
   or **is** the remaining work; with dependencies gone the first cannot fire at all, so a resuming run
   with unrelated ready epics that exits on **rounds exhausted** reaches neither — and the bucket
   contract puts a pre-existing `in-progress` entry **outside** the buckets. A **halting** invocation's
   own report SHALL additionally name **which clause** will surface the shape it is deliberately
   leaving.

**The remaining-ready count is always as of the last successfully validated read, and says so.** It is
**never presented as freshly computed at report time**. **One** derivation covers every exit, because
processing an epic can never promote another:

> the last validated read's ready set, **less the epics processed since that read**.

**The subtrahend is *the epics processed since that read*** — **not** the epics the whole invocation
processed. After a multi-round run that larger set's earlier members are already `done` in the last
validated read and therefore already absent from its ready set, so subtracting them again would
double-count. Which epics count is decided by where each terminal state exits:

| Terminal state | Exits… | Subtrahend |
|---|---|---|
| **halted** | at WRITE 2, after the epic ran | one epic |
| **rounds exhausted** | after the final epic's WRITE 2 | one epic |
| **store-defect halt** | at a **failed** re-read, so the last *validated* read is the previous iteration's | one epic |
| **under-supply** | at the **top** of an iteration, on the very read that found the ready set empty | **none** |

**Under-supply's subtrahend is empty on every under-supply exit**, however many epics the run
processed. Under-supply *is* "a fresh validated read whose ready set is empty", so by construction
nothing has been processed since it — whether the loop iterated three times beforehand or zero. A run
that processes two epics under a cap of five and then finds nothing ready exits under-supply with a
subtrahend of **none**, and its count is that read's ready set unchanged, i.e. zero.

**On a store-defect halt** the count comes from the last read that validated and is **explicitly marked
stale** with the defect named. **The `never-started` rows take that same last-validated-read basis**
and are likewise marked stale rather than omitted — omitting them would silently shrink the report
exactly when the user most needs to see what was left untouched.

The count is **labelled as of that read** and are therefore **stale with respect to any
concurrent edit**.

**There is no `unavailable` case.** A validated read always exists: the loop is entered only after the
pre-loop load-and-validate gate passed, and a store-defect halt is by definition a **mid-run** re-read
failure — a pre-loop failure is the load-and-validate STOP, which emits no bucket report at all. So
the count is always available, merely stale; inventing a fresh number would be the one place this
report could quietly lie.

**A partial run is never presented as success.**

## No fan-out — which level is forbidden, and which is untouched

Two levels of parallelism exist here and conflating them would silently regress `/ptp:full`:

- **Across backlog epics — FORBIDDEN.** `ptp-parallel-fanout`'s first safety condition is provably
  disjoint write sets, and it fails **structurally** here: backlog epics write shared source. That
  ground is sufficient on its own. **A second, independent ground now stands beside it:** every
  concurrent epic would write **the same board**, with **no locking** and with `ptp-backlog-write`'s
  pre-write check **explicitly not a lock**. The rule is **unchanged** and simply gains a ground. The
  runner processes **one epic at a time**, never concurrently, and accepts no `parallel:` token. The
  second epic is not started until the first has reached WRITE 2.
- **Inside one epic — UNCHANGED.** `/ptp:full`'s own Phase-A per-slice fan-out is governed by
  `parallel.mode` exactly as today; the runner passes the resolved posture into each `ptp-full`
  invocation, so per-epic behavior is what a hand-typed `/ptp:full` would do.

So "no fan-out" must **not** be misread as disabling `parallel.mode`.

`skills/ptp-parallel-fanout/SKILL.md` is **referenced and unmodified** by this skill.

## The v2 inter-epic seam — documentation only

The **inter-epic hook** is a reserved v2 extension point located at the loop's per-epic boundary —
**after WRITE 2 completes and before the next recomputation**, the only point at which one epic is
fully settled and the next has not begun. **`/ptp:archive-and-deploy` is the intended v2 filler.**

**"Documentation-only" is meant literally, so that no implementer builds a hook:** v1 ships **no hook
mechanism, no registration point, no configuration key, and no behavior whatsoever** at that boundary.
The seam is a **note about where a future change would attach**. The sole v1 obligation it creates is
that the per-epic boundary stays a **real** boundary: WRITE 2 completes and `runBaseline` is cleared
before the next recomputation begins.

**Branch-per-epic is explicitly rejected**, and the reason is recorded: `ptp-branch-prep` stashes the
working tree and switches to the base branch, which would **strand the previous epic's uncommitted
work in a stash**.

## Hard rules

- **Never wrapped in a `ptp-run-at-model` main run** — not the runner, not an epic, in either
  direction.
- **Never fan out across backlog epics** — one epic at a time, always.
- **Never commit, push, merge, archive, or deploy.**
- **Run the branch guard exactly once per run**, never per epic.
- **Never coalesce WRITE 1 into WRITE 2.**
- **WRITE 2 is the only runner-side `runBaseline` clear.**
- **Halt the whole run on a non-converged epic** — mark it `blocked` and take no further epic.
- **Halt on any write group whose verdict is not `complete`**, and **never re-dispatch a write group.**
- **Never restate a grammar mechanic owned by `ptp-run-at-model`, a ready-set or ordering rule owned
  by `ptp-backlog`, that skill's validator vocabulary, change-prefix set, transition table or recovery
  machinery, or the write sequence, re-reads, journal, outcomes and verdicts owned by
  `ptp-backlog-write`** — cite them.
