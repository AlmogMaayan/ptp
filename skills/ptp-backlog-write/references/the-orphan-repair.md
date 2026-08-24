> Loaded from skills/ptp-backlog-write/SKILL.md when: repairing an orphaned board item.
## The orphan repair

There is **one** orphan shape, not three: with the identity stage gone there is no identity row to key
on, and every board item is an entry, so there is no id-less card to distinguish.

**The shape.** W1 landed and the commit did not, so the item exists on the board carrying its **full
composed payload** with its **`Status` unset**. That is an **ordinary entry** carrying a
`malformed-entry` on `status` — **structural**, so every entry still renders and **the ready set is
withheld**. It is not an unmanaged item — there are none — and it is not a defect of the identifier.
And unlike the id-less card the old contract carried, it **does** block: the withheld ready set is
exactly what forces the repair.

**The repair the report directs:** **set the item's `Status` on the board to the intended `backlog`**, or
repair it through **`/ptp:backlog-edit` against the item's node id**. The report names the item by
**board node id and title**, states that its `Status` is unset and that an unset `Status` withholds the
ready set for the whole backlog.

**Why this destination is `backlog` while the recovery dispositions settle to `ready`.** An orphan
completes an **interrupted creation** — W1 landed and the commit did not — and `/ptp:backlog-add` is the
only creating writer in the plugin, so the *intended* status is the one that add commits; the recovery
dispositions act instead on an epic a human has asked to resume, and their destinations are the ones
`ptp-backlog`'s transition and disposition tables name — cited here, never restated.

**Applying the landed carrier record.** Where **every** payload field rides the carrier the creation call
itself wrote — which is the case under the landed mapping, `item-create` carrying title **and** body — the
restore step is **vacuous**, so the report directs **setting `Status` alone** rather than a
`/ptp:backlog-edit` pass that would change nothing. The ordering rule is unchanged; there is simply one
step to order.

**Scoped to what the operation can identify.** Where the enumeration did not complete there may be **no
node id and no title to print**; the report names every **observed** candidate and says so, rather than
claiming a complete list.

**The absent `status` is not softened**: no default is invented, and **no compensating delete is
offered**.

**Where the board's own automation stamps `Status` on add**, premise 1 below does not hold and the item
will carry a `Status` this operation never committed. That case is **reported, never worked around**: the
report names the **observed** value, does **not** claim the commit landed, does **not** assert the value
is the intended `backlog`, and directs the user to **inspect the item before any repair**. No new
detection step, no automation probe, and no compensating write is introduced — the obligation is on the
report's honesty, not on a new branch of behavior.
