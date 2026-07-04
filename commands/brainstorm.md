---
description: Superpowers brainstorm for a specific change — produces options + tradeoffs co-located in the change folder, NOT full OpenSpec artifacts
argument-hint: "<short description of the change> [change-id] (change-id optional — derived from the request if omitted)"
---

You are starting **step 1** of the ptp flow. Your job is to **brainstorm using Superpowers** for a specific change, persist the result **inside that change's folder**, then stop. Do **not** create full OpenSpec artifacts (`proposal.md` / `design.md` / `tasks.md` / spec deltas) in this step — only `brainstorm.md`.

> Brainstorming something that is **not** yet tied to a specific change (open-ended exploration, comparing directions before you know what the change even is)? Use `/ptp:brainstorm-only` instead — it writes to the shared `openspec/brainstorms/` folder.

## Inputs

Request: $ARGUMENTS (a short description, optionally followed by an explicit change-id)

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the change id you allocate in step 1 (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

Step 1 (pick the change id) and the "Branch safety (first step)" preamble above run **in the outer
session**. The actual brainstorm work — steps 2–8 — **runs at a deterministic model** via the
**`ptp-run-at-model`** skill at `opus.high`: brainstorming is high-judgment creative work and must not
depend on whatever model the session happens to be on. The branch guard (already run above) and step 1's
change-id allocation (cheap, never a guaranteed abort, and the branch guard reads the allocated id to
name the branch on `master`) stay **outer**; then a single foreground `opus.high` subagent performs
steps 2–8 and reports.

1. **Pick the change id** (outer session). If the user supplied a fully-formed `XXXX_NN_` id, preserve it verbatim. Otherwise — no id, or only a partial id/description supplied — allocate a single-story epic `XXXX_01_<desc>` via the `ptp-change-selector` skill (§4, epic allocation), where `<desc>` is ≤ 5 kebab-case words derived from the supplied text or the request. **Never produce a legacy/plain id going forward** — a non-full supplied id is treated as a `<desc>` source, not preserved as-is. Do NOT pause to confirm — pick a reasonable description and proceed. Allocating the epic-prefixed id here ensures the later `/ptp:plan` keeps the same id. If it turns out wrong, the user can rename later.

**Run steps 2–8 via `ptp-run-at-model` at `opus.high`.** Only after the branch guard and step 1's
change-id allocation have settled in the outer session, invoke the **`ptp-run-at-model`** skill with
target `opus.high` and the work being **steps 2–8 below** — load context, invoke
`superpowers:brainstorming` in autonomous mode, present options, recommend, persist
`openspec/changes/<change-id>/brainstorm.md`, then STOP and report. It spawns one foreground `opus`
subagent (high effort directive) that performs those steps and returns its terminal result (relayed per
`ptp-run-at-model`'s *Result relay* — never reporting a refusal or STOP as success). Reference the
`ptp-run-at-model` skill for the spawn-and-relay mechanics rather than restating them. One note the
subagent prompt MUST carry: the subagent's own `ptp-branch-guard` check is a **no-op** (HEAD is already
on the feature branch from the outer guard), so the subagent must **NOT** attempt to launch the
`ptp-branch-prep` Workflow. Its brainstorm work spawns nothing — it invokes `superpowers:brainstorming`
as an inline Skill call — so there is no nesting concern.

2. **Load context** — read the relevant project files. If `openspec/project.md` exists, read it. Run these to see existing specs and in-flight changes (use Bash):
   - `npx -y openspec list` (lists active changes)
   - `npx -y openspec list --specs` (lists existing capabilities/specs)
   - If `openspec` is installed globally, drop the `npx -y` prefix.
3. **Invoke the Superpowers brainstorming skill** via the Skill tool. Use the skill that matches "brainstorm" / "brainstorming" in the available skill list. If multiple match, prefer the one explicitly under the `superpowers` namespace. If none are available, fall back to a structured brainstorm you write inline, but say so explicitly to the user.
4. **Make reasonable assumptions instead of pausing to ask** (autonomous mode). Do **not** use AskUserQuestion and do **not** stop to ask the user clarifying questions — this brainstorm runs autonomously in a non-interactive subagent. Where a real choice exists that you would otherwise have asked about, pick the most reasonable option, proceed, and **document the assumption inline in the brainstorm** so the reader can see what was assumed and revisit it. This mirrors `/ptp:plan`'s autonomous, no-clarifying-questions contract.
5. **Present 2–3 options** with concrete tradeoffs:
   - What it changes
   - Risk / blast radius
   - Effort
   - Reversibility
   - How it interacts with existing specs (cite spec files if relevant)
6. **Recommend one option** and say why. Mark it as your recommendation but leave the choice to the user.
7. **Persist the brainstorm into the change folder.** The `superpowers:brainstorming` skill defaults to writing the design doc under `docs/plans/`. **Override that path** — write the file to `openspec/changes/<change-id>/brainstorm.md` instead (create the `openspec/changes/<change-id>/` directory if it doesn't exist). This file is the durable handoff to `/ptp:plan`; without it, `/ptp:plan` has no rich source material and will produce thin OpenSpec artifacts. Surface the absolute path back to the user.
8. **STOP.** Do not write `proposal.md`, `design.md`, `tasks.md`, or spec deltas — those belong to `/ptp:plan`. The next step is `/ptp:plan <change-id>`, which transcribes `brainstorm.md` into the OpenSpec artifacts.

## Hard rules

- Do **not** call `/opsx:propose` or `/opsx:explore` (nor the vendored `ptp:openspec-*` skills). Superpowers owns this step.
- Do **not** create `proposal.md` / `design.md` / `tasks.md` / `specs/**` under `openspec/changes/<change-id>/` in this command. The **only** file you write into the change folder here is `brainstorm.md`.
- Do **not** write the brainstorm to `openspec/brainstorms/` — that location is reserved for `/ptp:brainstorm-only` (change-agnostic exploration). A change-scoped brainstorm lives in its change folder.
- Do **not** skip writing `openspec/changes/<change-id>/brainstorm.md` — `ptp:plan` reads it as its source-of-truth input. If the brainstorming skill stopped without writing it, write it explicitly yourself (you run autonomously in a non-interactive subagent — do **not** pause to ask the user for approval first).
- Do **not** start coding.
