---
name: ptp-backlog
description: Own the epic backlog board contract, its entry model, read protocol, validator, and ready set
---

**Owned commands.** This skill is the owning skill of the following commands, whose directories
are not `skills/ptp-<name>/`, so ownership is declared here on the owner's side:

Owns command: /ptp:backlog-add
Owns command: /ptp:backlog-edit

# ptp-backlog — the epic backlog board and everything that defines it

## Purpose

**Model dispatch target.** `/ptp:backlog-add` and `/ptp:backlog-edit` run this skill's work at `opus.high` — or at the caller-side `model:<model>.<effort>` override token when one was supplied — via `ptp-run-at-model` (`skills/ptp-run-at-model/SKILL.md`), which owns the spawn-and-relay mechanics and requires its caller to supply the target. This names the target only; it restates none of that contract.

ptp has no durable place to record the epics a user intends to build *before* they become change
folders. The epic backlog is that place, and it is a **GitHub Projects v2 board**. Because a view, an
editor, a recovery gate, and a runner will all read and write that one store, classify the same
defects, and need the same ready-set answer, the store's contract has to live in **exactly one** place.

This skill is that place. It is the single source of truth for the epic backlog's store: its identity,
its entry model, the mapping of that model onto board carriers, its version marker and gate, its read
protocol, its **identity rule**, its validation vocabulary, and its ready-set definition. It is the
backlog analog of `ptp-branch-guard` (branch safety), `ptp-codex-mode` (the reviewer gate),
`ptp-agent-roles` (role resolution), and `ptp-parallel-fanout` (fan-out safety): **commands reference
this contract rather than restating any part of it.** A command that needs the field list, the problem
codes, the identity rule, or the ready-set rule cites this skill; it does not copy them, because four
commands each carrying their own copy of a ten-field schema and a four-code validator *is* the
enumeration drift ptp's config contract already forbids.

The **transport** — which board, as which `gh` account, and whether the transport can reach it — is
`ptp-github-projects-gh`'s, not this skill's. This contract **cites** it and restates
none of it: not the `backlog.*` keys, not the `gh` surface, not the preflight ladder, not the preflight,
not its record, and not its STOP message.

This skill is a **pure prose contract**. It states obligations; it performs none of them. It reads no
file on its own, writes no file, runs no git command, and edits nothing.

## Section index

Operation-scoped sections of this contract live in `references/`, each loaded on its own
trigger rather than with this file:

- `skills/ptp-backlog/references/the-board-mapping.md` — loaded when mapping an entry field onto the board carrier that holds it.
- `skills/ptp-backlog/references/read-protocol.md` — loaded when reading the backlog board.
- `skills/ptp-backlog/references/validation.md` — loaded when validating an entry before a write.
- `skills/ptp-backlog/references/status-transitions.md` — loaded when changing an entry status.
- `skills/ptp-backlog/references/recovery-and-reconciliation.md` — loaded when recovering an entry left in a stale in-progress state.

## The store

**The backlog is one GitHub Projects v2 board per workspace root**, resolved through
`ptp-github-projects-gh`'s `backlog.*` configuration and admitted by its capability preflight. That
configuration resolves at the **resolved workspace root** — through the layered contract
`ptp-workspace` owns, cited here and not restated — so a second workspace in the same repository
carries its own board **without any repository-level edit**, and a repository whose workspace root
**is** the repository root resolves the same single board it resolves today.

**There is no local backlog file, no second store, and no fallback.** No ptp command reads, creates,
modifies, or deletes a local backlog file. No failure path — not an incomplete configuration, not a
failed preflight, not an unreachable board, not a fatal problem — may fall back to a local file or to
any other store. A fallback would split one backlog across two stores, which is the one unrecoverable
outcome this contract exists to prevent.

**Nothing assumes the board is backed up.** The file contract never assumed version control could
recover a lost write, and a board inherits the weaker position: there is no snapshot, no history a
reader can consult, and one click deletes a card. So **no rule in this contract may rely on recovering a
lost or overwritten backlog write** — every safeguard has to be a refusal *before* the write, never a
repair after it.

**This contract creates nothing.** The read creates no project, no custom field, no `Status` option, no
board item and no version marker; a missing required carrier is **reported, never created**. Only **one**
custom field must pre-exist for a board to be usable, and how a user creates it is a one-time setup
documented in the README, not an operation ptp performs.

