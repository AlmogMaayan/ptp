---
description: Run ready epics from the epic backlog through /ptp:full, one at a time in dependency order — five per invocation by default, overridable per invocation with rounds:{count}. Recomputes the ready set after every epic, records each epic's change ids back into openspec/backlog.json, and halts the whole run on the first epic whose /ptp:full does not converge. Never commits, pushes, merges, archives, or deploys. Delegates every rule to the ptp-backlog-run skill.
argument-hint: "[rounds:{count}]"
---

You are running **`/ptp:backlog-run`** — the epic backlog runner. **The methodology lives in the
`ptp-backlog-run` skill and is not restated here**: the `rounds:` token, the recomputation loop, the
per-epic inline `ptp-full` invocation, the halt gate, the write protocol, the terminal-state
classification, and the terminal report are all that skill's, and it in turn defers the backlog file
contract to `ptp-backlog`, the token grammar mechanics to `ptp-run-at-model`, the reviewer gate to
`ptp-codex-mode`, and branch safety to `ptp-branch-guard`.

## Preconditions

Check before doing any work, **in this order**:

1. **Resolve `codex.mode` once**, per the **`ptp-codex-mode`** skill — do not restate its resolution
   or decision contract. Under `required` with no `codex` on PATH, **STOP** up front, doing no work
   and writing nothing. This is a fail-fast gate, **not** a hand-off: `ptp-full` resolves the mode
   itself and is handed none.
2. **Parse and strip `rounds:{count}`**, then apply the **residual-argument refusal** — any remaining
   non-whitespace argument text refuses, naming the residue. Both the token's grammar (by reference to
   `ptp-run-at-model`'s `fast:` switch section) and the refusal live in the **`ptp-backlog-run`**
   skill.
3. **Resolve the `parallel` posture once** from `parallel.mode` in layered ptp config. This command
   accepts **no** `parallel:` token; the resolved posture is held fixed for the whole invocation and
   supplied to every inline `ptp-full` invocation.
4. **Run the `ptp-branch-guard` preamble exactly once**, for the whole run, per that skill — never per
   epic. Every epic lands on that one feature branch.

Steps 1 and 2 are the two aborting preconditions and **both precede the branch guard**, so no invalid
invocation causes a branch to be cut.

## What this command does

Drive the **`ptp-backlog-run`** skill: it loads and validates `openspec/backlog.json` through
`ptp-backlog`, announces the blast radius, then loops — recomputing the ready set before every
iteration, taking one epic, running it through `/ptp:full`, writing the outcome back, and halting the
whole run on the first epic that does not converge — and finally emits the three-bucket terminal
report.

**This command is UNWRAPPED.** It starts **no `ptp-run-at-model` main run of its own** — not for
itself and not per epic — and drives the **`ptp-full` skill inline**. **The reason:**
`ptp-run-at-model`'s *Nesting caveat* forbids naively wrapping a command whose work spawns a subagent
or a Workflow, and `/ptp:full` does **both** (its per-slice `ptp-run-at-model` subagents and its
`ptp-full-apply` Workflow launch) — so a wrapped runner would make **the first epic's Workflow launch
throw**.

**Which epics are ready, and in what order, is `ptp-backlog`'s definition** — referenced here, never
restated in this file or in the runner skill.

## Hard rules

- **Never wrapped** in a `ptp-run-at-model` main run — the command's own work, and every epic, runs in
  this outer session with `ptp-full` invoked inline.
- **Never fan out across backlog epics** — one epic at a time. (`/ptp:full`'s own per-slice fan-out
  inside an epic is unchanged and still governed by `parallel.mode`.)
- **Never commit, push, merge, archive, or deploy** — the work piles up on one branch, uncommitted and
  unarchived, and the pre-run announcement says so.
- **Halt the whole run on a non-converged epic** — mark it `blocked` and take no further epic.
- **One branch guard per run**, never one per epic.
- **No selector and no other token** — no change id, no `epic:`/`story:` selector, no backlog id, and
  no `model:` / `fast:` / `parallel:` token; residue refuses rather than being ignored.
