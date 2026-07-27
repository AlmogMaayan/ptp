---
description: Interactively set a ptp config value — guides you through target (user/global or project), parameter selection (codex.mode, codex.model, codex.reasoningEffort, review.maxIterations, roles.main, telemetry.mode, telemetry.root, telemetry.port, telemetry.retentionDays, parallel.mode, or parallel.maxConcurrency), and value selection, then writes the chosen value into the correct config.json with a safe merge-write that preserves existing keys.
argument-hint: "(no arguments — fully interactive)"
---

You are running **`/ptp:config`** — a guided front door for editing ptp's layered configuration
files (`~/.claude/ptp/config.json` and `<repo>/.claude/ptp/config.json`). It walks you through
choosing a target layer, selecting a parameter (`codex.mode`, `codex.model`,
`codex.reasoningEffort`, `review.maxIterations`, `roles.main`, `telemetry.mode`, `telemetry.root`,
`telemetry.port`, `telemetry.retentionDays`, `parallel.mode`, or `parallel.maxConcurrency` — eleven
in all), and picking a valid value, then writes only the targeted key while preserving all other existing keys
(including the `deploy` block). A missing file or directory is created automatically. A malformed
or wrong-shape existing file is never overwritten.

## Steps

1. **Invoke the `ptp-config` skill** via the Skill tool. The skill holds the complete methodology:
   target selection and path resolution, parameter registry (with `kind`-based value selection),
   current value display, value validation, the safe merge-write contract (preserve keys, refuse on
   malformed/wrong-shape JSON, create dir/file if absent, pretty-print), and the result report. Do
   not restate the skill's steps here.
2. **STOP** when the skill reports its terminal state (write confirmation, no-op report, or error
   stop).

## Hard rules

- **Read-only with respect to git.** Never commit, push, or stage the edited config file.
- **Never overwrite a malformed or wrong-shape file.** If the target file exists but does not
  parse as valid JSON, or if its root is not an object, or if a parent value along the selected
  parameter's path exists but is not an object, STOP and report — do not overwrite.
- **Enum-only writes for `codex.mode`.** Only `auto`, `required`, or `off` may be written for
  `codex.mode`. No free-form values.
- **Positive-integer writes for `review.maxIterations`.** Only a positive integer (`>= 1`) may be
  written for `review.maxIterations`. Invalid input (non-numeric, non-integer, zero, negative) is
  rejected and re-prompted, never written.
- **Enum-only writes for `roles.main`.** Only `claude` or `codex` may be written for `roles.main`.
  No free-form values.
- **Enum-only writes for `telemetry.mode`.** Only `off` or `on` may be written for
  `telemetry.mode`. No free-form values.
- **Validated writes for `telemetry.root`.** Only a non-empty, trimmed, repository-relative path
  resolving strictly below the repository root may be written. Absolute paths, any `..` segment, and
  values resolving to the repository root itself (`""`, `.`, `./`, `/`) are rejected and
  re-prompted, never written.
- **TCP-port writes for `telemetry.port`.** Only an integer within `1..65535` may be written.
  Non-integer, zero, negative, and out-of-range input is rejected and re-prompted, never written.
  Changing it does not update an already-written exporter endpoint — `/ptp:telemetry setup` must be
  re-run and Claude Code restarted.
- **Positive-integer writes for `telemetry.retentionDays`.** Only a positive integer (`>= 1`) may be
  written; zero, negatives, non-integers, and string-typed input are rejected and re-prompted, never
  written. The value prunes the **raw** telemetry store only (`<telemetry.root>/<epic>/raw/`), only
  when a human runs `/ptp:telemetry report`, and never the run ledger, the CSV exports, or the
  store-wide `_unattributed/` store. State the consequence when offering it: because
  `/ptp:telemetry export` is always a global re-derivation from the raw store, the **next `export`
  after a prune rewrites `spans.csv` without the pruned rows**.
- **Enum-only writes for `parallel.mode`.** Only `off` or `on` may be written for `parallel.mode`.
  No free-form values. `on` is a permission, not a guarantee — a stage that cannot establish all
  four `ptp-parallel-fanout` safety conditions still runs serially.
- **Range-bounded integer writes for `parallel.maxConcurrency`.** Only an integer within `1..10` may
  be written. Non-integer, string-typed, zero, negative, and above-10 input is rejected and
  re-prompted, never written, so the editor can never disable the fan-out cap.
