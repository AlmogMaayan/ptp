```json
{
  "skill": "ptp-brainstorming",
  "assertions": [
    { "id": "intent-first", "kind": "requires", "pattern": "intent\\s+first", "why": "the skill states the outcome and constraints before any implementation idea" },
    { "id": "hypothesis", "kind": "requires", "pattern": "hypothesis", "why": "an implementation idea is a hypothesis until inspection supports it" },
    { "id": "bounded-search", "kind": "requires", "pattern": "bounded\\s+search", "why": "inspection is a bounded search, not an open-ended read" },
    { "id": "blast-radius", "kind": "requires", "pattern": "blast\\s+radius\\s+stops\\s+growing", "why": "the search stops when the blast radius stops growing" },
    { "id": "outline-level", "kind": "requires", "pattern": "outline\\s+level", "why": "files are read at outline level" },
    { "id": "index-not-evidence", "kind": "requires", "pattern": "where\\s+to\\s+look\\s+first", "why": "specs and prior notes are an index, not evidence" },
    { "id": "spec-code-mismatch", "kind": "requires", "pattern": "spec/code\\s+mismatch", "why": "a spec/code mismatch becomes a cited assumption" },
    { "id": "existing-architecture", "kind": "requires", "pattern": "existing\\s+architecture", "why": "the decision takes the smallest change on the existing architecture" },
    { "id": "materially-simpler", "kind": "requires", "pattern": "materially\\s+simpler\\s+or\\s+more\\s+native", "why": "the decision asks whether a materially simpler or more native way exists" },
    { "id": "walk-the-flow", "kind": "requires", "pattern": "walk\\s+the\\s+flow", "why": "the flow is walked before choosing" },
    { "id": "questionnaire", "kind": "requires", "pattern": "questionnaire", "why": "interactive mode never sends a questionnaire" },
    { "id": "naming-placement", "kind": "requires", "pattern": "naming,\\s+placement", "why": "never ask about naming, placement or obvious technical choices" },
    { "id": "skill-tool", "kind": "requires", "pattern": "through\\s+the\\s+Skill\\s+tool", "why": "a Claude role loads the contract through the Skill tool" },
    { "id": "one-viable", "kind": "requires", "pattern": "Only\\s+one\\s+viable\\s+direction", "why": "a single viable direction is stated as such" },
    { "id": "no-docs-plans", "kind": "requires", "pattern": "docs/plans", "why": "no second copy under docs/plans" },
    { "id": "replaces", "kind": "requires", "pattern": "replaces", "why": "a re-run replaces the capsule" },
    { "id": "section-order", "kind": "ordered", "patterns": ["\\n## Intent first", "\\n## Inspect", "\\n## Decide", "\\n## Decision", "\\n## Alternatives", "\\n## Assumptions"], "why": "sections appear in the contract order" },
    { "id": "no-superpowers", "kind": "forbids", "pattern": "superpowers", "why": "the replacement skill never names superpowers" }
  ]
}
```

## Pressure test: the rule that grows the skill

**Situation** — A maintainer wants to add one more brainstorming rule to `SKILL.md`.

**Pressure** — Appending the rule is the quickest edit, and the body is already near its word budget.

**Required behavior** — The rule replaces or tightens existing text so the body stays below 500 words, with no `budget-exception` line.

**Failure signature** — The body grows past 500 words, or a `budget-exception` line is added to excuse it.
