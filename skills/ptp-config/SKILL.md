---
name: ptp-config
description: Own interactive ptp configuration, guiding target, parameter, and value selection into a safe write
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
      { value: "auto",     desc: "Use Codex when on PATH; degrade to a main-only run if missing (default)" },
      { value: "required", desc: "Require Codex; dual-reviewer commands STOP if it is missing" },
      { value: "off",      desc: "Skip Codex; run main-only" }
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
  },
  {
    key:      "review.minSeverity",
    label:    "Lowest severity to handle",
    jsonPath: ["review", "minSeverity"],
    kind:     "enum",
    values: [
      { value: "low",      desc: "Handle low and above — every severity (default; today's behavior)" },
      { value: "medium",   desc: "Handle medium and above; low findings are out of scope" },
      { value: "high",     desc: "Handle high and above" },
      { value: "critical", desc: "Handle critical findings only" }
    ],
    default: "low"
  },
  {
    key:      "review.autoRecutOnBudgetExceeded",
    label:    "Auto re-cut on plan-review budget halt",
    jsonPath: ["review", "autoRecutOnBudgetExceeded"],
    kind:     "boolean",
    default:  false
  },
  {
    key:      "roles.main",
    label:    "Main agent",
    jsonPath: ["roles", "main"],
    kind:     "enum",
    values: [
      { value: "claude", desc: "Claude is the main planning/implementation agent; Codex is the reviewer (default)" },
      { value: "codex",  desc: "Codex is the main planning/implementation agent; Claude is the reviewer" }
    ],
    default: "claude"
  },
  {
    key:      "telemetry.mode",
    label:    "Record ptp run telemetry",
    jsonPath: ["telemetry", "mode"],
    kind:     "enum",
    values: [
      { value: "off", desc: "Record no telemetry; every ptp command behaves exactly as before (default)" },
      { value: "on",  desc: "Record a run-ledger window per ptp main run under the telemetry store root" }
    ],
    default: "off"
  },
  {
    key:      "telemetry.root",
    label:    "Telemetry store root",
    jsonPath: ["telemetry", "root"],
    kind:     "string",
    default:  "openspec/telemetry"
  },
  {
    key:      "telemetry.port",
    label:    "Telemetry receiver port",
    jsonPath: ["telemetry", "port"],
    kind:     "integer",
    default:  4318
  },
  {
    key:      "telemetry.retentionDays",
    label:    "Telemetry raw-store retention (days)",
    jsonPath: ["telemetry", "retentionDays"],
    kind:     "integer",
    default:  30
  },
  {
    key:      "parallel.mode",
    label:    "Run planning stages in parallel",
    jsonPath: ["parallel", "mode"],
    kind:     "enum",
    values: [
      { value: "off", desc: "Run every per-item unit of work one item at a time (default)" },
      { value: "on",  desc: "Permit a stage to run its per-item main runs concurrently when all four ptp-parallel-fanout safety conditions hold" }
    ],
    default: "off"
  },
  {
    key:      "parallel.maxConcurrency",
    label:    "Max parallel fan-out members",
    jsonPath: ["parallel", "maxConcurrency"],
    kind:     "integer",
    default:  3
  },
  {
    key:      "artifact.maxProposalWords",
    label:    "Max proposal.md words",
    jsonPath: ["artifact", "maxProposalWords"],
    kind:     "integer",
    default:  400
  },
  {
    key:      "artifact.maxDesignWords",
    label:    "Max design.md words",
    jsonPath: ["artifact", "maxDesignWords"],
    kind:     "integer",
    default:  800
  },
  {
    key:      "artifact.maxTasksWords",
    label:    "Max tasks.md words",
    jsonPath: ["artifact", "maxTasksWords"],
    kind:     "integer",
    default:  600
  },
  {
    key:      "artifact.maxTaskCount",
    label:    "Max tasks.md checkboxes",
    jsonPath: ["artifact", "maxTaskCount"],
    kind:     "integer",
    default:  15
  },
  {
    key:      "artifact.maxTaskWords",
    label:    "Max words per checkbox",
    jsonPath: ["artifact", "maxTaskWords"],
    kind:     "integer",
    default:  60
  },
  {
    key:      "artifact.maxSpecDeltaWords",
    label:    "Max spec-delta words (summed)",
    jsonPath: ["artifact", "maxSpecDeltaWords"],
    kind:     "integer",
    default:  1200
  },
  {
    key:      "backlog.projectOwner",
    label:    "Backlog project owner",
    jsonPath: ["backlog", "projectOwner"],
    kind:     "string",
    default:  undefined  // unset
  },
  {
    key:      "backlog.projectNumber",
    label:    "Backlog project number",
    jsonPath: ["backlog", "projectNumber"],
    kind:     "integer",
    default:  undefined  // unset
  },
  {
    key:      "backlog.statusOptions",
    label:    "Backlog status option names",
    jsonPath: ["backlog", "statusOptions"],       // a PREFIX; the member is appended
    kind:     "map",
    members: [                                    // the schema's canonical status order
      { member: "backlog",     label: "backlog",     default: ["backlog", "Backlog"] },
      { member: "ready",       label: "ready",       default: ["ready", "Ready"] },
      { member: "in-progress", label: "in-progress", default: ["in-progress", "In Progress"] },
      { member: "in-review",   label: "in-review",   default: ["in-review", "In Review"] },
      { member: "done",        label: "done",        default: ["done", "Done"] },
      { member: "blocked",     label: "blocked",     default: ["blocked", "Blocked"] },
      { member: "cancelled",   label: "cancelled",   default: ["cancelled", "Cancelled", "Canceled"] }
    ],
    memberKind: "stringList",
    default:  undefined                           // unset = the built-in default table
  }
]
```

**Parameter menu:** The registry currently holds twenty-two entries. Step 2 builds an `AskUserQuestion`
menu from each entry's `label` value and presents it to the user. The flow is data-driven: adding
a new entry to the registry automatically adds it to the menu with no further edits to this flow.

---

## Flow

### Step 1 — Target selection

Use `AskUserQuestion` to ask the user which config layer to edit:

- **User / global** — operates on `~/.claude/ptp/config.json`
- **Project** — operates on `<repo>/.claude/ptp/config.json`
- **Workspace** — operates on `<workspace-root>/.claude/ptp/config.json`, offered only when its
  resolved config path **differs** from the Project target's resolved config path (normalized,
  absolute comparison — see below)

**Path resolution:**

- **Global:** resolve the user's home directory (on Windows:
  `C:\Users\<user>\.claude\ptp\config.json`; on POSIX: `$HOME/.claude/ptp/config.json`) and
  construct the absolute path.
- **Project:** run `git rev-parse --show-toplevel` to find the repository root, then append
  `/.claude/ptp/config.json`. If the command is **not** run inside a git repository, fall back
  to the current working directory (`<cwd>/.claude/ptp/config.json`) and **note the fallback in
  the output** so the user can confirm the intended location before proceeding.
- **Workspace:** resolve the workspace root through the `ptp-workspace` skill — **never** through
  `git rev-parse --show-toplevel`, which stays Project's own resolution alone — and append
  `/.claude/ptp/config.json`. Compare the resulting absolute path against the Project target's
  resolved path, both normalized (absolute, separators folded, `.`/`..` resolved), case-insensitively
  on Windows and case-sensitively on POSIX. Offer the Workspace entry only when the two paths
  **differ**; when they coincide, offer only the two existing entries and state that the workspace
  root coincides with the project root, so no two menu entries ever resolve to the same file.

After resolving, display the absolute path so the user can confirm it is the right file.

**Two, and only two, omission cases exist for the Workspace entry:**

1. The workspace root resolves and its config path **coincides** with Project's — the entry
   collapses into today's two entries, and the coincidence is noted.
2. The workspace root is **missing or its resolution fails** — the entry is omitted with the reason
   noted, and the command never STOPs over it.

No separate rule exists for running outside a git repository: that case falls under omission case 2,
because the resolver reports no workspace root there and so yields no path to compare.

`skills/ptp-deploy/SKILL.md` reads these files through the layered configuration contract owned by
`ptp-workspace`, keeping the reader and writer pointed at one schema.

### Step 2 — Parameter selection

Build an `AskUserQuestion` menu from the registry entries' `label` values:

1. **Use Codex for review** (`codex.mode`)
2. **Codex model override** (`codex.model`)
3. **Codex reasoning effort** (`codex.reasoningEffort`)
4. **Max review-loop iterations** (`review.maxIterations`)
5. **Lowest severity to handle** (`review.minSeverity`)
6. **Auto re-cut on plan-review budget halt** (`review.autoRecutOnBudgetExceeded`)
7. **Main agent** (`roles.main`)
8. **Record ptp run telemetry** (`telemetry.mode`)
9. **Telemetry store root** (`telemetry.root`)
10. **Telemetry receiver port** (`telemetry.port`)
11. **Telemetry raw-store retention (days)** (`telemetry.retentionDays`)
12. **Run planning stages in parallel** (`parallel.mode`)
13. **Max parallel fan-out members** (`parallel.maxConcurrency`)
14. **Max proposal.md words** (`artifact.maxProposalWords`)
15. **Max design.md words** (`artifact.maxDesignWords`)
16. **Max tasks.md words** (`artifact.maxTasksWords`)
17. **Max tasks.md checkboxes** (`artifact.maxTaskCount`)
18. **Max words per checkbox** (`artifact.maxTaskWords`)
19. **Max spec-delta words (summed)** (`artifact.maxSpecDeltaWords`)
20. **Backlog project owner** (`backlog.projectOwner`)
21. **Backlog project number** (`backlog.projectNumber`)
22. **Backlog status option names** (`backlog.statusOptions`)

Use the selected entry's `jsonPath`, `kind`, `values` (for enum entries), and `default` for the
remaining steps. This is data-driven off the registry — adding a parameter requires only a new
registry entry, no other edits to this flow.

### Step 2b — Member selection

**This step applies to `map`-kind entries only.** For every other kind it is not reached and the flow
runs exactly as before.

When the selected entry's `kind` is `map`, use `AskUserQuestion` to offer that entry's `members`, each
shown with its **current or default** row — for `backlog.statusOptions`, the seven entry status values in
the schema's canonical order:

1. **backlog** (default row: `backlog`, `Backlog`)
2. **ready** (default row: `ready`, `Ready`)
3. **in-progress** (default row: `in-progress`, `In Progress`)
4. **in-review** (default row: `in-review`, `In Review`)
5. **done** (default row: `done`, `Done`)
6. **blocked** (default row: `blocked`, `Blocked`)
7. **cancelled** (default row: `cancelled`, `Cancelled`, `Canceled`)

**Where the *current* row in that menu comes from, since the file is not read until step 3.** Read the
target file **for display only** at this point: where it exists, parses as JSON, has an object root, and
has an object at `backlog.statusOptions`, show each member's **stored** row; in **every** other case —
absent file, unparseable contents, non-object root, non-object `backlog` or `statusOptions`, or a member
with no stored value — show that member's **default** row. This display-only read **never STOPs and
never reports a parse or shape failure**: **step 3 remains the sole place** a malformed or wrong-shape
file is diagnosed and the command ends, so the menu never pre-empts it and never diverges from it.

The selected member is appended to the entry's `jsonPath`, so the **effective path** for the remaining
steps is `jsonPath + [member]` — for example `["backlog","statusOptions","done"]`. Every later step runs
on that effective path unchanged.

**One invocation still sets exactly one key.** The member menu selects *which* row is edited; it never
turns one invocation into several writes. The idempotency/no-op report, the `written: <path> / <key> =
<value>` report, and the merge-write's *set only the targeted key* all continue to hold verbatim.

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
     - For `review.maxIterations`, `review.minSeverity`, or `review.autoRecutOnBudgetExceeded` (they
       share the same `review` parent): if `review` exists but is not an object (e.g. `{"review":"x"}`
       or `{"review":null}`), STOP.
     - For `roles.main`: if `roles` exists but is not an object (e.g. `{"roles":"claude"}` or
       `{"roles":null}`), STOP.
     - For `telemetry.mode`, `telemetry.root`, `telemetry.port`, or `telemetry.retentionDays`
       (all four share the same `telemetry` parent): if
       `telemetry` exists but is not an object (e.g. `{"telemetry":"on"}` or
       `{"telemetry":null}`), STOP.
     - For `parallel.mode` or `parallel.maxConcurrency` (they share the same `parallel` parent): if
       `parallel` exists but is not an object (e.g. `{"parallel":"on"}` or `{"parallel":null}`),
       STOP.
     - For any `artifact.*` key (all six share the same `artifact` parent): if `artifact` exists
       but is not an object (e.g. `{"artifact":400}` or `{"artifact":null}`), STOP.
     - For `backlog.projectOwner` or `backlog.projectNumber` (they share the same `backlog`
       parent): if `backlog` exists but is not an object (e.g.
       `{"backlog":"github"}` or `{"backlog":null}`), STOP.
     - For `backlog.statusOptions`, **the same rule at a second level** — not a second rule: if
       `backlog` exists but is not an object, STOP; **and** if `backlog.statusOptions` exists but is
       not an object (e.g. `{"backlog":{"statusOptions":"Ready"}}` or
       `{"backlog":{"statusOptions":null}}`), STOP.
   - Absent parents (`codex`, `review`, `roles`, `telemetry`, `parallel`, `artifact`, or `backlog`
     not present in the root — and, for `backlog.statusOptions`, an absent `statusOptions` under a present `backlog`)
     are fine — they will be created as empty objects on write. This is not clobbering.

4. Show the **current value** of the selected parameter. This is the **authoritative** read — from
   the **selected target file alone** — and it is the sole diagnosis site: the STOP rules above bind
   only this read.
   - Name the **selected target** (Global, Project, or Workspace) and its absolute path alongside the
     value.
   - If the parameter's value is set in the file (at its `jsonPath`), display:
     `Current value: <value>`
   - If it is absent, display: `Current value: unset (default: <entry.default>)`
   - For example, for `codex.mode`: `Current value: unset (default: "auto")`; for
     `review.maxIterations`: `Current value: unset (default: 5)`
   - For a `map`-kind entry the value is read at the **effective path** (step 2b), and an **unset member
     displays that member's own default row** — not the whole default table. For example, for
     `backlog.statusOptions` with `done` selected and nothing stored:
     `Current value: unset (default: done, Done)`

5. Show a **display-only** provenance line, separate from the authoritative read above, naming the
   layer whose value is **effective** at read time under the layered configuration contract owned by
   `ptp-workspace` (`skills/ptp-workspace/SKILL.md` — the layer list and precedence live there and are
   not restated here). Show this line **only when that effective layer is not the selected target**;
   when the selected target itself supplies the effective value, show no provenance line. For a
   `map`-kind entry, evaluate provenance at the **effective path** (step 2b), so the answer is per
   member. This read is **forgiving**: a missing, unparseable, wrong-shape, or invalid non-target
   layer contributes nothing to it, is never reported as an error, and never stops the command — it
   never competes with the authoritative read's STOP rules above. The provenance line is informational
   only: it changes neither the idempotency comparison in step 5 nor what is written.

### Step 4 — Value selection

Branch on the selected parameter's `kind`:

#### kind = `enum` (e.g. `codex.mode`)

Use `AskUserQuestion` to offer the parameter's `values`. For `codex.mode`, the three valid values
are:

1. **`auto`** — Use Codex when on PATH; degrade to a main-only run if missing (default)
2. **`required`** — Require Codex; dual-reviewer commands STOP if it is missing
3. **`off`** — Skip Codex; run main-only

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

#### kind = `enum` (e.g. `review.minSeverity`)

Use `AskUserQuestion` to offer the parameter's `values`. For `review.minSeverity`, the four valid
values are:

1. **`low`** — Handle low and above — every severity (default; today's behavior)
2. **`medium`** — Handle medium and above; low findings are out of scope
3. **`high`** — Handle high and above
4. **`critical`** — Handle critical findings only

These are the only options. **Never write a value that is not in the entry's `values` list.** The
value written to the file is exactly the selected string (verbatim, lowercase). Free-form input
(e.g. `none`, `all`, `blocker`, `High`, `2`) is rejected and re-prompted, never written.

`review.minSeverity` is a **threshold, not an equality test**: the configured value is the lowest
severity that is in scope, and every severity ranked at or above it is also in scope
(`low` = 1 < `medium` = 2 < `high` = 3 < `critical` = 4; a finding is in scope when
`rank(finding) >= rank(minSeverity)`). Selecting `medium`, for example, puts medium, high, and
critical findings in scope and leaves only low findings out of scope.

State plainly at the point of selection: **the shared review loop (`ptp-review-loop`) reads this
key** — findings below the chosen floor are reported but never auto-fixed and never counted toward
convergence. At the default `low` every severity is in scope, so review behavior is unchanged.

#### kind = `boolean` (e.g. `review.autoRecutOnBudgetExceeded`)

Use `AskUserQuestion` to offer exactly two options:

1. **`on (true)`** — Auto re-cut the offending slice instead of stopping the whole `/ptp:full` (or
   `/ptp:full-plan`) run
2. **`off (false)`** — Stop the run and report, exactly as today (default)

These are the only options. **Never write a value that is not a JSON boolean.** The value written to
the file is the literal JSON boolean `true` or `false` — never the string `"true"`/`"false"`. This is
the registry's first `boolean`-kind parameter: unlike `codex.mode`/`telemetry.mode`/`parallel.mode`
(two-value **enums** of the strings `"on"`/`"off"`), this key is a plain JSON boolean, matching the
shape a pure feature switch with no anticipated third value should take.

State plainly at the point of selection: this governs only `/ptp:full`'s (and `/ptp:full-plan`'s)
plan-convergence gate reaction to a slice's `ARTIFACT BUDGET EXCEEDED` / `PHASE 2 ARTIFACT BUDGET
EXCEEDED` — it changes nothing else, and it is capped (see `skills/ptp-full/SKILL.md`) so an auto
re-cut that keeps failing still falls back to stopping and reporting.

#### kind = `enum` (e.g. `roles.main`)

Use `AskUserQuestion` to offer the parameter's `values`. For `roles.main`, the two valid values
are:

1. **`claude`** — Claude is the main planning/implementation agent; Codex is the reviewer (default)
2. **`codex`** — Codex is the main planning/implementation agent; Claude is the reviewer

These are the only options. **Never write a value that is not in the entry's `values` list.** The
value written to the file is exactly the selected string (verbatim, lowercase).

#### kind = `enum` (e.g. `telemetry.mode`)

Use `AskUserQuestion` to offer the parameter's `values`. For `telemetry.mode`, the two valid values
are:

1. **`off`** — Record no telemetry; every ptp command behaves exactly as before (default)
2. **`on`** — Record a run-ledger window per ptp main run under the telemetry store root

These are the only options. **Never write a value that is not in the entry's `values` list.** The
value written to the file is exactly the selected string (verbatim, lowercase). Free-form values
(e.g. `true`, `enabled`) are rejected and re-prompted, never written.

#### kind = `enum` (e.g. `parallel.mode`)

Use `AskUserQuestion` to offer the parameter's `values`. For `parallel.mode`, the two valid values
are:

1. **`off`** — Run every per-item unit of work one item at a time (default)
2. **`on`** — Permit a stage to run its per-item main runs concurrently when all four
   `ptp-parallel-fanout` safety conditions hold

These are the only options. **Never write a value that is not in the entry's `values` list.** The
value written to the file is exactly the selected string (verbatim, lowercase). Free-form values
(e.g. `true`, `yes`, `parallel`) are rejected and re-prompted, never written.

Note when offering it: `on` is a **permission**, not a guarantee — a stage that cannot establish all
four `ptp-parallel-fanout` safety conditions still runs serially, and no ptp command consumes this
key until the fan-out consumer slices land.

#### kind = `string` (e.g. `telemetry.root`)

Prompt the user for a free-text value (show the entry's `default`, `openspec/telemetry`, as the
suggested value). Then validate the input:

- **Accept:** a **non-empty** string, after trimming leading/trailing whitespace, that is a
  **repository-relative** path resolving **strictly below** the repository root. The value is
  written as a JSON **string**, trimmed. This rule holds under **every** target — global, project, or
  workspace — including workspace: the value stays repository-root-relative and
  repository-root-validated regardless of which file it is written into; it is never re-anchored to
  the workspace root.
- **Reject and re-prompt** on any of the following — do NOT write an invalid value:
  - empty or whitespace-only input;
  - an **absolute path** (`/var/telemetry`, `C:\telemetry`, a UNC path, any drive- or root-anchored
    form);
  - any value containing a **`..` segment** (`../telemetry`, `a/../../b`);
  - any value **resolving to the repository root itself** — `""`, `.`, `./`, `/`.

When rejecting, report why (a telemetry root must stay inside the repository, and must not be the
repository root itself — the store writes its own `.gitignore` / `.gitattributes` into its root and
would otherwise overwrite the repository's) and ask again. Only proceed to step 5 once a valid
repository-relative path is in hand.

These are exactly the validity rules the `ptp-telemetry` **reader** applies
(`ptp-telemetry` [telemetry-root-validation]). As with
`review.maxIterations`, the two surfaces are complementary: this editor is **STRICT** (reject and
re-prompt, so an invalid value is never written) while the reader is **FORGIVING** (an invalid
layer's value is ignored, leaving the prior layer's valid value, ultimately defaulting to
`openspec/telemetry`, never throwing or STOPping).

#### kind = `string` (e.g. `codex.model`)

Prompt the user for a free-text value (no fixed options; e.g. a Codex model id like `gpt-5.6`). Then
validate the input:

- **Accept:** any non-empty string after trimming leading/trailing whitespace. The value is written
  as a JSON **string**, trimmed.
- **Reject and re-prompt** on empty input or input that is only whitespace — do NOT write an empty
  value.

When rejecting, report that the value must be non-empty and ask again. Only proceed to step 5 once a
non-empty, non-whitespace-only string is in hand.

#### kind = `string` (e.g. `backlog.projectOwner`)

Prompt the user for a free-text value (no fixed options). Then validate the input:

- **`backlog.projectOwner`** — **Accept:** a non-empty trimmed string that additionally contains **no
  `/`**, **no internal whitespace**, and **no `://`**. The value is written as a JSON **string**,
  trimmed. **Reject and re-prompt** on empty or whitespace-only input, or on any value containing
  `/`, internal whitespace, or `://`. **Every** rejection — the empty and whitespace-only cases just
  as much as the three extra bans — says plainly that **a GitHub org or user *login* is expected here,
  not a board URL**; pasting the board's address is the one realistic mistake these bans exist to
  catch, and stating what the field wants is what makes the re-prompt actionable rather than merely
  negative. No GitHub-login charset gate is imposed beyond that, because a charset guess could reject
  a legitimate login.

