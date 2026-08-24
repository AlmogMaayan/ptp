> Loaded from skills/ptp-backlog-run/SKILL.md when: handling a write group that did not complete.
## When a write group does not complete

**The universal rule.** On any verdict other than `complete`, the runner **halts**, performs **no
write-group-level re-dispatch**, and **reports the journal in full**.

Two independent reasons re-dispatch is forbidden:

1. **Ambiguity is resolved by re-read, never by retry** — `ptp-backlog-write`'s rule, applied here.
2. **The halt path's `notes` append is not idempotent**, so a re-dispatched WRITE 2 would duplicate the
   line.

### WRITE 0 — the take

- The epic is **not taken** and **`ptp-full` is not invoked**.
- The round is **consumed**: the counting rule counts epics **started**, and that extends to an
  attempted-but-incomplete take.
- The run **halts rather than skipping** to the next ready epic. The transport is a **shared** resource,
  so the next epic almost certainly fails identically; skipping would burn rounds silently and scatter
  stranded baselines across several `ready` entries.
- A stranded `runBaseline` on a **`ready`** entry is **inert** — WRITE 0 precedes `ptp-full`, so **no
  work was done**. It is deliberately **not** a stale entry (staleness requires `in-progress`), **not**
  gated (the gate's trigger is `in-progress` with a status-changing instruction, or a non-null baseline
  under an out-of-enum repair), and **not** flagged; the next take overwrites it. **The report SHALL
  state all of that**, or a user meets an unexplained value with no way to know it is harmless. The
  stale definition and the gate trigger are `ptp-backlog`'s, **cited and neither amended**.
- **The `unresolved-commit` exception**, per `ptp-backlog-write`'s scoping rule, and it applies **here**
  as much as at WRITE 2: WRITE 0 **has** a commit (`status: in-progress`), so this is the one WRITE-0
  verdict on which the take may in fact have landed. The entry's status is then **unknown**, and the
  report SHALL name **both** possibilities and assert **neither**. In particular it SHALL NOT state
  that the entry is `ready`, SHALL NOT describe the baseline as inert, and SHALL NOT promise that
  *the next take overwrites it* — none of which holds on the `in-progress` branch, where the entry is
  instead the ordinary **stale** shape (`in-progress` with its baseline set) that the runner never
  takes. The report SHALL direct **inspection before any repair or retry**. Every other WRITE-0
  bullet above is scoped to the five verdicts on which no `status` write can have landed.
- **The unreachable shape:** `in-progress` with a **null** baseline can **never** arise from WRITE 0,
  because `status` is dispatched **last** and only after `runBaseline` landed. That is **derived from
  the ordering**, not asserted, and it holds on the `unresolved-commit` branch too — an `in-progress`
  entry there carries its baseline.

### WRITE 1 — the one genuinely new crash shape

> **When WRITE 1's verdict is not `complete`, the runner HALTS and does NOT dispatch WRITE 2.** The
> entry is left **`in-progress` with `runBaseline` still set**.

**Why that is right:** that state **is** the stale-entry definition, so the **entire recovery contract
applies with no new machinery**. The definition is `ptp-backlog`'s and is **cited, not restated**.

**What makes it genuinely new is the other half:** WRITE 1 has **no commit stage**, so the
status-commit invariant **has nothing to defend here**.

**What the landed carrier record makes of the dispatch split.** `changeEpics` and `attributionWarnings`
share the **body** carrier, so WRITE 1 is **one dispatch carrying two journal rows**, and the split
below is **unreachable through that carrier**. It is written as a **conditional** — the rule that
applies **if** the two ever become separately dispatchable — and **never as a live residual**.

**Conditionally, then, the two dispatch positions:**

| Failed dispatch | The entry holds | The report |
|---|---|---|
| `changeEpics` (the **first**) | no id and no warning from this attempt | SHALL say **no durable link landed this attempt**, and SHALL **NOT** report a lost-warning residual — nothing was skipped, because no warning was ever recorded |
| `attributionWarnings`, after `changeEpics` landed | the durable link, without its warnings | carries the residual below |

**And the case in which nothing was dispatched at all, which the table above cannot describe because it
is keyed on a failure.** A WRITE 1 group can end **`refused`** — a pre-write-check **difference** on
`changeEpics` or `attributionWarnings` at the first planned row, or a snapshot or compose read that
could not be completed within its bounded budget — with **every row `not-dispatched`**. The report SHALL
then state that **no durable link landed and no dispatch failed, because none was made**, and SHALL name
the **halt cause** — a difference, with the snapshot's value and the value found, or the read that could
not be completed — together with the **field or carrier** it halted on. It SHALL NOT name a failed
dispatch it never made.

