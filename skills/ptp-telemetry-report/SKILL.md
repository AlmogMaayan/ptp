---
name: ptp-telemetry-report
description: Single source of truth for the `/ptp:telemetry report` methodology — the selector delegation and the literal `write`-keyword strip, which happens here before `ptp-change-selector` ever sees the argument; `concurrency_factor` and the report's other derived figures, its one authoritative input set, the nested-chain diagnostic, the ordering rule, and the wall-time source record; the phase / agent_role / span_kind and tool_class breakdowns, the three N = 10 top-N sink lists, and the derived per-iteration review view; the report-specific data-quality footer items, instantiated from the substrate's footer obligation rather than restated; the write posture — creates no file, modifies no existing file, and deletes only aged raw files — with the optional report.md, the two empty cases, and the standing prohibition on ever calling `report` "read-only", not even qualified; and telemetry.retentionDays pruning of the reported epic's raw store, the one deletion in the telemetry contract. Reached through two front doors, /ptp:telemetry-report and /ptp:telemetry report, neither of which parses anything. It restates none of the shared substrate in skills/ptp-telemetry/SKILL.md — not the BANNED wall-minus-components subtraction, not either of the two never-conflated headline figures, not the footer obligation, and not the layered config reader — but cites each by anchor id.
---

# ptp-telemetry-report — the `/ptp:telemetry report` contract

## Substrate dependencies

Required by `ptp-telemetry`'s LR-4, and placed first so a substrate change can find its dependents by
grep. This skill depends on these anchored contracts and restates **none** of them:

In `skills/ptp-telemetry/SKILL.md`:

- `[substrate-map]` — the substrate/leaf partition, the frozen-numbering rule this skill's preserved
  numbering obeys, and the leaf reference contract every citation below follows.
- `[config-resolution]` — the layered, forgiving resolution of `telemetry.retentionDays` (default
  `30`), which §21 **uses** and never reproduces.
- `[store-layout]` — the per-epic store and the store-wide `_unattributed/` directory.
- `[ledger-record]` — the ledger record, including the `epic` and `change_id` fields the selector
  scoping narrows on.
- `[command-phase-mapping]` — the `phase` enumeration §18.4 deliberately does **not** key its
  eligibility on.
- `[append-protocol]` — the append-only two-line open/close protocol, its line ordering, and its
  reader-derived `unclosed`.
- `[gate-ordering]` — the gate ordering that makes `telemetry.mode` gate **writes** rather than
  reads.
- `[write-point-codex-exec]` — the bracketing of every `codex exec` shell-out with a ledger run,
  which is what makes §19.3's second input independent of span collection.
- `[receiver-two-appends]` — the receiver's `YYYYMMDD.ndjson` naming and the store's calendar-date
  basis, which §21.1's cutoff reads from there so the pruner and the file writer can never disagree
  about what day it is.
- `[span-csv-columns]` — the 26-column `spans.csv` schema.
- `[span-value-encodings]` — `duration_ms` written empty and never as a fabricated zero.
- `[raw-record-superset]` — the raw record's superset over `spans.csv`, which is why the derived
  input carries no Bash command prefix.
- `[tool-class-mapping]` — the `tool_class` table §18.2 groups by and never re-derives.
- `[ledger-join]` — the join that already attributed a span to its run.
- `[join-never-drops]` — a record resolving to no run has no epic, which is why §19.1's count is
  store-wide.
- `[raw-store-immutability]` — the append-only, immutable raw store, which is why there is no
  story-scoped deletion to perform.
- `[banned-subtraction]` — the **BANNED** `wall − Σllm − Σtool` form.
- `[aggregate-work-time]` and `[elapsed-wall-time]` — the two never-conflated headline figures every
  derived figure below is computed from.
- `[data-quality-footer-obligation]` — the shared rule that a rendering subcommand's footer is
  mandatory and never suppressed, together with its rationale, which §19 **instantiates**.
- `[status-methodology]` and `[analyze-methodology]` — the two sibling readers this skill contrasts
  `report`'s posture and inputs against. `[analyze-methodology]` is cited on `ptp-telemetry` because
  that is where its anchor is registered; a citer holding the anchor resolves in one hop from there.

In `skills/ptp-telemetry-export/SKILL.md`:

- `[export-scope]` — `export` as an always-global re-derivation, which is what makes §21.3's
  consequence follow.

## Provenance — these sections were `ptp-telemetry` §§16–21

These sections lived in `skills/ptp-telemetry/SKILL.md` as §§16–21 and **keep their numbers here**,
as that skill's frozen-numbering rule requires of an extracted leaf: a pre-split `§17.4` is `§17.4`
here, and the two bundled executables' unedited `§N` header citations still resolve. The numbering
gaps are therefore deliberate, not damage: the subsections that sit at the vacated numbers stayed
behind, because they are **substrate**. Those retained regions are named here **by anchor only** —
`` [banned-subtraction] ``, `` [aggregate-work-time] ``, `` [elapsed-wall-time] ``,
`` [data-quality-footer-obligation] `` — and never by their substrate section numbers.

**No methodology was changed by the move.** Only four mechanical classes of edit were applied to the
moved prose: outbound references retargeted to their owning skill's anchor id; a substrate rule cited
where the prose previously restated or leaned on it; scope words rebound ("this skill", "§16–§21");
and two new parent headings added, for `## 17.` and `## 19.`, whose pre-split parents' own content is
substrate and stayed behind.

Exactly **two** further changes were made, recorded here so a reader diffing against the pre-split
text sees them as deliberate rather than as transcription slips:

1. **One surface added to an existing rule.** `commands/telemetry-report.md` — the front door this
   split creates — was added to the enumeration of surfaces on which `report` may not be called
   "read-only". The moved prose carries that enumeration at two sites, §16's opening paragraph and
   §20.1, and **both** grew by the same one surface, so neither tells a reader the prohibition fails
   to bind the new command. This adds a surface to a rule; it does not change the rule.
2. **One pre-existing mis-citation corrected.** §16's opening attributed the bounded retention
   deletion to the section that holds the headline numbers; retention is `§21`. It now reads `§21`.
   After the split the old text would have pointed at a section that is substrate and holds nothing
   about retention.

## The outbound-reference rule

**Every reference leaving this skill names the owning skill plus the target's anchor id** —
`` `ptp-telemetry` [elapsed-wall-time] `` — **never a section number and never a bare title.** The
sections this skill cites are being re-homed by sibling changes, so a transcribed number would become
a stale reference that still looks resolvable.

