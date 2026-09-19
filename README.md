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
| 4 | Superpowers (optional — required only when `tdd-plugin=superpowers`) | `/plugin install superpowers@claude-plugins-official` |

**Node** is needed only for the bundled telemetry receiver.

Without prd-taskmaster, `/ptp:prd` authors the PRD inline. Without Codex, behavior follows `codex.mode`.

**Migration note — Superpowers is optional, selected by `tdd-plugin`.** Which TDD skill set PtP uses is chosen by the `tdd-plugin` config key. Under **`tdd-plugin=ptp`** (the default, including unset) PtP's own commands, agents, skills, and workflows invoke only PtP-owned skills, so conflict-free operation requires the Superpowers plugin **absent or disabled**. Under **`tdd-plugin=superpowers`** PtP invokes the restored `superpowers:*` skills and requires Superpowers **present and enabled** — selecting that value without the plugin present and enabled is a hard stop, never a silent PtP-native fallback. Either way, an installed Superpowers plugin registers its own `SessionStart` hook, which can inject `superpowers:using-superpowers` and direct an agent toward applicable Superpowers skills — a mechanism outside PtP's reach, so removing PtP's own invocations is not a guarantee that no agent ever invokes a Superpowers skill.

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
  "codex":     { "mode": "auto", "model": "<your-codex-model-id>", "reasoningEffort": "high",
                 "mechanical": { "model": "<cheaper-model-id>", "reasoningEffort": "low" },
                 "judgment":   { "model": "<stronger-model-id>", "reasoningEffort": "high" } },
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
| `codex.mechanical.model` | string | unset | Resolved by `ptp-codex-mode`; not yet consumed by any call site until `0076_02_run-at-model-codex-tier-consume`. |
| `codex.mechanical.reasoningEffort` | `minimal` \| `low` \| `medium` \| `high` | unset | Resolved by `ptp-codex-mode`; not yet consumed by any call site until `0076_02_run-at-model-codex-tier-consume`. |
| `codex.judgment.model` | string | unset | Resolved by `ptp-codex-mode`; not yet consumed by any call site until `0076_02_run-at-model-codex-tier-consume`. |
| `codex.judgment.reasoningEffort` | `minimal` \| `low` \| `medium` \| `high` | unset | Resolved by `ptp-codex-mode`; not yet consumed by any call site until `0076_02_run-at-model-codex-tier-consume`. |
| `roles.main` | `claude` \| `codex` | `claude` | Which agent plans/implements; the reviewer is the other one. When no layer sets it, the `PTP_MAIN_AGENT` env var is read. |
| `review.maxIterations` | integer ≥ 1 | `5` | Iteration cap per review loop (each `-full` phase gets its own). |
| `review.minSeverity` | `low` \| `medium` \| `high` \| `critical` | `low` | Lowest severity that gets fixed and counted toward convergence. Lower findings are reported only. |
| `review.autoRecutOnBudgetExceeded` | boolean | `false` | `/ptp:full`'s (and `/ptp:full-plan`'s) plan-convergence gate: on a slice's `ARTIFACT BUDGET EXCEEDED` / `PHASE 2 ARTIFACT BUDGET EXCEEDED`, auto-run `/ptp:plan-multiple <id>` re-cut mode instead of stopping. Capped; falls back to stopping on cap. |
| `tdd` | `advisory` \| `mandatory` | `advisory` | Resolved but not yet consumed by any command until the epic's enforcement slices land. |
| `tdd-plugin` | `superpowers` \| `ptp` | `ptp` | Which TDD skill set governs the run's operating environment. `ptp` (default, incl. unset) runs the PtP-owned skills and requires Superpowers absent or disabled; `superpowers` invokes the restored Superpowers skills and requires it present and enabled. |
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
| `count:{count}` | `/ptp:backlog-run` | How many backlog epics this invocation runs. Positive integer, default `5`. |
| `ticket:<value>` | `/ptp:backlog-run` | Selects a single `Ready` entry to run by its board node id or its exact `title` (double-quote a title containing whitespace, e.g. `ticket:"Add dark mode"`), then stops. Mutually exclusive with `count:{count}`. Owned by the `ptp-backlog-run` skill. |
| `phase:{plan,full}` | `/ptp:backlog-run` | Which flow each taken epic runs. `phase:plan` runs `/ptp:full-plan` only, landing a converged epic on `planned`; `phase:full` (or an absent token) runs the full plan-and-apply flow, landing `in-review`. Enum body, `plan` or `full`; combines freely with `count:{count}` and `ticket:<value>`. Owned by the `ptp-backlog-run` skill. |
| `phase:apply` | `/ptp:backlog-continue` | Switches into apply mode: selects a `planned` epic, drives `/ptp:full-apply` over its already-planned slices, and settles the entry `in-review` on convergence or `blocked` on halt. Enum body, exactly `apply`; any accompanying text is passed verbatim as a brief to the apply work. Owned by the `ptp-backlog-continue` skill. |
| `model:<model>.<effort>` | `/ptp:brainstorm`, `/ptp:prd`, `/ptp:brainstorm-full`, `/ptp:prd-full`, `/ptp:analyze`, `/ptp:prompt`, `/ptp:prompt-fix`, `/ptp:prompt-write` | Overrides the target model/effort for this invocation. |
| `codex-model:<model>--<effort>` | `/ptp:brainstorm`, `/ptp:prd`, `/ptp:brainstorm-full`, `/ptp:prd-full`, `/ptp:analyze`, `/ptp:prompt`, `/ptp:prompt-fix`, `/ptp:prompt-write` (same commands as `model:`; parse step not yet wired into those command files — see `skills/ptp-run-at-model/SKILL.md`) | Overrides the Codex model/reasoning-effort for this invocation, but only when `main=codex` resolves; a no-op under `main=claude`. Effort ∈ `{minimal, low, medium, high}`. |
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
| `/ptp:prd [selector \| "<description>"]` | Writes an epic PRD to `prd.md` in the change folder. A free-text description allocates a fresh epic. Omit for all active epics. |
| `/ptp:prd-full <epic-selector>` | `/ptp:prd` then the dual-reviewer inline-fix PRD loop, in one flow. |
| `/ptp:review-prd [epic-selector]` | Read-only PRD-quality gate. Reports PASS / WARN / FAIL. |
| `/ptp:codex-review-prd <epic-selector>` | Codex single-pass PRD audit. Read-only. |
| `/ptp:codex-review-prd-loop <epic-selector>` | Codex PRD review + inline fixes, looped to convergence. |
| `/ptp:review-prd-full [epic-selector]` | Dual-reviewer inline-fix PRD loop; edits the PRD, writes one marker per epic. |

