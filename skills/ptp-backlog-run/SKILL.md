---
name: ptp-backlog-run
description: Own the epic backlog runner behind /ptp:backlog-run — the rounds:{count} per-invocation token (default 5), the unwrapped outer-session execution contract under which the runner consumes zero Agent nesting levels and is never wrapped in a ptp-run-at-model main run (its own or per-epic), the recompute-after-every-epic loop over the ready set whose definition and deterministic order this skill does not own but references from ptp-backlog, the per-epic inline ptp-full skill invocation, the non-convergence halt gate, the two-write status write-back after the take (WRITE 1 records changeEpics and attributionWarnings, WRITE 2 persists the terminal status and clears runBaseline), the six loop-terminal states, and the three-bucket terminal report with each epic's ptp-full-apply per-slice report nested verbatim. Delegates the backlog file location, schema, IO protocol, validator vocabulary, change-prefix set, status transition table, and ready-set rule to the shared ptp-backlog skill, and the rounds: grammar mechanics to ptp-run-at-model's fast: switch section.
---

# ptp-backlog-run — run backlog epics through `/ptp:full`, one at a time

## Purpose

The epic backlog (`ptp-backlog`, `0036_01`) records the epics a user intends to build, in dependency
order. This skill is the contract for **executing** that backlog: taking ready epics one at a time,
running each through `/ptp:full`, writing the outcome back into `openspec/backlog.json`, and halting
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
   `codex.mode` resolution, the branch guard, every read and write of `openspec/backlog.json`, the
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

All four run in the outer session, in **exactly this order**:

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
3. **Resolve the `parallel` posture once** — see immediately below.
4. **Run the `ptp-branch-guard` preamble exactly once**, for the whole run, per that skill. Every epic
   in the invocation runs on that **one** feature branch. The guard is **not** re-run per epic and
   **no** branch is cut per epic.

**Both aborting preconditions — steps 1 and 2 — precede the branch guard**, so no invalid invocation
causes a branch to be cut.

### Step 3 — the `parallel` posture resolution

The runner resolves `parallel.mode` from layered ptp config **in the outer session**, accepting **no**
`parallel:` token of its own, and holds the resulting `on`/`off` posture **fixed for the whole
invocation** — **one resolution per run, never one per epic**, so every epic in an invocation behaves
identically. **That same posture value is supplied to every inline `ptp-full` invocation as that
skill's declared `parallel` input.**

This step **aborts nothing**: a missing or invalid config value resolves per the config reader's own
tolerant posture. Its position after the refusals is therefore immaterial to safety and is fixed here
only so that two implementations cannot order it differently.

## Backlog load and validation gate

After the branch guard, read and validate `openspec/backlog.json` **through the `ptp-backlog` skill**,
which owns the file location, the schema, the whole-file read-modify-write IO protocol, and the
validator.

- **Absent file, or a file holding zero epics** → **STOP**, reported as a clean **no-op with respect
  to `openspec/backlog.json`** — **not a defect** — pointing the user at `/ptp:backlog-add`.
- **Any problem the `ptp-backlog` validator reports** → **STOP**, naming that problem **by its
  `ptp-backlog` code**. Never guess past one. The validator's problem-code vocabulary is
  `ptp-backlog`'s and **none of it is reproduced here** — a partial copy would be exactly the
  enumeration drift this skill avoids everywhere else.

**The stricter-than-eligible posture, stated as a decision.** This gate STOPs on **all five** of
`0036_02`'s **writer-eligible structural defects** — the ones `0036_01` says a writer `SHALL NOT`
refuse over. That enumeration stays where `0036_02` states it and is not copied here. The
eligibility exists so the **repair** path stays reachable: `/ptp:backlog-edit` is the repair tool and
a refusal there would make a defect permanent. **The runner repairs nothing.** It **consumes** the
`dependsOn` graph to compute the ready set, so a defective graph corrupts its **input**, not merely
its output. `0036_01`'s own read-only view is already calibrated against this posture — it withholds
the ready set on the same problems "so that the view can never present a ready set that a backlog
runner would refuse to consume". Declining an eligibility that is granted is therefore the designed
behavior, not an oversight.

