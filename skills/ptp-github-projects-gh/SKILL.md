---
name: ptp-github-projects-gh
description: Own the backlog board transport, its configuration schema, capability preflight, and call contract
---

# ptp-github-projects-gh — which board, as which identity, and can I reach it

## Purpose

This skill is the **single source of truth** for two questions that belong together — *which board, as
which identity* (the `backlog.*` configuration and the acting `gh` account) and *can I actually reach
it* (the capability preflight).

It is a **pure prose contract**. It reads no file on its own, writes no file, runs no git command,
starts nothing, edits nothing, and changes nothing. Consumers **reference** it; no consumer restates any
part of it, and no consumer re-derives a rule it could take from here.

That is the same "the skill owns the rule" pattern ptp already applies elsewhere:

| Sibling contract | Owns |
|---|---|
| `ptp-branch-guard` | branch safety |
| `ptp-codex-mode` | the reviewer gate, and `codex.*` resolution |
| `ptp-agent-roles` | role resolution |
| `ptp-parallel-fanout` | fan-out safety |
| `ptp-backlog` | the backlog board contract |

This skill is the **reader** of the `backlog.*` keys; `ptp-config` is their **writer**, and the
`README.md` §Configuration section is their user-facing schema. The two postures are deliberately
asymmetric — see [Strict and forgiving are complementary](#strict-and-forgiving-are-complementary).

**This contract replaces an MCP-server transport contract, retired by `0047_05`.** The reason is
recorded in `openspec/changes/0047_01_backlog-projects-tool-shape-mismatch/analysis.md`: the eight
verbatim per-verb tool names that contract required matched **no live server**, and the consolidated
tool shape that does exist could carry neither five of the entry model's ten slots nor nine of its ten
writes. `gh` creates a draft item with a title **and** a body and edits both back, so the transport this
contract describes can carry the entry model the backlog already defines. Nothing about the backlog
store's own contract changed with the transport; that contract is `ptp-backlog`'s, and this skill states
none of it.

---

## Section index

Operation-scoped sections of this contract live in `references/`, each loaded on its own
trigger rather than with this file:

- `skills/ptp-github-projects-gh/references/the-shell-invocation-contract.md` — loaded when building a concrete gh call.
- `skills/ptp-github-projects-gh/references/the-stop-message.md` — loaded when emitting the non-silent preflight stop message.
- `skills/ptp-github-projects-gh/references/archive-reachability.md` — loaded when deciding whether the board archive is reachable.

## Backlog configuration

**Three** keys under one `backlog` parent. Two are scalars at the two-level depth every other ptp
parameter uses; `backlog.statusOptions` is a **map**, so its members sit one level deeper at
`["backlog","statusOptions",<status>]` — the **first three-level path in the schema**, and the reason
`/ptp:config`'s parent-shape rule and parent-creation clause each gain a second level.

| Key | `jsonPath` | Kind | Default | Meaning |
|---|---|---|---|---|
| `backlog.projectOwner` | `["backlog","projectOwner"]` | string | unset | the GitHub org or user **login** owning the board |
| `backlog.projectNumber` | `["backlog","projectNumber"]` | integer `>= 1` | unset | the board's project number |
| `backlog.statusOptions` | `["backlog","statusOptions"]` | **map** | **unset** | per-status board option names; unset means **the built-in default table**, and each unconfigured status keeps **its own** default row |

**No key names a transport endpoint, a server, an account, or a host**, because the acting identity is
resolved by `gh` rather than configured — see [The acting identity](#the-acting-identity).

**Board identity is owner-login + project-number, never a URL.** Those are exactly the two arguments
`gh project` itself takes — `--owner <login>` and the bare `<number>` — so the configuration is passed
to the call unchanged and no derivation stands between them. A single `projectUrl` would force a URL
grammar into the strict editor **and again** into the forgiving reader — scheme, host,
`/orgs|users/<login>/projects/<n>`, and the trailing `/views/N` GitHub appends when you copy the
address — and would leave every consumer re-deriving owner and number from a string. A bare `--owner`
login resolves for organizations and user accounts alike, so no `ownerType` key is needed.

### Layered resolution

Global first, then project overriding **key by key** — the identical two files and precedence
`codex.mode`, `review.*`, `telemetry.*`, `roles.main`, and `parallel.*` already use:

```
projectOwner     = unset
projectNumber    = unset

for path in [ ~/.claude/ptp/config.json,            # global first
              <repo>/.claude/ptp/config.json ]:     # then project (overrides)
    if file missing, unreadable, or not parseable JSON: continue      # ignore the layer
    obj = parsed root; if obj is not an object: continue
    b = obj.backlog; if b is not an object: continue

    if b.projectOwner is a string:
        t = trim(b.projectOwner)                        # trim FIRST, then test t
        if t is non-empty
           and t contains no "/", no whitespace, and no "://":
            projectOwner = t
    if b.projectNumber is a JSON number that is an integer >= 1:
        projectNumber = that value

# every missing file / missing key / parse error / wrong type / invalid value
#   -> leave the prior value in force (ultimately the default)
# never throw, never STOP
```

A layer that is missing, unreadable, unparseable, has a non-object root, or has a non-object `backlog`
value is **skipped**, and each key is validated **independently** of the others.

Note that the pseudocode binds the trimmed value `t` **before** testing it. Every `projectOwner` test
therefore runs on the trimmed value, so the whitespace ban is a ban on **internal** whitespace only:
surrounding whitespace is stripped before the test and is never grounds to ignore the layer. Testing
the raw string would reject `" acme "`, which must resolve to `acme`; that reading is explicitly
non-conformant.

Four properties, each separately load-bearing:

- **(a) Per-key independence.** An invalid `projectNumber` in a layer does not discard that same
  layer's valid `projectOwner`, and does not reset an earlier layer's valid `projectNumber`.
- **(b) A default applies last.** A key's default applies only when **no** layer supplied a valid value.
- **(c) Trimming applies to the resolved value, not only to the validity test.** A valid string resolves
  to its **trimmed** form, so a hand-edited `" acme "` reaches a consumer as `acme`. Validating after
  trimming while resolving untrimmed is explicitly non-conformant.
- **(d) Resolution never throws and never STOPs.** A configuration typo must not fail an unrelated
  command that merely happens to resolve config.

### Resolving `backlog.statusOptions` — the same per-key reader, one level deeper

`backlog.statusOptions` resolves through the identical forgiving layered reader; the only difference is
that the unit of independence is a **status key inside the map**, not the map itself. A layer supplies no
status key at all unless it parses, its root is an object, its `backlog` is an object, **and** its
`statusOptions` is an object.

```
overrides = {}                                  # validated per-status overrides; {} means none

for path in [ ~/.claude/ptp/config.json,        # global first
              <repo>/.claude/ptp/config.json ]: # then project (overrides)
    if file missing, unreadable, or not parseable JSON: continue
    obj = parsed root;      if obj is not an object:  continue
    b   = obj.backlog;      if b is not an object:    continue
    m   = b.statusOptions;  if m is not an object:    continue   # supplies NO status key

    for s in [ "backlog", "ready", "in-progress", "in-review", "done", "blocked", "cancelled" ]:   # canonical order
        if s is a key of m:
            raw = (m[s] is a string) ? [ m[s] ] : (m[s] is an array ? m[s] : nothing)
            if raw is nothing: continue                       # wrong type -> ignore THIS key only
            if any element of raw is not a string: continue   # wrong shape -> ignore THIS key only
            names = [ trim(x) for x in raw ]
            drop from `names` every element that is empty,
              and every element equal to an earlier one ignoring case   # order-preserving
            if names is non-empty:
                overrides[s] = names
            # else: leave the prior value in force (ultimately the default row)

# keys of `m` outside the seven are IGNORED — never an error, never written by the editor
# resolution never throws and never STOPs
```

Four consequences, each separately load-bearing:

- **(a) Per-status independence.** Each of the seven status keys is validated and applied
  **independently**: an invalid `ready` in a layer does not discard that same layer's valid `done`, and
  does not reset an earlier layer's valid `ready`. The whole map is never discarded because one status
  key is invalid.
- **(b) The default applies per row, last — and it is applied by `ptp-backlog`'s merge, never
  substituted by this resolver.** A status for which no layer supplied a valid override simply gets **no
  entry** in `overrides`; this resolver never substitutes a default row, because it does not hold the
  default table (see [the ownership split](#ownership-split-for-backlogstatusoptions)). The merge in
  `ptp-backlog` is what leaves that status at its own built-in row. The net effect is that a status's
  built-in row applies only when **no** layer supplied a valid override for **that status**.
- **(c) Trimming applies to the resolved value.** A hand-edited `" Shipped "` reaches the table as
  `Shipped`, exactly as `projectOwner` already does.
- **(d) An empty row is invalid, not a wildcard.** `""`, `[]`, `[""]`, and `["   "]` all resolve to no
  names, which would make the status **unreadable *and* unwritable** — a self-inflicted lockout with no
  repair path except a hand edit — so the row falls back to its own default. **An empty element among
  non-empty ones is dropped, not fatal:** `["Backlog", ""]` resolves to `Backlog`, because the row still
  yields a usable name and the reader's posture is to survive a hand-edit typo rather than punish it.
  Only a row that survives with **no** names is invalid. (The STRICT editor still **rejects** such input
  outright — the ordinary STRICT/FORGIVING asymmetry, not a divergence.)

A wrong-typed member is **ignored rather than fatal** for the same reason every other key's invalid value
is: the reader's first prohibition — *it must not throw or STOP* — is absolute, and a `backlog.*` typo
must never fail an unrelated command that merely happens to resolve config. The strict editor cannot
produce any of these values; only a hand edit can, which is exactly the class of input the forgiving
posture exists to survive.

### Completeness verdict

Evaluated **once, on the resolved combination** — never per layer. Key-by-key precedence legitimately
lets a global layer name the board while a project layer overrides the number, so requiring a single
layer to carry a complete set would break the precedence rule this contract just stated.

The rule is one invariant:

> The configuration is **complete** when `projectOwner` and `projectNumber` both resolved.

Its output is a **verdict, not an action**:

```jsonc
{
  "projectOwner":      "…" | unset,
  "projectNumber":     7   | unset,
  "complete":          true | false,
  "missing":           ["backlog.projectOwner"],  // the missing REQUIRED CONFIGURATION KEY names of
                                               //   THIS verdict, FULLY QUALIFIED — only ever
                                               //   `backlog.projectOwner` and/or
                                               //   `backlog.projectNumber`, because a consumer renders
                                               //   this list as the keys the user must set and an
                                               //   unqualified `projectOwner` names no config key;
                                               //   [] when complete. Unrelated to the retired
                                               //   preflight-record field of the same name, which is
                                               //   dropped — see "Why each dropped field is dropped".
  "statusOptionOverrides": { "done": ["Shipped"] }  // validated per-status overrides; {} when none
}
```

**`statusOptionOverrides` is always an object, never null and never absent.** It carries only those
statuses for which some layer supplied a valid value, each mapped to that status's resolved, trimmed,
de-duplicated list of names, and it is `{}` when no layer supplied any — so a consumer reads it without a
presence check and without a nullity check, the same property `complete` and the verdict's own
missing-key list already carry. A status **absent** from it means *no override resolved for this
status*; the verdict **never substitutes that status's built-in default row**, because applying the
default is the merge, and the merge belongs to `ptp-backlog`. The verdict carries **no** collision field,
**no** resolved table, and **no** default table.

### Ownership split for `backlog.statusOptions`

This skill owns the **key**: its JSON path, its kind, its per-status-key validity rules, its layered
forgiving resolution, and the publication of the validated per-status overrides on the configuration
verdict. `ptp-backlog` owns the **built-in default table**, the **merge** of overrides onto it, the
**resolved table's** matching semantics, and the **collision rule**. This skill therefore never needs to
know the default table, and never states it.

That split is not a convenience — it is the boundary this contract already binds itself to: this skill
**SHALL NOT define, restate, or alter the backlog's entry model**, read protocol, validation vocabulary,
status transition table, status option table, or ready-set definition. Those belong to `ptp-backlog` (see
the sibling-contract table in [Purpose](#purpose)), and a collision is a property of the **resolved**
table, which needs the default table this skill deliberately does not hold.

### The two prohibitions

1. **It must not throw or STOP.** A backlog setting must never fail an unrelated command that happens
   to resolve config. Resolution is forgiving, full stop.

2. **It must never silently proceed.** An incomplete or unactionable configuration must produce a
   **non-silent refusal**: never a warn-and-continue, never a partial operation, and **never a read,
   creation, or write of a local file in place of the configured board**.

**The identity limb of prohibition 2 lives in one other place.** Never acting against an identity the
user did not establish is governed by [The acting identity](#the-acting-identity), which closes it
structurally rather than by prohibition: there is no identity for ptp to substitute, because there is
none for it to choose.

Because a resolver that never STOPs cannot itself refuse, **the refusal is a consumer's obligation** —
see [Consumer obligations](#consumer-obligations), and `0047_02_backlog-config-gate-enforcement` for the
gate's placement and its one-refusal-per-writer rule.

### Migration from the retired transport's configuration key

The retired MCP contract owned a fourth key naming its server. It is retired with **no replacement**,
because the identity is now resolved by `gh` and there is nothing left to name.

A `backlog.mcpServer` left behind in a user's `config.json` is **not read**: the forgiving reader above
consults only the keys it knows, exactly as it already ignores unrecognized `statusOptions` members. It
is never an error, never a warning, and never removed by ptp — `/ptp:config` writes values and never
removes keys, an existing documented limitation. `backlog.projectOwner`, `backlog.projectNumber`, and
`backlog.statusOptions` keep their JSON paths, kinds, validity rules, layered per-key resolution,
trimming, and defaults, so **no user action is required** and no stored board, item, or node id is
invalidated.

### Cross-layer half-configuration

A project layer that sets only `projectNumber` inherits the global layer's `projectOwner`, so it can
resolve `complete: true` while pointing at the **wrong** board. This is documented as a consequence of
key-by-key precedence and is deliberately **not** enforced: introducing whole-block precedence for one
key group would diverge from how every other ptp parameter resolves, and the divergence would be
invisible at the point of use.

### Strict and forgiving are complementary

|  | Writer | Reader |
|---|---|---|
| Where | `skills/ptp-config/SKILL.md` + `commands/config.md` | this skill |
| Posture | **STRICT** — invalid input is rejected and re-prompted, never written | **FORGIVING** — an invalid *layer* is ignored; never throws, never STOPs |
| Interactive | yes (`AskUserQuestion`) | no |

The editor's writable set is a **subset** of what this resolver accepts — the resolver additionally
tolerates surrounding whitespace, which only ever arrives from a hand edit — so the editor can never
write a value the resolver would reject. The two postures must **not** be aligned: softening the editor
would write useless values, and hardening the resolver would break its never-STOP contract.

---

## The acting identity

> The identity ptp acts as has exactly **one** source: `gh`'s own resolved active account for the
> resolved host. ptp neither selects it nor overrides it — it passes no `--hostname`, sets no `GH_HOST`,
> `GH_TOKEN`, or `GITHUB_TOKEN`, and never runs `gh auth switch`, `gh auth login`, `gh auth logout`, or
> `gh auth refresh`.

There is exactly one source and there is no second one. No configuration key supplies the identity, no
constant of this contract supplies it, no environment override supplies it, and no observation of the
session supplies it.

**Why this replaces and strengthens the retired two-source server-name rule.** That rule needed a
companion never-adopt-from-observation absolute because a server name was a value ptp *chose* — from a
configuration key or from a contract constant — in a session where several plausible **wrong** choices
were visible by name, and adopting one of them would have written to another organization's board. Here
there is no inventory of candidate identities to observe and no name for ptp to pick: the identity is
**read and disclosed, never decided**. The prohibition is discharged by structure rather than by rule.

**The hazard is relocated, not eliminated.** More than one account can be authenticated at once, and the
one `gh` treats as active is the one ptp will act as. That is a place the **user** controls and ptp
**discloses**, which is why the identity is a **mandatory, provenance-carrying rendering position**: the
resolved account and host appear in `/ptp:backlog`'s header and in every failure's `account:` label,
always annotated as **resolved by `gh`**, never as a configured value and never as a contract constant.
A configuration key SHALL NOT be named as their source, none having supplied them.

**Rendering-position discipline.** Carried forward from `0047_02_backlog-config-gate-enforcement`: **a
rendering-position exemplar — any filled-in example of a value a consumer must itself emit — SHALL NOT
be populated with a live account, owner, or board.** Every exemplar in this contract, the preflight
record's included, therefore uses `<login>` / `<owner>` / `<n>` placeholders. A live name placed in a
template reads as a value to copy, which is the whole failure mode the discipline exists to prevent.

---

## The gh surface

> A subcommand's existence is a property of the **binary**, not of the session. This contract therefore
> probes no subcommand, publishes **no** `present` list, and publishes **no** `missing` list.

That single rule replaces the retired contract's eight-name probe, its two-tier required set, its
anti-truncation floor, and its loaded-vs-deferred inventory taxonomy. A tool-schema lookup asked *this
session* what it could call, and could be wrong in both directions; `gh --version` succeeding tells you
that the whole subcommand surface of that binary is present, because it ships as one executable.

The surface this contract's calls are built from is therefore **enumerated**, one row per subcommand:

| Call | Used by |
|---|---|
| `gh --version` | preflight stage **binary** |
| `gh auth status` | preflight stage **authentication**, and stage **token scope**, from the same payload |
| `gh project view` | preflight stage **board reachability** |
| `gh project field-list` | `0047_06_backlog-gh-read-path` — the board's status field and its options |
| `gh project item-list` | `0047_06_backlog-gh-read-path` — the entries |
| `gh project item-create` | `0047_07_backlog-gh-write-path` — create a draft entry |
| `gh project item-edit` | `0047_07_backlog-gh-write-path` — title, body, and field writes |
| `gh project item-archive` | `0047_07_backlog-gh-write-path` — archive an entry |
| `gh api graphql` | archive reachability, the **write path's content-body write**, and whatever `0047_06` / `0047_07` cannot express through `gh project` |

**The one row per subcommand property is preserved, so the admitted *operations* of the one
non-porcelain row are enumerated separately** — this companion table, one row per admitted mutation:

| Admitted mutation | Target input field | Carries | Path admitted to issue it |
|---|---|---|---|
| `updateIssue` | `id` (`ID!`) | the `title` and/or `body` of an **issue**-backed item's content | the write path (`skills/ptp-backlog-write/SKILL.md`), and no other |
| `updatePullRequest` | `pullRequestId` (`ID!`) | the `title` and/or `body` of a **pull-request**-backed item's content | the write path (`skills/ptp-backlog-write/SKILL.md`), and no other |

**Why a companion table rather than a second surface row.** The two tables answer **different
questions** — *which binary surface is called* versus *which operations of one surface are admitted, and
to whom*. Separating them is what lets the mutation admission be **closed and enumerable** while the
subcommand table stays a plain **inventory**; a second `gh api graphql` row would break the one-row-per-
subcommand property, and naming the mutations inside that row's *Used by* cell — which names the
**path**, deliberately, and not the operations — would overload an inventory cell with per-operation
detail. The admission itself is specified in
[The content-body mutation route](#the-content-body-mutation-route).

**Both tables are documentation, and neither is a probe target** — the rule immediately below and the
version rule after it bind them both.

**This table is documentation of the surface, not a probe target.** Nothing in this contract asks
whether a row exists before calling it; a call that fails is handled by the exit-code rule in
[The shell-invocation contract](#the-shell-invocation-contract). A future change to the `gh` surface is
therefore **one edit here**, not a per-consumer accommodation.

**The version rule.** `gh --version` establishes presence and **captures** the version onto the record.
Every flag in this contract was verified against **`gh` version 2.89.0**. A lower version is
**reported, never refused**: the captured version rides the record and is rendered on the `gh:` line of
every failure report, and the preflight never refuses on version alone — refusing against a floor that
was never tested would reject working configurations to guard a hypothetical.

---

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

---

## Capability preflight

```
GH-PREFLIGHT(resolved backlog configuration):
  # PRECONDITION (0047_02, unchanged): the invoking command has already taken the
  # configuration gate as its own first action and did not refuse. The preflight is
  # therefore only ever reached with a COMPLETE configuration and a non-colliding
  # resolved status-option table.
  # Runs AT MOST ONCE per ptp invocation, memoized in memory on
  # (projectOwner, projectNumber). NEVER persisted.

  ghVersion = account = host = tokenSource = projectId = null
  scopes    = []
  writeScope = "indeterminate"
  contentScope = "indeterminate"
  archiveReachable = "unknown"   # ALL THREE SET AT INIT, NOT AFTER THE VERDICT.
                                 # Every stage below RETURNs, so a field first
                                 # assigned after the verdict branches would be
                                 # assigned on NO stopping path — leaving it
                                 # undefined under exactly the verdicts the record
                                 # requires it to carry a value under. Initializing
                                 # them here is what makes "never null" true on
                                 # every path, for contentScope exactly as for
                                 # archiveReachable and writeScope.

  ── S1 BINARY ────────────────────────────────────────────────────────────────
  stage = "binary"
  run `gh --version`
     not on PATH
        -> verdict = unavailable, cause = BINARY_CAUSE(not on PATH), RETURN
     on PATH, non-zero exit
        -> verdict = unavailable, cause = BINARY_CAUSE(`--version` failed,
                                                       gh stderr verbatim), RETURN
     zero exit
        -> ghVersion = the version token on the first output line, or the literal
                       "unreported" where no version token can be bound from it
           # S1 does NOT refuse on an unbindable version token — the version is
           # REPORTED, never refused, so a binary that works while printing an
           # unexpected banner must not be turned away. Binding "unreported"
           # instead of leaving null is what keeps the record's "ghVersion is null
           # ONLY when S1 failed" invariant true on this path. This is NOT the S4
           # `.id` case: a null projectId would leave 0047_07 unable to build a
           # required argument, whereas an unbound version blocks nothing.

  ── S2 AUTHENTICATION ────────────────────────────────────────────────────────
  stage = "authentication"
  run `gh auth status --active --json hosts`
     # exits 0 unless FATAL: the state is read from the JSON, never from the exit
     # code, and never from the human-readable (non-JSON) rendering
     # `hosts` is a MAP keyed by host, so more than one host may carry an active
     # entry. ptp passes no --hostname and sets no GH_HOST, so the entry taken is
     # the one for the host `gh` itself would call — its own default host. Where
     # that cannot be decided from the payload, S2 FAILS rather than picking one:
     # a guessed host is a guessed identity, which is what the acting-identity
     # rule forbids. Constructibly: --active yields at most one active entry per
     # host, so where the payload carries EXACTLY ONE active entry in total, that
     # is the entry; where it carries MORE THAN ONE, no single entry can be
     # identified and S2 FAILS. A host is NEVER hardcoded, defaulted to
     # `github.com`, or otherwise inferred — that is the guess this rule exists
     # to prevent.
     entry = the active entry for gh's own default host
     non-zero exit, or stdout does not parse as JSON,
       or no host entry, or no entry with active == true,
       or no single such entry can be identified for gh's default host,
       or that entry's `state` != "success",
       or that entry's `login` or `host` is absent, not a string, or empty
                                                          after trimming
        -> verdict = unavailable,
           cause = AUTH_CAUSE(gh stderr verbatim where the call exited non-zero;
                              otherwise which of the conditions above held), RETURN
           # The login/host limb is the S4 `.id` argument applied to the identity:
           # S2 must not PASS with an unbound account or host, because the record
           # declares both non-null wherever S2 passed and every surface that
           # renders a board identity MUST render them. An unbound identity has no
           # legal rendering, so it is a stage failure — "not established" — and
           # never a passing verdict carrying a blank.
     otherwise
        -> account     = trim(entry.login)
           host        = trim(entry.host)
           tokenSource = entry.tokenSource where it is a non-empty string,
                         else the literal "unreported"    # never null past S2

  ── S3 TOKEN SCOPE ───────────────────────────────────────────────────────────
  stage = "scope"
  # read from the SAME S2 payload — no second call, so no second observation
  scopes = (entry.scopes is a string)                   # gh emits ONE comma-joined
             ? split(entry.scopes, ",") each trimmed,   #   string, not an array
               dropping every empty element
             : []          # absent, wrong-typed, or empty -> [] , never a throw:
                           #   the reader's never-throw prohibition is absolute, and
                           #   an uninterpretable scope list is exactly the
                           #   "indeterminate" case below
     # contentScope rides the SAME S2 payload and the SAME `scopes` list — no
     # second call and no second observation, so property (e) "S3 costs no call"
     # is preserved. It is bound BEFORE the writeScope branches below, so S3's own
     # stopping RETURN carries S3's value out with it rather than the init value.
     # It NEVER sets a verdict and NEVER returns.
     "repo"        in scopes                    -> contentScope = "yes"
     "public_repo" in scopes, "repo" not        -> contentScope = "indeterminate"
     neither in scopes AND scopes is non-empty  -> contentScope = "no"
     scopes is []  (absent, empty, unparseable) -> contentScope = "indeterminate"

     "project"      in scopes                  -> writeScope = "yes"
     "read:project" in scopes, "project" not   -> writeScope = "no"
     neither in scopes AND scopes is non-empty -> verdict = unavailable,
                                                  cause = SCOPE_CAUSE, RETURN
     scopes is []  (absent, empty, unparseable)-> writeScope = "indeterminate"

  ── S4 BOARD REACHABILITY ────────────────────────────────────────────────────
  stage = "board"
  run `gh project view <projectNumber> --owner <projectOwner> --format json`
     non-zero exit
        -> verdict = unavailable, cause = BOARD_CAUSE(gh stderr verbatim), RETURN
     zero exit, stdout does not parse as JSON
        -> verdict = unavailable, cause = BOARD_CAUSE(unparseable), RETURN
     zero exit, parsed, but `.id` is absent, null, not a string, or empty
                        after trimming
        -> verdict = unavailable, cause = BOARD_CAUSE(no board id), RETURN
           # S4 does NOT pass on a merely parseable payload. Passing here with a
           # null projectId would break the record's "non-null exactly where the
           # board stage passed" invariant AND leave 0047_07 unable to build the
           # --project-id every non-draft field write requires. The test is
           # non-empty AFTER TRIMMING for the same reason `projectOwner`'s is: a
           # whitespace-only id is a non-empty string that constructs no usable
           # --project-id, so accepting it would reopen the hole this branch closes.
     zero exit, parsed, `.id` non-empty after trimming
        -> projectId = trim(parsed.id)

  ── VERDICT ──────────────────────────────────────────────────────────────────
     writeScope == "yes"           -> verdict = ready,     cause = null
     writeScope == "no"            -> verdict = read-only, cause = WRITE_SCOPE_CAUSE
     writeScope == "indeterminate" -> verdict = read-only, cause = UNKNOWN_SCOPE_CAUSE

  ── ARCHIVE REACHABILITY (defined on every path; input to NO branch above) ────
     # The "otherwise" case needs no line here: it is the INIT value above, which
     # every early RETURN already carries out with it. This block only ever
     # UPGRADES the initialized "unknown", and only where S4 passed.
     S4 reached AND passed -> archiveReachable = this contract's established value
```

The four stopping causes are `BINARY_CAUSE`, `AUTH_CAUSE`, `SCOPE_CAUSE`, and `BOARD_CAUSE`; the two
further causes `WRITE_SCOPE_CAUSE` and `UNKNOWN_SCOPE_CAUSE` ride a `read-only` result, which stops
writers only.

### Six properties, each separately load-bearing

**(a) Ordered, stopping at the first failing stage.** Running S4 after a failed S2 would report *"board
unreachable"* to a logged-out user — a transport error standing in for a one-command fix. That is
precisely the failure mode `skills/ptp-backlog/SKILL.md` §*Why the completeness verdict is step 0 and not
part of the preflight* already identifies at the configuration boundary; the ladder applies the same
principle **inside** the preflight, one layer out.

**(b) The last stage reached is published**, so a consumer names the failing layer without parsing a
cause string.

**(c) Every stage's mechanism is provably non-mutating.** `gh --version`, `gh auth status`, and
`gh project view` are reads. This is why the retired contract's *"the mechanism must be a lookup the
caller has established as non-mutating; where that cannot be established the step is skipped and the
cause degrades"* hedge is **deleted rather than carried forward** — it has no reachable case, and with
it goes every degraded rendering that was conditioned on the hedge having fired.

**(d) No short-circuit and no bypass.** Every stage runs on every invocation that reaches the preflight;
no configuration value skips one; nothing reaches `ready` without S1–S4 all passing.

**(e) S3 costs no call.** The scopes ride S2's payload. A separate scope probe would be a second
authentication read that could observe a different state between the two calls.

**(f) `archiveReachable` is defined on every path and is an input to no branch.** The **mechanism** is
initialization at entry, not placement: `archiveReachable` is set to `"unknown"` **in the init block**,
so every early `RETURN` carries a defined value out with it, and the trailing archive block only ever
**upgrades** that value, and only where S4 passed. The reason in one line: every stage returns, so a
field first *assigned* after the verdict branches is assigned on **no** stopping path, leaving it
undefined under exactly the verdicts the record requires it to carry a value under. Placing the block
later and relying on it to run is the bug this property exists to prevent, and **the init line is not to
be dropped while reproducing the pseudocode** — a reader who tidies it away reintroduces the defect.

### `contentScope` discloses; it stops nothing

`contentScope` is bound **inside S3, from S2's own payload** — no extra stage, no extra call, no extra
observation — and it is a **disclosure**. It **introduces no stopping branch**: unlike `writeScope`'s
absent-both case, it never sets a verdict and never returns.

**The asymmetry against `writeScope` is deliberate and is not leniency.** With **neither** Projects
scope, **no** backlog operation can reach the store at all, so `writeScope`'s absent-both case correctly
stops. With **no repository scope**, **every draft entry write and every board field-value write still
works** — the whole store stays readable and largely writable — so refusing on that ground would refuse a
**provably working configuration**. That is the same argument S3's indeterminate branch already makes one
layer up.

`contentScope` is therefore an **input to no branch**, exactly the property `archiveReachable` already
carries: it **changes no verdict**, **adds no verdict** to the closed set of three, **adds no stage** to
the four, and **adds no label** to the STOP message's invariant set of six. The repository scope it
reports is `repo` — or `public_repo`, public repositories only — which is **not** a Projects scope and is
**not** what the Projects-scope mapping decides.

**Why `public_repo` alone resolves `"indeterminate"` rather than `"yes"` or `"no"`.** Whether the target
repository is public is a fact **no stage reads** — S4 reads the board, never a repository — so both
determinate answers would be guesses. `"indeterminate"` is the honest cell, and because it authorizes
nothing it fails closed without refusing.

### Verdict mapping

| Verdict | Reached when | Reader | Writers |
|---|---|---|---|
| `ready` | S1–S4 pass and `scopes` contains `project` | proceed | proceed |
| `read-only` | S1–S4 pass and `scopes` contains `read:project` but not `project` | **proceed** | **STOP** |
| `read-only` | S1–S4 pass and `scopes` could not be established | **proceed** | **STOP** |
| `unavailable` | S1 failed (no binary) | **STOP** | **STOP** |
| `unavailable` | S2 failed (not authenticated / active account unhealthy) | **STOP** | **STOP** |
| `unavailable` | S3 failed (neither Projects scope, scopes established) | **STOP** | **STOP** |
| `unavailable` | S4 failed (board unreachable or unparseable) | **STOP** | **STOP** |

**1. This is a mapping, not an invention.** `gh` states both tiers itself. The read tier comes from a
failing read command's own stderr:

```
error: your authentication token is missing required scopes [read:project]
To request it, run:  gh auth refresh -s read:project
```

The write tier comes from `gh project --help`:

```
The minimum required scope for the token is: `project`.
You can verify your token scope by running `gh auth status` and
add the `project` scope by running `gh auth refresh -s project`.
```

Those two strings are the contract's evidence and its exact spellings. An implementation that matched
some other spelling would be nonconforming while appearing to satisfy the mapping.

**2. `project` is the superset.** A token carrying it reads as well as writes, so a token carrying
**both** scopes resolves `ready`, not `read-only`.

**3. Indeterminate scope fails closed toward `read-only`, and the asymmetry is not close.** By the time
scope is indeterminate, S4 has **demonstrated** reads by actually reading the board; nothing has
demonstrated writes. Resolving `unavailable` would refuse a provably-working read. Resolving `ready`
would send a writer at a token that may 403 partway through an ordered write sequence, on a store with
no backup, no history, and no compensating writes — see `openspec/specs/backlog/spec.md` §*Writers
fail-stop on the first failure and never issue a compensating write*. `read-only` is the only honest
cell.

**No fourth verdict is added**, and the two verdicts the retired contract had already deleted —
`not-applicable` and `misconfigured` — stay deleted: there is no non-Projects store, and there is no
configuration under which the preflight does not apply.

### Once per invocation

The preflight runs **at most once per ptp invocation**, memoized in memory on the resolved
`(projectOwner, projectNumber)` pair — re-keyed from the retired contract's server name, there being
none. Later backlog operations in the same invocation reuse the verdict.

- **Never persisted.** Not to a cache file and not into any store. A stored verdict outlives the auth
  state that justified it, and persisting anything would turn a read-only command into a writer.
- **It is not a liveness monitor.** It catches a broken transport at the invocation boundary. A token
  revoked mid-invocation surfaces through the failing call's own error path.
- **It is not a completeness check.** `ready` means *the ladder passed*, never *the backlog
  configuration is complete*. Completeness is the resolver's separate verdict, and
  `0047_02_backlog-config-gate-enforcement` owns its gate.
- **It is not an authorization guarantee — with one honest refinement.** The retired contract said a
  visible write tool says nothing about token scope. Here S3 *does* read the token's granted scopes, so
  this contract **may** say *"the token carries the `project` scope"* — but it **SHALL NOT** say *"this
  write will be permitted."* Repository- and organization-level project permissions are not token
  scopes, and a 403 remains a runtime failure belonging to the write path.

---

## The preflight record

This record is the **seam** `0047_06_backlog-gh-read-path` and `0047_07_backlog-gh-write-path` consume.
Twelve fields:

```jsonc
{
  "ghVersion":        "2.89.0",                       // null ONLY when S1 failed
  "account":          "<login>",                      // null ONLY when S2 not passed
  "host":             "github.com",                   // null ONLY when S2 not passed
  "tokenSource":      "keyring",                      // null ONLY when S2 not passed
  "scopes":           ["gist", "read:org", "repo"],   // ALWAYS an array; [] when unestablished
  "writeScope":       "yes" | "no" | "indeterminate", // never null
  "contentScope":     "yes" | "no" | "indeterminate", // never null
  "stage":            "binary" | "authentication" | "scope" | "board",  // last stage REACHED
  "projectId":        "<board node id>" | null,       // null ONLY when S4 not passed
  "verdict":          "ready" | "read-only" | "unavailable",
  "cause":            "…" | null,                     // null ONLY when verdict is "ready"
  "archiveReachable": true | false | "unknown"        // never null
}
```

The account above is a **placeholder**, chosen to be self-evidently one: this block is a rendering
exemplar — a filled-in template of values a consumer emits — not a fact about any account, so it names
none (see [The acting identity](#the-acting-identity)).

Per-verdict field table — *"unspecified" is not an available answer, because the record is a seam*:

| Verdict | `ghVersion` | `account` / `host` / `tokenSource` | `scopes` | `writeScope` | `contentScope` | `stage` | `projectId` | `cause` | `archiveReachable` |
|---|---|---|---|---|---|---|---|---|---|
| `ready` | set | set | non-empty | `"yes"` | `"yes"` \| `"no"` \| `"indeterminate"` | `"board"` | set | `null` | `true` \| `false` |
| `read-only` | set | set | non-empty or `[]` | `"no"` \| `"indeterminate"` | `"yes"` \| `"no"` \| `"indeterminate"` | `"board"` | set | non-null | `true` \| `false` |
| `unavailable` | set unless S1 failed (`null` there) | set unless S2 not passed (`null` there) | `[]` unless S3 ran (the split list there) | `"indeterminate"` unless S3 ran and S4 then failed (S3's own `"yes"` \| `"no"` \| `"indeterminate"` there) | `"indeterminate"` unless S3 ran (S3's own `"yes"` \| `"no"` \| `"indeterminate"` there) | the failing stage | `null` | non-null | `"unknown"` |

### Why each dropped field is dropped

The retired record carried four fields this one does not.

- **`serverName`** — there is no server to name. `account` + `host` are the *who am I acting as* fact,
  and, unlike a server name, they are **resolved by `gh`, never configured**, so there is nothing to
  adopt, substitute, or invent.
- **`namespace`** — there is no tool prefix, so there is no literal to contain. Two consequences follow,
  and the second is a strengthening rather than a loss. The retired contract's literal-namespace
  containment invariant permitted **exactly one** live repository file to spell an MCP tool-namespace
  literal — this contract's predecessor. That invariant **retires and is strengthened**: **no** live
  repository file spells an MCP tool-namespace literal **for this transport** at all. The invariant is
  scoped to *this transport's* namespace, so a literal belonging to an **unrelated** integration is
  neither residue of this change nor a deletion target for it.
- **`present`** — there is no per-session inventory to enumerate; see
  [The gh surface](#the-gh-surface).
- **`missing`** — the same, and `stage` replaces both. `stage` is strictly more informative: a stage
  names a **layer and a repair**, where a missing-tool list named a **symptom**. (The *configuration*
  completeness verdict keeps a field of its own by that name, carrying the missing required
  configuration key names. It is a different record and it is unaffected — see
  [Completeness verdict](#completeness-verdict).)

> **Describe the literal; never spell it.** This skill lives inside the tree that is swept for residue,
> so writing an MCP tool-namespace prefix into it — even inside a sentence prohibiting it — would make
> the skill its own residue and the sweep permanently red. The prefix is therefore **described** and
> never typed. The same rule bound the retired contract's own containment invariant, and is exactly why
> that invariant had to name one file as the single permitted place to spell one.

### Why `projectId` is added

`gh project item-edit --help` states the constraint the write path is built around:

> *"For non-draft issues, the ID of the project is also required, and only a single field value can be
> updated per invocation."*

Every non-draft field write `0047_07_backlog-gh-write-path` issues therefore needs `--project-id`.
Publishing it on the record has two reasons: the write path pays **no board call per write**, and — more
importantly — a re-fetch could observe a **different** project than the one the preflight admitted.

It is a **transport dispatch coordinate, never an entry identity.** The entry's identity is the board
item's own node id, per `openspec/specs/backlog/spec.md` §*The entry identifier is the board item's own
node id*, which this contract does not touch. `projectId` does not enter the entry model, any report, or
any identifier comparison.

### Why `contentScope` is added, and what it is not

Writing a body onto a **repository issue or pull request** — the route
[The content-body mutation route](#the-content-body-mutation-route) admits — needs the **repository**
token scope: `repo`, or `public_repo` for public repositories only. That is **not** a Projects scope, so
it is **not** what `writeScope`'s mapping decides, and a consumer that read `writeScope` as covering it
would be wrong in both directions.

`contentScope` publishes that determination as a **disclosure**, resolved inside S3 from S2's own payload
and stopping nothing — see [`contentScope` discloses; it stops nothing](#contentscope-discloses-it-stops-nothing)
for the mapping and the asymmetry. Its **field name and its three literals are the seam** a later write
path reads and are used **verbatim** by every consumer, exactly as `archiveReachable`'s name and literals
are.

**It is a disclosure, not an authorization guarantee — even at `"yes"`.** This is the same refinement
[Once per invocation](#once-per-invocation)'s *It is not an authorization guarantee* bullet already makes
for `writeScope`, applied to this field rather than restated as a competing rule: `contentScope: "yes"`
means **the token carries `repo`**, never *the acting account may write that repository*. Repository- and
organization-level permissions are **not** token scopes, so a **403 remains a runtime error of the write
path**, handled by that path's own failure machinery and **never retro-classified** as a preflight
failure.

**What a consumer may and may not do with it.**

- **MAY** refuse a **planned content write** ahead of dispatch on a determinate `"no"` — cheap and
  fail-closed, and better than a 403 midway through an ordered sequence on a store with no compensating
  writes.
- **SHALL NOT** treat `"indeterminate"` as `"no"`. A token reporting no scopes at all is **ordinary**,
  and reading it as a refusal would refuse every such session.
- **SHALL NOT** convert either value into a **preflight stop**, and **SHALL NOT** render such a refusal
  through the **six-label STOP message**, which renders **preflight-stopping verdicts only**. A refusal a
  consumer chooses to make is its **own** message, and it names `gh auth refresh -s repo` as the
  **user's** action — ptp running a credential-changing command remains prohibited with **no exception**.

**Adding this field changes no existing field's name, type, or meaning**, so a consumer that reads the
record's fields **by name** is unaffected. A consumer that instead depends on the record's **shape or
cardinality** — one stating the field count, treating the field set as closed, or rejecting an
unrecognized key — is corrected by the change that owns it **before** it consumes the widened record; the
growth of this seam is **not** to be described as breaking nothing.

### Invariants a consumer may rely on

- `scopes` is **always an array**, so it is iterated without a nullity check.
- `writeScope`, `contentScope`, `stage`, `verdict`, and `archiveReachable` are **never null**.
- `cause` is null **only** under `ready`, and is non-null under both stopping verdicts.
- Every field has a **defined value under every verdict**, so the record defines **no** "value not
  produced" state and no consumer is required to render one.

---

## Consumer obligations

**Two gates, in this order.**

The **first** is the configuration's own completeness verdict, refused **non-silently** by the consuming
command as its **own first action** and **before** its branch guard, on its **two** grounds: an
incomplete `backlog.*` configuration, naming the missing keys, and a colliding resolved status-option
table. `0047_02_backlog-config-gate-enforcement` owns that ordering and the one-refusal-per-writer rule,
and this contract restates neither. A consumer never reaches the preflight on a configuration the first
gate would refuse.

The **second** is this contract's preflight verdict:

| Verdict | Reader | Writers |
|---|---|---|
| `ready` | proceed | proceed |
| `read-only` | **proceed** — the tier gating reads passed | **STOP** |
| `unavailable` | **STOP** — every operation reaching the store | **STOP** — every operation reaching the store |

**A verdict never stops an operation whose required tier passed.** That is the entire purpose of
reporting `read-only` distinctly rather than as an undifferentiated failure.

The remaining obligations:

- Take the **verdict**, the **account**, the **host**, **`projectId`**, **`contentScope`**, and
  **`archiveReachable`** **from the record**. Re-derive none of them, re-fetch none of them, and infer
  none of them.
- Refuse **non-silently**. Never warn-and-continue, never perform a partial operation, never substitute
  a different identity or board, and **never read, create, or write a local backlog file in place of
  the configured board** — under any verdict, and with no override.
