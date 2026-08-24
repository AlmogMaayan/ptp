> Loaded from skills/ptp-backlog-run/SKILL.md when: writing an epic status back to the board.
## The write protocol

Three durable writes per epic, through `ptp-backlog`'s IO protocol. The protocol's name — *two-write
write-back* — counts the **two writes that follow the take**; WRITE 0 is the take itself.

**The per-write field lists below name only the fields this skill decides; they are not the complete
set of fields a write touches.** Each of the three is an ordinary `ptp-backlog` write, so it carries
that skill's writer obligations unchanged. `updatedAt` is **not** among them: `ptp-backlog` makes both
stamps board-maintained, so no write here sends a value for either. That rule and its consequences are
`ptp-backlog`'s and are **cited here, not restated**.

### Dispatch

Each of the three writes is **one write group**, dispatched through `ptp-backlog-write`'s **ordered
write sequence**. Its field-level decisions below are unchanged; what this subsection adds is the
mapping onto that sequence's stages, whose names are **cited, never redefined**.

| Write point | Payload stage | Commit stage |
|---|---|---|
| **WRITE 0** — take the epic | `runBaseline` (set) | `status: in-progress` |
| **WRITE 1** — record the link | `changeEpics`, `attributionWarnings` | — |
| **WRITE 2** — settle the run | the `runBaseline` **field-value clear**, and on the halt path the appended `notes` line | `status: in-review` \| `blocked` |

**WRITE 1 has no commit stage at all.**

Every one of the three touches **exactly one entry**, with two consequences: the sequence's multi-entry
ordering half is **never exercised**, and the **backstop refusal** is **trivially satisfied**.

**The creation stages are never reached** by any runner write point — every one edits an entry that
already exists.

### WRITE 0 — take the epic

**The epic taken is the *first* entry of the recomputed ready set** — first in the order
`ptp-backlog` defines, which this skill consumes and never re-sorts (see *Antichain reading note*).
One entry per iteration, never a batch.

Set `status: in-progress` **and** store `runBaseline` in **one write group** — `runBaseline` the
payload, `in-progress` the commit, per *Dispatch* above — **before**
`ptp-full` is invoked. A crash after this point is reconcilable; a crash before it leaves
the backlog store unchanged — scoped to the store, per the *Scoping note* above, since the
branch guard has already run and may have stashed the working tree and cut a branch.

`runBaseline` holds the 4-digit change-prefix snapshot **as `ptp-backlog` defines it** — see that
skill's *The change-prefix set* section. **This skill states no membership rule of its own and takes
no position on whether the set covers `openspec/changes/archive/`.** Its **storage shape** likewise
defers to `0036_01`'s schema.

**Why the membership rule cannot live here.** `/ptp:backlog-edit` (`0036_03`) computes
`recovered = current \ runBaseline` and requires `current` to use the **identical** definition the
snapshot used: a diff between two differently-defined sets is meaningless. The mismatch is not
symmetric, which is why this is stated rather than left to good intentions — a baseline **narrower**
than the set it is later diffed against would sweep **unrelated change prefixes** into a crashed
entry, minting bogus links that permanently gate it and force a disposition over folders that have
nothing to do with the epic. One definition, held by `ptp-backlog`, makes that unrepresentable.

The runner's own **corroborating after-snapshot uses that same `ptp-backlog` definition**, so
`diff = after \ runBaseline` is a diff between two identically-defined sets.

### The inline `ptp-full` invocation

Between WRITE 0 and WRITE 1, **invoke the `ptp-full` skill inline** — a skill invocation driven
in-session, **not** a spawned agent — with **exactly that skill's three declared inputs and no
others**:

| `ptp-full` input | Value |
|---|---|
| `big-change-id-or-request` | the epic's `description`, passed **verbatim** |
| `fast` | `false` — the runner accepts no `fast:` token, so it supplies this input at its default rather than leaving the posture inferred |
| `parallel` | the posture resolved once in precondition step 3 |

**`codex.mode` is not among them.** It is absent from `skills/ptp-full/SKILL.md`'s Inputs table;
`ptp-full` resolves it itself.

### WRITE 1 — record the link, still `in-progress`

Persist `changeEpics` and `attributionWarnings` while `status` **stays** `in-progress` and
`runBaseline` **stays** set. **On every epic, converged or not.**

Inputs: `/ptp:full`'s in-session terminal report (**authoritative**) and `diff = after \ runBaseline`
(**corroborating only** — forbidding fan-out prevents *this* run minting ids concurrently, but cannot
prevent a separate session doing so).

**Both inputs are reduced to change-epic prefixes before either is used.** `/ptp:full` reports
**slices**, so its report names slice-level change ids (`0041_01_…`); a `changeEpics` element's `id`,
an `attributionWarnings` element, and `runBaseline`'s snapshot are all the **4-digit change-epic
prefix** — `ptp-backlog`'s schema and its change-prefix set define that shape, and neither is restated
here. So *"the ids the report names"* below means **the 4-digit prefix of each slice id the report
names**, deduplicated (several slices of one epic contribute one id). Without that reduction the
table's own conditions would be ill-defined, since row 1 and row 2 turn on whether the report
*explains* a diff prefix — a comparison only possible once both sides are the same kind of value.