**Scoping note.** This gate runs **after** the branch guard, which may already have stashed the
working tree and cut a feature branch. **Every "nothing was written" claim from here on is scoped to
`openspec/backlog.json`**, and none of them is described as leaving the repository untouched. The two
aborting preconditions sit **before** the guard precisely to keep that window as small as the
ordering allows.

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

### Antichain reading note

**A reading note on `ptp-backlog`'s rule — not a rule of this skill, and it states a consequence
only.** Every entry in the ready set already has all of its predecessors satisfied, so the ready set
is an **antichain with respect to unmet edges**. Consequently **nothing constrains the order *within*
the ready set beyond whatever `ptp-backlog`'s own tie-break yields**, and this skill **adds no sort on
top of it**.

The note deliberately does **not** name or reproduce the tie-break's mechanism — go to `ptp-backlog`
for that — so it cannot go stale if that skill ever changes it. It is written down because an
implementer who misses it invents an intra-ready-set sort of their own.

## Recomputation — before every iteration

**Re-read *and* re-validate the file, and recompute the ready set and its order, before every
iteration of the loop** — not once up front. **Never carry an in-memory model of the backlog across
iterations.** A validation defect found on a mid-run re-read **halts the run** and reports every epic
processed so far (see *file-defect halt* below).

Load-bearing, not an optimization:

> On a fresh backlog holding the chain `BK-0001 ← BK-0002 ← BK-0003`, nothing is `done`, so a
> one-shot ready set contains only `BK-0001`. A `rounds:5` invocation would process exactly **one**
> epic and stop — **defeating "run epic after epic"**. Recomputing lets `BK-0001` reaching `done`
> promote `BK-0002` within the same invocation, and then `BK-0003`.

Recomputing loses nothing that `ptp-backlog`'s rule already guarantees: **that** rule is what makes a
ready set and its order deterministic for a given saved file — this skill claims no determinism of its
own — and each recomputation applies it to the file exactly as it then stands, the epic that just
finished having written its own status before the re-read.

**The detection claim is scoped, deliberately.** Re-reading rather than mutating an in-memory model is
what makes a mid-run hand edit **visible** — but only an edit **present at the mandated re-read** is
caught. `0036_01`'s IO protocol is whole-file read-modify-write **with no locking**, so an edit
arriving *after* that read and before the runner's next write may go undetected and be overwritten.
Re-reading shrinks the window to a single iteration; **it does not close it**, and nothing here claims
every mid-run hand edit is caught.

## Terminal states

**Six** loop-terminal states. Each is reported distinctly; none is ever a silent no-op.

| Terminal state | Trigger | Defect? |
|---|---|---|
| **rounds exhausted** | the round cap was consumed; ready epics may remain | no |
| **under-supply** | fewer than the cap were processed, the ready set is empty, and **no `pending` entries remain** | no — clean exhaustion, **unless** an `in-progress` entry lingers (below) |
| **blocked-predecessor starvation** | the ready set is empty, `pending` entries remain, and **every** remaining `pending` entry **transitively reaches** a `blocked` or `in-progress` entry through unmet `dependsOn` edges | **no** — the designed consequence of `ptp-backlog`'s satisfaction rule for a `blocked` predecessor; **not a file defect** |
| **structural starvation** | the ready set is empty, `pending` entries remain, and at least one remaining `pending` entry reaches **no** `blocked`/`in-progress` entry through its unmet edges | **yes** — but unreachable on a validated file; see below |
| **halted** | an epic's `/ptp:full` did not converge | run halted; at most one per invocation |
| **file-defect halt** | a **mid-run** re-read failed `ptp-backlog` validation | **yes** — a file defect, mid-loop rather than pre-loop |

### `halted` takes control-flow priority, which is what makes "exactly one" well defined

These are **not** independent predicates ORed together. They are read off the **one** way the run
reached its end — a loop exit, **or** a run-start ready set that was already empty, which reaches the
same classification without the loop ever iterating. The ladder, in full:

