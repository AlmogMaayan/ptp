---
name: ptp-run-at-model
description: Single source of truth for running a ptp command's work at a deterministic model+effort as the resolved main agent (via ptp-agent-roles). Because the session model cannot be changed in place, this skill owns the contract for running the command's real work either by spawning ONE foreground Claude Agent-tool subagent at a caller-named target model with effort injected as a prompt directive (main=claude, the default, mirroring workflows/ptp-full-apply.js) or by shelling out to a write-capable codex exec with model/effort from codex.model/codex.reasoningEffort (main=codex) — then relaying the main run's terminal result (completed / refused / needs-human-action) back to the session verbatim. The branch guard and abort-preconditions run in the outer session before any main work in both directions. Commands reference this skill instead of restating the run-and-relay, the same way ptp-branch-guard owns branch safety and ptp-codex-mode owns the Codex reviewer gate plus the codex.model/codex.reasoningEffort resolution reused here. Also owns the optional per-invocation `fast:on`/`fast:off` switch contract — fast mode being a session-scoped Claude Code setting that is never set per spawn, honored via a read-only preflight and advisory rather than an enablement mechanism.
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
spawn-at-a-model-with-an-effort-directive trick for apply/review in `workflows/ptp-full-apply.js`; this
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

The `full`/`full-plan`/`full-apply` family does **not** use this skill — it already runs its work in
workflow agents at chosen models (see `ptp-full-apply` and `workflows/ptp-full-apply.js`).

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

   **Choosing a target.** Name the **cheapest model that suffices for the work**, not for the
   command's importance. `ptp-branch-prep` runs at `haiku` because git plumbing is mechanical (see
   `skills/ptp-branch-guard/SKILL.md`). A step qualifies as **mechanical** — and so a candidate for a
   cheaper target — only when it is **fully specified**, **leaves no design judgment**, and has a
   **single verifiable correct outcome**. Conversely, **never downgrade a step that carries
   judgment** — planning, decomposition, review, or any step whose output another step trusts without
   re-checking — to a cheaper model in order to save latency or cost; a wrong judgment call is not a
   latency win.

   **Spawn-site audit (`0034_04`).** The enumeration below is taken from the **sites themselves** —
   every command and skill file that names a target for a spawned run, plus the spawn sites that do
   not route through this skill at all — not from *Which commands use this skill* above, which that
   section explicitly labels **representative documentation** rather than a complete list. Each site
   carries its own verdict against the mechanical test:

   | Candidate | Assessment | Verdict |
   |---|---|---|
   | Every `opus.high` site, named in full: `commands/` — `brainstorm`, `brainstorm-full`, `brainstorm-only`, `plan`, `plan-multiple` (beats 2 and 3), `prd`, `prd-full`, `full`, `full-plan`, `review`, `review-loop`, `review-full`, `review-fix`, `review-plan`, `review-plan-full`, `review-plan-loop`, `review-brainstorm`, `review-brainstorm-full`, `review-prd`, `review-prd-full`, `codex-review`, `codex-review-loop`, `codex-review-plan`, `codex-review-plan-loop`, `codex-review-prd`, `codex-review-prd-loop`, `codex-review-uncommitted`; `skills/` — `ptp-brainstorm-full`, `ptp-prd`, `ptp-prd-full`, `ptp-review-brainstorm-full`, `ptp-review-prd-full`, `ptp-full`, `ptp-full-apply` | Every one of them produces design, decomposition, PRD, or review judgment that a later stage consumes without re-deriving it. The verdict is identical for each, so they share one row rather than being assessed differently. | Judgment-carrying; downgrade forbidden by the rule above. |
   | Every `sonnet.medium` site, named in full: `commands/` — `archive`, `archive-force`, `master`, `deploy`, `deploy-master`, `deploy-pr-approved`, `merge-to-master`; `skills/` — `ptp-archive-and-deploy`, `ptp-deploy-master` | The git plumbing inside them is mechanical, but the *step* is not, and this holds for each one individually: `/ptp:archive` and `/ptp:archive-force` decide whether the gates pass and merge delta specs into the shared `openspec/specs/` tree; `/ptp:master` must distinguish a clean tree from a dirty one and refuse rather than force; `/ptp:deploy`, `/ptp:deploy-pr-approved`, `/ptp:merge-to-master`, `/ptp:deploy-master` and their two skills autonomously diagnose and repair merge conflicts, CI failures, and deploy failures within a retry budget, and decide when a human approval is required. None has a single verifiable correct outcome fixed in advance, so none meets the mechanical test. | Not mechanical; every one stays at `sonnet.medium`. |
   | `/ptp:apply` (`effort.md`-derived per-change target) | The target is the change's own recorded recommendation, and implementation is judgment-carrying by definition. | No fixed target to downgrade; judgment-carrying. |
   | The only `haiku` site: `ptp-branch-prep`, defined in `skills/ptp-branch-guard/SKILL.md` and named by every guarded command that cites it (`brainstorm`, `brainstorm-full`, `plan`, `prd`, `prd-full`, and this skill) | Already runs at `haiku`, and the skill pins it there with a hard no-escalate rule — pure git plumbing (stash/checkout/pull/branch), fully specified, no design judgment, single verifiable outcome. | Already at the cheapest tier; nothing to change. |
   | The `full` family's workflow agents (`workflows/ptp-full-apply.js`) | Named outside this skill (the family does not use it): the code-review agent is fixed at `opus`, and the apply agent takes the per-story recommendation with `opus` as its default. Both are judgment-carrying stages. | Judgment-carrying; downgrade forbidden. |
   | `ptp-workflow-cache-heal` | A Bash step invoked directly via the Bash tool, not an agent spawn — it has no `model` parameter to choose at all. | Not a spawn site; no model to name. |
   | `plan-multiple`'s cross-reference verification (step 5f) | Runs in the **outer session**, after the beat-3 join, not inside any spawned agent — it has no `model` parameter to choose. | Not a spawn site; no model to name. |

   **Result: nil.** No existing spawn site qualifies for a downgrade. This is recorded as a valid,
   complete audit outcome — the rule's durable value is the stated principle itself, applied to every
   target named from now on, not a manufactured change here.

