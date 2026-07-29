---
description: Edit exactly one epic backlog entry from a free-text instruction — fields, dependency edges, status transitions, and the recovery of an entry left in a stale in-progress state, un-reconciled from a crashed backlog run only if no backlog run is currently live. Enforces the transition table and the reconciliation gate, lands every mutation of one invocation in a single whole-file write, and reports every entry it touched and every candidate edge it refused. Autonomous: refuses with what is available rather than asking. Delegates the schema, IO, validation, detection, transition, and recovery rules to the shared ptp-backlog skill.
argument-hint: "<BK-NNNN> <what to change> [model:<model>.<effort>]"
---

You are running **`/ptp:backlog-edit`** — the writer that **changes** an epic already in the backlog
(`openspec/backlog.json`). It takes **one** backlog id plus a free-text edit instruction, applies every
mutation of that invocation in a **single** whole-file write, and reports. It is a thin front door: the
file location, the schema, the IO protocol, the validation vocabulary and its writer-eligibility rule,
the **dependency-detection contract**, the **status transition table with its guards**, and the
**recovery and reconciliation machinery** all live in the **`ptp-backlog`** skill.

> **Contrast with its siblings:** `/ptp:backlog` is the read-only view. `/ptp:backlog-add` creates a new
> entry — and reaches an **existing** one only through detection's **automatic reverse edge** (a
> `dependsOn` entry plus its evidence, never a field, a status, or an attribution).
> `/ptp:backlog-run` (`0036_04`) writes an existing entry's **execution state** — its runner-row status
> transitions, `changeEpics`, `attributionWarnings`, and the `runBaseline` it sets on taking an epic and
> clears on its terminal write. This command is the only one that changes an existing entry **at the
> user's direction** — its fields, its edges, its status, its attribution, or its `runBaseline` — and,
> outside the runner, the **only** consumer of a stale `runBaseline`. It never plans, never implements,
> and never runs an epic.

## Inputs

Request: $ARGUMENTS — a **required first positional backlog id** (`BK-NNNN`) followed by a **free-text
edit instruction**, optionally carrying an anywhere-in-text `model:<model>.<effort>` override token
(e.g. `model:fable.high`) that overrides this command's `opus.high` default for this invocation only;
see step 1 of **Steps** below.

## Argument grammar

- **The first positional argument is a backlog id and is required.** The remainder is free text; there
  is no per-field flag grammar and no new per-invocation token — a recovery disposition is not an
  invocation modifier, it is the edit itself.
- **Exactly one entry is directly targeted per invocation.** Refuse when the invocation carries **no
  positional id**, an **unknown positional id** (one no entry in the file carries — list the valid
  ids), or **more than one positional id**. There is no bulk selector.
- **The count is of positional target ids only.** Ids named **inside the free-text instruction** are
  **mutation operands** — an edge edit necessarily names one (`BK-0001 drop the dependency on
  BK-0002`) — and are **never** counted as additional targets. A rule that counted every `BK-NNNN` in
  the invocation would make edge edits unreachable.
- **Backlog ids are not routed through `ptp-change-selector`.** Its `epic:` / `story:` grammar
  addresses change folders only; `BK-NNNN` ids are deliberately outside it, per the `ptp-backlog`
  skill's id-allocation contract.

## Branch safety (first step)