1. If an epic's `/ptp:full` did not converge, the loop exits **immediately** at WRITE 2 and the state
   is **`halted`** — the cap and the ready set are **not consulted**. A `rounds:1` run whose single
   epic failed is `halted`, **not** rounds exhausted; a halt that happens to leave no `pending`
   entries is `halted`, **not** under-supply.
2. Otherwise, if the round cap was consumed → **rounds exhausted**.
3. Otherwise, if a mid-run re-read failed `ptp-backlog` validation → **file-defect halt**.
4. Otherwise the loop exited on an empty recomputed ready set, and exactly one of **under-supply**,
   **blocked-predecessor starvation**, or **structural starvation** applies.

The step-4 trio is evaluated **whenever** the recomputed ready set is empty — at run start and at
every recomputation alike.

### The file-defect halt is the mid-run counterpart of the load-and-validate STOP

The file is re-validated at the top of **every** iteration, so **the same defect can end a run that
already processed epics**. When it fires mid-loop it is its **own classified outcome**, occupying its
own rung of the ladder above rather than being reported only as a pre-loop STOP. It reports the
defect **exactly as the pre-loop STOP would**, **plus every epic processed so far**. Because the
re-read sits at the **top** of an iteration — after the previous epic's WRITE 2 — **no epic is ever
in flight when it fires**, so it leaves **no `in-progress` entry of the runner's making**.

### The classification question is mechanical

*Following unmet `dependsOn` edges from each remaining `pending` entry, does **every** one of them
reach a `blocked` or `in-progress` entry?* Never a judgment call.

**Reachability is transitive, not direct-edge** — the one thing an implementer will get wrong. On the
chain `BK-0003 → BK-0002 → BK-0001` with `BK-0001` `blocked` and the other two `pending`, `BK-0003`'s
only unmet edge points at a **`pending`** entry. A direct-edge test would say `BK-0003` is not
blocked-predecessor-starved while structural starvation does not describe it either — the chain would
match **no terminal state at all**, a silent classification hole. Transitive reachability closes it:
both `BK-0002` and `BK-0003` are blocked-predecessor-starved, and `BK-0001` is the blocking entry.

**Cycles never reach this classification.** A defect in the `dependsOn` graph, a cycle among them, is
a `ptp-backlog` validation problem, so the load-and-validate gate STOPs on it — at run start and at
every re-read alike — **before** any starvation classification runs. **Structural starvation is
therefore not defined in terms of cycles**; it is the exact **complement** of blocked-predecessor
starvation.

**Structural starvation is unreachable on a validated file, and the argument is worth carrying.** The
residual graph is finite and acyclic and every edge resolves, so following unmet edges from any
non-ready `pending` entry **must terminate** — and it can only terminate at an entry with no unmet
edges (which would be *ready*, contradicting an empty ready set) or at a `blocked`/`in-progress`
entry. Hence every remaining `pending` entry reaches one, which is exactly blocked-predecessor
starvation. Structural starvation survives as **defence in depth** for the case where that premise
fails — a validator that missed a defect, or a hand edit racing the re-read — and reaching it is
reported as an **internal validator/runner inconsistency**, naming the offending entries and their
unmet edges and pointing at `/ptp:backlog-edit`, **never** as ordinary user error.

**No precedence rule between the two starvation states exists or is stated**: they are complementary
by construction ("every remaining entry reaches one" vs "some entry reaches none"), so **they cannot
both hold**.

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
- **blocked-predecessor starvation** — the blocking entries **and their statuses**, and a pointer to
  `/ptp:backlog-edit`. The statuses are required because the label understates its own condition: it
  fires on an **`in-progress`** predecessor as readily as a `blocked` one, and only the printed status
  distinguishes the two cases for the reader.
- **structural starvation** — the offending entries and their unmet edges, the statement that this
  state should be unreachable on a validated file, and a pointer to `/ptp:backlog-edit`.
- **halted** — the halted epic and the terminal state that halted it (see *Terminal report*).
- **file-defect halt** — the defect, named by its `ptp-backlog` code, **plus every epic processed so
  far**.

Blocked-predecessor starvation is a **loop-terminal state, not a pre-loop STOP**: it can fire after
epics have already been processed, so it emits the full three-bucket terminal report rather than a
bare message.

## The pre-run blast-radius announcement

