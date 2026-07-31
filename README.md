# PtP — autonomous, dual-reviewed change pipeline for Claude Code

**PtP** — "PRD to PR, peer-reviewed." The double meaning is intentional: literally **P**RD-**t**o-**P**R (the pipeline), and **P**eer-**t**o-**P**eer (the dual-AI Claude + Codex review mechanism).

PtP turns a one-line feature or bug description into **fully implemented, dual-reviewed code** — without you driving each step by hand. It does this by composing three layers:

- **Superpowers** decides *what* to build and *why* (brainstorming, planning, code review discipline).
- **OpenSpec** records the decision as durable artifacts and controls execution order.
- **Codex** acts as an independent second reviewer alongside Claude, so nothing ships on a single AI's say-so.

You can use PtP one step at a time (`brainstorm → plan → apply → review → archive`), or hand it the whole thing at once with the **`full` family** — `/ptp:full` plans, decomposes, implements, and runs **both Claude *and* Codex** review loops to convergence, story by story, in a single invocation (the Codex loop runs per `codex.mode` — under the default `auto` it is used when available and skipped, non-silently, when `codex` is absent).

---

## What makes PtP different

- **Autonomous end-to-end.** `/ptp:full` takes a request from description to reviewed code: decompose → plan → per-slice dual plan-review → apply → per-story dual code-review — stopping only when a gate genuinely can't be met.
- **Two independent reviewers, not one.** Every review-to-convergence flow runs the Superpowers loop *and* (per `codex.mode`) the Codex CLI loop. Both must sign off before a change is archive-ready — unless `codex.mode` skips the Codex phase (`auto` with `codex` absent, or `off`), in which case the converged Superpowers loop alone is a successful single-reviewer run and the skip is reported (never silent).
- **Review *loops*, not single passes.** The `-loop` and `-full` commands alternate review → confirm → fix automatically until zero open findings (or an iteration cap), instead of you manually re-running review/fix.
- **Workflow-backed runs.** `/ptp:full-apply` launches a deterministic workflow (the plugin's `workflows/`, resolved by name) that runs `apply → review-full` per story sequentially, each apply agent at the model recommended by that story's `effort.md`.
- **Branch-safe by construction.** Every write-capable command runs a branch guard first: if HEAD is `master`, it stashes, pulls, and cuts a fresh `ptp/<…>` feature branch before writing a single file.

---

## Prerequisites

Install these **before** installing PtP, in this order. In particular, the **OpenSpec CLI** and the **Superpowers plugin** must already be in place before you install PtP — PtP commands invoke `openspec` and delegate to Superpowers skills.

### 1. OpenSpec CLI

PtP commands invoke `openspec` to list, validate, and archive changes.

```bash
npm install -g openspec
```

Or rely on `npx -y openspec ...` — PtP falls back to this automatically if `openspec` is not globally installed.

### 2. Superpowers

PtP invokes Superpowers skills (brainstorming, writing-plans, code-review). Install the plugin in Claude Code:

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Without it, PtP falls back to inline structured work and says so.

### 3. prd-taskmaster *(optional — PRD authoring; degrades gracefully)*

`/ptp:prd` can delegate to the `prd-taskmaster` plugin to author graded, structured PRDs. Install
the plugin in Claude Code:

```
/plugin marketplace add anombyte93/prd-taskmaster
/plugin install prd
```

The plugin installs as plugin name **`prd`** (marketplace entry `atlas-prd-taskmaster`). The
`npm install -g task-master-ai` CLI tool is truly optional — prd-taskmaster has a native mode and a
`script.py` CLI fallback. Without the plugin, `/ptp:prd` falls back to authoring a structured PRD
inline and says so — it never fails to start over a missing optional plugin.

### 4. Codex CLI *(optional — second reviewer; configurable)*

The `codex-*`, `*-full`, and `full` commands can delegate to the external Codex CLI (`codex exec`) as an independent second reviewer. Install it and put `codex` on your PATH (`codex --version`) to enable the dual-reviewer flows.

Whether Codex is used is controlled by the **`codex.mode`** setting (see [Configuration](#configuration) below):

- **`auto`** *(default)* — use Codex when it's on PATH; if it's missing, the `*-full` / `full` orchestrators **degrade to the Superpowers reviewer only** and say so. No hard failure.
- **`required`** — the original strict behavior: the dual-reviewer commands **stop** if `codex` is missing rather than falling back to a single reviewer.
- **`off`** — never use Codex; the orchestrators run Superpowers-only. (Explicitly invoking a `/ptp:codex-*` command still runs Codex — see [Configuration](#configuration).)

---

## Install PtP

PtP is a Claude Code **plugin**, installed once at user scope so it is available in *every*
project — no per-project copying. Install it **after** the prerequisites above (OpenSpec CLI
and Superpowers must already be in place).

In Claude Code, run:

```
/plugin marketplace add https://github.com/AlmogMaayan/ptp
/plugin install ptp@ptp
```

The first command registers this repo as a self-hosted marketplace named `ptp`; the second
installs the `ptp` plugin from it (`<plugin>@<marketplace>` → `ptp@ptp`).

### Verify

Plugins load at **session start**, so start a **fresh Claude Code session** after installing.
Then type `/` and confirm you see the `ptp:` (and `opsx:`) command groups, and that the `ptp`
skill appears in the available-skills list. A quick `/ptp:status` is a good smoke test.

### Updating

`/plugin marketplace update ptp` refreshes the marketplace; reinstall or restart the session
to pick up the latest plugin version.

**`/ptp:version`** — read-only. Reports the installed ptp version, the latest available version,
and an up-to-date / update-available verdict, so you can see at a glance whether a newer ptp is out
before refreshing. Takes no arguments and mutates nothing (it may refresh the CLI's marketplace
cache to read the latest version, but never touches the repo or the installed plugin). If a version
can't be resolved (e.g. offline), it reports a clear partial result rather than a false "up to date".

**`/ptp:update`** — update the installed ptp plugin to the latest version. Delegates
installed-vs-latest resolution to the shared `ptp-version` skill (same as `/ptp:version`), then
runs `claude plugin update ptp@ptp` to apply the update. On an up-to-date verdict it skips the
mutation and reports a no-op. Always surfaces that **a Claude Code restart is required** to apply
the update — on every path where the `claude` CLI was reachable (update applied, already up to
date, partial resolution, and update failure). Takes no arguments. Writes no repository file and
performs no git operation (branch-guard-exempt, like `/ptp:status`).

---

## Configuration

PtP reads an optional JSON config file from two locations and merges them, **project overriding
global key-by-key**:

| Layer | Path |
|-------|------|
| Global | `~/.claude/ptp/config.json` |
| Project | `<repo>/.claude/ptp/config.json` *(overrides global)* |

Both files are optional. A missing file, missing key, or unknown value falls back to the
default — PtP never fails to start over a config typo.

```json
{
  "codex": {
    "mode": "auto",
    "model": "<your-codex-model-id>",
    "reasoningEffort": "high"
  },
  "roles": {
    "main": "claude"
  },
  "review": {
    "maxIterations": 5,
    "minSeverity": "low"
  },
  "telemetry": {
    "mode": "off",
    "root": "openspec/telemetry",
    "port": 4318,
    "retentionDays": 30
  },
  "backlog": {
    "mcpServer": "<your-mcp-server-name>",
    "projectOwner": "<github-org-or-user-login>",
    "projectNumber": 7
  }
}
```

The `model` value above is an illustrative placeholder — replace it with a model id your own Codex CLI/account actually supports, or omit the key to use the model from your `~/.codex/config.toml`. A value Codex doesn't recognize is rejected, and Codex falls back to its own default model.

### `codex.mode`

Controls whether the external Codex CLI is used as the second reviewer.

| Mode | Dual-reviewer orchestrators<br>(`/ptp:review-full`, `/ptp:review-plan-full`, `/ptp:full-apply`, `/ptp:full`) | When `codex` is **not** on PATH |
|------|------|------|
| `auto` *(default)* | Use Codex if available | Skip the Codex phase, run Superpowers-only, and report the skip |
| `required` | Use Codex | **Stop** — install Codex or change the mode |
| `off` | Skip the Codex phase, run Superpowers-only | Skip (already disabled) |

**Explicit `/ptp:codex-*` commands are an opt-in that overrides the mode.** Running
`/ptp:codex-review`, `/ptp:codex-review-loop`, `/ptp:codex-review-plan[-loop]`, or
`/ptp:codex-review-uncommitted` always attempts Codex — even when `mode` is `off` — because
invoking them *is* an explicit request for the Codex reviewer. They still require `codex` on
PATH and stop if it's genuinely missing.

A skipped Codex phase is **never silent**: the orchestrator's end-of-run summary states
`Codex phase skipped (mode=…)` so a single-reviewer run is always visible.

### `codex.model` and `codex.reasoningEffort`

Two optional overrides that control **how** an invoked Codex run behaves — pin the model or the
reasoning effort — independent of `codex.mode`, which controls only **whether** Codex runs.

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `codex.model` | string | unset | Passed as `-m <model>` to `codex exec`. When unset, no override is passed and Codex uses whatever model your own `~/.codex/config.toml` specifies. |
| `codex.reasoningEffort` | enum: `minimal`\|`low`\|`medium`\|`high` | unset | Passed as `-c model_reasoning_effort=<effort>` to `codex exec`. When unset, no override is passed and Codex uses your own `~/.codex/config.toml` setting. |

Both keys resolve from the same two layered files as `codex.mode` (global then project, project
overriding key-by-key), independently of each other and of `codex.mode`. Every `codex exec`
invocation ptp makes — mode-gated dual-reviewer commands and the explicit `/ptp:codex-*` commands
alike — appends the resolved `-m`/`-c` flags before the trailing stdin marker when set; with both
keys unset the invocation is byte-identical to `codex exec -s read-only -`. A missing file, missing
key, unparseable JSON, wrong-type value, or out-of-set value leaves the prior layer's valid value in
place (ultimately unset if no layer set a valid value) — never a crash or a STOP. Both keys are
settable via `/ptp:config` (see below).

### `roles.main`

Selects which agent is the **main** planning/implementation agent; the **reviewer** is always
the other agent (derived, never a separate stored key).

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `roles.main` | enum: `claude`\|`codex` | `claude` | Names the main planning/implementation agent. The reviewer is derived as the other agent (`claude` ↔ `codex`). |

Resolves from the same two layered files as `codex.mode` (global then project, project
overriding key-by-key), independently of `codex.mode`/`codex.model`/`codex.reasoningEffort` —
`codex.mode` controls whether a reviewer Codex phase runs; `roles.main` controls which agent is
main. A missing file, missing key, unparseable JSON, or out-of-enum value leaves the prior
layer's valid value in place — never a crash or a STOP.

**Opt-in default via `PTP_MAIN_AGENT` (best-effort, not detection).** Every `/ptp:*` command is a
Claude Code slash command, so the CLI that launches the initial command is always Claude Code —
Codex cannot invoke a Claude Code slash command, so there is no runtime signal that "Codex is
driving." Genuine CLI-driver auto-detection is therefore impossible in this architecture. What ptp
offers instead is a best-effort **default** for an *unset* `roles.main`: if — and only if —
`roles.main` is unset in both the project and global config, ptp reads the environment variable
`PTP_MAIN_AGENT` (exact value `claude` or `codex`); an absent, empty, whitespace-only, wrong-case,
or otherwise invalid value falls through to the ultimate fallback `claude`, and nothing throws or
STOPs. The full precedence, highest to lowest:

1. `roles.main` in the project config.
2. `roles.main` in the global config.
3. `PTP_MAIN_AGENT` env var (opt-in detection; runs only when 1 and 2 are both unset).
4. Ultimate fallback: `claude`.

Explicit config always wins over the env var — set `roles.main` via `/ptp:config` for
deterministic behavior rather than relying on `PTP_MAIN_AGENT`. The resolver never treats `codex`
being on PATH (the reviewer-present signal) or process ancestry as a main-agent signal; the env
var is the only detection input.

With `roles.main` unset, no `PTP_MAIN_AGENT` set, every existing ptp flow is byte-identical to
today: Claude is the main agent working in-session and Codex is the gated reviewer. Settable via
`/ptp:config` (see below).

### `review.maxIterations` and `review.minSeverity`

Two keys sharing the `review` parent object. `review.maxIterations` caps how many iterations a
review loop may run; `review.minSeverity` names the **lowest finding severity that is in scope for
handling**.

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `review.maxIterations` | positive integer (`>= 1`) | `5` | Caps the number of iterations a review loop may run before stopping and reporting — the `/ptp:*-loop` commands (`/ptp:review-loop`, `/ptp:codex-review-loop`, `/ptp:review-plan-loop`, `/ptp:codex-review-plan-loop`, `/ptp:codex-review-prd-loop`) and the `-full` review orchestrators that drive the same loop, each phase getting its own cap. |
| `review.minSeverity` | enum: `low`\|`medium`\|`high`\|`critical` | `low` | The lowest finding severity in scope for handling — a **threshold**, not an equality test. |

The four `review.minSeverity` values are **ranked**:

| Value | Rank | In-scope severities |
|---|---|---|
| `low` *(default)* | 1 | Low, Medium, High, Critical |
| `medium` | 2 | Medium, High, Critical |
| `high` | 3 | High, Critical |
| `critical` | 4 | Critical |

A finding is in scope when `rank(finding.severity) >= rank(minSeverity)`. `low` (the default)
admits every severity — today's behavior.

Both keys resolve from the same two layered files as `codex.mode` (global then project, project
overriding key-by-key), with the same forgiving reader: a missing file, missing key, unparseable
JSON, or invalid value (for `review.minSeverity`, a value outside the set or a wrong type) leaves
the prior layer's valid value in place — never a crash or a STOP. `review.minSeverity` is matched
**case-insensitively** on read and canonicalized to lowercase, so `"High"` resolves to `high`;
`/ptp:config` still only ever *writes* the four lowercase values. Precedence, highest to lowest:

1. The key in the **project** config (`<repo>/.claude/ptp/config.json`).
2. The key in the **global** config (`~/.claude/ptp/config.json`).
3. Ultimate fallback: `5` and `low`.

**`review.minSeverity` is consumed by the shared review loop** (`skills/ptp-review-loop/SKILL.md`),
which resolves it once at loop start and partitions each review pass's findings against it: findings
at or above the floor are confirmed, fixed, and counted toward convergence, while findings below it
are **reported** — a per-iteration count plus an itemized, explicitly `unconfirmed`
`Below threshold — not blocking convergence` section in the terminal report — but never auto-fixed
and never counted toward convergence. The effective threshold is also recorded in the durable
review-convergence marker. At the default `low` every severity is in scope, so convergence behavior
is unchanged. Both keys are settable via `/ptp:config` (see below).

### `telemetry.mode`, `telemetry.root`, `telemetry.port`, and `telemetry.retentionDays`

Control whether ptp records a durable, per-epic **run ledger** — one timing window per ptp main run
— plus the optional **span layer** (per-LLM-call and per-tool timing), and where that store lives.

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `telemetry.mode` | enum: `off`\|`on` | `off` | `on` records a run-ledger window (an append-only `runs.ndjson` plus a spreadsheet-readable `runs.csv`) per ptp main run, and — once `/ptp:telemetry setup` has been confirmed — span rows in `spans.csv`. `off` records nothing. |
| `telemetry.root` | string | `openspec/telemetry` | Repository-relative store root. Must resolve strictly *below* the repo root — absolute paths, `..` segments, and root-resolving values (`""`, `.`, `./`, `/`) are rejected. |
| `telemetry.port` | integer `1..65535` | `4318` | The loopback port the OTLP receiver binds (`127.0.0.1` only). Changing it means **re-running `/ptp:telemetry setup`** and restarting Claude Code — the exporter endpoint written into `settings.local.json` does not track the config value. |
| `telemetry.retentionDays` | positive integer | `30` | How many days of the **raw** span store to keep. Pruning happens **only** when you run `/ptp:telemetry report`, touches **only** the reported epic's `raw/`, and keeps *N* days **plus today**. See [Retention](#retention). |

All four keys resolve from the same two layered files as `codex.mode` (global then project, project
overriding key-by-key), with the same forgiving reader: a missing file, missing key, unparseable
JSON, or invalid value leaves the prior layer's valid value in place — never a crash or a STOP. For
`telemetry.retentionDays` the invalid set explicitly includes **zero** and negatives, so a
hand-edited `0` falls back to 30 rather than meaning "retain nothing".
All four are settable via `/ptp:config` (see below).

- **With `telemetry.mode` off (the default), every ptp command behaves exactly as it did before
  telemetry existed** — no telemetry directory or file is created, and no prompt, argument, or
  command line changes.
- **Telemetry writes are fire-and-forget and can never fail a ptp command.** An unwritable path, a
  permission denial, or a full disk is swallowed; the command proceeds and reports exactly as it
  would have with telemetry off. Telemetry is never a precondition and never alters a terminal state.
- **The store lives outside the change folder** — `openspec/telemetry/<epic>/`, a top-level sibling
  of `openspec/changes/` — because `/ptp:archive` *moves* `openspec/changes/<id>/` into
  `openspec/changes/archive/YYYY-MM-DD-<id>/`. A store inside a change folder would be relocated and
  date-prefixed on archive, splitting an epic's timing history across the active and archived trees.
- The store writes its own `.gitignore` (ignore `*.ndjson`, the ingestion credential, and the
  receiver lockfile; keep `*.csv`) and `.gitattributes` (`*.csv -text`, so Excel-friendly CRLF
  endings survive git normalization) into its root. The **one** write outside the store root is
  `/ptp:telemetry setup`'s confirmed managed-line addition of `.claude/settings.local.json` to your
  repository `.gitignore` — required because that file carries the ingestion credential and must stay
  untracked. Your root `.gitattributes` is never touched.

Read the store with **`/ptp:telemetry status`**, and analyse it with **`/ptp:telemetry report`**
(both below).

### `parallel.mode` and `parallel.maxConcurrency`

Control whether a ptp stage may run its **per-item main runs concurrently** instead of one at a
time, and how many may overlap. The full safety contract lives in
`skills/ptp-parallel-fanout/SKILL.md`.

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `parallel.mode` | enum: `off`\|`on` | `off` | `on` **permits** a stage to run its per-item `ptp-run-at-model` main runs concurrently — but only when all four `ptp-parallel-fanout` safety conditions hold (write sets provably disjoint by construction, no member changing git state, aggregation sorted by ascending change id, join-then-gate gating). `off` runs every item one at a time. |
| `parallel.maxConcurrency` | integer `1..10` | `3` | How many members may run simultaneously. More members than the cap run in successive **batches**, each joined before the next begins. `1` is effectively serial. |

```json
{
  "parallel": {
    "mode": "off",
    "maxConcurrency": 3
  }
}
```

Both keys resolve from the same two layered files as `codex.mode` — global
`~/.claude/ptp/config.json` first, then `<repo>/.claude/ptp/config.json` overriding key-by-key —
with the same forgiving reader: a missing file, missing key, unparseable JSON, or out-of-range /
wrong-type value leaves the prior layer's valid value in place, never a crash or a STOP. For
`parallel.maxConcurrency` the invalid set includes `0`, negatives, non-integers, numeric strings, and
anything above `10`. Precedence, highest to lowest:

1. The key in the **project** config (`<repo>/.claude/ptp/config.json`).
2. The key in the **global** config (`~/.claude/ptp/config.json`).
3. Ultimate fallback: `off` and `3`.

- **`on` is a permission, never an override of safety.** A stage that cannot establish all four
  conditions runs serially regardless of the setting, and `/ptp:apply`, `/ptp:full-apply`, and
  `/ptp:archive` are **permanently excluded** — they write shared source files and the shared
  `openspec/specs/` tree, so they stay sequential under every setting.
- **First consumer: `/ptp:plan-multiple`** (`0034_02`). It resolves both keys, honors the
  per-invocation `parallel:on` / `parallel:off` token, and — when the effective decision is `on`
  **and** all four conditions are established — runs its per-slice `/ptp:plan` members concurrently,
  capped and batched by `parallel.maxConcurrency`, instead of one at a time.
- **Second consumers: `/ptp:full-plan` and `/ptp:full` Phase A** (`0034_03`). Both fan out the
  **per-slice `review-plan-full`** stage under the same contract, capped and batched the same way.
  Both entrypoints parse and strip the `parallel:` token **once** in their own outer session and
  thread the **resolved posture** into the delegated `/ptp:plan-multiple`, so one token governs both
  plan-phase stages — the decompose's per-slice planning **and** the per-slice plan reviewing —
  rather than only one of them. On the fan-out path the convergence gate becomes
  **join-then-gate**: every member is joined, a bounded **post-join cross-slice recheck** gives one
  further `review-plan-full` pass to any slice whose dependency received inline fixes during the
  fan-out, and only then is the gate applied over the whole set. The gate's decision rule is
  unchanged and identical on both paths — every slice must be green — and a non-green slice anywhere
  in the set still blocks `/ptp:full` from entering its apply phase. The **apply phase is untouched**
  and receives no parallel input.
- **With `parallel.mode` off — the default — nothing runs concurrently.** `/ptp:plan-multiple` plans
  its slices serially in ascending story order, producing the same slices, artifacts, and report
  content as before its fan-out restructure; `/ptp:full-plan` and `/ptp:full` Phase A plan-review
  their slices serially in ascending story order with the same fail-fast STOP as before; and every
  other ptp flow is byte-identical in what it runs, in what order, and with what concurrency to its
  behavior before these keys existed.

Both are settable via `/ptp:config` (see below).

### `backlog.mcpServer`, `backlog.projectOwner`, and `backlog.projectNumber`

Three keys naming **which GitHub Projects board the epic backlog lives on, and which MCP server
reaches it**. The backlog **is** that board — there is no local backlog file — so `/ptp:backlog` reads
them on every invocation; see **What these keys do** at the end of this section.

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `backlog.mcpServer` | string | unset | Which MCP server reaches Projects. **Unset means the official GitHub-plugin MCP server** — the ordinary case. Set it to name **your own** server instead (for example a per-account Docker MCP server running under a different GitHub token). |
| `backlog.projectOwner` | string | unset | The GitHub org or user **login** that owns the board — a login, never a board URL. |
| `backlog.projectNumber` | integer `>= 1` | unset | The board's project number. No upper bound; project numbers are unbounded per owner. |

Board identity is **owner login + project number**, not a URL: those are exactly the two values the
GitHub Projects v2 API and `gh project` take (`--owner`, `<number>`), and a bare login resolves for
organizations and user accounts alike, so no owner-type key is needed.

All three resolve from the same two layered files as every other ptp key — global first, then project
**overriding key by key** — through a deliberately **forgiving per-key reader**: a missing file,
unparseable JSON, a wrong-shape root, a wrong-type value, or an out-of-range value leaves the prior
layer's valid value in place, and an invalid value for one key never discards a valid value for
another. Resolution never throws and never STOPs over a config typo. A valid string resolves to its
**trimmed** form, so a hand-edited `" acme "` reaches a consumer as `acme`.

**Completeness is a verdict, not an action.** The configuration is *complete* when `projectOwner` and
`projectNumber` have both resolved. `mcpServer` is never required — unset is a meaningful value — and
never ignored. **A `backlog.mcpServer` that was set but invalid is not the same as an unset one:** if
some layer supplies the key with an unusable value (an empty string, a number, `true`, `null`) and no
layer supplies a good one, the configuration is **not actionable** even though owner and number
resolved, and ptp refuses and names the key rather than quietly falling through to the official server
— which would send your writes to a different account's board. An incomplete or unactionable
configuration produces a **non-silent refusal** rather than a fallback:
ptp never warns-and-continues, never substitutes a server you did not name, and never writes a local
backlog file in place of the configured board.

**Returning to the official server means deleting `backlog.mcpServer` by hand**, because `/ptp:config`
writes values and never removes them — the same limitation `codex.model` and `codex.reasoningEffort`
already carry.

#### The transport contract

`ptp-github-projects-mcp` is the single source of truth for reaching the board, and it is pure prose —
it reads no file on its own and changes nothing.

- **The server name resolves two ways, and there is no third:** `backlog.mcpServer` unset means the
  official GitHub-plugin MCP server, whose configured name (`github`) is a named constant held in that
  one contract; set means the value you configured. The tool prefix is then **derived from the server
  name** — every character outside `[A-Za-z0-9_-]` becomes an underscore, and the sanitized name is
  wrapped in the MCP tool-prefix form Claude Code uses, so hyphens and case survive while `:`, `.`, and
  space each become `_`. The derived prefix is a **candidate, never an authority**: ptp probes only the
  server you named, never scans for similarly-named servers, and never adopts one you did not name.
- **Eight required Projects tools, in two tiers.** Read (5): `list_projects`, `get_project`,
  `list_project_fields`, `list_project_items`, `get_project_item`. Write (3): `add_project_item`,
  `update_project_item`, `delete_project_item`. The read tier gates reads; the read tier **plus** the
  write tier gates writes.
- **Three verdicts.** `ready` (all eight callable), `read-only` (all read tools callable, at least one
  required write tool missing — reads proceed, writers stop), and `unavailable` (at least one read
  tool not callable — every operation reaching the store stops).
- **A failed preflight never silently proceeds.** It STOPs with a fixed, greppable message naming the
  server and its source, the probed prefix, what was found, exactly which tools are missing, the likely
  cause, and a repair line that names `/ptp:config` only where a configuration change can actually
  help. There is no `--force`.

**What these keys do.** They resolve the board the epic backlog lives on. **`/ptp:backlog` reads that
board on every invocation**: it evaluates the completeness verdict first and refuses non-silently,
naming the missing keys, before it runs the preflight or calls any Projects tool. The four writers —
`/ptp:backlog-add`, `/ptp:backlog-edit`, `/ptp:backlog-run`, and `/ptp:backlog-continue` — write that
same board and each carries **exactly one** up-front refusal that names its own cause under an unusable
backlog store: an incomplete configuration, a preflight verdict that does not admit a write, a
writer-ineligible store, or the read path withholding something that writer consumes. None of them ever
falls back to a local file — not on a refusal, and not on a failed, partial, or unresolved write.

**One-time board setup.** Create the board (or reuse one), then add **exactly two custom fields** to
it — that is the whole setup, and ptp creates neither for you:

| Field | Type | Notes |
|---|---|---|
| `Backlog ID` | **text** | Holds the entry's `BK-NNNN` id. Its presence is what makes a card a backlog entry; a card without one is an *unmanaged item* — reported, never a defect. |
| `Status` | **single select** | Needs options covering the five status values: `pending` (or `Todo`), `in-progress` (or `In Progress`), `done` (or `Done`), `blocked` (or `Blocked`), and `cancelled` (or `Cancelled` / `Canceled`). |

Field names are matched case-insensitively and whitespace-trimmed. Any **further** custom fields you
like (`Priority`, `Iteration`, assignees, your team's own) are fine: they are never read, never
written, and never removed. A board missing either required field is reported fatally and actionably —
ptp never creates a field, an option, an item, or a project.

All three keys are settable via `/ptp:config` (see below).

### `/ptp:config` — guided config editor

**`/ptp:config`** is the interactive front door for editing these config files. Instead of
hand-editing JSON, it walks you through:

1. **Target** — choose *User / global* (`~/.claude/ptp/config.json`) or *Project*
   (`<repo>/.claude/ptp/config.json`).
2. **Parameter** — one of the **fifteen** registered parameters: `codex.mode` ("Use Codex for
   review"), `codex.model` ("Codex model override"), `codex.reasoningEffort` ("Codex reasoning
   effort"), `review.maxIterations` ("Max review-loop iterations"), `review.minSeverity` ("Lowest
   severity to handle"), `roles.main` ("Main agent"),
   `telemetry.mode` ("Record ptp run telemetry"), `telemetry.root` ("Telemetry store root"),
   `telemetry.port` ("Telemetry receiver port"), `telemetry.retentionDays` ("Telemetry raw-store
   retention (days)"), `parallel.mode` ("Run planning stages in parallel"), or
   `parallel.maxConcurrency` ("Max parallel fan-out members"), `backlog.mcpServer` ("Backlog MCP
   server"), `backlog.projectOwner` ("Backlog project owner"), or `backlog.projectNumber` ("Backlog
   project number"); the menu grows as the registry grows.
3. **Value** — select from the valid enum values with one-line descriptions (`codex.mode`,
   `codex.reasoningEffort`, `review.minSeverity`, `roles.main`, `telemetry.mode`, `parallel.mode`),
   enter a free-text value
   (`codex.model`, `backlog.mcpServer`, `telemetry.root` — validated to stay inside the repository —
   and `backlog.projectOwner` — validated as a login rather than a board URL), or enter an integer
   (`review.maxIterations`, `telemetry.retentionDays`, `backlog.projectNumber`, `telemetry.port` —
   validated as a TCP port in `1..65535` — and `parallel.maxConcurrency` — validated as `1..10`).

The command then performs a **safe merge-write**: it sets only the targeted key (e.g. `codex.mode`,
`codex.model`, or `codex.reasoningEffort`), preserves every other existing key (including the
`deploy` block and sibling `codex` keys), creates the parent directory and file if absent, and
refuses to overwrite a malformed or wrong-shape JSON file. It echoes the absolute path written and
the new value. It **never commits, pushes, or stages** the change.

These are the same `~/.claude/ptp/config.json` and `<repo>/.claude/ptp/config.json` files
described in the Configuration section above.

### `deploy`

Controls the terminal **`/ptp:deploy`** ship pipeline (commit → PR → merge → run the
project's deploy CI/CD → return to `master`). All keys are optional and fall back to the
defaults below.

```json
{
  "deploy": {
    "mergeMethod": "squash",
    "maxFixRounds": 3,
    "workflow": null,
    "inputs": {}
  }
}
```

| Key | Default | Meaning |
|-----|---------|---------|
| `mergeMethod` | `"squash"` | `gh pr merge` strategy (`squash` / `merge` / `rebase`). |
| `maxFixRounds` | `3` | Cap on each autonomous fix loop — the PR-stage loop (conflicts/failing checks) and the deploy-stage loop (failed deploy run) are bounded independently. On exhaustion the command STOPs and reports. |
| `workflow` | `null` | Explicit deploy workflow file (e.g. `"deploy.yml"`). When `null`, ptp auto-detects a `deploy`/`release`/`publish` workflow under `.github/workflows`. |
| `inputs` | `{}` | `workflow_dispatch` inputs passed when dispatching the deploy workflow, e.g. `{ "confirm": "deploy" }` for a workflow that requires a typed confirmation. |

There is no approval setting. GitHub blocks a PR author from approving their own PR, so
`/ptp:deploy` never tries to — it merges straight through whenever the repo doesn't *require*
an approving review, and **stops at the PR** (handing off to **`/ptp:deploy-pr-approved`**)
only when branch protection requires an approval it can't satisfy itself. The approval gate is
detected from the PR, not configured.

Like `codex.mode`, a missing file, missing key, or unknown value falls back to the default —
ptp never fails to start over a config typo.

---

## Per-invocation switches

Some ptp commands accept optional tokens embedded anywhere in their argument text that apply for that
single invocation only — nothing persists to config.

- **`fast:on` / `fast:off`** (default off) — declares that the opus agents this invocation spawns
  should run in Claude Code **fast mode**. Fast mode is a **session-level** Claude Code setting
  (`/fast` Tab-toggle, `"fastMode": true` in a settings file, or
  `claude -p --settings '{"fastMode": true}'`), available only on Opus 5 / Opus 4.8, and billed at a
  higher rate from usage credits. ptp **cannot** enable it per agent spawn — instead `fast:on` runs a
  read-only preflight that verifies what it can from settings, and either announces that configuration
  reports fast mode enabled (naming the settings file that supplied it — what configuration says, not a
  guarantee about the live session) or prints a non-blocking advisory with the remediation that fits
  why it could not verify — always recording the request and proceeding either way. A resolved
  non-`opus` target and
  `main=codex` are both documented no-ops (Codex has no fast mode; fast mode is Opus-only), never
  errors. The workflow-backed `full` family (`/ptp:full`, `/ptp:full-apply`, `/ptp:full-plan`) now honors
  the switch too: parsed once in the outer session, one preflight/announcement per invocation, threaded
  into the workflow's apply and review prompts, Opus-only (so a story whose `effort.md` model is
  `sonnet`/`haiku` gets no note on its apply agent while its review agent still does). Full contract:
  `skills/ptp-run-at-model/SKILL.md`.
- **`rounds:{count}`** (default **5**) — accepted by **`/ptp:backlog-run`** only, and caps how many
  backlog epics one invocation runs. The body is a **positive integer** (`^[0-9]+$` with value ≥ 1;
  leading zeros accepted, so `rounds:05` means 5), and a non-integer, zero, or negative body refuses
  rather than falling through to the default. It is **token-only — there is no `backlog.rounds`
  configuration key** and nothing is persisted. **One round is one backlog epic** run through
  `/ptp:full`, counting epics **started**, so a halted epic consumes its round and the invocation.
  Full contract: `skills/ptp-backlog-run/SKILL.md` (its grammar mechanics are defined by reference to
  the `fast:` section of `skills/ptp-run-at-model/SKILL.md`).
- **`model:<model>.<effort>`** — overrides a supporting command's default target model/effort for that
  single invocation; supported by `/ptp:brainstorm`, `/ptp:prd`, `/ptp:brainstorm-full`, and
  `/ptp:prd-full` only. Same skill owns the grammar: `skills/ptp-run-at-model/SKILL.md`.

---

## Change ids and selectors

Every change born through the ptp flow carries a structured id:

```
<epic>_<story>_<kebab-description>
  epic  = 4 digits, zero-padded   (e.g. 0021)
  story = 2 digits, zero-padded   (e.g. 01)
example: 0021_01_media-edit-create-project-tag
```

Commands that take a change argument accept a **selector** instead of a bare id (resolved by the shared `ptp-change-selector` skill):

| Selector | Resolves to |
|----------|-------------|
| `epic:all` | all active changes across every epic, `(epic, story)` ascending (legacy ids appended after) |
| `epic:0021` | all active stories in epic `0021`, in story order |
| `epic:0021 story:01` | the single change `0021_01_*` |
| `story:01` | the one active change with story `01` (if unambiguous) |
| bare id | that exact change folder |
| *(omitted)* | all active changes, ordered by epic then story |

This is what lets `/ptp:full-apply epic:0021` apply-and-review an entire epic's worth of stories in one go.

---

## The autonomous `full` family (the headline)

These three commands turn a description into reviewed code with minimal hand-holding. All can use the Codex CLI as the second reviewer — governed by `codex.mode` (default `auto`; see [Configuration](#configuration)).

**`/ptp:full "<request-or-big-change-id>"`** — the whole pipeline in one call. Runs the plan phase (decompose into slices + dual plan-review each slice), and **only if every slice's plan converges**, continues without stopping into the apply phase (apply + dual code-review each story). Never archives. This is the union of the two commands below.

**`/ptp:full-plan "<request-or-big-change-id>"`** — the **read-only planning** half. Decomposes the work into independently-shippable slices (`/ptp:plan-multiple`) and runs the full two-phase (Superpowers + Codex) artifact review on every slice. Never applies code, never archives. Next step is `/ptp:full-apply`.

**`/ptp:full-apply [selector | id …]`** — the **execution** half. Launches the `ptp-full-apply` workflow, which runs `apply → review-full` per story **sequentially** — one story fully finished before the next. Each story's apply agent runs at the model from its `effort.md`; review always runs at `opus.high`. Pass a selector/id list, or omit to run all active changes (with a one-time scope confirmation).

---

## The step-by-step workflow

For when you want to drive each stage yourself. Skip it entirely for typos, one-liners, dependency bumps, and renames — just edit directly.

```
brainstorm → plan → apply → review → archive
    1            2       3        4        5
```

### Step 0 — PRD (optional, upstream)

**`/ptp:prd [<changeid | epic:XXXX | story:XX | "<free-text description>"> …]`** — author an
epic-scoped Product Requirements Document at `openspec/changes/<id>/prd.md` (where `<id>` is the
epic's lowest-numbered story) before brainstorming or planning. `/ptp:prd` is a **limited/hybrid
producer**: for a selector it resolves to a set of existing epics (one PRD per epic, consumer path);
for a **free-text argument** (not a selector and matching no existing active folder) it **allocates a
fresh epic** via `ptp-change-selector` §4, creates the change folder, and authors that epic's PRD into it —
so a raw idea can start a fresh epic the way `/ptp:brainstorm` and `/ptp:plan` do. Runs the authoring
work at `opus.high` via the `ptp-prd` skill. When the `prd-taskmaster` plugin is present the PRD is
authored via `prd:generate` and relocated into the change folder; when the plugin is absent a
structured PRD is authored inline and said so (graceful auto-degrade). Non-interactive. Omit the
selector to run for all active epics. Recommends `/ptp:plan` as the next step.

**`/ptp:prd-full <epic-selector>`** — seam-free union of `/ptp:prd` and `/ptp:review-prd-full` in one
uninterrupted flow. Authors the epic PRD, then — without a manual re-invocation — continues into the
dual-reviewer (Superpowers + Codex) inline-fix PRD-review loop. A prd-gate between phases prevents the
review from starting if the PRD was not written. On a green terminal state (`BOTH PHASES DONE` or
`PHASE 1 DONE — CODEX SKIPPED (mode=…)`) recommends `/ptp:plan <change-id>`. Uses Codex per `codex.mode`;
`required` with missing `codex` STOPs before any work. The PRD-stage analog of `/ptp:brainstorm-full`;
delegates to the `ptp-prd-full` skill.

### Step 0 — Analyze (optional, diagnostic)

**`/ptp:analyze "<bug / observation / problem / question>"`** — read-only investigation. Root-causes a bug, explains an observed behavior, or investigates a subsystem *before* deciding whether a change is even warranted. Writes a structured analysis doc into the appropriate `openspec/changes/<change-id>/analysis.md` (allocating a minimal change folder via `ptp-change-selector` §4 only when no relevant active change exists) with evidence-cited findings, confidence level, and a recommended next step. Never produces a change proposal, never modifies source. Use this when you want to understand first and decide later. Contrast with `/ptp:brainstorm-only`, which explores *prospective* design options.

### Step 1 — Brainstorm (optional, interactive)

**`/ptp:brainstorm "<request>"`** — Superpowers brainstorm for a *specific change*. Produces 2–3 options with tradeoffs, recommends one, writes `openspec/changes/<change-id>/brainstorm.md`. Does **not** write proposal/design/tasks.

**`/ptp:brainstorm-only "<topic>"`** — same brainstorm, *change-agnostic* — for exploring a direction before you know the concrete change. Writes to `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`; `/ptp:plan` picks it up later.

**`/ptp:review-brainstorm [change-selector]`** *(optional, read-only)* — brainstorm-quality gate one step earlier than `/ptp:review-plan`, between brainstorm and plan. Audits a change's `brainstorm.md` (options + tradeoffs, recommendation with rationale, assumptions, scope, spec-interaction, usable handoff) and reports PASS / WARN / FAIL. Read-only, runs no branch guard, runs **no** `openspec validate` (a brainstorm precedes any proposal/spec), edits nothing, and triggers no other command. Advisory; does not block `/ptp:plan`. Omit the selector to review all active changes' brainstorms.

**`/ptp:review-brainstorm-full [change-selector]`** *(optional, read-only)* — **dual-reviewer** (Superpowers + Codex per `codex.mode`) variant of `/ptp:review-brainstorm`. Audits a change's `brainstorm.md` with two independent reviewers and reports per-reviewer PASS / WARN / FAIL plus a combined verdict (`BOTH REVIEWERS PASS` / `PHASE 1 DONE — CODEX SKIPPED (mode=…)` / `REVIEW FINDINGS — REVISE BRAINSTORM`). Unlike the write-capable `-full` orchestrators it is **report-only** — runs each reviewer once, no inline fix loop, no iteration cap. Runs **no** `openspec validate`, never edits the brainstorm, runs no branch guard, and is advisory. Uses Codex per `codex.mode` (default `auto`; with `auto`/`off` and no Codex it runs Superpowers-only and reports the skip). Omit the selector to review all active changes' brainstorms.

**`/ptp:brainstorm-full "<request>"`** — seam-free union of `/ptp:brainstorm` and `/ptp:review-brainstorm-full` in one uninterrupted flow. Allocates a change id, runs the Superpowers brainstorm phase (producing `brainstorm.md`), then — without a manual re-invocation — continues into the dual-reviewer (Superpowers + Codex) inline-fix brainstorm-review loop. A brainstorm-gate between phases prevents the review from starting if `brainstorm.md` was not written. On a green terminal state (`BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`) recommends `/ptp:plan <change-id>`. Uses Codex per `codex.mode`; `required` with missing `codex` STOPs before any work.

### Step 2 — Plan (autonomous)

**`/ptp:plan [change-id]`** — end-to-end autonomous planning. Consumes a brainstorm doc if present, else brainstorms inline (no clarifying questions — assumptions are documented). Produces `proposal.md`, `design.md`, `tasks.md`, `TLDR.md`, an `effort.md` model/effort recommendation, and `specs/<capability>/spec.md` deltas when behavior changes. Runs `openspec validate <id> --strict`.

**`/ptp:plan-multiple <request-or-id>`** — multi-change variant. Autonomously decomposes oversized work into slices (`01_…`, `02_…`) under an allocated epic and runs `/ptp:plan` per slice in dependency order. Falls back to a single `/ptp:plan` if splitting isn't warranted.

**`/ptp:review-plan [change-id]`** *(optional, single reviewer)* — artifact-quality gate over `proposal.md` / `design.md` / `tasks.md` / spec deltas *before* any code. Reports PASS / WARN / FAIL. Advisory; does not edit artifacts or block `/ptp:apply`.

**`/ptp:review-plan-loop <selector>`** — loops Superpowers artifact review + inline fixes until zero open findings or the iteration cap.

**`/ptp:review-plan-full <selector>`** — **dual-reviewer** artifact loop: Superpowers loop to convergence, then Codex loop to convergence. Both must sign off on the plan. Uses Codex per `codex.mode` (default `auto`; with `auto`/`off` and no Codex it runs the Superpowers loop only and reports the skip).

**`/ptp:effort <change-id>`** — recommends the Claude model + effort level for `/ptp:apply` without re-running the full plan.

### Step 3 — Apply

**`/ptp:apply <selector>`** — implements tasks sequentially from `tasks.md` with Superpowers TDD discipline. Re-validates first, checks off each task only after verifying it, and stops on any plan/spec mismatch rather than drifting. Runs the implementation work at the model + effort from the change's `effort.md` (per change for a multi-change selector), via `ptp-run-at-model`.

### Step 4 — Review

> The whole review family (the read-only reviewers, the four `-loop` commands, the three `-full` review orchestrators, and `/ptp:review-fix`) runs its work at **`opus.high`** via `ptp-run-at-model` — each command spawns one foreground `opus` subagent so review quality no longer depends on the session's model. Of the three `-full` review orchestrators, two write — `/ptp:review-full` (code) and `/ptp:review-plan-full` (artifacts) are inline-fixing convergence loops — while `/ptp:review-brainstorm-full` is **read-only** (it audits the brainstorm and reports, never fixes). `/ptp:brainstorm-full` also runs both its phases via `ptp-run-at-model` at `opus.high` and is write-capable (it writes `brainstorm.md` and drives the inline-fix review loop). Outer abort-preconditions (and, for the write-capable commands, the `ptp-branch-guard` preamble) still run in the outer session before the spawn; the read-only reviewers (including `/ptp:review-brainstorm-full`) run no branch guard.

**`/ptp:review <selector>`** — Superpowers code review of the implementation diff against proposal/design/spec deltas/tasks. Findings classified Critical / High / Medium / Low.

**`/ptp:review-loop <selector>`** — loops `/ptp:review` + inline fixes automatically until zero open findings at or above the configured `review.minSeverity` floor (default `low` = every severity; below-threshold findings are reported, not fixed) or the iteration cap (5). Replaces the manual review → fix → review cycle.

**`/ptp:review-full <selector>`** — **dual-reviewer** code loop: Superpowers loop to convergence, then Codex loop to convergence. Both must sign off before archive. Uses Codex per `codex.mode` (default `auto`; with `auto`/`off` and no Codex it runs the Superpowers loop only and reports the skip).

**`/ptp:review-fix [selector]`** *(explicit fix step)* — confirms the findings of the *latest review in the conversation* (rejecting false positives via `receiving-code-review`), fixes the confirmed ones inline, runs tests/lint/validate. Never applies, plans, archives, or auto-commits.

**Codex single-pass variants** (independent second opinion; an explicit opt-in that runs Codex even when `codex.mode` is `off` — needs `codex` on PATH):
- **`/ptp:codex-review <selector>`** — Codex code review of an implemented change.
- **`/ptp:codex-review-loop <selector>`** — Codex code review + fixes, looped to convergence.
- **`/ptp:codex-review-uncommitted [selector]`** — Codex review of uncommitted working-tree changes only (staged + unstaged + untracked); useful mid-implementation.
- **`/ptp:codex-review-plan <selector>`** — Codex review of the *artifacts* (not code).
- **`/ptp:codex-review-plan-loop <selector>`** — Codex artifact review + fixes, looped to convergence.

**PRD-review variants** (epic-scoped — audit an epic's PRD `openspec/changes/<id>/prd.md` *before* `/ptp:plan`, one stage earlier than the brainstorm/plan reviewers; each runs **no** `openspec validate` because a PRD precedes any proposal/spec, and a missing PRD is a Critical "no PRD to review" finding, not an abort):
- **`/ptp:review-prd [epic-selector]`** *(optional, read-only)* — single-pass Superpowers PRD-quality gate (schema completeness, testable acceptance criteria, requirements→goals tracing, scope/non-goal consistency). Reports PASS / WARN / FAIL. Read-only, runs no branch guard, edits nothing, advisory. Omit the selector to review all active epics' PRDs. Delegates to the `ptp-review-prd` skill.
- **`/ptp:codex-review-prd <epic-selector>`** — Codex single-pass closed-book PRD audit; read-only, never fixes, STOPs if `codex` is absent.
- **`/ptp:codex-review-prd-loop <epic-selector>`** — Codex PRD review + inline fixes, looped to convergence (drives `ptp-review-loop` with `kind=prd`, `reviewer=codex`, once per epic; runs the branch guard; stamps the marker `openspec/changes/<id>/reviews/prd.json`).
- **`/ptp:review-prd-full [epic-selector]`** — **dual-reviewer** inline-fix PRD loop: Superpowers `kind=prd` loop to convergence, then (per `codex.mode`) the Codex `kind=prd` loop to convergence, **editing the PRD inline**. Phase 2 starts only if Phase 1 converges. Runs **no** `openspec validate`, runs the branch guard, and writes exactly **one** combined marker `openspec/changes/<id>/reviews/prd.json` per epic (both phases defer the per-phase write). Uses Codex per `codex.mode` (default `auto`; with `auto`/`off` and no Codex it runs Superpowers-only and reports the green `PHASE 1 DONE — CODEX SKIPPED (mode=…)`); `required` with missing `codex` STOPs before any work. Omit the selector to review all active epics' PRDs. Delegates to the `ptp-review-prd-full` skill.

### Step 5 — Archive

**`/ptp:archive <selector>`** — enforces the archive gates (all tasks checked, no unresolved Critical/High findings, validation passes), then runs `openspec archive` to move the change to `openspec/changes/archive/` and sync delta specs into `openspec/specs/`.

**`/ptp:archive-force <selector>`** — gate-bypassing escape hatch for changes that can't meet the gates (unchecked tasks, unreviewed, failing validation). Still syncs delta specs, and **always reports which gates it bypassed** — force is never silent. Use `/ptp:archive` for the default safe path.

### Status

**`/ptp:status [change-id]`** — read-only. Shows active changes, validation status, task progress, and the recommended next command. Omit the id to see all active changes.

### Backlog

**`/ptp:backlog`** — read-only view of the epic backlog, which lives on a **GitHub Projects v2 board** (configured by `backlog.projectOwner` / `backlog.projectNumber` / `backlog.mcpServer`). Shows a header naming the board and carrying the capability-preflight verdict, the entries table with each entry's status, the computed ready set in run order (or the stated reason it is withheld), stale-`in-progress` flags, provisional (`folder-diff-unconfirmed`) change-epic links alongside undispositioned attribution warnings, a scope note (unmanaged cards, archived entries, ignored metadata keys, degraded scope, and a legacy-file line), and any validation problems. It takes no argument, runs no branch guard, and **creates nothing** — no project, no custom field, no `Status` option, no card, no version marker, and no file. A board it cannot read is **never** rendered as an empty backlog.

**`/ptp:backlog-add "<free-text description of the epic to add>" [model:<model>.<effort>]`** — adds **one** epic to the backlog from a free-text request: allocates a `BK-NNNN` id, writes a single `pending` entry whose description keeps the request text substantively verbatim, and **modifies no other entry**. The report names the entry it created, with its id, title, and status. Persistence runs `ptp-backlog-write`'s ordered write sequence — the create carrying title and body, then the `id`, then the `status: pending` commit last — with both re-reads and a full write journal, so a partial failure is inert, exactly reported, and never compensated. It carries **exactly one** up-front refusal, naming its own cause under an unusable backlog store (an incomplete configuration, a preflight verdict that does not admit a write, a writer-ineligible store, or archived items being unreachable, which withholds the id allocation this command needs). Autonomous — it asks no clarifying questions.

**`/ptp:backlog-edit <BK-NNNN> "<what to change>" [model:<model>.<effort>]`** — edits **exactly one** backlog entry from a free-text instruction: its `title`/`description`/`notes` and its `status` — but only along the rows of the transition table, so every runner-only row (`pending → in-progress`, `in-progress → done`, and the runner's own direct `in-progress → blocked` halt, which the user reaches only as a recovery disposition), every row absent from the table, and every no-op write are refused — a runner-only row naming the row and the command that does perform it. Resetting a `blocked` entry or cancelling one retains the prior attempt's `changeEpics` and requires an acknowledgement that its unconverged slices were resolved. It is also the **recovery** command: an entry left in a stale `in-progress` state — un-reconciled from a crashed `/ptp:backlog-run` only if no backlog run is currently live, since a live run looks identical on disk — is reconciled against its `runBaseline`, **gated** while it holds any `changeEpics` id or any undispositioned attribution warning, and settled only through a disposition the availability table actually offers (**claim** → `blocked`, **disown** → `pending` and withheld once a confirmed id exists, **rerun anyway** → `pending`, plus per-prefix **promote**/**dismiss**) — clearing `runBaseline` in the same write **group**, and **never** yielding `done`. Every mutation of one invocation lands in a single write group dispatched through `ptp-backlog-write`'s ordered sequence, with every `runBaseline` clear a payload write preceding the `status` commit; a **refusal** still leaves the store untouched, while a **failure** mid-sequence is named exactly by the journal and its verdict rather than claimed to be byte-clean. It carries **exactly one** up-front refusal, naming its own cause under an unusable backlog store. Autonomous — an ambiguous instruction is refused with the offered dispositions printed, never asked about.

**`/ptp:backlog-run [rounds:{count}]`** — runs ready backlog epics through **`/ptp:full`** in ascending backlog-id order, one at a time, **five per invocation by default** (`rounds:{count}` overrides it for that invocation only; the body is a positive integer and nothing is persisted). It takes no selector — which epics run is the ready set's job — recomputes the ready set after **every** epic from a fresh validated read, so a mid-run hand edit or store defect is seen, marks each epic `in-progress` with a `runBaseline` snapshot before its `/ptp:full` begins, records the change ids that run produced back into the entry, and **halts the whole run** on the first epic whose `/ptp:full` does not converge — marking it `blocked` and taking no further epic. Each of its three write points is **one write group** dispatched through `ptp-backlog-write`'s ordered sequence, and a group that does not complete halts the run under its own terminal state rather than being reported as a convergence halt. It carries **exactly one** up-front refusal, naming its own cause under an unusable backlog store, and the capability preflight is an **aborting precondition ahead of the branch guard**. Every epic lands on **one** feature branch, uncommitted and unarchived: the command **never commits, pushes, merges, archives, or deploys**, and announces that blast radius — **six** items, the sixth naming that backlog status writes land on a shared board, immediately, outside git, and are not undone by discarding the branch — before the first epic runs. It classifies its end into **five** loop-terminal states and reports **four** backlog-level buckets.

**`/ptp:backlog-continue [what went wrong during the manual check]`** — the resume path for the epic `/ptp:backlog-run` halted on, and the **only** command that can reach `done` from `blocked`. It takes **no selector** — it finds the single entry that is `blocked` with a non-empty `changeEpics` itself, and **refuses, naming every candidate**, when zero or more than one qualify rather than guessing (the backlog persists no attempt boundary, so there is no field on which "the most recent halt" could be computed). **Bare** means *"I performed the manual verification, it's fine"*: for every change-epic prefix the entry records, it flips the remaining `- [ ]` boxes to `- [x]` (inventing, removing, and reordering nothing), **re-runs** `openspec validate --strict` plus the project's build and test suites so a stale automated failure is a refusal rather than something waved through, drives **`/ptp:review-full`** to its convergence gate and then **`/ptp:archive`** under its own unweakened gates — and only once **every** prefix has settled performs the single `blocked → done` write group (`ptp-backlog` row 8, guard 3: retain `changeEpics` by planning no row for it, clear `runBaseline` as the payload, commit `done` last, and send no `updatedAt` — the board maintains it). Any stall, and any write group that does not complete, leaves the entry `blocked` with `changeEpics` intact, and the report says which prefixes finished and **never** reports the epic as finished. It carries **exactly one** up-front refusal, naming its own cause under an unusable backlog store, with the capability preflight evaluated **before** it selects a target. **With free text** it means *"I found problems"*: one scoped fix pass runs against the same change carrying your text verbatim as its brief and `agents/ptp-apply.md`'s hard rules (TDD, **no invented tasks**), no manual-only box is ever re-checked on your behalf, and **no status transition, no review, and no archive** happen — the epic stays `blocked`, waiting on another manual check. It is deliberately **UNWRAPPED** (so `/ptp:review-full`'s and `/ptp:archive`'s own spawns stay at one nesting level and `/ptp:archive`'s interactive confirmations stay reachable), never commits/pushes/merges/deploys, and **never chains into `/ptp:backlog-run`** — it points at it instead.

### Telemetry

**`/ptp:telemetry <status | report | analyze | setup | start | stop | export>`**. See `telemetry.mode` /
`telemetry.root` / `telemetry.port` / `telemetry.retentionDays` under
[Configuration](#configuration).

`/ptp:telemetry` is a **thin router**: each subcommand is also a leaf command of its own, and both
spellings reach the same leaf skill, so they cannot behave differently. The shared store, ledger,
span, receiver, preamble, and Codex contract lives in the `ptp-telemetry` skill.

| Subcommand | Leaf command | Leaf skill |
|---|---|---|
| `/ptp:telemetry status` | `/ptp:telemetry-status` | `ptp-telemetry-status` |
| `/ptp:telemetry report` | `/ptp:telemetry-report` | `ptp-telemetry-report` |
| `/ptp:telemetry analyze` | `/ptp:telemetry-analyze` | `ptp-telemetry-analyze` |
| `/ptp:telemetry setup` | `/ptp:telemetry-setup` | `ptp-telemetry-setup` |
| `/ptp:telemetry start` | `/ptp:telemetry-start` | `ptp-telemetry-start` |
| `/ptp:telemetry stop` | `/ptp:telemetry-stop` | `ptp-telemetry-stop` |
| `/ptp:telemetry export` | `/ptp:telemetry-export` | `ptp-telemetry-export` |

- **`status`** — read-only. The resolved mode, root, and port; the environment preflight verdict
  (enable flag, endpoint, protocol, and the ingestion-credential match — reported **without printing
  the credential**, plus any non-gating `OTEL_BSP_SCHEDULE_DELAY` drift); whether the receiver is
  listening, how it was started and when, and whether the lockfile is stale; and per-epic total /
  closed / unclosed run counts (plus the unattributed bucket). It never creates a store, never starts
  or stops anything, and reports a store's absence rather than inferring `mode=off` from it. Leaf
  command: `/ptp:telemetry-status`.
- **`report [write] [selector]`** — the timing analysis. **Creates no file, modifies no existing
  file, and deletes only aged raw files.** That third clause is not decoration — a default run
  prunes irreversibly (see [Retention](#retention)). Detailed below. Leaf command:
  `/ptp:telemetry-report`.
- **`analyze`** — **read-only**, and the only telemetry subcommand that *analyses* the **raw** store
  (`export` reads it too, to re-derive the CSVs; `report` may never read it at all). Runs
  the bundled analysis engine over the whole store (`_unattributed` included) and prints the
  de-nested work breakdown: leaf work split LLM-vs-tools, inside-subagent vs main-agent, token burn
  by model, tool work by `tool_name`, bash work by command, and a mandatory data-quality footer.
  **Takes no selector** — and no day/session narrowing flag exists yet; any narrowing ever offered
  would be an explicit engine flag, never the change grammar. It **creates no file, modifies no
  existing file, and deletes nothing**. Not to be confused with **`/ptp:analyze`**, the unrelated
  read-only investigation command. Leaf command: `/ptp:telemetry-analyze`.
- **`setup`** — the **one-time**, interactive, **confirm-first** opt-in described in the walkthrough
  below. The single exception to ptp's never-write-a-Claude-Code-setting rule. Leaf command:
  `/ptp:telemetry-setup`.
- **`start` / `stop`** — the manual receiver lifecycle. `start` is idempotent (a second `start`
  reports the existing process); `stop` verifies the recorded pid, port, and launch token before
  terminating anything. Neither is normally needed: the receiver **auto-starts** from a shared
  preamble. Leaf commands: `/ptp:telemetry-start`, `/ptp:telemetry-stop`.
- **`export`** — **takes no flag and no argument**. Every invocation is a global, deterministic
  re-derivation: it reads every epic's raw store and every ledger, re-resolves attribution, re-derives
  `tool_class`, and rewrites **every** `spans.csv` from scratch. Two runs against an unchanged store
  produce byte-identical output, and it writes **nothing** into the raw store.

  `export` **requires the receiver to be stopped** and refuses — with one line naming
  `/ptp:telemetry stop`, stopping nothing and writing nothing — while one is live. The documented
  repair path (for a damaged CSV, or after a `tool_class` fix) is therefore
  **`/ptp:telemetry stop` → `/ptp:telemetry export` → restart**. Run `export` *directly* after the
  stop: any ptp command in between auto-starts the receiver again and `export` refuses. Set
  `telemetry.mode=off` first if you cannot be sure. Leaf command: `/ptp:telemetry-export`.

#### `/ptp:telemetry report` — where the time went

```
/ptp:telemetry report epic:0032            # print the report for epic 0032
/ptp:telemetry report                      # no argument = every active epic (same as epic:all)
/ptp:telemetry report epic:all             # every active epic, each reported separately
/ptp:telemetry report write epic:0032      # also write openspec/telemetry/0032/report.md
```

The **selector is the standard ptp change selector with no additions** — `epic:all`, `epic:XXXX`,
`epic:XXXX story:NN`, a bare change id, or nothing (**nothing means every active epic**, each
reported separately). A **story-level** selector reads its epic's store and narrows the figures to
that change's rows; pruning, however, is always epic-level (see [Retention](#retention)). The
literal **`write` keyword is stripped by
`report` *before* the selector ever sees the argument**, which is how the optional file write is
requested without adding a single token to the selector grammar. A bare selector never means "write",
and `write` is never read as a selector. With `write`, the only file created is
`<telemetry.root>/<epic>/report.md` — one per resolved epic, nothing else.

**Posture:** *creates no file, modifies no existing file, and deletes only aged raw files.* That
phrasing is used deliberately and the word "read-only" is avoided even in a qualified form, because a
default run irreversibly deletes aged raw files (Retention, below) and readers keep the adjective
while dropping the parenthesis.

**The two headline numbers — never conflated:**

```
Aggregate work time      4h 12m      (Σ llm 2h 47m + Σ tool 1h 25m)
Elapsed wall time        1h 44m      (union of span intervals + every closed run's window)
concurrency_factor       2.4×        ~2.4 spans' worth of counted work overlapping on average
```

- **Aggregate work time** is the sum of LLM span durations plus tool span durations.
- **Elapsed wall time** is a **union of time intervals, never a sum of durations**: every span's
  `[start, start+duration]` **together with the process window of every closed ledger run**. Because
  it is a union, a parent span and its nested child are counted once, a run fully covered by its
  spans adds nothing, and a run only **partly** covered contributes exactly its **uncovered
  remainder** — which is how partly instrumented runs and Codex runs that emit no spans still land in
  the figure. It is **not a critical path** in the scheduling sense, and the report never calls it
  one: the rows record which span ran *inside* which, never which sibling had to *wait for* which, so
  the data cannot support a dependency analysis.
- **`concurrency_factor` = work ÷ wall.** *Worked reading:* `2.4×` means **roughly 2.4 spans' worth
  of counted work overlapped on average** — not that 2.4 agents were working. LLM and tool spans
  overlap **within a single agent** too (a tool result streaming back mid-generation, parallel tool
  calls), so a single-agent run can score well above one. A value **below 1** is legitimate — spans
  were dropped or the sink was down — and is shown as-is rather than clamped. When wall time is zero
  or unavailable, or when no spans were collected at all, the factor is reported as **undefined**
  rather than as `0`, `∞`, or a dash.

**There is no "other time" figure, and there never will be.** `wall − llm − tool` is **banned as a
design invariant**, not merely unimplemented: parallel tool calls and concurrent agents make the
component sums **overlap**, so the remainder routinely goes **negative** — and a negative "other
time" is not a rough estimate of anything, it is undefined. `concurrency_factor` expresses the same
intuition (how much overlap there was) as a well-defined ratio. If you compute the subtraction
yourself in the CSV, you will get a confident wrong answer; that is precisely why the report exists.

**The rest of the output**, in order — headline numbers always first, so the concurrency framing
lands before you start summing sub-tables:

| Section | Contents |
|---|---|
| By phase × `agent_role` × `span_kind` | the general-purpose breakdown |
| Tool time by `tool_class` | repo **search** time and **build/test** time as separate figures |
| Top time sinks (`N` = 10, stated) | slowest spans · slowest `tool_class` · the **costliest repeated** identical tool call (repetition is the *filter*, total time the *ranking*, count shown alongside) |
| Review-loop cost per iteration | each iteration's **work time and wall time, separately labelled**, beside the configured `review.maxIterations` cap. Iteration numbers are **derived** from ledger runs sharing change id, command, phase, and agent label, ordered by start time — nothing records an iteration number |
| **Data quality** | mandatory, below |

**The data-quality footer is mandatory and is never suppressed** — every caveat appears *in the
footer itself*, so reading only the footer still shows you all of them: the **store-wide**
unattributed span count (labelled store-wide, because a record that resolved to no run belongs to no
epic — so a large count means the ledger join is broken store-wide and this epic's figures *may* be
understated), the unclosed-run count (excluded from duration aggregates, never counted as zero),
whether Codex ran **and** whether Codex telemetry is configured — two independent facts, both stated,
so "not configured" and "did not run" are never collapsed into one — which sources produced the wall
figure and how much of it came from run windows no span covered, any dropped edges / duplicate span
ids / broken cycles found while building the secondary nested-chain diagnostic, and any overlapping
review-loop runs or group that likely spans more than one loop invocation.

It exists because **a report that silently hides a broken join is worse than no report**: it converts
"I have no data" into "I have wrong conclusions". Every number in the body is only as trustworthy as
the footer says it is.

#### `/ptp:telemetry analyze` — the de-nested work breakdown

```
/ptp:telemetry analyze                     # the whole store, every day it holds
```

`analyze` answers a different question from `report`. `report` asks *"where did this epic's time
go?"*; `analyze` asks *"across everything recorded, how does de-nested leaf work divide between the
model thinking and tools running?"* Note what that is **not**: it is **not** a share of the wall
clock. Why LLM time and tool time cannot be read as a partition of elapsed time is the report layer's
**never-conflate** invariant, which `analyze` inherits **by reference** (below) and which this
section deliberately does not restate. It runs the bundled analysis engine and prints six things:
the **leaf-work split** (LLM versus tools, with wrapper spans excluded so a
parent's duration is never counted alongside its children's), the **inside-subagent versus
main-agent** split, **token burn by model**, **tool work by `tool_name`**, **bash work by command**,
and a **mandatory data-quality footer**.

**It is a subcommand, not a `report` mode**, for three reasons that are structural rather than
stylistic:

1. **It reads the raw store.** The bash-by-command table needs the raw-only `bash_command` field,
   which has no `spans.csv` column at all — and `report` is barred from ever reading `raw/`, because
   pruning bounds the raw store immediately while the CSV only catches up at the next `export`.
2. **It deletes nothing**, whereas a default `report` prunes irreversibly.
3. **It is store-wide and includes `_unattributed`**, whereas `report` is per-epic and keeps every
   `_unattributed` row out of every body figure. On a store where the ledger join has attributed
   nothing — every row `_unattributed` — an epic-scoped analysis would return nothing at all.

**Posture:** *creates no file, modifies no existing file, and **deletes nothing***. The third clause
is deliberately the opposite of `report`'s. `analyze` **may** be called read-only; `report` may not.
It takes **no selector**, resolves none, and adds nothing to the change grammar — `report` remains
the only `/ptp:telemetry` subcommand that resolves a selector. There is **no `write` keyword and no
`analyze.md`**: `report`'s file path is keyed on a resolved epic and `analyze` resolves none, so the
write is deliberately deferred rather than given an invented path.

It inherits the report layer's invariants **by reference** — work time and elapsed time are never
conflated, `wall − llm − tool` remains banned, and the data-quality footer is never suppressed —
rather than restating them, so a correction there applies here automatically.

**Not `/ptp:analyze`.** The two collide by name and by nothing else. `/ptp:analyze` is the unrelated
read-only *investigation* command: its own front door, its input is the codebase or a question, its
output is an analysis doc **written into a change folder**, and it is specified by the **`analyze`**
capability. `/ptp:telemetry analyze` is a subcommand of `/ptp:telemetry`, its input is the telemetry
raw store, its output is a breakdown **printed to the session** and it writes nothing, and it is
specified by the **`telemetry`** capability.

#### Retention

`telemetry.retentionDays` (default **30**) prunes the **raw** span store. Precisely:

- **`raw/` only, the reported epic only, `report` only.** `runs.ndjson`, `runs.csv`, and `spans.csv`
  are never pruned; the store-wide `<telemetry.root>/_unattributed/` is never pruned (it belongs to
  no epic, so a per-epic report has no mandate to delete it); and **no ptp pipeline command ever
  prunes** — deletion happens while a human is looking at the data, not as a side effect of
  `/ptp:apply`. Pruning is **always epic-level**, even when you report a single story: a raw file
  holds every story's records for that day and the raw store is append-only, so there is no
  story-scoped deletion to perform. It is the one effect of `report` that reaches wider than the
  scope you asked about.
- **The candidate rule is exact**, because the deletion is irreversible and happens by default: the
  filename must parse as the receiver's `YYYYMMDD.ndjson` form (a name that does not parse is **never**
  deleted, whatever its mtime), and its date must be **strictly earlier** than *today −
  retentionDays*, on the same UTC calendar-date basis the receiver names files by. So the boundary
  day survives, a retention of 30 keeps **30 days plus today**, and "the file the receiver is
  appending to right now is never a candidate" follows rather than being promised.
- **The `export` consequence, stated up front:** `export` is *always* a global re-derivation from
  `raw/`, so **the next `export` after a prune rewrites `spans.csv` without the pruned rows.** "The
  CSV is never pruned" is true of the pruning step and **not** of the store's eventual contents.
  Since `report` reads the derived files and never `raw/`, a prune can never change the numbers the
  same command just printed.
- A non-integer, **zero**, or negative value falls back to 30 and pruning runs on that window —
  never on the bad value, never "not at all", and never with a STOP.

#### Span telemetry: the one-time opt-in

Node is required (you already have it — `npx openspec` is a prerequisite). Then, in order:

1. **Configure** — `/ptp:config` → *Record ptp run telemetry* → `on` (optionally set
   *Telemetry receiver port* if `4318` is taken).
2. **`/ptp:telemetry setup`, once.** It renders the exact eight-key `env` block plus both
   `.gitignore` reconciliations as a diff and **writes nothing until you confirm**. (The block has
   grown twice, both times on measured evidence: from five keys to seven because
   `CLAUDE_CODE_ENABLE_TELEMETRY=1` turns collection on, but the OTel SDK still has to be told to use
   OTLP — recorded in the change's spike outcome; then to eight because `OTEL_LOG_TOOL_DETAILS` is
   what makes the Bash command text available for `tool_class` bucketing — without it the CLI emits
   no tool-parameter attribute at all.) On confirmation it writes
   `<repo>/.claude/settings.local.json` (never the shared `settings.json`, never your user-global
   settings), preserving every other key.
3. **Restart Claude Code.** `settings.local.json`'s `env` is applied at process start, so the session
   that ran `setup` cannot emit spans. Until you restart, the preamble advises the restart rather than
   starting a receiver nothing would feed.
4. **Do ptp work.** From then on the receiver **auto-starts by itself** on the first ptp command that
   routes its main work through `ptp-run-at-model` — there is no per-epic `start` step.
5. **Read `openspec/telemetry/<epic>/spans.csv`** — current mid-run, no export step needed.

`start` / `stop` / `status` remain the manual override. **`setup` is never automatic**, because it
writes a Claude Code setting; the auto-start writes none. To opt back out: set `telemetry.mode=off`
(which disables the auto-start), and run `/ptp:telemetry stop` to take down a running receiver —
**nothing auto-stops it**, since no ptp step observes session end. An auto-started receiver's
provenance (`started_by=auto`) and start time are recorded in the lockfile and reported by `status`.

#### The ingestion credential

`setup` mints a per-store token into `<telemetry.root>/.ptp-telemetry-credential` — **created once
and reused** by every later `setup`, so re-running it never invalidates an already-configured
session — and sends it as `OTEL_EXPORTER_OTLP_HEADERS=x-ptp-store-token=<token>`. It is gitignored
by the store's managed `.gitignore`; **do not commit or share it**.

The receiver **rejects every batch that reaches its write path** without a matching credential — no
raw line, no CSV row, no `_unattributed` record — which is what keeps a second repository's exporter
out of this store. (A batch stopped by the earlier `telemetry.mode` or port-drift gate is accepted
and *discarded* rather than rejected; nothing is written either way.) A store with no credential file
at all rejects everything, rather than reading a missing credential as "no check configured".
A mismatch is why the auto-start preamble may advise re-running `setup` plus a restart; `status`
reports the verdict without printing the value.

#### Codex telemetry: the second, separately-consented step

`codex exec` is a large share of review time under the default `codex.mode=auto`, and it is a separate
OS process with its own session identity — so the Claude-side setup above collects nothing from it.
`/ptp:telemetry setup` therefore has a **second step, consented separately**. Declining it leaves
Claude-side telemetry working exactly as before.

1. **Confirm the Codex step.** On confirmation ptp writes **one repository-scoped file**,
   `<telemetry.root>/.ptp-codex-telemetry-consent.json`, recording that you consented and to what. It is
   **not** a Codex configuration file — **no Codex configuration is written anywhere**, and **nothing is
   written to any user-global path**. (That is the whole point: one user-global file would hold one
   endpoint and one credential while stores, ports, and credentials are per repository, so a second
   repository's setup would redirect the first.)
2. **What it authorizes.** While that record says consent was given, ptp appends per-invocation
   `-c otel.*` arguments to the `codex exec` invocations it constructs **in this repository** — the log
   exporter aimed at `http://127.0.0.1:<telemetry.port>/v1/logs` (the **full** path; Codex posts to the
   configured URL verbatim), plus `otel.environment=<run_id>` as the join key. The trace exporter is
   **opt-in** — one trivial turn emitted 932 spans, almost all Rust internals, while the log signal
   carries the timing. **No metrics exporter is ever configured**: the receiver serves `/v1/traces` and
   `/v1/logs` only, so metrics are out of scope for this layer rather than an emptied column.
3. **The credential rides on the command line.** Those arguments carry the store's existing
   `x-ptp-store-token` — reused, never re-minted, and **never shown**: the diff and `status` report its
   presence and a match verdict, never its value. **The exposure that redaction does not cover is
   stated plainly:** the `-c otel.*` arguments are visible in **any process listing** and in **Codex's
   own session record**. The consent record itself carries only a one-way fingerprint, never the token.
4. **What blocks it.** Only the absence of `<telemetry.root>/.ptp-telemetry-credential` — never a
   declined Claude-side write, since the credential is minted once and reused. With no credential the
   step reports that it cannot produce a working configuration, writes nothing, and mints nothing.
5. **No restart needed.** Unlike the Claude-side `env` block, the wiring is per-invocation, so it takes
   effect on the next `codex exec` ptp runs.

To opt back out, delete `<telemetry.root>/.ptp-codex-telemetry-consent.json` (or set
`telemetry.mode=off`). Either way the `codex exec` command line returns to byte-identical, Codex keeps
running exactly as before, and only the row set changes.

**Codex telemetry adds no ptp gate.** `codex.mode` remains the **only** authority over whether Codex
runs. The consent record decides only whether telemetry wiring is *appended* to an invocation
`codex.mode` already decided to make, so the two can never disagree about whether Codex ran — a run
without consent simply produces no Codex rows. A second authority over *whether Codex ran* is exactly
what is refused here, because when it disagrees with the first you get a report that confidently shows
zero Codex time while Codex ran normally.

**How Codex rows are attributed.** Positively, never by elimination. Codex stamps
`service.name = codex_exec` on every record (Claude Code stamps `claude-code`), and ptp routes on that,
per **trace group**, requiring **unanimity** — a group where the values differ, or where only some
members carry it, goes **wholly** unattributed rather than being routed on its positive members. The
group is then joined to its `cli=codex` ledger run by the `run_id` the wiring transported, with the
run's window as a **consistency check**; a mismatch between the two is recorded, never guessed at.
`agent_role` comes from the **ledger**, never the span, so the read-only reviewer stays `codex` and a
`main=codex` implementer stays `main` — nothing in a Codex span distinguishes them.

**The degradation table.** Every row degrades a row set; **none degrades a ptp command.**

| State | What you get |
|---|---|
| `codex.mode=off`, or `auto` with `codex` absent | No Codex process, so **no Codex rows** — and the skip is always **stated**, never silent |
| `codex.mode=required` with `codex` absent | Exactly today's behavior (the command STOPs and tells you to install Codex or change the mode). No window, no rows |
| Codex runs, telemetry not configured (no consent recorded) | The **run ledger still brackets the process**, so the wall time survives and `/ptp:telemetry report` presents it |
| Codex runs, configured, but the **credential is rejected** | Same as above — and **this is the one that looks identical to success from outside**, because the receiver rejects those batches without leaving even an `_unattributed` record. That is why `status` checks the credential |
| `codex mcp-server` | ptp does not use it and configures no telemetry for it — **out of scope**, and nothing stronger is claimed |
| Metrics | **Out of scope for this layer**, not a lost signal: no metrics exporter is configured at all |

**Known gaps, escalated rather than papered over.** `cost_usd` is **empty on every Codex LLM row** —
Codex emits token counts and no cost, and an exhaustive sweep of every captured record found no
cost-bearing key. Token counts *are* populated. `tool_class` derives `other` for Codex rows, and a Codex
span name outside the recorded catalogue maps to `span_kind=other` with its raw name kept.

#### `/ptp:telemetry status` — the Codex preflight

`status` adds four **read-only** checks: whether `codex` is on `PATH` (a filesystem lookup — it **never
invokes Codex**), whether the consent record is present, whether its endpoint still matches the resolved
`telemetry.port`, and whether its credential still matches the store's (a **match verdict with neither
value printed**). Checks three and four exist for one silent failure reached two ways: changing
`telemetry.port` after setup leaves a **stale endpoint**, and a missing credential makes the receiver
reject every batch — either way Codex spans just stop arriving with no error anywhere.

The verdict is scoped honestly. All four read `PATH` and files and none observes a batch, so a
fully-matching result reports **configured; delivery not verified** — never that Codex is emitting or
that the receiver is accepting. An absent `codex` is reported as absent with the rest marked not
applicable, without erroring. `status` starts no Codex process and writes no file.

#### `spans.csv` — 26 columns

| # | Column | # | Column | # | Column |
|---|---|---|---|---|---|
| 1 | `schema_version` | 10 | `session_id` | 19 | `end_ts` |
| 2 | `epic` | 11 | `trace_id` | 20 | `duration_ms` |
| 3 | `change_id` | 12 | `span_id` | 21 | `success` |
| 4 | `command` | 13 | `parent_span_id` | 22 | `error` |
| 5 | `phase` | 14 | `span_kind` | 23 | `input_tokens` |
| 6 | `agent_role` | 15 | `tool_name` | 24 | `output_tokens` |
| 7 | `agent_label` | 16 | `tool_class` | 25 | `cost_usd` |
| 8 | `cli` | 17 | `model` | 26 | `notes` |
| 9 | `run_id` | 18 | `start_ts` | | |

`span_kind` separates LLM time from tool time (`llm_request`, `api_request`, `tool`,
`tool.execution`, `tool_result`, `interaction`, `other`). `tool_class` buckets tool rows into
**`search`**, **`read`**, **`write`**, **`build_test`**, **`git`**, **`agent`**, and **`other`** — so
repository search is separable from builds and tests even though both arrive as `Bash`. The
derivation rules live in one place, `skills/ptp-telemetry/SKILL.md`; a misclassification is repaired
by fixing them and re-running `export`, never by re-collecting spans. Same hygiene as `runs.csv`:
RFC-4180 quoting, UTF-8 with BOM, CRLF.

#### The alternative sink

ptp ships a bundled Node receiver because Claude Code emits OTLP as **JSON** (verified by a spike
recorded in the change folder). If you would rather run a real collector, an `otelcol-contrib` with a
`file` exporter plus a continuously running flatten step is a supported alternative: **the store
layout, the run ledger, the CSV schema, and everything downstream are identical under it** — only the
receiving process differs. The flatten step must run *continuously* (not on `export`), or `spans.csv`
stops being current mid-run.

### Return to master

**`/ptp:master`** — return to a clean, up-to-date `master`. Switches to `master` and fast-forward-pulls (`git pull --ff-only`), but **only when the working tree is clean** (no staged, unstaged, or untracked changes). On a dirty tree, it makes no git changes and reports the `git status --porcelain --untracked-files=all` output with a recommendation to commit or stash first. Use this after a change is merged and archived to get back to a clean master before starting the next change. This command is **exempt from `ptp-branch-guard`** (it intentionally lands on master, not leaves it).

### Shipping — `/ptp:deploy`

**`/ptp:deploy`** — the terminal "ship it" step. From the current feature branch: commit →
push → open a PR → squash-merge to `master` → delete the branch → run the project's deploy
CI/CD action → autonomously fix conflicts/CI/deploy failures within a bounded retry budget
(`deploy.maxFixRounds`, default 3) → return to a clean `master` via `/ptp:master`. The one ptp
command that deliberately commits, pushes, and merges. It **never self-approves** (GitHub forbids
approving your own PR) and merges straight through unless branch protection *requires* an
approving review. Refuses to run on `master`/`main`. Requires the `gh` CLI authenticated. Tuned by the
`deploy` config block.

**`/ptp:deploy-pr-approved`** — finishes a `/ptp:deploy` that stopped because the repo *required*
an approval it couldn't provide itself. After a *different* collaborator approves the PR, this
merges, deploys, and returns to `master`.

**`/ptp:merge-to-master`** — the same pipeline as `/ptp:deploy` but **skips the deploy CI/CD
action** by design: commit → push → open a PR → squash-merge to `master` → delete the branch →
return to a clean, up-to-date `master` via `/ptp:master`. Use this for repos with no deploy
workflow, or when you want to merge without triggering a deploy. Refuses to run on
`master`/`main`. Never self-approves. Requires `gh` authenticated. On an approval-required
stop, have a collaborator approve and re-run `/ptp:merge-to-master` (idempotent).

**`/ptp:archive-and-deploy`** — archive each resolved change through the existing archive gates in story order, then — only if every archive succeeded — run the deploy pipeline once on the current feature branch. Accepts a selector (including `epic:all`). Refuses to run on `master`/`main` and does not cut a branch. Never self-approves a PR.

**`/ptp:deploy-master`** — deploys the current `master` by triggering the project's deploy CI/CD
action (honoring `deploy.workflow`/`deploy.inputs`) **without** commit, push, PR, or merge. The
inverse of `/ptp:deploy` (which ships a feature branch): use this when `master` is already in the
desired state and you just want to re-trigger the deploy action. Refuses to run off `master`/`main`
or on a dirty working tree. Reads the same `deploy` config block as `/ptp:deploy`, but only the
`workflow`/`inputs` keys apply (no merge, so `mergeMethod`/`maxFixRounds` are irrelevant). Requires
the `gh` CLI authenticated. This command is **exempt from `ptp-branch-guard`** (it intentionally
operates on master, not a feature branch, and authors no artifact).

---

## Skills

Skills are invoked by Claude automatically (via the `Skill` tool) when the flow calls for them — you don't invoke them directly. Most are *shared protocol* extracted so the commands stay thin and consistent.

| Skill | Role |
|-------|------|
| `ptp` | Meta-skill. Routes a non-trivial change to brainstorming/planning/review (Superpowers) and durable artifacts (OpenSpec). Decides the role split. |
| `ptp-prd` | PRD-authoring protocol behind `/ptp:prd`. Owns selector-to-epic projection (additive layer on top of `ptp-change-selector`), `ptp-run-at-model` at `opus.high`, Phase-0 prd-taskmaster backend detection, epic-context pre-load, `prd:generate` invocation and output relocation to `openspec/changes/<id>/prd.md`, and the inline auto-degrade fallback. |
| `ptp-change-selector` | Single source of truth for the change-id format, the `epic:`/`story:` selector grammar, resolution, and epic allocation. |
| `ptp-branch-guard` | The "are we on a feature branch, not `master`?" preamble every write-capable command runs first. |
| `ptp-branch-prep` | Minimal git prep invoked by the guard when HEAD is `master`: stash → checkout master → pull → cut a fresh feature branch. Never commits or pushes. |
| `ptp-run-at-model` | Single source of truth for running a command's work at a deterministic model+effort: spawns one foreground subagent at a caller-named target model (effort injected as a prompt directive), runs the work there, and relays the subagent's terminal result. |
| `ptp-full` | Orchestrates `/ptp:full` — the plan phase, the plan-convergence gate, and the seam into the apply phase. |
| `ptp-full-apply` | The workflow-backed sequential `apply → review-full` per-story engine behind `/ptp:full-apply`. |
| `ptp-review-brainstorm` | The brainstorm-review rubric/protocol the thin `/ptp:review-brainstorm` command delegates to: locate the brainstorm (change-scoped preferred, deterministic general fallback), the rubric, Critical/High/Medium/Low classification, the PASS/WARN/FAIL verdict, the report + next-step — read-only, no `openspec validate`. |
| `ptp-review-brainstorm-full` | The dual-reviewer **report-only** brainstorm-review contract the thin `/ptp:review-brainstorm-full` command delegates to: composes the `ptp-review-brainstorm` rubric for Phase 1 (Superpowers), gates Phase 2 on a located brainstorm, runs a Phase 2 Codex closed-book read-only pass (mode-gated per `ptp-codex-mode`), and emits the combined verdict — no inline fixing, no iteration cap, no `openspec validate`, never edits the brainstorm. |
| `ptp-brainstorm-full` | Two-phase brainstorm → dual-reviewer-review orchestration behind `/ptp:brainstorm-full`. Receives the already-allocated id, resolved `codex.mode`, and branch-guard from the command's outer session. Phase A: `ptp-run-at-model` at `opus.high` runs brainstorm steps 2–7 (producing `brainstorm.md`; step 8 STOP suppressed). Brainstorm-gate: missing `brainstorm.md` → STOP. Phase B: `ptp-run-at-model` at `opus.high` runs `ptp-review-brainstorm-full` with pre-resolved `codex.mode`. Relays all four terminal states accurately. |
| `ptp-review-prd` | The PRD-review rubric/protocol the thin `/ptp:review-prd` command delegates to: locate the epic PRD via the `ptp-prd` selector→epic projection + `<slug>`-from-lowest-story rule, the rubric (schema completeness, testable acceptance criteria, requirements→goals tracing, scope/non-goal consistency), Critical/High/Medium/Low classification, the PASS/WARN/FAIL verdict, the report + next-step — read-only, epic-scoped, no `openspec validate`. |
| `ptp-review-prd-full` | The dual-reviewer **inline-fix** PRD-review contract the thin `/ptp:review-prd-full` command delegates to: Phase 1 Superpowers `kind=prd` loop (driving `ptp-review-loop`, `deferMarker=true`), the convergence-based Phase-1-gates-Phase-2 gate, Phase 2 Codex `kind=prd` loop (mode-gated per `ptp-codex-mode`, `deferMarker=true`), a single combined marker write to `openspec/changes/<id>/reviews/prd.json`, and the combined terminal state — edits the PRD inline, no `openspec validate`, never archives/commits/regenerates the PRD. |
| `ptp-prd-full` | Two-phase PRD author → dual-reviewer-review orchestration behind `/ptp:prd-full`. Receives the resolved epic, original selector, and resolved `codex.mode` from the command's outer session. Phase A: `ptp-run-at-model` at `opus.high` runs `ptp-prd` (writing `openspec/changes/<id>/prd.md`; the `/ptp:prd` STOP suppressed). prd-gate: missing `openspec/changes/<id>/prd.md` → STOP. Phase B: `ptp-run-at-model` at `opus.high` runs `ptp-review-prd-full` with pre-resolved `codex.mode`. Relays all five terminal states accurately; epic-scoped, no `openspec validate`, never archives/commits/re-resolves the epic. |
| `ptp-review-loop` | Shared review→confirm→fix loop protocol (kind ∈ {code, artifact, brainstorm, prd}, reviewer ∈ {superpowers, codex}) behind every `-loop` command, with rejection carry-over and manual/test-only filtering. The `prd` kind targets `openspec/changes/<id>/prd.md` (change-folder co-location, no `openspec validate`, marker `openspec/changes/<id>/reviews/prd.json`). |
| `ptp-telemetry` | The shared **substrate** under the opt-in telemetry surface, reached through the surviving thin router `/ptp:telemetry` and through the seven leaf commands below: `telemetry.mode`/`telemetry.root`/`telemetry.port`/`telemetry.retentionDays` resolution, the per-epic store layout and its git policy, the append-only NDJSON run ledger and its CSV dual-write, the mint-once-then-propagate `run_id` rule, the append protocol, the gate-and-never-fail ordering and the four write points that apply it — and the span substrate: the loopback OTLP receiver with its identity/health wire contract, ingestion credential, and append-only immutable raw store, the 26-column `spans.csv` with the OTel-attribute and `tool_class` mapping tables, the ledger join, the eight-key telemetry `env` block, the two never-conflated headline figures and the banned wall-minus-components subtraction, the mandatory data-quality footer obligation, the sink lifecycle and lockfile contract, the auto-start preamble `ptp-run-at-model` invokes, and the Codex ingestion layer. Section numbers are frozen and a retired-section map names the leaf that owns each extracted section. Each subcommand's own methodology lives in its leaf skill. |
| `ptp-telemetry-status` | The read-only `status` report — the resolved configuration, the environment and receiver preflight, the lockfile verdict, the Codex preflight, and the per-epic run counts. Driven by `/ptp:telemetry-status` (and `/ptp:telemetry status`). |
| `ptp-telemetry-report` | The `report` methodology — selector delegation and the literal `write`-keyword strip, the derived figures, the breakdowns and top-N sinks, the per-iteration review view, the footer items, the write posture, and `telemetry.retentionDays` pruning. Driven by `/ptp:telemetry-report` (and `/ptp:telemetry report`). |
| `ptp-telemetry-analyze` | The `analyze` methodology — the de-nested LLM-vs-tools work breakdown over the raw store, its arithmetic and nesting rules, its no-selector posture, and its own mandatory footer. Driven by `/ptp:telemetry-analyze` (and `/ptp:telemetry analyze`). |
| `ptp-telemetry-setup` | The confirm-first, one-time Claude Code telemetry opt-in — the rendered diff, the merge semantics, the consent scope, and the refusals. Driven by `/ptp:telemetry-setup` (and `/ptp:telemetry setup`). |
| `ptp-telemetry-start` | The manual receiver `start` action — the ordered start sequence, the identity-not-occupancy idempotence decision, and its outcomes. Driven by `/ptp:telemetry-start` (and `/ptp:telemetry start`). |
| `ptp-telemetry-stop` | The manual receiver `stop` action — the verify-before-signal ordering, its outcomes, and its posture. Driven by `/ptp:telemetry-stop` (and `/ptp:telemetry stop`). |
| `ptp-telemetry-export` | The global `export` action — the one-command re-derivation of every `spans.csv` from the raw store, its determinism and ordering rules, and its refusal while a receiver is live. Driven by `/ptp:telemetry-export` (and `/ptp:telemetry export`). |
| `ptp-parallel-fanout` | Owns the contract under which a ptp command MAY run several `ptp-run-at-model` main runs concurrently instead of one at a time — the four safety conditions every caller must establish before fanning out, the layered resolution of `parallel.mode` and `parallel.maxConcurrency`, the effective-decision rule combining config with the per-invocation `parallel:on|off` token, the cap's batching semantics, the deterministic ascending-change-id aggregation rule, the join-then-gate rule, and the reserved dependency-wave variant. A pure prose contract in the single-source-of-truth pattern of `ptp-branch-guard` (branch safety), `ptp-codex-mode` (the reviewer gate), and `ptp-agent-roles` (role resolution): it spawns nothing, runs no git, probes no CLI, and edits nothing. Defined by `0034_01`, which performs no consumer wiring; first consumed by `0034_02` (plan-multiple fan-out), then `0034_03` (full-plan fan-out). |
| `ptp-backlog` | Owns the epic backlog **board** contract — the store being one GitHub Projects v2 board per repository (resolved through `ptp-github-projects-mcp`, with no local backlog file, no second store and no fallback), the membership rule, the ten-field entry model and its tolerant read, the mapping of those ten slots onto six board carriers (the two required custom fields `Backlog ID` and `Status`, the card's title and body, and the board's own stamps) with the status option table, the sentinel-fenced metadata block and its malformed-body boundaries, and unknown-key preservation in both scopes, the `ptp-backlog-version:` marker and its gate (an absent marker reads as v1), the read-only read protocol with its configuration-completeness-then-preflight precondition, its returned handle table and its degraded scope, board-derived `BK-NNNN` id allocation with its complete-fetch precondition and the numeric-ordering rule, the validator and its fixed five-code problem vocabulary with the fatal/structural split and the narrower writer-eligibility rule, and the fixed five-code problem vocabulary with the distinct `unreachable-store` outcome and the honest-failure rule, and the ready-set definition — the `pending` entries in ascending backlog-id order — with its order deterministic over the produced document. A pure prose contract in the single-source-of-truth pattern of `ptp-branch-guard` (branch safety), `ptp-codex-mode` (the reviewer gate), `ptp-agent-roles` (role resolution), and `ptp-parallel-fanout` (fan-out safety) — it reads nothing on its own, writes nothing, and edits nothing. Also owns the **status transition table** — eight rows, each naming its performer — with its three guards (the gated `blocked → pending` reset that retains the prior attempt's `changeEpics`, the `any → cancelled` guard, and **guard 3**'s `blocked → done` resume row, available only as the direct, same-invocation result of `/ptp:backlog-continue`'s own review-full → archive sequence settling every recorded prefix — never as a standalone disposition, so recovery still never yields `done`), and the **recovery-and-reconciliation machinery** every writer that settles a stale `in-progress` entry runs: the stale definition and its deliberately conditional wording, the single change-prefix-set definition both the `runBaseline` snapshot and the reconciliation diff cite, the additive-only reconciliation, the gate, the availability table and the disposition outcomes (`claim` / `disown` / `rerun anyway`, and per-prefix `promote` / `dismiss`) with their combination rules, the every-settling-edit-clears-`runBaseline` rule, and the never-yields-`done` rule. The contract was defined over a local file by `0036_01`, which ships no writer; the transitions and recovery machinery by `0036_03` alongside `/ptp:backlog-edit`, the runner in `0036_04`; the store became a GitHub Projects board in `0042_03`, which ships the read half and leaves every writer refusing. |
| `ptp-backlog-write` | Owns **how a backlog write is dispatched onto the board and what a partial failure means** — the deterministic **ordered write sequence** (existence → identity → payload → the single `status` commit) with the one justification for `status`-last stated there and nowhere else; the **status-commit invariant** that replaces atomicity, with its **backstop refusal** of any operation writing `status` on more than one entry; the **field-is-the-unit-of-planning / carrier-is-the-unit-of-dispatch** rule and the **compose-from-a-fresh-read-of-the-carrier** rule that keeps it from losing an update; the **two re-read rules** — the pre-dispatch snapshot every decision binds to, and the per-field pre-write check over exactly two field categories with **deliberately no third** — plus the **degraded-scope dispositions** derived from what the read path withholds; the **write journal** (one row per planned field, six exhaustive outcomes, six terminal verdicts); **fail-stop** with **no compensating writes** on three independent grounds; the **ambiguous-create scan** read against the snapshot's match set, the **id-less item's report-and-manual-repair obligation** (an unmanaged item blocks nothing) and the **orphan repair** split by the identity row's outcome; and the **`runBaseline`-clear dispatch decision** with its accepted residual, its two-layer detection rule and its four-part report obligation. A pure prose contract: it states obligations, performs none, and reads, writes and edits nothing. Delegates the schema, validator, writer eligibility, transition table, guards and recovery machinery to `ptp-backlog`; the field mapping and the read path to `0042_03`'s read contract; and transport and the capability preflight to `ptp-github-projects-mcp`. |
| `ptp-backlog-run` | Owns the epic backlog **runner** behind `/ptp:backlog-run` — the `rounds:{count}` per-invocation token (default 5, token-only, no config key; its grammar mechanics defined by reference to `ptp-run-at-model`'s `fast:` section), the **unwrapped outer-session execution contract** under which the runner consumes zero Agent nesting levels and is never wrapped in a `ptp-run-at-model` main run, the **recompute-after-every-epic loop** — whose **ready-set membership and ordering are referenced from `ptp-backlog`**, not described here, so the view and the runner can never disagree — the **per-epic inline `ptp-full` invocation** (the skill, in-session, with its three declared inputs and no `codex.mode`), the **halt gate** that marks a non-converged epic `blocked` and stops the whole run, the **two-write status write-back** after the take (WRITE 1 merges `changeEpics`/`attributionWarnings` while still `in-progress`; WRITE 2 persists the terminal status and is the runner's only `runBaseline` clear), the **five-step precondition order** whose three aborting steps — `codex.mode`, the `rounds:`/residual refusals, and the **backlog capability preflight gate** — all precede the one branch guard, the **three halt rules** for a write group that does not complete, the **five loop-terminal states** (including **`store-write halt`** at rung 0, above `halted`, and the `file-defect halt` → **`store-defect halt`** rename), and the **four-bucket terminal report** — `processed` / `halted` / **`take-failed`** / `never-started` — with each epic's `ptp-full-apply` per-slice report nested verbatim and an **every-rung listing** of entries left `in-progress`. Each of the three write points is **one write group** dispatched through `ptp-backlog-write`'s ordered sequence. |
| `ptp-backlog-continue` | Owns the halted-epic **resume** path behind `/ptp:backlog-continue` — the target-selection rule (candidate = `blocked` with a non-empty `changeEpics`; exactly one proceeds, zero or many **refuse** naming what was found, with no invented tie-break because the file persists no attempt boundary), the **bare/issue-text split** as the user-supplied signal, the **unwrapped outer-session execution contract** that keeps `/ptp:review-full`'s, `/ptp:archive`'s, and the fix pass's spawns at one nesting level (and `/ptp:archive`'s interactive confirmations reachable), the **bare flow** (per-prefix folder lookup with an absent folder skipped rather than failed, checkbox sign-off, re-verification before that sign-off is trusted, the review-full convergence gate including the `ptp-codex-mode` mode-skip success state, archive under its own unweakened gates, then the single `blocked → done` write once **every** prefix has settled — with the sign-off documented as durable and the retry shape idempotent), the **issue-text fix pass** that transitions nothing and re-checks no manual-only box, and the four terminal report shapes. Delegates the file contract and the transition table's row 8 / guard 3 to `ptp-backlog`, branch safety to `ptp-branch-guard`, the reviewer gate to `ptp-codex-mode`, spawn-and-relay to `ptp-run-at-model`, and review/archival to `/ptp:review-full` and `/ptp:archive`. |
| `ptp-github-projects-mcp` | Owns the GitHub-Projects backlog **transport contract** and the `backlog.*` **configuration schema** — the layered, forgiving per-key resolution of `backlog.mcpServer`, `backlog.projectOwner`, and `backlog.projectNumber` with its once-on-the-combination completeness verdict and its set-but-invalid-server carve-out, the tool-namespace derivation rule and its no-fuzzy-matching absolute, the closed two-tier eight-tool Projects v2 required set, the once-per-invocation capability preflight and its three verdicts (`ready` / `read-only` / `unavailable`), the preflight record every consumer reads, and the fixed non-silent STOP-message shape. A pure prose contract in the single-source-of-truth pattern of `ptp-branch-guard` (branch safety), `ptp-codex-mode` (the reviewer gate), `ptp-agent-roles` (role resolution), `ptp-parallel-fanout` (fan-out safety), and `ptp-backlog` (the backlog board contract): it reads no file on its own, writes nothing, runs no git, and edits nothing. Defined by `0042_02`; **first consumed by `0042_03`** (the read path — which resolves the keys, runs the preflight, reads the namespace and verdict from the record, and renders that verdict in `/ptp:backlog`'s header), then `0042_04` (the write path and wiring). |
| `ptp-archive-force` | The gate-bypassing archive engine behind `/ptp:archive-force` (still syncs delta specs). |

The `openspec-*` skills (`openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`) back the experimental `opsx:` commands.

---

## Quick-reference card

```
Hand it the whole thing (autonomous, dual-reviewed; Codex optional — codex.mode, default auto)
  → /ptp:full "<request>"             # decompose → plan → dual plan-review
                                      #   → apply → dual code-review, per story
  → /ptp:full-plan "<request>"        # planning half only (read-only)
  → /ptp:full-apply [selector | id …] # execution half only (apply + review-full)

Drive it step by step
  → /ptp:prd [<sel>]                  # optional: epic-scoped PRD before brainstorm/plan (auto-degrade)
  → /ptp:review-prd [<sel>]           # optional: read-only PRD-quality gate (PASS/WARN/FAIL, no validate)
  → /ptp:review-prd-full [<sel>]      # optional: dual-reviewer inline-fix PRD loop (no validate)
  → /ptp:prd-full <sel>               # optional: PRD author + dual-reviewer review in one flow
  → /ptp:analyze "<subject>"          # optional: diagnose first, no change produced
  → /ptp:brainstorm "<request>"       # optional: think first, interactive
  → /ptp:review-brainstorm <sel>      # optional: read-only brainstorm-quality gate (PASS/WARN/FAIL)
  → /ptp:review-brainstorm-full <sel> # optional: dual-reviewer read-only brainstorm audit
  → /ptp:brainstorm-full "<request>"  # optional: brainstorm + dual-reviewer review in one flow
  → /ptp:plan [change-id]             # autonomous: design + spec artifacts
  → /ptp:review-plan-full <sel>       # optional: dual-reviewer plan audit
  → /ptp:apply <selector>             # implement tasks one by one
  → /ptp:review-full <selector>       # dual-reviewer code loop to convergence
  → /ptp:archive <selector>           # gate-enforced archive + spec sync

Big change (needs splitting)
  → /ptp:plan-multiple <request>      # decompose → run /ptp:plan per slice

Single-reviewer / manual variants
  → /ptp:review <sel> | /ptp:review-loop <sel>
  → /ptp:review-plan <sel> | /ptp:review-plan-loop <sel>
  → /ptp:review-fix [sel]

Codex second opinion (explicit opt-in; needs codex on PATH)
  → /ptp:codex-review[-loop] <sel>
  → /ptp:codex-review-plan[-loop] <sel>
  → /ptp:codex-review-uncommitted [sel]

Diagnose before deciding
  → /ptp:analyze "<subject>"          # read-only investigation → analysis doc

Plugin version and update
  → /ptp:version                        # read-only: installed vs. latest verdict
  → /ptp:update                         # update ptp@ptp + restart caveat

Where am I / what model
  → /ptp:status [change-id]
  → /ptp:effort <change-id>

Epic backlog
  → /ptp:backlog                                     # the board: entries, statuses, ready set, stale flags, validation problems
  → /ptp:backlog-add "<epic request>"                # autonomous: one new entry, no other entry touched
  → /ptp:backlog-edit <BK-NNNN> "<what to change>"   # fields, transition table, crash recovery
  → /ptp:backlog-run [rounds:{count}]                # ready epics through /ptp:full, 5 per run, halts on non-convergence
  → /ptp:backlog-continue ["<what went wrong>"]      # finish the halted epic (bare) or one scoped fix pass (free text)

Run telemetry (opt-in: telemetry.mode = on) — /ptp:telemetry is a thin router; each subcommand is
also a leaf command, and both spellings reach the same skill
  → /ptp:telemetry status  | /ptp:telemetry-status  # read-only: mode, root, port, env + receiver preflight
  → /ptp:telemetry report  | /ptp:telemetry-report  # work vs elapsed time, breakdowns, sinks, quality footer
  → /ptp:telemetry analyze | /ptp:telemetry-analyze # de-nested LLM-vs-tools work breakdown over the raw store
  → /ptp:telemetry setup   | /ptp:telemetry-setup   # one-time, confirm-first Claude Code telemetry opt-in
  → /ptp:telemetry start   | /ptp:telemetry-start   # manual receiver start (auto-starts otherwise)
  → /ptp:telemetry stop    | /ptp:telemetry-stop    # manual receiver stop
  → /ptp:telemetry export  | /ptp:telemetry-export  # global re-derivation of every spans.csv (receiver stopped)

Merge to master without deploying
  → /ptp:merge-to-master              # commit → PR → squash-merge → land on master (no deploy)

Deploy master as-is (no commit/PR/merge)
  → /ptp:deploy-master                # trigger deploy CI/CD against the current master

Archive all then deploy (one command)
  → /ptp:archive-and-deploy <sel>     # archive in story order → deploy once (only if all pass)

Return to master (clean tree required)
  → /ptp:master                       # switch to master + git pull --ff-only

Force-archive (escape hatch — reports bypassed gates)
  → /ptp:archive-force <selector>

Selectors (anywhere a <sel> / change-id is taken)
  epic:all | epic:0021 | epic:0021 story:01 | story:01 | <bare-id> | (omit = all active)

Switches (in the argument text of a ptp-run-at-model-backed command, plus the full family)
  fast:on | fast:off (default off)          # model:<model>.<effort> — supported commands only

Experimental (no Superpowers layer)
  → /opsx:explore [topic] | /opsx:propose [name]
  → /opsx:apply [name]    | /opsx:archive [name]
```

---

## Version history

> **A note on `openspec/backlog.json` below.** Entries at and before **0.2.20** describe the epic
> backlog while it was a local JSON file at that path. **That store was deleted in 0.2.21**: the
> backlog now lives on a GitHub Projects board, and every mention of `openspec/backlog.json` in an
> earlier entry names the **deleted legacy store** as it stood at that release. The entries are left as
> written, because rewriting history makes it false rather than current.

| Version | Changes |
|---------|---------|
| **0.2.24** | **The `ptp-telemetry` monolith is split into one substrate skill plus seven command+skill leaf pairs, with no behavior change.** Each `/ptp:telemetry` subcommand now owns its methodology in its own skill — `ptp-telemetry-status`, `ptp-telemetry-report`, `ptp-telemetry-analyze`, `ptp-telemetry-setup`, `ptp-telemetry-start`, `ptp-telemetry-stop`, `ptp-telemetry-export` — each reachable through its own leaf command `/ptp:telemetry-<name>`. **`/ptp:telemetry` is kept**, reduced to a thin router: it holds no behavior, states no per-subcommand methodology, and dispatches to the *same leaf skill* the matching leaf command dispatches to, so the two front doors cannot diverge and every existing `/ptp:telemetry <sub>` invocation — including the hardcoded remediation strings in `scripts/ptp-otel-sink.js` and every README walkthrough — keeps working unchanged. Deleting the router was considered and rejected: it would have invalidated roughly forty shipped strings simultaneously and destroyed the only index of a seven-member family. What stays in `ptp-telemetry` is the **substrate** — config resolution, the store layout, the ledger and span records, the append protocol and gate ordering, the write points, the receiver and its wire contract, the ledger join, the eight-key `env` block, the two never-conflated headline figures and the banned wall-minus-components subtraction, the footer obligation, the sink lifecycle, the auto-start preamble, and the Codex ingestion layer. **Section numbers are frozen**: a surviving section keeps its number, a retired number is never reused and still carries a stub at its own heading, and a new **retired-section map** names for each retired number the one leaf that now owns it — which is what lets `scripts/ptp-otel-sink.js` and `scripts/ptp-telemetry-analyze.js` keep roughly 250 `§N` citations without being edited at all. Cross-file citations whose target moved were repointed by skill name with their anchor ids unchanged; citations into sections that stayed substrate were deliberately left alone. **No subcommand's behavior, posture, output, or gate changed** — only where each rule is documented. (0044_01–0044_09) |
| **0.2.23** | **Effort rubric gains a round-down trigger, separate from the model dial.** `/ptp:effort` and `/ptp:plan` both document a new `opus · medium` anchor — used when a change's blast radius or subtlety already points to `opus`, but `tasks.md` is written at a level of detail that leaves no design judgment open for the implementer — and a `sonnet · low` anchor for the equivalent case one level down. A dedicated **round-down trigger** governs the **effort dial only**: a detailed `tasks.md` lowers effort one step (`xhigh → high → medium → low`, never two steps), and is explicitly **not** reapplied to the `sonnet · low` / `opus · medium` anchor rows themselves, since the condition is already baked into those rows. The trigger never lowers the **model** dial — every model-level trigger (subtlety, cross-cutting reach, security/concurrency/migration) still resolves to its usual model regardless of how detailed `tasks.md` is — and it does not fire when the residual risk is *executional* (concurrency, invariants, security, auth, migration) rather than *decisional*. Where a change straddles two levels **and** the round-down trigger fires, the round-down wins on the effort dial and must be named in the justification; the existing round-up rule keeps governing the model dial and any straddle unrelated to task detail. `commands/plan.md`'s mirror of the rubric defers to `commands/effort.md` as authoritative if the two ever diverge. (0043_01) |
| **0.2.22** | **The epic backlog's write path ships, and every writer is wired to it.** A new **`ptp-backlog-write`** skill is the single source of truth for how a backlog write reaches a GitHub Projects board and what a partial failure means — because there is **no whole-document write at any layer under any client** (`item-edit` updates one field value per invocation, `item-create` takes only `--title`/`--body`, and GraphQL root mutations execute serially with **no transaction and no rollback**), so a write is necessarily many dispatches. It fixes a **deterministic ordered sequence** — create the item, write its `id`, write every remaining mapped field in canonical field order, then the **single** `status` write **last** — for the one reason the skill states and that no other artifact repeats. The **status-commit invariant** replaces atomicity: no `status` write is dispatched until every payload row has reached its intended value, so a partial failure never advances a status and a committed-partial state is unreachable **by construction** — a derivation pinned by a **backstop refusal** of any operation writing `status` on more than one entry. A **field is the unit of planning; a carrier is the unit of dispatch**: `0042_03`'s mapping puts five fields on the item body, so rows sharing a carrier are **one** write and share its outcome — which makes a creation **three** dispatches, makes the merge-written collections land together or not at all, and makes each carrier write **composed from a fresh read of that carrier** rather than from the snapshot, closing the lost-update hole the whole-file write used to close. **Two re-reads, and deliberately no third check**: a pre-dispatch snapshot every decision binds to, and a per-field pre-write check over exactly two categories (the merge-written collections and the commit field), with every surviving schema field accounted for in one of four buckets so no reviewer can find an uncategorized field to hang a third check on. The check is a **detector, not a lock** — the board does not enforce the transition table; ptp's writers do. Partial failure is contracted rather than discovered: a **write journal** of one row per planned field with **six exhaustive outcomes** and **six terminal verdicts** (`unresolved-create` and `unresolved-commit` exist because every alternative would be a lie), **fail-stop** at dispatch granularity, and **no compensating write anywhere** on three independently sufficient grounds. Ambiguity is resolved **by re-read, never by retry** — exact for a field write, and for an ambiguous *create* by a **complete** board scan compared against the snapshot's pre-existing match set, which is what stops the operation writing its freshly allocated `id` onto a card it never created. The **`runBaseline` question is settled**: the clear is a payload write and the settling `status` write is the commit, the accepted residual being an entry left `in-progress` with a null baseline — information-lossless by derivation, detected by a two-layer rule, and reported with the cleared value **verbatim**. Wiring: `/ptp:backlog-add` and `/ptp:backlog-edit` each change exactly one step — their persistence step; `/ptp:backlog-run` gains the write-group mapping for all three write points, a **halt before WRITE 2** on a partial link record, a new **`store-write halt`** terminal state above `halted` (because `halted` would assert a `blocked` entry that is still `in-progress`), a fourth bucket **`take-failed`**, the capability preflight as an **aborting precondition ahead of the branch guard**, a **sixth** blast-radius item — backlog status writes land on a **shared board, immediately, outside git, and are not undone by discarding the branch** — an every-rung listing of entries left `in-progress`, and the `file-defect halt` → **`store-defect halt`** rename; and `/ptp:backlog-continue`'s guarded `blocked → done` resume is mapped onto the sequence with `changeEpics` retained by **planning no row at all**, so its candidate predicate survives every partial failure and a bare re-invocation converges — with a hard rule that a failed resume write is **never** reported as a finished epic. `0042_03`'s *while the write path is unshipped* refusal is **amended, not orphaned**: its **no-fallback** guarantee (now binding the **error path** too) and its **one refusal per command** rule are carried forward unweakened, with the surviving grounds — writer eligibility, the preflight's read-only/unusable verdicts, degraded scope, and an unwritable carrier — as conditions **within** that one refusal. (0042_04) |
| **0.2.21** | **The epic backlog moves onto a GitHub Projects board — read path.** The backlog store is now **one GitHub Projects v2 board per repository**, resolved through `backlog.projectOwner` / `backlog.projectNumber` / `backlog.mcpServer` and admitted by `ptp-github-projects-mcp`'s capability preflight. Every rule that made the backlog a *file* is **deleted rather than emulated**: the location, the file schema, the `version` key, the tolerant-read/**canonical-write** serialization, the whole-file read-modify-write IO protocol, on-demand creation and never-repair-by-rewrite are gone from `ptp-backlog` and from the `backlog` capability. In their place: a **field mapping** of the ten entry slots onto **six** carriers — `id` from a `Backlog ID` text field (whose presence is what makes a card an entry), `title` from the card title, `description` from the body before a sentinel comment, `status` from the board's `Status` single-select through a fixed five-value option table, the four remaining list/prose fields from a **sentinel-fenced JSON block** in the body, and the two timestamps from the board's own stamps (board-maintained: ptp sends no value, so an in-memory `updatedAt` bump is never persisted); a **membership rule** — an item is an entry **iff** its `Backlog ID` is non-empty *after trimming*, so a hand-dragged card is an *unmanaged item*, reported and never a defect, and a typed space can never lock every writer out; **exactly two custom fields must pre-exist** (a floor, never a cap — extra fields are preserved by construction), a missing or **wrong-typed** required carrier being fatal; a **version marker** (`ptp-backlog-version:` in the project description, else its readme) whose candidate detection and value parsing are separate steps, and whose **absent marker reads as v1** — the one deliberate divergence from the file gate, justified in the skill so no later maintainer 'fixes' every pre-existing board into unviewability; **`BK-NNNN` allocation over board items** with the formula unchanged and a new **complete-fetch precondition**, because `max + 1` over a partially-fetched board silently reuses a live id; the **same five problem codes with no sixth** restated over board-shaped defects, plus a distinct **`unreachable-store` outcome** that is deliberately *not* a code and is defined as distinct **from 'no entries yet' at the level of the value returned** — three read exits, two rendering shapes, so an unreadable board can never render as an empty backlog; a **body-block grammar** whose every malformed shape is decided rather than left to a parser, where the four block-carried fields render **`unavailable` rather than empty** and the region is preserved byte-for-byte; and **degraded scope**, which withholds the ready set and the next id — reading archive reachability **only** from the preflight record's `archiveReachable` fact and never inferring it from a result set. `/ptp:backlog` renders the board: a header naming owner, number, title and URL **alongside** the preflight verdict line (installed here — the transport slice ships no rendering), a scope note for unmanaged cards, archived entries, ignored block keys and degraded scope, and an empty state that names the **board**. **All four writers refuse**, up front and non-silently, naming the unshipped **write** path alone — installed by this change, exactly one per command, with **no fallback to any local file**, because a fallback would split one backlog across two stores. **Migration — read this if you have a backlog.** The backlog now lives on a GitHub Projects board. Any existing **`openspec/backlog.json` is no longer read**, is **left on disk exactly as found** (never parsed, never migrated, never moved, never deleted), and its entries **are not migrated** — they must be **re-created on the board**. There is no importer, by design: an importer is a *writer*, and the write path is not shipped. `/ptp:backlog` emits **one** scope-note line when it sees the file, from a **presence check only** — zero bytes read, no parse, no count, no validation, no blocking. One-time board setup is two custom fields, `Backlog ID` (text) and `Status` (single select) covering the five status values; ptp creates neither. (0042_03) |
| **0.2.20** | **Remove the epic-dependency feature from the backlog entirely.** The three entry fields that held it are gone (the recognized-field count drops **13 → 10**), the inference that wrote them is deleted with them, and the validator's problem vocabulary drops **9 → 5** because the four graph-shaped codes had no remaining inputs. The `cancelled → pending` **inversion refusal** is deleted too, so the transition table's eight rows now carry **3** guards (**4 → 3**) and the `blocked → done` resume row's guard is renumbered **4 → 3**; `/ptp:backlog-edit` goes **8 → 7** steps and **4 → 3** mutation classes; `/ptp:backlog-add` now modifies **no entry other than the one it creates**; `/ptp:backlog` renders **no dependency cell**; and `/ptp:backlog-run`'s loop-terminal states drop **6 → 4**, both starvation states having become unsatisfiable. **The ready set is now simply the `pending` entries in ascending backlog-id order** — no topological pass and no satisfaction table. `blocked` survives untouched as a run-failure status, along with `/ptp:backlog-continue` and the whole recovery-and-reconciliation machinery. **Behavior change for an existing `openspec/backlog.json`:** the dependency fields it already holds are **preserved but no longer read** — they become unrecognized keys, which the unchanged unrecognized-key rule carries through every write with their names and complete values intact — so a backlog that previously ran in a dependency-derived order will now run in **id order**, and a `rounds:5` run may take five epics at once where it used to take one. Nothing is stripped, and no `version` bump is needed. (0042_01) |
| **0.2.19** | Give the telemetry analysis engine a **front door**: `/ptp:telemetry` now accepts a **seventh** subcommand, **`analyze`**, dispatched exactly as the existing six are (`commands/telemetry.md` Step 1) rather than falling through the unsupported-subcommand path. `analyze` is deliberately **not** a `report` mode — it reads the **raw** span store (the bash-by-command table needs the raw-only `bash_command` field, which has no `spans.csv` column), is **store-wide including `_unattributed`** (unlike `report`'s per-epic scoping), and **creates no file, modifies no existing file, and deletes nothing** (unlike `report`'s default irreversible pruning) — so `analyze` **may** be called read-only while `report` still never is. It takes **no selector** of any kind — no grammar, no day/session narrowing flag defined yet (any ever added would be the engine's own non-selector flag), and **never** delegated to `ptp-change-selector` — so `report` remains the one and only `/ptp:telemetry` subcommand that resolves a change selector. `analyze` inherits the report layer's never-conflate-work-with-elapsed rule, the banned `wall − Σllm − Σtool` subtraction, and the mandatory never-suppressed data-quality footer **by reference**, restating none of them. No `write` keyword and no `analyze.md` exist yet — deferred, because `report`'s file path is keyed on a resolved epic and `analyze` resolves none. `/ptp:telemetry analyze` is explicitly **not** `/ptp:analyze` — the two collide only by name; the former is specced by the `telemetry` capability, the latter by the unrelated `analyze` capability. `skills/ptp-telemetry/SKILL.md` gains one appended *Dispatch and selector posture* subsection inside its `analyze` methodology section plus two appended `## Hard rules` bullets; `report`'s argument parsing, output, and invariants are byte-unchanged. (0039_01–0039_02) |
| **0.2.18** | Make the "lowest severity worth fixing" **configurable** for plan and code reviews. A new layered parameter **`review.minSeverity`** (`low`\|`medium`\|`high`\|`critical`, default `low` — today's behavior, matched case-insensitively) sits alongside `review.maxIterations` in the `/ptp:config` registry and its resolver. The shared `ptp-review-loop` (every `-loop` command plus the `-full` orchestrators) now converges only on findings **at or above** the threshold — below-threshold findings are still reported, labelled "below threshold — not blocking convergence," but never confirmed, fixed, or counted toward the iteration cap, and the effective threshold is recorded in the loop's `reviews/*.json` marker. The `/ptp:full-apply` workflow's embedded reviewer agent (`agents/ptp-review.md`, which restates the loop inline rather than delegating) was brought to parity and now surfaces the resolved `minSeverity` in its terminal payload. Every standalone one-shot reviewer and verdict surface (`/ptp:review`, `/ptp:review-plan`, `/ptp:review-brainstorm`, `/ptp:review-prd`, the `codex-review*` commands) and the `/ptp:archive` Critical/High gate now read the same threshold — a `FAIL`/`WARN`/refusal fires only on an **actionable** Critical or High, so at the default `low` every one of those ten surfaces stays byte-identical to today. Shipped as four dependency-ordered slices under epic `0040` (config schema → loop consumption → full-apply agent parity → standalone verdicts), each independently planned, dual-reviewed, applied, and code-reviewed. (0040_01–0040_04) |
| **0.2.17** | Close the one gap `/ptp:backlog-run` + `/ptp:backlog-edit` left open: a **`blocked`** epic whose halted change has since been manually verified had no way back to `done` short of a full reset-and-replan. A new **`/ptp:backlog-continue [issue text]`** identifies the single backlog entry that is `blocked` with a non-empty `changeEpics` (refusing on zero or on more than one candidate, never guessing) and drives it one of two ways. **Bare invocation** ("I checked it, it's fine"): for every recorded change-epic prefix, in order, it checks off any remaining `tasks.md` boxes (the user's own invocation *is* the manual sign-off), re-verifies (`openspec validate --strict` plus the project's build/test suite, so a stale automated failure still surfaces rather than being waved through), drives `/ptp:review-full` to convergence, and drives `/ptp:archive` — only once **every** prefix has archived does it perform the new **guard-4** `blocked` → `done` transition, in the same invocation, as the direct proof of that review-full → archive sequence having just succeeded. **Issue-text invocation** ("I found problems"): spawns a fix-pass agent (reusing `agents/ptp-apply.md`'s TDD discipline and its no-invented-tasks rule) scoped to the same change and issue text, re-verifies, and leaves the entry `blocked` for another manual check — never touching status. `ptp-backlog`'s status transition table gains **row 8** (`blocked` → `done`, performer `/ptp:backlog-continue` only) and **guard 4**, which is never a standalone disposition independent of that same-invocation proof — `/ptp:backlog-edit` continues to refuse `blocked` → `done` unconditionally, since it has no review-full/archive machinery of its own to satisfy the guard. The command never chains into `/ptp:backlog-run` — finishing one epic is one invocation; resuming the rest of the ready set stays a separate, explicit call. (0038_01) |
| **0.2.15** | Make the epic backlog **runnable**. A new **`/ptp:backlog-run [rounds:{count}]`** takes ready backlog epics one at a time, in `ptp-backlog`'s dependency order, and runs each through **`/ptp:full`** — five per invocation by default. It is deliberately **UNWRAPPED**: it starts no `ptp-run-at-model` main run of its own or per epic and drives the `ptp-full` **skill inline**, because `ptp-run-at-model`'s *Nesting caveat* forbids naively wrapping a command whose work spawns a subagent or a Workflow and `/ptp:full` does both — a wrapped runner would make the first epic's Workflow launch throw. The new `ptp-backlog-run` skill owns the **`rounds:{count}`** token (positive-integer body, leading zeros accepted, absent → **5**, persisting nothing and adding **no** config key; one round = one epic **started**, so a halt consumes it) with every grammar mechanic defined **by reference** to `ptp-run-at-model`'s `fast:` section, and a **residual-argument refusal** that declines `model:` as structurally impossible while declining `fast:`/`parallel:` as a v1 scope decision — `fast` fixed to `false` with no config key, `parallel` resolved once from `parallel.mode` and passed through. Preconditions run in a fixed order — `codex.mode` as a **fail-fast gate, not a hand-off** (an environment failure aborts before any entry is marked `in-progress`), the `rounds:`/residual refusals, the one-per-run `parallel` posture resolution, then **one** branch guard for the whole run — after which the file is loaded through `ptp-backlog` and the runner **declines the writer eligibility it is granted**, STOPping on every writer-eligible structural defect because it *consumes* the `dependsOn` graph rather than repairing it. The loop **re-reads and re-validates before every iteration** (no in-memory model; the detection claim scoped honestly to edits present at that read, since the IO protocol has no locking) and classifies its end into **six** loop-terminal states with `halted` taking control-flow priority — rounds exhausted, under-supply (never called clean exhaustion while an `in-progress` entry lingers), blocked-predecessor starvation (transitive, **not** a file defect), structural starvation (its exact complement, unreachable on a validated file and kept as defence in depth), halted, and the mid-run **file-defect halt**. Per epic: **WRITE 0** takes the entry with `in-progress` + a `runBaseline` snapshot cited from `ptp-backlog`'s single change-prefix definition, **WRITE 1** merges `changeEpics`/`attributionWarnings` while still `in-progress` — report-authoritative, diff-corroborating, with *absent* and *empty* reports resolved differently and provenance only ever raised — and **WRITE 2** persists `done` or `blocked`, appends one line to `notes`, and performs the runner's **only** `runBaseline` clear; the two are **never coalesced**, because the crash window between them is exactly what `/ptp:backlog-edit`'s reconciliation gate reads. The terminal report uses backlog-level buckets `processed` / `halted` / `never-started` (never reusing `applied (review pending)`), nests each epic's `ptp-full-apply` per-slice report **verbatim**, and gives its own label to the four rows that have no buckets to nest — never-started, absent report, empty report, and a plan-convergence STOP (which nests `/ptp:full`'s own report instead). Fan-out **across** backlog epics is forbidden structurally while `/ptp:full`'s per-slice fan-out inside an epic is untouched, and the v2 **inter-epic seam** after WRITE 2 is named as documentation-only with branch-per-epic explicitly rejected on the `ptp-branch-prep` stash hazard. The runner never commits, pushes, merges, archives, or deploys, and announces that blast radius before the first epic runs. (0036_04) |
| **0.2.14** | Make the epic backlog **editable and recoverable**. A new **`/ptp:backlog-edit <BK-NNNN> "<what to change>"`** takes exactly one backlog id plus a free-text instruction — counting **positional** target ids only, so an edge edit may name a second id as an operand — STOPs in the outer session (before the branch guard and before any spawn) when the id or the instruction is missing, then runs one `ptp-run-at-model` main run at `opus.high`, exactly the shape `/ptp:backlog-add` established. One invocation runs a fixed eight-step order (validate → resolve → classify → **status legality, then the recovery gate** → the user's edits → re-detection → **one** whole-file write → report) and lands **every** mutation, including every `runBaseline` clear, in that single write; a refusal at any step leaves `openspec/backlog.json` byte-unchanged (a guarantee scoped to the backlog file, since the outer guard may already have cut a branch). Validation STOPs exactly where the writer-eligibility rule obliges — any fatal problem, `duplicate-id`, a `malformed-entry` on an `id` — and **proceeds** over the five **writer-eligible structural defects**, because this is the command that repairs them; their presence in the file **as loaded** inherits the detection contract's **suppression** (the user's edit still lands, no detected edge is written, the defect is reported, and the invocation that repairs the last defect is itself detection-free), and the contract's **already-present-edge precedence** is honoured here — the only place it is reachable — so such an edge on a `done`/`in-progress` target is a silent no-op ahead of the target-status check, never a refusal. Re-detection runs **after** the user's own edge edits (so a just-rejected edge cannot be resurrected) and only when `title`, `description`, `dependsOn`, or `dependencyRejected` changed. `ptp-backlog` gains, additively, the two bodies of methodology the runner will read as well: the **seven-row status transition table with a performer column** — every runner-only row, every row absent from the table, and every no-op status write refused by name, with `done → cancelled` permitted and unconditional — with its three guards (a `blocked` reset that **retains** the prior attempt's `changeEpics` and requires a report-time-only acknowledgement; `any → cancelled`, carrying that same acknowledgement from `blocked` and from a stale `in-progress` where it also clears `runBaseline`, with the disposition governing the ids while the cancellation governs the status and `rerun anyway` not offered; and the `cancelled → pending` **inversion refusal** with exactly two bypasses and no third path) — and the **recovery and reconciliation** machinery: the stale definition worded **conditionally** because a live run is indistinguishable on disk, the single **change-prefix-set definition** (active **and** archived, mirroring `ptp-change-selector` §4) both the snapshot and the diff cite, an **additive-only** reconciliation that skips warned prefixes and never downgrades provenance, a gate keyed on **"ids exist"** rather than "unconfirmed ids exist", the **availability table** that withholds `disown` the moment a confirmed id exists, the per-attribution outcomes of `claim`/`disown`/`rerun anyway` and the per-prefix `promote`/`dismiss`, their combination rules (`disown` + `promote` refused as self-contradictory), the rule that **every** settling edit — the ungated reset included — clears `runBaseline` in the same write, and the **never-yields-`done`** rule justified by `ptp-review-loop` writing no marker for `kind = code`, with that durable marker named as the v2 seam. Ambiguity is answered with a **refusal printing the offered dispositions**, never a question. (0036_03) |
| **0.2.13** | Lay the foundation for the **epic backlog** — a durable place to record epics *before* they become change folders — as a contract-first change that ships **no writer at all**. A new `ptp-backlog` skill owns, in one place, the whole file contract: the location `openspec/backlog.json` (a plain data file the OpenSpec CLI never reads, lists, validates, or archives, whose tracked-or-not status stays the **host repository's** decision — so ptp touches no ignore rule in either direction and **never** assumes git as a recovery mechanism), the thirteen-field v1 schema defined **in full including fields no command here writes** (a validator that rejects its sibling changes' output is worse than useless), a `version` gate that **refuses in both directions** above the supported version (a tolerant read plus a canonical write would silently discard every field a newer ptp added), a **tolerant read** requiring exactly `id`/`title`/`status` and never defaulting or coercing, a **canonical write** whose byte-stability rules extend to malformed identifiers (preserved as-is, emitted after the well-formed ones by Unicode code point) and to **unrecognized-key preservation** with data-not-lexical-form semantics, the whole-file read-modify-write IO protocol with **on-demand creation**, the **never-overwrite-an-unparseable-file** and **never-a-blind-write** absolutes, `BK-NNNN` allocation as a pure function of the file (every status counted, no persisted counter, **numeric** ordering everywhere, deliberately outside the `epic:`/`story:` selector grammar), a nine-code validation vocabulary split fatal/structural with a third, narrower **writer-eligibility** rule (a writer refuses past any fatal problem and past exactly two structural ones — a `malformed-entry` on an `id`, and `duplicate-id` — but never over the graph codes, since refusing there would leave a defective backlog unrepairable through ptp), and the **ready-set definition plus its deterministic order**, owned here rather than in the future runner because the view needs it three changes earlier and two owners would be enumeration drift. The only consumer shipped is the read-only `/ptp:backlog` view: six output sections (header, entries in canonical id order, ready set, attention, validation, recommendation), collapsing to header + validation + recommendation under a **fatal** problem with uncomputable header values rendered `unavailable` rather than guessed; a hard **ready-set suppression rule** (a ready set is shown only when no fatal and no structural problem exists, so the view can never advertise a ready set a runner would refuse) with empty-backlog and **blocked-predecessor starvation** distinguished as non-defects; and an **honestly worded** stale-`in-progress` flag that never asserts a crash, because a live run and a crashed one are indistinguishable from a file read. `/ptp:backlog` takes no argument and no selector, runs no branch guard and no `openspec validate`, is not wrapped in `ptp-run-at-model`, offers no reconciliation affordance, and **creates no file — including the backlog file itself**. (0036_01) Then the backlog gains its first **writer**: **`/ptp:backlog-add "<free-text epic request>"`** allocates an id, composes one `pending` entry whose `description` keeps the request text substantively verbatim (it is what `/ptp:full` later receives), and persists it together with every detected edge in **one** whole-file write — the write that creates `openspec/backlog.json` on demand. The same change gives `ptp-backlog` the **dependency-detection contract** every detection-invoking writer reuses unchanged: a **fixed, bounded** input set (all entry titles and descriptions in full, plus the `openspec list --specs` capability names and the active change-folder ids as **names only** — never a spec body, never a change artifact, never a source file), **mandatory both-direction** candidate proposal with a decision criterion so "evaluate everything, propose nothing" is non-conformant, a write-target filter keyed on the entry actually being written to (so a rejection recorded from one end survives an add from the other) that refuses automatic writes onto `done` and `in-progress` targets while keeping `blocked`/`cancelled` permissive on reversibility grounds, **one atomic cycle check** over the complete candidate set (per-edge validation forbidden — `X → Y` and `Y → X` are each acyclic alone), **additive-only** writes (never a removal, never `dependencyRejected`, never a status), `dependencyEvidence` as a provenance **convention rather than a file invariant**, and a **non-silent report** naming every entry modified — reverse-edge targets included — and every candidate refused with its ground. A cycle discards all candidate edges but still creates the entry; a writer-eligible structural defect suppresses detection without refusing the add. (0036_02) |
| **0.2.12** | Three non-parallel latency levers, all reached through the single `ptp-run-at-model` spawn site so no per-command duplication is needed. **(e)** Every `main=claude` spawn prompt now carries a mandated instruction to issue **independent** tool calls in one message — scoped strictly to calls that do not depend on each other's results, and never phrased as "batch everything," because batching a dependent call with the call it depends on is a correctness bug, not a latency win; it concerns tool-call shape only, never "do less work." **(f)** An **optional** caller-supplied context pass-down: when a caller has already run `npx -y openspec list` / `npx -y openspec list --specs` in its own outer session, it may hand that capture down verbatim, and the subagent uses it instead of re-running the listing — subject to a two-trigger staleness rule (re-derive if the run itself created/moved/deleted anything under `openspec/changes/`, or if it needs information the snapshot lacks) plus a **supplier-side** obligation: a caller must not hand down a capture its own flow already invalidated through a sibling run, because the consumer's triggers are self-scoped and cannot see a sibling's writes. `/ptp:plan-multiple` is the only caller wired as **passer-down** — it hands its beat-1 capture into the beat-2 decompose run, then (**split path only**) re-captures once, after that run deletes the monolithic change folder, before supplying the beat-3 per-slice `/ptp:plan` members — at most **four** `openspec` invocations **in the outer session** regardless of slice count, never one per member. Because the supplier rule is absolute, that capture is supplied only to members started **before any member has written** (the first batch when fanning out, the first member when serial); every later member is simply given no snapshot and loads context exactly as it does today, so the saving is real but **bounded** rather than one capture serving every member. `/ptp:plan` and `/ptp:brainstorm` are wired as **consumers** — snapshot-first when supplied, run-the-listing themselves when not — preserving each command's existing posture (`brainstorm.md` step 2 still loads unconditionally; `plan.md`'s brainstorming still only **MAY** load); `/ptp:brainstorm` has no supplier today, so its wiring is recorded as groundwork rather than a realized saving, and a standalone `/ptp:plan` or `/ptp:brainstorm` invocation is unchanged apart from the universal (e) instruction. `ptp-run-at-model` itself never runs `openspec list`; pass-down is opt-in per caller. **Target selection:** a new "Choosing a target" rule states the principle once — name the cheapest model that suffices for the *work*, never for the command's importance, following the existing `ptp-branch-prep`-at-`haiku` precedent — paired with a hard prohibition on ever downgrading a step that carries judgment (planning, decomposition, review, or any step whose output another step trusts without re-checking). An audit of the existing spawn sites against that rule found a **nil** result — `ptp-branch-prep` is already pinned to `haiku`, and `ptp-workflow-cache-heal` and `plan-multiple`'s cross-reference verification are not agent spawns at all — recorded as a valid outcome rather than a manufactured downgrade. All three levers apply only to the `main=claude` direction; `main=codex` is unaffected. No config key added, no gate changed, no command's decisions altered. (0034_04) |
| **0.2.11** | Fan out the planning phase's **second** `N ×` `opus.high` stage: `/ptp:full-plan` step 2 and `skills/ptp-full/SKILL.md` **Phase A** now run their per-slice `review-plan-full` members **concurrently** under the `ptp-parallel-fanout` contract, capped and batched by `parallel.maxConcurrency`. The four safety conditions are established and named where they hold — each member writes only its own slice's artifacts **and** its convergence marker under that slice's own `openspec/changes/<id>/reviews/` (there is **no** shared review store; `ptp-telemetry` appends stay `0034_01`'s closed exception), the branch guard already ran once in the outer session, results sort by ascending change id, and the gate applies after the join. Failure handling becomes **join-then-gate on the parallel path only**: every member is joined (a failed, refused, throttled, or `needs-human-action` member is recorded, never dropped), while the **serial path keeps today's fail-fast STOP** — fail-fast is an economy mechanism that is still free when runs are sequenced, the deliberate divergence from sibling `0034_02`, which unified both paths because its product is the slice set itself rather than a set of independent verdicts. Fan-out costs one property no condition names — the serial path's incidental guarantee that a dependent slice is reviewed *after* its dependencies were fixed — so a bounded **post-join cross-slice recheck** runs between the join and the gate: seed a `dirty` set from every member's fixes-applied signal (an undeterminable signal fails safe to dirty, at the seed **and** at every recheck), walk the slice set **once** in ascending change id order, give one further `review-plan-full` pass to any slice declaring a dirty dependency, and mark a recheck that itself applied fixes dirty so the walk is **transitive** (`A → B → C`) — one pass reaches a fixed point with each slice rechecked at most once and no iteration cap, because `0034_02` guarantees strictly ascending ids with no forward or self dependencies. The gate's **decision rule is stated once and identical on both paths** (every slice green — `BOTH PHASES DONE` or `PHASE 1 DONE — CODEX SKIPPED (mode=…)`; any `ITERATION CAP REACHED` / `PHASE 2 ITERATION CAP REACHED` fails it); only the join point moves, and in Phase A the apply-phase block is **strengthened** — it now sees every slice's outcome instead of short-circuiting on the first failure. One `parallel:on|off` token governs **both** plan-phase stages from **either** entrypoint: `commands/full-plan.md` and `commands/full.md` each parse and strip it once in their outer session (after the `codex.mode` guaranteed abort, before the `plan-multiple` handoff, before branch-name derivation and the branch guard, refusing an invalid or duplicated candidate before any member or subagent starts) and thread the **resolved posture** into the delegated `/ptp:plan-multiple`, which now honors a supplied posture and skips its own beat-1 parse under a single three-level precedence (supplied posture → token → `parallel.mode`) — `/ptp:full` had to parse it too, since Phase A forwards `$ARGUMENTS` and an unaware entrypoint would have fanned out planning while leaving reviewing on config. `/ptp:full-plan` and Phase A now take the slice set — ids **and** one-line scopes — from `/ptp:plan-multiple`'s **step-6 report** (now specified to expose them to an orchestrating caller), never from `openspec list` and never by parsing the internal `PLAN-MULTIPLE-*` beat sentinels. The plan-review report sorts by ascending change id, is byte-stable with respect to completion order, names every rechecked slice, keeps a mode-skipped slice visibly distinct, and states which coverage it has (parallel: every slice; serial: up to the first non-green one). The **apply phase is untouched** — Phase B, `ptp-full-apply`, `/ptp:apply`, and `workflows/ptp-full-apply.js` stay strictly sequential and receive no parallel input — and with the shipped default `parallel.mode` = `off` both entrypoints behave exactly as before, fail-fast included. (0034_03) |
| **0.2.10** | Give the fan-out contract its **first consumer**: `/ptp:plan-multiple` is restructured into **three beats** so per-slice planning can actually overlap. **Beat 1** (outer session) parses and strips the new `parallel:on`\|`parallel:off` token — before the change-id/request classification and before branch-name derivation, so an invalid or duplicated candidate refuses before a branch is cut and before anything is spawned — then allocates the epic, runs the branch guard once, and runs step 1's guaranteed-abort gather-and-gate. **Beat 2** is one `ptp-run-at-model` main run at `opus.high` (a foreground Agent-tool subagent under `roles.main=claude`, a write-capable `codex exec` run under `roles.main=codex`) that decomposes, decides split-or-fall-back, deletes the monolith **only on the split path**, and then **ends at a structured return** — a `PLAN-MULTIPLE-SLICES` sentinel plus **two or more** fixed-field `id \| depends \| scope` lines (parsed by splitting on the **first two** `\|` only, so a `\|` in the scope is literal), or `PLAN-MULTIPLE-FALLBACK` plus **exactly one** payload line. Any deviation — no sentinel, fewer than two slice lines, a malformed line, a duplicate or out-of-order id, a forward/self dependency, an empty or multi-line fallback payload — is a **refusal**, never an empty success and never a `/ptp:plan` invoked with an undefined argument. **Beat 3** moves the per-slice `/ptp:plan` loop **out of the subagent and into the outer session** — the only site that can start N members under the one-level Agent nesting rule — where it asserts the four `ptp-parallel-fanout` conditions (pre-allocated per-slice folders as each member's work product, with the shared `ptp-telemetry` store as the contract's closed exception; the guard already run in beat 1; ascending-change-id aggregation; join-then-gate), resolves the effective decision (valid token, else `parallel.mode`), and runs one main run per slice — concurrently under `parallel.maxConcurrency` when the decision is `on` and all four hold, otherwise **serially in ascending story order**. Each member is told to run `/ptp:plan`'s steps 2–6 **inline**, to **start no further main run**, that its branch guard is a no-op, and never to run `/ptp:apply`. Cross-reference verification moves after the join (a failed member that left no `proposal.md` is recorded **cross-reference-unverified**, never fabricated), and the step-6 report is **sorted by ascending change id** with content that is a pure function of the joined results plus beat-2's terminal metadata — invariant to completion order — listing **every** member outcome including failures, keeping the monolith-deletion field, and offering the `/ptp:apply <first-slice-id>` next command **only when every member succeeded**. Failure handling is **join-then-gate on both paths** (a failing member never stops the ones after it) — the one deliberate divergence from the previously unspecified serial behavior. With the shipped default `parallel.mode` = `off` the command still plans slices one at a time and produces the same slices, artifacts, and report content as before. `/ptp:full-plan`, `skills/ptp-full/SKILL.md`, `/ptp:apply`, `workflows/ptp-full-apply.js`, and `/ptp:archive` are untouched — `/ptp:full-plan` fan-out is `0034_03`. (0034_02) |
| **0.2.9** | Make concurrent planning runs *permissible* — contract first, no consumer. New **`ptp-parallel-fanout`** skill owns the whole fan-out safety contract: the **four conditions** a caller must establish before overlapping per-item main runs (write sets provably disjoint **by construction** — pre-allocated `openspec/changes/<id>/` folders qualify, shared source does not; **no member changes git state**, the branch guard having run once up front in the outer session; **order-independent aggregation** sorted by ascending change id; and **join-then-gate** gating, which keeps the safety property and knowingly gives up the economy property), plus the `parallel.maxConcurrency` cap's **batching** semantics (7 members at cap 3 → `[1,2,3]`, `[4,5,6]`, `[7]`, each batch joined before the next, one sort at the end) and a **reserved-but-unspecified** dependency-wave variant. Condition 1 is scoped to the member's **work product** with one **closed** exception — writes through the `ptp-telemetry` store's already-concurrency-safe protocols (append-only ledger, the CSV dual-write's atomic-rename header init, idempotent policy files, lazy directory creation) — admitting nothing by analogy, so a telemetry-enabled fan-out is not disqualified by its own telemetry writes. New layered `parallel.mode` (`off`\|`on`, default **`off`**) and `parallel.maxConcurrency` (integer `1..10`, default `3`) config keys with the same forgiving reader as `roles.main`; `/ptp:config` gains both (registry now **eleven** parameters, repairing the pre-existing seven-vs-nine count drift in the config spec). The `run-at-model` requirement is amended **narrowly**: one main run **per invocation** survives verbatim and only the *sequencing* of N invocations widens, with `/ptp:apply`, `workflows/ptp-full-apply.js`, and `/ptp:archive` excluded **by name** (they write shared source and the shared `openspec/specs/` tree, so they can never establish condition 1) — and `ptp-archive-and-deploy`'s never-parallel rule re-grounded in condition 1 rather than in the amended sentence. The per-invocation `parallel:on`\|`parallel:off` token is defined **by reference** to the `fast:` switch contract (only three deltas restated: it overrides `parallel.mode`, absent ≠ `off`, independent of `fast:`/`model:`) and is **parsed by no command**. Telemetry was **verified**, not modified. Deliberately inert: no command reads either key or parses the token, so with the default `off` every flow is byte-identical — the sole user-visible difference is two extra parameters in `/ptp:config`'s menu. First consumers land in `0034_02`/`0034_03`. (0034_01) |
| **0.2.8** | Close the last opaque block in the timing data: **Codex telemetry**, at the fidelity `0032_05_codex-telemetry-scope-spike`'s decision record selected — the **repository-scoped** shape, and **never a user-global Codex configuration**. The selected mechanism is the Codex CLI's **per-invocation `-c` / `--config` override carrying `otel.*` keys**, so **no Codex configuration file is written anywhere**; `/ptp:telemetry setup` gains a **second, separately-consented step** that records consent in one repository-scoped file (`<telemetry.root>/.ptp-codex-telemetry-consent.json`, managed-key replacement, refuse-don't-overwrite on an unparseable record, created only on confirmation) and authorizes ptp to append that wiring — the log exporter at the **full** `/v1/logs` path, `otel.environment=<run_id>` as the join key, the trace exporter opt-in, **no metrics exporter ever**. The store credential rides on the command line, reused and never printed, with the **process-listing and Codex-session-record exposure disclosed** rather than treated as covered by redaction. Attribution is **positive, group-scoped, and unanimous**: routing keys on the persisted `service.name = codex_exec` discriminator (persisted by `0032_07_raw-record-service-name`, whose landing satisfied the blocking prerequisite this change had correctly stopped on), never on "matches no ledger run"; a group is joined to its `cli=codex` run by the transported `run_id` with the ledger window as a **consistency check**, and partial evidence, conflicting evidence, or a correlation/window disagreement each send the **whole** group to `_unattributed/` with the observed values recorded. `agent_role` comes from the **ledger**, never the span, so the reviewer stays `codex` and a `main=codex` implementer stays `main`. Codex rows' `span_kind` now separates LLM from tool time, token counts populate, and `cost_usd` stays empty as a **named, escalated gap** (Codex emits no cost) rather than a silent one. `status` gains a four-check **read-only** Codex preflight that never invokes Codex and reports **configured; delivery not verified**. **`codex.mode` remains the only authority over whether Codex runs** — the consent record changes the row set, never the run. No field was added to the raw record or the ledger; the 26 columns are unchanged. (0032_06) |
| **0.2.7** | Turn the telemetry store into an answer: **`/ptp:telemetry report [write] [selector]`**. Two headline numbers that are never conflated — **aggregate work time** (Σ LLM + Σ tool durations) and **elapsed wall time** (a **union** of every span interval *together with every closed ledger run's window*, so a partly instrumented or span-less run contributes its uncovered remainder) — plus `concurrency_factor = work ÷ wall`, read as how much counted work overlapped on average and **never** as a count of agents. `wall − llm − tool` is **banned as a design invariant** (the component sums overlap, so the remainder can go negative), and the wall figure is explicitly **not** a critical path (the rows carry containment, not dependency). Adds a phase × `agent_role` × `span_kind` breakdown, a `tool_class` split within tool time, three top-N sinks (`N` = 10, stated — including the **costliest repeated** identical call: repetition filters, total time ranks), a **derived** per-iteration review-loop view reporting work time and wall time separately beside the `review.maxIterations` cap, and a **mandatory, never-suppressed data-quality footer** (store-wide unattributed count, unclosed runs, a two-input Codex line that states "not configured" and "did not run" as separate facts, wall-time sources and the uncovered-run share, nested-chain graph repairs, and review-loop overlap / likely-multiple-invocation flags). The report reads only the derived `spans.csv` + `runs.ndjson` — never `raw/` — and `_unattributed/spans.csv` for the footer count alone. Selector delegated wholesale to `ptp-change-selector` with **no new grammar** (the `write` keyword is stripped before the selector sees the argument). New `telemetry.retentionDays` (default 30, registry now nine parameters) prunes the reported epic's `raw/` on `report` only, by an exact `YYYYMMDD.ndjson` + strictly-earlier-than-cutoff rule — so `report` is described as "creates no file, modifies no existing file, and deletes only aged raw files", never as read-only. (0032_04) |
| **0.2.6** | Add the OTel span layer on top of the telemetry spine. A spike first confirmed Claude Code emits OTLP as **JSON**, so ptp ships a bundled Node receiver, `scripts/ptp-otel-sink.js` — a new packaging surface brought under the `.gitattributes` LF pin and the `ptp-workflow-cache-heal` CRLF glob (`scripts/*.js`) in the same change. The receiver binds `127.0.0.1:<telemetry.port>` (new key, default `4318`), accepts `POST /v1/traces` and `/v1/logs`, flattens each span/event to a 26-field record, joins it to slice 1's run ledger per **trace group** (never split, never guessed — a miss lands in `_unattributed/` with the near-miss run ids), and appends it to an **append-only, immutable, single-writer** `raw/<YYYYMMDD>.ndjson` **and** to `spans.csv` in the same breath, so the CSV is current mid-run with no export step. Gate order on every batch: `telemetry.mode` → port drift → **per-store ingestion credential** → store-policy write → appends. `/ptp:telemetry` gains `setup` (the single confirm-first exception to ptp's never-write-a-Claude-Code-setting rule — seven `env` keys in `settings.local.json`, both `.gitignore` reconciliations written before the secrets they protect), `start`/`stop` (identity-probing, self-healing lockfile, verify-before-kill), a richer `status`, and `export` (no flag, no selector — a global, deterministic re-derivation that requires the receiver stopped and writes nothing into the raw store). The receiver **auto-starts** from a shared preamble in `ptp-telemetry`, invoked from `ptp-run-at-model`'s spawn boundary, gated on `telemetry.mode=on` **and** a live matching telemetry environment; its whole permitted effect on a pipeline command is at most one non-blocking advisory line. `/ptp:config` gains `telemetry.port` (registry now eight parameters). With `telemetry.mode` off nothing starts and nothing is written. (0032_02) |
| **0.2.5** | Add the telemetry attribution spine: a new `ptp-telemetry` skill owning the whole contract (layered `telemetry.mode` / `telemetry.root` config with a forgiving reader, the per-epic store at `openspec/telemetry/<epic>/` with its own writer-created `.gitignore`/`.gitattributes`, the twelve-field append-only NDJSON run ledger, the RFC-4180 + BOM + CRLF `runs.csv` dual-write, the mint-once-then-propagate `run_id` rule, and the gate-and-never-fail ordering) plus a thin read-only `/ptp:telemetry status` command. Write points added by reference — never restating the record shape — at `ptp-run-at-model`'s spawn boundary (open after role resolution, close at the relay), the read-only `codex exec` reviewer call sites (byte-identical command line), and the `ptp-full-apply` fan-out (the sandboxed workflow measures each `agent()` window and mints its `run_id`; the launcher resolves the gate, passes a top-level `telemetry` arg, and appends the post-hoc rows; the spawned apply/review agents may append one crash-visibility open line under the injected id). `/ptp:config` gains both keys (registry now seven parameters). `telemetry.mode` defaults to `off`, under which every flow is byte-identical to before. (0032_01) |
| **0.2.4** | The workflow-backed `full` family (`/ptp:full`, `/ptp:full-apply`, `/ptp:full-plan`) now honors the per-invocation `fast:` switch — outer-session parse-and-strip after the `codex.mode` abort and before selector/request/branch handling, one preflight+announcement per invocation, resolved boolean handed to the `ptp-full` / `ptp-full-apply` skills without re-parsing, new top-level `fast` workflow arg (absent → off, so old launches are byte-identical), and an Opus-only informational note on the apply/review prompts with both agent JSON schemas unchanged. (0031_02) |
| **0.2.3** | `ptp-run-at-model` gains an optional per-invocation `fast:on` / `fast:off` switch, recognized generically by every command that references the skill (no per-command enumeration, no new config key). Two-stage detect-then-validate on a lowercase `fast:` prefix (`on`/`off` values, default off); a malformed lowercase-prefixed candidate refuses instead of falling through as absent; parse-and-strip runs before the command's own argument grammar and branch guard, independent of `model:`. Fast mode is session-scoped in Claude Code and cannot be set per spawn, so `fast:on` runs a read-only preflight over layered settings (`fastMode`, `fastModePerSessionOptIn`, `CLAUDE_CODE_DISABLE_FAST_MODE`) and announces exactly one of four outcomes in a fixed precedence order: `main=codex` no-op, non-opus-target no-op, verified-on, or a non-blocking advisory naming the outcome-specific remediation. The workflow-backed `full` family follows in slice `0031_02`. (0031_01) |
| **0.2.2** | `/ptp:prd-full` accepts the optional `model:<model>.<effort>` override token — both Phase A (author) and Phase B (review) now run at the resolved target instead of a hardcoded `opus.high`, applied uniformly to every targeted epic across both phases. Documented once in `ptp-run-at-model` (its supporting-callers sentence now lists `/ptp:prd-full`); `commands/prd-full.md` owns the outer-session parse-and-strip as precondition 2 (after the `codex.mode` guaranteed-abort, before the epic-selector resolution and the branch guard); `skills/ptp-prd-full/SKILL.md` consumes the resolved `target` without re-parsing. (0030_02) |
| **0.2.1** | `/ptp:brainstorm-full` accepts the optional `model:<model>.<effort>` override token — both Phase A (brainstorm) and Phase B (review) now run at the resolved target instead of a hardcoded `opus.high`. Documented once in `ptp-run-at-model` (its supporting-callers sentence now lists `/ptp:brainstorm-full`); `commands/brainstorm-full.md` owns the outer-session parse-and-strip as precondition 2 (after the `codex.mode` guaranteed-abort, before change-id allocation and the branch guard); `skills/ptp-brainstorm-full/SKILL.md` consumes the resolved `target` without re-parsing. (0030_01) |
| **0.2.0** | Rename `/ptp:full-run` to `/ptp:full-apply` (command `commands/{full-run.md => full-apply.md}`, skill/workflow `skills/{ptp-full-run => ptp-full-apply}/SKILL.md`) to align the "full" orchestrator name with the prior run→apply rename; updated references in `agents/ptp-apply.md`, `agents/ptp-review.md`, `commands/apply.md`, `commands/full-plan.md`, `commands/full.md`, `skills/ptp-archive-and-deploy/SKILL.md`, `skills/ptp-branch-guard/SKILL.md`, `skills/ptp-change-selector/SKILL.md`, `skills/ptp-codex-mode/SKILL.md`, `skills/ptp-full/SKILL.md`. |
| **0.1.38** | `/ptp:brainstorm` and `/ptp:prd` accept an optional `model:<model>.<effort>` override token (e.g. `model:fable.high`), recognized anywhere in the argument text, that overrides the `opus.high` default for that single invocation only — no persisted config. Token grammar is a two-stage detect-then-validate (`model:` prefix candidate, then exact `sonnet\|opus\|haiku\|fable` × `low\|medium\|high\|xhigh` match); a lowercase-prefixed but malformed candidate refuses rather than silently falling back. Documented once in `ptp-run-at-model`; `commands/prd.md` owns the parse for `/ptp:prd` (ahead of its free-text branch-name derivation and branch guard), `skills/ptp-prd/SKILL.md` consumes the resolved target without re-parsing. (0028_01) |
| **0.1.37** | Add `ptp-agent-roles` skill and `roles.main` layered-config key (default `claude`) resolving a `{ main, reviewer }` agent pair — the contract for swapping which agent (Claude/Superpowers or Codex) is the main planning/implementation agent vs. the reviewer. `ptp-review`, `ptp-run-at-model`, `ptp-codex-mode`, and the dual-reviewer orchestrators (`review-full`, `review-plan-full`, `review-brainstorm-full`, `review-prd-full`) updated to resolve roles via this skill and apply the Codex reviewer-gate symmetrically regardless of which agent plays reviewer; `ptp-config` and `effort` gain awareness of the new key. This slice (0027_01) defines the contract — no consumer performs a live role swap yet. |
| **0.1.36** | Add `codex.model` and `codex.reasoningEffort` layered-config keys, resolved by `ptp-codex-mode` (default unset, independent, forgiving reader) and consumed by a single canonical Codex invocation flag-append rule (`-m <model>` / `-c model_reasoning_effort=<effort>` appended before the trailing stdin `-`, both unset ⇒ today's exact `codex exec -s read-only -`). All 16 `codex exec` call sites now reference the rule instead of hardcoding the bare invocation. `/ptp:config` gains both keys (a new `string`-kind value-selection branch for `codex.model`, an enum branch for `codex.reasoningEffort`); README documents both. |
| **0.1.33** | Promote `/ptp:prd` to a limited/hybrid producer: a free-text argument that doesn't parse as any known selector form and doesn't match an existing active change folder is now classified as a description, a fresh epic is allocated via `ptp-change-selector` §4 (the same algorithm `/ptp:brainstorm` uses), and the PRD is authored into the new `openspec/changes/<id>/prd.md` — instead of erroring out with a "no active epics" abort. `ptp-prd`, `ptp-change-selector` (§4/§5), `commands/prd.md`, and the `prd-authoring`/`change-selector` spec deltas updated accordingly. |
| **0.1.32** | Relocate PRD artifacts into the change folder: `/ptp:prd` now writes `openspec/changes/<id>/prd.md` (where `<id>` is the epic's lowest-numbered story) instead of a standalone `openspec/prds/` folder; the `kind=prd` review-convergence marker moves to `openspec/changes/<id>/reviews/prd.json`; the `artifact_filename` stable-key becomes the constant `"prd.md"`. All PRD-family skills (`ptp-prd`, `ptp-review-prd`, `ptp-review-prd-full`, `ptp-prd-full`, `ptp-review-loop`), six commands (`prd`, `prd-full`, `review-prd`, `review-prd-full`, `codex-review-prd`, `codex-review-prd-loop`), and active delta specs (0019_01, 0021_01, 0021_02) updated to the new paths. |
| **0.1.31** | Add the PRD-stage orchestrators — `/ptp:review-prd-full` command + `ptp-review-prd-full` skill (dual-reviewer inline-fix PRD loop: Superpowers then Codex per `codex.mode`, Phase 2 gated on Phase 1 convergence, one combined epic-scoped marker, no `openspec validate`) and `/ptp:prd-full` command + `ptp-prd-full` skill (seam-free PRD author → prd-gate → dual-reviewer review in one flow). |
| **0.1.30** | Add the PRD-review family — `/ptp:review-prd` command + `ptp-review-prd` skill (read-only single-pass Superpowers PRD-quality gate), `/ptp:codex-review-prd` (closed-book Codex PRD audit), and `/ptp:codex-review-prd-loop` (Codex PRD inline-fix loop). Extend `ptp-review-loop` with a first-class epic-scoped `kind=prd` (no `openspec validate`, epic-scoped marker `openspec/prds/reviews/<epic>-<slug>.json`). |
| **0.1.29** | Add `/ptp:prd` command + `ptp-prd` skill — epic-scoped PRD authoring via prd-taskmaster `prd:generate` with graceful auto-degrade (inline fallback when plugin absent), selector-to-epic projection, `openspec/prds/` output folder, and `opus.high` subagent per epic. |
| **0.1.26** | Add `/ptp:brainstorm-full` command + `ptp-brainstorm-full` skill — seam-free union of `/ptp:brainstorm` and `/ptp:review-brainstorm-full` in one uninterrupted flow (brainstorm → brainstorm-gate → dual-reviewer inline-fix review loop). |
| **0.1.25** | Add `/ptp:review-brainstorm-full` command + `ptp-review-brainstorm-full` skill — inline-fix dual-reviewer convergence loop (Superpowers + Codex) for brainstorm artifacts; all four `-loop`/`-full` commands now drive the `ptp-review-loop` shared protocol with `kind=brainstorm`. |
| **0.1.24** | Convert `/ptp:review-brainstorm-full` to inline-fix convergence loop (replaces read-only dual-reviewer). |
| **0.1.23** | Add `/ptp:review-brainstorm-full` dual-reviewer read-only brainstorm audit command. |
| **0.1.22** | Add `/ptp:review-brainstorm` command + `ptp-review-brainstorm` skill — read-only Superpowers brainstorm-quality gate. |
| **0.1.21** | Add `ptp-codex-mode` skill — single source of truth for `codex.mode` resolution and Codex phase gating across all dual-reviewer commands. |
