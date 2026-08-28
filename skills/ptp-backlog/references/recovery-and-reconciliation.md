> Loaded from skills/ptp-backlog/SKILL.md when: recovering an entry left in a stale in-progress state.
## Recovery and reconciliation

**A stale `in-progress` entry** is one whose `status` is `in-progress` **and** whose `runBaseline` is
**non-null**. The invariant this contract keeps is that, **once no backlog run is live**, a lingering
`runBaseline` means an **un-reconciled crashed run and nothing else**: the runner clears it on
`in-review` and on `blocked` alike, and every settling edit below clears it too.

**A live run presents the identical on-disk state, and nothing here claims otherwise.** The runner
writes `in-progress` and `runBaseline` in a **single** write **before** its work begins, so a read of
the store **cannot distinguish** a running epic from a crashed one, and `/ptp:backlog` therefore words its
stale flag **conditionally** rather than asserting a crash. v1 has **no multi-writer locking** (a
non-goal), so `/ptp:backlog-edit` cannot detect a live run either — and unlike the view its writes are
destructive, since settling clears the baseline a live run would itself have consumed. The rule:
**invoking `/ptp:backlog-edit` against a stale entry is the user's attestation that no backlog run is
live for it**, and the command's wording — in its report and in **every** gate refusal below — matches
`/ptp:backlog`'s: *un-reconciled from a crashed run only if no backlog run is currently live*. **No
sentence of this contract asserts that a crash occurred.** The invariant above states what a lingering
baseline *means* once no run is live; it is not a claim that the store can tell.

### The change-prefix set (defined here, used by both the snapshot and the diff)

The `runBaseline` snapshot and the reconciliation diff below MUST be computed over the **identical**
prefix set — a diff between two differently-defined sets is meaningless — so the set is defined **here,
exactly once**, and every writer (`/ptp:backlog-run`'s snapshot in `0036_04`, reconciliation in
`0036_03`) **cites this definition rather than restating one**:

```
prefixes = { leading 4-digit group of each folder name matching ^\d{4}_ }
           over  folder names directly under openspec/changes/   (excluding "archive")
               + folder names under openspec/changes/archive/
                 with each leading YYYY-MM-DD- date prefix stripped
```

**The scan is rooted at the invocation's resolved workspace root.** Every `openspec/…` literal above
is workspace-relative — that anchoring rule is the `workspace` capability's own, owned by
`ptp-workspace` and cited here rather than restated — so the snapshot and the diff must be taken at
the **identical root** as well as over the identical definition. A diff whose two sides were scanned
at different workspace roots is not meaningful, and no artifact describes such a diff as meaningful.

**Nothing is persisted to make that so.** `runBaseline` gains no workspace field, no entry field is
added, and the store's version marker stays `1`. The cross-invocation case — a baseline snapshotted
under one workspace root and reconciled under another — is therefore met by **disclosure rather than
prevention**: every reconciliation and every settling edit **names the workspace root it scanned the
current set at**, so a diff taken against a baseline from elsewhere is visible in the report instead
of silent. No report asserts that such a mismatch **occurred** — the store carries nothing with which
to establish one.

This mirrors `ptp-change-selector` § 4's epic allocation deliberately — the same scan, over the same
two locations — so **active and archived** change epics both count and a change **archived during the
run window does not read as a disappearance**. Each prefix is carried **as a string**, leading zeros
significant, exactly as a `changeEpics` element's `id` and an `attributionWarnings` element are.

### Reconciliation — runs first, and is always additive

Reconciliation runs **before** the gate below, wherever a **non-null `runBaseline`** is being settled —
on a **stale** entry, and in the unset-or-out-of-enum-status repair the previous section routes here (a null
`runBaseline` has nothing to diff — see *The hand-edited entry* below):

1. Compute the **current** prefix set per the definition above, at the invocation's **resolved
   workspace root**.
2. `recovered = current \ runBaseline`.
3. For each prefix in `recovered`, in **ascending** order:
   - **already in `attributionWarnings` → skip.** That prefix was already judged *not* this epic's on
     authoritative evidence; sweeping it in here would be exactly the **silent union** the warnings
     field exists to prevent.
   - **already in `changeEpics` → leave its attribution unchanged.** Reconciliation **never downgrades
     provenance**: the diff finding a `terminal-report` id again is not evidence against the report
     that produced it.
   - **otherwise → append** `{ id, attribution: "folder-diff-unconfirmed" }`.
4. Reconciliation **removes nothing and relabels nothing**.

The reconciliation report **names the resolved workspace root** the current set was computed at,
beside the prefixes it recovered.

### The hand-edited entry — `in-progress` with a null `runBaseline`

Only a hand edit can produce this state. Such an entry is **not reconciled** — there is nothing to diff
against — but **the gate below still applies**, evaluated on the entry's **existing** `changeEpics` and
`attributionWarnings` holdings, and any refusal **states that no diff was possible**, so the user is
never told a diff was run that was not.

