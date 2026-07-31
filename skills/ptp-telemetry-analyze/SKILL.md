---
name: ptp-telemetry-analyze
description: Single source of truth for `/ptp:telemetry analyze` — the predefined analysis engine over the ptp raw span store. Owns the engine's flag surface and exit codes, the raw-preferred source selection and its `spans.csv` degradation (under which the bash-by-command output is omitted rather than approximated), the wrapper-exclusion invariant keyed on `tool_name` / `raw_span_name` and never on `tool_class`, the per-leaf nesting-method resolution and the footer that always names the method used, the two permitted arithmetic forms and the still-banned wall-minus-components subtraction, the six outputs, the mandatory data-quality footer, the takes-no-selector and creates-nothing/deletes-nothing posture, and the `/ptp:telemetry analyze` vs `/ptp:analyze` disambiguation. Its one executable copy is `scripts/ptp-telemetry-analyze.js`; changing this skill and changing that script is one change, never two. The store layout, the span record, the OTel-attribute and `tool_class` mapping tables, the ledger join, retention, and the `report` methodology are NOT owned here — they are reached through `skills/ptp-telemetry/SKILL.md`, which owns the shared substrate outright and retains the numbering (and a forwarding stub) for the per-subcommand methodologies that have moved to sibling skills. This skill cites that file and restates none of it.
---

# ptp-telemetry-analyze — the `analyze` contract

## Purpose

This skill is the **single source of truth** for `/ptp:telemetry analyze`. It held the section
number **§23** while it lived in `skills/ptp-telemetry/SKILL.md`, and it **keeps that number here
deliberately**: `scripts/ptp-telemetry-analyze.js` cites `§23.x` on 34 comment lines,
`skills/ptp-telemetry/SKILL.md` cites it in eleven more, and renumbering would invalidate every one
of them while changing nothing a reader needs. Its anchor id in that file's registry,
**`analyze-methodology`**, is carried here unchanged, so a citer that used the anchor rather than
the number resolves here too.

## Citation convention — read this before any `§` reference below

Section references in this file resolve in exactly two ways, and there is no third:

- **`§23.x` is this file.** Every subsection below is `§23.x`.
- **Every other `§N` (N ≤ 22) is `skills/ptp-telemetry/SKILL.md`** — the numbered telemetry file
  that both **owns** the shared substrate (config resolution, the store layout, the ledger and
  span records, the OTel-attribute and `tool_class` mapping tables, the ledger join, the receiver
  lifecycle, the cross-subcommand analysis invariants, and the data-quality footer obligation)
  **and retains the numbering** of the per-subcommand methodologies that have moved to sibling
  skills — `export`, the `report` methodology, retention, and the lifecycle procedures among them.
  Where such a section has itself been relocated, that file keeps a **numbered forwarding stub** at
  its section number, so the citation still resolves in one hop from there. Bare `§N` is therefore
  always a citation into that file, never into a sibling leaf skill, whichever kind of section it
  names.

Nothing in this file is a restatement of a substrate section. Where this file depends on a substrate
rule — notably §17.0's **banned** `wall − Σllm − Σtool` subtraction, §17.1/§17.2's never-conflated
figures, and §19's **mandatory, never-suppressed** data-quality footer — it **cites** that rule and
reproduces none of its content, so a later correction there corrects `analyze` with no second edit.

The bare-`§N` form is used inline throughout the body below rather than `ptp-telemetry`'s LR-3
anchor form, because rewriting all 90 of those citations would be churn through the exact text
whose byte-fidelity this relocation protects. The **anchors are named instead in the *Substrate
dependencies* list immediately below**, once each, so a later substrate edit can still find this
dependent by grepping for an anchor id. Every anchored section this file cites appears there; the
eight it cites that carry **no** registry anchor are `report`- and `export`-owned subsections of
sibling leaves, and keep `§N` under LR-3's third case, which `ptp-telemetry` states explicitly and
closes.

## Substrate dependencies

Required by `ptp-telemetry`'s LR-4. This skill depends on these anchored contracts in
`skills/ptp-telemetry/SKILL.md` and restates none of them:

- `[config-resolution]` (§1) — the layered config resolution the engine's home-directory and
  `telemetry.root` handling depends on.
- `[receiver-artifacts-and-store]` (§9.1) — what the receiver ships and what the store gains.
- `[raw-entry-envelope]` (§9.6) — the raw entry envelope this engine reads.
- `[receiver-two-appends]` (§9.7) — the raw store's append protocol.
- `[span-value-encodings]` (§10.2) — the value encodings the raw records carry.
- `[span-kind-set]` (§10.3) — the closed `span_kind` set.
- `[otel-attribute-mapping]` (§10.4) and `[tool-class-mapping]` (§10.6) — the two mapping tables
  this engine consumes as given and re-derives neither of.
- `[raw-record-superset]` (§10.5) — the raw record's three-field superset over `spans.csv`, which
  is what makes the raw-preferred source selection meaningful.
- `[single-source-mapping-rule]` (§10.7) — the one-executable-copy rule those tables sit under.
- `[ledger-join-window-rules]` (§11.2) — the ledger-join window rules.
- `[banned-subtraction]` (§17.0) — the banned `wall − Σllm − Σtool` form.
- `[aggregate-work-time]` (§17.1) and `[elapsed-wall-time]` (§17.2) — the two never-conflated
  figures.
- `[data-quality-footer-obligation]` (§19) — the mandatory, never-suppressed footer obligation.

It also cites these **leaf** sections, which carry anchors and are reached through the substrate's
numbering (or its forwarding stub) rather than by naming any sibling skill: `[status-methodology]`
(§8), `[report-methodology]` (§16), `[report-headline-numbers]` (§17),
`[report-nested-chain-diagnostic]` (§17.5), `[report-footer-items]` (§19.1), `[retention]` (§21).

Sections this skill cites that carry **no** registry anchor — §12.4, §17.4, §18.2, §19.4,
§20.1–§20.3, §21.2 — are private subsections of the `export` and `report` leaves. They are cited by
number under the convention above, which is LR-3's third case, and resolve through frozen numbering
plus the owning leaf's redirect stub. Their absence from the registry is deliberate, not a gap; see
`design.md` § *Interaction with `0044_01`'s anchor contract*.

## 23. `analyze` — the predefined analysis engine

`analyze` answers *"where did the time actually go — inside subagents versus the main agent, by model,
by tool, by bash command?"* over the **raw** span store, and it answers it with **predefined analysis
code** rather than with a model re-reading and re-aggregating the store on every invocation.

**That the model relays this output instead of re-deriving the parsing and aggregation IS the
requirement, not an optimisation of it.** Hand-derivation costs tokens and wall-clock time on every
single use, and two hand-derivations over the same store are not guaranteed to agree — the exact
reproducibility problem §10.7 exists to prevent for the mapping tables.

