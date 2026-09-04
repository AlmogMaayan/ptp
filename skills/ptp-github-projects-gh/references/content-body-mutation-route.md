> Loaded from skills/ptp-github-projects-gh/SKILL.md when: writing a title/body onto a non-draft (repository) board item's content.
## The content-body mutation route

> An existing **non-draft** board item's content **title** and **body** are written by `gh api graphql`
> invoking the content type's **own update mutation** against the **content node id**, carrying the
> **title and the body in one mutation**.

That is the whole admission, and it is **closed**: the two mutations below are the only mutations this
contract admits through the passthrough, and no other mutation SHALL be issued through it.

| Admitted mutation | Target input field | Type | Carries |
|---|---|---|---|
| `updateIssue` | **`id`** | `ID!` | `title: String`, `body: String` |
| `updatePullRequest` | **`pullRequestId`** | `ID!` | `title: String`, `body: String` |

The same two mutations are enumerated as **admitted operations** in
[the companion table beneath the surface table](#the-gh-surface); that table records **who may issue
them**, and this section records **what they are and how they behave**. The set is the same set in both
places and SHALL NOT diverge.

**The two target field spellings differ and are not interchangeable.** `updateIssue` takes its target
under `id`; `updatePullRequest` takes its under `pullRequestId`. Nothing about the two mutations warns
you of that asymmetry, so an implementation that assumed one spelling for both fails on **exactly one**
of the two content types — and only against a **pull-request-backed** board item, the rarer case, so the
failure is discovered late. Both spellings are therefore named here, and a generic *"the update
mutation's id field"* description is explicitly not sufficient.

**Verification provenance.** Both input shapes were **introspected first-hand against the live GitHub
GraphQL schema**, at **`gh` 2.89.0** — the same version [The gh surface](#the-gh-surface) records the
rest of the surface as verified against.

**`updateProjectV2DraftIssue` is deliberately not admitted.** A draft item already has a working
**in-board** route through `gh project item-edit`, and admitting a second route to the same carrier would
leave two ways to write one thing with **no rule choosing between them** — precisely the ambiguity a
closed admission exists to avoid.

### The admission's closed scope

The admitted mutations write **a title and/or a body, and nothing else**.

- **No** state, labels, assignees, milestones, or project membership. `UpdateIssueInput` accepts several
  of those; every one of them is **outside** the admission.
- **No** create, close, delete, lock, or transfer of an issue or pull request.
- **No board field value.** A board field value stays on the **field-value route**, which is
  `gh project item-edit`'s and is untouched by this admission.

**The board node identifier is not an input to these mutations.** `projectId` is the field-value route's
required argument and belongs to that route alone.

A closed admission is what keeps this route from becoming *"the backlog can edit your issues."*

### The content node id is a dispatch coordinate, never an entry identity

The content node id is a **transport dispatch coordinate**, exactly as `projectId` is (see
[Why `projectId` is added](#why-projectid-is-added)). It **SHALL NOT** enter the entry model, any report,
or any identifier comparison. It is **not** the board item's own node id — which remains the entry's
identity — and it is **not** the board node identifier; the three SHALL NOT be conflated.

**This contract does not say how the content node id is obtained.** That is the read path's, and stating
it here would put a read-protocol fact into a transport contract that binds itself to state none.

### Why `gh issue edit` / `gh pr edit` remain not admitted

Their rejection is a **decision rather than an absence**, and it rests on **two grounds that resolve
differently**. Both are recorded, because recording only the one that dissolves would misstate what the
admission costs.

- **Repository coordinates — this ground dissolves.** The porcelain addresses its target as a
  `<number>` plus `--repo <owner>/<repo>`, which is exactly what `skills/ptp-backlog-write/SKILL.md`
  cites as **unobtainable from the board read**. A global node id **is** the address and needs none of
  those coordinates, so this ground does not stand against the node-id route at all.
- **Blast radius — this ground is accepted, not dissolved.** The admitted mutation writes **the same
  real repository issue or pull request** the porcelain would have: the same object, with a body visible
  outside the board to that repository's watchers, and the edit recorded in that object's **own edit
  history**.

**The consequence, stated in terms:** admitting this route means backlog content lands in a **real
repository object outside the board**. **The node-id route does not make the write board-confined**, and
nothing in this contract is to be read as saying that it does. A later reader could otherwise infer —
reasonably, from the porcelain having been rejected and this route admitted — that the admitted route is
somehow contained to the board. It is not, and blocking that inference is what this paragraph is for.

Two further reasons the node-id route is the better one **even where the porcelain would work**: one
mutation carries **both** carriers, preserving in shape the joint title/body dispatch the draft route
already has; and `gh api graphql` is **already** an enumerated row whose version is verified, where
admitting the porcelain would add two subcommands with a second flag set to verify and a second failure
vocabulary to interpret.

### A GraphQL error list is a failure regardless of exit status

A passthrough response carrying a **non-empty GraphQL `errors` list is a failure**, whatever the exit
status was. It is **never** reported as a partial success and **never** reported as a landed write. This
is the passthrough's form of rule 4's *only a zero exit is success*: the passthrough can exit **zero**
while reporting that the call did not succeed, so the error list is read rather than the exit status
alone.

**The classification is *failed*, and that is not the same claim as *nothing landed*.** GraphQL admits a
response carrying **both** `data` and `errors`, so an error list establishes that the call **failed**; it
does **not** establish that the target object was left untouched. The contract therefore says only what
the response supports: the outcome is a failure, and the object's resulting state is **not established by
this response**. What a failed content mutation obliges its caller to do next — re-read, re-dispatch, or
stop — is the **write path's**, and this transport contract states none of it.

