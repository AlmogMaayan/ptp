---
name: ptp-codex-mode
description: Own Codex mode resolution, model and effort resolution, and the reviewer gate each dual-reviewer step reads
---

# ptp-codex-mode — resolve `codex.mode` and gate the Codex phase

## Purpose

ptp's dual-reviewer flow runs a main-agent review loop and then a Codex review loop. Whether the
Codex loop runs at all is governed by `codex.mode` (`auto` default | `required` | `off`). This skill
is the **single source of truth** for (1) resolving that mode from layered config and (2) deciding
whether a given dual-reviewer step runs its Codex phase — the same "the skill owns the rule" pattern
as `ptp-branch-guard` (branch safety) and `ptp-change-selector` (id grammar). The four orchestrators
**reference** this skill instead of each restating the resolution + skip logic, which would
otherwise drift six ways.

This skill is the **reader/consumer** counterpart to `ptp-config` (the *writer* of `codex.mode`) and
to the README §Configuration table (the *schema*). It changes no config and adds no keys.

## Which steps consult this skill

**Mode-gated — they ask this skill whether to run their Codex phase:**

`/ptp:review-full`, `/ptp:review-plan-full`, `/ptp:review-brainstorm-full`, `/ptp:review-prd-full`,
`/ptp:full`, `/ptp:full-apply`, `/ptp:brainstorm-full`, `/ptp:prd-full` (and the skills behind them:
`ptp-full`, `ptp-full-apply`, `ptp-review-brainstorm-full`, `ptp-review-prd-full`, `ptp-brainstorm-full`,
`ptp-prd-full` — the brainstorm/PRD `-full` orchestrators run a `-full` review as their Phase B, which
consults this skill).

**NOT gated — the explicit `/ptp:codex-*` commands** (see *Explicit-override rule* below): invoking
them is itself the opt-in to Codex, so they bypass the mode gate entirely and are listed here only
to record that they do.

## Resolution (mirror `ptp-deploy:60-74`)

### Codex mode resolution

Read and merge the optional ptp config — global `~/.claude/ptp/config.json` first, then project
`<repo>/.claude/ptp/config.json` overriding **key-by-key** (the same two files and precedence
`ptp-deploy` uses for its `deploy` block, and that `ptp-config` writes). Extract `codex.mode`:

```
mode = "auto"                                # default
for path in [ ~/.claude/ptp/config.json,     # global first
              <repo>/.claude/ptp/config.json ]:   # then project (overrides)
    if file exists and parses as JSON and obj.codex?.mode ∈ {auto, required, off}:
        mode = obj.codex.mode
# any missing file / missing key / parse error / out-of-enum value → leave the prior value
# (ultimately "auto" if nothing valid is found) — never throw, never STOP
```

**Reader posture: never crash, never STOP over a config typo.** A missing file, a missing key,
unparseable JSON, or an out-of-enum value all resolve to `auto` (or to whatever the prior layer
validly set). This is identical to how `ptp-deploy` reads its `deploy` block. (Contrast `ptp-config`,
the *writer*, which refuses to overwrite a malformed file — the reader tolerates, the writer
protects.)

## Resolving `codex.model` (mirror the `codex.mode` resolution above)

Read the same two layered files in the same order — global `~/.claude/ptp/config.json` first, then
project `<repo>/.claude/ptp/config.json` overriding. Extract `codex.model`:

```
model = unset                                # default
for path in [ ~/.claude/ptp/config.json,     # global first
              <repo>/.claude/ptp/config.json ]:   # then project (overrides)
    if file exists and parses as JSON and obj.codex?.model is a non-empty string:
        model = obj.codex.model
# any missing file / missing key / parse error / wrong type / empty string → leave the prior value
# (ultimately unset if nothing valid is found) — never throw, never STOP
```

`codex.model` is valid only when it is a non-empty string; an empty string, wrong type, missing key,
missing file, or unparseable JSON leaves the prior value (ultimately unset). Same forgiving reader
posture as `codex.mode`: never crash, never STOP over a config typo.

## Resolving `codex.reasoningEffort` (mirror the `codex.mode` resolution above)

Same two layered files, same order and override rule. Extract `codex.reasoningEffort`:

```
effort = unset                               # default
for path in [ ~/.claude/ptp/config.json,     # global first
              <repo>/.claude/ptp/config.json ]:   # then project (overrides)
    if file exists and parses as JSON and obj.codex?.reasoningEffort ∈ {minimal, low, medium, high}:
        effort = obj.codex.reasoningEffort
# any missing file / missing key / parse error / out-of-set value → leave the prior value
# (ultimately unset if nothing valid is found) — never throw, never STOP
```

`codex.reasoningEffort` is valid only when it is exactly one of `minimal|low|medium|high`; an
out-of-set value leaves the prior value (ultimately unset if no layer set a valid value), mirroring
`codex.mode`'s out-of-enum handling — a later layer's invalid value never clears an earlier layer's
valid value.

**`codex.model` and `codex.reasoningEffort` resolve independently.** One MAY be set while the other
is unset; each is read and validated on its own — setting one never implies or requires the other.

## Canonical Codex invocation flag-append rule

Every ptp call site that runs a **read-only** `codex exec` — the Codex reviewer and the
`/ptp:codex-*` overrides — MUST assemble its invocation via this single rule rather than restating
it. (The one exception is the **write-capable main-implementer** invocation owned by
`ptp-run-at-model` when `roles.main = codex`, a distinct `workspace-write` call site with its own
invocation — see the *Scope fence* below; it is not a reviewer and does not use this read-only
rule.)

```
codex exec -s read-only [ -m <model> ] [ -c model_reasoning_effort=<effort> ] -
```

- Append `-m <model>` **iff** `codex.model` resolves to a set value.
- Append `-c model_reasoning_effort=<effort>` **iff** `codex.reasoningEffort` resolves to a set value.
- Both flags, when present, go **before** the trailing stdin marker `-`.
- Always keep `-s read-only`. Never add `--full-auto`, `--sandbox workspace-write`, or
  `--dangerously-bypass-approvals-and-sandbox` — this rule never loosens the sandbox.
- The prompt is still piped via `printf '%s' "$PROMPT" | codex exec … -`.
- Model ids and effort words are single, space-free tokens (e.g. `gpt-5.6`, `high`) — no extra shell
  quoting is needed beyond what the call site already does for the rest of the command.
- **Both keys unset** (the default) yields exactly `codex exec -s read-only -` — byte-identical to the
  invocation before this change.

**The one telemetry relaxation (`0032_06_codex-telemetry`).** Historically this rule added **nothing**
for telemetry, so a constructed command line was byte-identical with telemetry on or off.
`0032_05_codex-telemetry-scope-spike`'s decision record **explicitly decided** one narrow relaxation, and
it is inherited here as a decided trade rather than a silent exception: repeated **`-c` arguments
confined to the `otel.*` key space** MAY be appended — **no environment variable, no configuration file,
and no key outside `otel.*`** — and **only when telemetry is on**. Concretely, they are appended only
when **both** hold:

1. `telemetry.mode` resolves to `on` (per `ptp-telemetry` [config-resolution]); **and**
2. the repository-scoped ptp telemetry-consent record records consent (per `ptp-telemetry` [codex-consent-record]).

With either condition unmet the appended set is **empty** and the command line is **byte-identical** to
the pre-change one — which is the property the invariant was really protecting. The exact rendering is
pinned once in `ptp-telemetry` [codex-canonical-rendering] and is **not** restated here; the arguments go **before** the
trailing stdin marker `-`, alongside the model/effort flags. Nothing else about the invocation changes:
no model, no prompt, no sandbox, no approval policy, no tool surface. The recorded case *against* the
relaxation is on the record too — those arguments are visible in any process listing and in Codex's own
session record — and `ptp-telemetry` [codex-consent-record] requires that exposure be disclosed in the consent text.

**Both `codex exec` call sites, one rule.** Like the `codex.model` / `codex.reasoningEffort` resolution
owned here, this telemetry-wiring appendix is **reused by the write-capable main-implementer invocation**
that `ptp-run-at-model` owns (`roles.main = codex`), not only by the read-only reviewer. The *Scope
fence* below is unchanged — this skill still never assembles or governs that invocation — but the
appendix is defined **once**, here, so the two sites cannot drift into two renderings. Telemetry adds no
authority over **whether** either site runs.

