---
name: ptp-backlog-write
description: Own how a backlog write is dispatched onto the board and what a partial failure means
---

# ptp-backlog-write — how a backlog write is dispatched, and what a partial failure means

## Purpose

`ptp-backlog` owns **what the store holds** and **which transitions are legal**. It does not, and
cannot, own **how a write reaches a GitHub Projects board**, because that question did not exist while
the backlog was one JSON document a writer replaced whole. This skill is that place.

It is the single source of truth for the **ordered write sequence** with `status` last, the
**status-commit invariant** that replaces atomicity, the **two re-read rules**, the **write journal**
with its outcomes and terminal verdicts, **fail-stop with no compensating writes**, the
**ambiguous-create scan**, and the **orphan refusal**.

It **delegates** and restates nothing of:

| Concern | Owner |
|---|---|
| the schema, its canonical field order, and the entry model | `ptp-backlog` |
| the validator, its problem codes, and writer eligibility | `ptp-backlog` |
| the status transition table and every guard | `ptp-backlog` |
| the recovery-and-reconciliation machinery, the stale definition, the change-prefix set, the gate, the availability table, the dispositions, *every settling edit clears `runBaseline`*, and *recovery never yields `done`* | `ptp-backlog` |
| the field mapping onto board carriers, the identity rule, and the read path | `ptp-backlog` (`0042_03`'s read contract) |
| **the transport and its invocation mechanics** — argument construction, exit-code classification, output parsing and the stderr surface — the `backlog.*` keys, the acting identity and the `gh` surface, and the **capability preflight with its three verdicts** and its record | `ptp-github-projects-gh` — **the `gh` transport contract** |

This skill is a **pure prose contract**. It states obligations; it **performs none of them**. It reads
nothing on its own, writes nothing, runs no git command, and edits nothing.

## Section index

Operation-scoped sections of this contract live in `references/`, each loaded on its own
trigger rather than with this file:

- `skills/ptp-backlog-write/references/the-ordered-write-sequence.md` — loaded when dispatching the existence, payload and commit stages of a write.
- `skills/ptp-backlog-write/references/field-planning-carrier-dispatch.md` — loaded when planning which fields a write touches.
- `skills/ptp-backlog-write/references/compose-from-a-fresh-read.md` — loaded when composing a carrier write.
- `skills/ptp-backlog-write/references/inherited-same-write-clauses.md` — loaded when resolving an inherited in-the-same-write clause.
- `skills/ptp-backlog-write/references/the-six-terminal-verdicts.md` — loaded when reporting the terminal verdict of a write group.
- `skills/ptp-backlog-write/references/the-board-scan.md` — loaded when scanning the board after an ambiguous create.
- `skills/ptp-backlog-write/references/the-write-journal.md` — loaded when recording the per-field write journal.
- `skills/ptp-backlog-write/references/the-orphan-repair.md` — loaded when repairing an orphaned board item.
- `skills/ptp-backlog-write/references/the-unresolved-create-repair.md` — loaded when repairing an unresolved create.
- `skills/ptp-backlog-write/references/rate-limits-and-ambiguity.md` — loaded when handling a rate limit or a timed-out call.
- `skills/ptp-backlog-write/references/ambiguous-creation.md` — loaded when deciding whether an ambiguous creation happened.

## The constraint

The store's **write surface is the `gh` CLI**, whose transport, invocation mechanics, capability
preflight and verdicts are **`ptp-github-projects-gh`**'s — *the `gh` transport contract* — and are cited
here, never restated. Every concrete invocation named in this file is built through it.

Three **verified backend facts**, recorded rather than assumed and each bound to its source. All three
were verified at **`gh` 2.89.0**:

1. **`gh project item-edit`'s field-value route** updates **exactly one field value per invocation**.
2. **`gh project item-create`'s only *content* inputs are `--title` and `--body`**, so it writes **no
   field value**. It is *not* the case that the command takes only those two flags — it is addressed by
   a positional project number plus `--owner` and accepts the output-format flags, both of which the W1
   invocation below passes. The load-bearing fact is narrower and exact: **no field value can ride the
   create.**
3. GraphQL's `updateProjectV2ItemFieldValue` sets **one field of one item** per mutation, and root
   mutation fields execute **serially, with no transaction and no rollback**, so a mid-document
   failure leaves earlier mutations applied.

**A fourth backend fact is recorded by CITATION rather than verified here.** The `gh` transport contract
admits a **content mutation** — `updateIssue` / `updatePullRequest` over `gh api graphql` — which writes
a non-draft item's content **title and/or body in one mutation** (both inputs are optional there, which is
what the send-set rule below turns on), addressed by the **content node id**. Its
verification provenance, its closed scope, its argument construction and its emission rules are **that
contract's** and are cited here, never restated. It carries **no** whole-document write either, so the
conclusion below is untouched by it: it widens **which objects** a title/body write can reach, not
**how much** any one write can carry.

