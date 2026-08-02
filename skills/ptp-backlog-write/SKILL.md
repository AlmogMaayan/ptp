---
name: ptp-backlog-write
description: Own how a backlog write is dispatched onto the GitHub Projects board and what a partial failure means — the deterministic ordered write sequence (existence, payload, commit) with `status` last and the single justification for that order stated here and nowhere else; the payload stage's per-content-type payload route — the draft item-edit call, and the transport's admitted content mutation for an issue- or pull-request-backed item, addressed by the content node id and never by the item node id — together with the two fail-closed leaves that replace the retired content-type refusal, and the repository-edit disclosure and per-entry report obligation that come with widening the route; the status-commit invariant that replaces atomicity, together with its backstop refusal of any operation writing `status` on more than one entry; the field-is-the-unit-of-planning / carrier-is-the-unit-of-dispatch rule and the compose-from-a-fresh-read-of-the-carrier rule that keeps it from losing an update; the two re-read rules — the pre-dispatch snapshot every decision binds to, and the per-field pre-write check over exactly two field categories with deliberately no third — and the degraded-scope dispositions derived from what the read path withholds; the write journal with its one-row-per-planned-field shape, its six exhaustive outcomes and its six terminal verdicts; fail-stop with no compensating writes on three independent grounds; the ambiguous-create board scan read against the snapshot's match set, and the single orphan repair shape; and the `runBaseline`-clear dispatch decision with its accepted residual, its two-layer detection rule and its four-part report obligation. A pure prose contract in the single-source-of-truth pattern of ptp-branch-guard (branch safety), ptp-codex-mode (the reviewer gate), ptp-agent-roles (role resolution), ptp-parallel-fanout (fan-out safety), and ptp-backlog (the board contract): it states obligations, performs none of them, reads nothing on its own, writes nothing, and edits nothing. Delegates the schema and its canonical field order, the validator and its problem codes, writer eligibility, the status transition table and its guards, and the whole recovery-and-reconciliation machinery to ptp-backlog; the field mapping, the identity rule and the read path to 0042_03's read contract; and the transport with its invocation mechanics, the acting identity, the gh surface and the capability preflight with its verdicts to ptp-github-projects-gh. Defined by 0042_04, and consumed by /ptp:backlog-add, /ptp:backlog-edit, /ptp:backlog-run, and /ptp:backlog-continue.
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

## The ordered write sequence

The order is **fixed, not a heuristic**, and **this table is the only place it is stated**.

| Stage | Contents | Applies to |
|---|---|---|
| **W1 — existence** | create the item with its composed **title and body**, thereby writing **every mapped field those two carriers hold**; **capture and retain its board node id** | creating operations only |
| **W2 — payload** | every **remaining** mapped field, in the schema's **canonical field order**, excluding `status` — and, **on a creating operation only**, also excluding any field the mapping carries inside the created item's **title/body**, which W1 therefore already wrote. The **subject** entry first; then any other affected entry in `ptp-backlog`'s canonical order, each in canonical field order | creation + edit |
| **W3 — commit** | the **single** `status` write | whichever operation writes `status` |

### The dispatch table — one concrete invocation per stage

The stage set above says **what** each stage writes. This table says **how**, and it is the only place
the invocations are given. Argument construction, exit-code classification, output parsing and the
stderr surface are the **`gh` transport contract**'s (`ptp-github-projects-gh`) and are **cited, never
restated** here.

| Stage | Concrete invocation |
|---|---|
| **W1** | `gh project item-create <projectNumber> --owner <projectOwner> --title <composed title> --body <composed body> --format json` |
| **W2** — the title/body carriers, on a **`DraftIssue`**-backed item | `gh project item-edit --id <DI_…> --title <composed title> --body <composed body> --format json` |
| **W2** — the title/body carriers, on an **`Issue`**-backed item | the `gh` transport contract's admitted **content mutation `updateIssue`**, dispatched through `gh api graphql` against the item's **content node id**, carrying the planned carriers' values in **one** mutation |
| **W2** — the title/body carriers, on a **`PullRequest`**-backed item | the same admitted route's **`updatePullRequest`**, dispatched through `gh api graphql` against the item's **content node id**, likewise in **one** mutation |
| **W3** | `gh project item-edit --id <PVTI_…> --project-id <PVT_…> --field-id <Status field id> --single-select-option-id <resolved option id> --format json` |

**W2 has one route per content type, and the route is selected from the content type the compose read
OBSERVED immediately before the dispatch — never from the pre-dispatch snapshot.** A card converted
between the snapshot and the dispatch is therefore written through the route its **observed** type
requires; the content type **selects a route** and no longer decides a refusal.

**The content mutation's own mechanics are cited and never restated here.** Its admission, its closed
scope, its query document and variable arguments, the **two mutations' differing target input field
spellings**, the body's emission on that route, and the token-scope disclosure are the **`gh` transport
contract**'s (`ptp-github-projects-gh`, *The content-body mutation route*). This table names the route
**by role**; an implementer builds it there.

**W3 is untouched by all of this.** `Status` is written by the **field-value route on all three content
types**, that route carrying **no content-type check** of any kind, and no content-type branch is added
to the commit stage.

**W1 is untouched too, and it stays draft-only.** `gh project item-create` creates a **draft**, so a
non-draft entry exists only because a human added a repository item to the board. The **existence**
stage, the node-id capture boundary, the ambiguous-create board scan, its completeness test,
`unresolved-create` and the orphan repair therefore gain **no content-type branch whatever**, and **no
non-draft creation path exists or is to be invented** — there is no caller for one.

Each identifier is **named by role** and resolved elsewhere, never re-derived here: the `PVTI_` **item
node id** is the entry's own `id` and is the **only** identity this contract recognizes; the `DI_`
**draft-content id** is the **dispatch coordinate of the draft route**, obtained from the compose read
(*A carrier write is composed from a fresh read of the carrier*); the **content node id** of an `Issue`-
or `PullRequest`-backed item is the **dispatch coordinate of the content-mutation route**, obtained from
that **same compose read**; and the `PVT_` **project node id**, the **`Status` field id** and the
**option ids** come from the read path (`0047_06`), which publishes them so that no consumer makes a
board call of its own for them.

