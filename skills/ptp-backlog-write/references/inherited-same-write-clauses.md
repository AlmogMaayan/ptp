> Loaded from skills/ptp-backlog-write/SKILL.md when: resolving an inherited in-the-same-write clause.
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
