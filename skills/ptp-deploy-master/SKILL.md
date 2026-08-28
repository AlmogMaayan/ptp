---
name: ptp-deploy-master
description: Own shipping work that already sits on master, cutting and merging no branch
---

# ptp-deploy-master — trigger the deploy action against a clean `master`

## Purpose

This skill is the **"deploy master as-is" trigger**: it reuses `ptp-deploy` Phase `deploy` /
step 7 — the exact CI/CD-trigger action — but excludes every other phase of the ship pipeline:
commit, push, PR, the PR-stage fix loop, the approval gate, merge, branch delete, the
deploy-stage `deploy-fix` loop, and the `ptp-master` land phase. Where `/ptp:deploy` lands a
feature branch in production, `/ptp:deploy-master` simply re-triggers the deploy action on a
`master` that is already in the desired state — with zero git history changes.

## Configuration (read first, before any action)

Read the optional ptp config through the layered configuration contract owned by **`ptp-workspace`**
(`skills/ptp-workspace/SKILL.md`) — the same contract `ptp-deploy` resolves through, whose layer list
and precedence this skill restates not at all. Only two keys of the `deploy` block are relevant
here:

| Key | Default | Use |
|-----|---------|-----|
| `workflow` | `null` | Explicit deploy workflow file; else auto-detect. |
| `inputs` | `{}` | `workflow_dispatch` inputs for the deploy workflow. |

`mergeMethod` and `maxFixRounds` are **irrelevant** here — this skill never merges and runs no
fix loop. As with `ptp-deploy`, config typos or a missing file fall back to defaults; never fail
to start over a config problem.

## Branch safety — land-on-master exception

This skill does **not** run `ptp-branch-guard`. It operates on `master`/`main`, authors no
ptp/OpenSpec artifact, and cuts no branch — the same land-on-master category as `/ptp:master`
(not the "ship from a feature branch" category `ptp-deploy` normally occupies). Running the
guard here would cut a throwaway `ptp/<…>` branch and directly defeat the command's purpose. The
`ptp-branch-guard` skill's "Which steps run the guard" section is the single source of truth for
this exemption.

## Preconditions (read-only; abort before any action)

Evaluate all of these before dispatching anything. A failure here STOPs the command and performs
**no** action:

1. **`gh` CLI present and authenticated** — run `gh --version` and `gh auth status`. If `gh` is
   missing or not logged in → STOP with install/`gh auth login` guidance.
2. **Inside a git repository** — `git rev-parse --is-inside-work-tree`. If not → STOP.
3. **HEAD is `master`/`main`** — `git rev-parse --abbrev-ref HEAD`. If it is a feature branch →
   STOP: "this command deploys the current `master` as-is; switch to `master` first (e.g. via
   `/ptp:master`)."
4. **Clean working tree** — `git status --porcelain --untracked-files=all` is empty. If
   non-empty → STOP: "this command deploys `master` as-is and commits nothing; commit or stash
   your changes first, or use `/ptp:deploy` to ship them."

## The action — reuse `ptp-deploy` Phase `deploy` / step 7

Resolve the deploy workflow and dispatch it **exactly as `ptp-deploy` Phase `deploy` (step 7)**
— that step is the single source of truth for this logic and is referenced here, not copied:

- If `deploy.workflow` is set, use it.
- Else auto-detect: scan `.github/workflows/*.yml` for a workflow whose name/file matches
  `deploy` / `release` / `publish` (prefer an exact `deploy.yml`).
- If a workflow is found and it declares `workflow_dispatch`, dispatch it:
  `gh workflow run <wf> [-f key=value …]` using `deploy.inputs`. Then `gh run watch <run-id>`
  (or poll `gh run list --workflow <wf>`) to completion and capture the conclusion.

**One explicit divergence from step 7:** `ptp-deploy` step 7 has a non-dispatch fallback —
"identify the run the merge push triggered on the base branch instead." That fallback does
**not** apply here: `/ptp:deploy-master` performs no push or merge, so there is no triggered run
to adopt. A resolved workflow that is **not** `workflow_dispatch`-able therefore becomes a STOP
(see *Edge/terminal outcomes* below), not a fallback.

## Edge/terminal outcomes

- **No workflow detected** (no `deploy.workflow` and no auto-detect match) → report "no deploy
  action detected" and STOP. This is graceful degradation, not an error.
- **Resolved workflow is not `workflow_dispatch`-able** → STOP: "cannot trigger a
  non-dispatchable workflow against `master` — there is no push or merge for the run to
  piggyback on." Never a silent no-op.
- **Deploy run concludes `failure`** → report the failing run id and logs, then STOP. This skill
  runs **no** `deploy-fix` loop — that loop requires the PR/merge mini-flow, which this skill
  deliberately excludes.
- **No `land` phase.** HEAD is already a clean `master`; there is nothing to switch to or pull.

## Terminal report

Always end with a clear status: the resolved workflow (or the "no deploy action detected" /
"not dispatchable" reason), the run id and conclusion (or the refuse/skip reason), and an
explicit note that nothing was committed, pushed, or merged.

## Hard rules

- **Never commits, pushes, opens/reuses a PR, merges, or deletes a branch.**
- **Never runs a `deploy-fix` loop** — a failed deploy run is reported, not auto-fixed.
- **Operates only on `master`/`main`** and refuses (STOPs) otherwise, before any action.
- **Refuses on a dirty working tree**, before any action.
- **Runs at a deterministic `sonnet.medium`** via `ptp-run-at-model` (one foreground subagent).
- **Degrades gracefully when no deploy workflow is detected** — report and STOP, not an error.
- **A non-`workflow_dispatch` workflow is an explicit STOP**, not a silent no-op (the fallback
  `ptp-deploy` uses for that case does not apply here).
- **Config typos never crash** — `deploy.workflow` / `deploy.inputs` fall back to their defaults.
- **References `ptp-deploy` Phase `deploy` / step 7 rather than forking it** — a future change to
  that step's detection/dispatch logic must flow here without a second edit.
- **Does not run `ptp-branch-guard`** — documented land-on-master exception (see *Branch safety*
  above).
