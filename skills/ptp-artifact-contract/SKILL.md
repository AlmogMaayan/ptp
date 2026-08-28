---
name: ptp-artifact-contract
description: Own the compact artifact schema every ptp writer emits and every ptp reader consumes
---

# ptp-artifact-contract — the compact artifact contract (v1)

This file is the single normative owner of the compact artifact contract. Every other surface that
restates any part of it — the project-local OpenSpec schema fork at `schemas/ptp-compact/` and the
project's compactness linter — is a **derived** surface: it introduces no compact-contract rule this
file does not state, it cites this file as the owner, and it loses on any conflict with it. A
compact-contract rule is a rule about what an artifact owns, what it must not contain, its word
budget, its required shape, the current-state-only policy, or the contract version; OpenSpec's own
artifact grammar and a derived surface's own operational protocol (CLI, exit codes, finding codes,
emission order, detection heuristics) are owned elsewhere and are not restated here.

## 1. Ownership table (contract v1)

Nine rows. `Budget` is words. **A budget carrying a config key is an acceptance criterion, not
guidance:** an artifact over it is defective, and the only two remedies are to remove text or to
split the change. Review effort scales with the number of claims a document makes, so an unbounded
artifact is an unbounded review. The two budgets with no key (`brainstorm.md`, `prd.md`) stay
**soft** — exceeding one requires an explicit written justification in the artifact, never
truncation. Under either posture the control is "no duplicate information and no claim the change
does not need," never "delete necessary information."

Each key's default is the value in the `Budget` column; the parameter registry
(`skills/ptp-config/SKILL.md`) owns the keys' domain, defaults, and validation, and resolution is
layered per `ptp-workspace`.

| Artifact | Owns | Must not contain | Budget | Config key |
|---|---|---|---|---|
| `brainstorm.md` | Problem framing, the chosen direction, the material *approach-level* alternatives weighed to choose it, assumptions | Full design, implementation plan, history | 400 (soft) | — |
| `proposal.md` | Why, scope/change summary, capabilities, impact, build state | Detailed design, scenarios, task plan, alternative essay | 400 | `artifact.maxProposalWords` |
| `specs/**/spec.md` | Normative behavior and scenarios | Motivation, implementation detail, review/history prose | 1200, **summed across the change's delta files**, excluding verbatim `MODIFIED` replacement text | `artifact.maxSpecDeltaWords` |
| `design.md` | Only non-obvious *implementation* decisions and the technical alternatives rejected within the chosen direction, plus invariants, interfaces, data flow, failure/migration behavior | Proposal repetition, the approach-level choice `brainstorm.md` already made, task list, history | 800 (absent for mechanical work) | `artifact.maxDesignWords` |
| `tasks.md` | Ordered agent-executable actions and verification | Rationale essays, copied requirements, review history | 600; 5–15 checkboxes, each ≤ 60 words | `artifact.maxTasksWords`, `artifact.maxTaskCount`, `artifact.maxTaskWords` |
| `effort.md` | The apply complexity recommendation | Explanation, blank section, Codex runtime configuration | one line | — |
| `TLDR.md` | Nothing required by the model workflow | Everything | not created | — |
| `prd.md` | Epic-level problem, outcomes, scope, requirements | Per-story design/task repetition, empty boilerplate | 1200 (soft; real multi-story epics only) | — |
| `analysis.md` | Conclusion, evidence, unknowns | Investigation diary, revision history | none (current conclusions only) | — |

**The spec deltas are budgeted, and the sum is what is budgeted.** They were historically the one
artifact nothing bounded, and they grew larger than the designs they served.

The `brainstorm.md` / `design.md` split is a boundary, not an overlap: `brainstorm.md` owns the
**approach-level** choice — which direction to take and which directions were rejected to get there —
and `design.md` owns the **implementation-level** decisions taken inside the chosen direction, with
the technical alternatives rejected at that level. A decision therefore has exactly one owner: ask
whether rejecting it would change the approach (brainstorm) or only the implementation (design).

**`design.md` states decisions and the reasons for them. It is not an implementation
specification.** No pseudo-code, no statement-by-statement SQL, no method-body narration. Where an
exact shape is load-bearing, give one cited example, never a catalogue.

**A writer cites prior established findings; it does not restate them.** Restatement is the primary
growth mechanism.

**A budget that cannot be met is a decomposition signal, never an exception.** A planner that cannot
fit a change inside a keyed budget returns `NEEDS SPLIT` and writes no more; that terminal state and
its payload are owned by `skills/ptp-writing-plans/SKILL.md`.

## 2. Shape rules

- **No TLDR.** A change created under this contract does not create `TLDR.md`. Legacy changes keep
  theirs; nothing deletes them.
- **`effort.md` is exactly one line** matching `^(haiku|sonnet|opus)\.(low|medium|high|xhigh)$`, with
  no second line and no justification. The vocabulary is `effort-rubric`'s, unchanged.
- **`design.md` is conditional** — created only for a cross-cutting change, a new architectural
  pattern, a new external dependency or significant data-model change, security/performance/migration
  complexity, or an ambiguity better settled before coding. Absent otherwise; never an empty stub.
