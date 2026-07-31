---
description: The dedicated front door onto the `stop` action of the ptp telemetry receiver lifecycle — it takes this store's OTLP receiver down, delegating all methodology to the `ptp-telemetry-stop` skill.
argument-hint: "(takes no argument)"
---

You are running **`/ptp:telemetry-stop`** — the direct front door onto the manual receiver stop
action. This file is a thin wrapper: the contract lives in the **`ptp-telemetry-stop`** skill, and it
holds none of it here. `/ptp:telemetry stop` reaches the **same** skill through the `/ptp:telemetry`
router; the two front doors are equivalent and **neither is deprecated**.

## Steps

1. **Invoke the `ptp-telemetry-stop` skill** via the Skill tool. It holds the complete `stop`
   methodology and cites the `ptp-telemetry` skill's substrate for everything else; do not restate any
   of it here. **Any supplied argument is reported as unsupported first, without stopping anything** —
   no process is signalled, no file is removed, and the skill is **not** invoked.
2. **STOP** when the skill reports its outcome, relaying the outcome's `message` verbatim when one is
   present.

## Hard rules

- **It takes no argument and resolves no change selector.** Any argument is reported as unsupported;
  it is never guessed at and never handed to `ptp-change-selector`.
- **It starts nothing.** This command brings no receiver up and **runs no auto-start preamble** — it
  does not use `ptp-run-at-model`, which is what keeps `/ptp:telemetry*` from starting a process as a
  side effect.
- **It writes no telemetry file and prunes nothing.** No ledger row, no `spans.csv`, no raw store read
  or prune, no configuration change.
- **No branch guard, no `openspec validate`, no git write.** `/ptp:telemetry-stop` is exempt from the
  branch guard exactly as `/ptp:telemetry` is.
- **Never restate the skill's contract here.** What `stop` verifies, what it terminates, what it
  removes, and every outcome it reports are defined by the `ptp-telemetry-stop` skill — this file
  defers to it rather than stating any of it a second time.
