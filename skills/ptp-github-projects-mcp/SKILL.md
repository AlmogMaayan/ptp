---
name: ptp-github-projects-mcp
description: Own the GitHub-Projects backlog transport contract and the backlog.* configuration schema — the layered resolution of backlog.mcpServer, backlog.projectOwner, backlog.projectNumber, and backlog.statusOptions (the map-kind key whose members sit at the schema's first three-level path, resolved per status key and published as validated overrides on the verdict, with the default table, the merge, and the collision rule left to ptp-backlog) with its forgiving per-key reader and its once-on-the-combination completeness verdict, the tool-namespace derivation rule and its no-fuzzy-matching absolute, the closed two-tier eight-tool Projects v2 required set, the once-per-invocation capability preflight and its three verdicts (ready | read-only | unavailable), the preflight record every consumer reads, and the fixed non-silent STOP-message shape. A pure prose contract in the single-source-of-truth pattern of ptp-branch-guard (branch safety), ptp-codex-mode (the reviewer gate), ptp-agent-roles (role resolution), ptp-parallel-fanout (fan-out safety), and ptp-backlog (the backlog board contract): it reads no file on its own, writes nothing, runs no git, and edits nothing. Defined by 0042_02; first consumed by 0042_03 (the read path), then 0042_04 (the write path and wiring).
---

# ptp-github-projects-mcp — which board, through which server, and can I reach it

## Purpose

Before this skill, ptp had **no MCP contract at all**: every ptp command that touched the epic backlog
read a local file, and nothing in the plugin described how a Projects board is addressed, how an MCP
server's tools are named, or what ptp owes a user whose transport is not reachable. This skill is the
**single source of truth** for two questions that belong together — *which board, through which server*
(the `backlog.*` configuration) and *can I actually reach it* (the capability preflight).

It is a **pure prose contract**. It reads no file on its own, writes no file, runs no git command,
starts no server, edits no MCP configuration, and changes nothing. Consumers **reference** it; no
consumer restates any part of it, and no consumer re-derives a rule it could take from here.

That is the same "the skill owns the rule" pattern ptp already applies elsewhere:

| Sibling contract | Owns |
|---|---|
| `ptp-branch-guard` | branch safety |
| `ptp-codex-mode` | the reviewer gate, and `codex.*` resolution |
| `ptp-agent-roles` | role resolution |
| `ptp-parallel-fanout` | fan-out safety |
| `ptp-backlog` | the backlog board contract |

This skill is the **reader** of the `backlog.*` keys; `ptp-config` is their **writer**, and the README
§Configuration section is their user-facing schema. The two postures are deliberately asymmetric — see
[Strict and forgiving are complementary](#strict-and-forgiving-are-complementary).

## Which steps consult this skill

**`/ptp:backlog` consults this skill on every invocation.** The contract was *defined* here
(`0042_02`) and is *wired* by its consumers: `0042_03` built the read path against it — resolving the
`backlog.*` keys, running the preflight, reading the namespace and the verdict from the record, and
rendering that verdict in the view's header — and `0042_04` builds the write path and the remaining
command wiring. The epic backlog **is** the resolved GitHub Projects board; there is no local backlog
file. `/ptp:backlog-add`, `/ptp:backlog-edit`, `/ptp:backlog-run`, and `/ptp:backlog-continue` each
carry **exactly one** up-front refusal that names its own cause — an incomplete configuration, a
verdict that does not admit a write, writer-ineligibility, or the read path withholding something they
consume — and they fall back to nothing.

---

## Backlog configuration

**Four** keys under one `backlog` parent. Three are scalars at the two-level depth every other ptp
parameter uses; `backlog.statusOptions` is a **map**, so its members sit one level deeper at
`["backlog","statusOptions",<status>]` — the **first three-level path in the schema**, and the reason
`/ptp:config`'s parent-shape rule and parent-creation clause each gain a second level.

| Key | `jsonPath` | Kind | Default | Meaning |
|---|---|---|---|---|
| `backlog.mcpServer` | `["backlog","mcpServer"]` | string | **unset** | unset means *the fixed official GitHub-plugin MCP server*; set names the server the user runs (e.g. a per-account Docker MCP server under a different GitHub token) |
| `backlog.projectOwner` | `["backlog","projectOwner"]` | string | unset | the GitHub org or user **login** owning the board |
| `backlog.projectNumber` | `["backlog","projectNumber"]` | integer `>= 1` | unset | the board's project number |
| `backlog.statusOptions` | `["backlog","statusOptions"]` | **map** | **unset** | per-status board option names; unset means **the built-in default table**, and each unconfigured status keeps **its own** default row |

**Board identity is owner-login + project-number, never a URL.** Those are exactly the two values the
Projects v2 API and `gh project` take (`--owner`, `<number>`), so no derivation stands between the
configuration and the call. A single `projectUrl` would force a URL grammar into the strict editor
**and again** into the forgiving reader — scheme, host, `/orgs|users/<login>/projects/<n>`, and the
trailing `/views/N` GitHub appends when you copy the address — and would leave every consumer
re-deriving owner and number from a string. A bare `--owner` login resolves for organizations and user
accounts alike, so no `ownerType` key is needed.

### Layered resolution

Global first, then project overriding **key by key** — the identical two files and precedence
`codex.mode`, `review.*`, `telemetry.*`, `roles.main`, and `parallel.*` already use:

```
mcpServer        = unset         # unset means the fixed official GitHub-plugin MCP server
projectOwner     = unset
projectNumber    = unset
sawValidServer   = false         # did ANY layer supply a VALID backlog.mcpServer?
sawInvalidServer = false         # did ANY layer supply the KEY with an invalid value?

for path in [ ~/.claude/ptp/config.json,            # global first
              <repo>/.claude/ptp/config.json ]:     # then project (overrides)
    if file missing, unreadable, or not parseable JSON: continue      # ignore the layer
    obj = parsed root; if obj is not an object: continue
    b = obj.backlog; if b is not an object: continue
                     # a skipped layer supplies NO key, so it sets neither flag below

    if "mcpServer" is a key of b:                       # the key was SUPPLIED
        t = (b.mcpServer is a string) ? trim(b.mcpServer) : nothing
        if t is a non-empty string:
            mcpServer      = t
            sawValidServer = true
        else:                                           # "", whitespace-only, 3, true, null
            sawInvalidServer = true                     # layer still IGNORED for this key
    if b.projectOwner is a string:
        t = trim(b.projectOwner)                        # trim FIRST, then test t
        if t is non-empty
           and t contains no "/", no whitespace, and no "://":
            projectOwner = t
    if b.projectNumber is a JSON number that is an integer >= 1:
        projectNumber = that value

mcpServerInvalid = sawInvalidServer and not sawValidServer   # see the carve-out below

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

> The configuration is **complete** when `projectOwner` and `projectNumber` both resolved. `mcpServer`
> is **never required** — unset is a meaningful, valid value — and **never ignored** — there is no
> configuration under which it does not apply.

Its output is a **verdict, not an action**:

```jsonc
{
  "mcpServer":         "…" | unset,
  "projectOwner":      "…" | unset,
  "projectNumber":     7   | unset,
  "complete":          true | false,
  "missing":           ["projectOwner", "…"],  // the missing REQUIRED key names; [] when complete
  "mcpServerInvalid":  true | false,
  "statusOptionOverrides": { "done": ["Shipped"] }  // validated per-status overrides; {} when none
}
```

**`statusOptionOverrides` is always an object, never null and never absent.** It carries only those
statuses for which some layer supplied a valid value, each mapped to that status's resolved, trimmed,
de-duplicated list of names, and it is `{}` when no layer supplied any — so a consumer reads it without a
presence check and without a nullity check, the same property `complete`, `missing`, and
`mcpServerInvalid` already carry. A status **absent** from it means *no override resolved for this
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

### The set-but-invalid `mcpServer` carve-out

`unset` and `set-but-invalid` MUST NOT collapse into the same result. For every other key, ignoring an
invalid layer and falling back is harmless — a default severity or a default concurrency is a safe
value. For `mcpServer` it is not: falling back means resolving to **the official server** when the user
named a *different* one, substituting a **different GitHub account's** server for the one they meant.
That is precisely what the never-a-substituted-server prohibition forbids, and the divergence lands on
someone else's board.

So: where some layer supplied `backlog.mcpServer` with an invalid value (`""`, a whitespace-only
string, `3`, `true`, `null`) and **no** layer supplied a valid one, resolution still never throws and
never STOPs — the resolved value is still unset — but the verdict carries `mcpServerInvalid: true`, and
the configuration is **not actionable on that ground alone**, even with `projectOwner` and
`projectNumber` both resolved. The consumer refuses and names the key; it never proceeds against the
official server.

A valid value in **any** layer clears the flag, and a later invalid layer is then governed by the
ordinary per-key rule — ignored for that key, because a valid value was in fact supplied.

**`mcpServerInvalid` is `true` in exactly that one case and `false` in every other**, including the
ordinary genuinely-unset case where no layer supplied the key at all. The pseudocode above computes it
as `sawInvalidServer and not sawValidServer` from two flags that both start `false`, so it is
**present with a boolean value under every completeness outcome** — a consumer reads it without a
presence check and without a nullity check.

Note what does *not* set `sawInvalidServer`: a layer skipped wholesale (missing, unreadable,
unparseable, non-object root, or non-object `backlog`) supplies no key at all, so it can never raise
the flag. Only a layer that reaches the `backlog` object and carries an `mcpServer` key there can.

Only a hand edit can reach this state: the STRICT editor cannot write any of those values. That is
exactly the class of input the forgiving posture exists to *survive*, not to silently reinterpret.

### The two prohibitions

1. **It must not throw or STOP.** A backlog setting must never fail an unrelated command that happens
   to resolve config. Resolution is forgiving, full stop.

2. **It must never silently proceed.** An incomplete or unactionable configuration must produce a
   **non-silent refusal**: never a warn-and-continue, never a partial operation, never a substituted
   server, and **never a read, creation, or write of `openspec/backlog.json` — the deleted legacy store —
   in place of the configured board**.

**"Never a substituted server" has two teeth, and both bind.** The obvious one is the preflight's:
never adopt a similarly-named server the user did not name (see
[No fuzzy matching, ever](#no-fuzzy-matching-ever)). The second, easy to miss because it hides inside
the forgiving reader, is resolution's: never let a *set but invalid* `mcpServer` fall through to the
official-server default, which substitutes a server just as surely — and just as silently — as fuzzy
matching would. The `mcpServerInvalid` flag above is what makes that branch refusable instead of
invisible.

**The local-file clause is load-bearing, not vacuous.** `0042_03` removed the local store from the
contract, but a file at `openspec/backlog.json` still *exists on disk* in any repository that used an
earlier ptp. A fallback is therefore *available* precisely where a well-meaning implementer would reach
for one, which is why the prohibition names the file concretely instead of stopping at the abstract
rule. That file is legacy data: never read, never written, never migrated, never deleted.

Because a resolver that never STOPs cannot itself refuse, **the refusal is a consumer's obligation**,
and it binds `0042_03` and `0042_04`. `0042_03` discharges it for the read path: `/ptp:backlog` refuses
on an incomplete verdict — or on `mcpServerInvalid` — before it runs the preflight and before any board
call.

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

## Tool-namespace derivation

An MCP server's tools reach a session under a prefix derived from the server's configured name. The
rule is:

```
sanitize(name)  = name with every character outside [A-Za-z0-9_-] replaced by "_"
                  (hyphens preserved, case preserved, nothing else altered)
namespace(name) = "mcp__" + sanitize(name) + "__"
fullName(bare)  = namespace(serverName) + bare
```

**Derived from live observation, not from documentation.** The table below is this contract's evidence:

| Configured server name | Observed tool prefix |
|---|---|
| `github` | `mcp__github__` |
| `mcp-github-almogmaayan` | `mcp__mcp-github-almogmaayan__` |
| `mcp-github-git37` | `mcp__mcp-github-git37__` |
| `gtm-mcp-server` | `mcp__gtm-mcp-server__` |
| `npm-registry` | `mcp__npm-registry__` |
| `plugin:playwright:playwright` | `mcp__plugin_playwright_playwright__` |
| `plugin:prd:go` | `mcp__plugin_prd_go__` |
| `plugin:atlassian:atlassian` | `mcp__plugin_atlassian_atlassian__` |
| `claude.ai Facebook Ads` | `mcp__claude_ai_Facebook_Ads__` |
| `claude.ai Google Calendar` | `mcp__claude_ai_Google_Calendar__` |

What it shows: **hyphens and case survive**, and `:`, `.`, and space each become `_`.

**This is a rule ptp applies — never a documented Claude Code guarantee.** Nothing upstream promises
this derivation, so the derived prefix is a **candidate, never an authority**. Tool presence decides
the verdict (see [Capability preflight](#capability-preflight)), which is why a wrong derivation
surfaces as a loud `unavailable` naming the exact namespace probed rather than as a silent misroute.

### Server-name resolution

Two possibilities, and there is no third row:

| `backlog.mcpServer` | Server name | Source |
|---|---|---|
| **unset** | the fixed official GitHub-plugin MCP server | a **constant of this contract**, held in exactly one place so a rename is a one-line correction |
| **set** | the configured value | `backlog.mcpServer` |

**The constant's value is `github`.** "Held in exactly one place" is only a containment property if the
place actually holds something, and `0042_03` / `0042_04` cannot derive a namespace for the unset case
from a description alone. The official GitHub-plugin MCP server's configured name is therefore recorded
here, as this contract's named constant, grounded in row 1 of the evidence table above (`github` →
`mcp__github__`). **This line is the one to correct on an upstream rename.**

This is **not** the rejected "default the config key to the string `github`" alternative. That alternative put
the literal into user-facing **configuration**, so every user who had typed it would break on a rename.
Here the name lives in this contract only — no config file ever contains it — so a rename is one edit
that fixes every unset user at once. What no consumer may do is **derive** or **hardcode** the default
server for itself instead of taking it from this contract.

### No fuzzy matching, ever

Only the derived namespace is probed. This contract **SHALL NOT** scan the visible tools for names
containing `project`, **SHALL NOT** substitute a similarly-named server, and **SHALL NOT** adopt a
server the user did not name.

The reason is concrete: three plausible GitHub servers can be live in one session at once — `github`,
`mcp-github-almogmaayan`, and `mcp-github-git37` — and the cost of guessing wrong is a write to the
**wrong organization's board**. Guessing is therefore prohibited exactly where it is most tempting.

### Literal-namespace containment

No consumer composes an `mcp__…` literal of its own. Callers take `namespace` from the preflight record
and compose `namespace + bare`, so a GitHub-Projects namespace literal appears in exactly **one** live
repository file — this one — which is a grep-checkable invariant.

**The rule binds documentation too.** `README.md` describes the derivation and names the server without
spelling an `mcp__…__` literal; otherwise the README becomes a second place the prefix is written and
the invariant fails on the very change that introduces it.

---

## Required Projects tools

Eight bare tool names, in two tiers. **This order is the canonical order** every `missing` list and
every `missing:` message line uses.

| Tier | Bare name | Why a backlog needs it |
|---|---|---|
| read | `list_projects` | resolve the configured board among the owner's projects |
| read | `get_project` | confirm the board and read its metadata |
| read | `list_project_fields` | map an entry's status onto the board's single-select field options |
| read | `list_project_items` | enumerate entries — the backlog's rows |
| read | `get_project_item` | re-read one entry, which the never-a-blind-write rule requires |
| write | `add_project_item` | create an entry |
| write | `update_project_item` | field and status writes |
| write | `delete_project_item` | remove an entry |

**Closed set. Verbatim spellings. No alias table, no fuzzy or suffix near-match, no "or equivalent."**
This is the discipline `ptp-backlog` already applies to its nine problem codes: a vocabulary every
consumer copies is a vocabulary that drifts, and a preflight that accepts near-matches passes a server
it cannot actually drive. If upstream tool names differ from this table, **this table is the single
place corrected** — one edit, one file, reviewed once.

**Two tiers, because the two tiers are the two dependent slices.** The read tier gates read operations
(`0042_03`); the read tier **plus** the write tier gates write operations (`0042_04`). "Can read but
cannot write" is the single most actionable distinction a user can be told, and collapsing it into
"broken" would discard a free repair hint — *your token cannot write the board* — that costs nothing to
emit.

**Honest caveat.** These spellings are carried from the superseded design and are **unverified against
a live server**: no MCP server in the authoring environment exposed any Projects v2 tool. That is
precisely why the set is one closed table with no alias mechanism — a wrong spelling costs one edit
here rather than a hunt through consumers.

---

## Capability preflight

### The algorithm

```
PREFLIGHT(resolved config):
  1. serverName = resolved backlog.mcpServer, or the official-server constant when unset
  2. namespace  = "mcp__" + sanitize(serverName) + "__"        # a CANDIDATE, not an authority
  3. establish CALLABILITY for the eight fullName(bare) values, in this order — no name
     is counted missing until all three steps have run:
       3a. probe all eight in ONE call, by exact full name, requesting AT LEAST as many
           results as names probed (>= 8)                      # anti-truncation
           (on error / uninterpretable output: retry ONCE. If the retry RESOLVES,
            continue normally to 3b — a resolved-but-short result is a truncation,
            not a failure. Only if the retry ALSO fails skip 3b and go to 3c)
       3b. for any required name NOT yet returned: re-request it by exact name, under
           the SAME result-count floor (>= the number of names in that re-request)
           (same failure rule as 3a: on error / uninterpretable output, retry ONCE;
            only if that retry ALSO fails does this name fall through to 3c — the
            retry-then-fall-back rule binds EVERY lookup, not just the initial probe)
       3c. for anything still unresolved: consult the visible inventory's LOADED entries
     present = the bare names established CALLABLE by 3a, 3b, or 3c
     missing = the eight minus present                         # computed ONLY after 3c
  4. archiveReachable = established from the resolved list_project_items tool's
     fetched schema — true ONLY on an explicit include-archived affordance;
     false where that tool resolved and its schema exposes none; unknown where
     nothing was established (tool not present, lookup never resolved, or
     presence taken from the loaded inventory with no schema inspected)
     # an input to NO branch below; it never changes the verdict
  5. every return below carries the full record, archiveReachable included:
     if present is empty:
         cause = LOOKUP_CAUSE   if the lookup never resolved (errored / uninterpretable after
                                its one retry, and the loaded-inventory route established nothing)
               = corroborated   otherwise
         return unavailable
     if any READ-tier name is missing:  return unavailable  (PARTIAL_CAUSE)
     if any WRITE-tier name is missing: return read-only    (WRITE_CAUSE)
     return ready
```

**There are no short-circuit branches.** A server name is *always* resolved, a namespace is *always*
derived, and a probe *always* runs. No configuration bypasses the preflight.

**Step 1's unset case means genuinely unset — the configuration gate runs first.** Step 1 maps an unset
`mcpServer` to the official-server constant, and under
[the set-but-invalid carve-out](#the-set-but-invalid-mcpserver-carve-out) the *resolved* value is also
unset while `mcpServerInvalid` is `true`. Running the preflight on that state would derive the official
server's namespace for a user who named a different one — the substituted server the carve-out exists to
prevent. So the consumer's `mcpServerInvalid` refusal is a **precondition of the preflight, not a branch
inside it**: a consumer refuses and names the key *before* calling PREFLIGHT, and PREFLIGHT is therefore
only ever reached with `mcpServerInvalid: false`. That keeps this algorithm branch-free while closing the
hole.

**Why step 4 sits before the verdict branches.** Every branch of step 5 returns, so an establishment
step placed after them would run on no path at all, leaving `archiveReachable` undefined under exactly
the stopping verdicts the record requires it to carry a value under. Ordering it first makes it defined
on **every** path without a single branch having to repeat it. Step 5 never reads it — it only carries
it out on the record.

### The three verdicts

A closed set of three:

| Verdict | Condition |
|---|---|
| `unavailable` | at least one **read-tier** tool not callable — including the zero-tools case |
| `read-only` | all read-tier callable, at least one **write-tier** tool not callable |
| `ready` | all eight callable |

**Two verdicts of the superseded five-verdict set are deleted, and both were the non-probing ones.**
`not-applicable` existed to describe a `local-files` system this contract no longer models — GitHub
Projects is the only store *this contract addresses*, so there is no configuration under which the
preflight does not apply — and, since `0042_03`, the only store ptp's backlog has at all.
`misconfigured` had exactly one reachable condition — a custom system naming no server — and that
condition is unrepresentable now that an unset `backlog.mcpServer` is a valid, meaningful value
denoting the official server. Neither word appears anywhere else in this contract: not as a verdict, not
as a branch, not as a record field.

Four consequences follow, and each **deletes** prose rather than adding it: `serverName` and `namespace`
are never null; the "value not produced" rendering rule becomes unreachable and is dropped; `missing` is
always a real probe result rather than "all eight, not probed"; and every verdict is a function of the
probe alone.

### Tool presence is the authority; connectivity is not

The obvious design — ask a connectivity listing whether the server is connected — is **wrong**, and both
halves of the reason were measured:

- **A connectivity listing under-reports.** It can omit a server whose tools are advertised in that same
  session's tool inventory. A connectivity-first preflight would refuse a configuration whose server is
  demonstrably present.
- **"Connected" does not mean "usable".** Two GitHub servers connected in the authoring session expose
  **zero** Projects tools — only repository, issue, and pull-request reads. A connectivity-first
  preflight would pass a server that cannot serve a backlog.

Hence the verdict is a function of the required tools' **callability** and of nothing else.

### What counts as present

A required tool is **present** when it is established *callable in this session*, by **either**

- **(a)** the lookup returning its schema, **or**
- **(b)** its appearance in the visible tool inventory **as a loaded, directly callable tool**.

| Inventory entry kind | What is known | Counts as present? |
|---|---|---|
| **loaded** — schema available, invocable now | name **and** schema | **YES** — callability, directly observed |
| **deferred** — listed by name only; the listing itself says a direct call fails until the schema is fetched | name only | **NO, not on its own** — a name proves a server advertises a tool, never that it can be invoked |

**The deferred case is the trap, and is stated explicitly.** A failed lookup whose eight names sit in
the inventory as **deferred** entries resolves `unavailable`, **not** `ready`: nothing was established
as callable, and a consumer would be sent at tools it cannot invoke. Symmetrically, a **successful**
fetch of a formerly deferred name **is** route (a) and **does** count — deferred is a starting state,
not a disqualification.

### Anti-truncation

A result-count limit is a property of the **mechanism**, not of the server. A tool-schema lookup takes a
maximum-results argument whose default is smaller than eight, so a single naive call truncates every
time, and reading that truncation as absence would manufacture a false `read-only` or `unavailable`
against a fully capable server.

- **The floor binds every lookup.** The initial probe **and every re-request** select by exact full name
  and request **at least as many results as names in that same call** (`>= 8` for the initial probe).
  Stating the floor only for the initial probe would leave exactly the hole the rule exists to close: a
  re-request issued at a default cap smaller than its name count truncates a second time and marks
  callable tools missing on the very retry meant to rescue them.
- **A returned set smaller than the number of names requested SHALL NOT by itself establish absence.**
  The shortfall is resolved **in this order**: (1) re-request, by exact name and under the same
  result-count floor, only the names not yet returned; (2) the visible inventory's **loaded** entries
  for whatever remains. Only after both is a name counted missing.
- This does not dissolve the partial-presence verdicts: a server genuinely exposing five of eight still
  yields `read-only` or a partial `unavailable`, because the inventory route confirms the other three
  are not callable either.

### Probe failure and the fail-safe direction

A lookup that errors or returns nothing interpretable is retried **once**, then falls back to route (b).
**"A lookup" means every lookup** — the initial probe and each exact-name re-request alike — exactly as
the result-count floor binds every lookup. Neither rule is a property of the first call.

Where neither route establishes the required set, the verdict fails closed toward **`unavailable`,
never `ready`**. A false `unavailable` costs one fix and is self-diagnosing — the STOP prints the
derived namespace and the exact missing names — whereas a false `ready` would send `0042_03` /
`0042_04` at a transport that is not there.

Where route (b) **does** establish the full set, `ready` stands despite the lookup having failed. That
is the whole point of defining presence independently of the mechanism, and restricting route (b) to
**loaded** entries is what keeps the same rule from breaching the fail-safe in the other direction.

### Cause precedence

When `present` is empty, **why** it is empty decides the cause. The two causes have a precedence, not a
merge:

| Why `present` is empty | Cause | Corroboration run? |
|---|---|---|
| the lookup **never resolved** — errored or uninterpretable after its one retry, and route (b) established nothing, **including the deferred-only case** | `LOOKUP_CAUSE`, a fixed string: *the tool lookup did not resolve, so no required tool could be confirmed callable — the server may be fine; re-run, and if this persists the lookup mechanism is the fault rather than your configuration* | **NO** — a server-shaped cause would be false when nothing was ever successfully asked |
| the lookup **did** resolve and returned none of the eight | a corroborated, server-shaped string | **YES** |

`LOOKUP_CAUSE` is deliberately **the one cause in this contract that tells the user the fault may not be
theirs** — because in that one case it may not be, and the verdict is still `unavailable`, so the
message is all that distinguishes "your configuration is wrong" from "ask again".

### Corroboration — message only, best-effort

Corroboration runs **only** in the lookup-resolved-and-found-nothing branch, and **only** to choose
between two cause strings:

- *server is connected but exposes no Projects tools (its projects toolset is likely disabled, or the
  token lacks project scope)*; and
- *server is not resolvable in this session*.

It **never** changes the verdict, and its own failure is never an error.

**Its non-mutating property is an assumption with a fail-safe.** The mechanism must be a lookup the
caller has established as non-mutating. Where that cannot be established, or where the caller's
read-only posture forbids shelling out, the step is **skipped** and the cause degrades to *unreachable
or exposes no Projects tools*. Skipping never changes the verdict, so "skip it when in doubt" costs
nothing but a less specific line.

### The two partial-presence causes

Both are **fixed strings**, not probe results, so neither can fail:

| Verdict | Condition | Fixed cause |
|---|---|---|
| `unavailable` | at least one tool present, at least one **read-tier** tool missing (`PARTIAL_CAUSE`) | server exposes some Projects tools but not the required read set — its projects toolset is likely only partially enabled, or this server's Projects support is a different version |
| `read-only` | all read-tier present, **one or more required write tools missing** (`WRITE_CAUSE`) | server exposes the Projects read tools but is missing one or more required write tools — the token likely lacks project scope for writes, or the server is configured read-only |

`WRITE_CAUSE`'s wording says *one or more required write tools missing*, never "no write tools":
`read-only` is reached with **at least one** write tool missing, and the record's `present` list under
that verdict is explicitly "all five read **plus any writes found**".

Corroboration does **not** apply to either — "is the server there at all?" is already answered yes, and
calling it would produce a misleading "not resolvable" line about a server that plainly is.

### Once per invocation

The preflight runs **at most once per ptp invocation**, memoized in memory on the resolved server name.
Later backlog operations in the same invocation reuse the verdict.

- **Never persisted.** Not to a cache file and not into any store. A stored `ready` outlives the MCP
  configuration that justified it, and persisting anything would turn a read-only command into a writer.
- **It is not a liveness monitor.** It catches a wrong or unreachable configuration at the invocation
  boundary. A server that dies mid-run surfaces through the failing call's own error path. Saying this
  explicitly is what makes once-per-invocation memoization sound rather than merely cheap.
- **It is not an authorization guarantee.** A visible `add_project_item` says nothing about the token's
  `project` scope. A permission error is a runtime failure belonging to `0042_04`, and the verdict
  wording SHALL NOT read as an authorization guarantee.
- **It is not a completeness check.** `ready` means *"the eight tools are callable"* and **never** *"the
  backlog configuration is complete"*. Completeness is the resolver's verdict, and the board-identity
  gate belongs to `0042_03`.

### Archive reachability

Whether `list_project_items` can return **archived** board items is a property of the **resolved
transport and its tool set**, established once during the preflight — exactly like `verdict`, `present`,
and `missing` — never a per-call check and never re-derived by a consumer. It is published on the record
as `archiveReachable`, with exactly three values.

| Established | Value | When |
|---|---|---|
| the resolved `list_project_items` tool's **fetched schema** exposes an explicit affordance for including archived items (an include-archived parameter, filter, or equivalent documented input) | **`true`** | the only route to `true` — a documented input, read off the schema the lookup returned |
| `list_project_items` resolved and its fetched schema exposes **no** such affordance | **`false`** | the expected case for a GitHub Projects v2 transport |
| nothing was established — `list_project_items` is not present, the lookup never resolved, or presence came only from the loaded-inventory route with no schema inspected | **`unknown`** | the fail-safe value; never `true` |

**Why `false` is the expected case.** Every GitHub Projects v2 item-listing surface is built over the
GraphQL `ProjectV2.items` connection, which returns **only non-archived items** and offers **no
include-archived filter** on the connection itself; `isArchived` exists as a field to *read* on an item
that came back, not as a way to make archived items come back. That behavior is community-established
rather than crisply documented, which is the second reason the value is schema-derived per resolved tool
rather than hardcoded: a server that layers its own affordance on top can legitimately report `true`.

Three absolutes:

1. **Never inferred from a result set.** A board with no archived cards is indistinguishable from an
   archive-limited transport, so zero archived items coming back establishes nothing at all. This is the
   one mistake the field exists to prevent.
2. **It fails closed.** Never `true` without positive schema evidence. Being wrong toward `false` /
   `unknown` costs a **withheld ready set**, repaired by one correction here the moment the affordance is
   confirmed; being wrong toward `true` costs the backlog runner **executing the wrong epic**, discovered
   late. The asymmetry is not close.
3. **It never changes the verdict**, never adds a verdict, and never adds a STOP-message label. A
   transport that cannot see archived items is still `ready` when all eight tools are callable, because
   the eight tools *are* callable.

**Recorded as an assumption a later slice may correct upward on evidence** — alongside the caveat that
the eight tool spellings are themselves unverified against a live server. Nothing may infer it upward
from a result set.

**Why the field exists.** The backlog's **ready set** is the `ready` entries in the backlog's
canonical order, and a runner consumes its **head**. If the item-listing tool silently omits archived
items, an archived `ready` entry that belongs at that head is missing from the order and the runner can
take the **wrong epic**. The read path therefore withholds the ready set unless archive coverage is
affirmatively established from this record, and this field is its only admissible source.

---

## The preflight record

This record is the **seam** `0042_03` and `0042_04` consume. Seven fields:

```jsonc
{
  "serverName": "mcp-github-almogmaayan",        // never null
  "namespace":  "mcp__mcp-github-almogmaayan__", // never null
  "verdict":    "ready" | "read-only" | "unavailable",
  "present":    ["list_projects", "…"],          // bare names, always an array
  "missing":    ["add_project_item", "…"],       // bare names in the required-tool table's order,
                                                 //   always an array
  "cause":      "…",                             // null ONLY when verdict is "ready"
  "archiveReachable": true | false | "unknown"   // never null, never "not produced"
}
```

| Verdict | `present` | `missing` | `cause` | `archiveReachable` |
|---|---|---|---|---|
| `ready` | all eight | `[]` | `null` | `true` \| `false` \| `unknown` |
| `read-only` | all five read + any writes found | the missing write tools | non-null (fixed `WRITE_CAUSE`) | `true` \| `false` \| `unknown` |
| `unavailable` | the resolved subset, possibly empty | the rest, in the required-tool table's order | non-null (`LOOKUP_CAUSE`, a corroborated string, or `PARTIAL_CAUSE`) | `unknown` whenever `list_project_items` is not among `present`; otherwise per the determination rule |

**Every field has a defined value under every verdict** — the record is a seam, so "unspecified" is not
an available answer. `present` and `missing` are **always arrays, never null**, so a consumer iterates
them without a nullity check. `archiveReachable` is **always one of its three values and never null**,
which is what lets `0042_03` read it under every verdict without a nullity check and without a "value
not produced" state the record does not define.

### How consumers read `archiveReachable`

**Only `true`** establishes that archived items are reachable. **`false` and `unknown` are treated
identically** — as *not established* — so a consumer that must see every entry degrades under
either. The two are distinguished **only** so the reported reason is honest ("the transport excludes
archived items" versus "nothing was established"), never so that a consumer acts differently on them.

At the point of consumption the prohibition is repeated: a consumer **SHALL NOT** infer reachability
from how many archived items a call returned. A complete fetch of a board with no archived cards is
byte-identical to an archive-limited fetch.

### The "value not produced" rendering rule is dropped

The superseded design needed it so a non-probing verdict could render `server:` / `namespace:` /
`found:` / `missing:` as *not produced* rather than omit them. With three verdicts, **both** stopping
verdicts always have a resolved server, a derived namespace, and a real probe result, so the rule has no
reachable case. Carrying it forward would ship dead prose — worse than ballast, because a later reader
would hunt for the branch that reaches it.

### Consumer obligations

Binding `0042_03` and `0042_04`, not this change.

**Two gates, in this order.** The verdict table below is the *second* gate. The **first** is the
configuration's own verdict: a consumer refuses non-silently — naming the missing keys, or naming
`backlog.mcpServer` when `mcpServerInvalid` is `true` — **before** it runs the preflight. Reading only
the table below would send a consumer at the official server under a set-but-invalid `mcpServer`, which
is exactly the substituted server the contract forbids.

| Verdict | Reader | Writers |
|---|---|---|
| `ready` | proceed, once those slices exist | proceed, once those slices exist |
| `read-only` | **proceed** — the tier gating reads fully resolved | **STOP** |
| `unavailable` | **STOP** — every operation reaching the store | **STOP** — every operation reaching the store |

**A verdict never stops an operation whose required tier fully resolved.** That is the entire purpose of
reporting `read-only` distinctly rather than as an undifferentiated failure.

---

## The STOP message

A failed preflight is a **non-silent STOP** — never a warning-and-continue, never a fallback — for
every operation that would reach the store **and whose required tool tier did not fully resolve**, and
for no other operation. That qualifier is part of the rule, not a later exception to it: under
`read-only` the read tier fully resolved, so readers proceed and only writers stop (see
[STOP scoping](#stop-scoping)). Reading "any verdict but `ready` stops everything" would collapse the
third verdict into `unavailable` and discard the one distinction it exists to draw.

The message's shape is fixed so it can be reviewed and grepped:

```
GitHub Projects backlog preflight FAILED — no backlog operation ran.
  server:        mcp-github-almogmaayan   (backlog.mcpServer)
  namespace:     mcp__mcp-github-almogmaayan__
  required:      8 Projects tools (5 read, 3 write)
  found:         0
  missing:       list_projects, get_project, list_project_fields, list_project_items,
                 get_project_item, add_project_item, update_project_item, delete_project_item
  likely cause:  server is connected but exposes no Projects tools (its projects toolset is
                 likely disabled, or the token lacks project scope)
  repair:        /ptp:config → backlog.mcpServer, or enable the server's projects toolset.
ptp does NOT silently proceed. No backlog operation ran and no local backlog file was
read, created, or written.
```

### The label set is invariant at seven

In this order:

1. `server:`
2. `namespace:`
3. `required:`
4. `found:`
5. `missing:`
6. `likely cause:`
7. `repair:`

— followed by the **unlabeled** trailing prohibition line.

The shape exists to be reviewable and greppable, so a conforming implementation **SHALL NOT** substitute
its own label names and **SHALL NOT** reorder them. The superseded design's **eighth** label — the one
naming the deleted store-kind configuration key — is gone with the key it named, which is why the set is
seven rather than eight.

### Per-label content rules

- **`missing:`** always carries the **bare names** in the required-tool table's order — never a count. A
  count would tell the user less than the record already holds.
- **`found:`** carries a count.
- **`server:`** carries its **source**: the configuration key that supplied it, or — when
  `backlog.mcpServer` is unset — that the name is this contract's fixed constant. A configuration key
  **SHALL NOT** be named as the source where none supplied the value.

`archiveReachable` gets **no label**. It is a record field consumers read, not a line the failure
message renders, and adding one would breach the invariant set of seven.

### The conditional-repair table

Keyed on **what the preflight established** — not on corroboration alone, since corroboration is
deliberately not called for either partial-presence verdict nor for the lookup-never-resolved case, so a
table keyed on its output would leave those branches without a value while the label is still mandatory.
The principle the table encodes: name `/ptp:config` **only where a configuration change can actually
help**, and the server-side remedy where none can.

| Situation | `repair:` renders |
|---|---|
| the **lookup itself never resolved** (`LOOKUP_CAUSE`) — this row **overrides every row below it** | re-run the command; if the tool lookup still does not resolve, the fault is the lookup mechanism rather than your configuration. Names **no** configuration key and asserts nothing about the server, because nothing was established about either — pointing at `backlog.mcpServer` here would contradict the one cause that tells the user the fault may not be theirs |
| `backlog.mcpServer` **set**, anything else | `/ptp:config → backlog.mcpServer`, or enable the server's projects toolset — the named server is the user's own choice, so pointing at the key is always correct |
| **unset** (official server), the constant **is** resolvable and exposes **no** Projects tools | enable the server's projects toolset (likely disabled, or the token lacks project scope). A server exists; renaming nothing helps, so `/ptp:config` is deliberately absent |
| **unset**, the constant is resolvable and exposes **part** of the set — a partial `unavailable` or a `read-only` | enable the missing part of the server's projects toolset, or grant the token project scope for writes. The server is plainly there and serving Projects tools, so no configuration change reaches this failure |
| **unset**, the constant is **not** resolvable | the official server is not resolvable; `/ptp:config → backlog.mcpServer` names any other GitHub server you have. Phrased as a route the user **may** take, and asserting only that — never that another server exists, since this contract performs no discovery |
| **unset**, no required tool resolved, the lookup **did** resolve, and corroboration was **skipped or inconclusive** — so whether the constant is resolvable is unknown | no Projects tool resolved under the official server's namespace, and whether that server is reachable at all could not be established; enable its projects toolset if it is running, or name another GitHub server through `/ptp:config → backlog.mcpServer`. Both routes are offered because the branch cannot distinguish the two rows above it. The wording is deliberately about **what resolved**, never about what the server did: saying it "exposed no Projects tools" would assert it answered, and so assert its presence — this line asserts **neither** that the server is present nor that it is absent, the honest rendering when nothing was established either way |

**The sixth row is the default for the unset case.** Corroboration is best-effort and explicitly
skippable, so "is the fixed constant resolvable?" can legitimately go unanswered, and the two rows that
split on it would otherwise both fail to match on a reachable branch while `repair:` is still mandatory.
The two rows above it apply only when corroboration returned a determinate answer. Every stopping branch
therefore has a row, so `repair:` always has a defined value.

### STOP scoping

`unavailable` stops **every** operation that would reach the store, read or write. `read-only` stops
**writers only**, because the tier gating reads fully resolved — which is the entire purpose of
reporting it distinctly.

### Why never-proceed is an absolute

A silent fallback records a backlog locally while the user believes their board is the record. They then
plan against a board missing everything ptp recorded — **data loss by divergence**, discovered late,
leaving two half-backlogs and no merge story. A hard STOP costs one config fix.

The asymmetry is not close, so the rule takes **no exceptions and no `--force`**. Concretely: no read,
no creation, and no write of `openspec/backlog.json` — the deleted legacy store — in place of the
configured board.
