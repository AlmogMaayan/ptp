---
description: Recommend model and effort level for implementing a change — reads the change artifacts and outputs a model/effort recommendation with reasoning
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

Analyze the change artifacts and recommend the model and effort level to use when running `/ptp:apply`.

## Acknowledge the active main agent

`/ptp:apply` runs the implementation as the **resolved main agent** (`ptp-run-at-model` resolves it via `ptp-agent-roles`). **Resolve the main agent first** — invoke the `ptp-agent-roles` skill (a pure layered-config read of `roles.main`; default `claude`) — then branch this recommendation on the resolved value:

- **`roles.main=claude` (default).** Emit today's recommendation **unchanged**: the haiku/sonnet/opus decision table below, the `xhigh`/`high`/`medium`/`low` effort dial, and the strict `{model}.{effort}` machine format written to `effort.md`. Byte-identical to before this change.
- **`roles.main=codex`.** The Claude model vocabulary does not apply — the main run's model comes from **`codex.model`** and the effort maps to the **Codex reasoning-effort scale** (`minimal`/`low`/`medium`/`high` via `codex.reasoningEffort`, both resolved by `ptp-codex-mode`). Note this in the justification: the runtime reasoning effort comes **solely** from `codex.reasoningEffort` — **never** derived or defaulted from `effort.md` (whose dial includes `xhigh`, which is not on the Codex scale). The `effort.md` effort word (see step 5) may only inform an **optional natural-language prompt hint**, not the `-c model_reasoning_effort` runtime value; and the model source is `codex.model`, not the table below. **Do not invent a second machine format** — keep the `{model}.{effort}` line so the file stays parseable; the complexity scoring and effort word still apply, and the note simply records that model/effort resolve from `codex.*` when Codex is the main agent.

The steps below (complexity scoring, effort dial, the `{model}.{effort}` file format) are written for the default `claude` direction; apply them as-is and add the Codex note above when `roles.main=codex`.

## Inputs

Change id: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

## Branch safety (first step)

This command writes `effort.md`, so before writing it run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change id (→ `ptp/<change-id>`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

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
   | Already has a detailed tasks.md with TDD steps written | Round the EFFORT dial down one step (see the round-down trigger under step 4) |

4. **Produce the recommendation** using this decision table. Model and effort are **two independent dials** — pick each on its own, then combine. The rows below are **non-exhaustive calibration anchors, not an enumeration of the legal pairs**: any `{model}` × `{effort}` combination is a valid recommendation when the two dials independently point there. **When more than one row matches, the row with the more specific condition wins** — the `sonnet | low` and `opus | medium` rows carry a strictly narrower condition than the rows they overlap (they add the `tasks.md`-detail requirement on top of it), so they take precedence over the broader row, not the other way round.

   | Complexity | Recommended model | Effort |
   |------------|-------------------|--------|
   | Trivial (1-file, no logic) | haiku | low |
   | Mechanical work in a sonnet-scope change whose `tasks.md` leaves no design judgment open | sonnet | low |
   | Standard feature, clear scope, <15 tasks | sonnet | medium |
   | Standard feature with fiddly bits, 15–30 tasks | sonnet | high |
   | Broad blast radius / opus-triggering subject *other than* concurrency, invariants, security, auth, or migration, but `tasks.md` leaves no design judgment open | opus | medium |
   | Complex logic / novel pattern / >30 tasks | opus | high |
   | Security / concurrency / migration (any size) | opus | high |
   | Deep / easy-to-get-subtly-wrong (concurrency, invariants, intricate state) | opus | xhigh |

   Valid effort tokens: `low`, `medium`, `high`, `xhigh`. `xhigh` is for work where extra deliberation materially lowers the risk of a wrong implementation — it is independent of the model choice.

   **Round-down trigger (EFFORT dial only).** When `tasks.md` is already written at a level of detail that leaves **no design judgment open** during implementation — each task names the file to touch, the concrete edit to make, and how to verify it, so the implementer is *transcribing* decisions rather than *making* them (the verification half may be discharged per task or by a `## Verification` section that maps back to the same edits and to `proposal.md > Success criteria`; what matters is that nothing is left for the implementer to decide, not that every line carries the word *Verify*) — round the EFFORT dial **one step down** from the anchor row (`xhigh`→`high`, `high`→`medium`, `medium`→`low`) and say so in the justification. **Not applied twice:** the `sonnet | low` and `opus | medium` rows already have this condition built into them, so when the anchor row is one of those two the round-down is already reflected in the row — take the row's effort as written and do not lower it again.

   - **EFFORT dial only.** This never lowers the MODEL dial. Every opus trigger — subtlety, blast radius, security/concurrency/migration, cross-cutting reach — still resolves to opus. A detailed `tasks.md` makes the work *cheaper to reason about per task*; it does not make the work *smaller in reach*. The common landing spot for this repo is therefore `opus.medium`.
   - **One step, never two.** `xhigh` rounds down to `high`, never to `medium`. `low` is the floor.
   - **Precedence over the round-up rule.** When a change straddles two levels *and* this trigger fires, **this trigger wins on the EFFORT dial** and the justification MUST name it. The round-up rule continues to govern the MODEL dial unchanged, and continues to govern the EFFORT dial for straddles that have nothing to do with task detail.
   - **Does not fire when the risk is executional rather than design.** Detail in `tasks.md` removes the risk of *deciding wrongly*; it does not remove the risk of *getting a correctly-decided edit subtly wrong*. Concurrency, invariants, security, auth, and data migration keep their `high` / `xhigh` effort no matter how precisely the tasks are written.

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
