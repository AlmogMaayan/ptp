---
name: ptp-deploy
description: Own shipping a branch, the one ptp step that commits, pushes, merges, and deploys
---

**Owned commands.** This skill is the owning skill of the following commands, whose directories
are not `skills/ptp-<name>/`, so ownership is declared here on the owner's side:

Owns command: /ptp:deploy-pr-approved
Owns command: /ptp:merge-to-master

# ptp-deploy — the terminal "ship it" pipeline

## Purpose

**Model dispatch target.** `/ptp:deploy`, `/ptp:deploy-pr-approved` and `/ptp:merge-to-master` run this skill's work at `sonnet.medium` via `ptp-run-at-model` (`skills/ptp-run-at-model/SKILL.md`), which owns the spawn-and-relay mechanics and requires its caller to supply the target. This names the target only; it restates none of that contract.

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

Read the optional ptp config through the layered configuration contract owned by **`ptp-workspace`**
(`skills/ptp-workspace/SKILL.md`) — the same contract `codex.mode` resolves through, whose layer list
and precedence this skill restates not at all. Extract the `deploy` block; apply defaults for any
missing file/key/invalid value (never fail to start over a config typo):

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
branch** and *requires* one. In `mode == merge-only` a dirty base branch is recovered upstream,
in the outer session, before this skill is ever spawned — so reaching the refusal stated next in
that mode means either a **clean** base branch (which the outer session STOPs on upstream, before
spawning anything) or a recovery that did not run or did not pass its gate; `ptp-branch-guard`
owns the rationale for that conditional exemption. In either mode this skill refuses to run on
the base branch (`master`/`main`) — in `mode == merge-only` for the reason just given, and in
`mode == deploy` because
there is nothing to deploy from there. Its internal deploy-fix sub-flow (step 8) *does* cut
branches whose leaf is `deploy-fix-<id>` — shaped per `ptp-workspace` — and merges them through the same PR mini-flow, so a fix is
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
   mode — this arm is selected by **mode** (`mode == merge-only`), never by a command name —
   "nothing to merge — you are on the base branch, and the outer session's dirty-tree recovery
   either did not run or did not pass its continuation gate. This skill cannot repair that: a
   subagent cannot launch the `ptp-branch-prep` Workflow (Agent nesting is one level deep), so
   the recovery exists only in the **outer session** of `/ptp:merge-to-master`. Re-run
   `/ptp:merge-to-master` from the session itself and read the branch-prep result it reports."
   (See *Branch safety* above.)
4. **No unresolved conflict in the working tree** — `mode == merge-only` only. Like the arm
   above, this is selected by **mode**, never by a command name; `mode == deploy` does **not**
   evaluate it, so that mode's preconditions are unchanged. Run
   `git diff --name-only --diff-filter=U` (equivalently, `UU`/`AA` entries in
   `git status --porcelain`). If it lists any path → STOP, name those paths, and require them
   to be resolved, reverted, or re-stashed before re-running. This is the downstream
   **detector** for a failed dirty-base recovery — not a second implementation of it, which a
   subagent could not run anyway. The outer session hard-STOPs a conflicting `git stash pop`,
   but `ptp-branch-prep` cuts and checks out the derived branch *before* it pops, so HEAD is
   already off the base branch when that STOP fires. A re-run therefore sails past precondition
   3 with the conflict still in the tree, and phase `commit`'s `git add -A` would stage the
   `<<<<<<<`/`=======`/`>>>>>>>` markers and commit, push and propose them for merge without
   complaint. Evaluating this **before the first git write** is what stops that.

