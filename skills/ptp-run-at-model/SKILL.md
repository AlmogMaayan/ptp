---
name: ptp-run-at-model
description: Single source of truth for running a ptp command's work at a deterministic model+effort. Because the session model cannot be changed in place, this skill owns the contract for spawning ONE foreground Agent-tool subagent at a caller-named target model — with effort injected as a prompt directive (mirroring workflows/ptp-full-run.js) — running the command's real work there, and relaying the subagent's terminal result (completed / refused / needs-human-action) back to the session verbatim. The branch guard and abort-preconditions run in the outer session before the spawn. Commands reference this skill instead of restating the spawn-and-relay, the same way ptp-branch-guard owns branch safety and ptp-codex-mode owns the Codex gate.
---

# ptp-run-at-model — run a command's work at a deterministic model+effort

## Purpose

ptp commands run their work at whatever model/effort the session happens to be set to. The previous
guard was a soft model/effort check that could merely **ask** the user to switch and re-run — it
could not change the session model in place, because no tool can. The only way to actually **run**
work at a chosen model is a **sub-context** with a `model` override.

This skill is the **single source of truth** for that spawn-and-relay: a command names a target
(`<model>.<effort>`), and this skill runs the command's real work in one foreground subagent at that
model, injecting effort as a prompt directive, then relays the subagent's terminal result to the
session. Commands **reference** this skill instead of each restating the spawn, the effort directive,
the branch-guard ordering, and the relay — the same single-source-of-truth pattern as
`ptp-branch-guard` (branch safety) and `ptp-codex-mode` (the Codex gate). ptp already does this
spawn-at-a-model-with-an-effort-directive trick for apply/review in `workflows/ptp-full-run.js`; this
skill generalizes it for single linear commands.

## Which commands use this skill

Many ptp commands run their real work through this skill so it executes at a deterministic
model+effort rather than at the session's current setting. This table is **representative
documentation** — it is **not** the skill's target-resolution mechanism. At runtime the skill never
looks a command up in a table; the **caller always supplies the target** (see *The contract* and the
*Hard rules*), so the skill hardcodes no per-command target.

| Target | Commands (representative) |
|--------|---------------------------|
| `sonnet.medium` | `archive`, `archive-force`, `master`, and the deploy family (`deploy`, `deploy-pr-approved`, `merge-to-master`) via their own skills |
| `opus.high` | `brainstorm`, `brainstorm-only`, `plan`, `plan-multiple`, the review family (`review`, `review-loop`, `review-full`, `review-plan*`, `review-brainstorm*`, `review-prd*`), and the PRD stage (`prd`, `prd-full`) |
| read line 1 of `effort.md` | `apply` |

**Read-only commands skip the branch-guard step but still wrap** — they have no working-tree writes,
so step 2 of the contract is a no-op for them, but they still run their work in the target-model
subagent and relay the result.

The `full`/`full-plan`/`full-run` family does **not** use this skill — it already runs its work in
workflow agents at chosen models (see `ptp-full-run` and `workflows/ptp-full-run.js`).

## The contract

The caller passes:

- a **target** — either a `<model>.<effort>` literal (e.g. `sonnet.medium`, `opus.high`), or the
  instruction "read line 1 of `effort.md`" for a change id; and
- a **work description** — which underlying skill the subagent must invoke, or which documented
  steps it must run (i.e. exactly the work the command would have run in-session).

The skill then runs, **in this order**:

1. **Outer abort-preconditions first.** The calling command runs its cheap, abort-guaranteeing
   preconditions **before** this skill spawns anything — a missing change folder, an empty-selector
   disambiguation, and the like. This mirrors `ptp-branch-guard`'s "abort-guaranteeing
   preconditions run before the guard" rule: **a guaranteed abort must never spawn a subagent.**
   (Note: a command's *own* refusal gate that is part of the work the subagent runs — e.g.
   `/ptp:master`'s clean-tree gate inside the `ptp-master` skill — does **not** move outer; it runs
   inside the subagent and surfaces via the `refused` relay state, see *Result relay*. The
   pre-spawn-outer rule is for the command's standalone preconditions and for `ptp-branch-guard`'s
   own dirty-tree handling, which stashes before cutting a branch.)

   **Interactive user confirmations stay outer, too.** The Agent-tool subagent is **non-interactive**
   — it cannot pause to ask the user a question mid-run; it can only return a terminal state. Split by
   *when the need for the confirmation is known*:
   - **Known before the work starts** (archive's review-clean confirm and its "confirm the action"
     step; archive-force's empty/all scope-confirm STOP): the **outer session performs the
     confirmation before spawning**, and the subagent then executes only the already-confirmed,
     non-interactive operation. This is the path for the archive-family commands.
   - **Discovered only during the subagent's work** (e.g. a deploy hitting a needs-PR-approval state):
     the subagent returns the `needs-human-action` terminal state (see *Result relay*) with
     a reason and a precise follow-up command, and the outer session surfaces it.

   The subagent itself **never conducts an interactive prompt**; it runs only the non-interactive
   enforcement + CLI/git work.

2. **Branch guard in the outer session** (write-capable commands only). Run the `ptp-branch-guard`
   preamble **here, in the main session**, because cutting a branch uses the `ptp-branch-prep`
   **Workflow**, and a subagent cannot launch a Workflow (nesting is one level only). After this, HEAD
   is on the feature branch. **Defer the run/skip decision to `ptp-branch-guard`'s own "which steps
   run the guard" list** — do not re-decide it here. In particular `/ptp:master` is guard-exempt (it
   deliberately lands on master), so for it this step is intentionally skipped.

