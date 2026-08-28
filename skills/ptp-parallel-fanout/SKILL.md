---
name: ptp-parallel-fanout
description: Own how ptp fans work out across concurrent agents and how their results are joined
---

# ptp-parallel-fanout — when a caller MAY run several main runs at once

## Purpose

Every ptp stage runs its per-item work one item at a time. For stages whose items write provably
disjoint folders — per-slice `openspec/changes/<id>/` planning artifacts — that sequencing is
convention rather than correctness, and it costs wall-clock time linearly in the number of items.
This skill is the single canonical place stating **when** a caller may overlap those items and what
it owes the working tree in exchange. It is the fan-out analog of `ptp-branch-guard` (branch
safety), `ptp-codex-mode` (the reviewer gate), and `ptp-agent-roles` (role resolution): commands
reference this contract rather than restating fan-out rules.

Fan-out is a **caller-side orchestration** concern, not a property of a single run. Each fan-out
member **is** exactly one `ptp-run-at-model` main run, started by the outer session in whichever
direction `ptp-agent-roles` resolves:

- **`main=claude`** — one **foreground Agent-tool subagent** at the caller-named target model, with
  the effort level injected as a **prompt directive** (never an Agent parameter). Such a member
  consumes exactly **one** Agent nesting level.
- **`main=codex`** — one **write-capable `codex exec` main run**, and **never** an Agent-tool
  subagent. Its model and effort come from `codex.model` / `codex.reasoningEffort` per
  `ptp-codex-mode`.

In **either** direction the member runs the wrapped command's work **inline** and starts **no
further main run** — no nested fan-out, no second spawn, no background Workflow. Because a `claude`
member consumes one Agent level and starts nothing beneath it, the one-level-nesting rule holds
unchanged under fan-out.

The invariant is therefore **one main run per `ptp-run-at-model` invocation**, *not* "one foreground
subagent" universally — stating it the latter way would silently exclude the `main=codex`
direction. Fan-out relaxes only **whether N such invocations overlap in time**; it changes nothing
about what a single invocation does.

**One root, handed down.** Every fan-out member receives the caller's one resolved workspace root
— resolved once at the caller's entry and passed verbatim into the member's prompt
(`ptp-run-at-model` part (g)). No member resolves a root of its own, so two members can never resolve
different roots, and each member's `openspec/changes/<id>/` write set is anchored to that same root.

This skill is a **pure prose contract**: it spawns nothing, runs no git command, probes no CLI, and
edits no file. It states obligations that callers must satisfy.

## The four safety conditions

A caller MUST establish **all four** conditions **before** it fans out. They are caller obligations
stated in prose — there is **no runtime enforcement mechanism**. A caller that cannot establish all
four **runs its items serially**, which is always the safe fallback and always the pre-change
behavior.

### 1. Write sets are provably disjoint **by construction**

Each member's write set is a **distinct filesystem subtree known before the fan-out begins** — not
merely unlikely to overlap, not "probably fine", not established by inspection afterwards.

- **Qualifies (the canonical case):** per-slice OpenSpec change folders, `openspec/changes/<id>/`,
  with the change ids **pre-allocated** by the outer session before any member starts. Distinct ids
  give distinct subtrees by construction.
- **Does not qualify:** shared source code. Members that edit files in the shared working tree
  (source files, `openspec/specs/`, README, skills, commands) cannot establish this condition,
  because nothing in their construction prevents two members touching the same file.

**Scope: the member's *work product*.** The condition governs what the member produces. It has
exactly **one closed exception**:

> Writes a member makes into the shared `ptp-telemetry` store, **through that store's existing
> protocols, which are already specified to be concurrency-safe**, do **not** defeat condition 1.

The exception covers, and is limited to:

| Shared telemetry path | Why it is already concurrency-safe as specified |
|---|---|
| `<telemetry.root>/<epic>/runs.ndjson` | The **append-only ledger protocol**: every write is a single append of one complete line; no writer reads the ledger before writing to it; no writer modifies or rewrites an existing line — so concurrent writers cannot produce a lost update or a partially overwritten record. |
| `<telemetry.root>/<epic>/runs.csv` | The **CSV dual-write's atomic-rename initialization**: the header goes to a uniquely named temp file in the same directory and is moved in by a create-only (no-clobber) rename — specified precisely to survive two writers racing to create the header — after which every data write is a single-line append. |
| `<telemetry.root>/.gitignore`, `<telemetry.root>/.gitattributes` | Creation is specified **idempotent** — an existing file is left untouched — so racing creators converge. |
| `<telemetry.root>/`, `<telemetry.root>/<epic>/`, `<telemetry.root>/_unattributed/` | Directories are created **lazily** and every telemetry error is swallowed, so a racing creator is a no-op, never a failure. |

Without this scoping clause a fan-out with `telemetry.mode=on` would fail condition 1 on its **own
telemetry writes**, making the contract inert exactly when it is being measured.

**The exception is closed.** It covers the `ptp-telemetry` store only and **admits nothing by
analogy**: a member writing any *other* shared path fails condition 1, and a future shared store
does **not** qualify by resembling this one. Adding a further store requires an explicit amendment
to this contract.

