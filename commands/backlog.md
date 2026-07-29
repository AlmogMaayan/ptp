---
description: Read-only view of the epic backlog — renders the entries table, the computed ready set in run order, stale in-progress and provisional-attribution flags, and any validation problems. Delegates the schema, IO, validation, and ready-set rules to the shared ptp-backlog skill. Creates no file, not even the backlog file.
argument-hint: "(no arguments — read-only)"
---

You are running **`/ptp:backlog`** — a **read-only** view of the epic backlog
(`openspec/backlog.json`). It renders what the file says and what the `ptp-backlog` skill computes
from it, and it writes nothing at all. It is a thin front door: the schema, the IO protocol, the
validation vocabulary, the id rules, and the ready-set definition all live in the `ptp-backlog` skill.

## Steps

1. **Invoke / consult the `ptp-backlog` skill** via the Skill tool. The skill holds the complete
   contract: the file location, the v1 schema and its `version` gate, the tolerant read, the
   whole-file read protocol, the validation problem codes with their fatal / structural
   classification, and the ready-set definition with its deterministic order. **Do not restate any of
   it here** — not the field list, not the IO protocol,
   not the problem-code table, not the id-allocation rule, and not the ready-set rule.
2. **Read** the backlog through the skill's read protocol and **compute** the validation problems and
   (subject to the suppression rule below) the ready set.
3. **Render the output sections** below.
4. **STOP** with the rendered view. Write no file.

## Output

When the backlog carries **no fatal** validation problem, render these six sections in order:

| # | Section | Contents |
|---|---|---|
| 1 | **Header** | the resolved file path, the `version`, and the entry count — or, when the file is absent, a plain "no backlog yet" statement naming `/ptp:backlog-add` as the way entries are added |
| 2 | **Entries** | one row per entry, in **canonical ascending-numeric-id order**: id, title, status, `dependsOn`, the **unsatisfied** subset of `dependsOn` with each blocker's status, the entry's `changeEpics` links **counted by `attribution`**, and a flags cell |
| 3 | **Ready set** | the ready entries **in run order** — or the reason it is withheld (see *The ready-set suppression rule*) |
| 4 | **Attention** | stale `in-progress` entries, entries holding a `folder-diff-unconfirmed` change-epic link, entries holding an undispositioned `attributionWarnings` prefix |
| 5 | **Validation** | one row per problem — code, affected entries, message — or an explicit "no problems found" |
| 6 | **Recommendation** | the next ptp command, in `/ptp:status`'s style |

The entries table renders in **canonical order, not ready order**, so section 2 is a stable picture of
the file and section 3 is the derived answer.

**The empty-state wording must not imply `/ptp:backlog-add` is installed.** Name it as the way entries
*are added*, not as a command to run right now — until a later change ships it, it does not exist.

### Under a fatal problem the output is shorter

The six-section output above is **conditional on the absence of a fatal problem**. When a **fatal**
problem is present, render **only** section 1 (header), section 5 (validation, naming the problem),
and section 6 (recommendation) — no entries table, no ready set, no attention section — because a
fatal problem means **nothing further is computable**.

In that header the **file path is always shown**, and any value that is uncomputable under the problem
— the `version` and/or the entry count, neither of which an unparseable file has — is rendered as
`unavailable` rather than guessed. Still nothing is written.

### The attention section

The attention section is a **requirement, not a nicety**. It MUST:

- surface **every** entry holding a `folder-diff-unconfirmed` `changeEpics` id, so a provisional link
  is visible rather than silently permanent;
- surface **every** entry holding an **undispositioned** `attributionWarnings` prefix;
- **distinguish all three `attribution` values** — `terminal-report` (authoritative),
  `folder-diff-unconfirmed` (provisional), and `user-confirmed-reconciliation` (a human vouched for
  it) — so a provisional or human-vouched link is **never** presented as an authoritative one.

### The ready-set suppression rule

**Hard rule: a ready set is displayed only when the backlog carries no fatal and no structural
problem.** When any such problem is present the ready set is **withheld** and the defect is named in
its place, so the view can **never** show a ready set that a backlog runner would refuse to consume.

Two conditions of an **otherwise valid** file are **not** defects and are reported as such rather than
as problems:

- **An empty backlog** (no entries at all) — a **no-op**, not a defect. Report it as such, naming how
  entries are added.
- **Zero ready entries while `pending` entries remain** — **blocked-predecessor starvation**. Name the
  unmet dependencies and their **blocking entries**: every remaining `pending` entry transitively
  depends on a `blocked` or `in-progress` target. This is the expected consequence of a previous halt,
  not a file defect, and it points the user at unblocking those entries.

**Structural starvation is deliberately not routed through this path.** Every structural cause of
starvation — a residual `cycle`, `unknown-id`, `self-edge`, or `depends-and-rejected` — is *already* a
structural validation problem, so the suppression rule above has already withheld the ready set and
named the defect before starvation would ever be computed. That is precisely why the "not a defect"
claim here can never contradict the suppression rule: on a file free of fatal and structural problems,
**all** starvation is blocked-predecessor starvation.

### The stale `in-progress` flag

Flag every entry whose `status` is `in-progress` **and** whose `runBaseline` is **non-null**.

Word the flag **conditionally**, e.g. *"in-progress with a pending run baseline — un-reconciled from a
crashed run **if no backlog run is currently live**."*

The conditional wording is required, and the **reason** is that a **live** run sets both fields in one
write *before* its work begins, so a running epic and a crashed one look **identical** in the file.
The command **never asserts a crash** and performs **no process inspection** — it reports honestly,
the same posture `/ptp:telemetry status` uses for its Codex preflight ("configured; delivery not
verified") rather than overclaiming.

## Hard rules

- **Read-only in the strongest sense.** It creates **no** file — **including `openspec/backlog.json`
  itself** — modifies nothing, and deletes nothing.
- **No branch guard, no `openspec validate`, no git command.** `/ptp:backlog` is exempt from the
  branch guard exactly as `/ptp:status` and `/ptp:version` are.
- **Not wrapped in `ptp-run-at-model`.** Like `/ptp:status`, it does no work that needs a deterministic
  model, and wrapping it would start a main run (and a telemetry window) for a file read.
- **Takes no argument and no change selector.** Backlog ids are outside the `epic:` / `story:` selector
  grammar. An argument is reported as **unsupported** in a **single diagnostic line above the header**,
  and the backlog view below that line is **identical to the no-argument rendering** — the argument
  never filters, reorders, or otherwise alters it — and nothing is written.
- **No reconciliation affordance.** The view never performs, and never triggers, reconciliation — an
  affordance would either make a read-only command write or make it invoke a write command. It names
  `/ptp:backlog-edit` in the **recommendation only**, exactly as `/ptp:status` recommends a next
  command without running it.
- **Never restate the skill's contract here** — the schema, the IO protocol, the problem codes, the
  id-allocation rule, and the ready-set definition are defined once, in `ptp-backlog`.
