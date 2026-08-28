---
name: ptp-writing-plans
description: Use for the plan-authoring step of a ptp planning flow, once a change's proposal, design and spec deltas are decided.
---

# ptp-writing-plans — ordered, verifiable, agent-executable checkboxes

Turn a decided change into the shortest plan an implementing agent can execute unaided. The shared
authoring rules — agent neutrality and its delivery modes, the per-skill budget, the finding format,
and the pointer to the artifact contract — are owned by `skills/ptp-skill-contract/SKILL.md`. Load
it, and every other file this one points to for a rule it does not restate, before applying this
contract; a Claude role loads them through the Skill tool. This file restates none of it. It runs
over the 500-word skill budget for one stated reason: it hosts the `NEEDS SPLIT` terminal state,
which no other skill may restate.

## Inputs

The change's `proposal.md`, its `design.md` when one exists, its spec deltas, and the decision
capsule. Read them. Do not re-derive or restate their reasoning.

## Shape

Write one file at the path the caller names (ptp planning names
`openspec/changes/<change-id>/tasks.md`). Use the artifact shape the caller specifies; when the
caller specifies none, use:

```md
## 1. <area>
- [ ] 1.1 <action on an exact path> — <observable outcome>; verify: <automated check>
```

Usually 5-15 checkboxes; the caller's budget wins. Order by dependency: a checkbox may rely only on
checkboxes above it. The last checkbox verifies the automatable success criteria.

## Every checkbox

- names the exact file or files it creates or modifies, and the outcome that makes it done;
- ends with `verify:` naming a check the implementing agent can run and read itself — a test, a
  command plus an assertion on its output, an assertion over a file it can read, an automated
  browser check, or `npx -y openspec validate <change-id> --strict`;
- is completable by that agent unaided. The manual-task ban, its exemplary vocabulary, and its
  substitute-else-relocate ladder are owned by the `tasks-authoring` capability
  (`openspec/specs/tasks-authoring/spec.md`): follow it, never restate it.

A checkbox that only gates — the isolation check, the final verification box — names the files it
**verifies** instead, and is the one shape exempt from naming a file it changes.

## Never

- Paste implementation code. Name the file and the outcome. A literal belongs in a checkbox only
  when the exact bytes are the requirement — a flag, a string, a path.
- Split one deliverable into 2-5 minute microsteps. No separate "write the test", "run the test",
  "run the suite" boxes; one deliverable, one checkbox, verification folded in.
- Add a `git add`, `git commit`, `git push`, or branch task. Committing is a separate, explicitly
  requested step elsewhere in ptp.
- Repeat spec text, design rationale, risk analysis, or requirement prose. Reference the owner.
- Write `TBD`, `TODO`, "handle edge cases", "add error handling", or any step whose action or
  verification is unnamed.

## Terminal state: `NEEDS SPLIT`

If the change cannot be stated inside the artifact contract's keyed budgets, **stop and return
`NEEDS SPLIT`** with a proposed division into two or more changes and a one-line scope for each,
in dependency order. Write no further artifact text — not a longer `tasks.md`, not a
budget-exception marker.

Name the proposed changes as **children of the change being split**, per `ptp-change-selector` §4b —
`<this-change-id-minus-desc>_01_<desc>`, `_02_<desc>`, … . Children inherit the parent's position, so
no sibling is renumbered. That skill owns the allocation, the parent's replacement, and the
dependency rewrite; do not restate them.

`NEEDS SPLIT` is a **successful** terminal state: it reports that decomposition, not authoring, is
the remaining work. A caller treats it as a decomposition instruction and re-cuts. It is never a
refusal, and never licence to exceed a budget instead.

## Before returning

Check, and fix inline: every normative requirement in the spec deltas has at least one checkbox;
every checkbox names files and an automated verification; no checkbox depends on a later one. Report
the counts, not a narrative.

Conformance fixtures: `pressure-tests.md` (maintenance only — not a runtime input).
