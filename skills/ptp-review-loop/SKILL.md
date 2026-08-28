---
name: ptp-review-loop
description: Own the shared review loop, its severity threshold, its terminal states, and its stage markers
---

**Owned commands.** This skill is the owning skill of the following commands, whose directories
are not `skills/ptp-<name>/`, so ownership is declared here on the owner's side:

Owns command: /ptp:codex-review-loop
Owns command: /ptp:codex-review-plan-loop
Owns command: /ptp:codex-review-prd-loop
Owns command: /ptp:review-plan-loop

# ptp-review-loop — shared loop protocol

## Purpose

**Model dispatch target.** `/ptp:review-loop`, `/ptp:codex-review-loop`, `/ptp:review-plan-loop`, `/ptp:codex-review-plan-loop` and `/ptp:codex-review-prd-loop` run this skill's work at `opus.high` via `ptp-run-at-model` (`skills/ptp-run-at-model/SKILL.md`), which owns the spawn-and-relay mechanics and requires its caller to supply the target. This names the target only; it restates none of that contract.

This skill encodes the iteration semantics shared by the `/ptp:*-loop` commands **and** the `-full` review orchestrators that drive it (Phase 1/Phase 2 of `/ptp:review-brainstorm-full`, `/ptp:review-prd-full`, etc.). Each caller supplies `kind` + `reviewer`; this skill drives the loop. The `/ptp:*-loop` callers are enumerated below; the `-full` orchestrators additionally drive it, per the note under the table.

```
/ptp:review-loop            → kind=code,       reviewer=ptp
/ptp:codex-review-loop      → kind=code,       reviewer=codex
/ptp:review-plan-loop       → kind=artifact,   reviewer=ptp
/ptp:codex-review-plan-loop → kind=artifact,   reviewer=codex
/ptp:codex-review-prd-loop  → kind=prd,        reviewer=codex   (once per resolved epic)
```

The `/ptp:review-brainstorm-full` skill (`ptp-review-brainstorm-full`) also drives this loop with
`kind=brainstorm` in two phases — **Phase 1 with the main agent, Phase 2 with the reviewer agent**,
resolved from `roles.main` via `ptp-agent-roles` (default `roles.main=claude`: Phase 1
`reviewer=ptp`, Phase 2 `reviewer=codex`) — so the
`-full` suffix means a dual-reviewer inline-fix loop at every pipeline stage (brainstorm, artifact,
code). The `prd` kind is anchored to the epic's **lowest-numbered story change folder**: the caller resolves
the selector to epics and drives this loop **once per epic** over
`openspec/changes/<id>/prd.md` (see the change-folder input variant below).

## Section index

Operation-scoped sections of this contract live in `references/`, each loaded on its own
trigger rather than with this file:

- `skills/ptp-review-loop/references/code-marker-fingerprint.md` — loaded when computing or comparing a code marker fingerprint.
- `skills/ptp-review-loop/references/code-marker-skip-eligibility.md` — loaded when deciding whether an existing code marker permits skipping a review.
- `skills/ptp-review-loop/references/review-tally-table.md` — loaded when printing a tally table.
- `skills/ptp-review-loop/references/review-cycle-tally.md` — loaded when accumulating, finalizing, or returning `reviewTally`.
- `skills/ptp-review-loop/references/bounded-review.md` — loaded when dispatching a review pass, rejecting a finding, carrying out a fix, or applying step (h)'s size-budget check.
- `skills/ptp-review-loop/references/stable-finding-key.md` — loaded when computing or comparing a stable finding key.

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `kind` | `code` \| `artifact` \| `brainstorm` \| `prd` | Supplied by the calling command |
| `reviewer` | `ptp` \| `codex` | Supplied by the calling command. `ptp` names the main phase in either `roles.main` direction; it is a phase, not an agent. |
| `fixDispatch` | `dispatched` \| `inline` | Supplied by the calling command. **Defaults to `inline`** when the caller supplies no value. Only a caller running this loop in the **outer session** with its Agent-nesting level unspent may pass `dispatched`. Its full contract — the two modes, the fail-safe default, and what each mode may and may not do — is under **## Fix dispatch** below. |
| `runningTarget` | a `{model}.{effort}` literal | Supplied by the calling command: the target the caller's own main run is executing at, passed so the fix pass can detect and report a model divergence under `fixDispatch = inline`. Absent or unparseable → record the running model as **unknown** and emit the divergence line naming the evaluated model and `unknown`; never throw, never stop, never report the target as fully honored. It influences reporting only — never which findings are fixed, how they are fixed, the step (f) exit check, or any terminal state. |
| `change-id` | string | A single resolved change id passed through from the calling command (for `kind ∈ {code, artifact, brainstorm}`). The caller resolves any selector (e.g. `epic:XXXX`) via `ptp-change-selector` and iterates this skill once per resolved change — this skill receives and processes exactly one change per invocation. |
| **change-folder input variant** (`kind = prd` only) | `epic` + PRD file path | For `kind = prd` the caller passes a resolved **epic** and the **PRD file path** `openspec/changes/<id>/prd.md` (where `<id>` is the epic's lowest-numbered story, resolved by scanning active + archived changes per `ptp-prd`) **in place of** a brainstorm/artifact change folder. The caller resolves any epic selector via the `ptp-prd` projection and iterates this skill once per resolved epic — this skill receives and processes exactly one epic's PRD per invocation. The `<change-id>` used in the `DONE` next-command recommendation is the epic's lowest-numbered story id. |

The calling command is responsible for precondition checks before invoking this skill:

- `reviewer=codex` → caller must verify `codex --version` is on PATH; refuse if missing.
- `kind=code` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing.
- `kind=artifact` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:plan` if missing.
- `kind=brainstorm` → caller must verify `openspec/changes/<change-id>/` exists; redirect to `/ptp:brainstorm` if missing (the brainstorm stage creates the folder — it precedes `/ptp:plan`, so a `/ptp:plan` redirect here would skip the brainstorm). The existence of `brainstorm.md` itself is **NOT** an abort precondition — a missing brainstorm is a Phase-1 Critical finding handled inside the review pass (step b), mirroring `ptp-review-brainstorm`.
- `kind=prd` → caller resolves the **epic** and the **PRD file path** `openspec/changes/<id>/prd.md` (via the `ptp-prd` selector→epic projection and lowest-story-`<id>` rule, scanning active + archived changes) and passes them in place of a change folder. The existence of the **PRD file** is **NOT** an abort precondition — a missing PRD is a Critical "no PRD to review" finding handled inside the review pass (step b), mirroring `kind=brainstorm`.

## Resolution

Resolve `MAX_ITERATIONS` from layered ptp config **once, at the start of a loop run**, then hold it
fixed for the duration. No mid-loop re-read. The layers, their order, and the per-key merge are owned
by **`ptp-workspace`** (`skills/ptp-workspace/SKILL.md`); this skill restates none of them and states
only the key's own rule.

```
maxIterations = 5                                   # default, applied LAST
maxIterations = the resolved value of `review.maxIterations`,
                valid ⇔ a positive integer (>= 1)
# any missing file / missing key / parse error / invalid value → leave the prior value
# (ultimately 5 if nothing valid is found) — never throw, never STOP
```

**Reader posture: never crash, never STOP over a config typo.** That posture is `ptp-workspace`'s: a
missing file, a missing key, unparseable JSON, or an invalid value all resolve to `5` (or to whatever
an earlier layer validly set). Each layer is evaluated independently: a layer whose file is missing,
is unparseable, lacks the key, or carries an invalid value (a non-integer such as `5.5`, a JSON
string such as `"5"`, `0`, a negative number, a boolean such as `true`, or any wrong type) is
ignored, leaving the prior valid layer in force. The resolved cap falls back to the default `5` only
when no layer supplies a valid value. A valid value is a positive integer (`>= 1`); no upper bound is
enforced.

The resolved `maxIterations` becomes `MAX_ITERATIONS` — the constant it is today for that run.

**`review.minSeverity` — the convergence severity floor.** A sibling parameter, resolved over the
**same layers**, naming the **lowest finding severity that is in scope for handling**:

```
minSeverity = "low"                                  # default, applied LAST
minSeverity = the resolved value of `review.minSeverity`,
              valid ⇔ a string whose lowercased value is exactly one of
              "low" | "medium" | "high" | "critical"; it resolves AS that lowercased value
# any missing file / missing key / parse error / out-of-domain value → leave the prior value
# (ultimately "low" if nothing valid is found) — never throw, never STOP
```

The resolved `minSeverity` becomes `MIN_SEVERITY`, resolved **once at the start of a loop run** and
held fixed for the duration — no mid-loop re-read, exactly like `MAX_ITERATIONS`. Its meaning as a
rank floor is defined under **## Severity threshold** below.

**Case rule: matched case-insensitively, canonicalized to lowercase.** The value is lowercased
before comparison, so `"High"` and `"HIGH"` both resolve to `high`. Case is the **only** leniency:
the lowercased value must equal one of the four literals exactly, so a padded value such as
`" high "` is out of domain and its layer is ignored like any other invalid value — never silently
promoted to a higher (finding-suppressing) threshold. The lowercase canonical form is what the loop
reports and what the marker records — never the raw config text.

**Reader posture, matching `maxIterations`:** each layer is evaluated independently and a layer
whose file is missing, is unparseable, lacks the key, or carries an invalid value (a non-string such
as `2`, `true`, `null`, an array or an object; or an out-of-domain string such as `"none"`, `"all"`,
`"blocker"`, or `""`) is ignored, leaving the prior valid layer (ultimately the `low` default) in
force. Resolution falls back to the default `low` only when no layer supplies a valid value. Never
throw, never STOP over a config typo.

**Parameter ownership.** `review.minSeverity` is **defined** by the `/ptp:config` parameter registry
(`0040_01` — `commands/config.md`, `skills/ptp-config/`), which owns its domain, its default, and
the editor behavior that writes it. This skill is a **consumer**: it resolves and applies the value;
it does not own the parameter.

**Strict/forgiving complementarity:** as with `maxIterations`, the `/ptp:config` editor's writable
set (the four canonical lowercase strings) is a subset of what this resolver accepts — the editor is
**STRICT** (rejects an invalid value and re-prompts, so an invalid value is never written), while
this resolver is **FORGIVING** (ignores an invalid layer and continues rather than stopping).

**Loop-start line (emitted once, before iteration 1).** Immediately after resolution and before the
first iteration, the loop states the effective threshold:

```
Convergence threshold: minSeverity = high (findings below High are reported but do not block convergence).
```

This line is rendered on **every** run, **including** runs at the default `low` — where it names
`low` and notes that every severity is in scope — so a reader always knows which mode the run is in.

## Severity threshold

### Review severity behavior

Severity is ordered:

```
Low  <  Medium  <  High  <  Critical
rank:  1        2         3          4
```

`MIN_SEVERITY` is a **floor**, never an equality test: a finding is **in scope** when
`rank(finding.severity) >= rank(MIN_SEVERITY)`, and **below threshold** otherwise.

| `MIN_SEVERITY` | floor rank | in-scope severities |
|---|---|---|
| `low` (default) | 1 | Low, Medium, High, Critical — everything (the loop's pre-existing behavior) |
| `medium` | 2 | Medium, High, Critical |
| `high` | 3 | High, Critical |
| `critical` | 4 | Critical only |

**Fail-safe: an absent or unrecognized severity is treated as IN SCOPE.** A reviewer that emits no
severity label, or one outside the four (`Blocker`, `Info`, …), yields a finding the loop cannot
rank. Such a finding is handled exactly as it is today — confirmed, fixed if CONFIRMED, and counted
toward convergence — rather than being classified below threshold. The opposite choice would let a
mislabeled Critical vanish, violating the never-silently-drop rule.

**Stable key for an unrankable finding.** Because such a finding is in scope, it reaches step (d)
and needs a stable key. Only the `kind = code` key carries a `severity` field (the `artifact` /
`brainstorm` / `prd` keys do not), so only it needs a rule: record the reviewer's raw label
verbatim when one was emitted (e.g. `Blocker`), and the sentinel `<unlabeled>` when none was. The
four-value schema is unchanged for the labeled findings it already covers; this only names the
value to use in the fail-safe case, so carry-over deduplication works on unrankable findings too
instead of being undefined for them.

## The acceptance bar

Every review pass carries an **acceptance criterion**, never an open-ended adversarial instruction:
*does the artifact or diff contain a defect that would produce wrong behaviour, wrong data, or a
failed apply?* Style, thoroughness, and completeness-of-rationale are **not** findings. Step (b)
carries that sentence into the reviewer's instructions verbatim; step (e) rejects a finding only by
stating what it checked. Detail: `references/bounded-review.md`.

## Fix dispatch

`fixDispatch` decides **how** step (g2) carries out the fix at the `fixTarget` step (g1) evaluated. It
is this loop's resolution of `ptp-run-at-model`'s **Nesting caveat**: **evaluation happens where the
frozen finding set lives; dispatch happens only where an Agent-nesting level is unspent** — and those
two need not be the same party.

| `fixDispatch` | Who may pass it | Step (g2) behavior | Fidelity |
|---|---|---|---|
| `dispatched` | Only a caller that runs this loop — or an equivalent freeze-then-fix pass — **in the outer session**, with its one Agent-nesting level unspent | Invoke `ptp-run-at-model` **once per fix pass** at `fixTarget`, over the frozen CONFIRMED in-scope set, and relay its terminal result into the iteration record | **Full** at `roles.main = claude` — model and effort both honored. **Advisory** at `roles.main = codex` (see below) |
| `inline` (**default**) | Any caller | Fix in the running context, restating `fixTarget`'s effort directive verbatim at the head of the fix pass. **Do not spawn.** | **Partial** — the effort half is honored, the model half cannot be |

**`dispatched`.** Step (g2) invokes `ptp-run-at-model` **once per fix pass** at `fixTarget`, over the
frozen CONFIRMED in-scope finding set, and relays that run's terminal result (`completed` / `refused`
/ `needs-human-action`) into the iteration record — a refusal is **never** downgraded to success.
Both halves of the target are honored in the `roles.main = claude` direction only. Under
`roles.main = codex` the dispatched run is a `codex exec` shell-out whose model and reasoning effort
come **solely** from `codex.model` / `codex.reasoningEffort`, so `fixTarget` is **advisory** there —
evaluated and reported as usual, optionally carried as a natural-language prompt hint, and recorded as
**not fully honored** by the reporting rules in step (h). This is never a licence to introduce a
`codex exec` invocation for the purpose of re-targeting a fix pass in any other direction.

**`inline`.** Step (g2) **never** invokes `ptp-run-at-model`, **never** spawns an Agent, and **never**
launches a Workflow — a second nesting level throws. It fixes in the running context and **restates
`fixTarget`'s effort directive verbatim** — the exact string `ptp-run-at-model`'s *Effort as a prompt
directive* table maps that effort token to — at the head of the fix pass, so the effort half of the
target is honored by the same prompt-directive mechanism the `claude` direction uses. Cross-reference
that table; the directive strings are **not** copied here. The **model** half cannot be honored — a
running agent cannot change its model — and that is surfaced per the divergence rule in step (h)
rather than silently absorbed.

**Why the default is `inline`:** it is the mode that **cannot throw**. A caller that forgets to
declare its budget gets the fail-safe direction rather than a runtime failure at the very moment the
loop has confirmed findings to fix.

**Who passes what today.** All nine loop-driving callers (`/ptp:review-loop`, `/ptp:review-full`,
`/ptp:review-plan-loop`, `/ptp:review-plan-full`, `/ptp:review-brainstorm-full`,
`/ptp:review-prd-full`, `/ptp:codex-review-loop`, `/ptp:codex-review-plan-loop`,
`/ptp:codex-review-prd-loop`) pass `inline`, because each already runs its whole orchestration inside
one `ptp-run-at-model` main run. A `codex-*-loop` caller's Codex reviewer does not change this: its
`codex exec` shell-out belongs to the **review** pass and costs no Agent-nesting level, while its fix
pass is ordinary inline editing by the wrapping agent.

**How a caller derives `runningTarget`** — direction-dependent, and **never** hardcoded. At
`roles.main = claude` the caller's main run is a subagent spawned at the target it supplied, so
`runningTarget` **is** that target (the literal `opus.high` for all nine today, or the resolved value
should a command ever gain a `model:<model>.<effort>` override). At `roles.main = codex` the main run
is a `codex exec` shell-out taking `codex.model` / `codex.reasoningEffort`, so the caller-supplied
`opus.high` has no runtime effect there: `runningTarget` is derived from those two config keys, and is
`unknown` when `codex.model` is unset. Passing `opus.high` in that direction is a **fabrication** — it
would let this loop claim a fully-honored target, or suppress a divergence line, on the strength of a
model that is not running. A caller that *can* determine its running target passes it; the
absent/unparseable `unknown` fallback exists for callers that genuinely cannot, never as a substitute
for wiring the value through.

**`/ptp:review-fix` adopts the `dispatched` semantics directly**, without passing a loop input — it
drives no `ptp-review-loop` invocation, so it has nothing to pass `fixDispatch` to. Its outer session
already freezes the finding set and dispatches one standalone confirm-and-fix run over it; what
changes is only that run's target. It is also the one stated **evaluation** exception: it confirms
findings *inside* the very run whose target is being chosen, so its outer session evaluates over the
frozen **pre-confirmation** set. That is not a licence to move confirmation outward, and not a licence
to fix an unconfirmed finding — the target may simply be scored over a set larger than the one
ultimately fixed, an over-estimate in the safe direction bounded by the same `opus.high` fallback.

**Prohibitions survive dispatch.** A dispatched fix run is bound by every prohibition an inline fix
pass is bound by, and the dispatched run's prompt carries them **explicitly**, because a fresh main
run does not inherit this skill's hard rules by osmosis: never invoke `/ptp:apply`, never regenerate
artifacts via `/ptp:plan` / `/ptp:brainstorm` / `/ptp:prd`, never archive, never commit. Re-targeting
changes *which party performs the edit*, never *what an edit is permitted to be*.

**Verification stays with the loop.** Step (h) runs in this loop's own context after step (g) returns,
in **both** modes. A dispatched run performs edits and reports; it does **not** decide convergence,
does not evaluate the step (f) exit check, does not reach a terminal state, and does not write the
review-convergence marker.

## In-conversation state

All state lives in the current conversation context. **This state is NEVER persisted to disk.** No files are written to track iteration count, rejected findings, or summaries.

| Variable | Initial value | Type |
|----------|--------------|------|
| `iteration` | 0 | integer |
| `MAX_ITERATIONS` | resolved from `review.maxIterations` (layered config) at loop start; default 5; held fixed for the run | integer |
| `MIN_SEVERITY` | resolved from `review.minSeverity` (layered config) at loop start; default `low`; held fixed for the run | string (`low` \| `medium` \| `high` \| `critical`) |
| `rejected_findings` | `[]` | list of stable finding keys (see below) |
| `per_iteration_summary` | `[]` | list of per-iteration result objects |
| `reviewTally` | `{}` | object keyed by reviewer |
| `fixed_candidates` | `[]` | list of stable finding keys (beside `rejected_findings`) |
| `artifact_sizes` | `[]` | one entry per completed iteration: `{ iteration, <artifact>: <words>, … }` (see step (h)) |

## Review cycle tally

`ptp-review-loop` maintains a per-run `reviewTally`, an object keyed by reviewer (`"ptp"` or
`"codex"`), each key holding `cycles` plus seven counters — `found`, `accepted`, `rejected`,
`fixed`, `capped`, `belowThreshold`, `droppedManual` — mapped onto the loop's existing steps and
reconciling as `found = droppedManual + belowThreshold + rejected + accepted`. A standalone run
carries exactly one key; the **key-wise** map shape lets a `-full` orchestrator merge two phase
returns per the combined-aggregate subsection below.
`fixed` and `capped`
are terminal counters, finalized once at the terminal state from the retained `fixed_candidates` set;
the rest accumulate per iteration, at step (h) or at the step (f) converging-exit.

`reviewTally` and `fixed_candidates` are **in-conversation state** (see the table below) and are
covered unchanged by the never-persist rule; the tally reaches disk only as the marker's optional
`reviewTally` field (see `## Review-convergence marker`), added by that marker's existing single write.
The terminal outcome returns `reviewTally` at both `DONE` and `ITERATION CAP REACHED`, for all four
loop kinds, in both `deferMarker` modes — purely additive, no marker version bump. It **decides
nothing** (see `## Hard rules`) and is the **primary source of truth** for review-cycle counts
(`ptp-telemetry` is off by default and is not a dependency).

Full accumulation mechanics — the cycle definition, the seven-counter disposition table, the `fixed`
lifecycle, and the return contract's exact scoping — live in
`skills/ptp-review-loop/references/review-cycle-tally.md`, loaded when accumulating, finalizing, or
returning the tally.

## Review-convergence marker

At each of its two terminal states the loop writes a small **durable** per-kind review-convergence
marker — the only durable on-disk side effect beyond the artifact edits the loop already makes. This is
distinct from the in-conversation loop control state above, which is NEVER persisted.

**Stage-record family.** The four review kinds this skill writes (`brainstorm`, `plan`, `prd`, `code`)
are the **review** members of a six-kind **stage-record family**. The other two are the *lifecycle* kinds
`apply` (`stages/apply.json`, written by the apply executor) and `archive` (`stages/archive.json`, written
by the archive flow after a successful archive). The family's full contract — the folder, the record
shape, the per-kind `terminalState` vocabularies, the tolerant read (an absent, unreadable, malformed, or
kind-mismatched record resolves to **unknown**, never an error and never a block), and the non-deciding
rule — lives in the `stage-records` capability, which remains deliberately silent about *this* skill's
review behavior: review convergence, review eligibility, the marker fields below, and the `deferMarker`
contract are all unchanged by that membership, and this skill stays authoritative for the review kinds.

Every lifecycle stage record is **non-deciding**: no lifecycle stage record is an input to the code-review
skip predicate — that decision is made over `stages/code.json` alone — and no kind other than `code`
carries a `fingerprint` or a `gateState` field. Neither `stages/apply.json` nor `stages/archive.json` may
authorize, block, shorten, or otherwise steer any review step.

**Which kinds write a marker.** **Every** kind writes one — `brainstorm`, `artifact`, `prd`, and
`code`. A marker is written whether or not any `/ptp:status` column reads it: **this** capability adds no
`/ptp:status` column for the `code` marker (the `status` capability owns which rows the table has, and
renders the `code` record in its own **code review** row), and the marker is written so that the *fact* of
a code review's convergence is discoverable after the session that produced it has ended — independently
of any rendering.

**Marker JSON schema** (the exact shape written to the per-kind marker file):

```json
{
  "kind": "brainstorm | plan | prd | code",
  "terminalState": "converged | cap-reached",
  "gateState": "LOOP_DONE",
  "reviewers": ["ptp", "codex"],
  "iterations": 2,
  "minSeverity": "high",
  "timestamp": "2026-06-23T12:34:56Z",
  "reviewTally": {
    "ptp":   { "cycles": 2, "found": 7, "accepted": 5, "rejected": 1, "belowThreshold": 1, "droppedManual": 0, "fixed": 5, "capped": 0 },
    "codex": { "cycles": 1, "found": 2, "accepted": 2, "rejected": 0, "belowThreshold": 0, "droppedManual": 0, "fixed": 2, "capped": 0 }
  },
  "fingerprint": {
    "version": 1,
    "algorithm": "sha256",
    "value": "9f2c…",
    "inputs": {
      "baseBranch": "master",
      "mergeBase": "4fb402e…",
      "trackedDigest": "1a7b…",
      "untrackedDigest": "c033…",
      "contractDigest": "77de…"
    }
  }
}
```

`gateState` and `fingerprint` are **code-only**: they are written to `stages/code.json` for
`kind = code` and for no other kind. A `brainstorm` / `plan` / `prd` marker carries neither field, and
its shape is exactly what it is today.

| Field | Type | Value |
|-------|------|-------|
| `kind` | string | `"brainstorm"`, `"plan"`, `"prd"`, or `"code"` — the review kind this marker records, and (for `brainstorm` / `plan` / `code`) the `/ptp:status` row it feeds. No `/ptp:status` column is required to exist for a marker to be written — the `prd` marker feeds none — and a row that does read a marker applies its own kind-must-match rule, so a marker of the wrong kind is never rendered. Derived from the loop `kind`: `brainstorm`→`"brainstorm"`, `artifact`→`"plan"`, `prd`→`"prd"`, `code`→`"code"`. |
| `terminalState` | string | `"converged"` (loop reached `DONE`) or `"cap-reached"` (loop reached `ITERATION CAP REACHED`). This two-value domain is **unchanged** by the `code` kind — in particular the `-full` mode-skip green state (Phase 1 done, Codex skipped by `codex.mode`) is recorded as `"converged"`, its distinctness preserved by `gateState` rather than by a third `terminalState` value. |
| `gateState` | string | **`kind = code` only.** The terminal vocabulary of the run that produced the marker: `"BOTH_PHASES_DONE"`, `"PHASE1_DONE_CODEX_SKIPPED"`, `"PHASE1_CAP"`, or `"PHASE2_CAP"` for a two-phase `-full` run; `"LOOP_DONE"` or `"LOOP_CAP"` for a standalone single-reviewer `kind = code` loop run. Sourced from the run's **own** terminal outcome. It exists so a mode-skipped run is never flattened into a plain both-phases run by a later reader; it is reported, never used to decide skip eligibility. |
| `fingerprint` | object | **`kind = code` only.** A content fingerprint of what the review evaluated — see `skills/ptp-review-loop/references/code-marker-fingerprint.md`. **Absent** when it could not be computed; there is no partial fingerprint. |
| `reviewers` | string[] | The phase(s) that actually ran: `["ptp"]`, `["codex"]`, or `["ptp","codex"]` (both). A single `ptp-review-loop` invocation runs one reviewer, so a standalone `-loop` run writes a single-element array; the combined set is assembled by the `-full` orchestrator. For a `kind = code` marker this field is **load-bearing**: it is what **condition 6** of `skills/ptp-review-loop/references/code-marker-skip-eligibility.md` tests against the reviewer set a review invoked at check time would run. |
| **Legacy identity** | — | Every reader accepts the legacy literal `"superpowers"` as naming the same identity as `"ptp"` (the `superpowers-migration` capability owns the alias), so a pre-migration marker whose `reviewers` is `["superpowers","codex"]` satisfies **condition 6** exactly as `["ptp","codex"]` does. Writers emit `"ptp"` only; no stored record is ever rewritten. |
| `iterations` | integer | The iteration count of the last phase that ran (≥ 1). |
| `minSeverity` | string | The **effective resolved** severity threshold of the run that produced this marker: `"low"`, `"medium"`, `"high"`, or `"critical"` — always the lowercase canonical form, never the raw config text. Under a `-full` orchestrator's single combined write this is the threshold used by the **last phase that ran**, the same rule already applied to `iterations`. |
| `timestamp` | string | ISO-8601 UTC instant the marker was written. |
| `reviewTally` | object | **Optional; all four kinds** — unlike `gateState`/`fingerprint`, not code-only; no lifecycle record carries it. Keyed by reviewer (`ptp`\|`codex`), one key per phase that ran (key set = `reviewers`); each value is `cycles` plus the seven counters of **## Review cycle tally**, persisted verbatim, non-negative integers, `capped` a count not a boolean. Purely additive — absent means **unknown**, never a fabricated zero; no migration, no version bump, and no rewrite or backfill of a stored record. Full field-shape rationale: `skills/ptp-review-loop/references/review-cycle-tally.md`. |

**`minSeverity` is purely additive — absent means `low`.** Markers written before this field existed
carry no `minSeverity`; **any** reader that consumes the field reads an absent value as `"low"`. No
migration, no rewrite, no marker version bump. No reader is *required* to start consuming it: the
sole marker reader today — the `/ptp:status` review columns — keys only on `kind` / `terminalState` /
`reviewers` / `iterations`, and its existing optional-field tolerance already ignores fields it does
not key on, so old and new markers both render exactly as they do today.

**Per-kind file naming** (one file per review kind):

- loop `kind = brainstorm` → `stages/brainstorm.json` (status "brainstorm review" column)
- loop `kind = artifact`   → `stages/plan.json`       (status "plan review" column)
- loop `kind = prd`        → `stages/prd.json`        (sibling of `stages/brainstorm.json` and `stages/plan.json`)
- loop `kind = code`       → `stages/code.json`       (sibling of the three above; the `status` capability's **code review** row reads it, and this capability requires no such row for the marker to be written)

**Location.** For every kind the marker lives under
`openspec/changes/<change-id>/stages/` — a subfolder **sibling to `specs/`**, created on demand
(mkdir-if-absent). For `kind = prd`, `<change-id>` is the epic's lowest-numbered story id (resolved by
the active-or-archived scan, matching the PRD file at `openspec/changes/<id>/prd.md`). The marker is NOT
an OpenSpec artifact folder entry, so `openspec validate --strict` ignores it and `openspec archive`
carries it along with the change. The same atomic write-temp-then-rename protocol and `deferMarker`
contract below apply to every kind.

**Last-write-wins overwrite.** Each terminal state overwrites the same per-kind file with the full
current marker object. A re-review replaces the previous marker. There is no append, no history, no
separate expiry/removal mechanism.

**Atomic write-temp-then-rename protocol (every marker writer).** The marker MUST be written atomically:

1. Serialize the full marker object to a **uniquely named temporary file in the SAME `stages/`
   directory** (e.g. `stages/<kind>.json.<pid-or-rand>.tmp`).
2. **Only after the complete write succeeds**, replace `stages/<kind>.json` with the temp file via a
   **replace-if-exists** rename — the destination already existing MUST NOT cause the rename to fail
   (on Windows this is `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` / `ReplaceFile`; on POSIX a plain
   `rename(2)` over the destination).
3. **On any write or replace failure**, clean up the temp file and leave the live `stages/<kind>.json`
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
  terminal outcome (`terminalState`, `reviewer`, `iterations`, `minSeverity`, `reviewTally`) to the
  orchestrator, which performs
  **exactly one** combined marker write after the whole `-full` run resolves (see
  `ptp-review-brainstorm-full` / `review-plan-full`). The combined write records the **last phase
  that ran**'s `minSeverity`, the same rule already applied to `iterations`; in the normal case both
  phases resolve the same value and the rule is a no-op, and each phase's own report names the
  threshold it used. `reviewTally` is combined the **opposite** way — see
  the combined-aggregate subsection below. This guarantees a `-full` run produces exactly one
  authoritative marker write with **no** provisional per-phase marker that could survive a later failed
  write.

`deferMarker` is a **loop input only**. `/ptp:review-fix` does **not** invoke `ptp-review-loop` at all
(it runs a single confirm→fix→verify pass), so it neither receives nor honors `deferMarker`; it writes
its marker independently (reusing the same schema/location/atomic protocol described above). The
`ptp-review` workflow agent (`agents/ptp-review.md`) reaches the same end state — no per-phase marker,
exactly one combined write at its terminal point — **by construction rather than by signal**: it inlines
its two phase loops instead of invoking this skill, so it takes no `deferMarker` input and none is
required of it.

### Combined review tally

The **one** statement of how a dual-reviewer orchestrator — including the inlining
`agents/ptp-review.md` — merges its two phase returns into one reviewer-keyed aggregate. Those
surfaces cite this and restate none of it.

A phase that ran contributes its returned `reviewTally` **verbatim** under its reviewer key (`ptp` or
`codex`); the orchestrator re-derives, clamps and zeroes nothing, so `capped` comes from the phase
that capped. A phase that did **not** run contributes **no entry** and renders as the shared format's
**skip row**. A phase that ran whose tally is absent or unparseable renders `unknown`, never `0`.
Neither case aborts the run or changes its terminal state. Rendering belongs to
`skills/ptp-review-loop/references/review-tally-table.md`.

**`reviewTally`: omit, never fabricate; non-deciding.** A writer that cannot produce a tally omits it
**entirely** (exactly as with `fingerprint`), noting `Review tally omitted from the stage marker
(could not be produced).` beside its marker-write-failure line — reported, not fatal, changes no
terminal state. It is not a `skip-eligibility` condition and steers no gate. Every other marker writer
references this rule rather than restating it. Full detail:
`skills/ptp-review-loop/references/review-cycle-tally.md`.

## Per-iteration steps

Execute the following steps for each iteration:

### (a) Increment and cap check

Increment `iteration`. If `iteration > MAX_ITERATIONS`, **abort** — go to the `ITERATION CAP REACHED` terminal state.

### (b) Review pass

Dispatch to the correct reviewer based on `(kind, reviewer)`. Every `codex exec` invocation below is
assembled per the `ptp-codex-mode` canonical flag-append rule (append resolved `-m <model>` /
`-c model_reasoning_effort=<effort>` before the trailing `-` when `codex.model` /
`codex.reasoningEffort` are set; both unset ⇒ the literal `codex exec -s read-only -` shown here):

- `ptp` / `code` — invoke the `ptp-requesting-code-review` skill. Load the contract (`proposal.md`, `design.md`, `tasks.md`, `specs/**/spec.md`) and the merge-base diff (`git merge-base HEAD master` → `git diff <base>...HEAD`) and pass them as context.
- `codex` / `code` — run the `codex-review.md` protocol inline: read the contract yourself (you, via Read), capture the merge-base diff (you, via Bash), run `npx -y openspec validate <change-id> --strict` and any relevant tests yourself (you, via Bash), build a single closed-book prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin.
  - **First-iteration payload (kind `code`).** Inline exactly the required set: the contract artifacts (`proposal.md`, `design.md` when present, `tasks.md`, `specs/**/spec.md`), the merge-base diff, the `openspec validate --strict` result, the test results, and the cited source excerpts.
- `ptp` / `artifact` — run the artifact rubric authored in `commands/review-plan.md` inline, referencing it rather than re-authoring it: the exhaustive eight-condition block-list (validation fails; scope/capability mapping missing or contradictory; a normative requirement with no scenario; a requirement with no implementing task; a task that is not agent-executable or automatically verifiable — which carries the banned-manual-task check; a missing non-obvious decision or invariant; two artifacts disagreeing; one artifact carrying current and obsolete truth) plus the closed must-not-require list. Run it in that file's order: `npx -y openspec validate <change-id> --strict` first, then the deterministic compactness lint (unavailable lint = non-blocking note), then exactly one model review pass emitting all of the iteration's findings at once.
- `codex` / `artifact` — run the `codex-review-plan.md` closed-book protocol inline over the same `commands/review-plan.md` rubric: read the review inputs yourself (you, via Read), run `npx -y openspec validate <change-id> --strict` yourself (you, via Bash), run the compactness lint yourself (you, via Bash) and inline its report as authoritative text, collect cited source excerpts (you, via Read/Grep), build a single self-contained prompt carrying the block-list, the must-not-require list, and the banned-manual-task check, and pipe to `codex exec -s read-only` over stdin.
  - **First-iteration payload (kind `artifact`).** Inline exactly the required set: `proposal.md`, `design.md` when present, `tasks.md`, `specs/**/spec.md`, the authoritative `openspec validate --strict` result, and the cited source excerpts.
  - **Disputed-decision carve-out (kind `artifact` only).** `brainstorm.md` is not part of the fixed required set, but when this iteration carries an open finding disputing where a decision came from, inline it for **that iteration only** — it is then part of the kind's **effective** required set, so carrying it is required rather than prohibited (per `commands/codex-review-plan.md`). Once that finding is fixed or rejected, the next iteration's prompt carries the fixed required set alone again.
- `ptp` / `brainstorm` — run the `ptp-review-brainstorm` rubric inline over the located `brainstorm.md`: a semantic-sufficiency check (existence & non-placeholder; a stated decision; every materially available alternative named with the reason it was not taken; recorded assumptions; internal consistency with no coexisting current and obsolete truth; a usable handoff to `/ptp:plan`) with no fixed option count and no fixed set of tradeoff axes. A missing `brainstorm.md` is recorded as a Critical "no brainstorm to review" finding inside this pass (the loop cannot fix it). Do NOT re-author the rubric here — it lives in `ptp-review-brainstorm`.
- `codex` / `brainstorm` — run the `codex-review-plan.md` closed-book protocol inline, **retargeted to `brainstorm.md`** and with **NO** `openspec validate` (a brainstorm precedes any proposal/spec, so there is nothing to validate): read `brainstorm.md` and any cited context yourself (you, via Read), build a single self-contained prompt carrying the brainstorm rubric as the audit instructions plus the full brainstorm text and any cited source excerpts, and pipe it to `codex exec -s read-only` over stdin. As with the `ptp` variant, a missing `brainstorm.md` is recorded as a Critical "no brainstorm to review" finding inside this pass (the loop cannot fix it) — do not attempt to build a Codex prompt over an absent file.
  - **First-iteration payload (kind `brainstorm`).** Inline exactly the required set: `brainstorm.md` and the cited source excerpts, and no `openspec validate` result.
- `ptp` / `prd` — run the `ptp-review-prd` rubric inline over the resolved PRD file `openspec/changes/<id>/prd.md` (PRD existence & non-placeholder; all schema sections present; requirements split functional/non-functional and trace to goals; testable acceptance criteria; scope/non-goal consistency; measurable goals; real Dependencies/Risks/Open questions). A missing PRD file is recorded as a Critical "no PRD to review" finding inside this pass (the loop cannot fix it). Do NOT re-author the rubric here — it lives in `ptp-review-prd`. (Used by slice 2's `/ptp:review-prd-full` orchestrator; documented now so the kind is complete.)
- `codex` / `prd` — run the `codex-review-plan.md` closed-book protocol inline, **retargeted to the PRD file `openspec/changes/<id>/prd.md`** and with **NO** `openspec validate` (a PRD precedes any proposal/spec, so there is nothing to validate): read the PRD file and any cited context yourself (you, via Read), build a single self-contained prompt carrying the PRD rubric as the audit instructions plus the full PRD text and any cited source excerpts, and pipe it to `codex exec -s read-only` over stdin. As with the `ptp` variant, a missing PRD file is recorded as a Critical "no PRD to review" finding inside this pass (the loop cannot fix it) — surface the missing-PRD note in the prompt in place of the PRD text rather than building a Codex prompt over an absent file.
  - **First-iteration payload (kind `prd`).** Inline exactly the required set: `prd.md` and the cited source excerpts, and no `openspec validate` result.

**Two rules bind every Codex payload above, stated once (task 7.3).** `TLDR.md` and `effort.md` are
never inlined, for any kind. And on any iteration after the first, running in a **fresh Codex
process**, re-inline the *current* text of that kind's required set — its **effective** set where one
is defined, which today means the `artifact` fixed set plus `brainstorm.md` when the
disputed-decision carve-out applies to that iteration — plus the compact open and rejected finding
state this loop already tracks. Never inline an earlier version of an artifact, never an unchanged
unrelated file, and never narrative iteration history.

Collect the full list of findings (severity, location, description, suggested fix) from the review output.

### (c) Filter out-of-convergence-scope findings

Two sub-filters, applied **in this order**. (c1) runs **first**, so a pure "check this by hand" /
"add a test" suggestion is dropped there and is never *additionally* reported as below threshold.

#### (c1) Manual-check / tests-required drop

Before the convergence check, drop any finding whose suggested fix consists **only** of:

- `manually verify`, `needs manual QA`, `manual check required`, `verify by hand`
- `should be covered by a test`, `add a regression test`, `test required`, `needs a test`

A finding that names a concrete code or artifact defect **AND** additionally mentions a missing test stays in scope — the defect half is fixable. Only pure "check this by hand" / "add a test" suggestions with no associated defect pointer are filtered.

A finding whose **subject** is a banned manual-task line inside the change's own `tasks.md` is
likewise **NOT** dropped. Both conditions must hold: the finding cites a task line in the
change's `tasks.md` that the `tasks-authoring` capability bans (the offending text quoted as
evidence), **and** its remedy is a concrete edit to that file — replace the offending task with
one the implementing agent can perform or, absent an automated equivalent, relocate its intent
as the `tasks-authoring` capability directs, never bare deletion. Such a finding does not ask a human to
go check something; it asks for an artifact edit that happens to be *about* a manual check, so
the manual-check words in it are quoted evidence, not the suggested fix. The banned task shapes
live in the `tasks-authoring` capability and are not restated here. The general test is
subject-vs-remedy: **(c1) drops a finding for what it asks _you_ to do, never for which words
appear in it.** Surviving (c1) is not an exemption from (c2) — a carved-out finding is still
ranked against `MIN_SEVERITY` like any other survivor.

Filtered findings do NOT count against convergence and do NOT trigger a fix pass.

#### (c2) Severity-threshold partition

Partition every finding that survived (c1) against `MIN_SEVERITY`, per **## Severity threshold**:

- **In scope** (`rank(severity) >= rank(MIN_SEVERITY)`, or severity absent/unrecognized — the
  fail-safe) → continues to steps (d)–(h) unchanged.
- **Below threshold** → moved out of the in-scope stream into the `below_threshold` bucket for this
  iteration.

A finding in the `below_threshold` bucket is **not** confirmed (step (e) is never run on it), **not**
fixed (step (g) never edits on its account), **not** counted toward the step (f) exit check, **not**
appended to `rejected_findings` (nobody examined it — asserting "not a defect" would be a
fabrication), and gets **no stable key** (carry-over dedup does not apply).

The bucket is **re-derived from each iteration's fresh review pass** — never carried across
iterations and never persisted, the same in-conversation-only rule as all loop control state. It is
reported per **(h)** and in both terminal states; it is never silently dropped.

### (d) Carry-over rejection check

For each remaining **in-scope** finding, compute its **stable key** (see section below) and check it against `rejected_findings`.

- If it matches an entry in `rejected_findings`, mark it `REJECTED (carry-over)`. Do NOT re-confirm it. It does NOT count against convergence.
- If it does not match, it is a **candidate finding** for confirmation in step (e).

### (e) Confirm remaining findings

Invoke `ptp-receiving-code-review` and apply its rigor: for every candidate finding, read the actual code or artifact at the cited location and judge whether it is a real defect.

- `CONFIRMED` → this finding will be fixed in step (g).
- `REJECTED` → append its stable key to `rejected_findings`. It does NOT count against convergence.

### (f) Exit check

If there are zero `CONFIRMED` **in-scope** findings this iteration → proceed to the **DONE** terminal
state. Below-threshold findings never enter this count, so a review pass that returns nothing at or
above `MIN_SEVERITY` converges immediately (having fixed nothing) — with the below-threshold list
rendered in the terminal report.

Before exiting to `DONE`, accumulate this converging iteration's cycle and its `found`,
`droppedManual`, `belowThreshold`, `rejected`, and `accepted` (`0` here by construction) counters into
`reviewTally` for this run's `reviewer` — this iteration never reaches step (h), so this is the only
point its tally is recorded (see **## Review cycle tally**).

### (g) Fix pass

The fix pass runs at a **fix target** of its own — a `{model}.{effort}` evaluated for the fix work
itself — rather than implicitly inheriting the target the review pass is running at. Two sub-steps,
following the `(c1)`/`(c2)` sub-numbering precedent so the step letter `(g)` is preserved and every
in-skill cross-reference to it still names the same step.

#### (g1) Evaluate the fix target

Evaluate `fixTarget` by invoking the **fix-scoped `/ptp:effort` mode** — `/ptp:effort mode:fix`,
defined in `commands/effort.md` § *Fix mode (`mode:fix`)* — passing:

- this pass's **frozen CONFIRMED in-scope finding set** (the findings step (e) confirmed, after the
  step (c) filters — never the below-threshold bucket, never a rejected or carried-over finding);
- the loop `kind`; and
- the change artifacts for the resolved change (for `kind = prd`, the resolved epic's PRD file).

The result is `fixTarget`, the `{model}.{effort}` on the first line of that mode's output block.

**Evaluated once per fix pass, never once per run.** `MAX_ITERATIONS` and `MIN_SEVERITY` are
run-scoped policy and stay resolved-once; `fixTarget` is a function of the finding set of the pass it
serves, and that set differs by iteration by construction. An iteration with zero CONFIRMED in-scope
findings never reaches step (g) — step (f) exits to `DONE` first — and so performs no evaluation at
all.

**The evaluation is performed by the party holding the frozen finding set it scores** — within this
loop, the party that ran step (e) — regardless of which party subsequently performs the fix under
(g2).

**Fallback.** When the evaluation is unavailable, errors, or returns a value that is not a parseable
`{model}.{effort}`, use the literal `opus.high` and **note the defaulting** — the identical fallback
and wording `ptp-run-at-model` already applies to a missing or unparseable `effort.md`. A failed
evaluation **never** throws, **never** STOPs the loop, and **never** causes the fix pass to be
skipped; `opus.high` is the target the fix pass inherits today, so the fallback degrades to exactly
the pre-existing behavior.

The evaluation rubric — its signals, thresholds, anchor table, and decision order — lives in
`commands/effort.md` § *Fix mode (`mode:fix`)* (introduced by `0049_01_fix-effort-evaluation`) and is
**not** restated here.

#### (g2) Carry out the fix at `fixTarget`

Fix every CONFIRMED finding at `fixTarget`, under the resolved `fixDispatch` mode (see **## Fix
dispatch**):

- `kind=code` → edit source files directly. **Never** invoke `/ptp:apply`. **Never** commit.
- `kind=artifact` → make minimal targeted edits to the affected artifact(s). **Never** regenerate artifacts via `/ptp:plan`. Corrections only (fix a wrong section, add a missing scenario, fill a thin block) — not re-fabrication.
- `kind=brainstorm` → make minimal targeted edits to `brainstorm.md`. **Never** regenerate the brainstorm via `/ptp:brainstorm`. Corrections only (add a missing option, expand a thin tradeoff, document a missing assumption) — not re-fabrication. A missing `brainstorm.md` Critical finding has nothing to edit and stays unfixed (the iteration cap is the backstop).
- `kind=prd` → make minimal targeted edits to the PRD file `openspec/changes/<id>/prd.md`. **Never** regenerate the PRD via `/ptp:prd`. Corrections only (fill a missing schema section, sharpen a vague acceptance criterion, add a measurable goal) — not re-fabrication. A missing-PRD Critical finding has nothing to edit and stays unfixed (the iteration cap is the backstop).

**Prefer removal, and pay for each addition by deleting** — `references/bounded-review.md`.

For each CONFIRMED finding fixed in this step, record its stable key in `fixed_candidates` as a
*fixed candidate* (see **## Review cycle tally**). Whenever a step (b) review pass in a later
iteration raises a finding whose stable key matches an entry already in `fixed_candidates`, remove
that entry — the fix did not hold.

### (h) Verify

Run a cheap, fast verification appropriate to `kind`:

- `kind=code` → tests, lint, and typecheck for the files touched this iteration.
- `kind=artifact` → `npx -y openspec validate <change-id> --strict`.
- `kind=brainstorm` → **N/A** — run **NO** `openspec validate` (a brainstorm precedes any proposal/spec, so there is nothing to validate). Record `verify = N/A (brainstorm precedes any spec)` in `per_iteration_summary`.
- `kind=prd` → **N/A** — run **NO** `openspec validate` (a PRD precedes any proposal/spec, so there is nothing to validate). Record `verify = N/A (PRD precedes any spec)` in `per_iteration_summary`.

A failing verification is **reported in `per_iteration_summary`** but does NOT abort the loop — the next review iteration will pick up regressions. The iteration cap is the backstop.

Append a summary entry to `per_iteration_summary`: iteration number, findings-confirmed count, findings-rejected count, carry-over count, **below-threshold count** (the size of this iteration's `below_threshold` bucket from (c2) — `0` on every run at the default `low`), fixes applied, verification result, and — for an iteration that reached step (g) — the **evaluated `fixTarget`** (lowercase `{model}.{effort}`), whether it was **defaulted** to `opus.high` because the evaluation failed, the resolved **`fixDispatch`** mode, and whether the target was **fully honored**. An iteration that never reached step (g) records **no** fix target rather than a fabricated or carried-over one.

**Size measurement and the budget check (mandatory; `kind` ∈ {`artifact`, `brainstorm`, `prd`}).**
Measure the artifacts this `kind` owns, append this iteration's `artifact_sizes` entry, and apply the
two halt conditions in `references/bounded-review.md`; either ends the run in
`ARTIFACT BUDGET EXCEEDED` in place of another iteration. `kind = code` measures nothing.

Alongside this `per_iteration_summary` append — the tally sits **beside** that list rather than
replacing it — accumulate this iteration's cycle and its `found`, `droppedManual`,
`belowThreshold`, `rejected`, and `accepted` counters into `reviewTally` for this run's `reviewer`
(see **## Review cycle tally**).

**Divergence rule (mandatory, never silent).** Under `fixDispatch = inline`, when `fixTarget`'s
**model** differs from `runningTarget`'s model — or when `runningTarget` was absent or unparseable, in
which case the running model is recorded as `unknown` — emit a line naming **both** the evaluated
model and the running model, in that iteration's summary entry **and** in both terminal reports:

```
Fix target partially honored: evaluated sonnet.medium, running on opus (effort directive applied; model cannot be changed in-run).
```

The target is recorded as **fully honored**, with no divergence line, in exactly two cases:
`fixDispatch = inline` with `fixTarget`'s model equal to the running model, and
`fixDispatch = dispatched` in the `roles.main = claude` direction. Under `fixDispatch = dispatched` at
`roles.main = codex` the target is **advisory** — the shell-out takes `codex.model` /
`codex.reasoningEffort` — so it is **not** recorded as fully honored, and the divergence line names
the evaluated model alongside the configured `codex.model`, or `unknown` when that key is unset.

### (i) Loop

Go back to step (a).

## Stable finding key

Used at step (d) to match findings across iterations for carry-over rejection deduplication. The
per-kind key shapes — `code`, `artifact`, `brainstorm`, `prd`, and the sentinels the unfixable
missing-file findings use — are in `skills/ptp-review-loop/references/stable-finding-key.md`.

## Terminal states

### DONE

Reached when step (f) finds zero CONFIRMED **in-scope** findings for the current iteration.

Report:

1. **Tally table** (`deferMarker=false`), per `references/review-tally-table.md`.
2. **Per-iteration summary table** — one row per iteration: iteration number, confirmed, rejected, carry-over, **below-threshold**, fixes applied, verification result, **fix target** (the evaluated `fixTarget`, marked when it was defaulted to `opus.high`), **fix dispatch** (the resolved `fixDispatch` mode), and **fully honored** (yes / no). An iteration that never reached step (g) leaves the three fix columns empty rather than carrying a value over. Every iteration whose target was not fully honored also carries the mandatory **divergence line** from step (h).
3. **Total findings fixed** across all iterations.
4. **Rejected / carry-over set** — list every stable key that was rejected or carried over, with the rejection reason from step (e) or `(carry-over)`.
5. **Below threshold — not blocking convergence (minSeverity = `<value>`)** — the below-threshold
   findings of the **last completed review pass** (the same snapshot the `ITERATION CAP REACHED`
   "Open findings" section uses), each carrying its severity label and the literal `(unconfirmed)`
   marker:

   ```
   Below threshold — not blocking convergence (minSeverity = high)
     - [Medium] design.md § Data flow — "cache invalidation order is implied, not stated"  (unconfirmed)
     - [Low]    tasks.md § 3 — "task 3 wording is ambiguous"                               (unconfirmed)
   ```

   The `(unconfirmed)` marker is mandatory: these findings never passed
   `ptp-receiving-code-review`, so presenting them as verified defects would misrepresent
   them. When the bucket is empty — which is every run at the default `low` — render the literal
   word `None`, so a reader can distinguish "nothing below threshold" from an author omission. This
   section is rendered **before** the next-command recommendation, so a `DONE` with a non-empty
   bucket is never misread as "the reviewer found nothing".
6. **Next command**:
   - `kind=code`     → `/ptp:archive <change-id>` (or `/ptp:status` first).
   - `kind=artifact` → `/ptp:apply <change-id>` if not yet implemented; `/ptp:review-plan <change-id>` for a post-apply artifact check. (Recommend these to the user — do not invoke them.)
   - `kind=brainstorm` → `/ptp:plan <change-id>` (the brainstorm is sound; proceed to author the OpenSpec artifacts). (Recommend it to the user — do not invoke it.)
   - `kind=prd` → `/ptp:plan <change-id>` (the PRD is sound; proceed to author the OpenSpec artifacts — `<change-id>` is the epic's lowest-numbered story id). (Recommend it to the user — do not invoke it.)

**Marker write (after the report above).** For **every** kind, write the per-kind marker
(`brainstorm`→`stages/brainstorm.json`, `artifact`→`stages/plan.json`,
`prd`→`openspec/changes/<id>/stages/prd.json`, `code`→`stages/code.json`) per the
**## Review-convergence marker** section, with `terminalState: "converged"`, `reviewers` = the
reviewer(s) that ran this loop run, `iterations` = the final `iteration` value, `minSeverity` = the
effective resolved `MIN_SEVERITY` for this run (lowercase canonical), `timestamp` = now (UTC
ISO-8601), and `reviewTally` = this run's tally (one key, this run's reviewer, with `fixed` and
`capped` finalized as below) — omitted entirely, with the omission noted per the marker section's
*omit, never fabricate* rule, if it cannot be produced. For `kind = code` additionally record `gateState: "LOOP_DONE"` (a standalone loop run has no
two-phase gate) and the `fingerprint` computed per `skills/ptp-review-loop/references/code-marker-fingerprint.md` after the final fix
edit and verification, immediately before the write — omitting the field entirely if it cannot be
computed. Use the atomic write-temp-then-rename protocol. **Skip the write when invoked with
`deferMarker = true`** (a `-full` phase) — instead return the terminal outcome
(`terminalState = converged`, `reviewer`, `iterations`, `minSeverity`, `reviewTally`) to the orchestrator, which performs the single
combined write. A marker-write failure is reported but does NOT change the terminal state (the review
already happened).

**`reviewTally` in the return.** Under `deferMarker = true` the terminal outcome returned to the
orchestrator carries `reviewTally` alongside `terminalState`, `reviewer`, `iterations`, and
`minSeverity` (see **## Review cycle tally**). The same outcome — including `reviewTally` — is
returned identically in the standalone `deferMarker = false` mode, in addition to the marker write
performed there. Set `fixed` to the retained `fixed_candidates` count and `capped` to `0` **before
item 1's table is rendered**, not merely before returning.

**Converged-on-the-final-round line.** When `iteration == MAX_ITERATIONS`, `DONE` carries the line
`Converged on the final round (N of N)` — a size signal worth seeing, not a defect, and not grounds
for splitting a change whose findings were all genuine.

### ARTIFACT BUDGET EXCEEDED

Reached when step (h)'s budget check fires, for `kind` ∈ {`artifact`, `brainstorm`, `prd`} only. A
**halt, not a round**: the remedy it recommends is a **split**, never a longer review. Its report,
its marker write, and the two halt conditions are in `references/bounded-review.md`.

### ITERATION CAP REACHED

Reached when step (a) increments `iteration` past `MAX_ITERATIONS` (the resolved cap).

**Reaching the cap is evidence the change is too large, not that the review was too short**, budgets
being enforced. Converging on the final round ends in `DONE` with the line above; still producing
actionable findings at the cap ends here, and **that** is the one to split.

Report:

1. **Tally table** (`deferMarker=false`), per `references/review-tally-table.md`.
2. **Open findings** — every finding from the last completed review that is still CONFIRMED and unfixed.
3. **Rejected / carry-over set** — same as DONE.
4. **Below threshold — not blocking convergence (minSeverity = `<value>`)** — same section, same
   format, and the same `(unconfirmed)` marker and `None`-when-empty rule as DONE, sourced from the
   **same snapshot** as the "Open findings" section above (the last completed review pass).
5. **Per-iteration summary table** — including the **below-threshold** column and the **fix target**
   (`fixTarget`) / **fix dispatch** (`fixDispatch`) / **fully honored** columns, with the same empty-when-step-(g)-was-never-reached
   rule and the same mandatory **divergence line** for every iteration whose target was not fully
   honored, exactly as in `DONE`.
6. Explicit statement: "Do not archive. Do not run `/ptp:apply`. Inspect the open findings manually and decide next steps." Add, when open findings remain: "Still finding actionable defects at the cap — the change is a candidate for splitting."

**Marker write (after the report above).** For **every** kind, write the per-kind marker
(`brainstorm`→`stages/brainstorm.json`, `artifact`→`stages/plan.json`,
`prd`→`openspec/changes/<id>/stages/prd.json`, `code`→`stages/code.json`) per the
**## Review-convergence marker** section, with `terminalState: "cap-reached"` and the same `kind` /
`reviewers` (the reviewer that ran) / `iterations` (the cap value) / `minSeverity` (the effective
resolved `MIN_SEVERITY` for this run, lowercase canonical) / `timestamp` (now, UTC ISO-8601) fields,
plus `reviewTally` = this run's tally (one key, this run's reviewer, with `fixed` and `capped`
finalized as below) — omitted entirely, with the omission noted per the marker section's *omit, never
fabricate* rule, if it cannot be produced. For
`kind = code` additionally record `gateState: "LOOP_CAP"` and the `fingerprint` computed per
`skills/ptp-review-loop/references/code-marker-fingerprint.md` immediately before the write, omitting the field entirely if it cannot be
computed; such a marker authorizes no skip (condition 2 of `skills/ptp-review-loop/references/code-marker-skip-eligibility.md` rejects
it), it simply records the last review that ran and how it ended. Use the atomic write-temp-then-rename
protocol. **Skip the write when invoked with `deferMarker = true`**
(a `-full` phase) — instead return the terminal outcome (`terminalState = cap-reached`, `reviewer`,
`iterations`, `minSeverity`, `reviewTally`) to the orchestrator, which performs the single combined write. A marker-write failure is
reported but does NOT change the terminal state.

**`reviewTally` in the return.** As with `DONE`, the terminal outcome carries `reviewTally` in both
`deferMarker = true` and `deferMarker = false` modes (see **## Review cycle tally**). Set `fixed` to
the retained `fixed_candidates` count and `capped` to the in-scope `CONFIRMED` findings still open
(item 2's snapshot) **before item 1's table is rendered**, not merely before returning.

## Hard rules

- **Never archive** the change, no matter the outcome.
- **Never invoke `/ptp:apply`** — not in the fix pass, not in the terminal report.
- **Never auto-commit** any edits made during the loop.
- **Never fix an unconfirmed finding.** If step (e) marks a finding `REJECTED`, leave the code/artifact alone.
- **Never auto-fix a below-threshold finding, and never silently drop one.** A finding ranked under `MIN_SEVERITY` by step (c2) is reported — in the per-iteration below-threshold count and, for the last completed review pass, individually in both terminal reports — but is never confirmed, never edited, and never counted toward convergence. Reporting it is mandatory: omitting it is a violation of this rule, not an optimization.
- **Never silently absorb a partially-honored fix target.** Under `fixDispatch = inline` the model half of `fixTarget` cannot be honored; the divergence is reported in the iteration summary and in both terminal reports. Emitting it is mandatory — omitting it is a violation of this rule, not an optimization.
- **Never spawn from inside the loop under `fixDispatch = inline`** — a second Agent-nesting level throws.
- **Never persist loop control state to disk.** `iteration`, `rejected_findings`, and `per_iteration_summary` live only in conversation context. This rule does NOT forbid the durable terminal review-convergence marker below — that marker is a deliberate exception and is the loop's only on-disk side effect beyond the artifact edits it already makes.
- **Write the per-kind review-convergence marker on terminal states for every kind** (`brainstorm`→`stages/brainstorm.json`, `artifact`→`stages/plan.json`, `prd`→`openspec/changes/<id>/stages/prd.json`, `code`→`stages/code.json`), per the **## Review-convergence marker** section, with a `kind = code` marker additionally carrying `gateState` and — when computable — the `fingerprint` from `skills/ptp-review-loop/references/code-marker-fingerprint.md`. **Never** write a marker when invoked with `deferMarker = true` (the `-full` orchestrator performs the single combined write). The marker is written via the atomic write-temp-then-rename protocol; a marker-write failure is reported but does not change the terminal state.
- **Never skip a review on anything but an eligible marker.** The six conjunctive conditions in `skills/ptp-review-loop/references/code-marker-skip-eligibility.md` are the only basis for skipping an otherwise-mandatory code review, evaluating them never mutates a marker, and any ineligible outcome runs the review exactly as it would without a marker. Condition 6 in particular is resolved against `ptp-codex-mode`'s decision contract **at check time**, never against a mode carried by the marker.
- **Iteration cap is resolved from `review.maxIterations` (layered config, default 5).** There is no `--max-iterations` CLI flag. If the cap is hit, report and stop — do not silently increment past it. The cap is not a safety net to spend: reaching it while findings remain is evidence the change is too large.
- **Never dispatch a review pass without the acceptance bar**, and never reject a finding without stating the check behind it.
- **Never resolve a finding by adding text where removing or tightening it would do**, and never let a round grow an artifact without deleting equivalent text in the same round.
- **Never run another round past the budget check.** Measuring artifact sizes each round is mandatory for `kind` ∈ {`artifact`, `brainstorm`, `prd`}; a breach ends the loop in `ARTIFACT BUDGET EXCEEDED` with a split recommendation. Omitting the measurement is a violation of this rule, not an optimization.
- **Codex variants** (`reviewer=codex`) must run `codex exec -s read-only` with the full prompt piped over stdin (`-`), assembled per the `ptp-codex-mode` flag-append rule (append resolved `-m <model>` / `-c model_reasoning_effort=<effort>` before the trailing `-` when configured). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- **The caller runs `openspec validate` (for `kind=code` / `kind=artifact` only — never for `kind=brainstorm` or `kind=prd`, which each precede any proposal/spec) and all file reads for Codex** — Codex executes no `npx`, no network, no install commands. The closed-book / inlined-diff protocol from `codex-review.md` / `codex-review-plan.md` applies.
- **The `reviewTally` decides nothing.** No counter it holds is an input to convergence, the severity
  threshold, the iteration cap, any terminal state, the fix target, or the code-marker skip predicate.