Emitted **after the ready set is computed and before the first epic runs**, stating all five of:

1. the **effective round cap and its source** — the default, or the `rounds:` token;
2. the **feature branch** every epic will land on;
3. the **projected epic list** — the currently-ready epics in order, up to the cap — explicitly
   labelled a **projection**, because recomputation may promote epics that are not ready yet;
4. the blast radius in plain words: **all of this lands on this one branch, uncommitted and
   unarchived; this command never commits, pushes, merges, archives, or deploys**;
5. what the user must do afterwards: review the branch, run `/ptp:archive <id>` per fully-processed
   slice, and ship manually.

**This is an announcement, not a confirmation gate** — the run proceeds without waiting for user
input. **Judgment call recorded:** the counter-precedent is real, since `/ptp:full-apply` performs a
one-time scope confirmation on a no-arg invocation — but that stop exists because a no-arg
`/ptp:full-apply` has **unbounded** scope. Here the scope is bounded **twice**: by the round cap
(default 5) and by the file's own ready set. A reviewer who disagrees is disagreeing with a stated
choice, not discovering an omission.

## The write protocol

Three durable writes per epic, through `ptp-backlog`'s IO protocol. The protocol's name — *two-write
write-back* — counts the **two writes that follow the take**; WRITE 0 is the take itself.

**The per-write field lists below name only the fields this skill decides; they are not the complete
set of fields a write touches.** Each of the three is an ordinary `ptp-backlog` write, so it carries
that skill's writer obligations unchanged — in particular the `updatedAt` bump every writer owes on
**the entry it actually changed**. The rule, its format, and its scoping are `ptp-backlog`'s IO
protocol's and are **cited here, not restated**.

### WRITE 0 — take the epic

**The epic taken is the *first* entry of the recomputed ready set** — first in the order
`ptp-backlog` defines, which this skill consumes and never re-sorts (see *Antichain reading note*).
One entry per iteration, never a batch.

Set `status: in-progress` **and** store `runBaseline` in **one single durable write**, **before**
`ptp-full` is invoked. A crash after this point is reconcilable; a crash before it leaves
`openspec/backlog.json` unchanged — scoped to that file, per the *Scoping note* above, since the
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
and WRITE 2 a perfectly healthy in-flight run presents **byte-identical on-disk state** to a crashed
one, and v1 has **no multi-writer locking** to tell them apart. `0036_01` words its stale flag
conditionally and `0036_03` words its gate refusals the same way; this runner is the component that
*creates* that ambiguity, so **no sentence here asserts that a lingering baseline proves a crash**.
The invariant states what a lingering baseline *means* once no run is live — never a claim the file
can tell.

**`notes` handling: append, never replace.** The runner appends **one** line and never replaces
existing content, and it **writes `notes` nowhere else**. `notes` is user-facing free text; clobbering
it would destroy the user's own record. A dedicated per-attempt terminal-state field is a v2 seam
belonging to `0036_01`'s schema, not something this skill invents.

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

## The terminal report

**Two vocabularies, one stated mapping.** `ptp-full-apply`'s three buckets describe **slices inside
one `/ptp:full` run**; the runner needs buckets describing **backlog epics across the invocation**.

| Backlog-level bucket | Meaning | Entry status |
|---|---|---|
| `processed` | the epic's `/ptp:full` converged end to end | `done` |
| `halted` | the epic whose `/ptp:full` did not converge and stopped the run (at most one per invocation) | `blocked` |
| `never-started` | ready or pending epics the invocation never reached (rounds exhausted, the halt, or an unmet dependency) | unchanged `pending` |

**`applied (review pending)` is deliberately not reused at backlog level** — it is a per-slice state
with no epic-level meaning; a backlog epic is either finished, the one that halted, or untouched. It
appears **only** inside an epic's nested per-slice report.

**Entries already `done`, `cancelled`, or `blocked` before the invocation began are outside the three
buckets** — the invocation neither processed them nor could have reached them. They appear only where
a terminal-state report names them (the blocking entries and their statuses under blocked-predecessor
starvation, or a lingering un-reconciled `in-progress` entry under under-supply).

### Nesting the per-slice reports

