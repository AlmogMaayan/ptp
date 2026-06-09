---
description: Finish a /ptp:deploy that stopped because branch protection required a PR approval — verifies the current branch's PR is now approved, then merges (squash), deletes the branch, runs the deploy CI/CD action, fixes failures within a bounded retry budget, and returns to a clean master.
argument-hint: "(no arguments — operates on the current feature branch's open, approved PR)"
---

You are running **`/ptp:deploy-pr-approved`** — the continuation of `/ptp:deploy` for the case
where the repo's branch protection **required** an approving review that `/ptp:deploy` could not
provide itself (a PR author cannot approve their own PR). After a *different* collaborator
approves the PR, this command picks up at the **merge step**: it verifies the PR is approved,
merges (squash) and deletes the branch, runs the deploy CI/CD action, fixes conflicts/CI/deploy
failures within a bounded retry budget, and returns to a clean `master`.

## Inputs

None. Operates on the current feature branch's open PR. Tuned by the same `deploy` block in
`.claude/ptp/config.json` as `/ptp:deploy`.

## Branch safety — special case

Same as `/ptp:deploy`: this is **not** read-only and does **not** cut a branch via
`ptp-branch-guard`; it operates on the current feature branch and refuses to run on
`master`/`main`. Documented in the `ptp-branch-guard` skill.

## Steps

1. **Invoke the `ptp-deploy` skill** via the Skill tool with **start phase `merge`**. The skill
   re-verifies the preconditions (`gh` auth, in a repo, not on the base branch) **plus** that an
   open PR exists for the branch and a required approval is now satisfied (`reviewDecision` is
   `APPROVED`, or the merge is otherwise no longer blocked), then runs the bounded PR-stage fix
   loop (in case checks regressed), squash-merges + deletes the branch, runs the deploy action
   (detect/dispatch/watch), the bounded deploy-stage fix loop, and the final `ptp-master` land.
   The full methodology lives in the skill — do not restate it here.
2. **STOP** when the skill reports its terminal state.

## Hard rules

- Use only after `/ptp:deploy` stopped at an open PR because an approval was *required*, and a
  *different* collaborator has now approved it. If the required approval is still missing, the
  skill STOPs and asks you to get it approved first.
- Refuses to run on `master`/`main`; operates on the current feature branch.
- **Squash merge** (per `mergeMethod`) and **delete the merged branch**.
- **Never self-approves** and **never `--admin`-bypasses** — it relies on the approval a human
  has already added.
- Both fix loops bounded by `maxFixRounds` (default 3); on exhaustion, STOP and report.
- Deploy-failure fixes go through `ptp/deploy-fix-*` PR mini-flows, never the base branch.
- Ends by invoking `ptp-master` to land on a clean base branch.