**And the `unresolved` row, which is not a failed dispatch and is reachable through the shared carrier.**
Where WRITE 1's body write was dispatched, its response was ambiguous, and its verification read could
not be completed, its rows are `unresolved`: **whether a durable link landed is unknown**. The report
SHALL say so, SHALL NOT claim that no durable link landed this attempt, SHALL NOT claim one did, and
SHALL direct **inspection of the entry before any repair or retry**. The halt itself, and the entry being
left `in-progress` with `runBaseline` still set, are unchanged — nothing was dispatched after the failing
row.

**The residual, scoped to the failed-`attributionWarnings` case only and conditional on the two fields
being separately dispatchable at all.** Reconciliation **skips** a recovered prefix already present in
`attributionWarnings`. If the warning write was the one lost, that skip does not happen, and the prefix
is instead appended to `changeEpics` as `folder-diff-unconfirmed` — **a lost warning reappearing as a
provisional claim**, an inversion from *judged not ours* to *provisionally ours*. The **mitigation** is
that `disown` drops exactly the provisional ids, and the halt report **SHALL name the prefixes the
failed warning write was carrying**. This is a **residual, not an acceptable equivalence** — and while
the two fields share a carrier the halt report **SHALL NOT present it as a live outcome**.

### WRITE 2 — the terminal write

On any non-`complete` verdict **other than `unresolved-commit`**, the partial state is **`in-progress`**
— `status` is the group's last dispatch. WRITE 2 is **two carrier dispatches**, the body then `status`,
so **which** shape results depends on whether the **body write** landed.

**The table below is scoped to the normal case, in which the `runBaseline` row is a real planned
dispatch** — the entry's baseline was **non-null** at the snapshot, WRITE 0 having set it. Where the row
is instead `skipped-identical` the table does **not** apply and the paragraph after it governs.

| Body write | Resulting shape | Recovery |
|---|---|---|
| **landed** (`landed` or `landed (verified by re-read)`) | the **null-baseline residual**, **with the `notes` line appended** | not reconciled; the gate still applies **on existing holdings**, and every refusal states **no diff was possible** |
| **did not land** (`failed` or `not-dispatched`) | the baseline is **still set** and **no `notes` line was appended** — the ordinary **stale** shape | reconciled with a **diff available**, and with **no** such refusal wording |
| **`unresolved`** | **neither shape is known** — the body carrier write may or may not have landed, so the baseline may or may not be cleared and the `notes` line may or may not be present | **not asserted.** The report SHALL name **both** shapes, assert **neither**, prescribe **neither** recovery wording, and direct **inspection of the entry before any repair or retry** |

**The third row is not a hole in the split; it is the split stated honestly.** A body carrier write whose
response was ambiguous and whose verification read could not be completed is `unresolved` and carries the
verdict `uncommitted-partial` — a **payload** row, so the entry's status is still known to be
`in-progress` (nothing was dispatched after it), while **which** residual it holds is not. Reporting one
of the two known shapes there would assert an outcome this runner does not have, which is exactly what
`ptp-backlog-write`'s scoping rule forbids.

**The `notes` line is NOT an independent variable.** It rides the **same body carrier** as the clear, so
the two land together: **no report may describe the baseline cleared with the halt line lost, or the
reverse**.

**The case the table excludes: a `runBaseline` row that is `skipped-identical`.** That outcome means the
baseline was **already null before this write** — a hand edit, or a residual an earlier operation left —
so the null-baseline state is **pre-existing and was not produced here**, and it is null on **both**
branches of the body write rather than only where the body landed. The report SHALL say so, SHALL
**not** claim to have cleared a baseline, and SHALL **not** print a cleared value it never saw, exactly
as `ptp-backlog-write`'s detection rule excludes `skipped-identical` from layer 1. **The `notes` line
then varies alone**: the halt path's append is still a real planned row on the body carrier, so whether
it landed follows from that carrier write's own outcome — which is **not** a violation of *the `notes`
line is not an independent variable*, that rule pairing the line with a **clear this write actually
dispatched**, and here there is none. The entry is otherwise the ordinary **stale-shaped** entry with a
**null** baseline, so **no diff is available** and the gate's refusals state that no diff was possible.

**The `unresolved-commit` exception**, per `ptp-backlog-write`'s scoping rule: the entry's status is
**unknown**, so **neither shape is asserted**, the report names **both** possibilities and asserts
neither, and it directs inspection before any repair or retry.

The recovery machinery handles **both known** shapes unchanged, and because WRITE 1 landed the ids first,
the **gate fires on ids in both** — and on whichever of the two the unresolved case turns out to be, that
case resolving to one of them once the entry is inspected. **No disposition, gate row, or availability-table row is restated here.**

### The never-yields-`done` check

A **check**, not a restatement: this runner writes `done` **nowhere**, so no write of its — partial or
complete — can reach it. The narrower pre-`0046_03` form of this check (a partial write can never
reach `done` because `status` is the **single last dispatch** of its group) is **subsumed**, and the
mechanism it named still governs `in-review`: `in-review` is WRITE 2's **commit**, so it is either
**fully committed or never written**. This cites `ptp-backlog`'s *recovery never yields `done`* and
**adds no rule to it**.
