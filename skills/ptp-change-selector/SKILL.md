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

**Epic container.** A folder whose id matches the grammar above and whose story path is exactly
`00` is the **epic container** of its epic, named `XXXX_00_<slug>` with `<slug>` the epic's
kebab-case description. It is recognized by its name alone; no marker file is read. It holds
epic-level files only (`ptp-artifact-contract` §6) and is **not an active change**: it is never
planned, applied, reviewed as code, or validated, and an epic's stories keep story paths `01`
upward. A deeper path such as `03_01` is never a container.

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
   and excluding every epic container (story path exactly 00, §1); the bare-id branch below
   matches against the full listing, containers included
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
       return [name] if a folder equals it (full listing — an epic container still resolves)
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
       defer to the command's existing default, which drops every epic container (§1)
       before it orders, confirms or disambiguates, and never offers one as a choice
```

**Containers are skipped, not errors.** Because step 1 drops epic containers, `epic:all` over
containers only STOPs with "no active changes", `epic:XXXX` over a lone container STOPs with
"no changes in epic XXXX", and `story:00` STOPs with "no active change with story 00". An empty
selector's default (usually `npx -y openspec list`, which does list a container as "No tasks") drops
`_00` containers the same way.

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

Producers (`/ptp:plan-multiple`, `/ptp:brainstorm-decompose`, `/ptp:plan`, `/ptp:brainstorm`, `/ptp:brainstorm-full`, `/ptp:prompt-write`, and `/ptp:analyze`) allocate a fresh epic when creating a new change or epic container. The algorithm:

```
1. candidates = folder names under <resolved workspace root>/openspec/changes/
                 (excluding "archive")
             + folder names under <resolved workspace root>/openspec/changes/archive/
               with each leading YYYY-MM-DD- date prefix stripped
             + folder names under <resolved workspace root>/openspec/epics_00/
               with each leading YYYY-MM-DD- date prefix stripped (a missing epics_00/ adds nothing)
2. epics = { leading 4-digit group : name matches ^\d{4}_ }   (an epic container XXXX_00_* counts)
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
- `/ptp:plan-multiple` — calls this once, then assigns `epic_str_01`, `epic_str_02`, … to slices in dependency order. When it is instead re-cutting a change that returned `NEEDS SPLIT`, it allocates **no** epic and uses §4b's sub-story allocation. Handed a bare epic container id, it allocates **no** epic and follows §4c's "Decomposing with a container".
- `/ptp:brainstorm-decompose` — calls this once (fresh decomposition only — it has no re-cut mode), then assigns `epic_str_01`, `epic_str_02`, … to slices in dependency order, exactly as `/ptp:plan-multiple` does. Handed a bare epic container id, it allocates **no** epic and follows §4c's "Decomposing with a container".
- `/ptp:plan` — given free text, calls this once and assigns `epic_str_01_<desc>` for a standalone change; it creates no epic container. **Exception:** when `/ptp:plan` is invoked with a fully-formed `XXXX_NN_` id whose story path is not `00` (the `/ptp:plan-multiple` → `/ptp:plan` delegation path), it preserves that id verbatim and does NOT allocate a new epic. A bare container id `XXXX_00_<slug>` is not that exception: it is planned per §4c.
- `/ptp:brainstorm` and `/ptp:brainstorm-full` — given free text, call this once and create the epic container `epic_str_00_<desc>`, writing `brainstorm.md` there. Given an existing change id, a container included, they keep it verbatim and allocate nothing.
- `/ptp:prompt-write` — given no argument, or one that resolves to no existing change, calls this once and creates the epic container `epic_str_00_<desc>`, writing `prompt.md` there. An argument naming an existing change, a container included, writes into that folder.
- `/ptp:analyze` — always allocates a fresh epic and creates its container `epic_str_00_<subject-slug>` to house an analysis doc (no proposal, design, tasks, or spec delta); never routes onto an existing change, regardless of scope overlap.