**Orthogonality note.** This rule applies to **every read-only** `codex exec` invocation, independent of
`codex.mode`: both the mode-gated dual-reviewer commands (which first ask this skill's decision
contract *whether* to run Codex, then — if running — assemble the invocation via this rule) and the
always-Codex `/ptp:codex-*` explicit-override commands (which skip the mode gate but still assemble
their invocation via this rule). `codex.mode` decides **whether** Codex runs; `codex.model` /
`codex.reasoningEffort` decide **how** it runs once invoked — the two are orthogonal and both apply
together when relevant.

## Telemetry: bracketing a read-only `codex exec` window

Each read-only `codex exec` call site governed by the flag-append rule above is a telemetry **write
point**. The **shelling-out Claude session** brackets the process window with a ledger run carrying
`cli=codex` and `agent_role=codex` (the reviewer row of `ptp-telemetry`'s write-point-keyed table —
distinct from the `agent_role=main` write-capable main-implementer site owned by `ptp-run-at-model`).
That session already knows the epic, the change id, the command, and the exact process window, so
Codex attribution is exact **with zero Codex-side metadata**. Refer to the `ptp-telemetry` skill for
the record shape, the `run_id` rule, and the append protocol; this section lists no ledger fields.

- **Gate first, never fail.** Resolve `telemetry.mode` per `ptp-telemetry`; if it is not `on`,
  **abandon the telemetry bracketing and proceed with the unchanged `codex exec` invocation**
  (`telemetry.mode` never decides whether Codex runs — only `codex.mode` does) — no directory is
  created and no file is touched. When it is `on`, both the
  open (before the process starts) and the close (after it returns) appends are **fire-and-forget**:
  any error is swallowed and the reviewing command proceeds and reports exactly as it would have with
  telemetry off. No write point reads the ledger before writing to it.
- **The canonical flag-append rule above changes only by the one decided relaxation.** The **ledger**
  row is still written by the bracketing session *around* the call, never by altering the call. What
  `0032_06_codex-telemetry` adds is exactly the `-c otel.*` appendix documented with that rule above —
  nothing else — and it is appended only when telemetry is **on** *and* consent is recorded, so the
  constructed command line stays **byte-identical** to the pre-change one in every other state. Both
  keys unset with telemetry off still yields exactly `codex exec -s read-only -`.
- **A mode-skipped Codex phase opens no ledger run and produces no Codex span rows.** When the decision
  contract below resolves to skip Codex (`off`, or `auto` with `codex` absent), no process runs, so no
  run is opened or closed — there is nothing to bracket — and no span is emitted, so the store gains no
  `cli=codex` row either. The *non-silent-skip rule* is unchanged: the skip is still reported as
  `Codex phase skipped (mode=…)`, and telemetry neither adds to nor suppresses that reporting. This is
  rung 1 of `ptp-telemetry` [codex-degradation-ladder]'s degradation ladder; refer to that skill for the record shape and for
  the other rungs (unconfigured, credential-rejected, `required`-with-CLI-absent, `codex mcp-server`)
  rather than restating them here.

## Decision contract (consumed by the four orchestrators)

### Symmetric reviewer-gate invariant

The reviewer gate is **symmetric**: the **MAIN agent's phase always runs; only the REVIEWER
agent's phase is gated.** The main and reviewer agents are those resolved by the `ptp-agent-roles`
skill from `roles.main` — the derived pair `{ main, reviewer }`, where `reviewer` is always the
agent that is not `main`. This skill asks `ptp-agent-roles` who the reviewer is, then branches on
the reviewer identity.

Today's rule ("the main phase always runs; only the Codex phase is gated") is exactly the
special case where `roles.main = claude`, so the main agent is Claude and the reviewer is Codex.
That default direction is specified byte-identically below.

### reviewer = codex (default; `roles.main = claude`)

This is the byte-identical-to-today path. The **main (Claude, non-Codex) phase always
runs**, regardless of mode. Only the **Codex reviewer phase** is gated, by the resolved mode and
(for `required`/`auto`) whether `codex` is on PATH:

| mode | `codex` on PATH? | Action |
|------|------------------|--------|
| `required` | yes | **Run** the Codex phase. |
| `required` | no | **STOP** — tell the user to install Codex or change the mode (`/ptp:config`). This is today's behavior, preserved. |
| `auto` | yes | **Run** the Codex phase (unchanged from before this change — the common path). |
| `auto` | no | **Skip** the Codex phase, run main-only, and report `Codex phase skipped (mode=auto, codex not found)`. |
| `off` | (not probed) | **Skip** the Codex phase without probing PATH, run main-only, and report `Codex phase skipped (mode=off)`. |