**The conclusion is a consequence of those three, not an assertion beside them: there is no
whole-document write on this store at any layer under any client.** A write is therefore
**necessarily many dispatches**, and the **dispatch-ordering** derivation below follows from that and
from nothing else.

**That last clause is scoped, deliberately.** It grounds the *dispatch ordering* it was written for and
nothing wider: this contract records **further** verified backend facts further down — the joint
dispatch of the title and body carriers, the draft-content prefix check on the title/body route, and the
enumeration limit of the board scan — each carrying its own evidence. So the clause is no longer a claim
to be the sole ground of everything in this file.

## The unit — one operation

An **operation** is **one write group**: one pre-dispatch snapshot, one journal, one ordered
sequence, and **at most one** `status` write.

**One command invocation may execute one or more operations, sequentially.** Each carries its own
snapshot, its own journal and its own commit, and each is reported in its own right. A caller that
must settle **N** entries executes **N operations**; what it may **not** do is assemble **one**
operation carrying N commit writes.

The distinction between *operations per invocation* (unbounded) and *commits per operation* (at most
one) is stated explicitly because the backstop refusal below constrains only the second.

## `status` last — the answer, stated once

> **`status` is the only field that *publishes a transition* in the backlog state machine** — the field
> the ready set, every guard's *from* row, writer eligibility's status checks, and the runner's take all
> key on to decide **what state an entry is in**. It is written **last**, so that **an entry never
> advertises a state its supporting fields do not yet back.**

**The precise version, immediately, because the overbroad one is false.** `status` is **not** the only
decision-bearing field: `runBaseline` is read by the stale-`in-progress` flag, the recovery gate, and
reconciliation's diff. That is not a counterexample — it is the **reason** for the order. Those fields
are **inputs** a decision procedure consults *once it knows the entry's state*, whereas `status` is what
**selects** the procedure. So every decision-bearing payload field lands before the commit, and
`status`-last is what makes the inputs already correct at the moment the state becomes observable.

**W1 → W2 is physics, not policy:** nothing can be written onto an item that does not exist. The second
half of that old argument — *an item carrying no `id` is unaddressable* — is **deleted**: the item's node
id **is** its address, and it exists the moment the item does.

## The status-commit invariant

> **No `status` write is dispatched until every payload row of the operation has reached its intended
> value.**

**"Reached its intended value"** means the row's outcome is `landed`, `landed (verified by re-read)`,
**or `skipped-identical`**. A skipped row's value is *already* correct on the board, which is exactly
what the commit needs; requiring every row to have *landed* would forbid the commit on any operation
that left one field unchanged. What the invariant **forbids** is committing over a row that is
`failed`, `not-dispatched`, or `unresolved`.

Two consequences:

