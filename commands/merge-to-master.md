---
description: Merge the current feature branch to master — commit, push, open a PR, squash-merge, delete the branch, then return to a clean master — without running the project's deploy CI/CD action. The merge-only variant of /ptp:deploy. Refuses on a clean master/main, and recovers a dirty one onto a fresh feature branch first. Never self-approves. Requires gh CLI authenticated.
argument-hint: "(no arguments — operates on the current feature branch; configure via deploy.* in .claude/ptp/config.json)"
disable-model-invocation: true
---

You are running **`/ptp:merge-to-master`** — the merge-only variant of the ptp ship pipeline.
It takes the work on the **current feature branch** and lands it in `master`: commit → push →
PR → merge (squash) → delete branch → return to a clean `master`. It is the **one ptp command
that deliberately commits, pushes, and merges** — the same documented exception as `/ptp:deploy`
— but it **does not run the deploy CI/CD action**, by design.

## Inputs

None. `/ptp:merge-to-master` operates on whatever feature branch you are currently on. Behavior
is tuned by the `deploy` block in `.claude/ptp/config.json` (`mergeMethod`, `maxFixRounds`) —
the `workflow` and `inputs` keys are not read (no deploy phase). There is no approval setting:
the command never self-approves (GitHub forbids approving your own PR) and merges straight
through unless branch protection *requires* an approval, in which case it stops at the PR (see
below).

## Branch safety — special case

`/ptp:merge-to-master` does **not** run `ptp-branch-guard` as an unconditional preamble, and it is
**not** read-only. It is a documented special case, recorded in the `ptp-branch-guard` skill — which
owns the rationale — as a **conditional** "ship from a feature branch" exemption, kept separate from
`/ptp:deploy` and `/ptp:deploy-pr-approved`'s unconditional one. It normally operates on the
**already-cut feature branch**; on the base branch its behavior depends on the working tree. On a
**clean** `master`/`main` it refuses, exactly as it does today
(there is nothing to merge from the base branch) — the inverse of
`/ptp:master`. On a **dirty** one there *is* work to land, so step 1
recovers it onto a fresh feature branch via `ptp-branch-prep`, launched from the outer session and
gated on its result, before the pipeline runs. Its internal deploy-fix sub-flow does **not** apply
here (no deploy phase), so no `ptp/deploy-fix-*` branches are cut by this command.

## Steps

1. **Run the outer-session preconditions before spawning anything — and, on a dirty base branch,
   recover that work onto a fresh feature branch first.** A guaranteed abort must not spawn a
   subagent. In this order:

   a. **`gh` is authenticated** — `gh auth status`; else **STOP** with install/`gh auth login`
      guidance. This is checked **first** because it is the only remaining *guaranteed* abort: a run
      that is doomed anyway must never cut a throwaway branch or pop a stash onto it.
   b. **`base` = `git rev-parse --abbrev-ref HEAD`.** If `base` is **not** `master`/`main` (a feature
      branch, or a detached HEAD mid-operation), proceed to step 2 unchanged — that is the ordinary
      path, and nothing below runs.
   c. **On the base branch, classify the working tree** — run
      `git status --porcelain --untracked-files=all` at the repo top level
      (`git rev-parse --show-toplevel`). Ignored paths are deliberately **excluded**, because the set
      this matches is exactly what the pipeline's `git add -A` would stage — so "dirty" means
      precisely "the commit this pipeline makes will be non-empty".
      - **Empty (clean tree) ⇒ STOP** with today's message, verbatim:
        *nothing to merge from the base branch; run from the feature branch*.
        Write nothing, launch no workflow, spawn nothing.
      - **Non-empty (dirty tree) ⇒ recover**, via (d)–(g) below. The claim "there is nothing to
        merge" is simply false here: there *is* work to land.
   d. **Derive the feature-branch name** from the paths `git status` just printed, using
      `ptp-branch-guard`'s "Branch naming" **case 4** (a no-argument command deriving from the dirty
      tree). That skill owns the three sub-rules and the path-normalization rules — do not restate
      them here.
   e. **Run the `ptp-workflow-cache-heal` step via the Bash tool** over both cached executable globs.
      It runs **before** the workflow launch in (f): the CRLF self-heal must precede every
      `Workflow({ name })` call.
   f. **Launch the branch prep in the outer session, and wait for it:**
      ```
      Workflow({ name: 'ptp:ptp-branch-prep', args: { branch, base, description } })
      ```
      This **must** be the outer session. Agent nesting is one level deep, so the subagent spawned in
      step 2 cannot launch a Workflow at all — the recovery is structurally an outer-session-only
      capability. `ptp-branch-prep` is reused exactly as it is: it already stashes with `-u` and pops
      the stash back onto the newly cut branch, so no new flag or capability is needed.
   g. **Gate on the return — continue if and only if all four hold:** the return is **non-null**; it
      carries **no `error`** key; **`onBranch === true`**; and it is **not** the case that
      (`stashed === true` **and** `stashRestored !== true`). `stashRestored` is tested **only** when
      `stashed === true`, because that key is optional and is absent on a prep that found nothing to
      stash — an unconditional `stashRestored !== true` would hard-STOP a perfectly good prep, while
      `stashRestored === false` would fall through when the key is merely absent. Any other outcome
      is a **hard STOP** that **writes nothing and spawns nothing**, surfacing the prep's `branch`,
      `onBranch`, `stashed`, `stashRestored`, and `notes`/`error`, plus the single next action
      (resolve the conflict, or inspect `git stash list`, then re-run) — and **name the branch HEAD
      is on now**. On the stash-pop-conflict STOP the prep has *already* cut and checked out the
      derived branch, so a re-run no longer sees `master`/`main`: it skips (c)–(g) entirely, and the
      conflict is caught one layer down instead — by `ptp-deploy`'s `mode == merge-only` precondition
      4 (no unmerged paths), which STOPs before phase `commit`'s `git add -A` could stage the
      markers. Say so: resolving the conflict is what makes a re-run *useful*, not merely permitted.

      This gate is deliberately **stricter** than `ptp-branch-guard`'s general "surface a stash-pop
      conflict before proceeding": the very next action after the spawn is `git add -A` followed by
      `git commit`, so a leaked `onBranch: false` commits straight onto the base branch, and a leaked
      stash-pop conflict stages, commits, pushes and proposes `<<<<<<<`/`=======`/`>>>>>>>` markers
      for merge. Never "warn and continue".

   The deploy trio is a documented branch-guard **exemption**, but for `/ptp:merge-to-master` that
   exemption is **conditional** (`ptp-branch-guard` owns the rationale): on a **clean** base branch
   this outer step is nothing but the abort precondition and no `ptp-branch-prep` workflow runs, while
   on a **dirty** one it additionally runs that workflow, exactly as above.