4. **Resolve the main agent.** Invoke the **`ptp-agent-roles`** skill to resolve the role pair
   `{ main, reviewer }` from layered config (default `main=claude`). The value of `main` selects
   which of the two branches in step 5 runs the command's real work. This resolution is a pure
   config read — it spawns nothing, runs no git, and never STOPs on a config typo (a missing
   file/key or out-of-enum value resolves to `claude`, keeping the default path). Only `main` matters
   here; the derived `reviewer` is not used by this skill.

   **Telemetry auto-start preamble.** In this same slot, and **before** the ledger open below, run
   the **telemetry auto-start preamble** defined in `skills/ptp-telemetry/SKILL.md` §15 — so the span
   receiver is listening before the run it observes emits anything. **Reference** it; do **not**
   restate its mode gate, its env check, its probe, or its lockfile rules here. It resolves
   `telemetry.mode` **once** and that single resolution is **shared with the ledger open that
   immediately follows**, never repeated: slice 1 guarantees the off path performs exactly one
   layered config read, and resolving twice would break that guarantee. With the mode not `on` the
   preamble returns immediately — no probe, no file touch, no process, no output — and this skill
   continues unchanged. When it returns a non-empty advisory, emit **that one line** and continue; it
   never STOPs, never retries, never alters the relayed terminal state, and never writes a Claude
   Code setting.

   **Ledger open (telemetry).** After step 4 and **before** step 5 — the same slot the `fast:`
   preflight already occupies — append the telemetry run ledger's **open** line for this main run,
   per the `ptp-telemetry` skill. This slot is chosen because it is the earliest point at which
   **both** `agent_role` and `cli` are known (step 4 resolves the main-agent identity), so no field
   needs back-filling and no read-modify-write is ever required. The resolved *model* is
   deliberately **not** part of this rationale: step 3 resolves it only for the `main=claude` branch,
   `main=codex` sources model and effort inside step 5, and `model` is not a ledger field at all.
   See *Telemetry: bracketing the main run* below for the gate, the never-fail rule, and the
   role/CLI pairs.

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
       payload (see *Result relay*);
     - (e) an instruction to **issue independent tool calls in one message**: when several reads,
       greps, or other tool calls do not depend on one another's results, batch them into a single
       message rather than serializing them one call per turn. This instruction is scoped strictly to
       calls that are **independent** of each other's results — it is never phrased as a blanket
       "batch everything," because batching a call together with the call it depends on is a
       correctness bug, not a latency win. It concerns the **shape** of tool calls only: it never
       instructs the subagent to do less work, read fewer files, or truncate investigation to reduce
       round trips;
     - (f) **(optional)** when the caller has already derived context in its own outer session that
       the subagent's work would otherwise re-derive — notably the output of `npx -y openspec list`
       and `npx -y openspec list --specs` — the caller's captured output, inlined **verbatim**, together
       with an instruction to use the inlined snapshot rather than re-running the listing command. A
       caller that has nothing to hand down simply omits part (f); the skill itself **never** runs
       `openspec list` or any other repository query on the caller's behalf — this pass-down is opt-in
       per caller, so commands whose work has no use for the listing pay nothing. The subagent MUST
       re-run the listing when either of exactly two triggers holds: (1) it has itself created, moved,
       or deleted anything under `openspec/changes/` during this run, so the inlined snapshot is
       provably stale; or (2) it needs information the snapshot does not carry (e.g. a `--json` shape,
       or the `--specs` listing when only the plain listing was inlined). Absent either trigger, the
       inlined snapshot is authoritative for the run — no time-to-live, timestamp, or fingerprint check
       is used. A snapshot that reports **zero** active changes is a legitimate, authoritative value
       and MUST NOT be treated as if no snapshot had been supplied. This part carries a matching
       **supplier-side** obligation on the caller: the consumer's two triggers are self-scoped to
       writes the consuming run itself performs, so they cannot detect a snapshot invalidated by a
       *different* run the caller started in the same flow (e.g. `/ptp:plan-multiple` supplying its
       pre-decompose capture to a per-slice planning run after the decompose run deleted the monolithic
       change folder). A caller MUST NOT supply a capture that its own flow has already invalidated
       through any run it started — it MUST re-capture before supplying it, or supply nothing, rather
       than relying on the consuming run's trigger 1 to catch a staleness the caller itself introduced.

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

   **Ledger close (telemetry).** At this same step, append the run's **close** line under the id
   minted at the open, with `outcome` taken **directly** from the relayed terminal state:
   `completed` → `completed`, `refused` → `refused`, `needs-human-action` → `needs-human-action`.
   Closing here — at the **single funnel** both the `main=claude` and `main=codex` branches return
   through — rather than at the two per-branch return sites is deliberate: one bracket cannot drift
   the way two would. The close never delays, blocks, or alters the relay itself.

