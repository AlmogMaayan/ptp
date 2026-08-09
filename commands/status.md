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

**One clause for archived changes.** When the id came from an **explicit** `<change-id>` and there is no active `openspec/changes/<id>/` folder but there **is** a matching `openspec/changes/archive/*-<id>/` folder, render the table from that archived folder instead of emitting the "no change folder yet" note — every subsequent step reads that folder. This is a **directed per-id lookup only**: the bare-`/ptp:status` active-change enumeration is unchanged and never sweeps archived changes into the report.

**Disclose the archived context; derive nothing differently for it.** Every step below runs exactly as it
does for an active change: Step C still records whatever `npx -y openspec validate <id> --strict` returns,
every status cell is still derived from that same result, and the Step E ladder is untouched. The only
addition is **disclosure in the Signal/Notes cells**, because the OpenSpec CLI resolves only *active*
changes and so cannot resolve an archived id: say that the table was rendered from
`openspec/changes/archive/<YYYY-MM-DD>-<id>/`, that the recorded validate failure is a consequence of the
change being archived rather than a statement about its contents, and that the computed recommendation is
therefore historical for an already-archived change. Nothing here overrides a derived cell or the
recommendation — the notes explain them, they do not replace them.

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
| `stages/` | directory present? |

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
| **brainstorm review** | prefer `stages/brainstorm.json` marker; else inferred | marker present & well-formed | render the marker (`converged` / `cap-reached` + note); else `inferred / not tracked` (see Step D-review below) |
| **plan** | `proposal.md` + `design.md` + `tasks.md` present AND (`specs/` present or no behavior deltas) AND validate_pass | all required artifacts present AND validate passes | "not started" if none present; "incomplete" if partially present or `specs/` missing when required; "invalid" if all artifacts present but validate fails |
| **plan review** | prefer `stages/plan.json` marker; else inferred | marker present & well-formed | render the marker (`converged` / `cap-reached` + note); else `inferred / not tracked` (see Step D-review below) |
| **apply** | ≥ 1 checkbox checked in `tasks.md` | done ≥ 1 | "not started" |
| **apply completed** | `tasks.md` has ≥ 1 checkbox total AND open == 0 | total ≥ 1 AND open == 0 | "in progress" (done ≥ 1 and open ≥ 1); "not started" (done == 0 — i.e. all boxes unchecked, or no boxes / no `tasks.md` at all); an empty `tasks.md` with zero checkboxes is NOT apply-completed |
| **code review** | `stages/code.json` stage record (Step D-stage) | record resolves to `converged` | resolves to `converged` → "converged"; `cap-reached` → a generic "reviewed but not converged"; otherwise **unknown** — "unknown / not tracked", neutral and never an error |
| **archive** | `stages/archive.json` stage record (Step D-stage), read from the active folder and, when absent there, from the archived copy | record resolves to `archived` | resolves to `archived` → "archived", surfacing the timestamp and the specs-synced/skipped fact when present and usable; otherwise **unknown** — "not archived / not tracked", neutral and never an error |

**Apply-row note rule.** The **apply** and **apply completed** cells stay derived **solely from the
checkbox tally** above. When `openspec/changes/<id>/stages/apply.json` resolves to a terminal state under
Step D-stage, it MAY contribute **only** a supplementary note in the Signal/Notes cell — e.g.
`apply record: blocked (8/12 tasks)`. Where the record and the tally disagree, the **tally wins** and the
status cell renders from the tally; the note may say the record disagrees. An absent, malformed, or
kind-mismatched apply record changes nothing about either row and is never an error.

##### Step D-review — Derive the two review rows (prefer the marker, else fall back)

The **brainstorm review** and **plan review** rows PREFER a durable review-convergence marker when present and FALL BACK to `0014_01`'s inferred / not-tracked value when it is absent or malformed. The marker is written by the write-capable review loops (`0014_02_review-completion-markers`); this command only **reads** it.

- **brainstorm review row** → read `openspec/changes/<id>/stages/brainstorm.json`.
- **plan review row** → read `openspec/changes/<id>/stages/plan.json`.

