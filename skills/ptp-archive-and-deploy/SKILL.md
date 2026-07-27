---
name: ptp-archive-and-deploy
description: End-to-end archive-then-deploy orchestration for /ptp:archive-and-deploy. Archives every resolved change through the existing, unweakened /ptp:archive gates in story order, gates on full archive convergence, then deploys the current feature branch exactly once via ptp-deploy — only if every archive succeeded. Never commits outside deploy, never archives a half-set then deploys, never self-approves a PR.
---

# ptp-archive-and-deploy — archive-then-deploy end-to-end orchestration

## Purpose

This skill is the orchestration contract behind the single `/ptp:archive-and-deploy` command. It chains
two phases with a hard gate between them — **Phase A** archives each resolved change through the
existing `/ptp:archive` flow, an **archive-convergence gate** admits the deploy only if *every* change
archived, and **Phase B** runs a **single** `/ptp:deploy` on the current feature branch. The whole
reason the command exists is the ordering-plus-gate: archive **must** precede deploy (the deploy
squash-merges the branch that must already contain the archive moves), and the deploy must run **only
if all** archives succeeded (a partial archive followed by a deploy would ship an inconsistent spec
state).

It does **not** restate the methodology of the two underlying flows. Phase A **is** the `/ptp:archive`
command's flow (its gates, its outer-session confirmations, its `ptp-run-at-model` spawn at
`sonnet.medium`); Phase B **is** the `ptp-deploy` skill's flow (driven exactly as `/ptp:deploy` drives
it). This skill owns only the **glue and the archive-convergence gate between the two phases** —
mirroring how `skills/ptp-full/SKILL.md` owns the gate between `/ptp:full`'s plan and apply phases and
defers each phase's detail to the underlying flow.

## Inputs

| Input | Values | Source |
|-------|--------|--------|
| selector | `epic:all` \| `epic:XXXX` \| bare id \| `story:NN` \| empty | Passed through from `$ARGUMENTS`; resolved via the `ptp-change-selector` skill as a set-capable consumer (Role B). |

Resolve the selector via `ptp-change-selector` (§2 grammar, §3 resolution). Operate on the **resolved
id(s)**, never the raw selector string (§3 output rule). When the selector resolves to more than one
change, the resolved set is processed in `(epic, story)` ascending order (legacy/unprefixed appended
after). An **empty** selector defers to **archive's existing empty default / disambiguation** (the
`openspec list` disambiguation in `/ptp:archive` step 1) — it does **not** silently archive every
change and does **not** auto-substitute `epic:all`.

## Outer preconditions (once, up front)

Run these in the **outer session, before any subagent is spawned** — a guaranteed abort must never
spawn a subagent (per `ptp-run-at-model`):

- **HEAD is not `master`/`main`** — `git rev-parse --abbrev-ref HEAD`. If HEAD is `master` or `main`,
  **STOP**: there is nothing to deploy from the base branch (deploy exemption). Do not archive, do not
  spawn.
- **`gh` is authenticated** — `gh auth status`. If not, **STOP** with `gh auth login` install/login
  guidance.
- **Selector resolves** — an empty selector defers to archive's `openspec list` disambiguation; **no**
  silent archive-all.

The branch guard does **not** run here. This command is the documented `ptp-branch-guard` **deploy
exemption**: it operates on the **already-cut** current feature branch and never cuts a branch — cutting
one would break the deploy (which needs the existing branch). The exemption is the single source of
truth in `ptp-branch-guard`; defer the run/skip decision to it (`ptp-run-at-model` defers the guard
run/skip decision to `ptp-branch-guard`), exactly as `/ptp:deploy` does. Do not restate the rule here.

## Phase A — archive (the /ptp:archive flow), per resolved change in story order

For each resolved change `c` in `(epic, story)` ascending order, drive the existing `/ptp:archive`
flow **unweakened** — never weaken, reorder, or remove a gate. Process the changes as a **sequence**,
one blocking `ptp-run-at-model` invocation per change — **never a parallel fan-out**. Two independent
rules put it there. First, `ptp-parallel-fanout` **safety condition 1** (write sets provably disjoint
by construction), which archiving can never establish because every change merges its delta into the
shared `openspec/specs/` tree. Second, `ptp-run-at-model` names `/ptp:archive` (and this Phase A)
**by name** as permanently excluded from its conditional concurrency allowance. So a resolved
`parallel.mode` of `on` — or a `parallel:on` token — changes nothing here. (`ptp-run-at-model`'s
unconditional **one main run per invocation** hard rule is *not* one of those two grounds: it governs
what a single invocation does, not whether N invocations overlap, and citing it as a sequencing rule
is the misreading the amendment removed.) The
branch guard does **not** run in any change (the deploy exemption — see *Outer
preconditions*); HEAD is already on the feature branch and stays there throughout, so no change cuts a
branch.

For each `c`, in order:

1. **Outer session (interactive, before the spawn — the subagent is non-interactive per
   `ptp-run-at-model`):** resolve `c`'s id, then run `/ptp:archive` steps 1–3 unweakened and in their
   existing order — inspect the gates to build the confirmation payload (tasks-complete, validation,
   spec-delta `--skip-specs` determination). Per those steps, if `c`'s `tasks.md` still has any `- [ ]`
   **or** `npx -y openspec validate <c> --strict` fails, **STOP the whole command here in the outer
   session — before the confirmations below and before any subagent is spawned** (see the gate; name
   the blocking change and the gate it failed; do **not** deploy). Only once tasks-complete and
   validation pass, perform the two interactive confirmations:
   - **review-clean confirmation** (`/ptp:archive` step 4) — confirm `/ptp:review <c>` ran with no
     unresolved Critical/High findings.
   - **confirm-action confirmation** (`/ptp:archive` step 5) — show exactly what will move and whether
     `--skip-specs` applies.
   If either confirmation is **not given**, **STOP the whole command before this change's archive
   subagent is even spawned** (see the gate below) — name the blocking change and the confirmation it
   failed; do **not** deploy.
