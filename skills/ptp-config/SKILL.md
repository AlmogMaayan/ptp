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
    values: [
      { value: "auto",     desc: "Use Codex when on PATH; degrade to Superpowers-only if missing (default)" },
      { value: "required", desc: "Require Codex; dual-reviewer commands STOP if it is missing" },
      { value: "off",      desc: "Skip Codex; run Superpowers-only" }
    ],
    default: "auto"
  }
]
```

**Single-parameter rule:** `AskUserQuestion` requires ≥ 2 options. While the registry has exactly
one entry, **step 2 (parameter selection) is skipped entirely** — the skill announces the parameter
and proceeds directly to step 3. When a second parameter is added to the registry, the parameter
menu appears automatically with no further change. This is the one non-obvious wiring detail; it
is intentional and documented here so future maintainers understand why the menu is absent for the
current one-parameter case.

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

**Registry has exactly one entry → skip the menu.** Announce to the user:

> Setting parameter: **codex.mode** ("Use Codex for review")

Then proceed immediately to step 3. (When the registry holds ≥ 2 entries, this skip no longer
applies: build an `AskUserQuestion` menu from the registry entries' `label` values, then use the
selected entry's `jsonPath`, `values`, and `default` for the remaining steps. This is data-driven
off the registry — adding a parameter requires only a new registry entry, no other edits to this
flow.)

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
   - If `codex` exists in the root object but its value is **not a JSON object** (e.g.
     `{"codex":"auto"}` or `{"codex":null}`): **STOP and report** — `codex` exists but is not an
     object; merging into it would clobber data. File unchanged. End the command here.
   - Absent parents (`codex` not present in the root) are fine — they will be created as empty
     objects on write. This is not clobbering.

4. Show the **current value** of `codex.mode`:
   - If `codex.mode` is set in the file, display: `Current value: "<value>"`
   - If it is absent, display: `Current value: unset (default: "auto")`

### Step 4 — Value selection

Use `AskUserQuestion` to offer the three valid enum values for `codex.mode`:

1. **`auto`** — Use Codex when on PATH; degrade to Superpowers-only if missing (default)
2. **`required`** — Require Codex; dual-reviewer commands STOP if it is missing
3. **`off`** — Skip Codex; run Superpowers-only

These are the only options. **Never write a value that is not in this list.** The value written
to the file is exactly the selected string (verbatim, lowercase).

### Step 5 — Safe merge-write

With the resolved path, the base JSON object (from step 3), and the chosen value (from step 4):

1. **Idempotency check:** if the current value of `codex.mode` in the base JSON already equals the
   chosen value, **report a no-op** ("already set to `<value>` — no change made") and end the
   command. (It is safe to re-write byte-identical content, but prefer reporting the no-op.)

2. **Set the target path:** in the base JSON object, navigate `jsonPath = ["codex", "mode"]`:
   - If `codex` is absent from the root, create it as an empty object `{}`.
   - Set `codex.mode` to the chosen value.
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
- The **new value** of `codex.mode` that was written.

Example:
> Written: `/home/alice/.claude/ptp/config.json`
> codex.mode = `auto`

---

## Error-handling summary

| Situation | Behavior |
|-----------|----------|
| Target file missing | Create dir + file with just the chosen `codex.mode` value. |
| Target file empty / whitespace | Treat as `{}`, populate normally. |
| Target file valid JSON with other keys | Merge; preserve all other keys. |
| Target file present but invalid JSON | STOP, report parse failure, do **not** overwrite. |
| Root parses to non-object (`[]`, string, number, `null`) | STOP, report, do **not** overwrite. |
| `codex` present but not an object (`"codex":"auto"`, `"codex":null`) | STOP, report, do **not** overwrite. |
| Not in a git repo (project target) | Fall back to `<cwd>/.claude/ptp/config.json`; note the fallback in output. |
| Chosen value equals current stored value | Report no-op; do not write. |

---

## Hard rules

- **Never commit, push, stage, or otherwise mutate git state.** This is a file write only — no
  history-, index-, or ref-changing git operations. The one allowed git command is the read-only
  `git rev-parse --show-toplevel` used in step 1 to resolve the project config path.
- **Never overwrite a file with malformed JSON.** If the file exists and does not parse (and is
  not empty/whitespace), STOP and report.
- **Never overwrite a file with wrong-shape JSON** (non-object root, or a non-object `codex`
  value). STOP and report.
- **Never write an out-of-enum value.** Only `auto`, `required`, or `off` may be written for
  `codex.mode`. The value comes from the step 4 menu — never from free-form user input.
- **Never touch keys other than the selected parameter's `jsonPath`.** All other keys (including
  `deploy` and any unknown keys) are preserved as data in the serialized output.
- This is an **ordinary interactive command** — `AskUserQuestion` is used deliberately and is
  allowed here. It is **not** part of the autonomous plan/apply pipeline.
