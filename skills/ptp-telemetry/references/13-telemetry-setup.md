> Loaded from skills/ptp-telemetry/SKILL.md when: running the telemetry setup subcommand.
## 13. `/ptp:telemetry setup` — the one confirm-first setting writer

The rest of this section now lives in `skills/ptp-telemetry-setup/SKILL.md`, which retains this section's subsection numbering; the eight-key block below stays here.

<!-- ptp-telemetry:anchor id=telemetry-env-keys class=substrate -->
### 13.2 The block — exactly eight keys

| Key | Value |
|---|---|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | `"1"` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `"http/json"` (the protocol the spike selected) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `"http://127.0.0.1:<resolved telemetry.port>"` |
| `OTEL_BSP_SCHEDULE_DELAY` | `"5000"` |
| `OTEL_EXPORTER_OTLP_HEADERS` | `"x-ptp-store-token=<the per-store credential>"` |
| `OTEL_LOGS_EXPORTER` | `"otlp"` |
| `OTEL_TRACES_EXPORTER` | `"otlp"` |
| `OTEL_LOG_TOOL_DETAILS` | `"1"` |

The delay is present because the ~60 s default **silently discards the tail of a short run**, which
looks like present-but-incomplete data rather than missing data — the worse failure of the two.

**Why seven and not the five the change was planned around.** The two exporter-selection keys were
added on **measured evidence**, recorded in the spike outcome: with only the first five in force,
Claude Code 2.1.220 posts **nothing at all** — `CLAUDE_CODE_ENABLE_TELEMETRY=1` turns collection on,
but the SDK still needs to be told which exporter to use, and its default is not OTLP. A five-key
block would have written a configuration that looks complete, passed every gate, started a receiver,
and recorded zero rows. `OTEL_METRICS_EXPORTER` is deliberately **left unset**: the receiver accepts only
`/v1/traces` and `/v1/logs`, and metrics are out of scope for this layer.

They are exporter *selection*, not telemetry *enablement*, so nothing about the confirm-first posture
changes: still one confirmed write, still only these keys, still every other key preserved.

**Why eight and not seven.** `OTEL_LOG_TOOL_DETAILS` was added on **measured evidence**, in the same
way and for the same class of reason as the two exporter keys. With the block as it stood just before
this key (the seven entries above) in force, Claude Code 2.1.220 emits **no** `tool_parameters` and
**no** `tool_input` attribute on any tool event — so §10.4's Bash command text is not merely unread by
the sink, it never reaches it. Paired control runs (identical but for this one key) confirmed both
directions. The visible cost of its absence was a store in which **every** `bash_command.text` was
empty and **every** Bash row classified `other`, silently emptying the `git` / `build_test` /
`search` buckets §10.6 exists to produce — a block that looks complete, passes every gate, and
records a column of blanks.

It is **non-gating**, like the delay and the two exporter keys: its absence costs one raw-only field,
not emission, so the auto-start preamble's gate stays exactly **four** keys. A user whose block
predates this key keeps collecting spans and simply keeps getting an empty command — re-running
`setup` and restarting is the whole remedy.

**Scope, stated because it is a privacy decision and not a formatting one.** This key makes Claude
Code emit tool *parameters*, which for `Bash` is the full command line — and a command line can
carry a secret in an argument. That is why it is written through the same confirm-first diff as the
credential and never silently. It does **not** enable `OTEL_LOG_USER_PROMPTS`,
`OTEL_LOG_TOOL_CONTENT`, or `OTEL_LOG_RAW_API_BODIES`, which stay unset; the store remains
loopback-only, per-repository, and gitignored.

The credential is read from `<telemetry.root>/.ptp-telemetry-credential`, **reused** when present
and, when absent, generated **provisionally in memory** and persisted only after confirmation
(`ptp-telemetry-setup` [setup-consent-scope]).

**The credential's value is never rendered in the diff** — the `OTEL_EXPORTER_OTLP_HEADERS` row shows
`x-ptp-store-token=<…>` with a description of which credential it is (the store's existing one, or a
newly generated one) and a `value_redacted` marker, exactly as `status` reports its match verdict
without printing it (§14.6). What is confirmed is therefore the **key set and the reuse-or-mint
decision**, not a byte string: a provisional credential lives only inside the process that minted it,
so a value printed by `setup-plan` would not be the value `setup-apply` persists. Every other key
shows its literal old and new value.

---

<!-- ptp-telemetry:anchor id=sink-lifecycle class=substrate -->