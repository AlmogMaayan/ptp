---
name: ptp-backlog-write
description: Own how a backlog write is dispatched onto the GitHub Projects board and what a partial failure means — the deterministic ordered write sequence (existence, identity, payload, commit) with `status` last and the single justification for that order stated here and nowhere else; the status-commit invariant that replaces atomicity, together with its backstop refusal of any operation writing `status` on more than one entry; the field-is-the-unit-of-planning / carrier-is-the-unit-of-dispatch rule and the compose-from-a-fresh-read-of-the-carrier rule that keeps it from losing an update; the two re-read rules — the pre-dispatch snapshot every decision binds to, and the per-field pre-write check over exactly two field categories with deliberately no third — and the degraded-scope dispositions derived from what the read path withholds; the write journal with its one-row-per-planned-field shape, its six exhaustive outcomes and its six terminal verdicts; fail-stop with no compensating writes on three independent grounds; the ambiguous-create board scan read against the snapshot's match set, the id-less item's report-and-manual-repair obligation, and the orphan repair split by the identity row's outcome; and the `runBaseline`-clear dispatch decision with its accepted residual, its two-layer detection rule and its four-part report obligation. A pure prose contract in the single-source-of-truth pattern of ptp-branch-guard (branch safety), ptp-codex-mode (the reviewer gate), ptp-agent-roles (role resolution), ptp-parallel-fanout (fan-out safety), and ptp-backlog (the board contract): it states obligations, performs none of them, reads nothing on its own, writes nothing, and edits nothing. Delegates the schema and its canonical field order, the validator and its problem codes, writer eligibility, the status transition table and its guards, and the whole recovery-and-reconciliation machinery to ptp-backlog; the field mapping, the membership rule, id allocation and the read path to 0042_03's read contract; and transport, the tool namespace and the capability preflight to ptp-github-projects-mcp. Defined by 0042_04, and consumed by /ptp:backlog-add, /ptp:backlog-edit, /ptp:backlog-run, and /ptp:backlog-continue.
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
| the field mapping onto board carriers, the membership rule, id allocation, and the read path | `ptp-backlog` (`0042_03`'s read contract) |
| the `backlog.*` keys, the tool namespace, the capability preflight and its record | `ptp-github-projects-mcp` |

This skill is a **pure prose contract**. It states obligations; it **performs none of them**. It reads
nothing on its own, writes nothing, runs no git command, and edits nothing.

## The constraint

Three **verified backend facts**, recorded rather than assumed:

1. `gh project item-edit` updates **exactly one field value per invocation**.
2. `gh project item-create` takes only `--title` and `--body`.
3. GraphQL's `updateProjectV2ItemFieldValue` sets **one field of one item** per mutation, and root
   mutation fields execute **serially, with no transaction and no rollback**, so a mid-document
   failure leaves earlier mutations applied.

**The conclusion is a consequence of those three, not an assertion beside them: there is no
whole-document write on this store at any layer under any client.** A write is therefore
**necessarily many dispatches**, and everything below follows from that and from nothing else.

## The unit — one operation

An **operation** is **one write group**: one pre-dispatch snapshot, one journal, one ordered
sequence, and **at most one** `status` write.

**One command invocation may execute one or more operations, sequentially.** Each carries its own
snapshot, its own journal and its own commit, and each is reported in its own right. A caller that
must settle **N** entries executes **N operations**; what it may **not** do is assemble **one**
operation carrying N commit writes.

The distinction between *operations per invocation* (unbounded) and *commits per operation* (at most
one) is stated explicitly because the backstop refusal below constrains only the second.

## The ordered write sequence

The order is **fixed, not a heuristic**, and **this table is the only place it is stated**.

| Stage | Contents | Applies to |
|---|---|---|
| **W1 — existence** | create the item with its composed **title and body**, thereby writing **every mapped field those two carriers hold**; **capture and retain its board node id** | creating operations only |
| **W2 — identity** | write the entry's `id` | creating operations only |
| **W3 — payload** | every **remaining** mapped field, in the schema's **canonical field order**, excluding `status` — and, **on a creating operation only**, also excluding the `id` already written at W2 and any field the mapping carries inside the created item's **title/body**, which W1 therefore already wrote. The **subject** entry first; then any other affected entry in ascending numeric backlog id, each in canonical field order | creation + edit |
| **W4 — commit** | the **single** `status` write | whichever operation writes `status` |

The four stages are **disjoint** and together cover **every mapped field that has a writable carrier**
exactly once. The qualifier is load-bearing, not hedging: `createdAt` and `updatedAt` are **mapped but
have no writable carrier** and are therefore **never written** by any stage — see *Why there is no third
check*, fourth bucket. An unqualified *every mapped field* would contradict that outright. The partition
is per **operation kind**: on a creation it is exactly as listed; on an **edit** W1 and W2 are empty,
so every mapped field the edit changes falls to W3 and only `status` is held for W4.

**The two exclusions in W3 are creation-scoped, and saying so is not pedantry.** On an edit nothing was
written by a W1 that never ran, so **nothing is excluded on those grounds**: a title/body-carried field
the edit changes **is** a W3 row, dispatched through the item's title/body write. Reading the exclusion
as unconditional would leave such an edit with **no planned row at all** and would silently drop the
user's requested edit.

W3's cross-entry clause is **vacuous but retained**: no writer in this epic produces a second affected
entry, and the clause is what keeps the dispatch order **total** if one ever does.

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

**W1 → W2 → W3 is physics twice over,** not policy: nothing can be written onto an item that does not
exist, and an item carrying no `id` is **unaddressable by every ptp command**.

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
2. **A committed-partial state is unreachable by construction** — nothing is dispatched after W4.

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

An **empty** value is written as a **field-value clear**, never as an empty string, so the board shows
an empty cell rather than a literal `""` that the read path would then have to disambiguate.

The inherited canonical-write rules resolve, each explicitly, as one of three things:

| Inherited rule | Resolution |
|---|---|
| document-level canonical form — indentation, trailing newline, line endings, BOM | **inapplicable** — there is no document |
| ordering | **survives, per field value** — a serialized collection's contents remain a deterministic function of the logical state |
| unknown-key preservation | **satisfied vacuously, and thereby more strongly** — a board field the mapping does not recognize is **never written** and therefore never lost |

None of the three is silently inherited; each is resolved above. (Inside the item **body** the vacuous
argument does **not** reach, and preservation is discharged **actively** — see *A carrier write is
composed from a fresh read of the carrier*.)

## A field is the unit of planning; a carrier is the unit of dispatch

`0042_03`'s landed mapping puts **ten entry fields on six board carriers**, and in particular puts
`description`, `changeEpics`, `attributionWarnings`, `runBaseline`, and `notes` on **one** — the item
**body**, the last four inside its metadata block. So several planned rows can share one physical write.

> **A mapped field is the unit of *planning*: it gets its own journal row. A carrier is the unit of
> *dispatch*: every planned row sharing a carrier is dispatched as ONE write of that carrier, at the
> canonical position of its EARLIEST constituent field, and those rows share that one write's
> outcome.**

Each row additionally records **which carrier write dispatched it**, so rows sharing an outcome visibly
share a **cause** rather than coincidentally agreeing.

Every W3 row is assigned to **exactly one** carrier, and the carrier partition sums to the mapping:

| Carrier | Planned rows it can carry |
|---|---|
| the `Backlog ID` custom field | `id` |
| the item's content **title** | `title` |
| the item **body** | `description`, `changeEpics`, `attributionWarnings`, `runBaseline`, `notes` |
| the `Status` custom field | `status` (W4) |
| the two board stamps | *(never written — `createdAt`, `updatedAt`)* |

**Four consequences:**

1. **Fields sharing a carrier land together or not at all.** A split between them is **unreachable
   through that carrier**, and **no report may present one as a live outcome** while they share it.
2. **The `runBaseline`-clear ordering decision is unaffected and strengthened.** The clear shares the
   body with the two reconciliation appends, so ground 1 below holds **a fortiori**; what the decision
   really governs is **body before `status`**, two genuinely distinct carriers.
3. **The pre-write check is run per planned field row, while the halt it triggers stops the whole
   carrier write** — a carrier is unwritable in part. Its rationale **strengthens**: a blind carrier
   write drops a concurrent edit to **every** field that carrier holds, not one.
4. **Exactness is stated at carrier granularity.** Re-reading **one field** stays exact — a field is
   readable on its own whatever carries it — but *a write sets one field of one item* holds only for
   **single-field** carriers.

**Two skip rules, stated because "share the outcome" and `skipped-identical` would otherwise collide:**

- A row whose **own** value already matches is **still** `skipped-identical`, even when its carrier
  write went out for a sibling row. A failed carrier write leaves the carrier unchanged, so such a row's
  value is still its intended one.
- A carrier **all** of whose planned rows are `skipped-identical` is **not dispatched at all**.

**No sentence of this contract assumes one mapped field equals one dispatch.**

## A carrier write is composed from a fresh read of the carrier

The rule above opens a lost-update hole, and this one closes it. A carrier write rewrites the **whole**
carrier while an operation plans rows only for what it means to change; composing the body from the
**snapshot** would write back `description`, `notes`, unrecognized keys and the carrier's prose at their
snapshot values, **silently clobbering a concurrent hand edit**. Those constituents have no planned row,
so the pre-write check never looks at them — it protects **planned** rows only.

> **A carrier write SHALL be composed from a read of that carrier taken immediately before the write —
> the same read the pre-write check of its planned rows uses, so no extra round trip — and SHALL apply
> ONLY this operation's planned changes. Every constituent for which the operation planned no row SHALL
> be carried through from that fresh read verbatim, never from the snapshot.**

Carried-through constituents do **not** become checked fields: the operation holds no intended value for
them, so a concurrent edit to one is **preserved, not detected** — which is correct, since no decision
procedure reads them and the user asked for no change.

This is what makes unknown-key preservation true **actively** inside the body, where the vacuous
argument above does not reach.

**The residual is unchanged:** the compose-to-write window is still one round trip, and the check is
still a detector, not a lock.

**The read's cost is stated honestly.** Where the carrier has a checked planned row, this read **is**
the check's read — the same one, not a second. Where it has none (a `description`-only or `notes`-only
body edit plans no checked row) it is **one additional read**.

