---
description: Ship the current feature branch end-to-end — commit, push, open a PR, merge to master with squash, delete the branch, run the project's deploy CI/CD action, autonomously fix conflicts/CI/deploy failures within a bounded retry budget, then return to a clean master. Stops for a human approval only if branch protection requires one. Requires gh CLI authenticated.
argument-hint: "(no arguments — operates on the current feature branch; configure via deploy.* in .claude/ptp/config.json)"
---

You are running **`/ptp:deploy`** — the terminal "ship it" step of the ptp pipeline. It takes
the work on the **current feature branch** and lands it in production: commit → push → PR →
merge (squash) → delete branch → run the deploy CI/CD action → fix failures within a bounded
retry budget → return to a clean `master`. It is the **one ptp command that deliberately
commits, pushes, and merges** — the documented exception to ptp's never-auto-commit/
never-auto-push invariant (parallel to how `/ptp:master` is the documented exception to
`ptp-branch-guard`).

## Inputs

None. `/ptp:deploy` operates on whatever feature branch you are currently on. Behavior is tuned
by the `deploy` block in `.claude/ptp/config.json` (`mergeMethod`, `maxFixRounds`, `workflow`,
`inputs`) — see the README Configuration section. There is no approval setting: the command
never self-approves (GitHub forbids approving your own PR) and merges straight through unless
branch protection *requires* an approval, in which case it stops at the PR (see below).

## Branch safety — special case

`/ptp:deploy` does **not** run `ptp-branch-guard` to cut a branch, and it is **not** read-only.
It is a documented special case: it operates on the already-cut feature branch and **refuses to
run on `master`/`main`** (there is nothing to deploy from the base branch) — the inverse of
`/ptp:master`. Its internal deploy-fix sub-flow cuts `ptp/deploy-fix-*` branches and merges them
through the PR mini-flow, so a fix is never committed to the base branch directly. The exemption
is documented in the `ptp-branch-guard` skill as the single source of truth.

## Steps

1. **Invoke the `ptp-deploy` skill** via the Skill tool with **start phase `commit`** (the full
   pipeline). The skill holds the entire methodology: config read, preconditions (`gh` auth, in
   a repo, not on the base branch), commit+push with an openspec-derived Conventional-Commit
   message, PR create/reuse, the bounded PR-stage fix loop, the detected approval gate (never
   self-approve), squash merge + delete branch, deploy-action detection/dispatch/watch, the
   bounded deploy-stage fix loop (via `ptp/deploy-fix-*` PR mini-flows), and the final
   `ptp-master` land. Do not duplicate the methodology here.
2. **STOP** when the skill reports its terminal state. If the repo *required* an approving review
   that wasn't present, the skill stops after opening the PR — get a *different* collaborator to
   approve it (you cannot approve your own PR), then finish with `/ptp:deploy-pr-approved`.

## Hard rules

- Operates on the **current feature branch**; **refuses to run on `master`/`main`**.
- Commits, pushes, and merges by design — the one ptp command permitted to.
- **Squash merge** (per `mergeMethod`) and **delete the merged branch**.
- **Never self-approves** (`gh pr review --approve` is impossible for the author) and **never
  `--admin`-bypasses** a required approval. A required, unmet approval stops the command at the
  PR and hands off to `/ptp:deploy-pr-approved`; otherwise it merges straight through.
- Both autonomous fix loops (PR-stage conflicts/checks; deploy-stage failures) are bounded by
  `maxFixRounds` (default 3); on exhaustion, STOP and report — never loop unbounded, never merge
  over red checks.
- **Deploy-failure fixes never touch the base branch directly** — they go through
  `ptp/deploy-fix-*` branches and the PR mini-flow.
- Deploy degrades gracefully when no deploy workflow is detected (report and skip).
- Requires the `gh` CLI authenticated; STOP with guidance if it is missing or logged out.
- Ends by invoking `ptp-master` to land on a clean base branch.
