---
name: ptp-change-selector
description: Own the change-id format, selector grammar, resolution algorithm, and epic allocation
---

# ptp-change-selector — shared change-id format + selector grammar + epic allocation

## Purpose

This skill is the single source of truth for three things every ptp command needs:

1. The **id format** every change born through the ptp flow carries.
2. The **selector grammar** that any command argument resolves through.
3. The **epic allocation** algorithm producers use to name new changes.

It mirrors how `ptp-full-apply` and `ptp-review-loop` already factor shared protocol out of the individual commands. Every ptp command references this skill; none restates the rules.

## 1. Id format

```
<epic>_<story-path>_<kebab-description>
  epic       = exactly 4 digits, zero-padded            (e.g. 0001)
  story-path = one or more 2-digit zero-padded segments  (e.g. 01, or 03_01)
  desc       = kebab-case [a-z0-9] words joined by '-', containing at least one letter
full regex: ^\d{4}(_\d{2})+_(?=[a-z0-9-]*[a-z])[a-z0-9]+(-[a-z0-9]+)*$
```

Example: `0001_01_landing-page-list-bulk-export`. A multi-segment story path arises **only** from a
`NEEDS SPLIT` re-cut (§4b): the children of story `03` are `03_01`, `03_02`, …, each carrying its own
desc — `0001_03_01_bulk-load-seam-read`. Parsing is unambiguous by one rule: **the story path is the
maximal run of all-digit segments after the epic; the remainder is the desc** — which is why the
grammar requires the desc to contain a letter. Without that requirement `0001_03_12` would be
ambiguous, the regex reading `12` as a desc while the maximal-run parser reads `03_12` as the story
path and finds no desc; requiring a letter makes exactly one reading possible. A desc whose first
word merely *begins* with digits is unaffected — segments split on `_` while desc words join on `-`,
so `0001_01_10-percent-rollout` and `0001_01_2fa-login` parse as story `01`. Any pre-existing id
whose desc is all digits (none exists in this repository) is **legacy**, resolvable by exact bare-id
match and not addressable via `epic:`/`story:`.

**Story order** — the order every "ascending by story", "lower story", and "lowest-numbered story"
phrase in ptp means — compares story paths segment-wise, numerically. Because every segment is
2-digit zero-padded and a split **replaces** its parent (parent and children never coexist as
changes, per §4b), this equals plain lexicographic order of the full ids among coexisting changes:
`0001_03_01_* < 0001_03_02_* < 0001_04_*`. Children occupy exactly their parent's position, so a
split never renumbers any sibling.

**Legacy forms** — ids created before this convention — are still valid and resolvable by exact match:
- Pre-epic slice ids: `^\d{2}_…` (e.g. `01_distinct-activation-steps`)
- Plain standalone ids: `^[a-z0-9-]+$` (e.g. `cloudflare-config-health-panel`)

Legacy ids are **never produced going forward**. They are resolved by exact match only — not addressable via `epic:` or `story:` selectors.

## 2. Selector grammar

### Selector grammar

**The `--workspace` token is stripped first.** Before any rule below runs, and before the typo
normalization at the end of this section, a `--workspace <path>` or `--workspace=<path>` token is
removed from the argument string, so it can never be classified as a bare id. A path containing
spaces may be quoted. The stripped value is not discarded — it is handed to `ptp-workspace` as the
override of the one workspace resolution the step performs at its entry; stripping removes the token
from **this skill's** input only. This adds no selector form: after stripping, the remainder is
classified and resolved exactly as it is when no token was supplied. The precedent is
`/ptp:telemetry report`, which strips its own literal `write` keyword the same way.

A command argument string is classified in this order (first match wins):

