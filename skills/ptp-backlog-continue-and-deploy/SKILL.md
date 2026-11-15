---
name: ptp-backlog-continue-and-deploy
description: Own the combined backlog-continue-then-ship flow, deploying once only after the unchanged continue flow settled every prefix
---

# ptp-backlog-continue-and-deploy — finish a backlog epic, then ship it

## Purpose

This skill is the orchestration contract behind the single `/ptp:backlog-continue-and-deploy`
command. It chains two phases with a gate between them. **Phase A** runs the `ptp-backlog-continue`
flow **unchanged**, exactly as `/ptp:backlog-continue` runs it. A **deploy gate** admits the deploy
only when that flow's bare branch settled every prefix. **Phase B** then runs a **single** `ptp-deploy`
on the current feature branch.

The reason the command exists is the ordering-plus-gate. The archive must precede the deploy, because
the deploy squash-merges the branch that must already carry the archive moves. And the deploy must run
only when every prefix settled, because shipping a half-archived epic would ship an inconsistent spec
state. This mirrors `skills/ptp-archive-and-deploy/SKILL.md`, whose Phase B this skill reuses as is.

It does **not** restate either underlying flow. Phase A **is** `skills/ptp-backlog-continue/SKILL.md`
(its argument forms, preconditions, target selection, sign-off, re-verification, archive drive, `done`
write, and report). Phase B **is** `skills/ptp-deploy/SKILL.md`, driven exactly as `/ptp:deploy` drives
it. This skill owns only the outer preconditions, the deploy gate, and the combined terminal report.

**Read `skills/ptp-backlog-continue/SKILL.md` in full before running Phase A** — this skill's prose
alone does not carry that flow's steps.

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| arguments | the same forms `/ptp:backlog-continue` accepts: empty (bare sign-off), issue text, or `phase:apply` with an optional brief | Passed through from `$ARGUMENTS` verbatim to Phase A |

The arguments are classified by Phase A, never here. This skill only reads which flow Phase A ran.

## Outer preconditions (once, up front)

Run these in the **outer session, before any write and before any spawn**, in this order:

1. **HEAD is not `master`/`main`** — `git rev-parse --abbrev-ref HEAD`. If HEAD is `master` or
   `main`, **STOP**: there is nothing to deploy from the base branch. Do not read the backlog, do not
   cut a branch, write nothing, spawn nothing.
2. **`gh` is authenticated** — `gh auth status`. If it fails, **STOP** with `gh auth login` guidance,
   before reading the backlog.

Because precondition 1 refuses on the base branch, Phase A's own `ptp-branch-guard` preamble is always
a no-op here: HEAD is already a feature branch, so it never cuts one. Phase B uses the documented
`ptp-branch-guard` **deploy exemption**, exactly as `/ptp:deploy` does. `ptp-branch-guard` owns both
rules; they are cited here, not restated.

## Execution contract — outer session, unwrapped

This skill runs in the **outer session** and is **never wrapped in a `ptp-run-at-model` main run of
its own**. Phase A must stay unwrapped for the reason `ptp-backlog-continue` gives under *Execution
contract*: its archive drive and its fix pass each spawn a level-1 main run, which a wrapper would push
to a forbidden level 2. Phase B is one blocking level-1 run. This skill adds no nesting level.

## Phase A — the backlog-continue flow, unchanged

Run `skills/ptp-backlog-continue/SKILL.md` **exactly as `/ptp:backlog-continue` runs it**, with the
same arguments. Nothing in that flow is weakened, reordered, skipped, or added to: the invocation
classification, the transport preconditions, target selection and its refusals, the branch guard, the
checkbox sign-off, the re-verification, the drive of `/ptp:archive`, the `done` write, and that skill's
own report all happen as it states them.

`skills/ptp-backlog-continue/SKILL.md` is not edited by this command. Its rule that it never commits,
pushes, merges, or deploys stays true: the deploy below belongs to this skill, after Phase A ended.

While Phase A runs, record for the deploy gate:

- **which flow ran** — bare, issue-text, or apply-mode (`phase:apply`);
- **whether Phase A refused** before any prefix was processed (a precondition or target-selection
  refusal);
- **each prefix's outcome** in the candidate's `changeEpics` — archived in this invocation, found
  absent, or stalled (at re-verification or at the archive), and why;
