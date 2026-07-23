---
name: ptp-run-at-model
description: Single source of truth for running a ptp command's work at a deterministic model+effort as the resolved main agent (via ptp-agent-roles). Because the session model cannot be changed in place, this skill owns the contract for running the command's real work either by spawning ONE foreground Claude Agent-tool subagent at a caller-named target model with effort injected as a prompt directive (main=claude, the default, mirroring workflows/ptp-full-run.js) or by shelling out to a write-capable codex exec with model/effort from codex.model/codex.reasoningEffort (main=codex) — then relaying the main run's terminal result (completed / refused / needs-human-action) back to the session verbatim. The branch guard and abort-preconditions run in the outer session before any main work in both directions. Commands reference this skill instead of restating the run-and-relay, the same way ptp-branch-guard owns branch safety and ptp-codex-mode owns the Codex reviewer gate plus the codex.model/codex.reasoningEffort resolution reused here.
---

# ptp-run-at-model — run a command's work at a deterministic model+effort

## Purpose

ptp commands run their work at whatever model/effort the session happens to be set to. The previous
guard was a soft model/effort check that could merely **ask** the user to switch and re-run — it
could not change the session model in place, because no tool can. The only way to actually **run**
work at a chosen model is a **sub-context** with a `model` override.

This skill is the **single source of truth** for that run-and-relay: a command names a target
(`<model>.<effort>`), and this skill runs the command's real work as the resolved main agent — by
default (`main=claude`) in one foreground Claude subagent at that model with effort injected as a
prompt directive, or (`main=codex`) via a write-capable `codex exec` shell-out — then relays the main
run's terminal result to the session. Commands **reference** this skill instead of each restating the spawn, the effort directive,
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
main run (the Claude subagent, or the `codex exec` shell-out when `main=codex`) and relay the result.

The `full`/`full-plan`/`full-run` family does **not** use this skill — it already runs its work in
workflow agents at chosen models (see `ptp-full-run` and `workflows/ptp-full-run.js`).

## The contract

The caller passes:

- a **target** — either a `<model>.<effort>` literal (e.g. `sonnet.medium`, `opus.high`), or the
  instruction "read line 1 of `effort.md`" for a change id; and
- a **work description** — which underlying skill the resolved main agent (the Claude subagent when
  `main=claude`, or the `codex exec` main run when `main=codex`) must invoke, or which documented
  steps it must run (i.e. exactly the work the command would have run in-session).

The skill then runs, **in this order**:

1. **Outer abort-preconditions first.** The calling command runs its cheap, abort-guaranteeing
   preconditions **before** this skill spawns anything — a missing change folder, an empty-selector
   disambiguation, and the like. This mirrors `ptp-branch-guard`'s "abort-guaranteeing
   preconditions run before the guard" rule: **a guaranteed abort must never spawn a subagent or
   start a Codex shell-out.** (Note: a command's *own* refusal gate that is part of the work the main
   run performs — e.g. `/ptp:master`'s clean-tree gate inside the `ptp-master` skill — does **not**
   move outer; it runs inside the main run (the subagent, or the `codex exec` shell-out) and surfaces
   via the `refused` relay state, see *Result relay*. The
   pre-spawn-outer rule is for the command's standalone preconditions and for `ptp-branch-guard`'s
   own dirty-tree handling, which stashes before cutting a branch.)

   **Interactive user confirmations stay outer, too.** The main run is **non-interactive in both
   directions** — neither the Agent-tool subagent (`main=claude`) nor the `codex exec` shell-out
   (`main=codex`) can pause to ask the user a question mid-run; each can only return a terminal state.
   Split by *when the need for the confirmation is known*:
   - **Known before the work starts** (archive's review-clean confirm and its "confirm the action"
     step; archive-force's empty/all scope-confirm STOP): the **outer session performs the
     confirmation before the main work starts** (before spawning the subagent, or before starting the
     `codex exec` shell-out), and the main run then executes only the already-confirmed,
     non-interactive operation. This is the path for the archive-family commands.
   - **Discovered only during the main run's work** (e.g. a deploy hitting a needs-PR-approval state):
     the main run returns the `needs-human-action` terminal state (see *Result relay*) with
     a reason and a precise follow-up command, and the outer session surfaces it.

   The main run itself — subagent or `codex exec` shell-out — **never conducts an interactive
   prompt**; it runs only the non-interactive enforcement + CLI/git work.

2. **Branch guard in the outer session** (write-capable commands only). Run the `ptp-branch-guard`
   preamble **here, in the main session**, because cutting a branch uses the `ptp-branch-prep`
   **Workflow**, and neither a subagent nor a shelled-out Codex can launch it (one-level Agent nesting
   for the subagent; a `codex exec` shell-out runs outside the Agent tree). After this, HEAD
   is on the feature branch. **Defer the run/skip decision to `ptp-branch-guard`'s own "which steps
   run the guard" list** — do not re-decide it here. In particular `/ptp:master` is guard-exempt (it
   deliberately lands on master), so for it this step is intentionally skipped.

