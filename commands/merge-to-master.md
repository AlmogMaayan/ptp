---
description: Merge the current feature branch to master — commit, push, open a PR, squash-merge, delete the branch, then return to a clean master — without running the project's deploy CI/CD action. The merge-only variant of /ptp:deploy. Refuses to run on master/main. Never self-approves. Requires gh CLI authenticated.
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

`/ptp:merge-to-master` does **not** run `ptp-branch-guard` to cut a branch, and it is **not**
read-only. It is a documented special case — listed alongside `/ptp:deploy` and
`/ptp:deploy-pr-approved` in the `ptp-branch-guard` skill as a "ship from a feature branch"
exception. It operates on the **already-cut feature branch** and **refuses to run on
`master`/`main`** (there is nothing to merge from the base branch) — the inverse of
`/ptp:master`. Its internal deploy-fix sub-flow does **not** apply here (no deploy phase), so
no `ptp/deploy-fix-*` branches are cut by this command.

## Steps

1. **Run the cheap, guaranteed-abort preconditions in the outer session, before spawning anything.**
   A guaranteed abort must not spawn a subagent. Check: HEAD is not `master`/`main`
   (`git rev-parse --abbrev-ref HEAD`) — else **STOP** (nothing to merge from the base branch; run
   from the feature branch); and `gh` is authenticated (`gh auth status`) — else **STOP** with
   install/`gh auth login` guidance. The deploy trio is a documented branch-guard **exemption** (it
   never cuts a branch), so this outer step is the abort-precondition only — no `ptp-branch-prep`
   workflow runs in the outer session.
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
     skipped by design).
   - `refused` → print the gate/precondition reason (e.g. PR-stage fix budget exhausted) — **not**
     success.
   - `needs-human-action` → the repo *required* an approving review that wasn't present; surface the
     reason + the PR URL + the follow-up "re-run `/ptp:merge-to-master`". Have a *different*
     collaborator approve it (you cannot approve your own PR), then re-run `/ptp:merge-to-master`.
     Re-running is idempotent: the commit is skipped if the tree is clean, the existing PR is reused,
     the approval gate is re-evaluated, and merge → land proceed.

## Hard rules

- Operates on the **current feature branch**; **refuses to run on `master`/`main`**.
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
