> Loaded from skills/ptp-backlog-write/SKILL.md when: dispatching the existence, payload and commit stages of a write.
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