3. **Resolve the target.** If the caller passed `<model>.<effort>` literally, use it. If the caller
   passed "read from `effort.md`," read `openspec/changes/<id>/effort.md` **line 1** and parse
   `{model}.{effort}`. If the file is missing or line 1 is not a parseable `{model}.{effort}`, default
   to `opus.high` and **note the defaulting**. (The read-from-`effort.md` path is used by `/ptp:apply`.)

4. **Resolve the main agent.** Invoke the **`ptp-agent-roles`** skill to resolve the role pair
   `{ main, reviewer }` from layered config (default `main=claude`). The value of `main` selects
   which of the two branches in step 5 runs the command's real work. This resolution is a pure
   config read — it spawns nothing, runs no git, and never STOPs on a config typo (a missing
   file/key or out-of-enum value resolves to `claude`, keeping the default path). Only `main` matters
   here; the derived `reviewer` is not used by this skill.

5. **Run the main work** as the resolved main agent. The caller-facing contract (target + work
   description → relayed terminal result) is identical in both branches; only *how* the work runs
   differs.

   - **`main == claude` (default — unchanged from before this change).** **Spawn ONE foreground
     subagent** via the Agent tool with `model` = the resolved model. The prompt MUST contain:
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

   - **`main == codex` (new — write-capable Codex shell-out).** Instead of spawning a Claude
     Agent-tool subagent, run the command's real work by **shelling out (via Bash) to a write-capable
     `codex exec`**. See *The `main=codex` direction* below for the full invocation, the reused
     `codex.model`/`codex.reasoningEffort` resolution, the missing-CLI handling, and the four
     constraints. The resolved-model / effort-directive machinery of the `claude` branch does **not**
     apply here — model and effort come from `codex.model` / `codex.reasoningEffort` (resolved by
     `ptp-codex-mode`). The shell-out is **foreground**: the session **blocks** until `codex exec`
     returns, then relays its result exactly as the `claude` branch does.

6. **Relay.** When the main work returns (whether from the Claude subagent or the `codex exec`
   shell-out), the session surfaces its final result to the user **verbatim in meaning** — a success
   report, a gate refusal, or a structured "needs human action" state. Never silently swallow a STOP
   and never downgrade a refusal to success.

## Optional caller-side `model:` override token

Any command that references this skill MAY additionally support an **opt-in, per-invocation**
`model:<model>.<effort>` token that a user embeds anywhere in that command's free-text argument text,
to override the command's stated default target for that single invocation only. This section is the
single source of truth for the token's grammar, validation, and refusal contract; a supporting command
references this section rather than restating it. As of this writing, `/ptp:brainstorm` and
`/ptp:prd` support this token (see `commands/brainstorm.md` and `commands/prd.md` /
`skills/ptp-prd/SKILL.md`); no other caller of this skill is affected.

### Grammar

```
model:<model>.<effort>
```

- `<model>` ∈ `{sonnet, opus, haiku, fable}` — the Agent tool's `model` parameter enum.
- `<effort>` ∈ `{low, medium, high, xhigh}` — this skill's own effort-directive table keys (see
  *Effort as a prompt directive* below).

