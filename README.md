# PtP — autonomous, dual-reviewed change pipeline for Claude Code

PtP turns a one-line feature or bug description into implemented, dual-reviewed code. It composes **OpenSpec** (durable artifacts and execution order) and **Codex** (an independent second reviewer), on top of PtP's own brainstorm/plan/review discipline skills.

Drive it a step at a time (`brainstorm → plan → apply → review → archive`), or hand it everything with `/ptp:full`.

---

## Prerequisites

| # | Install | Command |
|---|---------|---------|
| 1 | **OpenSpec CLI** (required) | `npm install -g openspec` — falls back to `npx -y openspec ...` |
| 2 | **prd-taskmaster** (optional, for `/ptp:prd`) | `/plugin marketplace add anombyte93/prd-taskmaster` then `/plugin install prd` |
| 3 | **Codex CLI** (optional, second reviewer) | put `codex` on PATH; verify with `codex --version` |

**Node** is needed only for the bundled telemetry receiver.

Without prd-taskmaster, `/ptp:prd` authors the PRD inline. Without Codex, behavior follows `codex.mode`.

**Migration note — PtP no longer invokes Superpowers.** PtP's own commands, agents, skills, and workflows invoke only PtP-owned skills, so conflict-free operation requires the Superpowers plugin **absent or disabled**. An installed Superpowers plugin registers its own `SessionStart` hook, which can inject `superpowers:using-superpowers` and direct an agent toward applicable Superpowers skills — a mechanism outside PtP's reach, so removing PtP's own invocations is not a guarantee that no agent ever invokes a Superpowers skill.

---

## Install PtP

```
/plugin marketplace add https://github.com/AlmogMaayan/ptp
/plugin install ptp@ptp
```

Restart Claude Code (plugins load at session start), then type `/` and confirm the `ptp:` group. `/ptp:status` is a good smoke test.

Update with `/plugin marketplace update ptp`, or run `/ptp:update`.

---

## Configuration

Three optional JSON files. How they merge is owned by `ptp-workspace` (`skills/ptp-workspace/SKILL.md`); this table only says where they live, and states no precedence, override, or merge rule of its own:

| Layer | Path |
|-------|------|
| Global | `~/.claude/ptp/config.json` |
| Project | `<repo>/.claude/ptp/config.json` |
| Workspace | `<workspace>/.claude/ptp/config.json` |

Any missing file, missing key, bad JSON, or invalid value is skipped for that key alone, leaving whatever another layer validly supplied and finally the key's default — the forgiving posture that contract defines. Set values with **`/ptp:config`** (interactive: pick target → parameter → value; safe merge-write, never commits).

```json
{
  "codex":     { "mode": "auto", "model": "<your-codex-model-id>", "reasoningEffort": "high" },
  "roles":     { "main": "claude" },
  "review":    { "maxIterations": 5, "minSeverity": "low" },
  "telemetry": { "mode": "off", "root": "openspec/telemetry", "port": 4318, "retentionDays": 30 },
  "parallel":  { "mode": "off", "maxConcurrency": 3 },
  "artifact":  { "maxProposalWords": 400, "maxDesignWords": 800, "maxTasksWords": 600,
                 "maxTaskCount": 15, "maxTaskWords": 60, "maxSpecDeltaWords": 1200 },
  "backlog":   { "projectOwner": "<github-org-or-user-login>", "projectNumber": 7 },
  "deploy":    { "mergeMethod": "squash", "maxFixRounds": 3, "workflow": null, "inputs": {} }
}
```

`codex.model` must be a model id your own Codex account supports; omit it to use your `~/.codex/config.toml`.

### Key reference

