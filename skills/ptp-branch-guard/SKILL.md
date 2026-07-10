---
name: ptp-branch-guard
description: Shared branch-safety preamble for every ptp step that creates or updates files. Defines, in exactly one place, the "are we on a feature branch, not master?" check each write-capable ptp command runs as its first write-affecting action — and, when HEAD is master, the minimal-model git-prep workflow that stashes, switches to master, pulls, and cuts a fresh feature branch before any file is written. Read-only / review-only ptp commands do not use it.
---

# ptp-branch-guard — never write ptp work onto `master`

## Purpose

Every ptp step that **creates or updates files** — planning artifacts, source code, inline review fixes, `effort.md`, archive moves — must first guarantee the work lands on a **feature branch, not `master`**. This skill defines that guard in exactly one place (the same way `ptp-change-selector` owns the id grammar) so the write-capable commands **reference** it instead of each restating the git dance.

## Which steps run the guard

**Run the guard — write-capable** (they create or update working-tree files):

`analyze`, `brainstorm`, `brainstorm-only`, `brainstorm-full`, `plan`, `plan-multiple`, `prd`, `prd-full`, `apply`, `effort`, `review-fix`, `review-loop`, `review-plan-loop`, `codex-review-loop`, `codex-review-plan-loop`, `codex-review-prd-loop`, `review-full`, `review-plan-full`, `review-brainstorm-full`, `review-prd-full`, `full`, `full-plan`, `full-run`, `archive`, `archive-force`.

**Do NOT run the guard — read-only** (they never write working-tree ptp/OpenSpec artifacts, so there is nothing to keep off the base branch):

`review`, `review-plan`, `review-brainstorm`, `review-prd`, `codex-review`, `codex-review-plan`, `codex-review-prd`, `codex-review-uncommitted`, `status`, `version`.

**Do NOT run the guard — utility writes outside the repo tree** (they change state, but never a ptp/OpenSpec working-tree artifact, so the base-branch guard does not apply): `update` (updates the *installed plugin*, no repo files) and `config` (writes only `.claude/ptp/config.json` tool config, not a ptp artifact). Listed here separately so each category's rationale stays accurate.

**Deliberate land-on-master exception — `/ptp:master`, `/ptp:deploy-master`:** these commands do **not** run the guard, but for a distinct reason: they author no ptp/OpenSpec artifact (a `git switch` / fast-forward pull, or a deploy CI/CD dispatch, may touch tracked files or trigger a workflow, but neither command creates anything of its own) and their entire purpose is to land on / operate on `master` — running the guard would cut a `ptp/<...>` branch and directly defeat them. `/ptp:deploy-master` additionally commits nothing and cuts no branch of its own; it only triggers the deploy CI/CD action against the current `master`/`main`. Neither is a read-only command (`/ptp:master` changes git state and a pull may update the working tree; `/ptp:deploy-master` dispatches a workflow run), so both are listed here separately rather than in the read-only list above, to keep each category's stated rationale accurate.

