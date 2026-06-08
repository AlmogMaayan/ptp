---
description: Read-only investigation — analyze a bug, observation, problem, or question and write a structured, evidence-backed analysis doc to openspec/analysis/. Never produces a change, never modifies source.
argument-hint: "<bug / observation / problem / question to investigate>"
---

You are running **`/ptp:analyze`** — a read-only diagnostic command. Use it to root-cause a bug, explain an observed behavior, or understand a subsystem *before* deciding whether a change is even warranted. The output is a structured analysis document at `openspec/analysis/YYYY-MM-DD-<subject>-analysis.md`.

> **Contrast with other commands:**
> - `/ptp:brainstorm-only "<topic>"` — design exploration for a *prospective change* (what to build and how); not a diagnosis.
> - `/ptp:plan [change-id]` — produces proposal/design/tasks/spec-delta artifacts; only use it once you know a change is needed.
> This command diagnoses an *existing* phenomenon. It never produces a change proposal.

## Inputs

Subject: $ARGUMENTS

## Branch safety (first step)

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from a ≤5-kebab-word summary of the subject (→ `ptp/<summary>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Invoke the `ptp-analyze` skill** via the Skill tool, passing the subject from `$ARGUMENTS`. The skill holds the full investigation methodology: input classification, routing, read-only evidence gathering, analysis-doc schema, hard rules, and the stop-and-recommend protocol. Do not duplicate the methodology here.
2. **STOP.** The skill writes the analysis doc and recommends a next step. Do not proceed into planning, brainstorming, or implementation.

## Hard rules

- Do **not** write any code or modify any source file.
- Do **not** create any file under `openspec/changes/` — no proposal, design, tasks, or spec delta.
- Do **not** allocate an epic.
- Do **not** apply a fix, even if the subject is phrased as a fix request ("fix the X bug").
- **Recommend** the appropriate next ptp step (e.g. `/ptp:plan`) rather than performing it.