## Schema (v1)

The schema is the shape of the **in-memory document a read produces**. It is not a file format: the
board's carriers are specified under *The board mapping* below, and nothing here is serialized to disk.

### Top level

Exactly two recognized keys:

```jsonc
{
  "version": 1,
  "epics": [ /* entry objects, in the canonical board-position order */ ]
}
```

| Key | Type | Source | Notes |
|---|---|---|---|
| `version` | integer | the board's version marker (*Version marker and gate* below) | Exactly `1` in v1. No candidate anywhere ⇒ `1`, synthesized in memory. |
| `epics` | array of entry objects | the board's items — **every one of them is an entry** (*Every board item is an entry* below) | May be empty. Ordered by the canonical key below — the board's own **item position**, which is what the arrangement of a column top-to-bottom means **wherever the view applies no sort of its own** (*Order* below states that bound); never a creation stamp, and never a view's own sort. |

**The `epics` order is total, which a file's array position made free and a board does not.** The
canonical key is: **the board item's position, ascending; an entry with no position — one the ordered
traversal did not return — orders after every entry with one; the node id ascending by Unicode code
point of its canonical JSON serialization is the final tie-break in every case.** That last component is
what makes the order total: two entries can be positionless, but never share a node id.

**Position is the order a human arranges by hand, and that is the point.** A card dragged to the top of a
column — in a view that applies no sort of its own, the bound *Order* below states — is a statement about
what should run first, and this key is what makes ptp read it. The key is
deliberately **not** a date: no creation stamp, no update stamp, and no other time-derived value takes
part in it, at any tie-break depth.

**A position is an *ordinal*, not a field value, and the difference is load-bearing.** GitHub's
`ProjectV2Item` exposes **no** position field: the board's order is observable only as the **order a
connection returns items in**, so an entry's position is the **index it arrived at** in the one ordered
traversal *Read protocol* below pins for that purpose — never a value read off an item, and never a
number ptp stores. Two entries returned by one traversal therefore cannot share a position; what two
entries *can* share is having **none**, and the node-id tie-break settles exactly that case. Only the
node-id component is compared by code point, and it says so in place.

### Entry object

**Ten** recognized fields. This is the **canonical key order** — writers emit exactly this order:

| # | Field | Type | Required on read | Empty value | Written by |
|---|---|---|---|---|---|
| 1 | `id` | string, opaque board node id | **yes** | — | **nobody — board-supplied** (*Identity* below) |
| 2 | `title` | string, non-empty | **yes** | — | add / edit |
| 3 | `description` | string | no | `""` | add / edit |
| 4 | `status` | enum | **yes** | — | add sets `backlog` (wired in `0046_02`); transitions below |
| 5 | `changeEpics` | array of `{ id, attribution }` | no | `[]` | runner (`0036_04`), reconciliation (`0036_03`) |
| 6 | `attributionWarnings` | array of 4-digit change-epic prefixes | no | `[]` | runner (`0036_04`) |
| 7 | `runBaseline` | `null` or array of 4-digit change-epic prefixes | no | `null` | runner (`0036_04`), cleared by `0036_03` / `0036_04` |
| 8 | `createdAt` | `null` or ISO-8601 UTC instant string | no | `null` | **nobody — board-maintained** (*Timestamps* below) |
| 9 | `updatedAt` | `null` or ISO-8601 UTC instant string | no | `null` | **nobody — board-maintained** (*Timestamps* below) |
| 10 | `notes` | string | no | `""` | user edit |

**`id`'s requirement is satisfied by construction:** the transport supplies a node id on every board
item it returns, so a read cannot produce an entry without one — and the node id it supplies is the
**same value** the transport's item-scoped writes address, so the identity is never derived, translated,
or paired with a second handle.

**An item the transport returns with no interpretable content at all** — no title and no body, its
content type being none the transport exposes, most often because the token cannot see the content's
repository — is **`unparseable-file`, fatal**, naming the item by its node id and stating that cause.
It is not masked and it is not a `malformed-entry` on `title`: masking would assert an empty body the
read never obtained, and blaming the entry would report a **card** as defective when the token's
**access** is what is defective. The repair is to grant the token access to the content's repository or
to remove the card from the board.

