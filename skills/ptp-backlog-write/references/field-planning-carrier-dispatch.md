> Loaded from skills/ptp-backlog-write/SKILL.md when: planning which fields a write touches.
## A field is the unit of planning; a carrier is the unit of dispatch

The landed mapping puts **ten entry fields on five board carriers**, and in particular puts
`description`, `changeEpics`, `attributionWarnings`, `runBaseline`, and `notes` on **one** — the item
**body**, the last four inside its metadata block. So several planned rows can share one physical write.

> **A mapped field is the unit of *planning*: it gets its own journal row. A carrier is the unit of
> *dispatch*: every planned row sharing a carrier is dispatched as ONE write of that carrier, at the
> canonical position of its EARLIEST constituent field, and those rows share that one write's
> outcome.**

Each row additionally records **which carrier write dispatched it**, so rows sharing an outcome visibly
share a **cause** rather than coincidentally agreeing.

Every W2 row is assigned to **exactly one** carrier, and the carrier partition sums to the mapping:

| Carrier | Planned rows it can carry |
|---|---|
| the item's content **title** | `title` |
| the item **body** | `description`, `changeEpics`, `attributionWarnings`, `runBaseline`, `notes` |
| the `Status` custom field | `status` (W3) — the option written is the **first name in the resolved row that the board offers** (below) |
| the two board stamps | *(never written — `createdAt`, `updatedAt`)* |
| **no carrier at all** | *(never written — `id`)* |

**`id` occupies the second row on purpose, and not the stamp row.** `ptp-backlog` — which owns the
mapping — says the node id is the **item's own identity, not a carried value**, and counts **five**
carriers with `id` outside them. Folding it into the stamp row would quietly make it a sixth carrier
here and put this contract at odds with its owner on the very concept this identity model turns on. The
two rows are equally unwritable, but for **different reasons**: a stamp has a carrier the board owns and
exposes no setter for, while `id` has **nothing to write to**.

**Four consequences:**

1. **Fields sharing a carrier land together or not at all.** A split between them is **unreachable
   through that carrier**, and **no report may present one as a live outcome** while they share it.
2. **The `runBaseline`-clear ordering decision is unaffected and strengthened.** The clear shares the
   body with the two reconciliation appends, so ground 1 below holds **a fortiori**; what the decision
   really governs is **body before `status`**, two genuinely distinct carriers.
3. **The pre-write check is run per planned field row, while the halt it triggers stops the whole
   dispatch that carries it** — a carrier is unwritable in part, so the halt cannot be narrower than
   the write it prevents. Its rationale **strengthens**: a blind carrier write drops a concurrent edit
   to **every** field that carrier holds, not one. (Where one dispatch carries **two** carriers — the
   joint title/body write below — the halt therefore reaches both, which is the same rule and not a
   second one.)
4. **Exactness is stated at carrier granularity.** Re-reading **one field** stays exact — a field is
   readable on its own whatever carries it — but *a write sets one field of one item* holds only for
   **single-field** carriers.

**Two skip rules, stated because "share the outcome" and `skipped-identical` would otherwise collide:**

- A row whose **own** value already matches is **still** `skipped-identical`, even when the dispatch
  carrying it went out for a sibling row. A failed carrier write leaves the carrier unchanged, so such a
  row's value is still its intended one.
- A **dispatch** **all** of whose planned rows are `skipped-identical` is **not issued at all**.

**No sentence of this contract assumes one mapped field equals one dispatch.**

### On this transport the title and body carriers are dispatched together

> **ONE dispatch carries BOTH the item's content TITLE carrier and the item BODY carrier, on EVERY
> content type** — on W1 (`item-create`), on W2's draft route (`item-edit --title --body`), and on W2's
> content-mutation route (`updateIssue` / `updatePullRequest`) alike. The two carriers are **never split
> across two dispatches**.

This **generalizes to W2** the sentence this contract already applies to W1 — *the create call is one
carrier write of two carriers* — and it is a **backend fact on each route, not a convention**: on the
draft route `gh` puts both values into **one** `UpdateProjectV2DraftIssueInput` and mutates **once**, as
`EditDraftIssueItem`; on the content-mutation route the admitted mutation likewise takes the title and
the body in **one input object** and applies them in **one** mutation (the `gh` transport contract's,
cited and not restated). On neither route is there an invocation that writes one carrier as a separate
call from the other.

**Consequence 1 — WHICH VALUES ARE SENT is derived per route, and the draft route's answer is NOT
carried across.** The joint dispatch above holds everywhere; this consequence does not, because its
ground is a property of `gh`'s draft route alone.

- **On the draft route both flags are always passed**, even when only one carrier has a planned row.
  Omitting one makes `gh` **fetch and re-send the other from its own read**, which would write back a
  body **ptp never composed**, over a body a concurrent hand edit may have changed. The value sent for a
  carrier with no planned row is therefore the one composed from the **fresh read of that carrier**, and
  the compose-from-a-fresh-read rule below is **load-bearing, not prudent**: it is what makes the
  unavoidable second value correct rather than destructive.