- **`proposal.md > Why` is 1–3 sentences.** The motivation is stated once, at that length; anything
  longer is the essay `brainstorm.md` owns.
- **One checkbox is at most 60 words**, counting the checkbox line plus its indented continuation
  lines and excluding fenced code. A task longer than that is carrying rationale that `design.md` or
  `proposal.md` owns; split it or move the reasoning to its owner.
- **Each `tasks.md` checkbox names its automated check** in the line itself, in the form
  `<edit/action>; verify: <automated check>`. This makes visible the verification `tasks-authoring`
  already requires of every checkbox; it is a shape rule about where the check is written, and the
  rule that the check must be agent-executable stays `tasks-authoring`'s.
- **A soft-budget overrun is declared, not silent; a keyed budget has no such escape.** The written
  justification a soft budget requires takes the machine-readable form
  `<!-- budget-exception: <reason> -->` in the over-budget artifact, with a non-empty `<reason>`. That
  marker never excuses a keyed budget: an over-budget keyed artifact is a defect whose only remedies
  are removal and splitting.
- **`proposal.md` carries a required `## Build state` section, one line** — `GREEN`, or
  `RED — <what breaks> until <change-id>`. Changes are cut small to bound review
  cost, not to keep the build green at every step, so `RED` is an ordinary declaration rather than a
  defect. Two rules follow it: a `RED` change **runs no tests**, so every `tasks.md` verification in
  it is static (grep, file absence, spec enumeration) and the test run is deferred to the change that
  restores `GREEN` — a checkbox its apply agent cannot satisfy stalls the run; and a `RED` change plus
  the change that closes it form a **contiguous group** that is never archived or deployed one half at
  a time, the closing change being named in the `RED` proposal.
- **A `MODIFIED` delta block reproduces the complete requirement.** Archiving replaces the requirement
  wholesale, so a truncated or elided `MODIFIED` block silently drops the omitted text at archive
  time. Every `MODIFIED` block carries the full requirement with every original scenario preserved,
  and that verbatim replacement text is excluded from the spec-delta budget — reproducing an existing
  requirement in full is mandatory and is never traded against a word limit.
- **A removal enumerates against the current spec file.** `openspec validate --strict` does not detect
  an incomplete removal. A change removing a capability lists its requirements by direct comparison
  against the current `openspec/specs/<capability>/spec.md`, because archiving an earlier change
  *adds* requirements to that file after the removal was drafted.
- **A "word" is defined.** An artifact's word count is its whitespace-separated tokens after CRLF is
  normalized to LF and fenced code blocks and HTML comments are removed. Fenced code and markers
  therefore never push an artifact over budget; Markdown tables are prose and do count.
- **Every requirement is covered by a task.** Each `### Requirement:` in `specs/**/spec.md` has at
  least one `tasks.md` checkbox that implements or verifies it. This is the contract rule; any
  token-overlap heuristic a derived surface uses is only a detection heuristic for it and decides
  nothing.

These are the only compact-specific constraints the project-local schema's target shapes carry beyond
the ownership table; every other line of those shapes is `spec-driven`'s preserved grammar, which
upstream owns.

## 3. Current-state-only update policy

Every planning artifact describes only the latest intended state.

- Replace obsolete text in place; delete contradicted or superseded paragraphs.
- Never append `Amendment`, `Correction`, `Previously`, `Earlier draft`, `Historical record`,
  `What changed`, `SUPERSEDED`, or `CORRECTED` sections merely to preserve history.
- Do not explain that a field, rule, or number used to be different unless backward compatibility or
  migration behavior depends on that fact.
- Git is the history; `stages/<kind>.json` is the latest workflow state.
- A review fix may rewrite a whole small section when that is the shortest way to restore one coherent
  current truth. "Targeted" constrains scope, not append-only editing.
- **Defect rule:** an artifact containing both an obsolete statement and its correction is defective
  *even when the latest statement is correct*.

## 4. Contract version and legacy interpretation

The contract version is the pair **(schema name, schema `version` integer)** — here `ptp-compact` /
`1`. There is no separate version file.

- A change records its creating contract in OpenSpec's own `.openspec.yaml` (`schema: ptp-compact`),
  which OpenSpec already writes and reads.
- A change with no `.openspec.yaml`, or with `schema: spec-driven`, is **legacy** and is interpreted
  under the pre-existing PTP contract: `TLDR.md` present, multi-line `effort.md` per `effort-rubric`,
  mandatory `design.md`. Readers tolerate it; nothing rewrites it.
- A **breaking** contract change takes a new schema **name** (`ptp-compact-v2`); a compatible one
  bumps the integer. `.openspec.yaml` carries only the name, so the name must change whenever an old
  change would be misread under the new rules.
- **Boundary with `effort-rubric`:** the one-line rule binds only changes recorded as `ptp-compact`.
  `effort-rubric`'s line-1/blank/justification contract continues to bind every other change and is
  not amended here.
