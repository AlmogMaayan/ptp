---
name: ptp-backlog
description: Own the epic backlog board contract — the store being one GitHub Projects v2 board per repository, resolved through ptp-github-projects-mcp's configuration and capability preflight with no local backlog file, no second store and no fallback; the rule that every board item is an entry, no membership test being performed; the ten-field entry model and its tolerant read; the field mapping of those ten slots onto five board carriers — the one required custom field Status (SINGLE_SELECT), the item's title and body, and the board's own stamps — with the status option table, the sentinel-fenced metadata block and its malformed-body boundaries, and unknown-key preservation in both scopes; the ptp-backlog-version: marker and its gate, whose absent-marker-reads-as-v1 divergence is justified in place; the read-only read protocol with its configuration-completeness-then-preflight precondition, its returned handle table and its degraded scope; the node-id identity rule, under which nothing is allocated, minted or written and two ids can neither collide nor be malformed; the validator and its fixed four-code problem vocabulary with the fatal/structural split, the writer-eligibility rule that refuses past fatal problems only, and the distinct unreachable-store outcome; and the ready-set definition — the pending entries in the board's creation-stamp order — with its order deterministic over the produced document. A pure prose contract in the single-source-of-truth pattern of ptp-branch-guard (branch safety), ptp-codex-mode (the reviewer gate), ptp-agent-roles (role resolution), and ptp-parallel-fanout (fan-out safety) — it reads nothing on its own, writes nothing, and edits nothing. Also owns the status transition table — eight rows, each naming its performer — with its three guards (the gated blocked-to-pending reset that retains the prior attempt's changeEpics, the any-to-cancelled guard, and the blocked-to-done resume row available only as the same-invocation result of /ptp:backlog-continue's own review-full-then-archive sequence), and the recovery-and-reconciliation machinery every writer that settles a stale in-progress entry runs: the stale definition and its deliberately conditional wording, the single change-prefix-set definition both the runBaseline snapshot and the reconciliation diff cite, the additive-only reconciliation, the gate, the availability table and the disposition outcomes (claim / disown / rerun anyway, and per-prefix promote / dismiss) with their combination rules, the every-settling-edit-clears-runBaseline rule, and the never-yields-done rule. The contract was defined over a local file by 0036_01, which ships no writer; the transitions and recovery machinery by 0036_03 alongside /ptp:backlog-edit, the runner in 0036_04; the store became a GitHub Projects board in 0042_03, which ships the read half and leaves every writer refusing.
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

The **transport** — which board, through which MCP server, under which namespace, and whether its tools
are callable — is `ptp-github-projects-mcp`'s, not this skill's. This contract **cites** it and restates
none of it: not the `backlog.*` keys, not the namespace rule, not the tool set, not the preflight, not
its record, and not its STOP message.

This skill is a **pure prose contract**. It states obligations; it performs none of them. It reads no
file on its own, writes no file, runs no git command, and edits nothing.

## The store

**The backlog is one GitHub Projects v2 board per repository**, resolved through
`ptp-github-projects-mcp`'s `backlog.*` configuration and admitted by its capability preflight.

**There is no local backlog file, no second store, and no fallback.** No ptp command reads, creates,
modifies, or deletes a local backlog file. No failure path — not an incomplete configuration, not a
failed preflight, not an unreachable board, not a fatal problem — may fall back to a local file or to
any other store. A fallback would split one backlog across two stores, which is the one unrecoverable
outcome this contract exists to prevent.

