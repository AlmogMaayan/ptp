---
description: Translate a chosen plan into proposal, design, tasks, and spec deltas, then validate them
argument-hint: "[change-id] [--workspace <path>] (optional — XXXX_NN_<kebab-description> per ptp-change-selector; derived from the request if omitted)"
---

You are running **step 2** of the ptp flow. The chosen direction came from `/ptp:brainstorm`. Your job now is to:

1. **Verify the brainstorming artifact exists** (the design doc from `/ptp:brainstorm`).
2. **Invoke the PTP planning skills** (`ptp-brainstorming` first if missing, then `ptp-writing-plans`) via the Skill tool. Never write OpenSpec artifacts from raw user input.
3. **Translate that combined output into OpenSpec artifacts** under `openspec/changes/<change-id>/`.
4. **Validate**.

## Inputs

Change id (if provided): $ARGUMENTS

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the change id you allocate in step 1 (leaf: the change id; shape per `ptp-workspace`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Preconditions

Before proceeding, look for a brainstorming doc in these locations (in order):

1. `openspec/changes/<change-id>/brainstorm.md` — preferred, co-located with the change (written by `/ptp:brainstorm`).
2. `openspec/brainstorms/*-brainstorm.md` — a general, change-agnostic brainstorm from `/ptp:brainstorm-only`.

**Ordering invariant:** the change folder is *born holding `brainstorm.md`* — that is the first file written into `openspec/changes/<change-id>/`. The OpenSpec artifacts (`proposal.md` / `design.md` / `tasks.md` / spec deltas) are layered on top afterward (step 3). Concretely:

- **If `openspec/changes/<change-id>/brainstorm.md` already exists** (the `/ptp:brainstorm` path), read it. It is the source-of-truth input for the OpenSpec artifacts you are about to write. It is the decision source, not a section to copy: the OpenSpec artifacts carry the decision, not the deliberation, and the brainstorm's path is deterministic, so `proposal.md` does not record it.
- **If only a general `openspec/brainstorms/*-brainstorm.md` exists** (the `/ptp:brainstorm-only` path), create the change folder and **copy that file into `openspec/changes/<change-id>/brainstorm.md` first**, then read it and proceed as above.
- **If none exists**, DO NOT stop. Auto-run brainstorming inline (see step 2 below) and save its output to `openspec/changes/<change-id>/brainstorm.md` — again, before writing any OpenSpec artifacts. The `/ptp:plan` command is autonomous end-to-end: from a raw request, it produces both the brainstorm decision capsule AND the OpenSpec artifacts without prompting the user mid-flow.

**Never** write a `proposal.md` whose content was not first produced by the brainstorming skill — but you no longer stop and ask the user; you just run brainstorming inline.

## Steps

Steps **2–6 run at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high` — the
planning work is high-judgment and must not depend on the session model. Everything that needs the
outer session (the branch guard, already run above, and step 1's change-id allocation) runs **first,
in the outer session**; then a single foreground `opus.high` subagent performs steps 2–6 and reports.

1. **Pick the change id** (outer session). **If a fully-formed `XXXX_NN_` id is provided** (the `/ptp:plan-multiple` → `/ptp:plan` delegation path), preserve it verbatim and do NOT allocate a new epic — do not "normalize" it. **Otherwise** — whether no id was provided or only a partial id/description was — allocate a single-story epic `XXXX_01_<desc>` via the `ptp-change-selector` skill (§4, epic allocation), where `<desc>` is ≤ 5 kebab-case words derived from the provided text or the request. **Never produce a legacy/plain id (`NN_…` or bare kebab) going forward** — a non-full provided id is treated as a `<desc>` source, not preserved as-is. Do NOT pause to confirm — pick a reasonable description and proceed. This stays in the outer session: it is cheap, and the branch guard above may already have read it to name the feature branch. `/ptp:plan` has **no guaranteed-abort precondition** (a missing brainstorm doc auto-runs inline, it does not STOP — see *Preconditions*), so nothing else needs to stay outer.

**Run steps 2–6 via `ptp-run-at-model` at `opus.high`.** After the branch guard and step-1 id
allocation, invoke the **`ptp-run-at-model`** skill with target `opus.high` and the work being
**steps 2–6 below**; it spawns one foreground `opus` subagent (high effort directive) that performs
those steps and returns its terminal result (relayed per `ptp-run-at-model`'s *Result relay* — a
validation failure that forces a direction change surfaces as a refusal, never as success). The
subagent's own `ptp-branch-guard` check is a **no-op** (HEAD is already on the feature branch from the
outer guard), so it must **NOT** attempt to launch the `ptp-branch-prep` Workflow. `/ptp:plan` spawns
nothing of its own — it only invokes Skills (`ptp-brainstorming`, `ptp-writing-plans`,
`ptp:effort`) inline in the subagent's own context — so it wraps cleanly with no second nesting level.

2. **Run the PTP planning skills in this order** — both MUST be invoked via the Skill tool:
   - **(a) `ptp-brainstorming`** — required first if the design doc was missing or shallow. Produces the rationale, alternatives, and design depth that feeds `proposal.md`. Skip only when `brainstorm.md` already carries a decision capsule with substance — a stated decision, its material alternatives (or the recorded reason only one direction is viable), and its assumptions.

     **CRITICAL — autonomous mode when invoked from `/ptp:plan`:** The brainstorming skill is normally interactive (asks clarifying questions one at a time, waits for user approval after each design section). When invoked from inside `/ptp:plan`, you MUST run it autonomously:
       - Do **not** ask the user clarifying questions. If an ambiguity exists, pick the most reasonable interpretation given the codebase you just explored, and **document the assumption explicitly** in an "Assumptions" subsection of `brainstorm.md`.
       - Do **not** pause to get user approval between design sections — write the whole capsule in one pass.
       - Do **not** use AskUserQuestion. The user already opted into autonomous end-to-end execution by calling `/ptp:plan`.
       - You MAY still load context (read files, run `npx -y openspec list` and `npx -y openspec list --specs`), compare the material alternatives and decide — all of this goes into `brainstorm.md` inline rather than as conversation turns. **If `ptp-run-at-model`'s optional part (f) supplied an inlined `openspec list` / `openspec list --specs` snapshot** (today, only when this run was started as a `/ptp:plan-multiple` per-slice member), use that snapshot in place of running either command **on the occasions you would have loaded that context** — this stays discretionary, exactly as the `MAY` above; the snapshot never obliges you to load context you would otherwise have skipped, and a supplied-but-empty snapshot is honored as a real "no active changes" answer, not treated as missing. **Re-run the listing anyway** if you have yourself created, moved, or deleted anything under `openspec/changes/` during this run, or if you need information the snapshot does not carry (e.g. `--specs` when only the plain listing was inlined). **If no snapshot was supplied** — a standalone `/ptp:plan` invocation, or a `/ptp:plan-multiple` member that its outer session deliberately supplied none because a sibling member had already written — this is unchanged — run the commands yourself when and if you choose to load that context, exactly as before.
       - You MUST still write the brainstorm doc to `openspec/changes/<change-id>/brainstorm.md`. Write it directly into the change folder, at `openspec/changes/<change-id>/brainstorm.md`. That file is the durable handoff to the rest of this command.

   - **(b) `ptp-writing-plans`** — produces the step-by-step implementation plan that feeds `tasks.md`. Must cover: files to add/modify, data/contract changes, migration concerns, test plan, rollback plan. Same autonomous-mode rule: no clarifying questions, no mid-flow approval gates.

   Do NOT skip (a) on the assumption that the request "is simple" — the decision and its assumptions still have to come from somewhere.

3. **Populate the OpenSpec change folder** at `openspec/changes/<change-id>/` (already created above,
   holding `brainstorm.md`). Write each artifact in the shape the **compact artifact contract** defines
   (owned by the `compact-artifact-contract` capability — do not restate its shapes here):

   - `proposal.md` — the compact proposal shape. Emit OpenSpec's canonical `## Why` and `## What Changes`
     headers verbatim so `openspec validate` and `archive` recognize the proposal. Omit a section that has
     nothing to say rather than filling it with "None".
   - `proposal.md > Success criteria` is **conditional**: write it when a manual-verification intent has
     been relocated out of `tasks.md` (see the `tasks.md` bullet), or when an observable outcome would
     otherwise have no owner. Otherwise omit the section.
   - `design.md` — **conditional**. Create it only when the change has at least one non-obvious decision,
     invariant, interface, or failure/migration behavior that no other artifact owns. Mechanical changes
     get no `design.md`. If the folder already holds one and that test now fails, **delete it** — a stale
     design is obsolete truth standing beside current truth.
   - `tasks.md` — concise, dependency-ordered, agent-executable checkboxes derived from the writing-plans
     output. Each checkbox names the edit to make and the automated check that proves it. No rationale
     essays, no copied requirement or spec text, no review history. Include a final verification task
     naming the automated checks the implementing agent runs. **Every checkbox MUST be completable by the
     implementing agent unaided** — it can both perform the task and establish that it succeeded (a test, a
     script's exit code or output, an assertion over a file it can read, an
     `npx -y openspec validate <change-id> --strict` run, an automated browser check) with **no human
     performing, observing, or confirming any step**. Banned shapes — and any paraphrase of them, the list
     being exemplary rather than exhaustive — are: **manual QA**, **manual or exploratory testing**,
     **"manually verify"**, **"verify by hand"**, **"check in the browser"**, **"have a human confirm"**,
     **"ask the user to try"**. Judge the *actor*, not the wording. Manual-verification **intent is never
     deleted**: **(1) substitute** an automated equivalent the agent can run and read the result of, or —
     only if none exists — **(2) relocate** the intent into `proposal.md > Success criteria` as a plain
     **non-checkbox** note, creating that section for the purpose. The final verification task is itself
     bound by this rule and never pulls a relocated note back into a checkbox. The full contract lives in
     the `tasks-authoring` capability.
   - `specs/<capability>/spec.md` — spec deltas, **only if** behavior changes. Follow the format OpenSpec
     uses elsewhere in the repo (top-level `## ADDED/MODIFIED/REMOVED/RENAMED Requirements`, then
     `### Requirement: ...` with SHALL/MUST, then `#### Scenario:` blocks). If
     `openspec/specs/<capability>/` doesn't exist yet, treat this as a new capability.
   - `effort.md` — written after `tasks.md` exists. See step 5.
   - Do **not** create `TLDR.md`. If the folder already holds one from before this contract, leave it in
     place and never read it as an input.

4. **Validate.** Run `npx -y openspec validate <change-id> --strict`. Fix any validation errors
   **without** changing the agreed direction. If validation forces a real direction change, stop and
   surface that to the user.

5. **Write `effort.md`, then lint.** Apply the `/ptp:effort` apply rubric — defined once in
   `commands/effort.md`, which is its **only** owner — to the shape of the `tasks.md` you just wrote, and
   write `openspec/changes/<change-id>/effort.md` containing **exactly one line**, `{model}.{effort}`
   (e.g. `opus.high`), lowercase and dot-joined with no decoration, followed by a trailing newline.
   Persist no justification and no note of any kind.

   Then — with every artifact now on disk — run the **compactness linter** published by the
   `compact-artifact-contract` capability over `<change-id>`:

   ```
   node scripts/ptp-compact-lint.js --workspace <resolved workspace root> --change <change-id>
   ```

   and carry its findings into the step-6 report. It is a **reporting** check: it never truncates an
   artifact, never blocks the STOP, and never aborts planning. If it is unavailable or exits non-zero for
   its own reasons, say so in one line and continue. The root is the one resolved at this command's
   entry (`ptp-workspace`), passed as an argument and never as a working-directory change, because the
   script is named relative to the ptp checkout.

6. **STOP.** Do not start implementation. Report only: the change id; `effort: <model>.<effort>`; the
   validation result; the linter findings (or that it was unavailable); and the next command
   `/ptp:apply <change-id>`. Do not list the created files — the layout is deterministic.

   **This report carries no review tally.** `/ptp:plan` wraps no review orchestrator, so there is no
   tally to relay: print no tally table and no `unknown` placeholder in its place. `unknown` is
   reserved for a report whose wrapped review step returned nothing — it is not a stand-in for "no
   review ran". The plan-stage tally appears in `/ptp:review-plan-full`, which is where the artifact
   review actually happens.

## Hard rules

- Do **not** call `/opsx:propose` (nor the vendored `ptp:openspec-propose` skill) to generate proposal/design text. The PTP planning skills produced the thinking; you are just transcribing it into OpenSpec's file format.
- Do **not** edit any OpenSpec managed/regenerated instruction blocks.
- Do **not** start implementing. That is `/ptp:apply`.
- Do **not** write a `proposal.md` whose content was not first produced by `ptp-brainstorming` (or pulled from an existing brainstorming design doc). If you skipped brainstorming, you are violating the spirit of ptp — go back and invoke it.
- Do **not** write a `tasks.md` checkbox the implementing agent cannot complete unaided — no manual QA, no manual or exploratory testing, no "manually verify" / "verify by hand" / "check in the browser" / "have a human confirm" / "ask the user to try", and no paraphrase of those. Substitute an automated equivalent; if none exists, move the intent into `proposal.md > Success criteria` as a **non-checkbox** note rather than deleting it. This binds the final verification task too. The ban is **authoring-time only**: it does not retroactively rewrite existing changes, and it removes nothing from the downstream manual-only recovery path — `/ptp:apply` still refuses to check off a box whose acceptance condition was not verified, and `/ptp:backlog-continue` remains the recovery route for an epic halted that way.
- Do **not** stop the flow and ask the user to run `/ptp:brainstorm` first. `/ptp:plan` is autonomous: if the design doc is missing, run brainstorming inline (autonomous mode — no clarifying questions, document assumptions instead) and continue all the way through validation.
- Do **not** ask clarifying questions mid-flow. The autonomous contract is: take the request, make reasonable assumptions when ambiguous, document them clearly in `brainstorm.md`'s decision capsule, and produce validated artifacts. The user reviews the artifacts at the end; corrections happen during `/ptp:apply` or via a follow-up edit.
- Do **not** create `TLDR.md`, and do **not** read a pre-existing one as an input.
- Apply the compact artifact contract's **current-state-only** rule to every artifact you write or touch:
  replace obsolete text in place, delete contradicted text, and never append `Amendment`, `Correction`,
  `Previously`, `Earlier draft`, `Historical record`, `What changed`, or review-iteration narrative. After
  any review-fix pass, run a compaction pass over the artifacts you touched — removing stale alternatives,
  duplicated rationale, resolved open questions and review meta-commentary without changing semantics.
