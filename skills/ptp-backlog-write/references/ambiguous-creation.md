> Loaded from skills/ptp-backlog-write/SKILL.md when: deciding whether an ambiguous creation happened.
## An ambiguous creation is the one exception

The exactness argument above covers **field writes only**. **W1 is not a field write**, and an ambiguous
**create** is the one outcome a single-field re-read cannot resolve: if the response is lost there is
**no field to re-read and no board node id to read it from**, so neither verified-landed nor failed can
be asserted honestly. A **retry is worse here than anywhere else**, because a create that in fact landed
would yield a **second item**.

The journal's **board-node-id fallback is unavailable here too**, which is why the ordinary
name-the-orphan path cannot be met and the scan below exists.

### The node-id capture and the three-way boundary

`gh project item-create --format json` publishes `{"id","title","body","type"}`, and **`.id` is the
`ProjectV2Item` node id** — the entry's `id`. Capturing it is what W1 is for beyond creating the card.

**This table is the whole boundary. It has three dispositions and no fourth.**

| Observation of the W1 call | Disposition |
|---|---|
| exit **0**, **parseable** JSON, and a **non-empty `.id`** | **captured** — every journal row carrying the literal `unidentified` is **rebound** to it, the later commit row included, and the report says they were **rebound** |
| an exit **the `gh` transport contract classifies as unambiguously pre-application** — a connection refused, a DNS failure, a rate-limit response that performed no mutation | this contract's **existing bounded retry with backoff** runs first, exactly as for any pre-application failure; **on its exhaustion**, the existing **`failed`** row, and **no scan** |
| **anything else** — a non-zero exit that is **not** unambiguously pre-application, a timeout, a killed process, unparseable stdout, or valid JSON carrying **no `.id`** | an **ambiguous W1**, routed to the **board scan** below |

**Why the second row keeps the inherited retry instead of narrowing it.** A failure that **provably
performed no mutation** cannot yield a second card, so the retry prohibition below **does not reach it**;
`failed` is what **exhausted** retries settle to, not what the first such exit settles to. **No new retry
rule is added here, and no bound is changed.** The two rows are **disjoint**: the retry is licensed
**only** by the unambiguous-pre-application classification, and the third row is *defined* by the absence
of that classification. The boundary therefore stays **three-way**.

**Why the third row is deliberately broad.** A create that **landed** and whose **response was lost** is
**indistinguishable** from one that never landed — and `gh` exiting non-zero *after* its mutation
succeeded is an **ordinary** way to reach that state, not an exotic one. Anything narrower would classify
a landed create as `failed` and invite the re-run that produces a second card.

**The retry prohibition on an ambiguous create is unchanged**, and it is not a new rule: it is the
existing *never retry an ambiguous outcome* rule reaching its **one non-field-write case**.