It follows that **the gate's trigger is `in-progress` with a status-changing instruction — not
*stale*.** Only the reconciliation step is conditioned on a non-null baseline. Keying the gate on
staleness instead would let the null-baseline entry slip past it entirely. (An edit that touches only
fields of an `in-progress` entry changes no status and is therefore not gated at all.)

There is exactly **one** further trigger, in the mirror-image case: an entry whose stored `status` is
**unset or out of enum** but whose `runBaseline` is **non-null**. Its status cannot be read as `in-progress`, yet
the baseline is the runner's own evidence that a run was taken, so the *Repairing a `status` that is unset or out of
enum* rule above routes that repair through **this same machinery** — reconciliation, this gate, an
offered disposition, and guard 2 when the destination is `cancelled`. Stating it here keeps the trigger
enumerated in one place: **`in-progress` with a status-changing instruction, or a non-null
`runBaseline` under an unset-or-out-of-enum-status repair.** Nothing else is gated.

### The gate

An **ordinary reset is refused** while the entry holds **any `changeEpics` id — whatever its
attribution — or any undispositioned `attributionWarnings` entry**. Both halves of that key matter:

- Keyed on **"ids exist"**, not **"unconfirmed ids exist"**, because the hazard is *change folders
  already exist for this epic*, and a `terminal-report` id proves that as well as a provisional one does.
  The runner writes `changeEpics` **before** the status write, so a crash **in that window** leaves an
  entry carrying **only** `terminal-report` ids and no provisional id at all — which an unconfirmed-only
  gate would wave straight through to `ready`, silently re-running work that already landed.
- Keyed on **warnings too**, because a stale entry carrying only warnings would otherwise slip through
  ungated, and an undispositioned warning is an unexamined *"did this epic mint that folder?"*.

### The availability table

Evaluated on the **post-reconciliation** state. An id is **confirmed** when its `attribution` is
`terminal-report` or `user-confirmed-reconciliation`, and **provisional** when it is
`folder-diff-unconfirmed`.

| Entry holds | Gate | Dispositions offered |
|---|---|---|
| no `changeEpics` ids and no `attributionWarnings` | none | ordinary reset — nothing to reconcile |
| `attributionWarnings` only (no `changeEpics` ids) | gated | **promote** each warned prefix → `changeEpics` as `user-confirmed-reconciliation`, status → `blocked`; or **dismiss** it as another session's work, status → `ready`. The id-level dispositions do not apply — there is no id to claim, disown, or re-run against |
| provisional ids only | gated | **claim**, **disown**, **rerun anyway** |
| any **confirmed** id (alone or alongside provisional ones) | gated | **claim**, **rerun anyway** — **`disown` is withheld** |

**`disown` is withheld the moment a confirmed link exists** because it is the one disposition that
returns the entry to `ready` while asserting *nothing was done here* — and a confirmed id is direct
evidence that something was. Dropping only the provisional ids and resetting would leave a confirmed
link proving prior work while the entry re-enters the ready set unacknowledged: a silent duplicate run.
A user who wants to re-run regardless does so through **rerun anyway**, which carries the duplication
acknowledgement explicitly.

**`attributionWarnings`, when present, are dispositioned in the same edit in every gated row.**

**The warnings-only row is not a dead case.** The runner persists `attributionWarnings` while the status
is still `in-progress`, and a `/ptp:full` report can be present yet name no change ids while the folder
diff still finds a prefix — that prefix lands in `attributionWarnings` with `changeEpics` still empty. A
crash in that window leaves exactly this shape.

### Disposition outcomes

| Disposition | `changeEpics` outcome | Status |
|---|---|---|
| **claim** | **only** `folder-diff-unconfirmed` ids are relabelled, to `user-confirmed-reconciliation`. Every already-**confirmed** id — `terminal-report` *and* any pre-existing `user-confirmed-reconciliation` — keeps its existing attribution **untouched** (never downgraded, never re-stamped: vouching for the recovered ids says nothing about the authoritative ones, and re-stamping an already-vouched id would be a write with no meaning) | `blocked` |
| **disown** | **only** `folder-diff-unconfirmed` ids are dropped; every **confirmed** id (`terminal-report` or `user-confirmed-reconciliation`) is **retained with its attribution unchanged** — disowning an inferred link cannot un-say a `/ptp:full` report, or a human, that named the id, and dropping those would destroy the one authoritative backlog↔change link the schema exists to hold. Offered only per the table above | `ready` |
| **rerun anyway** | **every** id retained, **no** id relabelled | `ready`, with the duplication acknowledged in the report |
| **promote** (**per warned prefix**) | the prefix is removed from `attributionWarnings` and appended to `changeEpics` as `user-confirmed-reconciliation`. If the prefix is **already** in `changeEpics` — a state reconciliation cannot create, but a runner write or a hand edit can — the warning is **still removed**, the **existing element keeps its attribution**, and **no second element is appended**, since ids are unique within the array and provenance is never downgraded | see *Combining* below |
| **dismiss** (**per warned prefix**) | the prefix is removed from `attributionWarnings` and is **not** added to `changeEpics` | see *Combining* below |