**`status`** is exactly one of `backlog`, `ready`, `in-progress`, `in-review`, `done`, `blocked`,
`cancelled`, in that canonical order. The first five are the **pipeline** values; the last two —
`blocked` and `cancelled` — are **auxiliary** values that are not pipeline stages.

**`backlog`** means *accepted but not yet ready to run*; **`ready`** means *ready to run*. The two are
the split of the single value `pending` that preceded them, with `ready` inheriting every behavior
`pending` carried and `backlog` expressing a state the previous version could not. **`pending` is no
longer a value of the enum.**

**`in-review`** means *converged but not yet archived*. It is written by exactly one row —
`in-progress` → `in-review`, `/ptp:backlog-run`'s convergence write — and left by exactly two:
`in-review` → `done` under guard 3 (`/ptp:backlog-continue`) and the unconditional any → `cancelled`
row. `0046_01` added the value to the schema, the default option table, and the configuration surface
with no performer on any row; `0046_03` supplied its two transitions without re-opening any of them.
See *Status transitions and their guards* below, which owns all three rows.

`blocked` and `in-review` are the two statuses `/ptp:backlog-continue` settles, and they are missing
different things: **`blocked` is missing the human verification** — its `/ptp:full` did not converge —
while **`in-review` is missing the archive** — its `/ptp:full` did converge, and `/ptp:backlog-run`
performs neither the archive nor the commit. An `in-review` epic's automated code review has therefore
**already converged**: every slice landed in `ptp-full-apply`'s `processed` bucket for the epic to reach
the status. `/ptp:backlog-continue` re-proves that convergence from the change's `stages/code.json`
marker and invokes `/ptp:review-full` only when the marker is ineligible.

**`changeEpics` element** — an object, never a bare string:

```jsonc
{ "id": "0041", "attribution": "terminal-report" }
```

- `id` — a 4-digit ptp change-epic prefix **as a string** (leading zeros are significant).
- `attribution` — exactly one of:
  - `terminal-report` — **authoritative**; the link came from a `/ptp:full` terminal report.
  - `folder-diff-unconfirmed` — **provisional**; the link was inferred from a change-folder diff and
    may belong to another session.
  - `user-confirmed-reconciliation` — a **human vouched** for the link during recovery.
- Ids are **unique within the array**; a duplicate is a `malformed-entry` problem.

A bare string array could not express "this id came from the authoritative report" versus "this id
was inferred and may belong to another session" — and `/ptp:backlog`, shipped in this same change,
is required to distinguish all three values.

**`runBaseline`** is the durable pre-run snapshot of the 4-digit prefixes present under
`openspec/changes/` **at the invocation's resolved workspace root** — the set *Recovery and
reconciliation* defines, scanned at that one root, the reconciliation diff being taken at the same
root. It gains **no** workspace field: the recognized field set is unchanged and the version marker
stays `1`. `null` means *no run in flight and nothing to reconcile*. This change never sets
it and never clears it; it only reads it for the stale-`in-progress` flag.

### Why every field is defined now

The schema is defined **in full here, including fields no command in this change writes** —
`changeEpics`, `attributionWarnings`, and `runBaseline`.
The alternative, each later change widening the schema as it needs a field, would mean **this
change's validator rejects its own siblings' output**: a validator that rejects the files its sibling
changes produce is worse than useless. Defining them now also costs nothing — their shape is already
settled — and avoids a `version: 2` migration for a field whose shape was known all along.

### Tolerant read

Reading is tolerant, so the board stays **hand-editable** — which on a board is not a nicety but the
normal case: a human drags cards, renames a column, and types in a body.

- Exactly **three** fields are required: **`id`, `title`, `status`**. `id` is **transport-supplied**, so
  it can never actually be absent: only **`title`** and **`status`** can be, and this is stated rather
  than left to inference.
- Every other recognized field **may have no value on the board**; the reader supplies its empty value
  (`""`, `[]`, `null` per the table above) **in memory only** — nothing is written back to the board to
  materialize a default.
- An **absent required field is a `malformed-entry` problem and is never defaulted.** Inventing a
  `status` would silently place an entry in the ready set, which is exactly the failure a tolerant
  reader must not commit.
- A present field of the **wrong type**, an **out-of-enum** `status`, or a malformed `attribution` or
  change-epic prefix is a **reported** `malformed-entry` problem and is **never coerced** to a valid
  value.

## Version marker and gate

A board has no `version` key, so the version lives in a **marker line** on the project itself.

