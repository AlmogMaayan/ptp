> Loaded from skills/ptp-backlog-write/SKILL.md when: recording the per-field write journal.
## The write journal

Before dispatching **anything**, the operation builds an in-memory journal of **one row per planned
FIELD, in dispatch order**:

| Column | Meaning |
|---|---|
| `#` | the ordinal — ordered by **dispatch**, and within one dispatch by canonical field order |
| `dispatch` | the **carrier write** that carries this row, shared by every row of **that dispatch**, the cell naming the **route** that carried it — the create, the draft item-edit, the content mutation, or the field-value write |
| `entry` | the item's **board node id** — the entry's `id` — or, on a creating operation before that id exists, the literal **`unidentified`** (see below) |
| `field` | the mapped field |
| `intended` | the intended value, elided past a stated length |
| `outcome` | exactly one of the six below |

**Why one row per field and not per write.** Several fields can share one carrier and therefore one
physical dispatch, so *one row per write* plus *`#` is the dispatch position* would contradict each
other outright — the rows of one body write would all have to claim one position. Splitting the two
columns resolves it and keeps what the journal is **for**, which is answering **which *fields* landed**
rather than how many calls were made. (The call count is reported separately.)

The shape is **well defined** for two stated reasons: the sequence's stages are **disjoint and cover
every writable-carrier mapped field exactly once**, so no field appears twice — and the two
no-writable-carrier stamps are never planned, so they were never journal rows to begin with; and every
planned row is assigned to
**exactly one** carrier, so the `dispatch` grouping is a **partition** rather than an overlap.

**The `entry` column carries the board node id, and its only other admissible value is the literal
`unidentified`.** There is no **intended** identifier marked unbound: nothing is allocated, so there is
no intended value to name, and the column may **never** carry a guessed, derived, or placeholder
identity.

**Why `unidentified` is needed at all, and why it is not the deleted third form.** The journal is built
**before anything is dispatched**, and on a creating operation the node id comes into existence **with
the item** — at W1. So at build time **every** row of a creating operation is written `unidentified`,
the later commit row included, and not merely W1's — the identity is missing from the *operation*, not
from a stage. **Every** such row is then **rebound** to the real node id the moment it is **captured at
W1**, or **recovered from the board scan** where W1's response was ambiguous, and the report says they
were rebound. Where the scan never settles it — the `unresolved-create` verdict — they **stay
`unidentified`**, and the report says **exactly that** rather than printing an identity the operation
does not have. (Under fail-stop nothing past W1 is dispatched in that case, so no row that stays
`unidentified` ever names a landed write.) The deleted third form asserted an identifier ptp had
minted; `unidentified` asserts **nothing at all**, which is the whole difference.

On an **edit**, every row's `entry` is known before dispatch and `unidentified` is unreachable.

**W1 is not an exception to *one row per planned field*, and must not be turned into one.** The create
call is **one carrier write of two carriers** — the item's title and its body — so on a creating
operation the mapped fields those carriers hold (`title`, and every body-carried field) each get **their
own journal row**, all sharing the **W1 dispatch** exactly as the carrier rule prescribes for any shared
carrier, and all therefore sharing W1's outcome. The `dispatch` cell names the create; a **creation
marker** is a **dispatch label, never a substitute row**. Collapsing those six fields into one marker row
would defeat what the journal is for — *which fields landed* — precisely on the operation that writes
the most fields at once, and would make the claim that the stages cover every mapped field exactly once
true only by courtesy.
