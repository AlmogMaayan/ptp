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

### 3. Codex CLI *(optional — second reviewer; configurable)*

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

### Step 0 — Analyze (optional, diagnostic)

**`/ptp:analyze "<bug / observation / problem / question>"`** — read-only investigation. Root-causes a bug, explains an observed behavior, or investigates a subsystem *before* deciding whether a change is even warranted. Writes a structured analysis doc to `openspec/analysis/YYYY-MM-DD-<subject>-analysis.md` with evidence-cited findings, confidence level, and a recommended next step. Never produces a change proposal, never modifies source, never allocates an epic. Use this when you want to understand first and decide later. Contrast with `/ptp:brainstorm-only`, which explores *prospective* design options.

### Step 1 — Brainstorm (optional, interactive)

**`/ptp:brainstorm "<request>"`** — Superpowers brainstorm for a *specific change*. Produces 2–3 options with tradeoffs, recommends one, writes `openspec/changes/<change-id>/brainstorm.md`. Does **not** write proposal/design/tasks.

**`/ptp:brainstorm-only "<topic>"`** — same brainstorm, *change-agnostic* — for exploring a direction before you know the concrete change. Writes to `openspec/brainstorms/YYYY-MM-DD-<topic>-brainstorm.md`; `/ptp:plan` picks it up later.

### Step 2 — Plan (autonomous)

**`/ptp:plan [change-id]`** — end-to-end autonomous planning. Consumes a brainstorm doc if present, else brainstorms inline (no clarifying questions — assumptions are documented). Produces `proposal.md`, `design.md`, `tasks.md`, `TLDR.md`, an `effort.md` model/effort recommendation, and `specs/<capability>/spec.md` deltas when behavior changes. Runs `openspec validate <id> --strict`.

**`/ptp:plan-multiple <request-or-id>`** — multi-change variant. Autonomously decomposes oversized work into slices (`01_…`, `02_…`) under an allocated epic and runs `/ptp:plan` per slice in dependency order. Falls back to a single `/ptp:plan` if splitting isn't warranted.

**`/ptp:review-plan [change-id]`** *(optional, single reviewer)* — artifact-quality gate over `proposal.md` / `design.md` / `tasks.md` / spec deltas *before* any code. Reports PASS / WARN / FAIL. Advisory; does not edit artifacts or block `/ptp:apply`.

**`/ptp:review-plan-loop <selector>`** — loops Superpowers artifact review + inline fixes until zero open findings or the iteration cap.

**`/ptp:review-plan-full <selector>`** — **dual-reviewer** artifact loop: Superpowers loop to convergence, then Codex loop to convergence. Both must sign off on the plan. Uses Codex per `codex.mode` (default `auto`; with `auto`/`off` and no Codex it runs the Superpowers loop only and reports the skip).

**`/ptp:effort <change-id>`** — recommends the Claude model + effort level for `/ptp:apply` without re-running the full plan.

### Step 3 — Apply

**`/ptp:apply <selector>`** — implements tasks sequentially from `tasks.md` with Superpowers TDD discipline. Re-validates first, checks off each task only after verifying it, and stops on any plan/spec mismatch rather than drifting.

### Step 4 — Review

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

---

## Skills

Skills are invoked by Claude automatically (via the `Skill` tool) when the flow calls for them — you don't invoke them directly. Most are *shared protocol* extracted so the commands stay thin and consistent.

| Skill | Role |
|-------|------|
| `ptp` | Meta-skill. Routes a non-trivial change to brainstorming/planning/review (Superpowers) and durable artifacts (OpenSpec). Decides the role split. |
| `ptp-change-selector` | Single source of truth for the change-id format, the `epic:`/`story:` selector grammar, resolution, and epic allocation. |
| `ptp-branch-guard` | The "are we on a feature branch, not `master`?" preamble every write-capable command runs first. |
| `ptp-branch-prep` | Minimal git prep invoked by the guard when HEAD is `master`: stash → checkout master → pull → cut a fresh feature branch. Never commits or pushes. |
| `ptp-full` | Orchestrates `/ptp:full` — the plan phase, the plan-convergence gate, and the seam into the run phase. |
| `ptp-full-run` | The workflow-backed sequential `apply → review-full` per-story engine behind `/ptp:full-run`. |
| `ptp-review-loop` | Shared review→confirm→fix loop protocol (kind ∈ {code, artifact}, reviewer ∈ {superpowers, codex}) behind every `-loop` command, with rejection carry-over and manual/test-only filtering. |
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
  → /ptp:analyze "<subject>"          # optional: diagnose first, no change produced
  → /ptp:brainstorm "<request>"       # optional: think first, interactive
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

Where am I / what model
  → /ptp:status [change-id]
  → /ptp:effort <change-id>

Merge to master without deploying
  → /ptp:merge-to-master              # commit → PR → squash-merge → land on master (no deploy)

Return to master (clean tree required)
  → /ptp:master                       # switch to master + git pull --ff-only

Force-archive (escape hatch — reports bypassed gates)
  → /ptp:archive-force <selector>

Selectors (anywhere a <sel> / change-id is taken)
  epic:0021 | epic:0021 story:01 | story:01 | <bare-id> | (omit = all active)

Experimental (no Superpowers layer)
  → /opsx:explore [topic] | /opsx:propose [name]
  → /opsx:apply [name]    | /opsx:archive [name]
```