**Container writers.** A fresh epic-level writer — `/ptp:prompt-write`, `/ptp:analyze`,
`/ptp:brainstorm`, `/ptp:brainstorm-full` — names its new folder `XXXX_00_<desc>`, `<desc>` derived
as before, writes its one epic-level file there, and creates **no** story folder. Only a fresh
allocation creates a container, so an epic never gets a second one that way. **Second-container
STOP:** `/ptp:brainstorm` or `/ptp:brainstorm-full` handed a `_00` id that names no folder STOPs when
its epic `XXXX` already has another container, under `openspec/changes/` or (date prefix stripped)
`openspec/epics_00/`, and names that container: "epic `XXXX` already has container `<existing-id>`; pass that id". With no
other container it creates the folder under the id it was given.

### 4b. Sub-story allocation (`NEEDS SPLIT` re-cuts only)

When a change `XXXX_<path>_<desc>` returns `NEEDS SPLIT` (the terminal state owned by
`ptp-writing-plans`), its replacement changes are its **children**: `XXXX_<path>_01_<desc1>`,
`XXXX_<path>_02_<desc2>`, …, numbered in dependency order. The same rule applies one level deeper if
a child itself needs a split (`XXXX_<path>_01_01_…`). No fresh epic is allocated, and no sibling id
changes — the children inherit the parent's position in story order (§1).

Three rules make this safe:

1. **The parent is replaced, never kept — and its anchored artifacts move first.** The parent folder
   is deleted only after every artifact it holds that the children do **not** re-author is moved into
   the **first child**: `brainstorm.md` and `analysis.md`. `brainstorm.md` may instead go to
   `openspec/brainstorms/<parent-id>-brainstorm.md` — **always that path, never a child's own
   `brainstorm.md`**, which the child's planning run writes for itself and would overwrite, and which
   in any case describes the parent's whole pre-split scope rather than that child's. Only the
   regenerable planning artifacts the children re-author — `proposal.md`, `design.md`, `tasks.md`,
   spec deltas, `effort.md` — are discarded, the same preserve-then-delete order
   `/ptp:plan-multiple` step 4 uses. Parent and children never coexist, which is what keeps story
   order equal to plain lexicographic id order. A re-cut never touches the epic container: it never
   creates, writes, moves or deletes `XXXX_00_*` (§4c).
2. **Dependency references are rewritten at the re-cut.** Every active sibling whose `proposal.md`
   declares `depends on <parent-id>` is updated to depend on the split's **last** child (the chain's
   completion); a dependency **into** the split from outside never targets a mid-chain child unless
   the re-cut states why. The re-cutting command performs this rewrite in its join step and reports
   each edit — a dangling parent reference is a defect.
3. **Children are numbered by re-scan, exactly like epics.** `next child = max(existing child
   segments under that parent, active and archived) + 1`, so a second re-cut of the same parent (or
   a re-cut after some children were archived) never reuses a child number.

### 4c. Planning from a container

`/ptp:plan` handed a bare container id `XXXX_00_<slug>` treats it as its **input**, not its output.
It allocates no epic, and a container id that names no folder under `openspec/changes/` STOPs:
"no epic container `<id>`".

- **Story number.** The new change is `XXXX_NN_<slug>`, where `NN` is one above the highest top-level
  story segment of epic `XXXX` among active folders and archived folders (date prefix stripped),
  containers excluded; an epic with no story gets `01`.
- **Slug.** `<slug>` is the container's slug, verbatim.
- **Read in place.** The container's `brainstorm.md`, when present, is the decision source. Its
  `prompt.md` and `analysis.md` are request context; with no container `brainstorm.md`, the planner
  brainstorms inline from them and writes the story's own `brainstorm.md`. None of them is copied.
- **No write.** Nothing is written into the container. This is a producer path, so the §5 epic
  container guard does not apply.

**Epic-level file lookup (story first, then container).** A reader looking for a story's `brainstorm.md`, `prompt.md` or
`analysis.md` reads the story folder first and, only when that file is absent there, the same-named
file in its epic's container `XXXX_00_*` under `openspec/changes/`. The story file wins, being more
specific. An older epic that keeps these files in a story folder is found by that first step, so no
migration is needed.

**Full story id: context only.** `/ptp:plan` handed a full story id (`XXXX_NN_…`, `NN` not `00`)
treats a container `brainstorm.md` found by that lookup as context only, never as that story's
decision, and still writes the story's own `brainstorm.md`: a `/ptp:plan-multiple` member plans one
slice, and the container may describe the whole epic.

