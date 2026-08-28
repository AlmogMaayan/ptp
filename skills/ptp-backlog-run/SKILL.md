---
name: ptp-backlog-run
description: Own the epic backlog runner, its ready-set loop, its halt gates, and its terminal report
---

# ptp-backlog-run — run backlog epics through `/ptp:full`, one at a time

## Purpose

The epic backlog (`ptp-backlog`, `0036_01`) records the epics a user intends to build, in the
backlog's **canonical order** — whose key is `ptp-backlog`'s to state and is not named here. This skill
is the contract for **executing** that backlog: taking ready epics one at a time,
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

## Section index

Operation-scoped sections of this contract live in `references/`, each loaded on its own
trigger rather than with this file:

- `skills/ptp-backlog-run/references/the-write-protocol.md` — loaded when writing an epic status back to the board.
- `skills/ptp-backlog-run/references/when-a-write-group-does-not-complete.md` — loaded when handling a write group that did not complete.

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
no backlog entry identifier. Backlog entry identifiers are deliberately outside the
`ptp-change-selector` grammar, and
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
3. **The transport preconditions, as an ordered pair — never as one conjoined check**, because
   "resolve X **and** evaluate Y" cannot express that a failing X precludes Y, and because the
   configuration resolver is contractually forbidden from stopping anything itself:

   **3a. Take the configuration gate.** Resolve the `backlog.*` configuration per
   `ptp-github-projects-gh` — that skill owns the `backlog.*` keys and the completeness verdict — and
   take `ptp-backlog`'s *Read protocol* **step 0**, refusing non-silently on either of its **two**
   grounds: an **incomplete `backlog.*` configuration** and a **colliding resolved status-option
   table**. **Name the ground; do not restate the rule** — each ground's content is that skill's. **No
   `gh` command is run**, and this precedes 3b absolutely.

   **The workspace root is bound here, once — inside this sub-step, not beside it.** What is bound is
   the **one** root `ptp-workspace` resolved at the invocation's entry, per its *One resolution, at the
   step's entry* rule — this sub-step records that value for the run rather than resolving a second
   one, which is why step 1's `codex.mode` resolution, over the same layered contract, already read it.
   The `backlog.*` configuration likewise cannot be resolved without it, so binding it here adds **no**
   precondition step and **no** aborting precondition, and the ordered 3a-then-3b pair is unchanged.
   The bound root is held
   **fixed for the whole invocation**, joining the branch guard, the preflight verdict and the
   `parallel` posture in the once-per-run set, and is **never re-resolved per epic or per loop
   iteration**.

   **3b. Evaluate the capability preflight verdict**, per `ptp-github-projects-gh` — that skill owns
   the acting identity, the `gh` surface, the preflight algorithm, its three verdicts, its record, and
   its STOP-message shape, and **none of them is restated here** — reached **only** when 3a passed.
   See *Step 3 — the preflight gate* below.
4. **Resolve the `parallel` posture once** — see below.
5. **Run the `ptp-branch-guard` preamble exactly once**, for the whole run, per that skill. Every epic
   in the invocation runs on that **one** feature branch. The guard is **not** re-run per epic and
   **no** branch is cut per epic.

**Steps 1, 2, 3a, and 3b are the four aborting preconditions, and all four precede the branch guard**,
so no invalid invocation, and no invocation that provably cannot write, causes a branch to be cut.

**The placement is derived, not arbitrary.** Pure-argument refusals cost nothing and must precede any
act that touches the outside world, and the preflight is the **first such act**; the `parallel` posture
aborts nothing, so it stays adjacent to the guard.

### Step 3 — the preflight gate

The verdict dispositions, using `ptp-github-projects-gh`'s own verdict names:

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

**The stricter-than-eligible posture, stated as a decision.** **Every structural defect is now
writer-eligible**, and this gate STOPs on **all** of them — the whole class `ptp-backlog` says a writer
`SHALL NOT` refuse over. That definition stays where `ptp-backlog` states it and is not copied here. The
eligibility exists so the **repair** path stays reachable: `/ptp:backlog-edit` is the repair tool and
a refusal there would make a defect permanent. **The runner repairs nothing.** It consumes
**`status`** to compute the ready set, and the `malformed-entry` on `status` — which explicitly covers
an **unset or out-of-enum `status`** — corrupts exactly that **input**, not merely its output. A runner
that guessed past an unreadable `status` could take an epic that is not `ready`, or skip one that
is. `0036_01`'s own read-only view is already calibrated against this posture — it withholds
the ready set on the same problems "so that the view can never present a ready set that a backlog
runner would refuse to consume". Declining an eligibility that is granted is therefore the designed
behavior, not an oversight.