Section numbers therefore appear below in exactly two cases, and this list is closed:

1. **This skill's own sections** — `§16`, `§17`, `§18`, `§19`, `§20`, `§21` and their subsections.
2. **Citations of `skills/ptp-change-selector/SKILL.md`**, whose numbers are preserved exactly as
   written. Nothing here edits that file's numbering, so retargeting those by title would discard a
   working reference for no benefit.

Any other section number is a **defect** anywhere in this file — including a number naming a
substrate section this skill cites by anchor, and including a number in a heading, a parenthesis, or
a footnote. Such a token still looks resolvable while pointing at whatever a sibling change has since
put at that number, which is precisely the failure the anchor form exists to prevent.

## Anchor registry

Every anchored heading in this skill carries its sentinel on the line immediately above it, and each
id appears exactly once as a sentinel and once here — the same bijection discipline `ptp-telemetry`
pins for the substrate. Eight ids travelled from that file unchanged, so a citer holding one resolves
here; two are new, for the two parent headings this split introduces.

| Anchor id | Section | Class | Owner | Origin |
|---|---|---|---|---|
| `report-methodology` | 16 | `leaf` | `report` | travelled |
| `report-selector-delegation` | 16.1 | `leaf` | `report` | travelled |
| `report-derived-figures` | 17 | `leaf` | `report` | new parent heading |
| `report-concurrency-factor` | 17.3 | `leaf` | `report` | travelled |
| `report-nested-chain-diagnostic` | 17.5 | `leaf` | `report` | travelled |
| `report-breakdowns` | 18 | `leaf` | `report` | travelled |
| `report-footer-instantiation` | 19 | `leaf` | `report` | new parent heading |
| `report-footer-items` | 19.1 | `leaf` | `report` | travelled |
| `report-write-posture` | 20 | `leaf` | `report` | travelled |
| `retention` | 21 | `leaf` | `report` | travelled |

`report-headline-numbers` is **not** here. It names the two headline figures, which stayed in
`ptp-telemetry` — it remains on that file's retained `## 17.` heading, reclassified `substrate`.

---

<!-- ptp-telemetry:anchor id=report-methodology class=leaf owner=report -->
## 16. `/ptp:telemetry report` — the analysis methodology  *(moved from `ptp-telemetry` by `0044_08`)*

`report` is the epic's answer to *"where is time wasted?"*. It **collects nothing**: it is a
read-and-render pass over the **derived** store files the earlier layers wrote, plus the bounded
retention deletion of §21.

**Its posture, worded this way everywhere and never shortened:** a **default** `report` **creates no
file, modifies no existing file, and deletes only aged raw files.** The word *default* is part of
the wording, not a hedge on it: §20.2's explicit `write` keyword is the **one** way a `report.md` is
created or overwritten, and a posture sentence that omitted the qualifier would be false of exactly
the invocation the user asked to write. It is **never** called "read-only" — not here,
not in `commands/telemetry.md`, not in `commands/telemetry-report.md`, not in the spec, not in the
README, and not in a qualified form such
as "read-only (except pruning)". A default invocation deletes data irreversibly, and a reader keeps
the adjective while dropping the parenthesis.

**`report` and `analyze` are separate readers, with separate inputs and separate postures: nothing in
this skill governs `analyze`, which `ptp-telemetry` [analyze-methodology] owns wholly.**

<!-- ptp-telemetry:anchor id=report-selector-delegation class=leaf owner=report -->
### 16.1 The selector — delegated wholesale, extended not at all

`report [selector]` hands its argument to the resolution algorithm of
`skills/ptp-change-selector/SKILL.md` **unchanged**, and therefore supports exactly the forms that
skill already defines:

| Form | Meaning |
|---|---|
| `epic:all` | every active epic |
| `epic:XXXX` | one epic |
| `epic:XXXX story:NN` | one story within an epic |
| `story:NN` | the one active change with that story, when unambiguous — resolved through the shared skill's ambiguity rule unchanged, so an id occurring in several epics STOPs there asking for `epic:XXXX story:NN` rather than being disambiguated here |
| a bare change id | that change |
| *(empty)* | **this command's own default — every active epic**, stated below |

**The empty argument, stated here because the selector defers it back.** `ptp-change-selector` §2
resolves an empty selector by *deferring to the command's existing default*, so a command that in
turn defers to the selector leaves the scope undefined. `report`'s default is therefore named here:
**an empty argument is treated exactly as `epic:all`** — every epic holding an active change,
**each reported separately** per the rule below, with the same set and ordering §3 gives `epic:all`.
Nothing about the grammar changes: the selector still only ever receives a form it defines.

**Story-level selectors project to their epic's store, and narrow by row.** The store is keyed on
the **epic** (`<telemetry.root>/<epic>/`), while every span and ledger row carries **both** `epic`
and `change_id` (`ptp-telemetry` [span-csv-columns], [ledger-record]). So for a resolved change id — from `epic:XXXX story:NN`, from
`story:NN`, or from a bare id — `report` **reads that change's epic store** and counts as *in scope*
only the rows whose `change_id` equals a resolved id. For `epic:XXXX` (and `epic:all`, per epic)
every row in that epic's store is in scope. "In scope" means exactly that everywhere below — in
the two headline figures (`ptp-telemetry` [aggregate-work-time],
[elapsed-wall-time]), §18's breakdowns and top-N lists, and §19's counts.

**A legacy id has no epic store, and that is a defined outcome rather than a gap.** The selector
still resolves **legacy / unprefixed** folder names (`ptp-change-selector` §3 step 2 parses them as
`epic=None`, and `epic:all` appends them after the epic-prefixed ids). Such a change has no
four-digit epic segment, so the `ptp-telemetry` [store-layout] write points could never resolve an epic for it and its rows went
to the store-wide `<telemetry.root>/_unattributed/` — which §17.4 reads **for the footer count
alone**. So a legacy id resolves to a scope with **no epic store**: the report states that no
telemetry exists for it per §20.3, the `ptp-telemetry` [data-quality-footer-obligation]
footer still renders, and **nothing is pruned**, there
being no `<telemetry.root>/<epic>/raw/` to prune. It is never an error, and the store-wide
unattributed count in the footer is the signal that explains it.

**Retention is the one thing that does *not* narrow with the rows** — see §21.2: a raw file holds
every story's records for a day, and the raw store is append-only and immutable (`ptp-telemetry` [raw-store-immutability]), so there is
no story-scoped deletion to perform. A story-scoped `report` therefore prunes its **whole epic's**
`raw/`. That is stated rather than discovered, because it is the one effect whose blast radius
exceeds the reported scope.