**No two of those four are interchangeable, and it is their ROLE that keeps them apart.** A `PVTI_` id
addresses the **board item** and is dispatched **only** by W3; a `DI_` id and a non-draft **content node
id** address the item's **content object** and are dispatched **only** by their own W2 route; a `PVT_` id
addresses the **project**. **The content mutation is never addressed by the `PVTI_` item node id**, and a
route that received one would be writing against the wrong object entirely.

**The prefixes are a reading aid here and nothing more.** They are written above so a reader can tell the
three spelled-out identifiers apart on sight; **a non-draft content node id's prefix is not stated by any
contract and is not to be assumed**. No route is selected, and no content type is inferred, from any
identifier's prefix: **the route comes from the content type the compose read observed**, and from
nothing else. The one prefix check that exists anywhere is `gh`'s own, inside the draft route, and it is
the backend's rather than ptp's.

**Two fail-closed leaves, both refusing BEFORE anything is dispatched on that carrier:**

> **An item whose observed content type is none of `DraftIssue`, `Issue`, `PullRequest` has NO ROUTE.**
> The operation refuses before dispatching on that carrier, naming the **observed** content type.

> **An item whose observed content type HAS a route but for which the compose read returned NO content
> node id has no ADDRESS.** The operation refuses before dispatching on that carrier, naming the content
> type and the missing id, and reports it as a **transport defect** — never as a configuration problem.
> It is the same shape as the fail-closed leaf for a selected `Status` option name for which the read
> published no id.

Both land on the **existing** verdicts — `refused` where nothing had been dispatched, `uncommitted-partial`
otherwise — and every non-`skipped-identical` row of the prevented dispatch is `not-dispatched`, exactly
as for any other pre-dispatch halt. **No new outcome, verdict or stage is added by either.**

**W2 has no other carrier in v1.** The field mapping puts **every** non-`status` field on the item's
title or its body, so the title/body dispatch is W2's **only** dispatch. A future ptp-owned board custom
field would land in W2 through the **field-value route** — `--field-id` with its typed value flag, the
same route W3 uses. **No such field is added here**, and this paragraph is a statement of the mapping as
it stands rather than an open slot inviting one.

**`--project-id` is not a flag of `item-create`.** W1 addresses the project **positionally, by number,
together with `--owner`**. Only `item-edit`'s **field-value** route takes `--project-id`, which is why
W3 carries it and W2 does not — on **none** of W2's three routes, the content mutation taking no project
identifier of any spelling either.

**`--title` is required by `gh` on `item-create`**, and that requirement **agrees with** the schema's
non-empty `title`. It therefore adds **no new refusal**: a creation composing an empty title is already
refused upstream by the creating writer's composition rule, so the transport requirement can never be
the first thing to notice it.

**The identity stage is deleted, and the stages are renamed rather than renumbered around a gap.** The
previous sequence's **W2 wrote the entry's `id`** and no longer exists — the identifier is the board
item's node id, which has no writable carrier and is never written — and the **payload stage was
previously numbered W3**. Saying so here is what stops a reader taking the new W2 for the deleted
identity stage, or hunting for a missing stage in a W1/W3/W4 gap.

The three stages are **disjoint** and together cover **every mapped field that has a writable carrier**
exactly once. The qualifier is load-bearing, not hedging: `id`, `createdAt`, and `updatedAt` are **mapped
but have no writable carrier** and are therefore **never written** by any stage — see *Why there is no
third check*, fourth bucket. An unqualified *every mapped field* would contradict that outright. The
partition is per **operation kind**: on a creation it is exactly as listed; on an **edit** W1 is empty,
so every mapped field the edit changes falls to W2 and only `status` is held for W3.

**The remaining exclusion in W2 is creation-scoped, and saying so is not pedantry.** On an edit nothing
was written by a W1 that never ran, so **nothing is excluded on those grounds**: a title/body-carried
field the edit changes **is** a W2 row, dispatched through the item's title/body write. Reading the
exclusion as unconditional would leave such an edit with **no planned row at all** and would silently
drop the user's requested edit.

W2's cross-entry clause is **vacuous but retained**: no writer in this epic produces a second affected
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

## A field is the unit of planning; a carrier is the unit of dispatch

The landed mapping puts **ten entry fields on five board carriers**, and in particular puts
`description`, `changeEpics`, `attributionWarnings`, `runBaseline`, and `notes` on **one** — the item
**body**, the last four inside its metadata block. So several planned rows can share one physical write.

> **A mapped field is the unit of *planning*: it gets its own journal row. A carrier is the unit of
> *dispatch*: every planned row sharing a carrier is dispatched as ONE write of that carrier, at the
> canonical position of its EARLIEST constituent field, and those rows share that one write's
> outcome.**

Each row additionally records **which carrier write dispatched it**, so rows sharing an outcome visibly
share a **cause** rather than coincidentally agreeing.

Every W2 row is assigned to **exactly one** carrier, and the carrier partition sums to the mapping:

| Carrier | Planned rows it can carry |
|---|---|
| the item's content **title** | `title` |
| the item **body** | `description`, `changeEpics`, `attributionWarnings`, `runBaseline`, `notes` |
| the `Status` custom field | `status` (W3) — the option written is the **first name in the resolved row that the board offers** (below) |
| the two board stamps | *(never written — `createdAt`, `updatedAt`)* |
| **no carrier at all** | *(never written — `id`)* |

**`id` occupies the second row on purpose, and not the stamp row.** `ptp-backlog` — which owns the
mapping — says the node id is the **item's own identity, not a carried value**, and counts **five**
carriers with `id` outside them. Folding it into the stamp row would quietly make it a sixth carrier
here and put this contract at odds with its owner on the very concept this identity model turns on. The
two rows are equally unwritable, but for **different reasons**: a stamp has a carrier the board owns and
exposes no setter for, while `id` has **nothing to write to**.

**Four consequences:**

1. **Fields sharing a carrier land together or not at all.** A split between them is **unreachable
   through that carrier**, and **no report may present one as a live outcome** while they share it.
2. **The `runBaseline`-clear ordering decision is unaffected and strengthened.** The clear shares the
   body with the two reconciliation appends, so ground 1 below holds **a fortiori**; what the decision
   really governs is **body before `status`**, two genuinely distinct carriers.
3. **The pre-write check is run per planned field row, while the halt it triggers stops the whole
   dispatch that carries it** — a carrier is unwritable in part, so the halt cannot be narrower than
   the write it prevents. Its rationale **strengthens**: a blind carrier write drops a concurrent edit
   to **every** field that carrier holds, not one. (Where one dispatch carries **two** carriers — the
   joint title/body write below — the halt therefore reaches both, which is the same rule and not a
   second one.)
