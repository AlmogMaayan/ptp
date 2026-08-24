> Loaded from skills/ptp-telemetry/SKILL.md when: joining ledger runs to received spans.
## 11. The ledger join

### 11.1 The ledger set the join reads

A span carries no epic — the epic is the join's *output* — so the join cannot select its input by
epic. It scans `<telemetry.root>/` and reads **every** `<epic>/runs.ndjson` **plus**
`_unattributed/runs.ndjson` (where the ledger layer records runs with no resolvable epic), pairs open
and close lines by `run_id` per §4, and builds one combined set of `(session_id, t_start, t_end)`
windows, each carrying the epic of the ledger it came from. A run read from `_unattributed/` carries
an empty epic — so a span resolving to it still gains `command`, `phase`, `agent_label`, and `run_id`
and is written under `_unattributed/`.

The parsed set is **cached** and refreshed when a ledger changes. The cache is invalidated by changes
to the **set's membership**, not only to files already in it:

- **Re-scan for ledgers appearing or disappearing**, not merely for edits to known ones. The auto-start
  preamble runs **before** the ledger open, so on the first command of a **new** epic the receiver can
  cache the set before that epic's `runs.ndjson` exists; a per-known-file check could never notice it.
- **Re-scan once before committing any record to `_unattributed/`.** An attribution miss is both the
  signal that the set may be stale and the cheapest possible trigger, because it fires only on the
  miss.

<!-- ptp-telemetry:anchor id=ledger-join-window-rules class=substrate -->
### 11.2 The window rules

For each span, the run whose `session_id` matches and whose window contains the span's `start_ts`
supplies `epic`, `change_id`, `command`, `phase`, `agent_role`, `agent_label`, `cli`, and `run_id`.

A run with an **open line and no close line** is treated as extending to the present, so mid-run
spans attribute immediately rather than waiting for the close.

### 11.3 Grouping — every trace, not only ambiguous spans

**Every record carrying a usable `trace_id` is resolved as part of its group, once**, and every
record in the group gets the same answer. Ambiguity-triggered grouping cannot enforce the never-split
rule in the case that matters most: a trace whose first span sits unambiguously in run A and whose
second sits unambiguously in run B contains no ambiguous span, so the rule would never fire and the
trace would be split — the exact outcome forbidden.

A record with **no usable `trace_id`** — which `/v1/logs` events legitimately lack — forms its **own
singleton group**. Grouping them all under the empty key would fuse unrelated events into an invented
trace.

**The rule, whose step order is itself the rule:**

1. **Narrow** the candidates to the same-session runs whose window contains **every** span in the
   group.
2. **Empty set** → the whole trace goes to `_unattributed/`, with `notes` carrying
   `unattributed:no-containing-window` and `near-miss=<ids>` — defined, not hand-waved: **the
   same-session runs whose window contains at least one span in the group, in ascending lexicographic
   `run_id` order**, joined by `|`. In this branch "the candidates" names a set that is empty by
   construction, so the near-miss set is what a human debugging the miss actually needs, and the fixed
   ordering is what makes a later `export` reproduce the value.
3. **Otherwise** the candidate with the **latest `t_start`** wins — the innermost fully-enclosing
   window — tiebroken by the **lexicographically smallest `run_id`**. More than one candidate also
   records `ambiguous-window` and `candidates=<ids>` in `notes`.

Selecting from windows containing merely the *earliest* span and checking containment afterwards
inverts this and can pick a narrow window holding the first span but not the rest — violating the
never-attribute-outside-the-window invariant in exactly the straddling case the rule exists for.

**A record with no usable `start_ts`** is **excluded from the candidate-narrowing test** and inherits
whatever its group resolves to: it neither constrains nor widens the group. No window contains a
missing timestamp, so without this rule one timestamp-less span would drag its whole trace into
`_unattributed/`. When **every** record in a group lacks one there is nothing to join on: the group
goes to `_unattributed/` with `unattributed:no-usable-timestamp` in `notes`, never attached to a run
on `session_id` alone.

**Scope at ingest is the batch being processed.** A trace can be split across OTLP batches, and the
receiver must not buffer waiting for completion or the CSV goes stale mid-run. Authoritative
whole-trace reconciliation is deferred to `export`, which is global by definition and therefore sees
the entire raw store; a later batch contradicting an ingest-time grouping is corrected by the next
`export`, never by rewriting an appended row.

This is the `[RISK-A]` mitigation for a future concurrent `ptp-full-apply`; today's loop is strictly
sequential, so ambiguity should not arise at all.

<!-- ptp-telemetry:anchor id=join-never-drops class=substrate -->
### 11.4 Never dropped, never guessed

A record matching no window is written under `<telemetry.root>/_unattributed/` with the reason in
`notes`. **No span is ever dropped, and a span with a usable `start_ts` is never attributed to a run
whose window does not contain it.** The realistic causes are a non-ptp prompt in the same session, a
span arriving before its run's **open** line was visible, and a ledger whose trailing line was torn at
the moment of the join. **A merely-still-open run is not one of them** — §11.2 already attributes
those.

The join rules are **identical at ingest and in `export`**, so a re-derivation reproduces the
placement.

---

<!-- ptp-telemetry:anchor id=export-methodology class=substrate -->