**Ordering note:** the cheap read-only `model:` override parse (step 1 of **Steps** below) and the
required-id-and-instruction check (step 1a) run in the outer session **before** this guard — an invalid
token, a missing backlog id, or an empty instruction STOPs the command before the guard evaluates or
cuts any branch.

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check
`git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch
name from a ≤5-kebab-word summary of the edit request (→ `ptp/<summary>`) — there is **no change id**
for a backlog edit, so the branch name comes from the request text, the same derivation
`/ptp:backlog-add` uses — and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base
branch → pull → cut the branch) **before** writing anything; if you are already on a feature branch it
is a **no-op** — proceed as-is. The full rule (branch naming, the workflow contract, the hard rules)
lives in the **`ptp-branch-guard`** skill — do not restate it here.

## Steps

1. **Parse the `model:` override (outer session, before the branch guard).** Scan the raw `$ARGUMENTS`
   text for an optional `model:<model>.<effort>` token per the "Optional caller-side `model:` override
   token" section of **`ptp-run-at-model`** — do not restate that grammar or its validation here.
   - **Absent** → target = `opus.high`; proceed with `$ARGUMENTS` as given.
   - **Exactly one valid candidate** → strip it from `$ARGUMENTS`; target = the resolved
     `<model>.<effort>` literal.
   - **Invalid** (a `model:`-prefixed candidate with a bad model, bad effort, or wrong shape, or more
     than one candidate) → **STOP immediately, in the outer session**, before the branch guard and
     before any main run. Report the offending candidate(s) and the two valid enums.

   **Step 1a — require a backlog id and a non-empty instruction (outer session, still before the branch
   guard).** The text remaining **after** the token is stripped MUST carry both a **positional backlog
   id** and a **non-empty edit instruction**. If either is missing — `/ptp:backlog-edit` with no
   argument, or `/ptp:backlog-edit BK-0001 model:opus.high`, which leaves nothing to interpret into a
   mutation — **STOP in the outer session**, before the branch guard and before any main run, reporting
   what is missing. This mirrors `/ptp:backlog-add`'s empty-request STOP. **Never invent a mutation** to
   fill an empty instruction.
2. **Run the branch guard** (the *Branch safety* preamble above), in the outer session.
3. **Run the remaining work as one `ptp-run-at-model` main run** at the resolved target (`opus.high` by
   default, or the valid `model:` override), per the **`ptp-run-at-model`** skill — reference it for the
   spawn-and-relay mechanics rather than restating them. The main run invokes the **`ptp-backlog`** skill
   **inline** in its own context and performs step 4 below. **The main run starts no further main run**
   and spawns nothing of its own, so there is no second nesting level. One note the main run's prompt
   MUST carry: its own `ptp-branch-guard` check is a **no-op** (HEAD is already on a feature branch from
   the outer guard), so it must **not** attempt to launch the `ptp-branch-prep` Workflow.
4. **Inside the main run**, in this **fixed order** — the methodology for every step lives in the
   `ptp-backlog` skill; name the step, do not restate the rule. The order is normative, because the
   gates interact:
   1. **Read and validate the whole file** through the skill's read protocol and its
      **writer-eligibility rule**. **STOP exactly where that rule obliges a writer to STOP** — on any
      **fatal** problem, on `duplicate-id`, and on a `malformed-entry` on an entry's **`id`** — having
      written nothing to the backlog file. **Proceed** over the five defects the skill names the
      **writer-eligible structural defects** (`unknown-id`, `self-edge`, `cycle`,
      `depends-and-rejected`, and a `malformed-entry` on a **non-`id`** field), which the validator
      explicitly declines to let a writer refuse over so that a defective backlog stays repairable
      through ptp — **this command is the tool that repairs them**, so a STOP on a cycle would make the
      cycle permanent. Use the skill's own term for that set; never call it "graph-level", since a
      `malformed-entry` on a non-`id` field is not a graph defect. **Name every outstanding structural
      problem in the report.** Their presence additionally **suppresses re-detection** for this
      invocation (sub-step 6 and *Re-detection* below).
   2. **Resolve the target entry** per *Argument grammar* above. An unknown id → refuse, listing the
      valid ids.
   3. **Classify the instruction** into a mutation set drawn from five kinds: **field edits**
      (`title` / `description` / `notes`), **edge edits** (add/remove `dependsOn`), a **status
      transition**, an **id disposition**, and a **warning disposition**. An instruction that resolves
      to **no recognizable mutation is a refusal** — never a silent no-op reported as success.
   4. **Status legality first, then the recovery gate** — both evaluated **before** any mutation is
      composed.
      - **Legality first.** Check any requested status change against the skill's **transition table**:
        a **no-op** write, a row **absent** from the table, and **every runner-only row** are refused
        **here**, naming the row and its performer. Only a transition the table permits reaches the
        gate. **This precedence is load-bearing:** an instruction asking to mark a **stale** entry
        `done` must be refused as an illegal / never-`done` transition, **not** as a missing
        disposition — the latter would print an availability table inviting a choice when **no**
        disposition can produce `done`, which is a misleading answer to a request that was illegal on
        its face. One case is **not** a transition at all: a target whose stored `status` is **out of
        enum** has no *from* row, and replacing it with a valid value is governed by the skill's
        **out-of-enum `status` repair** rule — a repair this command is obliged to allow, since that
        defect is writer-eligible precisely so it stays repairable.
      - **Then the recovery gate**, whenever the target's status is **`in-progress`** and the
        instruction would change **its status**. An edit touching only fields or edges of an
        `in-progress` entry is **not** recovery-gated. Reconcile first when the entry is **stale**;
        when `runBaseline` is null there is nothing to diff, so reconciliation is skipped and the gate
        is evaluated on the entry's existing holdings alone. Either way, evaluate the skill's
        **availability table** on the resulting state and require an explicit **offered** disposition —
        except in the table's ungated first row, which needs none. **The settled disposition's own
        outcomes are composed into this invocation's mutation set here** — the `changeEpics`
        relabellings or drops, the `attributionWarnings` removals, and the mandatory `runBaseline`
        clear, each exactly as the skill defines it — and they land in the single write of sub-step 7
        alongside the user's own edits.
   5. **Apply the user's own edits** — **fields, then edges, then status** — under the transition table
      and its guards. Edge removals and re-adds settle `dependencyRejected` and `dependencyEvidence`
      inside this same mutation set (see *Edge edits* below). The `title` / `description` / `notes`
      edits are this command's **primary write** under its own contract — exactly what the detection
      contract reserves for the invoking command when it forbids detection from touching those three
      fields on any entry, the subject included.
   6. **Re-run detection** per the skill's *Dependency detection* contract — **after** step 5, and only
      under the trigger and suppression rules of *Re-detection* below.
   7. **One whole-file write** carrying every mutation of sub-steps 4–6, **including every `runBaseline`
      clear**, through the skill's read-modify-write IO protocol. There is **no second write and no
      partial write**.
   8. **Report** per *Report obligations* below.
5. **STOP** with the report.

**Atomicity, scoped to the backlog file and to this command's own writes.** If any step refuses, **this
command has written nothing to `openspec/backlog.json`** — no partial entry, no partial edge set, no
cleared baseline. That guarantee is scoped twice over: to the backlog **file** (the outer-session
`ptp-branch-guard` preamble runs **before** the main run and may already have stashed, pulled, and cut a
feature branch, so this command SHALL **NOT** be described as having left the repository untouched), and
to this command's **own** writes (a `ptp-branch-prep` `pull` is a git operation on the worktree, not an
edit of the backlog by this command; where it moved the file, say so rather than claiming byte-equality
this command cannot promise). The outer-session STOPs of steps 1 and 1a
run before the guard precisely to keep that window as small as the ordering allows.

## Re-detection

- **Ordering.** Detection runs **after** the user's own edge edits are applied, never before. If it ran
  first, an edge the user is removing in this very invocation would still be in `dependsOn` when
  detection looked, and — worse — an edge the user is **rejecting** would not yet be in
  `dependencyRejected`, so detection could re-propose it and the invocation would end with the rejected
  edge back in the file. **A just-rejected edge must be visible to the detector that runs beside it.**
- **Trigger.** Re-detection runs **only** when the invocation changed **`title`**, **`description`**,
  **`dependsOn`**, or **`dependencyRejected`** — the fields detection reads. A pure status transition, a
  pure `notes` edit, or a pure recovery disposition changes none of them and does **not** re-run it.
- **The report says whether detection ran**, and when it did not, **why** — trigger unmet, or
  suppressed.

### Inherited suppression

The **suppression rule is the detection contract's own**, owned by the `ptp-backlog` skill and inherited
here unchanged — do not restate a second version of it. Its consequences for this command:

- Whatever the trigger says, **re-detection does not run when the file as loaded carried any of the five
  writer-eligible structural defects**.
- The **user's own edit still lands** in this invocation's single write, **no detected edge is written
  in that operation**, and **the report names the defect as the reason**.
- Suppression is keyed on the file **as loaded**, so **the invocation that repairs the last defect is
  itself detection-free**; the next invocation, loading a sound file, runs detection normally.
- Suppression governs **detection's candidates only**. It does **not** relax the unknown-id, self-edge,
  or cycle checks applied to **the user's own edge edits** (see *Edge edits*) — those are what make the
  repair itself safe.

### Inherited already-present-edge precedence

Also the detection contract's own rule, inherited unchanged: **a candidate already present in the
write-target's `dependsOn` is settled first as an ordinary no-op, ahead of every refusal check —
including the target-status check.** On a `done` or `in-progress` write-target such an edge is a
**silent no-op**, its existing `dependencyEvidence` is **left untouched**, and it is **not** reported as
a `target-status` refusal, because detection is attempting **no write** for it at all.
`/ptp:backlog-edit` is the **only** place the contract says that case is reachable — this is the only
command that re-runs detection over entries that already carry edges — so this is where it has to be
honoured.

## Edge edits

Applied within step 4.5, landing in the same single write:

- **Removing** an id from `dependsOn` → the id is **added to `dependencyRejected`**, and that edge's
  **`dependencyEvidence` entry is deleted in the same write** (a rationale for an edge that no longer
  exists is stale by construction).
- **Re-adding** an id that sits in `dependencyRejected` → the edit **succeeds** and the id is **removed
  from `dependencyRejected` in the same write** (`dependencyRejected` suppresses *detection*, never the
  *user*), and **no `dependencyEvidence` entry is written for the re-added edge** — the edge is
  user-entered *now*, whatever its history, and manufacturing a rationale would make the file claim the
  detector created an edge the user did. Where an earlier removal deleted that entry it simply **stays
  absent**; where a hand edit left a **residual** entry behind for that edge, it is **left exactly as
  found** rather than cleared — the same treatment the detection contract gives a residual entry, and
  repairing it is a separate explicit user edit.
- **Invariant:** an id is **never in both `dependsOn` and `dependencyRejected`** on the same entry.
  Enforce it on the composed post-edit entry **before** the write.
- **User edge edits are subject to the same refusals detection is** — **unknown id**, **self-edge**, and
  a **whole-graph cycle check** evaluated over the complete post-edit graph at once, with the **whole
  mutation refused atomically** rather than partially applied. The cycle check refuses only a cycle the
  mutation **introduces**: a **pre-existing** cycle the mutation does not extend **never blocks the edit
  that breaks it**, and an edge **removal is never refused on cycle grounds**. Otherwise the only
  command able to break a cycle would be refused by the cycle itself.
  **This introduces-only qualifier governs the user's own mutation only.** It does **not** amend the
  detection contract's own atomic candidate-set cycle check, which stays exactly as written and needs no
  such qualifier — a pre-existing cycle is a writer-eligible structural defect and suppresses detection
  outright before any candidate is assembled.

## Delegated methodology — do not restate it here

The **status transition table**, the **three guards** (`blocked` → `pending`; any → `cancelled`;
`cancelled` → `pending` and its two bypasses), and the whole **recovery and reconciliation machinery**
(the stale definition and its conditional wording, the prefix-set definition, the reconciliation
algorithm, the gate, the **availability table**, the **disposition outcomes**, the combination rules, the
`runBaseline`-clear rule, the never-`done` rule, and the refuse-don't-ask rule for an ambiguous
instruction) live in **`skills/ptp-backlog/SKILL.md`**. Reference them **by name**; this file carries
**no copy** of the transition table, the availability table, or the disposition outcomes.

## Report obligations

The terminal report names, for one invocation:

- **the entry edited and every field changed**, old → new;
- **whether re-detection ran** — and when it did not, whether the **trigger was unmet** or a
  **writer-eligible structural defect suppressed it**, naming that defect — and, if it ran, **every
  other entry it modified** (silently editing a record the user did not ask about is the failure mode to
  avoid) and **every candidate edge it refused**, with the target, its status, and the ground (rejection
  list, unknown id, self-edge, cycle, or a `done` / `in-progress` target). An **already-present** edge is
  **not** a refusal and is never listed as one, whatever the write-target's status;
- **every outstanding structural problem** the load-time validation found;
- **the recovered prefixes, the disposition applied, and the resulting attribution of each id**;
- for the reset and cancellation guards, **the retained `changeEpics` ids** — so a reset is never
  mistaken for a clean slate — and **the acknowledgement that was recorded**;
- for **`rerun anyway`**, the **duplication acknowledgement**;
- for the inversion bypass, **the dependents recorded in `notes`**;
- and, **on any refusal**, the exact reason **plus what *is* available** — the offered dispositions for a
  gated entry, or the transition table row and its performer for an illegal status write. Word every
  stale-entry statement **conditionally**, as `/ptp:backlog` does, rather than asserting a crash.

**A refusal is never relayed as success.**

## Hard rules

- **Never commit, push, merge, archive, or deploy.** This command edits exactly one file:
  `openspec/backlog.json`. (The `ptp-branch-guard` preamble's `ptp-branch-prep` workflow performs git
  operations — stash, checkout, pull, branch — before the main run; those are the guard's, not this
  command's edits, and they are the reason the atomicity guarantee above is scoped as it is.)
- **Never edit more than one target entry directly.** The only other entries an invocation may modify
  are re-detection's reverse-edge write-targets, and every one of them is named in the report.
- **Never set `done`.** No recovery path, disposition, or combination of dispositions may produce it;
  the request is refused with the reason.
- **Never ask clarifying questions.** Do not use AskUserQuestion and do not pause for approval. Where an
  instruction is ambiguous in a way that could defeat a guard, **refuse and print what is available** —
  a refusal, not a question.
- **Never restate the `ptp-backlog` skill's contract here** — not the schema or field list, not the IO
  protocol, not the validation problem codes or the writer-eligibility rule, not the dependency-detection
  contract, and not the transition table or the recovery machinery. The skill owns them; cite it.
- Do **not** chain `/ptp:backlog-run`, `/ptp:plan`, `/ptp:full`, or any implementation step. Recommend a
  next command (`/ptp:backlog` to view) rather than running it.
