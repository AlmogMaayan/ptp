---
name: ptp-deploy
description: Use this skill when the user wants to ship / deploy / release the current feature branch — commit all changes, push, open a PR, merge to master, delete the merged branch, run the project's deploy (CI/CD) action, autonomously fix conflicts/CI/deploy failures within a bounded retry budget, and finally return to a clean master. The one ptp step that deliberately commits, pushes, and merges. Never self-approves a PR (GitHub forbids it); stops for a human approval only when branch protection requires one. Drives /ptp:deploy, /ptp:deploy-pr-approved, and the merge-only variant /ptp:merge-to-master (which skips the deploy and deploy-fix phases and lands directly on master after a successful merge).
---

# ptp-deploy — the terminal "ship it" pipeline

## Purpose

This skill is the **terminal step of the ptp pipeline**: it takes the work already applied
and reviewed on the current feature branch and lands it in production. It is the single ptp
step that deliberately **commits, pushes, and merges** — the documented exception to ptp's
otherwise-absolute "never auto-commit / never auto-push" invariant, the same way `/ptp:master`
is the documented exception to `ptp-branch-guard`. Where the rest of ptp stops short of git
history, this skill owns it end to end and then returns to a clean base branch.

Three commands share this skill, differing in **start phase** and **mode** (two independent dials):

- `/ptp:deploy` → start phase **`commit`**, mode **`deploy`** (the full pipeline).
- `/ptp:deploy-pr-approved` → start phase **`merge`**, mode **`deploy`** (assumes the branch is
  pushed, a PR exists, and — for the required-approval case — a human approval is now present).
- `/ptp:merge-to-master` → start phase **`commit`**, mode **`merge-only`** (skips deploy phases).

## Mode dial

The skill has **two independent dials**:

```
start phase ∈ { commit, merge }      # WHERE the pipeline begins
mode        ∈ { deploy, merge-only } # WHETHER deploy + deploy-fix run
```

- **`mode == deploy`** (default): all phases run — `commit → pr → fix → merge → deploy →
  deploy-fix → land`. This drives `/ptp:deploy` and `/ptp:deploy-pr-approved` and is
  byte-for-byte unchanged by the addition of `merge-only`.
- **`mode == merge-only`**: after a successful **merge** (step 6), the skill goes **straight to
  `land`** (step 9), skipping `deploy` (step 7) and `deploy-fix` (step 8). This drives
  `/ptp:merge-to-master`. The two dials are orthogonal: everything up to and including merge —
  preconditions, commit/push, PR create/reuse, the bounded PR-stage fix loop, and the detected
  approval gate — is identical to `deploy` mode.

## The approval reality (read this — there is no approval config knob)

GitHub **blocks a PR author from approving their own PR** — a hard rule, with no setting,
admin toggle, or API override. Approval therefore matters **only as a merge gate**, and only
when branch protection **requires** an approving review:

- **No required approval (solo repos / no protection):** the merge proceeds with no approval.
  This skill runs straight to production (or, in `merge-only` mode, straight to `land`).
- **A required approval that isn't met:** the merge is blocked until a *different* identity
  approves. This skill **cannot** satisfy that itself (it authored the PR), so it **stops at
  the PR** and hands off — in `deploy` mode to `/ptp:deploy-pr-approved`, in `merge-only` mode
  to re-running `/ptp:merge-to-master` after a collaborator approves.

Consequences, enforced below: **never run `gh pr review --approve`** (it fails as the author
and is pointless), and **never `--admin`-bypass a required approval** (that gate is a
deliberate human checkpoint). The gate is **detected** from the PR's `reviewDecision`, not
configured.

## Configuration (read first, before any write)

Read and merge the optional ptp config (global `~/.claude/ptp/config.json`, then project
`<repo>/.claude/ptp/config.json` overriding key-by-key — the same files `codex.mode` uses).
Extract the `deploy` block; apply defaults for any missing file/key/invalid value (never fail
to start over a config typo):

| Key | Default | Use |
|-----|---------|-----|
| `mergeMethod` | `"squash"` | `gh pr merge --<method>`. |
| `maxFixRounds` | `3` | Cap for both fix loops (each bounded independently). |
| `workflow` | `null` | Explicit deploy workflow file; else auto-detect. |
| `inputs` | `{}` | `workflow_dispatch` inputs for the deploy workflow. |

There is no approval/auto-approve key of any kind — see *The approval reality* above.

## Branch safety — special case (the inverse of ptp-master)

This skill does **not** run `ptp-branch-guard` to cut a branch for its own work, and it is
**not** read-only. It is a documented special case: it operates on the **already-cut feature
branch** and *requires* one — it refuses to run on the base branch (`master`/`main`), because
there is nothing to deploy from there. Its internal deploy-fix sub-flow (step 8) *does* cut
`ptp/deploy-fix-*` branches and merges them through the same PR mini-flow, so a fix is
**never** committed to the base branch directly. The exemption (and its opposite-direction
rationale to `/ptp:master`) is recorded in the `ptp-branch-guard` skill's "Which steps run the
guard" section as the single source of truth.