3. **Resolve the target.** If the caller passed `<model>.<effort>` literally, use it. If the caller
   passed "read from `effort.md`," read `openspec/changes/<id>/effort.md` **line 1** and parse
   `{model}.{effort}`. If the file is missing or line 1 is not a parseable `{model}.{effort}`, default
   to `opus.high` and **note the defaulting**. (The read-from-`effort.md` path is used by `/ptp:apply`.)

4. **Spawn ONE foreground subagent** via the Agent tool with `model` = the resolved model. The prompt
   MUST contain:
   - (a) the **effort directive** for the resolved effort (see *Effort as a prompt directive*);
   - (b) an instruction to perform the command's actual work — invoke the same underlying skill, or
     run the same documented steps the command would have run in-session;
   - (c) **for a branch-guarded command** (one for which step 2 ran the outer branch guard): a note
     that the subagent's own `ptp-branch-guard` check will be a **no-op** because HEAD is already on
     the feature branch, so it must **not** attempt to launch `ptp-branch-prep`. **For a
     guard-exempt command** (e.g. `/ptp:master`, where step 2 was skipped): a note that the branch
     guard does **not** apply and the subagent must **not** run it or launch `ptp-branch-prep`
     (matching the command's own guard-exemption);
   - (d) an instruction to return its final result — including any terminal state — as the relay
     payload (see *Result relay*).

   The spawn is **foreground**: the session **blocks** until the subagent returns.

5. **Relay.** When the subagent returns, the session surfaces its final result to the user **verbatim
   in meaning** — a success report, a gate refusal, or a structured "needs human action" state. Never
   silently swallow a STOP and never downgrade a refusal to success.

## Effort as a prompt directive

Effort is **not** an Agent-tool parameter; the Agent tool has no effort knob. The skill injects the
effort as a directive in the subagent prompt, mapping the effort token exactly as
`workflows/ptp-full-run.js` `effortDirective(effort)` does:

| effort | directive injected into the subagent prompt |
|--------|----------------------------------------------|
| `xhigh` | reason explicitly about invariants, edge cases, and failure modes before every edit; prefer correctness over speed. |
| `high` | think carefully about interactions and edge cases before each edit. |
| `medium` | apply normal care; verify each task before moving on. |
| `low` | move directly on the obvious implementation. |
| (unknown) | fall back to the `high` directive ("think carefully about interactions and edge cases before each edit."). |

This is a **soft hint** — the directive nudges the subagent's deliberation; it is not a hard setting.
This is the same limitation `ptp-full-run` already accepts.

## Result relay

The subagent returns a **terminal state** that is one of three distinguishable cases; the session
surfaces each one rather than collapsing it into a generic "done":

- **`completed`** — with a human-facing summary of what was done. The session prints the summary.
- **`refused`** — a gate or precondition the subagent hit (e.g. an archive gate finding unchecked
  tasks, a failing `openspec validate`, `master`'s dirty-tree gate). The session reports the
  **refusal and its reason** — never as a successful completion.
- **`needs-human-action`** — a state that needs a human, carrying a machine-readable **reason** plus
  the **exact follow-up command** the user should run (e.g. a deploy that needs PR approval →
  `/ptp:deploy-pr-approved`). The session reports the reason **and** the follow-up command.

Whether the payload is literally a JSON object or a structured text block is an implementation choice;
the **observable contract** is that the three terminal states are distinguishable and surfaced. The
deploy family populates the deploy-specific `needs-human-action` case (a required PR approval →
`/ptp:deploy-pr-approved`).

## Nesting caveat

A wrapped command whose **work itself spawns a subagent or a Workflow** cannot be naively wrapped: the
inner spawn would be a second nesting level, which throws (nesting is one level only). For such
commands (the deploy trio, whose `ptp-deploy` skill may spawn a fix subagent), the wrapping subagent
must perform that inner work **inline** rather than spawning again, or the command must be wrapped at
a boundary that keeps the nested spawn in the outer session.

Commands with **no nested spawn** wrap cleanly — e.g. `archive` is an OpenSpec-CLI call, `master` is
git, and archive-force delegates to the inline `ptp-archive-force` skill.

## Hard rules

- **Never spawn before the outer branch guard** (for write-capable commands) — the subagent cannot
  cut the branch (it cannot launch the `ptp-branch-prep` Workflow).
- **Never swallow a subagent STOP/refusal** — relay it verbatim in meaning; a refusal or
  needs-human-action state must never be reported as success.
- **Never hardcode a per-command model/effort target** — the caller always supplies the target.
- **Effort is a prompt directive, never an Agent parameter.**
- **One foreground subagent per `ptp-run-at-model` invocation** — not a fan-out, not a background
  Workflow. A single invocation spawns exactly one blocking subagent and waits for it. (A command
  that processes a multi-item selector — e.g. `/ptp:archive epic:XXXX` — invokes `ptp-run-at-model`
  once **per item in sequence**, one blocking subagent at a time; that is still no fan-out and no
  background Workflow.)
- **Defer the branch-guard run/skip decision to `ptp-branch-guard`** — do not re-decide which commands
  are guard-exempt here (e.g. `/ptp:master` stays exempt).
