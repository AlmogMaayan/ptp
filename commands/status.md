---
description: Show OpenSpec state — per-step lifecycle table and next-step recommendation per resolved change
argument-hint: "[change-selector] (optional — id, epic:XXXX, story:NN, or epic:XXXX story:NN; omit for full status)"
---

Show the current OpenSpec state so the user can decide what to do next in the ptp flow. For each resolved change, derive and render a per-step lifecycle status table.

## Inputs

Optional change selector: $ARGUMENTS

Resolve `$ARGUMENTS` as a change selector per the `ptp-change-selector` skill (single id, `epic:XXXX`, `story:NN`, `epic:XXXX story:NN`, `epic:all`, or empty = all active changes). When the selector resolves to more than one change, run the steps below for each change **in story order**, rendering one table per change. One change with thin or missing artifacts must NOT abort the rest of the run.

## Steps

1. **List active changes** (Bash):
   - `npx -y openspec list`
2. **List existing capabilities/specs**:
   - `npx -y openspec list --specs`
3. **For each resolved change**, perform the following derivation steps **in order** — this is read-only and must not edit any file or run `openspec apply` / `openspec archive`.

### Per-change derivation

#### Step A — Resolve the change folder

Check whether `openspec/changes/<id>/` exists. If the folder does not exist, skip derivation and emit a single-row note: "no change folder yet" with a recommendation of `/ptp:brainstorm "<request>"` (or `/ptp:plan-multiple "<request>"` if the request is clearly too large for one change). Then move on to the next change.

#### Step B — Inspect artifacts (read-only)

For the folder `openspec/changes/<id>/`, check for the presence of these files and directories:

| Artifact | How to check |
|---|---|
| `analysis.md` | file present? |
| `brainstorm.md` | file present? |
| `proposal.md` | file present? |
| `design.md` | file present? |
| `tasks.md` | file present? |
| `specs/` | directory present? |

Also read `tasks.md` (if present) and tally (checkbox matching is case-insensitive — count both `- [x]` and `- [X]` as checked):
- **done**: count of `- [x]` / `- [X]` lines
- **open**: count of `- [ ]` lines
- **total**: done + open

If `tasks.md` is absent or has no checkboxes at all, done = 0, open = 0, total = 0.

#### Step C — Run validation

Run `npx -y openspec validate <id> --strict` once per change and record the result as **validate_pass** (true/false). A failure is a derived signal for the plan cell — it does NOT abort the status report.

#### Step D — Derive each step's status cell

Using the artifact presence and validate result from Steps B and C, derive the status for each lifecycle step:

| Step | Derivation | Done condition | Absence / failure renders as |
|---|---|---|---|
| **analysis** | `analysis.md` present? | file present | "not started (optional)" — neutral, never a problem |
| **brainstorm** | `brainstorm.md` present? | file present | "not started" |
| **brainstorm review** | prefer `reviews/brainstorm.json` marker; else inferred | marker present & well-formed | render the marker (`converged` / `cap-reached` + note); else `inferred / not tracked` (see Step D-review below) |
| **plan** | `proposal.md` + `design.md` + `tasks.md` present AND (`specs/` present or no behavior deltas) AND validate_pass | all required artifacts present AND validate passes | "not started" if none present; "incomplete" if partially present or `specs/` missing when required; "invalid" if all artifacts present but validate fails |
| **plan review** | prefer `reviews/plan.json` marker; else inferred | marker present & well-formed | render the marker (`converged` / `cap-reached` + note); else `inferred / not tracked` (see Step D-review below) |
| **apply** | ≥ 1 checkbox checked in `tasks.md` | done ≥ 1 | "not started" |
| **apply completed** | `tasks.md` has ≥ 1 checkbox total AND open == 0 | total ≥ 1 AND open == 0 | "in progress" (done ≥ 1 and open ≥ 1); "not started" (done == 0 — i.e. all boxes unchecked, or no boxes / no `tasks.md` at all); an empty `tasks.md` with zero checkboxes is NOT apply-completed |

##### Step D-review — Derive the two review rows (prefer the marker, else fall back)

The **brainstorm review** and **plan review** rows PREFER a durable review-convergence marker when present and FALL BACK to `0014_01`'s inferred / not-tracked value when it is absent or malformed. The marker is written by the write-capable review loops (`0014_02_review-completion-markers`); this command only **reads** it.

- **brainstorm review row** → read `openspec/changes/<id>/reviews/brainstorm.json`.
- **plan review row** → read `openspec/changes/<id>/reviews/plan.json`.

For each row, apply this decision (identical logic for both rows; the only difference is the expected `kind` — `"brainstorm"` for the brainstorm row, `"plan"` for the plan row):