§23 owns this methodology **wholly**. Nothing in §16–§21 governs `analyze`, and `analyze` changes no
figure `report` prints (§23.9).

### 23.1 What ships, and why it is a second script

```
node <plugin>/scripts/ptp-telemetry-analyze.js --repo <repo root> [--format=json]
```

- **Dependency-free.** Node standard library only — `fs`, `path`, and `os` (the last for
  `os.homedir()` alone, which the global config layer of §1 needs and which `scripts/ptp-otel-sink.js`
  resolves the same way, as `PTP_HOME_DIR || os.homedir()`). No `package.json`, no install step.
- **Flag surface.** `--repo <path>` — the internal path the skill passes — and `--format=json`. **Every
  other flag, and every positional argument, is refused with exit code `2`**, mirroring the stray-flag
  whitelist `ptp-otel-sink.js` already applies to `export`: an invented or misspelled flag must never
  silently run a different analysis. Both `--format=json` and `--format json` are accepted.
- **Exit codes.** `0` on a rendered report — *including* the empty-store statement, because an empty
  or degraded store is never an error — `2` on an argument refusal, `1` on an unexpected internal error.
- **Windows Git Bash safe.** Every path is built through `path`; nothing is shelled out; no glob is
  expanded by a shell.
- **Line endings and cache healing need no edit.** It inherits `.gitattributes`' `scripts/*.js text
  eol=lf` pin and `skills/ptp-workflow-cache-heal/SKILL.md`'s `scripts/*.js` heal glob — **both already
  match by glob, and neither file is edited.**
- **Memory is proportional to the record count, not constant.** Parsing is line by line, but the
  parsed records are retained for the run: nesting classification is inherently two-pass — every
  wrapper window must exist before any leaf can be tested against it (§23.4) — so a single streaming
  pass cannot produce the split. This section claims no size-independence.

**Why a second script rather than a verb on `scripts/ptp-otel-sink.js`.** §10.7 binds **one**
executable copy of the §10.4 OTel→column table and the §10.6 `tool_class` table, and names the sink as
that copy. `analyze` consumes records those tables have **already** mapped — it reads `span_kind`,
`tool_name`, `tool_class`, `model`, `duration_ms`, `bash_command`, and `raw_span_name` as *given* and
derives none of them — so a second file creates **no** second copy and §10.7's guarantee is left
untouched rather than needing to be re-argued. If a record's `tool_class` is wrong, the fix is `export`
(§10.6's stated re-derivation path), never a second classifier here. The sink is the file every
telemetry change already has to touch; `analyze` is a reader with one job, and keeping it separate is
what lets a future reader hold it in context whole.

The one shared **primitive** — §10.6's segment split and head normalisation, reused by §23.6's
bash-by-command key — is a named, permitted exception and is **not** a re-derivation of `tool_class`:
see §23.6.

### 23.2 Source selection, and the CSV degradation

1. **The raw superset, preferred.** Every `<telemetry.root>/<dir>/raw/*.ndjson` for every directory
   under `<telemetry.root>` — the per-epic stores **and** `_unattributed/`. Each line is a
   `{ ptp_entry_kind, ptp_entry_version, record }` envelope (§9.6); the `record` is taken and the
   envelope discarded. Raw is preferred because `bash_command` and `raw_span_name` exist **only** there
   (§10.5), and they are what §23.6's bash grouping and §23.3's wrapper key depend on.
2. **`spans.csv`, only when step 1 yields no file at all**, parsed RFC-4180 with a leading BOM
   tolerated and a stray duplicate header skipped (§9.7 permits both).
3. **Neither** → the report **states that no telemetry exists and stops** — never a table of zeros
   (§20.3's posture, applied to `analyze`). **The footer still renders.**

**Parsing is total — it never throws.** A line that is empty, is not JSON, or is JSON but not an
object carrying a `record` object is **skipped and counted**, and the **interior** and **trailing**
cases are counted **separately**, because §12.4 draws exactly that line (an unparseable *trailing* line
is skipped; a malformed *interior* line is skipped *and counted*) and one combined tally would not be
comparable with any other reader of the same store. An envelope whose `ptp_entry_kind` is not
`ptp.span_record`, **or whose `ptp_entry_version` is not `1`**, is skipped under a third tally and
**never unwrapped for its `record`**, so a future entry kind sharing the file cannot enter a total
silently. Those two values are pinned exactly rather than called "supported", which is a judgement two
implementations would resolve differently. §12.4 states the **kind** rule and the sink already
implements it on read; the **version** half is `analyze`'s own addition — the sink declares
`ENTRY_VERSION` and writes it but does not test it on read, so no existing check is being credited. A
CSV row whose field count does not match the header is skipped under its **own** tally, never merged
with the raw store's, because the two sources are never read in one run and a shared counter would be
unattributable.

**Under the fallback, output 5 is OMITTED with its reason printed in its place** — never approximated
from a coarser key. **The reason corrects the premise rather than repeating it:** `spans.csv` never
*dropped* the command text; the 26-column schema never carried it, and it is **raw-only by design**
(§10.5). A reader told the field was "lost" would go looking for a regression that never happened.

**The scope consequence, stated rather than left implicit.** Source selection is all-or-nothing: **one
surviving raw file anywhere suppresses the CSV path for the whole store.** Because §21 prunes a
reported **epic's** `raw/` and §21.2 never prunes `spans.csv`, an aged epic directory routinely holds
recent `raw/` *and* older CSV-only history, and an epic whose `raw/` has aged out entirely becomes
invisible. So for a **pruned epic directory** `analyze`'s scope is the **raw-retained window**, not
that epic's whole recorded history.

**The limit of that narrowing, in the same breath.** §21 prunes only the epic a `report` was actually
run for, and §21.2 prunes **nothing** under `<telemetry.root>/_unattributed/`. An unreported epic's
`raw/` and the whole unattributed `raw/` therefore keep their **complete** recorded history. §23.2
**must not** claim, or let a reader infer, that the analysed input — or its size — is retention-bounded
in general.

**The two sources are NOT merged**, and that is a decision: they overlap across the retained window,
the raw record carries no key identifying its projected CSV row, and §17.4 already establishes that the
two intentionally hold different histories. Merging without a deterministic dedup rule would
double-count exactly the window `analyze` is most often run over — a worse failure than a narrowed
scope.

**The footer separates fact from inference.** It always names two lists: every directory holding a
`spans.csv` and **no** `raw/` (a **certain** exclusion — it contributed nothing), and **every**
directory whose `spans.csv` went unread, **including** those that do hold `raw/`. The second is
reported as exactly what it is — *these files were not read* — with **no** inference that records were
omitted, because §9.7 appends the raw entry and the CSV row in the **same step** for every record, so
an unread `spans.csv` may be wholly duplicated by the `raw/` beside it. The second list is named at all
because a directory with recent raw and an older CSV is not CSV-only, so the first list would never
mention it, and that is the case most likely to make a narrowed figure look complete.

**The narrowing statement is conditional, and is made at the strength its evidence supports.** Three
cases, and the footer says which one it is in — never a stronger one:

1. A directory holds a `spans.csv` and **no** `raw/` → a **definite** exclusion; the footer states
   without hedging that the scope is the raw-retained window rather than all recorded history.
2. Otherwise, a directory retention **can** prune — a per-epic directory, never `_unattributed/` — has
   an unread `spans.csv` → the footer says history **may** be narrowed, with the mechanism. *Prunable
   is not pruned*, and §9.7's paired append means an unread CSV may hold nothing its `raw/` lacks;
   `analyze` can observe neither.
3. Otherwise → the footer states that **no** directory's history is known **or able** to be excluded by
   retention.

The narrowing statement is **never** made on the strength of `_unattributed/` alone, which §21.2 never
prunes. Printing a caveat where nothing was narrowed asserts a limitation that did not occur — the same
class of unsupported claim as printing a figure that was never measured, in the opposite direction —
and stating case 2 in case 1's wording is that error one notch quieter.

**"Whole store" means *not epic-scoped*. It has never meant *not retention-bounded*** for a pruned epic
directory. `analyze` is store-wide because it is an instrument-quality view of *how work is
distributed*, not an accounting of *whose epic spent what*: §17.4's exclusion of `_unattributed/` from
`report`'s **body** figures exists because folding unattributed rows into **an epic's** figures would
invent an attribution and count the same rows into every epic at once, and `analyze` has **no per-epic
figure** for either failure to occur in.

### 23.3 The wrapper set, and the exclusion invariant

```
isWrapper(r)  ≡  r.tool_name === 'Agent'
              ∨  r.tool_name === 'Workflow'
              ∨  r.raw_span_name === 'claude_code.subagent_completed'
```

**Every wrapper row is excluded from EVERY leaf total, and wrapper time is reported SEPARATELY**, under
its own label, with a per-key count.

**Why, stated rather than assumed.** An `Agent` span's wall time is **gross**: it measures the whole
contained subagent. Across every measured window in the reference store the sum of the non-wrapper LLM
and tool spans inside a wrapper's own window came to **96–102% of that wrapper's own duration** (ratios
of 1.000, 1.017, 0.960, 0.998, 1.012, 0.969). **The ratio is stated in that direction —
contained-work over wrapper duration — because that is the quantity measured**; inverting it silently
changes the figure. Counting a wrapper alongside its contained leaves therefore roughly **doubles** that
subagent's measured work.

- **`Workflow` is in the set** because `workflows/ptp-full-apply.js` also spawns subagents, so a
  `Workflow` row can be a container by exactly the same mechanism. Observed `Workflow` durations are
  small (4 ms, 6 ms — dispatch only), so including it costs almost nothing and protects the case where
  it does wrap.
- **`claude_code.subagent_completed` is keyed on `raw_span_name`** because those rows carry an **empty
  `tool_name`**; a predicate keyed on `tool_name` alone misses every one of them.

**That disjunct earns its place through the wrapper WINDOW, not the leaf exclusion — state it that way
so a later editor cannot delete it as redundant.** §10.5 retains `raw_span_name` **only** on rows that
mapped to `span_kind = other`, and §10.3 maps `subagent_completed` to `other`, so `isLeaf`'s
`(isLLM ∨ isTool)` clause already excludes every such row and would do so with the disjunct deleted.
What the disjunct governs is the **wrapper interval union** §23.4 tests against, and the wrapper
counts. Removing it changes **no** leaf total and silently disables containment for every background
dispatch.

**The twin is NOT a duplicate of its `Agent` row.** Against a **foreground** dispatch it reproduces the
`Agent` row's window to within **5 ms** — measured start offsets of `−1, 0, 0, +1, 0, 0` ms and end
offsets of `−5, −2, −2, −2, −2, −4` ms across six pairs, so it starts within a millisecond either side
and always ends slightly **before** its `Agent` row. Against a **background** dispatch the `Agent` row
records only the ~3 ms dispatch while the twin carries the subagent's **whole** wall time (measured
pairs of 852,240 ms and 954,530 ms against 3 ms `Agent` rows). The twin is therefore the **only** row
that bounds a background subagent at all. The two offset sets are quoted separately because §23.4's
dilation rule depends on the **start** offset alone.

> **The key is `tool_name` / `raw_span_name` and is NEVER `tool_class`.** §10.6 maps `Agent`,
> `Workflow`, **and `Skill`** to `tool_class = agent`. Keying this exclusion on that bucket would strip
> real `Skill` leaf work out of every total while claiming to remove double counting — a worse error
> than the one being corrected.

**Leaf rows are §17.1's kind sets, unchanged:** LLM is `llm_request` and `api_request`; tools are
`tool`, `tool.execution`, and `tool_result`; a leaf is any non-wrapper row in either set. The reuse is
load-bearing beyond consistency — the store emits **two** rows per tool call, a timed `tool_result` and
a `tool_decision` that maps to `span_kind = other`, and these sets already exclude the latter, which is
what stops `analyze` double-counting every tool call in the other direction.

**Under the CSV fallback** `raw_span_name` does not exist as a column, so the third disjunct cannot
fire and the footer states that the wrapper key ran **degraded**. Two figures then render
**`unavailable`, never `0`** — the `subagent_completed` key count and the uncovered-window count of
§23.4 — because a `0` would assert, from data that cannot establish it, that no such rows existed. The
two rules are complementary rather than an exception to each other: **a count that was taken and came
out zero prints `0`; a count that could not be taken prints `unavailable`, with its reason.** The
wrapper **time and row count are likewise incomplete** and are labelled *known `Agent`/`Workflow`
wrapper rows/time (incomplete — the CSV cannot identify `subagent_completed` rows)* in both output
formats: suppressing the *count* does not license the *sum* built from the same missing rows to be
printed as though complete. The footer additionally states the error's **direction** — the short
background `Agent` interval survives while its long twin does not, so the CSV-fallback split is
**understated on the inside-subagent column**.

**The wrapper set is stated in exactly two places** — this section and
`scripts/ptp-telemetry-analyze.js` — and **changing one is changing the other, in the same change**,
the pattern §10.7 establishes for the mapping tables.

### 23.4 Nesting detection, and naming the method

**Method selection is per leaf, never store-wide.** A leaf is classified by **parent links** when it
carries a non-empty `trace_id` and a `parent_span_id` that resolves to an in-scope span within that
same trace, and by **timestamp containment** otherwise.

**Eligibility is asymmetric, and stated so.** The leaf needs a `trace_id` and a resolvable
`parent_span_id`; it does **not** need a `span_id` of its own, because it never has to be *found* — only
to walk upward. A populated `span_id` is required only of the rows serving as **ancestors**, the
identity targets an edge resolves against (§17.5's `(trace_id, span_id)` rule). Demanding one of the
leaf too would divert otherwise-resolvable leaves to containment and yield a different split from
identical data.

**The walk's three exits are ordered, because unordered they collide:**

1. On reaching a **wrapper** ancestor → **inside by parent links**, and **stop**. A dangling edge or a
   cycle *above* that wrapper is irrelevant: the deciding evidence is already in hand.
2. On reaching a **root** — an ancestor whose own `parent_span_id` is empty — having passed **no**
   wrapper → **main-agent by parent links**, and stop, counted under the parent-links method count. A
   complete wrapper-free chain is direct evidence in the other direction; diverting it to containment
   would discard the better evidence for the worse and could place it inside merely because an
   unrelated concurrent wrapper in the same session spans its `start_ts`.
3. **Fall back to containment only when the walk ends UNRESOLVED** — an edge matching no in-scope span,
   or a cycle. **Never a bare main-agent default.**

**Why not a single store-wide switch.** *"If **any** record has a parent link, use parent links"* flips
the entire store on one linked record, and every leaf without a resolvable chain then falls through to
main-agent, because parent links have no containment fallback — silently moving work out of the
inside-subagent column. A partially-linked future store (a new emitter, or a Claude Code build that
starts populating links mid-file) is exactly the input that rule handles worst, and exactly the input
this preference exists to accommodate.

**Timestamp containment.** For each **`session_id`**, collect every wrapper row carrying **both** a
usable `start_ts` **and** a usable `duration_ms` as the closed interval
`[start_ts, start_ts + duration_ms]`, take the **union** per session, and mark a leaf **inside** when
its `start_ts` falls within that union for **its own** `session_id`.

- **Both fields are required of a wrapper**, and one missing either contributes **no** interval — it is
  **not** folded in as a zero-length one, which would classify a leaf starting at exactly that
  millisecond as inside-subagent on the authority of a wrapper whose extent is unknown. This is live
  input: 10 of the reference store's 20 `Agent` rows are `span_kind = other` dispatch rows with a
  `start_ts` and an **empty** `duration_ms`. Leaf intervals *do* tolerate a missing duration as
  zero-length (§23.5), so the two constructions genuinely differ and are kept apart.
- **The union is taken before the test**, which is what makes a nested or duplicated wrapper — an
  `Agent` row and its near-identical twin — attribute a contained row **once**, not twice.
- **Why per session.** Sessions are concurrent here (9 distinct ids in one raw file); a global union
  would let one session's subagent window swallow another session's main-agent rows.
- **An empty `session_id` is not a partition — it is a missing one.** `''` is a perfectly good object
  key, and pooling on it rebuilds the global union this partitioning exists to avoid, over the rows
  there is least reason to relate. **A wrapper without one contributes to no union; a leaf needing
  containment without one is classified main-agent and counted under its own footer field**, distinct
  from the unclassifiable-by-time count.
- **Why `start_ts` only, and why closed intervals.** §11.2 already resolves a span into a window by
  testing its **`start_ts`** (*"the run whose window **contains** the span's `start_ts`"*), so testing
  the start alone reuses that convention rather than inventing a second one in the same store. §11.2
  does **not** fix whether its endpoints are inclusive, so the **closed** `[start, start + duration]`
  boundary is `analyze`'s own convention, pinned here rather than credited to §11.2.
- **Why `session_id` cannot do the job alone.** Every row inside all six measured wrapper windows
  carried the wrapper's **own** `session_id` — a subagent gets no session id of its own here. It is a
  *partition key* for containment, **never** the classifier.

**Precedence, stated so the two branches cannot contradict each other.** A leaf whose chain resolves is
classified by **that chain regardless of its `start_ts`** — a resolved ancestry is direct evidence and
needs no timestamp to be trusted — and such a leaf is **never** counted as unclassifiable-by-time. A
leaf that **reaches containment** with no usable `start_ts` is classified **main-agent** and counted as
unclassifiable-by-time; it is not dropped (its duration is real leaf work) and not guessed into a
wrapper it may not belong to. **The unclassifiable tally therefore means *leaves that needed a
timestamp and had none*, never *leaves without a timestamp*.**

**A leaf missing BOTH a `session_id` and a usable `start_ts` increments BOTH tallies**, because each
answers its own question and both answers are true of it. **The two are therefore not disjoint and
SHALL NOT be summed** into one "unclassifiable leaves" figure.

**The method actually used is NAMED IN THE FOOTER on every run**, in both output formats:
`parent-links` when every classified leaf used links, `timestamp-containment` when every leaf used
containment, **`hybrid`** when both were used — with the **per-method leaf counts** printed beside it —
and **`not-applicable`**, with both counts `0`, when **no leaf was classified at all**. Reporting
containment on a store with nothing to classify would name a method that never ran and make the footer
false in exactly the degenerate case the mandatory footer exists to keep honest. On the reference store
**0 of 5,265** records carry any of `trace_id`, `span_id`, or `parent_span_id`, so every leaf takes the
containment branch today and the reported method is `timestamp-containment`.

**The two stated limits.**

1. **Concurrent fan-out.** With `parallel.mode` on, sibling wrapper windows overlap, so containment can
   say a row was inside *a* subagent but never *which*. `analyze` therefore reports the **split** and
   never a per-subagent attribution.
2. **Background dispatch — the split's largest known error.** A background `Agent` row records only the
   ~3 ms dispatch, but its twin carries the subagent's **whole** wall time, so the session's wrapper
   union *does* cover that subagent's work. The cost runs the other way: a background subagent is
   concurrent with its parent and shares its `session_id`, so **main-agent** leaves starting inside that
   window are classified **inside-subagent**. **The exposure is delimited by the TWIN's window, not by
   the ~3 ms dispatch** — three orders of magnitude larger — and what the window delimits is the *set of
   leaves that can be misclassified* (containment tests `start_ts` alone). **It does NOT bound the
   misattributed duration**: a leaf starting one millisecond before that window ends carries its
   **whole** `duration_ms` into the inside column however far past the window it runs. On the reference
   store the larger of the two uncovered windows contained **154 leaf rows / ~1.78 × 10⁶ ms** and the
   smaller **132 rows / ~1.69 × 10⁶ ms** — quoted **per window and never added**, since they lie in one
   session and overlap. No leaf work is lost or double-counted; it is the **split** that
   over-attributes to inside.

**The uncovered-window count, defined exactly.** The footer reports the count of **uncovered
`claude_code.subagent_completed` windows**: intervals **not covered** by the union of their **own
session's** `Agent` and `Workflow` intervals, each **dilated by 5 ms at both ends**. **No pairing, no
"twin" matching, and no duration ratio** — all three need thresholds, and concurrent siblings in one
session make pairing ambiguous in exactly the case the count exists to describe. Coverage is a total
function of the rows.

**Why 5 ms, stated as the choice it is.** A foreground twin can start marginally **before** its `Agent`
row (start offsets `−1 … +1` ms, §23.3), so an **undilated** test misreports such a twin as uncovered.
The largest observed need is **1 ms**; `5` is a deliberate **guard band above** it and **not** a value
the data singles out — on the reference store every dilation from 1 ms upward yields the same split, so
the measurement bounds the choice from below without determining it. It is nevertheless pinned to
**exactly 5** rather than described as "small", because the count is reproducible only if two
implementations pick the same number, and **a range in a normative rule is not a rule**. Only the
**start** offset needs the tolerance (a twin ends *before* its `Agent` row in every measured pair), so
the symmetric both-ends form is a simplification, not a necessity. §23 owns this rule precisely so the
skill and the script cannot derive different counts and both look right.

> **The figure is named for what it measures, and is NO bound on background dispatches in either
> direction.** Under concurrent fan-out a genuinely background window can lie wholly inside an
> unrelated sibling's long foreground `Agent` interval in the same session and read as **covered**
> (**under**-count); and a foreground completion whose own `Agent` row is missing or untimed
> contributes **no** wrapper interval at all and so reads as **uncovered** (**over**-count) — and on the
> reference store roughly half the `Agent` rows carry an empty `duration_ms`, so that input is present
> rather than imagined. It SHALL NOT be called a background-dispatch count, a lower bound, an upper
> bound, or a minimum, and **no narrative built on it may say "there were N background subagents"**. An
> exact count would need a pairing identity the records do not carry. The footer states that it is an
> **imprecise signal that can both over- and under-count**.

**Clock skew is not a live risk in the configuration ptp creates — a scoped assumption, not a proof.**
§10.4's timestamp rule maps the **source's** timestamps and fixes no clock domain, so it must not be
cited for one; §9.1's loopback binding (`127.0.0.1` only, never `0.0.0.0`) constrains who can *reach*
the receiver but does not rule out a tunnel or relay forwarding a remote emitter's records. Every
emitter ptp itself starts runs on the machine running the receiver, so one clock produces every
timestamp compared in practice; a relayed remote emitter is outside what ptp configures, is explicitly
**not** defended against, and would degrade containment silently.

### 23.5 The arithmetic — permitted forms and the ban that still holds

| Figure | Definition | Note |
|---|---|---|
| **total busy** | Σ `duration_ms` over leaf rows | A *sum*. Overlaps are counted more than once — that is what makes it "busy", not "elapsed". |
| **union-of-intervals** | covered extent of the union of every leaf interval `[start, start + duration]` | Disjoint by construction; covers the **timestamped** rows, not "the work". |
| **wall window** | `max(end) − min(start)` over leaf intervals | The observation window, gaps included. |

**Three figures, three separate labels, never conflated** and never printed as a single unlabelled
"time" — the discipline §17 imposes on `report`'s two headline numbers, extended by one.

**LLM↔tools overlap is an INTERSECTION:**

```
overlap = covered extent of ( union(LLM intervals) ∩ union(tool intervals) )
```

**It is never `Σllm + Σtool − union`, and the reason is stated accurately.** That alternative is *not*
§17.0's banned `wall − Σllm − Σtool` under another name, and it *cannot* go negative — a union can
never cover more than the durations it was built from. Claiming either would itself be a confidently
wrong statement in the section whose purpose is to prevent them. It is rejected because it measures
**all** overlap, **within-kind included**: two LLM spans overlapping each other, or two parallel tool
calls overlapping each other, inflate it exactly as much as an LLM span overlapping a tool span — and
§17.0's own list of causes says within-kind overlap is the common case, not the exotic one. It would
therefore be labelled *LLM-versus-tools* while largely measuring something else. Intersecting the two
unions measures the named quantity exactly, because each union has already absorbed its own within-kind
overlap.

**`idle = wall window − union-of-intervals` is PERMITTED and well defined.** The subtrahend is a union
**coverage**, disjoint by construction, so `idle` is a genuine measure of uncovered time within a known
window and cannot go negative. **What §17.0 bans is subtracting overlapping COMPONENT SUMS from wall
time** — the distinction is *what is subtracted*, not that a subtraction appears.

> **`wall − Σllm − Σtool` remains banned and appears nowhere in `analyze`.**

**Every interval-derived figure is reported ABSENT, never `0`, when no usable interval exists.** A
store can hold leaf rows with a real `duration_ms` and no usable `start_ts`: *total busy* is then a
genuine measurement while *union-of-intervals*, *wall window*, *overlap*, and *idle* have no defined
value at all — first start and last end over an empty set are **undefined, not zero** — and `idle` is
additionally absent whenever either operand is. Rendering any of them as `0` would turn a known unknown
into a measurement, which is §17.1's own rule (*"reported as **absent**, not as `0`"*) applied to the
four figures that depend on intervals. **Total busy is therefore not always decomposable into the
interval figures**, and the renderer never implies it is.

**A mean divides by the count of rows carrying a usable duration, never by the row count.** Both counts
are printed and the mean renders **absent** when no row in the bucket is timed. Dividing by every row
spreads the sum across rows that contributed nothing — *"empty is zero"* (§10.2) arriving in the figure
where it is hardest to spot.

### 23.6 The six outputs

All six render in **one** invocation.

1. **Leaf-work split.** LLM versus tool row counts and Σ`duration_ms`, plus §23.5's three labelled
   figures, the intersection-derived overlap, and `idle`. **Wrapper time is printed beside it as its own
   line, labelled *excluded from every figure above*, with the per-key counts.**
2. **Inside-subagent versus main-agent.** Total leaf time, LLM time, and tool time per column, then two
   sub-tables under the same split: per `tool_name` and per `model`. **Each sub-table covers EVERY leaf
   row in its column, not only the rows carrying its key** — an LLM row has no `tool_name` and a tool
   row has no `model`, and both bucket under an explicit `(none)`, **never merged elsewhere**. That is
   what makes the invariant hold: **each sub-table sums exactly to its column's total**, so a reader
   never sees a breakdown that quietly totals less than the headline it decomposes (§18.2's principle).
   Restricting `byTool` to tool rows makes the invariant arithmetically impossible.
3. **Token burn by model.** Per `model`: rows, Σ`input_tokens`, Σ`output_tokens`, and Σ`cost_usd`
   **where populated**. §10.2 leaves those fields **empty, not zero**, off LLM rows, and §10.4's
   advisory A-3 records that Codex LLM rows carry **no** cost at all — so the cost column reports
   **absent** for a model whose rows carry none, never `0`, which a reader would read as free. **The
   same rule governs the two token columns**, because all three are summed *where populated*: a model
   **none** of whose rows carry an input (or output) count reports that column **absent** too, never
   `0`, which would assert a consumption the store never measured. A column with at least one populated
   row still prints its sum, so a genuine zero remains printable.
4. **Tool work by `tool_name`.** Rows, timed rows, Σ`duration_ms`, and the mean (§23.5's denominator
   rule). Wrapper rows are absent by construction, which is why `Agent` and `Workflow` do not appear
   here and **`Skill` does**.
5. **Bash-by-command.** Leaf rows with `tool_name = 'Bash'`, grouped on the **leading segment head** of
   `bash_command.text`, derived with §10.6's rule and **not** with a plain whitespace split:
   1. split the retained text on `&&`, `||`, `|`, `;` — §10.6's segment separators;
   2. take the **first token of each segment**, strip any directory prefix and a trailing
      `.exe` / `.cmd` / `.bat` / `.ps1`, and lowercase — §10.6's head normalisation, unchanged;
   3. the key is the **first head that is not a navigation no-op** (`cd`, `pushd`, `popd`) **and that
      can name a command at all** (see the fabrication rule below); if every such head is a navigation
      no-op, the key is the first of them.

   **Why not token 0 of the whole string.** §10.6 splits on the separators *before* taking a head for
   exactly this reason — it is what "makes `cd repo && npm test` a `build_test` row rather than a `cd`
   row", in §10.6's own words. On the reference store **163 of the 303** Bash leaf rows carrying command
   text begin with `cd` — **53.8% of those rows** and, because the compound commands are the
   long-running ones, **93.6% of their total duration**. A token-0 key would file almost all Bash *time*
   under one `cd` bucket that describes none of it.

   **This is still not a re-derivation of `tool_class`.** §10.6 examines **every** segment head and
   resolves a row to one of seven ordered *buckets*; this output takes **one** head and reports it
   verbatim as a *command name*. Only the tokenisation and normalisation are shared, which is what makes
   the two agree on what a command's name is. **The navigation no-op set lives in exactly the same two
   places as the wrapper set — this section and the script — and changing one is changing the other.**

   **Truncation (§10.5 cuts the retained text at 512 characters).** **A row flagged truncated discards
   its final segment** — the only one the cut can have left partial — and derives its key from the
   complete segments before it, because a partial head would otherwise be reported as a **fabricated**
   command name such as `gi`: a plausible-looking value with nothing behind it, worse than any honest
   degradation. **If no complete non-navigation head remains, the row buckets under an explicit
   `(truncated command)`** — never under a fragment. **A single-segment truncated row is not an
   exception**: its only segment is also its final one, so it is discarded and the row buckets
   `(truncated command)`. **Nothing bounds a command's first token to 512 characters**, so no rule here
   relies on the first head surviving; falling back to a surviving **navigation** head is reserved for
   **untruncated** commands whose heads are all navigation no-ops. Only the retained text is ever
   classified — never a reconstruction — for §10.5's own reason.

   **A head that cannot name a command is never reported as one.** Truncation is not the only way a
   segment head turns out to be a fabrication, so the same rule that discards a partial final segment
   governs the other two ways, both observed on the live store:

   - **A shell assignment** (`NAME=value`). `SP="C:/…/scratchpad" && node "$SP/snap.js"` filed rows
     under `scratchpad"`, and `D=openspec/changes/0039_01_… && grep …` filed rows under
     `0039_01_telemetry-analyze-engine` — a directory and a change id reported as commands, while the
     real `node` / `grep` / `sed` work went uncounted.
   - **A head with no command-name shape** — `{` (shell grouping), a quote fragment such as `b"`,
     regex text. These arise because §10.6's separator split is **quote-blind**, so a `|` or `;` inside
     a quoted argument yields a phantom segment whose head is argument text.

   Such a segment supplies **no** candidate and the search continues to the next head. **Where no
   candidate survives at all, the row buckets under an explicit `(no command name)`** — never under a
   head that names nothing, and never under `(no command text)`, which would deny that text existed.
   §10.6's tokenisation and normalisation are used **unchanged**: this decides only which of the
   identical heads may be *reported* as a name, exactly as the navigation-no-op and truncated-segment
   rules already do, which is what keeps §10.7 untouched. §10.6 feeds every head into a fixed
   seven-bucket vocabulary, where a nonsense head matches nothing and falls to `other`; this output
   prints the head **verbatim**, so the same head becomes a fabricated command name.

   **The stated limit this leaves.** A phantom segment whose head happens to have a legitimate name
   shape is indistinguishable from a real command — `grep -rn "Critical/High\|Critical or High"`
   yields a head `critical`, and it is reported. Reaching that case means making the **split**
   quote-aware, which is exactly the divergence from the shared primitive this section forbids: output
   5 and `tool_class` would then disagree about the same row. So every head that *cannot* be a name is
   suppressed, and the residual is disclosed in the footer rather than silently narrowed away.

   **An empty or absent `bash_command`** (the row predates the field, or `OTEL_LOG_TOOL_DETAILS` was
   unset — §10.4 gates the whole attribute) groups under an explicit `(no command text)`. It is never
   dropped and never guessed.

   **Under the `spans.csv` fallback the whole table is OMITTED** with §23.2's stated reason in its
   place.
6. **The data-quality footer** — §23.7.

### 23.7 The data-quality footer

**Mandatory, never suppressed** — not on an empty store, not on a clean one, not when every item is
nil — and present in **both** output formats, so a machine consumer cannot lose a caveat the text
renderer prints. **Every count is printed including when it is `0`:** a count that vanishes when nil is
indistinguishable from a count that was never taken (§19.4's principle, applied to `analyze`'s own
footer).

The items:

| Item | Why it is not optional |
|---|---|
| The source used and the files **read** — plus, listed separately, any selected file that could **not be opened**, and any directory that **exists and could not be enumerated** | Two different inputs give two different bash tables, so a reader must know which ran; and an unreadable file's whole contents are missing from every figure, which is invisible loss unless it is named. `filesRead` is a claim about what was actually read, so a file that failed to open is never listed there. **Absent and unreadable are different answers**: an unenumerable directory's contents were never observed, so it is never reported as a directory with no `raw/` (which would make the scope statement a **DEFINITE** exclusion on an unobserved premise), and it suppresses the "no telemetry exists" statement in favour of an explicit unknown — a claim about contents is only made where the contents were observable. |
| Records parsed; **interior** lines skipped; **torn trailing** lines skipped; envelopes skipped for an unrecognised kind or version; malformed CSV rows skipped — four separate tallies, never one combined `skipped` | Silently skipped input is invisible loss, and §12.4 distinguishes the interior and trailing cases. |
| Under the raw source: directories holding a `spans.csv` and **no** `raw/`; **every** directory whose `spans.csv` went unread, as a **fact** carrying no inference; and §23.2's conditional narrowing statement at the strength its evidence supports | Retention makes this the steady state of an aged epic directory, not a corner case — while `_unattributed/` is never pruned, so an unread CSV there cannot be a retention artifact. |
| **The nesting method actually used** — `parent-links`, `timestamp-containment`, `hybrid`, or `not-applicable` — with the **leaf count classified by each**, and the two limits of §23.4 | The whole split means something different under each method, and a `hybrid` run describes two populations at once. |
| **Which interval-derived figures rendered absent**, and why | An absent union or wall window is a very different claim from a zero one. |
| The **wrapper set applied**, its **per-key counts**, the wrappers' separately reported time and row count, and the statement that wrapper rows are excluded from every leaf total | An unexpected `0` for a key is how a future wrapper-shaped tool outside the set gets noticed. |
| The **wrapper bimodality note** — an `Agent` row is bimodal (foreground ≈ gross subagent wall, background ≈ the ~3 ms dispatch), while a `subagent_completed` twin carries the whole subagent in **both** modes | Stops anyone summing wrapper durations into a "subagent time" figure, and stops the twin being read as a duplicate. |
| The count of **uncovered `subagent_completed` windows**, derived by §23.4's exact rule, with the statement that it can both over- and under-count and bounds background dispatches in **neither** direction, and the note that main-agent work concurrent with one is classified inside-subagent | This is the split's largest known error; an unstated count leaves a reader unable to tell a clean split from a heavily background-dispatched one, and a count *named* as a background tally would assert the quantity §23.4 shows it is not. |
| Leaf rows excluded from sums for an empty `duration_ms`; leaf rows excluded from intervals for an empty `start_ts`; leaves unclassifiable **by time**; leaves unclassifiable **for want of a `session_id`** — counted separately and never summed | **Empty is never zero** (§10.2); each exclusion is a known unknown, and the two unclassifiable tallies are different questions. |
| Whether output 5 was omitted, and why | Otherwise its absence reads as "no Bash work happened". |
| The counts of Bash rows keyed on a **navigation** head, keyed **`(truncated command)`**, keyed **`(no command text)`**, and keyed **`(no command name)`** — the last with §23.6's stated quote-blind-split limit — plus the **total truncated-row count** | These are the ways output 5's key degrades; a rising count is the signal that the grouping has stopped describing the work, and the truncated and no-command-name totals are what make the fabrication-suppression rules auditable. |
| Under the CSV fallback: the degraded wrapper key, the `subagent_completed` count and the uncovered-window count as **`unavailable`** (never `0`), the incompleteness label on wrapper time and rows, and the note that the inside-subagent column is **understated** | A `0` is a claim the data cannot support, and a reader told only "degraded" would assume the error is neutral when it has a known direction. |
| Date range and session count covered | Scope of the claim. |
| *"analyze created no file, modified no existing file, and deleted nothing"* | The posture, restated where the user is looking. |
| *"analyze is a separate reader from `report`; it does not change any figure `report` prints"* | Prevents a reader reconciling two commands' numbers that were never meant to match. |

### 23.8 Posture — creates nothing, modifies nothing, deletes nothing

`analyze` **creates no file, modifies no existing file, and deletes nothing.** Three clauses, always
together. It runs **no git command, no `ptp-branch-guard`, and no `openspec validate`** — the same
exemption §8 gives `status` and §20.1 gives `report`.

**It prunes nothing.** §21's *"during `report` and nowhere else"* gains **no** exception, and `analyze`
adds **no second deletion point** anywhere in this skill, even though it is the first reader of `raw/`
outside `export`.

**Unlike `report`, `analyze` genuinely IS read-only, and this section may say so.** The reason `report`
may never use that word (§20.1) is that a **default** `report` deletes data irreversibly — which
`analyze` never does. The contrast is stated explicitly so the two postures are not homogenised by a
later editor in either direction.

### 23.9 Relationship to `report` — a separate reader, not an exception

`report` and `analyze` are **separate readers with separate inputs and separate postures**.

- `analyze` changes **no** figure `report` prints, and prints no figure `report` also prints. The two
  commands share **no number that could disagree**.
- §17.4's never-`raw/` rule is **`report`'s**, and its stated reason — pruning bounds `raw/` immediately
  while `spans.csv` catches up only at the next `export`, so a reader that mixed them would describe a
  different past depending on when it ran — is **unaffected**, precisely because the two share no figure.
- §17.4 and §19.1 exclude `_unattributed/` from `report`'s **epic-scoped body figures**; `analyze` has
  **no per-epic figure**, so the failure that rule prevents cannot occur there.
- §20.1's posture wording and §21's single deletion point are **unchanged and not weakened** (§23.8).

So `analyze` is **a separate reader, not an exception** — and every cross-reference in §16–§21 says so
in those words.

### 23.10 Dispatch and selector posture

`analyze` is the **seventh** `/ptp:telemetry` subcommand (`commands/telemetry.md`), dispatched by
name exactly as `status`, `report`, `setup`, `start`, `stop`, and `export` are, and it has a
direct front door of its own in `commands/telemetry-analyze.md` (`/ptp:telemetry-analyze`). **The
two front doors are one subcommand**: a direct command file is not an eighth subcommand, and the
router's count stays **seven**. It is **not** a mode
of `report`, and the reason is three structural divergences from `report`'s own stated invariants —
each of which a mode would have to break:

1. **Inputs.** `analyze` reads the **raw** store, because the bash-by-command table needs
   `bash_command`, one of §10.5's exactly three **raw-only** fields, which deliberately has **no CSV
   column**. §17.4 forbids `report` from **ever** reading `raw/`, and says why it is a rule rather
   than a preference: pruning bounds `raw/` immediately while `spans.csv` only catches up at the next
   `export`, so a reader mixing them would report a different past depending on when it ran.
2. **Blast radius.** `analyze` deletes nothing. A **default** `report` prunes the reported epic's
   `raw/` irreversibly (§21) — which is precisely why §20.1 forbids ever calling `report` read-only,
   even qualified.
3. **Scope.** `analyze` is store-wide over the raw store, `_unattributed`
   **included**. `report` is per-epic — its store path is keyed on the resolved epic — and §17.4 bars
   every `_unattributed` record from every body figure. A `report` mode obeying `report`'s scoping
   rule would render empty tables against a store whose rows are entirely `_unattributed`, which is
   the observed state of a store where the ledger join has not attributed anything.

**A shared executable core is not available**, and that is a fact about `report` rather than a choice
made here: `report` has **no executable implementation at all** — §§16–21 are model-executed prose,
and `scripts/ptp-otel-sink.js` implements the receiver, `export`, `setup`, and the lifecycle but no
reporting. The sharing is therefore at the **invariant** level, and it is **BY REFERENCE**: `analyze`
inherits **never conflate work time with elapsed time** (§17.1, §17.2), the **BANNED**
`wall − Σllm − Σtool` subtraction (§17.0), and the **mandatory, never-suppressed** data-quality
footer (§19) **by citing them, and restates none of them.** A later correction to any of the three
therefore corrects `analyze` with no second edit — the same single-source posture
`skills/ptp-telemetry/SKILL.md` already holds for the record shape, the `run_id` rule, and the
mapping tables.

**SELECTOR POSTURE — `analyze` takes no selector of any kind.**

- **No selector grammar**: no `epic:` form, no `story:` form, no bare change id, no new prefix, no
  new token. It adds nothing to any grammar and reserves nothing.
- **Store-wide over the raw store, `_unattributed` included.** This is the deliberate inverse of
  §17.4's rule for `report`, and it is scoped to `analyze` **alone**: §17.4 is **unchanged**, and no
  `_unattributed` record reaches any `report` body figure as a consequence of this section.
- **Any narrowing would be an explicit non-selector flag, and §23.1 defines none today.** §23.1 pins
  the engine's whole flag surface and refuses everything outside it — that list is stated there and
  is not copied here — so there is **no** day or session flag to invoke yet. Were one added it would
  be the engine's own flag, never change-selector grammar: narrowing by day or session
  narrows by *when the work happened*, not by *which change it belonged to*, which is exactly why the
  change selector has nothing to resolve here.
- **Explicitly NOT delegated to `ptp-change-selector`.** Nothing from an `analyze` invocation ever
  reaches that skill. An argument that is not one of the engine's explicit non-selector flags is
  reported as unsupported **without writing anything** — never guessed at, and never resolved as a
  selector.

The consequence, stated because it is the property this posture exists to preserve: **`report`
remains the one and only `/ptp:telemetry` subcommand that resolves a change selector.**
`skills/ptp-change-selector/SKILL.md` §Role B already records that the other `/ptp:telemetry`
subcommands take no selector, and that sentence stays **true and unedited** with a seventh
non-selector subcommand — this change edits that skill **not at all**.

**Write posture, worded against `report`'s deliberately:**

| Subcommand | Posture |
|---|---|
| `status` | **read-only** — deletes nothing (§8) |
| `report` | **creates no file, modifies no existing file, and deletes only aged raw files** (§20.1) |
| `analyze` | **creates no file, modifies no existing file, and deletes nothing** |

`analyze` reuses `report`'s first two clauses and **contrasts on the third**, the same way §20.1
already words `status` differently from `report` because the two genuinely differ. `analyze` **may**
be called read-only; `report` may not, not even qualified. `analyze` triggers **no** retention pass:
§21's pruning remains `report`-only, and a seventh subcommand does not become a second deletion site.

**No `write` keyword and no `analyze.md` — deferred, with the reason.** `report write` writes
`<telemetry.root>/<epic>/report.md`, a path **keyed on the resolved epic** (§20.2). `analyze`
resolves no epic, so there is no such path to key on, and every candidate
(`<telemetry.root>/analyze.md`, an `_unattributed/` file, a per-day file) is an invention that has
not been chosen. Until it is, `analyze` prints to the session and writes nowhere. This is a
**deferral with a stated reason**, not an omission.

**The name collision with `/ptp:analyze`, stated so the two are never conflated.** `/ptp:analyze` is
the read-only *investigation* command that writes an analysis doc into a change folder, specced by
the **`analyze`** capability. `/ptp:telemetry analyze` renders a telemetry work breakdown and is
specced by the **`telemetry`** capability. They collide by name and nothing else — not a front
door, not an input, not an output, not a capability.

---

## Hard rules

- **`analyze`'s wrapper-exclusion invariant** (§23.3): a wrapper is a row whose `tool_name` is `Agent`
  or `Workflow`, **or** whose `raw_span_name` is `claude_code.subagent_completed`. Wrapper rows are
  excluded from **every** leaf total and reported separately with per-key counts. **The key is
  `tool_name` / `raw_span_name` and is NEVER `tool_class`** — `tool_class=agent` also holds `Skill`,
  which is not a wrapper. The set lives in §23.3 and `scripts/ptp-telemetry-analyze.js`, changed
  together.
- **`analyze`'s footer names the nesting method actually used** (§23.4) — `parent-links`,
  `timestamp-containment`, `hybrid`, or `not-applicable` — with the per-method leaf counts, on every
  run and in both output formats. The preference is resolved **per leaf, never store-wide**.
- **`analyze`'s two permitted arithmetic forms, and the one still banned** (§23.5): LLM↔tools overlap
  is `union(llm) ∩ union(tool)` by **intersection**, and `idle = wall window − union-of-intervals` is
  permitted because the subtrahend is a disjoint union coverage. **`wall − Σllm − Σtool` remains
  banned and appears nowhere.** *Total busy*, *union-of-intervals*, and *wall window* are three
  separately labelled figures, and every interval-derived figure is **absent, never `0`**, when no
  usable interval exists.
- **`analyze` prefers the `raw/` superset and degrades honestly** (§23.2): `spans.csv` is a fallback
  only when no raw file exists, the two are **never merged**, and on the fallback the bash-by-command
  output is **OMITTED with its reason stated** rather than approximated.
- **`analyze` creates no file, modifies no existing file, and deletes nothing** (§23.8) — it prunes
  nothing, adds no second deletion point, and is the one command in this skill that genuinely **is**
  read-only.
- **`analyze` is dispatched by name as the seventh `/ptp:telemetry` subcommand, not as a `report`
  mode** (§23.10). It **analyses** `raw/` — the only subcommand that does, `export` being the global
  re-derivation that also *reads* it — so §17.4's bar on `report` reading `raw/` is unchanged. It
  writes no `analyze.md` and reserves no `write` keyword; its deletes-nothing posture is stated once,
  in the §23.8 bullet above, and is deliberately not repeated here.
- **`analyze` takes no selector and resolves none.** Store-wide over the raw store, `_unattributed`
  included, narrowed by no flag §23.1 defines today, and never delegated to
  `ptp-change-selector` — so **`report` remains the only `/ptp:telemetry` subcommand that resolves a
  change selector.** `analyze` inherits §17.0's banned subtraction, §17.1/§17.2's never-conflated
  figures, and §19's mandatory footer **by reference** and restates none of them.
- **The methodology lives here, and its one executable copy is
  `scripts/ptp-telemetry-analyze.js`** — changing one is changing the other, in the same change.
  `skills/ptp-telemetry/SKILL.md` keeps a numbered §23 forwarding stub and restates **nothing** of
  this contract; `commands/telemetry.md` and `commands/telemetry-analyze.md` are dispatch entries
  that restate nothing either. Four files name `analyze`; exactly **two** define it.