**It is not a third check**: nothing is **compared** against it and it grants no decision, so no
*difference* can halt on it. The *no third check* claim below is therefore about which fields are
**compared**, never about how many reads an operation performs.

**Its failure path, stated explicitly, because *not a check* must not be read as *no failure of it
matters*:** a compose read that **cannot be completed** SHALL halt the operation — there is nothing to
compose from, and composing off the snapshot is the very lost update this rule prevents. It inherits the
transport rule of the pre-write check verbatim: bounded read retries, then a halt **before** that
carrier's dispatch, every non-`skipped-identical` row of the carrier `not-dispatched`, a report naming
**the carrier whose compose read could not be completed** rather than a difference, and the verdict
`refused` where nothing had been dispatched and `uncommitted-partial` otherwise. Where the carrier has a
checked planned row the compose read **is** the check's read, so that failure is described **once** and
never counted twice.

---

# The re-read rules — never a blind write

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
  not exist yet and is represented by its composed intended values until W1);
- **every item's `id`**, when the operation allocates one; and
- the **pre-existing match set** for the intended creation payload, when the operation **creates** an
  item.

**Every decision of the operation binds to this snapshot and to no earlier one** — writer eligibility,
the transition-table check, the recovery gate, reconciliation's diff, the availability table, and id
allocation.