**Deliberate ship-from-a-feature-branch exception — `/ptp:deploy`, `/ptp:deploy-pr-approved`,
and `/ptp:merge-to-master`:** these commands do **not** run the guard either, but for the
*opposite* reason to `/ptp:master`. They are **not** read-only (they commit, push, and merge —
the one documented exception to ptp's never-auto-commit rule), and they do not cut a branch for
their own work. Instead they operate on the **already-cut feature branch** and *require* one:
they refuse to run on `master`/`main` (there is nothing to ship from the base branch). Running
the guard would be pointless (HEAD is already a feature branch → no-op) or harmful (on the base
branch it would cut a throwaway branch rather than STOP as these commands intend). `/ptp:deploy`
and `/ptp:deploy-pr-approved`'s internal deploy-fix sub-flow *does* cut `ptp/deploy-fix-*`
branches and merges them through the PR mini-flow, so a fix is never committed to the base
branch directly; `/ptp:merge-to-master` has no deploy phase and therefore cuts no deploy-fix
branches. Like `/ptp:master`, these are listed here separately rather than in the read-only
list, to keep each category's rationale accurate.

## The guard (first write-affecting action, before writing any file)

The guard is the **first action that affects the working tree** — but it is *not* literally the first thing a command does. Any **cheap, read-only precondition or required user confirmation that would abort the whole command** runs **before** the guard: a missing `codex` CLI, a missing `openspec/changes/<id>/` folder, "no review present in the conversation", the no-arg scope-confirmation STOP, and the like. Evaluate those first; run the guard only once they pass. Cutting a branch (and spinning up the prep workflow) ahead of a guaranteed abort just leaves a throwaway branch behind.

### What counts as the base branch

The guard protects the repo's **base branch** — the long-lived integration branch ptp work must never
be written onto directly. A repo's base branch is **`master` or `main`** (the two conventional
default-branch names); the deploy family (`/ptp:deploy`, `/ptp:merge-to-master`) already treats both as
the base. The guard therefore triggers when `git rev-parse --abbrev-ref HEAD` is **either `master` or
`main`**, and treats every other branch name (feature branch, detached HEAD) as safe-to-proceed. When
the guard fires it passes the detected base name to the prep workflow as `base`, so a `main`-default
repo cuts its feature branch off `main`, not a nonexistent `master`. (If a repo uses some other default
branch name, detect it via `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` and use that; the
`master`/`main` set is the minimum every ptp step must honor.)

0. **CRLF self-heal (unconditional, first action — before the branch check).** Run the
   `ptp-workflow-cache-heal` step (see that skill for the canonical Bash command) via the Bash tool over
   the whole glob `~/.claude/plugins/cache/ptp/*/*/workflows/*.js`. This runs **unconditionally**,
   regardless of whether HEAD is `master` or a feature branch — the CRLF defect is independent of branch
   state, and healing here ensures every cached workflow script is LF-only before any `Workflow({ name })`
   call. The step is idempotent and a silent no-op when the cache is already LF or absent.