| Priority | Form | Example | Resolves to |
|----------|------|---------|-------------|
| 0 | `epic:all` | `epic:all` | All active changes across every epic, `(epic, story)` ascending, legacy ids appended after |
| 1 | `epic:XXXX` | `epic:0008` | All active changes in epic `0008`, ascending by story |
| 1a | `epic:XXXX story:NN` | `epic:0008 story:02` | The change(s) in that story subtree of epic `0008` |
| 2 | `story:NN` | `story:01` | The active change(s) in that story subtree — if the epic is unambiguous |
| 3 | bare id | `0008_02_my-change` | The single folder with that name (exact match) |
| 4 | empty | (none) | Command's own existing default |

Classification rules:
- Equals `epic:all` exactly (case-sensitive) → all-active selector. (`epic:ALL`, `epic:all `, `epic:allfoo` are NOT the all-selector.)
- Starts with `epic:` → epic selector; parse for optional ` story:NN` suffix.
- Starts with `story:` (without `epic:`) → bare story selector.
- Otherwise → bare id (exact folder-name match).
- Empty → defer to the command's existing default.

**`story:` takes a story path and matches its subtree.** `story:NN` (or `story:NN_MM`, one level per
split) resolves to every active change whose story path **equals or extends** the given path, in
story order. For an unsplit story that is exactly one change — identical to the pre-split behavior —
and after a split it is the child set, which is the truthful resolution: the parent id no longer
names a folder. Set-capable (Role B) consumers iterate the set; a command that requires exactly one
change STOPs on a multi-change subtree naming the child ids.

`epic:`, `story:`, and `--workspace` are **reserved prefixes** — bare ids may not start with them. `all` is reserved within the `epic:` namespace so that `epic:all` is unambiguous as the all-active selector; this reservation is scoped to the `epic:` namespace only and does not change the bare-id form — a legacy folder literally named `all` remains resolvable by exact bare-id match.

**Typo normalization (checked before classification).** A small, fixed set of near-miss spellings are auto-corrected to their documented form before the rules above run, so the command proceeds instead of stopping to ask the user:
- `epics:all`, `epics:ALL`, `Epic:all` (any case variant of the word `epic`/`epics`, plural or not, paired with `all`) → `epic:all`
- `epics:XXXX` → `epic:XXXX`
- `stories:NN` → `story:NN`

Only this literal, closed list is normalized. Anything else that doesn't match a documented form falls through to bare-id handling and its normal "no change `<id>`" stop — do not guess at other typos.
The `--workspace` strip above runs **before** this list, and the list is **not extended** to cover it: a
misspelling such as `--workspac` is not corrected, and falls through to bare-id handling and that same
stop.


## 3. Resolution algorithm (deterministic, stateless)

```
inputs: selector string; resolved workspace root

1. list = folder names under <resolved workspace root>/openspec/changes/, excluding "archive"
2. parse each name:
   - if matches ^\d{4}(_\d{2})+_(?=[a-z0-9-]*[a-z])[a-z0-9]+(-[a-z0-9]+)*$ → epic-prefixed:
     (epic, story-path, desc), the story path being the maximal run of all-digit segments after the
     epic and the desc containing at least one letter (§1)
   - else → legacy: (epic=None, story=None, id=name)
3. switch on selector:
   - epic:all:
       STOP "no active changes under <resolved workspace root>" if list is empty
       return (epic-prefixed ids sorted ascending by (epic, story)) + (legacy/unprefixed ids in listed order)
       [identical set and ordering to the empty-selector "all active changes" default]
   - bare id:
       return [name] if a folder equals it
       else STOP "no change <id> under <resolved workspace root>"
   - epic:XXXX:
       matches = [c for c in list if c.epic == XXXX]
       STOP "no changes in epic XXXX" if matches is empty
       return matches sorted ascending by story
   - epic:XXXX story:NN:
       matches = [c for c in list if c.epic == XXXX and c.storyPath extends-or-equals NN]
       STOP "no change XXXX_NN*" if matches is empty
       return matches sorted in story order (one change for an unsplit story; the child set after a split)
   - story:NN:
       matches = [c for c in list if c.storyPath extends-or-equals NN]
       group matches by epic
       if one epic → return that epic's matches in story order
       if none    → STOP "no active change with story NN"
       if several → STOP "ambiguous story NN across epics <list>; qualify with epic:XXXX story:NN"
   - empty:
       defer to the command's existing default
```

