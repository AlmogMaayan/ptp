---
description: Plan an oversized change as multiple smaller OpenSpec changes — decompose into independently-shippable slices, then run /ptp:plan for each
argument-hint: "<change-id-or-request> (the big change to split; XXXX_NN_<kebab-description> id of an existing monolithic plan, or a short description)"
---

You are running **step 2 of the ptp flow — the multi-change variant**. Use this instead of `/ptp:plan` when a single change is too big to plan and ship as one unit. Your job is to:

1. **Decompose** the oversized change into a small set of coherent, independently-shippable OpenSpec changes ("slices").
2. **Delete the monolithic plan** if one was already created.
3. **Run `/ptp:plan` for each slice** so every slice gets the full OpenSpec artifact treatment.

`/ptp:plan-multiple` does **not** itself write `proposal.md` / `design.md` / `tasks.md` — it only decides the split and then delegates each slice to `/ptp:plan`, which produces those artifacts. There is **no umbrella decomposition doc**; the split rationale and inter-slice dependencies are cross-referenced inside each slice's `proposal.md` (see beat 3, step 5).

## Inputs

The oversized change id or request: $ARGUMENTS

**A pre-resolved posture from an orchestrating command wins, and suppresses the parse.** When an orchestrating command (`/ptp:full-plan`, or `ptp-full` Phase A on behalf of `/ptp:full`) invokes this command, it has already parsed and stripped the `parallel:` token in **its** outer session and supplies the **resolved parallel posture** as an explicit input. In that case use the supplied posture as the effective parallel decision for this invocation and **do not** parse the request text for a `parallel:` token — beat 1's parse-and-strip below is **skipped**, because the orchestrator already stripped it and there is none to find. The full precedence order, highest first:

1. a **pre-resolved parallel posture** supplied by an orchestrating command, when one is supplied;
2. otherwise the valid `parallel:on` / `parallel:off` token, when one is present;
3. otherwise the resolved `parallel.mode`.

A supplied posture and a token can never **both** be honored, and cannot both be present: the orchestrator stripped the token before the handoff. On a **direct invocation** no posture is supplied and levels 2–3 apply exactly as written below. Supplying a posture changes **only** which value feeds the effective decision — it **never** overrides the four safety conditions, so a supplied `on` with any condition unestablished still runs serially (see step 5b).

