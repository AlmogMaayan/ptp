---
name: ptp-codex-mode
description: Resolve codex.mode, codex.model, and codex.reasoningEffort from layered ptp config, decide whether a dual-reviewer step runs its Codex phase, and own the canonical flag-append rule every `codex exec` call site references. The single source of truth every dual-reviewer orchestrator (the code/plan/brainstorm/PRD -full reviews and the full/full-run/brainstorm-full/prd-full orchestrators) and every codex-invoking command references instead of hard-requiring Codex or hardcoding its invocation — covers mode resolution (default auto), the three-mode decision contract, the /ptp:codex-* override, the non-silent-skip rule, the mode-skip terminal state the convergence gates treat as success, and the model/reasoning-effort resolution + flag-append rule.
---

# ptp-codex-mode — resolve `codex.mode` and gate the Codex phase

## Purpose

ptp's dual-reviewer flow runs a Superpowers review loop and then a Codex review loop. Whether the
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
`/ptp:full`, `/ptp:full-run`, `/ptp:brainstorm-full`, `/ptp:prd-full` (and the skills behind them:
`ptp-full`, `ptp-full-run`, `ptp-review-brainstorm-full`, `ptp-review-prd-full`, `ptp-brainstorm-full`,
`ptp-prd-full` — the brainstorm/PRD `-full` orchestrators run a `-full` review as their Phase B, which
consults this skill).

**NOT gated — the explicit `/ptp:codex-*` commands** (see *Explicit-override rule* below): invoking
them is itself the opt-in to Codex, so they bypass the mode gate entirely and are listed here only
to record that they do.

## Resolution (mirror `ptp-deploy:60-74`)

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

Every ptp call site that runs `codex exec` MUST assemble its invocation via this single rule rather
than restating it:

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

**Orthogonality note.** This rule applies to **every** `codex exec` invocation, independent of
`codex.mode`: both the mode-gated dual-reviewer commands (which first ask this skill's decision
contract *whether* to run Codex, then — if running — assemble the invocation via this rule) and the
always-Codex `/ptp:codex-*` explicit-override commands (which skip the mode gate but still assemble
their invocation via this rule). `codex.mode` decides **whether** Codex runs; `codex.model` /
`codex.reasoningEffort` decide **how** it runs once invoked — the two are orthogonal and both apply
together when relevant.

## Decision contract (consumed by the four orchestrators)

The **Superpowers (non-Codex) phase always runs**, regardless of mode. Only the **Codex phase** is
gated, by the resolved mode and (for `required`/`auto`) whether `codex` is on PATH:

| mode | `codex` on PATH? | Action |
|------|------------------|--------|
| `required` | yes | **Run** the Codex phase. |
| `required` | no | **STOP** — tell the user to install Codex or change the mode (`/ptp:config`). This is today's behavior, preserved. |
| `auto` | yes | **Run** the Codex phase (unchanged from before this change — the common path). |
| `auto` | no | **Skip** the Codex phase, run Superpowers-only, and report `Codex phase skipped (mode=auto, codex not found)`. |
| `off` | (not probed) | **Skip** the Codex phase without probing PATH, run Superpowers-only, and report `Codex phase skipped (mode=off)`. |

Probe PATH with `codex --version`. In `off` mode, do **not** probe — the skip is unconditional.

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

## Mode-skip terminal state

When a `*-full` review (`/ptp:review-full`, `/ptp:review-plan-full`, `/ptp:review-brainstorm-full`, or
`/ptp:review-prd-full`) converges its Superpowers phase and the Codex phase is skipped by mode, it
terminates in a distinct, **green-class** terminal state — separate from the both-phases label so a
human can tell the two apart:

```
PHASE 1 DONE — CODEX SKIPPED (mode=…)
```

This sits alongside the existing terminal states (`BOTH PHASES DONE`, `ITERATION CAP REACHED`,
`PHASE 2 ITERATION CAP REACHED`).

**Convergence gates MUST treat it as success.** `/ptp:full`'s plan-convergence gate (which keys on
`BOTH PHASES DONE`) and `ptp-full-run`'s review-convergence gate (which keys on
`terminalState === 'BOTH_PHASES_DONE'`) SHALL accept the mode-skip terminal state as **converged /
gate-success**, exactly like a both-phases run — and SHALL NOT read a legitimately mode-skipped Codex
phase as a non-convergence halt or a pre-run stop.

How the gate-success outcome reaches the `ptp-full-run` *workflow* is an implementation choice (the
machine layer is separate from the human-facing label): the least-invasive expression is for the
`ptp-review` workflow agent to return `terminalState === 'BOTH_PHASES_DONE'` for a mode-skipped
review too, so `workflows/ptp-full-run.js` needs no logic change while the printed summary still
names the skip. The observable contract is the same either way: **mode-skip ⇒ gate success** (no halt
in `ptp-full-run`, no pre-run stop in `/ptp:full`), with the skip always named in the summary.

## Summary of the contract

- Resolve `codex.mode` from layered config; default `auto`; never crash on a typo.
- Resolve `codex.model` (non-empty string, default unset) and `codex.reasoningEffort`
  (`minimal|low|medium|high`, default unset) from the same layered config, independently, with the
  same forgiving reader posture.
- Superpowers phase always runs; only the Codex phase is gated by `codex.mode`.
- `required` + missing codex → STOP. `auto` + missing codex → skip + report. `off` → skip without
  probing + report.
- `/ptp:codex-*` commands always attempt Codex (the mode gate does not apply to them).
- A skip is always reported as `Codex phase skipped (mode=…)`.
- The mode-skip terminal state `PHASE 1 DONE — CODEX SKIPPED (mode=…)` is gate-success for both
  convergence gates.
- Every `codex exec` invocation — mode-gated or explicit — is assembled via the canonical
  flag-append rule: `codex exec -s read-only [ -m <model> ] [ -c model_reasoning_effort=<effort> ] -`,
  flags appended only when the corresponding key is set, always before the trailing `-`, both unset
  ⇒ today's exact `codex exec -s read-only -`.