1. **A partial failure never advances an entry's status.** Scoped, deliberately, as *this operation
   committed no transition* — **never** as *the entry is certainly still where the snapshot saw it*,
   because the pre-write check is a **detector and not a lock**. And scoped **inline to exclude
   `unresolved-commit`**, which is the one verdict on which the `status` write may in fact have landed:
   on that verdict the entry's status is **unknown** and this consequence does not apply. Stating the
   exception here keeps this sentence from being an absolute that the verdict table then has to
   contradict.
2. **A committed-partial state is unreachable by construction** — nothing is dispatched after the
   commit stage, **W3**.

**The backstop refusal keeps consequence 2 a derivation.** It holds only while there is **at most one**
`status` write per operation, so that is pinned:

> An operation that would write `status` on **more than one** entry is **refused before W1**, as an
> **upstream contract violation**, and is reported as such rather than as an ordinary refusal.

The backstop constrains the **shape of an operation**. It does **not** constrain the number of entries
an invocation may ultimately settle, which it settles as that many sequential operations.

## What is honestly lost

The file store guaranteed that **no intermediate state existed at all**. Here an intermediate state —
payload fields updated on an entry whose status is unchanged — is **observable** on the board.

**The guarantee is downgraded from *invisible* to *inert and reported*.** This contract claims exactly
that and no more. It is **not** equivalent to atomicity and is never described as such.

## Every recognized field is emitted — the store counterpart

The inherited rule — **and it is quoted here to be scoped, never to be applied as it stands** — is that
an **empty** value is written as a **field-value clear**, never as an empty string, so the board shows
an empty cell rather than a literal `""` that the read path would then have to disambiguate. Read
unscoped it would route a **body**-carried empty value through `--clear`, which is exactly what the next
paragraph forbids, so **no reader may stop at this sentence**.

**The rule is therefore scoped by carrier, because on this transport an unscoped reading contradicts the
mapping.** Every mandatory `runBaseline` clear — the one a settling edit performs, and the one
`/ptp:backlog-continue`'s resume write performs — rides the **body**, not a board field. So:

- on a **board-field** carrier the rule **survives verbatim**, and is presently **vacuous**: `Status` is
  the only such carrier and is **never written empty**, so this contract dispatches **no `--clear` at
  all in v1**. `--clear` is **reserved** for a future ptp-owned board custom field, and nothing here
  adds one;
- on the **body** carrier a "clear" is the **block key emitted with its empty value inside the composed
  body**, dispatched through the joint title/body route like every other body row — **not** a `--clear`
  invocation. How that empty value is represented is the **field mapping's** and is `ptp-backlog`'s,
  cited here and **not restated**.

**The backend reason the two cannot be blurred, on BOTH title/body routes:** on the **draft** route
`gh project item-edit` tests `--clear` **before** it takes the title/body route, so a `--clear`
invocation would never reach the draft mutation at all; and on the **content-mutation** route there is
**no clear flag at all** — the admitted mutation carries a title and a body and nothing else. So on
**neither** route can a body-carried clear be expressed as one. A body-carried clear routed through
`--clear` would therefore not be a slower way of doing the same thing — it would write **nothing the body
needs** and would target a field value that does not exist. **The board-field rule above and its vacuity
are unchanged by the second route**, which writes no field value.

The inherited canonical-write rules resolve, each explicitly, as one of three things:

| Inherited rule | Resolution |
|---|---|
| document-level canonical form — indentation, trailing newline, line endings, BOM | **inapplicable** — there is no document |
| ordering | **survives, per field value** — a serialized collection's contents remain a deterministic function of the logical state |
| unknown-key preservation | **satisfied vacuously, and thereby more strongly** — a board field the mapping does not recognize is **never written** and therefore never lost |

None of the three is silently inherited; each is resolved above. (Inside the item **body** the vacuous
argument does **not** reach, and preservation is discharged **actively** — see *A carrier write is
composed from a fresh read of the carrier*.)

## The pre-dispatch snapshot

Immediately before the first dispatch — **after** every **static** refusal check and **before** any
write — re-read through `0042_03`'s read path.