**A backlog file left on disk by an earlier ptp — `openspec/backlog.json`, the deleted legacy store — is
legacy data and is left exactly as found.** It is
never read, parsed, validated, migrated, moved, or deleted, and ptp adds, modifies, and removes no
ignore or attribute rule covering it. `/ptp:backlog` performs a **presence check only** on the path and
says so in one scope-note line; that is the whole of ptp's remaining relationship with it.

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
  "epics": [ /* entry objects, in the canonical createdAt order */ ]
}
```

| Key | Type | Source | Notes |
|---|---|---|---|
| `version` | integer | the board's version marker (*Version marker and gate* below) | Exactly `1` in v1. No candidate anywhere ⇒ `1`, synthesized in memory. |
| `epics` | array of entry objects | the board's items — **every one of them is an entry** (*Every board item is an entry* below) | May be empty. Ordered by the canonical key below — never board order, never column order, never any view's position. |

**The `epics` order is total, which a file's array position made free and a board does not.** The
canonical key is: **`createdAt` ascending; an entry whose `createdAt` is unusable — absent or
`malformed-entry` — orders after every entry with a usable one; the node id ascending by Unicode code
point of its canonical JSON serialization is the final tie-break in every case.** That last component is
what makes the order total: two entries can share a `createdAt`, but never a node id.

**`createdAt` is compared as an *instant*, never lexicographically** — and saying so is not pedantry,
exactly as *all id ordering is numeric* was not in the rule this replaces. The normalized stamps
(*Timestamps* below) are ISO-8601 UTC, but they may differ in fractional-second precision, and
`2026-01-01T00:00:00.500Z` sorts **before** `2026-01-01T00:00:00Z` by code point while falling **after**
it in time. Two stamps naming the same instant at different precisions are **equal** for this key and
fall to the node-id tie-break. Only the node-id component is compared by code point, and it says so in
place.

### Entry object

**Ten** recognized fields. This is the **canonical key order** — writers emit exactly this order:

| # | Field | Type | Required on read | Empty value | Written by |
|---|---|---|---|---|---|
| 1 | `id` | string, opaque board node id | **yes** | — | **nobody — board-supplied** (*Identity* below) |
| 2 | `title` | string, non-empty | **yes** | — | add / edit |
| 3 | `description` | string | no | `""` | add / edit |
| 4 | `status` | enum | **yes** | — | add sets `pending`; transitions in `0036_03` / `0036_04` |
| 5 | `changeEpics` | array of `{ id, attribution }` | no | `[]` | runner (`0036_04`), reconciliation (`0036_03`) |
| 6 | `attributionWarnings` | array of 4-digit change-epic prefixes | no | `[]` | runner (`0036_04`) |
| 7 | `runBaseline` | `null` or array of 4-digit change-epic prefixes | no | `null` | runner (`0036_04`), cleared by `0036_03` / `0036_04` |
| 8 | `createdAt` | `null` or ISO-8601 UTC instant string | no | `null` | **nobody — board-maintained** (*Timestamps* below) |
| 9 | `updatedAt` | `null` or ISO-8601 UTC instant string | no | `null` | **nobody — board-maintained** (*Timestamps* below) |
| 10 | `notes` | string | no | `""` | user edit |

**`id`'s requirement is satisfied by construction:** the transport supplies a node id on every board
item, so a read cannot produce an entry without one.

**`status`** is exactly one of `pending`, `in-progress`, `done`, `blocked`, `cancelled`. This change
treats status as **data**: it reads it, renders it, and uses it in the ready-set rule. It performs no
transition and defines no transition table — that is `0036_03` / `0036_04`.

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

### The carrier table

| # | Field | Required on read | Carrier |
|---|---|---|---|
| 1 | `id` | **yes** | the board item's own **node id** — the item's identity, not a carried value |
| 2 | `title` | **yes** | the item content's **title** |
| 3 | `description` | no | the item **body**, everything before the `begin` sentinel |
| 4 | `status` | **yes** | the board's **`Status`** SINGLE_SELECT, through the option table below |
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

No entry field is read from more than one carrier, and no board state causes a field to be inferred from
a carrier other than its own.

### Required and optional carriers — a floor of one, never a cap

**Exactly one custom field must pre-exist:** `Status` (SINGLE_SELECT). That is a **floor, never a cap**.
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
| `pending` | `pending`, `Todo` |
| `in-progress` | `in-progress`, `In Progress` |
| `done` | `done`, `Done` |
| `blocked` | `blocked`, `Blocked` |
| `cancelled` | `cancelled`, `Cancelled`, `Canceled` |

> **The resolved table** is the built-in default table with each status's row replaced by that status's
> resolved override where one exists, and left at its default row where none does.

The overrides come from the `backlog.statusOptions` configuration key, whose path, kind, per-status-key
validity, and layered forgiving resolution are owned by `ptp-github-projects-mcp` — see that skill for
the key itself; its validity rules are **not** restated here. This skill owns the **default table**, the
**merge** onto it, the **resolved table's** semantics, and the **collision rule** below.

Matching is unchanged: on the selected option's **name**, **case-insensitively** and
**whitespace-trimmed**, with no fuzzy matching and no near-match. Configuration changes *which names are
in the table*; it never changes *how a name is matched*, and it never adds a sixth status — the five
entry `status` values are the schema's.

#### Replace, not extend

A configured row **replaces** its default row rather than being unioned with it. Extension can never
lose a spelling that used to work, which is genuinely attractive, and it is rejected for two reasons:

1. It makes it **impossible to stop** `Todo` meaning `pending`. A board that uses `Todo` for something
   else — a triage column, say — would have every card in it read as a `pending` epic.
2. It would make a collision **permanently unfixable**. A user whose pending column is literally named
   `Done` configures `pending: "Done"`; under extension the `done` row still contains `Done`, and there
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
  (`pending: "Done"` against the untouched `done` row).
- **Duplicates within one row are not a collision.** `["Todo","todo"]` normalizes to one name on one
  row; only two **distinct** statuses claiming one normalized name collide.
- **It is a configuration defect, not a board defect**, and therefore **not** `malformed-file`: raising a
  board problem code for a JSON typo would report the fault in the board's problem table and send the
  user hunting the board for something that is in a config file. It adds nothing to the problem
  vocabulary.

Two precedents, both exact in shape. `ptp-github-projects-mcp`'s **`mcpServerInvalid`** carve-out also
has resolution never throw, has the fact computed and carried as a verdict, and leaves the **refusal** to
the consumer; it differs only in *where* the fact is computed, and that is forced by the ownership split
— `mcpServerInvalid` is decidable from the key alone, while a collision needs the **resolved** table,
which needs the default table the transport skill deliberately does not hold. And this skill's own
**normalized-name collision on a required carrier** applies the same doctrine: *never resolved by picking
one*.

#### The four situations

Four situations, deliberately landing in four different places:

| Situation | Outcome |
|---|---|
| the selected option's name is **outside the resolved table** (`Needs review`) | `malformed-entry` on `status`, **never coerced** to a nearby value |
| the item has **no `Status` value set** (a real Projects state) | `malformed-entry` on `status` — `status` is required on read and is **never invented** |
| the board **has no `Status` field**, or it is not a SINGLE_SELECT | `malformed-file`, **fatal** (above) |
| the board's `Status` field **lacks an option** for one of the five values | **not a read defect at all** — no item can carry an option that does not exist. It is the **write path's refusal** (`ptp-backlog-write`, *The commit refuses when the resolved row does not identify exactly one board option*), and the view **notes it** (below) |

**The advisory.** `list_project_fields` already returned the board's `Status` options, so the read is the
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

**Why the churn is harmless where it matters:** **`updatedAt` is read by nothing computed.** The
canonical `epics` order, the ready-set order, and the problem sort key all read **`createdAt`** — and
`createdAt` is the one board stamp the board **never mutates after creation**. So a card touched in the
UI moves only `updatedAt`, which changes what the view *displays* about it and **nothing about what the
view computes**. The distinction between the two stamps is what makes this an amendment of the old claim
rather than an abandonment of it.

A `malformed-entry` on `createdAt` therefore does reach a computation, and its three consequences are
stated together: the entry **orders last** (per the canonical key), the **ready set is withheld** as
under any structural problem, and the store is **not** made writer-ineligible (*Writer eligibility*
below).

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
     `ptp-github-projects-mcp` and read its verdict. Then, in this fixed
     order, REFUSE non-silently on any of THREE grounds:
       (1) the configuration is INCOMPLETE — naming the missing keys;
       (2) `mcpServerInvalid` — naming `backlog.mcpServer`;
       (3) the RESOLVED status-option table COLLIDES — merge the verdict's
           `statusOptionOverrides` onto the built-in default table and apply
           the collision rule above, naming `backlog.statusOptions`, the
           colliding name, and every status claiming it.
     All three are decidable from CONFIGURATION ALONE, so all three precede
     the preflight and precede every board call. NO Projects tool is called.
     This is NOT the preflight.
  1. Run `ptp-github-projects-mcp`'s capability preflight.
       a verdict that does not admit the read → terminate through THAT
       skill's non-silent STOP, cited and never restated here.
       a verdict that admits the read → continue.
  2. Fetch the PROJECT itself — its title, its URL, and the two strings the
     version marker may live on (its `shortDescription` and its `readme`).
     This is the only source of those four values; none of them is inferred
     from the items.
       not obtained → the `unreachable-store` outcome. STOP.
  2b. Fetch EVERY item page to cursor exhaustion.
       not pagination-complete → the `unreachable-store` outcome. STOP.
  3. Map the carriers: the one custom field, the title, the body and its
     block, the two stamps.
  4. Apply the VERSION GATE.
  5. VALIDATE. Readers report the problems; writers apply writer
     eligibility below.
  6. Return the document, the problem list, the unavailable mask, the
     handle table, and the `Status` field's option names as read at
     step 3.
```