| Key | Values | Default | Effect |
|-----|--------|---------|--------|
| `codex.mode` | `auto` \| `required` \| `off` | `auto` | `auto`: use Codex when on PATH, else run main-only and report the skip. `required`: stop when `codex` is missing. `off`: never use Codex. Explicit `/ptp:codex-*` commands run Codex regardless of the mode. |
| `codex.model` | string | unset | Passed as `-m <model>` to `codex exec`. |
| `codex.reasoningEffort` | `minimal` \| `low` \| `medium` \| `high` | unset | Passed as `-c model_reasoning_effort=<effort>`. |
| `roles.main` | `claude` \| `codex` | `claude` | Which agent plans/implements; the reviewer is the other one. When no layer sets it, the `PTP_MAIN_AGENT` env var is read. |
| `review.maxIterations` | integer ≥ 1 | `5` | Iteration cap per review loop (each `-full` phase gets its own). |
| `review.minSeverity` | `low` \| `medium` \| `high` \| `critical` | `low` | Lowest severity that gets fixed and counted toward convergence. Lower findings are reported only. |
| `review.autoRecutOnBudgetExceeded` | boolean | `false` | `/ptp:full`'s (and `/ptp:full-plan`'s) plan-convergence gate: on a slice's `ARTIFACT BUDGET EXCEEDED` / `PHASE 2 ARTIFACT BUDGET EXCEEDED`, auto-run `/ptp:plan-multiple <id>` re-cut mode instead of stopping. Capped; falls back to stopping on cap. |
| `telemetry.mode` | `off` \| `on` | `off` | `on` records a run ledger (`runs.ndjson` + `runs.csv`) and, after `/ptp:telemetry setup`, spans in `spans.csv`. |
| `telemetry.root` | repo-relative path | `openspec/telemetry` | Store root. Must resolve below the repo root; absolute paths, `..`, `""`, `.`, `./`, `/` are rejected. |
| `telemetry.port` | `1`–`65535` | `4318` | Loopback port for the OTLP receiver. Changing it requires re-running `/ptp:telemetry setup` + a Claude Code restart. |
| `telemetry.retentionDays` | integer ≥ 1 | `30` | Days of raw span files kept (N days plus today). Pruned only by `/ptp:telemetry report`, only in the reported epic's `raw/`. |
| `parallel.mode` | `off` \| `on` | `off` | `on` permits eligible stages (`/ptp:plan-multiple`, `/ptp:full-plan`, `/ptp:full` Phase A) to run per-item runs concurrently. `/ptp:apply`, `/ptp:full-apply`, and `/ptp:archive` always run serially. |
| `parallel.maxConcurrency` | `1`–`10` | `3` | Members run at once; extras run in batches. |
| `artifact.maxProposalWords` | integer ≥ 1 | `400` | Word budget for `proposal.md`. An acceptance criterion, not guidance: an over-budget artifact is a defect, fixed by removing text or splitting the change. |
| `artifact.maxDesignWords` | integer ≥ 1 | `800` | Word budget for `design.md`. |
| `artifact.maxTasksWords` | integer ≥ 1 | `600` | Word budget for `tasks.md`. |
| `artifact.maxTaskCount` | integer ≥ 1 | `15` | Maximum `tasks.md` checkboxes (the minimum, 5, is fixed). |
| `artifact.maxTaskWords` | integer ≥ 1 | `60` | Maximum words in one checkbox, continuation lines included. |
| `artifact.maxSpecDeltaWords` | integer ≥ 1 | `1200` | Word budget for the spec deltas **summed** across the change's delta files, excluding verbatim `MODIFIED` replacement text. |
| `backlog.projectOwner` | GitHub org/user login | unset | Owner of the backlog board. A login, not a URL. Required for every backlog command. |
| `backlog.projectNumber` | integer ≥ 1 | unset | Board project number. Required for every backlog command. |
| `backlog.statusOptions` | object, see below | unset | Maps entry statuses onto your board's own `Status` option names. |
| `deploy.mergeMethod` | `squash` \| `merge` \| `rebase` | `squash` | `gh pr merge` strategy. |
| `deploy.maxFixRounds` | integer | `3` | Cap on each autonomous fix loop (PR stage and deploy stage bounded separately). |
| `deploy.workflow` | filename \| `null` | `null` | Deploy workflow file; `null` auto-detects `deploy`/`release`/`publish` under `.github/workflows`. |
| `deploy.inputs` | object | `{}` | `workflow_dispatch` inputs, e.g. `{ "confirm": "deploy" }`. |

### `backlog.statusOptions`

Maps the seven entry statuses — `backlog`, `ready`, `in-progress`, `in-review`, `done`, `blocked`, `cancelled` — onto your board's column names. Each value is a string or an array of strings. Unset rows keep their defaults; unknown keys are ignored.

```json
{
  "backlog": {
    "statusOptions": {
      "backlog":     "Icebox",
      "ready":       "Queued",
      "in-progress": ["Doing", "WIP"],
      "in-review":   "Reviewing",
      "done":        "Shipped",
      "cancelled":   "Dropped"
    }
  }
}
```

Defaults when unset: `backlog`/`Backlog`, `ready`/`Ready`, `in-progress`/`In Progress`, `in-review`/`In Review`, `done`/`Done`, `blocked`/`Blocked`, `cancelled`/`Cancelled`/`Canceled`. Matching is case-insensitive and trimmed. Two statuses claiming the same option name is refused; a write to a status your board has no option for is refused.

---

## Per-invocation switches

Tokens placed anywhere in a command's argument text. Nothing is persisted.

| Switch | Accepted by | Effect |
|--------|-------------|--------|
| `fast:on` / `fast:off` | any `ptp-run-at-model`-backed command, plus `/ptp:full`, `/ptp:full-apply`, `/ptp:full-plan` | Requests Claude Code fast mode for this invocation's Opus agents. Default off. Non-Opus targets and `main=codex` are no-ops. |
| `rounds:{count}` | `/ptp:backlog-run` | How many backlog epics this invocation runs. Positive integer, default `5`. |
| `model:<model>.<effort>` | `/ptp:brainstorm`, `/ptp:prd`, `/ptp:brainstorm-full`, `/ptp:prd-full` | Overrides the target model/effort for this invocation. |
| `parallel:on` / `parallel:off` | `/ptp:plan-multiple`, `/ptp:full-plan`, `/ptp:full` | Overrides `parallel.mode` for this invocation. |

---

## Change ids and selectors

```
<epic>_<story>_<kebab-description>
  epic  = 4 digits   story = 2 digits
example: 0021_01_media-edit-create-project-tag
```

Anywhere a change argument is taken:

| Selector | Resolves to |
|----------|-------------|
| `epic:all` | all active changes across every epic, `(epic, story)` ascending (legacy ids appended after) |
| `epic:0021` | all active stories in epic `0021`, in story order |
| `epic:0021 story:01` | the single change `0021_01_*` |
| `story:01` | the one active change with story `01`, if unambiguous |
| bare id | that exact change folder |
| *(omitted)* | all active changes, epic then story |

---

## Commands

### Autonomous

