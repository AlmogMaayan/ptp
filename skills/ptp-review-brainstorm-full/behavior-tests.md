```json
{
  "skill": "ptp-review-brainstorm-full",
  "assertions": [
    {
      "id": "r0",
      "kind": "requires",
      "pattern": "ptp-agent-roles",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r1",
      "kind": "requires",
      "pattern": "ptp. when .roles\\.main=codex",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r2",
      "kind": "requires",
      "pattern": "review\\.maxIterations",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r3",
      "kind": "requires",
      "pattern": "fresh loop state",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r4",
      "kind": "requires",
      "pattern": "Codex phase skipped \\(mode=",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r5",
      "kind": "requires",
      "pattern": "ptp-codex-mode",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r6",
      "kind": "requires",
      "pattern": "BOTH PHASES DONE",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r7",
      "kind": "requires",
      "pattern": "PHASE 1 DONE . CODEX SKIPPED",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r8",
      "kind": "requires",
      "pattern": "PHASE 2 ITERATION CAP REACHED",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r9",
      "kind": "requires",
      "pattern": "Phase 1 capped",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r10",
      "kind": "requires",
      "pattern": "PHASE 2 ARTIFACT BUDGET EXCEEDED",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r11",
      "kind": "requires",
      "pattern": "Phase 1 halted on the artifact budget",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "order",
      "kind": "ordered",
      "patterns": [
        "## Phase 1",
        "## Phase-1-gates-Phase-2 gate",
        "## Phase 2",
        "## Combined terminal state"
      ],
      "why": "sections appear in contract order"
    }
  ]
}
```

## Pressure test: rubric growth tempts a loop change

**Situation** — The review rubric gained decision-quality checks.

**Pressure** — Adjusting the loop to match seems needed.

**Required behavior** — The loop, gates and six terminal states stay unchanged.

**Failure signature** — The loop or terminal states are edited.