## Telemetry: bracketing the main run

This skill's main run is a telemetry **write point**. The record shape, the `run_id` mint-once-then-
propagate rule, the append protocol, the store layout, and the CSV rules are defined **once**, in the
`ptp-telemetry` skill — this section **references** them and lists **no** ledger fields.

- **Gate first.** Resolve `telemetry.mode` per `ptp-telemetry`; if it is not `on`, **abandon the
  telemetry write and continue this skill's own steps immediately** (never return from the skill,
  never skip step 5 or the relay) — no directory is created, no file is touched, and nothing about the spawn, the
  shell-out, the prompt, or the relay changes. With the mode unset (the default) this skill behaves
  byte-identically to its behavior before telemetry existed.
- **Fire-and-forget.** When the mode is `on`, both the open and the close append are best-effort:
  **any** error (unwritable path, permission denial, full disk) is **swallowed** and the command
  proceeds unchanged. Telemetry is never a precondition here and never alters the relayed state.
- **Which branch is which.** Do not re-derive the `agent_role`/`cli` pair — take it from
  `ptp-telemetry`'s write-point-keyed table: the **`main=claude`** foreground subagent spawn is
  `agent_role=subagent`, `cli=claude`; the **`main=codex`** write-capable shell-out is
  `agent_role=main`, `cli=codex` — `main`, not `codex`, because that site is the **main implementer**,
  not a reviewer. (A read-only `codex exec` **reviewer** site, owned by `ptp-codex-mode`, is the
  `agent_role=codex` row — a different write point.)