The `/ptp:deploy-pr-approved` entry adds one more precondition before its `merge` start phase:
an open PR exists for the branch (`gh pr view --json url,state,reviewDecision`) and either its
`reviewDecision` is `APPROVED` or the merge is otherwise no longer blocked. If a required
approval is still missing → emit a `needs-human-action` terminal payload (reason = "PR requires
an approving review (you cannot approve your own PR)", data = the PR URL, followUp = "have a
*different* collaborator approve the PR, then re-run `/ptp:deploy-pr-approved`") so a wrapping
`ptp-run-at-model` subagent can return it — **not** a `refused`, because the work is still
resumable by a human action. (For an unwrapped outer-session run, the equivalent STOP-with-guidance
text — get it approved first — remains valid; the payload is the machine-readable form of the same
guidance.)

## The pipeline

### Phase `commit` (start of `/ptp:deploy`)

**Step 1 — derive the message.** Build a Conventional-Commit subject + body from the branch's
openspec change(s). Read the id from the branch name's **final segment**: the shape
`ptp-workspace` owns puts the leaf last in both of its forms, so a two-segment `ptp/<leaf>` — the
root workspace's current shape, and the shape of every branch cut before that shape existed — and a
three-segment `ptp/<slug>/<leaf>` parse by the one rule, and neither ever needs a rename to ship.
Take that segment when it is a change id or an `epic-XXXX` selector; when it is anything else (a
kebab summary, a `deploy-fix-<id>` leaf), fall back to the change folders changed under the resolved
workspace's `openspec/changes/`, exactly as before. Inspect `openspec/changes/<id>/` for each id so
resolved. Use the change's `proposal.md` title/summary for the body and list
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
  conflicts. **When running inside a `ptp-run-at-model` subagent** (the default for all three
  commands), resolve the conflict **inline** with the subagent's own Bash/Edit tools — **never**
  spawn a nested fix subagent. Only an unwrapped, direct outer-session invocation of this skill MAY
  optionally delegate substantial resolution to a fix subagent via the Agent tool. Then commit and
  `git push`.
- **Checks** — `gh pr checks <pr>`. For any failing required check, fetch its log
  (`gh run view <run-id> --log-failed`), fix the cause **inline** when running inside a
  `ptp-run-at-model` subagent (never a nested subagent); only an unwrapped outer-session invocation
  MAY optionally delegate a substantial fix to a fix subagent. Then commit and `git push`.
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

  In addition to the STOP-with-guidance text, **emit a `needs-human-action` terminal payload** so a
  wrapping `ptp-run-at-model` subagent can return it (and the outer session can surface the exact
  follow-up command): reason = "PR requires an approving review (you cannot approve your own PR)",
  data = the PR URL, followUp = `/ptp:deploy-pr-approved` in `deploy` mode and "re-run
  `/ptp:merge-to-master`" in `merge-only` mode. This is **never** downgraded to a `refused` or a
  success — a required-but-unmet approval is resumable by a human action. (For an unwrapped
  outer-session run, the STOP-with-guidance text above is the same guidance in human-readable form;
  the two views are consistent.)
- `reviewDecision` is `APPROVED`, or empty/null (no review required) → proceed to merge.

**Step 6 — merge.** `gh pr merge <pr> --<mergeMethod> --delete-branch`. This squash-merges (per
`mergeMethod`) to the base branch and deletes the merged remote branch. If the merge fails
because an approval is required (a gate not caught at step 5), STOP and hand off exactly as in
step 5 — including emitting the same `needs-human-action` terminal payload (reason + PR URL +
mode-correct followUp: `/ptp:deploy-pr-approved` in `deploy` mode, "re-run `/ptp:merge-to-master`"
in `merge-only` mode) — do not retry with `--admin`. Other merge failures → report.

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
1. Cut a branch whose leaf is `deploy-fix-<id>` — shaped per `ptp-workspace` — from the up-to-date base branch. (Cutting this branch and the
   git operations below are git, not an Agent spawn — they work identically inside a subagent.)
2. Diagnose from the failed run log and apply the fix. **When running inside a `ptp-run-at-model`
   subagent** (the default for the deploy trio), apply the fix **inline** with the subagent's own
   Bash/Edit tools — **never** spawn a nested fix subagent. Only an unwrapped, direct outer-session
   invocation of this skill MAY optionally delegate a substantial fix to a fix subagent.
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
  base branch it STOPs (the inverse of `/ptp:master`) — absolute in `mode == deploy`, and in
  `mode == merge-only` too: the dirty-tree recovery that lets `/ptp:merge-to-master` tolerate a
  dirty base branch runs upstream, in the outer session, before this skill is spawned, so reaching
  this rule on the base branch means that recovery did not run or did not pass its gate.
- **Never self-approve.** Never run `gh pr review --approve` — GitHub forbids approving your own
  PR and the author always is the author. A required, unmet approval STOPs the command and hands
  off to `/ptp:deploy-pr-approved` (in `deploy` mode) or to re-running `/ptp:merge-to-master`
  (in `merge-only` mode).
- **Never `--admin`-bypass a required approval.** A required approving review is a deliberate
  human checkpoint, not something to force past.
- **Never commit a fix directly to the base branch.** Deploy-failure fixes go through a branch
  whose leaf is `deploy-fix-<id>` and the PR mini-flow.
- **When running inside a `ptp-run-at-model` subagent, resolve all fixes inline and never spawn a
  nested fix subagent.** Both fix loops (step 4 PR-stage, step 8 deploy-stage) resolve conflicts,
  failing checks, and deploy failures inline with the subagent's own Bash/Edit tools; only an
  unwrapped, direct outer-session invocation of this skill MAY optionally delegate a substantial fix
  to a fix subagent. Git branch-cutting (the `deploy-fix-<id>` leaf) is unaffected — git is not an Agent
  spawn.
- **A required-but-unmet approval is reported as `needs-human-action`, never swallowed.** It carries
  the reason ("PR requires an approving review (you cannot approve your own PR)"), the PR URL, and the
  mode-correct follow-up (`/ptp:deploy-pr-approved` in `deploy` mode, "re-run `/ptp:merge-to-master`"
  in `merge-only` mode); it is never downgraded to a success or a plain refusal.
- **Both fix loops are bounded** by `maxFixRounds` (default 3) and independently capped. On
  exhaustion, STOP and report — never loop unbounded, never merge over red checks.
- **Squash by default** (`mergeMethod`), and always `--delete-branch` on a successful merge.
- **In `merge-only` mode, the deploy action is skipped by design** — not because no workflow was
  found (graceful degradation), but because the caller explicitly requested the merge-only
  pipeline. This applies even when a deploy workflow is present and detectable.
- **Deploy degrades gracefully**: no detectable deploy workflow → report and skip, do not error.
- **Config typos never crash** — every `deploy` key falls back to its default.
- **End by invoking `ptp-master`** to land on a clean base branch; do not hand-roll the switch.