| Command | Does |
|---------|------|
| `/ptp:full "<request \| change-id>"` | Plan phase (decompose → dual plan-review per slice); if every slice converges, continues into apply + dual code-review per story. Never archives. |
| `/ptp:full-plan "<request \| change-id>"` | The planning half only. Decompose + dual artifact review per slice. Writes no code. |
| `/ptp:full-apply [selector \| id …]` | The execution half only. Runs `apply → review-full` per story sequentially, each at the model from its `effort.md` (review floored at `sonnet`/`high`). Omit the argument to run all active changes. |

### PRD (optional, upstream)

| Command | Does |
|---------|------|
| `/ptp:prd [selector \| "<description>"]` | Writes an epic PRD to `openspec/changes/<id>/prd.md`. A free-text description allocates a fresh epic. Omit for all active epics. |
| `/ptp:prd-full <epic-selector>` | `/ptp:prd` then the dual-reviewer inline-fix PRD loop, in one flow. |
| `/ptp:review-prd [epic-selector]` | Read-only PRD-quality gate. Reports PASS / WARN / FAIL. |
| `/ptp:codex-review-prd <epic-selector>` | Codex single-pass PRD audit. Read-only. |
| `/ptp:codex-review-prd-loop <epic-selector>` | Codex PRD review + inline fixes, looped to convergence. |
| `/ptp:review-prd-full [epic-selector]` | Dual-reviewer inline-fix PRD loop; edits the PRD, writes one marker per epic. |

### Brainstorm

| Command | Does |
|---------|------|
| `/ptp:brainstorm "<request>"` | 2–3 options with tradeoffs + a recommendation into `openspec/changes/<id>/brainstorm.md`. |
| `/ptp:brainstorm-only "<topic>"` | Same, change-agnostic, into `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`. |
| `/ptp:review-brainstorm [selector]` | Read-only brainstorm-quality gate. PASS / WARN / FAIL. |
| `/ptp:review-brainstorm-full [selector]` | Dual-reviewer read-only brainstorm audit with a combined verdict. Never edits. |
| `/ptp:brainstorm-full "<request>"` | Brainstorm then the dual-reviewer inline-fix review loop, in one flow. |

### Plan

| Command | Does |
|---------|------|
| `/ptp:plan [change-id]` | Writes `proposal.md`, `tasks.md`, `effort.md` (one `{model}.{effort}` line), and `specs/<capability>/spec.md` deltas, plus `design.md` only when the change carries non-obvious decisions or invariants, then runs `npx -y openspec validate <id> --strict`. |
| `/ptp:plan-multiple <request \| id>` | Decomposes oversized work into slices under one epic and runs `/ptp:plan` per slice. |
| `/ptp:review-plan [change-id]` | Read-only artifact-quality gate over proposal/design/tasks/spec deltas. Flags any `tasks.md` task needing manual QA, manual testing, or any human executor as **High**. Reports PASS / WARN / FAIL; advisory. |
| `/ptp:review-plan-loop <selector>` | Main-agent artifact review + inline fixes, looped to convergence. |
| `/ptp:review-plan-full <selector>` | Dual-reviewer artifact loop: the main agent to convergence, then Codex to convergence. |
| `/ptp:codex-review-plan <selector>` | Codex single-pass artifact review. |
| `/ptp:codex-review-plan-loop <selector>` | Codex artifact review + fixes, looped. |
| `/ptp:effort <change-id>` | Prints the recommended model + effort for `/ptp:apply`. |

### Apply and review

| Command | Does |
|---------|------|
| `/ptp:apply <selector>` | Implements `tasks.md` sequentially with TDD discipline, checking off each task after verifying it. Runs at the model/effort in `effort.md`. |
| `/ptp:review <selector>` | Main-agent code review of the diff against the artifacts. Findings Critical / High / Medium / Low. |
| `/ptp:review-loop <selector>` | `/ptp:review` + inline fixes until no findings at or above `review.minSeverity`, or the cap. |
| `/ptp:review-full <selector>` | Dual-reviewer code loop: the main agent to convergence, then Codex to convergence. |
| `/ptp:review-fix [selector]` | Fixes the confirmed findings of the latest review in the conversation, then runs tests/lint/validate. |
| `/ptp:codex-review <selector>` | Codex single-pass code review. |
| `/ptp:codex-review-loop <selector>` | Codex code review + fixes, looped. |
| `/ptp:codex-review-uncommitted [selector]` | Codex review of the working tree only (staged + unstaged + untracked). |

### Archive and ship

| Command | Does |
|---------|------|
| `/ptp:archive <selector>` | Checks the archive gates (tasks complete, no open Critical/High, validation passes), then `openspec archive` + spec sync. |
| `/ptp:archive-force <selector>` | Archives past the gates, still syncing specs, and reports which gates it bypassed. |
| `/ptp:deploy` | commit → push → PR → squash-merge → delete branch → run the deploy workflow → return to clean `master`. Fixes conflicts/CI/deploy failures within `deploy.maxFixRounds`. Refuses on `master`/`main`; never self-approves. Requires `gh` authenticated. |
| `/ptp:deploy-pr-approved` | Finishes a `/ptp:deploy` that stopped for a required approval, after someone else approves the PR. |
| `/ptp:merge-to-master` | Runs the same ship pipeline as `/ptp:deploy` minus the deploy workflow step. Refuses on a **clean** `master`/`main`; **recovers a dirty one** onto a fresh feature branch (stash → cut → pop, gated on the result) before committing. Never self-approves. |
| `/ptp:archive-and-deploy <selector>` | Archives each resolved change through the existing gates in story order, then deploys once on the current branch if every archive succeeded. Accepts `epic:all`. Refuses on `master`/`main`; never self-approves. |
| `/ptp:deploy-master` | Triggers the deploy workflow against the current `master`. No commit/push/PR/merge. Requires a clean tree on `master`/`main`. |
| `/ptp:master` | `git switch master && git pull --ff-only`, only when the working tree is clean. |