### Prompt

| Command | Does |
|---------|------|
| `/ptp:prompt "<free text>"` | Restates the assistant's understanding of a request conversationally; writes no file. |
| `/ptp:prompt-fix "<correction>"` | Corrects the understanding held from a prior `/ptp:prompt` turn in this conversation, then restates it. |
| `/ptp:prompt-write [change-id \| selector]` | Persists the conversation's accumulated `/ptp:prompt` understanding to `prompt.md` — into the resolved existing change, or a freshly allocated one. |

### Brainstorm

| Command | Does |
|---------|------|
| `/ptp:brainstorm "<request>"` | 2–3 options with tradeoffs + a recommendation into `brainstorm.md` in the change folder. |
| `/ptp:brainstorm-only "<topic>"` | Same, change-agnostic, into `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`. |
| `/ptp:review-brainstorm [selector]` | Read-only brainstorm-quality gate. PASS / WARN / FAIL. |
| `/ptp:review-brainstorm-full [selector]` | Dual-reviewer read-only brainstorm audit with a combined verdict. Never edits. |
| `/ptp:brainstorm-full "<request>"` | Brainstorm then the dual-reviewer inline-fix review loop, in one flow. |

### Plan

| Command | Does |
|---------|------|
| `/ptp:plan [change-id]` | Writes `proposal.md`, `tasks.md`, `effort.md` (one `{model}.{effort}` line), and the spec deltas, plus `design.md` only when the change carries non-obvious decisions or invariants, then runs `npx -y openspec validate <id> --strict`. |
| `/ptp:plan-multiple <request \| id>` | Decomposes oversized work into slices under one epic and runs `/ptp:plan` per slice. |
| `/ptp:brainstorm-decompose <request \| id>` | Decomposes oversized work into slices under one epic and runs `/ptp:brainstorm` per slice, seeding each with only a `brainstorm.md` — leaving `/ptp:plan` per slice for later. |
| `/ptp:review-plan [change-id]` | Read-only artifact-quality gate over proposal/design/tasks/spec deltas. Flags any `tasks.md` task needing manual QA, manual testing, or any human executor as **High**. Reports PASS / WARN / FAIL; advisory. |
| `/ptp:review-plan-loop <selector>` | Main-agent artifact review + inline fixes, looped to convergence. |
| `/ptp:review-plan-full <selector>` | Dual-reviewer artifact loop: the resolved main agent to convergence, then the resolved reviewer to convergence. |
| `/ptp:codex-review-plan <selector>` | Codex single-pass artifact review. |
| `/ptp:codex-review-plan-loop <selector>` | Codex artifact review + fixes, looped. |
| `/ptp:effort <change-id>` | Prints the recommended model + effort for `/ptp:apply`. |

### Apply and review