1. **Marker file absent** → fall back to the inferred / not-tracked value verbatim (Step F note below). No error.
2. **Present but unreadable, OR not valid JSON, OR valid JSON missing the required `terminalState`, OR `terminalState` is a value other than `"converged"` / `"cap-reached"`, OR `kind` is absent, OR `kind` is present but does not match the row being read** (e.g. `reviews/plan.json` whose `kind` is missing or is not `"plan"`) → treat exactly like an absent marker (fall back). **No error.** Requiring `kind` present-and-matching guards against a kind-less, mis-stamped, or wrong-row file rendering an authoritative-but-wrong cell. A well-formed marker therefore requires BOTH a valid `terminalState` AND a `kind` matching the row.
3. **Present and well-formed** (valid JSON, `terminalState` ∈ {`converged`, `cap-reached`}, AND `kind` present and matching the row) → render the marker authoritatively:
   - `converged` → "converged" (reviewed and clean), with a note carrying the reviewer set and iteration count when present, e.g. `converged (superpowers+codex, 2 iters)`.
   - `cap-reached` → a **generic "reviewed but not converged"** state, visibly distinct from `converged`, e.g. `reviewed but not converged (superpowers, 5 iters)`. Render this **cause-agnostically**: do NOT claim the iteration cap was specifically hit, and do NOT assert that findings necessarily remain open — `cap-reached` is written by a capped loop, by a `/ptp:review-fix` pass that left findings unfixed, AND by a `/ptp:review-fix` pass whose post-fix verification stayed unclean even though every finding was applied.
   - **Optional-field tolerance:** if a well-formed marker omits `reviewers` and/or `iterations`, OR carries them with an unexpected type (e.g. `reviewers` not an array of strings, `iterations` not an integer), OR carries a correctly-typed but semantically odd value (e.g. `iterations: 0` or negative, an empty `reviewers: []`, a `reviewers` entry outside `{"superpowers","codex"}`) → still render the `terminalState` authoritatively and simply drop or best-effort-render the unusable part of the note. This is **NOT** a fallback and **NOT** an error — only a missing/invalid `terminalState` or a missing/mismatched `kind` triggers fallback.
   - Optionally surface the `timestamp`.

#### Step E — Compute the recommendation

Compute the next-step recommendation from the per-step signals using this ladder (first matching condition wins):

1. No change folder → `/ptp:brainstorm "<request>"` (or `/ptp:plan-multiple "<request>"` if clearly too big)
2. Validation fails → `/ptp:plan <id>` to fix
3. Change folder exists but is clearly too big (many capabilities, unwieldy `tasks.md`) and apply not started → `/ptp:plan-multiple <id>` to re-cut into independently-shippable slices
4. Plan done AND apply not started (done == 0) → `/ptp:review-plan <id>` (optional artifact-quality gate) then `/ptp:apply <id>`
5. Plan done AND apply in progress (done ≥ 1, open ≥ 1) → `/ptp:apply <id>`
6. Apply completed AND not yet reviewed → `/ptp:review <id>`
7. Reviewed and clean → `/ptp:archive <id>`

#### Step F — Render the per-change table

Emit a section heading identifying the change (e.g. `## Change: <id>`) plus, under a multi-change selector, its story-order position (e.g. `(1 of 3)`).

Then emit a markdown table with three columns — **Step | Status | Signal / Notes** — with exactly these seven rows in lifecycle order:

| Step | Status | Signal / Notes |
|---|---|---|
| analysis | \<derived> | \<artifact or absence note> |
| brainstorm | \<derived> | \<artifact or absence note> |
| brainstorm review | \<derived from `reviews/brainstorm.json` per Step D-review> | marker present → `converged` / `reviewed but not converged` + reviewer/iteration note; marker absent or malformed → `inferred / not tracked` (no durable marker on disk) |
| plan | \<derived> | \<artifact list + validate result> |
| plan review | \<derived from `reviews/plan.json` per Step D-review> | marker present → `converged` / `reviewed but not converged` + reviewer/iteration note; marker absent or malformed → `inferred / not tracked` (no durable marker on disk) |
| apply | \<derived> | \<checkbox tally: N done, M open> |
| apply completed | \<derived> | \<checkbox tally or "no checkboxes"> |

Follow the table with the **recommendation** (as a row at the bottom of the table, or as a line immediately below it), carrying the next ptp command from Step E.

Repeat Steps A–F for every remaining change in story order.

## Hard rules

- This command is **read-only**. Do not edit any file. Do not run `openspec apply` or `openspec archive`. Do not run a branch guard.
- **Review markers are READ-ONLY here.** The command READS `reviews/brainstorm.json` and `reviews/plan.json` to derive the two review rows; it SHALL NOT create, repair, overwrite, or delete a marker, and SHALL NOT run a branch guard. Producing the marker is the job of the write-capable review loops / `/ptp:review-fix`, never of `/ptp:status`.
- Permitted operations only: `npx -y openspec list`, `npx -y openspec list --specs`, `npx -y openspec show <id>` (or direct folder reads if `show` is unsupported), `npx -y openspec validate <id> --strict`, and reads of files under `openspec/changes/<id>/` (including the `reviews/<kind>.json` review markers).
- An absent artifact maps to a "not started" cell for its step — never to an error. For the plan step specifically, follow Step D's finer rule: all plan artifacts absent → "not started", but a partially present set (or `specs/` missing when required) → "incomplete". Missing review markers render as `inferred / not tracked` — never as an error.
- A validate failure is a derived signal for the plan cell only; it does NOT abort the status report.
- One change with thin or missing artifacts does NOT abort the per-change loop — the remaining changes are rendered normally.
