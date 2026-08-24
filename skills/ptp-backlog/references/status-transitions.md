> Loaded from skills/ptp-backlog/SKILL.md when: changing an entry status.
## Status transitions and their guards

**This skill owns the status transition table.** `status` is a field of the schema above, so its legal
transitions are a property of the same schema and belong in the same place. Three commands perform rows
of this table — `/ptp:backlog-edit` (`0036_03`) performs the **six** user rows
(`in-progress` → `blocked` \| `ready` as a recovery disposition, `blocked` → `ready`, any →
`cancelled`, `cancelled` → `ready`, `backlog` → `ready`, `ready` → `backlog`), `/ptp:backlog-run`
(`0036_04`) performs the three **runner** rows — `ready` → `in-progress`, `in-progress` → `in-review`,
and `in-progress` → `blocked` — and writes `done` **nowhere**, and `/ptp:backlog-continue` (`0038_01`)
performs the **two resume** rows, `blocked` → `done` and `in-review` → `done` — and all three
**reference** the table rather than restating any part of it. (`0036_01` deliberately defined no
transition table; this section is where it lands.)

**The `#` column is sequential, and no row is renumbered or reordered by hand.** `0046_03` replaced the
single row that ran from `in-progress` straight to `done` with two rows, so every row after it moved
by one — arithmetic the
sequential column itself produces, not an edit. Because a row **number** in prose is unreliable across
such an insertion, **prose cites a row by its from → to pair, never by its number**, in this skill, in
the backlog skills, and in the backlog commands alike. The table is **not** renumbered into pipeline
order.

The complete table. Every row names its **performer**; there are no other rows:

| # | From → To | Trigger | Performer |
|---|---|---|---|
| 1 | `ready` → `in-progress` | the runner takes the epic (writes `runBaseline` in the same write) | `/ptp:backlog-run` |
| 2 | `in-progress` → `in-review` | `/ptp:full` converged — **every** slice in `ptp-full-apply`'s `processed` bucket — written at WRITE 2 **before** any archive or deploy, of which the runner performs **neither** | `/ptp:backlog-run` |
| 3 | `in-review` → `done` | **every** prefix recorded in `changeEpics` settled by this same `/ptp:backlog-continue` invocation's own review-gate → archive sequence — the gate satisfied by its own `/ptp:review-full` or by a marker it re-proved in this invocation (**guard 3**) | `/ptp:backlog-continue` |
| 4 | `in-progress` → `blocked` | `/ptp:full` did not converge; the run halts | `/ptp:backlog-run` |
| 5 | `in-progress` → `blocked` \| `ready` | **recovery only**, via the reconciliation gate below (`claim` → `blocked`; `disown` / `rerun anyway` → `ready`). **Never `done`.** | `/ptp:backlog-edit` |
| 6 | `blocked` → `ready` | explicit user reset, gated (**guard 1**) | `/ptp:backlog-edit` |
| 7 | any → `cancelled` | the user abandons the epic; from `blocked` or a stale `in-progress` it carries guard 1's acknowledgement (**guard 2**) | `/ptp:backlog-edit` |
| 8 | `cancelled` → `ready` | explicit user revival | `/ptp:backlog-edit` |
| 9 | `blocked` → `done` | **only** as the direct, same-invocation result of `/ptp:backlog-continue`'s own bare-flow review-gate → archive sequence settling **every** prefix recorded in `changeEpics` — the gate satisfied by its own `/ptp:review-full` or by a marker it re-proved in this invocation (**guard 3**) | `/ptp:backlog-continue` |
| 10 | `backlog` → `ready` | the user promotes an accepted epic into the run queue | `/ptp:backlog-edit` |
| 11 | `ready` → `backlog` | the user defers a queued epic without abandoning it | `/ptp:backlog-edit` |