**Three absolutes.**

- **The read creates nothing** — no project, no custom field, no `Status` option, no item, no version
  marker. This is the board analog of the file contract's *no read ever creates the file*.
- **The read writes nothing**, modifies nothing, and deletes nothing.
- **A missing required field is reported, never created**, and a defect is reported, never repaired,
  never overwritten, never worked around.

### Why the completeness verdict is step 0 and not part of the preflight

`ptp-github-projects-mcp` is explicit that a `ready` verdict means *the required tools are callable* and
says nothing about whether a board was **named** — board identity is the configuration contract's
separate completeness verdict. So an unset `projectOwner` / `projectNumber` passes the preflight
untouched, reaches the transport, and comes back as project-not-found: a transport error standing in for
a one-line config fix. Folding the two together loses that distinction, which is why the refusal is
**this** contract's obligation — a resolver that never stops cannot itself refuse.

### What a read returns

Three things, deliberately separate:

1. the **document** `{ version, epics }` in the in-memory shape the validator and the ready set consume
   unchanged, plus the ordered **problem list** and the **unavailable mask**;
2. a **handle table keyed by the board item's node id** —
   `nodeId → { itemId, contentType, isArchived }`;
3. the **`Status` field's option names, verbatim and in board order** — the values step 3 already read
   in order to map the carrier.