4. **Exactness is stated at carrier granularity.** Re-reading **one field** stays exact — a field is
   readable on its own whatever carries it — but *a write sets one field of one item* holds only for
   **single-field** carriers.

**Two skip rules, stated because "share the outcome" and `skipped-identical` would otherwise collide:**

- A row whose **own** value already matches is **still** `skipped-identical`, even when the dispatch
  carrying it went out for a sibling row. A failed carrier write leaves the carrier unchanged, so such a
  row's value is still its intended one.
- A **dispatch** **all** of whose planned rows are `skipped-identical` is **not issued at all**.

**No sentence of this contract assumes one mapped field equals one dispatch.**

### On this transport the title and body carriers are dispatched together

> **ONE dispatch carries BOTH the item's content TITLE carrier and the item BODY carrier, on EVERY
> content type** — on W1 (`item-create`), on W2's draft route (`item-edit --title --body`), and on W2's
> content-mutation route (`updateIssue` / `updatePullRequest`) alike. The two carriers are **never split
> across two dispatches**.

This **generalizes to W2** the sentence this contract already applies to W1 — *the create call is one
carrier write of two carriers* — and it is a **backend fact on each route, not a convention**: on the
draft route `gh` puts both values into **one** `UpdateProjectV2DraftIssueInput` and mutates **once**, as
`EditDraftIssueItem`; on the content-mutation route the admitted mutation likewise takes the title and
the body in **one input object** and applies them in **one** mutation (the `gh` transport contract's,
cited and not restated). On neither route is there an invocation that writes one carrier as a separate
call from the other.

**Consequence 1 — WHICH VALUES ARE SENT is derived per route, and the draft route's answer is NOT
carried across.** The joint dispatch above holds everywhere; this consequence does not, because its
ground is a property of `gh`'s draft route alone.

- **On the draft route both flags are always passed**, even when only one carrier has a planned row.
  Omitting one makes `gh` **fetch and re-send the other from its own read**, which would write back a
  body **ptp never composed**, over a body a concurrent hand edit may have changed. The value sent for a
  carrier with no planned row is therefore the one composed from the **fresh read of that carrier**, and
  the compose-from-a-fresh-read rule below is **load-bearing, not prudent**: it is what makes the
  unavoidable second value correct rather than destructive.
- **On the content-mutation route only the carriers with a planned row are sent.** An **omitted** input
  field is left **unchanged** by that mutation, so the hazard the draft rule exists to answer **does not
  arise**: nothing is re-sent from a read of `gh`'s own, and nothing can be written back that ptp never
  composed. A title-only edit therefore sends **the title alone** and leaves the repository object's body
  untouched.

  **That omitted-is-unchanged behaviour is a BACKEND FACT OF THE MUTATION, and it is the one fact of
  this route this contract states in its own name.** It is the patch semantics of `updateIssue` /
  `updatePullRequest`: the mutation applies **the input fields it was given** and touches no other field
  of the object. What the `gh` transport contract publishes is the mutation's **input shape** — both
  `title` and `body` **optional**, so one may be sent without the other — and its **closed scope**; it
  states nothing about what an omitted field does, so **no reader may take the sentence above for a cited
  fact, and no reader may derive it from the optionality alone**. It is recorded here, unverified at this
  contract's `gh` version, precisely so that a reader who doubts it knows exactly which sentence to test.
  **It is the sole ground of this bullet, and of nothing else in this contract** — the joint dispatch
  above, the route table, the fail-closed leaves and every outcome rule stand without it, so a
  falsification is confined to which values one route sends.

**Rejected: send both values on every content type, for uniformity.** Its appeal is real — one rule, no
case split, and the consequences below stay verbatim. It is rejected because on a non-draft entry it
would make a title-only edit **rewrite a live repository object's body** with a recomposed value **no
instruction asked for** — an extra external write, an extra entry in that object's edit history, and an
extra notification to its subscribers, bought with nothing but tidiness. And it is **irreversible**: a
repository edit cannot be withdrawn.

**Where a value IS sent for a carrier with no planned row — which on this contract means the draft route
— it is composed from the fresh read of that carrier**, and that rule is load-bearing exactly there.

**Consequence 2 — the skip rule takes the DISPATCH as its unit.** The title/body dispatch is omitted
**only** when **every** planned row it would carry — on **both** carriers — is `skipped-identical`; and a
row whose **own** value already matched is **still** `skipped-identical` even when the dispatch went out
for a sibling row, whether that sibling sits on the same carrier or on the other one. That is the two
skip rules above, read with the **dispatch** rather than a single carrier as the unit, so a dispatch
carrying only one carrier's rows is covered by the same sentence.

**Consequence 3 — halt propagation covers every carrier the dispatch carries.** A **pre-write-check
halt** on any planned row of the dispatch marks every **other** non-`skipped-identical` row **of that
dispatch** `not-dispatched`, because **nothing was sent**; a **dispatched-then-failed** or
**dispatched-then-ambiguous** write is **shared by every non-`skipped-identical` planned row of that
dispatch**, because those are the rows that **were** sent. **The two rules stay disjoint** — *nothing
sent* versus *sent and failed* — and both leave a **`skipped-identical`** row at its own outcome, exactly
as consequence 2 requires, so every planned row still carries **exactly one** outcome.

**What does not change, stated so the generalization is not over-read.** Title and body remain **two
carriers**: the carrier table's five rows stand, *a carrier is the unit of dispatch* stands as the
headline, and *a carrier write rewrites the whole carrier* stands as the premise. What this section adds
is only that **one dispatch may carry two of them**.

**Why every outcome rule below is written at DISPATCH granularity.** Before the co-dispatch, one
dispatch carried exactly one carrier, so *carrier write* and *dispatch* were interchangeable and this
contract used them so. They are not interchangeable any more. A rule that scopes a row's **outcome** to
a **carrier** now under-reaches: a halt or a failure on a **body** row would leave the same joint
dispatch's **title** rows with **no outcome at all**, which *exactly one outcome per planned row*
forbids. So every such rule below — the journal's `dispatch` column, the backwards-halt boundary and its
`not-dispatched` covers-exactly sentence, fail-stop's forward and backwards rules, the
mixed-verification rule, and the compose read's failure path — reads at **dispatch** granularity.

### Which `Status` option the commit writes

