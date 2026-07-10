---
description: Deploy the current master by triggering the project's deploy CI/CD action, without commit/push/PR/merge. Refuses to run off master/main or on a dirty working tree. Requires gh CLI authenticated.
argument-hint: "(no arguments — deploys the current master; configure via deploy.* in .claude/ptp/config.json)"
disable-model-invocation: true
---

You are running **`/ptp:deploy-master`** — the "deploy master as-is" trigger. It takes the
current `master`/`main`, already in the desired state, and triggers the project's deploy CI/CD
action against it: no commit, no push, no PR, no merge, no branch cleanup. It is the inverse of
`/ptp:deploy` (which ships a feature branch) and reuses only `ptp-deploy`'s Phase `deploy` /
step 7 CI/CD-trigger action.

## Inputs

None. `/ptp:deploy-master` operates on the current `master`/`main`. Behavior is tuned by the
`deploy` block in `.claude/ptp/config.json` (`workflow`, `inputs` only — `mergeMethod` and
`maxFixRounds` are irrelevant here) — see the README Configuration section.

## Branch safety — special case

`/ptp:deploy-master` does **not** run `ptp-branch-guard`. It is a documented land-on-master
exception, the same category as `/ptp:master`: it operates on `master`/`main`, authors no
ptp/OpenSpec artifact, and cuts no branch. Running the guard here would cut a throwaway
`ptp/<…>` branch and defeat the command's purpose. The exemption is documented in the
`ptp-branch-guard` skill as the single source of truth.

## Steps

1. **Run the cheap, guaranteed-abort preconditions in the outer session, before spawning anything.**
   A guaranteed abort must not spawn a subagent. Check: HEAD is `master`/`main`
   (`git rev-parse --abbrev-ref HEAD`) — else **STOP** (this command deploys the current
   `master`; switch to it first, e.g. via `/ptp:master`); and `gh` is authenticated
   (`gh auth status`) — else **STOP** with install/`gh auth login` guidance. This is a documented
   branch-guard exemption — it never cuts a branch — so this outer step is the
   abort-precondition only; there is **no** `ptp-branch-prep` workflow in the outer session.
2. **Run the `ptp-deploy-master` work via `ptp-run-at-model` at `sonnet.medium`.** Invoke the
   **`ptp-run-at-model`** skill with target `sonnet.medium` and work = "run the
   `ptp-deploy-master` skill". `ptp-run-at-model` spawns one foreground `sonnet` subagent (medium
   effort directive) that runs the full methodology: config read (`deploy.workflow`,
   `deploy.inputs` only), preconditions (re-run as defense in depth: `gh` authenticated, inside a
   git repo, HEAD is `master`/`main`, clean working tree), then resolving and dispatching the
   deploy workflow exactly as `ptp-deploy` Phase `deploy` / step 7 (with the one explicit
   divergence: a non-`workflow_dispatch` workflow is a STOP here, since there is no push/merge to
   piggyback on). Do not duplicate the methodology here. The branch guard does **not** run (this
   command is a documented guard exemption; `ptp-run-at-model` defers that run/skip decision to
   `ptp-branch-guard`).
3. **Relay** the subagent's terminal state verbatim in meaning, then **STOP** — never report a
   refusal as success:
   - `completed` → print the deploy summary (resolved workflow, run id, conclusion; nothing
     committed/pushed/merged).
   - `refused` → print the precondition/gate reason (not on `master`, dirty tree, missing `gh`,
     no deploy workflow detected, or a non-dispatchable workflow) — **not** success.

## Hard rules

- Operates only on `master`/`main`; **refuses to run on a feature branch**.
- **Never commits, pushes, opens a PR, or merges** — zero git history changes.
- **No `deploy-fix` loop** — a failed deploy run is reported, not auto-fixed.
- **Runs at a deterministic `sonnet.medium`** via `ptp-run-at-model` (one foreground subagent).
- Requires the `gh` CLI authenticated; STOP with guidance if it is missing or logged out.
- Degrades gracefully when no deploy workflow is detected (report and STOP, not an error).
- Does **not** run `ptp-branch-guard` — this command is the deliberate land-on-master exception.
