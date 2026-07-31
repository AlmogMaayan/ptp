---
name: ptp-telemetry-export
description: Own the methodology of the global `export` action behind `/ptp:telemetry-export` and `/ptp:telemetry export` — the one-command, no-flag, no-argument, no-selector re-derivation of every `spans.csv` from the raw store, with the impossibility argument for why a scoped or attribution-preserving form cannot exist; the determinism contract (the total row ordering `start_ts` → `span_id` → `trace_id` → serialized row with empty values ordering before non-empty, the unique-temp-file plus one replace-if-exists rename, and the directory-key-alone comparison); the torn-line tolerance and its honest statement of bounded unrecoverable loss; the refuse-while-a-receiver-is-live rule with its deliberately looser-than-`start` match (no launch token), its two-port probe, its stage-everything → probe once → rename-all ordering, its abort path, and the recorded residual window; and the partial-failure reporting that separates a staging failure from a publish failure. Reached from both front doors, which are two entrances onto this one skill. The raw store's append-only / immutable / single-writer contract, the span record and its 26-column CSV schema, the two mapping tables, the ledger join, the store layout and its policy write, the receiver's write path and entry envelope, and the auto-start preamble all stay in the `ptp-telemetry` skill and are cited here by anchor, never restated; the derivation itself stays in `scripts/ptp-otel-sink.js`, which this skill invokes and whose single JSON result it relays.
---

# ptp-telemetry-export — the global re-derivation

## Purpose

This skill owns the **methodology of `export`**: what it accepts, what it produces, how it orders
rows, how it tolerates torn lines, when it refuses, and how it is run. That methodology is stated
**here, once**, and nowhere else in the repository's skill and command prose.

`export` is a **rare, user-initiated repair-and-reconcile operation**. No pipeline command reaches it,
no auto-start preamble precedes it, and nothing invokes it as a side effect — it exists so a human can
reconcile the derived CSV view against the raw store after attribution has moved on, or after a crash
left a CSV behind the store.

**Two front doors, one methodology.** `/ptp:telemetry export` reaches this skill through the
`/ptp:telemetry` router and `/ptp:telemetry-export` reaches it directly. Both perform the same global
re-derivation and report the same terminal outcome; neither command carries methodology of its own, so
the two can never disagree.

**What this skill does not own.** Not the raw store's mutability contract; not the span record or its
CSV schema; not the OTel-attribute or `tool_class` mapping tables; not the ledger join; not the store
layout or its policy write; not the receiver's write path, entry envelope, or lockfile self-heal; not
the auto-start preamble; not `start`, `stop`, `status`, `setup`, `report`, or `analyze`. Each has more
than one consumer, so each stays in the `ptp-telemetry` skill and is **cited** here rather than copied
— in the form `` `ptp-telemetry` [anchor-id] ``, never by number and never by paraphrase. And the
**derivation itself is not here either**: it lives in `scripts/ptp-otel-sink.js`, which this skill
invokes and whose one JSON object it relays.

**Section numbers are preserved deliberately.** This skill's sections are numbered `12.2`–`12.6`,
which is what they were numbered in the `ptp-telemetry` skill before the extraction, so that a `§12.4`
citation made anywhere — including in the bundled scripts, which are never edited for this — still
identifies the same content. The `ptp-telemetry` skill retains `## 12. export` as a substrate stub
pointing here.

## Substrate dependencies

Every entry is a registered anchor in the `ptp-telemetry` skill. This list exists so a change to a
substrate region can find this dependent by grepping for the anchor id.