The handles stay **outside** the entry objects, so the entry model gains no store-specific field for
unknown-key preservation to reason about.

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

### Degraded scope — when archived items are unreachable

The state: the resolved transport can enumerate items but **cannot return archived ones**. That is a
**transport capability limit, not a document defect**: it raises **no problem code**, and the read still
proceeds, because a view that refuses over a limit it can describe is useless.

**Exactly one thing is withheld, and the view says why: the ready set.** An incomplete `pending` set can
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

**How the read knows.** Archive reachability is read from `ptp-github-projects-mcp`'s preflight record —
its `archiveReachable` fact — and is **never inferred from the result set**: a complete fetch of a board
with no archived cards returns exactly what an archive-limited transport returns, so "zero archived items
came back" establishes nothing. Per that skill's own consumer rule, **only `true` establishes full
scope**; `false` and `"unknown"` are treated **identically** as *not established* and both degrade, the
two being distinguished only so the reported reason is honest. Where the record publishes no such fact at
all, the read degrades rather than claiming a scope it cannot establish — withholding costs a user a
ready set, whereas wrongly assuming full scope costs them a runner taking the **wrong epic**.

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
| the preflight did not admit the read | the **full STOP message** in `ptp-github-projects-mcp`'s specified shape — its seven labels in order — **alongside** the header verdict line |
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

