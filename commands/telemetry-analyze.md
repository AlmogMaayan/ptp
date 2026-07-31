---
description: Render the de-nested LLM-vs-tools work breakdown over the ptp raw span store — leaf work, the inside-subagent vs main-agent split, token burn by model, tool work by tool_name, bash-by-command, and a mandatory data-quality footer. Store-wide including `_unattributed`. Takes no selector. Creates no file, modifies no existing file, and deletes nothing — it may be called read-only. The direct front door onto the same subcommand `/ptp:telemetry analyze` dispatches; all methodology lives in the shared ptp-telemetry-analyze skill.
argument-hint: "(takes no selector; the analysis engine's own non-selector flags are passed through)"
---

You are running **`/ptp:telemetry-analyze`** — the direct front door onto ptp's predefined analysis
engine over the **raw** span store.

It is the same subcommand `/ptp:telemetry analyze` dispatches, reached without the router. **It is
not an eighth `/ptp:telemetry` subcommand**; the router's count stays **seven**.

It is a thin wrapper. The engine's flag surface, source selection and degradation, wrapper
exclusion, nesting-method resolution, arithmetic, six outputs, and mandatory data-quality footer all
live in the `ptp-telemetry-analyze` skill — and the store layout, span record, mapping tables, and
ledger join live in `ptp-telemetry`. Do not restate any of it here.

## Steps

1. **Invoke the `ptp-telemetry-analyze` skill** via the Skill tool. The skill holds the complete
   methodology; do not restate its steps here.
2. Pass the rest of the argument through **as the user typed it** — but it is **not a selector**.
   The skill owns analyze's flag handling; nothing from this invocation is ever handed to
   `ptp-change-selector`, and `write` carries no meaning here. An argument that is not one of the
   analysis engine's explicit non-selector flags is reported as unsupported **without writing
   anything**.
3. **STOP** when the skill reports the rendered breakdown — which names no written path, because
   `analyze` writes none.

## Hard rules

- **Creates no file, modifies no existing file, and deletes nothing.** The third clause is worded
  deliberately against `report`'s: `report` "deletes only aged raw files" because a default
  invocation prunes irreversibly, while this command performs **no deletion of any kind**, triggers
  no retention pass, and writes no `analyze.md`. It **may** be called read-only — exactly as
  `/ptp:telemetry status` may and `/ptp:telemetry report` may not.
- **Takes no selector and adds no grammar.** Store-wide over the raw store, `_unattributed`
  included; **never** delegated to `ptp-change-selector`. `report` remains the one
  `/ptp:telemetry` subcommand that resolves a change selector.
- **This is not `/ptp:analyze`.** The names collide and nothing else does: `/ptp:analyze` is the
  read-only investigation command that writes an analysis doc into a change folder, specced by the
  **`analyze`** capability; this command renders a telemetry work breakdown and is specced by the
  **`telemetry`** capability. Never route one to the other, and never file a change against the
  wrong capability because of the shared word.
- **No branch guard, no `openspec validate`, no git write**, and **no auto-start preamble** — it
  does not use `ptp-run-at-model`, which is what keeps it from starting a process. It never creates
  the store and never infers the mode from it.
- **Never restate the skills' contract here** — the methodology is defined once, in
  `ptp-telemetry-analyze`, over a substrate defined once in `ptp-telemetry`.
