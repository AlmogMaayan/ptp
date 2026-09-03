```json
{
  "skill": "ptp-test-driven-development",
  "assertions": [
    { "id": "cycle-order", "kind": "ordered", "patterns": ["### 1\\. RED", "### 2\\. Verify the failure", "### 3\\. GREEN", "### 4\\. Verify the suite", "### 5\\. Refactor"], "why": "the five cycle steps appear in order" },
    { "id": "iron-law", "kind": "requires", "pattern": "no\\s+implementation\\s+code\\s+(is\\s+)?(ever\\s+)?written\\s+before\\s+a\\s+failing\\s+test", "why": "the iron law is stated: no implementation code before a failing test" },
    { "id": "delete-rewrite", "kind": "requires", "pattern": "delet(e|ed)\\s+and\\s+rewrit(e|ten)", "why": "code written before its test is deleted and rewritten from the test, not adapted" },
    { "id": "red-one-behavior", "kind": "requires", "pattern": "one\\s+test(\\s+for)?\\s+one\\s+behavior", "why": "RED writes one test for one behavior" },
    { "id": "red-real-behavior", "kind": "requires", "pattern": "real\\s+behavior\\s+rather\\s+than\\s+mock", "why": "RED asserts real behavior rather than mock interactions" },
    { "id": "verify-failure-intended", "kind": "requires", "pattern": "fails\\s+for\\s+the\\s+intended\\s+reason", "why": "the observed failure must be the intended failure" },
    { "id": "verify-failure-typo-trap", "kind": "requires", "pattern": "typo[\\s\\S]{0,40}missing\\s+import[\\s\\S]{0,40}broken\\s+setup", "why": "a test that errors on a typo, missing import, or broken setup has not been verified" },
    { "id": "verify-failure-immediate-pass", "kind": "requires", "pattern": "passes\\s+immediately", "why": "a test that passes immediately is testing something that already exists" },
    { "id": "green-minimal", "kind": "requires", "pattern": "smallest\\s+change\\s+that\\s+makes\\s+(the\\s+failing\\s+test|it)\\s+pass", "why": "GREEN is the smallest change that makes the failing test pass" },
    { "id": "green-no-generality", "kind": "requires", "pattern": "no\\s+unrequested\\s+options,\\s+parameters,\\s+or\\s+generality", "why": "GREEN adds no unrequested options, parameters, or generality" },
    { "id": "verify-suite-clean", "kind": "requires", "pattern": "new\\s+test\\s+passes,\\s+every\\s+other\\s+check\\s+still\\s+passes", "why": "Verify the suite: the new test and every other check pass, output is clean" },
    { "id": "verify-suite-fix-impl", "kind": "requires", "pattern": "fixed\\s+in\\s+the\\s+implementation[\\s\\S]{0,60}never\\s+by\\s+weakening", "why": "a suite failure is fixed in the implementation, never by weakening the test" },
    { "id": "refactor-green-only", "kind": "requires", "pattern": "refactor\\s+only\\s+while\\s+green[\\s\\S]{0,40}behavior(\\s+stays|\\s+remains)?\\s+unchanged", "why": "Refactor happens only while green, with behavior unchanged" },
    { "id": "scale-to-risk", "kind": "requires", "pattern": "test\\s+depth\\s+follows\\s+the\\s+blast\\s+radius", "why": "test depth scales to the behavior and risk of the change" },
    { "id": "prose-exemption", "kind": "requires", "pattern": "RED:\\s+not\\s+applicable\\s+.\\s+prose\\s+contract", "why": "the bounded prose-contract exemption records RED as not applicable, naming the bound reader" },
    { "id": "exemption-bound", "kind": "requires", "pattern": "does\\s+not\\s+apply\\s+when\\s+the\\s+change\\s+also\\s+touches\\s+executable\\s+code", "why": "the exemption never applies when the change also touches executable code" },
    { "id": "autonomy", "kind": "requires", "pattern": "choose\\s+the\\s+defensible\\s+option,\\s+record\\s+it[\\s\\S]{0,40}continue", "why": "ambiguity is resolved autonomously: choose, record, continue" },
    { "id": "no-external-plugin-invocation", "kind": "forbids", "pattern": "superpower[s]:", "why": "delegates no step to an external plugin skill" },
    { "id": "no-human-partner", "kind": "forbids", "pattern": "human partner", "why": "no step gates on an interactive human partner" },
    { "id": "red-green-record-shape", "kind": "requires", "pattern": "\\{\\s*task,\\s*test,\\s*red,\\s*green\\s*\\}[\\s\\S]{0,200}\\{\\s*task,\\s*exempt,\\s*reader\\s*\\}", "why": "the evidence record names both branch shapes: the executed { task, test, red, green } and the exempt { task, exempt, reader }" },
    { "id": "advisory-records-evidence", "kind": "requires", "pattern": "even\\s+under\\s+.?advisory", "why": "evidence is recorded even under advisory, so advisory is not silence" }
  ]
}
```

## Pressure test: the retro-fitted test

**Situation** — Implementation was already written under time pressure, before any test existed for
it.

**Pressure** — Writing the test now would pass on its very first run, so it is tempting to write it
anyway and call the cycle satisfied.

**Required behavior** — Delete or set the implementation aside, write the test first, watch it fail
for the intended reason, then reimplement to make it pass.

**Failure signature** — A test whose first recorded run is a pass.

## Pressure test: the prose-contract loophole

**Situation** — A single change edits both a `SKILL.md` prose file and a `scripts/*.js` file.

**Pressure** — The change is mostly documentation, so it is tempting to claim the prose-contract
exemption for the whole change, including the script.

**Required behavior** — The exemption never applies once the change also touches executable code;
the script change still gets a real failing test first.

**Failure signature** — `RED: not applicable` recorded for a change that also touches executable
code.

## Pressure test: advisory is not silence

**Situation** — `tdd` resolves to `advisory` for the change, so no gate will block a checked task on
missing test evidence.

**Pressure** — Because nothing blocks, it is tempting to run no test and record no evidence at all,
treating `advisory` as permission to skip the cycle.

**Required behavior** — Follow the cycle anyway and record the `tests` evidence in the apply stage
record even under `advisory`; advisory relaxes the gate, not the discipline.

**Failure signature** — A change checked off under `advisory` whose apply record carries no `tests`
entry despite tests having been run.
