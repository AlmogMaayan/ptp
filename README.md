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
- **Workflow-backed runs.** `/ptp:full-run` launches a deterministic workflow (the plugin's `workflows/`, resolved by name) that runs `apply → review-full` per story sequentially, each apply agent at the model recommended by that story's `effort.md`.
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
    "mode": "auto"
  }
}
```

### `codex.mode`

Controls whether the external Codex CLI is used as the second reviewer.

| Mode | Dual-reviewer orchestrators<br>(`/ptp:review-full`, `/ptp:review-plan-full`, `/ptp:full-run`, `/ptp:full`) | When `codex` is **not** on PATH |
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

### `/ptp:config` — guided config editor

**`/ptp:config`** is the interactive front door for editing these config files. Instead of
hand-editing JSON, it walks you through:

1. **Target** — choose *User / global* (`~/.claude/ptp/config.json`) or *Project*
   (`<repo>/.claude/ptp/config.json`).
2. **Parameter** — currently only `codex.mode` ("Use Codex for review"); the menu grows as the
   registry grows.
3. **Value** — select from the valid enum values with one-line descriptions.

The command then performs a **safe merge-write**: it sets only the targeted key (`codex.mode`),
preserves every other existing key (including the `deploy` block), creates the parent directory
and file if absent, and refuses to overwrite a malformed or wrong-shape JSON file. It echoes the
absolute path written and the new value. It **never commits, pushes, or stages** the change.

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

This is what lets `/ptp:full-run epic:0021` apply-and-review an entire epic's worth of stories in one go.

---

## The autonomous `full` family (the headline)

These three commands turn a description into reviewed code with minimal hand-holding. All can use the Codex CLI as the second reviewer — governed by `codex.mode` (default `auto`; see [Configuration](#configuration)).

**`/ptp:full "<request-or-big-change-id>"`** — the whole pipeline in one call. Runs the plan phase (decompose into slices + dual plan-review each slice), and **only if every slice's plan converges**, continues without stopping into the run phase (apply + dual code-review each story). Never archives. This is the union of the two commands below.

**`/ptp:full-plan "<request-or-big-change-id>"`** — the **read-only planning** half. Decomposes the work into independently-shippable slices (`/ptp:plan-multiple`) and runs the full two-phase (Superpowers + Codex) artifact review on every slice. Never applies code, never archives. Next step is `/ptp:full-run`.

**`/ptp:full-run [selector | id …]`** — the **execution** half. Launches the `ptp-full-run` workflow, which runs `apply → review-full` per story **sequentially** — one story fully finished before the next. Each story's apply agent runs at the model from its `effort.md`; review always runs at `opus.high`. Pass a selector/id list, or omit to run all active changes (with a one-time scope confirmation).

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
| `ptp-full` | Orchestrates `/ptp:full` — the plan phase, the plan-convergence gate, and the seam into the run phase. |
| `ptp-full-run` | The workflow-backed sequential `apply → review-full` per-story engine behind `/ptp:full-run`. |
| `ptp-review-brainstorm` | The brainstorm-review rubric/protocol the thin `/ptp:review-brainstorm` command delegates to: locate the brainstorm (change-scoped preferred, deterministic general fallback), the rubric, Critical/High/Medium/Low classification, the PASS/WARN/FAIL verdict, the report + next-step — read-only, no `openspec validate`. |
| `ptp-review-brainstorm-full` | The dual-reviewer **report-only** brainstorm-review contract the thin `/ptp:review-brainstorm-full` command delegates to: composes the `ptp-review-brainstorm` rubric for Phase 1 (Superpowers), gates Phase 2 on a located brainstorm, runs a Phase 2 Codex closed-book read-only pass (mode-gated per `ptp-codex-mode`), and emits the combined verdict — no inline fixing, no iteration cap, no `openspec validate`, never edits the brainstorm. |
| `ptp-brainstorm-full` | Two-phase brainstorm → dual-reviewer-review orchestration behind `/ptp:brainstorm-full`. Receives the already-allocated id, resolved `codex.mode`, and branch-guard from the command's outer session. Phase A: `ptp-run-at-model` at `opus.high` runs brainstorm steps 2–7 (producing `brainstorm.md`; step 8 STOP suppressed). Brainstorm-gate: missing `brainstorm.md` → STOP. Phase B: `ptp-run-at-model` at `opus.high` runs `ptp-review-brainstorm-full` with pre-resolved `codex.mode`. Relays all four terminal states accurately. |
| `ptp-review-prd` | The PRD-review rubric/protocol the thin `/ptp:review-prd` command delegates to: locate the epic PRD via the `ptp-prd` selector→epic projection + `<slug>`-from-lowest-story rule, the rubric (schema completeness, testable acceptance criteria, requirements→goals tracing, scope/non-goal consistency), Critical/High/Medium/Low classification, the PASS/WARN/FAIL verdict, the report + next-step — read-only, epic-scoped, no `openspec validate`. |
| `ptp-review-prd-full` | The dual-reviewer **inline-fix** PRD-review contract the thin `/ptp:review-prd-full` command delegates to: Phase 1 Superpowers `kind=prd` loop (driving `ptp-review-loop`, `deferMarker=true`), the convergence-based Phase-1-gates-Phase-2 gate, Phase 2 Codex `kind=prd` loop (mode-gated per `ptp-codex-mode`, `deferMarker=true`), a single combined marker write to `openspec/changes/<id>/reviews/prd.json`, and the combined terminal state — edits the PRD inline, no `openspec validate`, never archives/commits/regenerates the PRD. |
| `ptp-prd-full` | Two-phase PRD author → dual-reviewer-review orchestration behind `/ptp:prd-full`. Receives the resolved epic, original selector, and resolved `codex.mode` from the command's outer session. Phase A: `ptp-run-at-model` at `opus.high` runs `ptp-prd` (writing `openspec/changes/<id>/prd.md`; the `/ptp:prd` STOP suppressed). prd-gate: missing `openspec/changes/<id>/prd.md` → STOP. Phase B: `ptp-run-at-model` at `opus.high` runs `ptp-review-prd-full` with pre-resolved `codex.mode`. Relays all five terminal states accurately; epic-scoped, no `openspec validate`, never archives/commits/re-resolves the epic. |
| `ptp-review-loop` | Shared review→confirm→fix loop protocol (kind ∈ {code, artifact, brainstorm, prd}, reviewer ∈ {superpowers, codex}) behind every `-loop` command, with rejection carry-over and manual/test-only filtering. The `prd` kind targets `openspec/changes/<id>/prd.md` (change-folder co-location, no `openspec validate`, marker `openspec/changes/<id>/reviews/prd.json`). |
| `ptp-archive-force` | The gate-bypassing archive engine behind `/ptp:archive-force` (still syncs delta specs). |

The `openspec-*` skills (`openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`) back the experimental `opsx:` commands.

---

## Quick-reference card

```
Hand it the whole thing (autonomous, dual-reviewed; Codex optional — codex.mode, default auto)
  → /ptp:full "<request>"             # decompose → plan → dual plan-review
                                      #   → apply → dual code-review, per story
  → /ptp:full-plan "<request>"        # planning half only (read-only)
  → /ptp:full-run [selector | id …]   # execution half only (apply + review-full)

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

Experimental (no Superpowers layer)
  → /opsx:explore [topic] | /opsx:propose [name]
  → /opsx:apply [name]    | /opsx:archive [name]
```

---

## Version history

| Version | Changes |
|---------|---------|
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
