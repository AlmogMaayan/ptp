---
description: Read-only investigation — analyze a bug, observation, problem, or question and write a structured, evidence-backed analysis doc into the appropriate openspec/changes/<change-id>/ folder. Never produces a change proposal, never modifies source.
argument-hint: "<bug / observation / problem / question to investigate>"
---

You are running **`/ptp:analyze`** — a read-only diagnostic command. Use it to root-cause a bug, explain an observed behavior, or understand a subsystem *before* deciding whether a change is even warranted. The output is a structured analysis document at `openspec/changes/<change-id>/analysis.md`.

> **Contrast with other commands:**
> - `/ptp:brainstorm-only "<topic>"` — design exploration for a *prospective change* (what to build and how); not a diagnosis.
> - `/ptp:plan [change-id]` — produces proposal/design/tasks/spec-delta artifacts; only use it once you know a change is needed.
> This command diagnoses an *existing* phenomenon. It never produces a change proposal.

## Inputs

Subject: $ARGUMENTS

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from a ≤5-kebab-word summary of the subject (→ `ptp/<summary>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

The "Branch safety (first step)" preamble above runs **in the outer session** and is this command's
**only** outer-session precondition. `/ptp:analyze` allocates no change id outer — its branch name comes
from a ≤5-kebab-word summary of the subject (`ptp-branch-guard` *Branch naming* case 3), not from an
id — and it has **no** abort-guaranteeing precondition (the argument is free text with no selector to
fail, and no change folder must pre-exist) and asks the user nothing. The actual analysis work — steps
1–2 below — **runs at a deterministic model** via the **`ptp-run-at-model`** skill at `opus.high`:
root-cause investigation is high-judgment work whose output `/ptp:plan` later consumes without
re-deriving it, so it must not depend on whatever model the session happens to be on.

**Run steps 1–2 via `ptp-run-at-model` at `opus.high`.** Only after the branch guard has run in the
outer session, invoke the **`ptp-run-at-model`** skill with target `opus.high` and the work being
**steps 1–2 below**. It runs one foreground main run (an `opus` subagent with the high effort
directive by default) that performs those steps and returns its terminal result, relayed per
`ptp-run-at-model`'s *Result relay* — an inconclusive analysis is a **completed** run whose content
says "Needs more info", never a refusal, so relay the main run's own terminal state rather than
re-deriving one from the doc. Reference the `ptp-run-at-model` skill for the spawn-and-relay mechanics
rather than restating them.

Two things the prompt MUST carry:

- **The raw subject text** (`$ARGUMENTS`, verbatim). Resolving-or-allocating the change folder,
  deriving `<subject-slug>`, creating the folder, and writing the doc all happen **inside** the main
  run — it cannot do any of that without the raw subject. Allocation stays inside deliberately: judging
  whether an active change's scope overlaps the subject is investigation-informed judgment (the skill
  orders it *after* investigation), and allocation is a producer write concern that must create no
  producer state before the branch is confirmed — the same rule `skills/ptp-prd/SKILL.md` applies to
  its free-text case.
- **The branch-guard no-op note:** the main run's own `ptp-branch-guard` check is a **no-op** (HEAD is
  already on the feature branch from the outer guard), so it must **NOT** attempt to launch the
  `ptp-branch-prep` Workflow.

The analysis work spawns nothing of its own — `ptp-analyze` invokes `superpowers:systematic-debugging`
as an inline **Skill** call, which launches no Agent and no Workflow — so this command wraps cleanly
with no second nesting level. Do not introduce an Agent spawn on that route without revisiting this.

1. **Invoke the `ptp-analyze` skill** via the Skill tool, passing the subject. The skill holds the full
   investigation methodology: input classification, routing, read-only evidence gathering, the
   resolve-or-allocate rule, the analysis-doc schema, hard rules, and the stop-and-recommend protocol.
   Do not duplicate the methodology here.
2. **STOP.** The skill writes the analysis doc and recommends a next step. Do not proceed into
   planning, brainstorming, or implementation.

Once the main run returns, the outer session relays its terminal result and the recommended next step,
then stops. Never report a refusal or a `needs-human-action` state as a success.

## Hard rules

- Do **not** write any code or modify any source file.
- Under `openspec/changes/`, write **only** the analysis doc — no proposal, design, tasks, or spec delta.
- Allocate an epic **only** via `ptp-change-selector` §4, and **only** when no relevant active change exists.
- Do **not** apply a fix, even if the subject is phrased as a fix request ("fix the X bug").
- **Recommend** the appropriate next ptp step (e.g. `/ptp:plan`) rather than performing it.
