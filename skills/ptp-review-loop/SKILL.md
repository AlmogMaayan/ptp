---
name: ptp-review-loop
description: Shared loop protocol for /ptp:review-loop, /ptp:codex-review-loop, /ptp:review-plan-loop, /ptp:codex-review-plan-loop, the /ptp:review-brainstorm-full brainstorm loop, and /ptp:codex-review-prd-loop. Takes kind∈{code,artifact,brainstorm,prd} and reviewer∈{superpowers,codex} and iterates review→confirm→fix until zero open findings or the configured iteration cap (default 5) is reached. Handles rejection carry-over so rejected findings do not cause infinite loops, and filters manual-check/tests-required suggestions from the convergence count. At its terminal states the loop also writes a small durable per-kind review-convergence marker (for kind∈{brainstorm, artifact} under openspec/changes/<id>/reviews/, for kind=prd the epic-scoped openspec/prds/reviews/<epic>-<slug>.json; kind=code writes none), unless invoked with deferMarker=true by a -full orchestrator.
---

# ptp-review-loop — shared loop protocol

## Purpose

This skill encodes the iteration semantics shared by the five `/ptp:*-loop` commands. Each command supplies two parameters; this skill drives the loop.

```
/ptp:review-loop            → kind=code,       reviewer=superpowers
/ptp:codex-review-loop      → kind=code,       reviewer=codex
/ptp:review-plan-loop       → kind=artifact,   reviewer=superpowers
/ptp:codex-review-plan-loop → kind=artifact,   reviewer=codex
/ptp:codex-review-prd-loop  → kind=prd,        reviewer=codex   (once per resolved epic)
```

