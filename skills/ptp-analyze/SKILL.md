---
name: ptp-analyze
description: Use this skill when the user wants to analyze, diagnose, or root-cause an issue — trigger phrases include "analyze", "diagnose", "root cause", "understand why", "why is X happening", "how does X work", "what is causing", "investigate". Writes a durable analysis doc to openspec/analysis/ and never produces a change. Do NOT use for design exploration (that is /ptp:brainstorm-only) or for producing a change proposal (that is /ptp:plan).
---

# ptp-analyze — read-only investigation, durable analysis doc

## Purpose

This skill conducts a **read-only investigation** of a bug, observed behavior, problem, or question and writes a structured, evidence-backed analysis document to `openspec/analysis/`. It is **not a change-producer**: it never writes proposal/design/tasks/spec-delta files, never allocates an epic, and never applies a fix. When a fix is warranted it recommends the appropriate next ptp step and stops.

Contrast with `/ptp:brainstorm-only` (design exploration of a prospective change) — this skill diagnoses an *existing* phenomenon, not an *envisioned* feature. If diagnosis reveals that a change is warranted, the next step is `/ptp:plan` (or `/ptp:brainstorm` if you want to think through options first).

## Branch safety

This skill is **write-capable** — it writes the analysis document. Before writing any file, run the **`ptp-branch-guard`** preamble. The full rule (the guard logic, the `ptp-branch-prep` workflow, the hard rules) lives in the `ptp-branch-guard` skill — do not restate it here.

## Classify the input

Classify the user's subject into one of three buckets before investigating:

1. **Bug / failure** — something is broken, erroring, crashing, behaving unexpectedly, or showing wrong data. Examples: "the refresh button shows a stale status", "the activation gate is skipping domains that have no DNS record", "API returns 500 on checkout", "fix the X bug".
2. **Explain / understand** — the user wants to know how something works, what a piece of code does, or what a past decision was. Examples: "how does the domain activation gate decide when to activate", "what does DriveStuckRowAsync do", "why was the www hostname approach chosen".
3. **Open problem** — ambiguous or exploratory: something feels off but the user cannot pinpoint it yet, or they want a broad audit. Examples: "something seems wrong with custom-domain expiry", "I'm not sure why performance is slow on large sites".

Record your classification at the top of the investigation trail.

## Route

- **Bug / failure** → invoke `superpowers:systematic-debugging` via the Skill tool for the investigation phase. Feed it the subject and the context you have loaded. Then return here to write the analysis doc.
- **Explain / understand** or **Open problem** → conduct a structured, hypothesis-driven read-only investigation yourself (see **Investigate** below). You are not required to invoke `superpowers:systematic-debugging`, but you may if the open problem turns out to be bug-shaped once you start looking.

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

**Target path:** `openspec/analysis/YYYY-MM-DD-<subject>-analysis.md`
- Compute the date at runtime (`date` via Bash or read it from the current-date context).
- Kebab-slug the subject: lowercase, spaces and special characters → hyphens, strip leading "fix-the-" or "fix-" prefixes so a fix-phrased subject ("fix the stale-status bug") becomes `stale-status-bug-analysis.md`.
- **Filename collision:** if the target file already exists, append a numeric suffix before `.md` — e.g. `…-analysis-2.md`, `…-analysis-3.md`. Never overwrite a prior analysis.
- Create `openspec/analysis/` if it does not exist.

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

- **Read-only on source.** Never create, edit, or delete any source file during investigation.
- **No `openspec/changes/` artifacts.** Never create a proposal, design doc, tasks file, spec delta, or change folder — not even an empty one.
- **No epic allocation.** Never call `openspec` to allocate an epic id.
- **No `openspec validate`.** Running validate implies a change exists; this skill produces no change.
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