**This section adds no grammar of any kind** — no new prefix, no new token, no per-command form.
`/ptp:telemetry report` is listed among the **set-capable consumers** in
`skills/ptp-change-selector/SKILL.md` §Role B, which is what makes a future grammar addition reach
the report automatically instead of needing a second edit here.

**Two inherited rules, restated because this command would break quietly without them:**

- **Use the resolved id, never the raw selector string**, wherever an identifier or a path segment is
  required. `<telemetry.root>/<epic>/` is keyed on the resolved epic; a raw `epic:0032 story:01`
  string is never a path segment.
- **Under `epic:all`, each epic is a separate reporting scope.** Report each on its own.

**Why epics are never summed.** A cross-epic `concurrency_factor` would divide one epic's work by
another epic's elapsed time — averaging unrelated workloads that never overlapped into a ratio that
describes neither. The same objection applies to every summed figure, so no figure is summed across
epics: `epic:all` produces *N* reports, never one merged report.

### 16.2 The `write` keyword is a `report`-level token, stripped before the selector

`report` recognises one literal token, `write`, and **removes it from the argument before anything
reaches the selector**. So the selector never receives a token it does not define and §16.1's
no-new-grammar rule holds *literally* rather than approximately:

- `report write epic:0032` → the resolver is handed `epic:0032` **alone**, and `report.md` is written
  for the resolved epic (§20).
- `report epic:0032` → the resolver is handed `epic:0032`, and **nothing is written**.
- A bare selector value is **never** read as a request to write, and `write` is **never** read as a
  selector value. Both directions matter: a mis-parse in one direction loses the report, and in the
  other writes a file the user did not ask for.

**`write` is a reserved token at the `report` level, and the one consequence is stated.** Because the
strip is unconditional, a **legacy** change folder named literally `write` could not be selected by
its bare id here. That is the same reservation `ptp-change-selector` already makes for `all` inside
the `epic:` namespace, scoped the same way — to this one subcommand's argument, never to the shared
grammar, which gains and loses nothing. It is written down rather than discovered, and no
epic-prefixed id can ever collide (`\d{4}_\d{2}_…` is not the string `write`).

A `--write` flag was rejected for exactly this reason — it would have made `report` parse an argument
string the selector otherwise owns end to end.

---

<!-- ptp-telemetry-report:anchor id=report-derived-figures class=leaf owner=report -->
## 17. The report's derived figures and inputs  *(the banned subtraction and both headline figures are substrate — `ptp-telemetry` [banned-subtraction], [aggregate-work-time], [elapsed-wall-time])*

The two headline figures every subsection below derives from — and the one arithmetic form the whole
telemetry contract **bans** — are substrate and stayed in `skills/ptp-telemetry/SKILL.md`:
`` `ptp-telemetry` [banned-subtraction] ``, `` [aggregate-work-time] ``, and
`` [elapsed-wall-time] ``. They are **named here and restated nowhere**: a second copy of any of the
three would be a second source of truth for the contract's most-cited arithmetic, and `analyze`
inherits all three, which is exactly why they are substrate rather than `report`'s.

The subsections consequently begin at **§17.3**. Numbering is frozen
(`` `ptp-telemetry` [substrate-map] ``), so the three that stayed keep the numbers they already had,
where they already are, and these continue from where those end.

<!-- ptp-telemetry:anchor id=report-concurrency-factor class=leaf owner=report -->
### 17.3 `concurrency_factor`

```
concurrency_factor = aggregate work time ÷ elapsed wall time
```

Printed with its plain-language reading, e.g. *"2.4× — roughly 2.4 spans' worth of counted work
overlapping on average."*

**It is never phrased as a count of agents.** The numerator sums LLM and tool spans that overlap
*within* a single agent as readily as across agents — a tool result streaming back during generation,
parallel tool calls from one agent — so a **single-agent** run can score well above one. "2.4 agents
were working" is a plausible, wrong reading of a correct number, which is precisely the failure this
change exists to close; getting the denominator right and then mislabelling the ratio would waste the
effort.

**Reported only when elapsed wall time is available and greater than zero *and* aggregate work time
is present.** Otherwise the report **states that the factor is undefined** — never `0`, never `∞`,
never a dash a reader could average into something. A ledger-only scope therefore reports its
ledger-window wall time, reports the LLM and tool figures as **absent**, and states the factor
**undefined**: an absent numerator is not a zero numerator. A value below `1` is legitimate (spans dropped, sink down mid-run) and is reported
as-is with the footer explaining, **never clamped**.

### 17.4 Inputs — one authoritative set

The report reads **`spans.csv` and `runs.ndjson`, and never `raw/`.**

Why the restriction is a rule and not a preference: **pruning (§21) bounds `raw/` immediately, while
`spans.csv` only catches up at the next `export`** — the two stores intentionally hold different
histories in between. A report that mixed them would report a **different past depending on when it
ran**. Reading the derived files also means a prune has no effect on report output until the user
runs `export`, which is the honest and predictable ordering.

**`analyze` (`ptp-telemetry` [analyze-methodology]) reads `raw/` as a DIFFERENT COMMAND with its own input rule — a separate reader,
NOT an exception to this one.** Every sentence above is scoped to `report` and stays literally true:
`report` still reads `spans.csv` and `runs.ndjson`, and never `raw/`. The stated reason for this rule
— the prune-versus-`export` divergence — is **unaffected**, because `analyze` prints **no figure
`report` also prints**, so the two commands share no number that could disagree about the same past.

**`<telemetry.root>/_unattributed/spans.csv` is read for the footer's row count and nothing else.**
No record from it may enter aggregate work time, elapsed wall time, `concurrency_factor`, a
breakdown, or a top-N list. Those records resolved to no run and therefore to **no epic**: folding
them into an epic's body would both invent an attribution and count the same rows into **every**
epic's report at once.

