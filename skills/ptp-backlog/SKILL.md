---
name: ptp-backlog
description: Own the epic backlog board contract — the store being one GitHub Projects v2 board per repository, resolved through ptp-github-projects-gh's configuration and capability preflight with no local backlog file, no second store and no fallback; the rule that every board item is an entry, no membership test being performed; the ten-field entry model and its tolerant read; the field mapping of those ten slots onto five board carriers — the one required custom field Status (SINGLE_SELECT), the item's title and body, and the board's own stamps — with the status option table, the sentinel-fenced metadata block and its malformed-body boundaries, and unknown-key preservation in both scopes; the ptp-backlog-version: marker and its gate, whose absent-marker-reads-as-v1 divergence is justified in place; the read-only read protocol with its configuration-completeness-then-preflight precondition, its returned handle table and its degraded scope; the node-id identity rule, under which nothing is allocated, minted or written and two ids can neither collide nor be malformed; the validator and its fixed four-code problem vocabulary with the fatal/structural split, the writer-eligibility rule that refuses past fatal problems only, and the distinct unreachable-store outcome; and the ready-set definition — the `ready` entries in the board's item-position order, which is the column read top-first wherever a view adds no sort of its own — with its order deterministic over the produced document. A pure prose contract in the single-source-of-truth pattern of ptp-branch-guard (branch safety), ptp-codex-mode (the reviewer gate), ptp-agent-roles (role resolution), and ptp-parallel-fanout (fan-out safety) — it reads nothing on its own, writes nothing, and edits nothing. Also owns the status transition table — eleven rows, each naming its performer, cited by from-to pair and never by number — with its three guards (the gated blocked-to-ready reset that retains the prior attempt's changeEpics, the any-to-cancelled guard, and the two resume rows blocked-to-done and in-review-to-done, both available only as the same-invocation result of /ptp:backlog-continue's own review-full-then-archive sequence), the in-progress-to-in-review convergence row that makes in-review the resting state of a converged-but-unarchived epic and leaves /ptp:backlog-run writing done nowhere, and the recovery-and-reconciliation machinery every writer that settles a stale in-progress entry runs: the stale definition and its deliberately conditional wording, the single change-prefix-set definition both the runBaseline snapshot and the reconciliation diff cite, the additive-only reconciliation, the gate, the availability table and the disposition outcomes (claim / disown / rerun anyway, and per-prefix promote / dismiss) with their combination rules, the every-settling-edit-clears-runBaseline rule, and the never-yields-done rule. The contract was defined over a local file by 0036_01, which ships no writer; the transitions and recovery machinery by 0036_03 alongside /ptp:backlog-edit, the runner in 0036_04; the store became a GitHub Projects board in 0042_03, which ships the read half and leaves every writer refusing.
---

# ptp-backlog — the epic backlog board and everything that defines it

## Purpose

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

## The store

**The backlog is one GitHub Projects v2 board per repository**, resolved through
`ptp-github-projects-gh`'s `backlog.*` configuration and admitted by its capability preflight.

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
`openspec/changes/`. `null` means *no run in flight and nothing to reconcile*. This change never sets
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

## The board mapping

Ten entry field slots onto **five** carriers. Everything in this section is true of the backlog *because
it is a board*; everything above it would survive a change of store.

### Every board item is an entry

**Every item on the resolved board is a backlog entry.** There is **no membership test**: no field value
decides membership, nothing is decided before the required-field checks, and no item is excluded from
`epics`.

An item is an entry whatever its content type — **draft issue, issue, or pull request**, all three
exposing a title and a body — and **whether or not it is archived**; an archived item is an ordinary
entry, flagged as board-archived by the view.

**There is no unmanaged-item concept.** No item is "reported but not an entry", none is excluded from the
entry set on membership grounds, and no rule of this contract classifies an item as unmanaged.

The consequence is stated rather than hidden: **a card a human adds by hand is an entry**, and with no
`Status` set it raises a `malformed-entry` on `status` — a structural problem, so every entry still
renders and the ready set is withheld until it is repaired through *Repairing a `status` that is unset
or out of enum* below.

### Field-name matching, and the collision that is fatal

Board field names are matched **case-insensitively** with **surrounding whitespace trimmed** — `Status`,
`status`, `  Status  ` all match. **Nothing further is inferred:** a differently-named field (`Status #`,
`State`) is a **missing** field, not a fuzzy match.

**A normalized-name collision on a required carrier is `malformed-file` and fatal**, and the problem
**names both colliding field names**. It is never resolved by picking one — first-declared,
last-declared, and the non-empty one are all silent guesses at which value is the entry's, which is the
coercion this whole section forbids.

#### The item object's flattened field keys

The resolved transport returns each item as one JSON object carrying `id`, `content`, **and every field
value the item holds, flattened in under a key derived from that field's name** — `Status` becoming
`status`. The derivation lowercases the **first character only** and alters nothing else, so
`In Progress` becomes `in Progress` and `Id` becomes `id`.

**The identity and content keys are written first and the field values second**, so a board field whose
derived key collides with one of them **silently overwrites** it. Three collisions are therefore fatal,
and the problem **names both** the field and the key, exactly as the normalized-name rule above does:

| Collision | What is silently lost | Outcome |
|---|---|---|
| a field whose derived key is the **identity key** | the entry's **node id** — the value a user copies and hands `/ptp:backlog-edit` | `malformed-file`, **fatal** |
| a field whose derived key is the **content key** | the item's **title and body together** | `malformed-file`, **fatal** |
| two fields sharing a derived key where one is **`Status`** | the entry's `status` | `malformed-file`, **fatal**, naming both |
| two fields sharing a derived key that is **neither** the identity nor the content key, **neither** field being `Status` | one unread value overwrites another | **not a defect** — this contract reads neither |

**The rows are read in order and the first three win.** Two fields whose shared key *is* the identity
key are the first row, not the fourth: the entry's node id is overwritten either way, and how many
fields overwrite it changes nothing. The fourth row is the residue — a shared key that reaches nothing
this contract reads.

**This is a second, independent rule and both run.** The normalized-name rule above is
case-insensitive, whitespace-trimmed, and scoped to a **required carrier name**; it therefore does not
reach two fields named `Id` and `id` — neither is a carrier name — and it does not model a
first-character-only lowering. Either rule alone is fatal, and **both are decided from the field list,
before any item is fetched**, so neither can depend on which items happen to carry which values.

**A board carrying more than 100 fields in total is `unparseable-file`, fatal.** Built-in and custom
fields count alike toward that ceiling. The transport resolves an
item's field keys from at most the first 100 fields of the board and does not page them, so a value
whose field falls outside that window is flattened under an empty key — and where `Status` falls outside
it, **every entry silently reads as having no status**, a board-wide defect blamed on the cards. The
problem names the count, the ceiling, and the transport as the cause. It is `unparseable-file` rather
than `malformed-file` because the board **was obtained** and it is the **item payload** that cannot be
interpreted; `malformed-file`'s conditions are a missing, mistyped, or name-colliding required carrier
and a bad version marker, and a 101st unrelated field is none of those.

**An item object carrying no key for the `Status` field is the genuine *no `Status` selected* state** —
`malformed-entry` on `status`, unchanged. It can never mean *the read did not ask for the field*: the
transport flattens every value an item holds, and this contract chooses none of them.

**The `Status` field's type is matched against the literal `ProjectV2SingleSelectField`.** The
transport reports a field's type as its GraphQL type name, and the string `SINGLE_SELECT` does not occur
in its output — so every place this contract previously named `SINGLE_SELECT` as the compared type now
either says **single-select** in English or names the transport's own literal, and no artifact compares
against a literal the transport never emits.

**A `Status` field carrying no options at all returns no options key**, which reads as *zero options*
and never as *the key was not returned*. It is **not** a defect — the field exists and has the right
type — and the existing missing-status-option advisory names every status in consequence.

### The carrier table

| # | Field | Required on read | Carrier |
|---|---|---|---|
| 1 | `id` | **yes** | the board item's own **node id** — the item's identity, not a carried value |
| 2 | `title` | **yes** | the item content's **title** |
| 3 | `description` | no | the item **body**, everything before the `begin` sentinel |
| 4 | `status` | **yes** | the board's **`Status`** single-select field, through the option table below |
| 5 | `changeEpics` | no | block key `changeEpics` |
| 6 | `attributionWarnings` | no | block key `attributionWarnings` |
| 7 | `runBaseline` | no | block key `runBaseline` |
| 8 | `createdAt` | no | the board item's own `createdAt`, normalized |
| 9 | `updatedAt` | no | the board item's own `updatedAt`, normalized |
| 10 | `notes` | no | block key `notes` |

