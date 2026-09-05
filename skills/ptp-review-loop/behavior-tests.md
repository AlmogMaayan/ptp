```json
{
  "skill": "ptp-review-loop",
  "assertions": [
    { "id": "tdd-mandatory-spec-req-carveout", "kind": "requires", "pattern": "tdd[\\s\\S]{0,120}mandatory[\\s\\S]{0,500}specific\\s+spec\\s+requirement[\\s\\S]{0,400}Requirement:\\s*<name>", "why": "under tdd=mandatory step (c1) carves out a tests-required finding that cites a specific spec requirement — naming both its `…/spec.md` file and its `Requirement: <name>` pointer — so it is not dropped" },
    { "id": "tdd-vague-still-dropped", "kind": "requires", "pattern": "vague\\s+`?needs\\s+more\\s+tests`?[\\s\\S]{0,240}still\\s+dropped", "why": "a vague `needs more tests` finding carrying no spec-requirement pointer is still dropped under tdd=mandatory, exactly as under advisory" },
    { "id": "fix-inline-codex-routes-to-main", "kind": "requires", "pattern": "`roles\\.main = codex` the Claude reviewer holding the loop context edits \\*\\*nothing\\*\\*[\\s\\S]{0,120}the fix is performed by the \\*\\*Codex main\\*\\* via the write-capable `codex exec`", "why": "under fixDispatch=inline at roles.main=codex the Claude reviewer edits nothing and the Codex main performs the fix via the write-capable codex exec shell-out" },
    { "id": "fix-inline-claude-byte-identical", "kind": "requires", "pattern": "`roles\\.main = claude` \\(the default\\) it fixes \\*\\*in the running Claude session\\*\\*[\\s\\S]{0,900}\\*\\*byte-identical\\*\\* to the behavior before this change", "why": "under fixDispatch=inline at roles.main=claude the fix is performed in the running Claude session and the direction is byte-identical to the pre-change behavior" }
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

## Pressure test: the inline fix under roles.main=codex

**Situation** — `fixDispatch = inline` (the default) resolves at `roles.main = codex`, and step (g)
has CONFIRMED in-scope findings to fix. The context driving the loop is the Claude **reviewer**.

**Pressure** — `inline` reads as "fix in the running context", and the running context is right here,
so it is tempting to have the Claude reviewer edit the code or artifacts directly — it already holds
the finding set and the files.

**Required behavior** — Under `roles.main = codex` the Claude reviewer edits **nothing**; the fix is
performed by the Codex main via the write-capable `codex exec` (`-s workspace-write`) shell-out — a
Bash shell-out, not an Agent spawn, so `inline`'s non-throwing guarantee still holds. `fixTarget` is
advisory there (model/effort from `codex.model` / `codex.reasoningEffort`) and recorded not fully
honored via the step (h) divergence line. Under `roles.main = claude` the fix is performed in the
running Claude session, byte-identical to the pre-change behavior.

**Failure signature** — The Claude reviewer applies an inline edit while `roles.main = codex`, or the
run spawns an Agent/Workflow instead of using the `codex exec` shell-out, or reports `fixTarget` as
fully honored under `roles.main = codex`.
