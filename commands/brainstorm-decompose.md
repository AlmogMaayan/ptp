---
description: Decompose an oversized change into slices, seeding each with only a brainstorm
argument-hint: "<change-id-or-request> [--workspace <path>] (the big change to split; XXXX_NN_<kebab-description> id of an existing change, or a short description)"
---

You are running a **decompose + brainstorm-only** variant of step 2 of the ptp flow. Use this
instead of `/ptp:plan-multiple` when you want to cut an oversized request into slices but seed
each slice with only a scoped `brainstorm.md` — leaving `proposal.md` / `design.md` / `tasks.md` /
spec deltas / `effort.md` to a later `/ptp:plan <slice-id>` per slice.

`/ptp:brainstorm-decompose` reuses `/ptp:plan-multiple`'s decompose machinery — its three-beat
structure, its Beat-2 return grammar (slice-line syntax, ascending-and-unique story order,
`depends:` syntax, first-two-`|` scope parsing, ≥ 2-slice split rule, and full refusal list), and
its `ptp-parallel-fanout` fan-out contract — citing that command as owner rather than restating any
of it. Only the per-slice writer, the sentinel tokens, and the following simplifications differ.

## Inputs

The oversized change id or request: $ARGUMENTS

The `parallel:on|off` token parse (grammar, two-stage detect-then-validate, strip-before-use) is
identical to `/ptp:plan-multiple`'s — see its **Inputs** section; do not restate it here. Absent →
the resolved `parallel.mode` applies (absent is not `off`). Valid → strip and use for this
invocation only. Invalid → refuse and STOP in the outer session before the branch guard or any
spawn.

This command parses **no `fast:` token** and gains **no `model:` override token** — members run at
the `brainstorm` family default target (beat 3 below; `opus.high` built in) (or the `codex.model`/`codex.reasoningEffort` equivalent under
`roles.main=codex`).

Epic allocation (beat 1): allocate one fresh epic for all slices per the `ptp-change-selector`
skill (§4, epic allocation). **Fresh decomposition only — there is no re-cut mode.**

## Simplifications vs `/ptp:plan-multiple`

- **No re-cut mode.** A fresh epic is always allocated; slices are always `XXXX_01`, `XXXX_02`, ….
- **Read-only input.** An existing `openspec/changes/<id>/` folder named by `$ARGUMENTS` is read as
  decompose input only — its artifacts (`brainstorm.md`, `proposal.md`, `design.md`, `tasks.md`,
  spec deltas) inform the decomposition, but the folder is **never modified or deleted**. There is
  no step-4 preserve/delete step and no guaranteed-abort "implementation already started" STOP,
  because nothing can be orphaned when nothing is deleted.
- **No `model:` override token**, matching `/ptp:plan-multiple`.

## Branch safety (beat 1, first write-affecting step)

Beat 1 runs entirely in the outer session, in this exact order: (1) parse and strip the
`parallel:` token, (2) allocate the fresh epic per `ptp-change-selector` §4, (3) run the
**`ptp-branch-guard`** preamble once, (4) gather read-only input (see Beat 1 below). No main run of
any kind starts before beat 1 has completed. The branch guard's full rule (naming, the
`ptp-branch-prep` workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do
not restate it here.

## Steps

This command runs as **three beats**, mirroring `/ptp:plan-multiple`:

- **Beat 1 — outer session.** Token parse → epic allocation → branch guard → gather read-only
  input. Spawns nothing, deletes nothing.
- **Beat 2 — one `ptp-run-at-model` main run at the `opus.high` target.** An autonomous decompose
  brainstorm via `ptp-brainstorming`, then a split-or-fall-back decision, ending in the structured
  return below. Beat 2 performs **no** per-slice work and deletes nothing.
- **Beat 3 — outer session.** One `/ptp:brainstorm` main run per slice (concurrently or serially
  per the `ptp-parallel-fanout` contract), joined, then the report.

### Beat 1 — outer session

1. **Gather input — read-only.** If `openspec/changes/<id>/` already exists for a supplied id, read
   its artifacts as decomposition input; fold that thinking into the split. Never modify or delete
   this folder. Run `npx -y openspec list` and `npx -y openspec list --specs` to see existing
   changes/capabilities and avoid id collisions. **Retain this capture** — under `roles.main=claude`
   it is handed down as `ptp-run-at-model`'s optional part (f) input to beat 2, exactly as
   `/ptp:plan-multiple` does; under `roles.main=codex` no such pass-down applies.