| Command | Does |
|---------|------|
| `/ptp:apply <selector>` | Implements `tasks.md` sequentially with TDD discipline, checking off each task after verifying it. Runs at the model/effort in `effort.md`. |
| `/ptp:review <selector>` | Main-agent code review of the diff against the artifacts. Findings Critical / High / Medium / Low. |
| `/ptp:review-loop <selector>` | `/ptp:review` + inline fixes until no findings at or above `review.minSeverity`, or the cap. |
| `/ptp:review-full <selector>` | Dual-reviewer code loop: the resolved main agent to convergence, then the resolved reviewer to convergence. |
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
| `/ptp:archive-and-merge-to-master <selector>` | Same as `/ptp:archive-and-deploy`, but the convergence-gated final step is a merge-only run (`ptp-deploy` mode `merge-only`, no deploy workflow) instead of a full deploy. Accepts `epic:all`. Refuses on `master`/`main`; never self-approves. |
| `/ptp:deploy-master` | Triggers the deploy workflow against the current `master`. No commit/push/PR/merge. Requires a clean tree on `master`/`main`. |
| `/ptp:master` | `git switch master && git pull --ff-only`, only when the working tree is clean. |

### Status, plugin, experimental

| Command | Does |
|---------|------|
| `/ptp:status [change-id]` | Active changes, validation status, task progress, recommended next command. |
| `/ptp:analyze "<bug \| question>"` | Read-only investigation → `analysis.md` in the change folder. Produces no proposal, changes no source. |
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
| `/ptp:backlog` | Read-only. Board header, entries table with title, statuses, and each entry's GitHub board node id, the ready set in run order with the same title and node id (or why it is withheld), stale flags, validation problems. Never a human issue/PR number. Creates nothing. |
| `/ptp:backlog-add "<epic description>"` | Adds one entry, parked in `Backlog`. Not run until you move it to `Ready`. Touches no other entry. |
| `/ptp:backlog-add-multiple "<free-text request>"` | Takes one free-text request, segments it into several deliverable epics, and creates one entry per epic, each parked in `Backlog`. Autonomous. |
| `/ptp:backlog-draft-to-ready` | Promotes every `Backlog` (parked) entry to `Ready` in one invocation. Touches no entry in any other status. Autonomous. |
| `/ptp:backlog-edit <node-id> "<what to change>"` | Edits one entry's title/description/notes and status along the transition table. Also the recovery path for an entry stuck `in-progress` (dispositions: claim → `blocked`, disown / rerun anyway → `ready`, plus per-prefix promote/dismiss). |
| `/ptp:backlog-run [count:{count}] [ticket:<value>] [phase:{plan,full}]` | Runs the `Ready` entries through `/ptp:full`, top-first, 5 per invocation by default. Marks each `in-progress`, records the change ids it produced, leaves converged epics `in-review`, and halts the whole run on the first non-convergence, marking that epic `blocked`. The optional `ticket:<value>` selector (owned by the `ptp-backlog-run` skill) instead runs a single `Ready` entry chosen by board node id or exact title, then stops; it is mutually exclusive with `count:{count}`. The optional `phase:{plan,full}` token (owned by the same skill) picks which flow each epic runs: `phase:plan` runs `/ptp:full-plan` only and lands a converged epic on `planned`, while `phase:full` or an absent token runs the full flow and lands `in-review`; it combines freely with `count:{count}` and `ticket:<value>`. Never commits, pushes, merges, archives, or deploys. |
| `/ptp:backlog-continue [phase:apply] ["<what went wrong>"]` | Bare: finishes the `blocked` or `in-review` epic — signs off remaining tasks, re-runs validate/build/tests, archives, and only then writes `done`. Never re-runs `/ptp:review-full`: `/ptp:full` already drove code review to convergence for the change before it could reach `blocked`/`in-review`. Per `ptp-backlog`, `blocked` is missing the human verification and `in-review` is missing the archive. With free text: one scoped fix pass against the same change, with no status change, no review, and no archive. With `phase:apply`: selects a `planned` epic and drives `/ptp:full-apply` over its slices, settling `in-review` on convergence or `blocked` on halt, with any accompanying text passed verbatim as a brief. |

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

Run `node scripts/ptp-test.js <change-id>` to run the repository's dogfooding suite — the skill
behavior tests, the prompt-surface budgets, the OpenSpec skill-sync check, and the compact-artifact
lint for that change — in one pass, non-zero on any failure.

Every write-capable command runs a branch guard first: on `master` it stashes, pulls, and cuts a fresh `ptp/<…>` branch before writing anything.

---

## Quick-reference card

