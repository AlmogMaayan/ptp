---
name: ptp-brainstorming
description: Use for the brainstorming step of a ptp planning flow, when a change request must become one recorded decision. Not general creative work.
---

# ptp-brainstorming — decide, then write one capsule

Turn a change request into a single durable decision. The shared authoring rules — agent neutrality
and its delivery modes, the per-skill budget, the finding format, and the pointer to the artifact
contract — are owned by `skills/ptp-skill-contract/SKILL.md`. Load it, and every other file this one
points to for a rule it does not restate, before applying this contract; a Claude role loads them
through the Skill tool. This file restates none of it.

## Mode

The caller declares `mode: autonomous` or `mode: interactive`. **When the caller declares nothing,
assume autonomous** — every ptp pipeline entry point is autonomous.

- **Autonomous** — ask nothing, use no user-question tool, wait for no approval. Resolve each
  ambiguity against the repository, take the most reasonable reading, and record it as an assumption
  in the capsule — under `## Assumptions` when the fallback shape below applies, otherwise in the
  field the caller's shape designates — with the evidence behind it.
- **Interactive** — ask only a question whose different answers would change the decision, the
  scope, or a contract. Never ask what the repository already answers, and never send a
  questionnaire. Ask for approval once, on the decision; never re-ask per section.

## Inspect before deciding

Read the real surface first: the files, specs, and commands the request names, and the ones those
reference. Cite what you read as `path` or `path:line` inside the capsule. A decision resting on a
guess about this repository is a defect, not a shortcut.

## Alternatives

Compare only **material** alternatives — options differing in observable behavior, contract, risk,
or blast radius. When exactly one direction is viable, say so with the reason. Never invent an
option to reach a count, and never keep one the inspection already eliminated.

## Output — one capsule, nothing else

Write exactly one file, at the path the caller names (ptp planning names
`openspec/changes/<change-id>/brainstorm.md`). Use the artifact shape the caller specifies; when the
caller specifies none, use:

```md
## Decision
<what will be done and why — 1-3 sentences, citing the files inspected>

## Alternatives
- <material option> — rejected: <reason>
  (or the single line: Only one viable direction — <reason>)

## Assumptions
- <assumption> — <evidence or basis>
```

Stay inside the caller's word budget. The number is owned by the compact artifact contract, not
by this file.

## Never

- Write a second copy anywhere — no `docs/plans`, no other docs folder, no summary file.
- Run `git commit`, `git add`, or any other git command.
- Append revision history, earlier drafts, or the conversation. A re-run **replaces** the capsule.
- Carry the full design, the implementation plan, or the task list. Those belong to `design.md` and
  to `ptp-writing-plans`.
- Invoke an implementation skill. The next step is the caller's to choose.

Conformance fixtures: `pressure-tests.md` (maintenance only — not a runtime input).
