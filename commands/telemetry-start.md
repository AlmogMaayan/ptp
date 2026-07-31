---
description: Bring this store's OTLP receiver up manually and idempotently, delegating the whole start methodology to the `ptp-telemetry-start` skill.
argument-hint: "(no arguments)"
---

You are running **`/ptp:telemetry-start`** — the direct front door onto the manual receiver start
action. `/ptp:telemetry start` reaches the **same** skill through the `/ptp:telemetry` router and
performs the **same** sequence. This file is a thin wrapper: it holds no methodology of its own.

## Steps

1. **Invoke the `ptp-telemetry-start` skill** via the Skill tool. It holds the complete `start`
   methodology and cites the `ptp-telemetry` skill's substrate for everything else; do not restate any
   of it here. An unexpected argument is reported as **unsupported without writing anything** — no
   lockfile, no managed `.gitignore` line, no settings or configuration file — and the skill is not
   invoked.
2. **STOP** when the skill reports its terminal outcome.

## Hard rules

- **It takes no argument and resolves no change selector.** Any argument is reported as **unsupported
  without writing anything**; it is never guessed at and never handed to `ptp-change-selector`.
- **It starts nothing else and stops nothing.** One receiver, for this store, or nothing.
- **No auto-start preamble.** This command does not use `ptp-run-at-model`, which is exactly what keeps
  `/ptp:telemetry*` from starting a process as a side effect; the receiver comes up here only because
  the user asked for it.
- **No branch guard, no `openspec validate`, no git write.** `/ptp:telemetry-start` is exempt from the
  branch guard exactly as `/ptp:telemetry`, `/ptp:telemetry-status`, `/ptp:status`, and `/ptp:version`
  are.
- **Never restate the skill's contract here.** The ordered sequence, the refusals, the idempotent
  no-op, and the terminal outcomes are defined by the `ptp-telemetry-start` skill — this file defers to
  it rather than stating any of it a second time.
