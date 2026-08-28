# Bounded review — the acceptance bar, removal-first fixes, and the size-budget halt

Loaded by `skills/ptp-review-loop/SKILL.md` when dispatching a review pass, rejecting a finding,
carrying out a fix, or applying step (h)'s budget check. It states the detail behind the short rules
in that file and introduces no loop behavior that file does not name.

## Why a bar exists

Review effort scales with the number of claims a document makes. An adversarial reviewer with no
stated acceptance criterion always finds something and has no finite stopping point, so an unbounded
artifact is an unbounded review — and every finding resolved by *adding* text enlarges the surface
the next round reviews. Round count and finding count cannot see that happening; artifact size can.

## The bar (step (b))

*Does the artifact or diff contain a defect that would produce wrong behaviour, wrong data, or a
failed apply?*

Style, thoroughness, and completeness-of-rationale are **not** findings. The sentence is carried into
the reviewer's instructions **verbatim**, the Codex prompt included, alongside whatever rubric the
`(kind, reviewer)` pair dispatches to. It narrows what counts as a finding; it changes no severity
label, no `MIN_SEVERITY` partition, and no stable key.

## Rejecting a finding (step (e))

**Rejection requires verification, not assertion.** A finding is marked `REJECTED` only after the
step states what it checked — the file read, the grep run, the requirement cited — and that stated
check is what the terminal report's rejection reason carries. "Not actionable" with nothing behind it
is not a rejection.

A bar that only filters is half a bar: the same rigor that keeps a style note out of the finding set
keeps a real defect in it.

## Fixing (step (g2))

**Prefer removal.** Where a finding can be resolved by removing or tightening text rather than
adding, resolve it that way. A review pass that grows the artifact is suspect.

**Pay for each addition by deleting.** When a round must add text to fix a defect, delete equivalent
duplicated or pure-rationale text in the same round — a restated test, duplicated mapping prose, an
aside no requirement depends on. A round can be net-negative while fixing several defects, and that
is the target shape rather than an accident.

Neither rule licenses dropping content a defect depends on. Removal that loses a normative fact is a
new defect, not a fix.

## The size measurement and the halt (step (h))

For `kind` ∈ {`artifact`, `brainstorm`, `prd`}, measure after the fix pass and append one
`artifact_sizes` entry for the iteration: the word count of each artifact this `kind` owns, counted
as the compact artifact contract defines a word (`skills/ptp-artifact-contract/SKILL.md`), with the
spec deltas counted as their sum. Then apply, in order:

1. **Any artifact over its keyed budget** — the budgets, their config keys, and their resolution are
   the artifact contract's, restated nowhere here — → halt.
2. **Any artifact strictly larger than in each of the previous two entries** (three consecutive
   growing rounds) → halt.

Either halt **replaces** the next iteration. `kind = code` measures nothing and can never halt this
way: it edits source, not budgeted artifacts.

## `ARTIFACT BUDGET EXCEEDED` — the report and the marker

Report:

1. **Tally table** (`deferMarker=false`), per `references/review-tally-table.md`.
2. **Which condition fired** — over-budget, or three-round growth — naming the artifact.
3. **The `artifact_sizes` series**, one row per iteration, so the growth is visible.
4. **Open findings**, **Rejected / carry-over set**, **Below threshold**, and the **Per-iteration
   summary table**, each exactly as `ITERATION CAP REACHED` renders them.
5. Explicit statement: "Do not archive. Do not run `/ptp:apply`. This change is too large to review
   within budget — split it and re-plan."

**Marker write.** Identical to `ITERATION CAP REACHED`'s, with `terminalState: "cap-reached"` and
`iterations` = the iteration reached. The marker's `terminalState` domain stays the **two** values it
has: this is a non-converged halt and is recorded as one, its distinctness preserved in the report
and in the terminal outcome returned to an orchestrator — the same choice the `-full` mode-skip green
state already makes. Under `deferMarker = true` the write is deferred exactly as at the other
terminal states, and the returned outcome carries `terminalState = budget-exceeded` so the
orchestrator can tell the two halts apart.