**Five carriers:** one **required custom field** (`Status`); two **positional carriers on the item
itself** (its title, and its body — whose prose is `description` and whose sentinel block carries the
four block keys); and two **board stamps**. `id` is **not** among them: it is the item's own identity,
the thing the other nine fields hang on, rather than a slot the item carries.

**Under a transport that returns an item's body, all four block-carried slots and `description` are
read from that body.** On the resolved transport that body is the item row's **`content.body`**, present
on **every** content type it exposes — draft issue, issue, and pull request alike — with `description`
being everything before the opening sentinel and `changeEpics`, `attributionWarnings`, `runBaseline` and
`notes` coming from the sentinel-fenced block that follows. Where a transport cannot return one of the
ten slots at all, that is a
**transport capability limit** governed by *Degraded scope* below and by the unavailable mask's existing
single cause — and **no such limit applies to the resolved transport**, which returns the body on every
content type it exposes. The unavailable mask therefore keeps exactly one cause: an entry whose
**sentinel block did not parse**.

No entry field is read from more than one carrier, and no board state causes a field to be inferred from
a carrier other than its own.

### Required and optional carriers — a floor of one, never a cap

**Exactly one custom field must pre-exist:** `Status`, a single-select field. That is a **floor, never a cap**.
A board carrying `Priority`, `Iteration`, `Assignees` and a team's own field alongside it is fully
usable: their presence neither makes the board unusable nor raises a problem, and they are preserved by
construction (below).

- A **required** carrier that is **missing**, **or present with the wrong type**, is `malformed-file`
  and **fatal**. No item on that board can yield a required entry field, and guessing a value out of a
  differently-typed field would be the coercion this mapping forbids. The problem names the carrier and
  the type it must have.
- A missing **optional** carrier is **not a defect**: the tolerant read supplies the entry model's empty
  value **in memory only**.

**A board carrying the required field and no items at all is a successfully-read, genuinely empty
backlog** — not a defect, not an error. It is the **only** state that may render as "no entries yet".

**A leftover `Backlog ID` field from an earlier ptp is an ordinary unrecognized custom field** — never
read, never written, never removed, and never a problem. It is named literally here so a user can
recognize it on their own board; it may be deleted by hand, and ptp neither requires that nor performs
it.

### The `status` option table — configurable, with a built-in default

Matched on the selected option's **name**, case-insensitively and whitespace-trimmed:

| Entry `status` | Default accepted option names |
|---|---|
| `backlog` | `backlog`, `Backlog` |
| `ready` | `ready`, `Ready` |
| `in-progress` | `in-progress`, `In Progress` |
| `in-review` | `in-review`, `In Review` |
| `done` | `done`, `Done` |
| `blocked` | `blocked`, `Blocked` |
| `cancelled` | `cancelled`, `Cancelled`, `Canceled` |

**The recommended board layout** is the first five rows' Title-Case names, in the order declared —
`Backlog` | `Ready` | `In Progress` | `In Review` | `Done`. That order is **documentation, not a rule**:
nothing in the read path, the ready set, the transition table, or the write path reads a board option's
position, index, or color, and the existing prohibition on inferring anything from option order,
position, or color is untouched.

**`blocked` and `cancelled` are deliberately not columns.** They are exceptional, terminal-ish states
rather than pipeline stages, and a board carrying no `Blocked` or `Cancelled` option is **not a defect on
that ground**: it simply has no writable option for those statuses, which the write path's existing
zero-match refusal governs and the read view's existing missing-option advisory already names. No new
rule, code, or verdict is added for the omission — it is stated only so the advisory is not read as a
misconfiguration.

**`Todo` appears on no row — a deliberate breaking change.** It is **not** retained as an alias on the
`backlog` row: retaining it would make it **impossible to stop** `Todo` meaning `backlog` on a board that
uses that column for something else, which is the same ground on which a configured row replaces rather
than extends its default. A board still running a `Todo` column, **whose resolved table no
`backlog.statusOptions` override re-admits `Todo` into**, reads `malformed-entry` on `status` for every
card in it, which is structural, so the ready set is withheld. Two recovery paths already exist and
neither is new machinery: **configuration** — `backlog.statusOptions` re-admits `Todo` on whichever row
that column meant, with no board rename — and **repair** — the unset/out-of-enum repair below moves
individual cards through `/ptp:backlog-edit`.

> **The resolved table** is the built-in default table with each status's row replaced by that status's
> resolved override where one exists, and left at its default row where none does.

The overrides come from the `backlog.statusOptions` configuration key, whose path, kind, per-status-key
validity, and layered forgiving resolution are owned by `ptp-github-projects-gh` — see that skill for
the key itself; its validity rules are **not** restated here. This skill owns the **default table**, the
**merge** onto it, the **resolved table's** semantics, and the **collision rule** below.

Matching is unchanged: on the selected option's **name**, **case-insensitively** and
**whitespace-trimmed**, with no fuzzy matching and no near-match. Configuration changes *which names are
in the table*; it never changes *how a name is matched*, and it never adds an eighth status — the seven
entry `status` values are the schema's.

#### Replace, not extend

A configured row **replaces** its default row rather than being unioned with it. Extension can never
lose a spelling that used to work, which is genuinely attractive, and it is rejected for two reasons:

1. It makes it **impossible to stop** `Backlog` meaning `backlog`. A board that uses `Backlog` for
   something else — a triage column for non-epic work, say — would have every card in it read as a
   `backlog` epic.
2. It would make a collision **permanently unfixable**. A user whose ready column is literally named
   `Done` configures `ready: "Done"`; under extension the `done` row still contains `Done`, and there
   is no configuration that removes it. The collision rule below would then refuse a configuration the
   user has no way to repair.

A user who wants both spellings lists both. Replace keeps the row entirely in the user's hands.

#### The collision rule

> **No normalized option name may appear on two rows of the resolved table.** Where one does, the
> configuration is **unactionable**: the consumer refuses non-silently, naming `backlog.statusOptions`,
> the colliding option name, and **every** status claiming it. It is **never** resolved by picking one —
> first-listed, last-listed, and canonical-status-order are all silent guesses at which status the user
> meant, which is the coercion this whole section forbids.

Three refinements:

- **It is a property of the *resolved* table, not of the configured fragment.** A configured row
  colliding with an **unconfigured default** row counts — and that is in fact the realistic case
  (`ready: "Done"` against the untouched `done` row).
- **Duplicates within one row are not a collision.** `["Backlog","backlog"]` normalizes to one name on one
  row; only two **distinct** statuses claiming one normalized name collide.
- **It is a configuration defect, not a board defect**, and therefore **not** `malformed-file`: raising a
  board problem code for a JSON typo would report the fault in the board's problem table and send the
  user hunting the board for something that is in a config file. It adds nothing to the problem
  vocabulary.

Two precedents, both exact in shape. `ptp-github-projects-gh`'s **completeness verdict** also has
resolution never throw, has the fact computed and carried as a verdict, and leaves the **refusal** to the
consumer; it differs only in *where* the fact is computed, and that is forced by the ownership split —
completeness is decidable from the resolved keys alone, while a collision needs the **resolved table**,
which needs the default table the transport skill deliberately does not hold. And this skill's own
**normalized-name collision on a required carrier** applies the same doctrine: *never resolved by picking
one*.

#### The four situations

Four situations, deliberately landing in four different places:

| Situation | Outcome |
|---|---|
| the selected option's name is **outside the resolved table** (`Needs review`) | `malformed-entry` on `status`, **never coerced** to a nearby value |
| the item has **no `Status` value set** (a real Projects state) | `malformed-entry` on `status` — `status` is required on read and is **never invented** |
| the board **has no `Status` field**, or its type is not the transport's single-select type literal | `malformed-file`, **fatal** (above) |
| the board's `Status` field **lacks an option** for one of the seven values | **not a read defect at all** — no item can carry an option that does not exist. It is the **write path's refusal** (`ptp-backlog-write`, *The commit refuses when the resolved row does not identify exactly one board option*), and the view **notes it** (below) |

