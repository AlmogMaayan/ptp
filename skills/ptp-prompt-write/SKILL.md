---
name: ptp-prompt-write
description: Persist a /ptp:prompt conversation's accumulated understanding into a prompt file
---

Owns command: /ptp:prompt-write

# ptp-prompt-write — persist the accumulated prompt understanding

## Purpose

`/ptp:prompt` and `/ptp:prompt-fix` (`ptp-prompt-draft`, epic `0068` story `01`) hold an accumulated
understanding of a request purely in conversation, writing nothing to disk. `/ptp:prompt-write` closes
that gap: it takes the conversation's accumulated understanding and writes it to a durable
`prompt.md`, either into an existing change folder or into a freshly allocated one.

This is a **hybrid producer/consumer**, per `ptp-change-selector` §5 — the same role `/ptp:prd` plays
for its own free-text case: it allocates a fresh epic only when no existing change is targeted, and
otherwise writes into an existing one. Do not restate `ptp-change-selector`'s grammar or allocation
algorithm here; cite it.

## No accumulated understanding — STOP

If this conversation holds no accumulated understanding from a prior `/ptp:prompt` / `/ptp:prompt-fix`
turn, **STOP** and say so. Never write an empty or fabricated `prompt.md`.

## Argument resolution

1. **An argument is given.** Resolve it through the **`ptp-change-selector`** skill's selector
   grammar (bare id, `epic:XXXX story:NN`, etc.).
   - Resolves to **exactly one** existing active change → write into that change's folder (below).
   - Resolves to **more than one** change → **STOP**, write nothing, and ask for a bare id or
     `epic:XXXX story:NN` instead of writing into an ambiguous target — the same posture
     `ptp-change-selector` §5 documents for `/ptp:codex-review-uncommitted`.
   - Resolves to **no existing change** (a selector that names nothing, or free text) → treat as "no
     argument" (below).
2. **No argument, or an argument resolving to no existing change.** Allocate a fresh `XXXX_01_<desc>`
   per `ptp-change-selector` §4 (epic allocation), `<desc>` derived from the accumulated
   understanding's subject (≤ 5 kebab-case words), create `openspec/changes/<XXXX_01_desc>/`, and
   write `prompt.md` there.

## Branch guard for this write

Writing `prompt.md` creates or updates a tracked file under `openspec/changes/`, so this is a
**write-capable** step: run the **`ptp-branch-guard`** preamble before writing — a no-op on a feature
branch, or a feature branch cut from `master`/`main` otherwise, leaf being the resolved or newly
allocated change id. The full rule lives in `ptp-branch-guard` — do not restate it here.

## `prompt.md` shape

A durable **transcript** of the accumulated understanding — free text, not a structured data file
downstream parses fields out of:

```markdown
# Prompt

## Understanding

<the current, final restated understanding from the /ptp:prompt / /ptp:prompt-fix conversation>

## Assumptions

<bullet list of assumptions made along the way, if any — omit the section if none>

## Source

Captured via /ptp:prompt-write from a /ptp:prompt / /ptp:prompt-fix conversation on <date>.
```

## What this command does NOT do

It **does not auto-invoke** `/ptp:plan`, `/ptp:brainstorm`, `/ptp:plan-multiple`, or `/ptp:full` — it
never auto-invokes a downstream producer. It only writes `prompt.md` and reports the resolved or newly
allocated change id plus a suggested next command (e.g. `/ptp:full <change-id>`, or
`/ptp:plan <change-id>`) — the user runs that command themselves.

## Hard rules

- **Never write an empty or fabricated `prompt.md`.** No accumulated understanding → STOP.
- **Never write into an ambiguous target.** A multi-change selector → STOP and ask for a bare id or
  `epic:XXXX story:NN`.
- **Never auto-invoke a downstream producer.** Report the next command; never run it.
- **Run the `ptp-branch-guard` preamble before writing** — this command is write-capable.
- **Write only `prompt.md`.** No other file under the target change folder is touched.