**Candidate detection and value parsing are two steps, deliberately separated.**

1. A **marker candidate** is any line matching `^\s*ptp-backlog-version:` — the key present after any
   amount of leading whitespace, **whatever follows**. An indented marker is a **present** marker.
2. The **value** is whatever follows the colon, **trimmed**.

A single regex conflating them leaves a silent hole: `^\s*ptp-backlog-version:\s*(\S+)\s*$` does not
match `ptp-backlog-version:` with nothing after it, so such a line would fall through to "absent" and
read as v1 — a silent coercion in the one section written to forbid them. An **empty** value is a
present-but-**invalid** marker, exactly like `abc` or `0`, never "absent".

**Precedence.** The **first candidate in the project's `shortDescription`** wins; its `readme` is
consulted **only when `shortDescription` carries no candidate at all**, and there the **first
candidate wins** by the same rule — *first* meaning first in reading order of that string, so two
candidates in either string never leave the marker undecided. A malformed candidate in
`shortDescription` is therefore fatal even when `readme` holds a well-formed one — the alternative lets
a stale description be quietly overridden, and "search on until something parses" is how a version gate
stops gating.

### The gate

| Marker | Read | Write |
|---|---|---|
| integer `1` | **read** normally | write normally |
| integer **> 1** | **refuse** — `unsupported-version`, naming the found version and the supported one | **refuse** |
| present, non-integer, **empty**, or **< 1** | **refuse** — `malformed-file` | **refuse** |
| **no candidate in either string** | **read as `version: 1`**, synthesized in memory | permitted |

**Why the *write* direction refuses too**, rather than reading tolerantly and writing back: a greater
version means the board was written by a newer ptp whose fields this version cannot interpret. A
tolerant read followed by a canonical write would **discard every field the newer version added** —
precisely the data loss the unknown-key rule exists to prevent — and unknown-key preservation **cannot
be relied on** to survive a *shape* change: a renamed or restructured field is not merely an added one.

**The last row is a deliberate divergence from the file gate, where an absent `version` was
`malformed-file`. Do not "fix" it.** On a board the marker is a convention on a **human-edited
description string**, not a document key a writer controls, so its absence cannot distinguish "written
by ptp" from "a board a human made" — and `1` is the only version that exists. Treating it as fatal
would make **every pre-existing board unviewable**, which is this contract's purpose negated. The view
renders it honestly as `1 (assumed — no version marker on the board)`.

Rejected: strict parity (unviewable boards); a sentinel *item* carrying the version — a fake card needing
exclusion from the entry set and from the view. That rejection is **stronger now, not weaker**: with no
allocation to exclude it from, and with **every board item an entry**, the sentinel card would have to be
carved out of a rule that admits no exceptions at all — one integer bought with a hole in the membership
rule this contract just deleted.

## Timestamps

| Question | Answer |
|---|---|
| Where do `createdAt` / `updatedAt` come from? | the **board item's own stamps**, normalized to an ISO-8601 **UTC instant** (any offset converted) |
| A stamp that will not normalize? | `malformed-entry` on that field, **never coerced** |
| A stamp the transport omits? | the field reads `null` — its empty value. Both are optional on read, so this is **not** a defect |
| `createdAt` / `updatedAt` keys **inside the block**? | **not recognized carriers** — retained as unrecognized keys, reported as ignored, playing no part in the entry model |

**Both stamps are board-maintained.** Projects v2 exposes **no setter**, so **ptp sends no value for
either**. This is what became of the file contract's *"`updatedAt` is bumped only on entries the
operation actually changed"* rule: a writer's in-memory bump is **not persisted**, the board's own stamp
is authoritative again on the very next read, and the rule is impossible to violate because no bump
reaches the board at all. The consequence is stated rather than hidden: **a caller must not treat a
post-write in-memory `updatedAt` as the stored value.** A human's UI edit moving a stamp is a third
party touching the store, and the read reports it as exactly that.

**Neither stamp is an ordering input, and neither is read by any computed result.** The canonical `epics`
order, the ready-set order, and the problem sort key all read the board item's **position** (*Top level*
above, *Read protocol* below); `createdAt` and `updatedAt` are **displayed and never computed with**. The
one way either stamp still reaches a computed outcome is the `malformed-entry` a stamp that will not
normalize raises, immediately below — which is **validation of** the stamp, not computation **with** it.
This retires, rather than amends, the churn argument the creation-stamp key rested on: that argument
existed to keep a human's UI touch from moving what ptp computes, and under a position key a human's
arrangement of the board **is** the input ptp is asked to read. What a UI edit moves is now a deliberate
signal where it is a position, and inert where it is a stamp.

