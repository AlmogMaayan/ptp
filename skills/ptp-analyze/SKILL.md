---
name: ptp-analyze
description: Own read-only diagnosis, writing a durable analysis doc into a change folder and proposing nothing
---

# ptp-analyze — read-only investigation, durable analysis doc

## Purpose

**Model dispatch target.** `/ptp:analyze` runs this skill's work at `opus.high` via `ptp-run-at-model`,
one foreground main run. See **## Run at model** below for the full dispatch protocol — the outer-session
branch guard, the `ptp-run-at-model` invocation, and the result relay; this paragraph names the target
only and restates none of that contract.

This skill conducts a **read-only investigation** of a bug, observed behavior, problem, or question and writes a structured, evidence-backed analysis document into the appropriate `openspec/changes/<change-id>/` folder. It is a **limited producer** (in the `ptp-change-selector` §5 Role A sense): it never produces a change *proposal* — it never writes proposal/design/tasks/spec-delta files and never applies a fix — but it may allocate a minimal change folder (via `ptp-change-selector` §4) only to house the analysis doc when no relevant active change exists. When a fix is warranted it recommends the appropriate next ptp step and stops.

Contrast with `/ptp:brainstorm-only` (design exploration of a prospective change) — this skill diagnoses an *existing* phenomenon, not an *envisioned* feature. If diagnosis reveals that a change is warranted, the next step is `/ptp:plan` (or `/ptp:brainstorm` if you want to think through options first).

This skill is write-capable, so the **outer session** runs the `ptp-branch-guard` preamble before any
main work starts (see **## Run at model** below), and the main run's own guard check is a no-op because
HEAD is already on the feature branch by the time it runs. The guard rule itself is defined in
`skills/ptp-branch-guard/SKILL.md`.

## Run at model

`/ptp:analyze` runs its classification, routing, read-only investigation, change-folder resolution, and
analysis-doc write through `ptp-run-at-model`, in one foreground main run — never inline at whatever
model and effort the session happens to be set to. This section is the imperative dispatch step
`commands/analyze.md` invokes by way of this skill; `commands/analyze.md` itself restates none of it.

**Outer session — branch guard is the only outer-session precondition.** Run the `ptp-branch-guard`
preamble first, before anything else, deriving the branch name from a ≤5-kebab-word summary of the
subject per `ptp-branch-guard` *Branch naming* case 3. This is the command's only outer-session precondition — it allocates no change id in the outer session and asks the user nothing.

**Outer session — invoke `ptp-run-at-model`.** Once the guard has returned (or no-opped), invoke
`ptp-run-at-model` once at target `opus.high`, with the work being this skill's classification, routing,
read-only investigation, change-folder resolution, and analysis-doc write — i.e. everything below this
section, run inside the spawned main run rather than in the outer session.

**The main run's prompt must carry:** the raw subject text (unmodified, so classification, routing,
change-folder resolution/allocation, and the doc write all run inside the main run against the original
subject); and a note that its own `ptp-branch-guard` check is a **no-op** — HEAD is already on the
feature branch — so it must **not** launch `ptp-branch-prep`.

**Result relay.** The outer session relays the main run's terminal result per `ptp-run-at-model`'s
*Result relay*, keeping `completed`, `refused`, and `needs-human-action` distinct. An investigation that
ends inconclusively — the doc's *Recommended next step* reading "Needs more info: <what>" — still relays
as `completed`: it is not re-derived as a `refused` outcome just because the finding itself is
inconclusive.

## Classify the input

Classify the user's subject into one of three buckets before investigating:

1. **Bug / failure** — something is broken, erroring, crashing, behaving unexpectedly, or showing wrong data. Examples: "the refresh button shows a stale status", "the activation gate is skipping domains that have no DNS record", "API returns 500 on checkout", "fix the X bug".
2. **Explain / understand** — the user wants to know how something works, what a piece of code does, or what a past decision was. Examples: "how does the domain activation gate decide when to activate", "what does DriveStuckRowAsync do", "why was the www hostname approach chosen".
3. **Open problem** — ambiguous or exploratory: something feels off but the user cannot pinpoint it yet, or they want a broad audit. Examples: "something seems wrong with custom-domain expiry", "I'm not sure why performance is slow on large sites".

Record your classification at the top of the investigation trail.

## Route

- **Bug / failure** → invoke `ptp-systematic-debugging` via the Skill tool for the investigation phase. Feed it the subject and the context you have loaded. Then return here to write the analysis doc.
- **Explain / understand** or **Open problem** → conduct a structured, hypothesis-driven read-only investigation yourself (see **Investigate** below). You are not required to invoke `ptp-systematic-debugging`, but you may if the open problem turns out to be bug-shaped once you start looking.

## Investigate (read-only)

Gather evidence without modifying any source file:

1. **Load project context** — if `openspec/project.md` exists, read it. Run `npx -y openspec list` and `npx -y openspec list --specs` (use Bash) to orient on active changes and existing capabilities. Read the spec(s) most relevant to the subject.
2. **Read cited files** — use Read/Grep/Glob to find and read the source files, tests, configs, and migration scripts that bear on the subject. Follow call chains as needed.
3. **Form hypotheses** — state each hypothesis explicitly ("Hypothesis: the guard skips the DNS check when `PointingGateEnabled` is false").
4. **Test each hypothesis against the evidence** — cite specific `file:line` references (e.g. `src/Domain/Activation/RunActivateAsync.cs:47`). Confirm or refute.
5. **Record the trail** — note what you examined and, equally, what you did *not* examine (scope limits). Uncertainty is first-class: if the evidence is ambiguous, say so.

Never edit, create, or delete any source file during this phase.

## Write the analysis doc

Write **exactly one file** when investigation is complete:

**Resolve or allocate the change folder (run this BEFORE computing the target path):**
1. List folder names under `openspec/changes/` excluding `archive`.
2. Judge whether any active change's scope overlaps the subject. If so, use that change's folder as the target — no new epic is allocated.
3. If no active change is relevant (or relevance is ambiguous), allocate a fresh epic via `ptp-change-selector` §4 and create a minimal `XXXX_01_<subject-slug>/` folder under `openspec/changes/`. **Safe default: when relevance is ambiguous, always allocate a fresh single-story change — never silently file the doc under an unrelated change.**

**Target path:** `openspec/changes/<change-id>/analysis.md`
- `<change-id>` is the resolved or newly allocated change folder name (from the step above).
- The filename is always `analysis.md` — do not date- or subject-stamp it. (The date and subject still appear inside the doc, in the header and `## Subject` section.)
- **Filename collision:** if `analysis.md` already exists in the target change folder, append a numeric suffix before `.md` — e.g. `analysis-2.md`, `analysis-3.md`. Never overwrite a prior analysis.
- Create the change folder when allocating a fresh one; only the analysis doc is written into it.

**Schema — every section is required:**

```markdown
# Analysis — <subject>

> Date: YYYY-MM-DD — read-only diagnostic, not a change.

## Subject

<The user's original request, quoted verbatim or paraphrased faithfully.>

## Summary / TL;DR

<The finding in 1–3 sentences. If uncertain, say so here.>

## What was observed

<The symptom, error, behavior, or question as reported or reconstructed from evidence.>

## Investigation

<The hypothesis-and-evidence trail. Every claim cites at least one `file:line` reference.
Record what was examined AND what was out of scope.>

## Findings / Root cause

<The root cause (bug) or explanation (understand/problem). Be explicit about confidence.
For open problems: name the most likely candidates even if unconfirmed.>

## Confidence & open questions

<Confidence level: High / Medium / Low and why. List any open questions that could not
be resolved with the available evidence.>

## Implications / options

<What this finding means for the codebase. If a fix is warranted, sketch the options at
a high level — do not implement them.>

## Recommended next step

<One of: "No change needed", "/ptp:plan <...>", "/ptp:brainstorm <...>",
"Needs more info: <what is needed>", or another ptp command.>
```

After writing the file, surface its absolute path to the user.

## Hard rules

- **The dispatch wiring lives here, not in `commands/analyze.md`.** The `## Run at model` section above
  is the imperative dispatch step for `/ptp:analyze`. `commands/analyze.md` is an ordinary thin front
  door — it carries only `## Arguments`, `## Owner`, and `## Report`, and restates none of the
  model-dispatch policy.
- **Read-only on source.** Never create, edit, or delete any source file during investigation.
- **Only the analysis doc under `openspec/changes/`.** The only artifact this skill may write under a change folder is the analysis doc. Never create a proposal, design doc, tasks file, or spec delta under `openspec/changes/`.
- **Epic allocation only via `ptp-change-selector` §4, and only when needed.** Allocate a fresh change folder only through `ptp-change-selector` §4, and only when no relevant active change exists. Never allocate an epic for any other purpose.
- **No `openspec validate`.** A doc-only change folder is not a validatable change — it contains no proposal, design, or tasks. Do not run `openspec validate` after writing the analysis doc.
- **No fix.** When a fix is warranted, name it and recommend the next ptp step. Do not apply it.
- **Write exactly one file.** The analysis doc. No other file is created or modified by this skill.
- **STOP after writing.** Do not continue into planning, brainstorming, or implementation.
- **Uncertainty is first-class.** If the evidence is insufficient to draw a firm conclusion, say so explicitly rather than guessing. An inconclusive analysis with clear open questions is more valuable than a confident wrong answer.

## Stop & recommend

After writing the analysis doc, end by explicitly recommending the next ptp step:

- If the analysis confirms a bug that needs fixing → recommend `/ptp:plan <...>` (or `/ptp:brainstorm <...>` if options need thinking through).
- If the investigation shows no change is needed → state "No change needed" and explain why.
- If the evidence is insufficient → state what additional information would be required: "Needs more info: <what>".
- Never perform the recommended step. Stop here and let the user decide.