***Static* means decidable without reading the store**: the argument grammar, an empty request, an
unrecognizable mutation. Every **state-derived** check is the opposite case: it is **evaluated on** the
snapshot, so it necessarily comes after it, and it **may still refuse**. There is therefore no ordering
paradox between *after every refusal check* and *every decision binds to the snapshot* — static refusals
precede it, state-dependent ones are computed from it.

The snapshot reads:

- **every pre-existing item the operation will write to, in full** (a creation's own subject item does
  not exist yet and is represented by its composed intended values until W1); and
- the **pre-existing match set** for the intended creation payload, when the operation **creates** an
  item.

**No snapshot reads the store in order to allocate an identifier**, none being allocated. The creation
**match-set census** is a different read with a different purpose and is unchanged.

**Every decision of the operation binds to this snapshot and to no earlier one** — writer eligibility,
the transition-table check, the recovery gate, reconciliation's diff, and the availability table.

### The degraded-scope dispositions

`0042_03` defines a state in which the transport can enumerate board items but **cannot return archived
ones**. It raises **no problem code** and the read still proceeds, but it **withholds exactly one
thing**: **the ready set**. Archive reachability is established **only** from
`ptp-github-projects-gh`'s preflight **record** (its `archiveReachable` fact) and is **never** inferred
from the result set.

The dispositions are **derived from what is withheld, by the single rule *a writer refuses iff it
consumes something withheld*** — not enumerated by taste:

| Writer | Under degraded scope | Because |
|---|---|---|
| `/ptp:backlog-add` | **proceeds** | it allocates no id and consumes no ready set |
| `/ptp:backlog-run` | **refuses at the top of the iteration** | it consumes the ready set, which is withheld. **A withheld ready set is NOT an empty one** |
| `/ptp:backlog-edit` | **proceeds** | it allocates no id and consumes no ready set |
| `/ptp:backlog-continue` | **proceeds** | likewise |

Each refusal **names archived unreachability as the cause**. **No writer is given a degraded *write*
path.**

### The snapshot's two distinct failure modes

Both are reachable and they route to different terminal states, so they are kept apart **by trigger**,
not merely ordered:

- **A snapshot that *completes* and yields a document with a *fatal* problem is a store defect.**
  Nothing is dispatched, and the defect is reported through the **inherited problem vocabulary** — in
  the runner it is a **`store-defect halt`**, **never** a write failure, since naming the transport for
  a defect in the **data** misdirects the repair.
- **A snapshot that *cannot be completed* is the transport case**, and it is governed by the rule below.
  A write group's own pre-dispatch snapshot is covered by exactly the same rule as any other mid-run
  re-read.

**The incompletable rule, stated generally.** A snapshot read **may be retried within a bounded
budget**, ambiguous or not, because **a read is idempotent and cannot half-apply**. On exhausting that
budget the operation **halts before any write**: nothing is dispatched, every plannable row is
`not-dispatched`, the verdict is **`refused`**, and the report names **which read could not be
completed** rather than a difference or a decision it never made. An **unestablishable creation match
set** is an **instance** of this rule, not a separate provision.

## The pre-write field check

Required for exactly **two categories** and no others, and **only on items the snapshot could read**.
Immediately before dispatching such a write, re-read **that one field of that one item** and require it
to equal the **snapshot's** value.

| Category | Fields | Why checked |
|---|---|---|
| **merge-written collections** | `changeEpics`, `attributionWarnings`, `runBaseline` | each lives in **one serialized field value**, so appending to one is a field-scoped read-modify-write, and a blind overwrite would silently drop a concurrent hand edit |
| **the commit field** | `status` | the only field whose stale read can produce a **wrong transition** |

**`runBaseline` has a second and decisive reason, recorded separately so the check is not removed
later.** Nothing *appends* to `runBaseline`, so the lost-update argument alone would not put it in the
first row. It is checked because the **stale flag, the recovery gate, and reconciliation's diff all read
it**, so a stale read can invert a **disposition** exactly as a stale `status` inverts a **transition**.