**The advisory.** The field read at READ step 3 already returned the board's `Status` options, so the read is the
cheapest possible place to tell a user that their configuration and their board disagree: the view emits
a **note** naming every status the board can carry no option for. Its bounds are absolutes, because a
note that quietly grew teeth would be worse than no note — it raises **no problem code**, adds **nothing
to the problem vocabulary**, withholds **nothing** (not the ready set, not the entries table), changes
**no verdict**, and does **not affect writer eligibility**. It is information, not a gate.

Because `status` is the **whole** of the readiness predicate, this refusal to coerce carries weight it
did not carry when a dependency graph shared the load: misreading `status` is the only way a board
defect could widen the ready set.

### The item body — prose, then a sentinel block

````text
<free prose — this is `description`>

<!-- ptp-backlog:begin -->
```json
{ "changeEpics": [{ "id": "0042", "attribution": "terminal-report" }], "notes": "…" }
```
<!-- ptp-backlog:end -->
````

The sentinels are exactly `<!-- ptp-backlog:begin -->` and `<!-- ptp-backlog:end -->`, matched literally
and case-sensitively, each on its own line with that line's leading and trailing whitespace ignored.
They are pinned here because they are a **storage format**: a body written under one spelling and read
under another loses its metadata silently, and HTML comments are what keep the block invisible in the
GitHub UI.

- `description` is the body **before** the `begin` sentinel, with **trailing blank lines trimmed**.
- **A body with no sentinel is entirely `description`**, under the same trim, and every block-carried
  field reads as its empty value.
- Only the **first** sentinel pair is the block. A second `begin` is ordinary text.
- Text **after** the `end` sentinel is **preserved verbatim** and is **not** part of `description`.

**Region grammar.** Exactly **one** fenced code block is accepted inside the region; its language tag
must be `json` or **empty**. Prose around the fence **inside** the region is **allowed**, is **not** part
of `description`, and is preserved verbatim for a future writer.

#### The malformed-body table

Every row is a body a human can produce by hand, and in each the wrong answer is a *silent* one —
metadata quietly becoming prose, or a broken block quietly reading as "no metadata".

| Body shape | `description` | Block-carried fields | Problem |
|---|---|---|---|
| no `begin` sentinel anywhere | the whole body | their **empty values** | none — a card with no metadata is ordinary |
| `begin` … `end`, fence holds a JSON **object** | text before `begin` | read from the object | none |
| `begin` with **no matching `end`** | text before `begin` | **unavailable** | `malformed-entry` on `description` |
| an `end` with **no preceding `begin`** | the whole body, the `end` line **included** | their **empty values** | **none** — a stray line announces nothing |
| region holds **no fence**, or its only fence carries a tag other than `json`/empty | text before `begin` | **unavailable** | `malformed-entry` on `description` |
| region holds **two or more** fences | text before `begin` | **unavailable** | `malformed-entry` on `description` — never "take the first" |
| fence contents **not valid JSON** | text before `begin` | **unavailable** | `malformed-entry` on `description` |
| valid JSON that is **not an object** (`[…]`, `"s"`, `7`, `null`) | text before `begin` | **unavailable** | `malformed-entry` on `description` |
| object with a **duplicate member name**, top level or inside a `changeEpics` element | text before `begin` | **unavailable** | `malformed-entry` on `description` — never "last member wins" |

In **every** unavailable row the region is preserved **byte-for-byte**, which is what makes a future
writer's never-destroy-the-user's-text obligation satisfiable.

Two governing reasons, stated so the rows are not re-derived case by case:

1. **`description` carries the problem** because the body is the offending carrier — so one broken body
   yields **one** problem rather than four.
2. **A body that announces metadata and fails to deliver it is a defect, never a default.** A stray
   `end` is deliberately benign by the same reasoning: unlike a `begin`, it announces nothing. And a
   **duplicate member name** is decided here rather than deferred to a parser — it is *valid* JSON
   (RFC 8259 leaves the behavior to the implementation), so it reaches neither the not-valid-JSON row nor
   the not-an-object row, and leaving it to the parser is exactly the "silently picks a value" outcome
   the field-name collision rule refuses.

#### `unavailable` is not empty

The four block-carried fields of a broken block are **unavailable**, never defaulted. Defaulting them
would make the entry *assert* that it holds no undispositioned `attributionWarnings` prefix and links to
no change epic — two claims a card whose block failed to parse does not support, and exactly what the
attention section exists to prevent.

`unavailable` is a **rendering** state carried **out of the read** as a **mask naming the affected
entries and fields**. It is **never** a substituted value in the document, and **nothing the validator
computes reads one of the four**, so nothing has to be excluded from a derivation.

### Unrecognized data survives, in two scopes

1. **Inside the block** — at its top level **and inside a `changeEpics` element** — an unrecognized key
   survives with **its name and its complete nested value**, is **not** a validation problem, and is
   **reported as ignored** by the view.
2. **Board custom fields the mapping does not recognize** (`Priority`, `Iteration`, `Assignees`, a
   team's own field) are preserved **by construction**: never read into the entry model, never written,
   never removed.

**The block's recognized keys are exactly four** — `changeEpics`, `attributionWarnings`, `runBaseline`,
`notes`. A name outside that set is unrecognized whatever the entry model calls it, so a hand-written
`createdAt`, `updatedAt`, `dependsOn`, `dependencyEvidence`, or `dependencyRejected` block key is
**retained, reported as ignored, and read into nothing**. They are deliberately **not**
`malformed-entry`: refusing a card over a harmless key would break a board over a hand edit.

#### The block's canonical form — defined here, performed by the write path

The four recognized keys in the entry model's order (`changeEpics`, `attributionWarnings`,
`runBaseline`, `notes`), then unrecognized keys **ascending lexicographically by key name**; within a
`changeEpics` element, `id`, then `attribution`, then its unrecognized keys under the same rule;
`changeEpics` elements keep their **array order as read**, array position being data; and inside an
**unknown** value the structure is emitted exactly as read and **never re-sorted**.

**The sentinel pair is written when at least one block-carried field is non-empty, *or* an unrecognized
key exists, *or* the region carries preserved text bound to it.** The third condition is necessary
rather than a hedge: in-region prose and post-`end` text are anchored by the sentinels and by nothing
else, so dropping the pair would leave a user's trailing note **indistinguishable from `description`**
and the very next read would swallow it.

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

## Validation

A **pure function**: document in, ordered problem list out. It **repairs nothing**, **coerces
nothing**, **writes nothing**, and **never mutates** what it inspects.

**The order is specified, not incidental** — "pure function" would be an empty claim if the same
document could yield the same problems in two different sequences. Problems are emitted in the
**table order below** (the row order of *Problem codes*: `unparseable-file`, `unsupported-version`,
`malformed-file`, `malformed-entry`), and **within one code** by this total key, compared left to right:

1. the entry's **position in the canonical `epics` order** — itself total, by that order's node-id final
   tie-break, so this component alone separates any two entries;
2. the **offending field name**, ascending lexicographically, when one entry raises the same code on
   more than one field;
