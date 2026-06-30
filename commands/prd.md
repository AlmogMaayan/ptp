---
description: Author an epic-scoped Product Requirements Document into openspec/prds/ — delegates selector resolution, epic projection, and PRD authoring to the ptp-prd skill
argument-hint: "<changeid> | epic:XXXX | story:XX (one or more; omit = all active epics)"
---

You are running **`/ptp:prd`** — the PRD-authoring entry point. Your job is to produce an epic-scoped Product Requirements Document at `openspec/prds/<epic>-<slug>.md` for each targeted epic, then STOP.

> **This command writes a file**, so it runs the branch guard before doing anything else. It does **not** emit `proposal.md`, `design.md`, `tasks.md`, spec deltas, or code — only a PRD. The recommended next step after a PRD is **`/ptp:plan <change-id>`**.

## Inputs

Selectors: $ARGUMENTS (one or more of: a bare change id, `epic:XXXX`, `story:NN`, `epic:XXXX story:NN`, or multiple whitespace-separated selectors; omit = all active epics)

## Branch safety

`/ptp:prd` writes a file, so it runs the **`ptp-branch-guard`** preamble before any write. Per that skill's **abort-precondition rule**, first evaluate the cheap read-only precondition that would abort the whole command: resolve and project the selector (read-only) to a set of epics, and if it resolves to **no active epics**, report nothing-to-do and exit **without cutting a branch** (cutting one ahead of a guaranteed abort just leaves a throwaway branch). Only once at least one epic is targeted, run the guard: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved target (per the `ptp-branch-guard` naming rule → `ptp/epic-XXXX` for a single targeted epic, or a `ptp/<≤5-kebab-word summary>` for a multi-epic or omitted selector) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the abort-precondition ordering, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Invoke the `ptp-prd` skill** via the Skill tool, passing the selectors from `$ARGUMENTS`. The skill owns the full protocol: selector-to-epic projection (additive layer on top of `ptp-change-selector`), `ptp-run-at-model` at `opus.high` (one foreground subagent per epic in sequence), Phase-0 prd-taskmaster backend detection, epic-context pre-load, `prd:generate` invocation and output relocation, and the inline auto-degrade fallback. Do not duplicate the protocol here.
2. **STOP.** The skill writes `openspec/prds/<epic>-<slug>.md` for each targeted epic and recommends `/ptp:plan` as the next step. Do not proceed into brainstorming, planning, or implementation.

## Hard rules

- Do **not** write `proposal.md`, `design.md`, `tasks.md`, spec deltas, or source code.
- Do **not** call `AskUserQuestion` — this command is non-interactive.
- Do **not** invoke `prd:go`, `prd:atlas`, or `prd:discover` — those are interactive entry points; the `ptp-prd` skill invokes `prd:generate` only.
- The only durable artifacts authored here are the PRDs at `openspec/prds/<epic>-<slug>.md` (one per targeted epic). Aside from those, only ordinary branch/directory setup and — at most — a renamed pre-existing `.taskmaster/docs/prd.md` backup may remain on disk (the skill never writes `proposal.md`, `design.md`, `tasks.md`, spec deltas, or code).
- Recommend **`/ptp:plan <change-id>`** as the next step after the PRD is written.