2. **Run the `ptp-deploy` work via `ptp-run-at-model` at `sonnet.medium`.** Invoke the
   **`ptp-run-at-model`** skill with target `sonnet.medium` and work = "run the `ptp-deploy` skill,
   start phase `commit`, mode `merge-only`". The spawned `sonnet` subagent (medium effort directive)
   runs the merge-only pipeline. The `ptp-deploy` skill holds the entire methodology: config read,
   preconditions (re-run as defense in depth), commit+push with an openspec-derived Conventional-Commit
   message, PR create/reuse, the bounded PR-stage fix loop (resolved **inline** inside the subagent —
   no nested fix subagent), the detected approval gate (never self-approve), squash merge + delete
   branch, and the final `ptp-master` land. The `deploy` and `deploy-fix` phases are skipped by the
   skill's mode gate — by design, not graceful degradation. Do not duplicate the methodology here. The
   branch guard does **not** run (documented guard exemption; `ptp-run-at-model` defers that decision
   to `ptp-branch-guard`).
3. **Relay** the subagent's terminal state verbatim in meaning, then **STOP** — never report a
   refusal or a needs-human-action state as success:
   - `completed` → print the merge summary (PR merged, branch deleted, clean base branch; deploy
     skipped by design). If step 1 recovered a dirty base branch, the report **must** disclose that
     the work was **recovered** from `master`/`main`, naming the derived feature branch and the paths
     that were moved onto it — an unrelated dirty tree gets committed and merged too, so say so.
   - `refused` → print the gate/precondition reason (e.g. PR-stage fix budget exhausted) — **not**
     success.
   - `needs-human-action` → the repo *required* an approving review that wasn't present; surface the
     reason + the PR URL + the follow-up "re-run `/ptp:merge-to-master`". Have a *different*
     collaborator approve it (you cannot approve your own PR), then re-run `/ptp:merge-to-master`.
     Re-running is idempotent: the commit is skipped if the tree is clean, the existing PR is reused,
     the approval gate is re-evaluated, and merge → land proceed.

## Hard rules

- Operates on the **current feature branch**; refuses on a **clean** `master`/`main`, and recovers a
  **dirty** one onto a fresh feature branch before committing.
- Commits, pushes, and merges by design — the one ptp exception to the never-auto-commit rule.
- **Squash merge** (per `mergeMethod`) and **delete the merged branch**.
- **Never self-approves** (`gh pr review --approve` is impossible for the author) and **never
  `--admin`-bypasses** a required approval. A required, unmet approval surfaces as a
  `needs-human-action` state (reason + PR URL + the follow-up "re-run `/ptp:merge-to-master`"), never
  a success or a plain refusal; re-run after a collaborator approves.
- **Runs at a deterministic `sonnet.medium`** via `ptp-run-at-model` (one foreground subagent) — the
  baseline model/effort is enforced, not merely suggested.
- **Does not run a deploy action** — skipped by design, not by graceful degradation. This applies
  even when the repo has a detectable deploy workflow.
- The PR-stage fix loop is bounded by `maxFixRounds` (default 3); on exhaustion, STOP and report —
  never loop unbounded, never merge over red checks.
- Ends by invoking `ptp-master` to land on a clean base branch.
- Requires the `gh` CLI authenticated; STOP with guidance if it is missing or logged out.
