> Loaded from skills/ptp-backlog-write/SKILL.md when: scanning the board after an ambiguous create.
## The board scan

A **read, never a write**, through `0042_03`'s read path, for an item matching the creation payload —
with the results read **against the snapshot's pre-existing match set, never in isolation**.

**Concretely, the scan is**

```
gh project item-list <projectNumber> --owner <projectOwner> --limit <N> --format json
```

read against that same pre-existing match set. The three-row resolution below is **unchanged**.

| Scan result, compared to the snapshot's match set | Resolution |
|---|---|
| **exactly one new** match — however many pre-existing matches the scan also finds | **every W1 row** is `landed (verified by re-read)`; the node id is **recovered from the scan**; the operation continues normally |
| **no new** match, from a scan that **completed** | nothing new was created → **every W1 row** is `failed`, and the operation **halts** |
| **more than one new** match, **or a scan that did not complete** | **every W1 row** is `unresolved`; the verdict is `unresolved-create` |

W1's rows resolve **together**, W1 being **one dispatch** — which is the carrier rule applied, not an
exception to it: the scan settles whether *the item* exists, and every field the create carried exists
exactly if it does.

The rows partition on the count of **new** matches — 0, exactly 1, more than 1 — crossed with whether the
scan **completed**. **Pre-existing matches are subtracted first and then ignored**, so a scan finding one
pre-existing and one new match is the **first** row rather than an unclassified case.

**The match predicate is the creation payload itself** — the composed **title and body** W1 was
dispatched with, compared for equality through the read path. Nothing narrower is available: the item's node id
comes into existence only with the item, and is exactly what the scan is trying to establish. It is
**unchanged** by this transport, and it needs **no extra call**: `item-list --format json` publishes an
item's **title and body** alongside its id.

### Why the comparison is not optional

The board **positively invites duplicates**: a human adds a card in one click, and an earlier partial
creation can leave an orphan whose payload matches a recomposed one. A scan read **in isolation** would
treat a **pre-existing** card as proof that W1 landed, and the operation would then **adopt a card it
never created as its own creation** — reporting that card's node id as the new entry's `id` and
dispatching the `status` commit onto it, silently taking over an unrelated entry.

Nothing is written onto the card to establish its `id`, so the hazard is **adoption**, not corruption of
an identifier — and the **novelty test is what keeps the created-item exclusion from the pre-write check
honest** along the recovery path, that exclusion resting on *an item **this same operation** created*.

**A match set that cannot be established is a snapshot failure, not one of these rows.** The operation
halts before dispatching anything, every W1 row is `not-dispatched`, and the verdict is **`refused`** —
classifying it `unresolved-create` would report that an item **may** exist when no create was ever
attempted.

**Two residuals, named rather than closed:**

- a human creating an **identically composed card** inside the same window is indistinguishable from the
  operation's own create;
- a human **editing** the just-created card inside the same window makes it stop matching, so a
  **completed** scan finds no new match and records `failed` while it in fact landed.

Both fall under the attestation, and **neither is a reason to downgrade every no-match scan to
`unresolved-create`**, which would forfeit the exact answer the scan usually gives.

### "Bounded" bounds the effort, never the conclusion

Only a scan that **enumerated every item in the project** may yield the `failed` row, because `failed`
asserts *nothing was created* and a scan that **stopped early cannot support that assertion** — a false
`failed` reports "nothing on the board", which invites exactly the re-run this section forbids and the
second item it would create.

So the scan **enumerates completely**, bounded by the board's size, and a scan that **cannot** be
completed for any reason is treated exactly like one that failed: **`unresolved-create`, never
`failed`**.

**On this transport that rule gains a checkable test, a named way to violate it, and a stated remedy.**

> **A scan may yield the `failed` row ONLY where it enumerated EVERY item, established by
> `length(.items) == .totalCount` on the SAME response.** `item-list --format json` publishes both.

**The concrete hazard is `--limit`, whose default is 30.** A scan run **without an explicit limit** on a
board holding more than thirty items is an **incomplete** enumeration — and it exits **successfully**,
so nothing else in the response announces it. Such a scan SHALL yield **`unresolved-create`**, never
`failed`.

**The remedy, stated alongside the hazard so neither travels without the other:** the scan passes an
**explicit `--limit` sufficient for the board**, and a response that nevertheless fails the completeness
test is **re-enumerated at a limit at least that response's own `.totalCount`** before any conclusion is
drawn.

**That re-enumeration is not a retry.** The scan is a **read**, and the *never retry an ambiguous
outcome* rule governs **re-dispatching the create** — which is untouched, and stays forbidden. No
outcome, verdict or stage is added, and **`unresolved-create` remains the floor** wherever completeness
still cannot be established.