**`promote` and `dismiss` are per-prefix**: an entry carrying three warnings may promote one and dismiss
two in a single edit.

**No disposition lands an entry in `backlog`.** A disposition that returns an entry to the run queue
restores the state the runner took it from, and the runner takes only `ready` entries; landing recovery
in `backlog` would silently demote work a human had already promoted.

### Combining an id disposition with warning dispositions

| Combination | Status |
|---|---|
| `claim` + any warning disposition | `blocked` |
| `rerun anyway` + any warning disposition | `ready` (duplication explicitly accepted) |
| `disown` + `dismiss` only | `ready` |
| `disown` + any `promote` | **refused as self-contradictory** — `disown` asserts nothing here was this epic's work; `promote` asserts a warned prefix was |
| warnings only, any `promote` present | `blocked` |
| warnings only, all `dismiss` | `ready` |

Any `promote` is evidence of prior work, which is why it pulls toward `blocked` — the same reasoning
that lands `claim` on `blocked` — except under `rerun anyway`, which explicitly accepts duplication.

### Every settling edit clears `runBaseline` in the same write

**Every** edit that settles a stale entry clears `runBaseline` in that same single write: **any
disposition**, **the ungated reset of the availability table's first row**, and **a cancellation**. The
ungated reset is named explicitly because it is the easiest of the three to miss — an entry with
nothing to reconcile still carries a baseline that must go. One edit outside this section carries the
same obligation for the same reason: the **unset-or-out-of-enum `status` repair** above, which moves an entry out
of the `in-progress` space where a baseline could still be consumed.

Left set, the baseline would have three consequences, each worse than the last:

1. `/ptp:backlog` would go on flagging an **already-settled** entry as stale;
2. **guard 2** would **re-gate** a settled attempt;
3. a later `/ptp:backlog-run` taking the entry would write a **fresh** baseline **over** the stale one —
   so the stale value is not merely noise, it is **silently destroyed evidence**.

### Recovery never yields `done`

**No recovery path, no disposition, and no combination of dispositions may set `done`.** An instruction
asking for it is **refused with the reason**, never silently downgraded.

*Every slice landed in `processed`* — `processed` meaning applied **and code-review converged** — is
what defines **`in-review`**; `done` requires, on top of that convergence, the **archive** only
`/ptp:backlog-continue` performs. Recovery can prove **neither**. A crashed run has no in-session
terminal report, and **no durable artifact substitutes for one**. `ptp-review-loop` does now write a
`kind = code` marker — `stages/code.json`, carrying a content fingerprint — so code-review convergence
is no longer traceless; but that marker is **change-scoped, review-only, and per-prefix**, and recovery
needs an **epic-scoped** fact about **both** halves. It says nothing about the **archive** `done` also
requires; it exists only for whatever prefixes actually reached a terminal review, which is precisely
what a crashed run cannot be assumed to have done for **all** of `changeEpics` (an unreviewed slice
leaves no marker, and a `cap-reached` one authorizes nothing); and a marker is meaningful only once its
fingerprint is **recomputed against the current content**, which is an act of the invocation that
consumes it, not a fact recovery can read off disk. Rather than invent the missing half of an evidence
rule, v1 forbids the outcome: `claim` —
the only disposition that *keeps* the recovered work — lands on `blocked`, and the user re-runs
explicitly; the other two land on `ready` precisely because they discard the claim that the work is
finished. A wrongly-`done` epic would **record shipped work that was never reviewed**, and both
`/ptp:backlog` and `/ptp:backlog-continue` would stop offering it as work a human still needs to
finish.

**The durable code-review-convergence marker remains the named seam** an evidence-based `accept`
disposition would be built on. Half of it now exists (`stages/code.json`); the archive half, and the
epic-scoped per-prefix roll-up above it, do not — and **no disposition consumes the marker**. This rule
is therefore unchanged by the marker's arrival, and its absence is still not a v1 gap.

**Guard 3's two rows — `blocked` → `done` and `in-review` → `done` — do not weaken this rule; they
sidestep it.** `/ptp:backlog-continue` reaches `done` from either source **not** by accepting an
assertion about a past run but by **settling every prefix itself, in the same invocation**: it runs
`/ptp:archive`, and it satisfies the review gate either by **performing** `/ptp:review-full` or by
**re-proving** an eligible marker's fingerprint against the content it is about to archive, at that
moment (see **guard 3**). Either way the fact it relies on is established in-session; nothing is
inferred from disk **unverified**. Nothing here becomes reachable from recovery: a
disposition still lands on `blocked` or `ready`, and a stale `in-progress` entry still has no path to
`done` — or to `in-review` — at all.

### An ambiguous instruction against a gated entry is refused

An instruction against a gated entry that does **not unambiguously name a disposition the table offers
for that entry** is **refused, with the offered dispositions printed**. This is a **refusal, not a
clarifying question**: the commands consuming this contract are autonomous, so the safe response to
ambiguity is to **refuse** and show what is available, never to **ask** and never to guess.
