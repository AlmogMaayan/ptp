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

1. **Run the cheap, guaranteed-abort preconditions in the outer session, before spawning anything.**
   A guaranteed abort must not spawn a subagent. Check: HEAD is not `master`/`main`
   (`git rev-parse --abbrev-ref HEAD`) — else **STOP** (nothing to deploy from the base branch; run
   from the feature branch); and `gh` is authenticated (`gh auth status`) — else **STOP** with
   install/`gh auth login` guidance. The deploy trio is a documented branch-guard **exemption** — it
   never cuts a branch — so this outer step is the abort-precondition only; there is **no**
   `ptp-branch-prep` workflow in the outer session (unlike the branch-cutting commands).
2. **Run the `ptp-deploy` work via `ptp-run-at-model` at `sonnet.medium`.** Invoke the
   **`ptp-run-at-model`** skill with target `sonnet.medium` and work = "run the `ptp-deploy` skill,
   start phase `commit`, mode `deploy`". `ptp-run-at-model` spawns one foreground `sonnet` subagent
   (medium effort directive) that runs the full pipeline. The `ptp-deploy` skill holds the entire
   methodology: config read, preconditions (re-run as defense in depth), commit+push with an
   openspec-derived Conventional-Commit message, PR create/reuse, the bounded PR-stage fix loop
   (resolved **inline** inside the subagent — no nested fix subagent), the detected approval gate
   (never self-approve), squash merge + delete branch, deploy-action detection/dispatch/watch, the
   bounded deploy-stage fix loop (via `ptp/deploy-fix-*` PR mini-flows, also inline), and the final
   `ptp-master` land. Do not duplicate the methodology here. The branch guard does **not** run (this
   command is a documented guard exemption; `ptp-run-at-model` defers that run/skip decision to
   `ptp-branch-guard`).
3. **Relay** the subagent's terminal state verbatim in meaning, then **STOP** — never report a
   refusal or a needs-human-action state as success:
   - `completed` → print the ship summary (PR merged, branch deleted, deploy conclusion, clean base
     branch).
   - `refused` → print the gate/precondition reason (e.g. a fix-loop budget exhausted) — **not**
     success.
   - `needs-human-action` → the repo *required* an approving review that wasn't present; surface the
     reason + the PR URL + the exact follow-up command `/ptp:deploy-pr-approved`. Get a *different*
     collaborator to approve it (you cannot approve your own PR), then run `/ptp:deploy-pr-approved`.

## Hard rules

- Operates on the **current feature branch**; **refuses to run on `master`/`main`**.
- Commits, pushes, and merges by design — the one ptp command permitted to.
- **Squash merge** (per `mergeMethod`) and **delete the merged branch**.
- **Never self-approves** (`gh pr review --approve` is impossible for the author) and **never
  `--admin`-bypasses** a required approval. A required, unmet approval surfaces as a
  `needs-human-action` state (reason + PR URL + the follow-up `/ptp:deploy-pr-approved`), never a
  success or a plain refusal; otherwise it merges straight through.
- **Runs at a deterministic `sonnet.medium`** via `ptp-run-at-model` (one foreground subagent),
  rather than the old soft model/effort prompt — the baseline is enforced, not merely suggested.
- Both autonomous fix loops (PR-stage conflicts/checks; deploy-stage failures) are bounded by
  `maxFixRounds` (default 3); on exhaustion, STOP and report — never loop unbounded, never merge
  over red checks.
- **Deploy-failure fixes never touch the base branch directly** — they go through
  `ptp/deploy-fix-*` branches and the PR mini-flow.
- Deploy degrades gracefully when no deploy workflow is detected (report and skip).
- Requires the `gh` CLI authenticated; STOP with guidance if it is missing or logged out.
- Ends by invoking `ptp-master` to land on a clean base branch.