3. the **offending value** — the `changeEpics` element's `id`, say — ascending by Unicode code point of
   its canonical JSON serialization, which settles the case of one entry raising the same code on the
   same field more than once (two malformed `changeEpics` elements' ids) and is defined for a
   non-string offending value as well.

**There is no fourth, node-id component.** It existed only to separate **two entries sharing one id**,
which is now impossible, and the canonical order's own tie-break already makes component 1 total.

**Board-level problems name no entry, and they sort first.** `unparseable-file` and `malformed-file`
are properties of the **board**, not of an item — a missing or mistyped required carrier, a
normalized-name collision, a present-but-invalid version marker — so they occupy no position in the
canonical order, and component 1 does not reach them. Within their code they are emitted **ahead of** every
entry-scoped problem of that same code, ordered between themselves by the **offending carrier or field
name** ascending lexicographically and then by the **offending value** ascending by Unicode code point
of its canonical JSON serialization. A board cannot raise two board-level problems of one code naming
the same carrier and the same value, so that pair is total over them.

The key is total — no two problems can tie, because no two items share a node id and no two board-level
problems of one code share a carrier and a value — so a given **produced document** always yields a
byte-identical problem list.

**Purity, narrowed honestly.** The file contract guaranteed determinism *"for any given saved file"*. A
board is not a snapshot: the read is not transactional and two reads may legitimately differ. The
guarantee is therefore that **the validator, the entry order, the ready set and the problem list are
pure functions of the produced document** — not of the board over time.

### Problem codes

| Code | Class | Condition, over board-shaped defects | Reported detail |
|---|---|---|---|
| `unparseable-file` | fatal | the board **was obtained** and its content could not be turned into the in-memory document — a field response of an unexpected shape, an item payload not interpretable at all. It is **not** the code for failing to *reach* the board; that is the `unreachable-store` outcome below | what could not be interpreted |
| `unsupported-version` | fatal | the version marker parses to an integer greater than the supported version | the found version and the supported one |
| `malformed-file` | fatal | the **required carrier is missing** (`Status`); the required carrier is present with the **wrong type**; two board fields **normalize to the same** required carrier name; or a **present** version marker is non-integer, empty, or < 1 | the carrier and the type it must have, or both colliding field names, or the marker value found |
| `malformed-entry` | structural | everything the entry model already lists — a required field absent, a field of the wrong type, an empty `title`, an out-of-enum `status`, a malformed `attribution` or change-epic prefix, a `changeEpics` `id` duplicated within the entry — **plus**: a `Status` unset or naming an option outside the option table; a **sentinel block that does not parse**; and a board timestamp that will not normalize to a UTC instant | the entry's node id and the offending field |

These **four** codes are the **shared vocabulary for the whole epic**, reused **verbatim** by every
command rather than renamed per command. The four graph-shaped codes this vocabulary once carried were
removed in `0042_01` because their only inputs — the epic-dependency fields and the **keys** of their
evidence map — are no longer recognized fields, so no document can raise them.

**`duplicate-id` is gone, and `malformed-entry` has no `id` case**, both being **unreachable by
construction** rather than merely unlikely: the identifier is the item's node id, which no two items
share and which ptp never has to parse.

**No sixth code is added for the board, and the two file-shaped spellings are kept.** A consumer must
classify a defect the same way whatever produced it; `unparseable-file` and `malformed-file` are opaque
identifiers reused verbatim by four commands, renaming them would touch every site for zero behavior
change, and **report prose is free to say "board"**. The rename is a defensible cosmetic follow-up, not
a correctness matter.

### The `unreachable-store` outcome — not a problem code

**Failing to reach the board is not a validation problem.** A validation problem is by definition a
statement about a document that *was* read, so a failure to obtain one is not a member of the vocabulary
above: `unreachable-store` is **not a sixth code**, is never emitted as a problem row, and is returned
**in place of a document**.

Its conditions, once the preflight has **already admitted** the read: the resolved tool call failed; the
project does not exist or is not visible; authentication or authorization failed; or **the paged fetch
did not complete**. It carries the **tool name and the transport error** in place of a parser message,
and it is **distinct from "no entries yet" at the level of the value returned**, not merely in wording —
which is what makes the honest-failure rule structurally true rather than only phrased.

It is **fatal-equivalent**: nothing is computed, no entries, no ready set, and the view renders the short
fatal form.

### The honest-failure rule

**An unreadable board may never render as "no entries yet."** A user *acts* on an empty backlog, and
with no local file left there is no second store whose emptiness could be the honest answer.

Three **read** exits, **two** rendering shapes — the incomplete-configuration refusal of *Read protocol*
step 0 is **not** one of them, being a refusal issued before a read is attempted rather than a read that
failed:

| Exit | Rendering |
|---|---|
| the preflight did not admit the read | the **full STOP message** in `ptp-github-projects-gh`'s specified shape — its **six** labels in order — **alongside** the header verdict line |
| post-preflight failure to obtain the board | the **short fatal form** naming the `unreachable-store` outcome and its transport detail |
| obtained but uninterpretable | the **same short fatal form**, naming an `unparseable-file` problem row instead |

**Alongside, never instead of.** Substituting one rendering for the other — or letting either stand in
for the STOP message — is the error this rule exists to prevent.

### Fatal vs. structural

- **Fatal** — **nothing further is computed**: no entries are rendered and no ready set is produced. The
  document is not usable at all. A reader reports the problem alone; a writer refuses.
- **Structural** — the document parses and its entries **still render individually**, but an
  **individual entry's own data** is not trustworthy, so the **ready set is withheld**.

Withholding is **more** load-bearing now, not less: a `malformed-entry` on an out-of-enum `status`
leaves unreadable the very `status` that is now the whole readiness predicate. Structural is
nevertheless not fatal, because a read-only view that shows **nothing** because one entry carries one
bad field is useless exactly when the user most needs to see the board. Structural is therefore defined
by what it still *permits* (rendering the entries), not merely by its name.

**The split is retained even though `structural` now has a single member**, because the two classes
still permit different things: fatal computes nothing at all, while structural still renders every entry
and withholds only the ready set.

### Writer eligibility

"Structural" governs what a **reader** renders; it does **not** by itself decide whether a **writer**
may proceed. That is a third rule:

> A writer refuses past **any fatal problem**, and past **no structural problem at all**.

**Nothing replaces the two structural conditions this rule used to carry** — a `malformed-entry` on an
entry's `id`, and `duplicate-id`. Their justification was that they left the **id space** untrustworthy
while both the canonical order and allocation were undefined over it; allocation no longer exists, and
the canonical order is **total by construction over any document a read can produce**, its node-id final
tie-break guaranteeing it. The justification therefore has no surviving instance.

**The one candidate, considered and rejected.** A `malformed-entry` on `createdAt` is the condition an
earlier reading of this rule would have reached for, the canonical order having once been keyed on that
stamp. It is rejected twice over. First, the key no longer reads it at all (*Order* below), so a bad
stamp moves nothing computed and there is nothing for a refusal to protect. Second — and decisively even
had the key not moved — **`createdAt` is board-maintained and the store exposes no setter**, so a store
made writer-ineligible by a bad stamp would be **unrepairable through ptp forever**, precisely the
lockout this rule exists to prevent.

*Degraded scope* is deliberately **not** on this list: it raises no problem code at all, so this rule
does not reach it. What it establishes instead is narrower — a **consumer of the ready set** cannot
proceed.

**Every structural defect is therefore writer-eligible.** A writer does not refuse over a
`malformed-entry` on any field. Refusing would leave a defective backlog **unrepairable through ptp**:
such a defect is most often an **unset or out-of-enum `status`**, and `/ptp:backlog-edit` is the only
tool that can repair it, so a writer that refused would strand the backlog. Refusing there would be a
lockout, not a safeguard.

This rule is defined here and **first consumed by `0036_02`**.

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

## Status transitions and their guards

**This skill owns the status transition table.** `status` is a field of the schema above, so its legal
transitions are a property of the same schema and belong in the same place. Three commands perform rows
of this table — `/ptp:backlog-edit` (`0036_03`) performs the **six** user rows
(`in-progress` → `blocked` \| `ready` as a recovery disposition, `blocked` → `ready`, any →
`cancelled`, `cancelled` → `ready`, `backlog` → `ready`, `ready` → `backlog`), `/ptp:backlog-run`
(`0036_04`) performs the three **runner** rows — `ready` → `in-progress`, `in-progress` → `in-review`,
and `in-progress` → `blocked` — and writes `done` **nowhere**, and `/ptp:backlog-continue` (`0038_01`)
performs the **two resume** rows, `blocked` → `done` and `in-review` → `done` — and all three
**reference** the table rather than restating any part of it. (`0036_01` deliberately defined no
transition table; this section is where it lands.)

**The `#` column is sequential, and no row is renumbered or reordered by hand.** `0046_03` replaced the
single row that ran from `in-progress` straight to `done` with two rows, so every row after it moved
by one — arithmetic the
sequential column itself produces, not an edit. Because a row **number** in prose is unreliable across
such an insertion, **prose cites a row by its from → to pair, never by its number**, in this skill, in
the backlog skills, and in the backlog commands alike. The table is **not** renumbered into pipeline
order.

The complete table. Every row names its **performer**; there are no other rows:

| # | From → To | Trigger | Performer |
|---|---|---|---|
| 1 | `ready` → `in-progress` | the runner takes the epic (writes `runBaseline` in the same write) | `/ptp:backlog-run` |
| 2 | `in-progress` → `in-review` | `/ptp:full` converged — **every** slice in `ptp-full-apply`'s `processed` bucket — written at WRITE 2 **before** any archive or deploy, of which the runner performs **neither** | `/ptp:backlog-run` |
| 3 | `in-review` → `done` | **every** prefix recorded in `changeEpics` settled by this same `/ptp:backlog-continue` invocation's own review-gate → archive sequence — the gate satisfied by its own `/ptp:review-full` or by a marker it re-proved in this invocation (**guard 3**) | `/ptp:backlog-continue` |
| 4 | `in-progress` → `blocked` | `/ptp:full` did not converge; the run halts | `/ptp:backlog-run` |
| 5 | `in-progress` → `blocked` \| `ready` | **recovery only**, via the reconciliation gate below (`claim` → `blocked`; `disown` / `rerun anyway` → `ready`). **Never `done`.** | `/ptp:backlog-edit` |
| 6 | `blocked` → `ready` | explicit user reset, gated (**guard 1**) | `/ptp:backlog-edit` |
| 7 | any → `cancelled` | the user abandons the epic; from `blocked` or a stale `in-progress` it carries guard 1's acknowledgement (**guard 2**) | `/ptp:backlog-edit` |
| 8 | `cancelled` → `ready` | explicit user revival | `/ptp:backlog-edit` |
| 9 | `blocked` → `done` | **only** as the direct, same-invocation result of `/ptp:backlog-continue`'s own bare-flow review-gate → archive sequence settling **every** prefix recorded in `changeEpics` — the gate satisfied by its own `/ptp:review-full` or by a marker it re-proved in this invocation (**guard 3**) | `/ptp:backlog-continue` |
| 10 | `backlog` → `ready` | the user promotes an accepted epic into the run queue | `/ptp:backlog-edit` |
| 11 | `ready` → `backlog` | the user defers a queued epic without abandoning it | `/ptp:backlog-edit` |

> `in-review` is the honest resting state of a **converged but not yet archived** epic.
> `/ptp:backlog-run` performs no archive and no deploy, so the epic's change folders are still under
> `openspec/changes/` and its code is still uncommitted on the run's feature branch when the runner
> finishes with it. Splitting the old single row from `in-progress` straight to `done` in two is what preserves the
> invariant that **`/ptp:backlog-run` never writes `done` for work it did not archive** — after this
> change it writes `done` **nowhere at all** — and it collapses `done` back to a single meaning:
> **archived**.

**`backlog` → `ready` and `ready` → `backlog` are unconditional and carry no guard.** Neither endpoint implies a run attempt: **no
writer of this contract produces a `backlog` or `ready` entry holding a non-null `runBaseline`** — the
runner writes the baseline only in the same write as `in-progress`, and every settling edit clears it
*before* the settling status commit — so there is nothing to reconcile and no prior attempt to
acknowledge.

**That is a statement about writers, not an impossibility claim.** A hand edit on the board can leave a
`ready` entry holding a baseline, exactly as it can produce the `in-progress`-with-null-baseline shape
the recovery contract already names. This version adds **no** guard, gate, or trigger for it: the gate's
trigger set stays exactly the two the *hand-edited entry* material below already enumerates, and
`backlog` → `ready` and `ready` → `backlog` pass such an entry's `runBaseline` through untouched. That
is precisely what the pre-split rows into the runnable state (`blocked` → `ready`, `cancelled` →
`ready`, and the recovery row's `disown` / `rerun anyway`) already did with the same hand-edited
shape, so the split adds no exposure.

**Explicit user edits may target an entry in any status**, `done` and `in-progress` included — on a
`done` target such an edit documents history rather than schedules work.

### Refusals

- **Every runner-only row requested through `/ptp:backlog-edit` is refused**, and the refusal **names
  the row and its performer**: `ready` → `in-progress`, `in-progress` → `in-review`, and
  `in-progress` → `blocked` other than as the recovery row's disposition.
- **Every transition absent from this table is refused** — first and foremost **`backlog` →
  `in-progress`**: the runner takes only `ready` entries, and that separation is the whole purpose of the
  split. Also absent and therefore refused: `backlog` → `done`, `ready` → `done`, `done` → `ready`,
  `done` → `backlog`, `done` → `in-progress`, `cancelled` → `done`, `cancelled` → `blocked`, `cancelled`
  → `backlog` (revival lands on `ready` via `cancelled` → `ready`; deferring it is then `ready` →
  `backlog`), and `blocked` → `backlog` (reset via `blocked` → `ready`, then defer via `ready` →
  `backlog`).
- **Every transition out of `in-review` other than `in-review` → `done` and `any` → `cancelled` is
  refused** as absent from the table — `in-review` → `blocked`, `in-review` → `ready`, `in-review` →
  `backlog`, and `in-review` → `in-progress` in particular, each with the reason and the two remedies
  *`in-review`'s outgoing edges* below states. The only transition **into** `in-review` is
  `in-progress` → `in-review`, the runner-only row above.
- **`blocked` → `done` and `in-review` → `done` are refused except via their guarded path.** Neither is
  absent from the table, but both are reachable **only** by their performer
  **`/ptp:backlog-continue`** under **guard 3** below; requested through any other command —
  `/ptp:backlog-edit` in particular — each is refused exactly as `blocked` → `done` was before that row
  existed, naming the row and its performer.
- **A status write that changes nothing is refused as a no-op**, never reported as success.

**`done` → `cancelled` is permitted and unconditional.** The cancellation row is written "any →
`cancelled`", and its
two **gated** sources are named exhaustively as `blocked` and a stale `in-progress`; `done` is neither,
so no guard applies. This does not contradict the refusal list above: that list names `cancelled` →
`done`, the opposite direction, which stays refused. Cancelling a `done` epic documents abandonment of
shipped work — and discards no link (`changeEpics` survives).

### Repairing a `status` that is unset or out of enum — a repair, not a transition

Every row of the table above is defined over the **seven enum values**, so an entry whose stored `status`
is **out of enum** has **no *from* row at all** — and so does an item with **no `Status` selected at
all**, which is the same defect reached by a shorter path. The rule is therefore worded over a `status`
that is **unset or out of enum**, both cases governed identically. Both states are a `malformed-entry` on
`status`, and **every** structural defect is writer-eligible, so *Writer eligibility* deliberately lets a
writer proceed over them, and `/ptp:backlog-edit` is the tool that repairs them. Refusing the repair
as "a row absent from the table" would make that defect **unrepairable through ptp**, which is exactly
the lockout writer eligibility exists to prevent.

**The widening to an unset `Status` is required, not incidental.** With no membership test, a card a
human adds by hand is an entry with no `Status`; without this rule it could never be repaired through
ptp, and the accepted membership regression would become a real lockout.

So: **an instruction that replaces an unset or out-of-enum `status` with a valid enum value is a repair,
not a transition.** It is **permitted**, the refusal list above does not reach it, and the report names
it **as a repair**, quoting the invalid value found or naming the `Status` as unset.

**Every bound below is unchanged and applies identically to an unset `Status`** — the permitted
destinations, the `runBaseline` routing, the disposition-outcome-is-binding rule with its `cancelled`
exception, the same-write `runBaseline` clear, and the still-named-in-the-report rule:

- The repair may set **`backlog`**, **`ready`**, **`blocked`**, or **`cancelled`** only.
  **`in-progress`** is the take row's runner-owned outcome, **`in-review`** is the convergence row's
  runner-owned outcome, and **`done`** is never written by this command at
  any time; requesting any of the three is **refused naming this rule**, so a corrupted `status` is
  never a back door into a status the table denies.

  **`in-review` is excluded for the same reason `in-progress` is**: `in-progress` → `in-review` is a
  runner-only row, so a repair landing there would manufacture a claim that a `/ptp:full` converged —
  the claim the whole guard-3 proof exists to require — out of a corrupted field.
- **With a null `runBaseline`** there is nothing to reconcile and nothing for the recovery gate to key
  on: the repair is the whole edit.
- **With a non-null `runBaseline` the repair is a settlement, and the full recovery machinery of the
  next section applies unchanged** — reconcile, then the gate, then a disposition the availability
  table actually offers, and, when the repair's destination is **`cancelled`**, **guard 2 in full**
  (its acknowledgement, and `rerun anyway` not offered). A corrupted `status` MUST NOT become a way
  around the guards, and it does not: a baseline is the runner's own evidence that a run was taken, and
  it is that baseline — not the enum value sitting in `status` — that makes reconciliation both
  possible and necessary.

  **The disposition's own status outcome is binding, with `cancelled` the single exception.** Where the
  repair's destination is any permitted status **other than `cancelled`** — `backlog`, `ready`,
  or `blocked` — it MUST equal the status the settled disposition prescribes — `claim` →
  `blocked`, `disown` → `ready`, `rerun anyway` → `ready`, and the *Combining* table's result where
  warning dispositions are involved — and a destination that disagrees is **refused**, naming both the
  requested status and the one the disposition prescribes. Otherwise a repair to `ready` combined with
  `claim` would keep and confirm the recovered work while slipping past the `blocked` landing that
  forces an explicit re-run — and a repair to `backlog` would do the same by a longer road, since
  `backlog` → `ready` returns it to `ready` unguarded. Only **`cancelled`** overrides,
  exactly as in a cancellation edit: there the disposition governs the ids while the cancellation
  governs the status, under guard 2 in full. When the entry falls on the availability table's **ungated
  first row** no disposition exists to prescribe anything, and any permitted destination may be repaired
  to.
- **The settlement clears `runBaseline` in the same write, and the report names the value it cleared** —
  after reconciliation has already consumed it, never before. This is the *Every settling edit clears
  `runBaseline`* rule reaching its last case: after the repair the entry is not `in-progress`, so **no**
  later writer could ever consume that baseline — `/ptp:backlog-run` overwrites it on taking the entry
  and never takes a `cancelled` one — and a baseline left behind would strand exactly the phantom the
  invariant forbids. There is deliberately **no** separate baseline-only edit: `runBaseline` is written
  by the runner and cleared by a settling or repairing edit, and by nothing else.
- Every other rule of this contract is unchanged by the repair — in particular the defect is **still named
  in the report** as an outstanding structural problem until the repairing write lands.

### Guard 1 — `blocked` → `ready`

A `blocked` entry is the residue of a halted `/ptp:full` whose slices sat in
`applied (review pending)` — applied but unreviewed code. A bare reset would let a *later* attempt reach
`done` while that unreviewed code is still on the branch. So the reset:

1. **Retains the prior attempt's `changeEpics` in full** — it never clears them, never prunes them, and
   never relabels them. `/ptp:backlog` goes on listing them.
2. **Requires an acknowledgement**, carried in the instruction, that the prior attempt's unconverged
   slices were resolved — their review finished via `/ptp:review-full`, or the folders abandoned.
3. **Refuses an instruction that does not carry it**, and the refusal **lists the retained
   `changeEpics` ids** so the user knows exactly which folders to go check.
4. The acknowledgement is **report-time only**. v1 persists **no** "prior attempt resolved" field,
   **no attempt id, no attempt boundary, and no per-attempt grouping** of `changeEpics`: once
   `runBaseline` is cleared nothing in the store says which attempt minted which id. What is durable is
   the retained ids themselves, and the report names them so a reset is never mistaken for a clean
   slate.
5. **No `runBaseline` step is performed.** A `blocked` entry's baseline was already cleared by the
   runner's terminal write.

### Guard 2 — any → `cancelled`

A `blocked` entry's retained `changeEpics` ids are the only record of which change folders hold
applied-but-unreviewed code, so abandoning the epic without acknowledging that those slices were
resolved discards that record's only reader — guard 1's hazard reached by a shorter path. Per source
status:

- From **`backlog`** or **`ready`** — no attempt, nothing applied: **unconditional** in both cases, for
  the same reason.
- From **`done`** — **unconditional**, per the rule above.
- From **`blocked`** — **guard 1's acknowledgement, identically**, with the same refusal when it is
  absent. The retained `changeEpics` and `attributionWarnings` survive the cancellation **unchanged**,
  and no `runBaseline` step is performed.
- From a **stale `in-progress`** — the **full recovery machinery** of the next section (reconcile, then
  a disposition the availability table offers) **plus** guard 1's acknowledgement, **plus a mandatory
  `runBaseline` clear in the same write**. The clear is not optional here: `cancelled` is terminal and
  `/ptp:backlog-run` never takes a `cancelled` entry, so a baseline left set could never be cleared by
  any later writer — the entry would be stranded as a permanent phantom un-reconciled run and the
  lingering-baseline invariant would break outright.

  When the post-reconciliation state is the availability table's **ungated first row** — no
  `changeEpics` ids and no `attributionWarnings` — **no disposition is required and none is offered**:
  there is nothing to claim, disown, re-run, promote, or dismiss. The cancellation proceeds on the
  acknowledgement alone and **still clears `runBaseline`** in the same write. Without this clause the
  requirement to carry a disposition would make an empty stale entry impossible to cancel.

Two rules this contract pins for a cancellation edit:

- **The disposition governs the ids; the cancellation governs the status.** A cancellation edit ends at
  `cancelled` whatever the chosen disposition's own status outcome would have been.
- **`rerun anyway` is not offered in a cancellation edit.** It asserts an intent to redo the work, which
  is exactly what cancelling abandons; offering it would produce an edit whose two halves contradict
  each other. `claim`, `disown` (subject to the availability table), `promote`, and `dismiss` are all
  offered.

### Guard 3 — `blocked` → `done` and `in-review` → `done` (the resume rows)

**Guard 3 governs both rows that reach `done`**, and both are available **only** when this invocation
itself produces the proof. `blocked` → `done` exists for one situation and no other:
`/ptp:backlog-run` halted an epic (`in-progress` → `blocked`) whose work was in fact finished, most
often because the apply agent correctly refused to check off a **manual-only** verification task. Once
a human performs that verification, the work is done — but nothing in the store proves it.
`in-review` → `done` exists for the complementary situation: the epic's `/ptp:full` **did** converge,
but `/ptp:backlog-run` performs no archive, so the epic's work converged while the epic itself is
still unarchived and unsettled — converged is not finished, and only the archive makes it so. The
predicate is one, over both sources:

- the entry's `status` is **`blocked`** or **`in-review`**, and its `changeEpics` is **non-empty** —
  the same predicate that made it `/ptp:backlog-continue`'s target; **and**
- the write happens **in the same `/ptp:backlog-continue` invocation** whose bare flow has just
  settled **every** prefix in `changeEpics` — each one's **review gate satisfied in that invocation**,
  by its own `/ptp:review-full` run to convergence (`BOTH PHASES DONE`, or `ptp-codex-mode`'s mode-skip
  terminal state) **or** by an eligible `reviews/code.json` review-convergence marker whose fingerprint
  that same invocation **recomputed and verified there and then** against the current working tree and
  change contract (`ptp-review-loop`'s six-condition skip-eligibility predicate) — and then
  `/ptp:archive` successfully, or found already absent from `openspec/changes/`.

**The two sources differ only in what the entry's history proves, and this guard says so:**

- From **`blocked`**, the epic's `/ptp:full` did **not** converge, and the guard's proof supplies the
  convergence the run never had.
- From **`in-review`**, the epic's `/ptp:full` **did** converge, and the guard's proof supplies the
  **archive** the runner is forbidden to perform.

In both cases the proof is **this invocation's own** — a successful review-full report, or an eligible
marker **re-proved here** — plus a completed `/ptp:archive`, never an *unverified* assertion about the
past. The marker form is admissible for exactly that reason and no other: its fingerprint is recomputed
in this invocation, after the checkbox flip and the re-verification, against the very content about to
be archived, so what the guard accepts is a fact it established **now**, not a claim recorded earlier
and taken on trust. An ineligible or unverifiable marker is no proof at all and sends the prefix
through `/ptp:review-full` exactly as before.

**It is never available as a standalone disposition, from either source.** There is no "mark this
done" free action on an already-`blocked` or already-`in-review` entry from a prior session, and no
recovery path, disposition, or combination of dispositions may produce it. This is the load-bearing
difference from a hypothetical
`/ptp:backlog-edit` disposition: a recovery disposition reasons about a **stranded, possibly-crashed**
run, able to establish **neither** its per-prefix review convergence **nor** its archive — which is
exactly why *Recovery and reconciliation* below never yields `done` — whereas guard 3's proof is **produced or
re-proved in this invocation**, never accepted as an assertion about the past.
`/ptp:backlog-edit` has no review-full/archive machinery of
its own, can therefore never satisfy this guard from **either** source, and refuses `in-review` →
`done` exactly as it refuses `blocked` → `done`; both refusals are unchanged.

**Write shape**, mirroring the **shape** of the runner's own convergence write
(`in-progress` → `in-review`) — the shape, not its value, that write now committing `in-review` while
this one commits `done`:

1. set `status: done`;
2. **clear `runBaseline`** — already `null` on an entry reached through either `in-progress` →
   `blocked` or `in-progress` → `in-review`, so a no-op in the common
   case, stated for completeness in case a hand edit left it non-null, and consistent with *every
   settling edit clears `runBaseline`*;
3. **retain `changeEpics` exactly as-is** — it already records every prefix now archived, so unlike
   `runBaseline` there is nothing to add and nothing to clear;
4. **send no `updatedAt`** — the stamp is **board-maintained** (*Timestamps* above): the store exposes
   no setter, so the write carries no value for it and the board's own stamp stands. A writer that
   "bumps" it in memory has changed nothing durable, and no caller may read that bump back as stored.

One single write **group**, dispatched through `ptp-backlog-write`'s ordered sequence exactly as every
other writer's is — the clear a payload row, `done` the commit — touching no other entry. **No second
write shape enters the contract.** If **any** prefix fails to settle, **no** transition occurs: the
entry stays in its existing status (`blocked` or `in-review`) with its `changeEpics` unchanged, and the
partial progress lives in the archived change folders alone.

### `in-review`'s outgoing edges — exactly two

`in-review` has **exactly two** outgoing edges:

1. **`in-review` → `done`** — the resume row above, under **guard 3**.
2. **`in-review` → `cancelled`** — the existing unconditional **any → `cancelled`** row, and it is
   **ungated**. That row's gated sources are named exhaustively as `blocked` and a **stale**
   `in-progress`; an `in-review` entry is neither, and its `runBaseline` is null, so there is nothing to
   reconcile and no acknowledgement to collect. `changeEpics` survives the cancellation, as it does from
   every source.

**`in-review` → `blocked` is absent from the table and refused.** The reason:

> `blocked` means one specific thing — **a `/ptp:full` did not converge and the run halted**. It is
> written by `/ptp:backlog-run` at WRITE 2 and by `/ptp:backlog-edit`'s recovery dispositions on a
> **stale** `in-progress` entry, and it is the input the recovery machinery keys on. An `in-review`
> entry has a **converged** `/ptp:full` and a **null** `runBaseline`: there is no run to reconcile and
> no halt to record. Admitting this edge would give `blocked` a second meaning, which is precisely the
> defect splitting `done` exists to remove.

**Every other outgoing edge is absent and refused too** — `in-review` → `ready`, `in-review` →
`backlog`, `in-review` → `in-progress`. **The refusal names the two real remedies**, so it is never a
lockout:

- **A problem was found in the converged work** → `/ptp:backlog-continue "<what is wrong>"`, the
  **issue-text flow**. It runs one scoped fix pass and writes **no** status; the entry stays
  `in-review`, and the bare flow's `/ptp:review-full` re-reviews the fix before any archive.
- **The epic should be re-run from scratch** → `in-review` → `cancelled` (edge 2 above), then the
  existing unconditional `cancelled` → `ready` revival. Two explicit user acts, both rows that already
  exist, with the cancellation itself serving as the acknowledgement.

## Recovery and reconciliation

**A stale `in-progress` entry** is one whose `status` is `in-progress` **and** whose `runBaseline` is
**non-null**. The invariant this contract keeps is that, **once no backlog run is live**, a lingering
`runBaseline` means an **un-reconciled crashed run and nothing else**: the runner clears it on
`in-review` and on `blocked` alike, and every settling edit below clears it too.

**A live run presents the identical on-disk state, and nothing here claims otherwise.** The runner
writes `in-progress` and `runBaseline` in a **single** write **before** its work begins, so a read of
the store **cannot distinguish** a running epic from a crashed one, and `/ptp:backlog` therefore words its
stale flag **conditionally** rather than asserting a crash. v1 has **no multi-writer locking** (a
non-goal), so `/ptp:backlog-edit` cannot detect a live run either — and unlike the view its writes are
destructive, since settling clears the baseline a live run would itself have consumed. The rule:
**invoking `/ptp:backlog-edit` against a stale entry is the user's attestation that no backlog run is
live for it**, and the command's wording — in its report and in **every** gate refusal below — matches
`/ptp:backlog`'s: *un-reconciled from a crashed run only if no backlog run is currently live*. **No
sentence of this contract asserts that a crash occurred.** The invariant above states what a lingering
baseline *means* once no run is live; it is not a claim that the store can tell.

### The change-prefix set (defined here, used by both the snapshot and the diff)

The `runBaseline` snapshot and the reconciliation diff below MUST be computed over the **identical**
prefix set — a diff between two differently-defined sets is meaningless — so the set is defined **here,
exactly once**, and every writer (`/ptp:backlog-run`'s snapshot in `0036_04`, reconciliation in
`0036_03`) **cites this definition rather than restating one**:

```
prefixes = { leading 4-digit group of each folder name matching ^\d{4}_ }
           over  folder names directly under openspec/changes/   (excluding "archive")
               + folder names under openspec/changes/archive/
                 with each leading YYYY-MM-DD- date prefix stripped
```

This mirrors `ptp-change-selector` § 4's epic allocation deliberately — the same scan, over the same
two locations — so **active and archived** change epics both count and a change **archived during the
run window does not read as a disappearance**. Each prefix is carried **as a string**, leading zeros
significant, exactly as a `changeEpics` element's `id` and an `attributionWarnings` element are.

### Reconciliation — runs first, and is always additive

Reconciliation runs **before** the gate below, wherever a **non-null `runBaseline`** is being settled —
on a **stale** entry, and in the unset-or-out-of-enum-status repair the previous section routes here (a null
`runBaseline` has nothing to diff — see *The hand-edited entry* below):

1. Compute the **current** prefix set per the definition above.
2. `recovered = current \ runBaseline`.
3. For each prefix in `recovered`, in **ascending** order:
   - **already in `attributionWarnings` → skip.** That prefix was already judged *not* this epic's on
     authoritative evidence; sweeping it in here would be exactly the **silent union** the warnings
     field exists to prevent.
   - **already in `changeEpics` → leave its attribution unchanged.** Reconciliation **never downgrades
     provenance**: the diff finding a `terminal-report` id again is not evidence against the report
     that produced it.
   - **otherwise → append** `{ id, attribution: "folder-diff-unconfirmed" }`.
4. Reconciliation **removes nothing and relabels nothing**.

### The hand-edited entry — `in-progress` with a null `runBaseline`

Only a hand edit can produce this state. Such an entry is **not reconciled** — there is nothing to diff
against — but **the gate below still applies**, evaluated on the entry's **existing** `changeEpics` and
`attributionWarnings` holdings, and any refusal **states that no diff was possible**, so the user is
never told a diff was run that was not.

It follows that **the gate's trigger is `in-progress` with a status-changing instruction — not
*stale*.** Only the reconciliation step is conditioned on a non-null baseline. Keying the gate on
staleness instead would let the null-baseline entry slip past it entirely. (An edit that touches only
fields of an `in-progress` entry changes no status and is therefore not gated at all.)

There is exactly **one** further trigger, in the mirror-image case: an entry whose stored `status` is
**unset or out of enum** but whose `runBaseline` is **non-null**. Its status cannot be read as `in-progress`, yet
the baseline is the runner's own evidence that a run was taken, so the *Repairing a `status` that is unset or out of
enum* rule above routes that repair through **this same machinery** — reconciliation, this gate, an
offered disposition, and guard 2 when the destination is `cancelled`. Stating it here keeps the trigger
enumerated in one place: **`in-progress` with a status-changing instruction, or a non-null
`runBaseline` under an unset-or-out-of-enum-status repair.** Nothing else is gated.

### The gate

An **ordinary reset is refused** while the entry holds **any `changeEpics` id — whatever its
attribution — or any undispositioned `attributionWarnings` entry**. Both halves of that key matter:

- Keyed on **"ids exist"**, not **"unconfirmed ids exist"**, because the hazard is *change folders
  already exist for this epic*, and a `terminal-report` id proves that as well as a provisional one does.
  The runner writes `changeEpics` **before** the status write, so a crash **in that window** leaves an
  entry carrying **only** `terminal-report` ids and no provisional id at all — which an unconfirmed-only
  gate would wave straight through to `ready`, silently re-running work that already landed.
- Keyed on **warnings too**, because a stale entry carrying only warnings would otherwise slip through
  ungated, and an undispositioned warning is an unexamined *"did this epic mint that folder?"*.

### The availability table

Evaluated on the **post-reconciliation** state. An id is **confirmed** when its `attribution` is
`terminal-report` or `user-confirmed-reconciliation`, and **provisional** when it is
`folder-diff-unconfirmed`.

| Entry holds | Gate | Dispositions offered |
|---|---|---|
| no `changeEpics` ids and no `attributionWarnings` | none | ordinary reset — nothing to reconcile |
| `attributionWarnings` only (no `changeEpics` ids) | gated | **promote** each warned prefix → `changeEpics` as `user-confirmed-reconciliation`, status → `blocked`; or **dismiss** it as another session's work, status → `ready`. The id-level dispositions do not apply — there is no id to claim, disown, or re-run against |
| provisional ids only | gated | **claim**, **disown**, **rerun anyway** |
| any **confirmed** id (alone or alongside provisional ones) | gated | **claim**, **rerun anyway** — **`disown` is withheld** |

**`disown` is withheld the moment a confirmed link exists** because it is the one disposition that
returns the entry to `ready` while asserting *nothing was done here* — and a confirmed id is direct
evidence that something was. Dropping only the provisional ids and resetting would leave a confirmed
link proving prior work while the entry re-enters the ready set unacknowledged: a silent duplicate run.
A user who wants to re-run regardless does so through **rerun anyway**, which carries the duplication
acknowledgement explicitly.

**`attributionWarnings`, when present, are dispositioned in the same edit in every gated row.**

**The warnings-only row is not a dead case.** The runner persists `attributionWarnings` while the status
is still `in-progress`, and a `/ptp:full` report can be present yet name no change ids while the folder
diff still finds a prefix — that prefix lands in `attributionWarnings` with `changeEpics` still empty. A
crash in that window leaves exactly this shape.

### Disposition outcomes

| Disposition | `changeEpics` outcome | Status |
|---|---|---|
| **claim** | **only** `folder-diff-unconfirmed` ids are relabelled, to `user-confirmed-reconciliation`. Every already-**confirmed** id — `terminal-report` *and* any pre-existing `user-confirmed-reconciliation` — keeps its existing attribution **untouched** (never downgraded, never re-stamped: vouching for the recovered ids says nothing about the authoritative ones, and re-stamping an already-vouched id would be a write with no meaning) | `blocked` |
| **disown** | **only** `folder-diff-unconfirmed` ids are dropped; every **confirmed** id (`terminal-report` or `user-confirmed-reconciliation`) is **retained with its attribution unchanged** — disowning an inferred link cannot un-say a `/ptp:full` report, or a human, that named the id, and dropping those would destroy the one authoritative backlog↔change link the schema exists to hold. Offered only per the table above | `ready` |
| **rerun anyway** | **every** id retained, **no** id relabelled | `ready`, with the duplication acknowledged in the report |
| **promote** (**per warned prefix**) | the prefix is removed from `attributionWarnings` and appended to `changeEpics` as `user-confirmed-reconciliation`. If the prefix is **already** in `changeEpics` — a state reconciliation cannot create, but a runner write or a hand edit can — the warning is **still removed**, the **existing element keeps its attribution**, and **no second element is appended**, since ids are unique within the array and provenance is never downgraded | see *Combining* below |
| **dismiss** (**per warned prefix**) | the prefix is removed from `attributionWarnings` and is **not** added to `changeEpics` | see *Combining* below |

**`promote` and `dismiss` are per-prefix**: an entry carrying three warnings may promote one and dismiss
two in a single edit.

**No disposition lands an entry in `backlog`.** A disposition that returns an entry to the run queue
restores the state the runner took it from, and the runner takes only `ready` entries; landing recovery
in `backlog` would silently demote work a human had already promoted.

### Combining an id disposition with warning dispositions

| Combination | Status |
|---|---|
| `claim` + any warning disposition | `blocked` |
| `rerun anyway` + any warning disposition | `ready` (duplication explicitly accepted) |
| `disown` + `dismiss` only | `ready` |
| `disown` + any `promote` | **refused as self-contradictory** — `disown` asserts nothing here was this epic's work; `promote` asserts a warned prefix was |
| warnings only, any `promote` present | `blocked` |
| warnings only, all `dismiss` | `ready` |

Any `promote` is evidence of prior work, which is why it pulls toward `blocked` — the same reasoning
that lands `claim` on `blocked` — except under `rerun anyway`, which explicitly accepts duplication.

### Every settling edit clears `runBaseline` in the same write

**Every** edit that settles a stale entry clears `runBaseline` in that same single write: **any
disposition**, **the ungated reset of the availability table's first row**, and **a cancellation**. The
ungated reset is named explicitly because it is the easiest of the three to miss — an entry with
nothing to reconcile still carries a baseline that must go. One edit outside this section carries the
same obligation for the same reason: the **unset-or-out-of-enum `status` repair** above, which moves an entry out
of the `in-progress` space where a baseline could still be consumed.

Left set, the baseline would have three consequences, each worse than the last:

1. `/ptp:backlog` would go on flagging an **already-settled** entry as stale;
2. **guard 2** would **re-gate** a settled attempt;
3. a later `/ptp:backlog-run` taking the entry would write a **fresh** baseline **over** the stale one —
   so the stale value is not merely noise, it is **silently destroyed evidence**.

### Recovery never yields `done`

**No recovery path, no disposition, and no combination of dispositions may set `done`.** An instruction
asking for it is **refused with the reason**, never silently downgraded.

*Every slice landed in `processed`* — `processed` meaning applied **and code-review converged** — is
what defines **`in-review`**; `done` requires, on top of that convergence, the **archive** only
`/ptp:backlog-continue` performs. Recovery can prove **neither**. A crashed run has no in-session
terminal report, and **no durable artifact substitutes for one**. `ptp-review-loop` does now write a
`kind = code` marker — `reviews/code.json`, carrying a content fingerprint — so code-review convergence
is no longer traceless; but that marker is **change-scoped, review-only, and per-prefix**, and recovery
needs an **epic-scoped** fact about **both** halves. It says nothing about the **archive** `done` also
requires; it exists only for whatever prefixes actually reached a terminal review, which is precisely
what a crashed run cannot be assumed to have done for **all** of `changeEpics` (an unreviewed slice
leaves no marker, and a `cap-reached` one authorizes nothing); and a marker is meaningful only once its
fingerprint is **recomputed against the current content**, which is an act of the invocation that
consumes it, not a fact recovery can read off disk. Rather than invent the missing half of an evidence
rule, v1 forbids the outcome: `claim` —
the only disposition that *keeps* the recovered work — lands on `blocked`, and the user re-runs
explicitly; the other two land on `ready` precisely because they discard the claim that the work is
finished. A wrongly-`done` epic would **record shipped work that was never reviewed**, and both
`/ptp:backlog` and `/ptp:backlog-continue` would stop offering it as work a human still needs to
finish.

**The durable code-review-convergence marker remains the named seam** an evidence-based `accept`
disposition would be built on. Half of it now exists (`reviews/code.json`); the archive half, and the
epic-scoped per-prefix roll-up above it, do not — and **no disposition consumes the marker**. This rule
is therefore unchanged by the marker's arrival, and its absence is still not a v1 gap.

**Guard 3's two rows — `blocked` → `done` and `in-review` → `done` — do not weaken this rule; they
sidestep it.** `/ptp:backlog-continue` reaches `done` from either source **not** by accepting an
assertion about a past run but by **settling every prefix itself, in the same invocation**: it runs
`/ptp:archive`, and it satisfies the review gate either by **performing** `/ptp:review-full` or by
**re-proving** an eligible marker's fingerprint against the content it is about to archive, at that
moment (see **guard 3**). Either way the fact it relies on is established in-session; nothing is
inferred from disk **unverified**. Nothing here becomes reachable from recovery: a
disposition still lands on `blocked` or `ready`, and a stale `in-progress` entry still has no path to
`done` — or to `in-review` — at all.

### An ambiguous instruction against a gated entry is refused

An instruction against a gated entry that does **not unambiguously name a disposition the table offers
for that entry** is **refused, with the offered dispositions printed**. This is a **refusal, not a
clarifying question**: the commands consuming this contract are autonomous, so the safe response to
ambiguity is to **refuse** and show what is available, never to **ask** and never to guess.

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
