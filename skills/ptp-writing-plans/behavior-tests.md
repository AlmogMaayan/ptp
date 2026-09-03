```json
{
  "skill": "ptp-writing-plans",
  "assertions": [
    { "id": "prose-exempt-marker", "kind": "requires", "pattern": "\\[prose-exempt:\\s*[^\\]]+\\]", "why": "a prose-only checkbox carries the literal [prose-exempt: <reader it binds>] marker naming the reader that prose binds" }
  ]
}
```

## Pressure test: the untestable prose edit

**Situation** — A checkbox only edits prose in a `SKILL.md` or a `commands/*.md` file, changing no
executable behavior, so no test file or case can be named for it.

**Pressure** — Because there is nothing to test, it is tempting to end its `verify:` clause with a
bare "run the tests" or to drop the testability shape entirely.

**Required behavior** — A prose-only checkbox carries the literal marker `[prose-exempt: <reader it
binds>]` naming who consumes the prose, and a behavior-changing checkbox instead ends its `verify:`
clause by naming the specific test file and test case it adds or extends.

**Failure signature** — A prose-only checkbox with no `[prose-exempt: …]` marker, or one whose
marker names no reader.