- **the `done` write's verdict**, as `ptp-backlog-write` names it.

## Deploy gate

Phase B runs **only when** Phase A ran the **bare** flow and that flow settled **every** prefix in the
candidate's `changeEpics` — each one archived in this invocation or found absent. That is the same
condition under which `ptp-backlog-continue` performs its `done` write.

Phase B does **not** run, and the report says **"deploy was not reached"**, in each of these cases:

- **the issue-text flow ran** — its fix pass leaves the epic halted for the next check, so there is
  nothing finished to ship;
- **a `phase:apply` invocation ran** — apply mode settles the entry to `in-review` or `blocked`, never
  to a shippable state;
- **a refusal fired before every prefix settled** — a recognized-but-invalid `phase:` token, a
  token-only argument, a transport precondition, or a target-selection refusal;
- **any prefix stalled** at re-verification (`openspec validate --strict`, build, or tests) or at the
  archive. The report names the stalled prefix and why.

**The `done` write never gates Phase B.** Its outcome is reported exactly as `ptp-backlog-continue`
reports it — `complete`, partial, refused over drift, or `unresolved-commit` — and the deploy still
runs. The archive moves are already on the branch whatever the board says, and the board write has its
own retry shape (`ptp-backlog-continue` § *Retry shape*).

**Every prefix already absent** still admits Phase B: the flow settled every prefix, so the deploy
runs, and the report says **nothing was archived in this invocation**.

## Phase B — deploy, exactly once

After the gate admits it, run `ptp-deploy` **exactly once**, on the **current feature branch**,
through **one** `ptp-run-at-model` run at **`sonnet.medium`** with start phase **`commit`** and mode
**`deploy`** — exactly as `/ptp:deploy` drives it. Do not restate `ptp-deploy`'s methodology.

The deploy runs **inline at one nesting level** (`ptp-run-at-model` *Nesting caveat*): the wrapped
`ptp-deploy` resolves its PR-stage and deploy-stage fix loops with its own tools and never spawns a
nested fix subagent.

## Terminal report

First relay Phase A's own report as `ptp-backlog-continue` § *Report contract* shapes it: the branch,
the prefixes archived, absent, or stalled, the signed-off folders, and the `done` write's verdict.
Then add the deploy line.

- **Deploy not reached** — the line says **"deploy was not reached"** and why: the issue-text flow
  ran, a `phase:apply` invocation ran, a refusal fired (name it), or a prefix stalled (name it and the
  failing check). Name `/ptp:backlog-continue-and-deploy` (or `/ptp:deploy`, once every prefix settled)
  as the next step.
- **Deploy `completed`** — the ship summary: PR merged, branch deleted, deploy conclusion, clean base
  branch. If every prefix was already absent, say nothing was archived in this invocation.
- **Deploy `refused`** — the gate or precondition reason (for example a fix-loop budget exhausted),
  reported as a **failure, never as success**. Name `/ptp:deploy` as the next step.
- **Deploy `needs-human-action`** — the reason, the PR URL, and the exact follow-up
  `/ptp:deploy-pr-approved`. Never reported as success.

**A failed deploy never reverts `done`.** No write is made to undo it. When the `done` write was
`complete` and the deploy did not complete (`refused` or `needs-human-action`), the report says the
epic was **archived and marked done but not shipped**.

## Hard rules

- **Refuses on `master`/`main`**, and on a failing `gh auth status`, before any write or spawn.
- **Phase A is `ptp-backlog-continue` unchanged.** Never weaken, reorder, or skip one of its gates,
  and never edit `skills/ptp-backlog-continue/SKILL.md`.
- **Outer session, unwrapped.** No `ptp-run-at-model` main run wraps this skill.
- **Deploy only after the bare flow settled every prefix.** Issue text, `phase:apply`, a pre-settle
  refusal, or a stalled prefix means the deploy was not reached. The `done` write never gates it.
- **Deploy runs exactly once**, on the current branch, at `sonnet.medium`, start `commit`, mode
  `deploy`.
- **A failed deploy never reverts `done`.**
- **Never self-approve and never `--admin`-bypass** a required approval — defer to `ptp-deploy`'s
  `needs-human-action` posture with the `/ptp:deploy-pr-approved` follow-up.