```
Whole thing at once
  → /ptp:full "<request>"             # plan + dual plan-review → apply + dual code-review
  → /ptp:full-plan "<request>"        # planning half only
  → /ptp:full-apply [sel | id …]      # execution half only

Step by step
  → /ptp:prompt "<request>" | /ptp:prompt-fix "<correction>"  # conversational, writes no file
  → /ptp:prompt-write [change-id | selector]                  # persist the conversation to prompt.md
  → /ptp:prd [<sel>] | /ptp:prd-full <sel> | /ptp:review-prd[-full] [<sel>]
  → /ptp:analyze "<subject>"          # read-only investigation → analysis doc
  → /ptp:brainstorm "<request>" | /ptp:brainstorm-only "<topic>" | /ptp:brainstorm-full "<request>"
  → /ptp:review-brainstorm[-full] [<sel>]
  → /ptp:plan [change-id] | /ptp:plan-multiple <request> | /ptp:brainstorm-decompose <request>
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
  → /ptp:archive-and-merge-to-master <sel>  # archive in story order → merge-only once if all passed
  → /ptp:deploy-master | /ptp:master

Epic backlog
  → /ptp:backlog                              # entries (title, GitHub board node id), statuses, ready set, problems
  → /ptp:backlog-add "<epic request>"         # one new entry, parked in Backlog
  → /ptp:backlog-add-multiple "<request>"     # several new entries, parked in Backlog
  → /ptp:backlog-draft-to-ready               # promotes every Backlog entry to Ready
  → /ptp:backlog-edit <node-id> "<change>"    # fields, transitions, recovery
  → /ptp:backlog-run [count:{count}] [ticket:<value>] [phase:{plan,full}]  # Ready epics through /ptp:full, or plan-only with phase:plan
  → /ptp:backlog-continue [phase:apply] ["<what broke>"]  # finish, one scoped fix pass, or phase:apply a planned epic

Telemetry (telemetry.mode = on)
  → /ptp:telemetry status | report [write] [sel] | analyze | setup | start | stop | export

Where am I / plugin
  → /ptp:status [change-id] | /ptp:effort <change-id> | /ptp:config
  → /ptp:workspace-init                        # make the current directory a workspace
  → /ptp:version | /ptp:update

Selectors        epic:all | epic:0021 | epic:0021 story:01 | story:01 | <bare-id> | (omit = all)
Switches         fast:on|off · count:{n} · ticket:<value> · phase:{plan,full} · model:<model>.<effort> · parallel:on|off
Experimental     /opsx:explore | /opsx:propose | /opsx:apply | /opsx:archive
```

## Changelog