**This clause is `report`'s too, and it is unchanged: `report`'s epic-scoped body figures still
exclude `_unattributed/`.** `analyze` reads that store as part of the whole-store raw superset, but it
has **no per-epic figure at all**, so the failure this rule prevents — inventing an attribution, and
counting the same records into every epic at once — cannot occur there. A separate reader, not a
relaxation (`ptp-telemetry` [analyze-methodology]'s *“Relationship to `report` — a separate reader, not an exception”*).

<!-- ptp-telemetry:anchor id=report-nested-chain-diagnostic class=leaf owner=report -->
### 17.5 The nested-chain diagnostic (secondary, but required)

The parent ids still earn their place. The report shows the **longest chain of nested spans per
trace**, measured as **that chain's interval union** — ties broken by **row order** (below): among
chains of equal extent the winner is the one whose **earliest row** comes first in row order, and if
that still ties, its next row, and so on. A tie-break is stated because `ptp-telemetry` [elapsed-wall-time] already establishes
that ties are the *normal* case here — where a root encloses everything, every chain through it has
the same extent — so an unstated tie-break would mean two implementations reporting different chains
from identical input, in a diagnostic whose output includes counts a reader is asked to trust. It is
clearly labelled a **secondary diagnostic**. It
is **never** the denominator of `concurrency_factor` and no headline number depends on it — but it is
**required rather than optional**, because the footer's graph-repair counts are produced by building
it, and a report that skipped it would silently stop reporting those repairs.

Because it does walk the graph, its degenerate cases are handled explicitly, and **each occurrence is
counted for the footer** rather than quietly repaired:

| Degenerate input | Handling | Footer |
|---|---|---|
| an edge whose `parent_span_id` matches no in-scope `span_id` | drop the edge | count dropped edges |
| a duplicate `span_id` | resolve to its **first occurrence in row order** (below) | count duplicate ids |
| a cycle in `parent_span_id` | break it at the edge that closes it **under row order** (below) | count broken cycles |

**Span identity is `(trace_id, span_id)`, and no edge crosses a trace.** The chain is computed *per
trace*, so "matches no in-scope `span_id`" and "a duplicate `span_id`" both mean **within the same
`trace_id`**: a `parent_span_id` is resolved only against span ids in its own trace, and the same
`span_id` appearing in two traces is **two different spans**, not a duplicate. Left unscoped, the
two readings differ on real input — span ids are unique per trace, not globally — and would produce
both different chains and different repair counts. A row with an **empty `trace_id`** forms no edge
and joins no chain; it is not silently pooled with every other empty-trace row into a trace that
never existed.

**Row order — the total order these two rules resolve against, because "first" and "the edge that
closes it" are otherwise underdetermined.** Two rows can share a `start_ts` to the millisecond, and
which edge "closes" a cycle depends on where a traversal entered it — so two implementations could
report different repair counts from identical input, which a *diagnostic whose whole output is
repair counts* cannot afford. **Row order is `start_ts` ascending, ties broken by the row's position
in `spans.csv`, ties there impossible** (a file position is unique). Nodes are visited in row order,
and each node's parent edge is followed in that same order — so "first occurrence" is the earliest
row, and the edge that closes a cycle is the one whose traversal reaches an ancestor already on the
current path. An empty `start_ts` sorts **last**, after every populated one.

Slice 2 records `trace_id` / `span_id` / `parent_span_id` only where the emitted event supplies them,
so parent links depend on the emitter. **When no usable parent links exist the diagnostic is omitted
and the omission is stated** — and the headline wall figure is unaffected, because it never depended
on them.

**"No usable parent links" means no `parent_span_id` values at all** — the emitter supplied none.
A scope whose `parent_span_id` values are all **present but dangling** is **not** that case: those
links exist, they are **dropped edges**, every one of them is **counted**, and the footer prints the
dropped-edge count (§19.4). Reading an all-dangling graph as "no usable links" would suppress the
repair count at the exact moment it is largest — reporting the worst parent graph as though it were
the absence of one. The diagnostic itself then yields only single-span chains, which is a correct
result rather than an omission.

### 17.6 Ordering

**The two headline numbers are printed before any breakdown**, so the concurrency framing is
established before a reader starts summing sub-tables and re-deriving `ptp-telemetry` [banned-subtraction]'s banned figure for
themselves.

### 17.7 The wall-time source record

While computing `ptp-telemetry` [elapsed-wall-time], record for the footer (§19.4):

- **which sources contributed** — span intervals, ledger run windows, or both;
- **how much of the union came from run time no span covered** — the direct measure of how
  instrumented the scope actually was.

A scope with runs and no spans is the **degenerate case of `ptp-telemetry` [elapsed-wall-time]'s single rule**, not a separate code
path, and the substitution is **never silent**: the footer names the source either way.

---

<!-- ptp-telemetry:anchor id=report-breakdowns class=leaf owner=report -->
## 18. Breakdowns, top-N time sinks, and the per-iteration review view  *(moved from `ptp-telemetry` by `0044_08`)*

Everything in this section is a **grouping over rows the earlier layers already derived** — no new
analysis, no new column, no new collection. All of it is printed **after** the two headline numbers
(`ptp-telemetry` [aggregate-work-time], [elapsed-wall-time]) — see §17.6.

### 18.1 The general breakdown — phase × `agent_role` × `span_kind`

One table, keyed on the three columns together, reporting each cell's summed `duration_ms` (and its
row count). This is the general-purpose view: it answers "which phase, run by which kind of agent,
spent its time on LLM calls versus tools?" without needing a second table per question.

### 18.2 Tool time by `tool_class`

Within tool time, a sub-table grouped by `tool_class` — the literal request answered as a
**grouping**, because slice 2 already derived the column (`ptp-telemetry` [tool-class-mapping]). Its buckets are `search`, `read`,
`write`, `build_test`, `git`, `agent`, `other`, so **repository-search time and build/test time are
directly readable as two separate figures** even though both arrive as `Bash`.

**Plus one row the mapping table does not name: `(unclassified)`.** `ptp-telemetry` [tool-class-mapping] leaves `tool_class`
**empty** whenever `tool_name` is empty, while `ptp-telemetry` [aggregate-work-time] counts a row as tool work on its `span_kind`
alone — so a timed tool row with no tool name is real tool time belonging to none of the seven
buckets. Those rows get their own explicitly labelled row here (and are eligible for §18.3's
slowest-`tool_class` list under that label). **The sub-table therefore sums exactly to the `ptp-telemetry` [aggregate-work-time]
tool figure**, which is the point: a breakdown that quietly totals less than the headline it decomposes
teaches a reader to distrust both, and "the rows are there but in no bucket" is precisely the kind of
silent shortfall the `ptp-telemetry` [data-quality-footer-obligation] footer exists to prevent — except that here it is avoidable outright rather
than merely disclosable. `(unclassified)` is **never** merged into `other`: `other` means *classified
as none of the above*, a genuinely different fact from *not classifiable at all*.

