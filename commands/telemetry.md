---
description: Front door onto the ptp telemetry store. `status` (read-only) reports the resolved telemetry.mode / root / port, the env preflight verdict, the receiver's state, and per-epic run counts; `report [write] [selector]` renders the timing analysis — aggregate work time and elapsed wall time as two never-conflated figures plus concurrency_factor, the breakdowns, the top-N sinks, the per-iteration review cost, and a mandatory data-quality footer — creating no file, modifying no existing file, and deleting only aged raw files; `setup` is the confirm-first one-time Claude Code telemetry opt-in; `start` / `stop` are the manual receiver lifecycle; `export` re-derives every spans.csv globally and requires the receiver stopped. Delegates all methodology to the shared ptp-telemetry skill.
argument-hint: "status | report [write] [selector] | setup | start | stop | export   (export takes no flag and no argument)"
---

You are running **`/ptp:telemetry`** — the front door onto ptp's per-epic telemetry store. It accepts
exactly six subcommands:

| Subcommand | What it does |
|---|---|
| `status` | **Read-only.** The resolved mode / root / port, the environment preflight verdict, the **Codex preflight** (four read-only checks), whether the receiver is listening and how it was started, lockfile health, and the per-epic run counts. |
| `report` | Renders the timing analysis for the selected scope. **Creates no file, modifies no existing file, and deletes only aged raw files.** Takes an optional literal `write` keyword and an optional selector. |
| `setup` | The **one-time, interactive, confirm-first** writer of the telemetry `env` block in `<repo>/.claude/settings.local.json`, plus a **second, separately-consented Codex step**. |
| `start` | Brings the OTLP receiver up manually. Idempotent. |
| `stop` | Takes the receiver down, after verifying it is the one this store recorded. |
| `export` | Re-derives **every** `spans.csv` from the raw store. **Global**: no flag, no argument, no selector. Requires the receiver to be **stopped**. |

It is a thin wrapper. The config resolution, the store layout, the ledger record, the span record and
its 26 columns, the OTel-attribute and `tool_class` mapping tables, the append protocol, the CSV
rules, the gate ordering, the identity/health wire contract, the lifecycle rules, and the auto-start
preamble all live in the `ptp-telemetry` skill.

## Steps

1. **Invoke the `ptp-telemetry` skill** via the Skill tool, naming the subcommand from `$ARGUMENTS` —
   one of `status`, `report`, `setup`, `start`, `stop`, `export`. Treat an omitted argument as
   `status`, and report any other subcommand as unsupported without writing anything. The skill holds
   the complete methodology; do not restate its steps here.
2. For `report`, pass the rest of the argument through **as the user typed it**: the skill owns both
   the `write`-keyword strip and the selector delegation (`ptp-telemetry` §16). Do **not** parse,
   reorder, or expand the selector here, and never hand `write` to the change selector.
3. **STOP** when the skill reports the subcommand's result — the `status` report, the rendered
   `report` (and, when `write` was given, the path of the one `report.md` per resolved epic), the
   `setup` outcome (including the "nothing was written" case when the user declines), the receiver's
   lifecycle state, or the `export` outcome or its single refusal line.

## Hard rules

- **`export` takes no flag and no argument.** Every invocation is a global re-derivation of every
  `spans.csv`. `export --rebuild` and `export <selector>` are rejected, modifying nothing.
- **`report` creates no file, modifies no existing file, and deletes only aged raw files.** Never
  describe it as "read-only", not even qualified: a default invocation prunes the reported epic's
  `raw/` per `telemetry.retentionDays`, which is irreversible. It writes
  `<telemetry.root>/<epic>/report.md` — and nothing else — **only** when the literal `write` keyword
  is given, and that keyword is stripped **before** the remaining argument reaches the change
  selector, so the selector grammar gains nothing.
- **`report` adds no selector grammar and prunes nothing outside the reported epic's `raw/`.** It
  never deletes `runs.ndjson`, `runs.csv`, `spans.csv`, or anything under
  `<telemetry.root>/_unattributed/`, and **no ptp pipeline command ever triggers pruning**.
- **`report` never conflates work time with elapsed time**, and no field it prints is derived by
  subtracting component sums from wall time. Its data-quality footer is **mandatory** and is never
  omitted or suppressed.
- **`status` and `export` never start or stop the receiver.** `status` is read-only; `export`
  **refuses** while a receiver for this store is live, naming `/ptp:telemetry stop`, rather than
  stopping it. (`status`'s identity probe may cause the *receiver* to repair its own lockfile — a
  receiver-owned write, which `status` reports.)
- **`setup` writes only on explicit confirmation.** It renders the exact diff first and writes
  nothing — not the settings file, not the credential, not either `.gitignore`, not the Codex
  telemetry-consent record — unless the user confirms. It is the single exception to ptp's
  never-write-a-Claude-Code-setting rule and is never reached automatically.
- **`setup`'s Codex step is consented separately.** It records consent in a **repository-scoped ptp
  telemetry-consent record** under `<telemetry.root>` and authorizes ptp to append per-invocation
  `-c otel.*` arguments — carrying the store's ingestion credential, value never shown — to the
  `codex exec` invocations it constructs here. **No Codex configuration file is written anywhere and
  nothing is written to any user-global path.** Declining leaves the Claude-side setup completed and the
  `codex exec` command line byte-identical; the step is blocked only when the store has **no ingestion
  credential**, never by a declined Claude-side write. **No metrics exporter is ever configured** —
  metrics are out of scope for this layer, not an emptied column.
- **`status`'s Codex preflight is read-only and honest.** Four checks — `codex` on `PATH` (a filesystem
  lookup; it **never invokes Codex**), the consent record present, its endpoint matching the resolved
  `telemetry.port`, and its credential matching the store's (a **match verdict with neither value
  printed**). A fully-matching result is reported as **configured; delivery not verified** — never as a
  claim that Codex is emitting or that the receiver is accepting. An absent `codex` is reported as
  absent with the rest marked not applicable, without erroring.
- **Codex telemetry adds no ptp gate.** `codex.mode` remains the **only** authority over whether Codex
  runs; the consent record only decides whether telemetry wiring is appended, so it can never disagree
  with `codex.mode` about whether Codex ran — a run without consent simply produces no Codex rows.
- **`/ptp:telemetry` runs no auto-start preamble.** It does not use `ptp-run-at-model`, which is what
  keeps `status` strictly read-only and stops a status check from starting a process.
- **No branch guard, no `openspec validate`, no git write.** `/ptp:telemetry` is exempt from the
  branch guard exactly as `/ptp:status` and `/ptp:version` are. `setup` reads git only to refuse when
  `.claude/settings.local.json` is already tracked. The **one** subcommand that resolves a change
  selector is `report`, which delegates resolution wholesale to `ptp-change-selector` and adds no
  grammar; `status`, `setup`, `start`, `stop`, and `export` take no selector at all.
- **`status` never creates the store**, and never infers the mode from it: the mode is resolved from
  configuration independently, and an absent store never means `telemetry.mode=off`.
- **Never restate the skill's contract here** — the record shapes, store layout, mapping tables, CSV
  rules, lifecycle rules, and gate ordering are defined once, in `ptp-telemetry`.
