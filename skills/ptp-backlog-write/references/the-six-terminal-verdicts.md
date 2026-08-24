> Loaded from skills/ptp-backlog-write/SKILL.md when: reporting the terminal verdict of a write group.
## The six terminal verdicts

| Verdict | Condition |
|---|---|
| `complete` | **every planned row** is `landed` / `landed (verified by re-read)` / `skipped-identical` — the commit row included **when the operation plans one** |
| `refused` | **nothing was dispatched** — an inherited refusal, the backstop refusal, a snapshot that could not be completed, or a pre-write-check halt at the first planned row |
| `uncommitted-partial` | dispatch began, **at least one planned row did not succeed**, and **no orphan remains** |
| `uncommitted-partial (orphan item)` | the same failure condition **and** W1 landed **and the item is still there** |
| `unresolved-create` | W1's response was **ambiguous** and the board scan could not settle whether an item was created. Reachable **only** at W1 |
| `unresolved-commit` | the **commit** row is `unresolved`, so the transition **may or may not** have committed. Reachable **only** at **W3** |

**The partition, stated explicitly.** The two `unresolved-*` verdicts are separated **first**, each
recording that **one specific row's own outcome is unknown**; they **cannot collide**, because fail-stop
halts at the *first* unresolved row, so an operation that reached W3 at all had no unresolved W1. The
remaining four then partition on **three** questions asked in this order:

1. **did every planned row succeed?** → `complete`;
2. **was anything dispatched?** → if not, `refused`;
3. **does an item this operation created still exist on the board?** → if so,
   `uncommitted-partial (orphan item)`; otherwise the bare `uncommitted-partial`.

Asking the third about **the item** rather than about the row is deliberate: a human may delete the item
mid-sequence, in which case W1 landed yet there is **no orphan to name or repair**, so that case takes
the bare form and the report says the item **disappeared**.

**Four traps, each written as a trap rather than left to inference:**

- **An operation that plans no `status` write reaches `complete` with no commit row** and must **never**
  be reported `uncommitted-partial` merely because none was dispatched. The invariant is **vacuous**
  there, not violated.
- **A first-write failure is `uncommitted-partial` with an empty landed set, never `refused`** — a
  refusal asserts the store was **never touched**, and a dispatched-then-failed write cannot promise
  that.
- **The correct claim is *no `status` write can have landed*, not *none can have been dispatched*.** The
  commit **can** be the failing row, and on a status-only operation it is the **only** row and therefore
  the first dispatched. Being last stops anything from being dispatched **after** the commit; it does not
  stop the commit itself being attempted and failing.
- **An unresolved commit is the one reachable case in which a `status` write may in fact have landed**,
  which is exactly why it has its own verdict.

> **The scoping rule every consumer of a failed group inherits.** *No `status` write can have landed* is
> true of **five** verdicts; **`unresolved-commit` is the deliberate exception**. On that verdict the
> entry's status is **UNKNOWN**: the report SHALL name **both** possibilities, SHALL assert **neither**,
> SHALL prescribe **no** residual shape, and SHALL direct **inspection before any repair or retry**.
> Every downstream contract that names a resulting status on a failed group carries this exception
> **explicitly** rather than stating its status absolutely.

**One crossing the partition does not label: `unresolved-commit` on a creation.** W1 landed, so an item
exists whose `status` **may** be absent and which may therefore withhold the ready set for the whole
backlog — yet the **orphan label is withheld**, because asserting it would assert the commit failed. The
**report** SHALL state that the item's `status` may be absent, what an absent `status` costs, and that
the orphan repair above applies **only if** `Status` is in fact unset. It SHALL assert neither
outcome.

**`committed-partial` is absent because the backstop refusal makes it unreachable** — a derivation, not
an omission.

### The creation constructs are REACHABLE, and how each is reached

A superseded plan (`0047_04`) derived the constructs below as **unreachable by construction**, on the
ground that its transport had **no create affordance** at all. On the `gh` transport that derivation is
**reversed**, and it is said here so that a reader of the superseded plan is not misled.

| Construct | Under the superseded plan | Here | Reached by |
|---|---|---|---|
| **W1** | unreachable | **reachable** | `gh project item-create` |
| the journal's `entry = unidentified` | unreachable | **reachable** | **every** row of a creating operation at journal-build time, before the node id exists; **rebound** at capture |
| **the board scan** | unreachable | **reachable** | an **ambiguous W1** |
| **`unresolved-create`** | unreachable | **reachable** | a scan finding **two or more** new matches, or a scan that **could not establish completeness** |
| **the orphan repair** | unreachable | **reachable** | W1 landed and the commit did not |
| `committed-partial` | unreachable | **still unreachable** | — the backstop refusal is **untouched** |

**Exactly one construct keeps its derived-unreachable status**, and it is `committed-partial`, on its
existing derivation and no new one.

**Nothing about the journal's cardinality moves.** It still enumerates **six** outcomes and **six**
terminal verdicts, unchanged in **number**, **name** and **meaning**. None is added, none removed, none
renamed.

**The one exclusion from the partition's domain.** A snapshot that **completes** and yields a document
with a **fatal** problem terminates **outside** the partition's domain: no journal is planned, nothing is
dispatched, so it carries **no verdict at all** and is reported through the inherited problem vocabulary
exactly as the load-and-validate gate reports it. It is **not** a seventh verdict and **not** `refused`.

**The ground is WHERE the failure and its repair lie — never whether an operation had been "formed".** A
formation-based ground cannot support the split, since an **incompletable** read yields no usable
document either while keeping the verdict `refused`. The criterion is:

- a **completed** read yielding a **fatal** document is a defect in the **data**; its repair is a data
  repair and its contract is the **problem vocabulary** — the journal reports on **dispatches**, and this
  is not one;
- a read that **cannot be completed** is a **transport** outcome — a failure of the very channel the
  writes would have used — which is exactly what the journal exists to name, so it keeps `refused` with
  every plannable row `not-dispatched`.