| Anchor (`ptp-telemetry`) | What this skill relies on it for |
|---|---|
| `store-layout` | the per-epic store under `<telemetry.root>/<epic>/` and the shared `_unattributed/` directory — the input set `export` reads and the output set it writes |
| `otlp-receiver` | the receiver as the raw store's only writer, and the write path a receiver appending mid-`export` uses |
| `receiver-two-appends` | the fresh-line rule that bounds a torn write to the one record in flight |
| `lockfile-self-heal` | the receiver write-path self-heal whose lockfile repair the refusal's port rule races |
| `auto-start-preamble` | the preamble that re-starts the receiver on the next funnel command, which is what makes the recovery sequence order-sensitive |
| `raw-store-immutability` | the raw store being append-only, immutable, and single-writer — and its corollary that nothing repairs a stored entry |
| `span-record` | the span record and its 26-column CSV schema, which `export` re-derives rather than redefines |
| `otel-attribute-mapping` | the OTel source → column mapping a re-derivation applies |
| `tool-class-mapping` | the `tool_class` mapping a re-derivation applies |
| `single-source-mapping-rule` | the rule licensing the sink's one executable copy of both tables, and requiring `export` to call it rather than reimplement either |
| `ledger-join` | the join that gives a re-derived span its epic, identical at ingest and in `export` |

Three further anchors are relied on and listed for LR-4 completeness, because the substrate registers
the **subsection** that actually carries each contract rather than only its enclosing section, and
LR-3 requires a citation to name the anchor its target carries:

| Anchor (`ptp-telemetry`) | What this skill relies on it for |
|---|---|
| `store-git-policy` | the store-policy write `export` performs before staging, and its self-healing for a root whose policy files were deleted |
| `raw-entry-envelope` | the raw entry envelope and the skip of an entry whose kind is unrecognized |
| `receiver-identity-wire-contract` | the identity probe's wire contract — how a listener identifies itself as a ptp receiver and reports the `telemetry_root` it serves |
| `substrate-map` | the anchor/class scheme itself — the sentinel and region rules that decide which anchor a citation above resolves to, and the leaf reference contract this list satisfies |

Which anchor each row above resolves to is decided by the substrate's own region rule, stated once in
`ptp-telemetry` [substrate-map] and never restated here — it is what makes a subsection's anchor,
rather than its enclosing section's, the handle a citation of that subsection must name.

## Anchor registry

The anchors this file hosts, in exact bijection with its own sentinels. Two are carried unchanged from
the `ptp-telemetry` skill so citers of them survive the extraction; the third is this file's own.

| Anchor id | Section | Class | Owner |
|---|---|---|---|
| `export-scope` | 12.2 | `leaf` | `export` |
| `export-determinism` | 12.3 | `leaf` | `export` |
| `export-requires-receiver-stopped` | 12.5 | `leaf` | `export` |

<!-- ptp-telemetry:anchor id=export-scope class=leaf owner=export -->
## 12.2 One command, no flag, no selector

`/ptp:telemetry export` takes **no flag and no argument**. Every invocation is a **global,
deterministic re-derivation**. `export --rebuild` and `export <selector>` are **rejected** with a
message saying `export` is global and takes no arguments; no CSV is modified.

**Why global, so nobody "fixes" it later:** re-derivation rewrites the **shared**
`_unattributed/spans.csv`, and rewriting a shared file correctly requires reading every epic's raw
store and every ledger. A scoped re-derivation would omit records placed there from an excluded epic
and reintroduce records an unread excluded ledger would have resolved — both breaking the complete
partition. Corollary: because there is no scoped form and no attribution-preserving form, the "a
scoped projection re-emits stale attribution" hazard has no surface on which to appear.

**Inputs:** every epic's `raw/*.ndjson`, `_unattributed/raw/`, every epic's `runs.ndjson`, **and**
`_unattributed/runs.ndjson`. **Outputs:** every epic's `spans.csv` **plus** `_unattributed/spans.csv`,
written as a **complete partition of every input record after re-derivation, judged by where it now
resolves and not by which raw directory it came from** — a record read from `_unattributed/raw/` that
now resolves lands in its epic's CSV; a record read from an epic's `raw/` that reconciliation now
attributes to no run lands in `_unattributed/spans.csv`.

**Re-attribution is a CSV-level outcome only.** Raw lines never move, are never duplicated, and are
never marked; only the CSV placement changes. There is deliberately **no** form that preserves stored
attribution — an eagerly written row carries the ingest-time view, and reconciling that view is the
whole purpose of the command.

