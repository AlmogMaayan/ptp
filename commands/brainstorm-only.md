---
description: Explore a direction before it is a specific change, writing into the shared brainstorm folder
argument-hint: "<topic / open-ended question to explore> [--workspace <path>]"
---

You are running a **standalone, change-agnostic brainstorm**. Use this when the idea is **not yet tied to a specific change** — you're exploring a direction, comparing approaches, or thinking out loud before you even know what the concrete change is. The output lands in the shared `openspec/brainstorms/` folder, not in any change folder.

> If you already know this is a specific change, use `/ptp:brainstorm "<request>"` instead — it co-locates the brainstorm inside `openspec/changes/<change-id>/brainstorm.md`, which is the direct handoff to `/ptp:plan`.

## Inputs

Topic: $ARGUMENTS

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from a ≤5-kebab-word summary of the topic (that summary is the leaf; shape per `ptp-workspace`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

The "Branch safety (first step)" preamble above runs **in the outer session** and is this command's
**only** outer-session precondition — `/ptp:brainstorm-only` is epic-less (it allocates no change id, so
there is no step-1 id allocation to keep outer). The actual brainstorm work — steps 1–7 — **runs at a
deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`: brainstorming is high-judgment
creative work and must not depend on whatever model the session happens to be on.

**Run steps 1–7 via `ptp-run-at-model` at `opus.high`.** Only after the branch guard has run in the outer
session, invoke the **`ptp-run-at-model`** skill with target `opus.high` and the work being **steps 1–7
below** — load context, invoke `ptp-brainstorming` in autonomous mode,
compare material alternatives, decide, persist the decision capsule to
`openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`, then STOP and report. It
spawns one foreground `opus` subagent (high effort directive) that performs those steps and returns its
terminal result (relayed per `ptp-run-at-model`'s *Result relay* — never reporting a refusal or STOP as
success). Reference the `ptp-run-at-model` skill for the spawn-and-relay mechanics rather than restating
them. One note the subagent prompt MUST carry: the subagent's own `ptp-branch-guard` check is a **no-op**
(HEAD is already on the feature branch from the outer guard), so the subagent must **NOT** attempt to
launch the `ptp-branch-prep` Workflow. Its brainstorm work spawns nothing — it invokes
`ptp-brainstorming` as an inline Skill call — so there is no nesting concern.

**Codex work-prompt delivery.** Under `main=codex`, the PTP-owned `ptp-brainstorming` skill plus its
closure must reach the Codex main run, per `ptp-run-at-model`'s *The `main=codex` direction* and
`ptp-skill-contract` § *Agent neutrality*, by one of that section's two delivery modes.

1. **Load context** — read the relevant project files. If `openspec/project.md` exists, read it. Run these to see existing specs and in-flight changes (use Bash):
   - `npx -y openspec list` (lists active changes)
   - `npx -y openspec list --specs` (lists existing capabilities/specs)
   - If `openspec` is installed globally, drop the `npx -y` prefix.
2. **Invoke the `ptp-brainstorming` skill** via the Skill tool, in autonomous mode.
3. **Make reasonable assumptions instead of pausing to ask** (autonomous mode). Do **not** use AskUserQuestion and do **not** stop to ask the user clarifying questions — this brainstorm runs autonomously in a non-interactive subagent. Where a real choice exists that you would otherwise have asked about, pick the most reasonable option, proceed, and **document the assumption inline in the brainstorm** so the reader can see what was assumed and revisit it. This mirrors `/ptp:plan`'s autonomous, no-clarifying-questions contract.
4. **Compare only material alternatives.** When a material design choice exists, weigh the real
   candidates — what each changes, risk / blast radius, effort, reversibility, interaction with
   existing specs (cite spec files). When only one direction is viable, record that fact and the
   reason instead; never manufacture an alternative to fill a slot.
5. **Decide.** State the chosen direction and why, in 1–3 sentences.
6. **Persist the decision capsule** to `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`
   (create the `openspec/brainstorms/` directory if it doesn't exist) — the **decision**, the
   **material alternatives** each with its tradeoff and why it lost (or the single-direction
   reason), and the **assumptions** made in autonomous mode. Nothing else: no full design document,
   no implementation plan, no deliberation history. Write **current truth only**: when the file
   already exists, replace the superseded capsule in place and never append a correction, an earlier
   draft, or review-iteration narrative. Write the capsule to
   `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md` and surface the absolute path back to the user.
7. **STOP.** Do not write any files under `openspec/changes/`. This command is intentionally epic-less — it writes only to `openspec/brainstorms/`, with no change folder yet. The epic is allocated when `/ptp:plan` turns this brainstorm into a change. When the exploration crystallizes into a concrete change, run `/ptp:plan <change-id>` — it will find this brainstorm in `openspec/brainstorms/`, copy it into `openspec/changes/<change-id>/brainstorm.md`, and proceed.

## Hard rules

- Do **not** call `/opsx:propose` or `/opsx:explore` (nor the vendored `ptp:openspec-*` skills). The `ptp-brainstorming` skill owns this step.
- Do **not** create any `openspec/changes/<id>/*` files in this command — including `brainstorm.md`. This command is explicitly for the *not-yet-a-change* case; co-locating a brainstorm in a change folder is `/ptp:brainstorm`'s job.
- Do **not** skip writing the `openspec/brainstorms/...-brainstorm.md` file. If the brainstorming skill stopped without writing it, write it explicitly yourself (you run autonomously in a non-interactive subagent — do **not** pause to ask the user for approval first).
- Do **not** start coding.
