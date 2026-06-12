---
description: Merge the current feature branch to master — commit, push, open a PR, squash-merge, delete the branch, then return to a clean master — without running the project's deploy CI/CD action. The merge-only variant of /ptp:deploy. Refuses to run on master/main. Never self-approves. Requires gh CLI authenticated.
argument-hint: "(no arguments — operates on the current feature branch; configure via deploy.* in .claude/ptp/config.json)"
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

`/ptp:merge-to-master` does **not** run `ptp-branch-guard` to cut a branch, and it is **not**
read-only. It is a documented special case — listed alongside `/ptp:deploy` and
`/ptp:deploy-pr-approved` in the `ptp-branch-guard` skill as a "ship from a feature branch"
exception. It operates on the **already-cut feature branch** and **refuses to run on
`master`/`main`** (there is nothing to merge from the base branch) — the inverse of
`/ptp:master`. Its internal deploy-fix sub-flow does **not** apply here (no deploy phase), so
no `ptp/deploy-fix-*` branches are cut by this command.

## Steps

1. **Invoke the `ptp-model-effort-check` skill** via the Skill tool. This checks whether the
   session model is Sonnet and effort is medium before merging. If they already match the
   baseline, the skill is a no-op and execution proceeds immediately. If they differ, the user
   is prompted to switch or continue — if they choose to switch, STOP and let them re-run after
   switching.
2. **Invoke the `ptp-deploy` skill** via the Skill tool with **start phase `commit`** and
   **mode `merge-only`**. The skill holds the entire methodology: config read, preconditions
   (`gh` auth, in a repo, not on the base branch), commit+push with an openspec-derived
   Conventional-Commit message, PR create/reuse, the bounded PR-stage fix loop, the detected
   approval gate (never self-approve), squash merge + delete branch, and the final `ptp-master`
   land. The `deploy` and `deploy-fix` phases are skipped by the skill's mode gate — by design,
   not graceful degradation. Do not duplicate the methodology here.
3. **STOP** when the skill reports its terminal state. If the repo *required* an approving review
   that wasn't present, the skill stops after opening the PR — have a *different* collaborator
   approve it (you cannot approve your own PR), then **re-run `/ptp:merge-to-master`**. Re-running
   is idempotent: the commit is skipped if the tree is clean, the existing PR is reused, the
   approval gate is re-evaluated, and merge → land proceed.

## Hard rules

- Operates on the **current feature branch**; **refuses to run on `master`/`main`**.
- Commits, pushes, and merges by design — the one ptp exception to the never-auto-commit rule.
- **Squash merge** (per `mergeMethod`) and **delete the merged branch**.
- **Never self-approves** (`gh pr review --approve` is impossible for the author) and **never
  `--admin`-bypasses** a required approval. A required, unmet approval stops the command at the
  PR; re-run after a collaborator approves.
- **Does not run a deploy action** — skipped by design, not by graceful degradation. This applies
  even when the repo has a detectable deploy workflow.
- The PR-stage fix loop is bounded by `maxFixRounds` (default 3); on exhaustion, STOP and report —
  never loop unbounded, never merge over red checks.
- Ends by invoking `ptp-master` to land on a clean base branch.
- Requires the `gh` CLI authenticated; STOP with guidance if it is missing or logged out.
