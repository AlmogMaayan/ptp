---
description: The dedicated front door onto the global `export` action of the ptp telemetry store — it re-derives every `spans.csv` from the raw store in one pass, takes no flag, no argument, and no selector, refuses non-fatally while a receiver for this store is live (naming `/ptp:telemetry stop` and stopping nothing itself), never writes into `raw/`, and delegates all methodology to the `ptp-telemetry-export` skill.
argument-hint: "(no flag, no argument, no selector — export is global and re-derives every spans.csv)"
---

You are running **`/ptp:telemetry-export`** — the direct front door onto the global re-derivation of
every `spans.csv` from the telemetry raw store. This file is a thin wrapper: the contract lives in the
**`ptp-telemetry-export`** skill, and none of it is restated here. `/ptp:telemetry export` reaches the
**same** skill through the `/ptp:telemetry` router; the two front doors are equivalent and **neither
is deprecated**.

## Steps

1. **Invoke the `ptp-telemetry-export` skill** via the Skill tool. It holds the complete `export`
   methodology — the global scope, the determinism and ordering rules, the torn-line tolerance, the
   refusal, and the invocation — and cites the `ptp-telemetry` skill's substrate for everything else;
   do not restate any of it here. **A supplied argument does not change this step**: the skill is
   invoked either way and is the one authority that rejects it, so the direct front door and
   `/ptp:telemetry export` produce the **same** rejection message. Nothing is written on that path —
   no CSV is modified and no temporary file is created.
2. **STOP** when the skill reports its terminal state — the `export` outcome, or its single refusal
   line, relayed **verbatim**.

## Hard rules

- **It takes no flag, no argument, and no selector.** Every invocation is the global re-derivation.
  `export --rebuild` and `export <selector>` are rejected **without writing anything**; the argument
  is never guessed at and never handed to `ptp-change-selector`.
- **It refuses while a receiver for this store is live, and stops nothing.** The refusal is one line
  naming `/ptp:telemetry stop`; this command terminates no process and brings none down itself.
- **It never writes into `raw/`.** The raw store is read and never modified, rewritten, moved between
  directories, or appended to by this command.
- **It starts nothing.** No auto-start preamble runs — this command does not use `ptp-run-at-model`,
  which is what keeps `/ptp:telemetry*` from starting a process as a side effect.
- **No branch guard, no `openspec validate`, no git write.** `/ptp:telemetry-export` is exempt from
  the branch guard exactly as `/ptp:telemetry` is.
- **Never restate the skill's contract here.** What `export` reads, how it orders rows, how it stages
  and publishes them, when it refuses or aborts, and every outcome it reports are defined by the
  `ptp-telemetry-export` skill — this file defers to it rather than stating any of it a second time.