### 18.3 Top-N time sinks — three lists, `N` = 10

`N` is **10 for all three lists and is stated in the output**, so a truncated list never reads as
exhaustive. A list with fewer than `N` entries is simply shorter — never padded.

1. **Slowest individual spans** — by `duration_ms`, **populated durations only**. A row whose
   `duration_ms` is empty is **not ranked at all** rather than sorted as a zero: empty is not zero
   anywhere in the telemetry contract (`ptp-telemetry` [span-value-encodings]), and a "slowest" list is a ranking, which an untimed row cannot
   join. Ties are broken by row order (§17.5), so the list is deterministic.
2. **Slowest `tool_class`** — by total time, from §18.2's table.
3. **The costliest *repeated* identical tool call** — see below.

**All three lists are ordered deterministically to the last row, including at the cutoff.** List 1
breaks ties by row order (above). Lists 2 and 3 aggregate rows, so no single row order applies to
them: they break a tie in **total time** by the **key itself, ascending** — the `tool_class` name
for list 2, the full key string for list 3 — comparing by Unicode code point. Aggregate lists need
this stated as much as the row list does: `N` is a **cutoff**, so a tie straddling rank 10 decides
which entries a reader sees at all, and leaving that to an implementation would mean the same store
printing different top-tens.

**The costliest repeated identical tool call.** Its key is `tool_name` together with the **preserved
command prefix**; **repetition is the *filter*** (only keys occurring **at least twice** are
eligible) and **total time — count × mean duration — is the *ranking***, with the **count printed
alongside the total** so the repetition stays visible in a list ordered by something else.

**Only occurrences with a populated `duration_ms` participate — in the count, in the mean, and in
the total alike.** An empty duration is never zero and is never imputed from the mean
(`ptp-telemetry` [span-value-encodings], [aggregate-work-time]), so a row without one is not timed work and cannot be ranked; counting it while excluding it
from the total would silently divide a real sum by an inflated count and *understate* the very sinks
this list exists to surface. The consequence is stated: the printed count is the number of **timed**
occurrences, `total = count × mean` is therefore just the sum of those durations, and a key with
fewer than two timed occurrences is **not eligible** even if it appeared more often.

**The list is named for cost, not for repetition.** A raw-count ordering and a total-time ordering
are *different lists*: a call repeated twice for four minutes genuinely should outrank one repeated
two hundred times for two seconds, so labelling the output "most-repeated" would describe the
ordering it deliberately does **not** use.

**Key resolution against the authoritative inputs, stated rather than assumed.** §17.4 forbids
reading `raw/`, and the 26-column `spans.csv` (`ptp-telemetry` [span-csv-columns]) carries **no** Bash command
text — that value is raw-only (`ptp-telemetry` [raw-record-superset]). So the key is `tool_name` plus the command prefix **only where the derived
input supplies one**; where it does not, the report keys on `tool_name` + `tool_class` and **says
so in the list's heading**, rather than silently presenting a coarser bucket as an identical call. A
later additive column carrying the prefix would sharpen the key without changing the filter or the
ranking rule.

**And the degraded list is renamed, not merely footnoted** — because `tool_name` + `tool_class` is a
**class**, not an identity: forty different `Grep` calls, or every `Bash` command that happens to be
a build, collapse into one row that repeated no *identical* call at all. Printing that row under the
heading "costliest repeated **identical** call" would be a plausible wrong conclusion drawn from a
correct number — this change's own failure mode, in the one list most likely to drive an action. So
where the key is degraded the list is headed **"costliest repeated tool *class*"** and names the key
it actually used and why; the word *identical* appears **only** where the key genuinely establishes
identity. Today's 26 columns supply no prefix, so the degraded heading is the one a reader sees —
stated here rather than left to be inferred from the absence of a column.

**Why this list exists.** `ptp-review-loop` runs up to `review.maxIterations` and **each iteration
starts cold**, so the same `Grep`, the same `Read`, the same repository survey is re-run every
time — ptp's characteristic waste pattern. Paired with §18.4 it turns "the review loop feels slow"
into "iteration 4 cost six minutes, most of it re-running searches iteration 3 already ran".

### 18.4 Review-loop cost per iteration

**Which runs this view covers, stated before how they are grouped.** Only runs whose `command` is a
**review-family command** — `/ptp:review*` or `/ptp:codex-review*` — are eligible, because those are
exactly the commands `ptp-review-loop` drives under `review.maxIterations`. Every other command's
runs appear in **no** per-iteration view: the grouping rule below would happily number three
`/ptp:apply` runs "iterations 1–3" and compare them against a review cap that says nothing about
them, manufacturing a sequence and a flag out of unrelated work. Note the eligibility is keyed on
the **`command`**, not on the `ptp-telemetry` [command-phase-mapping] `phase` enumeration, because the plan-, PRD-, and brainstorm-kind review loops
map to those phases while still running under the same cap.

**Iteration numbers are derived, and the report says so.** `ptp-review-loop` keeps its counter in
conversation state and **never persists it**, so no recorded field carries an iteration number. The
reconstruction:

1. **Group** ledger runs sharing **change id**, **`command`**, **`phase`**, and **`agent_label`**.
2. **Order** the group by run **`t_start`**, ties broken by the run's **line position in
   `runs.ndjson`** — the ledger is append-only (`ptp-telemetry` [append-protocol]), so line position is a genuine total order and
   two runs opened in the same millisecond still number deterministically. Without the tie-break,
   two implementations could hand the same runs different iteration numbers, and with them different
   per-iteration totals — the same failure §17.5's row order closes for spans.
3. **Number** the members in that order — iteration *n* is the *n*th run of the group.

**Spans join an iteration through the ledger run they are already attributed to** — via `run_id`,
never by re-joining on time. Slice 2 already performed that join (`ptp-telemetry` [ledger-join]); a second one could disagree
with it, and two contradictory attributions of the same span is worse than one imperfect one.

**Each iteration reports BOTH its aggregate work time AND its wall time, each labelled**, alongside
the **configured `review.maxIterations` cap** (resolved by `skills/ptp-review-loop/SKILL.md`'s
forgiving resolver, default 5). A single unlabelled "cost" number is forbidden: it would let a reader
treat work time and elapsed time as the same quantity — the exact conflation `ptp-telemetry` [aggregate-work-time]
and [elapsed-wall-time] exist to prevent.

