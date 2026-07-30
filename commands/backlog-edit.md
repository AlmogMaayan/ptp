---
description: Edit exactly one epic backlog entry from a free-text instruction — fields, status transitions, and the recovery of an entry left in a stale in-progress state, un-reconciled from a crashed backlog run only if no backlog run is currently live. Enforces the transition table and the reconciliation gate, lands every mutation of one invocation in a single write, and reports every entry it touched. Autonomous: refuses with what is available rather than asking. Delegates the schema, IO, validation, transition, and recovery rules to the shared ptp-backlog skill.
argument-hint: "<BK-NNNN> <what to change> [model:<model>.<effort>]"
---

You are running **`/ptp:backlog-edit`** — the writer that **changes** an epic already in the backlog,
which lives on a **GitHub Projects v2 board**. It takes **one** backlog id plus a free-text edit
instruction, applies every mutation of that invocation in a **single** write, and reports. It is a thin
front door: the store identity, the entry model, the read protocol, the validation vocabulary and its
writer-eligibility rule,
the **status transition table with its guards**, and the
**recovery and reconciliation machinery** all live in the **`ptp-backlog`** skill.

> **Contrast with its siblings:** `/ptp:backlog` is the read-only view. `/ptp:backlog-add` creates a new
> entry and modifies no other.
> `/ptp:backlog-run` (`0036_04`) writes an existing entry's **execution state** — its runner-row status
> transitions, `changeEpics`, `attributionWarnings`, and the `runBaseline` it sets on taking an epic and
> clears on its terminal write. This command is the only one that changes an existing entry **at the
> user's direction** — its fields, its status, its attribution, or its `runBaseline` — and,
> outside the runner, the **only** consumer of a stale `runBaseline`. It never plans, never implements,
> and never runs an epic.

## The refusal contract — exactly one, and it names its own cause

**The board write path has shipped**, so this command writes. What survives from the refusal that stood
while it had not is the **shape** of the refusal, not its wording:

- **Exactly one refusal exists in this file**, and it is issued **non-silently and up front**, naming
  the **specific** reason it cannot write. No second, divergently-worded refusal is added beside it.
- The grounds are their owning contracts' and are **cited, never restated**: the `ptp-backlog` skill's
  **writer-eligibility** rule; `ptp-github-projects-mcp`'s **`read-only`** and **`unavailable`**
  preflight verdicts; and an entry whose **content type offers no path to update a carrier** a planned
  field rides. Each is a **condition within this one refusal contract**, and each names its own cause
  when it fires. **Degraded scope is not among them**: this command allocates no id and consumes no
  ready set, so it **proceeds** under it, per `ptp-backlog-write`'s degraded-scope dispositions.
- **No ground is worded over the write path being unshipped**, that antecedent having lapsed.
- **No fallback of any kind.** No local backlog file is read, created, or written, and no other store
  is substituted — under any verdict, any problem, any refusal, and **any write outcome**, the error
  path included. A failed, partial, or unresolved write is never compensated, mirrored, or recorded
  anywhere but the board and this command's own report.

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
  positional id**, an **unknown positional id** (one no entry in the store carries — list the valid
  ids), or **more than one positional id**. There is no bulk selector.
- **The count is of positional target ids only.** A `BK-NNNN` appearing **inside the free-text
  instruction** — as in `BK-0001 note that this supersedes BK-0002` — is part of the **instruction**,
  not a second target, and is **never** counted as one. A rule that counted every `BK-NNNN` in the
  invocation would refuse ordinary instructions that merely mention another entry.
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
   1. **Read and validate the whole store** through the skill's read protocol and its
      **writer-eligibility rule**. **STOP exactly where that rule obliges a writer to STOP** — on any
      **fatal** problem, on `duplicate-id`, and on a `malformed-entry` on an entry's **`id`** — having
      written nothing to the backlog store. **Proceed** over the one defect the skill names **the
      writer-eligible structural defect** (a `malformed-entry` on a **non-`id`** field), which the
      validator explicitly declines to let a writer refuse over so that a defective backlog stays
      repairable through ptp — **this command is the tool that repairs it**, so a STOP on an
      out-of-enum `status` would make that status permanent. Use the skill's own term for it. **Name
      every outstanding structural problem in the report.**
   2. **Resolve the target entry** per *Argument grammar* above. An unknown id → refuse, listing the
      valid ids.
   3. **Classify the instruction** into a mutation set drawn from **three** kinds: **field edits**
      (`title` / `description` / `notes`), a **status transition**, and a **recovery disposition** (an
      id disposition, a warning disposition, or both). An instruction that resolves
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
        instruction would change **its status**. An edit touching only fields of an
        `in-progress` entry is **not** recovery-gated. Reconcile first when the entry is **stale**;
        when `runBaseline` is null there is nothing to diff, so reconciliation is skipped and the gate
        is evaluated on the entry's existing holdings alone. Either way, evaluate the skill's
        **availability table** on the resulting state and require an explicit **offered** disposition —
        except in the table's ungated first row, which needs none. **The settled disposition's own
        outcomes are composed into this invocation's mutation set here** — the `changeEpics`
        relabellings or drops, the `attributionWarnings` removals, and the mandatory `runBaseline`
        clear, each exactly as the skill defines it — and they land in the single write of sub-step 6
        alongside the user's own edits.
   5. **Apply the user's own edits** — **fields, then status** — under the transition table and its
      guards. The `title` / `description` / `notes` edits are this command's **primary write** under
      its own contract.
   6. **One write group** carrying every mutation of sub-steps 4–5, **including every `runBaseline`
      clear**, dispatched through the **ordered write sequence** with both re-reads and the write
      journal, per **`skills/ptp-backlog-write/SKILL.md`** — cited, not restated. There is **no second
      write group and no deferred write**: nothing this invocation mutates is left to a later one.

      **Every `runBaseline` clear is a payload write and therefore precedes the status commit**, which
      is the settling `status` write, dispatched last of all. That order is the skill's, and its
      accepted residual, its two-layer detection rule, and its four-part report obligation are the
      skill's too.
   7. **Report** per *Report obligations* below.
