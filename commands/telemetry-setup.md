---
description: The confirm-first, one-time Claude Code telemetry opt-in. Runs in two steps — the Claude-side write, then a second, separately-consented Codex step — and renders the exact diff first, writing nothing at all unless the user explicitly confirms. Takes no argument. Delegates the whole methodology to the `ptp-telemetry-setup` skill.
argument-hint: "(no arguments)"
---

You are running **`/ptp:telemetry-setup`** — the direct front door onto the confirm-first telemetry
opt-in. `/ptp:telemetry setup` reaches the **same** skill through the `/ptp:telemetry` router and
behaves identically: the same prompts, the same rendered diff, the same writes in the same order, and
the same refusals. `setup` runs in two steps — the Claude-side write, then a **second, separately
consented Codex step**. This file is a thin wrapper: it holds no methodology of its own.

## Steps

1. **Report any argument as unsupported** — **without writing anything**, and **before** the skill is
   invoked. This command takes none, so an argument-bearing invocation never enters the `setup` flow
   at all.
2. **Invoke the `ptp-telemetry-setup` skill** via the Skill tool. It holds the complete `setup`
   methodology and cites the `ptp-telemetry` skill's substrate for everything else; do not restate any
   of it here.
3. **STOP** when the skill reports its outcome, including the **"nothing was written"** case when the
   user declines.

## Hard rules

- **Writes only on explicit confirmation.** Not the settings file, not the credential, not either
  `.gitignore`, not the Codex telemetry-consent record.
- **Never reached automatically.** No automatic ptp path invokes this command, the auto-start preamble
  expressly included.
- **`setup`'s Codex step is consented separately** from the Claude-side write. What that step does,
  and what declining it means, are defined by the `ptp-telemetry-setup` skill and the `ptp-telemetry`
  substrate it cites — not here.
- **It takes no argument and resolves no change selector.** Any argument is reported as unsupported
  without writing anything, and is never handed to `ptp-change-selector`.
- **No branch guard, no `openspec validate`, no git write.** `/ptp:telemetry-setup` is exempt from the
  branch guard exactly as `/ptp:telemetry` and `/ptp:telemetry-status` are.
- **`/ptp:telemetry setup` remains an equivalent entry point.** Both reach the one skill, so neither
  can drift from the other.
- **Never restate the skill's contract here.** The `env` block, the merge semantics, the write
  ordering, the refusal paths, and the Codex step's mechanics are defined by the
  `ptp-telemetry-setup` skill and the `ptp-telemetry` substrate it cites.

**Where the duplicated invariants live.** The first two rules above — *writes only on explicit
confirmation* and *is never reached automatically* — are the only ones this command duplicates, and
they are asserted at two other sites, each of which names the other two: `ptp-telemetry-setup`'s
`## Hard rules`, and `commands/telemetry.md`'s `setup` delegation bullet.