### Beat 2 — one `ptp-run-at-model` main run at the `opus.high` target

Invoke the **`ptp-run-at-model`** skill with target `opus.high` and the work being: an autonomous
decompose brainstorm via **`ptp-brainstorming`** (same granularity rule, same dependency-verification
rule, same "compilability is not a cut constraint" rule as `/ptp:plan-multiple` step 2 — cite it, do
not restate it), then the split-or-fall-back decision, ending in the structured return below. Every
slice id is allocated here, before any beat-3 member starts, exactly as `/ptp:plan-multiple`'s Beat 2
does. Beat 2 must not attempt to launch `ptp-branch-prep` (its own branch-guard check is a no-op) and
must start no further main run.

**Codex work-prompt delivery.** Under `main=codex`, beat 2 delivers the PTP-owned `ptp-brainstorming`
skill, per `ptp-run-at-model`'s *The `main=codex` direction* and `ptp-skill-contract` §
*Agent neutrality*, by one of that section's two delivery modes — not by naming the skill for a Skill
tool the shelled-out Codex run does not have.

**Beat 2's return.** One of two forms, whose grammar is otherwise **identical to
`/ptp:plan-multiple`'s Beat-2 return contract** — cite it, restate none of it. Only the sentinels
differ. As with `/ptp:plan-multiple`'s Beat 2, if the `ptp-run-at-model` run instead terminates
`refused` or `needs-human-action`, that terminal state is relayed **as itself** — report the reason,
plus (for `needs-human-action`) the exact follow-up command, and stop; it is **not** re-labelled an
unparseable-return refusal, and beat 3 does not run. The sentinel grammar and the Refusal rule below
apply only to a `completed` return.

**Split path:**

```
BRAINSTORM-DECOMPOSE-SLICES
<change-id> | depends: <dependency-list> | scope: <single-line scope>
<change-id> | depends: <dependency-list> | scope: <single-line scope>
```

**Fallback path:**

```
BRAINSTORM-DECOMPOSE-FALLBACK
<the request to hand to a single /ptp:brainstorm>
```

On the fallback path, beat 2 stops there — no per-slice work. The payload MUST NOT be the original
input's own change id — the outer session's `/ptp:brainstorm` invocation would then preserve that id
verbatim (`/ptp:brainstorm` step 1) and overwrite its `brainstorm.md` in place (`/ptp:brainstorm`
step 7), silently breaking the read-only-input guarantee. When `$ARGUMENTS` named an existing
`openspec/changes/<id>/` folder, the payload is instead a fresh `XXXX_01_<desc>` id under beat 1's
already-allocated epic (so `/ptp:brainstorm` preserves *that* id rather than allocating its own),
followed by the request text derived from the input's scope — never the input id itself. The outer
session then invokes **`/ptp:brainstorm` once** with that payload (not `/ptp:plan`), as an ordinary
top-level command invocation, and reports that no split was needed and, when relevant, that the
original input change was left untouched.

**Refusal rule.** Any deviation — no sentinel, `BRAINSTORM-DECOMPOSE-SLICES` with fewer than two
slice lines, a malformed slice line, a duplicate or non-ascending id, a forward/self dependency, or
a `BRAINSTORM-DECOMPOSE-FALLBACK` with an empty or multi-line payload — is a **refusal**: report it
and stop, before any beat-3 member is started. These sentinels are the internal beat-2 → beat-3
handoff only, never a caller-facing return format.

### Beat 3 — outer session: fan out, join, report

Beat 3 runs in the outer session — the only site that may start N members, because beat 2's main
run already occupies the one permitted Agent nesting level.

**Context pass-down (part (f)).** Because nothing is deleted between beat 1 and beat 3 (unlike
`/ptp:plan-multiple`, whose beat-2 step 4 deletes the monolithic folder), the beat-1 capture stays
valid throughout — there is no second re-capture step here. Under `roles.main=claude`, the outer
session MAY supply its beat-1 `npx -y openspec list` / `npx -y openspec list --specs` capture as
`ptp-run-at-model`'s optional part (f) input to members started before any member has written (the
first fan-out batch, or the first serial member); later members omit it. Under `roles.main=codex`,
no part (f) input applies.