A `malformed-entry` on `createdAt` **is that one validation outcome and reaches no computation beyond
it** — nothing reads the stamp, and what has consequences is the **problem**, not the value. Its **two**
consequences are stated together: the **ready set is withheld** as under any structural problem, and the store is **not** made
writer-ineligible (*Writer eligibility* below). It **no longer affects the entry's place in the canonical
order**, that order having no date component at any depth. The problem is still reported, still
structural, and still never coerced — a stamp ptp cannot read is a fact about the board, and demoting it
to silence because nothing computes with it would hide a broken store.

The obvious alternative — mapping `updatedAt` to a writable carrier so a committed value persists — is
**not available**: the API exposes no setter, and inventing a second, ptp-owned `updatedAt` custom field
would give the board two disagreeing timestamps for one entry and put the read back in the business of
choosing between them.

## Identity

**The entry `id` is the board item's own GraphQL node id** — an opaque string carrying no ptp-defined
format. It is supplied by the transport on every item, and it has **no writable carrier**.

**Nothing is allocated, minted, derived, or written.** There is no `max + 1` rule, no zero-padding, no
allocation precondition, and no persisted counter, manifest, or sentinel item. No ptp command establishes
an entry's identifier; the store hands it over with the item.

Two consequences follow **by construction**, not by luck: **two ids cannot collide**, and **an id cannot
be malformed** from ptp's perspective. That is why `duplicate-id` does not exist and why
`malformed-entry` is not raisable on `id` (*Problem codes* below).

**No interaction with the change selector.** Node ids are **not** added to the `epic:` / `story:`
selector grammar, `ptp-change-selector` is **not modified** by this contract and **does not read** the
backlog, and backlog entry identifiers **reserve no ptp change-epic numbers**. This obligation is carried
forward here deliberately rather than dropped with the identifier that used to state it.

## Ready set

An entry is **ready** when its `status` is **`ready`**. The ready set is the `ready` entries in the
**canonical order** below. **No topological pass is performed.**

**An entry whose status is `backlog` is *not* ready**, whatever its age, its position in the canonical
order, or the emptiness of the ready set. The predicate remains a **single equality** on `status`: it
gains **no** second disjunct, **no** fallback to `backlog` when no `ready` entry exists, and **no**
promotion performed by a reader.

**An empty ready set no longer implies an empty backlog of un-run work.** A board may hold any number of
`backlog` entries and an empty ready set. That is a **deliberate triage state** — entered by a human
deferring an entry or never promoting one, exited by a human promoting one — not a starvation condition,
and it raises **no problem code**. How `/ptp:backlog` *renders* that state is **not** settled here; it
lands in `0046_02`.

Two readings are wrong, and both are ruled out here:

- It is **not** a relaxed dependency filter. There is no filter to relax — the clause was deleted in
  `0042_01`, not weakened.
- It is **not** a second conjunct that is still evaluated and *vacuously satisfied over an empty edge
  set*. Nothing of the kind is materialized, so the predicate has no such input at all and `status`
  is the whole of it.

### Order

The **canonical order**, identical to the `epics` order above: **the board item's position, ascending; an
entry with no position orders after every entry with one; the node id ascending by Unicode code point of
its canonical JSON serialization is the final tie-break in every case.** There is **no `priority`
field** and **no date component at any depth**; the board's own arrangement supplies the order, so the
head of the ready set is the first `ready` entry in the project's item order — the **top card of the
`Ready` column** for a view that applies no sort of its own — and `/ptp:backlog-run` takes the ready epics
**top first**. Re-ordering the work is dragging a card, and ptp reads that and writes it **never**.

**What ptp can and cannot see.** The order is the **project's** item position, which is what the API
exposes. A board **view's** own **sort** is **not** exposed to this contract, so a view that sorts by
something else displays one order while ptp computes the project's — ptp neither detects that nor honors
it, and says so here rather than promising a fidelity it cannot deliver. **Grouping is not sorting, and
the bound is written on sorting alone**: a view **groups** by `Status` — that grouping is what makes a
`Ready` column exist at all — and it partitions the items without reordering those within a partition,
so grouping is **compatible** with this order and only a view's own **sort** displaces it. A bound
written as *no sort **or grouping*** would exclude every board view that has a `Ready` column, and would
empty itself.