**Scoping note.** This gate runs **after** the branch guard, which may already have stashed the
working tree and cut a feature branch. **Every "nothing was written" claim from here on is scoped to
the backlog store**, and none of them is described as leaving the repository untouched. The **four**
aborting preconditions — steps 1, 2, 3a, and 3b — sit **before** the guard precisely to keep that
window as small as the ordering allows.

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

**The re-read re-reads the store, never the workspace binding.** Every recomputed read and its
ready-set computation, every write group, the `runBaseline` snapshot taken at the take, the
reconciliation diff, and each inline `ptp-full` use the **one workspace root bound in precondition
3a**. The mandated per-iteration re-read does **not** license re-resolving it: that re-read exists to
catch a mid-run hand edit to the **store**, whereas re-resolving the workspace would let a directory
change or a config edit arriving between epics repoint the board and the change-folder anchor
mid-loop.

Load-bearing, not an optimization, for two reasons — **mid-run defect detection** and the
**no-in-memory-model rule** — neither of which is about promotion:

> On a backlog holding three `ready` entries A, B, C, a `rounds:3` run
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

**A withheld ready set is not an empty one.** When the recomputed read runs under **degraded scope** —
the resolved transport cannot return archived items, so the ready set is **withheld** — the runner
**refuses at the top of that iteration**, naming **archived unreachability** as the cause, per
`ptp-backlog-write`'s degraded-scope dispositions. It **does NOT** classify the iteration as the
empty-recomputed-ready-set terminal state: reporting the backlog exhausted when it is merely unreadable
in part would be false. The empty-ready-set rung's own trigger is otherwise unchanged.

**This refusal is conditional on what the preflight record establishes, not a standing state of the
backlog.** Archive reachability is a property of the **resolved transport**, so under a transport that
returns archived items as complete entries the ready set is **not** withheld on this ground and the
refusal does not fire at all; under one that cannot, it fires on the run's **first** recomputation and
is therefore the run's terminal state, and the refusal says so — that the ready set is withheld for the
whole invocation rather than for this iteration, and what would lift it. A message worded for a
transient hiccup, repeated against a permanent condition, reads as a bug in the runner rather than a
limit of the transport. Neither wording is ever clean exhaustion.

## Loop-terminal states

These are this runner's own loop-terminal states. The review loop's terminal states are a different
contract, defined in `skills/ptp-review-loop/SKILL.md`.

**Five** loop-terminal states. Each is reported distinctly; none is ever a silent no-op.

| Terminal state | Trigger | Defect? |
|---|---|---|
| **store-write halt** | a store **write group** returned a verdict other than `complete` | **no** — a transport or concurrency failure, reported |
| **rounds exhausted** | the round cap was consumed; ready epics may remain | no |
| **under-supply** | fewer than the cap were processed and the recomputed ready set is empty | no — clean exhaustion, **unless** an `in-progress` entry lingers (below) |
| **halted** | an epic's `/ptp:full` did not converge | run halted; at most one per invocation |
| **store-defect halt** | a **mid-run** re-read failed `ptp-backlog` validation | **yes** — a store defect, mid-loop rather than pre-loop |

**Two former starvation states are gone**, and neither can recur: the ready set **is** the `ready`
entries, so "the ready set is empty **and** `ready` entries remain" is a contradiction and both
states were unsatisfiable.

### `halted` takes control-flow priority over rungs 2–4, which is what makes "exactly one" well defined

These are **not** independent predicates ORed together. They are read off the **one** way the run
reached its end — a loop exit, **or** a run-start ready set that was already empty, which reaches the
same classification without the loop ever iterating. The ladder, in full:

0. If a store **write group** returned a verdict other than `complete` → **`store-write halt`**.
1. Otherwise, if an epic's `/ptp:full` did not converge, the loop exits **immediately** at WRITE 2 and
   the state is **`halted`** — the cap and the ready set are **not consulted**. A `rounds:1` run whose
   single epic failed is `halted`, **not** rounds exhausted; a halt that happens to leave no `ready`
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
  no further `ready` epics. **But under-supply is not reported as clean exhaustion while an
  `in-progress` entry lingers**: its condition tests `ready` **only**, so a backlog whose sole
  remaining work is an entry left `in-progress` by an earlier crashed run satisfies it. That entry is
  un-reconciled work, not exhaustion — so when `ready` is empty and `in-progress` is not, the report
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
| **WRITE 0** | the epic was **not taken** and `ptp-full` was **not invoked**; whether a `runBaseline` was stranded on a **`ready`** entry; and that the stranded value is **inert** and the next take overwrites it — **except on `unresolved-commit`**, where the entry's status is **unknown**, both possibilities are named and neither asserted, no inertness and no next-take promise is made, and inspection is directed before any repair |
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

