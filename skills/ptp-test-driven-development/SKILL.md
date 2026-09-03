---
name: ptp-test-driven-development
description: Use before writing implementation code for a new feature, a bug fix, or any behavior change.
---

# ptp-test-driven-development — the red/green/refactor cycle

The shared authoring rules — agent neutrality, the per-skill budget, the finding format, and the
artifact-contract pointer — are owned by `skills/ptp-skill-contract/SKILL.md`. Load it, and any
other file it references for a rule it does not restate, before applying this skill; when this
skill is invoked through the Skill tool, load that reference through the Skill tool too. This file
restates none of it.

## Iron law

No implementation code is ever written before a failing test exists and has been run for it.
Implementation code written before its test is deleted and rewritten from the test, never adapted
into it after the fact.

### 1. RED

Write one test for one behavior, named for the behavior it checks, asserting real behavior rather
than mock interactions.

### 2. Verify the failure

Run it and confirm it fails for the intended reason. A test that errors on a typo, a missing
import, or broken setup has not been verified, and a test that passes immediately is testing
something that already exists.

### 3. GREEN

Write the smallest change that makes the failing test pass. No unrequested options, parameters, or
generality.

### 4. Verify the suite

The new test passes, every other check still passes, and output is clean. A failure here is fixed
in the implementation, never by weakening or rewriting the test to match the code.

### 5. Refactor

Refactor only while green; behavior stays unchanged.

## Scale to behavior and risk

Test depth follows the blast radius of the change; one honest behavior test beats several that
restate the implementation.

## Prose-contract exemption

For a change that alters no executable behavior — documentation-only or a prose contract — satisfy
RED with an executable check over the changed artifact whenever an available check can be made to
fail on the added behavior (`openspec validate --strict`, this repository's fixture runner, a lint
script, or a new assertion added to one of them). A validator that passes both before and after the
edit is not a RED. When no available check can express the missing behavior, record
`RED: not applicable — prose contract`, name the reader the change binds, and still run every
available check over the artifact afterward. Never invent a string-matching test whose only purpose
is to be a test.

The exemption does not apply when the change also touches executable code, nor when an available
check can be made to fail on the behavior being added.

## Evidence

Record the test evidence behind each task in the apply stage record's `tests` array — one entry per
task, in one of two branch shapes: an executed `{ task, test, red, green }` (the `red` string naming
the failing run, the `green` string the passing run) or an exempt `{ task, exempt, reader }` for a
prose-only task under the exemption above. Record the entry even under `advisory`, where the gate is
relaxed but the cycle is not: advisory is not silence. Under `mandatory` a task touching executable
code with neither a `red` nor a valid exempt entry is not checked off and the run blocks.

<!-- budget-exception: the Evidence section adds new normative record-shape content, not duplication, pushing this file just over the 500-word soft budget -->

## Autonomy

When a step is genuinely ambiguous, choose the defensible option, record it, and continue; escalate
only a blocking unknown, as `needs-human-action`. No step waits on a human.

## Red flags

Implementation written first; a test that passed on its first run; "I will add tests after"; "too
simple to test"; a test rewritten to match the code; "just this once".