The `Status` carrier is the one carrier whose **content** is not simply the field's value: the entry
`status` is one of the values of the schema's `status` enum (`ptp-backlog`'s, never restated here), while
the board carries a SINGLE_SELECT **option** whose accepted
names come from `ptp-backlog`'s **resolved status-option table** (its default table merged with the
`backlog.statusOptions` overrides). So the carrier's content needs a rule, and this is it:

> **When an operation commits `status = S`, it writes the board `Status` option whose normalized name —
> trimmed and compared case-insensitively, the same normalization the read applies — is the FIRST name in
> the resolved table's row for `S` that the board's `Status` field actually offers.**

Three properties, in order of importance:

- **Deterministic.** Two boards offering the same options resolve the same name. The selection depends on
  board option **order**, **position**, and **color** not at all.
- **User-controlled.** The row is an ordered list the user writes, so *which spelling do you prefer* is
  answered by the configuration rather than by a preference of ptp's own.
- **Correct on a README-shaped board.** Under the default table (`ptp-backlog`'s, cited and not
  reproduced) the `ready` row resolves to `ready`, `Ready`; a board created per the documented setup
  offers `Ready` and not `ready`, so the rule selects `Ready`. **A rule of *always write the row's first
  name* is rejected** — it would select `ready`, which that board does not offer, and fail on the most
  common board there is. The **`backlog`** row behaves identically and is `/ptp:backlog-add`'s commit,
  which makes it the most common commit on a fresh board.

**One resolution step is appended, because `--single-select-option-id` takes an id and not a name:**

> **The option *id* W3 dispatches is the `id` of the entry, in the read path's published `Status`
> options, whose `name` NORMALIZES to the selected name — under the same trimmed, case-insensitive
> normalization the read and the selection above already apply.**

The `{ id, name }` pairs are the **read path**'s (`0047_06`), published with the snapshot and consumed
**as published**: no second board call is made for them, and nothing here re-fetches or re-derives them.

**The id is a consequence of the selected name, never an alternative selection key.** Board option
**order**, **position** and **colour** stay **unread** — that absolute is unchanged — and selecting by
id would quietly turn the determinism property the selection rule rests on into a property of the
published array's order, besides putting opaque board-generated strings into `backlog.statusOptions`.

### The commit refuses when the resolved row does not identify exactly one board option