<!-- ptp-telemetry:anchor id=export-determinism class=leaf owner=export -->
## 12.3 Determinism

Rows are ordered by a **total** ordering, never filesystem enumeration order: `start_ts`, then
`span_id`, then `trace_id`, then the serialized row compared lexicographically, with **empty values
ordering before non-empty**, under one comparison rule. `start_ts` may legitimately be empty and two
records can share both `start_ts` and `span_id`, so a partial ordering would break byte-identity
*silently* — exactly the class of bug the byte-identity criterion exists to catch.

"An unchanged store" needs no qualification: `export` writes nothing into `raw/`, so a second run
reads byte-for-byte what the first one read.

Each output is written to a **uniquely named temporary file in the same directory** and moved into
place with **one replace-if-exists rename**, so a crash mid-write leaves the previous complete file
and any reader sees a complete file at every moment.

Directory order is compared on the **directory key alone**. This is stated rather than left to a
default sort, because the natural way to write it — sorting the `(directory, rows)` pairs themselves —
compares their string renderings, which both grows the sort key with the size of the store and orders
`0032 b` ahead of `0032`. The order decides the `outputs` report and the rename sequence, so it is
part of the contract.

`export` performs the **store-policy write** (`ptp-telemetry` [store-git-policy]) before it stages
anything. It is a writer into `<telemetry.root>/` — it creates the epic directory a reattribution now
needs, it always writes `_unattributed/spans.csv`, and it replaces every existing one — so that
contract's self-healing for "a root whose policy files were deleted" has to reach the one command
whose entire output is CSV files: without `.gitattributes` these CRLF files are precisely what a
consumer repo's `text=auto eol=lf` normalizes, and the store-policy contract already records that the
BOM alone is not sufficient. It runs after the read-and-refuse gates, so a refusal still touches
nothing, and both halves swallow their own errors, so it can never turn a successful `export` into a
failed one.

## 12.4 Torn lines

The read can land on a torn line — the receiver may have been killed between an entry's two halves.
An incomplete or unparseable **trailing** line is **skipped**; a malformed **interior** line is
**skipped and counted**; an entry whose kind is unrecognized is skipped (`ptp-telemetry`
[raw-entry-envelope]). This is the same torn-line tolerance the ledger readers already require.

State the consequence honestly rather than "left for the next `export`": the raw store is append-only
and immutable (`ptp-telemetry` [raw-store-immutability]), so **nothing ever completes or repairs a
torn entry** and no later `export` recovers it. It is **unrecoverable telemetry loss**, bounded to the
one record in flight when the receiver died. What stops it spreading is the fresh-line rule
(`ptp-telemetry` [receiver-two-appends]).

<!-- ptp-telemetry:anchor id=export-requires-receiver-stopped class=leaf owner=export -->
## 12.5 It refuses while the receiver is live

Before reading or writing **anything**, `export` runs the identity probe. When a live receiver for
this store answers, it **refuses non-fatally** with **one line naming `/ptp:telemetry stop`**, writes
no `spans.csv` and no temporary file, and **never stops the receiver** — `export` declines, it does
not terminate anything.

**The match rule is deliberately looser than `start`'s.** `start` requires a full identity match
*including the launch token*, which presupposes an intact lockfile. `export` must **not** require the
token, because the row-losing case is a live receiver for *this* store whose lockfile was deleted —
the token cannot match, and a token-strict rule would let `export` proceed and overwrite rows appended
after its read. So `export` refuses whenever the listener identifies itself as a **ptp receiver
reporting this store's `telemetry_root`**, lockfile present or not, token matching or not, and
whatever a `healthy` verdict says. A non-ptp process, or a ptp receiver reporting a different
`telemetry_root`, writes none of these files and does **not** block `export`.

