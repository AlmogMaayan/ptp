---
description: Author an epic-scoped Product Requirements Document co-located in the change folder (openspec/changes/<id>/prd.md) — delegates selector resolution, epic projection, and PRD authoring to the ptp-prd skill
argument-hint: "<changeid> | epic:XXXX | story:XX | \"<free-text description>\" (one or more; free text allocates a fresh epic; omit = all active epics)"
---

You are running **`/ptp:prd`** — the PRD-authoring entry point. Your job is to produce an epic-scoped Product Requirements Document at `openspec/changes/<id>/prd.md` (where `<id>` is the epic's lowest-numbered story) for each targeted epic, then STOP.

> **This command writes a file**, so it runs the branch guard before doing anything else. It does **not** emit `proposal.md`, `design.md`, `tasks.md`, spec deltas, or code — only a PRD. The recommended next step after a PRD is **`/ptp:plan <change-id>`**.

## Inputs

Selectors: $ARGUMENTS (one or more of: a bare change id, `epic:XXXX`, `story:NN`, `epic:XXXX story:NN`, or multiple whitespace-separated selectors; a `"<free-text description>"` that is not a selector and matches no existing active folder — allocates a fresh epic and authors its PRD; omit = all active epics). An optional anywhere-in-text `model:<sonnet|opus|haiku|fable>.<low|medium|high|xhigh>` override token — e.g. `model:sonnet.medium` — overrides the `opus.high` default for **every** targeted epic in this invocation; see "Branch safety" below.

## Branch safety

`/ptp:prd` writes a file, so it runs the **`ptp-branch-guard`** preamble before any write. Per that skill's **abort-precondition rule**, first evaluate the cheap read-only precondition that would abort the whole command.

**Parse the `model:` override first, in this outer session, before anything else below.** Scan the raw
`$ARGUMENTS` text for an optional `model:<model>.<effort>` override token per the "Optional caller-side
`model:` override token" section of **`ptp-run-at-model`** — do not restate that grammar/validation
here.

- **Absent** → target = `opus.high` (unchanged path); proceed below with `$ARGUMENTS` as given.
- **Exactly one valid candidate** → strip it from `$ARGUMENTS` before the free-text classification and
  branch-name derivation below; target = the resolved `<model>.<effort>` literal. This one resolved
  target applies uniformly to every epic this invocation targets.
- **Invalid** (a `model:`-prefixed candidate with a bad model, bad effort, or wrong shape, or more than
  one candidate) → **STOP immediately, in this outer session**, before the free-text classification,
  the selector resolve/project step, branch-name derivation, and the branch guard below, and before
  invoking `ptp-prd`. Report the offending candidate(s) and the two valid enums
  (`sonnet|opus|haiku|fable`, `low|medium|high|xhigh`).

The remainder of this section, and the `ptp-prd` invocation in Steps below, operate on the now
token-free `$ARGUMENTS` and the resolved target.

**First classify the free-text case from the raw argument** — **before** the read-only resolve/project step — so that base §3's `"no change <id>"` STOP never fires for free text: the argument is free text iff `$ARGUMENTS` is **non-empty**, carries **no** `epic:`/`story:` reserved-prefix token, and does **not** exactly equal an existing active change folder name. (Folder-match wins: a bare id naming a real folder is a selector, not free text.)

- **Free-text case:** the "resolves to no active epics → nothing-to-do" abort-precondition does **NOT** apply — free text always targets exactly one freshly-allocated epic (allocated inside the subagent), so the command always proceeds. Because the epic id does not exist yet at branch-guard time, derive the feature-branch name from the **free-text summary** (`ptp/<≤5-kebab-word summary>` of `$ARGUMENTS`), not `ptp/epic-XXXX`.
- **Selector / multi / omit case (unchanged):** resolve and project the selector (read-only) to a set of epics, and if it resolves to **no active epics**, report nothing-to-do and exit **without cutting a branch** (cutting one ahead of a guaranteed abort just leaves a throwaway branch). Derive the branch name from the resolved target (per the `ptp-branch-guard` naming rule → `ptp/epic-XXXX` for a single targeted epic, or `ptp/<≤5-kebab-word summary>` for a multi-epic or omitted selector).

Only once the command is proceeding (free text, or at least one epic targeted), run the guard: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch named as above) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the abort-precondition ordering, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Invoke the `ptp-prd` skill** via the Skill tool, passing the token-free selectors from `$ARGUMENTS` (per "Branch safety" above) and the resolved target (`opus.high` by default, or the valid `model:` override). The skill owns the full protocol: selector-to-epic projection (additive layer on top of `ptp-change-selector`), `ptp-run-at-model` at the resolved target (one foreground subagent per epic in sequence, all epics sharing that one resolved target), Phase-0 prd-taskmaster backend detection, epic-context pre-load, `prd:generate` invocation and output relocation, and the inline auto-degrade fallback. The skill consumes the resolved target as given — it does **not** re-parse a `model:` token. Do not duplicate the protocol here.
2. **STOP.** The skill writes `openspec/changes/<id>/prd.md` for each targeted epic (where `<id>` is the epic's lowest-numbered story) and recommends `/ptp:plan` as the next step. Do not proceed into brainstorming, planning, or implementation.

## Hard rules

- Do **not** write `proposal.md`, `design.md`, `tasks.md`, spec deltas, or source code.
- Do **not** call `AskUserQuestion` — this command is non-interactive.
- Do **not** invoke `prd:go`, `prd:atlas`, or `prd:discover` — those are interactive entry points; the `ptp-prd` skill invokes `prd:generate` only.
- The only durable artifacts authored here are the PRDs at `openspec/changes/<id>/prd.md` (one per targeted epic). Aside from those, only ordinary branch/directory setup and — at most — a renamed pre-existing `.taskmaster/docs/prd.md` backup may remain on disk (the skill never writes `proposal.md`, `design.md`, `tasks.md`, spec deltas, or code).
- Recommend **`/ptp:plan <change-id>`** as the next step after the PRD is written.