## Optional caller-side `model:` override token

Any command that references this skill MAY additionally support an **opt-in, per-invocation**
`model:<model>.<effort>` token that a user embeds anywhere in that command's free-text argument text,
to override the command's stated default target for that single invocation only. This section is the
single source of truth for the token's grammar, validation, and refusal contract; a supporting command
references this section rather than restating it. As of this writing, `/ptp:brainstorm`, `/ptp:prd`,
`/ptp:brainstorm-full`, and `/ptp:prd-full` support this token (see `commands/brainstorm.md`,
`commands/prd.md` / `skills/ptp-prd/SKILL.md`, `commands/brainstorm-full.md` /
`skills/ptp-brainstorm-full/SKILL.md`, and `commands/prd-full.md` / `skills/ptp-prd-full/SKILL.md`);
no other caller of this skill is affected.

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

## Optional caller-side `fast:` switch

Every command that references this skill and accepts free-text or selector arguments recognizes an
optional **per-invocation** `fast:on` / `fast:off` switch that a user MAY embed anywhere in that
command's argument text, to declare that the opus agents this invocation spawns should run in Claude
Code **fast mode**. The switch is opt-in *per invocation* by the user, not opt-in per command: unlike
the `model:` token above, no command opts in or out, and no supporting-caller list gates it. It
defaults to **off** when absent — the pre-change behavior, unchanged. This section is the **single source of truth** for the switch's grammar,
validation, refusal contract, and honoring semantics; a caller references this section rather than
restating it (see *Caller obligation (generic)* below).

### Grammar

```
fast:on
fast:off
```

A plain boolean switch — `on` | `off` — not a dotted `<a>.<b>` body like `model:`.

### Two-stage detect-then-validate

1. **Detect a candidate.** Scan the argument text for a whitespace-delimited token that **begins with
   the exact lowercase literal prefix `fast:`** — bounded by start-of-string or whitespace on the
   left, and whitespace or end-of-string on the right. A `fast:` substring inside a larger word (e.g.
   `breakfast:on`, `x=fast:on`) is **not** a candidate.
2. **Validate the value** case-sensitively against exactly `on` or `off`. A candidate that begins with
   the lowercase `fast:` prefix but whose value is not exactly `on` or `off` (`fast:`, `fast:true`,
   `fast:ON`, `fast:on.high`) is **recognized-but-invalid** and REFUSES — it must **not** fall through
   as absent.

**Case is the one deliberate exception**, mirroring `model:`: only the exact lowercase `fast:` prefix
is scanned for, so a non-lowercase prefix (e.g. `Fast:on`) is **never** a candidate and falls through
as **absent**.

**At most one candidate is recognized.** Two or more `fast:` candidates in the same argument text is
**invalid** — never "last one wins" — and the refusal reports **all** detected candidates.

### Resolution outcomes

- **Absent** → **no fast-mode request** — behavior identical to before this section existed: no
  preflight, no announcement, no prompt note.
- **`fast:off`** → **no fast-mode request**, stated explicitly; the token is valid and stripped;
  identical to the absent case.
- **`fast:on`** → fast mode requested for this invocation only; nothing persisted; no ptp config file
  read or written.