### Status, plugin, experimental

| Command | Does |
|---------|------|
| `/ptp:status [change-id]` | Active changes, validation status, task progress, recommended next command. |
| `/ptp:analyze "<bug \| question>"` | Read-only investigation → `openspec/changes/<id>/analysis.md`. Produces no proposal, changes no source. |
| `/ptp:config` | Interactive config editor for every key above. |
| `/ptp:workspace-init` | Declares the current directory a ptp workspace: `openspec init --tools none .` plus a `{}` seed at `<cwd>/.claude/ptp/config.json` when absent. No arguments; refuses when an `openspec` entry is already there or no git root is found. |
| `/ptp:version` | Installed vs. latest version verdict. Read-only. |
| `/ptp:update` | Runs `claude plugin update ptp@ptp`. Restart Claude Code afterwards. |
| `/opsx:explore [topic]` · `/opsx:propose [name]` · `/opsx:apply [name]` · `/opsx:archive [name]` | Experimental OpenSpec-only commands (no PtP discipline layer). |

---

## Epic backlog

The backlog is a **GitHub Projects v2 board**. Set `backlog.projectOwner` and `backlog.projectNumber`; every backlog command refuses, naming the missing key, until both resolve.

The board resolves **per workspace root**: a repository holding several workspaces can give each its own board without any repository-level edit, and a repository whose workspace root is the repository root resolves the same single board it always has.

**Board setup (one time, done by you — ptp creates and reorders nothing):**

1. Create or pick a project board.
2. Add one custom field named `Status`, type **single select**.
3. Give it these options, in this order: `Backlog`, `Ready`, `In Progress`, `In Review` (means converged but not yet archived, per `ptp-backlog` — not "a review is running"), `Done` — plus `Blocked` and `Cancelled`, which ptp writes when a run halts or an epic is cancelled.
4. Authenticate `gh` with `read:project` to read the board, `project` to write it (`gh auth refresh -s project`).

Every card on the board is a backlog entry. Cards inside `Ready` run **top-first** — drag a card up to run it sooner. A board view you have sorted by another field is not the order ptp reads.

| Command | Does |
|---------|------|
| `/ptp:backlog` | Read-only. Board header, entries table with statuses, the ready set in run order (or why it is withheld), stale flags, validation problems. Creates nothing. |
| `/ptp:backlog-add "<epic description>"` | Adds one entry, parked in `Backlog`. Not run until you move it to `Ready`. Touches no other entry. |
| `/ptp:backlog-edit <node-id> "<what to change>"` | Edits one entry's title/description/notes and status along the transition table. Also the recovery path for an entry stuck `in-progress` (dispositions: claim → `blocked`, disown / rerun anyway → `ready`, plus per-prefix promote/dismiss). |
| `/ptp:backlog-run [rounds:{count}]` | Runs the `Ready` entries through `/ptp:full`, top-first, 5 per invocation by default. Marks each `in-progress`, records the change ids it produced, leaves converged epics `in-review`, and halts the whole run on the first non-convergence, marking that epic `blocked`. Never commits, pushes, merges, archives, or deploys. |
| `/ptp:backlog-continue ["<what went wrong>"]` | Bare: finishes the `blocked` or `in-review` epic — signs off remaining tasks, re-runs validate/build/tests, archives, and only then writes `done`. Never re-runs `/ptp:review-full`: `/ptp:full` already drove code review to convergence for the change before it could reach `blocked`/`in-review`. Per `ptp-backlog`, `blocked` is missing the human verification and `in-review` is missing the archive. With free text: one scoped fix pass against the same change, with no status change, no review, and no archive. |

Status writes land on the shared board immediately, outside git; on an issue- or PR-backed card, title/body writes edit that issue's or PR's own title and body.

---

## Telemetry

Opt-in timing data per epic. Every subcommand works as `/ptp:telemetry <sub>` or as the leaf command `/ptp:telemetry-<sub>`.

**Setup (once):**

1. `/ptp:config` → *Record ptp run telemetry* → `on` (set *Telemetry receiver port* if `4318` is taken).
2. `/ptp:telemetry setup` — shows the `env` block and `.gitignore` changes as a diff and writes `<repo>/.claude/settings.local.json` only after you confirm. It then offers a second, separately confirmed step that wires `codex exec` telemetry for this repository; declining leaves Claude-side telemetry working.
3. **Restart Claude Code** — the `env` block only applies at process start.
4. Run ptp work as usual. The receiver starts itself; `/ptp:telemetry start` is never required.
5. Read `openspec/telemetry/<epic>/spans.csv`, current mid-run.

To turn it off: set `telemetry.mode=off` and run `/ptp:telemetry stop`. Nothing stops the receiver automatically.

`setup` also creates `<telemetry.root>/.ptp-telemetry-credential`. It is gitignored — **do not commit or share it**. The receiver drops any batch that arrives without it.

