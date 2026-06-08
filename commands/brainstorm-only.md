---
description: Change-agnostic Superpowers brainstorm — explore a direction before it's a specific change; writes to the shared openspec/brainstorms/ folder
argument-hint: "<topic / open-ended question to explore>"
---

You are running a **standalone, change-agnostic brainstorm**. Use this when the idea is **not yet tied to a specific change** — you're exploring a direction, comparing approaches, or thinking out loud before you even know what the concrete change is. The output lands in the shared `openspec/brainstorms/` folder, not in any change folder.

> If you already know this is a specific change, use `/ptp:brainstorm "<request>"` instead — it co-locates the brainstorm inside `openspec/changes/<change-id>/brainstorm.md`, which is the direct handoff to `/ptp:plan`.

## Inputs

Topic: $ARGUMENTS

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from a ≤5-kebab-word summary of the topic (→ `ptp/<summary>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Load context** — read the relevant project files. If `openspec/project.md` exists, read it. Run these to see existing specs and in-flight changes (use Bash):
   - `npx -y openspec list` (lists active changes)
   - `npx -y openspec list --specs` (lists existing capabilities/specs)
   - If `openspec` is installed globally, drop the `npx -y` prefix.
2. **Invoke the Superpowers brainstorming skill** via the Skill tool. Use the skill that matches "brainstorm" / "brainstorming" in the available skill list. If multiple match, prefer the one explicitly under the `superpowers` namespace. If none are available, fall back to a structured brainstorm you write inline, but say so explicitly to the user.
3. **Ask only the clarifying questions you truly need** to explore the space. Use AskUserQuestion when there are 2-4 discrete choices; otherwise ask in prose.
4. **Present 2–3 options** with concrete tradeoffs:
   - What it changes
   - Risk / blast radius
   - Effort
   - Reversibility
   - How it interacts with existing specs (cite spec files if relevant)
5. **Recommend one option** and say why. Mark it as your recommendation but leave the choice to the user.
6. **Persist the brainstorm.** The `superpowers:brainstorming` skill defaults to writing the design doc under `docs/plans/`. **Override that path** — write the file to `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md` instead (create the `openspec/brainstorms/` directory if it doesn't exist). Surface the absolute path back to the user.
7. **STOP.** Do not write any files under `openspec/changes/`. This command is intentionally epic-less — it writes only to `openspec/brainstorms/`, with no change folder yet. The epic is allocated when `/ptp:plan` turns this brainstorm into a change. When the exploration crystallizes into a concrete change, run `/ptp:plan <change-id>` — it will find this brainstorm in `openspec/brainstorms/`, copy it into `openspec/changes/<change-id>/brainstorm.md`, and proceed.

## Hard rules

- Do **not** call `/openspec:propose` or `/openspec:explore`. Superpowers owns this step.
- Do **not** create any `openspec/changes/<id>/*` files in this command — including `brainstorm.md`. This command is explicitly for the *not-yet-a-change* case; co-locating a brainstorm in a change folder is `/ptp:brainstorm`'s job.
- Do **not** skip writing the `openspec/brainstorms/...-brainstorm.md` file. If the brainstorming skill stopped without writing it, prompt the user for approval and then write it explicitly.
- Do **not** start coding.