### 2. No member performs a git state change

No member cuts a branch, stashes, checks out, or commits. The `ptp-branch-guard` preamble runs
**once, up front, in the outer session**, and every member reaches only the guard's **no-op path** —
HEAD is already on the feature branch by the time any member starts.

This **restates** `skills/ptp-branch-guard/SKILL.md`'s existing *Orchestrators run it once; agents
only ever no-op* rule; it adds nothing to it. A concurrent stash or checkout mid-flight would pull
the tree out from under a sibling member, which is why this is a precondition rather than an
advisory.

### 3. Aggregation is order-independent

Members MAY finish in any order. Results are **joined first**, then **sorted by ascending change id
(story order)** before any report is emitted — so the report is **byte-stable regardless of
completion order**, identical to the report a serial run would have produced.

### 4. Gate semantics are join-then-gate

A gate that was previously **fail-fast** ("stop before starting the next item") becomes **"join
every member, then gate the joined set"**.

This is the one condition that trades something away, and the trade is deliberate rather than an
oversight:

- **The safety property is preserved** — the caller never proceeds past a failed gate.
- **The economy property is knowingly given up** — under fan-out the later members have already
  started, so their work is spent before an earlier member's failure is known.

## Config resolution — `parallel.mode` and `parallel.maxConcurrency`

Both keys resolve through the layered configuration contract owned by **`ptp-workspace`**
(`skills/ptp-workspace/SKILL.md`), which owns the layers, their order, and the per-key **forgiving**
merge — the same contract `ptp-codex-mode`, `ptp-agent-roles`, and `ptp-telemetry` resolve through.
This skill restates none of it and states only the two keys' own rules:

```
mode           = "off"       # ultimate fallback, applied LAST
maxConcurrency = 3           # ultimate fallback, applied LAST

mode           = the resolved value of `parallel.mode`, valid ⇔ ∈ {on, off}
maxConcurrency = the resolved value of `parallel.maxConcurrency`,
                 valid ⇔ an integer in [1, 10]
# never throw, never STOP over a configuration typo
```

| Key | Type | Range | Default |
|---|---|---|---|
| `parallel.mode` | enum | `off` \| `on` | `off` |
| `parallel.maxConcurrency` | integer | 1–10 inclusive | `3` |

All four failure modes `ptp-workspace` names — **(a)** missing file, **(b)** unparseable JSON,
**(c)** absent key, **(d)** out-of-enum / out-of-range / wrong-type value — leave the previously
resolved value in place, and a later layer's invalid value never clears an earlier layer's valid
one. Values such as `0`, `-1`, `2.5`, `"3"`, and `11` are invalid for `maxConcurrency`; the prior
value (ultimately `3`) stands and the command proceeds. Resolution never throws and never STOPs.

Both keys resolve **independently** of each other and of `codex.mode`, `roles.main`, and
`telemetry.mode`.

## Effective decision

```
1. effectiveParallel = (a valid `parallel:` token was present) ? token value : resolved parallel.mode
2. assert all four safety conditions for THIS set of items
     any condition unestablished  -> run serially, regardless of effectiveParallel
3. effectiveParallel == "on" AND all four hold  -> fan out, capped at parallel.maxConcurrency
   otherwise                                    -> serial (today's behavior)
```

Step 2 gates step 3 deliberately: **`parallel:on` is a permission, never an override of safety.**
The conditions are evaluated **after** the effective decision and can only **downgrade** it to
serial. No token value and no config value can make an unsafe fan-out run.

## Concurrency cap — batching, not a rolling window

At most `parallel.maxConcurrency` members run **simultaneously**. When there are more members than
the cap, they run in successive **batches**, and **each batch is joined before the next begins**.

> **Worked example — 7 members, `parallel.maxConcurrency` resolved to `3`:**
> `[1, 2, 3]` → join → `[4, 5, 6]` → join → `[7]` → join.

Batching is chosen over a rolling window (start member 4 the instant any of 1–3 returns) because it
is trivially deterministic: the observable interleaving does not depend on completion times, which
keeps condition 3's reasoning and any future telemetry attribution simple. At the common N ≤ 4 with
cap 3 the difference is at most one straggler wait. A rolling window is not forbidden as a future
optimization; it is simply not the contract today.

**Aggregation is unaffected by batching.** Every batch's results accumulate into **one** set, sorted
by ascending change id **once, at the end**, across all batches.

## The per-invocation `parallel:on` / `parallel:off` token

The token's **grammar**, two-stage **detect-then-validate** recognition, **lowercase-prefix-only**
candidate rule, **at-most-one-candidate** rule with all-candidates reporting on refusal,
**recognized-but-invalid refuses** behavior, and **outer-session strip-before-use ordering** are
defined **by reference** to `skills/ptp-run-at-model/SKILL.md` § *Optional caller-side `fast:`
switch*. Read `parallel:` for `fast:` throughout that section. Those mechanics are **not** restated
here — duplicating them is exactly the multi-enumeration drift ptp's config contract already
forbids.

Only the **deltas** are stated here:

1. A valid token **overrides the resolved `parallel.mode`** for that invocation only and **persists
   nothing** — no ptp config file is read for it or written by it.
2. **Absent ≠ `off`.** An absent token means *the resolved config applies*; an explicit
   `parallel:off` means *serial regardless of config*. (For `fast:`, absent and `off` are identical;
   here they are not — the one behavioral divergence worth stating.)
3. The token is **independent of `fast:` and `model:`** — any combination MAY appear in one argument
   text, all are stripped, and an invalid candidate of **any** kind refuses.

A valid `parallel:on` **never** overrides the four safety conditions: when any condition is
unestablished the caller runs serially even though the token requested parallelism.

**No command parses or honors this token in `0034_01`, the change that defined it.** Its first
consumer is `0034_02` — `/ptp:plan-multiple`, which parses and honors it.

## Reserved: the dependency-wave variant

**Dependency-wave fan-out** — grouping members into waves by declared dependency and running each
wave concurrently, joining between waves — is named here as the **reserved fallback shape** for the
case where per-item independence ever fails to hold.

It is **not specified in this change**, and no caller implements it here. The contract only reserves
room for it, so a future reader knows the intended direction rather than inventing an incompatible
one.

## This change defines the contract only

**No consumer wiring lands in `0034_01`.** No command resolves or consumes `parallel.mode` or
`parallel.maxConcurrency` for fan-out or scheduling control, and no command parses the `parallel:`
token, as a result of this change. `/ptp:plan-multiple`, `/ptp:full-plan`,
`skills/ptp-full/SKILL.md`, `/ptp:apply`, `workflows/ptp-full-apply.js`, `ptp-branch-guard`,
`ptp-review-loop`, and `ptp-codex-mode` are untouched. The **first consumer is `0034_02`**
(`/ptp:plan-multiple` fan-out), followed by `0034_03` (`/ptp:full-plan` fan-out).

`/ptp:config` offering these two parameters — reading a key's current value before editing it and
writing the value the user selects — is the config **editor's** behavior, not a consumer of the
setting, and is expressly permitted.

**Default-preservation invariant.** With `parallel.mode` at its shipped default `off` — and with no
command reading it — every existing ptp flow remains **byte-identical in its execution behavior**
(what it runs, in what order, with what concurrency) to its behavior before this change. The single
intended user-visible difference anywhere is the two additional parameters in `/ptp:config`'s
selection menu.

**Permanently excluded stages.** This contract never licenses concurrency for `/ptp:apply`,
`workflows/ptp-full-apply.js`, or `/ptp:archive` (and `ptp-archive-and-deploy`'s Phase A). The first
two write shared source files; the third merges each change's delta into the shared
`openspec/specs/` tree. None can establish condition 1, so all three stay strictly sequential no
matter what `parallel.mode` resolves to.

## Summary of the contract

- Fan-out is a **caller-side** concern; each member is exactly **one `ptp-run-at-model` main run** —
  one foreground Agent-tool subagent when `main=claude` (effort injected as a prompt directive, one
  Agent nesting level consumed), or one write-capable `codex exec` run when `main=codex` (never an
  Agent-tool subagent). Either way the member runs its work inline and starts no further main run.
- The invariant is **one main run per invocation**, not "one foreground subagent" universally; only
  the **sequencing** of N invocations is relaxed.
- **All four conditions must hold before fanning out:** (1) write sets provably disjoint by
  construction, (2) no git state change in any member, (3) order-independent aggregation sorted by
  ascending change id, (4) join-then-gate gating. They are caller obligations with no runtime
  enforcement; a caller that cannot establish all four **runs serially**.
- Condition 1 is scoped to the member's **work product**, with one **closed** exception for the
  `ptp-telemetry` store's already-concurrency-safe protocols — the append-only ledger, the CSV
  dual-write's atomic-rename initialization, the idempotent policy files, and lazy directory
  creation — admitting nothing by analogy.
- `parallel.mode` (`off`|`on`, default `off`) and `parallel.maxConcurrency` (integer 1–10, default
  `3`) resolve from layered ptp config, over the layers `ptp-workspace` defines, with a
  **forgiving** reader: missing file, absent key, unparseable JSON, or out-of-range/wrong-type
  value leaves the prior value; never throws, never STOPs.
- A valid `parallel:on|off` token overrides the resolved mode for one invocation and persists
  nothing; **absent ≠ `off`**; it is independent of `fast:` and `model:`; its mechanics are defined
  by reference to `ptp-run-at-model` § *Optional caller-side `fast:` switch*. **No command parses it
  in this change.**
- Safety gates the decision: conditions are asserted **after** the effective decision and can only
  downgrade it to serial. `parallel:on` is a permission, never a safety override.
- The cap bounds simultaneous members; excess members run in **batches**, each joined before the
  next; aggregation sorts **once**, at the end, across all batches.
- **Dependency-wave fan-out** is reserved and named, but **not specified in this change**.
- `/ptp:apply`, `workflows/ptp-full-apply.js`, and `/ptp:archive` remain strictly sequential under
  every setting.
- This change defines the contract only — the default `off` preserves all existing behavior, and the
  first consumer is `0034_02`.
