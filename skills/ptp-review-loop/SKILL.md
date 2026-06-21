---
name: ptp-review-loop
description: Shared loop protocol for /ptp:review-loop, /ptp:codex-review-loop, /ptp:review-plan-loop, /ptp:codex-review-plan-loop, and the /ptp:review-brainstorm-full brainstorm loop. Takes kind∈{code,artifact,brainstorm} and reviewer∈{superpowers,codex} and iterates review→confirm→fix until zero open findings or the configured iteration cap (default 5) is reached. Handles rejection carry-over so rejected findings do not cause infinite loops, and filters manual-check/tests-required suggestions from the convergence count.
---

# ptp-review-loop — shared loop protocol

## Purpose

This skill encodes the iteration semantics shared by the four `/ptp:*-loop` commands. Each command supplies two parameters; this skill drives the loop.

```
/ptp:review-loop            → kind=code,       reviewer=superpowers
/ptp:codex-review-loop      → kind=code,       reviewer=codex
/ptp:review-plan-loop       → kind=artifact,   reviewer=superpowers
/ptp:codex-review-plan-loop → kind=artifact,   reviewer=codex
```

The `/ptp:review-brainstorm-full` skill (`ptp-review-brainstorm-full`) also drives this loop with
`kind=brainstorm` in two phases (Phase 1 `reviewer=superpowers`, Phase 2 `reviewer=codex`), so the
`-full` suffix means a dual-reviewer inline-fix loop at every pipeline stage (brainstorm, artifact,
code).

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `kind` | `code` \| `artifact` \| `brainstorm` | Supplied by the calling command |
| `reviewer` | `superpowers` \| `codex` | Supplied by the calling command |
| `change-id` | string | A single resolved change id passed through from the calling command. The caller resolves any selector (e.g. `epic:XXXX`) via `ptp-change-selector` and iterates this skill once per resolved change — this skill receives and processes exactly one change per invocation. |

The calling command is responsible for precondition checks before invoking this skill:

- `reviewer=codex` → caller must verify `codex --version` is on PATH; refuse if missing.
- `kind=code` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing.
- `kind=artifact` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing.
- `kind=brainstorm` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing. The existence of `brainstorm.md` itself is **NOT** an abort precondition — a missing brainstorm is a Phase-1 Critical finding handled inside the review pass (step b), mirroring `ptp-review-brainstorm`.

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

### (h) Verify

Run a cheap, fast verification appropriate to `kind`:

- `kind=code` → tests, lint, and typecheck for the files touched this iteration.
- `kind=artifact` → `npx -y openspec validate <change-id> --strict`.
- `kind=brainstorm` → **N/A** — run **NO** `openspec validate` (a brainstorm precedes any proposal/spec, so there is nothing to validate). Record `verify = N/A (brainstorm precedes any spec)` in `per_iteration_summary`.

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

### ITERATION CAP REACHED

Reached when step (a) increments `iteration` past `MAX_ITERATIONS` (the resolved cap).

Report:

1. **Open findings** — every finding from the last completed review that is still CONFIRMED and unfixed.
2. **Rejected / carry-over set** — same as DONE.
3. **Per-iteration summary table**.
4. Explicit statement: "Do not archive. Do not run `/ptp:apply`. Inspect the open findings manually and decide next steps."

## Hard rules

- **Never archive** the change, no matter the outcome.
- **Never invoke `/ptp:apply`** — not in the fix pass, not in the terminal report.
- **Never auto-commit** any edits made during the loop.
- **Never fix an unconfirmed finding.** If step (e) marks a finding `REJECTED`, leave the code/artifact alone.
- **Never persist loop state to disk.** `iteration`, `rejected_findings`, and `per_iteration_summary` live only in conversation context.
- **Iteration cap is resolved from `review.maxIterations` (layered config, default 5).** There is no `--max-iterations` CLI flag. If the cap is hit, report and stop — do not silently increment past it.
- **Codex variants** (`reviewer=codex`) must run `codex exec -s read-only` with the full prompt piped over stdin (`-`). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- **The caller runs `openspec validate` (for `kind=code` / `kind=artifact` only — never for `kind=brainstorm`, which precedes any proposal/spec) and all file reads for Codex** — Codex executes no `npx`, no network, no install commands. The closed-book / inlined-diff protocol from `codex-review.md` / `codex-review-plan.md` applies.