Each **`processed` or `halted`** epic's own `/ptp:full` output is kept **verbatim and nested
underneath** its backlog row — `ptp-full-apply`'s three per-slice buckets unrenamed and
unreinterpreted, **with the per-slice resume hints surviving intact** (`/ptp:review-full <id>` for an
`applied (review pending)` slice, `/ptp:full-apply <ids…>` for the `never-started` tail). The runner
**adds a layer; it does not redefine the existing vocabulary**.

**Four row shapes have no `ptp-full-apply` three-bucket output to nest, and each says so under its own
label rather than fabricating buckets:**

- **`never-started`** — the epic ran **no** `/ptp:full` at all. Its row carries the entry id, its
  title, and the reason it was never reached (cap consumed, the run halted, or an unmet dependency).
  **No fabricated empty report.**
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

1. the **terminal state** — one of the six;
2. the **effective** and **consumed** round counts;
3. the **branch name**;
4. the **remaining-ready count**, with the as-of-last-validated-read semantics below;
5. **every `attributionWarnings` prefix recorded this run**;
6. **every entry flagged attribution-unconfirmed**;
7. a restatement that **nothing was committed and nothing was archived**;
8. the **next-step pointers** — `/ptp:backlog` to view; `/ptp:backlog-edit <id>` to disposition a
   halted entry; re-run `/ptp:backlog-run` once the halt or the remaining work is resolved.

**The remaining-ready count is always as of the last successfully validated read, and says so.** It is
**never presented as freshly computed at report time**, and the two exits that leave the loop at
WRITE 2 need **different** corrections — collapsing them is the trap:

- **on a non-convergence halt** — the last validated read **less the epic just halted**. Nothing more:
  that epic became `blocked`, and per `ptp-backlog`'s satisfaction rule a `blocked` entry never
  satisfies an edge, so it can have promoted no dependent.
- **on `rounds exhausted`** — subtracting is **wrong**, because the epic reached `done` and per that
  same rule `done` **does** satisfy its dependents' edges. Take the last validated read, apply the
  runner's **own** WRITE 2 status change to it, and **recompute** the ready set over that snapshot
  using `ptp-backlog`'s rule. Otherwise the chain `BK-0001 ← BK-0002` under `rounds:1` would report
  **0** remaining ready at the very moment `BK-0002` became ready — the report suppressing the one
  fact it exists to convey. This is a **report-time derivation over a validated snapshot plus a write
  the runner itself made**, not the in-memory model the loop forbids.
- **on a file-defect halt** — the count from the last read that validated, **explicitly marked stale**
  with the defect named. **The `never-started` rows take that same last-validated-read basis** and are
  likewise marked stale rather than omitted — omitting them would silently shrink the report exactly
  when the user most needs to see what was left untouched.
- **on the empty-ready-set exits** (under-supply and the two starvation states) no correction is
  needed at all: they exit at the top of an iteration on a fresh read.

Both corrected counts are **labelled as of that read** and are therefore **stale with respect to any
concurrent edit**.

**There is no `unavailable` case.** A validated read always exists: the loop is entered only after the
pre-loop load-and-validate gate passed, and a file-defect halt is by definition a **mid-run** re-read
failure — a pre-loop failure is the load-and-validate STOP, which emits no bucket report at all. So
the count is always available, merely stale; inventing a fresh number would be the one place this
report could quietly lie.

**A partial run is never presented as success.**

## No fan-out — which level is forbidden, and which is untouched

Two levels of parallelism exist here and conflating them would silently regress `/ptp:full`:

- **Across backlog epics — FORBIDDEN.** `ptp-parallel-fanout`'s first safety condition is provably
  disjoint write sets, and it fails **structurally** here: backlog epics write shared source *and*
  carry dependency edges on each other. The runner processes **one epic at a time**, never
  concurrently, and accepts no `parallel:` token. The second epic is not started until the first has
  reached WRITE 2.
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
- **Never restate a grammar mechanic owned by `ptp-run-at-model`, a ready-set or ordering rule owned
  by `ptp-backlog`, or that skill's validator vocabulary, change-prefix set, or transition table** —
  cite them.
