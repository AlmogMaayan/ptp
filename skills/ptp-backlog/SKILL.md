---
name: ptp-backlog
description: Own the epic backlog file contract — the location of openspec/backlog.json, its v1 schema and version gate, the tolerant-read / canonical-write serialization with unknown-key preservation, the whole-file read-modify-write IO protocol including on-demand creation, BK-NNNN id allocation and the numeric-ordering rule, the validator and its fixed nine-code problem vocabulary with the fatal/structural split and the narrower writer-eligibility rule, and the ready-set definition with its deterministic order. A pure prose contract in the single-source-of-truth pattern of ptp-branch-guard (branch safety), ptp-codex-mode (the reviewer gate), ptp-agent-roles (role resolution), and ptp-parallel-fanout (fan-out safety) — it reads nothing on its own, writes nothing, and edits nothing. Also owns the dependency-detection contract every detection-invoking backlog writer runs unchanged — the bounded names-only input set, mandatory both-direction candidate proposal and its decision criterion, the write-target filter with its refusal grounds, the atomic whole-candidate-set cycle check, the additive-only prohibitions, evidence as a provenance convention, and the non-silent report obligation. Also owns the status transition table — seven rows, each naming its performer — with its three guards (the gated blocked-to-pending reset that retains the prior attempt's changeEpics, the any-to-cancelled guard, and the cancelled-to-pending inversion refusal and its two bypasses), and the recovery-and-reconciliation machinery every writer that settles a stale in-progress entry runs: the stale definition and its deliberately conditional wording, the single change-prefix-set definition both the runBaseline snapshot and the reconciliation diff cite, the additive-only reconciliation, the gate, the availability table and the disposition outcomes (claim / disown / rerun anyway, and per-prefix promote / dismiss) with their combination rules, the every-settling-edit-clears-runBaseline rule, and the never-yields-done rule. The file contract is defined by 0036_01, which ships no writer; detection is added by 0036_02 alongside /ptp:backlog-add, the transitions and recovery machinery by 0036_03 alongside /ptp:backlog-edit, the runner in 0036_04.
---

# ptp-backlog — the epic backlog file and everything that defines it

## Purpose

ptp has no durable place to record the epics a user intends to build *before* they become change
folders. The epic backlog is that place, and it is a single JSON file. Because a detector, an editor,
a recovery gate, and a runner will all read and write that one document, classify the same defects,
and need the same ready-set answer, the document's contract has to live in **exactly one** place.

This skill is that place. It is the single source of truth for the epic backlog's file: its location,
its schema and version gate, its serialization, its IO protocol, its id allocation, its validation
vocabulary, and its ready-set definition. It is the backlog analog of `ptp-branch-guard` (branch
safety), `ptp-codex-mode` (the reviewer gate), `ptp-agent-roles` (role resolution), and
`ptp-parallel-fanout` (fan-out safety): **commands reference this contract rather than restating any
part of it.** A command that needs the field list, the problem codes, the id rule, or the ready-set
rule cites this skill; it does not copy them, because four commands each carrying their own copy of a
thirteen-field schema and a nine-code validator *is* the enumeration drift ptp's config contract
already forbids.

This skill is a **pure prose contract**. It states obligations; it performs none of them. It reads no
file on its own, writes no file, runs no git command, and edits nothing.

## The file

**Location:** `openspec/backlog.json`, project-scoped — one backlog per repository, alongside the
existing ptp-only siblings `openspec/brainstorms/` and `openspec/analysis/`.

**It is a plain data file, not an OpenSpec artifact.** The OpenSpec CLI **does not read it**, does not
validate it, and never mentions it in `openspec list` or `openspec list --specs`. Nothing about the
backlog participates in `openspec archive`. No ptp command treats it as a change artifact.

**Whether it is tracked is the host repository's decision.** The file is *intended* as durable project
data rather than scratch, but ptp cannot guarantee that and never claims it: whether the path is
committed is decided by the host repository's `.gitignore`. ptp's own repository, for instance,
ignores `/openspec/` wholesale, so a backlog file created here would be untracked. **ptp SHALL NOT
add, modify, or remove any ignore or attribute rule covering the backlog file, in either direction** —
silently un-ignoring a path the user chose to ignore is a worse failure than an untracked backlog.
The consequence is stated once here and inherited everywhere below: **version control is not a
guaranteed recovery mechanism for a lost backlog write**, so no rule in this contract may rely on it.
(Line endings need no new rule either: the repository's `.gitattributes` default `* text=auto eol=lf`
already covers the path.)

**This change does not create the file.** The repository ships without it. It appears the **first time
a writer runs** — and this change ships no writer, so after `0036_01` lands `openspec/backlog.json`
still does not exist. `/ptp:backlog` never creates it.

## Schema (v1)

### Top level

Exactly two recognized keys:

```jsonc
{
  "version": 1,
  "epics": [ /* entry objects, sorted by ascending numeric id */ ]
}
```

| Key | Type | Required | Notes |
|---|---|---|---|
| `version` | integer | **yes** | Exactly `1` in v1. Governs the *Version gate* below. |
| `epics` | array of entry objects | **yes** | May be empty. Canonically sorted by ascending **numeric** id. |

### Entry object

Thirteen recognized fields. This is the **canonical key order** — writers emit exactly this order:

| # | Field | Type | Required on read | Empty value | Written by |
|---|---|---|---|---|---|
| 1 | `id` | string, `BK-NNNN` | **yes** | — | add (`0036_02`) |
| 2 | `title` | string, non-empty | **yes** | — | add / edit |
| 3 | `description` | string | no | `""` | add / edit |
| 4 | `status` | enum | **yes** | — | add sets `pending`; transitions in `0036_03` / `0036_04` |
| 5 | `dependsOn` | array of `BK-NNNN` ids | no | `[]` | detection + user edit (`0036_02` / `0036_03`) |
| 6 | `dependencyEvidence` | object, `BK-NNNN` → one-line string | no | `{}` | detection (`0036_02`) |
| 7 | `dependencyRejected` | array of `BK-NNNN` ids | no | `[]` | user edit (`0036_03`) |
| 8 | `changeEpics` | array of `{ id, attribution }` | no | `[]` | runner (`0036_04`), reconciliation (`0036_03`) |
| 9 | `attributionWarnings` | array of 4-digit change-epic prefixes | no | `[]` | runner (`0036_04`) |
| 10 | `runBaseline` | `null` or array of 4-digit change-epic prefixes | no | `null` | runner (`0036_04`), cleared by `0036_03` / `0036_04` |
| 11 | `createdAt` | `null` or ISO-8601 UTC instant string | no | `null` | add |
| 12 | `updatedAt` | `null` or ISO-8601 UTC instant string | no | `null` | every writer that changes the entry |
| 13 | `notes` | string | no | `""` | user edit |

**`status`** is exactly one of `pending`, `in-progress`, `done`, `blocked`, `cancelled`. This change
treats status as **data**: it reads it, renders it, and uses it in the ready-set rule. It performs no
transition and defines no transition table — that is `0036_03` / `0036_04`.

**`dependencyEvidence`** maps a `BK-NNNN` id to a **one-line** rationale string, *one-line* meaning
the value contains **no carriage return and no line feed**. A value with a line break is a
`malformed-entry` problem, never silently joined.

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
`dependencyEvidence`, `dependencyRejected`, `changeEpics`, `attributionWarnings`, and `runBaseline`.
The alternative, each later change widening the schema as it needs a field, would mean **this
change's validator rejects its own siblings' output**: a validator that rejects the files its sibling
changes produce is worse than useless. Defining them now also costs nothing — their shape is already
settled — and avoids a `version: 2` migration for a field whose shape was known all along.

### Tolerant read

Reading is tolerant, so the file stays **hand-editable**.

- Exactly **three** fields are required: **`id`, `title`, `status`**.
- Every other recognized field **may be absent**; the reader supplies its empty value (`""`, `[]`,
  `{}`, `null` per the table above) **in memory only** — nothing is written back to disk to
  materialize a default.
- An **absent required field is a `malformed-entry` problem and is never defaulted.** Inventing a
  `status` would silently place an entry in the ready set, which is exactly the failure a tolerant
  reader must not commit.
- A present field of the **wrong type**, an **out-of-enum** `status`, or a malformed `id`,
  `attribution`, or change-epic prefix is a **reported** `malformed-entry` problem and is **never
  coerced** to a valid value.

### Canonical write

Writing is canonical, so **the same logical state always serializes to identical bytes** and a diff
shows only real change.

1. **Every** recognized field emitted, in the canonical key order above, **including empty ones**.
2. `epics` sorted by **ascending numeric** id.
3. `dependsOn`, `dependencyRejected`, `attributionWarnings`, a **non-null** `runBaseline`, and
   `changeEpics` (by its elements' `id`) sorted **ascending numerically**.
4. `dependencyEvidence` keys emitted in **`dependsOn` order**, with any remaining key — one naming a
   known entry that is not a `dependsOn` target, which the schema permits — following them in
   **ascending numeric id order**, so the ordering is **total**.
5. **Malformed identifiers still sort deterministically.** Because a writer may legally proceed past a
   `malformed-entry` on a non-`id` field (see *Writer eligibility*), an identifier with no numeric part
   (`"bk-1"`, `""`) can reach serialization in **every** identifier-bearing collection: the id arrays
   (`dependsOn`, `dependencyRejected`, `attributionWarnings`, `runBaseline`), the
   `dependencyEvidence` **keys**, and the `changeEpics` elements' **`id`**. In every one of them,
   numeric ordering applies to the **well-formed** values only; each malformed value is **preserved
   as-is** and emitted **after** them, ordered **ascending by Unicode code point of its canonical JSON
   serialization** — phrased over the serialization, not over the value, so the order is defined for a
   malformed value that is not a string at all (a number, a boolean, `null`, an array, an object), not
   only for a string with no numeric part. A `changeEpics` **element that carries no usable identifier
   at all** — an element that is not an object, or an object with no `id` key — is ordered the same
   way, by the code point of **the element's own** canonical JSON serialization, and is likewise
   emitted after every well-formed element: the sort key falls back from the element's `id` to the
   element itself, so an element with nothing to sort on is still placed deterministically rather than
   dropped or given an invented `id`. And when the **container itself** is malformed — a
   `dependsOn`, `dependencyRejected`, `attributionWarnings`, `runBaseline`, `changeEpics`, or
   `dependencyEvidence` whose value is not the array or object the schema expects — the value is
   emitted **verbatim, unsorted**: there is no collection to order, and re-shaping it would be the
   coercion this contract forbids. The rule is therefore total over **every** value that can reach
   serialization, so the write stays byte-stable and the offending value survives for the user to fix
   rather than being dropped or coerced.
6. **Two-space indent**, a **single trailing newline**, **LF** line endings, **UTF-8 without a BOM**.
7. `updatedAt` is bumped **only on entries the operation actually changed**. A whole-file write must
   **not** restamp untouched entries — otherwise every write looks like it touched everything, and the
   diff stops being evidence of what happened. The bump is **not** an exception to the never-coerce
   rule, which scopes to the **read**: on an entry the operation genuinely changed, replacing a
   malformed `updatedAt` with the new timestamp is that authorized write recording itself, not the
   reader silently repairing a value. On an entry the operation did **not** change, a malformed
   `updatedAt` is left exactly as it was and stays reported as a `malformed-entry` problem.

### Unrecognized keys are preserved

A key this schema does not recognize — **at the top level or inside an entry** — survives a
read-modify-write with **its name and its complete value (nested structure included) intact**. It is
emitted **after** the recognized keys, and when there is more than one they are ordered **ascending
lexicographically by key name**, so the output stays byte-stable. Unrecognized keys are **never
dropped** and are **not a validation problem** — they are data this version does not interpret.

The rule applies at **every recognized object scope**, not only those two — in particular inside a
`changeEpics` element, where `{ "id": "0041", "attribution": "terminal-report", "future": true }`
keeps `future` under the same placement and ordering rule (recognized keys in their canonical order,
then the unrecognized ones ascending lexicographically by key name). A nested element is exactly
where a whole-file rewriter is most likely to drop a key while believing it copied the entry, so the
scope is stated rather than left to be inferred from "inside an entry".

**Inside** an unknown value the structure is emitted exactly as read: nested object keys keep their
**original order** and are **never re-sorted**, since reordering data whose semantics this version
does not know is itself a mutation. The byte-identity guarantee therefore ranges over the recognized
schema plus the unknown keys' **placement**; an unknown value's internal ordering is inherited from
the file rather than imposed.

**Preservation is of the *data*, not of the file's lexical form.** The document is reserialized
canonically, so the original whitespace, indentation, and key placement are **not** retained — only
that every unrecognized key and the complete value it carried are still there.

Rationale: whole-file rewriting is exactly where fields go missing, and silently dropping a key
written by a newer ptp (or by a user) is **unrecoverable** — the more so because version control is
not assumed to be tracking this file at all.

### Version gate

| `version` value | Read | Write |
|---|---|---|
| `1` | **read** normally | **write** normally |
| integer **> 1** | **refuse** — `unsupported-version`, naming the found version and the supported one | **refuse** |
| absent, non-integer, or **< 1** | **refuse** — `malformed-file` | **refuse** |

**Why the *write* direction refuses too**, rather than reading tolerantly and writing back: a greater
version means the file was written by a newer ptp whose fields this version cannot interpret. A
tolerant read followed by a canonical write would **discard every field the newer version added** —
precisely the data loss the unknown-key rule exists to prevent — and unknown-key preservation
**cannot be relied on** to survive a *shape* change: a renamed or restructured field is not merely an
added one. Refusing both directions is therefore required, not merely prudent.

## IO protocol

Whole-file read-modify-write. No locking, no partial writes.

```
READ:
  1. Does openspec/backlog.json exist?
       no  → use the in-memory empty backlog { "version": 1, "epics": [] }
             — NOTHING is created on disk. Readers report "no backlog yet".
       yes → continue
  2. Read the WHOLE file.
  3. Parse as JSON.
       fails → STOP with `unparseable-file`. NEVER overwrite, NEVER truncate,
               NEVER "repair". The user's bytes are the authority; a rewriter
               that fixes a syntax error by discarding the content is the worst
               possible outcome.
  4. Apply the version gate.
  5. Normalize in memory (tolerant read), preserving unrecognized keys.
  6. Validate. Readers report the problems. Writers refuse past any FATAL
     problem, and additionally past the two structural problems that leave the
     ID SPACE untrustworthy — a `malformed-entry` on an entry's `id`, and
     `duplicate-id` — per the writer-eligibility rule below.

WRITE (no command reached this path in `0036_01`; `/ptp:backlog-add` is the
       first writer, added by `0036_02`):
  7.  Modify the in-memory document.
  8.  Serialize the COMPLETE document canonically.
  9.  Write it in ONE operation. A write is never partial: the full byte
      sequence is assembled in memory before anything is written.
  10. On-demand creation: if the file was absent at step 1, this same write
      creates it, containing { "version": 1, "epics": [ <the new content> ] }.
      An empty backlog file is NEVER created as a separate step, and no read
      ever creates it.
```

Two absolutes, stated as absolutes:

- **An unparseable file is never overwritten** — not repaired, not truncated, not rewritten in any
  way, under any operation.
- **No read ever creates the file, and an empty backlog file is never created as a separate
  initialization step.** Creation happens only as part of a write that has content to record — never
  as a preparatory "touch the file first" step, which is the failure this rule exists to prevent.

### No locking, no blind writes

**No locking.** Backlog edits are user-driven and sequential; concurrent writers are out of scope, and
the future backlog runner is **forbidden from fanning out** — a constraint the parent brainstorm
imposes on the runner itself (assumption 3), not a fan-out rule restated here. (`ptp-parallel-fanout`
owns fan-out rules; this contract only notes that the runner is not permitted to use them.)

**The mitigation for a lost update is the never-a-blind-write rule below — not a lockfile, and not
git.** As stated under *The file*, whether the path is tracked at all is the host repository's
decision, so version-control recovery is never assumed.

**Never a blind write.** Every writer **re-reads the file immediately before modifying it**. A writer
must not carry an in-memory document across an operation that could have been interleaved with
another edit.

## Id allocation

**Format.** `BK-` followed by a zero-padded decimal integer of **minimum** width four, with no upper
bound: `BK-0001`, `BK-0042`, `BK-9999`, `BK-10000`. The prefix is **fixed and uppercase**, and ids are
**case-sensitive** — `bk-0001` is a `malformed-entry`.

**Allocation.** `next = max(numeric part of every id in the file) + 1`, formatted to at least four
digits. **Every entry counts regardless of status** — `done` and `cancelled` entries **included**. An
absent or empty backlog allocates `BK-0001`.

Allocation is a **pure function of the file's current contents**: **no persisted counter, no manifest,
no other persisted state**. This mirrors `ptp-change-selector` § 4's filesystem-derived epic
allocation, which likewise derives the next number from current state alone.

**All id ordering is numeric, never lexicographic.** `BK-10000` sorts **after** `BK-0002`. This
applies everywhere ordering appears: the canonical `epics` sort, the ready-set tie-break, and every id
array and identifier-bearing collection.

**No interaction with the change selector.** `BK-NNNN` ids are **not** added to the `epic:` / `story:`
selector grammar, `ptp-change-selector` is **not modified** by this contract and **does not read** the
backlog file, and backlog ids **reserve no ptp change-epic numbers**. `epic:BK-0001` would mean
something different from `epic:0041`, which is exactly the ambiguity being avoided.

**Stated limitation — ids can be reused after a hand-deletion.** Because allocation derives from the
file, deleting the highest-numbered entry by hand makes the next allocation reuse its number. v1
accepts this **deliberately**, rather than persisting a counter that would reintroduce exactly the
persisted state this rule avoids. v1 ships **no delete operation**, so the only path to it is a manual
edit.

**Nothing in `0036_01` allocates an id** — that change shipped no writer. The rule is defined here and
**first consumed by `0036_02`**, whose `/ptp:backlog-add` allocates the id for each entry it creates.

## Validation

A **pure function**: document in, ordered problem list out. It **repairs nothing**, **coerces
nothing**, **writes nothing**, and **never mutates** what it inspects.

**The order is specified, not incidental** — "pure function" would be an empty claim if the same
document could yield the same problems in two different sequences. Problems are emitted in the
**table order below** (the row order of *Problem codes*: `unparseable-file`, `unsupported-version`,
`malformed-file`, `duplicate-id`, `malformed-entry`, `unknown-id`, `self-edge`, `cycle`,
`depends-and-rejected`), and **within one code** by this total key, compared left to right:

1. ascending **numeric** id of the entry the problem names — falling back to ascending entry **index**
   when the id itself is unusable (an unusable id always sorts after every usable one);
2. the **offending field name**, ascending lexicographically, when one entry raises the same code on
   more than one field;
3. the **offending value** — the dangling or duplicated identifier, the `dependencyEvidence` key, the
   `changeEpics` element's `id`, or for `cycle` the full canonical cycle path — ascending by Unicode
   code point of its canonical JSON serialization, which settles the case of one entry raising the
   same code on the same field more than once (two dangling `dependsOn` ids, two cycles sharing a
   lowest id) and is defined for a non-string offending value as well.

The key is total — no two problems can tie on all three — so a given file always produces a
byte-identical problem list.

### Problem codes

| Code | Class | Condition | Reported detail |
|---|---|---|---|
| `unparseable-file` | fatal | the file is not valid JSON | the parser's message and, when available, the line |
| `unsupported-version` | fatal | `version` is an integer greater than the supported version | the found version and the supported one |
| `malformed-file` | fatal | the document parses but is not an object, or `version` is absent / non-integer / less than 1, or `epics` is absent or not an array | which top-level expectation failed |
| `duplicate-id` | structural | the same `id` appears on more than one entry | the id and how many entries carry it |
| `malformed-entry` | structural | a required field is absent, a field has the wrong type, `title` is present but empty, `status` is out of enum, an `id` / `attribution` / change-epic prefix is malformed, a `dependencyEvidence` value contains a line break, a non-null `createdAt` / `updatedAt` is not an ISO-8601 UTC instant, or a `changeEpics` `id` is duplicated within the entry | the entry id (or its index when the id itself is unusable) and the offending field |
| `unknown-id` | structural | an id in `dependsOn`, `dependencyRejected`, or a `dependencyEvidence` key names no entry in the file | the referring entry and the dangling id |
| `self-edge` | structural | an entry's `dependsOn` contains its own id | the entry id |
| `cycle` | structural | the `dependsOn` graph contains a cycle | the cycle as an ordered id path, e.g. `BK-0002 → BK-0004 → BK-0002` |
| `depends-and-rejected` | structural | an id appears in **both** `dependsOn` and `dependencyRejected` on the same entry | the entry id and the id in both fields |

These nine codes are the **shared vocabulary for the whole epic**. `0036_02`, `0036_03`, and `0036_04`
reuse the spellings **verbatim** rather than inventing per-command names.

### Fatal vs. structural

- **Fatal** — **nothing further is computed**: no entries are rendered, no ready set is produced, and
  no id is allocated. The document is not usable at all. A reader reports the problem alone; a writer
  refuses.
- **Structural** — the document parses and its entries **still render individually**, but the
  dependency graph or the id space is not trustworthy, so the **ready set is withheld**.

The split matters because a read-only view that shows **nothing** because one edge dangles is useless
exactly when the user most needs to see the file. Structural is therefore defined by what it still
*permits* (rendering the entries), not merely by its name.

### Writer eligibility

"Structural" governs what a **reader** renders; it does **not** by itself decide whether a **writer**
may proceed. That is a third, narrower rule:

> A writer refuses past **any fatal problem**, and past **exactly two** structural ones — a
> `malformed-entry` on an entry's **`id`**, and **`duplicate-id`**.

Those two, and only those two, leave the **id space** untrustworthy, and both canonical write (`epics`
sorted by ascending *numeric* id) and allocation (`max(numeric part) + 1`) are **undefined** over an id
that will not parse or that names two entries.

A writer does **not** refuse over `unknown-id`, `self-edge`, `cycle`, `depends-and-rejected`, or a
`malformed-entry` on any **non-`id`** field. Those describe the dependency **graph**, which a write
neither reorders nor resolves, and refusing there would leave a defective backlog **unrepairable
through ptp** — the user could not use the editor to remove the very edge causing the cycle. Refusing
there would be a lockout, not a safeguard.

This rule is defined here and **first consumed by `0036_02`**.

### Cycle detection

Cycles are evaluated over the **whole file's `dependsOn` edge set at once**. **Every distinct cycle**
found is reported, each as an **ordered id path that begins and ends at the same id** (e.g.
`BK-0002 → BK-0004 → BK-0002`).

**Distinct** is defined so a rotation is not a second cycle: each simple directed cycle is reported
**once**, written starting at its **lowest numeric id** and following the `dependsOn` edges from
there. Without that, `BK-0002 → BK-0004 → BK-0002` and `BK-0004 → BK-0002 → BK-0004` would be two
reports of one defect and the problem list would stop being a function of the file.

**Edges pointing at unknown ids are excluded from the search** — they are already reported as
`unknown-id` — so **one dangling edge cannot mask a real cycle** elsewhere in the graph.

### The `depends-and-rejected` invariant

An id may **never** appear in both `dependsOn` and `dependencyRejected` on the same entry.

**This validator is the single place that invariant is enforced.** The dependency detector in
`0036_02` and the runner in `0036_04` **reference** it rather than restating it — and neither field is
treated as "winning" when the invariant is broken; the problem is reported and the user resolves it.

## Ready set

An entry is **ready** when **both** hold:

1. its `status` is **`pending`**, **and**
2. **every** id in its `dependsOn` names an entry whose status is **`done`** or **`cancelled`**.

Status by status:

| Status | Satisfies a `dependsOn` edge? | Why |
|---|---|---|
| `done` | **yes** | the work happened |
| `cancelled` | **yes** | a **decision** that the work will not happen, not an obstacle — treating it as unsatisfied would strand every dependent permanently |
| `blocked` | **no** | a real failure a human must resolve |
| `in-progress` | **no** | simply unfinished |
| `pending` | **no** | not started |

### Order

**Topological over `dependsOn`, tie-broken by ascending numeric backlog id** — mirroring ptp's
existing `(epic, story)` ascending rule. There is **no `priority` field**; the ids supply the stable
order.

**Determinism.** Ordering reads **only materialized fields**, so **for any given saved file the ready
set and its order are fully deterministic** — computing them twice over an unchanged file yields the
same entries in the same order.

**Ownership note.** This rule lives **here**, in `ptp-backlog`, and **not** in the future
`ptp-backlog-run` skill, for one reason: the read-only view needs the identical rule and ships in
**this** change, three changes earlier — and two owners of one rule is exactly the enumeration drift
this repository forbids. `ptp-backlog-run` (`0036_04`) owns only what is genuinely its own — the
`rounds:` token, the recompute-after-each-epic loop, the per-epic `/ptp:full` invocation, the halt
gate, the status write-back, and the terminal report — and **references this definition** for what
"ready" means and in what order. The runner is the referencing consumer; the definition does not move.

`/ptp:backlog` computes the ready set **once**, over the file as it stands. Recomputing after every
epic is a property of the runner's loop, not of a view, which has no loop to recompute in.

## Dependency detection

**This skill owns the dependency-detection contract.** Detection is the inference that turns two
entries' prose into a `dependsOn` edge, and because the edge set it produces is the sole input to the
*Ready set* rule above — and therefore to what a backlog runner executes against the repository — the
contract has to live in exactly one place, like every other rule in this file. Every
**detection-invoking** backlog writer runs the five phases below **unchanged**: `/ptp:backlog-add`
(`0036_02`) today, `/ptp:backlog-edit` (`0036_03`) next. A command references this section; it does
**not** restate any part of it.

The contract does **not** extend to writers that infer no dependencies. `/ptp:backlog-run`
(`0036_04`) writes execution state — statuses, `changeEpics`, `attributionWarnings`, `runBaseline` —
and runs **no** detection at all.

Detection presupposes that the loaded document passed the *Writer eligibility* rule above. When the
file carries one of the **five writer-eligible structural defects** (`unknown-id`, `self-edge`,
`cycle`, `depends-and-rejected`, or a `malformed-entry` on a non-`id` field) the invoking writer
**suppresses detection entirely** — the writer's own primary write still proceeds, no candidate is
proposed in either direction, no edge is written that operation, and the defect is reported with
`/ptp:backlog-edit` named as the repair path. (An id-space defect never reaches this point at all: a
writer refuses past it outright.)

### Phase 1 — the bounded input set

Detection SHALL assemble **exactly three** sources and no others:

1. **every backlog entry's `title` and `description`** — including the subject entry's;
2. **the capability-name list from `npx -y openspec list --specs`**;
3. **the active change-folder ids under `openspec/changes/`**.

Source 1 — the backlog's own prose — is read **in full**, because it carries almost all of the
detection signal. Sources 2 and 3 are **names only**. "Names only" scopes sources 2 and 3; it does
**not** restrict source 1, whose descriptions are exactly what detection is reading.

The never-list is explicit. Detection SHALL NOT read:

- **never a full capability spec body** (`openspec/specs/**/spec.md`);
- **never a change artifact body** — `proposal.md`, `design.md`, `tasks.md`, or a spec delta under
  `openspec/changes/**`;
- **never a source file** — no command, skill, workflow, script, or README.

**The bound is fixed, not a judgment call.** It SHALL NOT be widened to obtain more signal ("just this
once, read the proposal") and SHALL NOT be narrowed by dropping a source. In particular the
`--specs` name list is **kept deliberately**: it is one CLI call returning a small number of short
strings, negligible next to the backlog prose already being read, and capability overlap between two
epics is the **highest-signal edge available**.

### Phase 2 — candidate proposal in both directions

For the invocation's **subject entry** `E` and **every other entry** `T`, detection SHALL consider
**two** candidates:

- **forward** — `E depends on T` (write-target `E`);
- **reverse** — `T depends on E` (write-target `T`).

Evaluating both directions is **mandatory** on every add and every edit on which detection runs —
never conditional, never narrowed to the forward direction, never skipped for cost. The **single**
exception is the suppression case stated above: a writer-eligible structural defect in the loaded file
means detection does not run at all, so no candidate is proposed in either direction. There is **no
other** ground for skipping or narrowing the analysis. Permission to write onto another entry governs
only whether such a write is allowed at all; it MUST NOT be read as making the analysis optional.

**The decision criterion.** A candidate `A depends on B` holds when **the work `B` describes must land
before the work `A` describes can proceed** — because `A` builds on, extends, or modifies an artifact,
capability, schema, skill, or command that `B` introduces. Detection SHALL propose the edge whenever
the bounded inputs **plainly** establish that ordering, and SHALL NOT propose one merely because two
entries are topically related or touch the same area with no ordering constraint between them.
Judgment is reserved for relationships the bounded inputs leave **genuinely ambiguous** — it is not a
licence to decline the plain cases. "Evaluate every pair, propose nothing" is **not** a conformant
reading of this phase.

**What mandating both directions buys, stated without overclaiming.** It fixes the candidate
**scope**, not the **outcome**. Detection is LLM judgment and is **not reproducible**: the same add run
twice may legitimately propose different edges. What the rule guarantees is that a missing edge always
reflects a judgment call rather than a direction that was never examined. The determinism this design
does guarantee is **downstream**: given a saved backlog file, the ready set and its order are pure
functions of that file, because they read only materialized fields.

### Phase 3 — the write-target filter

For a candidate `A depends on B`, the **write-target is `A`** — the entry whose `dependsOn` array
would gain `B`. **Every check below is evaluated against `A`**, whichever entry the invocation
nominally targets.

**"An existing entry" means an entry of the in-memory document detection is running over** — the
entries loaded from the file **plus the invocation's own subject entry**, which under
`/ptp:backlog-add` has been composed in memory with its allocated id but is not yet persisted (the
single write in *Phase 5* persists it). A reverse candidate `T depends on E` whose `B` is that
composed subject is therefore **not** an `unknown-id` refusal: reading "existing" as "already on disk"
would refuse **every** reverse edge an add can produce, which is exactly the analysis Phase 2 makes
mandatory.

The rows are **ordered**, and the already-present row is **first**:

| # | Condition on candidate `A → B` | Outcome |
|---|---|---|
| 1 | `B ∈ A.dependsOn` already | **no-op** — an ordinary skip, **not** a refusal; settles the candidate outright |
| 2 | `B` names no entry of the in-memory document (subject entry included) | **refuse**, ground `unknown-id` |
| 3 | `A` and `B` are the same entry | **refuse**, ground `self-edge` |
| 4 | `B ∈ A.dependencyRejected` | **refuse**, ground `rejected-by-target` |
| 5 | `A.status` ∈ { `done`, `in-progress` } | **refuse**, ground `target-status`, naming `A`'s status |

**Row 1 runs first and settles the candidate ahead of every refusal check.** Without that precedence an
already-present edge on a `done` or `in-progress` write-target would match two rows at once — no-op and
`target-status` refusal — and the outcome would be undefined. Precedence resolves it in the only
coherent direction: detection is attempting **no write** there, and the refusal checks govern
**attempted writes only**. The case is reachable under `/ptp:backlog-edit`, which re-runs this contract
over entries that already carry edges.

**These are detection-refusal grounds, not validation problem codes.** Three names — `unknown-id`,
`self-edge`, and `cycle` — are shared with the *Problem codes* vocabulary above, and the two
vocabularies MUST NOT be conflated. A **validation problem** is a defect **already in the file**, which
under *Writer eligibility* either stops the write outright (any fatal problem, plus the two id-space
ones) or suppresses detection while the write proceeds (the five writer-eligible structural defects). A
**refusal ground** is a **candidate edge detection declined to write** to a file whose graph was sound
enough for detection to run at all. Detection SHALL NOT report a refusal as a validation problem and
SHALL NOT raise validation problems of its own.

**Rows 2 and 3 are backstops, not routine outcomes.** They are unreachable from detection-proposed
candidates: Phase 2 draws every endpoint from that same entry set and never pairs the subject with
itself, and a file already holding a dangling or self edge is a writer-eligible structural defect that
suppresses detection entirely while the writer's own primary write still proceeds. They are retained
because `/ptp:backlog-edit` (`0036_03`) reuses this contract with **user-supplied** candidate edges. If
either fires against a detection-proposed candidate it signals an **upstream contract violation**, and
is reported as such rather than as an ordinary refusal.

**`dependencyRejected` is consulted on the entry being written to.** Row 4 is keyed on `A` — the
write-target — and not on whichever entry the invocation nominally targets. This is the precise failure
the field exists to prevent: a user editing `Y` removes the `Y → X` edge, which lands `X` in
`Y.dependencyRejected`; later an unrelated `/ptp:backlog-add` or `/ptp:backlog-edit` of `X` proposes
the **reverse** candidate `Y depends on X`. Keyed on the write-target it is refused, as it must be.
Keyed on the invocation's own entry it would be written, resurrecting a rejection from the other end of
the edge — and the user could never win, because every subsequent add of the other endpoint would
restore the edge they deliberately removed.

**Automatic writes go only to `pending`, `blocked`, or `cancelled` write-targets.** Row 5 is what stops
two concrete failures. An edge onto a **`done`** entry asserts an ordering that has **already been
violated** — the work shipped without the prerequisite — and is unenforceable by construction, since
only `pending` entries enter the ready set; writing it would record a constraint nothing can ever act
on. An edge onto an **`in-progress`** entry is worse: that epic is executing right now and the runner
is mid-write on it, so an automatic edge would land on a record another operation is actively
changing. Neither is silently dropped — **both refusals are reported with the target's status**, so a
real dependency noticed too late reaches the user, who may still record it deliberately through
`/ptp:backlog-edit` (a status-aware human act; on a `done` target it documents history rather than
schedules work). The restriction applies to **automatic detection writes only**.

`cancelled` stays on the **permissive** side of that line even though it, like `done`, is a status no
work runs from. The difference is **reversibility**: a cancelled entry can be revived to `pending`
(`/ptp:backlog-edit`, `0036_03`), at which point an edge written onto it becomes live and enforceable,
so recording it now is useful rather than inert. A `done` entry has **no corresponding revival** — the
work already shipped — so an edge onto it could only ever document a violated ordering. `blocked` is
permissive for the same reason as `cancelled`, one step nearer to running.

### Phase 4 — one atomic cycle check over the complete candidate set

Let `G` be the directed graph of every existing `dependsOn` edge, and `C` the set of candidates that
survived Phase 3. Detection SHALL test `G ∪ C` for cycles **once**, as a single evaluation:

- **acyclic** → **every** candidate in `C` is accepted;
- **cyclic** → **every** candidate in `C` is discarded **together**, and the report names the candidate
  cycle.

**Per-edge validation is forbidden.** Detection SHALL NOT test candidates one at a time and SHALL NOT
write the subset that happened to validate first. The worked reason: bidirectional detection can
propose `X → Y` and `Y → X` in one operation. Each is individually acyclic against the pre-existing
graph; **together they are a cycle**. Validating them one at a time would accept whichever was examined
first and reject the other, making the written file a function of **evaluation order** rather than of
the analysis.

This phase **presumes `G` is sound**. When the loaded file already carries a writer-eligible structural
defect, detection was suppressed before this point, so `C` is empty and the check never has to separate
a pre-existing cycle from one the candidates introduced.

**The all-or-nothing unit is `C`, not the invocation.** The invoking writer's own primary write — entry
creation under `/ptp:backlog-add`, the user's explicit field edit under `/ptp:backlog-edit` — is a
separate write that **still proceeds**. A cycle among candidates therefore never discards the user's
request: a cycle-refusing add still yields the new entry, with `dependsOn: []`, plus a report naming
the cycle.

### Phase 5 — apply and persist

For each accepted candidate `A → B`, detection SHALL:

1. append `B` to `A.dependsOn`;
2. set `A.dependencyEvidence[B]` to a **one-line** rationale citing **which bounded input grounded it**;
3. bump `A.updatedAt`.

Then persist through this skill's *IO protocol* — the whole-file read-modify-write above. **Every
accepted edge, every evidence line, and the invoking writer's own primary write land in ONE write.**
There is no intermediate state in which a new entry exists without its detected edges, and no
operation writes the file twice.

Worked example — the first rationale is grounded in a capability name, the second in another entry's
description:

```jsonc
"dependencyEvidence": {
  "BK-0002": "both target the telemetry capability (openspec list --specs)",
  "BK-0005": "BK-0005's description introduces the backlog schema this epic extends"
}
```

### Additive only

Detection **MAY**:

- add an id `B` to `A.dependsOn` when `B` is absent from **both** `A.dependsOn` and
  `A.dependencyRejected`;
- write `A.dependencyEvidence[B]` for an edge it **just added in this operation**;
- bump `updatedAt` on the entries it modified.

Detection **MUST NOT**:

- **remove** any id from any `dependsOn`;
- **rewrite** an edge it added in an earlier operation;
- **overwrite** the `dependencyEvidence` entry of an edge **already present** in `dependsOn` — with one
  narrow exception: a **residual** entry, whose key names an edge **absent** from `dependsOn` (as a hand
  edit can leave behind), is replaced by the current rationale when detection adds **that very edge** in
  this operation. Without the exception, adding an edge whose stale evidence a hand edit left behind
  would have to both write a current input-citing rationale and preserve the old value, which no
  behavior can satisfy. A residual entry whose edge detection is **not** adding is left **exactly as
  found** — repairing it is a user act;
- write an **evidence entry for an edge it did not add** in this operation;
- write to **`dependencyRejected`**;
- modify **`status`**, **`changeEpics`**, **`attributionWarnings`**, **`runBaseline`**, **`id`**, or
  **`createdAt`** on any entry;
- modify **`title`**, **`description`**, or **`notes`** on **any** entry, **the subject included** —
  detection's only writes are edges, evidence, and `updatedAt`. Composing or editing those content
  fields on the subject is the **invoking command's own primary write**, governed by that command's
  contract, never an act of detection.

**Removal of an edge is only ever a user act**, performed through `/ptp:backlog-edit`, which moves the
edge into `dependencyRejected`. The consequence is accepted **explicitly** rather than worked around:
**an edge detected on flawed reasoning persists until a human removes it.** The asymmetry is
deliberate — a stale extra edge only **over-serializes** the run, so the work still happens in a more
conservative order, whereas a detector empowered to delete edges could silently **un-order genuinely
dependent work**, on the same non-reproducible judgment that created the edge.

### Evidence as provenance

Because detection writes an evidence entry for **exactly** the edges it adds and for **no others**, an
edge detection added carries an entry in `dependencyEvidence` and an edge it did not add is left
without one.

**This is a convention detection maintains over its own writes — not a file invariant.** The backlog is
hand-editable, and this skill's validator constrains a `dependencyEvidence` key only to naming an
**existing entry**; it does **not** require the key to correspond to an edge in `dependsOn`. A
hand-written file may therefore carry evidence for a **user-entered** edge, or a **residual** entry for
an edge that has been removed. Detection **neither repairs** such an entry (the additive-only
prohibitions forbid it) **nor relies** on the marker for anything beyond audit — a hand edit can leave
an edge marked or unmarked either way, so the marker is **not** proof of authorship a later pass may
depend on.

**Run ordering ignores the distinction entirely**: `dependsOn` is the single authoritative edge set.
The marker exists so a reader can audit **why** an edge exists, and for nothing else.

The evidence **lifecycle on removal and re-add** — deleting an edge's evidence in the same write that
removes the edge, and leaving evidence absent when a user re-adds a previously-detected edge — is
`/ptp:backlog-edit`'s obligation in **`0036_03`**, and is deliberately **not** defined here. This
section owns the **write** side only.

### The report obligation

Non-silence is the point: the failure mode this rule exists to prevent is **editing a record the user
did not ask about**, or **dropping a refused edge**, without saying so. An operation that runs
detection SHALL report:

- the entry it **created or edited**, by id — and, when the operation **created** it, its `title` and
  `status` as well, so the new record is identifiable from the report alone;
- **every entry it modified, named individually** — including reverse-edge targets the user never
  mentioned — with the edges written to each and the evidence line recorded for each;
- **every refused candidate**, with its ground: `unknown-id`, `self-edge`, `rejected-by-target`,
  `target-status` (**naming the target's status**), or `cycle` (**naming the cycle**, with the whole
  candidate set discarded);
- when **no other entries existed** to compare against, that fact **explicitly**, rather than silence;
- when detection was **suppressed** by a writer-eligible structural defect, that fact and the defect,
  with `/ptp:backlog-edit` named as the repair path.

**A silently-written reverse edge and a dropped refusal are both contract violations**, not cosmetic
omissions — the first makes an unrequested write invisible, and the second hides a dependency the
detector noticed and declined to record.

## Status transitions and their guards

**This skill owns the status transition table.** `status` is a field of the schema above, so its legal
transitions are a property of the same schema and belong in the same place. Two commands perform rows
of this table — `/ptp:backlog-edit` (`0036_03`) performs the four **user** rows, `/ptp:backlog-run`
(`0036_04`) performs the three **runner** rows — and both **reference** the table rather than restating
any part of it. (`0036_01` deliberately defined no transition table; this section is where it lands.)

The complete table. Every row names its **performer**; there are no other rows:

| # | From → To | Trigger | Performer |
|---|---|---|---|
| 1 | `pending` → `in-progress` | the runner takes the epic (writes `runBaseline` in the same write) | `/ptp:backlog-run` |
| 2 | `in-progress` → `done` | every slice landed in `processed` | `/ptp:backlog-run` |
| 3 | `in-progress` → `blocked` | `/ptp:full` did not converge; the run halts | `/ptp:backlog-run` |
| 4 | `in-progress` → `blocked` \| `pending` | **recovery only**, via the reconciliation gate below (`claim` → `blocked`; `disown` / `rerun anyway` → `pending`). **Never `done`.** | `/ptp:backlog-edit` |
| 5 | `blocked` → `pending` | explicit user reset, gated (**guard 1**) | `/ptp:backlog-edit` |
| 6 | any → `cancelled` | the user abandons the epic; from `blocked` or a stale `in-progress` it carries guard 1's acknowledgement (**guard 2**) | `/ptp:backlog-edit` |
| 7 | `cancelled` → `pending` | explicit user revival, subject to the inversion refusal (**guard 3**) | `/ptp:backlog-edit` |

### Refusals

- **Every runner-only row requested through `/ptp:backlog-edit` is refused**, and the refusal **names
  the row and its performer**: row 1 (`pending` → `in-progress`), row 2 (`in-progress` → `done`), and
  row 3 (`in-progress` → `blocked`) other than as row 4's recovery disposition.
- **Every transition absent from this table is refused** — in particular `done` → `pending`, `done` →
  `in-progress`, `blocked` → `done`, `cancelled` → `done`, `cancelled` → `blocked`, and `pending` →
  `done`.
- **A status write that changes nothing is refused as a no-op**, never reported as success.

**`done` → `cancelled` is permitted and unconditional.** Row 6 is written "any → `cancelled`", and its
two **gated** sources are named exhaustively as `blocked` and a stale `in-progress`; `done` is neither,
so no guard applies. This does not contradict the refusal list above: that list names `cancelled` →
`done`, the opposite direction, which stays refused. Cancelling a `done` epic documents abandonment of
shipped work — it unblocks nothing (`done` already satisfied dependents' edges) and discards no link
(`changeEpics` survives).

### Repairing an out-of-enum `status` — a repair, not a transition

Every row of the table above is defined over the **five enum values**, so an entry whose stored `status`
is **out of enum** has **no *from* row at all**. That state is a `malformed-entry` on a **non-`id`**
field — one of the five **writer-eligible structural defects** — so *Writer eligibility* deliberately
lets a writer proceed over it, and `/ptp:backlog-edit` is the tool that repairs it. Refusing the repair
as "a row absent from the table" would make that defect **unrepairable through ptp**, which is exactly
the lockout writer eligibility exists to prevent.

So: **an instruction that replaces an out-of-enum `status` with a valid enum value is a repair, not a
transition.** It is **permitted**, the refusal list above does not reach it, and the report names it
**as a repair**, quoting the invalid value found.

Its bounds:

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
- Every other rule of this file is unchanged by the repair — in particular the defect **still suppresses
  detection** for that invocation, and it is **still named in the report** as an outstanding structural
  problem until the repairing write lands.

### Guard 1 — `blocked` → `pending`

A `blocked` entry is the residue of a halted `/ptp:full` whose slices sat in
`applied (review pending)` — applied but unreviewed code. A bare reset would let a *later* attempt reach
`done` while that unreviewed code is still on the branch, and `done` unblocks dependents. So the reset:

1. **Retains the prior attempt's `changeEpics` in full** — it never clears them, never prunes them, and
   never relabels them. `/ptp:backlog` goes on listing them.
2. **Requires an acknowledgement**, carried in the instruction, that the prior attempt's unconverged
   slices were resolved — their review finished via `/ptp:review-full`, or the folders abandoned.
3. **Refuses an instruction that does not carry it**, and the refusal **lists the retained
   `changeEpics` ids** so the user knows exactly which folders to go check.
4. The acknowledgement is **report-time only**. v1 persists **no** "prior attempt resolved" field,
   **no attempt id, no attempt boundary, and no per-attempt grouping** of `changeEpics`: once
   `runBaseline` is cleared nothing in the file says which attempt minted which id. What is durable is
   the retained ids themselves, and the report names them so a reset is never mistaken for a clean
   slate.
5. **No `runBaseline` step is performed.** A `blocked` entry's baseline was already cleared by the
   runner's terminal write.

### Guard 2 — any → `cancelled`

`cancelled` **satisfies** dependents' edges while `blocked` does not, so cancelling a failed epic
unblocks every dependent in one step — guard 1's hazard reached by a shorter path. Per source status:

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

### Guard 3 — `cancelled` → `pending` (the inversion refusal)

Because `cancelled` satisfies dependents' edges, dependents may already have run while this epic was
cancelled. Reviving it would schedule a prerequisite *after* the work that depended on it.

**Revival is refused while any entry listing this id in `dependsOn` is `in-progress` or `done`**, and
the refusal **names those dependents and their statuses**. There are exactly **two** ways past it:

1. **Drop the stale edge.** The user removes this id from the dependent's `dependsOn` in a separate
   `/ptp:backlog-edit` against *that* dependent, which lands it in the dependent's `dependencyRejected`
   (so detection cannot resurrect it) and deletes its `dependencyEvidence` entry. The refusal then no
   longer applies, because the dependency no longer exists.
2. **Accept the inversion explicitly.** A single `/ptp:backlog-edit` revives the entry *and* carries the
   acknowledgement, recording in the **revived entry's `notes`** which already-`in-progress` / `done`
   dependents were built before their prerequisite. The written acknowledgement **is** the bypass: it is
   durable, so a later reader can see the ordering was violated deliberately.

**There is no third path — no flag, no force switch, no silent route.** Revival is **unconditional** only
when every entry listing this id in `dependsOn` is `pending`, `blocked`, or `cancelled`.

**Explicit user edits may target an entry in any status**, `done` and `in-progress` included — on a
`done` target such an edit documents history rather than schedules work. The *Dependency detection*
section's restriction of write-targets to `pending`, `blocked`, or `cancelled` binds **detection's
automatic writes only**. This is stated rather than left to be inferred because **guard 3's bypass 1
necessarily edits a `done` or `in-progress` dependent**, and reading that restriction as binding user
edits would make bypass 1 unreachable.

## Recovery and reconciliation

**A stale `in-progress` entry** is one whose `status` is `in-progress` **and** whose `runBaseline` is
**non-null**. The invariant this contract keeps is that, **once no backlog run is live**, a lingering
`runBaseline` means an **un-reconciled crashed run and nothing else**: the runner clears it on `done`
and on `blocked` alike, and every settling edit below clears it too.

**A live run presents the identical on-disk state, and nothing here claims otherwise.** The runner
writes `in-progress` and `runBaseline` in a **single** write **before** its work begins, so a file read
**cannot distinguish** a running epic from a crashed one, and `/ptp:backlog` therefore words its
stale flag **conditionally** rather than asserting a crash. v1 has **no multi-writer locking** (a
non-goal), so `/ptp:backlog-edit` cannot detect a live run either — and unlike the view its writes are
destructive, since settling clears the baseline a live run would itself have consumed. The rule:
**invoking `/ptp:backlog-edit` against a stale entry is the user's attestation that no backlog run is
live for it**, and the command's wording — in its report and in **every** gate refusal below — matches
`/ptp:backlog`'s: *un-reconciled from a crashed run only if no backlog run is currently live*. **No
sentence of this contract asserts that a crash occurred.** The invariant above states what a lingering
baseline *means* once no run is live; it is not a claim that the file can tell.

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
on a **stale** entry, and in the out-of-enum-status repair the previous section routes here (a null
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
fields or edges of an `in-progress` entry changes no status and is therefore not gated at all.)

There is exactly **one** further trigger, in the mirror-image case: an entry whose stored `status` is
**out of enum** but whose `runBaseline` is **non-null**. Its status cannot be read as `in-progress`, yet
the baseline is the runner's own evidence that a run was taken, so the *Repairing an out-of-enum
`status`* rule above routes that repair through **this same machinery** — reconciliation, this gate, an
offered disposition, and guard 2 when the destination is `cancelled`. Stating it here keeps the trigger
enumerated in one place: **`in-progress` with a status-changing instruction, or a non-null
`runBaseline` under an out-of-enum-status repair.** Nothing else is gated.

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
same obligation for the same reason: the **out-of-enum `status` repair** above, which moves an entry out
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
finished. A wrongly-`done` epic would **satisfy its dependents' edges** and let the next epic build on
unreviewed code — the exact hazard the runner halts on.

**A durable code-review-convergence marker is the named v2 seam** that would make an evidence-based
`accept` disposition possible. It is not a v1 gap.

### An ambiguous instruction against a gated entry is refused

An instruction against a gated entry that does **not unambiguously name a disposition the table offers
for that entry** is **refused, with the offered dispositions printed**. This is a **refusal, not a
clarifying question**: the commands consuming this contract are autonomous, so the safe response to
ambiguity is to **refuse** and show what is available, never to **ask** and never to guess.

## What `0036_01` did not ship

This section is a **historical scope note about slice `0036_01`**, not a live prohibition on the
commands that exist today. Where it says "no writer", read "no writer *in `0036_01`*": `0036_02`
shipped `/ptp:backlog-add`, which does reach the WRITE path above and is governed by the *Dependency
detection* section above.

**No consumer wiring, and above all no writer, landed in `0036_01`.**

- **No writer of any kind.** Nothing in `0036_01` created, modified, or deleted
  `openspec/backlog.json`. The write path above was *specified* for later changes; nothing in that
  slice performed it, and the repository still contained no backlog file after it landed.
- **No dependency detection in `0036_01`** — the detector, its input bound, its additive-only merge semantics, its
  bidirectional analysis, and its reverse-edge rules are **`0036_02`**, which is also the first
  consumer of the id-allocation and writer-eligibility rules above and which adds them to this skill
  as the *Dependency detection* section above.
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
