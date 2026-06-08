---
name: ptp-change-selector
description: Shared change-id format, epic/story selector grammar, resolution algorithm, and epic allocation for all ptp commands. Every command that takes a change argument resolves it through this skill rather than restating the grammar.
---

# ptp-change-selector — shared change-id format + selector grammar + epic allocation

## Purpose

This skill is the single source of truth for three things every ptp command needs:

1. The **id format** every change born through the ptp flow carries.
2. The **selector grammar** that any command argument resolves through.
3. The **epic allocation** algorithm producers use to name new changes.

It mirrors how `ptp-full-run` and `ptp-review-loop` already factor shared protocol out of the individual commands. Every ptp command references this skill; none restates the rules.

## 1. Id format

```
<epic>_<story>_<kebab-description>
  epic  = exactly 4 digits, zero-padded   (e.g. 0001)
  story = exactly 2 digits, zero-padded   (e.g. 01)
  desc  = kebab-case [a-z0-9] words joined by '-'
full regex: ^\d{4}_\d{2}_[a-z0-9]+(-[a-z0-9]+)*$
```

Example: `0001_01_landing-page-list-bulk-export`.

**Legacy forms** — ids created before this convention — are still valid and resolvable by exact match:
- Pre-epic slice ids: `^\d{2}_…` (e.g. `01_distinct-activation-steps`)
- Plain standalone ids: `^[a-z0-9-]+$` (e.g. `cloudflare-config-health-panel`)

Legacy ids are **never produced going forward**. They are resolved by exact match only — not addressable via `epic:` or `story:` selectors.

## 2. Selector grammar

A command argument string is classified in this order (first match wins):

| Priority | Form | Example | Resolves to |
|----------|------|---------|-------------|
| 1 | `epic:XXXX` | `epic:0008` | All active changes in epic `0008`, ascending by story |
| 1a | `epic:XXXX story:NN` | `epic:0008 story:02` | The single change `0008_02_*` |
| 2 | `story:NN` | `story:01` | The one active change with that story — if unambiguous |
| 3 | bare id | `0008_02_my-change` | The single folder with that name (exact match) |
| 4 | empty | (none) | Command's own existing default |

Classification rules:
- Starts with `epic:` → epic selector; parse for optional ` story:NN` suffix.
- Starts with `story:` (without `epic:`) → bare story selector.
- Otherwise → bare id (exact folder-name match).
- Empty → defer to the command's existing default.

`epic:` and `story:` are **reserved prefixes** — bare ids may not start with them.

## 3. Resolution algorithm (deterministic, stateless)

```
inputs: selector string

1. list = folder names under openspec/changes/ excluding "archive"
2. parse each name:
   - if matches ^\d{4}_\d{2}_[a-z0-9]+(-[a-z0-9]+)*$ → epic-prefixed: (epic, story, desc)
   - else → legacy: (epic=None, story=None, id=name)
3. switch on selector:
   - bare id:
       return [name] if a folder equals it
       else STOP "no change <id>"
   - epic:XXXX:
       matches = [c for c in list if c.epic == XXXX]
       STOP "no changes in epic XXXX" if matches is empty
       return matches sorted ascending by story
   - epic:XXXX story:NN:
       return the single c where (epic==XXXX and story==NN)
       else STOP "no change XXXX_NN_*"
   - story:NN:
       matches = [c for c in list if c.story == NN]
       if len==1 return it
       if len==0 STOP "no active change with story NN"
       if len>1 STOP "ambiguous story NN across epics <list>; qualify with epic:XXXX story:NN"
   - empty:
       defer to the command's existing default
```

Ordering key is `(epic, story)` ascending everywhere. When a resolved set mixes epic-prefixed and legacy/unprefixed ids — e.g. a command's empty-selector "all active changes" default — the epic-prefixed ids sort first by `(epic, story)` ascending and the legacy/unprefixed ids are **appended after** them, in their listed order. Resolution reads only the `openspec/changes/` folder listing — no manifest, no persisted state.