For each row, apply this decision (identical logic for both rows; the only difference is the expected `kind` — `"brainstorm"` for the brainstorm row, `"plan"` for the plan row):

1. **Marker file absent** → fall back to the inferred / not-tracked value verbatim (Step F note below). No error.
2. **Present but unreadable, OR not valid JSON, OR valid JSON missing the required `terminalState`, OR `terminalState` is a value other than `"converged"` / `"cap-reached"`, OR `kind` is absent, OR `kind` is present but does not match the row being read** (e.g. `stages/plan.json` whose `kind` is missing or is not `"plan"`) → treat exactly like an absent marker (fall back). **No error.** Requiring `kind` present-and-matching guards against a kind-less, mis-stamped, or wrong-row file rendering an authoritative-but-wrong cell. A well-formed marker therefore requires BOTH a valid `terminalState` AND a `kind` matching the row.
3. **Present and well-formed** (valid JSON, `terminalState` ∈ {`converged`, `cap-reached`}, AND `kind` present and matching the row) → render the marker authoritatively:
   - `converged` → "converged" (reviewed and clean), with a note carrying the reviewer set and iteration count when present, e.g. `converged (superpowers+codex, 2 iters)`.
   - `cap-reached` → a **generic "reviewed but not converged"** state, visibly distinct from `converged`, e.g. `reviewed but not converged (superpowers, 5 iters)`. Render this **cause-agnostically**: do NOT claim the iteration cap was specifically hit, and do NOT assert that findings necessarily remain open — `cap-reached` is written by a capped loop, by a `/ptp:review-fix` pass that left findings unfixed, AND by a `/ptp:review-fix` pass whose post-fix verification stayed unclean even though every finding was applied.
   - **Optional-field tolerance:** if a well-formed marker omits `reviewers` and/or `iterations`, OR carries them with an unexpected type (e.g. `reviewers` not an array of strings, `iterations` not an integer), OR carries a correctly-typed but semantically odd value (e.g. `iterations: 0` or negative, an empty `reviewers: []`, a `reviewers` entry outside `{"superpowers","codex"}`) → still render the `terminalState` authoritatively and simply drop or best-effort-render the unusable part of the note. This is **NOT** a fallback and **NOT** an error — only a missing/invalid `terminalState` or a missing/mismatched `kind` triggers fallback.
   - Optionally surface the `timestamp`.

##### Step D-stage — The tolerant read for the code-review and archive rows

The **code review** and **archive** rows read stage records through the stage-records **tolerant read**,
and so does the **apply record** consulted for the apply-row note above. Resolving stage kind `K`
(`code`, `archive`, `apply`) for a change yields exactly one of two outcomes:

1. **the recorded `terminalState`** — when `stages/<K>.json` is present, readable, valid JSON, carries a
   `terminalState` inside `K`'s vocabulary (`converged` / `cap-reached` for `code`; `archived` for
   `archive`; `completed` / `blocked` / `failed` for `apply`), and carries a `kind` equal to `K`.
2. **unknown** — the row resolves to **unknown** in every other case: the file is absent, is unreadable, is not valid JSON, lacks
   `terminalState`, carries a `terminalState` outside `K`'s vocabulary, lacks `kind`, or carries a `kind`
   other than `K`.

**Unknown is never an error and never blocks.** It is a rendering value only: the row renders neutrally as
unknown / not tracked, the command does not warn about a missing artifact, does not exit non-zero, and
creates, repairs, overwrites or deletes nothing.

**An unusable optional field never causes unknown.** A record with a valid `kind` and `terminalState` but
a missing, mistyped, or semantically odd **optional** field (`reviewers`, `iterations`, `archivedTo`, a
non-boolean `specsSynced`, an unparseable `timestamp`) still resolves to its terminal state; only the
unusable part is dropped or best-effort-rendered. `timestamp` reads under this same tolerance — it is
surfaced only when present and usable.

**Unrecognized extra files in `stages/` are ignored.** This command enumerates the kinds it reads
(`brainstorm`, `plan`, `code`, `archive`, and `apply` for its note only), never the directory listing, so
a future kind or a leftover temp file is neither rendered nor reported.