- **On the content-mutation route only the carriers with a planned row are sent.** An **omitted** input
  field is left **unchanged** by that mutation, so the hazard the draft rule exists to answer **does not
  arise**: nothing is re-sent from a read of `gh`'s own, and nothing can be written back that ptp never
  composed. A title-only edit therefore sends **the title alone** and leaves the repository object's body
  untouched.

  **That omitted-is-unchanged behaviour is a BACKEND FACT OF THE MUTATION, and it is the one fact of
  this route this contract states in its own name.** It is the patch semantics of `updateIssue` /
  `updatePullRequest`: the mutation applies **the input fields it was given** and touches no other field
  of the object. What the `gh` transport contract publishes is the mutation's **input shape** — both
  `title` and `body` **optional**, so one may be sent without the other — and its **closed scope**; it
  states nothing about what an omitted field does, so **no reader may take the sentence above for a cited
  fact, and no reader may derive it from the optionality alone**. It is recorded here, unverified at this
  contract's `gh` version, precisely so that a reader who doubts it knows exactly which sentence to test.
  **It is the sole ground of this bullet, and of nothing else in this contract** — the joint dispatch
  above, the route table, the fail-closed leaves and every outcome rule stand without it, so a
  falsification is confined to which values one route sends.

**Rejected: send both values on every content type, for uniformity.** Its appeal is real — one rule, no
case split, and the consequences below stay verbatim. It is rejected because on a non-draft entry it
would make a title-only edit **rewrite a live repository object's body** with a recomposed value **no
instruction asked for** — an extra external write, an extra entry in that object's edit history, and an
extra notification to its subscribers, bought with nothing but tidiness. And it is **irreversible**: a
repository edit cannot be withdrawn.

**Where a value IS sent for a carrier with no planned row — which on this contract means the draft route
— it is composed from the fresh read of that carrier**, and that rule is load-bearing exactly there.

**Consequence 2 — the skip rule takes the DISPATCH as its unit.** The title/body dispatch is omitted
**only** when **every** planned row it would carry — on **both** carriers — is `skipped-identical`; and a
row whose **own** value already matched is **still** `skipped-identical` even when the dispatch went out
for a sibling row, whether that sibling sits on the same carrier or on the other one. That is the two
skip rules above, read with the **dispatch** rather than a single carrier as the unit, so a dispatch
carrying only one carrier's rows is covered by the same sentence.

**Consequence 3 — halt propagation covers every carrier the dispatch carries.** A **pre-write-check
halt** on any planned row of the dispatch marks every **other** non-`skipped-identical` row **of that
dispatch** `not-dispatched`, because **nothing was sent**; a **dispatched-then-failed** or
**dispatched-then-ambiguous** write is **shared by every non-`skipped-identical` planned row of that
dispatch**, because those are the rows that **were** sent. **The two rules stay disjoint** — *nothing
sent* versus *sent and failed* — and both leave a **`skipped-identical`** row at its own outcome, exactly
as consequence 2 requires, so every planned row still carries **exactly one** outcome.

**What does not change, stated so the generalization is not over-read.** Title and body remain **two
carriers**: the carrier table's five rows stand, *a carrier is the unit of dispatch* stands as the
headline, and *a carrier write rewrites the whole carrier* stands as the premise. What this section adds
is only that **one dispatch may carry two of them**.

**Why every outcome rule below is written at DISPATCH granularity.** Before the co-dispatch, one
dispatch carried exactly one carrier, so *carrier write* and *dispatch* were interchangeable and this
contract used them so. They are not interchangeable any more. A rule that scopes a row's **outcome** to
a **carrier** now under-reaches: a halt or a failure on a **body** row would leave the same joint
dispatch's **title** rows with **no outcome at all**, which *exactly one outcome per planned row*
forbids. So every such rule below — the journal's `dispatch` column, the backwards-halt boundary and its
`not-dispatched` covers-exactly sentence, fail-stop's forward and backwards rules, the
mixed-verification rule, and the compose read's failure path — reads at **dispatch** granularity.

### Which `Status` option the commit writes

The `Status` carrier is the one carrier whose **content** is not simply the field's value: the entry
`status` is one of the values of the schema's `status` enum (`ptp-backlog`'s, never restated here), while
the board carries a SINGLE_SELECT **option** whose accepted
names come from `ptp-backlog`'s **resolved status-option table** (its default table merged with the
`backlog.statusOptions` overrides). So the carrier's content needs a rule, and this is it:

> **When an operation commits `status = S`, it writes the board `Status` option whose normalized name —
> trimmed and compared case-insensitively, the same normalization the read applies — is the FIRST name in
> the resolved table's row for `S` that the board's `Status` field actually offers.**