> **Where the board's `Status` field offers NONE of the names in the resolved row for the status the
> operation must commit — or offers MORE THAN ONE option whose normalized name matches the selected name
> — the operation is REFUSED on the pre-dispatch snapshot, BEFORE W1.** Nothing is dispatched and the
> verdict is `refused`. The refusal names: the entry, the target status, the resolved row's accepted
> names, the board's actual `Status` option names, and **both** repairs — `/ptp:config →
> backlog.statusOptions`, or fix the options on the board. **ptp creates no `Status` option**, under any
> circumstance.

**That refusal is untouched by the id-resolution step above.** It is still evaluated over **names**, on
the **pre-dispatch snapshot**, **before W1** — so no stage, no verdict and no ordering concept moves,
and it is still the same single refusal covering both branches.

**One fail-closed leaf is added, and it is a third thing rather than a re-run of either.**

> **Where the selected name matches an option for which the read published NO id, the operation is
> REFUSED BEFORE W1**, naming the option and the missing id.

That is a **transport defect**, not a configuration one: the row did identify exactly one option and the
board does offer it, so it is **not the ambiguity refusal**; and the item's current value was never
consulted, so it is **not the no-op refusal**. It **must never be reported as either.**

**The ambiguous branch is never resolved by picking one.** Board option order, option position, and
option color are each the board-order dependence the selection rule above forbids, and it is the same
*never resolved by picking one* doctrine `ptp-backlog` already applies to a normalized-name collision on
a required carrier. Both branches are the same defect — *the resolved row does not identify exactly one
board option* — at the same moment, so they share one refusal, one verdict, and one placement.

**The ambiguity is a *write* concern only.** An item carries exactly one option, and every matching
option normalizes into the same row, so a **read** of that item yields an unambiguous `status` and raises
**no problem** on this ground.

**Why before W1 rather than at the commit.** On a **creation**, refusing at the commit would mean W1 had
already landed, leaving an item on the board with **no `Status`** — which is an **entry** carrying a
`malformed-entry` on `status`, withholding the ready set for the whole backlog and requiring the orphan
repair. And the repair would not work: the orphan repair *sets the item's `Status` to the intended
`backlog`*, which is the very write that has no option to select. A commit-time refusal would therefore
manufacture an **unrepairable** orphan out of a configuration typo. Refusing before W1 creates nothing
and leaves nothing behind.

**Two non-interactions, stated so neither rule is read into the other.**

- **This is not the no-op refusal.** *A status write that changes nothing is refused as a no-op* covers
  the different case in which the board **does** carry the option and the item already holds it. This
  refusal fires when the row identifies no option at all, and it must never be reported as a no-op.
- **The status-commit invariant is untouched.** It governs what must have **landed before** a commit is
  dispatched; this rule governs whether a commit is **dispatchable at all**, and it is evaluated before
  any payload row exists. Neither reads the other.

**It is a state-derived check under the existing snapshot rule.** The board's `Status` options arrive
**with** the snapshot, so this refusal drops into the slot *The pre-dispatch snapshot* already defines
for checks *evaluated on* the snapshot and explicitly permitted to still refuse: **no new stage, no new
verdict, no new ordering concept.**

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

### What the compose read is, concretely, for the title/body carriers

For the **title** and **body** carriers the compose read is **one `gh api graphql` node read** of the
item, selecting

```
content { __typename ... on DraftIssue { id title body } ... on Issue { id title body } ... on PullRequest { id title body } }
```

**The shape is precise and it is now symmetric across the three content types.** The **content type
comes back for every content type**, because `__typename` sits outside the fragments; and the **`id`,
`title` and `body` triple comes back for every content type too**, one inline fragment per type.

**The draft-only selection this replaced was not a gap either, and it is retired with its ground rather
than corrected.** It was justified by a **content-type refusal that fired before anything was composed**
for any item that was not a draft, so such an item needed neither a dispatch coordinate nor any carrier
contents.
This contract retires that refusal — every content type now has a payload route (*The dispatch table*) —
so every content type now needs **both**, and the selection widens with it. No reader may reinstate the
narrower selection on the retired justification.

**Two spellings, one value set.** On the **GraphQL** surface this read uses, the content type is the
meta-field **`__typename`**; on the **`--format json`** surface the read path (`0047_06`) consumes, the
same fact is exported under the key **`type`**. Both carry the **same three literals** — `DraftIssue`,
`Issue`, `PullRequest` — and the per-content-type table below is written over **those literals**, so
nothing depends on the spelling. **No artifact may name `__typename` as a key of a `--format json`
payload, nor `type` as a GraphQL selection.**

**It serves three purposes in one call:**

1. the **carrier contents** every constituent with no planned row is carried through from, verbatim —
   `description`, `notes`, the unrecognized block keys, the in-region prose and the post-`end` text;
2. the **content node id** that content type's payload route dispatches against — the `DI_`
   draft-content id on `item-edit`'s title/body route, and the issue's or the pull request's **own
   content node id** on the content-mutation route;
3. the **content type**, which is established **immediately before dispatch** — catching a card
   converted from draft to issue **after** the snapshot — and which **selects the payload route** that
   dispatch takes. It no longer decides a refusal: a converted card is written through the route its
   **observed** type requires rather than stopping the operation. Its two fail-closed leaves — an
   **unrecognized** content type, and a routable type for which this read returned **no content node
   id** — are stated once, with the route table.

**The content node id is a dispatch coordinate, never an identity — on all three content types.** The
`DI_` draft-content id and the issue's or pull request's content node id are alike in this: none of them
ever enters the entry model, none enters `/ptp:backlog-edit`'s argument grammar, and none appears in any
report as an identifier. The entry's `id` remains the **`PVTI_` item node id**, and every report names an
entry by that node id and its title.

**Why the coordinate is not taken from the pre-dispatch snapshot, nor from a read-path handle.** A
snapshot-era coordinate goes stale exactly where staleness is **destructive**: a card converted from
draft to issue between the snapshot and the dispatch would otherwise be written through a `DI_` id that
no longer addresses it — and, now that the other route exists, through the **wrong route** as well. The
read path (`0047_06`) **does** publish this value — its handle-table cell `contentNodeId`, published on
**every** content type the transport exposes — and that cell may be consumed as a **hint** on every
content type alike; the **compose read remains authoritative** for the coordinate actually dispatched and
for the route actually taken. Nothing here says the read path cannot publish it; what is said is that the
read path's copy does not decide.

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
carrier's dispatch, every non-`skipped-identical` row of the **joint dispatch** `not-dispatched`, a
report naming
**the carrier whose compose read could not be completed** rather than a difference, and the verdict
`refused` where nothing had been dispatched and `uncommitted-partial` otherwise. Where the carrier has a
checked planned row the compose read **is** the check's read, so that failure is described **once** and
never counted twice.

**The `not-dispatched` scope there is the *dispatch*, and that is a granularity statement rather than a
substance change.** A compose-read failure on **either** of the title/body carriers stops **one**
dispatch carrying **both**, so leaving the clause carrier-scoped would leave the sibling carrier's rows
with **no outcome at all** — which *exactly one outcome per planned row* forbids. The **report** still
names the **carrier** whose compose read could not be completed, because that is what the user has to
look at.

### The composed body's emission obligations

**This subsection is the one normative home of these obligations.** Every other mention of a `--body` in
this contract is a reference to it and may not diverge from it.

`gh project item-create` and `gh project item-edit` expose **no `--body-file`**, so the composed body
must arrive as an **argv element**. That body is not a token: it carries the user's prose, a blank line,
the two HTML-comment sentinels, a fenced JSON block and any preserved post-`end` text — so backticks,
`$`, backslashes and newlines are all **ordinary content**, never syntax.

**Five obligations, and all five bind together:**

1. the composed body SHALL arrive at `gh` as **exactly one argument**;
2. it SHALL be **byte-identical** to the composed value except for **trailing** newlines, which the
   store does not carry;
3. its line endings SHALL be **LF only**. A `\r` corrupts nothing at the sentinel lines — the read
   ignores their leading and trailing whitespace — but it **does** persist into `description` prose and
   into the fence's contents, and it **accumulates on every rewrite**;
4. **no shell expansion SHALL be applied to any byte** of the body: no command substitution, no
   parameter expansion, no backslash processing, no globbing;
5. where the body is carried by a **delimited** construct, the delimiter SHALL be a **nonce**, its
   **absence from the body SHALL be verified before dispatch**, and a collision SHALL **refuse before
   dispatching** rather than truncate or re-encode.

**W1's `--body` and W2's `--body` are bound identically.** The create and the edit differ in nothing
here.

**The realization is the transport's, not this contract's.** Under a POSIX shell the form that satisfies
1–5 is a **single-quoted heredoc inside a command substitution** — the quoted delimiter suppressing
every expansion, the surrounding `"$( … )"` making the result exactly one argument, and command
substitution stripping **trailing** newlines only, which obligation 2 already permits. The quoting rules
themselves are the **`gh` transport contract**'s and are **not restated here**; and where that contract
offers a dispatch that does **not** pass through a shell at all, **that supersedes this realization
while obligations 1–5 still bind**.

**Rejected: a temp file plus `--body "$(cat <file>)"`.** Its advantage is genuine and is recorded rather
than waved away — it removes delimiter collision entirely. It is rejected because it **writes composed
backlog content to disk**, needs cleanup on every fail-stop path, and creates an artifact a reader can
mistake for the **second store `ptp-backlog` forbids absolutely**. The nonce check of obligation 5 is
what is adopted in its place.

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

## The write journal

Before dispatching **anything**, the operation builds an in-memory journal of **one row per planned
FIELD, in dispatch order**:

| Column | Meaning |
|---|---|
| `#` | the ordinal — ordered by **dispatch**, and within one dispatch by canonical field order |
| `dispatch` | the **carrier write** that carries this row, shared by every row of **that dispatch**, the cell naming the **route** that carried it — the create, the draft item-edit, the content mutation, or the field-value write |
| `entry` | the item's **board node id** — the entry's `id` — or, on a creating operation before that id exists, the literal **`unidentified`** (see below) |
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

**The `entry` column carries the board node id, and its only other admissible value is the literal
`unidentified`.** There is no **intended** identifier marked unbound: nothing is allocated, so there is
no intended value to name, and the column may **never** carry a guessed, derived, or placeholder
identity.