| Subcommand | Does |
|------------|------|
| `status` | Resolved mode/root/port, environment and receiver preflight, credential match verdict (never the value), lockfile state, per-epic run counts, and the Codex telemetry preflight. Changes nothing. |
| `report [write] [selector]` | Timing report for the resolved epics: aggregate work time, elapsed wall time, `concurrency_factor`, breakdowns by phase/role/span kind and by `tool_class`, top time sinks, review-loop cost per iteration, and a data-quality footer. `write` also writes `<telemetry.root>/<epic>/report.md`. Deletes raw files older than `telemetry.retentionDays`. |
| `analyze` | De-nested work breakdown over the whole raw store: LLM vs tools, inside-subagent vs main-agent, tokens by model, tool work by name, bash work by command, plus a data-quality footer. Takes no selector. Writes and deletes nothing. Not the same command as `/ptp:analyze`. |
| `setup` | The confirm-first one-time opt-in above. The only ptp command that writes a Claude Code setting. |
| `start` / `stop` | Manual receiver control. `start` is idempotent; `stop` verifies pid, port, and launch token first. |
| `export` | Takes no arguments. Rebuilds every `spans.csv` from the raw store. Requires the receiver stopped — run `stop` → `export` → restart, setting `telemetry.mode=off` first if a ptp command might auto-start it in between. |

`spans.csv` is a 26-column, RFC-4180 / UTF-8-BOM / CRLF file starting with `schema_version`; the column list and the `tool_class` buckets (`search`, `read`, `write`, `build_test`, `git`, `agent`, `other`) are defined in `skills/ptp-telemetry/SKILL.md`. An `otelcol-contrib` file exporter plus a continuous flatten step is a supported alternative receiver — same store layout, ledger, and CSV schema.

---

## Skills

Claude invokes these automatically; you don't call them directly. `ptp`, `ptp-prd`, `ptp-change-selector`, `ptp-branch-guard`, `ptp-branch-prep`, `ptp-run-at-model`, `ptp-agent-roles`, `ptp-codex-mode`, `ptp-full`, `ptp-full-apply`, `ptp-brainstorm-full`, `ptp-review-brainstorm`, `ptp-review-brainstorm-full`, `ptp-review-prd`, `ptp-review-prd-full`, `ptp-prd-full`, `ptp-review-loop`, `ptp-telemetry`, `ptp-telemetry-status`, `ptp-telemetry-report`, `ptp-telemetry-analyze`, `ptp-telemetry-setup`, `ptp-telemetry-start`, `ptp-telemetry-stop`, `ptp-telemetry-export`, `ptp-parallel-fanout`, `ptp-backlog`, `ptp-backlog-write`, `ptp-backlog-run`, `ptp-backlog-continue`, `ptp-github-projects-gh`, `ptp-archive-force`. The `openspec-*` skills back the `opsx:` commands.

The `openspec-*` skills are edited only in `skills/openspec-*/`. `.claude/skills/openspec-*/` and
`.codex/skills/openspec-*/` are generated from that single source and must not be hand-edited — run
`node scripts/sync-openspec-skills.js` to regenerate them and `node scripts/sync-openspec-skills.js --check`
to verify there is no drift.

Every write-capable command runs a branch guard first: on `master` it stashes, pulls, and cuts a fresh `ptp/<…>` branch before writing anything.

---

## Quick-reference card

```
Whole thing at once
  → /ptp:full "<request>"             # plan + dual plan-review → apply + dual code-review
  → /ptp:full-plan "<request>"        # planning half only
  → /ptp:full-apply [sel | id …]      # execution half only

Step by step
  → /ptp:prd [<sel>] | /ptp:prd-full <sel> | /ptp:review-prd[-full] [<sel>]
  → /ptp:analyze "<subject>"          # read-only investigation → analysis doc
  → /ptp:brainstorm "<request>" | /ptp:brainstorm-only "<topic>" | /ptp:brainstorm-full "<request>"
  → /ptp:review-brainstorm[-full] [<sel>]
  → /ptp:plan [change-id] | /ptp:plan-multiple <request>
  → /ptp:review-plan [<sel>] | /ptp:review-plan-loop <sel> | /ptp:review-plan-full <sel>
  → /ptp:apply <sel>
  → /ptp:review <sel> | /ptp:review-loop <sel> | /ptp:review-full <sel> | /ptp:review-fix [sel]
  → /ptp:archive <sel> | /ptp:archive-force <sel>

Codex second opinion (needs codex on PATH)
  → /ptp:codex-review[-loop] <sel> | /ptp:codex-review-plan[-loop] <sel>
  → /ptp:codex-review-prd[-loop] <sel> | /ptp:codex-review-uncommitted [sel]

Ship
  → /ptp:deploy | /ptp:deploy-pr-approved | /ptp:merge-to-master
  → /ptp:archive-and-deploy <sel>     # archive in story order → deploy once if all passed
  → /ptp:deploy-master | /ptp:master

Epic backlog
  → /ptp:backlog                              # entries, statuses, ready set, problems
  → /ptp:backlog-add "<epic request>"         # one new entry, parked in Backlog
  → /ptp:backlog-edit <node-id> "<change>"    # fields, transitions, recovery
  → /ptp:backlog-run [rounds:{count}]         # the Ready epics through /ptp:full
  → /ptp:backlog-continue ["<what broke>"]    # finish, or one scoped fix pass

Telemetry (telemetry.mode = on)
  → /ptp:telemetry status | report [write] [sel] | analyze | setup | start | stop | export

Where am I / plugin
  → /ptp:status [change-id] | /ptp:effort <change-id> | /ptp:config
  → /ptp:workspace-init                        # make the current directory a workspace
  → /ptp:version | /ptp:update

Selectors        epic:all | epic:0021 | epic:0021 story:01 | story:01 | <bare-id> | (omit = all)
Switches         fast:on|off · rounds:{n} · model:<model>.<effort> · parallel:on|off
Experimental     /opsx:explore | /opsx:propose | /opsx:apply | /opsx:archive
```