1. **Assert the four `ptp-parallel-fanout` safety conditions** exactly as `/ptp:plan-multiple` does:
   write sets provably disjoint (each member writes only its own pre-allocated
   `openspec/changes/<slice-id>/brainstorm.md`; the shared `ptp-telemetry` store is the contract's
   closed exception), no git state change in members (branch guard already ran, no-op for members),
   order-independent aggregation (sorted by ascending change id before reporting), join-then-gate
   (the report runs only after every member has returned).

2. **Resolve the effective parallel decision** per `/ptp:plan-multiple`'s three-level precedence
   (pre-resolved posture, then the `parallel:` token, then `parallel.mode`). Effective `on` *and*
   all four conditions established → fan out. Otherwise → run the members **serially, in ascending
   story order**. Failure handling is join-then-gate on both paths.

3. **Run the members.** One member per slice, started by the outer session: under `roles.main=claude`
   one foreground Agent-tool subagent at the `brainstorm` family default target (`skills/ptp-run-at-model/references/family-default-target.md`; `opus.high` built in); under `roles.main=codex` one write-capable
   `codex exec` run at the resolved `codex.model`/`codex.reasoningEffort`. Each member runs
   `/ptp:brainstorm`'s steps **inline** in its own context. The member prompt MUST carry:
   - the slice's fully-formed **id** (so `/ptp:brainstorm` preserves it verbatim), its **scope
     paragraph**, and its **dependency notes**;
   - under `roles.main=claude` only, and only for a member started before any member has written,
     `ptp-run-at-model`'s optional part (f): the beat-1 capture inlined verbatim;
   - *you are already the `ptp-run-at-model` main run for this slice — run `/ptp:brainstorm`'s steps
     inline in your own context;*
   - *do **NOT** invoke `ptp-run-at-model`; do **NOT** start any further main run;*
   - *your `ptp-branch-guard` check is a **no-op** — do **NOT** launch `ptp-branch-prep`;*
   - *do **NOT** run `/ptp:plan` or `/ptp:apply`.*

   `/ptp:brainstorm` never returns `NEEDS SPLIT`, so no member handles it.

4. **Join every member.** Collect all member results — a member that failed, refused, or was
   throttled is recorded as failed, never dropped. A member returning `needs-human-action` is
   likewise not a success. Only `completed` counts as a member success.

5. **STOP and report.** Sorted by **ascending change id**, list every slice's scope and
   dependencies, every unsuccessful member (with its reason and, for `needs-human-action`, its
   follow-up command), and whether a monolithic input change existed (naming it, never claiming it
   was deleted — it was not). **Only when every member completed successfully:** the next command
   `/ptp:plan <first-slice-id>`. This command never invokes or chains `/ptp:plan` or `/ptp:apply`.

## Hard rules

- Do **not** force a split. If the change is one coherent unit, fall back to a single
  `/ptp:brainstorm` (the fallback path above).
- Do **not** modify or delete an existing input change folder — it is decompose input only. On the
  fallback path, this includes never passing the input's own change id as the `/ptp:brainstorm`
  payload — that would let `/ptp:brainstorm` overwrite its `brainstorm.md` in place; hand it a fresh
  id under beat 1's allocated epic instead.
- Each slice **must** be one unit of work and may depend only on lower-numbered slices — no cycles,
  no forward dependencies.
- Do **not** write any slice's `brainstorm.md` content yourself from the raw request — it must come
  from that slice's own `/ptp:brainstorm` run.
- Do **not** create an umbrella decomposition doc.
- Do **not** ask the user clarifying questions mid-flow — this command is autonomous end to end.
- **No member may start a further main run.** Each beat-3 member is exactly one `ptp-run-at-model`
  main run and runs `/ptp:brainstorm`'s steps inline — no Agent, no Workflow, no nested `codex
  exec`, no re-invocation of `ptp-run-at-model`. Beat 2 likewise starts nothing.
- **The serial path stays live.** With the shipped default `parallel.mode` = `off`, or with any of
  the four safety conditions unestablished, the members run serially in ascending story order.
- **Consume the `ptp-parallel-fanout` contract; never redefine it.**
- Do **not** invoke or trigger `/ptp:plan` or `/ptp:apply` automatically for any reason.
- Do **not** edit any OpenSpec managed/regenerated instruction blocks.
