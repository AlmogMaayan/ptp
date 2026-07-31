---
description: Read-only report on the ptp telemetry store — the resolved telemetry.mode and root plus the per-epic run counts — delegating the whole methodology to the `ptp-telemetry-status` skill.
argument-hint: "(no arguments)"
---

You are running **`/ptp:telemetry-status`** — the direct front door onto the read-only telemetry status
report. `/ptp:telemetry status` reaches the **same** skill through the `/ptp:telemetry` router
(an omitted argument there defaults to `status`) and prints the **same** report. This file is a thin
wrapper: it holds no methodology of its own.

## Steps

1. **Invoke the `ptp-telemetry-status` skill** via the Skill tool. It holds the complete `status`
   methodology and cites the `ptp-telemetry` skill's substrate for everything else the report carries;
   do not restate any of it here.
2. **STOP** at the skill's terminal state — the rendered status report.

## Hard rules

- **This command writes nothing of its own.** It creates no file and no directory.
- **It takes no argument and resolves no change selector.** Any argument is reported as **unsupported
  without writing anything**; it is never guessed at and never handed to `ptp-change-selector`.
- **No branch guard, no `openspec validate`, no git write.** `/ptp:telemetry-status` is exempt from the
  branch guard exactly as `/ptp:telemetry`, `/ptp:status`, and `/ptp:version` are.
- **No auto-start preamble, and no `ptp-run-at-model`.**
- **Never restate the skill's contract here.** The `status` subcommand's read-only posture and its
  lifecycle guarantees are defined by the `ptp-telemetry-status` skill and, for the lifecycle
  assertions, by `` `ptp-telemetry` [lifecycle-status-read] `` — this file defers to them rather than
  stating them a second time.
- **`/ptp:telemetry-status` is not `/ptp:status`.** This command reports on the **telemetry store**;
  `/ptp:status` is the unrelated OpenSpec command that reports the change lifecycle. They collide by
  name and nothing else.