5. **STOP** with the report.

**Atomicity, scoped to the backlog store and to this command's own writes.** If any step refuses, **this
command has written nothing to the store** — no partial entry and no
cleared baseline. That guarantee is scoped twice over: to the backlog **store** (the outer-session
`ptp-branch-guard` preamble runs **before** the main run and may already have stashed, pulled, and cut a
feature branch, so this command SHALL **NOT** be described as having left the repository untouched), and
to this command's **own** writes (a `ptp-branch-prep` `pull` is a git operation on the worktree, not an
edit of the backlog by this command; where it moved a working-tree file, say so rather than claiming a
repository-wide no-op this command cannot promise). The outer-session STOPs of steps 1 and 1a
run before the guard precisely to keep that window as small as the ordering allows.

**A refusal and a failure are different, and the guarantee above covers only the first.** *If any step
refuses, nothing is written* is retained exactly as stated. A **failure** mid-sequence is governed by
`ptp-backlog-write`'s journal and its terminal verdicts, and this command **SHALL NOT** claim that such
a failure leaves the store byte-unchanged: it reports the verdict, the journal in full, and what the
entry's status is — as what this invocation **knows**, never as an assertion about what a concurrent
human did.

## Delegated methodology — do not restate it here

The **status transition table**, **guards 1–2** — the guards this command is subject to (`blocked` →
`pending`; any → `cancelled`); **guard 3** (`blocked` →
`done`) belongs to `/ptp:backlog-continue` alone and this command refuses that transition
unconditionally — and the whole **recovery and reconciliation machinery**
(the stale definition and its conditional wording, the prefix-set definition, the reconciliation
algorithm, the gate, the **availability table**, the **disposition outcomes**, the combination rules, the
`runBaseline`-clear rule, the never-`done` rule, and the refuse-don't-ask rule for an ambiguous
instruction) live in **`skills/ptp-backlog/SKILL.md`**. Reference them **by name**; this file carries
**no copy** of the transition table, the availability table, or the disposition outcomes.

The **ordered write sequence** and its stages, the **status-commit invariant** and its **backstop
refusal**, the **pre-dispatch snapshot** and the **pre-write field check**, the **write journal** with
its six outcomes and six terminal verdicts, **fail-stop** and the prohibition on compensating writes,
the **creation scan**, and the **`runBaseline`-clear dispatch decision** live in
**`skills/ptp-backlog-write/SKILL.md`**. Reference them **by name**; this file carries **no copy** of
any of them.

**An explicit user edit may target an entry in any status**, `done` and `in-progress` included — on a
`done` target it documents history rather than schedules work. The transition table still governs any
**status** change requested against such an entry.

## Report obligations

The terminal report names, for one invocation:

- **the entry edited and every field changed**, old → new;
- **every outstanding structural problem** the load-time validation found;
- **the recovered prefixes, the disposition applied, and the resulting attribution of each id**;
- for the reset and cancellation guards, **the retained `changeEpics` ids** — so a reset is never
  mistaken for a clean slate — and **the acknowledgement that was recorded**;
- for **`rerun anyway`**, the **duplication acknowledgement**;
- and, **on any refusal**, the exact reason **plus what *is* available** — the offered dispositions for a
  gated entry, or the transition table row and its performer for an illegal status write. Word every
  stale-entry statement **conditionally**, as `/ptp:backlog` does, rather than asserting a crash.

**A refusal is never relayed as success.**

## Hard rules

- **Never commit, push, merge, archive, or deploy.** This command edits exactly one store: the backlog
  board. It edits **no file at all**, and no local backlog file exists to edit. (The
  `ptp-branch-guard` preamble's `ptp-branch-prep` workflow performs git
  operations — stash, checkout, pull, branch — before the main run; those are the guard's, not this
  command's edits, and they are the reason the atomicity guarantee above is scoped as it is.)
- **Exactly one entry is modified per invocation** — the resolved target. No other entry is written.
- **Never set `done`.** No recovery path, disposition, or combination of dispositions may produce it;
  the request is refused with the reason.
- **Never ask clarifying questions.** Do not use AskUserQuestion and do not pause for approval. Where an
  instruction is ambiguous in a way that could defeat a guard, **refuse and print what is available** —
  a refusal, not a question.
- **Never restate the `ptp-backlog` skill's contract here** — not the schema or field list, not the IO
  protocol, not the validation problem codes or the writer-eligibility rule, and not the transition
  table or the recovery machinery. The skill owns them; cite it.
- Do **not** chain `/ptp:backlog-run`, `/ptp:plan`, `/ptp:full`, or any implementation step. Recommend a
  next command (`/ptp:backlog` to view) rather than running it.