### Two-stage detect-then-validate

Recognition is deliberately split into two stages so that "wrong shape → refuse" is achievable rather
than silently swallowed:

1. **Detect a candidate.** Scan the argument text for a whitespace-delimited token that **begins with
   the lowercase literal `model:`** — bounded by start-of-string or whitespace on the left, and
   whitespace or end-of-string on the right. A `model:` substring inside a larger word (e.g.
   `premodel:opus.high`, `x=model:opus.high`) is **not** a candidate. Detection keys on the `model:`
   **prefix alone**, **not** on a dot-bearing pattern — a dot-requiring detector would silently miss
   near-miss typos like `model:opus` (missing effort) and let them fall through as absent, which this
   contract forbids (see step 2).
2. **Validate each candidate** against the exact grammar
   `model:<one of sonnet|opus|haiku|fable>.<one of low|medium|high|xhigh>`, matched case-sensitively
   against these lowercase values. A candidate that begins with the lowercase `model:` prefix but does
   **not** match this exactly — a missing or empty effort (`model:opus`, `model:opus.`), an empty model
   (`model:.high`), an unknown model or effort name, or extra dots — is **recognized-but-invalid**: it
   REFUSES. It does **not** fall through as "absent."

**Case is the one deliberate exception.** Only the exact lowercase `model:` prefix is scanned for, so a
non-lowercase prefix (e.g. `Model:Fable.High`) is **never** a candidate at all and falls through as
**absent** (the command's own default target applies) — this is the single documented case where a
`model:`-shaped-looking token does not refuse.

**At most one candidate is recognized.** Two or more `model:` candidates found in the same argument
text is treated as **invalid** — not "last one wins" — and the refusal reports **all** detected
candidates, not a single "offending token."

### Resolution outcomes

- **Absent** (no candidate detected at all) → the command's target is its own stated default,
  unchanged — exactly as if this section did not exist.
- **Exactly one valid candidate** → the resolved literal (`<model>.<effort>`) **replaces** the
  command's default as the target passed to this skill, for that invocation only. No config file is
  read or written; nothing persists past the invocation.
- **Invalid** (a recognized-but-invalid candidate, or two or more candidates) → the calling command
  **refuses and stops**, reporting the offending candidate(s) and the two valid enums, **before**
  evaluating any branch guard or spawning any subagent or Codex shell-out. It never silently falls
  back to the command's default target.

### Strip-before-use ordering

The parse-and-strip step runs in the calling command's **outer session**, **before** that command's own
argument grammar (e.g. change-id derivation, selector/free-text classification) and **before** that
command's own branch-name derivation or branch guard. This ordering matters: if the token were left in
place, it could get folded into a derived description or misread as part of a selector, and — for a
command that derives its branch name from raw argument text before invoking this skill — an invalid
token must abort before that branch-name derivation and branch cut, not after.

### Interaction with `main=codex`

The override only ever selects among the 4 Claude Agent-tool models — it has no effect when
`ptp-agent-roles` resolves `main=codex` for this invocation. In that case Codex's model/effort continue
to come from `codex.model`/`codex.reasoningEffort` per `ptp-codex-mode`, unaffected by this token
(documented, not silently ignored).

## Effort as a prompt directive

This section describes the **`main=claude`** direction; the `main=codex` direction maps effort to
`codex.reasoningEffort` instead (see *The `main=codex` direction*). Effort is **not** an Agent-tool
parameter; the Agent tool has no effort knob. The skill injects the effort as a directive in the
subagent prompt, mapping the effort token exactly as `workflows/ptp-full-run.js`
`effortDirective(effort)` does:

| effort | directive injected into the subagent prompt |
|--------|----------------------------------------------|
| `xhigh` | reason explicitly about invariants, edge cases, and failure modes before every edit; prefer correctness over speed. |
| `high` | think carefully about interactions and edge cases before each edit. |
| `medium` | apply normal care; verify each task before moving on. |
| `low` | move directly on the obvious implementation. |
| (unknown) | fall back to the `high` directive ("think carefully about interactions and edge cases before each edit."). |

This is a **soft hint** — the directive nudges the subagent's deliberation; it is not a hard setting.
This is the same limitation `ptp-full-run` already accepts.

## The `main=codex` direction (write-capable Codex shell-out)

When `ptp-agent-roles` resolves `main=codex` (step 4), step 5 runs the command's real work by
shelling out to a **write-capable** `codex exec` instead of spawning a Claude Agent-tool subagent.
The caller-facing contract is unchanged: same target + work description in, same three-state relay
out.

**Invocation.** Pipe the work description (the exact work the command would have run in-session,
i.e. the same skill/steps the `claude` branch would have instructed the subagent to run) as the
prompt to a `codex exec` running in a **`workspace-write`** sandbox, sourcing model and reasoning
effort from config:

Because the shelled-out `codex exec` is a **separate CLI** that does **not** have the Claude Skill
tool and does **not** inherit the outer command/skill context, `$WORK_PROMPT` MUST be
**self-contained** — do **not** merely name a Claude skill to "invoke". Spell the protocol out inline
(the change id, the relevant paths, the full task sequence, and the terminal-state and branch-guard
instructions), or explicitly direct Codex to **read** the specific repository Markdown file(s) that
carry the protocol (e.g. the command file and `skills/openspec-apply-change/SKILL.md`). The
`claude` branch can rely on the subagent's Skill tool; the `codex` branch cannot.

```
printf '%s' "$WORK_PROMPT" | codex exec -s workspace-write [ -m <model> ] [ -c model_reasoning_effort=<effort> ] -
```

- `-s workspace-write` (equivalently `--sandbox workspace-write`) — the main implementer must write
  files, so it needs a write-capable sandbox. Confirm the exact flag spelling against the installed
  `codex` CLI; the mandate is a write-capable posture, not a specific spelling.
- `-m <model>` — appended **iff** `codex.model` resolves to a set value.
- `-c model_reasoning_effort=<effort>` — appended **iff** `codex.reasoningEffort` resolves to a set
  value.
- **`model` from `codex.model`, `effort` from `codex.reasoningEffort`, both resolved by
  `ptp-codex-mode`** (its existing model/effort resolution — reused, **no new config keys**). An
  optional soft effort **prompt hint** MAY additionally be woven into `$WORK_PROMPT`.
- The `$WORK_PROMPT` also carries the same branch-guard note the `claude` branch gives its subagent —
  which case depends on the command exactly as in the `claude` branch: **for a branch-guarded
  command** the outer guard already ran, so the shelled-out Codex must **not** attempt to launch
  `ptp-branch-prep`; **for a guard-exempt command** (e.g. `/ptp:master`, where step 2 was skipped) the
  branch guard does **not** apply and the shelled-out Codex must **not** run it or launch
  `ptp-branch-prep` — plus the same instruction to return a terminal result for the relay.

**Ownership boundary (do not confuse with the reviewer).** This write-capable invocation is a
**NEW call site owned by `ptp-run-at-model`** — it is **NOT** a relaxation of the read-only Codex
**reviewer** rule that `ptp-codex-mode` owns (`codex exec -s read-only …`, which that skill forbids
loosening). `ptp-codex-mode` keeps owning the read-only reviewer mechanics **and** the
`codex.model`/`codex.reasoningEffort` resolution reused here; `ptp-run-at-model` owns only this
write-capable main invocation. **Never** use `--full-auto`,
`--dangerously-bypass-approvals-and-sandbox`, or any flag that bypasses the sandbox/approvals.

**Missing `codex` CLI.** If `main=codex` but the `codex` CLI is not available to run the main work
(not on PATH), the main run **cannot proceed**. Do **not** report a silent success and do **not**
fall back to Claude silently. Route it through the relay as a `refused` / `needs-human-action`
terminal state carrying the remediation: **install `codex`, or set `roles.main=claude`**. The three
terminal states (completed / refused / needs-human-action) apply in this direction exactly as in the
`claude` direction.

### Four honest constraints (Codex main direction)

1. **Harness is always Claude.** The Claude Code session remains the **outer harness**. `main=codex`
   is a **shell-out**: the session shells out to `codex exec` for the heavy work and control
   **returns to the session** when `codex exec` finishes. It is **not** a Codex-launched session and
   the user did not start a different CLI.
2. **Write-capable sandbox (safety).** The main implementer runs in a **write-capable**
   (`workspace-write`) sandbox — materially different from the read-only reviewer — so a Codex main
   run **can modify the working tree and run tools**. The posture is scoped to this
   main-implementer call site only; the reviewer stays `-s read-only`; and the outer-session branch
   guard (step 2) still runs before any main work, so — for a **branch-guarded** command (one not
   exempt per `ptp-branch-guard`, e.g. not `/ptp:master`) — a write-capable Codex run never starts on
   the base branch. (A guard-exempt command such as `/ptp:master` deliberately operates on the base
   branch; the guard defers that decision to `ptp-branch-guard`.) Never bypass the sandbox or
   approvals.
3. **Shell-out, not Agent nesting.** A `codex exec` main run is a **Bash shell-out**, not a Claude
   Agent-tool subagent — so it does **not** consume the one-level Agent nesting budget (it sidesteps
   that limit). But the shelled-out Codex **cannot itself launch a Claude Workflow**; long-running
   writes happen outside the Agent tree. This is the key difference from the `claude` branch.
4. **Effort is a soft hint — both directions.** Effort never hard-guarantees the model's
   deliberation. For `claude` it is the **prompt directive** (see *Effort as a prompt directive*);
   for `codex` it is `codex.reasoningEffort` applied as an explicit Codex **runtime setting**
   (`-c model_reasoning_effort=<effort>`) plus an **optional soft prompt hint**. Both influence, but
   neither guarantees, how hard the model deliberates.

## Result relay

The main work (the Claude Agent-tool subagent when `main=claude`, or the `codex exec` shell-out when
`main=codex`) returns a **terminal state** that is one of three distinguishable cases; the session
surfaces each one rather than collapsing it into a generic "done":

- **`completed`** — with a human-facing summary of what was done. The session prints the summary.
- **`refused`** — a gate or precondition the main run hit (e.g. an archive gate finding unchecked
  tasks, a failing `openspec validate`, `master`'s dirty-tree gate, or — when `main=codex` — the
  `codex` CLI being unavailable). The session reports the **refusal and its reason** — never as a
  successful completion.
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

- **Never start the main work before the outer branch guard** (for write-capable commands) — neither
  the Claude subagent nor the `codex exec` shell-out can cut the branch (a subagent cannot launch the
  `ptp-branch-prep` Workflow; a shell-out runs outside the Agent tree).
- **Never swallow a main-run STOP/refusal** — relay it verbatim in meaning; a refusal or
  needs-human-action state (including a missing `codex` CLI when `main=codex`) must never be reported
  as success.
- **Never hardcode a per-command model/effort target** — the caller always supplies the target.
- **Effort is a prompt directive (`main=claude`), never an Agent parameter**; when `main=codex` it is
  `codex.reasoningEffort` plus an optional soft prompt hint.
- **The Codex main invocation is write-capable but distinct from the reviewer** — it never loosens
  `ptp-codex-mode`'s read-only reviewer rule and never uses
  `--dangerously-bypass-approvals-and-sandbox`. No new config keys; model/effort come from
  `codex.model`/`codex.reasoningEffort`.
- **One foreground main run per `ptp-run-at-model` invocation** — not a fan-out, not a background
  Workflow. A single invocation runs exactly one blocking main run (one Claude subagent, or one
  `codex exec` shell-out) and waits for it. (A command that processes a multi-item selector — e.g.
  `/ptp:archive epic:XXXX` — invokes `ptp-run-at-model` once **per item in sequence**, one blocking
  main run at a time; that is still no fan-out and no background Workflow.)
- **Defer the branch-guard run/skip decision to `ptp-branch-guard`** — do not re-decide which commands
  are guard-exempt here (e.g. `/ptp:master` stays exempt).