**The check's two outcomes:**

- **On any difference** — the write is **not dispatched**, the operation **halts at that row**, and the
  report names the **field**, the **snapshot's value**, and the **value found**. Verdict `refused` when
  nothing had been dispatched, otherwise `uncommitted-partial`.
- **On a verification read that cannot itself be completed** — the read may be **retried within a
  bounded budget**; on exhausting it the operation halts **before** the target write, that row is
  `not-dispatched`, and the report names the field and the fact that its **verification read** could not
  be completed — **never a difference it did not observe** — with the same two verdicts.

**Fail-closed is the only safe direction**, because proceeding with an unverified write to a checked
field is precisely the blind write this rule exists to prevent.

## Why there is no third check

Every surviving schema field falls in **exactly one** of four buckets:

| Bucket | Fields |
|---|---|
| **checked** — merge-written collections | `changeEpics`, `attributionWarnings`, `runBaseline` |
| **checked** — the commit field | `status` |
| **written, excluded from the check, with the reason recorded** | `title`, `description`, `notes` — outright-set scalars, **set not merged** by a writer the user already authorized, which **cannot invert a decision** because no decision procedure reads them |
| **never written** — so no check can apply | `id`, the item's own node id, and the two board-owned stamps `createdAt`, `updatedAt` — all three having **no writable carrier** |

The four buckets sum to the mapping's **ten** fields — 3 + 1 + 3 + 3 — so a later reviewer can find **no
uncategorized field** on which to hang a third check.

**`id` is in the never-written bucket, not the written-but-excluded one.** Its former justification —
that it had no snapshot value because it was written onto an item this same operation had just created —
does **not** carry forward: it is now excluded for the stronger reason that it is **never written at
all**.

**The fourth bucket is not an exclusion.** An *excluded* field is one this writer may write **blind**;
these **three** are fields it may **not write at all**. One consequence follows and is recorded rather than left
implicit: the inherited obligation to bump the modification stamp **only on entries the operation
actually changed** is discharged **by the board**, which stamps exactly the item a write touched — so
the obligation holds with **no write of ours**, and this contract adds none.

## The created item is outside the check entirely

An item **this operation created** is outside the check, and the **load-bearing** reason is that
**the snapshot could not read it, so there is no snapshot value to compare against**.

**What is not claimed, because it would be false:** that no other actor knows the item exists. W1 puts a
**visible card** on the board and a human **can** edit it. The weaker, true statement is that no other
actor has had reason to touch an item this operation created moments ago, and any that does falls under
the attestation below like every other concurrent-edit hazard.

This is the *never a blind write* obligation discharged **vacuously** — on an item created moments ago
there is **no prior value** and therefore **no update to lose** — and **not a second exemption**.

**No substitute check is invented.** Comparing the live field to its *intended* value would halt every
creation at its first checked write; comparing it to a "just created" baseline would require restating
the mapping this contract must not restate.

## The check is not a lock

A **one-round-trip window** remains between the check and the write. `ptp-backlog`'s no-locking stance
is inherited unchanged, and its attestation rule extends by **exactly one clause**:

> **Invoking a backlog writer is the user's attestation that no human is concurrently editing the
> board**, and the pre-write check is a best-effort **detector** layered on that attestation — never a
> substitute for it. **On a non-draft entry the concurrently-edited surface includes the repository
> object itself** — a bot, a template or a maintainer editing that issue's or pull request's title or
> body — and the compose-from-a-fresh-read rule is what preserves such an editor's text.

**No sentence of this contract describes the check as preventing, serializing, or excluding a concurrent
edit.**

## The board does not enforce the transition table; ptp's writers do

A human dragging a card between columns performs a transition **no guard saw**. ptp neither prevents it
nor claims to: **the table constrains ptp's writes.**

