> Loaded from skills/ptp-backlog/SKILL.md when: validating an entry before a write.
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
