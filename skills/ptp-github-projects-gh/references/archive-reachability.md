> Loaded from skills/ptp-github-projects-gh/SKILL.md when: deciding whether the board archive is reachable.
## Archive reachability

The field name **`archiveReachable`** and its three literals — `true`, `false`, and `"unknown"` — are
**preserved verbatim** from the retired contract. That preservation is deliberate:
`skills/ptp-backlog/SKILL.md` §*Degraded scope — when archived items are unreachable* and
`openspec/specs/backlog-github-projects/spec.md` §*Unreachable archived items degrade scope without
manufacturing defects* need **no edit**. The fact's consumers are unchanged; only its establishment rule
moves.

**The new rule.** The retired contract established the fact from a *fetched tool schema* and fell back
to `"unknown"` wherever no schema was inspected — a fallback that fired often, because presence could be
established by a route that inspects nothing. Here the question is answerable, because this contract
**admits `gh api graphql`**: the same binary, the same authentication, and the same scope as every other
call. The surface whose documented inputs decide the question is therefore the **ProjectV2 GraphQL
schema** rather than a wrapper's flag list. Consequently:

> Where the preflight **reached and passed S4**, `archiveReachable` carries this contract's established
> value — determinate, never `"unknown"`. `"unknown"` is reachable **only** where S4 was not reached or
> not passed, i.e. only under `unavailable`, where nothing about the board was established at all.

**THE ESTABLISHED VALUE IS BOUND HERE, AND ONLY HERE: `archiveReachable` is `true`.**

The evidence: the `ProjectV2.items` connection accepts a documented `archivedStates` selector whose enum
value domain explicitly includes `ARCHIVED`, and this contract **admits** `gh api graphql` — the same
binary, the same authentication, and the same scope as every other call in it — so the archived tier is
addressable by an **admitted call**, rather than inferred from a result set. `gh project item-list`'s
porcelain flag set still carries no include-archived input, but that limitation belongs to the porcelain
alone; it is not a limit of the schema the raw `gh api graphql` call in this contract reaches.

This value stays bound in **exactly one place** — this line — so a future transport that cannot address
the `archivedStates` selector, or otherwise cannot return the archived tier by an admitted call, is
corrected back **downward** here, never at a consumer. The exactly-one invariant is read over
**bindings**, not over occurrences — a statement *about* the binding is not a second binding. The note
that first-hand re-verification was not possible while this contract was first written — the planning
token then lacking `read:project` — survives only as **provenance of the retired `false`**: it explains
why that earlier binding could not be schema-verified at the time, and it is not a caveat on this `true`,
which rests on the schema evidence above.

**Three absolutes carry over verbatim.**

1. **Never inferred from a result set.** A complete fetch of a board holding no archived cards is
   byte-identical to an archive-limited fetch, so zero archived items coming back establishes nothing at
   all. This is the one mistake the field exists to prevent.
2. **It fails closed.** Never `true` without positive schema evidence. Being wrong toward `false` costs a
   **withheld ready set**, repaired by one line the moment the affordance is confirmed; being wrong
   toward `true` costs the backlog runner **executing the wrong epic**, discovered late. The asymmetry is
   not close.
3. **It never changes the verdict**, never adds a verdict to the closed set of three, and never adds a
   label to the STOP message's invariant label set.

**The named consequence.** With the established value `true`, `ptp-backlog`'s degraded-scope withholding
does **not** fire on this ground: the ready set is produced, an archived item is an ordinary entry in the
canonical order, and `/ptp:backlog-run` is startable. The **problem-based** withholding condition — any
`malformed-entry` anywhere — is entirely unaffected by this binding.

---
