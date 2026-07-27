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
  "telemetry": {
    "mode": "off",
    "root": "openspec/telemetry",
    "port": 4318,
    "retentionDays": 30
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

### `/ptp:config` — guided config editor

**`/ptp:config`** is the interactive front door for editing these config files. Instead of
hand-editing JSON, it walks you through:

1. **Target** — choose *User / global* (`~/.claude/ptp/config.json`) or *Project*
   (`<repo>/.claude/ptp/config.json`).
2. **Parameter** — `codex.mode` ("Use Codex for review"), `codex.model` ("Codex model override"),
   `codex.reasoningEffort` ("Codex reasoning effort"), `review.maxIterations` ("Max review-loop
   iterations"), `roles.main` ("Main agent"), `telemetry.mode` ("Record ptp run telemetry"),
   `telemetry.root` ("Telemetry store root"), `telemetry.port` ("Telemetry receiver port"), or
   `telemetry.retentionDays` ("Telemetry raw-store retention (days)"); the menu grows as the registry
   grows.
3. **Value** — select from the valid enum values with one-line descriptions (`codex.mode`,
   `codex.reasoningEffort`, `roles.main`, `telemetry.mode`), enter a free-text value (`codex.model`,
   `telemetry.root` — validated to stay inside the repository), or enter an integer
   (`review.maxIterations`, `telemetry.retentionDays`, `telemetry.port` — the last validated as a TCP
   port in `1..65535`).

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

**`/ptp:review-loop <selector>`** — loops `/ptp:review` + inline fixes automatically until zero open findings at all severities or the iteration cap (5). Replaces the manual review → fix → review cycle.

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

### Telemetry

**`/ptp:telemetry <status | report | setup | start | stop | export>`**. See `telemetry.mode` /
`telemetry.root` / `telemetry.port` / `telemetry.retentionDays` under
[Configuration](#configuration).

- **`status`** — read-only. The resolved mode, root, and port; the environment preflight verdict
  (enable flag, endpoint, protocol, and the ingestion-credential match — reported **without printing
  the credential**, plus any non-gating `OTEL_BSP_SCHEDULE_DELAY` drift); whether the receiver is
  listening, how it was started and when, and whether the lockfile is stale; and per-epic total /
  closed / unclosed run counts (plus the unattributed bucket). It never creates a store, never starts
  or stops anything, and reports a store's absence rather than inferring `mode=off` from it.
- **`report [write] [selector]`** — the timing analysis. **Creates no file, modifies no existing
  file, and deletes only aged raw files.** That third clause is not decoration — a default run
  prunes irreversibly (see [Retention](#retention)). Detailed below.
- **`setup`** — the **one-time**, interactive, **confirm-first** opt-in described in the walkthrough
  below. The single exception to ptp's never-write-a-Claude-Code-setting rule.
- **`start` / `stop`** — the manual receiver lifecycle. `start` is idempotent (a second `start`
  reports the existing process); `stop` verifies the recorded pid, port, and launch token before
  terminating anything. Neither is normally needed: the receiver **auto-starts** from a shared
  preamble.
- **`export`** — **takes no flag and no argument**. Every invocation is a global, deterministic
  re-derivation: it reads every epic's raw store and every ledger, re-resolves attribution, re-derives
  `tool_class`, and rewrites **every** `spans.csv` from scratch. Two runs against an unchanged store
  produce byte-identical output, and it writes **nothing** into the raw store.

  `export` **requires the receiver to be stopped** and refuses — with one line naming
  `/ptp:telemetry stop`, stopping nothing and writing nothing — while one is live. The documented
  repair path (for a damaged CSV, or after a `tool_class` fix) is therefore
  **`/ptp:telemetry stop` → `/ptp:telemetry export` → restart**. Run `export` *directly* after the
  stop: any ptp command in between auto-starts the receiver again and `export` refuses. Set
  `telemetry.mode=off` first if you cannot be sure.

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
2. **`/ptp:telemetry setup`, once.** It renders the exact seven-key `env` block plus both
   `.gitignore` reconciliations as a diff and **writes nothing until you confirm**. (Seven, not five:
   `CLAUDE_CODE_ENABLE_TELEMETRY=1` turns collection on, but the OTel SDK still has to be told to use
   OTLP — measured, and recorded in the change's spike outcome.) On confirmation it writes
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
| `ptp-telemetry` | Single source of truth for the opt-in telemetry behind `/ptp:telemetry`: `telemetry.mode`/`telemetry.root`/`telemetry.port` resolution, the per-epic store layout, the append-only NDJSON run ledger and its CSV dual-write, the mint-once-then-propagate `run_id` rule, the gate-and-never-fail ordering every write point applies — and the span layer: the loopback OTLP receiver and its identity/health wire contract, the 26-column `spans.csv`, the OTel-attribute and `tool_class` mapping tables, the ledger join, the append-only raw store and the global `export` that re-derives from it, the confirm-first `setup` writer, the `start`/`stop` lifecycle, and the auto-start preamble `ptp-run-at-model` invokes — and the report layer: `/ptp:telemetry report`'s selector delegation and `write`-keyword strip, the two never-conflated headline numbers plus `concurrency_factor`, the banned wall-minus-components subtraction, the breakdowns and top-N sinks, the derived per-iteration review view, the mandatory data-quality footer, and `telemetry.retentionDays` raw-store pruning. |
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

Run telemetry (opt-in: telemetry.mode = on)
  → /ptp:telemetry status               # read-only: mode, root, port, env + receiver preflight
  → /ptp:telemetry report [write] [sel] # work vs elapsed time, breakdowns, sinks, quality footer
  → /ptp:telemetry setup                # one-time, confirm-first Claude Code telemetry opt-in
  → /ptp:telemetry start | stop         # manual receiver lifecycle (auto-starts otherwise)
  → /ptp:telemetry export               # global re-derivation of every spans.csv (receiver stopped)

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

| Version | Changes |
|---------|---------|
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
