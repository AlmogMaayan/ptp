---
description: Add one epic to the backlog from a free-text request — writes a single `backlog` entry that is not yet ready to run, modifying no other entry, and establishes no identifier of its own, the entry's id being the board item's node id. Autonomous: asks no clarifying questions. Delegates the schema, IO, the identity rule, and validation rules to the shared ptp-backlog skill.
argument-hint: "<free-text description of the epic to add> [model:<model>.<effort>]"
---

You are running **`/ptp:backlog-add`** — the writer that puts an epic **into** the epic backlog,
which lives on a **GitHub Projects v2 board**. It takes a free-text epic request, creates **exactly
one** new entry, and reports. It is a thin front door: the store identity, the entry model, the read
protocol, the identity rule, and the validation vocabulary with its writer-eligibility rule all live in
the **`ptp-backlog`** skill.

> **Contrast with its siblings:** `/ptp:backlog` is the read-only view — it writes nothing, and
> creates nothing on the board. This command is the first writer. It never plans, never implements, and never
> runs an epic.

## The refusal contract — exactly one, and it names its own cause

**The board write path has shipped**, so this command writes. What survives from the refusal that stood
while it had not is the **shape** of the refusal, not its wording:

- **Exactly one refusal exists in this file**, and it is issued **non-silently and up front**, naming
  the **specific** reason it cannot write. No second, divergently-worded refusal is added beside it.
- The grounds are their owning contracts' and are **cited, never restated**: the `ptp-backlog` skill's
  **writer-eligibility** rule; the **`gh` transport contract**'s (`ptp-github-projects-gh`)
  **`read-only`** and **`unavailable`** preflight verdicts; and `ptp-backlog-write`'s refusal when **the resolved status-option row does not identify
  exactly one board `Status` option** — taken before the existence stage, so a creation under it leaves
  **no item** on the board. **The `ptp-backlog` skill's *Read protocol* step-0 configuration grounds
  are among them, both of them**: an **incomplete `backlog.*` configuration** (its missing keys being
  only ever `backlog.projectOwner` and/or `backlog.projectNumber`) and a **colliding resolved
  status-option table**. Both are
  decided from configuration alone, so they fire at **step 1b** of **Steps** below, in the outer
  session, before the branch guard and before any `gh` command is run. **Degraded scope is not a
  ground**: this command establishes no identifier and consumes
  no ready set, so `ptp-backlog-write`'s degraded-scope dispositions let it proceed. Each is a
  **condition within this one refusal contract**, and each names its own cause when it fires.
- **No ground is worded over the write path being unshipped**, that antecedent having lapsed.
- **No fallback of any kind.** No local backlog file is read, created, or written, and no other store
  is substituted — under any verdict, any problem, any refusal, and **any write outcome**, the error
  path included. A failed, partial, or unresolved write is never compensated, mirrored, or recorded
  anywhere but the board and this command's own report.

## Inputs

