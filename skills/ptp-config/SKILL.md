---
name: ptp-config
description: Use this skill when the user wants to interactively set a ptp configuration value (e.g. codex.mode) in either the global (~/.claude/ptp/config.json) or project (<repo>/.claude/ptp/config.json) config file — guiding them through target selection, parameter announcement, current-value display, value selection, and safe merge-write without clobbering existing keys or malformed files.
---

# ptp-config — interactive config editor

## Purpose

This skill drives the `/ptp:config` command: a guided, schema-aware front door for editing ptp's
layered JSON config files. It replaces hand-editing with a target → parameter → value flow and
performs a **safe merge-write** that preserves every existing key (including the `deploy` block),
refuses to touch a malformed or wrong-shape file, and creates the file/directory if absent.

This skill is **interactive** — it is not part of the autonomous plan/apply pipeline. Using
`AskUserQuestion` here is correct and deliberate (contrast with plan/apply/review commands where
AskUserQuestion is forbidden).

---

## Parameter registry

The registry is the single source of truth for settable parameters. New parameters are added here;
no control flow changes are needed.

```
parameters = [
  {
    key:      "codex.mode",
    label:    "Use Codex for review",
    jsonPath: ["codex", "mode"],
    kind:     "enum",
    values: [
      { value: "auto",     desc: "Use Codex when on PATH; degrade to Superpowers-only if missing (default)" },
      { value: "required", desc: "Require Codex; dual-reviewer commands STOP if it is missing" },
      { value: "off",      desc: "Skip Codex; run Superpowers-only" }
    ],
    default: "auto"
  },
  {
    key:      "codex.model",
    label:    "Codex model override",
    jsonPath: ["codex", "model"],
    kind:     "string",
    default:  undefined  // unset
  },
  {
    key:      "codex.reasoningEffort",
    label:    "Codex reasoning effort",
    jsonPath: ["codex", "reasoningEffort"],
    kind:     "enum",
    values: [
      { value: "minimal", desc: "Minimal reasoning effort" },
      { value: "low",     desc: "Low reasoning effort" },
      { value: "medium",  desc: "Medium reasoning effort" },
      { value: "high",    desc: "High reasoning effort" }
    ],
    default: undefined  // unset
  },
  {
    key:      "review.maxIterations",
    label:    "Max review-loop iterations",
    jsonPath: ["review", "maxIterations"],
    kind:     "integer",
    default:  5
  }
]
```

**Parameter menu:** The registry currently holds four entries. Step 2 builds an `AskUserQuestion`
menu from each entry's `label` value and presents it to the user. The flow is data-driven: adding
a new entry to the registry automatically adds it to the menu with no further edits to this flow.

---

## Flow

### Step 1 — Target selection

Use `AskUserQuestion` to ask the user which config layer to edit:

- **User / global** — operates on `~/.claude/ptp/config.json`
- **Project** — operates on `<repo>/.claude/ptp/config.json`

**Path resolution:**

- **Global:** resolve the user's home directory (on Windows:
  `C:\Users\<user>\.claude\ptp\config.json`; on POSIX: `$HOME/.claude/ptp/config.json`) and
  construct the absolute path.
- **Project:** run `git rev-parse --show-toplevel` to find the repository root, then append
  `/.claude/ptp/config.json`. If the command is **not** run inside a git repository, fall back
  to the current working directory (`<cwd>/.claude/ptp/config.json`) and **note the fallback in
  the output** so the user can confirm the intended location before proceeding.

After resolving, display the absolute path so the user can confirm it is the right file.

These are the same two files `skills/ptp-deploy/SKILL.md` reads for config, keeping the reader
and writer pointed at one schema.

### Step 2 — Parameter selection

Build an `AskUserQuestion` menu from the registry entries' `label` values:

1. **Use Codex for review** (`codex.mode`)
2. **Codex model override** (`codex.model`)
3. **Codex reasoning effort** (`codex.reasoningEffort`)
4. **Max review-loop iterations** (`review.maxIterations`)

Use the selected entry's `jsonPath`, `kind`, `values` (for enum entries), and `default` for the
remaining steps. This is data-driven off the registry — adding a parameter requires only a new
registry entry, no other edits to this flow.

### Step 3 — Read and show current value

1. Check whether the resolved target file **exists**.
   - If it **does not exist**, report "File not found — will be created on write." and treat the
     base JSON as `{}`.
   - If it **exists**, read its contents.

2. **Parse the file contents:**
   - If the contents are **empty or contain only whitespace**, treat as `{}`.
   - If the contents are **non-empty and do not parse as valid JSON**, **STOP and report** the
     parse failure (include the file path and a note that the file was not modified). Do **not**
     proceed further or overwrite. End the command here.