Emitted **after the ready set is computed and before the first epic runs**. Its **preamble** names the
**resolved workspace root** this invocation is bound to — in the preamble, never as a numbered item, the
list below neither gaining an item nor being renumbered. The list states all six of:

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
   pull request's own body** — a repository artifact, **outside the board**, and likewise **not undone by
   discarding the feature branch** (see `ptp-backlog-write`). This is a **live consequence of every run
   over such an entry, not an aside**: all three write points dispatch body-carried fields —
   `runBaseline` at the take, `changeEpics` and `attributionWarnings` at WRITE 1, the `runBaseline` clear
   and any `notes` line at WRITE 2. Such an entry is **taken and run like any other**: it is **not
   unwritable**, **not un-takeable**, and its take is **never refused** for its content type. The item
   discloses a consequence, never a limitation.

**This is an announcement, not a confirmation gate** — the run proceeds without waiting for user
input. **Judgment call recorded:** the counter-precedent is real, since `/ptp:full-apply` performs a
one-time scope confirmation on a no-arg invocation — but that stop exists because a no-arg
`/ptp:full-apply` has **unbounded** scope. Here the scope is bounded **twice**: by the round cap
(default 5) and by the store's own ready set. A reviewer who disagrees is disagreeing with a stated
choice, not discovering an omission.

## Recovery is inherited whole

Every one of the following is **`ptp-backlog`'s**, cited here and restated nowhere: the
**stale-`in-progress` definition**, the **change-prefix set**, **additive change-folder
reconciliation**, **the gate**, **the availability table**, **the disposition outcomes**, ***every
settling edit clears `runBaseline`***, and ***recovery never yields `done`***.

**The change-prefix set is storage-independent because it describes the workspace**, not the store. So
a board-backed backlog still snapshots and diffs **local change folders under `openspec/changes/`**,
scanned at the **one workspace root bound in precondition 3a**, and `diff = after \ runBaseline`
remains a diff between **two identically-defined sets taken at that one root**. That the set is
anchored at a resolved workspace root, and that every reconciliation names the root it scanned, are
`ptp-backlog`'s own, cited here and restated nowhere.

Only **three** facts are store-specific, and each is a rule applied rather than a new one:
`runBaseline` is **one serialized collection field**; it is **merge-written and therefore
pre-write-checked**; and it is emptied as a **field-value clear**.

## The terminal report

**Two vocabularies, one stated mapping.** `ptp-full-apply`'s three buckets describe **slices inside
one `/ptp:full` run**; the runner needs buckets describing **backlog epics across the invocation**.

**Four** backlog-level buckets.

| Backlog-level bucket | Meaning | Entry status |
|---|---|---|
| `processed` | the epic's `/ptp:full` converged end to end | `in-review` |
| `halted` | the epic whose `/ptp:full` did not converge and stopped the run, **or** whose post-`ptp-full` write group failed **whether or not its `/ptp:full` converged** (at most one per invocation) | nominally `blocked` — but the entry's **actual** status is printed wherever a write group failed |
| `take-failed` | the epic whose **take** write group did not complete | **unchanged by this runner** — normally `ready`; the entry's **actual** status wherever the take halted on a `status` pre-write-check difference; and **unknown, with both possibilities named and neither asserted**, where the take ended `unresolved-commit` |
| `never-started` | ready epics the invocation never reached (rounds exhausted or a halt) | unchanged `ready` |

**`processed` means the runner finished with the epic, not that the epic is finished.** Its entry is
`in-review`: converged, **unarchived**, and **uncommitted**. `/ptp:backlog-continue` is what settles it
to `done`.

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

**Entries already `backlog`, `in-review`, `done`, `cancelled`, or `blocked` before the invocation began are outside
the four buckets** — the invocation neither processed them nor could have reached them. They appear only where
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

The report names the **resolved workspace root** the invocation was bound to. That is a report
sentence, **not** a tenth required field: the required-field list below stays **nine**.

Alongside the buckets, the report carries **every one of these**:

1. the **terminal state** — one of the five;
2. the **effective** and **consumed** round counts;
3. the **branch name**;
4. the **remaining-ready count**, with the as-of-last-validated-read semantics below;
5. **every `attributionWarnings` prefix recorded this run**;
6. **every entry flagged attribution-unconfirmed**;
7. a restatement that **nothing was committed and nothing was archived** — and therefore that every
   epic in `processed` is `in-review` rather than `done`, awaiting `/ptp:backlog-continue`;
8. the **next-step pointers** — `/ptp:backlog` to view; `/ptp:backlog-edit <id>` to disposition a
   halted entry; **`/ptp:backlog-continue` to settle an `in-review` epic**; re-run `/ptp:backlog-run`
   once the halt or the remaining work is resolved;
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
processed. After a multi-round run that larger set's earlier members are already `in-review` in the last
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
