> Loaded from skills/ptp-backlog-write/SKILL.md when: composing a carrier write.
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

**Six obligations, and all six bind together:**

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
6. **immediately before the dispatch that carries it, the composed value SHALL be verified to be the
   value that was composed** — **present** rather than absent, unbound or unreadable, and
   **byte-identical to what was composed**, which where a **non-empty** value was composed makes it
   **non-empty** as well. This limb is read over **exactly obligation 2's** notion of byte-identity —
   **trailing** newlines excepted, as obligation 2 already excepts them, so a value differing from what
   was composed **only** in trailing newlines satisfies it. Nothing else is excepted, and the limb is
   **not** otherwise conditioned. A value that cannot be so verified SHALL cause a **refusal before dispatch**,
   never a dispatch of the unverified value. **A value that is empty because it could not be read
   SHALL NEVER be treated as an intentionally empty one.**

**W1's `--body` and W2's `--body` are bound identically.** The create and the edit differ in nothing
here.

**The realization is the transport's, not this contract's.** Under a POSIX shell the form that satisfies
1–5 is a **single-quoted heredoc inside a command substitution** — the quoted delimiter suppressing
every expansion, the surrounding `"$( … )"` making the result exactly one argument, and command
substitution stripping **trailing** newlines only, which obligation 2 already permits. The quoting rules
themselves are the **`gh` transport contract**'s and are **not restated here**; and where that contract
offers a dispatch that does **not** pass through a shell at all, **that supersedes this realization
while obligations 1–6 still bind**.

**Rejected: a temp file plus `--body "$(cat <file>)"`.** Its advantage is genuine and is recorded rather
than waved away — it removes delimiter collision entirely. It is rejected because it **writes composed
backlog content to disk**, needs cleanup on every fail-stop path, and creates an artifact a reader can
mistake for the **second store `ptp-backlog` forbids absolutely**. The nonce check of obligation 5 is
what is adopted in its place.

#### Obligation 6 — the presence guard, and where it sits

**What obligation 6 adds that 1–5 did not is a SUBJECT, not more rigour.** Obligations 1–4 govern how a
value that **exists** is **encoded** on its way to `gh`; obligation 5 governs one construction form's
**delimiter**. **None of them asks whether the value is there.** An **empty string passes every one of
1–4 that anything ever evaluated** — it is exactly one argument, it contains no `\r`, and no expansion
was applied to any of its zero bytes — and it falls outside obligation 5, which is scoped to a body
*carried by a delimited construct*. **Obligation 2 is the one it does not satisfy, and that is exactly
the point**: an empty value where a non-empty one was composed **violates** obligation 2 outright, and it
reached the board anyway because obligation 2 stated a requirement that **nothing anywhere evaluated**.
*Unverified* is the word, never *satisfied*. Obligation 6 is the only obligation whose subject is the
value's **existence and integrity** rather than its **encoding**.

**It is deliberately construction-form-agnostic.** It names no heredoc, no file, no substitution, and no
shell. Whatever composed the value — an admitted form, a form a later change admits, or a form nobody has
thought of — the value is checked at the same moment, against the same standard. **A contract that
enumerated safe forms would have to be re-opened for every new one; this one does not.**

**It also VERIFIES obligation 2, which nothing previously did.** Obligation 2 already requires the
dispatched body to be **byte-identical to the composed value**, which means the operation must already
hold that composed value. It states the requirement and **nothing anywhere checks it**. Obligation 6 is
that check, plus the presence question obligation 2 does not ask — an absent value being trivially not
byte-identical to a non-empty composed one, so presence falls out of the same comparison rather than
needing a second one.

**It binds the TITLE carrier too, on every route.** *One dispatch carries both the item's content title
carrier and the item body carrier, on every content type* — so a guard covering only the body would leave
the **other carrier of the same dispatch** unguarded, and an empty title blanks a live issue's title
exactly as an empty body blanks its body. The guard's subject is therefore **both composed carrier values
that dispatch carries — the title carrier as well as the body carrier**, on every route. It reaches no
**further** than that: W3's `status` commit dispatches a **resolved option id** rather than a composed
carrier value, so the status-write machinery is untouched. This section keeps its name because the `gh`
transport contract cites it **by name**; the extension is stated here rather than by renaming it.