Three properties, in order of importance:

- **Deterministic.** Two boards offering the same options resolve the same name. The selection depends on
  board option **order**, **position**, and **color** not at all.
- **User-controlled.** The row is an ordered list the user writes, so *which spelling do you prefer* is
  answered by the configuration rather than by a preference of ptp's own.
- **Correct on a README-shaped board.** Under the default table (`ptp-backlog`'s, cited and not
  reproduced) the `ready` row resolves to `ready`, `Ready`; a board created per the documented setup
  offers `Ready` and not `ready`, so the rule selects `Ready`. **A rule of *always write the row's first
  name* is rejected** — it would select `ready`, which that board does not offer, and fail on the most
  common board there is. The **`backlog`** row behaves identically and is `/ptp:backlog-add`'s commit,
  which makes it the most common commit on a fresh board.

**One resolution step is appended, because `--single-select-option-id` takes an id and not a name:**

> **The option *id* W3 dispatches is the `id` of the entry, in the read path's published `Status`
> options, whose `name` NORMALIZES to the selected name — under the same trimmed, case-insensitive
> normalization the read and the selection above already apply.**

The `{ id, name }` pairs are the **read path**'s (`0047_06`), published with the snapshot and consumed
**as published**: no second board call is made for them, and nothing here re-fetches or re-derives them.

**The id is a consequence of the selected name, never an alternative selection key.** Board option
**order**, **position** and **colour** stay **unread** — that absolute is unchanged — and selecting by
id would quietly turn the determinism property the selection rule rests on into a property of the
published array's order, besides putting opaque board-generated strings into `backlog.statusOptions`.

### The commit refuses when the resolved row does not identify exactly one board option

> **Where the board's `Status` field offers NONE of the names in the resolved row for the status the
> operation must commit — or offers MORE THAN ONE option whose normalized name matches the selected name
> — the operation is REFUSED on the pre-dispatch snapshot, BEFORE W1.** Nothing is dispatched and the
> verdict is `refused`. The refusal names: the entry, the target status, the resolved row's accepted
> names, the board's actual `Status` option names, and **both** repairs — `/ptp:config →
> backlog.statusOptions`, or fix the options on the board. **ptp creates no `Status` option**, under any
> circumstance.

**That refusal is untouched by the id-resolution step above.** It is still evaluated over **names**, on
the **pre-dispatch snapshot**, **before W1** — so no stage, no verdict and no ordering concept moves,
and it is still the same single refusal covering both branches.

**One fail-closed leaf is added, and it is a third thing rather than a re-run of either.**

> **Where the selected name matches an option for which the read published NO id, the operation is
> REFUSED BEFORE W1**, naming the option and the missing id.

That is a **transport defect**, not a configuration one: the row did identify exactly one option and the
board does offer it, so it is **not the ambiguity refusal**; and the item's current value was never
consulted, so it is **not the no-op refusal**. It **must never be reported as either.**

**The ambiguous branch is never resolved by picking one.** Board option order, option position, and
option color are each the board-order dependence the selection rule above forbids, and it is the same
*never resolved by picking one* doctrine `ptp-backlog` already applies to a normalized-name collision on
a required carrier. Both branches are the same defect — *the resolved row does not identify exactly one
board option* — at the same moment, so they share one refusal, one verdict, and one placement.

**The ambiguity is a *write* concern only.** An item carries exactly one option, and every matching
option normalizes into the same row, so a **read** of that item yields an unambiguous `status` and raises
**no problem** on this ground.

**Why before W1 rather than at the commit.** On a **creation**, refusing at the commit would mean W1 had
already landed, leaving an item on the board with **no `Status`** — which is an **entry** carrying a
`malformed-entry` on `status`, withholding the ready set for the whole backlog and requiring the orphan
repair. And the repair would not work: the orphan repair *sets the item's `Status` to the intended
`backlog`*, which is the very write that has no option to select. A commit-time refusal would therefore
manufacture an **unrepairable** orphan out of a configuration typo. Refusing before W1 creates nothing
and leaves nothing behind.

**Two non-interactions, stated so neither rule is read into the other.**

- **This is not the no-op refusal.** *A status write that changes nothing is refused as a no-op* covers
  the different case in which the board **does** carry the option and the item already holds it. This
  refusal fires when the row identifies no option at all, and it must never be reported as a no-op.
- **The status-commit invariant is untouched.** It governs what must have **landed before** a commit is
  dispatched; this rule governs whether a commit is **dispatchable at all**, and it is evaluated before
  any payload row exists. Neither reads the other.

**It is a state-derived check under the existing snapshot rule.** The board's `Status` options arrive
**with** the snapshot, so this refusal drops into the slot *The pre-dispatch snapshot* already defines
for checks *evaluated on* the snapshot and explicitly permitted to still refuse: **no new stage, no new
verdict, no new ordering concept.**