**The one candidate, considered and rejected.** The canonical order now reads `createdAt`, so a
`malformed-entry` on `createdAt` is the natural replacement condition. It is rejected for a decisive
reason: **`createdAt` is board-maintained and the store exposes no setter**, so a store made
writer-ineligible by a bad stamp would be **unrepairable through ptp forever** — precisely the lockout
this rule exists to prevent. The order's fallback already keeps the order well-defined over such an
entry, so refusing would buy nothing.

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

An entry is **ready** when its `status` is **`pending`**. The ready set is the `pending` entries in the
**canonical order** below. **No topological pass is performed.**

Two readings are wrong, and both are ruled out here:

- It is **not** a relaxed dependency filter. There is no filter to relax — the clause was deleted in
  `0042_01`, not weakened.
- It is **not** a second conjunct that is still evaluated and *vacuously satisfied over an empty edge
  set*. Nothing of the kind is materialized, so the predicate has no such input at all and `status`
  is the whole of it.

### Order

The **canonical order**, identical to the `epics` order above: **`createdAt` ascending; an entry whose
`createdAt` is unusable — absent or `malformed-entry` — orders after every entry with a usable one; the
node id ascending by Unicode code point of its canonical JSON serialization is the final tie-break in
every case.** There is **no `priority` field**; the board's creation stamp supplies the stable,
first-in-first-out order.

**The order *within* a ready set is unchanged** by the deletion of the dependency pass: the topological
pass never constrained it (every member of a ready set already had its predecessors settled), so the
canonical tie-break was always the whole visible order. Removing the pass removed **ordering**
machinery, not ordering behavior. **Ready-set *membership* is a different matter and did change** — a
backlog that carried edges now admits every `pending` entry at once, so one that used to run in a
dependency-derived order now runs in the canonical order. That is a deliberate behavior change, recorded
as such in the release notes.

**Determinism, over the produced document.** Ordering reads **only materialized fields**, so **for any
given produced document the ready set and its order are fully deterministic** — computing them twice
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
of this table — `/ptp:backlog-edit` (`0036_03`) performs the four **user** rows, `/ptp:backlog-run`
(`0036_04`) performs the three **runner** rows, and `/ptp:backlog-continue` (`0038_01`) performs the
single **resume** row 8 — and all three **reference** the table rather than restating any part of it.
(`0036_01` deliberately defined no transition table; this section is where it lands.)

The complete table. Every row names its **performer**; there are no other rows:

| # | From → To | Trigger | Performer |
|---|---|---|---|
| 1 | `pending` → `in-progress` | the runner takes the epic (writes `runBaseline` in the same write) | `/ptp:backlog-run` |
| 2 | `in-progress` → `done` | every slice landed in `processed` | `/ptp:backlog-run` |
| 3 | `in-progress` → `blocked` | `/ptp:full` did not converge; the run halts | `/ptp:backlog-run` |
| 4 | `in-progress` → `blocked` \| `pending` | **recovery only**, via the reconciliation gate below (`claim` → `blocked`; `disown` / `rerun anyway` → `pending`). **Never `done`.** | `/ptp:backlog-edit` |
| 5 | `blocked` → `pending` | explicit user reset, gated (**guard 1**) | `/ptp:backlog-edit` |
| 6 | any → `cancelled` | the user abandons the epic; from `blocked` or a stale `in-progress` it carries guard 1's acknowledgement (**guard 2**) | `/ptp:backlog-edit` |
| 7 | `cancelled` → `pending` | explicit user revival | `/ptp:backlog-edit` |
| 8 | `blocked` → `done` | **only** as the direct, same-invocation result of `/ptp:backlog-continue`'s own bare-flow review-full → archive sequence settling **every** prefix recorded in `changeEpics` (**guard 3**) | `/ptp:backlog-continue` |