- **Invalid** (a recognized-but-invalid candidate, or two or more candidates) → the calling command
  **refuses and stops** in its outer session, reporting the offending candidate(s) and the two valid
  values (`on`, `off`), **before** any branch guard, any subagent spawn, and any Codex shell-out. It
  never silently falls back to OFF.

Throughout this section, "fast off" means *no fast-mode request was made for this invocation* — never
a claim about the live session's actual mode, which ptp cannot observe or control (see the
never-enables hard rule below).

### Strip-before-use ordering

The parse-and-strip step runs in the calling command's **outer session**, **before** that command's
own argument grammar (change-id derivation, selector/free-text classification) and **before** that
command's own branch-name derivation or branch guard — the same two reasons the `model:` section
gives: a leftover token could contaminate a derived description, be misread as a selector, or leak
into a derived branch name; and an invalid token must abort before a branch is cut.

`fast:` and `model:` are **independent**: both MAY appear in the same argument text, both are
stripped, and an invalid candidate of either kind refuses.

### Fast-mode preflight (how `fast:on` is honored)

Claude Code fast mode is a **session-level** setting — enabled by the interactive `/fast` Tab-toggle,
by `"fastMode": true` in a settings file, or by `claude -p --settings '{"fastMode": true}'`. It is
**not** a parameter of the Agent tool, of the workflow `agent()` API, or of subagent frontmatter, and
it cannot be toggled programmatically mid-session (the toggle is interactive-only; a settings write is
read at session start). So this skill **never attempts to enable it**.

Instead, when fast is ON, the outer session runs a cheap, **read-only, best-effort** preflight — after
target resolution (step 3) and role resolution (step 4), and **before** the spawn (step 5). It
considers the `CLAUDE_CODE_DISABLE_FAST_MODE` environment variable and the `fastMode` /
`fastModePerSessionOptIn` keys of the layered settings files. It writes nothing. A missing,
unreadable, or malformed settings layer is **ignored** rather than failing the command — never
decisive on its own, since the advisory outcome below depends on the **combined** resolution across
all layers, not on any single layer.