### The degraded-scope dispositions

`0042_03` defines a state in which the transport can enumerate board items but **cannot return archived
ones**. It raises **no problem code** and the read still proceeds, but it **withholds exactly two
things**: **id allocation** and **the ready set**. Archive reachability is established **only** from
`ptp-github-projects-mcp`'s preflight **record** (its `archiveReachable` fact) and is **never** inferred
from the result set.

The dispositions are **derived from what is withheld, by the single rule *a writer refuses iff it
consumes something withheld*** — not enumerated by taste:

| Writer | Under degraded scope | Because |
|---|---|---|
| `/ptp:backlog-add` | **refuses** | it allocates an id, and allocation is withheld — minting one over a partial id space is exactly the reuse the withholding exists to prevent |
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
| **written, excluded from the check, with the reason recorded** | `title`, `description`, `notes` — outright-set scalars, **set not merged** by a writer the user already authorized, which **cannot invert a decision** because no decision procedure reads them; plus `id`, which has **no snapshot value** because it is written onto an item this same operation just created |
| **never written** — so no check can apply | the two board-owned stamps `createdAt`, `updatedAt`, which have **no writable carrier** |

The four buckets sum to the mapping's **ten** fields, so a later reviewer can find **no uncategorized
field** on which to hang a third check.

**The fourth bucket is not an exclusion.** An *excluded* field is one this writer may write **blind**;
these are fields it may **not write at all**. One consequence follows and is recorded rather than left
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
> substitute for it.

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

## The write journal

Before dispatching **anything**, the operation builds an in-memory journal of **one row per planned
FIELD, in dispatch order**:

| Column | Meaning |
|---|---|
| `#` | the ordinal — ordered by **dispatch**, and within one dispatch by canonical field order |
| `dispatch` | the **carrier write** that carries this row, shared by every row of that carrier |
| `entry` | the backlog id — or the item's **board node id** when no `id` has been written yet — or, where **neither exists**, the **intended** backlog id marked **unbound** (see below) |
| `field` | the mapped field |
| `intended` | the intended value, elided past a stated length |
| `outcome` | exactly one of the six below |

