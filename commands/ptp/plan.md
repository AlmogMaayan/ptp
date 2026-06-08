---
description: Translate the chosen Superpowers plan into OpenSpec proposal/design/tasks/spec-deltas, then validate
argument-hint: "[change-id] (optional — kebab-case; will be derived from the request if omitted)"
---

You are running **step 2** of the ptp flow. The chosen direction came from `/ptp:brainstorm`. Your job now is to:

1. **Verify the brainstorming artifact exists** (the design doc from `/ptp:brainstorm`).
2. **Invoke the Superpowers skills** (brainstorming first if missing, then writing-plans) via the Skill tool. Never write OpenSpec artifacts from raw user input.
3. **Translate that combined output into OpenSpec artifacts** under `openspec/changes/<change-id>/`.
4. **Validate**.

## Inputs

Change id (if provided): $ARGUMENTS

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the change id you allocate in step 1 (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Before proceeding, look for a brainstorming doc in these locations (in order):

1. `openspec/changes/<change-id>/brainstorm.md` — preferred, co-located with the change (written by `/ptp:brainstorm`).
2. `openspec/brainstorms/*-brainstorm.md` — a general, change-agnostic brainstorm from `/ptp:brainstorm-only`.

**Ordering invariant:** the change folder is *born holding `brainstorm.md`* — that is the first file written into `openspec/changes/<change-id>/`. The OpenSpec artifacts (`proposal.md` / `design.md` / `tasks.md` / spec deltas) are layered on top afterward (step 3). Concretely:

- **If `openspec/changes/<change-id>/brainstorm.md` already exists** (the `/ptp:brainstorm` path), read it. It is the source-of-truth input for the OpenSpec artifacts you are about to write. Reference its absolute path in `proposal.md` and quote alternatives/rationale from it rather than inventing new ones.
- **If only a general `openspec/brainstorms/*-brainstorm.md` exists** (the `/ptp:brainstorm-only` path), create the change folder and **copy that file into `openspec/changes/<change-id>/brainstorm.md` first**, then read it and proceed as above.
- **If none exists**, DO NOT stop. Auto-run brainstorming inline (see step 2 below) and save its output to `openspec/changes/<change-id>/brainstorm.md` — again, before writing any OpenSpec artifacts. The `/ptp:plan` command is autonomous end-to-end: from a raw request, it produces both the design doc AND the OpenSpec artifacts without prompting the user mid-flow.

**Never** write a `proposal.md` whose content was not first produced by the brainstorming skill — but you no longer stop and ask the user; you just run brainstorming inline.

## Steps

1. **Pick the change id.** **If a fully-formed `XXXX_NN_` id is provided** (the `/ptp:plan-multiple` → `/ptp:plan` delegation path), preserve it verbatim and do NOT allocate a new epic — do not "normalize" it. **Otherwise** — whether no id was provided or only a partial id/description was — allocate a single-story epic `XXXX_01_<desc>` via the `ptp-change-selector` skill (§4, epic allocation), where `<desc>` is ≤ 5 kebab-case words derived from the provided text or the request. **Never produce a legacy/plain id (`NN_…` or bare kebab) going forward** — a non-full provided id is treated as a `<desc>` source, not preserved as-is. Do NOT pause to confirm — pick a reasonable description and proceed.
2. **Run the Superpowers skills in this order** — both MUST be invoked via the Skill tool:
   - **(a) `superpowers:brainstorming`** — required first if the design doc was missing or shallow. Produces the rationale, alternatives, and design depth that feeds `proposal.md`. Skip only when an existing design doc already covers Context / Goals / Non-goals / Alternatives considered / Design / Risks / Success criteria with substance.

     **CRITICAL — autonomous mode when invoked from `/ptp:plan`:** The brainstorming skill is normally interactive (asks clarifying questions one at a time, waits for user approval after each design section). When invoked from inside `/ptp:plan`, you MUST run it autonomously:
       - Do **not** ask the user clarifying questions. If an ambiguity exists, pick the most reasonable interpretation given the codebase you just explored, and **document the assumption explicitly** in an "Assumptions" subsection of the design doc.
       - Do **not** pause to get user approval between design sections — write the full design doc in one pass.
       - Do **not** use AskUserQuestion. The user already opted into autonomous end-to-end execution by calling `/ptp:plan`.
       - You MAY still load context (read files, run `npx -y openspec list` and `npx -y openspec list --specs`), propose 2-3 options with tradeoffs, and recommend one — all of this goes into the design doc inline rather than as conversation turns.
       - You MUST still write the brainstorm doc to `openspec/changes/<change-id>/brainstorm.md`. The `superpowers:brainstorming` skill defaults to `docs/plans/` — **override** that and write directly into the change folder. That file is the durable handoff to the rest of this command.

   - **(b) `superpowers:writing-plans`** — produces the step-by-step implementation plan that feeds `tasks.md`. Must cover: files to add/modify, data/contract changes, migration concerns, test plan, rollback plan. Same autonomous-mode rule: no clarifying questions, no mid-flow approval gates.

   Do NOT skip (a) on the assumption that the request "is simple." The depth requirement on `proposal.md` (below) cannot be met without it.

3. **Populate the OpenSpec change folder** at `openspec/changes/<change-id>/` (already created above, holding `brainstorm.md`). Add these files alongside it:

   - `proposal.md` — must include **all** of these sections, populated from the design doc and brainstorming output. The first two (`## Why` / `## What Changes`) are OpenSpec's canonical proposal headers — emit them verbatim so `openspec validate`/`archive` recognize the proposal and do not warn; the remaining sections are the ptp superset layered on top for review depth:
     - `## Why` — 1–2 sentences of motivation: the problem this solves and why it matters now. This is the synthesized lead-in to `## Context` (the full prose lives there); keep it tight.
     - `## What Changes` — a short bulleted list of the concrete changes (one bullet per observable change). Mark breaking changes with a leading `**BREAKING**`. This is the at-a-glance counterpart to the detail in `## Goals` / `## Design`.
     - `## Context` — current state and the gap (1–3 short paragraphs of prose, not bullet points). Cite specific files / components by path so a reader can locate the surface area.
     - `## Goals` — concrete, testable outcomes. "User can X" / "System produces Y under condition Z."
     - `## Non-goals` — what this change explicitly does NOT do. Helps future readers understand scope boundaries.
     - `## Alternatives considered` — at least 2 alternatives from brainstorming with their tradeoffs (risk / effort / reversibility / blast radius) and why the chosen approach won. If brainstorming truly surfaced only one viable option, document that explicitly with the reason.
     - `## Design` — UI/UX, data model, API contract, state machine, error handling — whichever apply. Cite existing files/components by path. Include any non-obvious wiring (guards, derivation order, side-effect ordering).
     - `## Risks & edge cases` — what could go wrong, how it's handled. Include both happy-path edge cases (empty / boundary / concurrent) and unhappy paths (network failure, validation failure, race).
     - `## Impact` — affected spec capabilities (cite spec files), backwards-compatibility note (or "N/A — pre-production"), telemetry / docs / migration implications.
     - `## Success criteria` — observable conditions that prove the change worked. Should be checkable during `/ptp:review`.
     - `## Source` — absolute path to `openspec/changes/<change-id>/brainstorm.md` (the brainstorm source) and any other supporting docs.

   - `design.md` — **always required**. Contains the deeper architectural drill-down: component interactions, data flow, non-obvious wiring, and any tradeoffs that informed the design. For mechanical changes, this can be brief, but the file must be created. `proposal.md > Design` is the summary; `design.md` is the substance.
   - `tasks.md` — small, sequential, checkbox-style tasks derived from the `superpowers:writing-plans` output. Each task should be independently verifiable. Include a final "verification" task that maps to the `Success criteria` block in `proposal.md`.
   - `specs/<capability>/spec.md` — spec deltas, **only if** behavior changes. Follow the format OpenSpec uses elsewhere in the repo (top-level `## ADDED/MODIFIED/REMOVED/RENAMED Requirements`, then `### Requirement: ...` with SHALL/MUST, then `#### Scenario:` blocks). If `openspec/specs/<capability>/` doesn't exist yet, treat this as a new capability and structure accordingly.
   - `effort.md` — **always required**. Written after `tasks.md` exists (the recommendation is derived from the tasks shape). Machine-readable apply recommendation; first line is exactly `{model}.{effort}` (e.g. `opus.high`). Generated by running the `/ptp:effort` analysis; do **not** hand-format a second copy of the layout — invoke the `ptp:effort` skill or apply its rubric and write the strict format.
   - `TLDR.md` — **always required**. Written **last**, derived from the artifacts above (so it summarizes them rather than being guessed up front). A very high-level, human-facing at-a-glance summary — not a source of truth and not an implementation input. Required structure:
     - `# TLDR — <change-id>` heading.
     - A non-authoritative banner: *"Human-facing summary. NOT a source of truth and NOT an implementation input — see proposal.md / design.md / tasks.md / specs for the authoritative detail."*
     - `**In one sentence:**` — one sentence describing the whole change.
     - `## What changes` — a short bulleted list of the high-level changes.
     - `## Surface area` — four labeled entries: **Files** (`path — added | modified | removed — ≤1-line why`), **Classes / components**, **Methods / functions**, **Models / data**. Any category with no changes SHALL render the literal word `None` rather than being omitted, so a reader can tell "nothing changes here" from an author omission.

4. **Validate** by running:
   - `npx -y openspec validate <change-id> --strict`
   - Fix any validation errors **without** changing the agreed direction. If validation forces a real direction change, stop and surface that to the user.

5. **Produce `effort.md` for `/ptp:apply`.** Based on the implementation work you just planned (the shape of `tasks.md`, not the planning effort), apply the `/ptp:effort` analysis — use the rubric below (same rubric, same signals) — and **write `openspec/changes/<change-id>/effort.md`** in the strict two-part format: first line `{model}.{effort}` (e.g. `opus.high`) lowercase dot-joined with no decoration, second line empty, lines 3+ a short justification grounded in the actual tasks. Do **not** hand-format a second layout — the format is defined once in `/ptp:effort`; `/ptp:plan` delegates to that same rubric and writes the same file.

6. **STOP.** Do not start implementation. Report:
   - The change id
   - Files created (`proposal.md`, `design.md`, `tasks.md`, `effort.md`, `TLDR.md`, spec deltas if any, and `openspec/changes/<change-id>/brainstorm.md` if you wrote/invoked brainstorming)
   - Validation result
   - **Recommended apply settings:** the first line of `effort.md` (e.g. `opus.high`) + the justification paragraph from `effort.md`
   - The exact next command: `/ptp:apply <change-id>`

## Model + effort rubric for `/ptp:apply`

Judge the *implementation* complexity from `tasks.md`, not how hard the planning was. Weigh: number of files/tasks, architectural subtlety, state/concurrency/async, security or data-integrity sensitivity, test difficulty, and how much judgment each task leaves open vs. being fully specified.

Model and effort are **two independent dials** — pick each on its own, then combine. Valid efforts: `low`, `medium`, `high`, `xhigh`. So `sonnet · high` and `opus · xhigh` are both legitimate (and common) recommendations, not just the anchor pairs below.

**Model** — how much raw capability the hardest task needs:
- **Haiku** — trivial, fully-specified, mechanical work with zero design judgment left.
- **Sonnet** — standard features and refactors with clear, well-scoped tasks. The default for most changes.
- **Opus** — high subtlety or blast radius: non-trivial state machines, concurrency/race handling, security- or data-integrity-sensitive paths, cross-cutting changes touching many files or multiple spec capabilities, or tasks that still require real design judgment during implementation.

**Effort** — how much reasoning each task demands before the right edit is obvious:
- **low** — the edit is obvious from the task text; little to reason about.
- **medium** — ordinary logic and tests; some local reasoning per task. Default.
- **high** — interacting constraints, non-obvious wiring, or tricky tests that need careful step-by-step reasoning.
- **xhigh** — deep or easy-to-get-subtly-wrong work (concurrency, invariants, security, intricate state) where extra deliberation materially lowers the risk of a wrong implementation.

Anchor combinations to calibrate against: `haiku · low` (mechanical copy/config edits) → `sonnet · medium` (typical feature) → `sonnet · high` (clear scope but fiddly logic/tests) → `opus · high` (subtle or cross-cutting) → `opus · xhigh` (subtle *and* high-stakes).

When a change straddles two levels on either dial, round up to the safer (more capable / higher effort) option and say why in the justification.

## Hard rules

- Do **not** call `/openspec:propose` to generate proposal/design text. Superpowers produced the thinking; you are just transcribing it into OpenSpec's file format.
- Do **not** edit any OpenSpec managed/regenerated instruction blocks.
- Do **not** start implementing. That is `/ptp:apply`.
- Do **not** write a `proposal.md` whose content was not first produced by `superpowers:brainstorming` (or pulled from an existing brainstorming design doc). If you skipped brainstorming, you are violating the spirit of ptp — go back and invoke it.
- Do **not** omit any required section in `proposal.md`. If a section truly has nothing to say (e.g. `## Risks & edge cases` for a one-line color tweak), state that explicitly: *"None — purely cosmetic change to a static label."* — do not delete the heading.
- Do **not** stop the flow and ask the user to run `/ptp:brainstorm` first. `/ptp:plan` is autonomous: if the design doc is missing, run brainstorming inline (autonomous mode — no clarifying questions, document assumptions instead) and continue all the way through validation.
- Do **not** ask clarifying questions mid-flow. The autonomous contract is: take the request, make reasonable assumptions when ambiguous, document them clearly in the design doc / proposal, and produce validated artifacts. The user reviews the artifacts at the end; corrections happen during `/ptp:apply` or via a follow-up edit.
- Do **not** use `TLDR.md` as an input to `/ptp:apply` or any other implementation step. It is human-facing only — where it conflicts with `proposal.md` / `design.md` / `tasks.md` / spec deltas, those artifacts win.