**Read every cell below as *this attempt's contribution*, never as the final array.** WRITE 1 merges,
so a re-taken entry arrives already holding the prior attempt's ids and warnings; a cell reading
*(nothing)* means "this attempt adds nothing here", not "the field ends up empty".

| # | Report | Diff | `changeEpics` | `attributionWarnings` |
|---|---|---|---|---|
| 1 | present, names ids | every diff prefix is named by the report | the reported ids, `terminal-report` | *(nothing)* |
| 2 | present, names ids | holds a prefix the report did **not** name | the reported ids, `terminal-report` | the unexplained prefix(es) |
| 3 | present, names **no** ids | non-empty | *(nothing)* | every diff prefix |
| 4 | **absent entirely** | non-empty | every diff prefix, `folder-diff-unconfirmed` | *(nothing)* — the diff is the only evidence there is; routing it to warnings would orphan the link |
| 5 | present, names ids | empty | the reported ids, `terminal-report` | *(nothing)* |
| 6 | present, names **no** ids | empty | *(nothing)* | *(nothing)* |
| 7 | **absent entirely** | empty | *(nothing)* — no prefix to record | *(nothing)* — but the entry is **still flagged attribution-unconfirmed** |

The table is **total** over the six report×diff combinations; the seventh row exists because *present,
names ids* splits by whether the diff holds an unexplained prefix.

**"Absent entirely" and "empty" are distinct conditions, and conflating them is the trap.** *Absent
entirely* means **no report exists to read** — the diff is the only evidence available, so its
prefixes become `folder-diff-unconfirmed` ids in `changeEpics` (row 4). *Empty* means **a report
exists and names no slices** — that is evidence *that nothing was produced*, so it takes the
"present, names no ids" row (row 3 or 6): **no `changeEpics` id from this attempt**, and every diff
prefix routed to `attributionWarnings`. Both are non-convergence, which is why the distinction has to
be stated rather than inferred: collapsing them would let a report that positively named nothing mint
links it explicitly declined to claim. Row 7 settles the only genuinely ambiguous case: an absent
report over an empty diff **still flags the entry attribution-unconfirmed**, because the flag records
*that no report was produced* — it is keyed on the missing report and **never** on the diff's content.

Two asymmetries, easy to get backwards:

- A **report-named id that does not appear in the diff is not a warning.** Warnings describe
  *unexplained diff prefixes* only, never unexplained report ids — the report is the authority.
- An **unexplained diff prefix is never unioned into `changeEpics`.** A union could absorb another
  session's change id and permanently mislink it.

**`attributionWarnings` is persisted, not printed.** A print-only warning would be lost the moment the
run ends, and with `runBaseline` cleared nothing could reconstruct it.

**WRITE 1 merges; it never replaces.** An epic re-taken after a `blocked` → `ready` reset still
carries the prior attempt's `changeEpics`: `0036_03` retains them "in full — never clearing, pruning,
or relabelling them" and persists **no** attempt id, boundary, or grouping, so those ids are the
**only** durable record that the epic is not a clean slate. A replacing write would destroy that
record irrecoverably. So this write **merges this attempt's ids into what is already there and never
drops, prunes, or relabels an id it did not itself add.** Ids remain unique within `changeEpics`, per
`0036_01`'s schema.

**The merge-collision attribution rule**, without which "keep the stored attribution" and
"report-named ids are `terminal-report`" would contradict each other on a re-take: **a stored
attribution stands**, with exactly one exception — a **`folder-diff-unconfirmed` id that *this
attempt's* report names is raised to `terminal-report`**, since a report naming it is strictly better
evidence than the diff that first inferred it. **`user-confirmed-reconciliation` is never
overwritten**: the runner does not write that value and must not displace a human's judgment. So the
runner only ever **raises** provenance, never lowers it.

**The runner never writes `user-confirmed-reconciliation`** — that value is only ever produced by
`/ptp:backlog-edit`'s disposition edit.

**Canonical field order already gives the safe order inside WRITE 1 — confirmed, not excepted.** The
schema places `changeEpics` **before** `attributionWarnings`, and that is also the safer partial order:
losing the **warning** keeps the durable backlog↔change link and keeps the entry **gated** (the gate
keys on *any* `changeEpics` id, whatever its attribution), whereas the reverse would **orphan real
change folders** from the entry that produced them. This **confirms** the inherited order and creates
**no exception**; **no second field-order rule exists anywhere.**

### The convergence decision

**Mechanical, not a judgment call.** From `/ptp:full`'s slice report:

- **converged** — **every** slice landed in `ptp-full-apply`'s `processed` bucket;
- **not converged** — anything else: any slice in `applied (review pending)`, any slice in
  `never-started`, **a plan-convergence STOP that never entered the apply phase**, an **empty**
  report, an **absent** report, or a **mixed** report.

