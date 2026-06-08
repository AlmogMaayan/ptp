---
description: Recommend model and effort level for implementing a change — reads the change artifacts and outputs a model/effort recommendation with reasoning
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

Analyze the change artifacts and recommend the model and effort level to use when running `/ptp:apply`.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This command writes `effort.md`, so before writing it run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is `master`, derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout master → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Read the change artifacts** under `openspec/changes/<change-id>/`:
   - `proposal.md` — goals, risks, impact
   - `design.md` (if present) — decisions and complexity signals
   - `tasks.md` — task count and detail depth
   - `specs/` — count how many spec delta files exist

2. **Count and classify tasks**:
   - Total tasks = all `- [ ]` and `- [x]` lines
   - Remaining tasks = unchecked `- [ ]` lines
   - Note if tasks are fine-grained TDD steps (multiple check/run/expect sub-steps per logical unit = higher effort) vs coarse single-action tasks

3. **Score complexity signals** — for each signal found, note it:

   | Signal | Points toward |
   |--------|---------------|
   | >30 tasks total | High effort |
   | 15–30 tasks | Medium effort |
   | <15 tasks | Low effort |
   | >3 spec delta files | +1 complexity tier |
   | Concurrency / locking / race conditions | Opus |
   | Security / auth / permissions / encryption | Opus |
   | Database migration / schema change | Opus |
   | Novel architecture pattern (not extending existing) | Opus |
   | Cross-app or cross-service coordination | Opus |
   | Multi-locale / bidirectional text logic | +Sonnet |
   | Complex state machine or decision matrix | +Sonnet |
   | Multiple new modules to create from scratch | +Sonnet |
   | Pure UI wiring of existing well-specced helpers | Haiku |
   | Single-file change or rename | Haiku |
   | Already has a detailed tasks.md with TDD steps written | effort can be lower |

4. **Produce the recommendation** using this decision table. Model and effort are **two independent dials** — pick each on its own, then combine.

   | Complexity | Recommended model | Effort |
   |------------|-------------------|--------|
   | Trivial (1-file, no logic) | haiku | low |
   | Standard feature, clear scope, <15 tasks | sonnet | medium |
   | Standard feature with fiddly bits, 15–30 tasks | sonnet | high |
   | Complex logic / novel pattern / >30 tasks | opus | high |
   | Security / concurrency / migration (any size) | opus | high |
   | Deep / easy-to-get-subtly-wrong (concurrency, invariants, intricate state) | opus | xhigh |

   Valid effort tokens: `low`, `medium`, `high`, `xhigh`. `xhigh` is for work where extra deliberation materially lowers the risk of a wrong implementation — it is independent of the model choice.

5. **Output** the canonical two-part block. The **first line** is exactly `{model}.{effort}` — lowercase, dot-joined, **no** prefix, suffix, label, or backticks. The **second line** is empty. The **remaining lines** are a short justification (1–4 sentences) grounded in the shape of `tasks.md`.

   Example output:

   ```
   opus.high

   Cross-cutting change touching four ptp prompt files plus one spec capability, with a strict
   output-format contract that is easy to get subtly wrong. Broad blast radius warrants Opus;
   high effort covers the interacting format and consistency constraints.
   ```

   The on-screen `Recommended: <model> · <effort>` line MAY still be printed for humans, but the **file** uses the strict format above.

6. **Write** the two-part block to `openspec/changes/<change-id>/effort.md` (create or overwrite). The file content is exactly the block produced in step 5 — no extra headers, no surrounding prose.

## Hard rules

- This command writes exactly one file — `openspec/changes/<id>/effort.md`. It reads only the change artifacts (never the source code) to form the recommendation.
- Base the recommendation solely on the artifact content — do not look at the source code.
- If the change folder does not exist, report that and stop.