## Preconditions (read-only; abort before any write)

Evaluate all of these before the first git write. A failure here STOPs the command and writes
nothing:

1. **`gh` CLI present and authenticated** — run `gh --version` and `gh auth status`. If `gh`
   is missing or not logged in → STOP with install/`gh auth login` guidance.
2. **Inside a git repository** — `git rev-parse --is-inside-work-tree`. If not → STOP.
3. **HEAD is a feature branch, not the base branch** — `git rev-parse --abbrev-ref HEAD`. If
   it is `master`/`main` → STOP. In `deploy` mode: "nothing to deploy — you are on the base
   branch. Run `/ptp:deploy` from the feature branch that holds the change." In `merge-only`
   mode: "nothing to merge — you are on the base branch. Run `/ptp:merge-to-master` from the
   feature branch that holds the change." (See *Branch safety* above.)

The `/ptp:deploy-pr-approved` entry adds one more precondition before its `merge` start phase:
an open PR exists for the branch (`gh pr view --json url,state,reviewDecision`) and either its
`reviewDecision` is `APPROVED` or the merge is otherwise no longer blocked. If a required
approval is still missing → STOP and tell the user to get it approved first.

## The pipeline

### Phase `commit` (start of `/ptp:deploy`)

**Step 1 — derive the message.** Build a Conventional-Commit subject + body from the branch's
openspec change(s): inspect `openspec/changes/<id>/` for the change ids present on this branch
(prefer the branch name `ptp/<change-id>` / `ptp/epic-XXXX`, falling back to changed paths
under `openspec/changes/`). Use the change's `proposal.md` title/summary for the body and list
the change id(s). If no openspec change is discoverable, fall back to a concise
diff-summary Conventional-Commit (e.g. `feat: <branch summary>`). Never prompt the user.

**Step 2 — commit & push.** `git add -A`; if there is anything staged, `git commit` with the
derived message; then `git push -u origin HEAD`. If the tree is already clean (nothing to
commit), skip the commit and still ensure the branch is pushed/up to date.

### Phase `pr`

**Step 3 — PR.** If an open PR already exists for the branch (`gh pr view --json url,state`),
reuse it. Otherwise `gh pr create --base <default-branch> --head <branch>` with the derived
title and a body that links the openspec change(s). Capture the PR number/URL.

### Phase `fix` (PR-stage)

**Step 4 — bounded PR-stage fix loop (≤ `maxFixRounds`).** Make the PR mergeable and green.
Loop up to `maxFixRounds`:
- **Mergeability** — `gh pr view --json mergeable,mergeStateStatus`. If conflicting, merge the
  base branch into the feature branch (`git fetch origin && git merge origin/<base>`), resolve
  conflicts (delegate substantial resolution to a fix subagent via the Agent tool), commit,
  `git push`.
- **Checks** — `gh pr checks <pr>`. For any failing required check, fetch its log
  (`gh run view <run-id> --log-failed`), fix the cause inline (delegate substantial fixes to a
  subagent), commit, `git push`.
- Re-evaluate. When conflicts are gone and required checks pass, exit the loop. On exhausting
  the cap, **STOP** and report the outstanding conflicts/failures — never loop unbounded, never
  merge over red checks.

### Phase `merge`

When entered via `/ptp:deploy-pr-approved` (which starts here), first re-run the PR-stage fix
loop (step 4) if the PR is no longer mergeable or a required check regressed while waiting for
approval — then proceed to the gate below. (On the straight-through `/ptp:deploy` path, step 4
already ran immediately before this.)

**Step 5 — approval gate (detected; never self-approve).** Read `gh pr view --json
reviewDecision,mergeStateStatus`:
- `reviewDecision` is `REVIEW_REQUIRED` or `CHANGES_REQUESTED` → branch protection requires an
  approving review that isn't met. **STOP**: print the PR URL and instruct: "This repo requires
  an approving review. Have a *different* collaborator approve the PR (you cannot approve your
  own), then" — in `deploy` mode — "run `/ptp:deploy-pr-approved`."; in `merge-only` mode —
  "re-run `/ptp:merge-to-master` (idempotent: commit skipped on a clean tree, the PR is reused,
  the gate now passes)." **Never** run `gh pr review --approve`; **never** `--admin`-bypass.
- `reviewDecision` is `APPROVED`, or empty/null (no review required) → proceed to merge.

**Step 6 — merge.** `gh pr merge <pr> --<mergeMethod> --delete-branch`. This squash-merges (per
`mergeMethod`) to the base branch and deletes the merged remote branch. If the merge fails
because an approval is required (a gate not caught at step 5), STOP and hand off exactly as in
step 5 — `deploy` mode to `/ptp:deploy-pr-approved`, `merge-only` mode to re-running
`/ptp:merge-to-master` — do not retry with `--admin`. Other merge failures → report.

