---
description: Recommend the model and effort level for implementing a change, with the reasoning behind it
argument-hint: "<change-selector> — id, epic:XXXX, story:NN, or epic:XXXX story:NN"
---

Analyze the change artifacts and recommend the model and effort level to use when running `/ptp:apply`.

`effort.md` records a complexity recommendation only and never a runtime setting — under
`roles.main=codex` the runtime model comes from `codex.model` and the reasoning effort **solely** from
`codex.reasoningEffort`, both resolved by `ptp-agent-roles`, `ptp-codex-mode` and `ptp-run-at-model`, and
nothing about any of that is persisted in `effort.md`.

## Inputs

Change id: $ARGUMENTS

**Do this first, before anything below:** scan the raw `$ARGUMENTS` for the per-invocation `mode:` token and **strip it**, per the **Mode** paragraph that follows. Every selector instruction in this file — including the next paragraph — operates on the **stripped remainder**, never on the raw `$ARGUMENTS`, so a `mode:` token is never resolved as part of a selector.

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill; if it resolves to more than one change, run the steps below for each, in story order, reporting per change.

**Mode.** This command has two modes: **`apply`** (the default) and **`fix`**, selected by an explicit `mode:` token in the invocation — `mode:fix` selects fix mode, `mode:apply` spells the default. With **no** `mode:` token the command behaves exactly as documented in the sections below. A `mode:` value outside `{apply, fix}` is **reported and treated as `apply`** — it never stops the command, matching the forgiving-reader posture `ptp-codex-mode` and `ptp-agent-roles` use for an out-of-enum config value. The `mode:` token is a **per-invocation token**, not part of the change selector: recognize it and **remove it from `$ARGUMENTS` before** handing the remainder to `ptp-change-selector` (exactly as `rounds:{count}` and `fast:on` are consumed by their own commands), so it is never resolved as part of the selector; after stripping, an **empty** remainder is legal — that is the selector-less programmatic fix invocation, which resolves no change folder. Everything from `## Branch safety` through `## Hard rules` below is the **apply** rubric — including `## Branch safety` itself, step 6's `effort.md` write, and the `## Hard rules` "writes exactly one file" line, all of which are apply-scoped statements; fix mode is defined in the `## Fix mode (mode:fix)` section at the end of this file. The same scoping applies **upward**: this file's opening line and the sentence following it are likewise **apply**-scoped statements, so neither reads as a claim about fix mode, which writes no file and states its own `roles.main=codex` rule in its own section.

## Branch safety (first step)