2. **Archive subagent:** invoke `ptp-run-at-model` at `sonnet.medium` to run the **already-confirmed,
   non-interactive** archive operation (`/ptp:archive` step 6) — one foreground `sonnet` subagent that
   **re-enforces tasks-complete and validation as hard refusals** inside the subagent and then runs
   `openspec archive <c> --yes` (with `--skip-specs` only where the inspection found no spec deltas).
3. **Relay `c`'s terminal state:** `completed` → continue to the next change; `refused` → record `c` as
   the blocking change and **STOP the whole command** (see the gate) — no deploy.

## Archive-convergence gate

Phase B (deploy) runs **only if every** resolved change reached the `completed` archive terminal state.
A change fails to converge in any of these ways, and **all** STOP the whole command **before**
Phase B (no partial deploy):

- **(a) an outer gate fails** — `/ptp:archive` step 3's outer tasks-complete or validation check finds
  unchecked tasks or a failing `openspec validate`; **STOP in the outer session before `c`'s
  confirmations and before its archive subagent is spawned**; or
- **(b) an outer confirmation is not given** — the review-clean or confirm-action confirmation for `c`
  is declined/withheld; **STOP before `c`'s archive subagent is even spawned**; or
- **(c) the archive subagent returns `refused`** — its re-enforced hard gate found unchecked tasks or a
  failing `openspec validate`.

The **first** such failure STOPs the command before the deploy phase, and the terminal report **names
the blocking change and the gate/confirmation it failed**. There is **no** partial deploy after a
failed archive. This mirrors `/ptp:full`'s plan-convergence gate blocking the apply phase — the gate is
the whole reason the command exists.

## Phase B — deploy (the ptp-deploy flow), exactly once, only on convergence

After **full** archive convergence (every resolved change `completed`), run the deploy **exactly once**
on the **current feature branch** — deploy operates on the branch, **not** per change, regardless of how
many changes were archived. Reuse `ptp-deploy` via `ptp-run-at-model` at `sonnet.medium` (start phase
`commit`, mode `deploy`), exactly as `/ptp:deploy` does; do not restate `ptp-deploy`'s methodology.

The deploy runs **inline at one nesting level**. Because nesting is one level only (`ptp-run-at-model`
*Nesting caveat*), the wrapped `ptp-deploy` resolves its PR-stage and deploy-stage bounded fix loops
**inline** with the subagent's own tools and **never spawns a nested fix subagent**. The orchestration
skill itself runs in the **outer** session and adds **no** extra nesting level: Phase A is one blocking
subagent per change; Phase B is one blocking subagent total.

Relay the deploy's terminal state verbatim in meaning:

- `completed` → ship summary (PR merged, branch deleted, deploy conclusion, clean base branch).
- `refused` → the gate/precondition reason (e.g. a fix-loop budget exhausted) — **not** success.
- `needs-human-action` → branch protection required an approving review that was not present; surface
  the reason, the PR URL, and the exact follow-up command `/ptp:deploy-pr-approved`. **Never
  self-approve** and **never `--admin`-bypass**.

## Terminal report

Report at whichever terminal point is reached:

- **Ship summary** (deploy `completed`) — the changes archived in order, then the deploy ship summary
  (PR merged, branch deleted, deploy conclusion, clean base branch).
- **Blocking-change STOP** (Phase A did not converge) — name the blocking change and the
  gate/confirmation it failed: an **outer** tasks-complete or validation gate failed (mode (a)), **or**
  an outer review-clean/confirm-action confirmation was not given (mode (b)), **or** an archive
  subagent returned `refused` (mode (c), and which gate — unchecked tasks or failing validation). State
  plainly that the deploy phase was **not** entered (no partial deploy) and list the
  changes that archived before the blocker.
- **Deploy `refused`** — relayed as a gate/precondition failure (e.g. a fix-loop budget exhausted),
  **not** as success.
- **Deploy `needs-human-action`** — the reason, the PR URL, and the exact follow-up
  `/ptp:deploy-pr-approved`; never reported as success.

## Hard rules

- **Branch-guard deploy exemption.** Operates on the current feature branch; **refuses on
  `master`/`main`** (outer abort-precondition); does **not** cut a branch. The exemption lives in
  `ptp-branch-guard` as the single source of truth — referenced, not restated.
- **Archive gates reused unweakened.** Phase A drives `/ptp:archive`'s existing gates (tasks-complete,
  validation-passes, review-clean) — never weakened, reordered, or removed; never archive a change with
  unchecked tasks or a failing validation.
- **Interactive confirmations stay outer.** The review-clean and confirm-action confirmations are
  performed in the outer session **before** each change's archive subagent is spawned, because the
  subagent is non-interactive.
- **Archive-convergence gate — no partial deploy.** Deploy runs only if **every** resolved change
  archived; the first failure (a failed outer tasks-complete/validation gate, a declined outer
  confirmation, **or** an archive-subagent `refused`) STOPs
  the whole command before deploy and names the blocker.
- **Deploy runs exactly once** at the end, on the current branch (not per change).
- **Deploy inline at one nesting level** — the wrapped `ptp-deploy` resolves its fix loops inline and
  never spawns a nested fix subagent.
- **Never self-approve / never `--admin`-bypass** a required approval — defer to `ptp-deploy`'s
  `needs-human-action` posture with the `/ptp:deploy-pr-approved` follow-up.
- **Never archive a half-set then deploy** — the gate is all-or-nothing on archive.
