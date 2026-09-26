```json
{
  "skill": "ptp-review-brainstorm",
  "assertions": [
    {
      "id": "req-0",
      "kind": "requires",
      "pattern": "\\*\\*A\\W+missed impact",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-1",
      "kind": "requires",
      "pattern": "\\*\\*B\\W+unnecessary complexity",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-2",
      "kind": "requires",
      "pattern": "\\*\\*C\\W+flow correctness",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-3",
      "kind": "requires",
      "pattern": "\\*\\*D\\W+wrong-approach counterexample",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-4",
      "kind": "requires",
      "pattern": "check-B defect",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-5",
      "kind": "requires",
      "pattern": "check-C flow defect",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-6",
      "kind": "requires",
      "pattern": "breaks the requested behavior",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-7",
      "kind": "requires",
      "pattern": "only raises risk",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-8",
      "kind": "requires",
      "pattern": "why can.t the existing architecture own this",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-9",
      "kind": "requires",
      "pattern": "how could this approach still be wrong",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-10",
      "kind": "requires",
      "pattern": "defect, not a preference",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-11",
      "kind": "requires",
      "pattern": "equivalent designs is dropped",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-12",
      "kind": "requires",
      "pattern": "minimal correction or question",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-13",
      "kind": "requires",
      "pattern": "main agent remains the architect",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-14",
      "kind": "requires",
      "pattern": "cannot evidence",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-15",
      "kind": "requires",
      "pattern": "check-A missed impact",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-16",
      "kind": "requires",
      "pattern": "check-D counterexample",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-17",
      "kind": "requires",
      "pattern": "Medium by default",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-18",
      "kind": "requires",
      "pattern": "cannot deliver the outcome",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-19",
      "kind": "requires",
      "pattern": "no fixed option count",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "req-20",
      "kind": "requires",
      "pattern": "usable handoff",
      "why": "the rubric carries this decision-quality rule"
    },
    {
      "id": "order",
      "kind": "ordered",
      "patterns": [
        "## The rubric",
        "Decision-quality checks",
        "Blocking conditions",
        "## Classification",
        "## Verdict"
      ],
      "why": "sections appear in contract order"
    }
  ]
}
```

## Pressure test: a missed impact

**Situation** — A brainstorm changes one entry point but a second consumer of the same state exists.

**Pressure** — The decision is stated and usable, so passing it is tempting.

**Required behavior** — Report a check-A missed impact with evidence and the minimal correction.

**Failure signature** — The review passes on sufficiency alone.

## Pressure test: a flow flaw

**Situation** — The chosen flow leaves another view stale after the change.

**Pressure** — The prose reads consistent.

**Required behavior** — Report a check-C flow defect at High.

**Failure signature** — The stale view goes unreported.

## Pressure test: an over-engineered design

**Situation** — The brainstorm adds a new manager where an existing mechanism could own the behavior.

**Pressure** — It is only a design taste.

**Required behavior** — Ask why the existing architecture cannot own this; a materially simpler approach is a check-B defect, not a preference.

**Failure signature** — The finding is dropped as preference, or a redesign is dictated.

## Pressure test: a reviewer counterexample

**Situation** — The design is consistent and implementable but a realistic scenario defeats the outcome.

**Pressure** — No evidence from code is at hand.

**Required behavior** — Report a check-D counterexample, Medium by default, phrased as a question when unevidenced.

**Failure signature** — An unevidenced concern is reported High.
