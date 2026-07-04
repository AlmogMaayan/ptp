---
description: Archive every resolved change then ship the current feature branch — archives each resolved change through the existing /ptp:archive gates in story order, gates on full archive convergence, then deploys the current feature branch exactly once via /ptp:deploy, but only if every archive succeeded. Refuses on master/main, never cuts a branch, never self-approves a PR.
argument-hint: "<change-selector> — id, epic:all, epic:XXXX, story:NN, or epic:XXXX story:NN"
disable-model-invocation: true
---

`/ptp:archive-and-deploy` chains the two end-of-epic steps — **archive every resolved change**, then
**deploy the current feature branch exactly once** — with a hard archive-convergence gate between them
so the deploy runs **only if all** archives succeeded (no partial deploy). It is a **thin command**:
it defers the entire methodology to the `ptp-archive-and-deploy` orchestration skill, mirroring how
`/ptp:full` defers to the `ptp-full` skill. Do not restate the skill's methodology here.

## Inputs

The change selector: $ARGUMENTS

Resolve `$ARGUMENTS` via the `ptp-change-selector` skill as a **set-capable consumer (Role B)** —
accepting `epic:all`, `epic:XXXX`, a bare change id, or `story:NN`, and operating on the resolved
id(s) in `(epic, story)` ascending order. An **empty** selector defers to **archive's existing empty
default** (the `openspec list` disambiguation) — it does **not** silently archive every change nor
auto-substitute `epic:all`.

## Branch safety — special case

Like `/ptp:deploy`, this command does **not** run `ptp-branch-guard` to cut a branch, and it is **not**
read-only. It is a documented special case: it operates on the **already-cut current feature branch**
and **refuses to run on `master`/`main`** (there is nothing to deploy from the base branch). It does
**not** cut a branch — the documented `ptp-branch-guard` **deploy exemption**. The exemption lives in
the `ptp-branch-guard` skill as the single source of truth — reference it, do not restate it.

## Steps

Defer to the **`ptp-archive-and-deploy`** skill, which owns the whole flow: the outer
abort-preconditions (refuse on `master`/`main`; require `gh` auth), **Phase A** (archive each resolved
change through the existing `/ptp:archive` gates in story order, with the interactive confirmations in
the outer session), the **archive-convergence gate** (deploy only if every change archived; the first
failure STOPs before deploy and names the blocker — no partial deploy), and **Phase B** (a single
`ptp-deploy` on the current branch). Then **relay the skill's terminal state verbatim in meaning and
STOP** — never report a refusal or a `needs-human-action` state as success; a deploy
`needs-human-action` surfaces the reason, the PR URL, and the `/ptp:deploy-pr-approved` follow-up.

## Hard rules

- Archives **each resolved change** through the existing archive gates (unweakened) in `(epic, story)`
  story order — never weaken, reorder, or remove a gate.
- The **archive-convergence gate** admits the deploy only if **every** resolved change archived; the
  first failure (a failed outer tasks-complete/validation gate, a declined outer confirmation, or an
  archive-subagent refusal) STOPs the command **before** deploy and names the blocking change — **no
  partial deploy**.
- **Deploy runs exactly once** at the end, on the current feature branch (not per change), only on full
  archive convergence.
- **Refuses on `master`/`main`** and does **not** cut a branch (deploy exemption).
- **Never self-approves a PR** and never `--admin`-bypasses a required approval — a required, unmet
  approval surfaces as `needs-human-action` with the `/ptp:deploy-pr-approved` follow-up.
