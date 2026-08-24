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

Nine rows. `Soft budget` is words; exceeding it requires an explicit written justification in the
artifact, never truncation. Exact contracts, security invariants, migration rules, concurrency rules,
and complex state machines may legitimately need more space: the control this table imposes is "no
duplicate information," never "delete necessary information."

| Artifact | Owns | Must not contain | Soft budget |
|---|---|---|---|
| `brainstorm.md` | Problem framing, the chosen direction, the material *approach-level* alternatives weighed to choose it, assumptions | Full design, implementation plan, history | 400 |
| `proposal.md` | Why, scope/change summary, capabilities, impact | Detailed design, scenarios, task plan, alternative essay | 400 |
| `specs/**/spec.md` | Normative behavior and scenarios | Motivation, implementation detail, review/history prose | none (minimal normative text) |
| `design.md` | Only non-obvious *implementation* decisions and the technical alternatives rejected within the chosen direction, plus invariants, interfaces, data flow, failure/migration behavior | Proposal repetition, the approach-level choice `brainstorm.md` already made, task list, history | 800 (absent for mechanical work) |
| `tasks.md` | Ordered agent-executable actions and verification | Rationale essays, copied requirements, review history | 600 (5–15 checkboxes) |
| `effort.md` | The apply complexity recommendation | Explanation, blank section, Codex runtime configuration | one line |
| `TLDR.md` | Nothing required by the model workflow | Everything | not created |
| `prd.md` | Epic-level problem, outcomes, scope, requirements | Per-story design/task repetition, empty boilerplate | 1200 (real multi-story epics only) |
| `analysis.md` | Conclusion, evidence, unknowns | Investigation diary, revision history | none (current conclusions only) |

The `brainstorm.md` / `design.md` split is a boundary, not an overlap: `brainstorm.md` owns the
**approach-level** choice — which direction to take and which directions were rejected to get there —
and `design.md` owns the **implementation-level** decisions taken inside the chosen direction, with
the technical alternatives rejected at that level. A decision therefore has exactly one owner: ask
whether rejecting it would change the approach (brainstorm) or only the implementation (design).

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
- **A budget overrun is declared, not silent.** The written justification the ownership table
  requires takes the machine-readable form `<!-- budget-exception: <reason> -->` in the over-budget
  artifact, with a non-empty `<reason>`.
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
