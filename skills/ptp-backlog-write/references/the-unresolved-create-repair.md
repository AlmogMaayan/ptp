> Loaded from skills/ptp-backlog-write/SKILL.md when: repairing an unresolved create.
## The `unresolved-create` repair

Keyed on the **observed new candidates** and on whether the **enumeration completed** — **never** on
which branch produced the verdict.

**No branch is offered for "exactly one new candidate from a complete enumeration": that combination is
unreachable from this verdict.** A complete enumeration finding exactly one new match resolves to a
verified landing and the operation **continues**, so `unresolved-create` arises **only** from two-or-more
new matches on a complete enumeration, or from an enumeration that did not complete. An unreachable
repair row invites an implementer to **synthesize the state that reaches it**.

**In every case, then** — two or more observed, or an enumeration that did not complete — the report:

- names **every observed** candidate by **board node id and title**;
- states plainly **when, and only when, the enumeration did not complete** that further candidates may
  exist. A **complete** enumeration finding two or more new matches **did** complete, so its report
  **SHALL NOT** claim otherwise: it names the full observed candidate set **as complete**;
- directs the user to **enumerate by hand and reconcile**, so that **at most one** card survives as this
  epic's entry and **every remaining stray candidate is removed or repaired**;
- SHALL **never** direct **re-running the creation**, which would risk a second item on top of an
  unknown first.

---

# The `runBaseline` clear: which residual is safer to leave

**The decision, first and in one sentence:**

> **The `runBaseline` clear is a payload write, dispatched in canonical field order — which places it
> after `changeEpics` and `attributionWarnings`, the two reconciliation appends — and the settling
> `status` write is the commit, dispatched last of all. The accepted residual is an entry left
> `in-progress` with a null `runBaseline`.**

The candidates and their residuals, before the justification, so the rejected ones stay visible:

| Order | Dispatch sequence | Residual when it lands partially |
|---|---|---|
| **A — chosen** | every reconciliation append → clear `runBaseline` → write `status` | **`in-progress` with a null baseline** — unreconcilable, nothing to diff |
| **B** | write `status` → the appends → clear `runBaseline` | a **settled** entry with a stale baseline, possibly **without its appends** |
| **B′** | every append → write `status` → clear `runBaseline` | a **settled** entry with a stale baseline, its appends durable — the **steelman** |

**The clear is NOT "last among the payload writes".** Canonical key order puts `notes` **after**
`runBaseline`, so the clear is not last **in row order**. And under the landed carrier mapping `notes`
shares the **body** carrier with the clear and the two reconciliation appends, so canonical order orders
the **rows within one dispatch** rather than four dispatches in time: `notes` **co-lands** with the clear
and **cannot fail after it**.

**The only ordering this decision governs is therefore: the BODY write before the `status` write** —
genuinely two carriers and genuinely two dispatches. The guarantee the derivation needs is only *the
clear no earlier than every reconciliation append of the same operation*, which co-landing satisfies **a
fortiori**.