**The ports probed** are the configured `telemetry.port` **and, when the lockfile records a different
port, that port too** — on both the initial check and the pre-rename one. Probing only the configured
port would satisfy the rule's letter while racing precisely the writer the receiver write-path
self-heal (`ptp-telemetry` [lockfile-self-heal]) exists to reveal. **Residual limit, recorded rather
than claimed away:** a receiver for this store on a non-configured port **and** with no lockfile is
undiscoverable to the lifecycle rules and equally undiscoverable here.

**The refusal is a check at an instant, not an exclusion held for the run.** A concurrent session can
auto-start a receiver after `export` probed and began reading. That window is bounded two ways:
**every** output CSV is staged to its temporary file first, then the identity probe runs **once, after
all staging and before the first replace-rename**; if a receiver has appeared, `export` **aborts** —
all temporary files deleted, every `spans.csv` untouched, the same `/ptp:telemetry stop` message. The
ordering is load-bearing: probing before *each* rename could only catch a receiver after earlier
outputs were already replaced, making "every `spans.csv` untouched" unkeepable for a multi-file export.

What is left is stated honestly. A receiver appending between the final probe and a rename loses those
rows **from the CSV only** — it appends to `raw/` in the same write path and `export` never writes
there, so the next `export` restores them and **no telemetry is lost**. The partition guarantee is
therefore over **the raw records observed while staging**, not over whatever the store holds when the
rename lands. Closing the remainder would mean a store-scoped writer lock held across the export —
cross-process mutual exclusion that can go stale, plus a crashed-`export`-blocks-the-receiver failure
mode — bought to protect a **regenerable view** whose source of truth the operation never touches.
That trade is not worth making, so it is not made: **no** CSV-writer lock, **no** regeneration control
request on the loopback endpoint, **no** snapshot-versus-live-append ordering rule, and **no**
monotonic-visibility invariant.

**The recovery sequence, with its precondition.** The auto-start preamble (`ptp-telemetry`
[auto-start-preamble]) re-starts the receiver on the next funnel command, so `stop` → *any funnel
command* → `export` is refused again. The documented order is **`stop` → `export` with no funnel
command between them**, and `telemetry.mode=off` first is the way to guarantee it when that cannot be
assured.

## 12.6 Running it

```
node <plugin>/scripts/ptp-otel-sink.js export --repo <repo root>
```

It prints one JSON object: `action` ∈ `exported` | `refused` | `aborted` | `noop` | `failed`, the
outputs and row counts on success, and the `message` to relay verbatim otherwise. Relay the message
and stop; never "fix" a refusal by stopping the receiver.

`failed` is the filesystem outcome, distinct from the two receiver-driven ones: `refused` and
`aborted` both mean a live receiver was found and **nothing** was touched, whereas `failed` means the
store itself could not be written. Its two forms differ in exactly one respect, which the message
states: a **staging** failure leaves every `spans.csv` untouched, while a **publish** failure may have
replaced some of them — each file is complete, some newly derived and some the previous version.
Neither leaves a temporary file behind, and neither touches `raw/`, so re-running `export` after
fixing the permissions fully repairs the store.

## Hard rules

- **No flag, no argument, no selector.** Every invocation is the global re-derivation of §12.2; any
  argument is rejected with a message and nothing is modified.
- **It never writes into `raw/`.** The raw store's append-only, immutable, single-writer contract
  (`ptp-telemetry` [raw-store-immutability]) binds `export` by name — it is that contract, not a rule
  this skill makes, that forbids moving, marking, or deduplicating a stored entry and appending a
  re-derived copy of one.
- **It refuses while a receiver for this store is live and stops nothing** — one line naming
  `/ptp:telemetry stop`, per §12.5.
- **Never restate the substrate here.** The raw store's mutability contract, the span record and its
  columns, both mapping tables, the ledger join, the store layout and its policy write, the receiver's
  write path and entry envelope, and the auto-start preamble are cited by anchor and defined once, in
  the `ptp-telemetry` skill.
- **Never restate the derivation.** `scripts/ptp-otel-sink.js` implements it; this skill states the
  contract it must satisfy and relays its one JSON object.