## Changelog

| **0.6.1** | New `review.autoRecutOnBudgetExceeded` config key (boolean, default `false`, epic 0062). Off, nothing changes: a slice's `ARTIFACT BUDGET EXCEEDED` / `PHASE 2 ARTIFACT BUDGET EXCEEDED` still STOPs the whole `/ptp:full` (or `/ptp:full-plan`) run as before. On, `/ptp:full`'s plan-convergence gate re-cuts the offending slice itself — `/ptp:plan-multiple <id>` in re-cut mode, splicing the children into the slice set at the parent's position, plan-reviewing each, and re-applying the gate — instead of stopping, identically on the serial and parallel gate paths. Two recursion caps bound it (a per-lineage depth cap of 2, and a total growth cap of `max(originalCount*3, originalCount+2)` with a pre-check before invoking and a post-check after), a single-change fallback or a child's own `NEEDS SPLIT` falls back to stopping that lineage, and every auto re-cut is named in the terminal report — parent, children, moved artifacts. Scoped to the plan-review gate only; a slice's own `/ptp:plan` `NEEDS SPLIT` and `ptp-full-apply`'s apply-convergence gate are both unaffected (0062_01, 0062_02). |
| Version | Changes |
|---------|---------|
| **0.6.0** | **Size-bounded planning.** Artifact word budgets become **acceptance criteria, not guidance**, configurable via six new `artifact.*` keys (`maxProposalWords` 400, `maxDesignWords` 800, `maxTasksWords` 600, `maxTaskCount` 15, `maxTaskWords` 60, `maxSpecDeltaWords` 1200). The **spec deltas are budgeted for the first time**, summed across the change's delta files, excluding verbatim `MODIFIED` replacement text. Two new terminal states, handled by every orchestrator that consumes them: **`NEEDS SPLIT`** (a *successful* planner state meaning decomposition, not authoring, is the remaining work) and **`ARTIFACT BUDGET EXCEEDED`** (a review halt on an over-budget artifact, or one that grew three rounds running, recommending a split rather than another round). A change id's **story becomes a path** of 2-digit segments, so a split change is replaced by its own children (`0001_03` → `0001_03_01`, `0001_03_02`) without renumbering any sibling; `/ptp:plan-multiple` gains a **re-cut mode** that preserves the parent's `prd.md`/`analysis.md` and repoints sibling dependencies. Reviewers now get an **acceptance criterion** rather than open-ended adversarial instruction, rejecting a finding requires stating what was checked, and fixes **prefer removal** and pay for additions by deleting. `proposal.md` declares a **`## Build state`** (`GREEN`, or `RED — <what breaks> until <change-id>`) so compilability no longer distorts the cut. Codex review rounds **run synchronously**. The compactness linter enforces all of it (`BUDGET_EXCEEDED`, `BUILD_STATE_MISSING`). |
| **0.5.0** | New ptp **workspace** concept (epic 0060): a workspace is one product inside a repository — a directory holding its own `openspec/`. `skills/ptp-workspace/SKILL.md` owns resolution (upward walk bounded by the git root, an explicit `--workspace <path>` override, slug derivation), the three-layer configuration merge (`global` → `project` → `workspace`), and the workspace segment in cut branch names (`ptp/<slug>/<leaf>`); `scripts/ptp-resolve-workspace.js` is its derived, dependency-free executable surface. Every command that resolves a change selector or allocates an epic now resolves its workspace root once, at entry, and every bare `openspec/...` path in ptp text is workspace-relative — except `openspec/telemetry`, pinned to the repository root. A repository with a single `openspec/` at its git root resolves and cuts branches exactly as before, byte for byte (0060_01–0060_06). New command **`/ptp:workspace-init`** (epic 0061) declares the current directory a workspace: no arguments, non-interactive, guard-exempt (the guard needs an already-resolved root, which is exactly what this command lacks before it runs), refuses on an existing `openspec/` at cwd or a stray argument, warns on an ancestor workspace, and seeds `.claude/ptp/config.json` with `{}` (0061_01). |
| **0.4.0** | New review-cycle tally: `ptp-review-loop` now returns a per-reviewer `reviewTally` (`cycles`, `found`, `accepted`, `rejected`, `belowThreshold`, `droppedManual`, `fixed`, `capped`) at every terminal outcome, rendered via a new shared table format (`skills/ptp-review-loop/references/review-tally-table.md`) and persisted in the durable `stages/<kind>.json` marker. The four dual-reviewer orchestrators (`/ptp:review-full`, `/ptp:review-plan-full`, `ptp-review-brainstorm-full`, `ptp-review-prd-full`) join and print it; `/ptp:brainstorm-full` and `/ptp:prd-full` relay it in their single-change reports; `/ptp:full`/`/ptp:full-apply`/`/ptp:full-plan` roll it up per slice across a multi-slice run. `/ptp:apply` and `/ptp:plan`, which wrap no review step, explicitly print no tally. `/ptp:review-fix` synthesizes a one-cycle tally from its frozen single pass (epic 0059). |
| **0.3.1** | `/ptp:analyze` actually reaches `ptp-run-at-model` now — `0056_01`/`0.2.38` had only documented the `opus.high` dispatch in `skills/ptp-analyze/SKILL.md`'s Purpose section without ever performing it, so the command still ran at the session's own model. The dispatch is now an imperative step of the owning skill (not the command file, which stays in its enforced ordinary-command shape): `skills/ptp-analyze/SKILL.md` invokes `ptp-run-at-model` at `opus.high` directly, and `skills/ptp-run-at-model/SKILL.md`'s spawn-site audit plus the telemetry auto-start coverage docs are updated to match (0058_01). |
| **0.3.0** | Minor version bump — the plugin moves from 0.2.38 to 0.3.0 to mark the PTP token-reduction program (epic 0057). No command, skill, agent, workflow, or behavior changed with the bump, and PTP publishes no API-compatibility contract tied to its version number. `/ptp:version` and `/ptp:update` resolve and compare versions exactly as before — only the value they read moved (0057_12). |
| **0.2.38** | `/ptp:analyze` now runs its investigation and analysis-doc write via `ptp-run-at-model` at `opus.high` in one foreground main run, instead of inline at the session's own model/effort — matching every other judgment-carrying ptp command. The branch guard is its only outer-session precondition; change-folder resolution/allocation and the doc write happen inside the routed run, and the terminal result relays as `completed`/`refused`/`needs-human-action` (0056_01). |
| **0.2.37** | `/ptp:merge-to-master` no longer refuses outright on `master`/`main`. It classifies the tree first: clean still STOPs verbatim, but a dirty tree now recovers automatically — derive a branch name, cache-heal, run `ptp-branch-prep` (stash `-u` → cut → pop), gate on its return, then continue the unchanged merge-only pipeline. A failed or conflicted prep hard-STOPs before any git write, so conflict markers can never be committed — including on a re-run. `/ptp:deploy`, `/ptp:deploy-pr-approved`, and `/ptp:archive-and-deploy` keep refusing unconditionally (0055_01). |
| **0.2.36** | `/ptp:backlog-continue` no longer re-runs `/ptp:review-full` or evaluates any `stages/code.json` review marker on its bare flow — code review is already converged by `/ptp:full` before a change can reach `blocked`/`in-review`, so the bare flow is now sign off → re-verify → archive → `done`, unconditionally. |
| **0.2.35** | BREAKING — the per-kind review-convergence marker family moves from `openspec/changes/<id>/reviews/` to `stages/`, joins a six-kind stage-record family with new `apply`/`archive` lifecycle records, scopes the `code` marker's content fingerprint to the reviewed change's own diff footprint instead of the whole working tree, and clarifies `in-review` semantics (epic 0054). |
| **0.2.34** | Generated `tasks.md` files may never contain manual-QA / manual-test tasks — the ban is authored into `/ptp:plan`, carved out of the review-loop drop filter, and enforced by the plan-review rubrics (epic 0053). |
| **0.2.33** | A code review now leaves a durable, fingerprinted convergence marker, so `/ptp:backlog-continue` can skip a redundant `/ptp:review-full` instead of always re-running it. |
| **0.2.29** | The backlog write path stops refusing issue- and pull-request-backed entries — every board item is now fully writable, not just draft cards. |
| **0.2.28** | BREAKING — the backlog transport moves from the GitHub MCP server to the `gh` CLI, `backlog.mcpServer` is retired, and the `github-projects-mcp` capability is replaced by `github-projects-gh`. |
| **0.2.27** | BREAKING — the backlog board moves to five workflow columns, `Ready` becomes what "runnable" means, and `Todo` stops mapping to anything. |
| **0.2.26** | The board's `Status` option names become configurable — `backlog.statusOptions`. |
| **0.2.25** | BREAKING — the backlog entry's identifier becomes the board item's own node id, and the `Backlog ID` custom field is gone. |
| **0.2.24** | The `ptp-telemetry` monolith is split into one substrate skill plus seven command+skill leaf pairs, with no behavior change. |
| **0.2.23** | Effort rubric gains a round-down trigger, separate from the model dial. |
| **0.2.22** | The epic backlog's write path ships, and every writer is wired to it. |
| **0.2.21** | The epic backlog moves onto a GitHub Projects board — read path. |
| **0.2.20** | Remove the epic-dependency feature from the backlog entirely. |
| **0.2.19** | Give the telemetry analysis engine a **front door**: `/ptp:telemetry` now accepts a **seventh** subcommand, **`analyze`**, dispatched exactly as the existing six are (`commands/telemetry.md` Step 1) rather than falling through the unsupported-subcommand path. |
| **0.2.18** | Make the "lowest severity worth fixing" **configurable** for plan and code reviews. |
| **0.2.17** | Close the one gap `/ptp:backlog-run` + `/ptp:backlog-edit` left open: a **`blocked`** epic whose halted change has since been manually verified had no way back to `done` short of a full reset-and-replan. |
| **0.2.15** | Make the epic backlog **runnable**. |
| **0.2.14** | Make the epic backlog **editable and recoverable**. |
| **0.2.13** | Lay the foundation for the **epic backlog** — a durable place to record epics *before* they become change folders — as a contract-first change that ships **no writer at all**. |
| **0.2.12** | Three non-parallel latency levers, all reached through the single `ptp-run-at-model` spawn site so no per-command duplication is needed. |
| **0.2.11** | Fan out the planning phase's **second** `N ×` `opus.high` stage: `/ptp:full-plan` step 2 and `skills/ptp-full/SKILL.md` **Phase A** now run their per-slice `review-plan-full` members **concurrently** under the `ptp-parallel-fanout` contract, capped and batched by `parallel.maxConcurrency`. |
| **0.2.10** | Give the fan-out contract its **first consumer**: `/ptp:plan-multiple` is restructured into **three beats** so per-slice planning can actually overlap. |
| **0.2.9** | Make concurrent planning runs *permissible* — contract first, no consumer. |
| **0.2.8** | Close the last opaque block in the timing data: **Codex telemetry**, at the fidelity `0032_05_codex-telemetry-scope-spike`'s decision record selected — the **repository-scoped** shape, and **never a user-global Codex configuration**. |
| **0.2.7** | Turn the telemetry store into an answer: **`/ptp:telemetry report [write] [selector]`**. |
| **0.2.6** | Add the OTel span layer on top of the telemetry spine. |
| **0.2.5** | Add the telemetry attribution spine: the `ptp-telemetry` skill (config, per-epic store, NDJSON run ledger, `runs.csv` dual-write) plus a read-only `/ptp:telemetry status` command. |
| **0.2.4** | The workflow-backed `full` family (`/ptp:full`, `/ptp:full-apply`, `/ptp:full-plan`) now honors the per-invocation `fast:` switch. |
| **0.2.3** | `ptp-run-at-model` gains an optional per-invocation `fast:on` / `fast:off` switch, recognized generically by every command that references the skill (no per-command enumeration, no new config key). |
| **0.2.2** | `/ptp:prd-full` accepts the optional `model:<model>.<effort>` override token. |
| **0.2.1** | `/ptp:brainstorm-full` accepts the optional `model:<model>.<effort>` override token — both Phase A (brainstorm) and Phase B (review) now run at the resolved target instead of a hardcoded `opus.high`. |
| **0.2.0** | Rename `/ptp:full-run` to `/ptp:full-apply` (command `commands/{full-run.md => full-apply.md}`, skill/workflow `skills/{ptp-full-run => ptp-full-apply}/SKILL.md`) to align the "full" orchestrator name with the prior run→apply rename; |
| **0.1.38** | `/ptp:brainstorm` and `/ptp:prd` accept an optional `model:<model>.<effort>` override token (e.g. |
| **0.1.37** | Add `ptp-agent-roles` skill and `roles.main` layered-config key (default `claude`) resolving a `{ main, reviewer }` agent pair — the contract for swapping which agent (Claude/Superpowers or Codex) is the main planning/implementation agent vs. |
| **0.1.36** | Add `codex.model` and `codex.reasoningEffort` layered-config keys, resolved by `ptp-codex-mode` (default unset, independent, forgiving reader) and consumed by a single canonical Codex invocation flag-append rule (`-m <model>` / `-c model_reasoning_effort=<effort>` appended before the trailing stdin `-`, both unset ⇒ today's exact `codex exec -s read-only -`). |
| **0.1.33** | `/ptp:prd` with a free-text argument now allocates a fresh epic and authors the PRD into it instead of aborting. |
| **0.1.32** | Relocate PRD artifacts into the change folder: `/ptp:prd` now writes `openspec/changes/<id>/prd.md` (where `<id>` is the epic's lowest-numbered story) instead of a standalone `openspec/prds/` folder; |
| **0.1.31** | Add the PRD-stage orchestrators `/ptp:review-prd-full` (dual-reviewer inline-fix PRD loop) and `/ptp:prd-full` (author → gate → review in one flow). |
| **0.1.30** | Add the PRD-review family — `/ptp:review-prd` command + `ptp-review-prd` skill (read-only single-pass Superpowers PRD-quality gate), `/ptp:codex-review-prd` (closed-book Codex PRD audit), and `/ptp:codex-review-prd-loop` (Codex PRD inline-fix loop). |
| **0.1.29** | Add `/ptp:prd` command + `ptp-prd` skill. |
| **0.1.26** | Add `/ptp:brainstorm-full` command + `ptp-brainstorm-full` skill — seam-free union of `/ptp:brainstorm` and `/ptp:review-brainstorm-full` in one uninterrupted flow (brainstorm → brainstorm-gate → dual-reviewer inline-fix review loop). |
| **0.1.25** | Add `/ptp:review-brainstorm-full` command + `ptp-review-brainstorm-full` skill — inline-fix dual-reviewer convergence loop (Superpowers + Codex) for brainstorm artifacts; |
| **0.1.24** | Convert `/ptp:review-brainstorm-full` to inline-fix convergence loop (replaces read-only dual-reviewer). |
| **0.1.23** | Add `/ptp:review-brainstorm-full` dual-reviewer read-only brainstorm audit command. |
| **0.1.22** | Add `/ptp:review-brainstorm` command + `ptp-review-brainstorm` skill — read-only Superpowers brainstorm-quality gate. |
| **0.1.21** | Add `ptp-codex-mode` skill — single source of truth for `codex.mode` resolution and Codex phase gating across all dual-reviewer commands. |
