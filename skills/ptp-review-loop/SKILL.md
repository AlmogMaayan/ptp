---
name: ptp-review-loop
description: Shared loop protocol for /ptp:review-loop, /ptp:codex-review-loop, /ptp:review-plan-loop, /ptp:codex-review-plan-loop, the /ptp:review-brainstorm-full brainstorm loop, and /ptp:codex-review-prd-loop. Takes kind∈{code,artifact,brainstorm,prd} and reviewer∈{superpowers,codex} and iterates review→confirm→fix until zero open findings at or above the configured review.minSeverity floor (default low = all four severities) or the configured iteration cap (default 5) is reached; findings below the floor are reported but not fixed. Handles rejection carry-over so rejected findings do not cause infinite loops, and filters manual-check/tests-required suggestions from the convergence count. At its terminal states the loop also writes a small durable per-kind review-convergence marker for every kind under openspec/changes/<id>/stages/ (brainstorm.json, plan.json, prd.json, code.json), unless invoked with deferMarker=true by a -full orchestrator; the kind=code marker additionally carries a gateState and a content fingerprint, and defines the six-condition predicate under which a caller may skip an otherwise-mandatory code review.
---

# ptp-review-loop — shared loop protocol

## Purpose

This skill encodes the iteration semantics shared by the `/ptp:*-loop` commands **and** the `-full` review orchestrators that drive it (Phase 1/Phase 2 of `/ptp:review-brainstorm-full`, `/ptp:review-prd-full`, etc.). Each caller supplies `kind` + `reviewer`; this skill drives the loop. The `/ptp:*-loop` callers are enumerated below; the `-full` orchestrators additionally drive it, per the note under the table.

```
/ptp:review-loop            → kind=code,       reviewer=superpowers
/ptp:codex-review-loop      → kind=code,       reviewer=codex
/ptp:review-plan-loop       → kind=artifact,   reviewer=superpowers
/ptp:codex-review-plan-loop → kind=artifact,   reviewer=codex
/ptp:codex-review-prd-loop  → kind=prd,        reviewer=codex   (once per resolved epic)
```

The `/ptp:review-brainstorm-full` skill (`ptp-review-brainstorm-full`) also drives this loop with
`kind=brainstorm` in two phases — **Phase 1 with the main agent, Phase 2 with the reviewer agent**,
resolved from `roles.main` via `ptp-agent-roles` (default `roles.main=claude`: Phase 1
`reviewer=superpowers`, Phase 2 `reviewer=codex`) — so the
`-full` suffix means a dual-reviewer inline-fix loop at every pipeline stage (brainstorm, artifact,
code). The `prd` kind is anchored to the epic's **lowest-numbered story change folder**: the caller resolves
the selector to epics and drives this loop **once per epic** over
`openspec/changes/<id>/prd.md` (see the change-folder input variant below).

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| `kind` | `code` \| `artifact` \| `brainstorm` \| `prd` | Supplied by the calling command |
| `reviewer` | `superpowers` \| `codex` | Supplied by the calling command |
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

**`review.minSeverity` — the convergence severity floor.** A sibling parameter, resolved from the
**same two files with the same precedence**, naming the **lowest finding severity that is in scope
for handling**:

```
minSeverity = "low"                                  # default
for path in [ ~/.claude/ptp/config.json,             # global first
              <repo>/.claude/ptp/config.json ]:      # then project (overrides)
    if file exists and parses as JSON
       and obj.review?.minSeverity is a string whose lowercased value is
           exactly one of "low" | "medium" | "high" | "critical":
        minSeverity = that lowercased value
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
  "reviewers": ["superpowers", "codex"],
  "iterations": 2,
  "minSeverity": "high",
  "timestamp": "2026-06-23T12:34:56Z",
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
| `fingerprint` | object | **`kind = code` only.** A content fingerprint of what the review evaluated — see **## Code-marker fingerprint** below. **Absent** when it could not be computed; there is no partial fingerprint. |
| `reviewers` | string[] | The reviewer(s) that actually ran: `["superpowers"]`, `["codex"]`, or `["superpowers","codex"]` (both). A single `ptp-review-loop` invocation runs one reviewer, so a standalone `-loop` run writes a single-element array; the combined set is assembled by the `-full` orchestrator. For a `kind = code` marker this field is **load-bearing**: it is what **condition 6** of **## Code-marker skip eligibility** tests against the reviewer set a review invoked at check time would run. |
| `iterations` | integer | The iteration count of the last phase that ran (≥ 1). |
| `minSeverity` | string | The **effective resolved** severity threshold of the run that produced this marker: `"low"`, `"medium"`, `"high"`, or `"critical"` — always the lowercase canonical form, never the raw config text. Under a `-full` orchestrator's single combined write this is the threshold used by the **last phase that ran**, the same rule already applied to `iterations`. |
| `timestamp` | string | ISO-8601 UTC instant the marker was written. |

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
  terminal outcome (`terminalState`, `reviewer`, `iterations`, `minSeverity`) to the orchestrator,
  which performs
  **exactly one** combined marker write after the whole `-full` run resolves (see
  `ptp-review-brainstorm-full` / `review-plan-full`). The combined write records the **last phase
  that ran**'s `minSeverity`, the same rule already applied to `iterations`; in the normal case both
  phases resolve the same value and the rule is a no-op, and each phase's own report names the
  threshold it used. This guarantees a `-full` run produces exactly one
  authoritative marker write with **no** provisional per-phase marker that could survive a later failed
  write.

`deferMarker` is a **loop input only**. `/ptp:review-fix` does **not** invoke `ptp-review-loop` at all
(it runs a single confirm→fix→verify pass), so it neither receives nor honors `deferMarker`; it writes
its marker independently (reusing the same schema/location/atomic protocol described above). The
`ptp-review` workflow agent (`agents/ptp-review.md`) reaches the same end state — no per-phase marker,
exactly one combined write at its terminal point — **by construction rather than by signal**: it inlines
its two phase loops instead of invoking this skill, so it takes no `deferMarker` input and none is
required of it.

## Code-marker fingerprint

A `kind = code` marker carries a `fingerprint` object describing **the content the review evaluated**, so
a later reader can prove that a recorded convergence still describes the current code rather than
guessing from a timestamp. It is written for `kind = code` only.

**Shape.** `version` (the integer `2` for the algorithm defined here), `algorithm` (the string
`"sha256"`), `value` (the composite hex digest), `footprint` (the path set the digests were taken over,
recorded verbatim so a later reader recomputes over **exactly** the writer's paths), and `inputs` (the
individual component digests and scalars, recorded so a mismatch can be attributed to a component rather
than reported as an opaque boolean). `footprint` is a **sibling** of `inputs`, never a member of it:
`inputs` holds scalars (a branch name, a commit id, four hex digests) and is the object condition 3
checks entry-by-entry and a mismatch report attributes against, so keeping the arrays out of it leaves
both shapes homogeneous.

```json
"fingerprint": {
  "version": 2,
  "algorithm": "sha256",
  "value": "<hex>",
  "footprint": {
    "codeTracked":   ["skills/ptp-review-loop/SKILL.md", "skills/ptp-full-apply/SKILL.md"],
    "codeUntracked": ["scripts/new-helper.js"],
    "contract":      ["proposal.md", "design.md", "tasks.md", "specs/review-loop/spec.md"]
  },
  "inputs": {
    "baseBranch": "master",
    "mergeBase": "2ec92c1…",
    "footprintDigest": "9b41…",
    "trackedDigest": "1a7b…",
    "untrackedDigest": "c033…",
    "contractDigest": "77de…"
  }
}
```

**Value.** The `sha256` of the LF-joined sequence:

```
value = sha256( "ptp-code-fingerprint/2" LF
                baseBranch              LF
                mergeBase               LF
                footprintDigest         LF
                trackedDigest           LF
                untrackedDigest         LF
                contractDigest )