**Resolution semantics.** Both keys are resolved by the same forgiving layered read ptp already uses
for its own config (see `ptp-review-loop`'s `review.maxIterations` reader), over these ordered layers:

1. `~/.claude/settings.json`
2. `~/.claude/settings.local.json`
3. `<repo>/.claude/settings.json`
4. `<repo>/.claude/settings.local.json`

A later layer's **explicitly present** value overrides an earlier one; any layer that is missing,
unreadable, unparseable, or carries a non-boolean value is **ignored** (the prior layer's value stays
in force). Consequences worth stating explicitly: an explicit `"fastMode": false` in a later layer
beats an earlier `true`; a key absent from every layer resolves as **not set** (advisory); the
verified-on announcement names the **highest-precedence layer that supplied the winning value**.

The environment predicate is stated **once** and reused verbatim wherever the variable is mentioned:
`CLAUDE_CODE_DISABLE_FAST_MODE` disables fast mode when its value, **trimmed of leading and trailing
whitespace and compared case-insensitively**, is non-empty and is neither `0` nor `false` — so
`1`/`true`/`TRUE` disable, while unset, empty, all-whitespace, `0`, `false`, `False`, and ` FALSE ` do
not. This predicate **overrides every settings layer**. Never write "if set" — use this exact
predicate.

The preflight never STOPs or fails the command over a settings typo: a degenerate layer is ignored,
and — after the no-op checks below — the advisory outcome applies only when the combined surviving
resolution fails to verify fast mode.

**The four announced outcomes.** Exactly **one** outcome is announced. The outcomes **overlap** — a
non-opus target may also have `fastMode` set; a `main=codex` invocation may also be unverifiable — so
they are evaluated in this fixed **precedence order**, first match wins:

1. **No-op — `main=codex`.** `ptp-agent-roles` resolves `main=codex`: one-line note that the `codex
   exec` main run has no fast mode and its model/effort keep coming from `codex.model` /
   `codex.reasoningEffort`. Documented, not silently ignored (mirroring the `model:` section's own
   `main=codex` note).
2. **No-op — non-opus target.** The resolved target model is not `opus` (a `sonnet.medium` command, or
   a `model:sonnet.high` override): one-line note that fast mode exists only on Opus (Opus 5 / Opus
   4.8). Not an error.
3. **Verified-on.** The layered read resolves `fastMode` to true, `fastModePerSessionOptIn` to
   anything other than true, and fast mode is not disabled by environment: announce once that fast
   mode is enabled in configuration (naming the winning file) and that the spawned opus subagent
   inherits it — phrased as what configuration reports, **not** as a guarantee about the live session —
   then proceed.
4. **Advisory (non-blocking).** Fast mode is off, not verifiable, disabled by environment, or gated by
   `fastModePerSessionOptIn`: emit a non-blocking advisory and **proceed** with the request recorded.
   Never refuse — an interactive `/fast` toggle leaves no file trace, so a refusal would block an
   already-correct session. The remediation MUST be **specific to why the preflight did not verify**
   (the three mechanisms are not interchangeable), and because a configuration can trip several
   sub-reasons at once, the sub-reasons are themselves **first-match in this order** (exactly one row
   fires and only that row's remediation is emitted; row 3 legitimately names three interchangeable
   options — "exactly one" constrains the row, not the option count within it):
   1. *Disabled by `CLAUDE_CODE_DISABLE_FAST_MODE`* → unset the variable (or set it to `0`) and start a
      new session — **not** `/fast` and **not** a settings edit, both of which the variable overrides.
   2. *Gated by `fastModePerSessionOptIn`* → `/fast` in this session, plus a note that a settings-file
      `fastMode: true` alone will not take effect until the gate is cleared or set to `false`.
   3. *Not configured / resolved false* → all three, verbatim: `/fast` Tab-toggle in this session,
      `"fastMode": true` in the user settings file, or `claude -p --settings '{"fastMode": true}'` for
      a headless run.

   Whichever row fires, the advisory also carries **one clause noting that fast mode is billed at a
   higher rate from usage credits**.

Outcomes 1 and 2 **short-circuit**: a no-op invocation never emits the advisory's remediation text (it
could not make that run fast) and may skip the settings read entirely — so outcomes 3 and 4 apply only
when the resolved model is `opus` and `main=claude`.

### Propagation into the spawn prompt

When fast is ON, the resolved model is `opus`, and `main=claude`, the subagent prompt carries **one
informational line** next to the effort directive, recording that fast mode was requested and that it
is a session-level setting the run does not control — so the agent's own report can state the
requested mode. This note changes neither the `model` parameter nor the effort directive.

### Caller obligation (generic)

Every command that references this skill and accepts free-text or selector arguments recognizes the
`fast:` switch on that argument text and MUST parse-and-strip it in the outer session per this section
— stated once, here. No command file restates the grammar and no enumerated supporting-caller list is
introduced or required. This is deliberately broader than the `model:` section's narrower enumerated
opt-in list above, which this obligation does **not** change.

### Scope

This section governs the `ptp-run-at-model` spawn surface. The `full`/`full-plan`/`full-apply` family
runs its agents through `workflows/ptp-full-apply.js` and does **not** use this skill (see *Which
commands use this skill*) — that family's `fast:` support is covered by slice `0031_02`, so the gap is
documented rather than implied.

## Effort as a prompt directive

This section describes the **`main=claude`** direction; the `main=codex` direction maps effort to
`codex.reasoningEffort` instead (see *The `main=codex` direction*). Effort is **not** an Agent-tool
parameter; the Agent tool has no effort knob. The skill injects the effort as a directive in the
subagent prompt, mapping the effort token exactly as `workflows/ptp-full-apply.js`
`effortDirective(effort)` does:

| effort | directive injected into the subagent prompt |
|--------|----------------------------------------------|
| `xhigh` | reason explicitly about invariants, edge cases, and failure modes before every edit; prefer correctness over speed. |
| `high` | think carefully about interactions and edge cases before each edit. |
| `medium` | apply normal care; verify each task before moving on. |
| `low` | move directly on the obvious implementation. |
| (unknown) | fall back to the `high` directive ("think carefully about interactions and edge cases before each edit."). |

This is a **soft hint** — the directive nudges the subagent's deliberation; it is not a hard setting.
This is the same limitation `ptp-full-apply` already accepts.

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
  `codex exec` shell-out) and waits for it. This rule is **unconditional** and is not relaxed by
  anything below.
  - A command that processes a multi-item selector — e.g. `/ptp:archive epic:XXXX` — invokes
    `ptp-run-at-model` once **per item**, and those per-item invocations run **in sequence by
    default**, one blocking main run at a time. They MAY instead run **concurrently** if and only if
    `parallel.mode` resolves `on` (or a valid `parallel:on` token overrides it) **and** all four
    `skills/ptp-parallel-fanout/SKILL.md` safety conditions are established for that item set —
    see that skill for the conditions, the `parallel.maxConcurrency` cap and its batching, the
    aggregation rule, and the join-then-gate rule. Concurrency relaxes only the **sequencing of
    invocations**: each member is still exactly one main run, so this is still no fan-out *within*
    an invocation and still no background Workflow.
  - **The relaxation never applies to `/ptp:apply`, `workflows/ptp-full-apply.js`, or
    `/ptp:archive`** (including `skills/ptp-archive-and-deploy/SKILL.md` Phase A). The first two
    write shared source files; `/ptp:archive` merges each change's delta into the shared
    `openspec/specs/` tree. None can establish `ptp-parallel-fanout` safety condition 1
    (write-disjointness), so all three stay **sequential** no matter what `parallel.mode` resolves
    to — the `/ptp:archive epic:XXXX` example above is therefore an example of a multi-item
    selector, **not** a licence to fan it out.
- **Defer the branch-guard run/skip decision to `ptp-branch-guard`** — do not re-decide which commands
  are guard-exempt here (e.g. `/ptp:master` stays exempt).
- **Telemetry never delays, blocks, or alters the relayed terminal state** — the ledger open and
  close are gated on `telemetry.mode` and fire-and-forget (see *Telemetry: bracketing the main run*);
  a swallowed telemetry error never becomes a refusal, a `needs-human-action`, or a STOP, and with
  the mode off nothing is written at all.
- **ptp never enables fast mode** — it never writes `fastMode` (or any other Claude Code setting) to
  any settings file, never attempts to toggle the session's fast mode, and never reports a *requested*
  fast mode as an *enabled* one; when fast mode cannot be verified the advisory is non-blocking and the
  run proceeds.
- **The never-write-a-Claude-Code-setting rule has exactly ONE exception: `/ptp:telemetry setup`.**
  It writes the telemetry `env` block into `<repo>/.claude/settings.local.json` — the key set is
  enumerated once, in `skills/ptp-telemetry/SKILL.md` §13.2, and never restated here — it is
  **manual, interactive, and confirm-first** — it renders the exact diff and writes nothing without
  explicit confirmation — and it is defined in `skills/ptp-telemetry/SKILL.md` §13. The rule is
  **not** weakened anywhere else: no other setting, no other command, and no automatic path may write
  any settings file, and the `fast:` preflight above stays purely advisory and read-only. The §15
  telemetry **auto-start preamble is not a second exception**: it writes no Claude Code setting at all
  and **never invokes `setup`** — it only starts a loopback process, and only when the user has
  already opted in twice (`telemetry.mode=on` **and** a live telemetry environment).
- **The telemetry auto-start preamble never delays past its bound** — at most two 250 ms pre-launch
  probes and one bounded readiness window (`ptp-telemetry` §15.4) — **never waits on the receiver
  outside it, never retries, never alters the relayed terminal state, and writes no setting.** Its
  entire permitted effect on this skill's output is **one** non-blocking advisory line.