Probe PATH with `codex --version`. In `off` mode, do **not** probe — the skip is unconditional.
When the Codex reviewer runs, the `codex.model`/`codex.reasoningEffort` resolution and the
canonical `codex exec -s read-only [ -m <model> ] [ -c model_reasoning_effort=<effort> ] -`
flag-append rule (both above) apply unchanged, as do the non-silent-skip line and the mode-skip
terminal state (both below). All of these — table, probe, skip line, terminal state, flag-append
rule — are identical to their behavior before this change.

### reviewer = claude (`roles.main = codex`)

When the resolved reviewer is Claude, the reviewer phase **is** the PTP review loop and it
**always runs** — mirroring how the main phase always runs in the default direction. For a
Claude reviewer:

- `codex.mode` is **NOT** consulted for the reviewer gate.
- There is **no** `codex --version` PATH probe.
- There is **no** `codex exec` invocation.

Because `codex.mode`/`codex.model`/`codex.reasoningEffort` are not consulted for a Claude
reviewer, neither `off` nor `required` can suppress or force it: `mode=off` does **not** stop a
Claude reviewer (it still runs), and `required` cannot block or force one. Those keys concern the
Codex CLI only.

### Composition rule

`codex.mode` concerns the Codex CLI. It gates the reviewer phase **iff the reviewer is Codex**; it
**never** gates a Claude phase. The reviewer-gate mechanics — the entire `codex.mode` decision
table, the `codex --version` PATH probe, the skip line, and the mode-skip terminal state — apply
**only** on the reviewer=codex branch. (The read-only `codex exec` flag-append rule is **not**
reviewer-gate scoped: per the *Orthogonality note* above it governs **how** any **read-only**
`codex exec` runs — including the always-Codex `/ptp:codex-*` explicit-override commands, which are
unaffected by role resolution — so it applies to every read-only `codex exec` invocation, not only
the reviewer=codex branch. It does **not** govern the write-capable main-implementer invocation
owned by `ptp-run-at-model`, per the *Scope fence* below.)

**Scope fence.** The **write-capable main-agent-as-Codex invocation** — the `codex exec`
`workspace-write` call site itself and how it is assembled — is **out of scope** for this skill; that
wiring is owned by `ptp-run-at-model` (slice 0027_04). This skill's reviewer-gate mechanics
(`codex.mode`, the PATH probe, the skip line, the terminal state) only ever concern a Codex
*reviewer*. The `codex.model`/`codex.reasoningEffort` **resolution** owned here is reused by that
main-implementer invocation (no new config keys), but this skill never assembles or governs the
write-capable invocation.

## Explicit-override rule

The explicit `/ptp:codex-*` commands — `/ptp:codex-review`, `/ptp:codex-review-loop`,
`/ptp:codex-review-plan`, `/ptp:codex-review-plan-loop`, `/ptp:codex-review-prd`,
`/ptp:codex-review-prd-loop`, `/ptp:codex-review-uncommitted` — are
**not** gated by `codex.mode`. Invoking one of them is itself an explicit request for the Codex
reviewer, so the mode gate does not apply: they **always attempt Codex** and STOP only if `codex` is
genuinely missing from PATH. `mode=off` does **not** make `/ptp:codex-review` skip Codex. Those
commands therefore need no edit and do not reference this skill's decision contract.

## Non-silent-skip rule

A skipped Codex phase is **never silent**. Whenever the decision is to skip Codex (either `off`, or
`auto` with `codex` absent), the dual-reviewer step's end-of-run summary MUST contain a line of the
form:

- `off` → `Codex phase skipped (mode=off)`
- `auto`, codex absent → `Codex phase skipped (mode=auto, codex not found)`

so a single-reviewer run is always visible to the user. The general form is
`Codex phase skipped (mode=…)`; the `auto`-missing case additionally states that `codex` was not
found.

**Reviewer-generalized framing.** A skip line only ever arises on the reviewer=codex branch — a
Claude reviewer always runs and never produces a skip line. Generally, the contract is that a
skipped reviewer phase is named after the reviewer that was skipped; the reviewer=codex strings
above are exactly `Codex phase skipped (mode=…)` and are unchanged by this slice. The orchestrator
print sites that emit these strings are not edited here (that is 0027_03).

## Mode-skip terminal state

