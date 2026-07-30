---
description: Add one epic to the backlog from a free-text request — allocates a backlog id and writes a single pending entry, modifying no other entry. Autonomous: asks no clarifying questions. Delegates the schema, IO, id allocation, and validation rules to the shared ptp-backlog skill.
argument-hint: "<free-text description of the epic to add> [model:<model>.<effort>]"
---

You are running **`/ptp:backlog-add`** — the writer that puts an epic **into** the epic backlog,
which lives on a **GitHub Projects v2 board**. It takes a free-text epic request, creates **exactly
one** new entry, and reports. It is a thin front door: the store identity, the entry model, the read
protocol, the id allocation, and the validation vocabulary with its writer-eligibility rule all live in
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
  **writer-eligibility** rule; `ptp-github-projects-mcp`'s **`read-only`** and **`unavailable`**
  preflight verdicts; the read path's **degraded-scope** withholding, which this command consumes
  because it **allocates an id** (see `ptp-backlog-write`'s degraded-scope dispositions); and an entry
  whose **content type offers no path to update a carrier** a planned field rides. Each is a
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

**Ordering note:** the cheap read-only `model:` override parse (step 1 of **Steps** below) and the
non-empty-request check (step 1a) run in the outer session **before** this guard — an invalid token or
an empty request STOPs the command before the guard evaluates or cuts any branch.

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
      **writer-eligibility rule**. That rule decides the outcome: either **STOP and report** the
      defect, having allocated no id and written nothing to the backlog store, or — over **the
      writer-eligible structural defect** — **proceed**, creating the entry, reporting the defect, and
      naming `/ptp:backlog-edit` as the repair path. Do **not** enumerate the problem codes or restate
      which class falls where.
   2. **Allocate the id** via the skill's id allocation — only after validation has settled.
   3. **Compose the entry** in memory, per *Entry composition* below.
   4. **Persist the new entry alone**, by running the **ordered write sequence** with both re-reads and
      the write journal, per **`skills/ptp-backlog-write/SKILL.md`** — cited, not restated. **No earlier
      step writes anything**, and nothing is created on disk, at any step.

      The subject entry's **`status: pending` is the commit**, not part of *Entry composition*'s write;
      *Entry composition* below is otherwise unchanged.

      **The actual dispatch count, from the skill's carrier record:** the create call carries **title
      and body**, so it writes `title`, `description`, `changeEpics`, `attributionWarnings`,
      `runBaseline`, and `notes` **at once**; `id` is the identity write; `status` is the commit. **The
      payload stage is therefore empty**, and a creation is **three dispatches** — not one per field.

      **Refusals and failures are different, and both statements stand.** If any step **refuses**,
      nothing was written to the store — that guarantee is unchanged. A **failure** mid-sequence is
      governed by the skill's journal and its terminal verdicts, and this command **may not** claim that
      such a failure leaves the store byte-unchanged.
   5. **Report** the entry it created, naming its `id`, its `title`, and its `status`, so the new
      record is identifiable from the report alone — and, when the load reported the
      writer-eligible structural defect, that defect too, with `/ptp:backlog-edit` named as the repair
      path.
5. **STOP** with the report.

## Entry composition

This is the **only** methodology this command owns — everything else is the skill's. Reference the
`ptp-backlog` skill for the field set itself; do **not** restate the schema here.

- Its `id` is the one allocated in step 4.2 — it is **not** an "empty value" field; it is always the
  allocated id.
- The new entry's `status` is **`pending`**.
- Its `title` is a short **derived** label — **one to eight words, never empty** — for the
  `/ptp:backlog` view.
- Its `description` carries the user's request text **substantively verbatim**. Do **not** paraphrase
  the request into your own words: that text is what `/ptp:full` later receives as its free-text
  request, so paraphrasing here silently degrades the input to every downstream planning run.
- Every recognized field **other than** the four above takes the **empty value the skill's schema gives
  it** — including `createdAt` and `updatedAt`, which are **board-maintained**: the skill's timestamp
  rule states that the store exposes no setter and that **ptp sends no value for either**, so this
  command composes neither and the store's own stamps are authoritative from the first read onward.

The composed entry is exactly what the single write persists.

## Hard rules

- **Autonomous.** Ask **no** clarifying questions, do **not** use AskUserQuestion, and do **not** pause
  for approval. Where the request is ambiguous, pick the most reasonable interpretation and proceed.
- **Never restate the skill's contract here** — not the schema or field list, not the IO protocol, not
  the id-allocation rule, and not the validation problem codes or the writer-eligibility rule. The
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