The `/ptp:review-brainstorm-full` skill (`ptp-review-brainstorm-full`) also drives this loop with
`kind=brainstorm` in two phases (Phase 1 `reviewer=superpowers`, Phase 2 `reviewer=codex`), so the
`-full` suffix means a dual-reviewer inline-fix loop at every pipeline stage (brainstorm, artifact,
code). The `prd` kind is **epic-scoped**: the caller resolves the selector to epics and drives this loop
**once per epic** over `openspec/prds/<epic>-<slug>.md` (see the epic-scoped input variant below).

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `kind` | `code` \| `artifact` \| `brainstorm` \| `prd` | Supplied by the calling command |
| `reviewer` | `superpowers` \| `codex` | Supplied by the calling command |
| `change-id` | string | A single resolved change id passed through from the calling command (for `kind ∈ {code, artifact, brainstorm}`). The caller resolves any selector (e.g. `epic:XXXX`) via `ptp-change-selector` and iterates this skill once per resolved change — this skill receives and processes exactly one change per invocation. |
| **epic-scoped input variant** (`kind = prd` only) | `epic` + PRD file path | For `kind = prd` the caller passes a resolved **epic** and the **PRD file path** `openspec/prds/<epic>-<slug>.md` (the `<slug>` deriving from the epic's lowest-numbered story per `ptp-prd`, scanning active + archived changes) **in place of** a change folder. The caller resolves any epic selector via the `ptp-prd` projection and iterates this skill once per resolved epic — this skill receives and processes exactly one epic's PRD per invocation. The `<change-id>` used in the `DONE` next-command recommendation is the epic's lowest-numbered story id. |

The calling command is responsible for precondition checks before invoking this skill:

- `reviewer=codex` → caller must verify `codex --version` is on PATH; refuse if missing.
- `kind=code` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing.
- `kind=artifact` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing.
- `kind=brainstorm` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing. The existence of `brainstorm.md` itself is **NOT** an abort precondition — a missing brainstorm is a Phase-1 Critical finding handled inside the review pass (step b), mirroring `ptp-review-brainstorm`.
- `kind=prd` → caller resolves the **epic** and the **PRD file path** `openspec/prds/<epic>-<slug>.md` (via the `ptp-prd` selector→epic projection and `<slug>`-from-lowest-story rule) and passes them in place of a change folder. The existence of the **PRD file** is **NOT** an abort precondition — a missing PRD is a Critical "no PRD to review" finding handled inside the review pass (step b), mirroring `kind=brainstorm`.

## Resolution

Resolve `MAX_ITERATIONS` from layered ptp config **once, at the start of a loop run**, then hold it
fixed for the duration. No mid-loop re-read.

```
maxIterations = 5                                   # default
for path in [ ~/.claude/ptp/config.json,            # global first
              <repo>/.claude/ptp/config.json ]:      # then project (overrides)
    if file exists and parses as JSON
       and obj.review?.maxIterations is a positive integer (>= 1):
        maxIterations = obj.review.maxIterations
# any missing file / missing key / parse error / invalid value → leave the prior value
# (ultimately 5 if nothing valid is found) — never throw, never STOP
```

**Reader posture: never crash, never STOP over a config typo.** A missing file, a missing key,
unparseable JSON, or an invalid value all resolve to `5` (or to whatever the prior layer validly
set). Each layer is evaluated independently: a layer whose file is missing, is unparseable, lacks the
key, or carries an invalid value (a non-integer such as `5.5`, a JSON string such as `"5"`, `0`, a
negative number, a boolean such as `true`, or any wrong type) is ignored, leaving the prior valid
layer in force. The resolved cap falls back to the default `5` only when no layer supplies a valid
value. A valid value is a positive integer (`>= 1`); no upper bound is enforced.

The resolved `maxIterations` becomes `MAX_ITERATIONS` — the constant it is today for that run.

## In-conversation state

All state lives in the current conversation context. **This state is NEVER persisted to disk.** No files are written to track iteration count, rejected findings, or summaries.

| Variable | Initial value | Type |
|----------|--------------|------|
| `iteration` | 0 | integer |
| `MAX_ITERATIONS` | resolved from `review.maxIterations` (layered config) at loop start; default 5; held fixed for the run | integer |
| `rejected_findings` | `[]` | list of stable finding keys (see below) |
| `per_iteration_summary` | `[]` | list of per-iteration result objects |

## Review-convergence marker

At each of its two terminal states the loop writes a small **durable** per-kind review-convergence
marker — the only durable on-disk side effect beyond the artifact edits the loop already makes. This is
distinct from the in-conversation loop control state above, which is NEVER persisted.

**Which kinds write a marker.** `kind ∈ {brainstorm, artifact, prd}` write a marker; **`kind = code`
writes NONE** (the `/ptp:status` table has no code-review column to feed).

**Marker JSON schema** (the exact shape written to the per-kind marker file):

```json
{
  "kind": "brainstorm | plan | prd",
  "terminalState": "converged | cap-reached",
  "reviewers": ["superpowers", "codex"],
  "iterations": 2,
  "timestamp": "2026-06-23T12:34:56Z"
}
```

| Field | Type | Value |
|-------|------|-------|
| `kind` | string | `"brainstorm"`, `"plan"`, or `"prd"` — the `/ptp:status` column this marker feeds (no `/ptp:status` column is required to exist for the `prd` marker to be written). Derived from the loop `kind`: `brainstorm`→`"brainstorm"`, `artifact`→`"plan"`, `prd`→`"prd"`. |
| `terminalState` | string | `"converged"` (loop reached `DONE`) or `"cap-reached"` (loop reached `ITERATION CAP REACHED`). |
| `reviewers` | string[] | The reviewer(s) that actually ran: `["superpowers"]`, `["codex"]`, or `["superpowers","codex"]` (both). A single `ptp-review-loop` invocation runs one reviewer, so a standalone `-loop` run writes a single-element array; the combined set is assembled by the `-full` orchestrator. |
| `iterations` | integer | The iteration count of the last phase that ran (≥ 1). |
| `timestamp` | string | ISO-8601 UTC instant the marker was written. |

**Per-kind file naming** (one file per `/ptp:status` review column):

- loop `kind = brainstorm` → `reviews/brainstorm.json` (status "brainstorm review" column)
- loop `kind = artifact`   → `reviews/plan.json`       (status "plan review" column)
- loop `kind = prd`        → `openspec/prds/reviews/<epic>-<slug>.json` (epic-scoped — see **Location**)
- loop `kind = code`       → **no marker is written**

**Location.** For `kind ∈ {brainstorm, artifact}` the marker lives under
`openspec/changes/<change-id>/reviews/` — a subfolder **sibling to `specs/`**, created on demand
(mkdir-if-absent). It is NOT an OpenSpec artifact folder, so `openspec validate --strict` ignores it and
`openspec archive` carries it along. For `kind = prd` — which is **epic-scoped**, not change-scoped — the
marker lives instead at **`openspec/prds/reviews/<epic>-<slug>.json`** (the `reviews/` subfolder created
on demand under `openspec/prds/`, basename parallel to the PRD file
`openspec/prds/<epic>-<slug>.md`); it lives outside any change folder and is unaffected by archiving an
individual change. The same atomic write-temp-then-rename protocol and `deferMarker` contract below apply
to every kind.

**Last-write-wins overwrite.** Each terminal state overwrites the same per-kind file with the full
current marker object. A re-review replaces the previous marker. There is no append, no history, no
separate expiry/removal mechanism.

**Atomic write-temp-then-rename protocol (every marker writer).** The marker MUST be written atomically:

1. Serialize the full marker object to a **uniquely named temporary file in the SAME `reviews/`
   directory** (e.g. `reviews/<kind>.json.<pid-or-rand>.tmp`).
2. **Only after the complete write succeeds**, replace `reviews/<kind>.json` with the temp file via a
   **replace-if-exists** rename — the destination already existing MUST NOT cause the rename to fail
   (on Windows this is `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` / `ReplaceFile`; on POSIX a plain
   `rename(2)` over the destination).
3. **On any write or replace failure**, clean up the temp file and leave the live `reviews/<kind>.json`
   **untouched**.

This is what makes the guarantee "if a re-review's write fails, the prior marker remains intact" hold: a
partial or failed write never truncates or corrupts the existing marker, because the live file is
replaced in a single step or not at all. **Every** marker writer uses this protocol — the standalone
`-loop` run, the `-full` orchestrator's single combined write, and `/ptp:review-fix` — since the
orchestrator and review-fix write the marker independently of the shared loop's write path.

**`deferMarker` (loop input only).** A loop run may be invoked with a `deferMarker` signal:

- `deferMarker = false` (the **default**, used by a standalone `-loop` run) → the loop writes its
  single-reviewer marker directly at its terminal state.
- `deferMarker = true` (passed by a `-full` orchestrator) → the loop does **all** its normal work and
  produces its normal terminal report but **does NOT write the marker itself**. It instead returns its
  terminal outcome (`terminalState`, `reviewer`, `iterations`) to the orchestrator, which performs
  **exactly one** combined marker write after the whole `-full` run resolves (see
  `ptp-review-brainstorm-full` / `review-plan-full`). This guarantees a `-full` run produces exactly one
  authoritative marker write with **no** provisional per-phase marker that could survive a later failed
  write.

`deferMarker` is a **loop input only**. `/ptp:review-fix` does **not** invoke `ptp-review-loop` at all
(it runs a single confirm→fix→verify pass), so it neither receives nor honors `deferMarker`; it writes
its marker independently per design §4a (and reuses the same schema/location/atomic protocol above).

## Per-iteration steps

Execute the following steps for each iteration:

### (a) Increment and cap check

Increment `iteration`. If `iteration > MAX_ITERATIONS`, **abort** — go to the `ITERATION CAP REACHED` terminal state.

### (b) Review pass

Dispatch to the correct reviewer based on `(kind, reviewer)`:

- `superpowers` / `code` — invoke the `superpowers:requesting-code-review` skill. Load the contract (`proposal.md`, `design.md`, `tasks.md`, `specs/**/spec.md`) and the merge-base diff (`git merge-base HEAD master` → `git diff <base>...HEAD`) and pass them as context.
- `codex` / `code` — run the `codex-review.md` protocol inline: read the contract yourself (you, via Read), capture the merge-base diff (you, via Bash), run `npx -y openspec validate <change-id> --strict` and any relevant tests yourself (you, via Bash), build a single closed-book prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin. Do NOT pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`. Codex runs NO `npx` / network / install commands.
- `superpowers` / `artifact` — run the `review-plan.md` rubric inline: check existence & validation, `proposal.md` completeness, cross-artifact consistency, spec-delta format, `tasks.md` quality, reasoning depth, and `TLDR.md` sanity.
- `codex` / `artifact` — run the `codex-review-plan.md` closed-book protocol inline: read all artifacts yourself (you, via Read), run `npx -y openspec validate <change-id> --strict` yourself (you, via Bash), collect cited source excerpts (you, via Read/Grep), build a single self-contained prompt, and pipe to `codex exec -s read-only` over stdin. Codex runs NO commands.
- `superpowers` / `brainstorm` — run the `ptp-review-brainstorm` rubric inline over the located `brainstorm.md` (existence & non-placeholder; ≥2 real options with the four tradeoff axes plus spec-interaction; recommendation with rationale; assumptions; scope/blast-radius; spec interaction; usable handoff to `/ptp:plan`). A missing `brainstorm.md` is recorded as a Critical "no brainstorm to review" finding inside this pass (the loop cannot fix it). Do NOT re-author the rubric here — it lives in `ptp-review-brainstorm`.
- `codex` / `brainstorm` — run the `codex-review-plan.md` closed-book protocol inline, **retargeted to `brainstorm.md`** and with **NO** `openspec validate` (a brainstorm precedes any proposal/spec, so there is nothing to validate): read `brainstorm.md` and any cited context yourself (you, via Read), build a single self-contained prompt carrying the brainstorm rubric as the audit instructions plus the full brainstorm text and any cited source excerpts, and pipe it to `codex exec -s read-only` over stdin. Codex runs NO commands (no `npx`, no `openspec validate`, no network, no installs). As with the Superpowers variant, a missing `brainstorm.md` is recorded as a Critical "no brainstorm to review" finding inside this pass (the loop cannot fix it) — do not attempt to build a Codex prompt over an absent file.
- `superpowers` / `prd` — run the `ptp-review-prd` rubric inline over the resolved PRD file `openspec/prds/<epic>-<slug>.md` (PRD existence & non-placeholder; all schema sections present; requirements split functional/non-functional and trace to goals; testable acceptance criteria; scope/non-goal consistency; measurable goals; real Dependencies/Risks/Open questions). A missing PRD file is recorded as a Critical "no PRD to review" finding inside this pass (the loop cannot fix it). Do NOT re-author the rubric here — it lives in `ptp-review-prd`. (Used by slice 2's `/ptp:review-prd-full` orchestrator; documented now so the kind is complete.)
- `codex` / `prd` — run the `codex-review-plan.md` closed-book protocol inline, **retargeted to the PRD file `openspec/prds/<epic>-<slug>.md`** and with **NO** `openspec validate` (a PRD precedes any proposal/spec, so there is nothing to validate): read the PRD file and any cited context yourself (you, via Read), build a single self-contained prompt carrying the PRD rubric as the audit instructions plus the full PRD text and any cited source excerpts, and pipe it to `codex exec -s read-only` over stdin. Codex runs NO commands (no `npx`, no `openspec validate`, no network, no installs). As with the Superpowers variant, a missing PRD file is recorded as a Critical "no PRD to review" finding inside this pass (the loop cannot fix it) — surface the missing-PRD note in the prompt in place of the PRD text rather than building a Codex prompt over an absent file.

Collect the full list of findings (severity, location, description, suggested fix) from the review output.

### (c) Filter manual-check / tests-required findings

Before the convergence check, drop any finding whose suggested fix consists **only** of:

- `manually verify`, `needs manual QA`, `manual check required`, `verify by hand`
- `should be covered by a test`, `add a regression test`, `test required`, `needs a test`

A finding that names a concrete code or artifact defect **AND** additionally mentions a missing test stays in scope — the defect half is fixable. Only pure "check this by hand" / "add a test" suggestions with no associated defect pointer are filtered.

Filtered findings do NOT count against convergence and do NOT trigger a fix pass.

### (d) Carry-over rejection check

For each remaining finding, compute its **stable key** (see section below) and check it against `rejected_findings`.

- If it matches an entry in `rejected_findings`, mark it `REJECTED (carry-over)`. Do NOT re-confirm it. It does NOT count against convergence.
- If it does not match, it is a **candidate finding** for confirmation in step (e).

### (e) Confirm remaining findings

Invoke `superpowers:receiving-code-review` and apply its rigor: for every candidate finding, read the actual code or artifact at the cited location and judge whether it is a real defect.

- `CONFIRMED` → this finding will be fixed in step (g).
- `REJECTED` → append its stable key to `rejected_findings`. It does NOT count against convergence.

### (f) Exit check

If there are zero `CONFIRMED` findings this iteration → proceed to the **DONE** terminal state.

### (g) Fix pass

Edit inline for every CONFIRMED finding:

- `kind=code` → edit source files directly. **Never** invoke `/ptp:apply`. **Never** commit.
- `kind=artifact` → make minimal targeted edits to the affected artifact(s). **Never** regenerate artifacts via `/ptp:plan`. Corrections only (fix a wrong section, add a missing scenario, fill a thin block) — not re-fabrication.
- `kind=brainstorm` → make minimal targeted edits to `brainstorm.md`. **Never** regenerate the brainstorm via `/ptp:brainstorm`. Corrections only (add a missing option, expand a thin tradeoff, document a missing assumption) — not re-fabrication. A missing `brainstorm.md` Critical finding has nothing to edit and stays unfixed (the iteration cap is the backstop).
- `kind=prd` → make minimal targeted edits to the PRD file `openspec/prds/<epic>-<slug>.md`. **Never** regenerate the PRD via `/ptp:prd`. Corrections only (fill a missing schema section, sharpen a vague acceptance criterion, add a measurable goal) — not re-fabrication. A missing-PRD Critical finding has nothing to edit and stays unfixed (the iteration cap is the backstop).

### (h) Verify

Run a cheap, fast verification appropriate to `kind`:

- `kind=code` → tests, lint, and typecheck for the files touched this iteration.
- `kind=artifact` → `npx -y openspec validate <change-id> --strict`.
- `kind=brainstorm` → **N/A** — run **NO** `openspec validate` (a brainstorm precedes any proposal/spec, so there is nothing to validate). Record `verify = N/A (brainstorm precedes any spec)` in `per_iteration_summary`.
- `kind=prd` → **N/A** — run **NO** `openspec validate` (a PRD precedes any proposal/spec, so there is nothing to validate). Record `verify = N/A (PRD precedes any spec)` in `per_iteration_summary`.

A failing verification is **reported in `per_iteration_summary`** but does NOT abort the loop — the next review iteration will pick up regressions. The iteration cap is the backstop.

Append a summary entry to `per_iteration_summary`: iteration number, findings-confirmed count, findings-rejected count, carry-over count, fixes applied, verification result.

### (i) Loop

Go back to step (a).

## Stable finding key

Used to match findings across iterations for carry-over rejection deduplication.

**For `kind=code`:**

```
key = {
  normalized_repo_path: path with backslashes normalised to forward slashes,
  line_range_bucket:    round(first_cited_line / 5) * 5,   // tolerates small drift
  severity:             Critical | High | Medium | Low,
  summary:              finding_one_line_description[:60]
}
```

The `line_range_bucket` rounding tolerates the few-line drift that a fix typically introduces in surrounding line numbers.

**For `kind=artifact`:**

```
key = {
  artifact_filename: basename of the artifact file (e.g. "proposal.md", "spec.md"),
  section_heading:   nearest enclosing ## / ### heading text,
  summary:           finding_one_line_description[:60]
}
```

Artifact keys do not use line numbers because section headings renumber after edits.

**For `kind=brainstorm`:** reuse the `kind=artifact` key with `artifact_filename = "brainstorm.md"` (plus the nearest enclosing `section_heading` and the truncated `summary`). Like artifact keys, it uses no line numbers so findings deduplicate across iterations as section headings renumber. The missing-`brainstorm.md` Critical finding has no enclosing heading, so it uses the sentinel `section_heading = "<missing file>"` — `artifact_filename` + this sentinel + its constant `summary` stay stable across iterations, so the unfixable finding deduplicates correctly until the iteration-cap backstop.

**For `kind=prd`:** reuse the `kind=artifact` key with `artifact_filename = <epic>-<slug>.md` (the PRD basename; plus the nearest enclosing `section_heading` and the truncated `summary`). Like artifact keys, it uses no line numbers so findings deduplicate across iterations as section headings renumber. The missing-PRD Critical finding has no enclosing heading, so it uses the sentinel `section_heading = "<missing file>"` — `artifact_filename` + this sentinel + its constant `summary` stay stable across iterations, so the unfixable finding deduplicates correctly until the iteration-cap backstop.

## Terminal states

### DONE

Reached when step (f) finds zero CONFIRMED findings for the current iteration.

Report:

1. **Per-iteration summary table** — one row per iteration: iteration number, confirmed, rejected, carry-over, fixes applied, verification result.
2. **Total findings fixed** across all iterations.
3. **Rejected / carry-over set** — list every stable key that was rejected or carried over, with the rejection reason from step (e) or `(carry-over)`.
4. **Next command**:
   - `kind=code`     → `/ptp:archive <change-id>` (or `/ptp:status` first).
   - `kind=artifact` → `/ptp:apply <change-id>` if not yet implemented; `/ptp:review-plan <change-id>` for a post-apply artifact check. (Recommend these to the user — do not invoke them.)
   - `kind=brainstorm` → `/ptp:plan <change-id>` (the brainstorm is sound; proceed to author the OpenSpec artifacts). (Recommend it to the user — do not invoke it.)
   - `kind=prd` → `/ptp:plan <change-id>` (the PRD is sound; proceed to author the OpenSpec artifacts — `<change-id>` is the epic's lowest-numbered story id). (Recommend it to the user — do not invoke it.)

**Marker write (after the report above).** For `kind ∈ {brainstorm, artifact, prd}`, write the per-kind
marker (`brainstorm`→`reviews/brainstorm.json`, `artifact`→`reviews/plan.json`,
`prd`→`openspec/prds/reviews/<epic>-<slug>.json`) per the **## Review-convergence marker** section, with
`terminalState: "converged"`, `reviewers` = the reviewer(s) that ran this loop run, `iterations` = the
final `iteration` value, and `timestamp` = now (UTC ISO-8601). Use the atomic write-temp-then-rename
protocol. **Skip the write entirely for `kind = code`.** **Skip the write when invoked with
`deferMarker = true`** (a `-full` phase) — instead return the terminal outcome
(`terminalState = converged`, `reviewer`, `iterations`) to the orchestrator, which performs the single
combined write. A marker-write failure is reported but does NOT change the terminal state (the review
already happened).

### ITERATION CAP REACHED

Reached when step (a) increments `iteration` past `MAX_ITERATIONS` (the resolved cap).

Report:

1. **Open findings** — every finding from the last completed review that is still CONFIRMED and unfixed.
2. **Rejected / carry-over set** — same as DONE.
3. **Per-iteration summary table**.
4. Explicit statement: "Do not archive. Do not run `/ptp:apply`. Inspect the open findings manually and decide next steps."

**Marker write (after the report above).** For `kind ∈ {brainstorm, artifact, prd}`, write the per-kind
marker (`brainstorm`→`reviews/brainstorm.json`, `artifact`→`reviews/plan.json`,
`prd`→`openspec/prds/reviews/<epic>-<slug>.json`) per the **## Review-convergence marker** section, with
`terminalState: "cap-reached"` and the same `kind` / `reviewers` (the reviewer that ran) / `iterations`
(the cap value) / `timestamp` (now, UTC ISO-8601) fields. Use the atomic write-temp-then-rename protocol.
**Skip the write entirely for `kind = code`.** **Skip the write when invoked with `deferMarker = true`**
(a `-full` phase) — instead return the terminal outcome (`terminalState = cap-reached`, `reviewer`,
`iterations`) to the orchestrator, which performs the single combined write. A marker-write failure is
reported but does NOT change the terminal state.

## Hard rules

- **Never archive** the change, no matter the outcome.
- **Never invoke `/ptp:apply`** — not in the fix pass, not in the terminal report.
- **Never auto-commit** any edits made during the loop.
- **Never fix an unconfirmed finding.** If step (e) marks a finding `REJECTED`, leave the code/artifact alone.
- **Never persist loop control state to disk.** `iteration`, `rejected_findings`, and `per_iteration_summary` live only in conversation context. This rule does NOT forbid the durable terminal review-convergence marker below — that marker is a deliberate exception and is the loop's only on-disk side effect beyond the artifact edits it already makes.
- **Write the per-kind review-convergence marker on terminal states for `kind ∈ {brainstorm, artifact, prd}` only** (`brainstorm`→`reviews/brainstorm.json`, `artifact`→`reviews/plan.json`, `prd`→the epic-scoped `openspec/prds/reviews/<epic>-<slug>.json`), per the **## Review-convergence marker** section. **Never** write a marker for `kind = code`, and **never** write a marker when invoked with `deferMarker = true` (the `-full` orchestrator performs the single combined write). The marker is written via the atomic write-temp-then-rename protocol; a marker-write failure is reported but does not change the terminal state.
- **Iteration cap is resolved from `review.maxIterations` (layered config, default 5).** There is no `--max-iterations` CLI flag. If the cap is hit, report and stop — do not silently increment past it.
- **Codex variants** (`reviewer=codex`) must run `codex exec -s read-only` with the full prompt piped over stdin (`-`). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- **The caller runs `openspec validate` (for `kind=code` / `kind=artifact` only — never for `kind=brainstorm` or `kind=prd`, which each precede any proposal/spec) and all file reads for Codex** — Codex executes no `npx`, no network, no install commands. The closed-book / inlined-diff protocol from `codex-review.md` / `codex-review-plan.md` applies.
