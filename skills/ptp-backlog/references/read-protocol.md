> Loaded from skills/ptp-backlog/SKILL.md when: reading the backlog board.
## Read protocol

Read-only. **There is no write protocol here**: how a write is dispatched onto the board — the ordered
write sequence, the two re-reads, the journal and its verdicts — is **`ptp-backlog-write`'s**, and its
absence from this contract is deliberate rather than an omission.

```
READ:
  0. CONFIGURATION COMPLETENESS FIRST — resolve `backlog.*` through
     `ptp-github-projects-gh` and read its verdict. Then, in this fixed
     order, REFUSE non-silently on any of TWO grounds:
       (1) the configuration is INCOMPLETE — naming the missing keys;
       (2) the RESOLVED status-option table COLLIDES — merge the verdict's
           `statusOptionOverrides` onto the built-in default table and apply
           the collision rule above, naming `backlog.statusOptions`, the
           colliding name, and every status claiming it.
     Both are decidable from CONFIGURATION ALONE, so both precede
     the preflight and precede every board call. NO `gh` command is run.
     This is NOT the preflight.
  1. Run `ptp-github-projects-gh`'s capability preflight.
       a verdict that does not admit the read → terminate through THAT
       skill's non-silent STOP, cited and never restated here.
       a verdict that admits the read → continue.
  2. Fetch the PROJECT itself:
       gh project view <backlog.projectNumber> --owner <backlog.projectOwner> --format json
     → .title (project title) · .url (project URL) · .shortDescription and .readme
       (the two strings the version marker may live on) · .id (the PROJECT node
       id, an input to the write path) · .owner.type ("User" | "Organization"),
       which SELECTS THE ROOT of the raw read in step 2b — that read entering
       through the organization root or the user root explicitly, the porcelain's
       owner-agnostic form having no raw equivalent
       · .items.totalCount and .fields.totalCount, which SIZE the two list reads
       below. This is the only source of those values; none is inferred from the
       items and the URL is never composed.
       not obtained → the `unreachable-store` outcome. STOP.

  3. Fetch the BOARD FIELDS, before any item call:
       gh project field-list <number> --owner <login> --format json
                              --limit <max(.fields.totalCount from step 2, 1)>
     Reconcile (.fields | length) against .totalCount per *Explicit limits and the
     totalCount reconciliation* below. Then establish, over the returned field
     descriptors and under THIS contract's own normalization (case-insensitive,
     surrounding whitespace trimmed, nothing further inferred):
       · the `Status` field's PRESENCE        → absent ⇒ `malformed-file`, FATAL
       · .type == "ProjectV2SingleSelectField" → otherwise ⇒ `malformed-file`, FATAL
       · a normalized-name COLLISION           → `malformed-file`, FATAL, naming both
       · a FLATTENED-KEY COLLISION             → `malformed-file`, FATAL, naming both
         (*The item object's flattened field keys* below)
       · .totalCount > 100                     → `unparseable-file`, FATAL (same section)
       · the `Status` field's NODE ID          → returned by the read
       · its OPTIONS as {id, name}, in board order, names UNNORMALIZED → returned
       a page not obtained → the `unreachable-store` outcome. STOP.

  2b. Fetch the ITEMS, in two parts:
       gh project item-list <number> --owner <login> --format json
                             --limit <max(.items.totalCount from step 2, 1)>
     — NO `--query` is ever passed: it is a membership test by another name, it is
       host-gated, and under it `.totalCount` counts the FILTERED set, which would
       make the reconciliation self-fulfilling.
     Reconcile (.items | length) against .totalCount, same rule.
     This returns the NON-ARCHIVED items only, and carries NEITHER board stamp —
     both being gh's selection set rather than an API limit.
       then, in ONE `gh api graphql` QUERY — one query shape rather than two,
       re-issued once per page round because a cursor only comes back with a
       completed response — TWO ALIASED item connections over the same project,
       each passing an EXPLICIT page size PINNED AT THE CONNECTION MAXIMUM of
       100 — the raw surface returns nothing at all for a connection given
       neither a forward nor a backward page size, so the explicit-limit rule
       below binds here too, and pinning it at the maximum is what leaves the
       traversal no limit to re-size (the no-retry rule below) —
       each advancing on its OWN cursor until hasNextPage:false and each
       reconciled against the LOWEST totalCount that alias reported across
       the rounds of its OWN traversal — a traversal spanning several rounds
       may see the count move in either direction on a live board, which is
       the same benign race the join tolerates and is NOT itself a defect,
       and that floor is the tightest bound no such race can violate:
         `all`      — items(archivedStates: [ARCHIVED, NOT_ARCHIVED],
                            orderBy: {field: POSITION, direction: ASC}),
                      selecting id · isArchived · createdAt · updatedAt
                      for EVERY item: the roster and the stamp source. It
                      also selects, of the content, its TYPE NAME and its OWN
                      `id` and NOTHING ELSE — no title and no body — so that a
                      NON-ARCHIVED item, whose winning payload is the
                      porcelain's, has a source for `handle.contentNodeId`
                      with NO additional per-item call. `content` is a UNION,
                      on which nothing but the type name is selectable
                      directly, so that `id` is selected INSIDE ONE INLINE
                      FRAGMENT PER CONTENT TYPE this transport exposes — the
                      same union argument the second alias makes; a bare
                      `content { __typename id }` is NOT a valid shape and is
                      not what this prescribes. That TYPE NAME is selected
                      ONLY to enumerate the union's fragments and is NOT a
                      content-type source: an item's content type still
                      comes from the row the join resolved it to, so the one
                      content-type rule the second alias's aliasing exists
                      to preserve still reads that alias and the porcelain
                      and no third source. It still selects none of the
                      CONTENT THE PORCELAIN ALREADY RETURNED IN FULL, which the
                      type name and the content's own id are not. Nothing else
                      is added to it: no title, no body, no new call and no new
                      page round.

                      THE `all` ALIAS IS ALSO THE CANONICAL ORDER'S ONE
                      SOURCE. Its `orderBy` is passed EXPLICITLY and is
                      never left to a transport default, on the same
                      ground as the explicit-limit rule below: a read
                      never rests on a default it did not state.
                      `POSITION` is the ONLY value the order field
                      admits, so the argument names the board's own item
                      order and nothing else. Each item's POSITION IS
                      THE INDEX IT ARRIVED AT in this traversal, the
                      page rounds concatenated in the order they were
                      issued — `ProjectV2Item` exposes no position
                      field, so arrival order is the only form the fact
                      has. That rank is held OUTSIDE the entry objects,
                      exactly as `handle.contentNodeId` is, and it
                      materializes as the ORDER OF THE RETURNED `epics`
                      ARRAY and nowhere else: no entry field is added,
                      and no carrier is touched. The order is the
                      PROJECT's item order; a board VIEW's own sort or
                      grouping is not exposed by this surface at all,
                      and where a view carries NO SORT OF ITS OWN — the
                      default — the project's order IS the column's
                      visible top-to-bottom order. GROUPING by `Status`
                      is what makes the column exist and does NOT
                      reorder inside it; only a view's own SORT
                      displaces this order. The `archived` alias takes
                      NO `orderBy`: it is joined by node id and
                      contributes no rank. An item a live reorder
                      causes this traversal to return TWICE takes its
                      FIRST arrival index and its later arrivals are
                      IGNORED — the same benign race the join already
                      tolerates, settled here rather than left to the
                      reader, so that "the index it arrived at" names
                      exactly one index for every item and the key
                      stays TOTAL over the produced document.

         `archived` — items(archivedStates: [ARCHIVED]), selecting id · content
                      · the single-select field values: the content and status of
                      exactly the items the porcelain could not return. These rows
                      are NOT flattened, so an archived item's `Status` is the
                      single-select field value whose FIELD NODE ID equals the one
                      step 3 returned — matched on that id, never on a name and
                      never on a position — and its option NAME then enters the
                      resolved option table by the same match as any other row.
                      No such value is the same *no `Status` selected* state as a
                      missing flattened key on a non-archived row.
       THREE SELECTIONS THIS SECOND ALIAS MUST CARRY, all load-bearing and
       none supplied by default — `content` is a UNION on the raw surface, so
       it has NO default field set and every value below is selected
       explicitly or is not returned at all:
         · the content's TYPE NAME, aliased onto the SAME key the porcelain
           writes it under, so one content-type rule reads both sources; the
           raw surface names it `__typename` and carries no `type` field, so
           without the alias every archived entry loses its content type and
           with it the write path's per-content-type refusal;
         · the content's TITLE and BODY, on EVERY content type this transport
           exposes, plus the CONTENT'S OWN NODE ID, likewise on EVERY content
           type this transport exposes — `id` selected INSIDE the `Issue` and
           `PullRequest` INLINE FRAGMENTS exactly as it already is inside
           `DraftIssue`, a union being enumerated per type — which is this
           alias's source of `handle.contentNodeId`. Without the first two an
           archived entry reaches `epics` with no title and none of the five
           body-carried slots; without the third an archived draft, issue or
           pull-request item's handle reads `null` although this transport
           exposes that content — a false negative, not a gap. A selection
           carrying the id inside one fragment and not the others is
           NON-CONFORMANT on exactly that ground;
         · on each single-select value, its FIELD's NODE ID, which is the only
           thing the `Status` value is selected by (step 3's id) — never a
           name, never a position, these rows not being flattened.
       A raw read that omits ANY of the three is NON-CONFORMANT: it would bind
       archive reachability while returning archived entries the contract
       cannot place — the partial archived read a `true` binding forbids.
       a page not obtained, or a loop not reaching hasNextPage:false
         → the `unreachable-store` outcome. STOP.
       a loop that DOES reach hasNextPage:false but whose accumulated rows
       still fall short of that LOWEST observed totalCount
         → the `unreachable-store` outcome, DIRECTLY and with NO retry. The
           re-issue-once step above belongs to a limit-bounded list read, which
           has a limit to re-size; a cursor traversal is already the exhaustive
           form that step exists to reach, so there is nothing to retry with.

     Step 3 runs BEFORE step 2b, and the labels are deliberately NOT renumbered:
     every CARRIER `malformed-file` decision — presence, type, and both collision
     rules — is a property of the FIELD LIST and is taken before any item call, so
     a board defect can never be laundered into a transport error. (The
     VERSION-MARKER `malformed-file` is not one of these: it belongs to the
     version gate at step 4, unmoved.) And "step 3" (the option data a read returns) and
     "step 2b" (the item fetch) are cited by name elsewhere. Prose cites a step by
     what it does, never by its position.

  4. Apply the VERSION GATE.
  5. VALIDATE. Readers report the problems; writers apply writer
     eligibility below.
  6. Return the document — its `epics` in the canonical order the `all` alias's
     traversal fixed, together with WHICH of them that traversal returned no
     row for and which therefore carry NO POSITION, that being the one
     positional fact the array order cannot express — the problem list, the
     unavailable mask, the
     handle table, the `Status` field's NODE ID together with its
     options as {id, name} pairs, verbatim and in board order, as read
     at step 3, and the PROJECT's own node id as read at step 2.
```

