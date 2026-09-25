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

This is a **hybrid producer/consumer**, per `ptp-change-selector` §5: it allocates a fresh epic only when no existing change is targeted, and
otherwise writes into an existing one. Do not restate `ptp-change-selector`'s grammar or allocation
algorithm here; cite it.

This command writes `prompt.md` through the **`ptp-run-at-model`** skill in one foreground main run at
a resolved target (the `prompt` family default target per `skills/ptp-run-at-model/references/family-default-target.md` by default, or a valid caller-side `model:` override) — see *Run at
model* below for the outer-session ordering (the `model:` parse-and-strip, the STOPs, the resolution
or allocation, and the branch guard all run outer, **before** the main run starts).

## No accumulated understanding — STOP

If this conversation holds no accumulated understanding from a prior `/ptp:prompt` / `/ptp:prompt-fix`
turn, **STOP** and say so. Never write an empty or fabricated `prompt.md`.

## Argument resolution

1. **An argument is given.** Resolve it through the **`ptp-change-selector`** skill's selector
   grammar (bare id, `epic:XXXX story:NN`, etc.).
   - Resolves to **exactly one** existing change → write into that change's folder (below). A bare
     epic container id `XXXX_00_<desc>` counts as an existing change here (`ptp-change-selector` §1,
     §3 bare-id branch): `prompt.md` goes into that container.
   - Resolves to **more than one** change → **STOP**, write nothing, and ask for a bare id or
     `epic:XXXX story:NN` instead of writing into an ambiguous target — the same posture
     `ptp-change-selector` §5 documents for `/ptp:codex-review-uncommitted`.
   - Resolves to **no existing change** (a selector that names nothing, or free text) → treat as "no
     argument" (below).
2. **No argument, or an argument resolving to no existing change.** Allocate a fresh epic per
   `ptp-change-selector` §4 (epic allocation) and create its epic container `XXXX_00_<desc>` (§4
   *Container writers*), `<desc>` derived from the accumulated understanding's subject (≤ 5
   kebab-case words): create `openspec/changes/<XXXX_00_desc>/` and write `prompt.md` there. No story
   folder is created.

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

## Run at model

`/ptp:prompt-write` is write-capable, so the abort-guaranteeing preconditions, the resolution/
allocation, and the branch guard all run in the **outer session, before the main work starts** — per
`ptp-run-at-model`'s "Outer abort-preconditions first" and "Branch guard in the outer session" steps
(referenced here, not restated). In order:

1. **Parse-and-strip** an optional `model:<model>.<effort>` override token from the argument text per
   `ptp-run-at-model`'s "Optional caller-side `model:` override token" section, **before** anything
   else below — an invalid or duplicate token STOPs here, before any folder is allocated or branch is
   cut.
2. **STOP preconditions**: the "no accumulated understanding" STOP above, and the ambiguous-selector
   STOP (*Argument resolution* above) — both abort-guaranteeing, so both run outer, before any spawn.
3. **Resolve or allocate**: run the `ptp-change-selector` resolution to one existing change, or the
   fresh epic allocation and its `XXXX_00_<desc>` container (*Argument resolution* above), yielding
   the target change or container id.
4. **Branch guard**: run the `ptp-branch-guard` preamble with that resolved or allocated id as the
   branch leaf.
5. **Run the main work**: only now does the **one foreground `ptp-run-at-model` main run** (the Claude
   subagent by default, or the `codex exec` shell-out when `main=codex`) execute, at the resolved
   target (the `prompt` family default target per `family-default-target.md` by default, or the valid `model:` override) — writing `prompt.md` into the
   resolved or allocated change folder per *`prompt.md` shape* above. The main run does **not**
   inherit the outer session's conversation, so its prompt MUST carry: the accumulated understanding
   held from this conversation's prior `/ptp:prompt` / `/ptp:prompt-fix` turns (the content to
   persist), the resolved or newly allocated change id/folder path to write into, and the
   token-stripped argument text. Because the outer session already ran the branch guard, the main
   run's own branch-guard check is a no-op.
6. **Relay**: the outer session surfaces the main run's terminal result per `ptp-run-at-model`'s
   *Result relay* — the resolved or allocated change id, the resulting state, any failure, and the
   next command to run.

The no-empty-file STOP, the ambiguous-target STOP, the fresh-epic allocation, the branch-guard
obligation, the write-only-`prompt.md` rule, and the never-auto-invoke rule are unchanged in substance
— only the executing context (the main run) and the resolved target move.

## What this command does NOT do

It **does not auto-invoke** `/ptp:plan`, `/ptp:brainstorm`, `/ptp:plan-multiple`, or `/ptp:full` — it
never auto-invokes a downstream producer. It only writes `prompt.md` and reports the resolved or newly
allocated change id plus a suggested next command — the user runs that command themselves. For an
epic container, including a freshly allocated one, it recommends `/ptp:plan <container-id>` (which
plans the epic's next story per `ptp-change-selector` §4c) and `/ptp:full <container-id>` (which plans
the container's slices into its epic); for an existing story, e.g.
`/ptp:full <change-id>` or `/ptp:plan <change-id>`.

## Hard rules

- **Never write an empty or fabricated `prompt.md`.** No accumulated understanding → STOP.
- **Never write into an ambiguous target.** A multi-change selector → STOP and ask for a bare id or
  `epic:XXXX story:NN`.
- **Never auto-invoke a downstream producer.** Report the next command; never run it.
- **Run the `ptp-branch-guard` preamble before writing** — this command is write-capable.
- **Write only `prompt.md`.** No other file under the target change folder is touched.