**The order *within* a ready set is unchanged** by the deletion of the dependency pass: the topological
pass never constrained it (every member of a ready set already had its predecessors settled), so the
canonical tie-break was always the whole visible order. Removing the pass removed **ordering**
machinery, not ordering behavior. **Ready-set *membership* is a different matter and did change** — a
backlog that carried edges now admits every `ready` entry at once, so one that used to run in a
dependency-derived order now runs in the canonical order. That is a deliberate behavior change, recorded
as such in the release notes. That history is about the **dependency pass**, not about the key: the key
itself changed once more in `0051_01`, from the board's creation stamp to the board's item position, which
is a **deliberate behavior change** — a board whose `Ready` column is not in creation order now runs its
epics in a different order — recorded as such in the release notes.

**Determinism, over the produced document.** Ordering reads **only what one read materialized** — the
entries' `status` and the order the traversal returned them in — so **for any given produced document the
ready set and its order are fully deterministic** — computing them twice
over one document yields the same entries in the same order. The claim is deliberately **not** made over
the store over time: a board is not a snapshot and the read is not transactional, so two reads may
legitimately differ (see *Purity, narrowed honestly* under *Validation*).

**Ownership note.** This rule lives **here**, in `ptp-backlog`, and **not** in the future
`ptp-backlog-run` skill, for one reason: the read-only view needs the identical rule and ships in
**this** change, three changes earlier — and two owners of one rule is exactly the enumeration drift
this repository forbids. `ptp-backlog-run` (`0036_04`) owns only what is genuinely its own — the
`rounds:` token, the recompute-after-each-epic loop, the per-epic `/ptp:full` invocation, the halt
gate, the status write-back, and the terminal report — and **references this definition** for what
"ready" means and in what order. The runner is the referencing consumer; the definition does not move.

`/ptp:backlog` computes the ready set **once**, over the document one read produced. Recomputing after
every epic is a property of the runner's loop, not of a view, which has no loop to recompute in.

**A second, store-shaped withholding condition applies:** under *Degraded scope* the ready set is
withheld even on a board carrying no problem at all, because an unreachable archived tier can put the
wrong entry at the **head** of the order.

## What `0036_01` did not ship

This section is a **historical scope note about slice `0036_01`**, not a live prohibition on the
commands that exist today. It describes the contract as it stood when the backlog was a local JSON file;
that store was replaced by the board in `0042_03`, which is also why no path described below still
exists.

**No consumer wiring, and above all no writer, landed in `0036_01`.**

- **No writer of any kind.** Nothing in `0036_01` created, modified, or deleted the backlog. The write
  path of the day was *specified* for later changes; nothing in that slice performed it.
- **No epic-dependency inference in `0036_01`** — that feature landed in **`0036_02`**, which was also
  the first consumer of the id-allocation and writer-eligibility rules above. It was **removed
  entirely in `0042_01`**, so nothing of it remains in this contract and no section of it
  describes it.
- **No entry edit, no status transition, no crash recovery, and no disposition gate** —
  the transition table, the `runBaseline` reconciliation, and the `claim` / `disown` / `rerun anyway`
  availability rules are **`0036_03`**. (Entry **add** landed in `0036_02`.)
- **No runner, no `rounds:` token, no `/ptp:full` invocation, and no ready-set recomputation loop** —
  **`0036_04`**, which references this skill's ready-set definition rather than restating it.
- **No config key and no per-invocation token.** This change adds no `backlog.*` parameter, so the
  `config` contract's every-enumeration-agrees obligation is untouched.
- **No selector grammar.** `ptp-change-selector`, `ptp-run-at-model`, `ptp-branch-guard`,
  `ptp-codex-mode`, `ptp-parallel-fanout`, and `ptp-config` are **referenced, never modified**.

The only consumer `0036_01` shipped was the read-only `/ptp:backlog` view; `/ptp:backlog-add` joined it
in `0036_02`, and `/ptp:backlog-edit` — the writer governed by the *Status transitions and their
guards* and *Recovery and reconciliation* sections above — in `0036_03`.