**Resolution output — use the resolved id, never the raw selector string.** Resolution yields one or more **change folder names** (e.g. `0008_02_landing-page-bulk-import`). The calling command substitutes a resolved change id for `$ARGUMENTS` / `<change-id>` wherever its steps reference the change — when building a path like `openspec/changes/<change-id>/`, when passing `change-id = …` to an inner skill (e.g. `ptp-review-loop`), and when naming the change in a follow-up command. This matters even when a selector resolves to exactly **one** change: a selector form such as `epic:0008 story:02` is *not* itself a folder name, so the command must use the resolved id `0008_02_…`, not the literal `$ARGUMENTS` string. The only case where `$ARGUMENTS` is used verbatim is a bare-id selector, where the resolved id equals `$ARGUMENTS` by definition.

## 4. Epic allocation (producers only)

Producers (`/ptp:plan-multiple`, `/ptp:plan`, `/ptp:brainstorm`) allocate a fresh epic when creating a new change. The algorithm:

```
1. candidates = folder names under openspec/changes/   (excluding "archive")
             + folder names under openspec/changes/archive/
               with each leading YYYY-MM-DD- date prefix stripped
2. epics = { leading 4-digit group : name matches ^\d{4}_ }
3. next = max(epics) + 1   (if epics is non-empty)
        = 1                 (if no epic-prefixed folders exist)
4. epic_str = zero-pad(next, 4)   →  "0001", "0002", …
```

This scans **both** active and archived folders so no active or archived epic number is ever reused. A second `plan-multiple` call in one session re-scans and sees the first run's new folders.

**Per-producer usage:**
- `/ptp:plan-multiple` — calls this once, then assigns `epic_str_01`, `epic_str_02`, … to slices in dependency order.
- `/ptp:plan` — calls this once and assigns `epic_str_01_<desc>` for a standalone change. **Exception:** when `/ptp:plan` is invoked with a fully-formed `XXXX_NN_` id (the `/ptp:plan-multiple` → `/ptp:plan` delegation path), it preserves that id verbatim and does NOT allocate a new epic.
- `/ptp:brainstorm` — calls this once and assigns `epic_str_01_<desc>` so the later `/ptp:plan` keeps the same id.

## 5. Command roles

All ptp commands that take a change argument fall into one of two roles. Reference the appropriate role in one line near the command's `## Inputs` section.

### Role A — Producers (allocate + name)

Commands: `/ptp:plan-multiple`, `/ptp:plan`, `/ptp:brainstorm`

These **allocate** a fresh epic and **name** the change folder. They do not consume selectors — they produce ids. Each references this skill for the allocation algorithm and the id format contract.

### Role B — Set-capable consumers (resolve + iterate)

Commands: `review`, `review-loop`, `review-full`, `codex-review`, `codex-review-loop`, `codex-review-plan`, `codex-review-plan-loop`, `review-plan`, `review-plan-loop`, `review-plan-full`, `review-fix`, `apply`, `effort`, `archive`, `archive-force`, `status`, `full-run`

These **resolve** the selector via the algorithm in §3 and, if it resolves to more than one change, **iterate** their existing per-change behavior in story order, reporting per change. When the selector resolves to exactly one change, the command behaves identically to its prior single-id behavior.

**Single-context consumer — `/ptp:codex-review-uncommitted`** (not in the set-capable list above): it gains the `argument-hint` update and **resolves** its argument through this skill (satisfying the shared-grammar requirement), but because it grades a single working tree it requires the selector to resolve to **exactly one** change. If the selector resolves to more than one change (e.g. `epic:XXXX`), **STOP** and ask the user for a bare id or `epic:XXXX story:NN`. It never iterates and reviews the working tree once.

**Orchestration command — `/ptp:full-run`**: Set-capable. Selector expansion, per-story ordering, and the apply→review-full loop are delegated to the `ptp-full-run` skill (which launches the `ptp-full-run` workflow); the command is a thin wrapper that accepts a selector (or explicit id list, or empty) and passes it through. (The former `/ptp:full-run-effort` has been collapsed into `/ptp:full-run` — a workflow agent carries its own model, so there is no session-dial effort gate to honor separately.)

**Not set-capable:**
- `/ptp:full-plan` — a producer-orchestrator; it decomposes via `/ptp:plan-multiple` and plan-reviews each slice it just produced, not a selector over existing changes.
- `/ptp:brainstorm-only` — no change folder, no epic; writes to `openspec/brainstorms/` only.