Ordering key is `(epic, story path)` ascending everywhere — story order per §1. When a resolved set mixes epic-prefixed and legacy/unprefixed ids — e.g. a command's empty-selector "all active changes" default — the epic-prefixed ids sort first by `(epic, story)` ascending and the legacy/unprefixed ids are **appended after** them, in their listed order. Resolution reads only the resolved workspace root's `openspec/changes/` folder listing — no manifest, no persisted state.

**Anchored to one root.** The folder listing in step 1 is read under the **resolved workspace root**,
which `ptp-workspace` resolves **once** per command invocation and which is reused for every change
this resolution yields — never re-derived per resolved change. A change existing only in another
workspace therefore does not resolve here.

**A resolution STOP names the root it scanned.** The `no change <id>` STOP and the `no active changes`
STOP each state the resolved workspace root that was listed, so a selector aimed at the wrong workspace
reads differently from a genuinely missing change.


**Resolution output — use the resolved id, never the raw selector string.** Resolution yields one or more **change folder names** (e.g. `0008_02_landing-page-bulk-import`). The calling command substitutes a resolved change id for `$ARGUMENTS` / `<change-id>` wherever its steps reference the change — when building a path like `openspec/changes/<change-id>/`, when passing `change-id = …` to an inner skill (e.g. `ptp-review-loop`), and when naming the change in a follow-up command. This matters even when a selector resolves to exactly **one** change: a selector form such as `epic:0008 story:02` is *not* itself a folder name, so the command must use the resolved id `0008_02_…`, not the literal `$ARGUMENTS` string. The only case where `$ARGUMENTS` is used verbatim is a bare-id selector, where the resolved id equals `$ARGUMENTS` by definition.

## 4. Epic allocation (producers only)

Producers (`/ptp:plan-multiple`, `/ptp:plan`, `/ptp:brainstorm`, `/ptp:analyze`, and `/ptp:prd` for the free-text case) allocate a fresh epic when creating a new change. The algorithm:

```
1. candidates = folder names under <resolved workspace root>/openspec/changes/
                 (excluding "archive")
             + folder names under <resolved workspace root>/openspec/changes/archive/
               with each leading YYYY-MM-DD- date prefix stripped
2. epics = { leading 4-digit group : name matches ^\d{4}_ }
3. next = max(epics) + 1   (if epics is non-empty)
        = 1                 (if no epic-prefixed folders exist)
4. epic_str = zero-pad(next, 4)   →  "0001", "0002", …
```

This scans **both** active and archived folders so no active or archived epic number is ever reused. A second `plan-multiple` call in one session re-scans and sees the first run's new folders.
Both candidate folders sit under the **resolved workspace root** — the same one `ptp-workspace`
resolved once for this invocation — so epic counters are **per-workspace**: two workspaces in one
repository may allocate the same epic number, and that is intended. The branch-naming consequence of
that belongs to `ptp-branch-guard` and is not settled here.


