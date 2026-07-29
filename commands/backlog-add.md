---
description: Add one epic to the backlog from a free-text request — allocates a backlog id, writes a single pending entry, and runs dependency detection in both directions, reporting every entry it modified and every candidate edge it refused. Autonomous: asks no clarifying questions. Delegates the schema, IO, id allocation, validation, and detection rules to the shared ptp-backlog skill.
argument-hint: "<free-text description of the epic to add> [model:<model>.<effort>]"
---

You are running **`/ptp:backlog-add`** — the writer that puts an epic **into** the epic backlog
(`openspec/backlog.json`). It takes a free-text epic request, creates **exactly one** new entry, runs
dependency detection over the backlog, and reports. It is a thin front door: the file location, the
schema, the IO protocol, the id allocation, the validation vocabulary and its writer-eligibility rule,
and the **dependency-detection contract** all live in the **`ptp-backlog`** skill.

> **Contrast with its siblings:** `/ptp:backlog` is the read-only view — it writes nothing, not even
> the backlog file. This command is the first writer. It never plans, never implements, and never
> runs an epic.

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
   1. **Read and validate** the backlog file **through the skill**, following its read protocol
      (an absent file reads as the in-memory empty backlog and is **not** created here) and its
      **writer-eligibility rule**. That rule decides the outcome: either **STOP and report** the
      defect, having allocated no id and written nothing to the backlog file, or **proceed with
      detection suppressed** — creating the entry, reporting the defect, writing no detected edge in
      this operation, and naming `/ptp:backlog-edit` as the repair path. Do **not** enumerate the
      problem codes or restate which class falls where.
   2. **Allocate the id** via the skill's id allocation — only after validation has settled.
   3. **Compose the entry** in memory, per *Entry composition* below.
   4. **Run dependency detection** per the skill's *Dependency detection* contract, with the composed
      entry as the subject.
   5. **Persist one whole-file write** carrying the new entry, every accepted edge, every evidence
      line, and every touched entry's bumped `updatedAt`. This single write is what creates the file
      on demand when it was absent — **no earlier step creates it**.
   6. **Report** per the skill's report obligation.
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
  it**, with **one exception**: `createdAt` and `updatedAt` are both set to the **same current UTC
  ISO-8601 instant** rather than to their schema empty value.

Composition happens **before** detection runs, so the entry's **persisted** edges and evidence are
whatever detection accepted.

## Hard rules

- **Autonomous.** Ask **no** clarifying questions, do **not** use AskUserQuestion, and do **not** pause
  for approval. Where the request is ambiguous, pick the most reasonable interpretation and proceed.
- **Never restate the skill's contract here** — not the schema or field list, not the IO protocol, not
  the id-allocation rule, not the validation problem codes or the writer-eligibility rule, and above
  all **not the dependency-detection contract**. The `ptp-backlog` skill owns them; cite it.
- **Beyond initializing the new entry under the composition policy above**, do **not** write to
  `dependencyRejected`, `status`, `changeEpics`, `attributionWarnings`, or `runBaseline` — on the new
  entry those fields are set once at composition, and on **every** pre-existing entry they are never
  touched.
- Do **not** remove any existing edge from any entry's `dependsOn`.
- **Exactly one** entry is created per invocation.
- Do **not** chain `/ptp:backlog-run`, `/ptp:plan`, `/ptp:full`, or any implementation step. Recommend
  a next command (`/ptp:backlog` to view, `/ptp:backlog-edit` to adjust) rather than running it.
- Do **not** commit and do **not** archive.