**Explicit user edits may target an entry in any status**, `done` and `in-progress` included — on a
`done` target such an edit documents history rather than schedules work.

### Refusals

- **Every runner-only row requested through `/ptp:backlog-edit` is refused**, and the refusal **names
  the row and its performer**: row 1 (`pending` → `in-progress`), row 2 (`in-progress` → `done`), and
  row 3 (`in-progress` → `blocked`) other than as row 4's recovery disposition.
- **Every transition absent from this table is refused** — in particular `done` → `pending`, `done` →
  `in-progress`, `cancelled` → `done`, `cancelled` → `blocked`, and `pending` → `done`.
- **`blocked` → `done` is refused except via row 8's guarded path.** It is **not** absent from the
  table, but it is reachable **only** by row 8's performer under **guard 3** below; requested through
  any other command — `/ptp:backlog-edit` in particular — it is refused exactly as it was before row 8
  existed, naming the row and its performer.
- **A status write that changes nothing is refused as a no-op**, never reported as success.

**`done` → `cancelled` is permitted and unconditional.** Row 6 is written "any → `cancelled`", and its
two **gated** sources are named exhaustively as `blocked` and a stale `in-progress`; `done` is neither,
so no guard applies. This does not contradict the refusal list above: that list names `cancelled` →
`done`, the opposite direction, which stays refused. Cancelling a `done` epic documents abandonment of
shipped work — and discards no link (`changeEpics` survives).

### Repairing a `status` that is unset or out of enum — a repair, not a transition

Every row of the table above is defined over the **five enum values**, so an entry whose stored `status`
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

- The repair may set **`pending`**, **`blocked`**, or **`cancelled`** only. **`in-progress`** is row 1's
  runner-owned outcome and **`done`** is never written by this command at any time; requesting either is
  **refused naming this rule**, so a corrupted `status` is never a back door into a status the table
  denies.
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
  repair's destination is `pending` or `blocked`, it MUST equal the status the settled disposition
  prescribes — `claim` → `blocked`, `disown` → `pending`, `rerun anyway` → `pending`, and the
  *Combining* table's result where warning dispositions are involved — and a destination that
  disagrees is **refused**, naming both the requested status and the one the disposition prescribes.
  Otherwise a repair to `pending` combined with `claim` would keep and confirm the recovered work while
  slipping past the `blocked` landing that forces an explicit re-run. Only **`cancelled`** overrides,
  exactly as in a cancellation edit: there the disposition governs the ids while the cancellation
  governs the status, under guard 2 in full. When the entry falls on the availability table's **ungated
  first row** no disposition exists to prescribe anything, and any of the three permitted destinations
  may be repaired to.
- **The settlement clears `runBaseline` in the same write, and the report names the value it cleared** —
  after reconciliation has already consumed it, never before. This is the *Every settling edit clears
  `runBaseline`* rule reaching its last case: after the repair the entry is not `in-progress`, so **no**
  later writer could ever consume that baseline — `/ptp:backlog-run` overwrites it on taking the entry
  and never takes a `cancelled` one — and a baseline left behind would strand exactly the phantom the
  invariant forbids. There is deliberately **no** separate baseline-only edit: `runBaseline` is written
  by the runner and cleared by a settling or repairing edit, and by nothing else.
- Every other rule of this contract is unchanged by the repair — in particular the defect is **still named
  in the report** as an outstanding structural problem until the repairing write lands.

