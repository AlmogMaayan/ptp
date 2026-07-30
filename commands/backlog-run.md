---
description: Run ready epics from the epic backlog through /ptp:full, one at a time in ascending backlog-id order — five per invocation by default, overridable per invocation with rounds:{count}. Recomputes the ready set after every epic, records each epic's change ids back into the backlog store, and halts the whole run on the first epic whose /ptp:full does not converge. Never commits, pushes, merges, archives, or deploys. Delegates every rule to the ptp-backlog-run skill.
argument-hint: "[rounds:{count}]"
---

You are running **`/ptp:backlog-run`** — the epic backlog runner. **The methodology lives in the
`ptp-backlog-run` skill and is not restated here**: the `rounds:` token, the recomputation loop, the
per-epic inline `ptp-full` invocation, the halt gate, the write protocol, the terminal-state
classification, and the terminal report are all that skill's, and it in turn defers the backlog store
contract to `ptp-backlog`, the token grammar mechanics to `ptp-run-at-model`, the reviewer gate to
`ptp-codex-mode`, and branch safety to `ptp-branch-guard`.

## The refusal contract — exactly one, and it names its own cause

**The board write path has shipped**, so this command writes. What survives from the refusal that stood
while it had not is the **shape** of the refusal, not its wording:

- **Exactly one refusal exists in this file**, issued **non-silently and up front**, naming the
  **specific** reason it cannot write. No second, divergently-worded refusal is added beside it.
- The grounds are their owning contracts' and are **cited, never restated**: `ptp-backlog`'s
  **writer-eligibility** rule; `ptp-github-projects-mcp`'s **`read-only`** and **`unavailable`**
  preflight verdicts (precondition 3 below); the read path's **degraded-scope** withholding, which this
  command consumes because it **consumes the ready set**, refusing at the top of the iteration and
  never classifying a withheld ready set as an empty one; and an entry whose **content type offers no
  path to update a carrier** a planned field rides. Each is a **condition within this one refusal
  contract**, naming its own cause when it fires.
- **No ground is worded over the write path being unshipped**, that antecedent having lapsed.
- **No fallback of any kind.** No local backlog file is read, created, or written, and no other store
  is substituted — under any verdict, any problem, any refusal, and **any write outcome**, the error
  path included.

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
3. **Resolve the backlog configuration and evaluate the capability preflight verdict**, per
   **`ptp-github-projects-mcp`** — that skill owns the `backlog.*` keys, the completeness verdict, the
   namespace, the preflight, its three verdicts and its STOP message, and **none of them is restated
   here**. The **verdict disposition table** — a verdict permitting only reads STOPs a writer, and the
   verdict is resolved **once per invocation, never per epic** — lives in the **`ptp-backlog-run`**
   skill.
4. **Resolve the `parallel` posture once** from `parallel.mode` in layered ptp config. This command
   accepts **no** `parallel:` token; the resolved posture is held fixed for the whole invocation and
   supplied to every inline `ptp-full` invocation.
5. **Run the `ptp-branch-guard` preamble exactly once**, for the whole run, per that skill — never per
   epic. Every epic lands on that one feature branch.

Steps 1, 2, and 3 are the **three** aborting preconditions and **all three precede the branch guard**,
so no invalid invocation, and no invocation that provably cannot write, causes a branch to be cut.

## What this command does

Drive the **`ptp-backlog-run`** skill: it loads and validates the backlog store through
`ptp-backlog`, announces the blast radius — **six** items, the sixth naming the shared-board
consequence — then loops, recomputing the ready set before every iteration, taking one epic, running it
through `/ptp:full`, writing the outcome back through `ptp-backlog-write`'s ordered write sequence, and
halting the whole run on the first epic that does not converge **or whose write group does not
complete**. It finally emits the **four-bucket** terminal report — `processed`, `halted`,
**`take-failed`**, `never-started` — classified into **five** loop-terminal states, which now include
**`store-write halt`** at the top of the ladder and the mid-run validation rung, **`store-defect
halt`**. Every one of those is the skill's; none is restated here.

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