**Why `unidentified` is needed at all, and why it is not the deleted third form.** The journal is built
**before anything is dispatched**, and on a creating operation the node id comes into existence **with
the item** — at W1. So at build time **every** row of a creating operation is written `unidentified`,
the later commit row included, and not merely W1's — the identity is missing from the *operation*, not
from a stage. **Every** such row is then **rebound** to the real node id the moment it is **captured at
W1**, or **recovered from the board scan** where W1's response was ambiguous, and the report says they
were rebound. Where the scan never settles it — the `unresolved-create` verdict — they **stay
`unidentified`**, and the report says **exactly that** rather than printing an identity the operation
does not have. (Under fail-stop nothing past W1 is dispatched in that case, so no row that stays
`unidentified` ever names a landed write.) The deleted third form asserted an identifier ptp had
minted; `unidentified` asserts **nothing at all**, which is the whole difference.

On an **edit**, every row's `entry` is known before dispatch and `unidentified` is unreachable.

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

## The six terminal verdicts

| Verdict | Condition |
|---|---|
| `complete` | **every planned row** is `landed` / `landed (verified by re-read)` / `skipped-identical` — the commit row included **when the operation plans one** |
| `refused` | **nothing was dispatched** — an inherited refusal, the backstop refusal, a snapshot that could not be completed, or a pre-write-check halt at the first planned row |
| `uncommitted-partial` | dispatch began, **at least one planned row did not succeed**, and **no orphan remains** |
| `uncommitted-partial (orphan item)` | the same failure condition **and** W1 landed **and the item is still there** |
| `unresolved-create` | W1's response was **ambiguous** and the board scan could not settle whether an item was created. Reachable **only** at W1 |
| `unresolved-commit` | the **commit** row is `unresolved`, so the transition **may or may not** have committed. Reachable **only** at **W3** |

**The partition, stated explicitly.** The two `unresolved-*` verdicts are separated **first**, each
recording that **one specific row's own outcome is unknown**; they **cannot collide**, because fail-stop
halts at the *first* unresolved row, so an operation that reached W3 at all had no unresolved W1. The
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
the orphan repair above applies **only if** `Status` is in fact unset. It SHALL assert neither
outcome.

**`committed-partial` is absent because the backstop refusal makes it unreachable** — a derivation, not
an omission.

### The creation constructs are REACHABLE, and how each is reached

A superseded plan (`0047_04`) derived the constructs below as **unreachable by construction**, on the
ground that its transport had **no create affordance** at all. On the `gh` transport that derivation is
**reversed**, and it is said here so that a reader of the superseded plan is not misled.

| Construct | Under the superseded plan | Here | Reached by |
|---|---|---|---|
| **W1** | unreachable | **reachable** | `gh project item-create` |
| the journal's `entry = unidentified` | unreachable | **reachable** | **every** row of a creating operation at journal-build time, before the node id exists; **rebound** at capture |
| **the board scan** | unreachable | **reachable** | an **ambiguous W1** |
| **`unresolved-create`** | unreachable | **reachable** | a scan finding **two or more** new matches, or a scan that **could not establish completeness** |
| **the orphan repair** | unreachable | **reachable** | W1 landed and the commit did not |
| `committed-partial` | unreachable | **still unreachable** | — the backstop refusal is **untouched** |

**Exactly one construct keeps its derived-unreachable status**, and it is `committed-partial`, on its
existing derivation and no new one.

**Nothing about the journal's cardinality moves.** It still enumerates **six** outcomes and **six**
terminal verdicts, unchanged in **number**, **name** and **meaning**. None is added, none removed, none
renamed.

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
  precise. Stated at dispatch granularity: a dispatch sets every field of every carrier it carries, so
  verification re-reads **each** of that dispatch's planned fields before settling their rows.
- **A mixed verification is not a split landing, and is never recorded as one.** Where that re-read
  finds **some** of one dispatch's planned fields at their intended values and **others** not, the
  honest reading is **not** that the write landed in part — a carrier write is all-or-nothing, so a
  split through it stays unreachable — but that **the carrier has changed under the operation** since
  the write, which the check-to-write and write-to-verify windows both permit and neither closes. So
  **every** planned row of that dispatch is settled **together** as **`unresolved`** — whether the write
  landed can no longer be established from the carrier's current contents — the operation **halts**, and
  the report names the **mixed observation field by field** and directs **inspection**, while claiming
  **neither** that the write landed nor that it did not. Settling the matching rows `landed` and the
  others `failed` is **forbidden**: it would assert a split the store cannot produce, and it would make
  *rows sharing a dispatch share that write's outcome* false exactly where it is load-bearing.
- **The mixed-verification rule is UNCHANGED by the per-content-type routes, and its re-read now has a
  readable surface on all three of them.** The compose read returns a **title and a body for every
  content type**, so the verification re-read of a content mutation's planned fields is the **same**
  re-read it already was on a draft — the rule reaches the new route **unchanged** rather than by
  extension, and nothing about it is weakened, narrowed or made content-type-conditional.
- **When the verification read itself cannot be completed within its bounded budget, the row is
  `unresolved`** — the honest floor — and the operation halts. For a **payload** row the verdict is
  `uncommitted-partial`; for the **commit** row it is `unresolved-commit`.
- **Cost is reported, not capped.** The report states the **number of calls dispatched**, and **no
  ceiling refusal is added**, because a cap would make a legitimate large operation impossible with no
  safe alternative.

The transport mechanics are **`ptp-github-projects-gh`'s**. What this section fixes is **which classes
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

### The node-id capture and the three-way boundary

`gh project item-create --format json` publishes `{"id","title","body","type"}`, and **`.id` is the
`ProjectV2Item` node id** — the entry's `id`. Capturing it is what W1 is for beyond creating the card.

**This table is the whole boundary. It has three dispositions and no fourth.**

| Observation of the W1 call | Disposition |
|---|---|
| exit **0**, **parseable** JSON, and a **non-empty `.id`** | **captured** — every journal row carrying the literal `unidentified` is **rebound** to it, the later commit row included, and the report says they were **rebound** |
| an exit **the `gh` transport contract classifies as unambiguously pre-application** — a connection refused, a DNS failure, a rate-limit response that performed no mutation | this contract's **existing bounded retry with backoff** runs first, exactly as for any pre-application failure; **on its exhaustion**, the existing **`failed`** row, and **no scan** |
| **anything else** — a non-zero exit that is **not** unambiguously pre-application, a timeout, a killed process, unparseable stdout, or valid JSON carrying **no `.id`** | an **ambiguous W1**, routed to the **board scan** below |