The consequence that makes the check load-bearing: each guard's *from* row is evaluated against the
**snapshot**, and the pre-write check on `status` is what stops ptp committing a transition whose *from*
row the board has since invalidated.

The transition table and its guards are **`ptp-backlog`'s**: the table is not reproduced here, no guard
is restated, and **no new guard is added**.

---

# The journal, the outcomes, the verdicts, and fail-stop

## The six outcomes — exhaustive and mutually exclusive

| Outcome | Meaning |
|---|---|
| `landed` | dispatched and acknowledged |
| `landed (verified by re-read)` | the response was **ambiguous** and a re-read (or, for W1, the board scan) found the intended value present |
| `skipped-identical` | the intended value already equalled the **confirmed current value**, so nothing was dispatched |
| `failed` | see the three cases below |
| `not-dispatched` | never sent |
| `unresolved` | dispatched, the response was **ambiguous**, and verification could **not** settle whether it landed |

**`failed` covers three things, and the third is easy to miss:**

1. dispatched and **rejected**;
2. an unambiguously **pre-application** failure whose **bounded retries were exhausted** — a connection
   refused, a DNS failure, a rate-limit response that performed no mutation. The write **provably never
   reached the store**, so `failed` is the honest row and `unresolved` would over-report doubt the
   operation does not have;
3. **ambiguous** with a re-read showing the value **absent**.

**The two awkward boundaries, stated explicitly:**

- A **pre-write-check difference**, or an **incompletable verification read**, halts **before**
  dispatching, so that row is `not-dispatched` and **never** `failed` — `failed` requires a write to
  have been **sent**. **And the halt propagates BACKWARDS across the halting row's dispatch as well as
  forwards**: a carrier is unwritable in part, so **every other non-`skipped-identical` row of that
  dispatch is `not-dispatched` too, whatever its ordinal**. Without that, an earlier sibling whose own
  check passed would carry **no outcome at all** and the partition would not be exhaustive — which is
  **more** true under the joint title/body dispatch, not less.
- An **ambiguous write whose verification could not settle** is `unresolved` and **never** `failed`,
  which would assert it did not land.

**`unresolved` is what keeps the claim exhaustive rather than nearly exhaustive.** A field write is
resolvable by re-reading its one field *so long as that read succeeds*; when it does not, this outcome is
the honest floor.

`not-dispatched` therefore covers, exactly: the row at which the operation halted; every other
non-`skipped-identical` row of **that same dispatch**; and every non-`skipped-identical` row of a
**later dispatch** than the one that halted or first returned `failed`/`unresolved`.

## `skipped-identical` and the pre-write check are decided together

For a **checked** row the check runs before the **decision**, not merely before a dispatch. Otherwise a
row could be marked `skipped-identical` off the **snapshot alone**, a concurrent edit after the snapshot
would go undetected on exactly the fields the check exists to protect, and the operation would still
commit.

| re-read vs snapshot | re-read vs intended | Outcome |
|---|---|---|
| **differs** | — | **halt** — the write is not dispatched; that row is `not-dispatched` |
| equals the snapshot | **equals** intended | `skipped-identical` |
| equals the snapshot | differs from intended | **dispatch** |

**"Current value" has three sources, named per row kind, which is the point — "current" is otherwise
ambiguous exactly where it matters:**

- a **checked** row: the **re-read**;
- an **unchecked** row: the **snapshot's** value;
- a row targeting the item this operation **created**: **neither source exists**, so the row is
  **dispatched unconditionally** and is **never** `skipped-identical`.

**`skipped-identical` is reported as itself and never as `landed`.** It is **not** the inherited no-op
*operation* refusal, which is unchanged and applies to the **operation** rather than to a field
dispatch.

## Fail-stop, never fail-forward

On the **first** row that is `failed` **or `unresolved`**, the operation **halts**, marks every
remaining non-`skipped-identical` row **of a LATER dispatch** `not-dispatched`, and **reports the
journal in full**.