**Emptiness is admissible only when it was COMPOSED — an empty value is never self-certifying.** The
operation must hold, **from the composition step**, the fact that the value it composed was empty. **That
fact has a provenance requirement, and without it the guard admits the very incident it is written for**:
it SHALL come from a composition step that **completed successfully and produced no content**, and it
SHALL NOT be derived from the value the dispatch is about to carry, nor from any read, materialization or
substitution that **failed, could not be completed, or produced its result by default**. A step that
yields an empty value **because it went wrong** has composed **nothing**, not an empty value, and the
operation holds no such fact. Given
that fact an empty value at dispatch **is** byte-identical to what was composed and is dispatched
normally — and a **non-empty** value at dispatch is not, and refuses, the byte-match limb binding in
that direction too. **Absent** that fact an empty value at dispatch is an **unverifiable** value and
refuses. That is the whole of *never conflate empty-because-unreadable with
intentionally empty*, and it is what keeps obligation 6 from degenerating into a blanket *no empty bodies*
prohibition — which would be **wrong**. An entry whose `description` is empty and for which the
**inherited** body grammar's sentinel-pair conditions are **all** unmet is a legitimate state the store
must be able to hold: no sentinel pair is written, there is **no block at all**, and the composed body is
genuinely empty. **Those conditions are `ptp-backlog`'s and are not enumerated here** — in particular the
absence of a non-empty block-carried field is **not** on its own enough, that grammar writing the pair for
**preserved text bound to the region** as well, so an entry carrying in-region prose or post-`end` text
composes a **non-empty** body and never reaches this case. (Cited, not restated: the grammar is
`ptp-backlog`'s, and only that grammar decides when the pair is written.)

Two consequences, stated so neither is discovered the hard way:

- **The mandatory `runBaseline` clear is untouched.** That clear is a **block key emitted with its empty
  value inside the composed body**; the **body** is not empty, and the guard's subject is the **carrier
  value**, never a constituent of it. No settling edit and no `/ptp:backlog-continue` resume write is
  affected by obligation 6.
- **An empty composed TITLE always refuses, on every route.** This is a **rule about that carrier**, not
  a derivation from the paragraph above, and it must not be read as one: `ptp-backlog`'s schema makes
  `title` **non-empty**, so *composed empty* is an **inadmissible input** on this carrier rather than the
  admissible-emptiness case — the **non-empty** limb therefore binds it **unconditionally**, alongside the
  byte-match limb, and no provenance fact can license an empty title. Stated any weaker, the guard would
  admit a title the **composition step itself** emptied. This **strengthens** — and does not contradict — the note above that `gh`'s own
  `--title` requirement on `item-create` *adds no new refusal*: that note is about the **creation** path
  and about a **composition rule upstream of this contract**, while obligation 6 is a different check at a
  different moment on **all** routes. It is the first thing anywhere that would notice an **edit**
  composing an empty title, which a create-only flag requirement cannot reach.

**Where it sits among the pre-dispatch machinery — four steps, FOUR DIFFERENT SUBJECTS, never merged:**

| # | Pre-dispatch step | Its subject |
|---|---|---|
| 1 | the **pre-dispatch snapshot**, and every state-derived refusal computed on it | the **board's** state |
| 2 | the **pre-write field check** — two categories, and no third | the **board's** value of a checked field, against the snapshot's |
| 3 | the **compose read** — three purposes, and explicitly not a check | the **board's** current carrier contents |
| 4 | **obligation 6's presence guard** | **ptp's OWN composed value** |

**It is strictly last, and necessarily so** — the composed value does not exist until the compose read has
produced the constituents it is composed from — so there is no ordering to negotiate and no rule above it
moves.

**It reads no board state and adds no round trip.** **Both of its operands are ptp's own**: the value the
dispatch is about to carry, against the composed value the operation **retained at the composition step**
and has held ever since. Neither operand is read from the board, which is what makes the comparison
non-trivial without costing a round trip — *against itself* means *against ptp's own retained value*, and
never *against a value taken from the same place the dispatch takes it*, which would compare nothing.
**It is therefore not a third check in the sense *Why there is no third check* forecloses**: that claim is
about **which board fields are COMPARED** to decide a halt, and its four-bucket table is **unchanged** —
no field becomes checked, and `title`, `description` and `notes` remain in the written-but-excluded bucket
for the reason recorded there. **It does not weaken the snapshot rule** either: every *decision* still
binds to the snapshot, and this guard makes no decision about board state and consults none. **And it is
not a lock** — the one-round-trip residual is unchanged in kind, the guard narrowing the window between
*value composed* and *value dispatched* while claiming nothing whatever about the board.

**It does not duplicate the compose read's failure path; the two are DISJOINT BY TRIGGER.** Where the
compose read **could not be completed**, that path has already halted and reported and the guard is never
reached — so that fact is reported **once**. Where the compose read **succeeded** and the composed value
nevertheless did not arrive intact at the dispatch, the compose-read path is silent **by construction**
and the guard is the only thing that speaks.

**Obligation 5 and obligation 6 do not overlap either**, both saying *verified before dispatch*: 5 asks
whether the **body contains** a chosen delimiter and is scoped to delimited constructs; 6 asks whether the
**value is the composed one** and is scoped to none.

**A guard refusal is an ORDINARY pre-dispatch halt and adds no machinery.** Nothing is sent, so **every
non-`skipped-identical` row of that dispatch — both carriers' rows — is `not-dispatched`**, by the
backwards-halt rule read at **dispatch** granularity exactly as every such rule in this contract is; and
the verdict is **`refused`** where nothing had been dispatched and **`uncommitted-partial`** otherwise.
The report names **the carrier whose composed value could not be verified** and **which limb failed** —
absent, empty where a non-empty value was **composed or required** (the `title` carrier's unconditional
non-empty limb being the *required* case, and it covers a title the composition step **itself** emptied),
or differing from the composed value — and reports it
as a **composition defect**: never as a board problem, never as a configuration problem, and **never as a
difference**, no board value having been observed to differ. **No new outcome, verdict, stage, carrier or
journal column is added**, exactly as the two fail-closed route/address leaves add none.

---

# The re-read rules — never a blind write