**Parse and strip the `parallel:on|off` token first — beat 1, outer session, before anything else, on the direct-invocation path (no posture supplied).** `$ARGUMENTS` may carry an anywhere-in-text `parallel:on` / `parallel:off` candidate. Its grammar, two-stage detect-then-validate recognition, lowercase-prefix-only candidate rule, at-most-one-candidate rule, and strip-before-use ordering are defined by the **`ptp-parallel-fanout`** skill (§ *The per-invocation `parallel:on` / `parallel:off` token*, which itself defines them by reference to `ptp-run-at-model`'s `fast:` switch) — **do not restate that grammar here**.

- **Absent** → the resolved `parallel.mode` applies. **Absent is not `off`** (see the skill).
- **Valid `parallel:on` / `parallel:off`** → **strip the token from `$ARGUMENTS`** and use it as the effective parallel decision **for this invocation only**; read no config file for a written value and write none.
- **Invalid** (a recognized candidate with a bad value, e.g. `parallel:true`, or two or more candidates such as both `parallel:on` and `parallel:off`) → **refuse and STOP in the outer session**, reporting **every** detected candidate and the two valid values (`on`, `off`).

**Ordering (why the parse is first).** This parse-and-strip runs **before** the change-id/request classification in the next paragraph and **before** any branch-name derivation — so a leftover token can never contaminate a derived description, be misread as a selector, or leak into a branch name — and the invalid-token refusal therefore lands **before the branch guard is evaluated and before any main run (beat-2 subagent or beat-3 member) is started**, so no branch is cut and nothing is spawned for a malformed invocation.

This command parses **no `fast:` token of its own** — `/ptp:full-plan` owns that parse and hands `/ptp:plan-multiple` already-stripped argument text; that handling is independent of `parallel:` and is unchanged by this command. `/ptp:plan-multiple` does **not** gain the `model:` override token.

Interpret it both ways: if `$ARGUMENTS` (after the token strip above) names an existing `openspec/changes/<id>/` folder, treat that as a **monolithic plan to re-cut** (and a candidate for deletion in step 4); otherwise treat it as a **fresh request** to plan as multiple slices from scratch (nothing to delete).

Epic allocation (beat 1): allocate one fresh epic for all slices per the `ptp-change-selector` skill (§4, epic allocation).

## Branch safety (beat 1, first write-affecting step)

**Beat 1 runs entirely in the outer session, in this exact order: (1) parse and strip the `parallel:` token (see *Inputs*), (2) allocate the fresh epic per `ptp-change-selector` §4, (3) run the `ptp-branch-guard` preamble once, (4) run step 1's gather-and-gate including its guaranteed-abort "implementation already started" STOP.** Sub-step (1) is **skipped when an orchestrating command supplied a pre-resolved parallel posture** — the token was already parsed and stripped upstream, so there is none to find. Skipping it changes nothing else about beat 1's ordering: (2), (3), and (4) run exactly as written. The epic allocation precedes the guard because the guard derives a fresh-request branch name (`ptp/epic-XXXX`) **from** the allocated epic. **No main run of any kind — not the beat-2 subagent, not a beat-3 member — starts before beat 1 has completed.**

Run the **`ptp-branch-guard`** preamble **once up front**, before delegating to any sub-step that writes: check `git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch name from this request (or the fresh epic you allocate → `ptp/epic-XXXX`) and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the branch) **before** any sub-step runs; if you are already on a feature branch it is a **no-op** — proceed as-is. Delegated `/ptp:plan` runs re-run the guard as a no-op once HEAD is on the branch. The full rule lives in the **`ptp-branch-guard`** skill — do not restate it here.

## When to use this vs `/ptp:plan`

- Use **`/ptp:plan`** when the change is one coherent unit of work.
- Use **`/ptp:plan-multiple`** when the work is large enough that a single `tasks.md` would be unwieldy, spans multiple spec capabilities, or naturally factors into stages that can each be reviewed, applied, and archived on their own.
- If you inspect it and it turns out **not** to be big enough to split, do **not** force a split — fall back to a single `/ptp:plan` (step 3).

## Steps

This command runs as **three beats**:

- **Beat 1 — outer session.** Token parse → epic allocation → branch guard → step 1's gather-and-gate
  (with the guaranteed-abort STOP). Spawns nothing.
- **Beat 2 — one `ptp-run-at-model` main run at the `opus.high` target.** Steps 2–3, plus step 4 **only
  on the split path**, ending in a **structured return** of the ordered slice list (or the fallback
  sentinel). Decomposition is the highest-judgment ptp planning step and must not depend on the
  session model. Beat 2 does **no** per-slice planning.
- **Beat 3 — outer session.** One `/ptp:plan` main run **per slice** (concurrently or serially per the
  `ptp-parallel-fanout` contract), joined, then cross-reference verification (step 5) and the report
  (step 6).

The per-slice runs live in **beat 3, the outer session**, because the beat-2 main run already occupies
the one permitted Agent nesting level — the outer session is the only site that can start N members.

### Beat 1 — outer session

1. **Gather input — do not delete anything yet** (outer session, beat 1). This whole step stays outer because it carries a **guaranteed abort** (a guaranteed abort must never spawn a subagent, and must never fan out):
   - If `openspec/changes/<id>/` already exists (a monolithic plan was created from `/ptp:plan` or `/ptp:brainstorm`), read its artifacts first (`brainstorm.md`, `proposal.md`, `design.md`, `tasks.md`, spec deltas). That existing thinking is your richest decomposition input — fold it in, don't discard it.
   - **Check whether implementation has already started** on that monolithic change: any checked task (`- [x]`) in its `tasks.md`, or a non-empty `git diff` touching the surface area its `proposal.md`/spec deltas describe. If so, **STOP** — do not decompose or delete, **and do not spawn the subagent**. Report that the change is partially applied and that deleting it would orphan the implemented code from its spec; let the user decide how to proceed (e.g. finish/revert it first, or split only the not-yet-built remainder by hand). Deleting an in-progress change is never automatic.
   - Run `npx -y openspec list` and `npx -y openspec list --specs` to see existing changes/capabilities and avoid id collisions. **Retain this capture** — under `roles.main=claude` it is handed down as `ptp-run-at-model`'s optional part (f) input to beat 2 below, so the decompose run reuses it instead of re-running either command; under `roles.main=codex` no such pass-down applies.

### Beat 2 — one `ptp-run-at-model` main run at the `opus.high` target

**Run steps 2–3 (plus step 4 on the split path only) via `ptp-run-at-model` at `opus.high`.** Only
after beat 1 has fully passed in the outer session — the token parse, the epic allocation, the branch
guard, and step 1's gather-and-gate including the "implementation already started" STOP — invoke the
**`ptp-run-at-model`** skill with target `opus.high` and the work being **steps 2–4 below plus the
structured return**. That is **one main run**, in whichever direction `ptp-agent-roles` resolves: under
`roles.main=claude` one foreground `opus` Agent-tool subagent with the high effort directive injected
as a prompt directive — and, per `ptp-run-at-model`'s optional part (f), the beat-1 capture of
`npx -y openspec list` / `npx -y openspec list --specs` (step 1) supplied and inlined verbatim, so the
decompose run's own context loading reuses it instead of re-running either command; under
`roles.main=codex` one write-capable `codex exec` run at the resolved `codex.model` /
`codex.reasoningEffort`, with no such context inlined (part (f) does not apply to that direction). It
returns its terminal result relayed per `ptp-run-at-model`'s
*Result relay* — never reporting a refusal or partial-apply STOP as success.

Beat 2 performs **no per-slice planning**: it ends at the structured return below, and beat 3 (the
outer session) runs the members. Notes the beat-2 prompt MUST carry:

- Its own `ptp-branch-guard` check is a **no-op** (HEAD is already on the feature branch from the outer
  guard), so it must **NOT** attempt to launch the `ptp-branch-prep` Workflow.
- It must **start no further main run** — no Agent, no Workflow, no nested `codex exec`. It runs steps
  2–4 inline in its own context (invoking `superpowers:brainstorming` inline is a Skill invocation, not
  a spawn) and then returns. The per-slice `/ptp:plan` runs are **beat 3's** members, started by the
  outer session under the member contract below — they are not beat 2's work.
- On the **fallback** path (step 3 decides the work is one coherent unit) it returns
  `PLAN-MULTIPLE-FALLBACK` **immediately, without running step 4** — nothing is preserved and nothing is
  deleted, exactly as the pre-change fallback did.
- The structured return below **is** beat 2's `completed` payload, and it MUST reach the outer session
  **verbatim** — the sentinel line and every slice line reproduced byte-for-byte, not summarized,
  reformatted, re-wrapped, or paraphrased into prose. Beat 3 parses it; a relayed *description* of the
  slice list is unparseable and would be read as a refusal (see the *Refusal rule* below).
- **The block is the entire return — no preamble, no trailing prose.** The **first non-empty line of
  the whole return** is the sentinel, and every non-empty line after it belongs to the grammar below;
  a leading or trailing sentence would be parsed as a slice line (split path) or a second payload line
  (fallback path) and is therefore a refusal. This is not a relay violation: `ptp-run-at-model`
  explicitly permits the `completed` payload to be **a structured text block rather than prose**, and
  the human-facing account of the split is beat 3's step-6 report, which the outer session emits from
  this block.
- If beat 2 instead returns **`refused`** or **`needs-human-action`**, that terminal state is relayed
  **as itself** — the outer session reports the reason, plus (for `needs-human-action`) the exact
  follow-up command, and stops. It is **not** re-labelled an unparseable-return refusal, and beat 3
  does not run. The parsing rules below apply only to a `completed` return.

2. **Decompose (autonomous brainstorm).** Invoke **`superpowers:brainstorming`** via the Skill tool in **autonomous mode** (no clarifying questions — document assumptions instead, exactly as `/ptp:plan` does), focused on a single question: *what is the smallest set of coherent, independently-shippable changes that together cover this request?* Produce an ordered list where each slice has:
   - a sub-change id `XXXX_NN_<kebab-description>` — a single epic allocated via `ptp-change-selector` (§4, epic allocation), then two-digit zero-padded story, then kebab description (e.g. `0001_01_landing-page-list-bulk-export`, `0001_02_landing-page-bulk-import`, `0001_03_landing-page-server-side-import`). The story number is the recommended apply order. All slices share the same epic.
   - a one-paragraph scope (what's in, what's out).
   - explicit dependencies — a slice may depend **only on lower-story slices** (no cycles, no forward references). State them as `depends on XXXX_NN_…`.
   - one sentence on why it stands alone (can be reviewed / applied / archived independently).

   A good decomposition: every slice is shippable on its own, slices are ordered by dependency, and their union covers the original request with no overlap and no gap.

   Do **not** persist this decomposition as its own file. It is working reasoning; it gets recorded durably inside each slice's `proposal.md` in step 5 (cross-reference only — no umbrella doc).

3. **Decide: split or fall back.**
   - If the work genuinely factors into **≥ 2** independently-shippable slices → continue to step 4, then return the `PLAN-MULTIPLE-SLICES` list.
   - If it is really one unit → **fall back**: return `PLAN-MULTIPLE-FALLBACK` with the original id/request as its single payload line and **stop beat 2 there — do not run step 4**. Do not create artificial slices. (The outer session then invokes a single `/ptp:plan` and reports that no split was needed — see *Beat 2's return* below.)

4. **Preserve the brainstorm, then delete the monolithic plan if one exists — split path only.** Reached **only** when step 3 decided to split; on the fallback path step 3 already returned, so nothing here runs.
   If step 1 found an existing `openspec/changes/<id>/` **and confirmed no implementation had started**:
   - **a. Preserve first** — if `openspec/changes/<id>/brainstorm.md` exists:
     - Create `openspec/brainstorms/` if it does not yet exist.
     - **Move** `brainstorm.md` to `openspec/brainstorms/<id>-brainstorm.md`.
   - **b. Then delete** the `openspec/changes/<id>/` folder — its content has been folded into the decomposition, and leaving a half-planned giant change beside the slices is confusing.

   If no such folder existed, skip this step. Never delete before its thinking has been captured in step 2, and never delete a change whose implementation has already started (step 1 already stopped you in that case).

#### Beat 2's return — the handoff contract

Beat 2 ends by returning **one** of two forms. **Every slice id is allocated here, in beat 2, before any beat-3 member starts.** That pre-allocation is what makes safety condition 1 structural rather than probabilistic: there is **no id-allocation race**, and because the ids are **unique** and **strictly ascending** in story order, no two members can ever target the same `openspec/changes/<id>/` folder.

**Split path:**

```
PLAN-MULTIPLE-SLICES
<change-id> | depends: <dependency-list> | scope: <single-line scope>
<change-id> | depends: <dependency-list> | scope: <single-line scope>
```

- The first non-empty line MUST be exactly the sentinel `PLAN-MULTIPLE-SLICES`.
- Each subsequent non-empty line is one slice, in **ascending story order**, with three pipe-delimited fields in the fixed order **id | depends | scope**. There MUST be **at least two** — step 3's split rule is "≥ 2 independently-shippable slices", so a one-slice list is not a split.
- `<dependency-list>` is either the single character `-` (no dependencies) or one or more **lower-story** change ids separated by `, ` (comma-space) with **no trailing separator**. Any other dependency syntax is a malformed line, and a forward or self reference is invalid.
- **Scope is the last field, and each slice line is parsed by splitting on the first two `|` characters only** — the remainder of the line, including any further `|`, is the scope verbatim, so a `|` inside the scope text is harmless. The `<change-id>` and `depends:` fields are parsed strictly and may **never** contain `|`.
- The scope is step 2's paragraph collapsed to a **single line** (newlines removed); the line-per-slice format cannot survive embedded newlines.

**Fallback path:**

```
PLAN-MULTIPLE-FALLBACK
<the id or request to hand to a single /ptp:plan>
```

- Exactly **one non-empty payload line**.
- On this path the outer session invokes **`/ptp:plan` once**, with that payload, as an **ordinary top-level command invocation**. `/ptp:plan` then runs **its own** `ptp-run-at-model` main run at its own target, so the deterministic-model guarantee the pre-change inline fallback had is **preserved** — the outer session starts **no second main run around it**, and beat 3's member contract does **not** apply.
- Beat 3 is skipped entirely, step 4 never ran, so the monolithic `openspec/changes/<id>/` folder is **still intact** when that single `/ptp:plan` is invoked with its id. Report that no split was needed.

**Refusal rule.** Any deviation from the above is a **refusal** — report it and stop:

- no sentinel, or a first non-empty line that is not exactly one of the two sentinels;
- `PLAN-MULTIPLE-SLICES` with **fewer than two** slice lines (zero or one). A one-unit decision must come back as `PLAN-MULTIPLE-FALLBACK`; a one-slice list is never run as a one-member pseudo-split;
- a malformed slice line (wrong field order, a missing field, or `depends:` syntax other than `-` / `, `-separated ids);
- a **duplicate** slice id, or ids not in **strictly ascending** story order — a repeated id would put two members on the same change folder and defeat safety condition 1, so it is a refusal, never a de-duplication;
- a **forward or self** dependency;
- `PLAN-MULTIPLE-FALLBACK` with an **empty or multi-line** payload.

This is a **refusal**, not a warning: never proceed with a partial list, never report a planned-nothing outcome as success, and never invoke `/ptp:plan` with an undefined argument. It happens in the outer session **before any member is started**.

### Beat 3 — outer session: fan out, join, verify, report

Beat 3 runs in the **outer session** — the only site that may start N members, because beat 2's main run already occupies the one permitted Agent nesting level.

**Context pass-down (part (f)) — re-capture across beat 2's own deletion.** Beat 3 is reached only on
the split path (the fallback path never starts a beat-3 member — see *Beat 2's return*), and on that
path beat 2's step 4 **deleted the monolithic change folder**. That deletion is invisible to a beat-3
member's own self-scoped staleness trigger (`ptp-run-at-model`'s part (f) trigger 1 fires only for
writes the *consuming* run itself performs) — beat 2 is a **sibling** run relative to any beat-3
member, so the outer session, not any member, carries the supplier-side obligation to avoid handing
down a capture its own flow already invalidated. Under `roles.main=claude`, before starting any member
the outer session therefore **re-captures** `npx -y openspec list` and `npx -y openspec list --specs`
**once**, here, and supplies that fresh capture — never the pre-deletion beat-1 capture already spent
on the decompose run — as `ptp-run-at-model`'s optional part (f) input to the members it may still
supply (5d). This is the flow's **second and last** capture: the outer session takes exactly one pair
in beat 1 and one pair here — **at most four `openspec` invocations in the outer session** regardless
of slice count, never a capture per member. Under `roles.main=codex`, no part (f) input applies and no
re-capture is taken.

**Which members may be supplied — the capture is not re-supplied across a member's own writes.**
Members write too: each creates its own `openspec/changes/<slice-id>/` folder. The supplier-side
obligation (`ptp-run-at-model` part (f)) is absolute — a caller must never supply a capture its own
flow already invalidated through a run it started — and it is **not** discharged by disclosing the
omission. Because the outer session takes no third capture, the rule resolves as a simple cut-off:

- the beat-3 capture is supplied **only to members started before any member has written** — on the
  fan-out path that is every member of the **first batch** (all started before any of them has
  produced a folder); on the serial path (the shipped default) that is the **first member** only;
- every member started **after** a sibling member has begun writing is supplied **no part (f) input**
  at all, and therefore loads its own context exactly as a standalone `/ptp:plan` does today.

So the saving here is real but **bounded** — it is never one capture serving every member
unconditionally — and no member is ever handed a capture this flow already invalidated. Supplying
nothing is the contract's own second permitted option, and it costs those members only the listing
they would have run before this change anyway.

The cut-off is stated as *started before any member has written* because the supplier obligation is
scoped to the state **between the capture and the spawn**. It does not — and cannot — cover a sibling
that writes *while* a supplied member is already running, which on the fan-out path is exactly what a
first-batch member's siblings do. That residual is **immaterial here, and only here**, for a reason
this command must state rather than assume: the only thing those sibling writes add under
`openspec/changes/` is the sibling slice folders, whose ids beat 2 already fixed and whose full set is
in every member's own prompt, and safety condition 3 above already forbids any member from *relying*
on observing an in-flight sibling at all. A member therefore cannot make a different decision for
having missed one — which is why "authoritative for the run" is safe here and must not be read as
"complete". Any future caller whose members' concurrent writes could change a sibling's decision does
**not** inherit this reasoning and must supply nothing.

5. **Plan each slice — one member per slice, started by the outer session.**

   **a. Assert the four `ptp-parallel-fanout` safety conditions**, and where each is established. Their normative definitions live in the **`ptp-parallel-fanout`** skill — cite it, do not restate it:

   | Condition | Where this command establishes it |
   |---|---|
   | 1. Write sets provably disjoint by construction | Every member's **work product** is written only within its own **pre-allocated** `openspec/changes/<id>/` folder (ids fixed in beat 2 → no allocation race, no shared folder). Writes into the shared `ptp-telemetry` store through that store's enumerated concurrency-safe protocols are the contract's **closed exception** (per `0034_01`) and do **not** defeat this condition. No other shared path is written. |
   | 2. No git state change in members | The `ptp-branch-guard` preamble ran **once** in beat 1; every member reaches only the guard's **no-op** path and is told not to launch `ptp-branch-prep`. Nothing in `/ptp:plan`'s steps 2–6 stashes, checks out, commits, or branches. |
   | 3. Order-independent aggregation | Member results are collected into one set and **sorted by ascending change id** before verification or reporting. No member's *result* is an input to any other member: each member's scope, dependency notes, and id come from its own prompt (fixed in beat 2), never from reading a sibling's artifacts. A member MAY still enumerate the shared `openspec/changes/` tree read-only (`/ptp:plan` permits `npx -y openspec list` for context), so it may or may not observe an in-flight sibling folder — that read feeds only its own context, never the aggregation, and is never relied on. |
   | 4. Join-then-gate | Cross-reference verification (5f) and the step-6 report run **only after every member has returned**. |

   **b. Resolve the effective parallel decision** per the three-level precedence in *Inputs*: a **pre-resolved posture** supplied by an orchestrating command when one was supplied, otherwise the valid `parallel:` token from *Inputs* when one was present, otherwise the resolved `parallel.mode` (resolution per `ptp-parallel-fanout`; absent token ≠ `off`). Then: **effective `on` *and* all four conditions established** → fan out (5c). **Effective `off`, or any condition not established** → run the members **serially, in ascending story order**, one at a time, each finishing — including its `openspec validate <id> --strict` — before the next starts. `parallel:on` is a permission, never a safety override.

   The serial path is a **live code path**, not a theoretical one: it is what the shipped default (`parallel.mode` = `off`) runs, and on the all-members-succeed path it produces the same slices, the same artifacts, and the same report content as this command produced before the fan-out restructure.

   **Failure handling is join-then-gate on both paths** — a failing member **never stops the members after it**, on the serial path either — so there is exactly **one** failure semantics rather than a second code path. This is the one deliberate divergence from the pre-change command, which left serial failure handling unspecified.

   **c. Run the members.** One member **per slice**. Each member is exactly **one `ptp-run-at-model` main run**, started by the outer session in whichever direction `ptp-agent-roles` resolves: under `roles.main=claude` one **foreground Agent-tool subagent** at `opus.high` with the effort injected as a **prompt directive**; under `roles.main=codex` one **write-capable `codex exec` run** at the resolved `codex.model` / `codex.reasoningEffort`. The invariant is *one main run per member*, not "one foreground subagent" universally. When fanning out, at most `parallel.maxConcurrency` members run simultaneously and the rest run in successive batches — the cap, the batching semantics, and the single end-of-run sort are the **`ptp-parallel-fanout`** skill's; do not restate them here.

   Members run at the **`opus.high`** target — the same target `/ptp:plan` names for its own steps 2–6 — rather than at the slice's `effort.md` recommendation, because that file **does not exist yet**: producing it is part of what the member does.

   **d. The member prompt MUST carry**, verbatim in intent:
   - the slice's **id**, its **scope paragraph**, and its **dependency notes** (so the member's own autonomous brainstorming stays scoped to that slice, not the whole feature);
   - **under `roles.main=claude` only, and only for a member started before any member has written**
     (see the cut-off above — the first batch when fanning out, the first member when serial),
     `ptp-run-at-model`'s optional part (f): the beat-3 re-capture of `npx -y openspec list` /
     `npx -y openspec list --specs` taken just above, inlined verbatim, so the member's own
     `/ptp:plan`-steps-2–6 context loading uses that snapshot in place of re-running either command
     wherever it would otherwise have loaded that context. Any later member's prompt simply **omits
     part (f)**;
   - the **cross-reference line** the member should record in its `proposal.md` (see 5f);
   - *you are already the `ptp-run-at-model` main run for this slice — run `/ptp:plan`'s steps 2–6 **inline** in your own context;*
   - *do **NOT** invoke `ptp-run-at-model`; do **NOT** start any further main run — no Agent, no Workflow, no nested `codex exec`;*
   - *your `ptp-branch-guard` check is a **no-op** — HEAD is already on the feature branch — so do **NOT** launch the `ptp-branch-prep` Workflow;*
   - *do **NOT** run `/ptp:apply`.*

   The "do not invoke `ptp-run-at-model`" line is the single most load-bearing sentence in the member prompt: omitting it re-introduces the second nesting level this whole structure exists to avoid.

   **e. Join every member.** Collect **all** member results — a member that failed, refused, or was throttled is **recorded as failed**, never dropped and never silently omitted. A member returning `ptp-run-at-model`'s third terminal state, **`needs-human-action`**, is likewise **not a success**: record it as unsuccessful alongside its machine-readable reason and the exact follow-up command it names, report both in step 6, treat its slice as cross-reference-unverified if it left no `proposal.md`, and — exactly as for a failure — offer **no** `/ptp:apply` next command. Only `completed` counts as a member success. Each successful `/ptp:plan` also emits its own validation result and recommended apply model/effort; collect those.

   **f. Then guarantee the cross-reference is durable — after the join, serially, in the outer session.** Because you chose *cross-reference only* (no umbrella doc), that cross-ref is the **only** record of the split — so don't rely on `/ptp:plan` having transcribed it. For each slice, **read its `proposal.md` and confirm** the cross-reference line is present; if it is missing or thin, **append it yourself** under `## Context` (or `## Source`):
   - *"Part of splitting `<original request>` into slices `XXXX_01_…`, `XXXX_02_…`, … . This slice depends on `XXXX_NN_…`."*

   Editing `proposal.md` for this single line is the one exception to "let `/ptp:plan` write the proposal" — you are adding provenance metadata, not authoring design content.

   **If an unsuccessful member — failed, refused, throttled, or `needs-human-action` — left no `proposal.md`**, skip the read for that slice, record it as **cross-reference-unverified**, and preserve its terminal outcome — do **not** create a `proposal.md` for it and do **not** attempt an undefined read.

6. **STOP and report.** Do not start implementation. Emit the report **sorted by ascending change id**.

   **The report is this command's return to an orchestrating caller.** It presents, for **every** planned slice, that slice's **change id** and its **one-line scope**, sorted by ascending change id, in a form an orchestrating command (`/ptp:full-plan`, `ptp-full` Phase A) can consume **directly** as the slice set — so such a caller never re-derives the set from `npx -y openspec list`. On the **single-change fallback** path the report names the **one** change id that was planned, which such a caller treats as a one-element slice set. This adds **no new sentinel**: `PLAN-MULTIPLE-SLICES` / `PLAN-MULTIPLE-FALLBACK` remain the **internal** beat-2 → beat-3 handoff, consumed by this command's own outer session and never relied on by a caller as this command's return format. Nothing about the report's existing fields, its refusal rules, or its no-apply-command rule changes.
 Its content MUST be a function of the **joined member results** plus **beat 2's deterministic terminal metadata** (the slice list and the monolith-deletion outcome, both fixed before any member started) and MUST NOT vary with member **completion** order — so a parallel run and a serial run over the same joined results produce the same report content. Report:
   - Every slice, in ascending change id order, each with its one-line scope and its dependencies.
   - Per-slice validation result and the recommended apply model/effort each `/ptp:plan` produced.
   - **Every unsuccessful member** — failed, refused, throttled, or `needs-human-action` (with its reason and follow-up command) — and every slice recorded as cross-reference-unverified. Never present a partial run as success — if **any** member was unsuccessful, the overall run is **not** successful.
   - Whether a monolithic plan was deleted (and which id).
   - **Only when every member completed successfully:** the exact next command `/ptp:apply <first-slice-id>`. When any member was unsuccessful or was left cross-reference-unverified, **name those slices and offer no apply command** — a failed run never recommends applying an unplanned slice. (Reporting the next command is not chaining; actually invoking `/ptp:apply` remains forbidden.)

## Hard rules

- Do **not** force a split. If the change is one coherent unit, fall back to a single `/ptp:plan` (step 3).
- Do **not** delete the monolithic `openspec/changes/<id>/` folder until its thinking has been folded into the decomposition (step 2 before step 4), and only after its `brainstorm.md` (if any) has been moved to `openspec/brainstorms/<id>-brainstorm.md` — brainstorm history is preserved, while the rest of the folder (proposal/design/tasks/spec deltas, already folded into the slices) is discarded.
- Do **not** decompose or delete a monolithic change whose implementation has already started (checked tasks or matching code changes). STOP and hand the decision to the user (step 1).
- Each slice **must** be independently shippable and may depend **only on lower-numbered slices** — no cycles, no forward dependencies.
- Do **not** write any slice's `proposal.md` content yourself from the raw request — it must come from that slice's `/ptp:plan` brainstorming, exactly like a normal single change.
- Do **not** create an umbrella decomposition doc. The rationale + dependencies live as cross-references inside each slice's `proposal.md` (step 5).
- Do **not** ask the user clarifying questions mid-flow. `/ptp:plan-multiple` is autonomous end-to-end, same contract as `/ptp:plan`: make reasonable assumptions, document them, produce validated artifacts.
- **No member may start a further main run.** Each beat-3 member is exactly one `ptp-run-at-model` main run and runs `/ptp:plan`'s steps 2–6 inline — no Agent, no Workflow, no nested `codex exec`, no re-invocation of `ptp-run-at-model`. Beat 2 likewise starts nothing.
- **The serial path stays live.** With the shipped default `parallel.mode` = `off`, with `parallel:off`, or with any of the four safety conditions unestablished, the members run serially in ascending story order. Never delete, bypass, or degrade that path in favor of the fan-out one.
- **Consume the `ptp-parallel-fanout` contract; never redefine it.** Cite the skill for the four conditions, the config resolution, the token grammar, the cap and its batching, the aggregation rule, and the join-then-gate rule — do not restate or vary any of them here.
- Do **not** invoke or trigger `/ptp:apply` automatically — not after the slices are planned, not for any reason. `/ptp:apply` runs only when the user explicitly types it. (Chaining `/ptp:plan` per slice is expected and allowed; chaining `/ptp:apply` is forbidden.)
- Do **not** edit any OpenSpec managed/regenerated instruction blocks.