This command writes `effort.md`, so before writing it run the **`ptp-branch-guard`** preamble: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from the resolved change id (leaf: the change id; shape per `ptp-workspace`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it is a **no-op** — proceed as-is. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Model + effort rubric

1. **Read the change artifacts** under `openspec/changes/<change-id>/`:
   - `proposal.md` — goals, risks, impact
   - `design.md` (if present) — decisions and complexity signals
   - `tasks.md` — task count and detail depth
   - `specs/` — count how many spec delta files exist

2. **Count and classify tasks**:
   - Total tasks = all `- [ ]` and `- [x]` lines
   - Remaining tasks = unchecked `- [ ]` lines
   - Note whether **every** behavior-changing checkbox already names its test file and case (per `tasks-authoring`'s testability shape). When it does, the plan is well-specced enough to round the EFFORT dial down one step; a plan that leaves behavior changes without a named test case does not earn the round-down

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
   | Every behavior-changing checkbox already names its test case | Round the EFFORT dial down one step (see the round-down trigger under step 4) |

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

5. **Output** exactly one line: `{model}.{effort}` — lowercase, dot-joined, **no** prefix, suffix, label,
   or backticks. Persist no justification. The on-screen report is the single line
   `effort: <model>.<effort>`.

6. **Write** that one line, plus a trailing newline, to `openspec/changes/<change-id>/effort.md` (create or
   overwrite). The file contains nothing else — no blank line, no justification, no headers, no prose.

## Hard rules

- This command writes exactly one file — `openspec/changes/<id>/effort.md`. It reads only the change artifacts (never the source code) to form the recommendation.
- Base the recommendation solely on the artifact content — do not look at the source code.
- If the change folder does not exist, report that and stop.

## Fix mode (mode:fix)

The **apply** rubric runs from `## Branch safety` down to (but not including) this section, together with this file's opening line and the sentence following it. The `## Inputs` mode-selection instructions are **not** part of either rubric — they are shared by both modes and are what selects between them, so they apply in fix mode unchanged. This section is the authoritative statement of the **fix** rubric, and it is pointed at — never copied — from `commands/plan.md`; where the two disagree, this file wins.

### Purpose and inputs

Fix mode scores the model and effort for **fixing** a review's findings, which is a different quantity from the effort of building the change. Its inputs are:

1. **A frozen set of confirmed review findings**, supplied by the caller — each carrying, where the source review provided it, a severity, a `file:line` location, a description, and any suggested remedy.
2. **The change artifacts** under `openspec/changes/<id>/`, when a selector resolves — read only to judge which surfaces the fixes land on.

Fix mode **never runs a review, never confirms a finding, and never invents one**. Independent confirmation is the **caller's precondition**; fix mode scores exactly what it is handed and says so in the justification.

**Empty-set outcome.** An absent or empty frozen set produces **no recommendation**. Report it in one line and stop. This is **not an error** — the caller keeps whatever dispatch target it already uses.

### Signal 1 — finding count

Counted **after** confirmation, so rejected findings never inflate the score.

| Confirmed findings | Points toward |
|---|---|
| 1–2 | Low effort |
| 3–8 | Medium effort |
| >8 | High effort |

### Signal 2 — severity mix

The **ceiling** is the *highest* severity present, not the modal one — one `critical` among nine `low`s is an opus signal.

| Condition | Points toward |
|---|---|
| Ceiling severity is `low` (or unlabeled-but-cosmetic) | haiku / sonnet, effort down |
| Ceiling severity is `medium` | sonnet |
| Any `high` finding | opus |
| Any `critical` finding | opus, effort up |
| Three or more findings at the ceiling severity | +1 effort tier |

### Signal 3 — file count and spread

| Condition | Points toward |
|---|---|
| All fixes in one file | Low effort |
| 2–4 files, one surface | Medium effort |
| >4 files, or any cross-surface spread | High effort, +sonnet |
| Fixes spanning command **and** skill **and** spec surfaces | opus |
| A fix that edits a spec delta (re-validation coupling) | +1 file of spread |

*Surface* means the **kind of artifact** touched — `commands/`, `skills/`, spec deltas, `workflows/`, source. **Spread outweighs raw count**: four edits inside one skill are a smaller job than two edits that must stay consistent across a command and its spec.

### Signal 4 — transcription vs open design judgment

Per finding:

- **Transcription** — the review states a concrete remedy at a concrete location, and applying it is mechanical. The fixer *transcribes* a decision.
- **Open judgment** — the review names a problem (a contradiction, a gap, a wrong contract) whose remedy must still be designed. The fixer *makes* the decision.

| Condition | Points toward |
|---|---|
| Every confirmed finding is transcription | Round the EFFORT dial down one step |
| Any finding leaves design open | No round-down |
| Most findings leave design open | +1 model tier |

The test is ***is any decision left open?***, not a keyword test.

### Two dials and the calibration anchors

Model and effort are **two independent dials** — *independent* meaning neither is computed **from** the other, not that each reads a disjoint half of the signals. Each signal has a **primary** dial: the model dial is driven primarily by the severity ceiling (signal 2), spread (signal 3), and open judgment (signal 4's *most findings leave design open ⇒ +1 model tier* row); the effort dial primarily by finding count (signal 1) and the transcription test (the rest of signal 4). Two **cross-contributions** are part of the contract and are not to be pruned into a clean split: **three or more findings at the ceiling severity adds one effort tier**, and **file count and spread point at an effort level as well as at a model**.

| Fix shape | Model | Effort |
|---|---|---|
| 1–2 `low` findings, one file, all transcription | haiku | low |
| A handful of `low`/`medium` findings, one surface, all transcription | sonnet | low |
| 3–8 findings, ceiling `medium`, ≤4 files, some judgment open | sonnet | medium |
| >8 findings, or cross-surface spread with ceiling `medium` | sonnet | high |
| Any `high` finding whose remedy is stated concretely, bounded spread | opus | medium |
| Any `high`/`critical` finding leaving design open, or wide cross-surface spread | opus | high |
| A finding in concurrency, invariants, security, auth, or data migration | opus | high |
| A finding whose fix is easy to get subtly wrong in one of those categories | opus | xhigh |

These rows are a **non-exhaustive anchor set**, not an enumeration of the legal pairs — any `{model}` × `{effort}` combination is valid when the two dials independently point there. **When more than one row matches, the more specific row wins.**

**Order of operations (deterministic, three steps).** The anchor row and the cross-contributions are not two competing answers; they apply in a fixed order, so one frozen set never scores two ways:

1. **Select the anchor row** from the table above (most specific matching row wins). Its `{model}` and `{effort}` are the starting pair.
2. **Apply the cumulative tier adjustment.** There is **exactly one**: `≥3` findings at the ceiling severity adds **one effort tier**. It is applied **once**, never compounded with itself, and **never** moves the model dial. The spread signal is **not** a cumulative adjustment — it is consumed at step 1 as an **anchor-selection input** (the anchor rows already carry bounded / cross-surface spread in their conditions), and its one arithmetic rule — *a spec-delta edit counts as `+1` file of spread* — feeds the file count that step 1 reads. So **no spread result is ever applied twice**.
3. **Apply the round-down last**, subject to all four of its bounds and to the executional-risk carve-out that outranks it.

*Worked example.* Three confirmed `high` findings, each with a concretely stated remedy, bounded spread. Step 1 picks the `opus | medium` row (*any `high` finding whose remedy is stated concretely, bounded spread*). Step 2 fires the `≥3 at the ceiling` adjustment, raising the effort one tier to `opus | high`. Step 3's round-down does **not** fire on top of it: the anchor row already encodes the transcription condition (bound 3 below). The result is `opus.high`, not `opus.medium`.

**Executional risk is not a fifth signal.** The executional-risk test (concurrency, invariants, security, auth, data migration) is a one-directional **safety override** applied at step 3: it can only **hold or raise** the effort dial, **never lower** either dial. It is deliberately **not** one of the four scoring signals, and it is **not** an input to anchor selection or to the tier adjustment.

**Vocabulary pin.** Models are exactly `haiku` / `sonnet` / `opus`; efforts exactly `low` / `medium` / `high` / `xhigh`. Fix mode adds **no** new token, invents **no** second machine format, and defines **no** fix-only scale.

### Round-down trigger (EFFORT dial only) and its carve-out

When **every** confirmed finding in the frozen set is a **transcription**, round the EFFORT dial down **exactly one step** (`xhigh`→`high`, `high`→`medium`, `medium`→`low`) and **name the trigger in the justification**. Four bounds:

1. **EFFORT dial only** — it never lowers the model dial; a severity or spread signal that resolved to `opus` still resolves to `opus`.
2. **One step, never two** — `low` is the floor.
3. **Not applied twice** — the `haiku | low`, `sonnet | low`, and `opus | medium` rows already carry the transcription condition; when one of those is the anchor row, take its effort **as written**.
4. **Executional-risk carve-out** — the trigger does **not** fire when the risk is executional rather than design. A concurrency, invariants, security, auth, or data-migration fix keeps its `high` / `xhigh` effort **however precisely** the remedy is stated. This carve-out **outranks** the round-down.

### Review-kind notes

The four signals are shared across review kinds; the rubric is **not** forked. One note per kind:

- **Code findings** — the files are source files; tests / lint / type-checks are the verification.
- **Artifact findings** — an edit to a spec delta must keep `proposal.md`, `tasks.md`, and the delta mutually consistent and still pass `npx -y openspec validate <id> --strict`; that coupling counts toward **spread**, because a one-line delta edit can force two more edits.
- **Brainstorm findings** — `brainstorm.md` only, no validate step; typically the lowest-spread kind.

### Fallback

If the signals cannot be read — findings carrying neither severity nor location, or a set whose shape is indeterminate — fall back to **`opus.high`** and **name the fallback in the justification**. That is the same default `ptp-run-at-model` and `ptp-full-apply` already apply to a missing or unparseable `effort.md`.

### Output contract

Fix mode emits a **two-part block** to its caller. The **first line** is exactly `{model}.{effort}` —
lowercase, dot-joined, **no** prefix, suffix, label, or backticks. The **second line** is empty. The
**remaining lines** are a 1–4 sentence justification naming the signals that decided each dial. Fix mode
writes no file, so this block is ephemeral and its justification is the caller's only record of the score;
it is deliberately **not** the one-line shape apply mode persists to `effort.md`.

```
opus.medium

Six confirmed findings, ceiling severity high, across two files in one skill — bounded spread, so
the severity ceiling sets the model dial to opus. Every confirmed finding states its remedy at a
concrete location, which makes the `opus | medium` anchor row the match; that row already carries
the transcription condition, so its effort is taken as written rather than rounded down again.
```

Preserving the shape means a consumer hands **line 1** straight to `ptp-run-at-model` as a target — no new parsing, no new token.

### Fix mode writes no file

Fix mode runs **no branch guard**: the `## Branch safety` preamble exists solely to protect the apply mode's `effort.md` write, which fix mode never performs, so fix mode **never stashes, switches, or cuts a branch**.

Fix mode **writes no file**. It never writes, overwrites, creates, or truncates `openspec/changes/<id>/effort.md` — that file stays the **apply** recommendation `/ptp:apply` and `ptp-full-apply` read — and it creates **no durable sibling artifact** (no `effort-fix.md`). The recommendation is ephemeral because its input is: a fix score is valid **only** for the frozen finding set that produced it, and one review loop can produce a different set on each iteration.

### The `roles.main=codex` branch

- The runtime **model** comes from **`codex.model`**; the runtime **reasoning effort** comes **solely** from **`codex.reasoningEffort`**, both resolved by `ptp-codex-mode`.
- A fix recommendation is **never** derived into, defaulted into, or substituted for the `-c model_reasoning_effort` runtime value — the fix effort dial includes `xhigh`, which is **not** on the Codex reasoning-effort scale (`minimal` / `low` / `medium` / `high`).
- The fix recommendation **MAY** inform an **optional natural-language prompt hint** to the Codex run, and nothing more.
- The `{model}.{effort}` line is still emitted in the unchanged **Claude** vocabulary so the block stays parseable; **no second machine format** is invented for the Codex direction.

### Why fix scoring diverges from apply scoring

Stated here, with its counter-examples, so a later editor cannot re-import the apply signals as an apparent simplification.

- **Task count and spec-delta-file count are not inputs to fix scoring.** The apply task-count signal (`>30` / `15–30` / `<15` tasks) and the spec-delta-file-count signal (`>3` files ⇒ `+1` complexity tier) are properties of the change being *built* and have **no defined value** over a finding set. **Counter-example:** a 40-task apply scored `opus.high` can yield three trivial `low` fixes — so the apply score's biggest input is **silent** about the fix job.
- **The fix target is neither floored at nor capped by the apply target.** It is computed **independently** of the change's apply target, and landing **above or below** the apply recommendation on **either** dial is legal. **Counter-example:** a change scored `sonnet.medium` can attract one architectural `high`-severity finding whose remedy is genuine `opus` work — which is why capping is rejected; flooring is rejected by the 40-task / three-typos case above.
- **What *does* transfer is structure, not thresholds:** two independent dials, the same token vocabulary, the non-exhaustive-anchor reading of the table, a one-step round-down on a no-design-judgment-left condition, and the executional-risk carve-out.

### No consumer wiring

This section defines a **contract only** — it wires no consumer of its own, and adding it changed no dispatch target. The consumers are wired by later changes rather than here: `/ptp:review-fix`'s confirm-and-fix dispatch target and the skill-driven review call sites are `0049_02_review-fix-dispatch-target`'s, and `ptp-full-apply`'s per-story review agent (its spawn target plus the fix-target evaluation its review agent performs) is `0049_03_full-apply-review-agent-effort`'s. Where this section and a consumer disagree about how a target is *used*, the consumer's own capability governs; this section governs only how the target is *scored*.