**Fail-stop propagates at DISPATCH granularity, never at row granularity.** The other changed rows of a
**failing dispatch were physically sent with it**, so they take that write's outcome — `failed` or
`unresolved`, **together** — and a later-ordinal sibling of the **same** dispatch must **not** be called
`not-dispatched`, which would assert it was never sent when it demonstrably was.

Paired with the **backwards** rule for a **halt** (where the **dispatch** was never sent, so **all** its
non-skipped rows are `not-dispatched`), the two cover **disjoint** cases — *nothing sent* versus *sent
and failed* — so every planned row carries **exactly one** outcome and the rules never disagree.

`unresolved` halts for a **stronger** reason than `failed` does: continuing past a row whose outcome is
**unknown** would build later writes on an unverified premise.

The rule is **normative**. Nothing here permits continuing "in the hope that the rest will succeed".

## No compensating writes, ever

Three independent grounds, **each sufficient on its own**:

1. The last write **just failed**, so issuing a destructive write into that same failing channel is not
   a recovery strategy. *(Sufficient alone.)*
2. A `failed` row may reflect a lost **response** rather than a lost write, so a "rollback" can delete
   work that in fact succeeded — or, on a mis-resolved item, **someone else's card**. *(Sufficient
   alone.)*
3. The backlog ships **no delete operation at all**, so a compensating delete would smuggle one in
   through the **error path**, where it is least reviewable. *(Sufficient alone.)*

## The four grounds

**Ground 1 — the residual is information-lossless, and this is a derivation.** The canonical field order
recorded in `ptp-backlog`'s schema is `changeEpics`, then `attributionWarnings`, then `runBaseline`.
The payload stage **plans its rows in that order**, and the sequence is **fail-stop**, so the clear can
only land **no earlier than** every reconciliation append of the same operation. Everything the baseline
was evidence **for** is already durable when it is discarded, and the reverse order has no such
guarantee.

***No earlier than*, never *after*.** Under the landed mapping all three ride the item body and therefore
**co-land**, which satisfies this ground **a fortiori**; *after* would assert a temporal separation the
mapping does not produce. The canonical-order argument is what would carry the ground if the fields were
ever split across carriers.

**Ground 2 — the residual is a state the contract already specifies completely.** `ptp-backlog` already
defines `in-progress` with a null `runBaseline`: **not reconciled** (nothing to diff), **still gated**,
evaluated on the entry's **existing holdings**, with every refusal stating that **no diff was possible**.
The one property this ground needs from the gate is that **its trigger does not key on *staleness***, so
a null baseline cannot switch it off; the trigger's own enumeration is **`ptp-backlog`'s and is not
reproduced here**, because a second copy in a second skill is free to drift from it and this contract
would then be the wrong place to discover that it had.

**Ground 3 — the reverse order's residual is strictly worse in three ways.**

- Settled to **`cancelled`** → a **permanent phantom no writer could ever clear**, which is the exact
  state the cancellation guard's mandatory clear exists to prevent.
- Settled to **`ready`** → the baseline is **silently destroyed by the next take**.
- Settled to **`blocked`** → destroyed by **`/ptp:backlog-continue`'s resume clear, or by a
  reset-then-take** — **never** by a take directly, the runner taking only `ready` entries. The two
  routes are stated separately, and *"the next take overwrites it"* must **not** be written of a
  `blocked` entry.
- And **decisively**: the reverse order leaves a **settled** entry that has **left the gate**, so the
  user is never asked again. **Fail-stuck beats fail-open.**

**Ground 4 — the reverse order would be a per-operation exception whose boundary leaks.** Writing
`status` first at the runner's take leaves an `in-progress` entry with a **null baseline holding no
`changeEpics`** — genuinely stranded, needing a hand repair — whereas the chosen order leaves `ready`
with a baseline that the next take simply overwrites.

## What is honestly given up

The chosen order **cannot recover a prefix minted by a crashed run that reconciliation did not already
materialize**, because after the clear no diff is possible.