### Guard 1 — `blocked` → `pending`

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

- From **`pending`** — no attempt, nothing applied: **unconditional**.
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

### Guard 3 — `blocked` → `done` (the resume row)

Row 8 exists for one situation and no other: `/ptp:backlog-run` halted an epic (row 3) whose work was
in fact finished, most often because the apply agent correctly refused to check off a **manual-only**
verification task. Once a human performs that verification, the work is done — but nothing in the store
proves it, so the row is available **only** when this invocation itself produces the proof:

- the entry's `status` is **`blocked`** and its `changeEpics` is **non-empty** — the same predicate
  that made it `/ptp:backlog-continue`'s target; **and**
- the write happens **in the same `/ptp:backlog-continue` invocation** whose bare flow has just
  settled **every** prefix in `changeEpics` — each one run through `/ptp:review-full` to convergence
  (`BOTH PHASES DONE`, or `ptp-codex-mode`'s mode-skip terminal state) and then `/ptp:archive`
  successfully, or found already absent from `openspec/changes/`.

**It is never available as a standalone disposition.** There is no "mark this done" free action on an
already-`blocked` entry from a prior session, and no recovery path, disposition, or combination of
dispositions may produce it. This is the load-bearing difference from a hypothetical
`/ptp:backlog-edit` disposition: a recovery disposition reasons about a **stranded, possibly-crashed**
run with no durable proof of review convergence — which is exactly why *Recovery and reconciliation*
below never yields `done` — whereas row 8's proof is **this invocation's own successful review-full
report**, not an assertion about the past. `/ptp:backlog-edit` has no review-full/archive machinery of
its own and therefore can never satisfy this guard; its refusal of `blocked` → `done` is unchanged.

**Write shape**, mirroring row 2's (the runner's own convergence write):

1. set `status: done`;
2. **clear `runBaseline`** — already `null` on an entry reached through row 3, so a no-op in the common
   case, stated for completeness in case a hand edit left it non-null, and consistent with *every
   settling edit clears `runBaseline`*;
3. **retain `changeEpics` exactly as-is** — it already records every prefix now archived, so unlike
   `runBaseline` there is nothing to add and nothing to clear;
4. **send no `updatedAt`** — the stamp is **board-maintained** (*Timestamps* above): the store exposes
   no setter, so the write carries no value for it and the board's own stamp stands. A writer that
   "bumps" it in memory has changed nothing durable, and no caller may read that bump back as stored.

One single write **group**, dispatched through `ptp-backlog-write`'s ordered sequence exactly as every
other writer's is — the clear a payload row, `done` the commit — touching no other entry. If **any** prefix fails to settle, **no** transition occurs: the
entry stays `blocked` with its `changeEpics` unchanged, and the partial progress lives in the archived
change folders alone.

## Recovery and reconciliation

**A stale `in-progress` entry** is one whose `status` is `in-progress` **and** whose `runBaseline` is
**non-null**. The invariant this contract keeps is that, **once no backlog run is live**, a lingering
`runBaseline` means an **un-reconciled crashed run and nothing else**: the runner clears it on `done`
and on `blocked` alike, and every settling edit below clears it too.

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
  gate would wave straight through to `pending`, silently re-running work that already landed.
- Keyed on **warnings too**, because a stale entry carrying only warnings would otherwise slip through
  ungated, and an undispositioned warning is an unexamined *"did this epic mint that folder?"*.

### The availability table

Evaluated on the **post-reconciliation** state. An id is **confirmed** when its `attribution` is
`terminal-report` or `user-confirmed-reconciliation`, and **provisional** when it is
`folder-diff-unconfirmed`.

