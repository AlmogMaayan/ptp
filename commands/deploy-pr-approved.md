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

1. **Run the cheap, guaranteed-abort preconditions in the outer session, before spawning anything.**
   A guaranteed abort must not spawn a subagent. Check: HEAD is not `master`/`main`
   (`git rev-parse --abbrev-ref HEAD`) — else **STOP** (operate from the feature branch); and `gh` is
   authenticated (`gh auth status`) — else **STOP** with `gh auth login` guidance. The deploy trio is
   a documented branch-guard **exemption** (it never cuts a branch), so this outer step is the
   abort-precondition only — no `ptp-branch-prep` workflow runs in the outer session.
2. **Run the `ptp-deploy` work via `ptp-run-at-model` at `sonnet.medium`.** Invoke the
   **`ptp-run-at-model`** skill with target `sonnet.medium` and work = "run the `ptp-deploy` skill,
   start phase `merge`, mode `deploy`". The spawned `sonnet` subagent (medium effort directive)
   re-verifies the preconditions (`gh` auth, in a repo, not on the base branch) **plus** that an open
   PR exists for the branch and a required approval is now satisfied (`reviewDecision` is `APPROVED`,
   or the merge is otherwise no longer blocked), then runs the bounded PR-stage fix loop (in case
   checks regressed; resolved **inline** — no nested fix subagent), squash-merges + deletes the
   branch, runs the deploy action (detect/dispatch/watch), the bounded deploy-stage fix loop (also
   inline), and the final `ptp-master` land. The full methodology lives in the skill — do not restate
   it here. The branch guard does **not** run (documented guard exemption; `ptp-run-at-model` defers
   that decision to `ptp-branch-guard`).
3. **Relay** the subagent's terminal state verbatim in meaning, then **STOP** — never report a
   refusal or a needs-human-action state as success:
   - `completed` → print the ship summary.
   - `refused` → print the gate/precondition reason — **not** success.
   - `needs-human-action` → the required approval is *still* missing; surface the reason + the PR URL
     + the follow-up: get a *different* collaborator to approve the PR, then re-run
     `/ptp:deploy-pr-approved`. This is **not** a success and **not** a plain refusal.

## Hard rules

- Use only after `/ptp:deploy` stopped at an open PR because an approval was *required*, and a
  *different* collaborator has now approved it. If the required approval is still missing, the
  command surfaces a `needs-human-action` state (reason + PR URL + the follow-up "get a *different*
  collaborator to approve, then re-run `/ptp:deploy-pr-approved`") — not a success or a plain refusal.
- **Runs at a deterministic `sonnet.medium`** via `ptp-run-at-model` (one foreground subagent).
- Refuses to run on `master`/`main`; operates on the current feature branch.
- **Squash merge** (per `mergeMethod`) and **delete the merged branch**.
- **Never self-approves** and **never `--admin`-bypasses** — it relies on the approval a human
  has already added.
- Both fix loops bounded by `maxFixRounds` (default 3); on exhaustion, STOP and report.
- Deploy-failure fixes go through `ptp/deploy-fix-*` PR mini-flows, never the base branch.
- Ends by invoking `ptp-master` to land on a clean base branch.