**Why the second row keeps the inherited retry instead of narrowing it.** A failure that **provably
performed no mutation** cannot yield a second card, so the retry prohibition below **does not reach it**;
`failed` is what **exhausted** retries settle to, not what the first such exit settles to. **No new retry
rule is added here, and no bound is changed.** The two rows are **disjoint**: the retry is licensed
**only** by the unambiguous-pre-application classification, and the third row is *defined* by the absence
of that classification. The boundary therefore stays **three-way**.

**Why the third row is deliberately broad.** A create that **landed** and whose **response was lost** is
**indistinguishable** from one that never landed — and `gh` exiting non-zero *after* its mutation
succeeded is an **ordinary** way to reach that state, not an exotic one. Anything narrower would classify
a landed create as `failed` and invite the re-run that produces a second card.

**The retry prohibition on an ambiguous create is unchanged**, and it is not a new rule: it is the
existing *never retry an ambiguous outcome* rule reaching its **one non-field-write case**.

## The board scan

A **read, never a write**, through `0042_03`'s read path, for an item matching the creation payload —
with the results read **against the snapshot's pre-existing match set, never in isolation**.

**Concretely, the scan is**

```
gh project item-list <projectNumber> --owner <projectOwner> --limit <N> --format json
```

read against that same pre-existing match set. The three-row resolution below is **unchanged**.

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
dispatched with, compared for equality through the read path. Nothing narrower is available: the item's node id
comes into existence only with the item, and is exactly what the scan is trying to establish. It is
**unchanged** by this transport, and it needs **no extra call**: `item-list --format json` publishes an
item's **title and body** alongside its id.

### Why the comparison is not optional

The board **positively invites duplicates**: a human adds a card in one click, and an earlier partial
creation can leave an orphan whose payload matches a recomposed one. A scan read **in isolation** would
treat a **pre-existing** card as proof that W1 landed, and the operation would then **adopt a card it
never created as its own creation** — reporting that card's node id as the new entry's `id` and
dispatching the `status` commit onto it, silently taking over an unrelated entry.

Nothing is written onto the card to establish its `id`, so the hazard is **adoption**, not corruption of
an identifier — and the **novelty test is what keeps the created-item exclusion from the pre-write check
honest** along the recovery path, that exclusion resting on *an item **this same operation** created*.

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

**On this transport that rule gains a checkable test, a named way to violate it, and a stated remedy.**

> **A scan may yield the `failed` row ONLY where it enumerated EVERY item, established by
> `length(.items) == .totalCount` on the SAME response.** `item-list --format json` publishes both.

**The concrete hazard is `--limit`, whose default is 30.** A scan run **without an explicit limit** on a
board holding more than thirty items is an **incomplete** enumeration — and it exits **successfully**,
so nothing else in the response announces it. Such a scan SHALL yield **`unresolved-create`**, never
`failed`.

**The remedy, stated alongside the hazard so neither travels without the other:** the scan passes an
**explicit `--limit` sufficient for the board**, and a response that nevertheless fails the completeness
test is **re-enumerated at a limit at least that response's own `.totalCount`** before any conclusion is
drawn.

**That re-enumeration is not a retry.** The scan is a **read**, and the *never retry an ambiguous
outcome* rule governs **re-dispatching the create** — which is untouched, and stays forbidden. No
outcome, verdict or stage is added, and **`unresolved-create` remains the floor** wherever completeness
still cannot be established.

## The orphan repair

There is **one** orphan shape, not three: with the identity stage gone there is no identity row to key
on, and every board item is an entry, so there is no id-less card to distinguish.

**The shape.** W1 landed and the commit did not, so the item exists on the board carrying its **full
composed payload** with its **`Status` unset**. That is an **ordinary entry** carrying a
`malformed-entry` on `status` — **structural**, so every entry still renders and **the ready set is
withheld**. It is not an unmanaged item — there are none — and it is not a defect of the identifier.
And unlike the id-less card the old contract carried, it **does** block: the withheld ready set is
exactly what forces the repair.

**The repair the report directs:** **set the item's `Status` on the board to the intended `backlog`**, or
repair it through **`/ptp:backlog-edit` against the item's node id**. The report names the item by
**board node id and title**, states that its `Status` is unset and that an unset `Status` withholds the
ready set for the whole backlog.

**Why this destination is `backlog` while the recovery dispositions settle to `ready`.** An orphan
completes an **interrupted creation** — W1 landed and the commit did not — and `/ptp:backlog-add` is the
only creating writer in the plugin, so the *intended* status is the one that add commits; the recovery
dispositions act instead on an epic a human has asked to resume, and their destinations are the ones
`ptp-backlog`'s transition and disposition tables name — cited here, never restated.

**Applying the landed carrier record.** Where **every** payload field rides the carrier the creation call
itself wrote — which is the case under the landed mapping, `item-create` carrying title **and** body — the
restore step is **vacuous**, so the report directs **setting `Status` alone** rather than a
`/ptp:backlog-edit` pass that would change nothing. The ordering rule is unchanged; there is simply one
step to order.

**Scoped to what the operation can identify.** Where the enumeration did not complete there may be **no
node id and no title to print**; the report names every **observed** candidate and says so, rather than
claiming a complete list.

**The absent `status` is not softened**: no default is invented, and **no compensating delete is
offered**.

**Where the board's own automation stamps `Status` on add**, premise 1 below does not hold and the item
will carry a `Status` this operation never committed. That case is **reported, never worked around**: the
report names the **observed** value, does **not** claim the commit landed, does **not** assert the value
is the intended `backlog`, and directs the user to **inspect the item before any repair**. No new
detection step, no automation probe, and no compensating write is introduced — the obligation is on the
report's honesty, not on a new branch of behavior.

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
- directs the user to **enumerate by hand and reconcile**, so that **at most one** card survives as this
  epic's entry and **every remaining stray candidate is removed or repaired**;
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
commit stage would stop being the commit point.

**The old bound no longer holds, and is retired rather than left standing.** It read: *an item is not an
entry until its ptp-minted identifier is written at the identity stage, so it is outside `epics`, outside
allocation and outside the ready set for the whole of W1.* With every board item an entry, **a created item is an entry the
instant W1 lands**, so the premise is **load-bearing without a safety net** and is stated as such. What
remains true, and stands in the bound's place:

- the create call carries the **entire payload** — title and body — so an entry visible from W1 is
  visible **with its payload intact**, and only `status` is outstanding;
- an outstanding `status` is a `malformed-entry`, which **withholds the ready set** rather than admitting
  the entry to it, so the failure direction is **fail-closed**;
- the window between W1 and the commit is **one round trip**, bounded by the existing attestation that no
  other writer and no human is concurrently editing the board;
- a board whose **own automation stamps `Status` on add** is **reported, never worked around**.

**2. The item body is writable on an existing item.** The board admits **draft issues, issues, and pull
requests** alike, the body carries five of the ten fields including all three merge-written collections,
and the three content types are **not one case**. On this transport that is no longer a table of
possibilities but a table of **verified facts**:

| Content type | **title/body** write path | **`Status`** write path |
|---|---|---|
| **DraftIssue** | `gh project item-edit --id <DI_…> --title … --body …` — **one** mutation, **both** flags, and **no `--project-id`** | the field-value route |
| **Issue** | the admitted **content mutation `updateIssue`**, addressed by the item's **content node id** — **one** mutation carrying both carriers | the field-value route, **works** |
| **PullRequest** | the admitted **content mutation `updatePullRequest`**, likewise addressed by the item's **content node id** | the field-value route, **works** |

**Every content type therefore has a title/body path, and every content type has a `Status` path.** An
issue- or pull-request-backed entry is **both `Status`-writable and title/body-writable**, and **no
artifact may describe it as partially writable, or as ineligible on its content type**.

**The draft route stays draft-scoped, and its prefix check is why.** `gh project item-edit`'s title/body
route refuses a non-`DI_` id by an **explicit prefix check**, so it is the draft content type's route and
not a general one — which is what makes the second and third rows a **different route** rather than the
same one with a different argument. **The field-value route carries no `DI_` check at all**, which is why
`Status` needs no content-type branch anywhere.

**No content-type refusal survives on the title/body carriers.** An entry backed by an issue or a pull
request is written like any other:

- `/ptp:backlog-edit`'s **pure status transitions** work on such an entry, as they always did — and that
  is now **unremarkable** rather than a consequence of anything;
- its **`title` / `description` / `notes` edits dispatch**, through its content type's route;
- **every settling edit dispatches**, the mandatory `runBaseline` clear being a **body** row that route
  carries;
- the runner's **take dispatches**, WRITE 0's `runBaseline` (a body row) and its `status` commit alike.

**Retiring the refusal removes NO bucket, terminal state, verdict, outcome, stage or skip-and-continue
behaviour.** The runner's **`take-failed` bucket** and its **`store-write halt`** terminal state stand
exactly as they were, and a genuine transport failure still lands in them. What is removed is one
**cause** of landing there: an entry's content type. Nothing downstream is renamed, merged or deleted,
and the runner's own contract text is not this contract's to write.

**There is no missing in-board mutation left to name**, so the refusal that named one is gone with it.
The two fail-closed leaves that **do** refuse before dispatch — an **unrecognized content type**, and a
routable content type for which the compose read returned **no content node id** — are stated once, with
the dispatch table, and neither is that refusal renamed.

**A reversal, recorded rather than deleted: `gh issue edit` / `gh pr edit`.** This contract previously
rejected them **as a decision rather than as an absence**, on **two** grounds, and closed with an
**absolute**: that no write of this backlog's would ever reach a repository issue or pull request. The
two grounds settle **differently**, and collapsing them would misstate what the new capability costs:

- **The coordinate ground DISSOLVED.** It read *they need repository coordinates the board read does not
  publish*. The admitted content mutation needs **none**: it addresses the object by its **content node
  id**, which the read path publishes and which the compose read returns.
- **The blast-radius ground was ACCEPTED, not answered.** It read *they write a real repository issue or
  pull request, outside the board*. That is still exactly true of the route this contract now takes.

**The blast radius, in terms, because it is a cost and not a footnote:** a title or body write on an
`Issue`- or `PullRequest`-backed entry **edits that live repository object** — that is what the dispatch
does **when it lands**, and what it **may** have done when it comes back ambiguous. Whichever of its title
and body the dispatch carried **changes for every viewer**, the edit is recorded in the object's **own
edit history**, and its **subscribers are notified**. And **wherever the dispatch carries the BODY
carrier** — which, by the send-set rule above, is wherever the operation plans a body row — the backlog's
**sentinel-fenced metadata block is written into that object's body**, where it is **visible to everyone
who can see the repository**. A **title-only** edit sends no body and so writes no metadata block; it
still edits the repository object, still enters its history and still notifies its subscribers, so it is
**no less a repository edit** for it. **None of this is undoable by ptp**, which issues no compensating
write of any kind.

**The old absolute is retired AS A REVERSAL, not quietly dropped.** It claimed that no write of this
backlog's would ever reach a repository issue or pull request, and under this contract that claim is
**false**. This paragraph is what stops a later reader taking its absence for an oversight and
reinstating either the absolute or the refusal that served it.

**`gh issue edit` / `gh pr edit` remain rejected AS MECHANISMS.** They address an object by owner,
repository and number — coordinates the board read does not publish — and they reach **nothing** the
admitted content mutation does not already reach by node id. The reversal is about the **capability**,
never about those two commands.

**The report obligation that comes with the capability, in this contract and not a later one:** an
operation that dispatched a content mutation SHALL name, **per entry**, the **content type** and the fact
that a **repository object was edited**. It is a statement of **what happened**, delivered with the
operation's report; it is **never** a pre-write warning and **never** a confirmation prompt, this contract
being non-interactive throughout.

**It is stated at the honesty that entry's OUTCOME supports, and never above it** — the obligation adds a
disclosure, it does not overrule the outcome rules. Where the dispatch **`landed`**, the report states
that a repository object **was** edited. Where it was **`dispatched-then-ambiguous`** or the row settled
**`unresolved`**, the report states that a repository object **may have been** edited and that the store
cannot say which — the same honest floor those outcomes already require, now carrying an **external**
consequence, which is a reason to state it rather than to soften it. Where the row is **`failed`**,
**`not-dispatched`** or **`skipped-identical`**, **no repository edit is claimed at all**. Reporting an
ambiguous content mutation as a completed repository edit is **forbidden**, exactly as reporting it as a
landed board write is. **No refusal anywhere is weakened to make a write path fit.**

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