**The loop-boundary problem is surfaced, never solved.** The ledger records **no loop-invocation
id**, so nothing separates "one loop that ran five iterations" from "two loops that ran two and
three" over the same change. Every available fix is a guess — an idle-gap threshold picks an
arbitrary number of minutes, a session heuristic reads a boundary the store never recorded — and both
would produce confident boundaries nobody can verify. **So the report invents none.** Instead, when a
group holds **more runs than the currently configured `review.maxIterations`** permits, it flags **in
the footer** (§19.5) that the group **likely** spans more than one loop invocation and that its
numbering is **approximate**.

**"Likely", never "proven".** The cap is read **at report time**; the ledger records no cap in force
when those runs happened; a cap **lowered since** would trip the comparison on a single valid loop.
Asserting proof would be the report doing precisely what it warns its readers against — turning a
suggestive number into a confident claim.

**Overlapping run windows within one group** are numbered by `t_start` and **flagged in the footer**
(§19.5): a sequential loop should not produce overlaps, so an overlap means a **retry or a concurrent
invocation**, and presenting either as "iteration 3 then iteration 4" would invent a sequence.

**"Overlap" means a *positive-duration* intersection.** Windows are closed intervals, so one run's
`t_end` can equal the next run's `t_start` exactly — that is a loop running back to back, the most
*sequential* thing the ledger can record, and flagging it would say the opposite of what the flag
means. Touching endpoints are therefore **not** an overlap; only a strictly positive shared extent
is.

---

<!-- ptp-telemetry-report:anchor id=report-footer-instantiation class=leaf owner=report -->
## 19. The report's data-quality footer items  *(the obligation itself is substrate and stays in `ptp-telemetry`)*

That the footer is mandatory, and why, is the substrate's to state:
`` `ptp-telemetry` [data-quality-footer-obligation] `` says it once, for every rendering subcommand.
This section **instantiates** that obligation for `report` and re-asserts no part of it in narrower
words.

**What the cited obligation rules out here, enumerated because these are the three cases in which a
reader might expect the footer to be skipped:** it renders on an **empty store**, on a **clean
store**, and when **every item is nil**. All three are applications of the cited rule, not exceptions
to it.

**Every item below appears in the footer itself**, whether or not the section it came from also
mentions it, so **a reader who reads only the footer still sees every caveat**.

<!-- ptp-telemetry:anchor id=report-footer-items class=leaf owner=report -->
### 19.1 Store-wide unattributed span count

The row count of `<telemetry.root>/_unattributed/spans.csv`, **labelled store-wide**.

It is store-wide and not this epic's, because a record that resolved to **no run** has **no epic** to
belong to (`ptp-telemetry` [join-never-drops]). So the footer states that a large count means the ledger join is broken
**store-wide**, and therefore that this epic's figures **may** be understated by an unknown amount.
It **never asserts that they are**: nothing is known about which epic those records came from, and
claiming they are this epic's would attribute records to an epic precisely where attribution failed.

Per §17.4, this count is the **only** use of that store — no record from it reaches any body figure.