**The slice-to-epic collapse is all-or-nothing, deliberately.** A slice in `applied (review pending)`
means code was applied but its review did not converge; calling that epic-level success would let the
runner start the *next* epic on top of unreviewed code — the exact hazard `ptp-full-apply` halts on.

### WRITE 2 — persist the terminal status

- **converged** → `status: in-review`, **clear `runBaseline`**, write.
- **not converged** → `status: blocked`, **append** a single line recording the terminal state to
  `notes`, **clear `runBaseline`**, write, and **HALT the run**: no further epic is taken and no ready
  set is recomputed.

**This is the only point at which the runner clears `runBaseline`.** The other clears are
`0036_03`'s, and its set is wider than "the disposition edit": **every** edit that settles a stale
`in-progress` entry clears the baseline in the same write — **any disposition**, the **ungated reset
of the availability table's first row**, and a **cancellation**. Two of those three carry no
disposition at all, so `/ptp:backlog-edit`'s disposition edit is **not** the sole other clear, and the
invariant below depends on the set being enumerated completely.

So a lingering `runBaseline` means an **un-reconciled crashed run and nothing else — once no backlog
run is live**. **That qualifier is required, and this skill of all artifacts must carry it:** WRITE 0
sets `in-progress` and `runBaseline` in one write *before* the epic's work begins, so between WRITE 0
and WRITE 2 a perfectly healthy in-flight run presents **identical stored state** to a crashed
one, and v1 has **no multi-writer locking** to tell them apart. `0036_01` words its stale flag
conditionally and `0036_03` words its gate refusals the same way; this runner is the component that
*creates* that ambiguity, so **no sentence here asserts that a lingering baseline proves a crash**.
The invariant states what a lingering baseline *means* once no run is live — never a claim the store
can tell.

**`notes` handling: append, never replace.** The runner appends **one** line and never replaces
existing content, and it **writes `notes` nowhere else**. `notes` is user-facing free text; clobbering
it would destroy the user's own record. A dedicated per-attempt terminal-state field is a v2 seam
belonging to `0036_01`'s schema, not something this skill invents.

**The baseline clear is a payload write, dispatched before the commit.** That keeps the inherited
*every settling edit clears `runBaseline`* enumeration **complete**: the clear is in the **same write
group**, merely not the same **dispatch**. The halt path's `notes` append is an **outright-set scalar**
and therefore carries **no** pre-write check.

### Why two writes, not one

**WRITE 1 is never coalesced into WRITE 2.** Coalescing them would mean a crash between `/ptp:full`
returning and the status write loses `changeEpics` entirely, **orphaning real change folders** from
the entry that produced them. The split makes the backlog↔change link durable **as early as
possible**.

### The crash shapes this runner hands to `/ptp:backlog-edit`

`/ptp:backlog-edit`'s reconciliation **gate** is the consumer of these shapes — it keys on *any*
`changeEpics` id, whatever its attribution, **or** any undispositioned `attributionWarnings` entry —
so the runner must leave exactly these shapes in the fields it writes:

| Killed at | `status` | `runBaseline` | `changeEpics` | `attributionWarnings` |
|---|---|---|---|---|
| during `/ptp:full` (after WRITE 0) | `in-progress` | set | **unchanged from before the take** — empty on a first attempt, the retained prior-attempt ids on a re-taken entry | unchanged from before the take |
| between WRITE 1 and WRITE 2, report named ids | `in-progress` | set | possibly **only `terminal-report` ids** | possibly non-empty |
| between WRITE 1 and WRITE 2, report present but naming **no** ids, **over a non-empty diff** | `in-progress` | set | **no id added by this attempt** (empty on a first attempt) | **non-empty** |

Row 1 is why WRITE 0 must not be read as a reset: a re-taken entry arrives carrying the prior
attempt's ids, so WRITE 1 **merges**. Row 2 is why the gate keys on *any* id rather than on
"unconfirmed ids exist" — an unconfirmed-only gate would wave that entry straight through to
`ready` and silently re-run work that already landed. Row 3 is the gate's warnings-only limb, and it
is this runner that produces it — the **non-empty diff** in its condition is what makes it that limb,
since the same kill point over an **empty** diff adds nothing at all (WRITE 1 row 6) and so presents as
row 1.

### The runner's transition scope

The status transition table is **owned by `ptp-backlog`** and is **cited, never restated**. The runner
performs **only the three rows whose performer is `/ptp:backlog-run`**:

- `ready` → `in-progress` (WRITE 0),
- `in-progress` → `in-review` (WRITE 2, converged),
- `in-progress` → `blocked` (WRITE 2, not converged).

**The runner writes `done` nowhere at all.** That value is reachable only through **guard 3**, whose
performer is `/ptp:backlog-continue`.

It introduces **no transition rule of its own**. And it **never resets an entry**, **never revives a
`cancelled` entry**, **never retries a `blocked` entry**, and **never dispositions an
`attributionWarnings` entry** — those are `/ptp:backlog-edit`'s acts.
