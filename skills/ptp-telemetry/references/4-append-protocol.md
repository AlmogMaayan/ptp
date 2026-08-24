> Loaded from skills/ptp-telemetry/SKILL.md when: appending a line to the run ledger.
## 4. Append protocol

A run is recorded as **two appended lines sharing one `run_id`**:

1. an **open** line, written **before the observed work begins**, with `t_end` and `outcome` **empty**;
2. a **close** line, written after the work ends, with **both populated**.

**Every write is a single append of one complete line.** No writer ever reads the ledger before
writing to it, and no writer ever modifies or rewrites an existing line.

**Why two lines rather than one.** A run that never closes — a killed session, a crashed agent, an
interrupted `/ptp:apply` — must still leave a trace, and the sessions most worth investigating are
exactly the ones that die. The repair alternative (write one line at open, rewrite it at close)
requires **read-modify-write**, which races under concurrent agents. Two appends paired by `run_id`
give crash visibility *and* keep every write atomic.

**Reader rules.**

- Pair lines by `run_id`.
- Report an open line with **no matching close line** as `outcome=unclosed` — a **reader-derived**
  value no writer ever writes. A close line arriving out of order still pairs correctly by `run_id`.
- **Skip an unparseable line** rather than aborting the read.

**Duplicate reduction (so two writers of one run never become two runs).** All lines sharing a
`run_id` reduce to **exactly one** run. The precedence is defined over **field values**, never over
encounter order, so the result does not depend on where the lines sit in the file:

- the **smallest valid `t_start`** wins;
- among close lines, the one with the **smallest valid `t_end`** contributes **both** its `t_end` and
  its `outcome`;
- ties are broken by the **lexicographically smallest serialized line**, so "earliest" never degrades
  into "whichever was read first";
- a run with **any** close line is **closed**;
- the run counts **once**, never twice, in every count `status` reports.

**Honest concurrency claim.** **No lock is taken.** The guarantee is that **no existing line is lost
or rewritten** — because every write is a single append of one bounded line and no writer performs a
read-modify-write. It is **not** a guarantee that a torn trailing line is impossible; a partially
flushed final line remains possible and is tolerated by the reader, which skips it.

**The two fan-out-only departures from "open before the observed work begins".** Both are confined to
the `ptp-full-apply` path and are **available to no other write point**:

1. **Post-hoc** (§6.3): the full-apply launcher never sees the run while it is running — the workflow
   hands it the measured window only after returning — so it appends **both** lines after the fact,
   carrying the measured `t_start` and `t_end`. The trade-off is that a workflow killed mid-run leaves
   no launcher rows at all.
2. **Best-effort late open** (§6.4): a spawned `ptp:ptp-apply` / `ptp:ptp-review` agent appends its
   crash-visibility open line necessarily **after its own work has started**, because the agent must be
   running before it can write anything.

---

<!-- ptp-telemetry:anchor id=gate-ordering class=substrate -->