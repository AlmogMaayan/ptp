---
name: ptp-brainstorming
description: Use for a ptp planning flow's brainstorming step, turning a change request into one recorded decision, not general creative work.
---

# ptp-brainstorming — decide, then write one capsule

Turn a change request into a single durable decision. Authoring rules, budget, finding format and
the artifact contract pointer are owned by `skills/ptp-skill-contract/SKILL.md`. Load it, and every
other file this one points to, before applying this contract; a Claude role loads them through the
Skill tool.

## Mode

The caller declares `mode: autonomous` or `mode: interactive`; when it declares nothing, assume
autonomous.

- **Autonomous** — ask nothing, use no user-question tool, wait for no approval. Resolve each
  ambiguity against the repository and record the reading as an assumption with its evidence, in the
  field the caller's shape designates, else under `## Assumptions`.
- **Interactive** — never ask what the repository answers and never send a questionnaire. Ask only
  when the repository cannot settle materially different readings, or a wrong guess would be costly
  to reverse or change behavior, data, permissions or architecture. Never ask about naming,
  placement or obvious technical choices. Ask one focused question, and ask for approval once.

## Intent first

State the outcome, the observable behavior, the constraints, and the behavior that must remain. An
implementation idea is a hypothesis until inspection supports it.

## Inspect — a bounded search

Trace outward from the entry point, grepping for the owner, callers, consumers, state, alternate
paths, permissions and similar features. Follow only an edge that adds a new owner or new state; stop
when the blast radius stops growing. Read at outline level. Specs, prior brainstorms and
`analysis.md` say where to look first, never what is true: cite every fact from code as `path` or
`path:line`. A spec/code mismatch becomes an assumption citing both, and the decision follows the
code. An uncited guess is a defect.

## Decide

Take the smallest coherent change on the existing architecture: fewer concepts, less state, fewer
parallel mechanisms, not fewer lines. Ask whether a materially simpler or more native way exists.
Walk the flow before choosing: entry, state change, persistence, consumers, reload, alternate path,
failure. Compare only material alternatives. When exactly one direction is viable, say so. Never
invent an option, and never keep one inspection eliminated.

## Output — one capsule

Write one file at the caller's path (ptp planning: `openspec/changes/<change-id>/brainstorm.md`),
in the caller's shape and within its word budget; else:

```md
## Decision
<what and why — 1-3 sentences, citing files inspected>

## Alternatives
- <material option> — rejected: <reason>
  (or: Only one viable direction — <reason>)

## Assumptions
- <assumption> — <evidence>
```

Impact or flow context is a clause, never a heading.

## Never

- Write a copy anywhere: no `docs/plans`, no other docs folder.
- Run any git command.
- Keep history: a re-run replaces the capsule.
- Carry the design, plan or tasks.
- Invoke an implementation skill.

Conformance fixtures: `pressure-tests.md` and `behavior-tests.md` (maintenance only — not a runtime input).