**Why one row per field and not per write.** Several fields can share one carrier and therefore one
physical dispatch, so *one row per write* plus *`#` is the dispatch position* would contradict each
other outright — the rows of one body write would all have to claim one position. Splitting the two
columns resolves it and keeps what the journal is **for**, which is answering **which *fields* landed**
rather than how many calls were made. (The call count is reported separately.)

The shape is **well defined** for two stated reasons: the sequence's stages are **disjoint and cover
every writable-carrier mapped field exactly once**, so no field appears twice — and the two
no-writable-carrier stamps are never planned, so they were never journal rows to begin with; and every
planned row is assigned to
**exactly one** carrier, so the `dispatch` grouping is a **partition** rather than an overlap.

**The third `entry` form exists because the first two are both unavailable at W1, and the journal is
built before anything is dispatched.** A creating operation has written no `id` yet — that is W2 — and
has captured no **board node id** yet, since W1 is what produces it; on `unresolved-create` it may never
capture one. So W1's rows carry the operation's **allocated intended backlog id**, explicitly marked
**unbound**: it names the row for the reader and for the repair path while asserting **nothing** about
any item on the board. When W1's node id is captured — at dispatch, or **recovered from the board
scan** — those rows are **rebound** to it and reported so; where it is never captured they stay unbound,
and the report says exactly that rather than printing an identity it does not have.

**W1 is not an exception to *one row per planned field*, and must not be turned into one.** The create
call is **one carrier write of two carriers** — the item's title and its body — so on a creating
operation the mapped fields those carriers hold (`title`, and every body-carried field) each get **their
own journal row**, all sharing the **W1 dispatch** exactly as the carrier rule prescribes for any shared
carrier, and all therefore sharing W1's outcome. The `dispatch` cell names the create; a **creation
marker** is a **dispatch label, never a substitute row**. Collapsing those six fields into one marker row
would defeat what the journal is for — *which fields landed* — precisely on the operation that writes
the most fields at once, and would make the claim that the stages cover every mapped field exactly once
true only by courtesy.

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
  have been **sent**. **And the halt propagates BACKWARDS across the halting row's carrier as well as
  forwards**: a carrier is unwritable in part, so **every other non-`skipped-identical` row of that
  carrier is `not-dispatched` too, whatever its ordinal**. Without that, an earlier sibling whose own
  check passed would carry **no outcome at all** and the partition would not be exhaustive.
- An **ambiguous write whose verification could not settle** is `unresolved` and **never** `failed`,
  which would assert it did not land.

**`unresolved` is what keeps the claim exhaustive rather than nearly exhaustive.** A field write is
resolvable by re-reading its one field *so long as that read succeeds*; when it does not, this outcome is
the honest floor.

`not-dispatched` therefore covers, exactly: the row at which the operation halted; every other
non-`skipped-identical` row of **that same carrier**; and every non-`skipped-identical` row of a
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
**failing carrier write were physically sent with it**, so they take that write's outcome — `failed` or
`unresolved`, **together** — and a later-ordinal sibling of the **same** dispatch must **not** be called
`not-dispatched`, which would assert it was never sent when it demonstrably was.