> **Mode gate (after step 6):** If `mode == merge-only`, skip phases `deploy` (step 7) and
> `deploy-fix` (step 8) and go **directly to phase `land`** (step 9). This gate is only
> consulted here; default `deploy` mode falls through to phase `deploy` as before.

### Phase `deploy`

**Step 7 — run the deploy action.** Resolve the deploy workflow:
- If `deploy.workflow` is set, use it.
- Else auto-detect: scan `.github/workflows/*.yml` for a workflow whose name/file matches
  `deploy` / `release` / `publish` (prefer an exact `deploy.yml`).
If a workflow is found and it declares `workflow_dispatch`, dispatch it:
`gh workflow run <wf> [-f key=value …]` using `deploy.inputs`. If it is not dispatchable,
identify the run the merge push triggered on the base branch instead. Either way,
`gh run watch <run-id>` (or poll `gh run list --workflow <wf>`) to completion and capture the
conclusion. **No deploy workflow found** → report "no deploy action detected; skipping deploy"
and continue to step 9.

### Phase `deploy-fix`

**Step 8 — bounded deploy-stage fix loop (≤ `maxFixRounds`).** If the deploy run concludes
`failure`, the fix cannot be committed to the base branch directly (invariant). Instead:
1. Cut `ptp/deploy-fix-<short-id>` from the up-to-date base branch.
2. Diagnose from the failed run log and apply the fix (delegate substantial fixes to a subagent).
3. Run the **commit → PR → merge mini-flow** (steps 2–6) for the fix branch.
4. Re-dispatch the deploy (step 7) and re-watch.
Loop up to `maxFixRounds`. On exhaustion, **STOP** and report the failing deploy run + logs.

### Phase `land`

**Step 9 — return to clean master.** Invoke the **`ptp-master`** skill (its clean-tree gate →
`git switch <base>` → `git pull --ff-only`). Report the final state: PR merged (URL), branch
deleted, the deploy run conclusion (in `deploy` mode; in `merge-only` mode report the deploy as
"skipped by design"), and the now-current clean base branch.

## Start-phase routing

| Command | Start phase | Mode | Skips |
|---------|-------------|------|-------|
| `/ptp:deploy` | `commit` (step 1) | `deploy` | nothing |
| `/ptp:deploy-pr-approved` | `merge` (step 5) | `deploy` | commit/push/create — but re-verifies the PR exists, the branch is pushed, and any required approval is now present, then re-runs the PR-stage fix loop (step 4) if checks regressed before merging |
| `/ptp:merge-to-master` | `commit` (step 1) | `merge-only` | phases `deploy` (step 7) and `deploy-fix` (step 8) — skipped by design, not by graceful degradation |

`/ptp:deploy-pr-approved` is only needed when `/ptp:deploy` stopped at step 5 because the repo
**required** an approving review. For repos with no required approval, `/ptp:deploy` already
ran straight through to production.

`/ptp:merge-to-master` is the merge-only variant: it runs the full `commit → pr → fix → merge →
land` pipeline but **never** runs the deploy action, even on a repo that has a detectable deploy
workflow. This is distinct from `/ptp:deploy`'s graceful-degradation skip (which applies when no
workflow is found).

## Terminal report

Always end with a clear status: each phase's outcome, the PR URL + merge result, the deploy run
id + conclusion (in `merge-only` mode the deploy is skipped by design — report it as such with
no run id), how many fix rounds each loop used (and whether a cap was hit), and the final
branch. On any STOP, state exactly what blocked and the single next action.

## Hard rules

- **This is the one ptp step that commits, pushes, and merges.** That is by design and is
  documented here and in `ptp-branch-guard`. No other ptp command may auto-commit.
- **Never run on the base branch (`master`/`main`).** Deploy requires a feature branch; on the
  base branch it STOPs (the inverse of `/ptp:master`).
- **Never self-approve.** Never run `gh pr review --approve` — GitHub forbids approving your own
  PR and the author always is the author. A required, unmet approval STOPs the command and hands
  off to `/ptp:deploy-pr-approved` (in `deploy` mode) or to re-running `/ptp:merge-to-master`
  (in `merge-only` mode).
- **Never `--admin`-bypass a required approval.** A required approving review is a deliberate
  human checkpoint, not something to force past.
- **Never commit a fix directly to the base branch.** Deploy-failure fixes go through a
  `ptp/deploy-fix-*` branch and the PR mini-flow.
- **Both fix loops are bounded** by `maxFixRounds` (default 3) and independently capped. On
  exhaustion, STOP and report — never loop unbounded, never merge over red checks.
- **Squash by default** (`mergeMethod`), and always `--delete-branch` on a successful merge.
- **In `merge-only` mode, the deploy action is skipped by design** — not because no workflow was
  found (graceful degradation), but because the caller explicitly requested the merge-only
  pipeline. This applies even when a deploy workflow is present and detectable.
- **Deploy degrades gracefully**: no detectable deploy workflow → report and skip, do not error.
- **Config typos never crash** — every `deploy` key falls back to its default.
- **End by invoking `ptp-master`** to land on a clean base branch; do not hand-roll the switch.
