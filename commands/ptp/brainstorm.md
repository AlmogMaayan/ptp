---
description: Superpowers brainstorm for a specific change — produces options + tradeoffs co-located in the change folder, NOT full OpenSpec artifacts
argument-hint: "<short description of the change> [change-id] (change-id optional — derived from the request if omitted)"
---

You are starting **step 1** of the ptp flow. Your job is to **brainstorm using Superpowers** for a specific change, persist the result **inside that change's folder**, then stop. Do **not** create full OpenSpec artifacts (`proposal.md` / `design.md` / `tasks.md` / spec deltas) in this step — only `brainstorm.md`.

> Brainstorming something that is **not** yet tied to a specific change (open-ended exploration, comparing directions before you know what the change even is)? Use `/ptp:brainstorm-only` instead — it writes to the shared `openspec/brainstorms/` folder.

## Inputs

Request: $ARGUMENTS (a short description, optionally followed by an explicit change-id)

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the change id you allocate in step 1 (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Pick the change id.** If the user supplied a fully-formed `XXXX_NN_` id, preserve it verbatim. Otherwise — no id, or only a partial id/description supplied — allocate a single-story epic `XXXX_01_<desc>` via the `ptp-change-selector` skill (§4, epic allocation), where `<desc>` is ≤ 5 kebab-case words derived from the supplied text or the request. **Never produce a legacy/plain id going forward** — a non-full supplied id is treated as a `<desc>` source, not preserved as-is. Do NOT pause to confirm — pick a reasonable description and proceed. Allocating the epic-prefixed id here ensures the later `/ptp:plan` keeps the same id. If it turns out wrong, the user can rename later.
2. **Load context** — read the relevant project files. If `openspec/project.md` exists, read it. Run these to see existing specs and in-flight changes (use Bash):
   - `npx -y openspec list` (lists active changes)
   - `npx -y openspec list --specs` (lists existing capabilities/specs)
   - If `openspec` is installed globally, drop the `npx -y` prefix.
3. **Invoke the Superpowers brainstorming skill** via the Skill tool. Use the skill that matches "brainstorm" / "brainstorming" in the available skill list. If multiple match, prefer the one explicitly under the `superpowers` namespace. If none are available, fall back to a structured brainstorm you write inline, but say so explicitly to the user.
4. **Ask only the clarifying questions you truly need** to evaluate options. Use AskUserQuestion when there are 2-4 discrete choices; otherwise ask in prose.
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

- Do **not** call `/openspec:propose` or `/openspec:explore`. Superpowers owns this step.
- Do **not** create `proposal.md` / `design.md` / `tasks.md` / `specs/**` under `openspec/changes/<change-id>/` in this command. The **only** file you write into the change folder here is `brainstorm.md`.
- Do **not** write the brainstorm to `openspec/brainstorms/` — that location is reserved for `/ptp:brainstorm-only` (change-agnostic exploration). A change-scoped brainstorm lives in its change folder.
- Do **not** skip writing `openspec/changes/<change-id>/brainstorm.md` — `ptp:plan` reads it as its source-of-truth input. If the brainstorming skill stopped without writing it, prompt the user for approval and then write it explicitly.
- Do **not** start coding.
