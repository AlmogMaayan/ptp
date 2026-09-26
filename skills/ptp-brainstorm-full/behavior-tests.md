```json
{
  "skill": "ptp-brainstorm-full",
  "assertions": [
    {
      "id": "r0",
      "kind": "requires",
      "pattern": "pre-resolved",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r1",
      "kind": "requires",
      "pattern": "BOTH PHASES DONE",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r2",
      "kind": "requires",
      "pattern": "PHASE 2 ITERATION CAP REACHED",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "r3",
      "kind": "requires",
      "pattern": "Brainstorm-gate STOP",
      "why": "orchestration contract unchanged"
    },
    {
      "id": "scout-req-1",
      "kind": "requires",
      "pattern": "\\| .scout. \\|",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-2",
      "kind": "requires",
      "pattern": "Gate .off.: no pre-step runs[\\s\\S]{0,160}byte-identical",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-3",
      "kind": "requires",
      "pattern": "once, on the Phase A",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-4",
      "kind": "requires",
      "pattern": "never re-run for Phase B",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-5",
      "kind": "requires",
      "pattern": "same map as part \\(i\\)",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-6",
      "kind": "requires",
      "pattern": "openspec/changes/<change-id>/. or its epic container",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-7",
      "kind": "requires",
      "pattern": "never STOPs",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-8",
      "kind": "requires",
      "pattern": "One .ptp-run-at-model. call per phase",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-9",
      "kind": "requires",
      "pattern": "Brainstorm-gate blocks Phase B",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-10",
      "kind": "requires",
      "pattern": "Phase 1 main-agent brainstorm loop →\\s*Phase-1-gates-Phase-2 gate →\\s*Phase 2 reviewer-agent brainstorm loop",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-11",
      "kind": "requires",
      "pattern": "Phase 1 Claude →\\s*Phase 2 Codex",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-12",
      "kind": "requires",
      "pattern": "Do NOT invoke .ptp-codex-mode. in this skill",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-13",
      "kind": "requires",
      "pattern": "PHASE 1 DONE — CODEX SKIPPED",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-14",
      "kind": "requires",
      "pattern": "\\| .ITERATION CAP REACHED. \\|",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "scout-req-15",
      "kind": "requires",
      "pattern": "2\\. Invoke the .ptp-brainstorming. skill \\(or .superpowers:brainstorming. when the skill-set directive names .tdd-plugin=superpowers.\\) in autonomous mode",
      "why": "scout pre-step on brainstorm-full"
    },
    {
      "id": "order",
      "kind": "ordered",
      "patterns": [
        "## Precondition",
        "## Scout pre-step \\(gated\\)",
        "## Phase A",
        "## Brainstorm-gate",
        "## Phase B",
        "## Terminal report"
      ],
      "why": "sections appear in contract order"
    }
  ]
}
```

## Pressure test: Phase B tempts a second scout

**Situation** — Gate `on`; Phase A has finished and Phase B is about to start.

**Pressure** — Phase B is a fresh call, so a fresh scout looks tidy.

**Required behavior** — The scout runs once on Phase A; Phase B carries the same map as part \(i\).

**Failure signature** — A second scout run before Phase B.

## Pressure test: the map cites the brainstorm Phase A rewrote

**Situation** — A map line cites a path inside `openspec/changes/<change-id>/`.

**Pressure** — The map is already checked, so forwarding it as-is is tempting.

**Required behavior** — Phase B drops part (i) with the `scout map omitted: <reason>` line.

**Failure signature** — Phase B carries a map citing the rewritten brainstorm.

## Pressure test: the pre-step tempts reordering the phases

**Situation** — A maintainer adds the scout pre-step.

**Pressure** — Placing it before Phase A looks natural.

**Required behavior** — Phase A, the gate, Phase B and the terminal report keep their order; the pre-step runs on the Phase A call.

**Failure signature** — The phases are reordered.
