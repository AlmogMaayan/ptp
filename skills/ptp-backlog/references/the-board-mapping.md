> Loaded from skills/ptp-backlog/SKILL.md when: mapping an entry field onto the board carrier that holds it.
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