#### Explicit limits and the `totalCount` reconciliation

**Every list read passes an explicit limit, and an invocation that omits one is non-conformant.** The
resolved transport's list commands default to **30** results, stop there, and exit **successfully** — so
a backlog of forty entries reads as thirty, with no warning and no error, and a short read is
**indistinguishable from a small board**. The only in-band evidence is the `totalCount` each response
carries beside its rows.

The rule, applied to the field read and the item read alike:

1. pass a limit of `max(<the matching totalCount from the project read>, 1)`. The `1` floor is required
   because the transport rewrites a **zero** limit to its default of 30, so an empty board would
   silently request thirty rows;
2. compare the returned row count against **that response's own** `totalCount` — never against the
   project read's, which was taken at an earlier instant;
3. on a shortfall, **re-issue once** at the returned `totalCount`;
4. a shortfall after that re-issue is the **`unreachable-store` outcome**, under this contract's
   existing *the paged fetch did not complete* condition — never a short board and never an empty one.

**A board carrying the required field and no items still returns rows and a `totalCount` of zero, at a
successful exit**, so the reconciliation passes trivially and *no entries yet* keeps its single legal
source. The transport's own "no results" error is unreachable on the JSON path and must not be treated
as an empty-backlog signal.

#### The join — three row sets, one entry set

