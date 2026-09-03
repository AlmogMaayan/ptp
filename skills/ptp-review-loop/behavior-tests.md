```json
{
  "skill": "ptp-review-loop",
  "assertions": [
    { "id": "tdd-mandatory-spec-req-carveout", "kind": "requires", "pattern": "tdd[\\s\\S]{0,120}mandatory[\\s\\S]{0,500}specific\\s+spec\\s+requirement[\\s\\S]{0,400}Requirement:\\s*<name>", "why": "under tdd=mandatory step (c1) carves out a tests-required finding that cites a specific spec requirement — naming both its `…/spec.md` file and its `Requirement: <name>` pointer — so it is not dropped" },
    { "id": "tdd-vague-still-dropped", "kind": "requires", "pattern": "vague\\s+`?needs\\s+more\\s+tests`?[\\s\\S]{0,240}still\\s+dropped", "why": "a vague `needs more tests` finding carrying no spec-requirement pointer is still dropped under tdd=mandatory, exactly as under advisory" }
  ]
}
```

## Pressure test: the closed-book test-gap under tdd=mandatory

**Situation** — `tdd` resolves to `mandatory` and a review pass returns a finding observing that the
diff implements a stated spec requirement but that no test covers it.

**Pressure** — Step `(c1)`'s tests-required drop would normally discard any finding whose only
remedy is "add a test", so it is tempting to drop this one too and treat the gap as un-actionable
noise.

**Required behavior** — Keep the finding when its text names both the requirement's spec file (a
`…/spec.md` path) and its `Requirement: <name>` pointer; drop it only when it is a vague
`needs more tests` with no such pointer. Under `advisory` the drop is byte-identical to today.

**Failure signature** — A finding citing `…/spec.md`'s `Requirement: <name>` with no covering test
dropped by `(c1)` while `tdd` resolves `mandatory`.
