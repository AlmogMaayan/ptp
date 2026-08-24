---
name: ptp-systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing a fix.
---

# ptp-systematic-debugging — root-cause the failure before fixing it

The shared authoring rules — agent neutrality, the per-skill budget, the finding format, and the
artifact-contract pointer — are owned by `skills/ptp-skill-contract/SKILL.md`. Load it, and any
other file it references for a rule it does not restate, before applying this skill; when this
skill is invoked through the Skill tool, load that reference through the Skill tool too. This file
restates none of it.

## Iron law

No fix is proposed or applied before the failure has been reproduced and its root cause identified.
A change that makes a symptom disappear without a named cause is not a fix.

### 1. Reproduce

Reproduce the failure with a deterministic trigger; if it is not reproducible, gather data until it
is, rather than guessing.

### 2. Collect evidence

Read the error and stack trace completely, inspect what changed, and instrument the boundaries
between components, recording what enters and leaves each.

### 3. Isolate the failing boundary

Name the single component or call where correct input becomes incorrect output. Everything upstream
is exonerated by evidence, not by assumption.

### 4. Form and test one hypothesis

State the cause and the mechanism. Test one hypothesis at a time with the smallest possible test,
one variable at a time. A disproved hypothesis leads to a new hypothesis, never stack fixes. After
three failed hypotheses, stop and question the design instead of attempting a fourth.

### 5. Fix the root cause

One change at the boundary identified, no bundled cleanup or "while I am here" edits. A
symptom-level mitigation is permitted only when the root cause is external and unreachable, and then
only labelled as a mitigation with the named cause recorded.

### 6. Regression check

Add or extend an automated check that fails on the original defect and passes after the fix,
written through `ptp-test-driven-development`. Re-run the reproduction and the surrounding checks
and record the command and its result.

## Record current state only

The record carries the reproduction, the evidence that located the boundary, the surviving root
cause, the fix, and the regression check. It does not carry an investigation diary: discarded
hypotheses, a chronology of attempts, and "what we first thought" narratives are left out; version
control already holds that history.

## Autonomy

When a step is genuinely ambiguous, choose the defensible option, record it, and continue; escalate
only a blocking unknown, as `needs-human-action`. No step waits on a human.

## Red flags

Proposing a fix before reproducing; "probably X, let me change it"; several changes at once;
skipping the regression check because the fix is obvious; a fix whose only evidence is that the
symptom stopped.