3. **Validate the shape before proceeding:**
   - If the parsed root is **not a JSON object** (e.g. `[]`, a string, a number, or `null`):
     **STOP and report** — the file's root value is not an object; the command cannot safely merge
     into it without destroying data. File unchanged. End the command here.
   - If the selected parameter's **parent key** exists in the root object but its value is **not a
     JSON object**, **STOP and report** — the parent exists but is not an object; merging into it
     would clobber data. File unchanged. End the command here. Specifically:
     - For `codex.mode`, `codex.model`, or `codex.reasoningEffort` (they share the same `codex`
       parent): if `codex` exists but is not an object (e.g. `{"codex":"auto"}` or
       `{"codex":null}`), STOP.
     - For `review.maxIterations`: if `review` exists but is not an object (e.g. `{"review":"x"}`
       or `{"review":null}`), STOP.
   - Absent parents (`codex` or `review` not present in the root) are fine — they will be created
     as empty objects on write. This is not clobbering.

4. Show the **current value** of the selected parameter:
   - If the parameter's value is set in the file (at its `jsonPath`), display:
     `Current value: <value>`
   - If it is absent, display: `Current value: unset (default: <entry.default>)`
   - For example, for `codex.mode`: `Current value: unset (default: "auto")`; for
     `review.maxIterations`: `Current value: unset (default: 5)`

### Step 4 — Value selection

Branch on the selected parameter's `kind`:

#### kind = `enum` (e.g. `codex.mode`)

Use `AskUserQuestion` to offer the parameter's `values`. For `codex.mode`, the three valid values
are:

1. **`auto`** — Use Codex when on PATH; degrade to Superpowers-only if missing (default)
2. **`required`** — Require Codex; dual-reviewer commands STOP if it is missing
3. **`off`** — Skip Codex; run Superpowers-only

These are the only options. **Never write a value that is not in the entry's `values` list.** The
value written to the file is exactly the selected string (verbatim, lowercase).

#### kind = `enum` (e.g. `codex.reasoningEffort`)

Use `AskUserQuestion` to offer the parameter's `values`. For `codex.reasoningEffort`, the four valid
values are:

1. **`minimal`** — Minimal reasoning effort
2. **`low`** — Low reasoning effort
3. **`medium`** — Medium reasoning effort
4. **`high`** — High reasoning effort

These are the only options. **Never write a value that is not in the entry's `values` list.** The
value written to the file is exactly the selected string (verbatim, lowercase).

#### kind = `string` (e.g. `codex.model`)

Prompt the user for a free-text value (no fixed options; e.g. a Codex model id like `gpt-5.6`). Then
validate the input:

- **Accept:** any non-empty string after trimming leading/trailing whitespace. The value is written
  as a JSON **string**, trimmed.
- **Reject and re-prompt** on empty input or input that is only whitespace — do NOT write an empty
  value.

When rejecting, report that the value must be non-empty and ask again. Only proceed to step 5 once a
non-empty, non-whitespace-only string is in hand.

#### kind = `integer` (e.g. `review.maxIterations`)

Prompt the user for an integer value (show the entry's `default` as the suggested value, e.g.
`default: 5`). Then validate the input:

- **Accept:** a plain positive integer (`>= 1`). The value is written as a JSON **number**, not
  a string.
- **Reject and re-prompt** on any of the following — do NOT write an invalid value:
  - Non-numeric input (e.g. `abc`)
  - Non-integer numeric input (e.g. `5.5`)
  - String-typed input that looks like a number (e.g. `"5"`)
  - Zero (`0`)
  - Any negative integer (e.g. `-1`)

When rejecting, report why the value is invalid (e.g. "must be a positive integer >= 1") and ask
again. Only proceed to step 5 once a valid positive integer is in hand.

**Relationship to the slice-01 resolver:** the validity rule used here (`>= 1`, positive integer)
is the SAME rule the slice-01 `ptp-review-loop` resolver uses to decide whether a stored
`review.maxIterations` value is honored. The two surfaces are complementary by design: this editor
is **STRICT** — it rejects invalid input and re-prompts, so an invalid value is never written to
the file — while the resolver is **FORGIVING** — it ignores a layer whose value is invalid and
continues resolution (defaulting to `5` only when no layer supplies a valid value), never throwing
or stopping over a config typo. Do not align one to the other: softening the editor to accept-and-
default would silently write a useless value; hardening the resolver to STOP would break its
forgiving contract.

### Step 5 — Safe merge-write

With the resolved path, the base JSON object (from step 3), and the chosen value (from step 4):