When a `*-full` review (`/ptp:review-full`, `/ptp:review-plan-full`, `/ptp:review-brainstorm-full`, or
`/ptp:review-prd-full`) converges its main phase and the Codex phase is skipped by mode, it
terminates in a distinct, **green-class** terminal state — separate from the both-phases label so a
human can tell the two apart:

```
PHASE 1 DONE — CODEX SKIPPED (mode=…)
```

This sits alongside the existing terminal states (`BOTH PHASES DONE`, `ITERATION CAP REACHED`,
`PHASE 2 ITERATION CAP REACHED`).

**Reviewer-generalized framing.** This mode-skip terminal state only ever arises on the
reviewer=codex branch (a Claude reviewer always runs and is never mode-skipped). Generally, the
terminal state names the reviewer that was skipped; the reviewer=codex string above is exactly
`PHASE 1 DONE — CODEX SKIPPED (mode=…)` and is unchanged by this slice. The orchestrators that
print it are not edited here (that is 0027_03).

**Convergence gates MUST treat it as success.** `/ptp:full`'s plan-convergence gate (which keys on
`BOTH PHASES DONE`) and `ptp-full-apply`'s review-convergence gate (which keys on
`terminalState === 'BOTH_PHASES_DONE'`) SHALL accept the mode-skip terminal state as **converged /
gate-success**, exactly like a both-phases run — and SHALL NOT read a legitimately mode-skipped Codex
phase as a non-convergence halt or a pre-run stop.

How the gate-success outcome reaches the `ptp-full-apply` *workflow* is an implementation choice (the
machine layer is separate from the human-facing label): the least-invasive expression is for the
`ptp-review` workflow agent to return `terminalState === 'BOTH_PHASES_DONE'` for a mode-skipped
review too, so `workflows/ptp-full-apply.js` needs no logic change while the printed summary still
names the skip. The observable contract is the same either way: **mode-skip ⇒ gate success** (no halt
in `ptp-full-apply`, no pre-run stop in `/ptp:full`), with the skip always named in the summary.

## Summary of the contract

- Resolve `codex.mode` from layered config; default `auto`; never crash on a typo.
- Resolve `codex.model` (non-empty string, default unset) and `codex.reasoningEffort`
  (`minimal|low|medium|high`, default unset) from the same layered config, independently, with the
  same forgiving reader posture.
- The reviewer gate is symmetric: the MAIN agent's phase always runs; only the REVIEWER agent's
  phase is gated. Main/reviewer come from `ptp-agent-roles`' `{ main, reviewer }`. At the default
  `roles.main = claude` (reviewer=codex) this reduces to "the main phase always runs; only
  the Codex phase is gated by `codex.mode`."
- `codex.mode` gates the reviewer phase **iff the reviewer is Codex**; it never gates a Claude
  phase. A Claude reviewer (`roles.main = codex`) is the PTP review loop and always runs — no
  `codex.mode`, no `codex --version` probe, no `codex exec`.
- reviewer=codex: `required` + missing codex → STOP. `auto` + missing codex → skip + report. `off`
  → skip without probing + report.
- `/ptp:codex-*` commands always attempt Codex (the mode gate does not apply to them).
- A skip is always reported as `Codex phase skipped (mode=…)`.
- The mode-skip terminal state `PHASE 1 DONE — CODEX SKIPPED (mode=…)` is gate-success for both
  convergence gates.
- Every **read-only** `codex exec` invocation — the mode-gated reviewer or the explicit
  `/ptp:codex-*` overrides — is assembled via the canonical flag-append rule:
  `codex exec -s read-only [ -m <model> ] [ -c model_reasoning_effort=<effort> ] -`, flags appended
  only when the corresponding key is set, always before the trailing `-`, both unset ⇒ today's exact
  `codex exec -s read-only -`. (The write-capable main-implementer invocation owned by
  `ptp-run-at-model` is the one exception — a distinct `workspace-write` call site, not governed by
  this read-only rule.)
- The **one telemetry relaxation**: `-c` arguments confined to the `otel.*` key space MAY be appended,
  at **both** `codex exec` call sites, and **only** when `telemetry.mode` is `on` **and** the
  repository-scoped telemetry-consent record records consent. In every other state the command line is
  byte-identical to the pre-change one. The rendering is pinned in `ptp-telemetry` [codex-canonical-rendering].
