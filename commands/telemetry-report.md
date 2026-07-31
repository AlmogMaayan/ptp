---
description: Render the ptp timing analysis for the selected scope — aggregate work time and elapsed wall time, concurrency_factor, the phase / agent_role / span_kind and tool_class breakdowns, the top-N time sinks, the per-iteration review cost, and a data-quality footer. Takes an optional literal write keyword and an optional selector. A default invocation creates no file, modifies no existing file, and deletes only aged raw files. The direct front door onto the same subcommand `/ptp:telemetry report` dispatches; all methodology lives in the shared ptp-telemetry-report skill.
argument-hint: "[write] [selector]   (write is a literal keyword, stripped before the selector; selector: id | epic:XXXX | story:NN | epic:XXXX story:NN | epic:all — omit for every active epic)"
---

You are running **`/ptp:telemetry-report`** — the direct front door onto ptp's timing analysis over
the per-epic telemetry store.

It is the same subcommand `/ptp:telemetry report` dispatches, reached without the router. **It is not
an eighth `/ptp:telemetry` subcommand**; the router's count stays **seven**.

It is a thin wrapper. The selector delegation, the literal `write`-keyword strip, `concurrency_factor`
and the report's other derived figures, the input rule, the breakdowns, the top-N sinks, the
per-iteration review view, the footer items, the write posture, and retention pruning all live in the
`ptp-telemetry-report` skill — and the config resolution, the store layout, the ledger and span
records, the mapping tables, and the ledger join live in `ptp-telemetry`. Do not restate any of it
here.

## Steps

1. **Invoke the `ptp-telemetry-report` skill** via the Skill tool, passing `$ARGUMENTS` through **as
   the user typed it**. Parse, reorder, strip, and expand **nothing**: the skill owns both the
   `write`-keyword strip and the selector delegation, and **never** hands `write` to
   `ptp-change-selector`. The skill holds the complete methodology; do not restate its steps here.
2. **STOP** when the skill reports its result — the rendered report and, when `write` was given, the
   path of the one `report.md` per resolved epic.

## Hard rules

- **A default `report` creates no file, modifies no existing file, and deletes only aged raw
  files.** Never describe this command as "read-only", not even qualified: a default invocation prunes the reported epic's
  `raw/` per `telemetry.retentionDays`, which is irreversible, and a reader keeps the adjective while
  dropping the parenthesis. (`/ptp:telemetry status` may be called read-only, and
  `/ptp:telemetry analyze` may; this one may not. The postures are worded differently because they
  genuinely differ.)
- **`report.md` only on the literal `write` keyword.** It writes
  `<telemetry.root>/<epic>/report.md` — that file and nothing else — only when the literal `write`
  keyword is given, and that keyword is stripped **inside the skill**, before the remaining argument
  reaches the change selector. This command recognises it not at all.
- **No selector grammar is added here, and nothing outside the reported epic's `raw/` is pruned.**
  The argument is handed on untouched; the skill delegates resolution wholesale to
  `ptp-change-selector`.
- **No branch guard, no `openspec validate`, no git write**, and **no telemetry auto-start
  preamble** — it does not use `ptp-run-at-model`, which is what keeps it from starting a process. It
  never creates the store and never infers the mode from it. These are stated here rather than
  inherited, because a direct invocation no longer sits under `/ptp:telemetry`'s blanket statement.
- **Identical to `/ptp:telemetry report`.** Both front doors invoke one skill with the same argument
  string, so their identity is structural rather than an agreement two files maintain.
- **Never restate the skills' contract here.** The methodology is defined once, in
  `ptp-telemetry-report`, over a substrate defined once in `ptp-telemetry`. In particular this file
  states none of the substrate's own rules about how the figures relate to one another or about what
  the footer must contain — `ptp-telemetry-report` cites those anchors, and this command points at
  it.