1. **Idempotency check:** if the current value of the selected parameter in the base JSON already
   equals the chosen value, **report a no-op** ("already set to `<value>` — no change made") and
   end the command. (It is safe to re-write byte-identical content, but prefer reporting the no-op.)

2. **Set the target path:** in the base JSON object, navigate the selected entry's `jsonPath`:
   - If the parent key is absent from the root, create it as an empty object `{}`.
     For `codex.mode`, `codex.model`, or `codex.reasoningEffort`: create `codex` as `{}`; for
     `review.maxIterations`: create `review` as `{}`.
   - Set the targeted key to the chosen value.
   - Leave **every other key** (e.g. `deploy`, any unknown keys) and every other nested value
     **untouched**.

3. **Create parent directory if needed:** if the file's parent directory does not exist, create it
   (including any intermediate directories).

4. **Write:** serialize the modified JSON as **pretty-printed JSON with 2-space indentation** and
   write it to the resolved file path.

   Note on "preserve": preservation is **semantic** (all other JSON keys and values are kept as
   data), not byte-for-byte. Re-serialization may normalize indentation and key ordering — this is
   expected and harmless. Comments cannot survive (strict JSON has none; a file with comments
   would already have failed the parse check in step 3).

### Step 6 — Report

After writing, report:

- The **absolute path** of the file written.
- The **selected parameter key** and the **new value** that was written.

Examples:
> Written: `/home/alice/.claude/ptp/config.json`
> codex.mode = `auto`

> Written: `/home/alice/.claude/ptp/config.json`
> review.maxIterations = `8`

---

## Error-handling summary

| Situation | Behavior |
|-----------|----------|
| Target file missing | Create dir + file with just the chosen parameter value. |
| Target file empty / whitespace | Treat as `{}`, populate normally. |
| Target file valid JSON with other keys | Merge; preserve all other keys. |
| Target file present but invalid JSON | STOP, report parse failure, do **not** overwrite. |
| Root parses to non-object (`[]`, string, number, `null`) | STOP, report, do **not** overwrite. |
| `codex` present but not an object (`"codex":"auto"`, `"codex":null`) — applies to `codex.mode`, `codex.model`, and `codex.reasoningEffort` alike | STOP, report, do **not** overwrite. |
| `review` present but not an object (`"review":"x"`, `"review":null`) | STOP, report, do **not** overwrite. |
| `review` absent | Created as `{}` on write; not clobbering. |
| Integer input not a positive integer (`0`, `-1`, `5.5`, `"5"`, `abc`) | Reject, re-prompt; do NOT write. |
| Integer equals current stored value | Report no-op; do not write. |
| `codex.model` input empty or whitespace-only | Reject, re-prompt; do NOT write. |
| `codex.reasoningEffort` selection outside `minimal|low|medium|high` | Not offered — the enum menu only presents the four valid values. |
| Not in a git repo (project target) | Fall back to `<cwd>/.claude/ptp/config.json`; note the fallback in output. |
| Chosen value equals current stored value | Report no-op; do not write. |

---

## Hard rules

- **Never commit, push, stage, or otherwise mutate git state.** This is a file write only — no
  history-, index-, or ref-changing git operations. The one allowed git command is the read-only
  `git rev-parse --show-toplevel` used in step 1 to resolve the project config path.
- **Never overwrite a file with malformed JSON.** If the file exists and does not parse (and is
  not empty/whitespace), STOP and report.
- **Never overwrite a file with wrong-shape JSON** (non-object root, or a non-object parent value
  for the selected key — e.g. a non-object `codex` value or a non-object `review` value). STOP
  and report.
- **Never write an out-of-enum value for `codex.mode`.** Only `auto`, `required`, or `off` may be
  written for `codex.mode`. The value comes from the step 4 enum menu — never from free-form user
  input.
- **Never write an out-of-enum value for `codex.reasoningEffort`.** Only `minimal`, `low`, `medium`,
  or `high` may be written. The value comes from the step 4 enum menu — never from free-form user
  input.
- **Never write an empty or whitespace-only string for `codex.model`.** Only a non-empty, trimmed
  string may be written; empty/whitespace-only input is rejected and re-prompted.
- **Never write an invalid integer for `review.maxIterations`.** Only a positive integer (`>= 1`)
  may be written. Any non-positive, non-integer, non-numeric, or string-typed input is rejected
  and re-prompted — never written.
- **Never touch keys other than the selected parameter's `jsonPath`.** All other keys (including
  `deploy`, sibling `codex` keys, and any unknown keys) are preserved as data in the serialized
  output.
- This is an **ordinary interactive command** — `AskUserQuestion` is used deliberately and is
  allowed here. It is **not** part of the autonomous plan/apply pipeline.