Paired with the **backwards** rule for a **halt** (where the carrier write was never sent, so **all** its
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

## The six terminal verdicts

| Verdict | Condition |
|---|---|
| `complete` | **every planned row** is `landed` / `landed (verified by re-read)` / `skipped-identical` — the commit row included **when the operation plans one** |
| `refused` | **nothing was dispatched** — an inherited refusal, the backstop refusal, a snapshot that could not be completed, or a pre-write-check halt at the first planned row |
| `uncommitted-partial` | dispatch began, **at least one planned row did not succeed**, and **no orphan remains** |
| `uncommitted-partial (orphan item)` | the same failure condition **and** W1 landed **and the item is still there** |
| `unresolved-create` | W1's response was **ambiguous** and the board scan could not settle whether an item was created. Reachable **only** at W1 |
| `unresolved-commit` | the **commit** row is `unresolved`, so the transition **may or may not** have committed. Reachable **only** at W4 |

**The partition, stated explicitly.** The two `unresolved-*` verdicts are separated **first**, each
recording that **one specific row's own outcome is unknown**; they **cannot collide**, because fail-stop
halts at the *first* unresolved row, so an operation that reached W4 at all had no unresolved W1. The
remaining four then partition on **three** questions asked in this order:

1. **did every planned row succeed?** → `complete`;
2. **was anything dispatched?** → if not, `refused`;
3. **does an item this operation created still exist on the board?** → if so,
   `uncommitted-partial (orphan item)`; otherwise the bare `uncommitted-partial`.

Asking the third about **the item** rather than about the row is deliberate: a human may delete the item
mid-sequence, in which case W1 landed yet there is **no orphan to name or repair**, so that case takes
the bare form and the report says the item **disappeared**.

**Four traps, each written as a trap rather than left to inference:**

- **An operation that plans no `status` write reaches `complete` with no commit row** and must **never**
  be reported `uncommitted-partial` merely because none was dispatched. The invariant is **vacuous**
  there, not violated.
- **A first-write failure is `uncommitted-partial` with an empty landed set, never `refused`** — a
  refusal asserts the store was **never touched**, and a dispatched-then-failed write cannot promise
  that.
- **The correct claim is *no `status` write can have landed*, not *none can have been dispatched*.** The
  commit **can** be the failing row, and on a status-only operation it is the **only** row and therefore
  the first dispatched. Being last stops anything from being dispatched **after** the commit; it does not
  stop the commit itself being attempted and failing.
- **An unresolved commit is the one reachable case in which a `status` write may in fact have landed**,
  which is exactly why it has its own verdict.

> **The scoping rule every consumer of a failed group inherits.** *No `status` write can have landed* is
> true of **five** verdicts; **`unresolved-commit` is the deliberate exception**. On that verdict the
> entry's status is **UNKNOWN**: the report SHALL name **both** possibilities, SHALL assert **neither**,
> SHALL prescribe **no** residual shape, and SHALL direct **inspection before any repair or retry**.
> Every downstream contract that names a resulting status on a failed group carries this exception
> **explicitly** rather than stating its status absolutely.

**One crossing the partition does not label: `unresolved-commit` on a creation.** W1 landed, so an item
exists whose `status` **may** be absent and which may therefore withhold the ready set for the whole
backlog — yet the **orphan label is withheld**, because asserting it would assert the commit failed. The
**report** SHALL state that the item's `status` may be absent, what an absent `status` costs, and that
the identity-landed repair applies **only if** `Status` is in fact unset. It SHALL assert neither
outcome.

**`committed-partial` is absent because the backstop refusal makes it unreachable** — a derivation, not
an omission.

**The one exclusion from the partition's domain.** A snapshot that **completes** and yields a document
with a **fatal** problem terminates **outside** the partition's domain: no journal is planned, nothing is
dispatched, so it carries **no verdict at all** and is reported through the inherited problem vocabulary
exactly as the load-and-validate gate reports it. It is **not** a seventh verdict and **not** `refused`.

**The ground is WHERE the failure and its repair lie — never whether an operation had been "formed".** A
formation-based ground cannot support the split, since an **incompletable** read yields no usable
document either while keeping the verdict `refused`. The criterion is:

- a **completed** read yielding a **fatal** document is a defect in the **data**; its repair is a data
  repair and its contract is the **problem vocabulary** — the journal reports on **dispatches**, and this
  is not one;
- a read that **cannot be completed** is a **transport** outcome — a failure of the very channel the
  writes would have used — which is exactly what the journal exists to name, so it keeps `refused` with
  every plannable row `not-dispatched`.

## Rate limits, timeouts, and the ambiguity rule

One operation is now **O(fields)** calls instead of one write, so transport failure stops being rare.

- **Retry only what is unambiguously pre-application** — a rate-limit response that performed no
  mutation, a connection refused, a DNS failure — with **bounded** attempts and backoff.
- **Never retry an ambiguous outcome** — a timeout, a 5xx, a connection closed mid-request. Resolve it
  by **re-reading the single field** and comparing to the intended value: present →
  `landed (verified by re-read)`; absent → `failed`, and the operation **halts**.
- **Ambiguity is resolved by re-read, never by retry.** For a **field** write this is **exact so long as
  the field can be read** — the very constraint that makes this store awkward is what makes verification
  precise. Stated at carrier granularity: a shared carrier's write sets every field it holds, so
  verification re-reads **each** of that write's planned fields before settling their rows.
- **A mixed verification is not a split landing, and is never recorded as one.** Where that re-read
  finds **some** of one carrier write's planned fields at their intended values and **others** not, the
  honest reading is **not** that the carrier landed in part — a carrier write is all-or-nothing, so a
  split through it stays unreachable — but that **the carrier has changed under the operation** since
  the write, which the check-to-write and write-to-verify windows both permit and neither closes. So
  **every** planned row of that carrier is settled **together** as **`unresolved`** — whether the write
  landed can no longer be established from the carrier's current contents — the operation **halts**, and
  the report names the **mixed observation field by field** and directs **inspection**, while claiming
  **neither** that the write landed nor that it did not. Settling the matching rows `landed` and the
  others `failed` is **forbidden**: it would assert a split the store cannot produce, and it would make
  *rows sharing a carrier share that write's outcome* false exactly where it is load-bearing.
- **When the verification read itself cannot be completed within its bounded budget, the row is
  `unresolved`** — the honest floor — and the operation halts. For a **payload** row the verdict is
  `uncommitted-partial`; for the **commit** row it is `unresolved-commit`.
- **Cost is reported, not capped.** The report states the **number of calls dispatched**, and **no
  ceiling refusal is added**, because a cap would make a legitimate large operation impossible with no
  safe alternative.

The transport mechanics are **`ptp-github-projects-mcp`'s**. What this section fixes is **which classes
are retryable**, and nothing else about transport.

---

# Creation: the ambiguous-create scan and the orphan refusal

## An ambiguous creation is the one exception

The exactness argument above covers **field writes only**. **W1 is not a field write**, and an ambiguous
**create** is the one outcome a single-field re-read cannot resolve: if the response is lost there is
**no field to re-read and no board node id to read it from**, so neither verified-landed nor failed can
be asserted honestly. A **retry is worse here than anywhere else**, because a create that in fact landed
would yield a **second item**.

The journal's **board-node-id fallback is unavailable here too**, which is why the ordinary
name-the-orphan path cannot be met and the scan below exists.

## The board scan

A **read, never a write**, through `0042_03`'s read path, for an item matching the creation payload —
with the results read **against the snapshot's pre-existing match set, never in isolation**.

| Scan result, compared to the snapshot's match set | Resolution |
|---|---|
| **exactly one new** match — however many pre-existing matches the scan also finds | **every W1 row** is `landed (verified by re-read)`; the node id is **recovered from the scan**; the operation continues normally |
| **no new** match, from a scan that **completed** | nothing new was created → **every W1 row** is `failed`, and the operation **halts** |
| **more than one new** match, **or a scan that did not complete** | **every W1 row** is `unresolved`; the verdict is `unresolved-create` |

W1's rows resolve **together**, W1 being **one dispatch** — which is the carrier rule applied, not an
exception to it: the scan settles whether *the item* exists, and every field the create carried exists
exactly if it does.

The rows partition on the count of **new** matches — 0, exactly 1, more than 1 — crossed with whether the
scan **completed**. **Pre-existing matches are subtracted first and then ignored**, so a scan finding one
pre-existing and one new match is the **first** row rather than an unclassified case.

**The match predicate is the creation payload itself** — the composed **title and body** W1 was
dispatched with, compared for equality through the read path. Nothing narrower is available, since the
entry's `id` is not written until W2.

### Why the comparison is not optional

The board **positively invites duplicates**: a human adds a card in one click, and an earlier partial
creation can leave an orphan whose payload matches a recomposed one. A scan read **in isolation** would
treat a **pre-existing** card as proof that W1 landed, and the operation would then write its freshly
allocated `id` onto **a card it never created**, silently corrupting an unrelated entry.

That is also exactly what the exclusion of `id` from the pre-write check rests on — *onto an item **this
same operation** created* — so the **novelty test is what keeps that exclusion honest** along the
recovery path.

**A match set that cannot be established is a snapshot failure, not one of these rows.** The operation
halts before dispatching anything, every W1 row is `not-dispatched`, and the verdict is **`refused`** —
classifying it `unresolved-create` would report that an item **may** exist when no create was ever
attempted.

**Two residuals, named rather than closed:**

- a human creating an **identically composed card** inside the same window is indistinguishable from the
  operation's own create;
- a human **editing** the just-created card inside the same window makes it stop matching, so a
  **completed** scan finds no new match and records `failed` while it in fact landed.

Both fall under the attestation, and **neither is a reason to downgrade every no-match scan to
`unresolved-create`**, which would forfeit the exact answer the scan usually gives.

### "Bounded" bounds the effort, never the conclusion

Only a scan that **enumerated every item in the project** may yield the `failed` row, because `failed`
asserts *nothing was created* and a scan that **stopped early cannot support that assertion** — a false
`failed` reports "nothing on the board", which invites exactly the re-run this section forbids and the
second item it would create.

So the scan **enumerates completely**, bounded by the board's size, and a scan that **cannot** be
completed for any reason is treated exactly like one that failed: **`unresolved-create`, never
`failed`**.

## The id-less card is unmanaged, not a lockout

Adding a card to a Project is **one click**, so a human **will** create items with no `Backlog ID` — and
so can a creation whose identity write did not land.

**`0042_03`'s landed membership rule decides what such an item is, and it is not paraphrased into
something stronger.** An item with **no** `Backlog ID`, or one **empty after trimming**, is an
**unmanaged item**: not an entry, excluded from `epics` and from id allocation, **reported by the view**,
**not a validation problem**, and **blocking no backlog write whatever**. That slice ships a scenario
named *A whitespace-only backlog id does not lock writers out* specifically to forbid the stronger
reading.

**The `malformed-entry` on `id` case is a different object and stays distinct:**

| Object | What the read path says | Effect on writers |
|---|---|---|
| **no / whitespace-only `Backlog ID`** | **unmanaged item** — not an entry, not a problem, reported by the view | **none.** Blocks nothing, refuses nothing |
| **non-empty, malformed `Backlog ID`** | `malformed-entry` on `id` — an **id-space** defect | writer eligibility **refuses every backlog write** until repaired, `max(id)+1` being undefined over it |

That second rule is **not weakened**.

Because an id-less item blocks nothing, **the obligation moves to the report**:

> An operation that may have left an item with **no `Backlog ID`** SHALL name **every such item it
> observed or holds a handle for**, by **board node id and title**; SHALL state the **two** repairs —
> set the item's `Backlog ID`, or remove the item from the board; and SHALL state that until then the
> item is **unmanaged**: invisible to every backlog reader except the view's unmanaged-item list, in no
> ready set, and **forcing no later invocation to act**. The report SHALL NOT claim that the item will
> refuse a later write, because it will not.

**Scoped to what the operation can identify.** Where the enumeration did not complete there may be **no
node id and no title to print**; the report names every **observed** candidate and says so.

The **board node id locates the card for a human** and is **not** an address any ptp command accepts.

## The orphan repair, split by the identity row's outcome

Conflating the three would name a repair the user cannot perform.

| Identity row | The orphan's defect | The repair the report directs |
|---|---|---|
| **W2 landed** | the entry has an `id` but an **absent** `status` — structural, so the ready set is withheld | **in the sequence's own order**: first restore every not-landed payload field via `/ptp:backlog-edit` against that backlog id, **then** set the item's `Status` on the board to the intended `pending`. The report states the **order**, because `Status` first publishes an entry a runner may **take** before its `notes`, `changeEpics`, and `attributionWarnings` are there |
| **W2 failed** | the item has **no `Backlog ID`**, so it is an **unmanaged item** rather than a defect | the **manual board repair** above. **`/ptp:backlog-edit` SHALL NOT be offered** — it can neither address nor write such an item. The report SHALL state that the item **blocks nothing**, so nothing will force the repair later |
| **W2 unresolved** | **unknown** whether the item carries an `id` | the report names the **board node id** *and* the **intended backlog id**, states that the write **may or may not** have landed, directs the user to **inspect the item** and then apply whichever repair matches, and **asserts neither** |

**Applying the landed carrier record to the W2-landed row.** Where **every** payload field rides the
carrier the creation call itself wrote — which is the case under `0042_03`'s landed mapping, the create
carrying title **and** body — the restore step is **vacuous**, and the report directs **setting `Status`
alone** rather than a `/ptp:backlog-edit` pass that would change nothing. The ordering rule is unchanged;
there is simply one step to order.

**The absent `status` is not softened**: no default is invented, and **no compensating delete is
offered**.

## The `unresolved-create` repair

Keyed on the **observed new candidates** and on whether the **enumeration completed** — **never** on
which branch produced the verdict.

**No branch is offered for "exactly one new candidate from a complete enumeration": that combination is
unreachable from this verdict.** A complete enumeration finding exactly one new match resolves to a
verified landing and the operation **continues**, so `unresolved-create` arises **only** from two-or-more
new matches on a complete enumeration, or from an enumeration that did not complete. An unreachable
repair row invites an implementer to **synthesize the state that reaches it**.

**In every case, then** — two or more observed, or an enumeration that did not complete — the report:

- names **every observed** candidate by **board node id and title**;
- states plainly **when, and only when, the enumeration did not complete** that further candidates may
  exist. A **complete** enumeration finding two or more new matches **did** complete, so its report
  **SHALL NOT** claim otherwise: it names the full observed candidate set **as complete**;
- directs the user to **enumerate by hand and reconcile**, so that **at most one** card receives the
  intended id and **every remaining id-less candidate is removed or repaired**;
- SHALL **never** direct setting the intended id on "the item", which would either mislabel a human's
  card or create **duplicate ids**;
- SHALL **never** direct **re-running the creation**, which would risk a second item on top of an
  unknown first.

---

# The `runBaseline` clear: which residual is safer to leave

**The decision, first and in one sentence:**

> **The `runBaseline` clear is a payload write, dispatched in canonical field order — which places it
> after `changeEpics` and `attributionWarnings`, the two reconciliation appends — and the settling
> `status` write is the commit, dispatched last of all. The accepted residual is an entry left
> `in-progress` with a null `runBaseline`.**

The candidates and their residuals, before the justification, so the rejected ones stay visible:

| Order | Dispatch sequence | Residual when it lands partially |
|---|---|---|
| **A — chosen** | every reconciliation append → clear `runBaseline` → write `status` | **`in-progress` with a null baseline** — unreconcilable, nothing to diff |
| **B** | write `status` → the appends → clear `runBaseline` | a **settled** entry with a stale baseline, possibly **without its appends** |
| **B′** | every append → write `status` → clear `runBaseline` | a **settled** entry with a stale baseline, its appends durable — the **steelman** |

**The clear is NOT "last among the payload writes".** Canonical key order puts `notes` **after**
`runBaseline`, so the clear is not last **in row order**. And under the landed carrier mapping `notes`
shares the **body** carrier with the clear and the two reconciliation appends, so canonical order orders
the **rows within one dispatch** rather than four dispatches in time: `notes` **co-lands** with the clear
and **cannot fail after it**.

**The only ordering this decision governs is therefore: the BODY write before the `status` write** —
genuinely two carriers and genuinely two dispatches. The guarantee the derivation needs is only *the
clear no earlier than every reconciliation append of the same operation*, which co-landing satisfies **a
fortiori**.

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
- Settled to **`pending`** → the baseline is **silently destroyed by the next take**.
- Settled to **`blocked`** → destroyed by **`/ptp:backlog-continue`'s resume clear, or by a
  reset-then-take** — **never** by a take directly, the runner taking only `pending` entries. The two
  routes are stated separately, and *"the next take overwrites it"* must **not** be written of a
  `blocked` entry.
- And **decisively**: the reverse order leaves a **settled** entry that has **left the gate**, so the
  user is never asked again. **Fail-stuck beats fail-open.**

**Ground 4 — the reverse order would be a per-operation exception whose boundary leaks.** Writing
`status` first at the runner's take leaves an `in-progress` entry with a **null baseline holding no
`changeEpics`** — genuinely stranded, needing a hand repair — whereas the chosen order leaves `pending`
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

## The inherited "in the same write" clauses

Every such clause resolves to **one operation**:

| Inherited clause | Payload | Commit |
|---|---|---|
| the take's `runBaseline` write | `runBaseline` | `in-progress` |
| the cancellation guard's mandatory clear | the clear | `cancelled` |
| *every settling edit clears `runBaseline`* | the clear | the settling status write |
| the resume guard's write shape | the clear | `done` (with `changeEpics` retained by **planning no row at all**) |

**The load-bearing consequence:** such a clause is **never** satisfied by deferring a write to a **later
invocation** — which is the failure each clause exists to prevent, and which the status-commit invariant
forecloses outright.

The enumeration of settling edits is **`ptp-backlog`'s** and is **cited, never copied**; its
**completeness** is what the lingering-baseline invariant rests on.

---

# Two premises this contract is claimed under

Both are properties of the **board and its transport** rather than of this contract, so both are stated
as gated premises rather than derived.

**1. Creating an item does not populate the mapped `status` field.** No single-select default and no
project automation stamps `Status` on add. If one could, creation would itself publish a state and the
commit stage would stop being the commit point. The bound that makes the premise safe where a board's
own automation does stamp a status: an item is **not an entry** until its `Backlog ID` is written at W2,
so it is **outside `epics`, outside allocation and outside the ready set** for the whole of W1 — and
under the landed mapping the create call carries the entire payload, so no runner can ever meet an entry
whose `status` is published before its payload. A board configured otherwise is reported, never
worked around.

**2. The item body is writable on an existing item.** The verified backend facts establish a
one-custom-field-value update, a create taking `--title`/`--body`, and a one-field-value mutation —
**none of which is by itself a path to update an existing item's title or body**, and the body carries
five of the ten fields including all three merge-written collections. The membership rule admits **draft
issues, issues, and pull requests** alike, and they are not one case:

| Content type | Body-update path | Consequence |
|---|---|---|
| **draft issue** | the project's own draft-issue update, which mutates the **project item's** content | none beyond the board |
| **issue** / **pull request** | the underlying **issue or pull request**'s own update, **outside the board** | the blast-radius announcement names it: a backlog write can edit a real issue's or pull request's body |

**Where no body-update path exists for a content type**, an entry of that type is **not
writer-eligible**: every writer **refuses it**, naming the **content type** and the **missing
mutation**; the runner does **not take** it; and **no fallback is invented**. No refusal anywhere is
weakened to make a write path fit.

---

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
