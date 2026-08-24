> Loaded from skills/ptp-telemetry/SKILL.md when: computing the report headline numbers.
## 17. The two headline numbers, and the subtraction that is banned

<!-- ptp-telemetry:anchor id=banned-subtraction class=substrate -->
### 17.0 BANNED INVARIANT — no field is ever `wall − llm − tool`

**No output field of `report` may be computed by subtracting component sums from wall time.** In
particular an "other time" figure computed as `wall − Σllm − Σtool` **does not exist** anywhere in the
report, and this is a **stated rule** rather than something merely not done.

The reason is that the quantities are **not disjoint**:

- parallel tool calls within one agent overlap in time;
- `workflows/ptp-full-apply.js` runs several agents whose spans overlap across traces;
- an LLM span and a tool span overlap when a tool result streams back during generation.

So `Σllm + Σtool` routinely **exceeds** elapsed wall time and the "remainder" goes **negative**. A
negative *other time* is not a poor estimate of anything — it is **undefined**, and no caveat rescues
an undefined quantity. `concurrency_factor` (§17.3) expresses the same intuition — how much overlap
there was — as a well-defined ratio.

<!-- ptp-telemetry:anchor id=aggregate-work-time class=substrate -->
### 17.1 Aggregate work time

```
aggregate work time = Σ duration_ms over LLM spans + Σ duration_ms over tool spans
```

Grouped by `span_kind` so **no row is counted under two kinds**: LLM rows are the `span_kind` values
`llm_request` and `api_request`; tool rows are `tool`, `tool.execution`, and `tool_result`. A row
whose `duration_ms` is empty contributes nothing — an empty duration is **never** read as zero, and
an **unclosed run's own window** is excluded (§19.2).

**What "unclosed runs are excluded" does *not* mean.** It excludes the **run's** window from §17.2's
union and the run from every run-level duration figure — it does **not** discard the **spans**
attributed to that run. A span is a complete record carrying its own `start_ts` and `duration_ms`;
the work it measures happened whether or not the run that contained it has been closed yet. Dropping
those spans would silently understate every figure in exactly the situation that is most normal —
`spans.csv` is current **mid-run** (§9.7), so a report run while ptp is working sees open runs by
design, not by failure.

**With no LLM and no tool span in scope, aggregate work time is reported as *absent*, not as `0`.**
The distinction is load-bearing: a ledger-only scope (runs recorded, spans never collected) measured
no work, which is not the same claim as "the work took no time", and §17.3 turns an absent numerator
into an undefined ratio rather than a `0×` that reads like a measurement.

<!-- ptp-telemetry:anchor id=elapsed-wall-time class=substrate -->
### 17.2 Elapsed wall time — a union, never a sum, and never a critical path

```
elapsed wall time = total covered extent of the union of TWO interval sets taken together:
                    (a) every in-scope span's [start_ts, start_ts + duration_ms]
                    (b) the process window [t_start, t_end] of EVERY closed in-scope ledger run
```

That is the whole algorithm. Consequences that follow from it being a **union**:

- an enclosing parent span and its nested child are counted **once**;
- a ledger run whose spans cover its window adds **nothing**;
- a run only **partly** covered contributes **exactly its uncovered remainder**.

**Every closed run contributes unconditionally — not only the span-less ones.** Nothing guarantees a
run's spans cover its window: collection can start late, stop early, or drop spans mid-run, all of
which this skill already treats as expected rather than exceptional. Under a "span-less runs only"
rule that uncovered time would vanish from the denominator, understating elapsed time and **inflating
`concurrency_factor`** — the banned subtraction's failure mode, arrived at politely. A run's window is
legitimately elapsed time even where no span covers it: the process was alive for it. The
coarse-Codex case (Claude spans beside `cli=codex` runs that never emit a span) then falls out of the
general rule instead of needing one of its own, and a scope with runs and no spans at all is simply
its degenerate case.

**Rows that carry no interval contribute none.** §10.2 writes `duration_ms` **empty — never a
fabricated zero** — whenever the source had no usable duration, and writes `start_ts` / `end_ts` /
`duration_ms` all empty with `missing-timestamp` in `notes` when it had no usable timestamp at all.
So, exactly:

- a row with an **empty `start_ts`** contributes **no interval** — it has no position on the
  timeline, and placing it anywhere would invent one;
- a row with a start but an **empty `duration_ms`** contributes the **zero-length** interval
  `[start_ts, start_ts]` — it is an instantaneous event (§10.4's rule 2), which adds nothing to a
  union but is not an error either. An empty duration is **never** read as an unknown extent to be
  guessed at.

**A zero-length interval is not a contributing source.** §17.7 names span intervals as a source of
the wall figure only when the span intervals contribute **positive covered extent**. A scope holding
nothing but instantaneous span rows beside real ledger windows therefore reports **ledger run
windows** as the source — reporting "span intervals" there would claim an instrumentation the scope
does not have, and the uncovered-run share would read as though spans had covered something.

Both cases are stated because "empty" is not "zero" anywhere else in this skill either, and an
implementation that arithmetically added an empty duration would produce a wall figure of `NaN` from
input this store treats as ordinary.

**The figure consults no parent graph.** It never reads `trace_id`, `span_id`, or `parent_span_id`,
so it is **unaffected** by duplicate `span_id` values, `parent_span_id` cycles, and parent links
matching no in-scope span. It is order-independent and deterministic from the rows alone.

**Why it is not called a critical path — and never may be.** The obvious alternative was to walk the
`parent_span_id` forest, take the longest dependent chain per trace, and union those. It is not well
defined on this data:

- *"Longest" is ambiguous when a root encloses everything below it* — every chain through that root
  has the same interval-union extent, so the headline would depend on a tie-break rather than on the
  work.
- *The rows carry containment, not dependency.* `parent_span_id` says a span happened **inside**
  another, not that it had to **wait for** a sibling. Two siblings that ran in sequence by necessity
  are indistinguishable from two that merely did not overlap. A critical path is defined over
  dependency edges; this store has none.
- *Unioning a per-trace longest chain across traces is not a global longest path anyway* — it is
  interval coverage, which the union of all spans already computes directly.
- *Malformed input* makes a forest walk undefined; an interval union is immune to all of it.

Calling interval coverage a "critical path" would credit the figure with a dependency analysis the
data cannot support — the same class of error as §17.0's subtraction, with a more respectable name.

`§17.3`–`§17.7` moved to **`skills/ptp-telemetry-report/SKILL.md`** under those same numbers, taking the anchor ids `report-concurrency-factor` and `report-nested-chain-diagnostic` with them; `§17.0`–`§17.2` above are substrate and stay here.

<!-- ptp-telemetry:anchor id=report-breakdowns-stub class=substrate -->