Request: $ARGUMENTS (the free-text description of the epic to add, optionally carrying an
anywhere-in-text `model:<model>.<effort>` override token — e.g. `model:fable.high` — that overrides
this command's `opus.high` default for this invocation only; see step 1 of **Steps** below)

## Branch safety (first step)

**Ordering note:** the cheap read-only `model:` override parse (step 1 of **Steps** below), the
non-empty-request check (step 1a), and the **configuration gate** (step 1b) all run in the outer
session **before** this guard — an invalid token, an empty request, or an unactionable `backlog.*`
configuration STOPs the command before the guard evaluates or cuts any branch. Steps 1 and 1a stay
**ahead of** 1b deliberately: they are free argument checks that reach neither the store, the transport,
nor the worktree, so a malformed `model:` token is still reported as a malformed token rather than
masked by a configuration refusal.

Before creating or updating **any** file, run the **`ptp-branch-guard`** preamble: check
`git rev-parse --abbrev-ref HEAD`; if it is the base branch (`master`/`main`), derive a feature-branch
name from a ≤5-kebab-word summary of the request (→ `ptp/<summary>`) — there is **no change id** for a
backlog add, so the branch name comes from the request text, the same derivation `/ptp:analyze` uses —
and launch the minimal `ptp-branch-prep` workflow (stash → checkout the base branch → pull → cut the
branch) **before** writing anything; if you are already on a feature branch it is a **no-op** —
proceed as-is. The full rule (branch naming, the workflow contract, the hard rules) lives in the
**`ptp-branch-guard`** skill — do not restate it here.

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
   **Step 1a — require a non-empty request (outer session, still before the branch guard).** The
   request text remaining **after** the token is stripped MUST be non-empty. If it is not —
   `/ptp:backlog-add` with no argument, or `/ptp:backlog-add model:opus.high`, which leaves nothing to
   compose an entry from — **STOP in the outer session**, before the branch guard and before any main
   run, and report that a free-text epic request is required. **Never invent an epic** to fill an
   empty request.
   **Step 1b — take the configuration gate (outer session, still before the branch guard).** Resolve
   the `backlog.*` configuration per **`ptp-github-projects-gh`** and take **`ptp-backlog`**'s *Read
   protocol* **step 0**. On either of its **two** grounds — an **incomplete `backlog.*` configuration**
   or a **colliding resolved status-option table** — **STOP in the
   outer session**, before the branch guard and before any main run, naming the ground through this
   file's one refusal contract: the missing keys, or `backlog.statusOptions` with
   its colliding option name and every status claiming it. **Name the ground; do not restate the
   rule** — each ground's content is that skill's. **No `gh` command is run**, and **no branch is
   cut**: an incomplete configuration is an invocation that provably cannot write, decided from
   configuration alone at zero transport cost, so it must abort where the other aborting checks do. Any
   board identity this refusal renders carries its **provenance**, per
   `ptp-github-projects-gh` §*The acting identity*.
2. **Run the branch guard** (the *Branch safety* preamble above), in the outer session.
3. **Run the remaining work as one `ptp-run-at-model` main run** at the resolved target (`opus.high` by
   default, or the valid `model:` override), per the **`ptp-run-at-model`** skill — reference it for
   the spawn-and-relay mechanics rather than restating them. The main run invokes the **`ptp-backlog`**
   skill **inline** in its own context and performs step 4 below. This command **spawns nothing of its
   own**, so it wraps with no second nesting level. One note the main run's prompt MUST carry: its own
   `ptp-branch-guard` check is a **no-op** (HEAD is already on a feature branch from the outer guard),
   so it must **not** attempt to launch the `ptp-branch-prep` Workflow.
4. **Inside the main run**, in this order — the methodology for every step below lives in the
   `ptp-backlog` skill; name the step, do not restate the rule:
   1. **Read and validate** the backlog store **through the skill**, following its read protocol
      (a board carrying no entry reads as the empty backlog, and nothing is created here) and its
      **writer-eligibility rule**. That rule decides the outcome: on **any fatal problem**, **STOP and
      report** the defect, having written nothing to the backlog store; otherwise **proceed**, every
      structural defect being writer-eligible — creating the entry, reporting the defect, and naming
      `/ptp:backlog-edit` as the repair path. Do **not** enumerate the problem codes or restate which
      class falls where.
   2. **Compose the entry** in memory, per *Entry composition* below.
   3. **Persist the new entry alone**, by running the **ordered write sequence** with both re-reads and
      the write journal, per **`skills/ptp-backlog-write/SKILL.md`** — cited, not restated. **No earlier
      step writes anything**, and nothing is created on disk, at any step.

      The subject entry's **`status: backlog` is the commit**, not part of *Entry composition*'s write;
      *Entry composition* below is otherwise unchanged.

      **The actual dispatch count, from the skill's carrier record:** the create call is
      `gh project item-create`, which carries **title and body in one dispatch** — the two carriers being
      **co-dispatched** on this transport — so it writes `title`, `description`, `changeEpics`,
      `attributionWarnings`, `runBaseline`, and `notes` **at once**; there is **no identity write**, the
      entry's `id` being the **board item node id that arrives with the item** in the create's
      `--format json` response; `status` is the commit, a separate field-value dispatch. **The payload
      stage is therefore empty**, and a creation is **two dispatches** — not one per field.

      **Refusals and failures are different, and both statements stand.** If any step **refuses**,
      nothing was written to the store — that guarantee is unchanged. A **failure** mid-sequence is
      governed by the skill's journal and its terminal verdicts, and this command **may not** claim that
      such a failure leaves the store byte-unchanged.
   4. **Report** the entry it created, naming its `id`, its `title`, and its `status`, so the new
      record is identifiable from the report alone — and **any outstanding structural defect** the load
      reported, with `/ptp:backlog-edit` named as the repair path.

      **That naming obligation is scoped to a settled creation, and the scoping is load-bearing now
      that the `id` is the board's.** Under the old contract the identifier was minted before dispatch,
      so it could always be named; the node id comes into existence **with the item**, so it cannot be.
      Where the skill's verdict is `unresolved-create` there is **no node id to name** and the report
      SHALL say so — carrying the journal's `unidentified` rows and the observed candidates — rather
      than printing an identity it does not have; where the verdict is `unresolved-commit` the entry's
      **`status` is unknown** and the report SHALL NOT assert `backlog`. In both cases the report is the
      skill's journal and terminal verdict, and this command **asserts nothing the write did not
      establish**.

      **On a settled creation the report SHALL also state that the entry is not yet ready to run**, and
      name **`/ptp:backlog-edit` performing `backlog` → `ready`** as the promotion that makes
      `/ptp:backlog-run` able to take it. The transition is `ptp-backlog`'s table's, cited here and
      never copied. That statement is scoped exactly as the naming obligation above is, and for the same
      reason: it presupposes the entry carries `backlog`, so under `unresolved-create` or
      `unresolved-commit` it is **withheld with the status** rather than printed beside an unknown one.
5. **STOP** with the report.

## Entry composition

This is the **only** methodology this command owns — everything else is the skill's. Reference the
`ptp-backlog` skill for the field set itself; do **not** restate the schema here.

- Its `id` is the **board item's node id the creation returns**. It is **not composed** and **not
  written** — it joins `createdAt` and `updatedAt` as a board-supplied value.
- The new entry's `status` is **`backlog`**. This is deliberate: the entry is **recorded, not
  scheduled**, and `/ptp:backlog-run` will not take it.
- Its `title` is a short **derived** label — **one to eight words, never empty** — for the
  `/ptp:backlog` view.
- Its `description` carries the user's request text **substantively verbatim**. Do **not** paraphrase
  the request into your own words: that text is what `/ptp:full` later receives as its free-text
  request, so paraphrasing here silently degrades the input to every downstream planning run.
- Every recognized field **other than** those above takes the **empty value the skill's schema gives
  it** — including `createdAt` and `updatedAt`, which like `id` are **board-supplied**: the skill's timestamp
  rule states that the store exposes no setter and that **ptp sends no value for either**, so this
  command composes neither and the store's own stamps are authoritative from the first read onward.

The composition is the **intended logical state** the one write group carries — not a payload persisted
by a single dispatch. W1 writes the title and body, the commit stage writes `status`, and the board
supplies `id`, `createdAt` and `updatedAt`, which this command neither composes nor sends.

## Hard rules

- **Autonomous.** Ask **no** clarifying questions, do **not** use AskUserQuestion, and do **not** pause
  for approval. Where the request is ambiguous, pick the most reasonable interpretation and proceed.
- **Never restate the skill's contract here** — not the schema or field list, not the IO protocol, not
  the identity rule, and not the validation problem codes or the writer-eligibility rule. The
  `ptp-backlog` skill owns them; cite it. The **ordered write sequence**, both **re-reads**, the
  **journal** with its outcomes and verdicts, the **backstop refusal**, and the **creation scan** are
  `ptp-backlog-write`'s; cite that skill and restate none of them here either.
- **Beyond initializing the new entry under the composition policy above**, do **not** write to
  `status`, `changeEpics`, `attributionWarnings`, or `runBaseline` — on the new
  entry those fields are set once at composition, and on **every** pre-existing entry they are never
  touched.
- **This command modifies no entry other than the one it creates.** Every pre-existing entry is
  written back with **no field value changed and no `updatedAt` bumped**; its serialization is
  whatever the store holds for that unchanged state, which is a **data** guarantee, not a byte-level
  one about how the store previously rendered it.
- **Exactly one** entry is created per invocation.
- Do **not** chain `/ptp:backlog-run`, `/ptp:plan`, `/ptp:full`, or any implementation step. Recommend
  a next command (`/ptp:backlog` to view, `/ptp:backlog-edit` to adjust) rather than running it.
- Do **not** commit and do **not** archive.
