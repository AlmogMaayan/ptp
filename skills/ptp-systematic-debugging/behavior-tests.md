```json
{
  "skill": "ptp-systematic-debugging",
  "assertions": [
    { "id": "sequence-order", "kind": "ordered", "patterns": ["### 1\\. Reproduce", "### 2\\. Collect evidence", "### 3\\. Isolate", "### 4\\. Form and test one hypothesis", "### 5\\. Fix the root cause", "### 6\\. Regression check"], "why": "the six sequence steps appear in order" },
    { "id": "iron-law", "kind": "requires", "pattern": "no\\s+fix[\\s\\S]{0,60}before\\s+the\\s+failure\\s+has\\s+been\\s+reproduced\\s+and\\s+its\\s+root\\s+cause\\s+identified", "why": "the iron law is stated: no fix before reproduction and an identified root cause" },
    { "id": "symptom-not-fix", "kind": "requires", "pattern": "symptom\\s+disappear[\\s\\S]{0,40}without\\s+a\\s+named\\s+cause\\s+is\\s+not\\s+a\\s+fix", "why": "a change that makes a symptom disappear without a named cause is not a fix" },
    { "id": "reproduce-deterministic", "kind": "requires", "pattern": "deterministic\\s+trigger", "why": "Reproduce requires a deterministic trigger" },
    { "id": "reproduce-gather-data", "kind": "requires", "pattern": "gather\\s+data[\\s\\S]{0,40}rather\\s+than\\s+guessing", "why": "an unreproducible failure is met with more data collection, not a guessed fix" },
    { "id": "evidence-read-full", "kind": "requires", "pattern": "read\\s+the\\s+error\\s+and\\s+stack\\s+trace[\\s\\S]{0,20}(completely|in\\s+full)", "why": "Collect evidence reads the error and stack trace completely" },
    { "id": "evidence-instrument", "kind": "requires", "pattern": "instrument(ing)?\\s+the\\s+boundaries\\s+between\\s+components", "why": "Collect evidence instruments the boundaries between components" },
    { "id": "isolate-name-boundary", "kind": "requires", "pattern": "name\\s+the\\s+single\\s+component\\s+or\\s+call\\s+where\\s+correct\\s+input\\s+becomes\\s+incorrect\\s+output", "why": "Isolate names the single failing boundary" },
    { "id": "isolate-exonerate-evidence", "kind": "requires", "pattern": "exonerated\\s+by\\s+evidence,?\\s+not\\s+by\\s+assumption", "why": "upstream components are exonerated by evidence, not by assumption" },
    { "id": "hypothesis-one-at-a-time", "kind": "requires", "pattern": "one\\s+hypothesis[\\s\\S]{0,60}smallest\\s+possible[\\s\\S]{0,40}one\\s+variable\\s+at\\s+a\\s+time", "why": "one hypothesis is tested at a time, with the smallest possible test, one variable at a time" },
    { "id": "hypothesis-disproved-never-stack", "kind": "requires", "pattern": "disproved[\\s\\S]{0,60}new\\s+hypothesis[\\s\\S]{0,40}never\\s+stack\\s+fixes", "why": "a disproved hypothesis leads to a new hypothesis, never a stacked fix" },
    { "id": "three-failed-stop", "kind": "requires", "pattern": "after\\s+three\\s+failed\\s+hypotheses[\\s\\S]{0,60}stop\\s+and\\s+question\\s+the\\s+design", "why": "after three failed hypotheses, stop and question the design instead of a fourth fix" },
    { "id": "fix-single-no-bundle", "kind": "requires", "pattern": "one\\s+change\\s+at\\s+the\\s+boundary\\s+identified,?\\s+no\\s+bundled\\s+cleanup", "why": "the fix is a single change at the identified boundary, with no bundled cleanup" },
    { "id": "mitigation-escape", "kind": "requires", "pattern": "root\\s+cause\\s+is\\s+external\\s+and\\s+unreachable[\\s\\S]{0,60}labell?ed\\s+as\\s+a\\s+mitigation", "why": "a symptom-level mitigation is allowed only when the root cause is external and unreachable, and is labelled as such" },
    { "id": "regression-check-fails-then-passes", "kind": "requires", "pattern": "fails\\s+on\\s+the\\s+original\\s+defect\\s+and\\s+passes\\s+after\\s+the\\s+fix", "why": "the regression check fails on the original defect and passes after the fix" },
    { "id": "regression-verify-inline", "kind": "requires", "pattern": "re-run\\s+the\\s+reproduction\\s+and\\s+the\\s+surrounding\\s+checks[\\s\\S]{0,40}record\\s+the\\s+command\\s+and\\s+its\\s+result", "why": "verification is stated inline: re-run and record the command and its result" },
    { "id": "record-current-state", "kind": "requires", "pattern": "record\\s+carries\\s+the\\s+reproduction[\\s\\S]{0,120}the\\s+regression\\s+check", "why": "the durable record carries reproduction, evidence, root cause, fix, and regression check" },
    { "id": "no-diary", "kind": "requires", "pattern": "does\\s+not\\s+carry\\s+an\\s+investigation\\s+diary[\\s\\S]{0,120}chronology\\s+of\\s+attempts", "why": "the record forbids an investigation diary and a chronology of attempts" },
    { "id": "references-tdd", "kind": "requires", "pattern": "ptp-test-driven-development", "why": "the regression check is written through ptp-test-driven-development" },
    { "id": "autonomy", "kind": "requires", "pattern": "choose\\s+the\\s+defensible\\s+option,\\s+record\\s+it[\\s\\S]{0,40}continue", "why": "ambiguity is resolved autonomously: choose, record, continue" },
    { "id": "no-external-plugin-invocation", "kind": "forbids", "pattern": "superpower[s]:", "why": "delegates no step to an external plugin skill" },
    { "id": "no-human-partner", "kind": "forbids", "pattern": "human partner", "why": "no step gates on an interactive human partner" },
    { "id": "no-verification-before-completion", "kind": "forbids", "pattern": "ptp-verification-before-completion", "why": "names no PTP skill that does not yet exist" }
  ]
}
```

## Pressure test: the plausible symptom fix

**Situation** — An intermittent failure is occurring in production, and a retry would visibly
suppress it, with a deadline approaching.

**Pressure** — Shipping a retry now would make the symptom stop and unblock the deadline.

**Required behavior** — Reproduce the failure, isolate the failing boundary, and name the cause; a
retry ships only as a labelled mitigation for a named external cause.

**Failure signature** — A fix landing with no reproduction and no named root cause.

## Pressure test: the investigation diary

**Situation** — A long investigation formed and disproved several hypotheses before finding the
root cause.

**Pressure** — The discarded hypotheses feel valuable, and the agent wants to preserve them as a
narrative in the analysis artifact.

**Required behavior** — Record current state only: the reproduction, the evidence, the surviving
root cause, the fix, and the regression check; discarded hypotheses stay out of the artifact.

**Failure signature** — An artifact containing an attempt chronology or a "we first thought…"
narrative.