For **this** operation's own reconciliation that set is **empty** (ground 1). It is **not** empty for a
**later** crash on the same entry, whose folders could then be recovered **only from the report** — which
is exactly why the report obligation below requires the cleared value **verbatim**.

## The detection rule — two layers

**Layer 1 — in-operation, by the journal, exact and always available to the producer.**

> An operation whose `runBaseline` row's outcome is `landed` or `landed (verified by re-read)`, **and
> whose snapshot value for that field was non-null**, **while** its commit row's outcome is `failed`
> **or** `not-dispatched`, **has produced the residual** and SHALL name it.

The producing operation **infers nothing**, because it knows what it dispatched.

**`unresolved` is excluded from the commit-row condition**, and the exclusion is forced: an `unresolved`
commit is the one case in which the `status` write **may have landed**, so obligation 1's *the transition
was not committed, so the entry is still `in-progress`* would be **false** there. Such an operation
reports the **unknown-status** shape instead — the baseline **was** cleared, the transition **may or may
not** have committed, the **cleared value verbatim** (obligation 2 surviving, the value being gone either
way), and **inspection directed before any retry** — and it claims neither that the entry is
`in-progress` nor that the residual exists.

**`skipped-identical` is deliberately excluded** too: it means the baseline was **already null**, so this
operation cleared nothing, produced nothing, and has **no cleared value to print verbatim**. Such an
operation reports the state as **pre-existing**, states that no diff was possible, and **never claims to
have cleared a baseline**. Including it would make a deliberately re-issued instruction — whose clear
re-dispatches as `skipped-identical` **by design** — report itself as having destroyed a baseline it
never saw.

**Layer 2 — after the fact, by a predicate over store state:** `status` is `in-progress` **and**
`runBaseline` is null.

**The amended provenance clause for that state:** it is reachable **by a hand edit, or by a settling
write group whose baseline clear landed and whose status commit did not.**

**Every consumer of the state** — `/ptp:backlog-edit`'s gate refusal and report, `/ptp:backlog`'s own
stale flag, and the runner's terminal listing of entries left `in-progress` — SHALL **distinguish the two
shapes** (baseline **set** versus baseline **null**) rather than collapsing them, because only the first
has a diff available; and SHALL keep the inherited conditional register: **no sentence asserts that a
crash occurred.**

## The report obligation

An operation that produces the residual SHALL name, for that entry, **all four**:

1. that the baseline **was cleared** and the transition was **not committed**, so the entry is still
   `in-progress` — **never** "the edit partially applied";
2. **the cleared value verbatim** — a **strengthening beyond the ordinary journal obligation**, because
   the value is gone from the store and this report is now its only record;
3. that a **re-issued identical instruction converges** — the reconciliation appends and the clear both
   re-dispatch as `skipped-identical`, leaving only the commit — **and** that reconciliation will **not**
   re-run, there being nothing to diff, so the disposition must be **restated** and will be evaluated on
   **existing holdings alone**;
4. that the entry **remains gated** — plus, where the settling edit was a **cancellation**, that the
   cancellation guard **re-applies in full** on the next attempt, its **acknowledgement included**.

## Hard rules

- **`status` is written last, exactly once per operation**, and an operation writing it on more than one
  entry is refused before W1.
- **Never dispatch a commit over a payload row that is `failed`, `not-dispatched`, or `unresolved`.**
- **Never write blind**: the snapshot before the first dispatch, the pre-write check before every checked
  row, and a fresh read of every carrier that is composed.
- **Never retry an ambiguous outcome** — resolve it by re-read.
- **Never issue a compensating write** — no rollback, no undo, no delete-on-failure, no best-effort
  repair write.
- **Never report `skipped-identical` as `landed`**, and never summarize a partial failure as "partially
  applied".
- **Never restate an inherited contract** — the schema, the validator, writer eligibility, the transition
  table, the guards, the recovery machinery, the field mapping, and the read path are cited, never
  copied.