| **0.16.1** | Adds a phase split to the backlog commands and skills, so an epic can be planned now and applied later. Adds a new `planned` backlog status to the `ptp-backlog` skill — its status enum, board-mapping option table, validator vocabulary, and transition table gain the rows `in-progress → planned`, `planned → in-review`, and `planned → blocked`, with `planned → cancelled` riding the existing `any → cancelled` row (0079_01). Adds a per-invocation `phase:{plan,full}` token to `/ptp:backlog-run`, owned by the `ptp-backlog-run` skill: `phase:plan` runs each ready epic through `/ptp:full-plan` (plan and dual review only) and lands a converged epic on `planned` instead of `in-review`; `phase:full` is an explicit synonym for the default full plan-and-apply run; an absent token is unchanged; an out-of-enum value refuses; the token combines freely with `count:{count}` and `ticket:<value>`; and the terminal report tells a deliberate stop at `planned` apart from a failure to converge (0079_02). Adds a `phase:apply` mode to `/ptp:backlog-continue`, owned by the `ptp-backlog-continue` skill: it selects a `planned` entry, drives `/ptp:full-apply` over that epic's already-planned slices, writes `planned → in-review` on convergence and `planned → blocked` on a halt, and carries any accompanying issue text verbatim as a brief to the apply work; a later bare `/ptp:backlog-continue` still takes `in-review → done` (0079_03). |
| **0.16.0** | Renames the `/ptp:backlog-run` per-invocation token from the former `rounds` prefix to `count:{count}`, updating `skills/ptp-backlog-run/SKILL.md`, `commands/backlog-run.md`, this README, and the cross-reference files that name the token (`skills/ptp-backlog/SKILL.md`, `skills/ptp-backlog-continue/SKILL.md`, and `commands/effort.md`). Vocabulary-only — the underlying behavior, the round cap, and the `rounds exhausted` terminal state are unchanged (0078_01). Also adds an optional `ticket:<value>` selector to `/ptp:backlog-run`, owned by the `ptp-backlog-run` skill: it runs a single `Ready` entry chosen by board node id or exact title (double-quoted when it contains whitespace), resolves id-first-then-title against the recomputed ready set, refuses a non-ready or ambiguous value, is mutually exclusive with `count:{count}`, and runs as a degenerate single-iteration loop with the effective cap fixed at 1 so no new loop-terminal state is added (0078_02). Also updates `/ptp:backlog`'s rendered view so every entry (entries table and ready set) shows its ticket `title` and its GitHub board node id — labeled as such and never presented as a human issue/PR number — in `commands/backlog.md`, `skills/ptp-backlog/SKILL.md`, and this README (0078_03). |
| **0.15.1** | Extends `## 4. Prose readability` in the contract owner `skills/ptp-artifact-contract/SKILL.md` with two more rules for every change-folder markdown file: a blank line between every prose line, and plain junior-developer English. States that a blank or empty line never counts toward a word, line, or size budget. The blank-line rule binds prose paragraphs only — not list items (including `tasks.md` checkboxes and their continuation lines), fenced code, or table cells (0077_03). |
| **0.15.0** | Adds `/ptp:backlog-add-multiple`, a new `ptp-backlog`-owned command that takes one free-text request describing several epics, segments it autonomously into N deliverable-epic descriptions, and creates one backlog entry per description — each its own operation of the existing ordered write sequence (create, then `status: backlog` as the single commit), reusing `/ptp:backlog-add`'s persistence path with no new transport surface. Fail-stops across operations on the first that does not settle, naming what already landed (0077_01). Also adds `/ptp:backlog-draft-to-ready`, a new `ptp-backlog`-owned command that reads the board, enumerates every `Backlog` (parked) entry, and promotes each to `Ready` in its own operation, becoming a second performer of the `backlog` → `ready` row alongside `/ptp:backlog-edit`; a board with no `Backlog` entry is a reported no-op (0077_02). |
| **0.14.4** | `ptp-run-at-model`'s `main==codex` direction now sources model/effort by **command tier** instead of the flat `codex.model`/`codex.reasoningEffort` pair: a caller's `sonnet.medium` target reads `codex.mechanical.*`, an `opus.high` target reads `codex.judgment.*` (both from `0076_01`), with a forgiving fallback to the flat pair when a tier key is missing/malformed or the target is not one of those two literals — the `effort.md` apply arm is untouched. The "No new config keys" hard rule is overturned to sanction the tier keys as primary with the flat pair as fallback, and the parallel "effort is a prompt directive" phrasing is de-hardcoded to match (0076_02). |
| **0.14.3** | `/ptp:full` / `/ptp:full-apply` now dispatch each story's apply and review Codex work at the **same** target `/ptp:apply` resolves, closing the drift where the full family fell back to flat `codex.model`/`codex.reasoningEffort`. The two launchers (`skills/ptp-full-apply/SKILL.md`, `skills/ptp-full/SKILL.md` Phase B) resolve `roles.main` once and, under `main=codex`, add four optional per-story `args.stories` fields — `codexApplyModel`/`codexApplyEffort` (the apply target, resolved exactly as `ptp-run-at-model`'s `main==codex` branch resolves `/ptp:apply`: the story's own Codex `effort.md` line preferred, else the tier default, else flat `codex.*`) and `codexReviewModel`/`codexReviewEffort` (the judgment tier default, else flat `codex.*`), consumed by reference and never restated. `workflows/ptp-full-apply.js` reads them forgivingly and injects a Codex dispatch directive (new `codexDispatchDirective` helper) into the apply prompt, the first review prompt, and the escalated re-spawn; `agents/ptp-apply.md` and `agents/ptp-review.md` prefer that prompt-supplied target over resolving flat `codex.*`. Under `main=claude` no fields are added and every prompt stays byte-identical (0076_05). |
| **0.14.2** | `ptp-run-at-model` gains an optional per-invocation `codex-model:<model>--<effort>` override token, the `main=codex` sibling of the existing `model:<model>.<effort>` token: it overrides the Codex model/reasoning-effort *The `main=codex` direction* would otherwise resolve (tier-based sourcing, or the `effort.md` line-2 apply arm), for a single invocation, but only takes effect when `ptp-agent-roles` resolves `main=codex` — a no-op under `main=claude`, symmetric with `model:`'s own no-op under `main=codex`. Effort ∈ `{minimal, low, medium, high}`; the delimiter is `--`, not `.` (0076_04). |
| **0.14.1** | `/ptp:effort` now writes `effort.md` as **two lines**: line 1 the unchanged Claude `{model}.{effort}` recommendation, line 2 a Codex `{codex-model}--{codex-effort}` recommendation `/ptp:apply` consumes when `roles.main=codex`. Both lines are written on every apply run regardless of `roles.main`, so the file stays role-agnostic and apply-mode `/ptp:effort` never resolves `roles.main`. The Codex model resolves from the new config triple `codex.effortRubricModels.{low,mid,high}` (`haiku→low`, `sonnet→mid`, `opus→high`), read fresh each run with a forgiving posture; an unset slot leaves the model blank so Codex's own CLI default applies, and `xhigh` caps to Codex `high`. `ptp-run-at-model`'s `main==codex` apply branch now prefers line 2 (split on the last `--`) over the command-tier default, falling back to it when line 2 is absent or unparseable (epic 0076_03). |
| **0.14.0** | Add four resolve-only layered-config keys — `codex.mechanical.model`, `codex.mechanical.reasoningEffort`, `codex.judgment.model`, `codex.judgment.reasoningEffort` — letting a caller later pick a cheaper model for mechanical Codex work and a stronger one for judgment-heavy Codex work, independently of the existing flat `codex.model`/`codex.reasoningEffort` pair. `ptp-codex-mode` resolves them with the same forgiving-reader posture (default unset, independent, never throw/STOP on a typo); no call site consumes them yet — `0076_02_run-at-model-codex-tier-consume` is the first consumer (0076_01). |
| **0.13.1** | Adds a `## 4. Prose readability` section to the contract owner `skills/ptp-artifact-contract/SKILL.md` (renumbering the prior `## 4` version section to `## 5`), stating two authoring rules for every change-folder markdown file: short one-point sentences, and two spaces between sentences within a prose paragraph. The rule is authoring style, not linter-enforced — it changes no artifact's meaning or word budget, and no derived surface is required to restate it (0074_01). |
| **0.13.0** | Epic 0073 turns PtP's Superpowers relationship into a `tdd-plugin`-keyed switch: `tdd-plugin=ptp` (default, incl. unset) runs only PtP-owned skills and requires Superpowers absent or disabled, while `tdd-plugin=superpowers` invokes the restored Superpowers skills with their output, auto-commit, and approval-gate defaults overridden to PtP's autonomous, workspace-relative targets (selecting it without the plugin present and enabled is a hard stop). Adds the executable conditional invocation gate `scripts/ptp-superpowers-invocation-gate.js`, a conditional Superpowers prerequisites row, and the two-environment migration note; closes the epic (0073_07). |
| **0.12.0** | The prompt family now wraps its work through `ptp-run-at-model` and accepts the caller-side `model:<model>.<effort>` override token (epic 0071). `/ptp:prompt` and `/ptp:prompt-fix` run their restatement in one foreground `ptp-run-at-model` main run at a resolved target (`opus.high` by default) instead of inline in the main session; `AskUserQuestion` moves to the outer session, asked only after the main run's restatement is relayed. `/ptp:prompt-write` runs its `prompt.md` write the same way, with the `model:` parse-and-strip, its STOP preconditions, the change resolution/allocation, and the branch guard all still running in the outer session before the main run starts (0071_01). |
| **0.11.1** | `/ptp:analyze` now always allocates a fresh change folder for its analysis doc instead of routing onto an existing active change by scope overlap; `skills/ptp-analyze/SKILL.md` and `skills/ptp-change-selector/SKILL.md` (§4, §5 Role A) are updated so `/ptp:analyze` is a pure producer, never a hybrid one. |
| **0.11.0** | Add `/ptp:brainstorm-decompose` (epic 0070): a decompose-plus-brainstorm-only variant of `/ptp:plan-multiple` that cuts an oversized request into slices under one freshly allocated epic and seeds each slice's change folder with only a scoped `brainstorm.md` — never `proposal.md` / `design.md` / `tasks.md` / spec deltas / `effort.md` — leaving those to a later `/ptp:plan <slice-id>` per slice. It reuses `/ptp:plan-multiple`'s three-beat structure and Beat-2 return grammar verbatim (citing it as owner), swapping only the per-slice writer (`/ptp:brainstorm` in place of `/ptp:plan`) and the sentinel tokens (`BRAINSTORM-DECOMPOSE-SLICES` / `BRAINSTORM-DECOMPOSE-FALLBACK`); it carries no re-cut mode, no preserve/delete step, and no `model:` override token, since an existing input change is read-only and never modified or deleted (0070_01). |
| **0.10.0** | Close a real-browser render-affecting gap in TDD, planning, and completion evidence (epic 0069), after a change whose jsdom test and closed-book review both passed while a real browser's CSS cascade silently dropped the intended visual effect. `skills/ptp-test-driven-development/SKILL.md` adds a "Render-affecting change" clause defining the trigger (CSS specificity/cascade, grid/flex templates, custom-property-driven values, post-layout-only output) and requiring the RED test to run in a real browser engine asserting computed output — a jsdom/happy-dom pass is not evidence for such a task (0069_01). `skills/ptp-writing-plans/SKILL.md`'s testability-shape rule is extended so a render-affecting checkbox's `verify:` clause must name a browser-engine test file and case; automated browser tests are allowed and the "no manual tasks / no 'check in the browser'" ban is unchanged (0069_02). `skills/ptp-verification-before-completion/SKILL.md` adds `VBC-9`: for render-affecting work, a completion claim's evidence MUST include the browser assertion's GREEN output — a LOCAL completion gate, never a CI one (0069_03). |
| **0.9.0** | New conversational prompt-drafting flow (epic 0068): `/ptp:prompt` restates the assistant's understanding of a free-text request directly in the main session, writing no file; `/ptp:prompt-fix` corrects that understanding across further turns in the same conversation; both are owned by a new `ptp-prompt-draft` skill and neither runs the branch guard nor `ptp-run-at-model` (0068_01). `/ptp:prompt-write` persists the accumulated understanding to `prompt.md` — into an existing change resolved via `ptp-change-selector`, or a freshly allocated epic otherwise — as a hybrid producer/consumer, per a new `ptp-prompt-write` skill; it never auto-invokes a downstream producer (0068_02). `/ptp:full` now materializes an existing `prompt.md` into `brainstorm.md` before decomposing, but only when the target folder holds neither `brainstorm.md` nor `proposal.md` yet — richer planning artifacts always take precedence and are left untouched; `/ptp:plan`, `/ptp:brainstorm`, `/ptp:plan-multiple`, and `/ptp:analyze` are unchanged (0068_03). |
| **0.8.0** | Make `roles.main=codex` work end to end (epic 0067); a minor bump because the epic is additive and backward-compatible — at the default `roles.main=claude` every existing flow stays byte-identical per every prior slice's own proposal. (1) The workflow apply agent `agents/ptp-apply.md` resolves the `{main,reviewer}` role pair via `ptp-agent-roles` and branches: at `main=codex` it delivers the same apply protocol to a write-capable `codex exec -s workspace-write` shell-out (model/effort from `codex.model`/`codex.reasoningEffort`) instead of implementing in-session, so `/ptp:full`, `/ptp:full-apply`, and `/ptp:backlog-run` honor `roles.main=codex` on the apply stage, and a new `scripts/ptp-resolve-roles.js` is the resolver's executable embodiment (0067_01). (2) The `ptp-review-loop` `reviewer` input is redefined to name the review dispatch that runs the pass (`ptp` = in-session PTP/Claude dispatch, `codex` = read-only `codex exec` dispatch), not the main-vs-reviewer phase, resolving the contradiction with what the `-full` orchestrators already pass under `roles.main=codex` (0067_02). (3) The review-loop `inline` fix dispatch becomes role-aware: under `roles.main=codex` the fix edits are performed by the Codex main via a write-capable `codex exec` shell-out while the Claude reviewer edits nothing (0067_03). (4) Each `ptp-run-at-model` caller that wraps Skill-tool or slash-command work now documents its own Codex work-prompt delivery — the PTP-owned files delivered to the `main=codex` main run, the `ptp-skill-contract` delivery mode, and the transitive closure (0067_04). (5) The single-pass review commands (`/ptp:review`, `/ptp:review-plan`, `/ptp:review-brainstorm`, `/ptp:review-prd`, `/ptp:review-loop`, `/ptp:review-plan-loop`) resolve `{main,reviewer}` and run the resolved main agent's read-only pass instead of hardcoding a Claude pass or `reviewer=ptp` (0067_05). |
| **0.7.2** | Trigger-scoped two operation-scoped sections out of always-loaded `SKILL.md` bodies to trim per-invocation prompt latency (epic 0066): `skills/ptp-github-projects-gh/SKILL.md`'s "The content-body mutation route" section moved verbatim into `skills/ptp-github-projects-gh/references/content-body-mutation-route.md`, loaded only when writing a title/body onto a non-draft board item, with its three anchor citations re-pointed; and `skills/ptp-backlog/SKILL.md`'s historical "What `0036_01` did not ship" scope note moved verbatim into `skills/ptp-backlog/references/slice-0036_01-scope-note.md`, loaded only when auditing that slice. Both moves are byte-identical relocations behind the existing `prompt-compaction` trigger-scoping pattern; no behavior changes (0066_01). |
| **0.7.1** | `/ptp:analyze` now accepts the optional `model:<model>.<effort>` override token (epic 0065), the same per-invocation opt-out-of-default mechanism already supported by `/ptp:brainstorm`, `/ptp:prd`, `/ptp:brainstorm-full`, and `/ptp:prd-full`: an absent token keeps the `opus.high` default, a valid token overrides the target for that invocation only, and an invalid or duplicate token STOPs before the branch guard or any spawn — parsed in `skills/ptp-analyze/SKILL.md`'s outer session, ahead of the branch guard, per the grammar owned by `skills/ptp-run-at-model/SKILL.md` (0065_01). |
| **0.7.0** | New top-level `tdd` config key (`advisory` \| `mandatory`, default `advisory`, epic 0064) that makes ptp's TDD discipline enforceable; the enforcement gates activate only under `mandatory`, and the `advisory` default breaks nothing a consumer depends on. (1) Under `mandatory`, apply MUST load `ptp-test-driven-development` for any task touching executable code (advisory keeps the existing MAY), and one shared test-first sentence is mirrored into both apply paths, `agents/ptp-apply.md` and `commands/apply.md` (0064_02). (2) The apply stage record gains an optional per-task `tests` array recording RED/GREEN evidence (or a `prose contract` exemption); under `mandatory` an executable-code task with neither RED evidence nor a valid exemption may not be checked off — the executor returns `blocked` (0064_02). (3) The review-loop step-`(c1)` missing-test drop is narrowed: under `mandatory` a finding naming a specific spec requirement (its spec file and requirement name) survives, while a vague "needs more tests" with no pointer is still dropped — mirrored into `commands/codex-review.md` (0064_03). (4) `ptp-writing-plans` requires each checkbox to state its testability — a `verify:` clause naming the specific test file and case for behavior-changing work, or a literal `[prose-exempt: <reader>]` marker for prose-only work — and `review-plan` flags a behavior-changing checkbox carrying neither shape (High under `mandatory`, Medium under `advisory`) (0064_04). (5) Reviewers gain a rubric line: under `mandatory`, a `scripts/` / `workflows/` diff whose `tasks.md` or apply stage-record carries prose-exemption **evidence** — the literal `RED: not applicable — prose contract` line, or the apply record's closed `exempt: "prose contract"` entry — is a **High** finding; the detector matches only that evidence form and explicitly excludes the unrelated `[prose-exempt: <reader>]` planner marker from item (4) (0064_03). (6) A new `scripts/ptp-test.js` single entry point (skill-behavior tests, prompt-budget check, openspec-skill sync check, compact lint) is wired into apply's final verification when the workspace root is the ptp repo itself (0064_02). (7) `commands/effort.md`'s dead "fine-grained TDD steps" round-down signal is retired and replaced with a live one — round the effort dial down when every behavior-changing checkbox already names its test case (0064_04). |
| **0.6.2** | New `/ptp:archive-and-merge-to-master <selector>` command + `ptp-archive-and-merge-to-master` skill (epic 0063): the same archive-then-ship chaining as `/ptp:archive-and-deploy` — Phase A archives each resolved change through the unweakened `/ptp:archive` gates in story order, gated by the same all-or-nothing archive-convergence gate — but Phase B runs `ptp-deploy` in `merge-only` mode (start phase `commit`, the same mode `/ptp:merge-to-master` drives) instead of a full deploy, so the deploy workflow never runs. `/ptp:archive-and-deploy` and every other command are unchanged (0063_01). |
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
| **0.2.35** | BREAKING — the per-kind review-convergence marker family moves from the change folder's `reviews/` to `stages/`, joins a six-kind stage-record family with new `apply`/`archive` lifecycle records, scopes the `code` marker's content fingerprint to the reviewed change's own diff footprint instead of the whole working tree, and clarifies `in-review` semantics (epic 0054). |
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
| **0.1.32** | Relocate PRD artifacts into the change folder: `/ptp:prd` now writes `prd.md` in the change folder (where `<id>` is the epic's lowest-numbered story) instead of a standalone `openspec/prds/` folder; |
| **0.1.31** | Add the PRD-stage orchestrators `/ptp:review-prd-full` (dual-reviewer inline-fix PRD loop) and `/ptp:prd-full` (author → gate → review in one flow). |
| **0.1.30** | Add the PRD-review family — `/ptp:review-prd` command + `ptp-review-prd` skill (read-only single-pass Superpowers PRD-quality gate), `/ptp:codex-review-prd` (closed-book Codex PRD audit), and `/ptp:codex-review-prd-loop` (Codex PRD inline-fix loop). |
| **0.1.29** | Add `/ptp:prd` command + `ptp-prd` skill. |
| **0.1.26** | Add `/ptp:brainstorm-full` command + `ptp-brainstorm-full` skill — seam-free union of `/ptp:brainstorm` and `/ptp:review-brainstorm-full` in one uninterrupted flow (brainstorm → brainstorm-gate → dual-reviewer inline-fix review loop). |
| **0.1.25** | Add `/ptp:review-brainstorm-full` command + `ptp-review-brainstorm-full` skill — inline-fix dual-reviewer convergence loop (Superpowers + Codex) for brainstorm artifacts; |
| **0.1.24** | Convert `/ptp:review-brainstorm-full` to inline-fix convergence loop (replaces read-only dual-reviewer). |
| **0.1.23** | Add `/ptp:review-brainstorm-full` dual-reviewer read-only brainstorm audit command. |
| **0.1.22** | Add `/ptp:review-brainstorm` command + `ptp-review-brainstorm` skill — read-only Superpowers brainstorm-quality gate. |
| **0.1.21** | Add `ptp-codex-mode` skill — single source of truth for `codex.mode` resolution and Codex phase gating across all dual-reviewer commands. |
