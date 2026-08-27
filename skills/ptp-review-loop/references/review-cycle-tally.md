# Review cycle tally — accumulation detail

Loaded when accumulating, finalizing, or returning `reviewTally`. The owning section is
`## Review cycle tally` in `SKILL.md`, which states the summary and points here for the mechanics.

A **review cycle** is one `ptp-review-loop` iteration: it begins at step (a) and ends at whichever
comes first — the step (f) `DONE` exit, or the completion of step (h). A converging iteration never
reaches steps (g)-(i) and is still a full cycle. Every cycle is attributed to the `reviewer` of the
phase that ran it — `ptp` or `codex`.

The cycle count for a reviewer equals the number of iterations that reviewer's loop **completed** —
the same number the run already reports as `iterations`, so this introduces no second way to count. At
`ITERATION CAP REACHED` this is the resolved cap, not the `iteration` variable's post-abort value: step
(a) increments `iteration` past `MAX_ITERATIONS` and aborts before running a pass, and that aborted
increment is not a cycle.

## Dispositions

Five review-finding dispositions map onto steps the loop already performs, plus two reconciling
counters, for seven counters total:

| Counter | Source step |
|---|---|
| `found` | every finding raised by the review pass (b) |
| `accepted` | `CONFIRMED` findings (e) |
| `rejected` | `REJECTED` (e) plus `REJECTED (carry-over)` (d) |
| `fixed` | fixed candidates recorded at (g2), finalized at the terminal state |
| `capped` | in-scope accepted findings still open, computed at the terminal state |
| `belowThreshold` | the step (c2) below-threshold bucket |
| `droppedManual` | findings dropped by the step (c1) manual-check / tests-required filter |

A below-threshold finding is **never** counted as `rejected` — it was never examined by step (e), so
counting it as a rejection would publish an unexamined finding as a judged non-defect.

The counters reconcile **per iteration**, over finding **instances** rather than distinct findings, as:

`found = droppedManual + belowThreshold + rejected + accepted`

`fixed` and `capped` are the two **terminal** counters — computed once at the terminal state rather than
accumulated per iteration — with `capped` always `0` at `DONE`. The other six counters (`cycles`,
`found`, `droppedManual`, `belowThreshold`, `rejected`, `accepted`) accumulate per iteration.

**The `fixed` lifecycle.** Step (g2) records a fixed finding's existing **stable key** as a *fixed
candidate*. A later iteration's step (b) review pass raising a finding whose stable key matches a
retained candidate removes that candidate — the fix did not hold. `fixed` is **finalized once at the
terminal state** as the count of candidates still retained; it is never accumulated per iteration and
never provisionally reported mid-run. This is **not** step (d)'s `REJECTED (carry-over)` test, which
matches only findings already in `rejected_findings`: a fixed finding that recurs arrives as a fresh
candidate at step (e), never as a carry-over.

## The `reviewTally` accumulator

`ptp-review-loop` maintains a per-run `reviewTally`, an object keyed by reviewer (`"ptp"` or
`"codex"`), each key holding `cycles` plus the seven counters above. A standalone loop run carries
exactly one key, since a single invocation runs exactly one reviewer; the map shape lets a `-full`
orchestrator merge two phase returns **key-wise** by addition over their disjoint keys, with no
mapping table required. The normative merge rule is `SKILL.md`'s `### Combined review tally`.

`reviewTally` and `fixed_candidates` are **in-conversation state**, held in the state table beside
`iteration`, `rejected_findings`, and `per_iteration_summary`, and are covered unchanged by the
existing never-persist rule. Accumulating the tally has no on-disk side effect of its own; the
tally reaches disk only as the marker's optional `reviewTally` field (see `## Review-convergence
marker`), which is written by the marker's existing single atomic write and adds no separate write
path.

## Return contract

The terminal outcome returns `reviewTally` at both terminal states — `DONE` and
`ITERATION CAP REACHED` — for all four loop kinds (`code`, `artifact`, `brainstorm`, `prd`), in both
the standalone `deferMarker = false` mode and the `deferMarker = true` mode a `-full` orchestrator
drives. The addition is purely additive: no marker version bump, no existing consumer keys on the
field. A terminal outcome that carries no `reviewTally` means **not reported**, never a tally of
zeroes. Printing is scoped to `deferMarker=false`; a `deferMarker=true` run returns its tally instead
of printing.

## Marker persistence: omit, never fabricate; non-deciding

A writer that cannot produce a tally omits `reviewTally` from the stage marker **entirely** — no
partial tally, no zero-filled placeholder, no fabricated counter, exactly as with `fingerprint`. The
omission is noted in the writer's **own terminal report**, as one line beside the place it already
reports a marker-write failure — never a second file, never a log, never a telemetry record:

```
Review tally omitted from the stage marker (could not be produced).
```

Like a marker-write failure, this note is **reported but not fatal**: it changes no terminal state, no
verdict, and no convergence decision, and the rest of the marker is written by the same single atomic
write. `SKILL.md`'s `## Review-convergence marker` section **owns** this rule — it states it there in
short form and points here for this full form — and every other marker writer (`review-full`,
`review-plan-full`, `ptp-review-brainstorm-full`, `ptp-review-prd-full`, `agents/ptp-review.md`,
`/ptp:review-fix`) references **that section** rather than restating the line. The two *Preconditions* STOPs that write no marker at
all still write none, and so carry no tally and no omission note.

`reviewTally` is **non-deciding**: it is not one of the six conditions of
`skills/ptp-review-loop/references/code-marker-skip-eligibility.md`, is not an input to the content
`fingerprint`, and steers no ptp step — adding it, omitting it, or reading it changes no gate.

## Non-goals

The tally decides nothing (see `## Hard rules` in `SKILL.md`). The in-memory `reviewTally` is the
**primary source of truth** for review-cycle counts. `ptp-telemetry` is **off by default**, so this
capability takes no dependency on it in either direction.