**Per-producer usage:**
- `/ptp:plan-multiple` — calls this once, then assigns `epic_str_01`, `epic_str_02`, … to slices in dependency order. When it is instead re-cutting a change that returned `NEEDS SPLIT`, it allocates **no** epic and uses §4b's sub-story allocation.
- `/ptp:plan` — calls this once and assigns `epic_str_01_<desc>` for a standalone change. **Exception:** when `/ptp:plan` is invoked with a fully-formed `XXXX_NN_` id (the `/ptp:plan-multiple` → `/ptp:plan` delegation path), it preserves that id verbatim and does NOT allocate a new epic.
- `/ptp:brainstorm` — calls this once and assigns `epic_str_01_<desc>` so the later `/ptp:plan` keeps the same id.
- `/ptp:analyze` — allocates `epic_str_01_<subject-slug>` only to house an analysis doc (no proposal, design, tasks, or spec delta), and only when no relevant active change exists to receive the analysis doc.
- `/ptp:prd` — allocates `epic_str_01_<desc>` **only** when the argument is **free text** (non-empty, carrying no `epic:`/`story:` token, and matching no existing active change folder); it then creates the change folder and authors the PRD into it. For every selector form (`epic:XXXX`, `epic:XXXX story:NN`, `story:NN`, `epic:all`, a folder-matching bare id, or omitted) it projects/consumes via the `ptp-prd` epic projection and allocates nothing.

### 4b. Sub-story allocation (`NEEDS SPLIT` re-cuts only)

When a change `XXXX_<path>_<desc>` returns `NEEDS SPLIT` (the terminal state owned by
`ptp-writing-plans`), its replacement changes are its **children**: `XXXX_<path>_01_<desc1>`,
`XXXX_<path>_02_<desc2>`, …, numbered in dependency order. The same rule applies one level deeper if
a child itself needs a split (`XXXX_<path>_01_01_…`). No fresh epic is allocated, and no sibling id
changes — the children inherit the parent's position in story order (§1).

Three rules make this safe:

1. **The parent is replaced, never kept — and its anchored artifacts move first.** The parent folder
   is deleted only after every artifact it holds that the children do **not** re-author is moved into
   the **first child**: `brainstorm.md`, `analysis.md`, and — decisively — `prd.md`. A PRD is anchored
   at its epic's lowest-numbered story folder (`ptp-prd`), so splitting story `01` would otherwise
   **delete the epic's PRD**; moving it into `XXXX_01_01_…` keeps it anchored, because that child is
   the epic's new lowest-numbered story under §1's story order. `brainstorm.md` may instead go to
   `openspec/brainstorms/<parent-id>-brainstorm.md` — **always that path, never a child's own
   `brainstorm.md`**, which the child's planning run writes for itself and would overwrite, and which
   in any case describes the parent's whole pre-split scope rather than that child's. Only the
   regenerable planning artifacts the children re-author — `proposal.md`, `design.md`, `tasks.md`,
   spec deltas, `effort.md` — are discarded, the same preserve-then-delete order
   `/ptp:plan-multiple` step 4 uses. Parent and children never coexist, which is what keeps story
   order equal to plain lexicographic id order.
2. **Dependency references are rewritten at the re-cut.** Every active sibling whose `proposal.md`
   declares `depends on <parent-id>` is updated to depend on the split's **last** child (the chain's
   completion); a dependency **into** the split from outside never targets a mid-chain child unless
   the re-cut states why. The re-cutting command performs this rewrite in its join step and reports
   each edit — a dangling parent reference is a defect.
3. **Children are numbered by re-scan, exactly like epics.** `next child = max(existing child
   segments under that parent, active and archived) + 1`, so a second re-cut of the same parent (or
   a re-cut after some children were archived) never reuses a child number.

## 5. Command roles

All ptp commands that take a change argument fall into one of two roles. Reference the appropriate role in one line near the command's `## Inputs` section.

### Role A — Producers (allocate + name)

Commands: `/ptp:plan-multiple`, `/ptp:plan`, `/ptp:brainstorm`, `/ptp:analyze`, `/ptp:prd`

These **allocate** a fresh epic and **name** the change folder. The pure producers (`/ptp:plan-multiple`, `/ptp:plan`, `/ptp:brainstorm`) do not consume selectors — they produce ids. The **hybrid producers** (`/ptp:analyze`, `/ptp:prd`) also resolve their argument onto existing changes — they allocate a fresh epic only in specific cases and otherwise route onto an existing change (`/ptp:analyze` routes its free-text subject to a relevant active change by scope overlap; `/ptp:prd` projects a selector onto existing epics). Each references this skill for the allocation algorithm and the id format contract.