**What these keys do now.** They resolve, through `ptp-github-projects-gh`, the **board the epic
backlog lives on** — there is no local backlog file. The **acting GitHub identity is not one of these
keys**: it is `gh`'s own active account, resolved by `gh` and never configured, selected, or overridden
by ptp. `/ptp:backlog` reads that board on every
invocation and refuses non-silently, naming the missing keys, when the configuration is incomplete. The
writers `/ptp:backlog-add`, `-edit`, `-run`, and `-continue` write that same board, and each refuses up
front — naming its own cause — when these keys are incomplete or the capability preflight does not
admit a write. State both halves at the point of selection, so the user expects both a working read
view and a writer that names exactly what it needs.

As with every other ptp parameter, the two surfaces are complementary: this editor is **STRICT**
(reject and re-prompt, so an invalid value is never written) while the `ptp-github-projects-gh`
reader is **FORGIVING** (an invalid layer's value is ignored; it never throws and never STOPs). Do not
align one to the other.

#### kind = `integer` (e.g. `review.maxIterations`, `telemetry.port`, `telemetry.retentionDays`, `parallel.maxConcurrency`, `backlog.projectNumber`, the six `artifact.*` budgets)

Prompt the user for an integer value (show the entry's `default` as the suggested value, e.g.
`default: 5`, or `default: 4318` for `telemetry.port`). Then validate the input:

- **Accept:** a plain positive integer (`>= 1`). The value is written as a JSON **number**, not
  a string.
- **Reject and re-prompt** on any of the following — do NOT write an invalid value:
  - Non-numeric input (e.g. `abc`)
  - Non-integer numeric input (e.g. `5.5`)
  - String-typed input that looks like a number (e.g. `"5"`)
  - Zero (`0`)
  - Any negative integer (e.g. `-1`)

**`telemetry.port` carries one additional bound**, because it is a TCP port rather than a count: the
value must also be **within `1..65535`**. Anything above that range (`70000`, `65536`) is rejected and
re-prompted exactly as a zero or a negative value is. The receiver binds `127.0.0.1` only, so a
privileged low port is not rejected here — but the suggested default `4318` is the OTLP/HTTP
convention and is what `/ptp:telemetry setup` writes into the exporter endpoint.

**`telemetry.retentionDays` carries no extra bound** — any positive integer is valid — but it
**deletes data**, so state plainly at the point of selection what the value governs:

- It prunes the **raw telemetry store only** — files under `<telemetry.root>/<epic>/raw/` — and only
  when a human runs `/ptp:telemetry report`. No pipeline command ever prunes.
- The **pruning step itself never deletes** `runs.ndjson`, `runs.csv`, or `spans.csv`, and never
  touches the store-wide `<telemetry.root>/_unattributed/`.
- **But that is not the same as the CSV keeping its history.** `/ptp:telemetry export` is always a
  **global re-derivation from the raw store**, so the **next `export` after a prune rewrites
  `spans.csv` without the pruned rows**. Saying only "the CSV is never pruned" would leave the user
  with the exact opposite practical expectation, and they would discover the truth by losing data.
- A retention of `N` keeps **N days plus today**: only files strictly older than the cutoff are
  deleted. `ptp-telemetry-report` [retention] holds the full rule.

**`parallel.maxConcurrency` carries one additional bound**, because it caps how many main runs may
overlap: the value must also be **within `1..10`**. Anything above that range (`11`, `50`) is
rejected and re-prompted exactly as a zero or a negative value is, so the editor can never produce a
configuration that disables the cap or invites a rate-limit incident. A value of `1` is valid and
means "effectively serial". The suggested default is `3`.

**The six `artifact.*` keys carry no extra bound** — any positive integer is valid — but state
plainly at the point of selection what they govern: they are the **artifact budgets** of the compact
artifact contract (`skills/ptp-artifact-contract/SKILL.md`), and under that contract a budget is an
**acceptance criterion**, not guidance. Raising one does not make a long artifact acceptable; it moves
the line every writer and every reviewer is held to. The remedies for an over-budget artifact are
removing text and splitting the change — the contract's `NEEDS SPLIT` and the review loop's
`ARTIFACT BUDGET EXCEEDED` both key on these values.

**`backlog.projectNumber` is a `backlog.*` key, so the *What these keys do now* statement in the
`backlog.projectOwner` string subsection above applies to it verbatim** — state
it here too when this is the selected parameter. The note lives in one place because it covers both
keys at once, but the flow reaches `backlog.projectNumber` down the integer path, which would
otherwise never pass the note at all.

**`backlog.projectNumber` carries no upper bound**, deliberately: it is the board's project number,
project numbers are unbounded per owner, and a range like `telemetry.port`'s `1..65535` would be
invented rather than derived. A positive integer `>= 1` is the whole rule, and the value is written as
a JSON **number**, never as a string. It has no default — unset means no board is configured.

When rejecting, report why the value is invalid (e.g. "must be a positive integer >= 1", "must be
a TCP port in 1..65535", or "must be an integer in 1..10") and ask again. Only proceed to step 5 once
a valid positive integer is in hand.

**Relationship to the slice-01 resolver:** the validity rule used here (`>= 1`, positive integer)
is the SAME rule the slice-01 `ptp-review-loop` resolver uses to decide whether a stored
`review.maxIterations` value is honored. The two surfaces are complementary by design: this editor
is **STRICT** — it rejects invalid input and re-prompts, so an invalid value is never written to
the file — while the resolver is **FORGIVING** — it ignores a layer whose value is invalid and
continues resolution (defaulting to `5` only when no layer supplies a valid value), never throwing
or stopping over a config typo. Do not align one to the other: softening the editor to accept-and-
default would silently write a useless value; hardening the resolver to STOP would break its
forgiving contract.

#### kind = `map`, memberKind = `stringList` (e.g. `backlog.statusOptions`)

Prompt the user for a **comma-separated** list of option names for the member chosen in step 2b (show
that member's current or default row as the suggested value). Then validate the input:

- **Accept:** a value that, after splitting on commas and trimming each element, yields **at least one**
  element with **every** element non-empty. **Normalize** the row by dropping elements equal to an
  earlier element **ignoring case**, preserving **first-seen order**.
- **Reject and re-prompt** on any of the following — do NOT write an invalid value:
  - empty or whitespace-only input;
  - **any empty element**, arising from a leading comma, a trailing comma, or a doubled comma
    (`,Doing`, `Doing,`, `Doing,,WIP`);
  - a normalized row that **would collide** with another row of the resolved table — that is, whose
    normalized names (trimmed, compared case-insensitively) intersect another status's row. The
    rejection **names the colliding option name and the other status**.

**The collision check is evaluated against the target layer merged onto the default table.** Build the
other six rows **the way the resolver would**: take the target file's own `backlog.statusOptions` value
for a status only where that value is **valid** under `ptp-github-projects-gh`'s per-status-key rules
(after trimming, dropping empty elements, and dropping case-insensitive duplicates it still yields at
least one name), and take `ptp-backlog`'s built-in default row for that status otherwise. Do not read
the other config layers.

**The check stays single-layer over the selected target under all three targets.** Whether the
selected target is Global, Project, or Workspace, the collision check reads that **selected target**
file alone and no other; adding a third target widens which file may be the selected target, never
how many are read.

**A present-but-invalid sibling row falls back to its default here, exactly as it does in the resolver —
and reading it as an empty row instead would open the hole this check exists to close.** With a
hand-edited `"ready": []` in the target file, `ready` resolves to its **default** row `ready`,
`Ready`; an editor that treated the present `[]` as the `ready` row would see no collision and happily
write `in-review: Ready`, which the consumer would then refuse on. The doctrine that **the editor's writable
set is a subset of what the resolver accepts** requires the check to model the resolver's validity rules,
not merely the file's key presence.

**Written form:** a **one-name** row is written as a JSON **string**; a **multi-name** row is written as
a JSON **array of strings**. The shortest faithful form keeps the file readable and matches the
documented shape.

**Idempotency compares the normalized row, not the raw JSON.** Re-entering `Backlog` over a stored
`["Backlog"]` reports a no-op and leaves the stored array form exactly as it is, rather than performing
a semantically empty rewrite.

**Three things to state at the point of selection:**

1. Leaving `backlog.statusOptions` **unset means the built-in default table** — every status keeps its
   own default row.
2. **Returning a row to its default requires deleting that key by hand** — this editor writes values and
   never removes them, the same limitation `codex.model`, `codex.reasoningEffort`, and
   `backlog.projectOwner` already carry. Re-typing the default row's names is **equivalent in effect**.
3. **An option name containing a comma cannot be entered here** and must be hand-edited into the config
   file, which the forgiving resolver accepts. There is no separator that cannot appear in a GitHub
   option name, so an escape hatch was always required.

As with every other ptp parameter, the two surfaces are complementary: this editor is **STRICT** (reject
and re-prompt, so an invalid or colliding value is never written) while the `ptp-github-projects-gh`
reader is **FORGIVING** (an invalid status key is ignored, leaving that row at its own default; it never
throws and never STOPs). **The residual is honest and stated rather than hidden:** the editor's collision
check is **single-layer**, so a **cross-layer** collision can still arise — it is covered by the
consuming command's refusal at `ptp-backlog`'s step-0 configuration gate. The two surfaces are
complementary and neither is redundant.

### Step 5 — Safe merge-write

With the resolved path, the base JSON object (from step 3), and the chosen value (from step 4):

1. **Idempotency check:** compares the **selected target file's own stored value**, never the
   effective value the step 3 provenance line names. If the current value of the selected parameter
   in the base JSON (the target file's own contents) already equals the chosen value, **report a
   no-op** ("already set to `<value>` — no change made") and end the command. (It is safe to re-write
   byte-identical content, but prefer reporting the no-op.) Writing an already-**effective** value
   into a target file that does not itself carry it is therefore a **write**, not a no-op — the target
   file's own stored value is what is compared, and it did not carry the key.

2. **Set the target path:** in the base JSON object, navigate the selected entry's `jsonPath`:
   - If the parent key is absent from the root, create it as an empty object `{}`.
     For `codex.mode`, `codex.model`, or `codex.reasoningEffort`: create `codex` as `{}`; for
     `review.maxIterations` or `review.minSeverity`: create `review` as `{}`; for `roles.main`:
     create `roles` as `{}`; for
     `telemetry.mode`, `telemetry.root`, `telemetry.port`, or `telemetry.retentionDays`: create
     `telemetry` as `{}`; for `parallel.mode` or `parallel.maxConcurrency`: create `parallel` as
     `{}`; for any `artifact.*` key: create `artifact` as `{}`; for
     `backlog.projectOwner` or `backlog.projectNumber`: create
     `backlog` as `{}`; for `backlog.statusOptions`: create `backlog` as `{}` and then
     `statusOptions` as `{}` when absent, in the same manner as the existing parents.
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
| `review` present but not an object (`"review":"x"`, `"review":null`) — applies to `review.maxIterations`, `review.minSeverity`, and `review.autoRecutOnBudgetExceeded` alike | STOP, report, do **not** overwrite. |
| `review` absent | Created as `{}` on write; not clobbering — applies to `review.maxIterations`, `review.minSeverity`, and `review.autoRecutOnBudgetExceeded` alike. |
| `review.minSeverity` selection outside `low|medium|high|critical` | Not offered — the enum menu only presents the four valid values. |
| `review.autoRecutOnBudgetExceeded` selection outside the two boolean options | Not offered — the boolean menu only presents `on (true)` / `off (false)`. |
| `roles` present but not an object (`"roles":"claude"`, `"roles":null`) | STOP, report, do **not** overwrite. |
| `roles` absent | Created as `{}` on write; not clobbering. |
| `roles.main` selection outside `claude|codex` | Not offered — the enum menu only presents the two valid values. |
| Integer input not a positive integer (`0`, `-1`, `5.5`, `"5"`, `abc`) | Reject, re-prompt; do NOT write. |
| Integer equals current stored value | Report no-op; do not write. |
| `codex.model` input empty or whitespace-only | Reject, re-prompt; do NOT write. |
| `codex.reasoningEffort` selection outside `minimal|low|medium|high` | Not offered — the enum menu only presents the four valid values. |
| `telemetry` present but not an object (`"telemetry":"on"`, `"telemetry":null`) — applies to `telemetry.mode`, `telemetry.root`, `telemetry.port`, and `telemetry.retentionDays` alike | STOP, report, do **not** overwrite. |
| `telemetry` absent | Created as `{}` on write; not clobbering. |
| `telemetry.mode` selection outside `off|on` | Not offered — the enum menu only presents the two valid values. |
| `telemetry.root` input empty, whitespace-only, absolute, containing `..`, or resolving to the repo root (`""`, `.`, `./`, `/`) | Reject, re-prompt; do NOT write. |
| `telemetry.port` input non-integer (`4318.5`, `"4318"`, `abc`), zero, negative, or outside `1..65535` | Reject, re-prompt; do NOT write. |
| `telemetry.retentionDays` input non-integer (`30.5`, `"30"`, `abc`), zero, or negative | Reject, re-prompt; do NOT write. |
| `parallel` present but not an object (`"parallel":"on"`, `"parallel":null`) — applies to `parallel.mode` and `parallel.maxConcurrency` alike | STOP, report, do **not** overwrite. |
| `parallel` absent | Created as `{}` on write; not clobbering. |
| `parallel.mode` selection outside `off\|on` | Not offered — the enum menu only presents the two valid values. |
| `parallel.maxConcurrency` input non-integer (`2.5`, `"3"`, `abc`), zero, negative, or outside `1..10` (`11`) | Reject, re-prompt; do NOT write. |
| `artifact` present but not an object (`"artifact":400`, `"artifact":null`) — applies to all six `artifact.*` keys alike | STOP, report, do **not** overwrite. |
| `artifact` absent | Created as `{}` on write; not clobbering — applies to all six `artifact.*` keys alike. |
| An `artifact.*` input non-integer (`400.5`, `"400"`, `abc`), zero, or negative | Reject, re-prompt; do NOT write. |
| `backlog` present but not an object (`"backlog":"github"`, `"backlog":null`) — applies to `backlog.projectOwner` and `backlog.projectNumber` alike | STOP, report, do **not** overwrite. |
| `backlog` absent | Created as `{}` on write; not clobbering — applies to all three `backlog.*` keys alike. |
| `backlog.projectOwner` input empty, whitespace-only, or containing `/`, internal whitespace, or `://` | Reject, re-prompt; do NOT write. |
| `backlog.projectNumber` input non-integer (`7.5`, `abc`), string-typed (`"7"`), zero, or negative | Reject, re-prompt; do NOT write. |
| `backlog.statusOptions` present but not an object (`"statusOptions":"Ready"`, `"statusOptions":null`) | STOP, report, do **not** overwrite. |
| `backlog.statusOptions` absent (under a present or absent `backlog`) | Created as `{}` on write; not clobbering. |
| `backlog.statusOptions` row input empty, whitespace-only, or containing an empty element (`,Doing`, `Doing,`, `Doing,,WIP`) | Reject, re-prompt; do NOT write. |
| `backlog.statusOptions` row that would collide with another row of the resolved table | Reject, re-prompt, naming the colliding name and the other status; do NOT write. |
| Not in a git repo (project target) | Fall back to `<cwd>/.claude/ptp/config.json`; note the fallback in output. No workspace entry is offered in this case either. |
| Workspace root equal to the project root | Offer only the two existing targets (no workspace entry); note that the workspace root coincides with the project root. |
| Unresolvable workspace root | Omit the workspace entry, note the reason; do not STOP — the remaining targets stay selectable. |
| Malformed workspace file (parse failure, non-object root, or a non-object parent for the selected key) | STOP, report, do **not** overwrite — same rule as any other target. |
| Chosen value equals current stored value | Report no-op; do not write. |

---

## Hard rules

- **Never commit, push, stage, or otherwise mutate git state.** This is a file write only — no
  history-, index-, or ref-changing git operations. The one allowed git command is the read-only
  `git rev-parse --show-toplevel` used in step 1 to resolve the project config path; the
  `ptp-workspace` resolution used to resolve the workspace root invokes no git command of its own.
- **Never offer two targets that resolve to the same file.** The workspace entry is offered only
  when its resolved config path differs from the project target's; when the two coincide, offer only
  the two existing entries.
- **Never STOP over a non-target layer.** Step 3's authoritative read and its STOP rules bind only
  the selected target file; the display-only provenance line's read of a non-target layer is
  forgiving and never stops the command, whatever shape that layer's file is in.
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
- **Never write a non-boolean value for `review.autoRecutOnBudgetExceeded`.** Only the literal JSON
  boolean `true` or `false` may be written, never a string. The value comes from the step 4 boolean
  menu — never from free-form user input.
- **Never write an out-of-enum value for `roles.main`.** Only `claude` or `codex` may be written.
  The value comes from the step 4 enum menu — never from free-form user input.
- **Never write an out-of-enum value for `telemetry.mode`.** Only `off` or `on` may be written. The
  value comes from the step 4 enum menu — never from free-form user input.
- **Never write an invalid `telemetry.root`.** Only a non-empty, trimmed, repository-relative path
  resolving strictly below the repository root may be written. Empty/whitespace-only input, an
  absolute path, any `..` segment, and any value resolving to the repository root itself (`""`, `.`,
  `./`, `/`) are rejected and re-prompted — never written, so the editor can never produce a
  configuration that directs telemetry writes outside the repository or points the store at the
  repository root, where it would overwrite the repository's own `.gitignore` / `.gitattributes`.
- **Never write an empty or whitespace-only string for `codex.model`.** Only a non-empty, trimmed
  string may be written; empty/whitespace-only input is rejected and re-prompted.
- **Never write an invalid integer for `review.maxIterations`.** Only a positive integer (`>= 1`)
  may be written. Any non-positive, non-integer, non-numeric, or string-typed input is rejected
  and re-prompted — never written.
- **Never write an out-of-enum value for `review.minSeverity`.** Only `low`, `medium`, `high`, or
  `critical` may be written. The value comes from the step 4 enum menu — never from free-form user
  input.
- **Never write an invalid `telemetry.port`.** Only an integer within `1..65535` may be written. Any
  non-integer, non-numeric, string-typed, zero, negative, or out-of-TCP-range input is rejected and
  re-prompted — never written, so the editor can never produce a port the receiver could not bind.
  (Changing this value does **not** update an already-written exporter endpoint: `/ptp:telemetry
  setup` must be re-run and Claude Code restarted, which `ptp-telemetry-setup` [setup-merge-semantics] documents.)
- **Never write an invalid `telemetry.retentionDays`.** Only a positive integer (`>= 1`) may be
  written; zero, negatives, non-integers, non-numerics, and string-typed input are rejected and
  re-prompted. **Zero matters most:** the runtime reader treats it as invalid and falls back to 30
  precisely because "retain nothing" is the most destructive reading of a value this editor refuses
  to write — the editor is the reason a zero can only ever arrive by a hand edit. The value prunes
  the **raw** store only, on `/ptp:telemetry report` only; the next `export` after a prune
  nevertheless rewrites `spans.csv` without the pruned rows (`ptp-telemetry-report` [retention]).
- **Never write an out-of-enum value for `parallel.mode`.** Only `off` or `on` may be written. The
  value comes from the step 4 enum menu — never from free-form user input.
- **Never write a `parallel.maxConcurrency` outside `1..10`.** Only an integer within the inclusive
  range 1 to 10 may be written. Any non-integer, non-numeric, string-typed, zero, negative, or
  above-10 input is rejected and re-prompted — never written, so the editor can never produce a
  configuration that disables the cap or invites a rate-limit incident.
- **Never write an invalid integer for an `artifact.*` budget.** Only a positive integer (`>= 1`)
  may be written for `artifact.maxProposalWords`, `artifact.maxDesignWords`, `artifact.maxTasksWords`,
  `artifact.maxTaskCount`, `artifact.maxTaskWords`, or `artifact.maxSpecDeltaWords`; anything else is
  rejected and re-prompted. These are the budgets the compact artifact contract enforces as acceptance
  criteria — this editor writes the value and owns none of its meaning.
- **Never write a `backlog.projectOwner` containing `/`, internal whitespace, or `://`.** Only a
  non-empty, trimmed login may be written; a pasted board URL is rejected and re-prompted, never
  written.
- **Never write a `backlog.projectNumber` that is not a positive integer.** Only an integer `>= 1`,
  written as a JSON number, may be written. Zero, negatives, non-integers, non-numerics, and
  string-typed input are rejected and re-prompted — never written.
- **Never write an invalid or colliding `backlog.statusOptions` row.** Only a non-empty,
  comma-separated, case-insensitively de-duplicated row — every element non-empty after trimming — that
  does **not** collide with another row of the resolved table may be written: a one-name row as a JSON
  **string**, a multi-name row as a JSON **array of strings**. Empty or whitespace-only input, any empty
  element from a leading/trailing/doubled comma, and any row that would collide are rejected and
  re-prompted — never written.
- **Never touch keys other than the selected parameter's `jsonPath`** (for a `map`-kind entry, the
  **effective path** `jsonPath + [member]`; sibling status rows are preserved as data). All other keys (including
  `deploy`, sibling `codex` keys, and any unknown keys) are preserved as data in the serialized
  output.
- This is an **ordinary interactive command** — `AskUserQuestion` is used deliberately and is
  allowed here. It is **not** part of the autonomous plan/apply pipeline.