| Entry holds | Gate | Dispositions offered |
|---|---|---|
| no `changeEpics` ids and no `attributionWarnings` | none | ordinary reset — nothing to reconcile |
| `attributionWarnings` only (no `changeEpics` ids) | gated | **promote** each warned prefix → `changeEpics` as `user-confirmed-reconciliation`, status → `blocked`; or **dismiss** it as another session's work, status → `pending`. The id-level dispositions do not apply — there is no id to claim, disown, or re-run against |
| provisional ids only | gated | **claim**, **disown**, **rerun anyway** |
| any **confirmed** id (alone or alongside provisional ones) | gated | **claim**, **rerun anyway** — **`disown` is withheld** |

**`disown` is withheld the moment a confirmed link exists** because it is the one disposition that
returns the entry to `pending` while asserting *nothing was done here* — and a confirmed id is direct
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
| **disown** | **only** `folder-diff-unconfirmed` ids are dropped; every **confirmed** id (`terminal-report` or `user-confirmed-reconciliation`) is **retained with its attribution unchanged** — disowning an inferred link cannot un-say a `/ptp:full` report, or a human, that named the id, and dropping those would destroy the one authoritative backlog↔change link the schema exists to hold. Offered only per the table above | `pending` |
| **rerun anyway** | **every** id retained, **no** id relabelled | `pending`, with the duplication acknowledged in the report |
| **promote** (**per warned prefix**) | the prefix is removed from `attributionWarnings` and appended to `changeEpics` as `user-confirmed-reconciliation`. If the prefix is **already** in `changeEpics` — a state reconciliation cannot create, but a runner write or a hand edit can — the warning is **still removed**, the **existing element keeps its attribution**, and **no second element is appended**, since ids are unique within the array and provenance is never downgraded | see *Combining* below |
| **dismiss** (**per warned prefix**) | the prefix is removed from `attributionWarnings` and is **not** added to `changeEpics` | see *Combining* below |

**`promote` and `dismiss` are per-prefix**: an entry carrying three warnings may promote one and dismiss
two in a single edit.

### Combining an id disposition with warning dispositions

| Combination | Status |
|---|---|
| `claim` + any warning disposition | `blocked` |
| `rerun anyway` + any warning disposition | `pending` (duplication explicitly accepted) |
| `disown` + `dismiss` only | `pending` |
| `disown` + any `promote` | **refused as self-contradictory** — `disown` asserts nothing here was this epic's work; `promote` asserts a warned prefix was |
| warnings only, any `promote` present | `blocked` |
| warnings only, all `dismiss` | `pending` |

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

`done` means *every slice landed in `processed`*, and `processed` means applied **and code-review
converged**. A crashed run has no in-session terminal report, and there is **no durable artifact that
could substitute**: `ptp-review-loop` writes review-convergence markers for
`kind ∈ { brainstorm, artifact, prd }` and **none at all for `kind = code`**. Code-review convergence
therefore leaves **no on-disk trace**, and no inspection of the recovered folders can prove it after the
fact. Rather than invent an evidence rule that cannot be satisfied, v1 forbids the outcome: `claim` —
the only disposition that *keeps* the recovered work — lands on `blocked`, and the user re-runs
explicitly; the other two land on `pending` precisely because they discard the claim that the work is
finished. A wrongly-`done` epic would **record shipped work that was never reviewed**, and both
`/ptp:backlog` and `/ptp:backlog-continue` would stop offering it as work a human still needs to
finish.

**A durable code-review-convergence marker is the named v2 seam** that would make an evidence-based
`accept` disposition possible. It is not a v1 gap.

**Row 8 does not weaken this rule — it sidesteps it.** `/ptp:backlog-continue` reaches `done` from
`blocked` **not** by accepting evidence about a past run but by **performing** `/ptp:review-full` and
`/ptp:archive` itself, in the same invocation, so the convergence it relies on is observed in-session
rather than inferred from disk (see **guard 3**). Nothing here becomes reachable from recovery: a
disposition still lands on `blocked` or `pending`, and a stale `in-progress` entry still has no path to
`done` at all.

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
