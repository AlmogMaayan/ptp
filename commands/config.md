---
description: Interactively set a ptp config value — guides you through target (user/global or project), parameter selection (codex.mode or review.maxIterations), and value selection, then writes the chosen value into the correct config.json with a safe merge-write that preserves existing keys.
argument-hint: "(no arguments — fully interactive)"
---

You are running **`/ptp:config`** — a guided front door for editing ptp's layered configuration
files (`~/.claude/ptp/config.json` and `<repo>/.claude/ptp/config.json`). It walks you through
choosing a target layer, selecting a parameter (`codex.mode` or `review.maxIterations`), and
picking a valid value, then writes only the targeted key while preserving all other existing keys
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