**Decomposing with a container.** This rule is owned here; `/ptp:plan-multiple`,
`/ptp:brainstorm-decompose` and `/ptp:full` cite it and restate none of it.

- **Container input.** Handed a bare container id, a decomposer allocates no epic; one naming no
  folder STOPs in beat 1, as `/ptp:plan` does above. It reads the
  container's `prompt.md`, `brainstorm.md` and `analysis.md` in place and never writes, moves or
  deletes the container. Its slices are `XXXX_NN_…`, numbered consecutively from the epic's next story
  number above (`01` for a fresh container). On fallback `/ptp:plan-multiple` hands the container id to
  `/ptp:plan`; `/ptp:brainstorm-decompose` hands `/ptp:brainstorm` a fresh story id at the next story
  number, never the container id (that would overwrite the container's `brainstorm.md`).
- **Fresh-split container.** On the split path only, a fresh decomposition creates its new epic's
  container `XXXX_00_<desc>` in beat 2, before any member starts; `<desc>` is the input folder's desc,
  or the ≤5-word summary of the request. `/ptp:plan-multiple` step 4 moves the input folder's
  `prompt.md`, `brainstorm.md` and `analysis.md` into it. A fallback creates no container.
- **Capsule.** When no `brainstorm.md` is moved into the new container — always, for
  `/ptp:brainstorm-decompose`, which copies nothing from its input — beat 2 writes its decompose
  capsule there as the container's `brainstorm.md`, in the `ptp-brainstorming` shape and holding no
  slice list. The capsule is not an umbrella doc.
- **Member no-write.** No member writes the container: the member prompt names the container id as
  read-only context, a `/ptp:plan` member treats its brainstorm as context only (above), and a
  `/ptp:brainstorm` member writes only its own story folder. The container is written once, by beat 2,
  before any member starts.

## 5. Command roles

All ptp commands that take a change argument fall into one of two roles. Reference the appropriate role in one line near the command's `## Inputs` section.

### Role A — Producers (allocate + name)

Commands: `/ptp:plan-multiple`, `/ptp:brainstorm-decompose`, `/ptp:plan`, `/ptp:brainstorm`, `/ptp:brainstorm-full`, `/ptp:prompt-write`, `/ptp:analyze`

These **allocate** a fresh epic and **name** the change folder. The pure producers (`/ptp:plan-multiple`, `/ptp:brainstorm-decompose`, `/ptp:plan`, `/ptp:brainstorm`, `/ptp:analyze`) do not consume selectors — they produce ids. A **hybrid producer** (`/ptp:prompt-write`) also resolves its argument onto existing changes — it allocates a fresh epic only when no existing change is targeted and otherwise routes onto an existing change. Each references this skill for the allocation algorithm and the id format contract.

**Limited producer — `/ptp:analyze`**: on every invocation allocates a fresh epic container `XXXX_00_<subject-slug>` only to house an analysis doc; it never produces proposal/design/tasks/spec-delta and never routes onto an existing change, regardless of scope overlap.

### Role B — Set-capable consumers (resolve + iterate)

Commands: `review`, `review-loop`, `review-full`, `codex-review`, `codex-review-loop`, `codex-review-plan`, `codex-review-plan-loop`, `review-plan`, `review-plan-loop`, `review-plan-full`, `review-fix`, `apply`, `effort`, `archive`, `archive-force`, `archive-and-deploy`, `status`, `full-apply`, `telemetry report`

**`/ptp:telemetry report`** is set-capable and adds **no grammar**: it strips its own literal `write` keyword *before* the remaining argument reaches this skill, so the selector only ever sees a form defined here (`ptp-telemetry-report` [report-selector-delegation]). Under `epic:all` it treats each resolved epic as a **separate reporting scope** and never merges or sums figures across epics. (The other `/ptp:telemetry` subcommands take no selector — `export` is global by definition.)

`epic:all` is immediately available to every consumer in this list the moment it lands — no per-command change is required. Any set-capable consumer that receives `epic:all` resolves it through §3 and operates on all active changes.

These **resolve** the selector via the algorithm in §3 and, if it resolves to more than one change, **iterate** their existing per-change behavior in story order, reporting per change. When the selector resolves to exactly one change, the command behaves identically to its prior single-id behavior.

**Epic container guard.** A per-change step that needs planning artifacts — `openspec validate`,
plan review, apply, code review, effort, full-apply, and the backlog run and continue flows — STOPs
when a bare id resolves to an epic container (§1): "`<id>` is an epic container, not an active
change; use `epic:XXXX` for its stories". It runs no `openspec validate`. A step that reads only
`prompt.md`, `brainstorm.md`, `analysis.md` or `stages/` markers MAY run on a container.

**Archive-family resolution.** The archive family is `/ptp:archive`, `/ptp:archive-force`,
`/ptp:archive-and-deploy` and `/ptp:archive-and-merge-to-master`. For the archive family only,
resolution yields two things: the active stories to archive, which never include a container, and the
epics the selector covers for the closing step.

- `epic:XXXX` covers epic `XXXX`. It STOPs with "no changes in epic XXXX" only when that epic has
  neither an active story nor a container.
- A bare container id resolves exactly as `epic:XXXX` for its epic. It never reaches the
  planning-artifact consumer guard above, and no archive gate validates the container.
- `epic:all`, and `/ptp:archive-force`'s empty/all default, cover every epic that has a container.
  `epic:all` STOPs with "no active changes" only when there is neither an active story nor a
  container.
- `story:NN` and `epic:XXXX story:NN` cover no epic beyond those of the stories they resolve.
- An empty-selector disambiguation never offers a container.

Every other selector consumer, except `/ptp:status`, keeps skipping containers.

**`/ptp:status` container resolution.** For `/ptp:status` only, resolution keeps the epic containers
the selector covers, instead of dropping them per step 1. The empty selector and `epic:all` cover
every epic's container and STOP with "no active changes" only when there is neither an active story
nor a container. `epic:XXXX` covers epic `XXXX`'s container and STOPs with "no changes in epic XXXX"
only when that epic has neither an active story nor a container. `story:NN` and
`epic:XXXX story:NN` never resolve to a container. An exact bare container id resolves even when no
active folder has that name, so `/ptp:status` can look in `openspec/epics_00/`, and never reaches the
planning-artifact consumer guard above. A container orders as story `00`, before its epic's stories.

**Single-context consumer — `/ptp:codex-review-uncommitted`** (not in the set-capable list above): it gains the `argument-hint` update and **resolves** its argument through this skill (satisfying the shared-grammar requirement), but because it grades a single working tree it requires the selector to resolve to **exactly one** change. If the selector resolves to more than one change (e.g. `epic:XXXX`), **STOP** and ask the user for a bare id or `epic:XXXX story:NN`. It never iterates and reviews the working tree once.

**Orchestration command — `/ptp:full-apply`**: Set-capable. Selector expansion, per-story ordering, and the apply→review-full loop are delegated to the `ptp-full-apply` skill (which launches the `ptp-full-apply` workflow); the command is a thin wrapper that accepts a selector (or explicit id list, or empty) and passes it through. (The former `/ptp:full-apply-effort` has been collapsed into `/ptp:full-apply` — a workflow agent carries its own model, so there is no session-dial effort gate to honor separately.)

**Not set-capable:**
- `/ptp:full-plan` — a producer-orchestrator; it decomposes via `/ptp:plan-multiple` and plan-reviews each slice it just produced, not a selector over existing changes.
- `/ptp:full` — an end-to-end producer-orchestrator: it runs the full-plan flow (decompose via `/ptp:plan-multiple` + per-slice plan-review) and, on plan convergence, continues into the full-apply flow (apply + review-full per slice) over the slices it just produced. Like `/ptp:full-plan` it takes a request / oversized-change argument, not a selector over existing changes. Both also accept a bare epic container id, passed on to `/ptp:plan-multiple` per §4c's "Decomposing with a container"; the slice set is the story ids it reports, never the container.
- `/ptp:brainstorm-only` — no change folder, no epic; writes to `openspec/brainstorms/` only.
