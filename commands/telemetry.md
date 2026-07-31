---
description: Thin router onto the seven `/ptp:telemetry-*` leaf commands — `status`, `report`, `analyze`, `setup`, `start`, `stop`, and `export`. It holds no behavior of its own: each subcommand's methodology lives in its own leaf skill (`ptp-telemetry-status`, `ptp-telemetry-report`, `ptp-telemetry-analyze`, `ptp-telemetry-setup`, `ptp-telemetry-start`, `ptp-telemetry-stop`, `ptp-telemetry-export`), and the shared store, ledger, span, receiver, preamble, and Codex contract lives in the `ptp-telemetry` substrate skill.
argument-hint: "status | report | analyze | setup | start | stop | export   (the rest of the argument is passed to the leaf verbatim)"
---

You are running **`/ptp:telemetry`** — the front door onto ptp's per-epic telemetry store. It is a
**dispatcher with no behavior of its own**, and it accepts exactly seven subcommands.

**Two doors, one skill.** A slash command cannot invoke another slash command, so this command does
not forward to `/ptp:telemetry-<sub>`; it invokes the **same leaf skill** that `/ptp:telemetry-<sub>`
invokes, via the Skill tool. There is one implementation behind both doors, so the two cannot
diverge, and neither door holds a rule of its own.

| Subcommand | Leaf command | Leaf skill | What it is for |
|---|---|---|---|
| `status` | `/ptp:telemetry-status` | `ptp-telemetry-status` | Reports the resolved configuration and the store's state |
| `report` | `/ptp:telemetry-report` | `ptp-telemetry-report` | Renders the timing analysis for a scope |
| `analyze` | `/ptp:telemetry-analyze` | `ptp-telemetry-analyze` | Renders the LLM-vs-tools work breakdown |
| `setup` | `/ptp:telemetry-setup` | `ptp-telemetry-setup` | The one-time Claude Code telemetry opt-in |
| `start` | `/ptp:telemetry-start` | `ptp-telemetry-start` | Brings the OTLP receiver up |
| `stop` | `/ptp:telemetry-stop` | `ptp-telemetry-stop` | Takes the OTLP receiver down |
| `export` | `/ptp:telemetry-export` | `ptp-telemetry-export` | Re-derives every `spans.csv` from the raw store |

Every leaf delegates the shared contract to the **`ptp-telemetry`** substrate skill, which owns the
config resolution, the per-epic store layout, the ledger record and its append protocol, the span
record and its 26 columns, the OTel-attribute and `tool_class` mapping tables, the ledger join, the
receiver and its identity/health wire contract, the auto-start preamble, and the Codex ingestion
layer.

## Steps

1. **Select the leaf — do not invoke yet.** Read the subcommand token from `$ARGUMENTS`. An omitted
   argument means `status`. Look the token up in the pointer table above to get its leaf skill. Any
   other token is reported as an unsupported subcommand, writes nothing, and stops here.
2. **Invoke the selected leaf skill** via the Skill tool, passing the remainder of `$ARGUMENTS`
   through **verbatim** — unparsed, unreordered, unexpanded. Selection and invocation are separate
   steps because a Skill invocation is a single call, not a resumable handshake: a step that invoked
   before the remainder was in hand could not pass it through unchanged.
3. **STOP** when the leaf reports its result, relaying that result unaltered.

## Hard rules

- **No branch guard, no `openspec validate`, no git write.** `/ptp:telemetry` is exempt exactly as
  `/ptp:status` and `/ptp:version` are.
- **No `ptp-run-at-model`, and therefore no telemetry auto-start preamble.** That is what keeps a
  `status` check from starting a process.
- **This command owns no behavior and restates no methodology.** Every subcommand rule lives in its
  leaf skill; every store, record, and lifecycle rule lives in `ptp-telemetry`.
- **An unsupported subcommand is reported and writes nothing.**
- **`/ptp:telemetry analyze` is not `/ptp:analyze`.** They are different commands against different
  capabilities; the full statement of the collision lives in `ptp-telemetry-analyze`. Never route one
  to the other.