> `in-review` is the honest resting state of a **converged but not yet archived** epic.
> `/ptp:backlog-run` performs no archive and no deploy, so the epic's change folders are still under
> `openspec/changes/` and its code is still uncommitted on the run's feature branch when the runner
> finishes with it. Splitting the old single row from `in-progress` straight to `done` in two is what preserves the
> invariant that **`/ptp:backlog-run` never writes `done` for work it did not archive** — after this
> change it writes `done` **nowhere at all** — and it collapses `done` back to a single meaning:
> **archived**.

**`backlog` → `ready` and `ready` → `backlog` are unconditional and carry no guard.** Neither endpoint implies a run attempt: **no
writer of this contract produces a `backlog` or `ready` entry holding a non-null `runBaseline`** — the
runner writes the baseline only in the same write as `in-progress`, and every settling edit clears it
*before* the settling status commit — so there is nothing to reconcile and no prior attempt to
acknowledge.

**That is a statement about writers, not an impossibility claim.** A hand edit on the board can leave a
`ready` entry holding a baseline, exactly as it can produce the `in-progress`-with-null-baseline shape
the recovery contract already names. This version adds **no** guard, gate, or trigger for it: the gate's
trigger set stays exactly the two the *hand-edited entry* material below already enumerates, and
`backlog` → `ready` and `ready` → `backlog` pass such an entry's `runBaseline` through untouched. That
is precisely what the pre-split rows into the runnable state (`blocked` → `ready`, `cancelled` →
`ready`, and the recovery row's `disown` / `rerun anyway`) already did with the same hand-edited
shape, so the split adds no exposure.

**Explicit user edits may target an entry in any status**, `done` and `in-progress` included — on a
`done` target such an edit documents history rather than schedules work.

### Refusals

- **Every runner-only row requested through `/ptp:backlog-edit` is refused**, and the refusal **names
  the row and its performer**: `ready` → `in-progress`, `in-progress` → `in-review`, and
  `in-progress` → `blocked` other than as the recovery row's disposition.
- **Every transition absent from this table is refused** — first and foremost **`backlog` →
  `in-progress`**: the runner takes only `ready` entries, and that separation is the whole purpose of the
  split. Also absent and therefore refused: `backlog` → `done`, `ready` → `done`, `done` → `ready`,
  `done` → `backlog`, `done` → `in-progress`, `cancelled` → `done`, `cancelled` → `blocked`, `cancelled`
  → `backlog` (revival lands on `ready` via `cancelled` → `ready`; deferring it is then `ready` →
  `backlog`), and `blocked` → `backlog` (reset via `blocked` → `ready`, then defer via `ready` →
  `backlog`).
- **Every transition out of `in-review` other than `in-review` → `done` and `any` → `cancelled` is
  refused** as absent from the table — `in-review` → `blocked`, `in-review` → `ready`, `in-review` →
  `backlog`, and `in-review` → `in-progress` in particular, each with the reason and the two remedies
  *`in-review`'s outgoing edges* below states. The only transition **into** `in-review` is
  `in-progress` → `in-review`, the runner-only row above.
- **`blocked` → `done` and `in-review` → `done` are refused except via their guarded path.** Neither is
  absent from the table, but both are reachable **only** by their performer
  **`/ptp:backlog-continue`** under **guard 3** below; requested through any other command —
  `/ptp:backlog-edit` in particular — each is refused exactly as `blocked` → `done` was before that row
  existed, naming the row and its performer.
- **A status write that changes nothing is refused as a no-op**, never reported as success.

**`done` → `cancelled` is permitted and unconditional.** The cancellation row is written "any →
`cancelled`", and its
two **gated** sources are named exhaustively as `blocked` and a stale `in-progress`; `done` is neither,
so no guard applies. This does not contradict the refusal list above: that list names `cancelled` →
`done`, the opposite direction, which stays refused. Cancelling a `done` epic documents abandonment of
shipped work — and discards no link (`changeEpics` survives).

### Repairing a `status` that is unset or out of enum — a repair, not a transition

Every row of the table above is defined over the **seven enum values**, so an entry whose stored `status`
is **out of enum** has **no *from* row at all** — and so does an item with **no `Status` selected at
all**, which is the same defect reached by a shorter path. The rule is therefore worded over a `status`
that is **unset or out of enum**, both cases governed identically. Both states are a `malformed-entry` on
`status`, and **every** structural defect is writer-eligible, so *Writer eligibility* deliberately lets a
writer proceed over them, and `/ptp:backlog-edit` is the tool that repairs them. Refusing the repair
as "a row absent from the table" would make that defect **unrepairable through ptp**, which is exactly
the lockout writer eligibility exists to prevent.

**The widening to an unset `Status` is required, not incidental.** With no membership test, a card a
human adds by hand is an entry with no `Status`; without this rule it could never be repaired through
ptp, and the accepted membership regression would become a real lockout.

So: **an instruction that replaces an unset or out-of-enum `status` with a valid enum value is a repair,
not a transition.** It is **permitted**, the refusal list above does not reach it, and the report names
it **as a repair**, quoting the invalid value found or naming the `Status` as unset.

**Every bound below is unchanged and applies identically to an unset `Status`** — the permitted
destinations, the `runBaseline` routing, the disposition-outcome-is-binding rule with its `cancelled`
exception, the same-write `runBaseline` clear, and the still-named-in-the-report rule:

- The repair may set **`backlog`**, **`ready`**, **`blocked`**, or **`cancelled`** only.
  **`in-progress`** is the take row's runner-owned outcome, **`in-review`** is the convergence row's
  runner-owned outcome, and **`done`** is never written by this command at
  any time; requesting any of the three is **refused naming this rule**, so a corrupted `status` is
  never a back door into a status the table denies.

  **`in-review` is excluded for the same reason `in-progress` is**: `in-progress` → `in-review` is a
  runner-only row, so a repair landing there would manufacture a claim that a `/ptp:full` converged —
  the claim the whole guard-3 proof exists to require — out of a corrupted field.
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
  repair's destination is any permitted status **other than `cancelled`** — `backlog`, `ready`,
  or `blocked` — it MUST equal the status the settled disposition prescribes — `claim` →
  `blocked`, `disown` → `ready`, `rerun anyway` → `ready`, and the *Combining* table's result where
  warning dispositions are involved — and a destination that disagrees is **refused**, naming both the
  requested status and the one the disposition prescribes. Otherwise a repair to `ready` combined with
  `claim` would keep and confirm the recovered work while slipping past the `blocked` landing that
  forces an explicit re-run — and a repair to `backlog` would do the same by a longer road, since
  `backlog` → `ready` returns it to `ready` unguarded. Only **`cancelled`** overrides,
  exactly as in a cancellation edit: there the disposition governs the ids while the cancellation
  governs the status, under guard 2 in full. When the entry falls on the availability table's **ungated
  first row** no disposition exists to prescribe anything, and any permitted destination may be repaired
  to.
- **The settlement clears `runBaseline` in the same write, and the report names the value it cleared** —
  after reconciliation has already consumed it, never before. This is the *Every settling edit clears
  `runBaseline`* rule reaching its last case: after the repair the entry is not `in-progress`, so **no**
  later writer could ever consume that baseline — `/ptp:backlog-run` overwrites it on taking the entry
  and never takes a `cancelled` one — and a baseline left behind would strand exactly the phantom the
  invariant forbids. There is deliberately **no** separate baseline-only edit: `runBaseline` is written
  by the runner and cleared by a settling or repairing edit, and by nothing else.
- Every other rule of this contract is unchanged by the repair — in particular the defect is **still named
  in the report** as an outstanding structural problem until the repairing write lands.

### Guard 1 — `blocked` → `ready`

A `blocked` entry is the residue of a halted `/ptp:full` whose slices sat in
`applied (review pending)` — applied but unreviewed code. A bare reset would let a *later* attempt reach
`done` while that unreviewed code is still on the branch. So the reset:

1. **Retains the prior attempt's `changeEpics` in full** — it never clears them, never prunes them, and
   never relabels them. `/ptp:backlog` goes on listing them.
2. **Requires an acknowledgement**, carried in the instruction, that the prior attempt's unconverged
   slices were resolved — their review finished via `/ptp:review-full`, or the folders abandoned.
3. **Refuses an instruction that does not carry it**, and the refusal **lists the retained
   `changeEpics` ids** so the user knows exactly which folders to go check.
4. The acknowledgement is **report-time only**. v1 persists **no** "prior attempt resolved" field,
   **no attempt id, no attempt boundary, and no per-attempt grouping** of `changeEpics`: once
   `runBaseline` is cleared nothing in the store says which attempt minted which id. What is durable is
   the retained ids themselves, and the report names them so a reset is never mistaken for a clean
   slate.
5. **No `runBaseline` step is performed.** A `blocked` entry's baseline was already cleared by the
   runner's terminal write.

### Guard 2 — any → `cancelled`

A `blocked` entry's retained `changeEpics` ids are the only record of which change folders hold
applied-but-unreviewed code, so abandoning the epic without acknowledging that those slices were
resolved discards that record's only reader — guard 1's hazard reached by a shorter path. Per source
status:

- From **`backlog`** or **`ready`** — no attempt, nothing applied: **unconditional** in both cases, for
  the same reason.
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

### Guard 3 — `blocked` → `done` and `in-review` → `done` (the resume rows)

**Guard 3 governs both rows that reach `done`**, and both are available **only** when this invocation
itself produces the proof. `blocked` → `done` exists for one situation and no other:
`/ptp:backlog-run` halted an epic (`in-progress` → `blocked`) whose work was in fact finished, most
often because the apply agent correctly refused to check off a **manual-only** verification task. Once
a human performs that verification, the work is done — but nothing in the store proves it.
`in-review` → `done` exists for the complementary situation: the epic's `/ptp:full` **did** converge,
but `/ptp:backlog-run` performs no archive, so the epic's work converged while the epic itself is
still unarchived and unsettled — converged is not finished, and only the archive makes it so. The
predicate is one, over both sources:

- the entry's `status` is **`blocked`** or **`in-review`**, and its `changeEpics` is **non-empty** —
  the same predicate that made it `/ptp:backlog-continue`'s target; **and**
- the write happens **in the same `/ptp:backlog-continue` invocation** whose bare flow has just
  settled **every** prefix in `changeEpics` — each one's **review gate satisfied in that invocation**,
  by its own `/ptp:review-full` run to convergence (`BOTH PHASES DONE`, or `ptp-codex-mode`'s mode-skip
  terminal state) **or** by an eligible `stages/code.json` review-convergence marker whose fingerprint
  that same invocation **recomputed and verified there and then** against that change's recorded diff
  footprint and its review contract (`ptp-review-loop`'s six-condition skip-eligibility predicate) — and then
  `/ptp:archive` successfully, or found already absent from `openspec/changes/`.

**The two sources differ only in what the entry's history proves, and this guard says so:**

- From **`blocked`**, the epic's `/ptp:full` did **not** converge, and the guard's proof supplies the
  convergence the run never had.
- From **`in-review`**, the epic's `/ptp:full` **did** converge, and the guard's proof supplies the
  **archive** the runner is forbidden to perform.

In both cases the proof is **this invocation's own** — a successful review-full report, or an eligible
marker **re-proved here** — plus a completed `/ptp:archive`, never an *unverified* assertion about the
past. The marker form is admissible for exactly that reason and no other: its fingerprint is recomputed
in this invocation, after the checkbox flip and the re-verification, against the very content about to
be archived, so what the guard accepts is a fact it established **now**, not a claim recorded earlier
and taken on trust. An ineligible or unverifiable marker is no proof at all and sends the prefix
through `/ptp:review-full` exactly as before.

**It is never available as a standalone disposition, from either source.** There is no "mark this
done" free action on an already-`blocked` or already-`in-review` entry from a prior session, and no
recovery path, disposition, or combination of dispositions may produce it. This is the load-bearing
difference from a hypothetical
`/ptp:backlog-edit` disposition: a recovery disposition reasons about a **stranded, possibly-crashed**
run, able to establish **neither** its per-prefix review convergence **nor** its archive — which is
exactly why *Recovery and reconciliation* below never yields `done` — whereas guard 3's proof is **produced or
re-proved in this invocation**, never accepted as an assertion about the past.
`/ptp:backlog-edit` has no review-full/archive machinery of
its own, can therefore never satisfy this guard from **either** source, and refuses `in-review` →
`done` exactly as it refuses `blocked` → `done`; both refusals are unchanged.

**Write shape**, mirroring the **shape** of the runner's own convergence write
(`in-progress` → `in-review`) — the shape, not its value, that write now committing `in-review` while
this one commits `done`:

1. set `status: done`;
2. **clear `runBaseline`** — already `null` on an entry reached through either `in-progress` →
   `blocked` or `in-progress` → `in-review`, so a no-op in the common
   case, stated for completeness in case a hand edit left it non-null, and consistent with *every
   settling edit clears `runBaseline`*;
3. **retain `changeEpics` exactly as-is** — it already records every prefix now archived, so unlike
   `runBaseline` there is nothing to add and nothing to clear;
4. **send no `updatedAt`** — the stamp is **board-maintained** (*Timestamps* above): the store exposes
   no setter, so the write carries no value for it and the board's own stamp stands. A writer that
   "bumps" it in memory has changed nothing durable, and no caller may read that bump back as stored.

One single write **group**, dispatched through `ptp-backlog-write`'s ordered sequence exactly as every
other writer's is — the clear a payload row, `done` the commit — touching no other entry. **No second
write shape enters the contract.** If **any** prefix fails to settle, **no** transition occurs: the
entry stays in its existing status (`blocked` or `in-review`) with its `changeEpics` unchanged, and the
partial progress lives in the archived change folders alone.

### `in-review`'s outgoing edges — exactly two

`in-review` has **exactly two** outgoing edges:

1. **`in-review` → `done`** — the resume row above, under **guard 3**.
2. **`in-review` → `cancelled`** — the existing unconditional **any → `cancelled`** row, and it is
   **ungated**. That row's gated sources are named exhaustively as `blocked` and a **stale**
   `in-progress`; an `in-review` entry is neither, and its `runBaseline` is null, so there is nothing to
   reconcile and no acknowledgement to collect. `changeEpics` survives the cancellation, as it does from
   every source.

**`in-review` → `blocked` is absent from the table and refused.** The reason:

> `blocked` means one specific thing — **a `/ptp:full` did not converge and the run halted**. It is
> written by `/ptp:backlog-run` at WRITE 2 and by `/ptp:backlog-edit`'s recovery dispositions on a
> **stale** `in-progress` entry, and it is the input the recovery machinery keys on. An `in-review`
> entry has a **converged** `/ptp:full` and a **null** `runBaseline`: there is no run to reconcile and
> no halt to record. Admitting this edge would give `blocked` a second meaning, which is precisely the
> defect splitting `done` exists to remove.

**Every other outgoing edge is absent and refused too** — `in-review` → `ready`, `in-review` →
`backlog`, `in-review` → `in-progress`. **The refusal names the two real remedies**, so it is never a
lockout:

- **A problem was found in the converged work** → `/ptp:backlog-continue "<what is wrong>"`, the
  **issue-text flow**. It runs one scoped fix pass and writes **no** status; the entry stays
  `in-review`, and the bare flow's `/ptp:review-full` re-reviews the fix before any archive.
- **The epic should be re-run from scratch** → `in-review` → `cancelled` (edge 2 above), then the
  existing unconditional `cancelled` → `ready` revival. Two explicit user acts, both rows that already
  exist, with the cancellation itself serving as the acknowledgement.