Step 2b produces **three** row sets, read at three instants against a live board: the non-archived rows,
the **roster** (every item's id, archive flag and both stamps), and the **archived** rows. They are joined
**on the item's node id**, and the join resolves each id to **exactly one row before any carrier is
read**, so every produced entry still reads each of its fields from **one** payload and no entry field is
assembled from two:

| Situation | Binding |
|---|---|
| a **roster** id with no row in either content set | **skipped** — a card created, archived, or unarchived between the calls. It cannot be assembled, and the next read sees it whole. It is **not** the no-interpretable-content `unparseable-file` above, which is a **returned row** whose content could not be interpreted rather than a row that was never returned |
| a **content** row with no roster row | produced, with `createdAt` and `updatedAt` reading **`null`** — the *a stamp the transport omits* case *Timestamps* above already states is **not** a defect — and with **no position**, the roster being the canonical order's one rank source, which the canonical order already places **after** every entry that has one |
| an id in **both** the non-archived rows and the archived rows | the **archived** row wins, as the **later** observation — the raw read being issued last |

**Both stamps come from the roster and from nowhere else**, the non-archived read carrying neither. And
**`isArchived` comes from the roster** wherever a roster row exists — one authoritative source, read last
— and **by construction of the source connection** otherwise: `false` for a row that came only from the
non-archived read, whose connection returns non-archived items alone, and `true` for one that came only
from the archived alias. There is no third case, and the flag is **never** derived from how many archived
rows came back — that is the inference *Degraded scope* below forbids, and it is forbidden here in the
same words.

**`handle.contentNodeId` comes from the row the join already resolved that item to.** Both the roster and
the archived alias can return a coordinate for the same item, and where both do they return **the same
value** — it is the content object's own node id in either payload. The **winning row's** coordinate is
authoritative, and the roster is the source **only** for an item whose winning payload carries none —
today, every **non-archived** item, whose winning payload is the porcelain's. This assembles **no entry
field from two payloads**: the coordinate is a **handle**, kept **outside** the entry objects, and the
one-payload rule above governs **entry fields** and is unchanged by it.

**The join is deliberately tolerant rather than fail-closed, and the asymmetry is the reason.** What a
fail-closed rule would catch here is a **benign race on a live board**, and its cost would be an
`unreachable-store` on a healthy board every time a human touches a card mid-read. The direction that
*is* fail-closed is the one that matters: a raced card that came back without a **roster row** carries no
**position**, so it **orders last** and can never reach the **head** of the ready set — the place the
whole degraded-scope machinery exists to protect. This contract's determinism claims are already scoped to **the produced document** rather than to
the board over time, so a race changes *which* document is produced and nothing about what is computed
from it.

**Three absolutes.**

- **The read creates nothing** — no project, no custom field, no `Status` option, no item, no version
  marker. This is the board analog of the file contract's *no read ever creates the file*.
- **The read writes nothing**, modifies nothing, and deletes nothing.
- **A missing required field is reported, never created**, and a defect is reported, never repaired,
  never overwritten, never worked around.

### Why the completeness verdict is step 0 and not part of the preflight

`ptp-github-projects-gh` is explicit that a `ready` verdict means *the preflight ladder passed* and
says nothing about whether a board was **named** — board identity is the configuration contract's
separate completeness verdict. So an unset `projectOwner` / `projectNumber` passes the preflight
untouched, reaches the transport, and comes back as project-not-found: a transport error standing in for
a one-line config fix. Folding the two together loses that distinction, which is why the refusal is
**this** contract's obligation — a resolver that never stops cannot itself refuse.

**Step 0 is discharged by the consuming command's own numbered step or precondition, not by this
pseudocode alone.** A gate stated only here is reachable only by a reader who has already entered this
read protocol — and this protocol's own step 1 **is** the preflight, so "before the preflight" and
"inside this protocol" are the same place. Every `/ptp:backlog*` command therefore takes this gate as a
**step or precondition of its own**, ahead of consulting this skill and ahead of its branch guard, and
**names** the two grounds without restating them.

**The ordering claim is exact:** the gate is the first action that reaches the **store**, the
**transport**, or the **worktree**. A command's own local argument, mode and posture checks keep their
existing position **ahead** of it — `/ptp:backlog-run` resolves `codex.mode` and parses `rounds:` first,
`/ptp:backlog-continue` classifies its invocation first, and the two `model:`-taking writers parse and
validate their arguments first — so a malformed override token is still reported as a malformed token
rather than masked by a configuration refusal. Do not read the claim as "first action" or "first
non-argument action"; both are false of the commands just named.

This paragraph **records** the obligation. It adds no ground and changes none, and it does **not**
renumber this protocol's steps: every command cites **step 0** by that number.

### What a read returns

Four things, deliberately separate:

1. the **document** `{ version, epics }` in the in-memory shape the validator and the ready set consume
   unchanged, plus the ordered **problem list**, the **unavailable mask**, and the **positionless set** —
   the node ids of the entries the ordered roster traversal returned **no row for**, which the canonical
   order places last. The set carries **no rank and is not one**: the rank itself still materializes as
   the `epics` order and nowhere else, and this is the complementary fact — *which entries have none* —
   which the array order cannot express and which `/ptp:backlog`'s scope note is obliged to report. It
   is empty on a board no race touched, and an entry's presence in it is **not** a defect and raises no
   problem code;
2. a **handle table keyed by the board item's node id** —
   `nodeId → { contentType, isArchived, contentNodeId }`, where `contentType` is the item's content type,
   `isArchived` is the item's own archived flag, and **`contentNodeId` is the node id of the object the
   item's content is, published on every content type the transport exposes — draft issue, issue and pull
   request alike**;
3. the **`Status` field's node id, and its options as `{ id, name }` pairs, verbatim and in board
   order** — the values step 3 already read in order to map the carrier;
4. the **project's own node id**, as read at step 2.

The handles stay **outside** the entry objects, so the entry model gains no store-specific field for
unknown-key preservation to reason about.

**The fourth is returned for the same reason as the third and on the same terms.** It describes the
**board**, not any item and not any field, so it belongs in neither of the first two. It is returned
because the write path needs it — it is the project coordinate `ptp-backlog-write`'s commits take — and
because **the project read is the only place it is free**: a consumer that had to obtain it would have to
issue a second project call for one string. Like the third, it is **returned rather than re-fetched**, and
no consumer may make a board call of its own for it.

**The third is returned rather than re-fetched, and it is neither a document value nor a handle.** No
entry carries it — it describes the **field**, not any item — so folding it into either of the first two
would misplace it. It is returned because two consumers need it and **neither may make a second board
call for it**: the view's **missing-status-option advisory** (above), which is only free because the
options are already in hand, and `ptp-backlog-write`'s **selection of which option a `status` commit
writes** together with its refusal when the resolved row identifies no option or more than one — a
refusal that binds to the pre-dispatch snapshot, which is a re-read through **this** protocol. The names
are returned **unnormalized**: normalizing here would destroy the exact spelling both the advisory and
the write refusal must print back to the user.

The table is keyed by the node id, **which is also the entry's `id`**, so the justification is trivially
true: every entry has exactly one, no two entries share one, and no derived second lookup exists or is
needed.

**There is no second identifier, and that is the point.** The board item's node id is the entry's
**identity** *and* the **address** the transport's item-scoped writes take, so nothing is translated,
nothing is substituted, and no handle cell holds an **item** address. That is why the table carries no
separate item-address cell distinct from `contentType` and `isArchived`. A **content node id is not an
item address**: it addresses the **content object** through a **content-scoped** route, it grants no
item-scoped write, and it is never passed anywhere an item id is expected.

**`contentNodeId` is a different value and is not an alternative identity.** A content-scoped write
addresses the **content object** rather than the board item, so that object's own node id has to reach
the write path — and the item payload the read already fetches carries it, making the read the only place
it is free. It is published on **every content type the transport exposes** rather than on one of them.

**A `null` cell means exactly one thing: the read obtained no content node id for that item.** It is not
a content type, not a refusal, and not a writability verdict, and no consumer may infer any of the three
from the cell's presence, absence or value — the content type is taken from the handle's own
`contentType`, and the authoritative content type remains the one the compose read returns immediately
before dispatch. The cell stays **present and `null`** rather than absent, so *no content node id for this
item* stays distinguishable from *this handle was never populated*. A `null` cell on a returned,
interpretable item raises **no problem code** and is no new fatal; an item returned without interpretable
content remains the existing fatal, unchanged. What the board's write surface offers per content type,
and what refuses, is the **write-surface contract's** to state and is never derived from the presence or
absence of a handle cell.

**The option `id`s are returned alongside the names because the write path takes an id.** The names stay
**unnormalized** for the advisory and the write refusal, exactly as before; the ids are carried because
the field read is the only place they are free, and because selection still matches on the **name**
through the resolved table — matching on an id would put opaque board-generated strings into
`backlog.statusOptions` and take that key out of the user's hands.

### Degraded scope — when archived items are unreachable

The state: the resolved transport can enumerate items but **cannot return archived ones**. That is a
**transport capability limit, not a document defect**: it raises **no problem code**, and the read still
proceeds, because a view that refuses over a limit it can describe is useless.

**Exactly one thing is withheld, and the view says why: the ready set.** An incomplete `ready` set can
put the **wrong entry at the head** of the canonical order, and the head is exactly what a runner
consumes. This is an **additional** withholding condition standing alongside the problem-based one, not
a re-derivation of it: the inherited suppression rule is one-directional (*display a ready set only when
free of fatal and structural problems*), so it bounds when a ready set **may** be shown and never
obliges showing one. **Nothing else is withheld**, there being no allocation left to withhold.

Everything else is still reported. The criterion is **soundness over a subset**: each surviving code can
only ever be *missed* when an entry is unreturnable, never manufactured. The residual is stated rather
than hidden — **an archived entry is not seen at all** — and its only consequence is on the order, and
therefore on the order's head, which the withheld ready set already bounds.

**Deliberately not claimed: that degraded scope makes the store writer-ineligible.** It raises no problem
code, and writer eligibility refuses only past a **fatal** problem — which this state does not produce.
What *is* established is narrower and sufficient: **a writer that consumes the ready set cannot
proceed**. Which writers those are is the write path's question, answered by `ptp-backlog-write`'s own
derivation rule.

**How the read knows.** Archive reachability is read from `ptp-github-projects-gh`'s preflight record —
its `archiveReachable` fact — and is **never inferred from the result set**: a complete fetch of a board
with no archived cards returns exactly what an archive-limited transport returns, so "zero archived items
came back" establishes nothing. Per that skill's own consumer rule, **only `true` establishes full
scope**; `false` and `"unknown"` are treated **identically** as *not established* and both degrade, the
two being distinguished only so the reported reason is honest. Where the record publishes no such fact at
all, the read degrades rather than claiming a scope it cannot establish — withholding costs a user a
ready set, whereas wrongly assuming full scope costs them a runner taking the **wrong epic**.

**Archive reachability is a property of the resolved transport, not a constant of GitHub Projects, and
this machinery is retained for transports that lack it.** Where a transport can address the item
connection's archived-state filter directly — as one that admits a raw GraphQL read can — archived
items come back **whole**, `archiveReachable` is `true`, and **this section's withholding does not
fire**: the ready set is produced, an archived item is an ordinary entry in the canonical order, and a
consumer of the ready set proceeds. **Recovering only an archived item's stamps would not be enough and
must not be mistaken for enough** — an archived entry reaching `epics` with no `title` and no `status`
raises two `malformed-entry` problems, which are structural, which withholds the ready set anyway. A
transport establishes reachability only when it returns archived items **as complete entries**.

Nothing above is relaxed by this: **only `true` establishes full scope**, `false` and `"unknown"` are
still treated identically, and reachability is still **never inferred from the result set**.

### Concurrency

**No locking.** Backlog edits are user-driven and sequential; concurrent writers are out of scope, and a
backlog runner is **forbidden from fanning out** across epics. (`ptp-parallel-fanout` owns fan-out rules;
this contract only notes that the runner is not permitted to use them.)

**Never a blind write.** Every future writer **re-reads the board immediately before modifying it**, and
must not carry an in-memory document across an operation that could have been interleaved with a human's
edit in the GitHub UI. There is no lockfile and no version control to fall back on — see *The store*.