**Unchanged by `analyze`.** `analyze` (`ptp-telemetry` [analyze-methodology]) reads `<telemetry.root>/_unattributed/raw/` as part of the
whole-store raw superset, but it produces **no per-epic figure**, so the failure this exclusion
prevents cannot occur there. `report`'s rule above is untouched: a separate reader, **not an
exception** (`ptp-telemetry` [analyze-methodology]'s *“Relationship to `report` — a separate reader, not an exception”*).

### 19.2 Unclosed run count

Runs with an open line and no close line (the `ptp-telemetry` [append-protocol] reader-derived `unclosed`). Their count is reported,
and they are **excluded from duration aggregates** — a missing `t_end` is **never** treated as a
zero-length window, and an unclosed run contributes no interval to the `ptp-telemetry` [elapsed-wall-time] union.

**The exclusion is of the run, never of its spans** (`ptp-telemetry` [aggregate-work-time]): a span attributed to an unclosed run
still contributes its own duration to aggregate work time and its own interval to the wall union,
because it is a complete record of work that actually happened. Excluding those spans would
understate the report most severely when it is most useful — mid-run, where open runs are the
expected state.

### 19.3 The Codex line — two independent inputs, both reported

"No `cli=codex` rows" is compatible with several different situations, and **a single ordered ladder
over that one signal cannot separate them** — an early branch swallows the cases the later branches
exist for, leaving "the slice has not landed" unreachable. So **two independent inputs are read and
both are reported**:

**Configuration state** — does the **installed** `skills/ptp-telemetry/SKILL.md` carry a Codex
telemetry contract? *Absent* ⇒ `0032_06_codex-telemetry` has not landed. *Present in the coarse
ledger-only form* ⇒ it landed and deliberately configures **no** Codex span collection. *Present in
the span-collecting form* ⇒ Codex spans are expected.

**Ledger evidence** — does the scope contain `cli=codex` **runs**? Slice 1 brackets **every**
`codex exec` shell-out with a ledger run (`ptp-telemetry` [write-point-codex-exec]), so this answers *"did Codex run here?"*
independently of whether any span was ever collected. That independence is the whole point: it is
what distinguishes "Codex ran and told us nothing" from "Codex never ran".

The footer states the **resolved combination**:

| Configuration state | `cli=codex` ledger runs | The footer says |
|---|---|---|
| not configured (slice not landed) | none | Codex telemetry is not configured, **and** Codex did not run in this scope |
| not configured (slice not landed) | present | Codex telemetry is not configured; Codex **ran**, and its ledger wall time is reported |
| coarse ledger-only | none | Codex time is ledger wall time by design; Codex did not run in this scope |
| coarse ledger-only | present | Codex time is ledger wall time by design, and that wall time is reported — a **steady state, not a gap** |
| span-collecting, spans present | present | Codex data is present |
| span-collecting, no spans | present | Codex ran and emitted no telemetry; reuse `0032_06_codex-telemetry`'s degradation label **verbatim** when it publishes one, and report the ledger wall time |
| span-collecting | none | Codex did not run in this scope — **not** a data-quality problem |

"Not configured" and "did not run" are stated as **two separate facts** when both hold, never
collapsed into one statement that leaves the other unknown.

**Whenever the scope holds `cli=codex` ledger runs, their ledger wall time is reported regardless of
which row applies**, so Codex time is never simply missing. Under coarse ledger-only attribution that
**is** the Codex figure, permanently — which needs no separate machinery, because the `ptp-telemetry` [elapsed-wall-time] rule that
every closed run's window joins the union already covers it, mixed scopes included.

**Absence is reported the same way whether temporary or permanent**: the reason is stated without
implying that Codex rows are *pending*, so a store that will never contain a `cli=codex` span reads
as a valid steady state rather than a gap awaiting a fix.

### 19.4 Wall-time sources, uncovered share, and graph repairs

- **Which sources produced the wall figure** — span intervals, ledger run windows, or both (§17.7).
- **How much of the union came from run time no span covered** — the direct measure of how
  instrumented the scope actually was.
- **The §17.5 diagnostic's repair counts** — dropped edges, duplicate `span_id`s, broken cycles.
  **All three are printed on every report that built the diagnostic, including as `0`.** A count
  that vanishes when it is nil is indistinguishable from a count that was never taken, which is
  exactly the "no data reads as good news" failure this footer exists to prevent — and it is the
  general rule of `ptp-telemetry` [data-quality-footer-obligation] ("not when every item is nil") rather than an exception to it. The **one**
  case where the three counts are replaced rather than printed is the diagnostic being **omitted**
  for want of usable parent links, where the statement of omission takes their place — and says so.

### 19.5 Review-loop flags

- **Overlapping run windows** within a group (§18.4) — flagged as a **retry or concurrent
  invocation**, not renumbered into an invented sequence.
- **A group larger than the currently configured `review.maxIterations`** — flagged as **likely**
  spanning more than one loop invocation, with the numbering marked **approximate**, worded as
  likelihood and never as proof (§18.4).

---

<!-- ptp-telemetry:anchor id=report-write-posture class=leaf owner=report -->
## 20. Write posture, and the two empty cases  *(moved from `ptp-telemetry` by `0044_08`)*

### 20.1 A default `report` writes nothing and deletes only aged raw files

A default `/ptp:telemetry report [selector]` **prints to the session**. It **creates no file and
modifies no existing file**. It runs **no git command, no `ptp-branch-guard`, and no
`openspec validate`** — the same exemption `status` holds (`ptp-telemetry` [status-methodology]).

**The one exception, stated every time the posture is stated:** §21's retention deletes aged files
under the reported epic's `raw/`. That is a **default** effect, not an opt-in one.

**Therefore the phrase "read-only" is never used for `report` — anywhere, in any form.** Not in this
skill, not in `commands/telemetry.md`, not in `commands/telemetry-report.md`, not in the spec,
not in the README, and **not qualified**:
"read-only (except pruning)" is worse than useless, because readers keep the adjective and drop the
parenthesis. The posture is always worded:

> **creates no file, modifies no existing file, and deletes only aged raw files.**

(`status`, by contrast, deletes nothing and **is** read-only. The two commands' postures are
deliberately worded differently because they genuinely differ.)

**`analyze` (`ptp-telemetry` [analyze-methodology]'s *“Posture — creates nothing, modifies nothing, deletes nothing”*) deletes nothing either, so this posture is unchanged and NOT weakened by it.**
`report`'s wording above stands word for word, and **the phrase "read-only" remains forbidden for
`report`** — for the reason restated above: a **default** `report` deletes aged raw files
irreversibly. `analyze`, which creates no file, modifies no existing file, and **deletes nothing**,
may be described as read-only. The two postures are stated separately precisely so a later edit
homogenises neither into the other. **`analyze` is a separate reader, not an exception**
(`ptp-telemetry` [analyze-methodology]'s *“Relationship to `report` — a separate reader, not an exception”*).

### 20.2 The optional `report.md`

Only when the literal `write` keyword is given (§16.2) does `report` write
**`<telemetry.root>/<epic>/report.md`** — **that file and nothing else**, keyed on the **resolved**
epic. Under `epic:all` that is one `report.md` per resolved epic, each in its own epic directory;
figures are still never merged (§16.1). The keyword is stripped before the selector sees the
argument, so the selector grammar is untouched.

**A scope with no epic writes nothing, and says so.** The path is keyed on the resolved epic, so a
**legacy / unprefixed** id (§16.1) — which has no four-digit epic segment and therefore no
`<telemetry.root>/<epic>/` — leaves no path to construct. `report write <legacy-id>` therefore
**writes no file** and **reports that it wrote none**, alongside the same "no telemetry for this
scope" statement §20.3 gives the run anyway. It is **not** an error, and no directory is invented
for it: creating some fallback path would put a report where no store exists and where nothing would
ever look for it. Under `epic:all`, each epic-prefixed scope still writes its own `report.md`; only
the legacy members write nothing.

### 20.3 An empty scope is stated, never zeroed

When the resolved scope holds **no telemetry at all** — no store, no `spans.csv`, no ledger runs —
the report **states that** and stops. It does **not** raise an error, and it does **not** print a
table of zeros: a zero that a reader could mistake for a measurement is exactly the failure mode this
whole layer exists to close. The `ptp-telemetry` [data-quality-footer-obligation] footer still
renders.

The related-but-different case — **spans exist but no ledger run does**, so every record landed in
the store-wide `_unattributed/` — is **not** an empty scope: the body figures are legitimately empty
for this epic and §19.1's store-wide count makes the broken join impossible to miss.

### 20.4 `report` works with collection turned off

When `telemetry.mode` resolves to `off` but a store exists from earlier runs, `report` **reads it and
notes that collection is currently off** — it never refuses. The mode gates **writes** (`ptp-telemetry` [gate-ordering]); it does
not gate reading data that has already been recorded. Retention still applies, because it is a
property of `report` rather than of collection.

---

<!-- ptp-telemetry:anchor id=retention class=leaf owner=report -->
## 21. Retention — the one deletion in the telemetry contract  *(moved from `ptp-telemetry` by `0044_08`)*

`telemetry.retentionDays` (`ptp-telemetry` [config-resolution] — default **30**, same forgiving
reader as the other telemetry keys)
deletes aged files under **the reported epic's `raw/`**, during **`report`** and nowhere else.

**"And nowhere else" is unchanged by `analyze`.** `analyze` (`ptp-telemetry` [analyze-methodology]) reads `raw/` — it is the first
reader of that store outside `export` — and prunes **no** file, so it adds **no second deletion
point** and this section gains **no** exception. **`analyze` is a separate reader, not an exception**
(`ptp-telemetry` [analyze-methodology]'s *“Relationship to `report` — a separate reader, not an exception”*).

### 21.1 The candidate rule, stated exactly

Because the deletion is **irreversible and happens on a default invocation**, the rule is stated
exactly rather than as "older than the window". Vagueness in an irreversible default deletion is not
a documentation gap — it is a data-loss bug waiting to be written. A file under
`<telemetry.root>/<epic>/raw/` is a candidate **only when both** hold:

1. **Its name parses as the receiver's `YYYYMMDD.ndjson` form** (`ptp-telemetry` [receiver-two-appends]). A name that does not parse is
   **never deleted, whatever its modification time** — an unrecognised name means the pruner does not
   know what it is looking at, and deleting on a guess is the one outcome that cannot be undone.
2. **Its parsed date is *strictly earlier* than the cutoff**, where
   `cutoff = today − telemetry.retentionDays`, computed on the **`ptp-telemetry` [receiver-two-appends] calendar-date basis** — the one
   the writer names files by, read from there rather than restated here. Strictly earlier means the
   **boundary day is retained**: a retention of `30` keeps **30 days plus today**, never 29.

**"The file the receiver may be appending to right now is never a candidate" is a *consequence* of
those two rules, not a separate assertion**: today's date is never strictly earlier than the cutoff
for any positive retention value, and the reader guarantees the value is positive.

### 21.2 What is never pruned

- **`runs.ndjson`, `runs.csv`, and `spans.csv` — never.** They are small, and `spans.csv` is the
  shareable artifact.
- **Anything under the store-wide `<telemetry.root>/_unattributed/` — never.** That store belongs to
  **no epic** (`ptp-telemetry` [store-layout], [join-never-drops]); a *per-epic* `report` has no mandate to delete a store shared by every
  epic.
- **Any other epic's `raw/`.** Pruning is scoped to the epic being reported — under `epic:all` (and
  under the empty argument, which §16.1 defines as `epic:all`) that is each reported epic in turn,
  never a single epic standing in for the rest.
- **Nothing narrower than an epic, either.** A **story**-scoped report (§16.1) narrows its *figures*
  to the resolved `change_id` but prunes its **whole epic's** `raw/`: a raw file holds every story's
  records for a day and the raw store is append-only and immutable (`ptp-telemetry` [raw-store-immutability]), so a story-scoped
  deletion would mean rewriting an immutable file. Epic-level pruning is therefore the only
  implementable rule, and it is **stated** rather than left to be discovered, because it is the one
  effect of `report` whose reach exceeds its reported scope.
- **Nothing at all outside `report`.** **No ptp pipeline command triggers pruning** — not `/ptp:apply`,
  not `/ptp:review`, not the fan-out. Deletion happens while **a human is looking at the data**, never
  as an invisible side effect of an unrelated command. **`analyze` is not an exception to this
  bullet — it is covered by it:** it reads `raw/` and prunes nothing, so pruning still happens during
  `report` and nowhere else, and no second deletion point exists
  (`ptp-telemetry` [analyze-methodology]'s *“Posture — creates nothing, modifies nothing, deletes
  nothing”*).

### 21.3 The `export` consequence, stated rather than papered over

Slice 2's `export` is **always a global re-derivation from `raw/`** (`ptp-telemetry-export` [export-scope]). So the **next `export`
after a prune rewrites `spans.csv` without the pruned rows.** Pruning does not merely limit how far
back a rebuild can reach — it removes that history from `spans.csv` at the next `export`.

"`spans.csv` is never pruned" is therefore true of **the pruning step** and **not** of the store's
eventual contents, and that distinction is stated **wherever retention is documented** (this skill,
`skills/ptp-config/SKILL.md`, `commands/config.md`, and the README). Stating only "the CSV is never
pruned" would leave a user with the exact opposite practical expectation, and they would discover the
truth by losing data.

Note the ordering this creates, which is the honest one: because `report` reads the **derived** files
and never `raw/` (§17.4), a prune **cannot change the numbers the same command just printed**, and it
has no effect on any report until the user runs `export`.

### 21.4 A misconfigured value prunes on the default, not on nothing and not on the value

A non-integer, zero, or negative `telemetry.retentionDays` resolves to **30** via the `ptp-telemetry` [config-resolution] forgiving
reader, and pruning then runs **on that 30-day window** — never on the unparseable value, and never
"not at all". The reader **never throws and never STOPs a command**.

---

## Hard rules

- **`concurrency_factor` is never described as a count of agents**, and is stated **undefined**
  rather than printed when elapsed wall time is zero or unavailable or aggregate work time is absent
  — never `0`, never `∞`, never a dash. A value below `1` is reported as-is and never clamped
  (§17.3).
- **`report` reads only the derived files** — `spans.csv` and `runs.ndjson` — and **never `raw/`**;
  `<telemetry.root>/_unattributed/spans.csv` reaches the **footer count alone** and no body figure
  (§17.4).
- **`report` creates no file, modifies no existing file, and deletes only aged raw files** (§20.1),
  and writes `<telemetry.root>/<epic>/report.md` only on the literal `write` keyword, which is
  stripped before the selector sees the argument (§16.2, §20.2). **The phrase "read-only" is never
  used for `report`, not even qualified.**
- **Pruning is `raw/`-only, reported-epic-only, and `report`-only** (§21): never `runs.ndjson`,
  `runs.csv`, or `spans.csv`; never anything under `<telemetry.root>/_unattributed/`; never triggered
  by any pipeline command; and never a file whose name does not parse as `YYYYMMDD.ndjson` or whose
  date is not strictly earlier than the cutoff.
- **`report` is the one and only `/ptp:telemetry` subcommand that resolves a change selector**, and
  it adds **no grammar** — it delegates resolution wholesale to `ptp-change-selector` (§16.1) after
  stripping its own `write` keyword (§16.2). `status`, `analyze`, `setup`, `start`, `stop`, and
  `export` take no selector at all. The rule is stated here, in the owning leaf, rather than at the
  `/ptp:telemetry` front door, which enumerates no subcommand's selector posture.
- **Two front doors, one methodology.** The `/ptp:telemetry` router's `report` arm and
  `commands/telemetry-report.md` both delegate here, and **neither parses the `write` keyword**: the
  strip happens in §16.2, inside this skill, before `ptp-change-selector` sees the argument. Their
  identity is structural rather than an agreement two files maintain.

The banned-subtraction rule, the wall-time-union rule, and the footer-is-mandatory rule are
**substrate-owned and are not restated here**: `` `ptp-telemetry` [banned-subtraction] ``,
`` [elapsed-wall-time] ``, and `` [data-quality-footer-obligation] `` hold them, and this skill cites
their anchors.