**An `apply` record resolving to unknown simply produces no note** — the apply and apply-completed cells
are unaffected, because those rows are derived from the checkbox tally alone (see the apply-row note rule
in Step D).

**Where the archive record lives.** The `archive` record is written **only** into the archived change
folder, so an active folder never contains one. Resolve the archive row by reading
`openspec/changes/<id>/stages/archive.json` and, when that is absent, the archived copy at
`openspec/changes/archive/<YYYY-MM-DD>-<id>/stages/archive.json`. This is a **directed per-id lookup
only**: the bare-`/ptp:status` active-change enumeration is unchanged and never sweeps in archived
changes. Everything here stays read-only.

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

Then emit a markdown table with three columns — **Step | Status | Signal / Notes** — with exactly these nine rows in lifecycle order:

| Step | Status | Signal / Notes |
|---|---|---|
| analysis | \<derived> | \<artifact or absence note> |
| brainstorm | \<derived> | \<artifact or absence note> |
| brainstorm review | \<derived from `stages/brainstorm.json` per Step D-review> | marker present → `converged` / `reviewed but not converged` + reviewer/iteration note; marker absent or malformed → `inferred / not tracked` (no durable marker on disk) |
| plan | \<derived> | \<artifact list + validate result> |
| plan review | \<derived from `stages/plan.json` per Step D-review> | marker present → `converged` / `reviewed but not converged` + reviewer/iteration note; marker absent or malformed → `inferred / not tracked` (no durable marker on disk) |
| apply | \<derived> | \<checkbox tally: N done, M open> |
| apply completed | \<derived> | \<checkbox tally or "no checkboxes"> |
| code review | \<derived from `stages/code.json` per Step D-stage> | record resolves → `converged` / `reviewed but not converged` + reviewer/iteration note when present; unknown → `unknown / not tracked` (never `fingerprint` or `gateState`) |
| archive | \<derived from `stages/archive.json` per Step D-stage> | record resolves → `archived` + timestamp and specs synced/skipped when present; unknown → `not archived / not tracked` |

Follow the table with the **recommendation** (as a row at the bottom of the table, or as a line immediately below it), carrying the next ptp command from Step E.

Repeat Steps A–F for every remaining change in story order.

## Hard rules

- This command is **read-only**. Do not edit any file. Do not run `openspec apply` or `openspec archive`. Do not run a branch guard.
- **Review markers are READ-ONLY here.** The command READS `stages/brainstorm.json` and `stages/plan.json` to derive the two review rows; it SHALL NOT create, repair, overwrite, or delete a marker, and SHALL NOT run a branch guard. Producing the marker is the job of the write-capable review loops / `/ptp:review-fix`, never of `/ptp:status`.
- **Stage records are READ-ONLY here, all six kinds.** Permitted reads include `stages/<kind>.json` — the review markers plus the lifecycle records `stages/apply.json` and `stages/archive.json` (the latter also at `openspec/changes/archive/<YYYY-MM-DD>-<id>/stages/archive.json`). This command creates, repairs, overwrites and deletes **no** stage record; writing one is the job of that kind's writer — the review loops, the apply executor, the archive flow — never of `/ptp:status`.
- **No stage record steers anything.** The Step E recommendation ladder consults **no** stage record, and `/ptp:status` neither renders nor acts on a `code` record's `fingerprint` or `gateState` — the six-condition code-review skip predicate is not a `/ptp:status` concern.
- Permitted operations only: `npx -y openspec list`, `npx -y openspec list --specs`, `npx -y openspec show <id>` (or direct folder reads if `show` is unsupported), `npx -y openspec validate <id> --strict`, and reads of files under `openspec/changes/<id>/` (including the `stages/<kind>.json` stage records).
- An absent artifact maps to a "not started" cell for its step — never to an error. For the plan step specifically, follow Step D's finer rule: all plan artifacts absent → "not started", but a partially present set (or `specs/` missing when required) → "incomplete". Missing review markers render as `inferred / not tracked` — never as an error.
- A validate failure is a derived signal for the plan cell only; it does NOT abort the status report.
- One change with thin or missing artifacts does NOT abort the per-change loop — the remaining changes are rendered normally.