**Limited producer — `/ptp:analyze`**: allocates `XXXX_01_<subject-slug>` only to house an analysis doc; it never produces proposal/design/tasks/spec-delta. It allocates only when no relevant active change exists to receive the analysis doc.

**Limited/hybrid producer — `/ptp:prd`**: a producer **only** for the free-text case (a non-empty argument that carries no `epic:`/`story:` token and matches no existing active change folder), where it allocates `XXXX_01_<desc>` via §4, creates the folder, and authors the PRD into it. For every selector form (`epic:XXXX`, `epic:XXXX story:NN`, `story:NN`, `epic:all`, a folder-matching bare id, or omitted) it consumes/projects and allocates nothing. It is **not** a generic set-capable Role-B consumer — its consumer behavior is the additive `ptp-prd` epic projection (one PRD per projected epic), not the §3 set-iterate contract.

### Role B — Set-capable consumers (resolve + iterate)

Commands: `review`, `review-loop`, `review-full`, `codex-review`, `codex-review-loop`, `codex-review-plan`, `codex-review-plan-loop`, `review-plan`, `review-plan-loop`, `review-plan-full`, `review-fix`, `apply`, `effort`, `archive`, `archive-force`, `archive-and-deploy`, `status`, `full-apply`, `telemetry report`

**`/ptp:telemetry report`** is set-capable and adds **no grammar**: it strips its own literal `write` keyword *before* the remaining argument reaches this skill, so the selector only ever sees a form defined here (`ptp-telemetry-report` [report-selector-delegation]). Under `epic:all` it treats each resolved epic as a **separate reporting scope** and never merges or sums figures across epics. (The other `/ptp:telemetry` subcommands take no selector — `export` is global by definition.)

`epic:all` is immediately available to every consumer in this list the moment it lands — no per-command change is required. Any set-capable consumer that receives `epic:all` resolves it through §3 and operates on all active changes.

These **resolve** the selector via the algorithm in §3 and, if it resolves to more than one change, **iterate** their existing per-change behavior in story order, reporting per change. When the selector resolves to exactly one change, the command behaves identically to its prior single-id behavior.

**Single-context consumer — `/ptp:codex-review-uncommitted`** (not in the set-capable list above): it gains the `argument-hint` update and **resolves** its argument through this skill (satisfying the shared-grammar requirement), but because it grades a single working tree it requires the selector to resolve to **exactly one** change. If the selector resolves to more than one change (e.g. `epic:XXXX`), **STOP** and ask the user for a bare id or `epic:XXXX story:NN`. It never iterates and reviews the working tree once.

**Orchestration command — `/ptp:full-apply`**: Set-capable. Selector expansion, per-story ordering, and the apply→review-full loop are delegated to the `ptp-full-apply` skill (which launches the `ptp-full-apply` workflow); the command is a thin wrapper that accepts a selector (or explicit id list, or empty) and passes it through. (The former `/ptp:full-apply-effort` has been collapsed into `/ptp:full-apply` — a workflow agent carries its own model, so there is no session-dial effort gate to honor separately.)

**Not set-capable:**
- `/ptp:full-plan` — a producer-orchestrator; it decomposes via `/ptp:plan-multiple` and plan-reviews each slice it just produced, not a selector over existing changes.
- `/ptp:full` — an end-to-end producer-orchestrator: it runs the full-plan flow (decompose via `/ptp:plan-multiple` + per-slice plan-review) and, on plan convergence, continues into the full-apply flow (apply + review-full per slice) over the slices it just produced. Like `/ptp:full-plan` it takes a request / oversized-change argument, not a selector over existing changes.
- `/ptp:brainstorm-only` — no change folder, no epic; writes to `openspec/brainstorms/` only.