1. **Check the current branch:** `git rev-parse --abbrev-ref HEAD` (via Bash).
2. **If it is anything other than the repo's base branch** — already on a feature branch, or a detached HEAD mid-operation — **proceed as-is.** Do **not** stash, switch, or cut a new branch. The guard is a **no-op**. (This is the confirmed posture: respect the branch the user is already on; never re-cut or re-base it.)
3. **If it is the repo's base branch** (see *What counts as the base branch* below): do not write onto it. Derive a branch name from context (see below), then launch the minimal git-prep workflow and **wait for it to return** before any file write:
   ```
   Workflow({ name: 'ptp:ptp-branch-prep', args: { branch, base, description } })
   ```
   - `branch` — the derived feature-branch name (required).
   - `base` — the detected base branch (`master` or `main`) HEAD is currently on (optional; defaults to `master` for back-compat). Pass the value from step 1 so a `main`-default repo bases off `main`.
   - `description` — a short human description of the change (optional; used only for the agent's context).

   The workflow runs a single **haiku** agent (cheapest model, mechanical effort) that: stashes any dirty changes, checks out `base`, pulls latest, creates-and-checks-out `branch` (or switches to it if it already exists), and pops the stash back onto the new branch. It returns `{ branch, onBranch, created, stashed, stashRestored, baseUpdated, notes }`.
   - **Proceed only if `onBranch === true`.** If the workflow returns `onBranch: false` (or an `error`, or null) the prep did **not** put you on the feature branch — HEAD may still be on `master`. **STOP, surface the error, and write nothing.** Never fall through to the ptp step's file writes on a failed prep; doing so would defeat the guard.
   - Once `onBranch` is true you are on the fresh feature branch — continue the ptp step normally.
   - If it reports a stash-pop conflict (`stashRestored: false`), surface that to the user before proceeding.

> **Autostash moves _all_ dirty changes.** The prep stashes the entire working tree (including untracked files, via `-u`) and pops it onto the new branch. If you were on `master` with **unrelated** uncommitted work, that work is relocated onto the `ptp/...` branch — by design (nothing ptp-related should stay on master), but it can be surprising. The original commit you branched from is unchanged; only the uncommitted delta moves.

## Branch naming (decide from context)

Derive the name from the most specific context available, in this order:

1. **A known ptp change id** (`XXXX_NN_<desc>`, e.g. from `/ptp:apply 0001_01_foo`) → `ptp/<change-id>` (e.g. `ptp/0001_01_landing-page-export`).
2. **An epic selector** (`epic:XXXX`) or a freshly-allocated epic → `ptp/epic-XXXX`.
3. **A fresh request with no id yet** (e.g. `/ptp:plan-multiple "<request>"`, `/ptp:full "<request>"`) → `ptp/<≤5-kebab-word summary of the request>`.

Keep it lowercase-kebab, no spaces or slashes beyond the single `ptp/` prefix segment. If the derived branch already exists, the prep workflow switches to it rather than failing.

## Why a workflow (not inline git)

The git dance is offloaded to a one-agent **haiku** workflow so the plumbing stays uniform and at the minimal model/effort, the same way `/ptp:full-run` offloads apply/review to workflow agents — the main flow keeps its (often `opus`) budget on the change itself rather than on branch bookkeeping. The tradeoff is a background round-trip per cut: launch the prep workflow and wait for its result before any file write.

## Orchestrators run it once; agents only ever no-op

`full`, `full-plan`, and `full-run` run the guard **once up front**, before delegating. The per-step commands and workflow agents they fan out to (`plan`, `apply`, the `ptp-apply` / `ptp-review` workflow agents, …) re-run the guard as a **no-op**, because by then HEAD is already on the feature branch. The guard is idempotent, so this redundancy is harmless and correct.

**Workflow agents must reach only the no-op path — they must never launch `ptp-branch-prep` themselves.** A ptp step running *inside* a workflow (e.g. the `ptp-apply` / `ptp-review` agents under `ptp-full-run`) cannot launch another workflow: nesting is one level only and `Workflow()` inside a workflow throws. The up-front orchestrator guard is what guarantees HEAD is already on the feature branch by the time those agents run, so their guard check sees a non-`master` branch and proceeds without ever calling the prep workflow. If you ever add a write-capable agent inside a workflow, ensure the orchestrator cuts the branch first — never rely on the inner agent to cut it. A workflow agent reaching the no-op branch path **still runs the idempotent Bash heal** (step 0 above) but launches no workflow — the heal is plain Bash in the outer agent context, not a `Workflow()` call, so it does not violate the no-nesting rule.

## Hard rules

- **Never write a ptp file onto `master`.** The guard runs **before** the first create/update in every write-capable step.
- **A failed prep blocks all writes.** Proceed only when the prep returns `onBranch: true`. If it returns `onBranch: false`, an `error`, or null, STOP and surface it — never fall through and write while HEAD may still be on `master`.
- **Abort-guaranteeing preconditions run before the guard.** Evaluate cheap read-only checks and required user confirmations (missing `codex`, missing change folder, no review in context, no-arg scope confirmation) first; only run the guard once they pass, so a guaranteed abort never leaves a throwaway branch.
- **Already on a feature branch → no-op.** Never re-cut, re-base, or switch away from a branch the user is already on — even if its name looks unrelated to the change.
- **The git-prep workflow never commits and never pushes** — consistent with ptp's never-auto-commit rule. Stashing (and popping) is allowed; committing is not.
- **The guard is idempotent.** Running it again after it has already put you on a branch must change nothing.
- **Minimal model.** The prep workflow agent runs at `haiku`; do not escalate it — it is pure git plumbing.
- **A pull failure does not block the branch cut.** If `master` cannot be updated (offline / no upstream), the prep still cuts the branch from local `master` and notes the stale base.