```

The leading literal is a domain-separation tag carrying the same number as `fingerprint.version`, so a
**v2 value can never collide with a v1 value** even over identical inputs, and a future algorithm change
cannot collide with either.

**The footprint.** The footprint is the path set the reviewed change occupied, captured **at write time**
and frozen into the marker. It is three **bytewise-sorted, duplicate-free** lists of
repository-root-relative, forward-slash-separated paths:

| List | Source at capture |
|---|---|
| `codeTracked` | `git diff --no-renames --name-only -z <mergeBase>` — the **one-revision form** (neither `..` nor `...`), which names every path differing between the merge base and the **working tree**, staged and unstaged |
| `codeUntracked` | `git ls-files --others --exclude-standard -z --full-name` |
| `contract` | the change folder's **review contract set** (below), relative to `openspec/changes/<change-id>/`, recorded for attribution only |

The footprint is captured at the **same ordering point as the fingerprint itself** — after the run's
final fix edit and final verification, immediately before the marker write. That placement is
load-bearing: it guarantees every file the review evaluated, and every file the review's own fixes
touched, is inside the footprint.

The marker-directory exclusion below is applied **at capture**, so an excluded path never enters a frozen
list and therefore cannot re-enter at read time; the reader applies **no** exclusion of its own, hashing
a list that is already clean.

**An empty footprint is legitimate, and is not an uncomputable one.** A change touching no tracked and no
untracked file yields two empty lists, over which both code digests are well defined, and the marker is
normal — its contract set still binds it. A capture that *failed* is a different thing entirely and is
handled by *Failure* below; conflating the two would produce a marker that covers nothing while claiming
to cover everything.

`codeTracked` and `codeUntracked` are disjoint by construction (a path is either differing-from-merge-base
or untracked-and-unignored, never both). `contract` overlaps neither where `openspec/` is gitignored (as
here), and may overlap `codeTracked` where `openspec/` is tracked — harmless, the same bytes simply being
hashed twice, exactly as in v1.

**Both capture commands are NUL-delimited (`-z`), and that is mandatory.** In their default output both
commands **C-quote** any path carrying a non-ASCII byte or a shell-special character (`core.quotePath`) —
`café.md` is emitted as `"caf\303\251.md"`, quotes and escapes included. Recorded verbatim, that quoted
string is not the path; fed back as a `:(literal)` pathspec it matches **nothing**, so the file
contributes no hunk to the scoped diff and no line to `untrackedDigest`. Writer and reader agree — both
drop it — so the mismatch is invisible and the path is effectively **deleted from the footprint**, every
later edit to it authorized. That is silent **under-scoping**, the one direction this change must not
move, and it is reached by an ordinary filename rather than an attack. (`-c core.quotePath=false`
suppresses the quoting but not an embedded NUL/LF hazard, so `-z` is the required form, not merely the
preferred one.)

**Paths are hashed and sorted over their raw bytes**, so ordering is locale-independent. A captured path
containing an **LF byte** — which the LF-joined serializations of `footprintDigest` and
`untrackedDigest` cannot represent unambiguously — or one that is **not valid UTF-8** — which has no
faithful JSON-string representation, so writer and reader would round-trip different bytes — makes the
fingerprint **uncomputable** (see *Failure*), never ambiguously serialized. Git permits both and `-z`
reads them back faithfully; the limit is the marker's JSON and the LF-joined serialization, not the
capture.

**`--no-renames` is mandatory on the `--name-only` capture too, for an independent reason.** Rename
detection is on by default (`diff.renames`), and under it `git diff --name-only` reports a rename as its
**destination path alone**. The source path is a *deletion the review evaluated*, and if it never enters
`codeTracked` no digest covers it: restoring or re-creating that file after the marker was written
changes reviewed content while every recorded digest stays put, and the skip is authorized — fail-open,
reached by an ordinary `git mv`. With `--no-renames` the same rename renders as an unpaired deletion
**and** an unpaired addition, so **both** paths enter `codeTracked`. This is a **different** reason from
the scoped diff's `--no-renames` rule below (which prevents out-of-pathspec coupling); the two rules are
independent and **neither implies the other**.

**Every command runs with the repository root as its working directory, and `git ls-files` carries
`--full-name`.** `git ls-files` is implicitly scoped to the current directory and emits paths relative to
it; run from a subdirectory it would silently omit every untracked path outside that subtree and record
the rest under the wrong strings. `--full-name` fixes the rendering, but only executing from the
repository root fixes the scope — so "repository-root-relative" is a property the commands actually
produce rather than one this prose merely asserts. Every capture, every digest, and every read-time
recomputation obeys this.

**The six inputs.**

| Input | How it is derived |
|---|---|
| `baseBranch` | the base branch `ptp-branch-guard` recognizes — `master`, else `main` |
| `mergeBase` | `git merge-base HEAD <baseBranch>` |
| `footprintDigest` | `sha256` over the LF-joined lines `T\0<path>` for each `codeTracked` path, then `U\0<path>` for each `codeUntracked` path, then `C\0<relpath>` for each `contract` path — each list bytewise-sorted, the three groups in that fixed order |
| `trackedDigest` | `sha256` of the bytes of `git diff --no-renames --no-ext-diff --no-textconv --no-color <mergeBase> -- :(literal)<p1> :(literal)<p2> …` over **exactly** the recorded `codeTracked` paths in bytewise-sorted order — the **one-revision form**; an empty list yields the `sha256` of the empty byte string, the command not being run at all |
| `untrackedDigest` | `sha256` over the LF-joined `<path>\0<sha256 of bytes>` lines — or `<path>\0<absent>` when the path does not exist at hash time — for **exactly** the recorded `codeUntracked` paths in bytewise-sorted order. `git ls-files --others --exclude-standard` is **not** re-run when the fingerprint is recomputed |
| `contractDigest` | `sha256` over the LF-joined, bytewise-path-sorted `<relpath>\0<sha256 of bytes>` lines for the change folder's **review contract set** (below), enumerated **by rule** at the moment of computation — **never** from the recorded `contract` list |

**Why `footprintDigest` is an input and not merely recorded.** Two reasons, and both matter.
*Attribution:* condition 4 reports which component moved, and without a footprint component a marker
whose recorded footprint had been altered would surface as a `trackedDigest` mismatch, pointing at the
code when the path set was what changed. *Binding:* the composite value commits to the exact path set the
other digests were taken over, so editing `footprint` in a marker file — narrowing it to hide a file,
say — moves `footprintDigest` and therefore `value`, and the marker fails condition 4 rather than
authorizing a skip over a smaller set than the writer hashed. The footprint is thereby self-protecting,
and the reader's obligation to recompute over exactly the writer's paths is *enforced* rather than merely
stated.

**Why `--no-renames` on the scoped diff, and why `:(literal)`.** With a pathspec, git's rename detection
may pair a footprint path against a counterpart **outside** the pathspec, making the diff text for an
in-footprint path a function of files the footprint deliberately excludes — precisely what scoping exists
to prevent, and liable to differ between writer and reader as those out-of-scope files change.
`--no-renames` makes each footprint path's rendering **path-local**. (v1 had no pathspec and therefore no
such hazard, which is why it did not need the flag.) `:(literal)` pathspec magic is likewise mandatory:
paths come out of git verbatim and may contain `*`, `?`, `[`, or a leading `:`, which passed bare would
be read as globs or as pathspec magic and would silently widen or narrow the set.

**Why the scoped diff is pinned against ambient rendering config.** Its *bytes* are hashed, so anything
that changes how git renders a patch changes the digest. `--no-ext-diff` and `--no-textconv` are
required: an external diff driver or a `textconv` filter can render two different byte sequences
identically — fail-open — and either can be introduced via `.gitattributes` between write and read.
`--no-color` keeps the digest independent of a terminal. Writer and reader use the **byte-identical**
invocation.

**Why the contract set is still enumerated by rule at read time.** `footprint.contract` is recorded for
attribution only. Were `contractDigest` to iterate the frozen list instead, a `spec.md` delta **added**
after the write would be invisible to the reader — a file the review never saw and never approved would
escape the digest entirely. Re-enumerating by rule keeps the v1 property that creating or deleting a
contract member moves the digest.

**The one-revision `git diff` rule**, which applies to **both** the `--name-only` capture and the scoped
`trackedDigest` diff. Each is written with **neither `..` nor `...`** — a single revision argument, which
diffs the merge base against the **working tree** (staged *and* unstaged). This is mandatory, not
stylistic: ptp never commits during apply or review, so the reviewed work is *uncommitted*. Both
`git diff <mergeBase>..HEAD` and `git diff <mergeBase>...HEAD` are **commit-to-commit** forms that omit
the working tree entirely, and so carry **none** of the state this fingerprint must describe. Never use
them here.

**The review contract set** (paths relative to `openspec/changes/<change-id>/`): `tasks.md`,
`proposal.md`, `design.md`, and every `specs/**/spec.md`. A member of the fixed three that does not exist
contributes `<relpath>\0<absent>`, so creating or deleting one moves the digest.

**Direct hashing, not git, for the contract set.** `contractDigest` is computed by hashing those files'
bytes directly. In a repository where `openspec/` is gitignored — as it is in this one — `git diff`,
`git status`, and `git ls-files --others --exclude-standard` are all blind to a `tasks.md` edit, so a
git-derived signal could not see the very edit the fingerprint most needs to catch. Direct hashing is
also correct where `openspec/` *is* tracked: the same bytes are simply hashed twice (once inside
`trackedDigest`, once in `contractDigest`), which is harmless.

**Exclusions.**

- **`HEAD` is not an input.** A commit that changes no bytes leaves the reviewed content identical;
  including `HEAD` would invalidate a still-valid marker for free. `mergeBase` **is** an input, because a
  rebase changes what "the diff" means.
- **Every marker directory is excluded, at capture.** A marker is never reviewed content, so **no** path
  under **any** `openspec/changes/*/stages/` — not merely this change's own — may enter `codeTracked`,
  `codeUntracked`, or the contract set. Under v2 this is a **capture-time filter**: the paths are dropped
  while the footprint lists are built, so they are absent from the frozen set and cannot re-enter at read
  time. The reader subtracts nothing, hashing an already-clean recorded list — strictly simpler than v1,
  where writer and reader each had to subtract the same paths from a re-derived set. Where `openspec/` is
  **gitignored** (as here) the code-list filter is a no-op, git being blind to the folder; where
  `openspec/` **is tracked** it does real work. Two reasons, both fatal without it: the write that creates
  or updates `stages/code.json` would itself move the very digests the marker records, a moment after they
  were computed, so the marker could **never** match itself; and a **sibling** marker — another kind's
  under this change, or any marker under **another** change folder, as a multi-story `/ptp:full-apply` run
  writes one per story — would invalidate this marker for a write that changed no reviewed content at all.
  The exclusion removes marker files, and **only** marker files, from view, so the predicate is
  **narrowed, never weakened**: a marker still cannot survive any edit to any reviewed file.
- **`TLDR.md`, `brainstorm.md`, and `effort.md` are excluded** — none is loaded by a code review (step
  (b) names the contract as proposal / design / tasks / spec deltas), so their churn must not force a
  re-review.

**Scope: the change's own diff footprint.** The claim a code marker makes is, and has always been, *the
content this review evaluated has not moved since the review converged* — never *the working tree is
unchanged*. `trackedDigest` and `untrackedDigest` are therefore scoped to the reviewed change's own
recorded footprint. Content outside it is, by construction, content this review did not evaluate, and it
is covered by the review gate of whatever change owns it; a marker only ever authorizes skipping a review
**for its own change**.

The whole-tree scope of `version: 1` was a **defect, not the expected shape**. It implemented the
stronger statement only because nothing recorded which paths a review covered, and it produced two
sibling bugs: across epics, `/ptp:backlog-run`'s shared, never-committed branch let one epic's apply
destroy an earlier epic's converged proof, so `/ptp:backlog-continue` re-ran a full dual-reviewer review
over byte-identical content; and inside one epic, a multi-story `/ptp:full-apply` invalidated every
story's marker but the last — the concession `skills/ptp-full-apply/SKILL.md` used to carry. Recording
the path set removes both without weakening the gate: every edit inside the footprint, every contract-set
edit, and every merge-base move still deny.

**The residual, named rather than left implicit.** "Covered by whatever change owns it" answers a file
owned by a *different* change. It is circular for a **brand-new file added to _this_ change after its own
marker was written**: that file is outside the frozen footprint, its owner is this change, and this
change's gate is the very marker being consulted, so no digest denies on its account. The residual is
real and it is accepted, for two reasons beyond the circular sentence. First it is **bounded**: capture
happens at the last possible moment, so the residual can only be opened by work performed *after* a
converged review — out-of-band work by construction. Second it is **covered in practice** by
`contractDigest`, which is enumerated by rule and includes `tasks.md`: any implementation work on this
change flips a `- [ ]` to `- [x]` or adds a spec delta, either of which moves that digest and denies.
What escapes is only a source edit made with no accompanying change-folder edit at all. Closing it would
reinstate exactly the repo-wide scope this algorithm removes, so the trade is taken deliberately.

**Read-time recomputation.** Given a marker with `fingerprint.version == 2`:

1. Read `fingerprint.footprint`'s three arrays **as recorded**. Do not re-run `git diff --name-only`, do
   not re-run `git ls-files`, do not re-derive or re-sort into a different order, do not subtract
   exclusions.
2. Resolve `baseBranch` and `mergeBase` **fresh** (per `ptp-branch-guard` and
   `git merge-base HEAD <baseBranch>`). A moved merge base changes what "the diff" means and must deny —
   it does so as a plain scalar mismatch.
3. Recompute `footprintDigest` from the recorded arrays, `trackedDigest` and `untrackedDigest` over
   exactly those arrays, and `contractDigest` by re-enumerating the contract set **by rule**.
4. Recompute `value` and compare it to the recorded `value`.

A reader that cannot complete any step — no git, no merge base, a command error — treats the marker as
**ineligible** (the *Fail-closed* rule under **## Code-marker skip eligibility**), never as matching.

**Ordering.** The fingerprint is computed **after the run's final fix edit and final verification**,
immediately before the marker write, so it describes the state the reviewer signed off — never an
intermediate one.

**Failure — uncomputable, which is never the same as empty.** The fingerprint is **uncomputable** iff any
capture or digest command failed (no git, a detached state with no merge base, a command error, an
unreadable file) **or** a captured path carries an LF byte **or** a captured path is not valid UTF-8. In
that case the writer **still writes the marker**, omitting the `fingerprint` field **entirely**, and
notes the omission; the terminal state the review reached is unchanged either way. There is no partial
fingerprint and no fabricated one, and an **empty** footprint is never substituted for an uncomputable
one — an empty footprint means every command succeeded and returned no paths, and its digests are well
defined. Every reader treats an absent or malformed fingerprint as **not skip-eligible**.

The two non-exit-status triggers are not exceptions to that rule: each is a deterministic, one-pass
property of the captured bytes, checkable identically by writer and reader, and each exists because the
LF-joined serializations and the marker's JSON respectively cannot represent such a path unambiguously.
A capture that succeeds but is merely *suspected* incomplete has **no** third disposition — exit status
is the test — and nothing may be added to that disjunction without the same standard of proof: a
mechanical, writer-and-reader-identical test, never an inference about completeness.

## Code-marker skip eligibility

A caller MAY skip an otherwise-mandatory `/ptp:review-full` for a change **only** when all six of the
following hold, evaluated **at the moment the review would have been invoked**:

1. `openspec/changes/<change-id>/stages/code.json` exists, is readable, parses as JSON, and its `kind`
   is exactly `"code"`.
2. Its `terminalState` is `"converged"`. A `"cap-reached"` marker NEVER authorizes a skip. `gateState` is
   reported but never *decides* **this condition**: a `"PHASE1_DONE_CODEX_SKIPPED"` marker **satisfies
   condition 2**, that state already being a green, gate-success terminal state under `ptp-codex-mode`.
   Whether its single reviewer is *enough* is not asked here — reviewer sufficiency is decided solely by
   **condition 6**.
3. It carries a **well-formed** `fingerprint` whose `version` and `algorithm` the reader
   **recognizes** — well-formed meaning the whole object this skill defines is present: `version`,
   `algorithm`, `value`, a `footprint` object carrying all three lists by name (`codeTracked`,
   `codeUntracked`, `contract` — **any of which may be empty**), and an `inputs` object carrying all six
   component entries by name (`baseBranch` and `mergeBase`, which are a branch name and a commit id
   rather than digests, plus `footprintDigest`, `trackedDigest`, `untrackedDigest`, and
   `contractDigest`). A fingerprint that is merely *partial* — most plausibly one carrying `value` but no
   `inputs`, or one carrying `inputs` but no `footprint`, which leaves the reader unable to recompute
   over the writer's path set — is **malformed**, and the *Fail-closed* rule below already makes a
   malformed fingerprint ineligible; this condition simply says where that test is applied. The check is
   cheap and it is what keeps condition 4's mismatch **attributable**: the reporting obligation names the
   component that changed, which is unanswerable without `inputs`.

   A reader implementing this skill recognizes `version: 2` **only**. `version: 1` — the superseded
   algorithm, whose `trackedDigest` and `untrackedDigest` were repo-wide — is therefore an
   **unrecognized version**, and the *Fail-closed* rule makes such a marker ineligible with **no error,
   refusal, or halt**: the review simply runs, exactly as it would without any marker. No v1 marker is
   migrated, rewritten, or recomputed.
4. The fingerprint **recomputed at check time**, per **## Code-marker fingerprint**, equals the recorded
   `value`. The recomputation uses the marker's **recorded** `footprint` as its path set — never one
   re-derived at check time — and enumerates the contract set **by rule**.
5. `rank(marker.minSeverity, an absent field read as "low") <= rank(the currently resolved
   review.minSeverity)` — a run that converged at a stricter floor proves the looser requirement; the
   converse does not hold.
6. The marker's `reviewers` set is **sufficient for the reviewer set a `/ptp:review-full` invoked at this
   moment would run**, per `ptp-codex-mode`'s decision contract **resolved at check time** — the
   **whole** contract, which means resolving `{ main, reviewer }` per `ptp-agent-roles` **first** and
   only then, **iff the resolved reviewer is Codex**, both halves of the mode gate: the layered
   `codex.mode` value **and**, under `auto`, the `codex` CLI-presence test it already specifies. That
   resolution is performed **when the marker is evaluated**, and is NEVER a role, mode, or CLI verdict
   cached from the marker's write, stamped into the marker, or inferred from it: every part of it can
   change between the write and this check, and it is the **current** requirement the skip must satisfy.
   Sufficiency is defined by the **number of phases** that contract yields, never by the mode string —
   and the mode string alone does not yield it, `ptp-codex-mode`'s *Composition rule* gating the
   reviewer phase **iff the reviewer is Codex**:

   - **Two phases** — the default `roles.main = claude` direction (reviewer = Codex) at
     `codex.mode = required`, and at `codex.mode = auto` with the `codex` CLI **present** on PATH;
     **and, unconditionally, the `roles.main = codex` direction**, where the reviewer is Claude, is
     **never** gated, and `codex.mode` is **not consulted for the reviewer gate at all** — so a review
     invoked now runs both phases there even at `codex.mode = off` or with `codex` absent from PATH.
     All of these require `reviewers` to contain **both** `"superpowers"` and `"codex"`, the two agents
     a completed two-phase run always comprises in either `roles.main` direction. **No** single-reviewer
     marker qualifies: neither the `["superpowers"]` `"LOOP_DONE"` a standalone `/ptp:review-loop`
     writes, nor the `["codex"]` `"LOOP_DONE"` a standalone `/ptp:codex-review-loop` writes, nor a
     `"PHASE1_DONE_CODEX_SKIPPED"` marker written while the CLI was absent — a lone `"codex"` being no
     more sufficient than a lone `"superpowers"`, what is required being **both phases** and not merely
     the Codex one.
   - **One phase** — reachable **only** in the `roles.main = claude` direction, where the reviewer is
     Codex and the mode gate therefore applies: `codex.mode = off`, and `codex.mode = auto` with the
     `codex` CLI **absent**, both of which make a single-reviewer terminal state the run's own green
     outcome — accepts a single-reviewer marker, preserving `"PHASE1_DONE_CODEX_SKIPPED"` eligibility in
     exactly that narrowed form. Reading `codex.mode = off` as one phase **without** first resolving the
     role would reopen, under `roles.main = codex`, precisely the gate-weakening this condition exists
     to close.

   **The role-resolution step above is a narrowing refinement of the `review-loop` capability's
   condition-6 wording, recorded here rather than left silent** — and, with the marker-directory
   exclusion carried by the capability **as change `0054_01` amends it**, the **only** such divergence
   left in this skill; **## Code-marker fingerprint** restates the capability rather than refining it.
   The condition-6 requirement enumerates the one-phase case as
   `codex.mode = off` and `auto`-with-`codex`-absent without qualifying the `roles.main` direction;
   taken literally it would admit a single-reviewer marker under `roles.main = codex`, where
   `ptp-codex-mode` never consults the mode for the reviewer gate and a review invoked now runs **both**
   phases regardless. The refinement only ever **narrows** eligibility, so it can weaken no gate. **The
   capability text should be amended to resolve the role first**; until it is, **this section is the
   operative predicate**.

   **`reviewers` is the load-bearing field; `gateState` stays reported-never-deciding.** "Only
   `BOTH_PHASES_DONE` qualifies under a two-phase mode" is therefore a **consequence** for the markers
   this skill's writers can produce, not a second test. A marker whose `gateState` and `reviewers`
   disagree is producible by no writer defined here; should one appear, `reviewers` decides.

**Fail-closed.** Any other outcome — absent, unreadable, malformed, wrong-`kind`, `cap-reached`,
fingerprint-less, unrecognized-version, mismatched, weaker-floor, or **reviewer-insufficient** for the
reviewer set a review invoked now would run — makes the marker **ineligible**,
and an ineligible marker causes the review to run **exactly as it does without this feature**.
Ineligibility is never an error, never a refusal, never a halt, and is never reported as a failure. The
worst outcome of any bug in this check is the status quo.

**Read-only.** Evaluating eligibility NEVER writes, repairs, overwrites, or deletes a marker. Producing a
marker is the reviewer's job, not the reader's.

**Reporting obligation.** A caller that skips a review on this basis MUST report the skip explicitly,
naming the marker's `timestamp`, `reviewers`, `gateState`, and `minSeverity`, and MUST NOT report a
review as having run in that invocation, nor flatten a `PHASE1_DONE_CODEX_SKIPPED` marker into a plain
both-phases run. A caller that finds an ineligible marker MUST name the reason it was ineligible
alongside the review that consequently ran — including **reviewer insufficiency for the reviewer set
resolved at check time** (naming the resolved `roles.main` direction and, where the mode gate applied,
the resolved `codex.mode`), when that is the failing condition.

## Per-iteration steps

Execute the following steps for each iteration:

### (a) Increment and cap check

Increment `iteration`. If `iteration > MAX_ITERATIONS`, **abort** — go to the `ITERATION CAP REACHED` terminal state.

### (b) Review pass

Dispatch to the correct reviewer based on `(kind, reviewer)`. Every `codex exec` invocation below is
assembled per the `ptp-codex-mode` canonical flag-append rule (append resolved `-m <model>` /
`-c model_reasoning_effort=<effort>` before the trailing `-` when `codex.model` /
`codex.reasoningEffort` are set; both unset ⇒ the literal `codex exec -s read-only -` shown here):

- `superpowers` / `code` — invoke the `superpowers:requesting-code-review` skill. Load the contract (`proposal.md`, `design.md`, `tasks.md`, `specs/**/spec.md`) and the merge-base diff (`git merge-base HEAD master` → `git diff <base>...HEAD`) and pass them as context.
- `codex` / `code` — run the `codex-review.md` protocol inline: read the contract yourself (you, via Read), capture the merge-base diff (you, via Bash), run `npx -y openspec validate <change-id> --strict` and any relevant tests yourself (you, via Bash), build a single closed-book prompt with all of this inlined, and pipe it to `codex exec -s read-only` over stdin. Do NOT pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`. Codex runs NO `npx` / network / install commands.
- `superpowers` / `artifact` — run the `review-plan.md` rubric inline: check existence & validation, `proposal.md` completeness, cross-artifact consistency, spec-delta format, `tasks.md` quality (including the banned-manual-task check), reasoning depth, and `TLDR.md` sanity.
- `codex` / `artifact` — run the `codex-review-plan.md` closed-book protocol inline: read all artifacts yourself (you, via Read), run `npx -y openspec validate <change-id> --strict` yourself (you, via Bash), collect cited source excerpts (you, via Read/Grep), build a single self-contained prompt, and pipe to `codex exec -s read-only` over stdin. Codex runs NO commands.
- `superpowers` / `brainstorm` — run the `ptp-review-brainstorm` rubric inline over the located `brainstorm.md` (existence & non-placeholder; ≥2 real options with the four tradeoff axes plus spec-interaction; recommendation with rationale; assumptions; scope/blast-radius; spec interaction; usable handoff to `/ptp:plan`). A missing `brainstorm.md` is recorded as a Critical "no brainstorm to review" finding inside this pass (the loop cannot fix it). Do NOT re-author the rubric here — it lives in `ptp-review-brainstorm`.
- `codex` / `brainstorm` — run the `codex-review-plan.md` closed-book protocol inline, **retargeted to `brainstorm.md`** and with **NO** `openspec validate` (a brainstorm precedes any proposal/spec, so there is nothing to validate): read `brainstorm.md` and any cited context yourself (you, via Read), build a single self-contained prompt carrying the brainstorm rubric as the audit instructions plus the full brainstorm text and any cited source excerpts, and pipe it to `codex exec -s read-only` over stdin. Codex runs NO commands (no `npx`, no `openspec validate`, no network, no installs). As with the Superpowers variant, a missing `brainstorm.md` is recorded as a Critical "no brainstorm to review" finding inside this pass (the loop cannot fix it) — do not attempt to build a Codex prompt over an absent file.
- `superpowers` / `prd` — run the `ptp-review-prd` rubric inline over the resolved PRD file `openspec/changes/<id>/prd.md` (PRD existence & non-placeholder; all schema sections present; requirements split functional/non-functional and trace to goals; testable acceptance criteria; scope/non-goal consistency; measurable goals; real Dependencies/Risks/Open questions). A missing PRD file is recorded as a Critical "no PRD to review" finding inside this pass (the loop cannot fix it). Do NOT re-author the rubric here — it lives in `ptp-review-prd`. (Used by slice 2's `/ptp:review-prd-full` orchestrator; documented now so the kind is complete.)
- `codex` / `prd` — run the `codex-review-plan.md` closed-book protocol inline, **retargeted to the PRD file `openspec/changes/<id>/prd.md`** and with **NO** `openspec validate` (a PRD precedes any proposal/spec, so there is nothing to validate): read the PRD file and any cited context yourself (you, via Read), build a single self-contained prompt carrying the PRD rubric as the audit instructions plus the full PRD text and any cited source excerpts, and pipe it to `codex exec -s read-only` over stdin. Codex runs NO commands (no `npx`, no `openspec validate`, no network, no installs). As with the Superpowers variant, a missing PRD file is recorded as a Critical "no PRD to review" finding inside this pass (the loop cannot fix it) — surface the missing-PRD note in the prompt in place of the PRD text rather than building a Codex prompt over an absent file.

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

Invoke `superpowers:receiving-code-review` and apply its rigor: for every candidate finding, read the actual code or artifact at the cited location and judge whether it is a real defect.

- `CONFIRMED` → this finding will be fixed in step (g).
- `REJECTED` → append its stable key to `rejected_findings`. It does NOT count against convergence.

### (f) Exit check

If there are zero `CONFIRMED` **in-scope** findings this iteration → proceed to the **DONE** terminal
state. Below-threshold findings never enter this count, so a review pass that returns nothing at or
above `MIN_SEVERITY` converges immediately (having fixed nothing) — with the below-threshold list
rendered in the terminal report.

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

### (h) Verify

Run a cheap, fast verification appropriate to `kind`:

- `kind=code` → tests, lint, and typecheck for the files touched this iteration.
- `kind=artifact` → `npx -y openspec validate <change-id> --strict`.
- `kind=brainstorm` → **N/A** — run **NO** `openspec validate` (a brainstorm precedes any proposal/spec, so there is nothing to validate). Record `verify = N/A (brainstorm precedes any spec)` in `per_iteration_summary`.
- `kind=prd` → **N/A** — run **NO** `openspec validate` (a PRD precedes any proposal/spec, so there is nothing to validate). Record `verify = N/A (PRD precedes any spec)` in `per_iteration_summary`.

A failing verification is **reported in `per_iteration_summary`** but does NOT abort the loop — the next review iteration will pick up regressions. The iteration cap is the backstop.

Append a summary entry to `per_iteration_summary`: iteration number, findings-confirmed count, findings-rejected count, carry-over count, **below-threshold count** (the size of this iteration's `below_threshold` bucket from (c2) — `0` on every run at the default `low`), fixes applied, verification result, and — for an iteration that reached step (g) — the **evaluated `fixTarget`** (lowercase `{model}.{effort}`), whether it was **defaulted** to `opus.high` because the evaluation failed, the resolved **`fixDispatch`** mode, and whether the target was **fully honored**. An iteration that never reached step (g) records **no** fix target rather than a fabricated or carried-over one.

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

Used to match findings across iterations for carry-over rejection deduplication.

**For `kind=code`:**

```
key = {
  normalized_repo_path: path with backslashes normalised to forward slashes,
  line_range_bucket:    round(first_cited_line / 5) * 5,   // tolerates small drift
  severity:             Critical | High | Medium | Low,
                        // fail-safe case only: an unrankable finding records the reviewer's raw
                        // label verbatim, or `<unlabeled>` when none was emitted
                        // (see ## Severity threshold)
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

**For `kind=prd`:** reuse the `kind=artifact` key with `artifact_filename = "prd.md"` (the constant PRD basename; plus the nearest enclosing `section_heading` and the truncated `summary`). Like artifact keys, it uses no line numbers so findings deduplicate across iterations as section headings renumber. The missing-PRD Critical finding has no enclosing heading, so it uses the sentinel `section_heading = "<missing file>"` — `artifact_filename` + this sentinel + its constant `summary` stay stable across iterations, so the unfixable finding deduplicates correctly until the iteration-cap backstop.

## Terminal states

### DONE

Reached when step (f) finds zero CONFIRMED **in-scope** findings for the current iteration.

Report:

1. **Per-iteration summary table** — one row per iteration: iteration number, confirmed, rejected, carry-over, **below-threshold**, fixes applied, verification result, **fix target** (the evaluated `fixTarget`, marked when it was defaulted to `opus.high`), **fix dispatch** (the resolved `fixDispatch` mode), and **fully honored** (yes / no). An iteration that never reached step (g) leaves the three fix columns empty rather than carrying a value over. Every iteration whose target was not fully honored also carries the mandatory **divergence line** from step (h).
2. **Total findings fixed** across all iterations.
3. **Rejected / carry-over set** — list every stable key that was rejected or carried over, with the rejection reason from step (e) or `(carry-over)`.
4. **Below threshold — not blocking convergence (minSeverity = `<value>`)** — the below-threshold
   findings of the **last completed review pass** (the same snapshot the `ITERATION CAP REACHED`
   "Open findings" section uses), each carrying its severity label and the literal `(unconfirmed)`
   marker:

   ```
   Below threshold — not blocking convergence (minSeverity = high)
     - [Medium] design.md § Data flow — "cache invalidation order is implied, not stated"  (unconfirmed)
     - [Low]    tasks.md § 3 — "task 3 wording is ambiguous"                               (unconfirmed)
   ```

   The `(unconfirmed)` marker is mandatory: these findings never passed
   `superpowers:receiving-code-review`, so presenting them as verified defects would misrepresent
   them. When the bucket is empty — which is every run at the default `low` — render the literal
   word `None`, so a reader can distinguish "nothing below threshold" from an author omission. This
   section is rendered **before** the next-command recommendation, so a `DONE` with a non-empty
   bucket is never misread as "the reviewer found nothing".
5. **Next command**:
   - `kind=code`     → `/ptp:archive <change-id>` (or `/ptp:status` first).
   - `kind=artifact` → `/ptp:apply <change-id>` if not yet implemented; `/ptp:review-plan <change-id>` for a post-apply artifact check. (Recommend these to the user — do not invoke them.)
   - `kind=brainstorm` → `/ptp:plan <change-id>` (the brainstorm is sound; proceed to author the OpenSpec artifacts). (Recommend it to the user — do not invoke it.)
   - `kind=prd` → `/ptp:plan <change-id>` (the PRD is sound; proceed to author the OpenSpec artifacts — `<change-id>` is the epic's lowest-numbered story id). (Recommend it to the user — do not invoke it.)

**Marker write (after the report above).** For **every** kind, write the per-kind marker
(`brainstorm`→`stages/brainstorm.json`, `artifact`→`stages/plan.json`,
`prd`→`openspec/changes/<id>/stages/prd.json`, `code`→`stages/code.json`) per the
**## Review-convergence marker** section, with `terminalState: "converged"`, `reviewers` = the
reviewer(s) that ran this loop run, `iterations` = the final `iteration` value, `minSeverity` = the
effective resolved `MIN_SEVERITY` for this run (lowercase canonical), and `timestamp` = now (UTC
ISO-8601). For `kind = code` additionally record `gateState: "LOOP_DONE"` (a standalone loop run has no
two-phase gate) and the `fingerprint` computed per **## Code-marker fingerprint** after the final fix
edit and verification, immediately before the write — omitting the field entirely if it cannot be
computed. Use the atomic write-temp-then-rename protocol. **Skip the write when invoked with
`deferMarker = true`** (a `-full` phase) — instead return the terminal outcome
(`terminalState = converged`, `reviewer`, `iterations`, `minSeverity`) to the orchestrator, which performs the single
combined write. A marker-write failure is reported but does NOT change the terminal state (the review
already happened).

### ITERATION CAP REACHED

Reached when step (a) increments `iteration` past `MAX_ITERATIONS` (the resolved cap).

Report:

1. **Open findings** — every finding from the last completed review that is still CONFIRMED and unfixed.
2. **Rejected / carry-over set** — same as DONE.
3. **Below threshold — not blocking convergence (minSeverity = `<value>`)** — same section, same
   format, and the same `(unconfirmed)` marker and `None`-when-empty rule as DONE, sourced from the
   **same snapshot** as the "Open findings" section above (the last completed review pass).
4. **Per-iteration summary table** — including the **below-threshold** column and the **fix target**
   (`fixTarget`) / **fix dispatch** (`fixDispatch`) / **fully honored** columns, with the same empty-when-step-(g)-was-never-reached
   rule and the same mandatory **divergence line** for every iteration whose target was not fully
   honored, exactly as in `DONE`.
5. Explicit statement: "Do not archive. Do not run `/ptp:apply`. Inspect the open findings manually and decide next steps."

**Marker write (after the report above).** For **every** kind, write the per-kind marker
(`brainstorm`→`stages/brainstorm.json`, `artifact`→`stages/plan.json`,
`prd`→`openspec/changes/<id>/stages/prd.json`, `code`→`stages/code.json`) per the
**## Review-convergence marker** section, with `terminalState: "cap-reached"` and the same `kind` /
`reviewers` (the reviewer that ran) / `iterations` (the cap value) / `minSeverity` (the effective
resolved `MIN_SEVERITY` for this run, lowercase canonical) / `timestamp` (now, UTC ISO-8601) fields. For
`kind = code` additionally record `gateState: "LOOP_CAP"` and the `fingerprint` computed per
**## Code-marker fingerprint** immediately before the write, omitting the field entirely if it cannot be
computed; such a marker authorizes no skip (condition 2 of **## Code-marker skip eligibility** rejects
it), it simply records the last review that ran and how it ended. Use the atomic write-temp-then-rename
protocol. **Skip the write when invoked with `deferMarker = true`**
(a `-full` phase) — instead return the terminal outcome (`terminalState = cap-reached`, `reviewer`,
`iterations`, `minSeverity`) to the orchestrator, which performs the single combined write. A marker-write failure is
reported but does NOT change the terminal state.

## Hard rules

- **Never archive** the change, no matter the outcome.
- **Never invoke `/ptp:apply`** — not in the fix pass, not in the terminal report.
- **Never auto-commit** any edits made during the loop.
- **Never fix an unconfirmed finding.** If step (e) marks a finding `REJECTED`, leave the code/artifact alone.
- **Never auto-fix a below-threshold finding, and never silently drop one.** A finding ranked under `MIN_SEVERITY` by step (c2) is reported — in the per-iteration below-threshold count and, for the last completed review pass, individually in both terminal reports — but is never confirmed, never edited, and never counted toward convergence. Reporting it is mandatory: omitting it is a violation of this rule, not an optimization.
- **Never silently absorb a partially-honored fix target.** Under `fixDispatch = inline` the model half of `fixTarget` cannot be honored; the divergence is reported in the iteration summary and in both terminal reports. Emitting it is mandatory — omitting it is a violation of this rule, not an optimization.
- **Never spawn from inside the loop under `fixDispatch = inline`** — a second Agent-nesting level throws.
- **Never persist loop control state to disk.** `iteration`, `rejected_findings`, and `per_iteration_summary` live only in conversation context. This rule does NOT forbid the durable terminal review-convergence marker below — that marker is a deliberate exception and is the loop's only on-disk side effect beyond the artifact edits it already makes.
- **Write the per-kind review-convergence marker on terminal states for every kind** (`brainstorm`→`stages/brainstorm.json`, `artifact`→`stages/plan.json`, `prd`→`openspec/changes/<id>/stages/prd.json`, `code`→`stages/code.json`), per the **## Review-convergence marker** section, with a `kind = code` marker additionally carrying `gateState` and — when computable — the `fingerprint` from **## Code-marker fingerprint**. **Never** write a marker when invoked with `deferMarker = true` (the `-full` orchestrator performs the single combined write). The marker is written via the atomic write-temp-then-rename protocol; a marker-write failure is reported but does not change the terminal state.
- **Never skip a review on anything but an eligible marker.** The six conjunctive conditions in **## Code-marker skip eligibility** are the only basis for skipping an otherwise-mandatory code review, evaluating them never mutates a marker, and any ineligible outcome runs the review exactly as it would without a marker. Condition 6 in particular is resolved against `ptp-codex-mode`'s decision contract **at check time**, never against a mode carried by the marker.
- **Iteration cap is resolved from `review.maxIterations` (layered config, default 5).** There is no `--max-iterations` CLI flag. If the cap is hit, report and stop — do not silently increment past it.
- **Codex variants** (`reviewer=codex`) must run `codex exec -s read-only` with the full prompt piped over stdin (`-`), assembled per the `ptp-codex-mode` flag-append rule (append resolved `-m <model>` / `-c model_reasoning_effort=<effort>` before the trailing `-` when configured). Never pass `--full-auto`, `--sandbox workspace-write`, or `--dangerously-bypass-approvals-and-sandbox`.
- **The caller runs `openspec validate` (for `kind=code` / `kind=artifact` only — never for `kind=brainstorm` or `kind=prd`, which each precede any proposal/spec) and all file reads for Codex** — Codex executes no `npx`, no network, no install commands. The closed-book / inlined-diff protocol from `codex-review.md` / `codex-review-plan.md` applies.
