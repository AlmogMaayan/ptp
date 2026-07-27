---
name: ptp-telemetry
description: Single source of truth for ptp run telemetry — resolves the layered telemetry.mode / telemetry.root / telemetry.port config, owns the per-epic store layout under <telemetry.root>/<epic>/, defines the twelve-field append-only NDJSON run-ledger record and its RFC-4180 CSV dual-write, the mint-once-then-propagate run_id rule, the two-line open/close append protocol, the gate-and-never-fail ordering every write point applies, and the read-only /ptp:telemetry status methodology. Also owns the OTLP span layer — the loopback receiver and its identity/health wire contract, the 26-column spans.csv, the OTel-attribute and tool_class mapping tables, the ledger join, the append-only raw store and the global export that re-derives from it, the confirm-first setup writer, the start/stop lifecycle, and the auto-start preamble ptp-run-at-model invokes. Also owns the report layer — the /ptp:telemetry report methodology: selector delegation and the write-keyword strip, the two never-conflated headline numbers (aggregate work time and elapsed wall time as a union of span intervals with every closed run's window) plus concurrency_factor, the BANNED wall-minus-components subtraction, the phase/agent_role/span_kind and tool_class breakdowns, the top-N sinks, the derived per-iteration review view, the mandatory data-quality footer, and telemetry.retentionDays pruning of the reported epic's raw store on report only. Every write point (ptp-run-at-model's spawn boundary, the read-only codex exec reviewer call sites, the ptp-full-apply fan-out launcher, and the spawned apply/review agents) REFERENCES this skill and never restates the record shape, the run_id rule, the mapping tables, or the gate ordering.
---

# ptp-telemetry — the ptp run ledger contract

## Purpose

ptp runs the same pipeline across many agents and CLIs but has emitted no durable timing data.
This skill is the **single source of truth** for the *attribution spine* that fixes that: a per-epic,
append-only **run ledger** plus a flat CSV view, gated by a `telemetry.mode` that defaults to `off`.

The single-source-of-truth posture is the same one `ptp-codex-mode` holds for the canonical `codex
exec` flag-append rule and `ptp-branch-guard` holds for branch safety. Every consumer — the write
points in `skills/ptp-run-at-model/SKILL.md`, `skills/ptp-codex-mode/SKILL.md`,
`skills/ptp-full-apply/SKILL.md`, `workflows/ptp-full-apply.js`, `agents/ptp-apply.md`,
`agents/ptp-review.md`, and `commands/telemetry.md` — **references** this skill. None of them restates
the record shape, the `run_id` rule, the CSV rules, or the gate ordering.

**Two layers, one skill.** §§1–8 are the **run ledger** — the attribution spine, which contains no
OpenTelemetry at all. §§9–15 are the **span layer** added by `0032_02_otel-sink-and-csv`: a loopback
OTLP receiver, the 26-column `spans.csv` it dual-writes, the join that gives a span an epic, the
global `export` that re-derives every CSV from the raw store, and the `setup` / `start` / `stop`
lifecycle around it. The span layer **consumes** the ledger and never redefines it.

---

## 1. Config resolution

Four keys under a `telemetry` parent — `mode` and `root` (every layer of this skill), `port` (the
span layer only), and `retentionDays` (the report layer only) — read from the same two layered
files, in the same order and with
the same **forgiving reader posture**, as `codex.mode` (see `skills/ptp-codex-mode/SKILL.md`) — global
`~/.claude/ptp/config.json` first, then project `<repo>/.claude/ptp/config.json` overriding
**key-by-key**:

```
mode = "off"                                 # default
for path in [ ~/.claude/ptp/config.json,     # global first
              <repo>/.claude/ptp/config.json ]:   # then project (overrides)
    if file exists and parses as JSON and obj.telemetry?.mode ∈ {off, on}:
        mode = obj.telemetry.mode
# any missing file / missing key / parse error / out-of-enum value → leave the prior value
# (ultimately "off" if nothing valid is found) — never throw, never STOP
```

```
root = "openspec/telemetry"                  # default
for path in [ ~/.claude/ptp/config.json,     # global first
              <repo>/.claude/ptp/config.json ]:   # then project (overrides)
    if file exists and parses as JSON and obj.telemetry?.root is a VALID root (see §1.1):
        root = obj.telemetry.root
# any missing file / missing key / parse error / wrong type / invalid root → leave the prior value
# (ultimately "openspec/telemetry" if nothing valid is found) — never throw, never STOP
```

```
port = 4318                                  # default
for path in [ ~/.claude/ptp/config.json,     # global first
              <repo>/.claude/ptp/config.json ]:   # then project (overrides)
    if file exists and parses as JSON and obj.telemetry?.port is an INTEGER in 1..65535:
        port = obj.telemetry.port
# any missing file / missing key / parse error / non-integer / out of TCP range → leave the prior
# value (ultimately 4318 if nothing valid is found) — never throw, never STOP
```

```
retentionDays = 30                           # default
for path in [ ~/.claude/ptp/config.json,     # global first
              <repo>/.claude/ptp/config.json ]:   # then project (overrides)
    if file exists and parses as JSON and obj.telemetry?.retentionDays is a POSITIVE INTEGER:
        retentionDays = obj.telemetry.retentionDays
# any missing file / missing key / parse error / non-integer / ZERO / negative → leave the prior
# value (ultimately 30 if nothing valid is found) — never throw, never STOP
```

`telemetry.retentionDays` is read by the **report layer only** (§21); no write point consults it.
**Zero is named explicitly** in the invalid set rather than lumped under "not a positive integer":
`/ptp:config` rejects it at write time, so it can only arrive by a hand edit, and reading it
literally would mean *"retain nothing"* — the most destructive possible interpretation of a value the
editor refuses to write. Its layering is the same as the other three keys: an invalid layer is
*ignored*, so a valid global `retentionDays` survives an invalid project one, and `30` applies only
when **no** layer supplied a valid value.

`telemetry.port` is read by the span layer only (§§9–15); the ledger layer never binds a port. Its
posture is **layered exactly like the mode and the root**: an invalid layer is *ignored*, leaving
whatever an earlier layer validly resolved, and `4318` applies only when **no** layer supplied a
valid value — so a valid global port survives an invalid project one.

**Reader posture: never crash, never STOP over a config typo.** A missing file, a missing key,
unparseable JSON, a wrong-typed value, or an out-of-enum value all leave whatever the prior layer
validly resolved. **A later layer's invalid value never clears an earlier layer's valid value**: a
valid global `telemetry.mode: "on"` survives a project layer whose `telemetry` block is malformed or
out of enum, and `off` is the result only when **no** layer validly set a value.

(Contrast `ptp-config`, the *writer*, which is strict — it rejects and re-prompts an invalid value
rather than writing it. Reader forgives, writer protects; do not align one to the other.)

### 1.1 `telemetry.root` validation

A `telemetry.root` value is **valid** only when it is:

- a **non-empty** string, and
- a **repository-relative** path, and
- a path that resolves **strictly below** the repository root.

Rejected, therefore, are:

- **absolute paths** (`/var/telemetry`, `C:\telemetry`, `\\server\share`, and any drive- or
  UNC-rooted form);
- **any value containing a `..` segment** (`../telemetry`, `openspec/../..`, `a/../../b`);
- **any value resolving to the repository root itself** — the empty string `""`, `.`, `./`, and `/`.

Rejection follows §1's layered posture rather than jumping to the default: an invalid value in a
layer is **ignored**, leaving whatever value the prior layer validly resolved, and
`openspec/telemetry` applies only when **no** layer supplied a valid one. A valid global root
therefore survives an invalid project root.

Both rejection classes are load-bearing:

1. A typo must never cause a write **outside the repository**.
2. A **root-resolving** value would point the store at the repository root, where the store's own
   create-if-absent `.gitignore` / `.gitattributes` (§2.1) would collide with — and could overwrite —
   the repository's own git-policy files.

---

## 2. Store layout

Under `<telemetry.root>/<epic>/`, where `<epic>` is the four-digit **epic** segment of the change id
as defined in `skills/ptp-change-selector/SKILL.md` §1:

```
openspec/telemetry/
├── .gitignore          # writer-maintained managed lines (§2.1): ignores *.ndjson and the two
│                       # secrets/pidfile, keeps *.csv
├── .gitattributes      # writer-created, create-if-absent: `*.csv -text`
├── 0032/
│   ├── runs.ndjson     # append-only run ledger, one JSON object per line
│   └── runs.csv        # dual-written flat view of the same rows
└── _unattributed/      # runs whose epic could not be resolved (same two files)
```

**The directory key is the epic, never the change id.** Every story in an epic accumulates into the
same two files, and a per-change breakdown is a *grouping over the `change_id` field*, not a separate
path.

**Archive-stability rationale (why the store is not inside the change folder).** `/ptp:archive`
**moves** `openspec/changes/<id>/` to `openspec/changes/archive/YYYY-MM-DD-<id>/`. Telemetry held
inside a change folder would therefore be relocated and date-prefixed the moment its first story
archived, splitting an epic's timing history across the active and archived trees — exactly what
"accumulate all of an epic's timing data in one place" forbids. The store is a top-level sibling of
`openspec/changes/` for that reason.

Directories are created **lazily on first write**. Rows whose epic cannot be resolved go to
`<telemetry.root>/_unattributed/` rather than being dropped or guessed.

### 2.1 The store carries its own git policy

On **every** gated write into `<telemetry.root>/` — not only on the write that happens to create the
root — the writer also reconciles the store's two policy files:

| File | Rule | Content | Why |
|---|---|---|---|
| `<telemetry.root>/.gitignore` | **Managed-line reconciliation** — add only the missing managed lines, preserve every other line | the managed set enumerated in §9.3 (`*.ndjson`, `.ptp-telemetry-credential`, `.ptp-otel-sink.pid`, `!*.csv`) | The NDJSON is per-machine raw capture that would conflict on every merge; the credential and the pidfile must never be committable; the CSV is the shareable flat view. |
| `<telemetry.root>/.gitattributes` | **Create-if-absent** — an existing file is left untouched | `*.csv -text` | A consumer repo's own `text=auto eol=lf` default would otherwise normalize `runs.csv` to LF in the index. Excel on Windows needs the CRLF endings; **the BOM alone is not sufficient.** |

The two rules are deliberately **different**, and §9.3 is the single place the managed set is
enumerated. Create-if-absent would be wrong for `.gitignore`: a store created before the credential
and the pidfile existed already **has** that file without their rules, so an "only if absent" writer
would never upgrade it and the credential would stay committable forever. `.gitattributes` carries no
such evolving set, so it stays create-if-absent — an existing one is never appended to, rewritten, or
merged. Both operations are **idempotent**: a file that already carries every managed line is left
byte-unchanged.

**Why every gated write, not just the creating write.** Scoping the creation to the write that
happens to create the root would leave a pre-existing root, a root a user made by hand, a customized
`telemetry.root`, or a root whose policy files were deleted permanently without a policy. Repeating
the cheap reconciliation makes the policy self-healing.

**Why per-directory rather than a root-level entry in ptp's own repository.** ptp's `.gitignore`
ignores `/openspec/` outright, and the plugin ships only `commands/`, `skills/`, `workflows/`,
`scripts/`, `agents/`, and `.claude-plugin/`. A policy file authored under ptp's own `openspec/`
would be untracked here *and* absent from every consumer repo — the only repos where a store actually
exists. A per-directory `.gitattributes` additionally follows a customized `telemetry.root` for free,
which a fixed root-level entry could not. **This skill never authors a policy file into the ptp
repository's own tree, and never modifies a repository's root `.gitattributes`.** It modifies a
repository's root `.gitignore` in exactly **one** place — `setup`'s confirmed managed-line addition of
`.claude/settings.local.json` (§13.4), required because that file carries the ingestion credential and
must stay untracked. Every other telemetry policy write stays inside `<telemetry.root>/`.

Both operations run inside the **same gated, fire-and-forget path** as any other telemetry write
(§5): nothing is created when `telemetry.mode` is not `on`, and a failure to create either file is
swallowed and never fails the observed ptp command.

---

## 3. The ledger record

**This section is the one and only definition of the record shape.** No other file in `skills/`,
`commands/`, `workflows/`, or `agents/` enumerates these fields; they reference this section.

`<telemetry.root>/<epic>/runs.ndjson` holds one JSON object per line, carrying exactly these
**twelve** fields, in this order:

| # | Field | Type / enum |
|---|---|---|
| 1 | `run_id` | line-safe token (see §3.1) |
| 2 | `epic` | four-digit epic segment, e.g. `0032` |
| 3 | `change_id` | full change id, e.g. `0032_01_agent-telemetry-tracking`; empty for an epic-level or unresolved invocation |
| 4 | `command` | the observed ptp command, e.g. `/ptp:apply` |
| 5 | `phase` | `brainstorm` \| `plan` \| `apply` \| `review` \| `archive` \| `deploy` \| `other` |
| 6 | `agent_role` | `main` \| `subagent` \| `workflow-agent` \| `codex` |
| 7 | `agent_label` | `<work>:<id>` form, e.g. `apply:0032_01` |
| 8 | `cli` | `claude` \| `codex` |
| 9 | `session_id` | ambient Claude Code session id of the **writing** session |
| 10 | `t_start` | ISO-8601 **UTC** with milliseconds, e.g. `2026-07-26T09:14:02.113Z` |
| 11 | `t_end` | same format; **empty** on an open line |
| 12 | `outcome` | written: `completed` \| `refused` \| `needs-human-action` on a close line; **empty** on an open line |

`unclosed` is a **reader-derived** outcome only (§4). **No write point ever writes it.**

**No field may contain a CR or an LF.** The writer strips them, so a record is always exactly one
physical line in both the NDJSON and the CSV.

### 3.1 Field derivation

Every non-timestamp field is **derived, never guessed**. A field the writer genuinely cannot obtain
is written as the **empty string** — never invented, and **never a reason to skip the write**.

**`run_id` — minted once, then propagated.**

- The id is minted **exactly once per run**, at that run's **earliest known boundary**, and is then
  **propagated** to every other writer of that run. A second writer **never re-derives** it.
- The minter is **normally the side that writes the open line**. The **one exception** is the
  `ptp-full-apply` fan-out (§6.3): the workflow *measures* the window but writes no file, so **it**
  mints the id when it captures `t_start` and hands it to both actual writers — the spawned agent (via
  the agent's prompt) and the launching skill (via the returned timing entry).
- **Why propagation, not re-derivation:** two writers bracket the same run at different instants, so
  their independently captured `t_start` values differ; independent derivation would yield **two** ids
  for **one** run and the §4 reconciliation could never collapse them.
- The minting **scheme is free** — a once-minted random nonce propagates exactly as well, because
  *propagation*, not *reproducibility*, is what makes reconciliation work. The **default** scheme is
  the legible join `<agent_label>|<t_start>|<session_id>`, chosen only because it is readable when
  grepping the ledger by hand.
- Whatever the scheme, the id MUST be a **single line-safe token containing no CR, LF, comma, or
  double quote**. A minter that cannot rule out two runs sharing an `agent_label` and a millisecond
  `t_start` appends a **short random suffix**.

**Every other field:**

| Field | Derivation | When unavailable |
|---|---|---|
| `run_id` | Minted **once** at the run's earliest known boundary per the bullets above, then propagated to every writer of that run | **Never unavailable** — a minter always produces one; if an input to the default join is missing, mint a line-safe random nonce instead. A run row is never written without an id, and a second writer never invents one |
| `epic` / `change_id` | The change id resolved per `skills/ptp-change-selector/SKILL.md` §1 | Unresolvable epic → rows go to `_unattributed/`; `change_id` empty for an epic-level or unresolved invocation |
| `command` | The ptp command being observed (e.g. `/ptp:apply`) | Empty string; `phase` then falls to `other` |
| `phase` | The command→phase mapping in §3.2 | `other` — the fallback is never an error |
| `agent_role` / `cli` | The **write-point-keyed table** in §3.3 — no write point invents its own pair | Not applicable: every write point in this change has a table row |
| `agent_label` | `<work>:<id>` form, matching the `label` the workflow passes to `agent()` where one exists (`apply:<id>`, `review:<id>`) | Empty string |
| `session_id` | The ambient Claude Code session id **of the writing session** — including for a Codex window, which is written by the bracketing Claude session and therefore attributed to that session | Empty string only when the writer genuinely has none; never blocks a write |
| `outcome` | The observed unit's terminal state via the mapping table in §3.4 | Empty on an open line; **never empty on a close line** |
| `t_start` / `t_end` | The writer's clock at the run's boundaries, ISO-8601 UTC with milliseconds | `t_end` empty on an open line |

### 3.2 Command → phase mapping

| `phase` | Commands |
|---|---|
| `brainstorm` | `/ptp:brainstorm`, `/ptp:brainstorm-only`, `/ptp:brainstorm-full`, `/ptp:review-brainstorm`, `/ptp:review-brainstorm-full` |
| `plan` | `/ptp:plan`, `/ptp:plan-multiple`, `/ptp:full-plan`, `/ptp:prd`, `/ptp:prd-full`, `/ptp:review-prd*`, `/ptp:review-plan*`, `/ptp:effort`, `/ptp:analyze` |
| `apply` | `/ptp:apply`, `/ptp:full-apply` |
| `review` | `/ptp:review`, `/ptp:review-full`, `/ptp:review-loop`, `/ptp:codex-review*` |
| `archive` | `/ptp:archive`, `/ptp:archive-force` |
| `deploy` | `/ptp:deploy`, `/ptp:deploy-master`, `/ptp:deploy-pr-approved`, `/ptp:merge-to-master`, `/ptp:archive-and-deploy` |
| `other` | everything else — `/ptp:status`, `/ptp:config`, `/ptp:version`, `/ptp:master`, `/ptp:telemetry`, and any command not listed above |

A **multi-phase** command (`/ptp:full`, `/ptp:full-apply`, `/ptp:archive-and-deploy`) is not one row:
each of its ledger runs takes the phase of **the work that run actually covers** — a `ptp-full-apply`
apply agent records `apply`, its review agent records `review`. That is precisely why `phase` sits on
the *run* rather than on the *command*.

### 3.3 Write-point → `agent_role` / `cli` table

| Write point | `agent_role` | `cli` |
|---|---|---|
| `ptp-run-at-model` foreground Claude subagent spawn (`main=claude`) | `subagent` | `claude` |
| `ptp-run-at-model` `main=codex` write-capable shell-out | `main` | `codex` |
| A read-only `codex exec` reviewer call site (`ptp-codex-mode`) | `codex` | `codex` |
| A `ptp-full-apply` measured `agent()` call | `workflow-agent` | `claude` |
| *(reserved)* whole-command outer-session row | `main` | `claude` |

The reserved row is **emitted by no write point in this change**. It is listed so the `agent_role`
enum reads completely and a later slice has a defined shape to fill.

The asymmetry is deliberate: `main=codex` is `agent_role=main` (it is the **main implementer**, not a
reviewer) while a read-only reviewer shell-out is `agent_role=codex`. Collapsing the two would make
"how long does the reviewer take?" unanswerable.

### 3.4 Terminal state → `outcome` table

| Observed unit | Its terminal state | `outcome` |
|---|---|---|
| `ptp-run-at-model` relay | `completed` | `completed` |
| `ptp-run-at-model` relay | `refused` | `refused` |
| `ptp-run-at-model` relay | `needs-human-action` | `needs-human-action` |
| `ptp-full-apply` apply agent | `stageReached: completed` | `completed` |
| `ptp-full-apply` apply agent | `stageReached: blocked` | `needs-human-action` |
| `ptp-full-apply` apply agent | `stageReached: failed` | `refused` |
| `ptp-full-apply` review agent | `terminalState: BOTH_PHASES_DONE` | `completed` |
| `ptp-full-apply` review agent | `terminalState: PHASE1_CAP` / `PHASE2_CAP` | `needs-human-action` |
| Any `ptp-full-apply` agent | `null` / unparseable result | `needs-human-action` |

No case is left unmapped, so **no close line can ever carry an empty `outcome`**.

---

## 4. Append protocol

A run is recorded as **two appended lines sharing one `run_id`**:

1. an **open** line, written **before the observed work begins**, with `t_end` and `outcome` **empty**;
2. a **close** line, written after the work ends, with **both populated**.

**Every write is a single append of one complete line.** No writer ever reads the ledger before
writing to it, and no writer ever modifies or rewrites an existing line.

**Why two lines rather than one.** A run that never closes — a killed session, a crashed agent, an
interrupted `/ptp:apply` — must still leave a trace, and the sessions most worth investigating are
exactly the ones that die. The repair alternative (write one line at open, rewrite it at close)
requires **read-modify-write**, which races under concurrent agents. Two appends paired by `run_id`
give crash visibility *and* keep every write atomic.

**Reader rules.**

- Pair lines by `run_id`.
- Report an open line with **no matching close line** as `outcome=unclosed` — a **reader-derived**
  value no writer ever writes. A close line arriving out of order still pairs correctly by `run_id`.
- **Skip an unparseable line** rather than aborting the read.

**Duplicate reduction (so two writers of one run never become two runs).** All lines sharing a
`run_id` reduce to **exactly one** run. The precedence is defined over **field values**, never over
encounter order, so the result does not depend on where the lines sit in the file:

- the **smallest valid `t_start`** wins;
- among close lines, the one with the **smallest valid `t_end`** contributes **both** its `t_end` and
  its `outcome`;
- ties are broken by the **lexicographically smallest serialized line**, so "earliest" never degrades
  into "whichever was read first";
- a run with **any** close line is **closed**;
- the run counts **once**, never twice, in every count `status` reports.

**Honest concurrency claim.** **No lock is taken.** The guarantee is that **no existing line is lost
or rewritten** — because every write is a single append of one bounded line and no writer performs a
read-modify-write. It is **not** a guarantee that a torn trailing line is impossible; a partially
flushed final line remains possible and is tolerated by the reader, which skips it.

**The two fan-out-only departures from "open before the observed work begins".** Both are confined to
the `ptp-full-apply` path and are **available to no other write point**:

1. **Post-hoc** (§6.3): the full-apply launcher never sees the run while it is running — the workflow
   hands it the measured window only after returning — so it appends **both** lines after the fact,
   carrying the measured `t_start` and `t_end`. The trade-off is that a workflow killed mid-run leaves
   no launcher rows at all.
2. **Best-effort late open** (§6.4): a spawned `ptp:ptp-apply` / `ptp:ptp-review` agent appends its
   crash-visibility open line necessarily **after its own work has started**, because the agent must be
   running before it can write anything.

---

## 5. Gate and failure ordering

Every write point applies this ordering, identically:

1. **Resolve `telemetry.mode`** (§1, forgiving).
2. **If it is not `on` → abandon the telemetry path immediately and let the observed command
   continue unchanged.** "Return" here means returning from *this telemetry write*, never from the
   observed ptp command, skill, or step — telemetry never decides whether observed work runs. No
   directory creation, no file touch, no output, no
   change to any prompt, argument, or command line. (The layered config read is itself a filesystem
   read; it is the only one the off path performs.)
3. **Resolve `telemetry.root`** (§1, §1.1, forgiving and layered exactly like the mode).
4. **Resolve the epic** per `skills/ptp-change-selector/SKILL.md` §1. Unresolvable → `_unattributed/`.
5. **Create directories lazily**, create the store root's `.gitignore` / `.gitattributes` if absent
   (§2.1), then **append the line**.
6. **Any error at any step is swallowed** and the observed ptp command proceeds unchanged.

**Hard rule: telemetry never blocks, never retries in a way that stalls the pipeline, never alters a
terminal state, and is never a precondition of any ptp step.** An observability feature that can fail
a pipeline is worse than no observability feature.

The rule has exactly **two** halves, and they are not the same rule:

- **Telemetry *writes* — every one of them, ledger and span alike — are silent and non-delaying.**
  Any error is swallowed; nothing is emitted; the observed command's output is byte-identical to
  telemetry-off; nothing waits past the write itself.
- **The lifecycle preflight — the §15 auto-start preamble, and nothing else — MAY additionally emit
  at most ONE non-blocking advisory line** for a condition the user can act on (no telemetry
  environment, a port conflict, a failed auto-start) **and MAY consume the single bounded readiness
  window of §15.4**. Terminal state, ordering, and every other output line stay identical to
  telemetry-off.

That second half is the one narrowing `0032_02_otel-sink-and-csv` adds, folded in here rather than
stated as a second, competing rule elsewhere. No artifact may claim byte-identical output in a case
where that advisory is emitted; with `telemetry.mode` not `on` the advisory can never fire, so the
byte-identical claim holds unconditionally there.

**The one permitted variation** is a writer that cannot read the configuration on its own behalf: a
spawned `ptp-full-apply` agent treats **possession of an injected `run_id`** as its **delegated**
mode gate, because the workflow mints and injects one **only** when the launching skill had already
resolved the mode to `on`. An agent handed no `run_id` writes nothing. Steps 3–6 apply to it
unchanged.

---

## 6. Write points

Each write point states the §5 gate and the fire-and-forget rule at its own site, and **references
this skill** for the record shape rather than listing fields.

### 6.1 `skills/ptp-run-at-model/SKILL.md` — the spawn boundary

Open **after** its step 4 (main-agent role resolution — the earliest point at which both `agent_role`
and `cli` are known) and **before** its step 5 (the main run). Close at its step 6 (Relay), the single
funnel both the `main=claude` and `main=codex` branches return through, mapping the three relayed
terminal states straight onto `outcome` per §3.4.

### 6.2 The read-only `codex exec` reviewer call sites (`skills/ptp-codex-mode/SKILL.md`)

The **shelling-out Claude session** brackets the process window with `cli=codex`, `agent_role=codex`.
It already knows the epic, the change id, the command, and the exact window, so Codex attribution is
exact **with zero Codex-side metadata and no change to the `codex exec` command line**.

### 6.3 `workflows/ptp-full-apply.js` and its launcher `skills/ptp-full-apply/SKILL.md`

The workflow sandbox cannot read config and cannot write files, so the gate moves **outside**: the
launcher resolves `telemetry.mode` and passes an explicit top-level boolean in `args`. The workflow
**measures** each `agent()` window, **mints** that run's `run_id` at `t_start`, injects it into the
agent's prompt, and returns it; the launcher — which has `Bash` — appends **one post-hoc ledger run
per measured agent** with `agent_role=workflow-agent`, mapping outcomes per §3.4.

### 6.4 The spawned `ptp:ptp-apply` / `ptp:ptp-review` agents (optional fallback)

An agent given a `run_id` in its prompt MAY append **exactly one open line** under that id — never a
close line, never a CSV row — and never mints an id of its own. Scoping it to the open line keeps the
launcher the **sole** close/CSV writer, so `runs.csv` holds one row per closed run even when a run has
two ledger writers. An agent given no `run_id` writes nothing (§5's delegated gate). The append is
fire-and-forget: any error is swallowed and never alters the agent's own terminal state. Being
optional is harmless — skipping it costs only crash visibility.

---

## 7. CSV dual-write

Whenever a **close** line is appended to `runs.ndjson`, the same record is appended as **one row** to
`<telemetry.root>/<epic>/runs.csv`, in the **same field order** (§3), by the same writer at the same
moment — so the store is spreadsheet-readable with no export step. **An open line gets no CSV row.**

**Format rules, all load-bearing on Windows:**

- **RFC-4180 quoting**, embedded double quotes **doubled**.
- **Embedded line breaks are prevented, not quoted**: no ledger field may contain a CR or LF (the
  writer strips them, §3), so RFC-4180's quoted-newline form never arises and **one record is always
  one physical line**. The fields are ids, enums, and timestamps — nothing free-form — so nothing is
  lost, and the line-per-record invariant every count depends on holds unconditionally.
- **UTF-8 with a BOM**, so Excel on Windows detects the encoding.
- **CRLF** line endings — which is why `<telemetry.root>/.gitattributes` carries `*.csv -text` (§2.1).

**Initialization protocol (the CSV's only non-append write).** The file needs a BOM and one header
row, written **once**, by whichever writer creates it.

A bare **exclusive-create on `runs.csv` is not sufficient**: it prevents a second header, but it
leaves a window in which the losing writer observes a **created-but-still-empty** file and appends its
data row ahead of the BOM and header — yielding a CSV whose **first physical line is data**, which is
exactly what Excel would read as the column names.

So initialization makes the complete header **atomically visible**:

1. The creating writer writes the BOM + header row into a **uniquely named temp file in the same
   directory**.
2. It moves that file into place with a **create-only (no-clobber) rename**, so `runs.csv` is never
   observable in a headerless state.
3. A writer that **loses** that rename **discards its temp file** and proceeds to append its data row
   to the now-complete file.
4. A writer that **finds `runs.csv` already present skips initialization entirely.**

Data rows remain **pure single-line appends**. A reader nonetheless tolerates a stray duplicate header
row by **skipping** it.

**The NDJSON is authoritative; the CSV is a materialized view.** The two appends are **independent**
and both fire-and-forget, so the CSV is **best-effort current, not guaranteed identical** — one can
succeed while the other is swallowed. That is acceptable precisely because a divergence is
rebuildable rather than lost data, and **no ptp behavior depends on the two being in step.**

---

## 8. `status` methodology (read-only)

`/ptp:telemetry status`:

1. Resolves `telemetry.mode` and `telemetry.root` per §1 — **independently of whether a store
   exists**.
2. Reports the **resolved mode** and the **resolved root** (absolute path shown for clarity).
3. If **no store exists**, reports its **absence** — and still reports the independently resolved
   mode alongside it. **An absent store never implies `mode=off`**: a store can legitimately be absent
   with the mode on (nothing has run yet). It **creates nothing**.
4. If a store exists, reports **per epic directory**: the **total**, **closed**, and **unclosed** run
   counts, counting each `run_id` **once** per §4's reduction (a run with any close line is closed;
   an open line with no close line is `unclosed`).
5. Reports `_unattributed/` as **its own bucket alongside the epics**, never folded into an epic and
   never omitted, so its count stays visible as the health signal §5 step 4 routes rows to it for.

**Strictly read-only.** It creates no directory and no file, and runs **no git command, no
`ptp-branch-guard`, and no `openspec validate`**.

**The three states, stated unambiguously:**

| State | Report |
|---|---|
| `telemetry.mode` resolves to `off` | `telemetry.mode = off`, the resolved root, and a note that no telemetry is being recorded. Whether a store exists is still reported from a read-only inspection; nothing is created. |
| Mode `on`, no store | `telemetry.mode = on`, the resolved root, and **"no telemetry store exists at this root"** — no directory or file is created by the report. |
| Mode `on`, one unclosed run | `telemetry.mode = on`, the resolved root, and per-epic counts including `unclosed: 1` **distinguished from** the closed count (e.g. `0032 — total: 4, closed: 3, unclosed: 1`). |

---

# The span layer (`0032_02_otel-sink-and-csv`)

## 9. The OTLP receiver

### 9.1 What ships, where it lives, and what the store gains

The spike recorded in `openspec/changes/0032_02_otel-sink-and-csv/spike/OUTCOME.md` established that
Claude Code emits OTLP as **JSON** (`Content-Type: application/json`), so the shipped receiver is the
bundled Node script **`scripts/ptp-otel-sink.js`**. The documented alternative — an `otelcol-contrib`
file exporter plus a continuously running flatten step — is not what shipped; it stays documented in
the README because the store layout, the ledger join, the column set, and the lifecycle contract are
identical under it.

The receiver runs under `node`, binds **`127.0.0.1` only — never `0.0.0.0`** — on the resolved
`telemetry.port` (§1, default `4318`), and accepts exactly `POST /v1/traces` and `POST /v1/logs`
(plus the identity path of §9.2). Anything else is `404`.

`start` resolves the script from the **installed plugin directory** — the same location
`ptp-workflow-cache-heal`'s glob targets — never from the consuming repository, which does not
contain it. When it cannot be located, report a clear **non-fatal** error and start nothing.

The store the ledger layer defines (§2) gains four things per epic and two in the store root:

```
openspec/telemetry/
├── .gitignore                    # managed-line reconciliation (§9.3)
├── .gitattributes                # create-if-absent: `*.csv -text`
├── .ptp-telemetry-credential     # the per-store ingestion credential (§9.4), gitignored
├── .ptp-otel-sink.pid            # the receiver lockfile (§14.1), gitignored
├── 0032/
│   ├── runs.ndjson  runs.csv     # the ledger layer, untouched
│   ├── raw/20260726.ndjson       # append-only, immutable, receiver-only span store
│   └── spans.csv                 # the 26-column materialized view
└── _unattributed/                # same four files, for records resolving to no run
```

The receiver's own log is **not** in the store — it goes to
`<os temp dir>/ptp-otel-sink-<hash of telemetry.root>.log`, so nothing untracked appears in a
consumer repository beyond the two ignored files above. `status` reports its path.

### 9.2 The identity/health wire contract

Pinned here **once** because the probing side is a prompt contract and the answering side is an
executable, a receiver started by one plugin version can be probed by a later one, and an unanswered
probe is read as "not my sink" — which would start a second receiver or let `export` run past a live
one.

| | |
|---|---|
| Method | `GET` |
| Path | `/ptp-sink/identity` (distinct from `/v1/traces` and `/v1/logs`) |
| Encoding | `application/json`, one object |

Fields, exactly: `ptp_sink` (always `true`), `protocol_version` (`1`), `launch_token`, `repo_root`,
`telemetry_root`, `port`, `pid`, `started_by`, `started_at`, and `healthy`. `healthy` is the field
the collector branch would set `false` on a half-dead pair; the bundled receiver is one process, so
it is `true` whenever the response is produced at all.

Identity/health is this endpoint's **only** role. It accepts no control or regeneration request —
`export` never runs while the receiver is live, so there is nothing to control.

Before answering **any** probe the receiver first repairs its own lockfile (§14.4).

### 9.3 The write path, gate by gate

The order is fixed and complete, because one of these steps creates files:

1. **`telemetry.mode` gate.** Re-resolved from the layered config **before every batch**, not only at
   start. Not `on` → **accept and discard** the batch (`200`), writing nothing: no directory, no
   file, no row. A receiver still listening after the mode is switched off therefore stops filling
   the store instead of continuing.
2. **Port-drift gate.** `telemetry.port` is re-resolved on the **same per-batch schedule**. A
   receiver whose **launch port no longer equals the resolved port** accepts and discards the batch,
   writes nothing, and — the load-bearing part — does **not** run the §14.4 lockfile self-heal. This
   is what makes the raw store's single-writer rule unconditional: delete the lockfile, change the
   port, run a manual `start` (which gates only on the mode), and a second receiver comes up on the
   new port while an exporter still feeds the old one. Without this gate both would write, each
   healing the lockfile over the other's; with it, only the receiver on the configured port writes at
   all.
3. **Credential check** (§9.4). Reached only by a batch that survived **both** gates above.
4. **Body parse.** Steps 1 and 2 are evaluated **before the body is parsed at all**, so a batch
   either one stops is accepted and discarded whatever its body contains; the malformed-body
   rejection of §9.5 applies only to a batch that got past them. Parsing a body already destined for
   the bin is wasted work, and answering a gated-off batch with a non-success status would only make
   the exporter retry something this store will never take.
5. **Store-policy write**, then **the appends** (§9.6, §9.7).

A batch stopped by **any** gate leaves the filesystem untouched — no store directory, no
`.gitignore`, no `.gitattributes` — so a foreign or unauthenticated batch cannot materialize this
store's tree. "Untouched" is scoped to what *that batch* does: files the store already held (the
`.gitignore` and the lockfile `start` itself wrote) stay byte-identical rather than disappearing.

**The store-policy write runs before every gated batch, not only the first**, exactly as §2.1
requires of every gated telemetry writer, and the two files are handled **differently**:

| File | Rule | Content |
|---|---|---|
| `<telemetry.root>/.gitignore` | **Managed-line reconciliation** — add only missing managed lines, preserve every other line | `*.ndjson`, `.ptp-telemetry-credential`, `.ptp-otel-sink.pid`, `!*.csv` |
| `<telemetry.root>/.gitattributes` | **Create-if-absent** — an existing file is left untouched | `*.csv -text` |

Create-if-absent would be wrong for `.gitignore` specifically: a slice-1 store already has that file
without the credential and lockfile rules, so an "only if absent" writer would never upgrade it and
the credential would stay committable forever. Every failure here is swallowed.

### 9.4 The per-store ingestion credential

A single opaque high-entropy token in `<telemetry.root>/.ptp-telemetry-credential`:

- **Created once**, by the first `/ptp:telemetry setup` that finds it absent, and **reused** by every
  later `setup` — so re-running `setup` never invalidates an already-configured session.
- Transmitted as `OTEL_EXPORTER_OTLP_HEADERS` = `x-ptp-store-token=<token>`, and read by the receiver
  from the `x-ptp-store-token` request header.
- Gitignored by the managed line above, written **after** that line exists (§13.4).

The receiver **rejects** (`401`, nothing written — no raw line, no CSV row, no `_unattributed`
record) any batch reaching the write path whose credential is absent or does not match. A store with
**no credential file at all** — reachable by a manual `start` where `setup` was never confirmed —
means "no batch can match", so **every** batch is rejected; a missing credential is never read as "no
check configured, accept everything", which would reopen the exact hole this closes. `status` reports
that state as an actionable verdict naming `setup`.

This is what actually keeps a second repository's spans out: the §14 identity probe stops a second
*sink* from starting, but it cannot stop another repository's already-configured *exporter* from
posting to the port, and those spans would otherwise be indistinguishable from this store's own
unattributed traffic.

**The credential and the lockfile's launch token are separate values with separate lifetimes** and
are independently minted and unequal. The credential is minted at `setup` and outlives every process;
the launch token is minted per start and identifies one process. Lifecycle identity uses **only** the
launch token; ingestion authentication uses **only** the credential. One value cannot serve both — a
token minted at launch cannot already be present in an environment applied at session start.

### 9.5 Malformed bodies

A malformed or truncated body that reached the parse step is rejected with a **non-success** status
and logged to the receiver's own log. It never terminates the listener, and no failure of the
receiver ever alters a ptp command's terminal state, ordering, or output — beyond the one advisory
line §5 permits the lifecycle preflight.

### 9.6 The raw entry envelope

Every line of a `raw/*.ndjson` file is a **typed entry**: an entry-kind discriminator and an entry
schema version as **envelope** fields, with the span/event record nested under its own key. Exactly
these three keys, and no others:

| Key | Value |
|---|---|
| `ptp_entry_kind` | `ptp.span_record` — the **only** kind this change defines |
| `ptp_entry_version` | `1` |
| `record` | the span/event record (§10) |

The envelope's names are deliberately distinct from every record field and the record is **nested**,
because the record's own first column is also called `schema_version` and the two versions move
independently — the envelope's on a new entry kind, the record's on a breaking column change. A flat
object would let one silently overwrite the other, undetectably from the store afterwards.

A reader **skips an entry whose kind it does not recognize**. The discriminator is forward
compatibility, **not** licence to write a second entry about a record already stored: the raw store
is append-only, immutable, and single-writer (§12.1).

### 9.7 The two appends

For each flattened record, in this order, by the same writer at the same moment:

1. **Append the entry** to `<telemetry.root>/<dir>/raw/<YYYYMMDD>.ndjson`, where `<dir>` is the
   resolved epic or `_unattributed`, and `<YYYYMMDD>` is the **UTC calendar date on which the
   receiver ingested the batch** — not the span's `start_ts`, not a local date, so a delayed batch
   and a midnight boundary have one answer.

   **This is the store's calendar-date basis, and it is stated here once.** It is **UTC**, and it is
   the basis **both** the raw-file *writer* (this step) and the raw-file *pruner* (§21) read from —
   neither restates it — so the two can never disagree about what day it is. A pruner computing its
   cutoff on a local date while the writer names files by a UTC one would be off by a day near either
   boundary, in a step whose only effect is irreversible deletion.
2. **Append the record's 26 CSV fields** as one row to `<telemetry.root>/<dir>/spans.csv`.

**The order is fixed — raw first, CSV second.** "The same moment" is not a transaction and the
process can die between them, so the survivable half-write is the one chosen: a **raw-only record is
possible and self-healing** (the next `export` restores its row), while a **CSV-only record must
never arise** (the next `export` would silently delete a row the authoritative store cannot justify).

CSV hygiene is inherited from §7 unchanged — RFC-4180 quoting, UTF-8 **with BOM**, **CRLF** — as is
the **atomic header initialization**: BOM + header row into a uniquely named temp file in the same
directory, moved in with a **create-only** rename; a writer that loses the rename discards its temp
file and appends to the complete file; a reader skips a stray duplicate header. An exclusive-create
alone is not sufficient, because it leaves a window in which another writer appends data ahead of the
BOM and header.

An append to an **existing** raw file **begins on a fresh line**, emitting a leading newline when the
file does not already end with one. Without that, the next good record is concatenated onto a torn
fragment and lost with it — one lost record silently becoming two.

---

## 10. The span record, the CSV schema, and the two mapping tables

### 10.1 The 26 columns

`spans.csv` carries exactly these columns, in exactly this order:

`schema_version`, `epic`, `change_id`, `command`, `phase`, `agent_role`, `agent_label`, `cli`,
`run_id`, `session_id`, `trace_id`, `span_id`, `parent_span_id`, `span_kind`, `tool_name`,
`tool_class`, `model`, `start_ts`, `end_ts`, `duration_ms`, `success`, `error`, `input_tokens`,
`output_tokens`, `cost_usd`, `notes`.

The column set is **additive-only within a `schema_version`**, which is column 1 so a reader can
detect a column-set change; `export` is how an existing store is brought to a new column set.
`trace_id` / `span_id` / `parent_span_id` carry the **containment** structure of a run. They feed the
report layer's secondary nested-chain diagnostic (§17.5) — **not** a critical path: the rows record
which span happened inside which, never which sibling had to wait for which, so a dependency analysis
is not derivable from them (§17.2 states why at length).

### 10.2 Value encodings

Fixed here rather than left to the implementer, because a reader that guesses them mis-aggregates
silently:

- `schema_version` starts at **`1`**.
- `success` is the literal `true` or `false`, and **empty** only when the source carries no status.
- `error` is the source message with CR and LF stripped; **empty** when there is none.
- Timestamps are **ISO-8601 UTC with milliseconds**; `duration_ms` is an **integer when populated**
  and **empty** — never a fabricated zero — when the record has no usable duration.
- A source with **no usable start or end timestamp** is written with `start_ts`, `end_ts`, and
  `duration_ms` all empty and `missing-timestamp` in `notes` — never with an invented time.
- `input_tokens`, `output_tokens`, `cost_usd` are populated for LLM rows (`span_kind` ∈
  {`llm_request`, `api_request`}) and left **empty, not zero**, for every other row.
- `notes` is a `;`-separated list of the tokens §11 defines. No field may contain a CR or an LF.

### 10.3 `span_kind` — a closed set

The source name is taken as-is, its `claude_code.` prefix stripped, and matched against the closed
set `llm_request`, `tool`, `tool.execution`, `interaction`, `api_request`, `tool_result`. **Any other
name maps to `other`**, and its raw name is preserved in the raw NDJSON (§10.5) rather than the record
being dropped.

The spike found this build of Claude Code emitting **no spans at all** — LLM and tool timing arrive as
`/v1/logs` events named `claude_code.api_request` and `claude_code.tool_result`, both already members
of the set, with every other event (`user_prompt`, `tool_decision`, `assistant_response`, hook,
plugin, and MCP events) landing in `other`.

**The Codex half of the mapping** (`0032_06_codex-telemetry`, from the catalogue
`0032_05_codex-telemetry-scope-spike`'s decision record recorded in §7a/§7b). It is applied **only** to
a record whose persisted `service_name` (§10.5) is `codex_exec`, and to nothing else — the catalogue maps
**kinds of Codex work** and is **never origin evidence**, so it is consulted only after the record-level
discriminator has already said the record is Codex's. A Claude record whose span happened to be named
`shell_command` keeps the baseline mapping above.

| Codex source name | `span_kind` | Why |
|---|---|---|
| `codex.sse_event` (log) | `llm_request` | carries `input_token_count` / `output_token_count` with `event.kind = response.completed` |
| `codex.tool_result` (log) | `tool_result` | carries `tool_name`, `call_id`, `duration_ms`, `success` |
| `codex.tool_decision` (log) | `tool` | carries `tool_name`, `decision`, `call_id` |
| `codex.api_request` (log) | `other` | **deliberately not LLM** — its `endpoint` is `/models`, an HTTP metadata/auth call. Mapping it to an LLM kind is the one entry that would inflate LLM time with non-LLM work |
| `session_task.turn` (span) | `llm_request` | the turn aggregate: `codex.turn.token_usage.*` plus `model` |
| `shell_command` (span) | `tool` | `tool_name = shell_command`, `call_id`, `aborted` |
| `handle_responses` (span) | **per record** | **mixed per instance** — some instances carry `gen_ai.usage.*` and some carry `tool_name`, so the name carries no single class. It resolves to `llm_request` when the record carries any token attribute, `tool` when it carries a non-empty `tool_name`, and `other` otherwise. This is the one rule that keys off attributes rather than the name |
| every other Codex name | `other` | the record's stated rule: a name carrying no `model`, `tool_name`, or token attribute is `other`. The raw name is retained per §10.5 |

An uncovered Codex name mapping to `other` is the baseline's own unknown-name rule and the decision
record's **advisory A-2** mapping gap — a recorded gap escalated to a separately authorized change, never
a reason to stop and never a reason to drop the record. Crucially, a group the record-level discriminator
did **not** identify stays in `_unattributed/` and yields **no** `cli=codex` row of kind `other`, however
well its names match this table.

### 10.4 OTel source → column mapping

The single table both the receiver and `export` derive from (§10.7), written from the attribute shapes
the spike observed:

| Column | Source |
|---|---|
| `session_id` | attribute `session.id`, else `session_id` |
| `trace_id` / `span_id` / `parent_span_id` | the span's own ids; a log record's `traceId` / `spanId` where present, empty where not (`parent_span_id` is always empty for a log record) |
| `span_kind` | the span name, or a log record's `body.stringValue`, else `claude_code.` + `event.name` — mapped per §10.3 |
| `tool_name` | attribute `tool_name`, else `tool.name` |
| `model` | attribute `model`, else `gen_ai.request.model`, else `gen_ai.response.model` |
| `input_tokens` / `output_tokens` | attributes `input_tokens` / `output_tokens` (or their `gen_ai.usage.*` forms), LLM rows only |
| `cost_usd` | attribute `cost_usd`, LLM rows only |
| `success` | attribute `success` (`true`/`false`, string or boolean); else the span status (`OK` → `true`, `ERROR` → `false`); else empty |
| `error` | attribute `error`, `error.message`, or `exception.message`; else the span status message |
| `start_ts` / `end_ts` / `duration_ms` | the timestamp rule below |
| the Bash command text (raw-only) | attribute `command`, else `tool.command`, `tool_input.command`, `bash.command` |

**The Codex source paths**, appended to the rows above rather than replacing them, so a record carrying
both keeps the baseline answer. Availability was recorded **per column** by the decision record (§7c),
and is honored per column here — token counts are obtainable and cost is not, and the three are never
treated as jointly available:

| Column | Codex source appended | Availability |
|---|---|---|
| `input_tokens` | …then `codex.turn.token_usage.input_tokens`, then log `input_token_count` | **available** |
| `output_tokens` | …then `codex.turn.token_usage.output_tokens`, then log `output_token_count` | **available** |
| `cost_usd` | — nothing appended | **UNAVAILABLE.** An exhaustive key sweep over every captured Codex span and log record found no cost-bearing key: Codex emits token counts and no cost. This is the decision record's **advisory A-3** — the column is left empty on Codex LLM rows, named as an escalated gap here and in the README, with **no** field added and **no** silent Codex exception to the LLM-row rule |
| `model` | already covered by the baseline `model` key | **available** (observed `gpt-5.6-sol`) |
| `tool_name` | already covered by the baseline `tool_name` key | **available** (observed `shell_command`) |
| `tool_class` | — nothing appended | **derives `other` for every Codex record** (**advisory A-4**): Codex's command text sits in an `arguments` attribute the baseline neither reads nor retains outside `tool_name === 'Bash'` |

**The timestamp rule**, in this order:

1. A source supplying **both** a start and an end (a span): those are `start_ts` / `end_ts`, and
   `duration_ms` is their difference.
2. A source supplying **one** timestamp **that is an end** (a log event — the event is emitted when
   the thing it describes **finished**): that timestamp is `end_ts`. When the source carries a
   numeric `duration_ms` attribute, `start_ts` = `end_ts` − `duration_ms`; when it does not, the
   event is instantaneous — `start_ts` = `end_ts` and `duration_ms` is **empty**.
2a. A source supplying **one** timestamp **that is a start** (a span with a start but no end — an
   unfinished span): that timestamp stays `start_ts`, and it is **never** relabelled as an end. With
   a numeric `duration_ms` attribute `end_ts` = `start_ts` + `duration_ms`; without one, `end_ts`
   and `duration_ms` are **empty**. The distinction is which end of the interval the source supplies,
   not how many timestamps it carries: forcing an unfinished span's start into `end_ts` would invent
   a completion that never happened.
3. Neither: all three empty, `missing-timestamp` in `notes`.

`duration_ms` arrives as a string on some events and an integer on others; it is coerced
numerically, never by type.

### 10.5 The raw record is a superset — by exactly three fields

A raw entry's `record` carries the 26 projected fields **plus** a closed set of raw-only fields: the
derivation inputs the CSV has no column for, and the emitting CLI's own `service.name` observation —
which derives no projected column at all and is kept for a later consumer to route on. There is **no
second copy of `tool_name`** — the projected column *is* the value as received — so the extra fields are
exactly **three**:

| Extra field | Value |
|---|---|
| `bash_command` | the retained `Bash` command as `{ text, truncated }` — one field, not two — or `null` when the row is not a `Bash` row |
| `raw_span_name` | the raw source name, **only** when it mapped to `span_kind=other`; empty otherwise |
| `service_name` | the OTel **resource** attribute `service.name` as received — the emitter's own identifier (`claude-code` from Claude Code, `codex_exec` from Codex) — read from the resource scope so a record-level attribute of the same name cannot shadow it, carried through only the same CR/LF-stripping coercion every other field gets (§10.2) and otherwise uninterpreted, and empty when the resource supplies none |

`service_name` is persisted for **every** record, whatever the emitter — it is a value to compare, not a
Codex marker to test for presence. It is a routing **input** and deliberately has **no CSV column**: the
CSV stays exactly the 26 documented columns. Every record written from now on carries the key, empty when
the resource supplies no value; raw lines written **before** this field existed carry no such key at all
and are never rewritten, so a reader SHALL treat an **absent** `service_name` as equivalent to an empty
one and SHALL NOT use key presence as the test for whether a record carries a discriminator.

**The retained command text, exactly:** the command as received with CR and LF replaced by single
spaces (keeping the entry one physical line), truncated to **512 characters**, with truncation
flagged inside that same field. Classification examines **only** that retained, normalized text —
never the untruncated original — so the receiver and every later `export` derive the same bucket from
the same bytes. A stated number matters: two writers with different limits would bucket the same
command differently.

That superset is what makes the raw store authoritative rather than a duplicate of the CSV, and it is
what lets `export` reclassify without re-collecting a single span.

### 10.6 `tool_class` — the mapping table

The bucket set is `search`, `read`, `write`, `build_test`, `git`, `agent`, `other`.

| Bucket | Rule |
|---|---|
| `search` | tool `Grep`, `Glob` |
| `read` | tool `Read` |
| `write` | tool `Write`, `Edit`, `NotebookEdit` |
| `agent` | tool `Agent`, `Workflow`, `Skill` |
| `git` | `Bash` whose command matches the git pattern — **first** of the `Bash` rules |
| `build_test` | `Bash` matching the build/test pattern — **second** |
| `search` | `Bash` matching the search pattern — **third** |
| `other` | everything else, including a tool name outside this table and a row with no command text |

`tool_class` is **empty** when `tool_name` is empty (the row is not a tool row at all).

**The `Bash` sub-rules are ordered — `git`, then `build_test`, then `search`, then `other` — and the
order is the rule**, because one command can match several (`git grep`, `npm test -- --grep`). Only a
stated order makes the bucket reproducible on a later `export`.

**The patterns, written out rather than described.** The retained text is split on `&&`, `||`, `|`,
and `;`, and the **first token of each segment** is taken, its directory and any `.exe` / `.cmd` /
`.bat` / `.ps1` suffix stripped, lowercased. That is what makes `cd repo && npm test` a `build_test`
row rather than a `cd` row. Then, in order:

- **git** — any segment head is `git`.
- **build_test** — any segment head is one of: `npm`, `pnpm`, `yarn`, `bun`, `npx`, `jest`, `vitest`,
  `mocha`, `ava`, `tsc`, `tsx`, `pytest`, `tox`, `nox`, `unittest`, `go`, `cargo`, `mvn`, `gradle`,
  `gradlew`, `dotnet`, `make`, `cmake`, `ninja`, `msbuild`, `rake`, `rspec`, `ctest`, `eslint`,
  `prettier`, `ruff`, `mypy`, `pylint`, `flake8`, `phpunit`, `bazel`, `meson`.
- **search** — any segment head is one of: `rg`, `grep`, `egrep`, `fgrep`, `ag`, `ack`, `find`, `fd`,
  `locate`, `ls`, `dir`, `tree`, `which`, `where`, `awk`, `sed`.
- **other** — everything else.

The `Bash` **search** row is not optional: agents search through `Bash rg` at least as often as
through `Grep`, and routing that time to `other` would understate exactly the bucket this column
exists to measure.

**The derivation is heuristic, and it is stated as heuristic.** What makes that acceptable is that
both classification inputs survive in the **raw NDJSON record** — `tool_name` as the projected column
and the Bash command text as `bash_command` — so a wrong bucket is *re-derivable* by `export`, not
baked in.

### 10.7 Single-source rule for both tables

The tables in §10.4 and §10.6 are defined **here and nowhere else** in the shipped plugin surface
(`skills/`, `commands/`, `workflows/`, `scripts/`, `README.md`). What that means for an executable,
since a Node process cannot read rules out of Markdown at runtime:

- **This skill is normative.** `scripts/ptp-otel-sink.js` carries **exactly one** executable
  implementation of each table.
- **`export` calls that same implementation** rather than reimplementing either table, which is what
  guarantees a reclassification produces the buckets the receiver produced.
- What is forbidden is a **second operative statement** of the rules — one an agent or a process would
  act on — not their expression in code. The OpenSpec proposal, design, tasks, and spec deltas
  necessarily state them in order to mandate them; that is the specification, not a second copy.
- **Changing a table here and changing the executable copy is one change, never two.**

---

## 11. The ledger join

### 11.1 The ledger set the join reads

A span carries no epic — the epic is the join's *output* — so the join cannot select its input by
epic. It scans `<telemetry.root>/` and reads **every** `<epic>/runs.ndjson` **plus**
`_unattributed/runs.ndjson` (where the ledger layer records runs with no resolvable epic), pairs open
and close lines by `run_id` per §4, and builds one combined set of `(session_id, t_start, t_end)`
windows, each carrying the epic of the ledger it came from. A run read from `_unattributed/` carries
an empty epic — so a span resolving to it still gains `command`, `phase`, `agent_label`, and `run_id`
and is written under `_unattributed/`.

The parsed set is **cached** and refreshed when a ledger changes. The cache is invalidated by changes
to the **set's membership**, not only to files already in it:

- **Re-scan for ledgers appearing or disappearing**, not merely for edits to known ones. The auto-start
  preamble runs **before** the ledger open, so on the first command of a **new** epic the receiver can
  cache the set before that epic's `runs.ndjson` exists; a per-known-file check could never notice it.
- **Re-scan once before committing any record to `_unattributed/`.** An attribution miss is both the
  signal that the set may be stale and the cheapest possible trigger, because it fires only on the
  miss.

### 11.2 The window rules

For each span, the run whose `session_id` matches and whose window contains the span's `start_ts`
supplies `epic`, `change_id`, `command`, `phase`, `agent_role`, `agent_label`, `cli`, and `run_id`.

A run with an **open line and no close line** is treated as extending to the present, so mid-run
spans attribute immediately rather than waiting for the close.

### 11.3 Grouping — every trace, not only ambiguous spans

**Every record carrying a usable `trace_id` is resolved as part of its group, once**, and every
record in the group gets the same answer. Ambiguity-triggered grouping cannot enforce the never-split
rule in the case that matters most: a trace whose first span sits unambiguously in run A and whose
second sits unambiguously in run B contains no ambiguous span, so the rule would never fire and the
trace would be split — the exact outcome forbidden.

A record with **no usable `trace_id`** — which `/v1/logs` events legitimately lack — forms its **own
singleton group**. Grouping them all under the empty key would fuse unrelated events into an invented
trace.

**The rule, whose step order is itself the rule:**

1. **Narrow** the candidates to the same-session runs whose window contains **every** span in the
   group.
2. **Empty set** → the whole trace goes to `_unattributed/`, with `notes` carrying
   `unattributed:no-containing-window` and `near-miss=<ids>` — defined, not hand-waved: **the
   same-session runs whose window contains at least one span in the group, in ascending lexicographic
   `run_id` order**, joined by `|`. In this branch "the candidates" names a set that is empty by
   construction, so the near-miss set is what a human debugging the miss actually needs, and the fixed
   ordering is what makes a later `export` reproduce the value.
3. **Otherwise** the candidate with the **latest `t_start`** wins — the innermost fully-enclosing
   window — tiebroken by the **lexicographically smallest `run_id`**. More than one candidate also
   records `ambiguous-window` and `candidates=<ids>` in `notes`.

Selecting from windows containing merely the *earliest* span and checking containment afterwards
inverts this and can pick a narrow window holding the first span but not the rest — violating the
never-attribute-outside-the-window invariant in exactly the straddling case the rule exists for.

**A record with no usable `start_ts`** is **excluded from the candidate-narrowing test** and inherits
whatever its group resolves to: it neither constrains nor widens the group. No window contains a
missing timestamp, so without this rule one timestamp-less span would drag its whole trace into
`_unattributed/`. When **every** record in a group lacks one there is nothing to join on: the group
goes to `_unattributed/` with `unattributed:no-usable-timestamp` in `notes`, never attached to a run
on `session_id` alone.

**Scope at ingest is the batch being processed.** A trace can be split across OTLP batches, and the
receiver must not buffer waiting for completion or the CSV goes stale mid-run. Authoritative
whole-trace reconciliation is deferred to `export`, which is global by definition and therefore sees
the entire raw store; a later batch contradicting an ingest-time grouping is corrected by the next
`export`, never by rewriting an appended row.

This is the `[RISK-A]` mitigation for a future concurrent `ptp-full-apply`; today's loop is strictly
sequential, so ambiguity should not arise at all.

### 11.4 Never dropped, never guessed

A record matching no window is written under `<telemetry.root>/_unattributed/` with the reason in
`notes`. **No span is ever dropped, and a span with a usable `start_ts` is never attributed to a run
whose window does not contain it.** The realistic causes are a non-ptp prompt in the same session, a
span arriving before its run's **open** line was visible, and a ledger whose trailing line was torn at
the moment of the join. **A merely-still-open run is not one of them** — §11.2 already attributes
those.

The join rules are **identical at ingest and in `export`**, so a re-derivation reproduces the
placement.

---

## 12. `export`

### 12.1 The raw store's mutability contract — first, because everything rests on it

`<telemetry.root>/<epic>/raw/` and `<telemetry.root>/_unattributed/raw/` are **append-only,
immutable, and single-writer**: the receiver is the only writer and only ever appends. **No command in
this change modifies, rewrites, moves between directories, or deletes a stored entry, and no command —
`export` explicitly included — appends a re-derived copy, a supersession marker, or any second
representation of a record already stored.**

The consequence, stated so the machinery is not reintroduced later: because the writer never writes a
second entry about a record it has already stored, this change defines **no** minted `record_id`,
**no** supersession marker kind, **no** deduplication pass, and **no** last-entry-wins resolution rule.

**"One entry per record" binds the *writer*; it is not an exactly-once delivery guarantee.** OTLP
delivery is **at-least-once** — an exporter retries a batch whose response was lost — so the same span
may arrive twice and is appended twice. The two entries are **not** byte-identical: the retry is
ingested later, so it can land in a different UTC day file and carry different attribution and `notes`
as the ledger advances. `export` preserves the **multiplicity** — a row for each, never collapsed —
while re-deriving each independently, so "verbatim" applies only to the raw lines `export` never
touches. Determinism is unaffected regardless, because it is a property of exporting the **same store**
twice and §12.3's total ordering orders non-identical rows just as stably.

*Capability note, not a requirement on anything:* a consumer that must not double-count can
deduplicate on the **source-supplied** `(trace_id, span_id)` pair already in the record, **only where
both values are non-empty**. `/v1/logs` events may carry neither, and collapsing on an empty pair
would fuse unrelated events, so **duplicate id-less events are not reliably deduplicable in this
change** — an accepted, documented limit rather than something solved, since solving it needs the
record identity forbidden above. Those ids come from the emitter, so this is **not** a minted
`record_id` and licenses no dedup pass anywhere.

### 12.2 One command, no flag, no selector

`/ptp:telemetry export` takes **no flag and no argument**. Every invocation is a **global,
deterministic re-derivation**. `export --rebuild` and `export <selector>` are **rejected** with a
message saying `export` is global and takes no arguments; no CSV is modified.

**Why global, so nobody "fixes" it later:** re-derivation rewrites the **shared**
`_unattributed/spans.csv`, and rewriting a shared file correctly requires reading every epic's raw
store and every ledger. A scoped re-derivation would omit records placed there from an excluded epic
and reintroduce records an unread excluded ledger would have resolved — both breaking the complete
partition. Corollary: because there is no scoped form and no attribution-preserving form, the "a
scoped projection re-emits stale attribution" hazard has no surface on which to appear.

**Inputs:** every epic's `raw/*.ndjson`, `_unattributed/raw/`, every epic's `runs.ndjson`, **and**
`_unattributed/runs.ndjson`. **Outputs:** every epic's `spans.csv` **plus** `_unattributed/spans.csv`,
written as a **complete partition of every input record after re-derivation, judged by where it now
resolves and not by which raw directory it came from** — a record read from `_unattributed/raw/` that
now resolves lands in its epic's CSV; a record read from an epic's `raw/` that reconciliation now
attributes to no run lands in `_unattributed/spans.csv`.

**Re-attribution is a CSV-level outcome only.** Raw lines never move, are never duplicated, and are
never marked; only the CSV placement changes. There is deliberately **no** form that preserves stored
attribution — an eagerly written row carries the ingest-time view, and reconciling that view is the
whole purpose of the command.

### 12.3 Determinism

Rows are ordered by a **total** ordering, never filesystem enumeration order: `start_ts`, then
`span_id`, then `trace_id`, then the serialized row compared lexicographically, with **empty values
ordering before non-empty**, under one comparison rule. `start_ts` may legitimately be empty and two
records can share both `start_ts` and `span_id`, so a partial ordering would break byte-identity
*silently* — exactly the class of bug the byte-identity criterion exists to catch.

"An unchanged store" needs no qualification: `export` writes nothing into `raw/`, so a second run
reads byte-for-byte what the first one read.

Each output is written to a **uniquely named temporary file in the same directory** and moved into
place with **one replace-if-exists rename**, so a crash mid-write leaves the previous complete file
and any reader sees a complete file at every moment.

Directory order is compared on the **directory key alone**. This is stated rather than left to a
default sort, because the natural way to write it — sorting the `(directory, rows)` pairs themselves —
compares their string renderings, which both grows the sort key with the size of the store and orders
`0032 b` ahead of `0032`. The order decides the `outputs` report and the rename sequence, so it is
part of the contract.

`export` performs the **§2.1 store-policy write** before it stages anything. It is a writer into
`<telemetry.root>/` — it creates the epic directory a reattribution now needs, it always writes
`_unattributed/spans.csv`, and it replaces every existing one — so §2.1's self-healing for "a root
whose policy files were deleted" has to reach the one command whose entire output is CSV files:
without `.gitattributes` these CRLF files are precisely what a consumer repo's `text=auto eol=lf`
normalizes, and §2.1 already records that the BOM alone is not sufficient. It runs after the
read-and-refuse gates, so a refusal still touches nothing, and both halves swallow their own errors,
so it can never turn a successful `export` into a failed one.

### 12.4 Torn lines

The read can land on a torn line — the receiver may have been killed between an entry's two halves.
An incomplete or unparseable **trailing** line is **skipped**; a malformed **interior** line is
**skipped and counted**; an entry whose kind is unrecognized is skipped (§9.6). This is the same
torn-line tolerance the ledger readers already require.

State the consequence honestly rather than "left for the next `export`": the raw store is append-only
and immutable, so **nothing ever completes or repairs a torn entry** and no later `export` recovers
it. It is **unrecoverable telemetry loss**, bounded to the one record in flight when the receiver
died. What stops it spreading is §9.7's fresh-line rule.

### 12.5 It refuses while the receiver is live

Before reading or writing **anything**, `export` runs the identity probe. When a live receiver for
this store answers, it **refuses non-fatally** with **one line naming `/ptp:telemetry stop`**, writes
no `spans.csv` and no temporary file, and **never stops the receiver** — `export` declines, it does
not terminate anything.

**The match rule is deliberately looser than `start`'s.** `start` requires a full identity match
*including the launch token*, which presupposes an intact lockfile. `export` must **not** require the
token, because the row-losing case is a live receiver for *this* store whose lockfile was deleted —
the token cannot match, and a token-strict rule would let `export` proceed and overwrite rows appended
after its read. So `export` refuses whenever the listener identifies itself as a **ptp receiver
reporting this store's `telemetry_root`**, lockfile present or not, token matching or not, and
whatever a `healthy` verdict says. A non-ptp process, or a ptp receiver reporting a different
`telemetry_root`, writes none of these files and does **not** block `export`.

**The ports probed** are the configured `telemetry.port` **and, when the lockfile records a different
port, that port too** — on both the initial check and the pre-rename one. Probing only the configured
port would satisfy the rule's letter while racing precisely the writer §14.4's write-path self-heal
exists to reveal. **Residual limit, recorded rather than claimed away:** a receiver for this store on
a non-configured port **and** with no lockfile is undiscoverable to the lifecycle rules and equally
undiscoverable here.

**The refusal is a check at an instant, not an exclusion held for the run.** A concurrent session can
auto-start a receiver after `export` probed and began reading. That window is bounded two ways:
**every** output CSV is staged to its temporary file first, then the identity probe runs **once, after
all staging and before the first replace-rename**; if a receiver has appeared, `export` **aborts** —
all temporary files deleted, every `spans.csv` untouched, the same `/ptp:telemetry stop` message. The
ordering is load-bearing: probing before *each* rename could only catch a receiver after earlier
outputs were already replaced, making "every `spans.csv` untouched" unkeepable for a multi-file export.

What is left is stated honestly. A receiver appending between the final probe and a rename loses those
rows **from the CSV only** — it appends to `raw/` in the same write path and `export` never writes
there, so the next `export` restores them and **no telemetry is lost**. The partition guarantee is
therefore over **the raw records observed while staging**, not over whatever the store holds when the
rename lands. Closing the remainder would mean a store-scoped writer lock held across the export —
cross-process mutual exclusion that can go stale, plus a crashed-`export`-blocks-the-receiver failure
mode — bought to protect a **regenerable view** whose source of truth the operation never touches.
That trade is not worth making, so it is not made: **no** CSV-writer lock, **no** regeneration control
request on the loopback endpoint, **no** snapshot-versus-live-append ordering rule, and **no**
monotonic-visibility invariant.

**The recovery sequence, with its precondition.** The §15 preamble re-starts the receiver on the next
funnel command, so `stop` → *any funnel command* → `export` is refused again. The documented order is
**`stop` → `export` with no funnel command between them**, and `telemetry.mode=off` first is the way
to guarantee it when that cannot be assured.

### 12.6 Running it

```
node <plugin>/scripts/ptp-otel-sink.js export --repo <repo root>
```

It prints one JSON object: `action` ∈ `exported` | `refused` | `aborted` | `noop` | `failed`, the
outputs and row counts on success, and the `message` to relay verbatim otherwise. Relay the message
and stop; never "fix" a refusal by stopping the receiver.

`failed` is the filesystem outcome, distinct from the two receiver-driven ones: `refused` and
`aborted` both mean a live receiver was found and **nothing** was touched, whereas `failed` means the
store itself could not be written. Its two forms differ in exactly one respect, which the message
states: a **staging** failure leaves every `spans.csv` untouched, while a **publish** failure may have
replaced some of them — each file is complete, some newly derived and some the previous version.
Neither leaves a temporary file behind, and neither touches `raw/`, so re-running `export` after
fixing the permissions fully repairs the store.

---

## 13. `/ptp:telemetry setup` — the one confirm-first setting writer

### 13.1 What it writes, and where

`setup` writes the **local project** settings file **`<repo>/.claude/settings.local.json`** — never
`~/.claude/settings.json` and never the shared `<repo>/.claude/settings.json`. Two independent
properties are required and only that file has both:

- **Per-repository**, because the telemetry store is per-repository and a user-global write would
  enable emission in every repository the user opens.
- **Untracked**, because the block carries the ingestion credential, and the shared project settings
  file is the one a team commits.

Because ignoring a path does not untrack a file git already tracks, `setup` **refuses non-fatally,
writing nothing**, when `.claude/settings.local.json` is already tracked, saying it must be untracked
first. A secret written into a tracked file while claiming it is ignored is a false guarantee.

### 13.2 The block — exactly seven keys

| Key | Value |
|---|---|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | `"1"` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `"http/json"` (the protocol the spike selected) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `"http://127.0.0.1:<resolved telemetry.port>"` |
| `OTEL_BSP_SCHEDULE_DELAY` | `"5000"` |
| `OTEL_EXPORTER_OTLP_HEADERS` | `"x-ptp-store-token=<the per-store credential>"` |
| `OTEL_LOGS_EXPORTER` | `"otlp"` |
| `OTEL_TRACES_EXPORTER` | `"otlp"` |

The delay is present because the ~60 s default **silently discards the tail of a short run**, which
looks like present-but-incomplete data rather than missing data — the worse failure of the two.

**Why seven and not the five the change was planned around.** The two exporter-selection keys were
added on **measured evidence**, recorded in the spike outcome: with only the first five in force,
Claude Code 2.1.220 posts **nothing at all** — `CLAUDE_CODE_ENABLE_TELEMETRY=1` turns collection on,
but the SDK still needs to be told which exporter to use, and its default is not OTLP. A five-key
block would have written a configuration that looks complete, passed every gate, started a receiver,
and recorded zero rows. `OTEL_METRICS_EXPORTER` is deliberately **left unset**: the receiver accepts only
`/v1/traces` and `/v1/logs`, and metrics are out of scope for this layer.

They are exporter *selection*, not telemetry *enablement*, so nothing about the confirm-first posture
changes: still one confirmed write, still only these keys, still every other key preserved.

The credential is read from `<telemetry.root>/.ptp-telemetry-credential`, **reused** when present
and, when absent, generated **provisionally in memory** and persisted only after confirmation
(§13.4).

**The credential's value is never rendered in the diff** — the `OTEL_EXPORTER_OTLP_HEADERS` row shows
`x-ptp-store-token=<…>` with a description of which credential it is (the store's existing one, or a
newly generated one) and a `value_redacted` marker, exactly as `status` reports its match verdict
without printing it (§14.6). What is confirmed is therefore the **key set and the reuse-or-mint
decision**, not a byte string: a provisional credential lives only inside the process that minted it,
so a value printed by `setup-plan` would not be the value `setup-apply` persists. Every other key
shows its literal old and new value.

### 13.3 Merge semantics

Touch **only those seven keys**. Every other `env` key and every key outside `env` is left untouched.
A key already present with a different value is shown **old and new** in the diff and changed only on
confirmation. A **higher-precedence layer that already defines one** is called out rather than
silently shadowed. Refuse — **without overwriting** — a settings file that does not parse as JSON or
whose root is not an object. This is `/ptp:config`'s writer posture, not a second one.

**The endpoint does not track `telemetry.port` afterwards.** Changing the port means re-running
`setup`, whose diff then shows a single line — so "I changed the port and telemetry broke" is
documented rather than discovered.

### 13.4 Confirm-first covers the credential and both `.gitignore` files

Nothing at all is written before explicit confirmation — not the settings file, not the credential,
not either `.gitignore`. After confirmation the order is fixed, so neither secret is ever briefly
tracked:

1. Reconcile the **repository-level `.gitignore`** so it covers `.claude/settings.local.json`;
2. reconcile **`<telemetry.root>/.gitignore`** (the managed lines of §9.3);
3. persist the credential;
4. write `settings.local.json`.

Both reconciliations are shown in the diff. Both are managed-line additions: only missing lines are
added, all other content preserved.

On a confirmed write, `setup` states that **the block takes effect at process start**, so the session
that just ran it must **restart Claude Code** before spans are emitted. That is the same condition the
§15 preamble detects from the live environment.

### 13.5 Running it

```
node <plugin>/scripts/ptp-otel-sink.js setup-plan  --repo <repo root>    # writes NOTHING
node <plugin>/scripts/ptp-otel-sink.js setup-apply --repo <repo root>    # only after confirmation
```

`setup-plan` returns the diff (`env_diff` with `old` / `new` / `shadowed_by_live_env` per key — the
credential row redacted per §13.2 — both reconciliations, and whether the credential already exists).
**Render that diff verbatim, ask for explicit confirmation, and run `setup-apply` only on an
affirmative answer.** Never reconstruct or print the credential value while rendering it. A refusal (`action: refused`) is
relayed verbatim and nothing is run. `setup` is **never** invoked from any automatic path, including
the §15 preamble.

---

## 14. The sink lifecycle

```
        ┌──────────── stop ────────────┐
        ▼                              │
   [not running] ── start ──▶ [listening] ── start ──▶ [listening]  (no-op, reports existing pid)
        ▲                              │
        │                              ├─ process dies ─▶ [stale lockfile]
        └──── start (replaces stale) ──┘
```

### 14.1 `start`

Launches the receiver in the background and writes the lockfile at
**`<telemetry.root>/.ptp-otel-sink.pid`** — in the store root, so it follows a customized
`telemetry.root` instead of drifting from the data it describes — recording: `pid`, `port`,
`started_at`, `started_by` ∈ `manual|auto`, a **launch token** minted at start, the **OS-reported
process start time** and the executable path (so a recorded pid can be told from a later process that
reused it, which is what makes §15.5's cheap cache validation an actual pid-reuse guard), and the
`repo_root` and `telemetry_root` the receiver was started with.

Before it writes that lockfile, `start` performs the store's **managed `.gitignore` reconciliation**
(§9.3's policy). Leaving that to `setup` and to the receiver's gated write does not cover the
manual-start-without-`setup` path this change explicitly supports: with no credential file every batch
is rejected before the policy write is reached, so the store could hold a `.ptp-otel-sink.pid` — pid,
launch token, absolute paths — that nothing has ignored. **Whoever creates the file protects it.**

`start` **refuses non-fatally, naming `telemetry.mode`**, when the mode is not `on`, so the manual
path cannot bring up a receiver the gate would forbid from writing.

A **bind failure** (port held by an unrelated process) is **reported**, never retried silently, and
points at `telemetry.port` as the remedy.

### 14.2 Idempotence is by *identity*, not occupancy

`start` probes the port and treats it as "already up" **only** when the listener answers §9.2's probe
as a ptp sink whose **launch token matches the lockfile** and whose **repository root and
`telemetry_root` match this invocation**. A served port that is anything else — an unrelated process,
or a sink for another repo or store — is a **reported, non-fatal conflict naming `telemetry.port`**,
and no second listener is started on it. Occupancy alone would silently deliver a second repository's
spans into the first repository's store.

This holds identically whether `start` was typed or reached through the §15 preamble, so no sequence
of ptp commands produces a second listener per store — **while the store's lockfile is intact**. State
that boundary rather than an absolute: with the lockfile **deleted** *and* `telemetry.port` changed, a
manual `start` finds the new port free and a second *listener* does come up. What stays unconditional
is the **single-writer** guarantee of §9.3's port-drift gate: only the receiver on the currently
configured port ever writes, so the store keeps one writer even in the state where it briefly has two
listeners.

### 14.3 Two lockfile states, never conflated

- **Stale** — the recorded process is not live **and** the recorded port is unserved. Treated as
  **absent and replaced**, so a crashed receiver never permanently blocks a restart.
- **Live but non-matching** — the recorded port is served by a listener that does not verify. **Not
  replaced**: overwriting it would discard the only record of what is running while that listener
  still holds the port. Reported as a conflict needing explicit resolution; nothing is started.

**The port-migration check runs inside `start` itself, before the port probe.** When the store's
lockfile names a **live, identity-matching** receiver on a **different** port, start nothing, leave
that lockfile intact, and report that it must be stopped first. Putting this check only in the
preamble would let a manual `start` after a `telemetry.port` change find the new port free, launch a
second receiver for one store, and destroy the only record of the first.

### 14.4 The receiver repairs its own lockfile

A deleted lockfile would otherwise be a dead end, not a degraded state: `export` refuses (it detects a
live receiver by reported `telemetry_root` alone) while `stop` — which verifies against the recorded
pid, port, and token — finds nothing, reads it as already-stopped, and terminates nothing.

So **before answering its identity/health response**, and **again before every gated batch write**,
the receiver checks that its lockfile exists and still describes it, and atomically rewrites it from
its own launch state when it is absent or mismatched — with **every** field the original carried,
including the OS-reported process start time and executable path. Dropping those two would leave a
healed lockfile that no longer supports §15.5's process-identity comparison, quietly demoting the
pid-reuse guard to a bare pid check.

Running it on **every gated batch write**, not only on a probe, is what keeps the "live on a
non-configured port with no lockfile" limit harmless: a receiver in that state that is **writing**
restores its own lockfile within one batch, so the lockfile names its real port again and `export`'s
lockfile-driven check finds it; one that is **not** writing races with nothing. A **port-drifted**
receiver does **not** heal (§9.3), and a **mismatch** repair never overwrites a lockfile that verifies
a live identity-matching receiver for this store **on another port** — that is left intact and
reported as the §14.3 migration conflict, since overwriting it destroys the only record of a receiver
that is still running.

**Because the heal fires on a *mismatched* lockfile too, every lifecycle caller re-reads the lockfile
after any probe that may have triggered it** and verifies token / pid / port / paths against the
**reloaded** contents, never against what it read before probing. Otherwise the heal is defeated
exactly when it succeeds: `start` would compare the response to a stale token, decide the listener is
foreign, and launch a second receiver; `stop` would reject a receiver whose lockfile it just caused to
be repaired. Reload **before** deciding to start, to stop, or to report a conflict.

### 14.5 `stop`

**Verify first** — pid live, listener on the recorded port answering the identity probe, token
matching — and terminate **only** on a match, then remove the lockfile. On any mismatch, report the
lockfile as stale or mismatched and **remove nothing automatically**: pids get reused, and killing a
stranger's process is worse than leaving a stale file. An already-stopped receiver is tolerated.

**An absent lockfile is "unknown", never "nothing is running"**, or §14.4's self-heal is unreachable
from `stop`. With no lockfile, probe the configured `telemetry.port` for a listener reporting **this
store's** `telemetry_root`. Nothing answers → genuinely stopped, report that. One answers → its
self-heal has just rewritten the lockfile, so reload it and run the ordinary verification before
terminating. **Never kill on a port answer alone.**

### 14.6 `status` — read-only

`status` reports, in one place so no other task implies a different list:

- The **four-key env agreement verdict** §15.2 gates on, **per key** rather than as one boolean: the
  enable flag; the live endpoint versus `http://127.0.0.1:<resolved telemetry.port>`; the live
  protocol versus the one that shipped; and the **ingestion-credential match verdict** — including the
  "no credential file in this store" state, naming `setup` — reported **without printing the value**.
- Whether the receiver is **listening**, whether it was **auto-started and when**, and whether the
  lockfile is **stale**.
- Any **`OTEL_BSP_SCHEDULE_DELAY` drift**, and any **`OTEL_LOGS_EXPORTER` / `OTEL_TRACES_EXPORTER`
  drift** — all non-gating (§15.2) and therefore visible only here. The exporter keys matter most of
  the three: without them nothing is exported at all, so a store that is inexplicably empty while
  every gate passes is diagnosed here.
- The receiver's **health** verdict (on this branch, the single process's own liveness — no separate
  line) and the receiver log path.
- The **Codex preflight** — the four read-only checks of §22.6, with the credential reported as a match
  verdict and **neither value printed**, an absent `codex` reported as absent with the rest marked not
  applicable, and a fully-matching result scoped as **configured; delivery not verified**. The preflight
  starts no Codex process and writes no file, so it does not weaken the read-only posture below.

**`status` starts nothing, stops nothing, writes no file of its own, changes no lifecycle state, and
runs no auto-start preamble.** One qualification rather than an absolute the §14.4 self-heal would
contradict: `status`'s identity probe **may cause the receiver to repair its own lockfile**, because
the receiver repairs it before answering any probe. That is a receiver-owned write, not a
command-owned one, and it beats a `status` that reports a stale lockfile it quietly refused to let be
fixed — so `status` **reports when the probe repaired it**, leaving a visibly different state rather
than a silently different one.

### 14.7 The hard lifecycle rules

- **No ptp command stops the receiver automatically.**
- **No ptp command requires it to be running.** The single lifecycle dependency runs the other way and
  is not automatic: **`/ptp:telemetry export` requires the receiver to be *stopped*** and refuses while
  it is live (§12.5) — it never terminates it, and it is not a pipeline command, so **no pipeline
  command stops or requires the receiver**.
- `start` / `stop` / `status` remain the **manual override**: `stop` to take down an unwanted receiver,
  `status` to inspect one, `start` to bring one up explicitly.
- **The orphan tradeoff, recorded honestly.** Nothing auto-stops the receiver, because no ptp step
  observes session end and a preamble that killed a sink another session was using would be worse. The
  orphan is made *visible* instead: one listener maximum via the identity probe **while the store's
  lockfile is intact** (§14.2's qualification, not an absolute — with the lockfile deleted and the port
  then changed a second listener can exist, and what holds unconditionally there is the port-drift
  gate's single *writer*), `started_by=auto` plus the start time in the lockfile, and `status`
  reporting both.

### 14.8 Running them

Before the **first** `start` of a session — the one that actually launches the script — run the
canonical CRLF self-heal step of `skills/ptp-workflow-cache-heal/SKILL.md`, whose glob covers cached
`scripts/*.js` as well as cached `workflows/*.js`. A `\r` injected into the shipped receiver by a
Windows checkout breaks it exactly as it breaks a workflow script, and the heal is idempotent and a
no-op when the cache is absent. Reference that skill; never inline its command body here.

```
node <plugin>/scripts/ptp-otel-sink.js start  --repo <repo root>   # add --started-by auto from §15
node <plugin>/scripts/ptp-otel-sink.js stop   --repo <repo root>
node <plugin>/scripts/ptp-otel-sink.js status --repo <repo root>
```

Each prints one JSON object carrying `action` and, where the outcome is anything other than plain
success, a `message` to relay. `start` actions: `started` | `already-listening` | `refused` |
`start-failed`. `stop` actions: `stopped` | `already-stopped` | `stale-lockfile` |
`mismatched-lockfile` | `not-stopped` | `refused`. `status` always reports `action: status` — it has
no failure form, since it decides nothing and changes nothing.

`not-stopped` is the one `stop` outcome that leaves the receiver **running**: the recorded process
verified and was signalled, but the listener was still answering when the bounded wait elapsed. The
lockfile is deliberately **left intact** — removing it would leave a knowingly live receiver with no
record of itself — so the remedy is to re-run `stop` or end the reported pid by hand.

---

## 15. The telemetry auto-start preamble

A single **named, referenceable step**, defined here once in the same single-source style as
`ptp-branch-guard`, and invoked — never restated — from `skills/ptp-run-at-model/SKILL.md`.

### 15.1 The steps, in this fixed order

The order is load-bearing, not incidental.

1. **Resolve `telemetry.mode`** with §1's forgiving reader and **return immediately** when it is not
   `on` — no port probe, no file touch, no process, no output.
2. **Port-migration check** (§14.3): when the store's lockfile names a **live, identity-matching**
   receiver on a **different** port, start nothing, leave that lockfile intact, and advise stopping it
   before the port change takes effect. This runs **before** step 3, because a port change is exactly
   when the live endpoint stops matching — an endpoint-first order would return at step 3 and make
   this branch unreachable.
3. **Verify, read-only, that the telemetry env is in force in the running process** — the live
   `CLAUDE_CODE_ENABLE_TELEMETRY` and `OTEL_*` values the exporter actually reads, **not** merely the
   block's presence in `settings.local.json`, which takes effect only at process start — **and that it
   agrees with the resolved port**. On any mismatch, emit **one** non-blocking advisory and return
   **without writing anything** (§15.2).
4. **Probe `127.0.0.1` on the resolved `telemetry.port`** — one **pre-launch** attempt, 250 ms
   timeout, no retries. Return **silently** only when the listener **identifies itself** as this
   store's ptp sink; emit one advisory when the port is served by anything else.
5. **Otherwise perform the §14 idempotent start with `started_by=auto`**, then poll the identity
   endpoint for readiness within §15.4's cap: silent when it answers in time, one non-blocking
   advisory when the start fails or the cap elapses.

### 15.2 The gate is four keys, and why each

`CLAUDE_CODE_ENABLE_TELEMETRY`, the **endpoint** (which must equal
`http://127.0.0.1:<resolved telemetry.port>`), the **protocol** (the one that shipped), and the
**`x-ptp-store-token` credential inside `OTEL_EXPORTER_OTLP_HEADERS`**, which must match the store's
recorded one.

The credential belongs in the gate because the receiver rejects every batch failing it (§9.4):
without it the preamble would start a healthy-looking listener that records nothing — the exact
outcome this gate exists to prevent. `status` reports the verdict **without printing the value**.

`OTEL_BSP_SCHEDULE_DELAY` deliberately does **not** gate: a wrong delay costs tail latency, not
emission, and refusing to start over it would discard data still being sent. `status` reports its
drift instead.

The two **exporter-selection** keys (§13.2) do **not** gate either, for a different reason: the gate
is the four keys that identify *this store* and *this receiver*, and a user who exports the variables
by hand has opted in just as deliberately as one who ran `setup`. Their drift is reported by `status`,
which is where an "every gate passes but the store is empty" symptom is diagnosed.

The advisories, one each and mutually exclusive:

| Condition | Advisory names |
|---|---|
| the block is absent from `settings.local.json` | `/ptp:telemetry setup` |
| the block is on disk but absent from the live environment | a **Claude Code restart** |
| the live endpoint, protocol, or credential no longer matches | re-running `setup`, **then** a restart |

**Why the check reads the live process environment and not the file:** the session in which `setup`
was just confirmed has the block on disk and no exporter, and is precisely the session that must not
get a listener. Auto-starting a receiver for a session that was never configured to emit into it is
the orphaned-listener-with-no-data failure the explicit-lifecycle posture existed to prevent.

### 15.3 Hard rules

- The preamble **never delays the command beyond its bounded probe budget and the single bounded
  readiness window of §15.4**; outside those it never waits on the receiver.
- It **never retries, never STOPs, never alters a terminal state, and is never a precondition**.
- It **writes no Claude Code setting and never invokes `setup`** — it is **not** a second exception to
  `ptp-run-at-model`'s never-write-a-setting rule.
- On failure it emits **at most one** non-blocking advisory line and the command proceeds unchanged.

**The setup/start asymmetry, stated so a later reader does not "simplify" it away.** `setup` writes
`settings.local.json` — a Claude Code setting — so it stays manual, interactive, and confirm-first.
`start` writes **no** Claude Code setting at all: only telemetry-store metadata, namely the store's
managed `.gitignore` lines (§14.1) and its own pidfile. Automating the second is not permission to
automate the first. Requiring the env to be present before auto-starting is what keeps ptp from ever
running a listener for a session that cannot emit into it.

### 15.4 The bound, in real numbers

"Never delays" is a **bound**, not an absolute — a probe and a process launch cannot cost nothing:

- **At most two pre-launch probes**: one *conditional* old-port identity probe when the store's
  lockfile names a different port (step 2), then, only if the sequence continues, one configured-port
  probe (step 4). Each is a **single attempt with a 250 ms timeout and no retries**. A one-probe
  budget could not satisfy both branches in one invocation.
- **After a launch**, wait for readiness by polling the identity endpoint on a **250 ms
  start-to-start cadence whose interval contains that poll's own 250 ms timeout**, for **at most 8
  attempts**, under a **hard 2-second deadline**, whichever comes first. Not "launch and proceed",
  which would defeat the reason the receiver is started here at all: a process that has not yet bound
  its socket drops the run's first spans.
- When the cap elapses first, emit the single advisory and proceed. **Never** extend the wait, retry
  the launch, or block the spawn.

### 15.5 Caching (a MAY, and a qualified one)

A caller **MAY** cache an observed "already listening" result so the preamble costs at most one probe
per session on the hot path — but **not** as an unqualified session-long cache: a receiver can be
stopped or crash mid-session, and a stale cache would leave a later funnel command believing one is up
when it should have started one.

A TTL alone is **not** sufficient — an externally killed receiver must be noticed on the **next**
funnel command, not merely when the TTL expires. Accepting a cached result therefore also requires a
**cheap identity validation**: the store lockfile must still exist, name a **live** process, and carry
the same launch token, repository root, and `telemetry_root` the cached result was recorded against.

Those fields are **contents of an unmodified file**, though — they re-read identically whichever
process now holds the recorded pid, so on their own they do **not** deliver the pid-reuse protection
this check claims. So the pid is bound to the process too: the lockfile records an **immutable
live-process property at start** — the OS-reported process start time, plus the executable path where
available — and validation compares it. **Unobtainable or mismatched → discard the cache and run the
full probe.** A fresh identity-endpoint response is always an acceptable substitute for the cheap
check.

Also required: a short bounded TTL, and invalidation on `/ptp:telemetry stop`, on a `telemetry.port`
or `telemetry.root` change, and on any observed health or delivery failure.

### 15.6 Coverage — near-universal, not universal

Counted **as of after `0032_01_agent-telemetry-tracking` landed**, which added `commands/telemetry.md`:
**37 of the 44 files in `commands/` reference `ptp-run-at-model`** and therefore reach this preamble.
The **seven** that do not, with a verdict each:

| Command | Verdict |
|---|---|
| `/ptp:telemetry` | Outside the funnel **by design** (§15.7) — that is what keeps `status` strictly read-only and stops a status check from starting a process |
| `/ptp:config`, `/ptp:status`, `/ptp:update`, `/ptp:version` | Read-only or trivial; no receiver wanted |
| `/ptp:archive-and-deploy` | Reaches the preamble through the commands it delegates to — 38 covered in total |
| `/ptp:analyze` | Does substantial main work **outside** the funnel, so a session running only `/ptp:analyze` auto-starts nothing |

That last one is an **accepted, bounded gap**, recorded rather than papered over with the phrase
"every ptp command". Closing it later is a one-line preamble reference in that command, not a
redesign.

### 15.7 `/ptp:telemetry` does not run the preamble

It does not use `ptp-run-at-model`, which is exactly what keeps `status` read-only and what stops
`export` from being handed a receiver it would then refuse over.

### 15.8 Running it

```
node <plugin>/scripts/ptp-otel-sink.js preamble --repo <repo root>
```

One JSON object: `action` ∈ `skipped` | `already-listening` | `started` | `start-failed`, and
`advisory`. **When `advisory` is non-empty, emit exactly that one line and continue; when it is empty,
emit nothing.** Never fail, never retry, never wait beyond §15.4's bound. With `telemetry.mode` not
`on` the command returns after its config read — no probe, no process, no output.

---

# The report layer (`0032_04_telemetry-report`)

## 16. `/ptp:telemetry report` — the analysis methodology

`report` is the epic's answer to *"where is time wasted?"*. It **collects nothing**: it is a
read-and-render pass over the **derived** store files the earlier layers wrote, plus the bounded
retention deletion of §17.

**Its posture, worded this way everywhere and never shortened:** a **default** `report` **creates no
file, modifies no existing file, and deletes only aged raw files.** The word *default* is part of
the wording, not a hedge on it: §20.2's explicit `write` keyword is the **one** way a `report.md` is
created or overwritten, and a posture sentence that omitted the qualifier would be false of exactly
the invocation the user asked to write. It is **never** called "read-only" — not here,
not in `commands/telemetry.md`, not in the spec, not in the README, and not in a qualified form such
as "read-only (except pruning)". A default invocation deletes data irreversibly, and a reader keeps
the adjective while dropping the parenthesis.

### 16.1 The selector — delegated wholesale, extended not at all

`report [selector]` hands its argument to the resolution algorithm of
`skills/ptp-change-selector/SKILL.md` **unchanged**, and therefore supports exactly the forms that
skill already defines:

| Form | Meaning |
|---|---|
| `epic:all` | every active epic |
| `epic:XXXX` | one epic |
| `epic:XXXX story:NN` | one story within an epic |
| `story:NN` | the one active change with that story, when unambiguous — resolved through the shared skill's ambiguity rule unchanged, so an id occurring in several epics STOPs there asking for `epic:XXXX story:NN` rather than being disambiguated here |
| a bare change id | that change |
| *(empty)* | **this command's own default — every active epic**, stated below |

**The empty argument, stated here because the selector defers it back.** `ptp-change-selector` §2
resolves an empty selector by *deferring to the command's existing default*, so a command that in
turn defers to the selector leaves the scope undefined. `report`'s default is therefore named here:
**an empty argument is treated exactly as `epic:all`** — every epic holding an active change,
**each reported separately** per the rule below, with the same set and ordering §3 gives `epic:all`.
Nothing about the grammar changes: the selector still only ever receives a form it defines.

**Story-level selectors project to their epic's store, and narrow by row.** The store is keyed on
the **epic** (`<telemetry.root>/<epic>/`), while every span and ledger row carries **both** `epic`
and `change_id` (§10.1, §3). So for a resolved change id — from `epic:XXXX story:NN`, from
`story:NN`, or from a bare id — `report` **reads that change's epic store** and counts as *in scope*
only the rows whose `change_id` equals a resolved id. For `epic:XXXX` (and `epic:all`, per epic)
every row in that epic's store is in scope. "In scope" means exactly that everywhere below — in
§17's two headline figures, §18's breakdowns and top-N lists, and §19's counts.

**A legacy id has no epic store, and that is a defined outcome rather than a gap.** The selector
still resolves **legacy / unprefixed** folder names (`ptp-change-selector` §3 step 2 parses them as
`epic=None`, and `epic:all` appends them after the epic-prefixed ids). Such a change has no
four-digit epic segment, so §2's write points could never resolve an epic for it and its rows went
to the store-wide `<telemetry.root>/_unattributed/` — which §17.4 reads **for the footer count
alone**. So a legacy id resolves to a scope with **no epic store**: the report states that no
telemetry exists for it per §20.3, the §19 footer still renders, and **nothing is pruned**, there
being no `<telemetry.root>/<epic>/raw/` to prune. It is never an error, and the store-wide
unattributed count in the footer is the signal that explains it.

**Retention is the one thing that does *not* narrow with the rows** — see §21.2: a raw file holds
every story's records for a day, and the raw store is append-only and immutable (§12.1), so there is
no story-scoped deletion to perform. A story-scoped `report` therefore prunes its **whole epic's**
`raw/`. That is stated rather than discovered, because it is the one effect whose blast radius
exceeds the reported scope.

**This section adds no grammar of any kind** — no new prefix, no new token, no per-command form.
`/ptp:telemetry report` is listed among the **set-capable consumers** in
`skills/ptp-change-selector/SKILL.md` §Role B, which is what makes a future grammar addition reach
the report automatically instead of needing a second edit here.

**Two inherited rules, restated because this command would break quietly without them:**

- **Use the resolved id, never the raw selector string**, wherever an identifier or a path segment is
  required. `<telemetry.root>/<epic>/` is keyed on the resolved epic; a raw `epic:0032 story:01`
  string is never a path segment.
- **Under `epic:all`, each epic is a separate reporting scope.** Report each on its own.

**Why epics are never summed.** A cross-epic `concurrency_factor` would divide one epic's work by
another epic's elapsed time — averaging unrelated workloads that never overlapped into a ratio that
describes neither. The same objection applies to every summed figure, so no figure is summed across
epics: `epic:all` produces *N* reports, never one merged report.

### 16.2 The `write` keyword is a `report`-level token, stripped before the selector

`report` recognises one literal token, `write`, and **removes it from the argument before anything
reaches the selector**. So the selector never receives a token it does not define and §16.1's
no-new-grammar rule holds *literally* rather than approximately:

- `report write epic:0032` → the resolver is handed `epic:0032` **alone**, and `report.md` is written
  for the resolved epic (§20).
- `report epic:0032` → the resolver is handed `epic:0032`, and **nothing is written**.
- A bare selector value is **never** read as a request to write, and `write` is **never** read as a
  selector value. Both directions matter: a mis-parse in one direction loses the report, and in the
  other writes a file the user did not ask for.

**`write` is a reserved token at the `report` level, and the one consequence is stated.** Because the
strip is unconditional, a **legacy** change folder named literally `write` could not be selected by
its bare id here. That is the same reservation `ptp-change-selector` already makes for `all` inside
the `epic:` namespace, scoped the same way — to this one subcommand's argument, never to the shared
grammar, which gains and loses nothing. It is written down rather than discovered, and no
epic-prefixed id can ever collide (`\d{4}_\d{2}_…` is not the string `write`).

A `--write` flag was rejected for exactly this reason — it would have made `report` parse an argument
string the selector otherwise owns end to end.

## 17. The two headline numbers, and the subtraction that is banned

### 17.0 BANNED INVARIANT — no field is ever `wall − llm − tool`

**No output field of `report` may be computed by subtracting component sums from wall time.** In
particular an "other time" figure computed as `wall − Σllm − Σtool` **does not exist** anywhere in the
report, and this is a **stated rule** rather than something merely not done.

The reason is that the quantities are **not disjoint**:

- parallel tool calls within one agent overlap in time;
- `workflows/ptp-full-apply.js` runs several agents whose spans overlap across traces;
- an LLM span and a tool span overlap when a tool result streams back during generation.

So `Σllm + Σtool` routinely **exceeds** elapsed wall time and the "remainder" goes **negative**. A
negative *other time* is not a poor estimate of anything — it is **undefined**, and no caveat rescues
an undefined quantity. `concurrency_factor` (§17.3) expresses the same intuition — how much overlap
there was — as a well-defined ratio.

### 17.1 Aggregate work time

```
aggregate work time = Σ duration_ms over LLM spans + Σ duration_ms over tool spans
```

Grouped by `span_kind` so **no row is counted under two kinds**: LLM rows are the `span_kind` values
`llm_request` and `api_request`; tool rows are `tool`, `tool.execution`, and `tool_result`. A row
whose `duration_ms` is empty contributes nothing — an empty duration is **never** read as zero, and
an **unclosed run's own window** is excluded (§19.2).

**What "unclosed runs are excluded" does *not* mean.** It excludes the **run's** window from §17.2's
union and the run from every run-level duration figure — it does **not** discard the **spans**
attributed to that run. A span is a complete record carrying its own `start_ts` and `duration_ms`;
the work it measures happened whether or not the run that contained it has been closed yet. Dropping
those spans would silently understate every figure in exactly the situation that is most normal —
`spans.csv` is current **mid-run** (§9.7), so a report run while ptp is working sees open runs by
design, not by failure.

**With no LLM and no tool span in scope, aggregate work time is reported as *absent*, not as `0`.**
The distinction is load-bearing: a ledger-only scope (runs recorded, spans never collected) measured
no work, which is not the same claim as "the work took no time", and §17.3 turns an absent numerator
into an undefined ratio rather than a `0×` that reads like a measurement.

### 17.2 Elapsed wall time — a union, never a sum, and never a critical path

```
elapsed wall time = total covered extent of the union of TWO interval sets taken together:
                    (a) every in-scope span's [start_ts, start_ts + duration_ms]
                    (b) the process window [t_start, t_end] of EVERY closed in-scope ledger run
```

That is the whole algorithm. Consequences that follow from it being a **union**:

- an enclosing parent span and its nested child are counted **once**;
- a ledger run whose spans cover its window adds **nothing**;
- a run only **partly** covered contributes **exactly its uncovered remainder**.

**Every closed run contributes unconditionally — not only the span-less ones.** Nothing guarantees a
run's spans cover its window: collection can start late, stop early, or drop spans mid-run, all of
which this skill already treats as expected rather than exceptional. Under a "span-less runs only"
rule that uncovered time would vanish from the denominator, understating elapsed time and **inflating
`concurrency_factor`** — the banned subtraction's failure mode, arrived at politely. A run's window is
legitimately elapsed time even where no span covers it: the process was alive for it. The
coarse-Codex case (Claude spans beside `cli=codex` runs that never emit a span) then falls out of the
general rule instead of needing one of its own, and a scope with runs and no spans at all is simply
its degenerate case.

**Rows that carry no interval contribute none.** §10.2 writes `duration_ms` **empty — never a
fabricated zero** — whenever the source had no usable duration, and writes `start_ts` / `end_ts` /
`duration_ms` all empty with `missing-timestamp` in `notes` when it had no usable timestamp at all.
So, exactly:

- a row with an **empty `start_ts`** contributes **no interval** — it has no position on the
  timeline, and placing it anywhere would invent one;
- a row with a start but an **empty `duration_ms`** contributes the **zero-length** interval
  `[start_ts, start_ts]` — it is an instantaneous event (§10.4's rule 2), which adds nothing to a
  union but is not an error either. An empty duration is **never** read as an unknown extent to be
  guessed at.

**A zero-length interval is not a contributing source.** §17.7 names span intervals as a source of
the wall figure only when the span intervals contribute **positive covered extent**. A scope holding
nothing but instantaneous span rows beside real ledger windows therefore reports **ledger run
windows** as the source — reporting "span intervals" there would claim an instrumentation the scope
does not have, and the uncovered-run share would read as though spans had covered something.

Both cases are stated because "empty" is not "zero" anywhere else in this skill either, and an
implementation that arithmetically added an empty duration would produce a wall figure of `NaN` from
input this store treats as ordinary.

**The figure consults no parent graph.** It never reads `trace_id`, `span_id`, or `parent_span_id`,
so it is **unaffected** by duplicate `span_id` values, `parent_span_id` cycles, and parent links
matching no in-scope span. It is order-independent and deterministic from the rows alone.

**Why it is not called a critical path — and never may be.** The obvious alternative was to walk the
`parent_span_id` forest, take the longest dependent chain per trace, and union those. It is not well
defined on this data:

- *"Longest" is ambiguous when a root encloses everything below it* — every chain through that root
  has the same interval-union extent, so the headline would depend on a tie-break rather than on the
  work.
- *The rows carry containment, not dependency.* `parent_span_id` says a span happened **inside**
  another, not that it had to **wait for** a sibling. Two siblings that ran in sequence by necessity
  are indistinguishable from two that merely did not overlap. A critical path is defined over
  dependency edges; this store has none.
- *Unioning a per-trace longest chain across traces is not a global longest path anyway* — it is
  interval coverage, which the union of all spans already computes directly.
- *Malformed input* makes a forest walk undefined; an interval union is immune to all of it.

Calling interval coverage a "critical path" would credit the figure with a dependency analysis the
data cannot support — the same class of error as §17.0's subtraction, with a more respectable name.

### 17.3 `concurrency_factor`

```
concurrency_factor = aggregate work time ÷ elapsed wall time
```

Printed with its plain-language reading, e.g. *"2.4× — roughly 2.4 spans' worth of counted work
overlapping on average."*

**It is never phrased as a count of agents.** The numerator sums LLM and tool spans that overlap
*within* a single agent as readily as across agents — a tool result streaming back during generation,
parallel tool calls from one agent — so a **single-agent** run can score well above one. "2.4 agents
were working" is a plausible, wrong reading of a correct number, which is precisely the failure this
change exists to close; getting the denominator right and then mislabelling the ratio would waste the
effort.

**Reported only when elapsed wall time is available and greater than zero *and* aggregate work time
is present.** Otherwise the report **states that the factor is undefined** — never `0`, never `∞`,
never a dash a reader could average into something. A ledger-only scope therefore reports its
ledger-window wall time, reports the LLM and tool figures as **absent**, and states the factor
**undefined**: an absent numerator is not a zero numerator. A value below `1` is legitimate (spans dropped, sink down mid-run) and is reported
as-is with the footer explaining, **never clamped**.

### 17.4 Inputs — one authoritative set

The report reads **`spans.csv` and `runs.ndjson`, and never `raw/`.**

Why the restriction is a rule and not a preference: **pruning (§21) bounds `raw/` immediately, while
`spans.csv` only catches up at the next `export`** — the two stores intentionally hold different
histories in between. A report that mixed them would report a **different past depending on when it
ran**. Reading the derived files also means a prune has no effect on report output until the user
runs `export`, which is the honest and predictable ordering.

**`<telemetry.root>/_unattributed/spans.csv` is read for the footer's row count and nothing else.**
No record from it may enter aggregate work time, elapsed wall time, `concurrency_factor`, a
breakdown, or a top-N list. Those records resolved to no run and therefore to **no epic**: folding
them into an epic's body would both invent an attribution and count the same rows into **every**
epic's report at once.

### 17.5 The nested-chain diagnostic (secondary, but required)

The parent ids still earn their place. The report shows the **longest chain of nested spans per
trace**, measured as **that chain's interval union** — ties broken by **row order** (below): among
chains of equal extent the winner is the one whose **earliest row** comes first in row order, and if
that still ties, its next row, and so on. A tie-break is stated because §17.2 already establishes
that ties are the *normal* case here — where a root encloses everything, every chain through it has
the same extent — so an unstated tie-break would mean two implementations reporting different chains
from identical input, in a diagnostic whose output includes counts a reader is asked to trust. It is
clearly labelled a **secondary diagnostic**. It
is **never** the denominator of `concurrency_factor` and no headline number depends on it — but it is
**required rather than optional**, because the footer's graph-repair counts are produced by building
it, and a report that skipped it would silently stop reporting those repairs.

Because it does walk the graph, its degenerate cases are handled explicitly, and **each occurrence is
counted for the footer** rather than quietly repaired:

| Degenerate input | Handling | Footer |
|---|---|---|
| an edge whose `parent_span_id` matches no in-scope `span_id` | drop the edge | count dropped edges |
| a duplicate `span_id` | resolve to its **first occurrence in row order** (below) | count duplicate ids |
| a cycle in `parent_span_id` | break it at the edge that closes it **under row order** (below) | count broken cycles |

**Span identity is `(trace_id, span_id)`, and no edge crosses a trace.** The chain is computed *per
trace*, so "matches no in-scope `span_id`" and "a duplicate `span_id`" both mean **within the same
`trace_id`**: a `parent_span_id` is resolved only against span ids in its own trace, and the same
`span_id` appearing in two traces is **two different spans**, not a duplicate. Left unscoped, the
two readings differ on real input — span ids are unique per trace, not globally — and would produce
both different chains and different repair counts. A row with an **empty `trace_id`** forms no edge
and joins no chain; it is not silently pooled with every other empty-trace row into a trace that
never existed.

**Row order — the total order these two rules resolve against, because "first" and "the edge that
closes it" are otherwise underdetermined.** Two rows can share a `start_ts` to the millisecond, and
which edge "closes" a cycle depends on where a traversal entered it — so two implementations could
report different repair counts from identical input, which a *diagnostic whose whole output is
repair counts* cannot afford. **Row order is `start_ts` ascending, ties broken by the row's position
in `spans.csv`, ties there impossible** (a file position is unique). Nodes are visited in row order,
and each node's parent edge is followed in that same order — so "first occurrence" is the earliest
row, and the edge that closes a cycle is the one whose traversal reaches an ancestor already on the
current path. An empty `start_ts` sorts **last**, after every populated one.

Slice 2 records `trace_id` / `span_id` / `parent_span_id` only where the emitted event supplies them,
so parent links depend on the emitter. **When no usable parent links exist the diagnostic is omitted
and the omission is stated** — and the headline wall figure is unaffected, because it never depended
on them.

**"No usable parent links" means no `parent_span_id` values at all** — the emitter supplied none.
A scope whose `parent_span_id` values are all **present but dangling** is **not** that case: those
links exist, they are **dropped edges**, every one of them is **counted**, and the footer prints the
dropped-edge count (§19.4). Reading an all-dangling graph as "no usable links" would suppress the
repair count at the exact moment it is largest — reporting the worst parent graph as though it were
the absence of one. The diagnostic itself then yields only single-span chains, which is a correct
result rather than an omission.

### 17.6 Ordering

**The two headline numbers are printed before any breakdown**, so the concurrency framing is
established before a reader starts summing sub-tables and re-deriving §17.0's banned figure for
themselves.

### 17.7 The wall-time source record

While computing §17.2, record for the footer (§19.4):

- **which sources contributed** — span intervals, ledger run windows, or both;
- **how much of the union came from run time no span covered** — the direct measure of how
  instrumented the scope actually was.

A scope with runs and no spans is the **degenerate case of §17.2's single rule**, not a separate code
path, and the substitution is **never silent**: the footer names the source either way.

## 18. Breakdowns, top-N time sinks, and the per-iteration review view

Everything in this section is a **grouping over rows the earlier layers already derived** — no new
analysis, no new column, no new collection. All of it is printed **after** §17's headline numbers
(§17.6).

### 18.1 The general breakdown — phase × `agent_role` × `span_kind`

One table, keyed on the three columns together, reporting each cell's summed `duration_ms` (and its
row count). This is the general-purpose view: it answers "which phase, run by which kind of agent,
spent its time on LLM calls versus tools?" without needing a second table per question.

### 18.2 Tool time by `tool_class`

Within tool time, a sub-table grouped by `tool_class` — the literal request answered as a
**grouping**, because slice 2 already derived the column (§10.6). Its buckets are `search`, `read`,
`write`, `build_test`, `git`, `agent`, `other`, so **repository-search time and build/test time are
directly readable as two separate figures** even though both arrive as `Bash`.

**Plus one row the mapping table does not name: `(unclassified)`.** §10.6 leaves `tool_class`
**empty** whenever `tool_name` is empty, while §17.1 counts a row as tool work on its `span_kind`
alone — so a timed tool row with no tool name is real tool time belonging to none of the seven
buckets. Those rows get their own explicitly labelled row here (and are eligible for §18.3's
slowest-`tool_class` list under that label). **The sub-table therefore sums exactly to §17.1's tool
figure**, which is the point: a breakdown that quietly totals less than the headline it decomposes
teaches a reader to distrust both, and "the rows are there but in no bucket" is precisely the kind of
silent shortfall §19's footer exists to prevent — except that here it is avoidable outright rather
than merely disclosable. `(unclassified)` is **never** merged into `other`: `other` means *classified
as none of the above*, a genuinely different fact from *not classifiable at all*.

### 18.3 Top-N time sinks — three lists, `N` = 10

`N` is **10 for all three lists and is stated in the output**, so a truncated list never reads as
exhaustive. A list with fewer than `N` entries is simply shorter — never padded.

1. **Slowest individual spans** — by `duration_ms`, **populated durations only**. A row whose
   `duration_ms` is empty is **not ranked at all** rather than sorted as a zero: empty is not zero
   anywhere in this skill (§10.2), and a "slowest" list is a ranking, which an untimed row cannot
   join. Ties are broken by row order (§17.5), so the list is deterministic.
2. **Slowest `tool_class`** — by total time, from §18.2's table.
3. **The costliest *repeated* identical tool call** — see below.

**All three lists are ordered deterministically to the last row, including at the cutoff.** List 1
breaks ties by row order (above). Lists 2 and 3 aggregate rows, so no single row order applies to
them: they break a tie in **total time** by the **key itself, ascending** — the `tool_class` name
for list 2, the full key string for list 3 — comparing by Unicode code point. Aggregate lists need
this stated as much as the row list does: `N` is a **cutoff**, so a tie straddling rank 10 decides
which entries a reader sees at all, and leaving that to an implementation would mean the same store
printing different top-tens.

**The costliest repeated identical tool call.** Its key is `tool_name` together with the **preserved
command prefix**; **repetition is the *filter*** (only keys occurring **at least twice** are
eligible) and **total time — count × mean duration — is the *ranking***, with the **count printed
alongside the total** so the repetition stays visible in a list ordered by something else.

**Only occurrences with a populated `duration_ms` participate — in the count, in the mean, and in
the total alike.** An empty duration is never zero and is never imputed from the mean (§10.2,
§17.1), so a row without one is not timed work and cannot be ranked; counting it while excluding it
from the total would silently divide a real sum by an inflated count and *understate* the very sinks
this list exists to surface. The consequence is stated: the printed count is the number of **timed**
occurrences, `total = count × mean` is therefore just the sum of those durations, and a key with
fewer than two timed occurrences is **not eligible** even if it appeared more often.

**The list is named for cost, not for repetition.** A raw-count ordering and a total-time ordering
are *different lists*: a call repeated twice for four minutes genuinely should outrank one repeated
two hundred times for two seconds, so labelling the output "most-repeated" would describe the
ordering it deliberately does **not** use.

**Key resolution against the authoritative inputs, stated rather than assumed.** §17.4 forbids
reading `raw/`, and the 26-column `spans.csv` (§10.1) carries **no** Bash command text — that value
is raw-only (§10.5). So the key is `tool_name` plus the command prefix **only where the derived
input supplies one**; where it does not, the report keys on `tool_name` + `tool_class` and **says
so in the list's heading**, rather than silently presenting a coarser bucket as an identical call. A
later additive column carrying the prefix would sharpen the key without changing the filter or the
ranking rule.

**And the degraded list is renamed, not merely footnoted** — because `tool_name` + `tool_class` is a
**class**, not an identity: forty different `Grep` calls, or every `Bash` command that happens to be
a build, collapse into one row that repeated no *identical* call at all. Printing that row under the
heading "costliest repeated **identical** call" would be a plausible wrong conclusion drawn from a
correct number — this change's own failure mode, in the one list most likely to drive an action. So
where the key is degraded the list is headed **"costliest repeated tool *class*"** and names the key
it actually used and why; the word *identical* appears **only** where the key genuinely establishes
identity. Today's 26 columns supply no prefix, so the degraded heading is the one a reader sees —
stated here rather than left to be inferred from the absence of a column.

**Why this list exists.** `ptp-review-loop` runs up to `review.maxIterations` and **each iteration
starts cold**, so the same `Grep`, the same `Read`, the same repository survey is re-run every
time — ptp's characteristic waste pattern. Paired with §18.4 it turns "the review loop feels slow"
into "iteration 4 cost six minutes, most of it re-running searches iteration 3 already ran".

### 18.4 Review-loop cost per iteration

**Which runs this view covers, stated before how they are grouped.** Only runs whose `command` is a
**review-family command** — `/ptp:review*` or `/ptp:codex-review*` — are eligible, because those are
exactly the commands `ptp-review-loop` drives under `review.maxIterations`. Every other command's
runs appear in **no** per-iteration view: the grouping rule below would happily number three
`/ptp:apply` runs "iterations 1–3" and compare them against a review cap that says nothing about
them, manufacturing a sequence and a flag out of unrelated work. Note the eligibility is keyed on
the **`command`**, not on §3.2's `phase`, because the plan-, PRD-, and brainstorm-kind review loops
map to those phases while still running under the same cap.

**Iteration numbers are derived, and the report says so.** `ptp-review-loop` keeps its counter in
conversation state and **never persists it**, so no recorded field carries an iteration number. The
reconstruction:

1. **Group** ledger runs sharing **change id**, **`command`**, **`phase`**, and **`agent_label`**.
2. **Order** the group by run **`t_start`**, ties broken by the run's **line position in
   `runs.ndjson`** — the ledger is append-only (§4), so line position is a genuine total order and
   two runs opened in the same millisecond still number deterministically. Without the tie-break,
   two implementations could hand the same runs different iteration numbers, and with them different
   per-iteration totals — the same failure §17.5's row order closes for spans.
3. **Number** the members in that order — iteration *n* is the *n*th run of the group.

**Spans join an iteration through the ledger run they are already attributed to** — via `run_id`,
never by re-joining on time. Slice 2 already performed that join (§11); a second one could disagree
with it, and two contradictory attributions of the same span is worse than one imperfect one.

**Each iteration reports BOTH its aggregate work time AND its wall time, each labelled**, alongside
the **configured `review.maxIterations` cap** (resolved by `skills/ptp-review-loop/SKILL.md`'s
forgiving resolver, default 5). A single unlabelled "cost" number is forbidden: it would let a reader
treat work time and elapsed time as the same quantity — the exact conflation §17 exists to prevent.

**The loop-boundary problem is surfaced, never solved.** The ledger records **no loop-invocation
id**, so nothing separates "one loop that ran five iterations" from "two loops that ran two and
three" over the same change. Every available fix is a guess — an idle-gap threshold picks an
arbitrary number of minutes, a session heuristic reads a boundary the store never recorded — and both
would produce confident boundaries nobody can verify. **So the report invents none.** Instead, when a
group holds **more runs than the currently configured `review.maxIterations`** permits, it flags **in
the footer** (§19.5) that the group **likely** spans more than one loop invocation and that its
numbering is **approximate**.

**"Likely", never "proven".** The cap is read **at report time**; the ledger records no cap in force
when those runs happened; a cap **lowered since** would trip the comparison on a single valid loop.
Asserting proof would be the report doing precisely what it warns its readers against — turning a
suggestive number into a confident claim.

**Overlapping run windows within one group** are numbered by `t_start` and **flagged in the footer**
(§19.5): a sequential loop should not produce overlaps, so an overlap means a **retry or a concurrent
invocation**, and presenting either as "iteration 3 then iteration 4" would invent a sequence.

**"Overlap" means a *positive-duration* intersection.** Windows are closed intervals, so one run's
`t_end` can equal the next run's `t_start` exactly — that is a loop running back to back, the most
*sequential* thing the ledger can record, and flagging it would say the opposite of what the flag
means. Touching endpoints are therefore **not** an overlap; only a strictly positive shared extent
is.

## 19. The data-quality footer — mandatory, never suppressed

**Every report ends with this footer, and it is never omitted, shortened, or suppressed** — not on an
empty store, not on a clean store, not when every item is nil. **Every item below appears in the
footer itself**, whether or not the section it came from also mentions it, so **a reader who reads
only the footer still sees every caveat**.

**Why it is non-negotiable:** a report that silently hides a broken join converts *"I have no data"*
into *"I have wrong conclusions"* — which is **worse than no report at all**. Every number in the
body is only as trustworthy as the footer says it is.

### 19.1 Store-wide unattributed span count

The row count of `<telemetry.root>/_unattributed/spans.csv`, **labelled store-wide**.

It is store-wide and not this epic's, because a record that resolved to **no run** has **no epic** to
belong to (§11.4). So the footer states that a large count means the ledger join is broken
**store-wide**, and therefore that this epic's figures **may** be understated by an unknown amount.
It **never asserts that they are**: nothing is known about which epic those records came from, and
claiming they are this epic's would attribute records to an epic precisely where attribution failed.

Per §17.4, this count is the **only** use of that store — no record from it reaches any body figure.

### 19.2 Unclosed run count

Runs with an open line and no close line (§4's reader-derived `unclosed`). Their count is reported,
and they are **excluded from duration aggregates** — a missing `t_end` is **never** treated as a
zero-length window, and an unclosed run contributes no interval to §17.2's union.

**The exclusion is of the run, never of its spans** (§17.1): a span attributed to an unclosed run
still contributes its own duration to aggregate work time and its own interval to the wall union,
because it is a complete record of work that actually happened. Excluding those spans would
understate the report most severely when it is most useful — mid-run, where open runs are the
expected state.

### 19.3 The Codex line — two independent inputs, both reported

"No `cli=codex` rows" is compatible with several different situations, and **a single ordered ladder
over that one signal cannot separate them** — an early branch swallows the cases the later branches
exist for, leaving "the slice has not landed" unreachable. So **two independent inputs are read and
both are reported**:

**Configuration state** — does the **installed** `skills/ptp-telemetry/SKILL.md` carry a Codex
telemetry contract? *Absent* ⇒ `0032_06_codex-telemetry` has not landed. *Present in the coarse
ledger-only form* ⇒ it landed and deliberately configures **no** Codex span collection. *Present in
the span-collecting form* ⇒ Codex spans are expected.

**Ledger evidence** — does the scope contain `cli=codex` **runs**? Slice 1 brackets **every**
`codex exec` shell-out with a ledger run (§6.2), so this answers *"did Codex run here?"*
independently of whether any span was ever collected. That independence is the whole point: it is
what distinguishes "Codex ran and told us nothing" from "Codex never ran".

The footer states the **resolved combination**:

| Configuration state | `cli=codex` ledger runs | The footer says |
|---|---|---|
| not configured (slice not landed) | none | Codex telemetry is not configured, **and** Codex did not run in this scope |
| not configured (slice not landed) | present | Codex telemetry is not configured; Codex **ran**, and its ledger wall time is reported |
| coarse ledger-only | none | Codex time is ledger wall time by design; Codex did not run in this scope |
| coarse ledger-only | present | Codex time is ledger wall time by design, and that wall time is reported — a **steady state, not a gap** |
| span-collecting, spans present | present | Codex data is present |
| span-collecting, no spans | present | Codex ran and emitted no telemetry; reuse `0032_06_codex-telemetry`'s degradation label **verbatim** when it publishes one, and report the ledger wall time |
| span-collecting | none | Codex did not run in this scope — **not** a data-quality problem |

"Not configured" and "did not run" are stated as **two separate facts** when both hold, never
collapsed into one statement that leaves the other unknown.

**Whenever the scope holds `cli=codex` ledger runs, their ledger wall time is reported regardless of
which row applies**, so Codex time is never simply missing. Under coarse ledger-only attribution that
**is** the Codex figure, permanently — which needs no separate machinery, because §17.2's rule that
every closed run's window joins the union already covers it, mixed scopes included.

**Absence is reported the same way whether temporary or permanent**: the reason is stated without
implying that Codex rows are *pending*, so a store that will never contain a `cli=codex` span reads
as a valid steady state rather than a gap awaiting a fix.

### 19.4 Wall-time sources, uncovered share, and graph repairs

- **Which sources produced the wall figure** — span intervals, ledger run windows, or both (§17.7).
- **How much of the union came from run time no span covered** — the direct measure of how
  instrumented the scope actually was.
- **The §17.5 diagnostic's repair counts** — dropped edges, duplicate `span_id`s, broken cycles.
  **All three are printed on every report that built the diagnostic, including as `0`.** A count
  that vanishes when it is nil is indistinguishable from a count that was never taken, which is
  exactly the "no data reads as good news" failure this footer exists to prevent — and it is the
  general rule of §19 ("not when every item is nil") rather than an exception to it. The **one**
  case where the three counts are replaced rather than printed is the diagnostic being **omitted**
  for want of usable parent links, where the statement of omission takes their place — and says so.

### 19.5 Review-loop flags

- **Overlapping run windows** within a group (§18.4) — flagged as a **retry or concurrent
  invocation**, not renumbered into an invented sequence.
- **A group larger than the currently configured `review.maxIterations`** — flagged as **likely**
  spanning more than one loop invocation, with the numbering marked **approximate**, worded as
  likelihood and never as proof (§18.4).

## 20. Write posture, and the two empty cases

### 20.1 A default `report` writes nothing and deletes only aged raw files

A default `/ptp:telemetry report [selector]` **prints to the session**. It **creates no file and
modifies no existing file**. It runs **no git command, no `ptp-branch-guard`, and no
`openspec validate`** — the same exemption `status` holds (§8).

**The one exception, stated every time the posture is stated:** §21's retention deletes aged files
under the reported epic's `raw/`. That is a **default** effect, not an opt-in one.

**Therefore the phrase "read-only" is never used for `report` — anywhere, in any form.** Not in this
skill, not in `commands/telemetry.md`, not in the spec, not in the README, and **not qualified**:
"read-only (except pruning)" is worse than useless, because readers keep the adjective and drop the
parenthesis. The posture is always worded:

> **creates no file, modifies no existing file, and deletes only aged raw files.**

(`status`, by contrast, deletes nothing and **is** read-only. The two commands' postures are
deliberately worded differently because they genuinely differ.)

### 20.2 The optional `report.md`

Only when the literal `write` keyword is given (§16.2) does `report` write
**`<telemetry.root>/<epic>/report.md`** — **that file and nothing else**, keyed on the **resolved**
epic. Under `epic:all` that is one `report.md` per resolved epic, each in its own epic directory;
figures are still never merged (§16.1). The keyword is stripped before the selector sees the
argument, so the selector grammar is untouched.

**A scope with no epic writes nothing, and says so.** The path is keyed on the resolved epic, so a
**legacy / unprefixed** id (§16.1) — which has no four-digit epic segment and therefore no
`<telemetry.root>/<epic>/` — leaves no path to construct. `report write <legacy-id>` therefore
**writes no file** and **reports that it wrote none**, alongside the same "no telemetry for this
scope" statement §20.3 gives the run anyway. It is **not** an error, and no directory is invented
for it: creating some fallback path would put a report where no store exists and where nothing would
ever look for it. Under `epic:all`, each epic-prefixed scope still writes its own `report.md`; only
the legacy members write nothing.

### 20.3 An empty scope is stated, never zeroed

When the resolved scope holds **no telemetry at all** — no store, no `spans.csv`, no ledger runs —
the report **states that** and stops. It does **not** raise an error, and it does **not** print a
table of zeros: a zero that a reader could mistake for a measurement is exactly the failure mode this
whole layer exists to close. The §19 footer still renders.

The related-but-different case — **spans exist but no ledger run does**, so every record landed in
the store-wide `_unattributed/` — is **not** an empty scope: the body figures are legitimately empty
for this epic and §19.1's store-wide count makes the broken join impossible to miss.

### 20.4 `report` works with collection turned off

When `telemetry.mode` resolves to `off` but a store exists from earlier runs, `report` **reads it and
notes that collection is currently off** — it never refuses. The mode gates **writes** (§5); it does
not gate reading data that has already been recorded. Retention still applies, because it is a
property of `report` rather than of collection.

## 21. Retention — the one deletion in this skill

`telemetry.retentionDays` (§1, default **30**, same forgiving reader as the other telemetry keys)
deletes aged files under **the reported epic's `raw/`**, during **`report`** and nowhere else.

### 21.1 The candidate rule, stated exactly

Because the deletion is **irreversible and happens on a default invocation**, the rule is stated
exactly rather than as "older than the window". Vagueness in an irreversible default deletion is not
a documentation gap — it is a data-loss bug waiting to be written. A file under
`<telemetry.root>/<epic>/raw/` is a candidate **only when both** hold:

1. **Its name parses as the receiver's `YYYYMMDD.ndjson` form** (§9.7). A name that does not parse is
   **never deleted, whatever its modification time** — an unrecognised name means the pruner does not
   know what it is looking at, and deleting on a guess is the one outcome that cannot be undone.
2. **Its parsed date is *strictly earlier* than the cutoff**, where
   `cutoff = today − telemetry.retentionDays`, computed on **§9.7's calendar-date basis** — the one
   the writer names files by, read from there rather than restated here. Strictly earlier means the
   **boundary day is retained**: a retention of `30` keeps **30 days plus today**, never 29.

**"The file the receiver may be appending to right now is never a candidate" is a *consequence* of
those two rules, not a separate assertion**: today's date is never strictly earlier than the cutoff
for any positive retention value, and the reader guarantees the value is positive.

### 21.2 What is never pruned

- **`runs.ndjson`, `runs.csv`, and `spans.csv` — never.** They are small, and `spans.csv` is the
  shareable artifact.
- **Anything under the store-wide `<telemetry.root>/_unattributed/` — never.** That store belongs to
  **no epic** (§2, §11.4); a *per-epic* `report` has no mandate to delete a store shared by every
  epic.
- **Any other epic's `raw/`.** Pruning is scoped to the epic being reported — under `epic:all` (and
  under the empty argument, which §16.1 defines as `epic:all`) that is each reported epic in turn,
  never a single epic standing in for the rest.
- **Nothing narrower than an epic, either.** A **story**-scoped report (§16.1) narrows its *figures*
  to the resolved `change_id` but prunes its **whole epic's** `raw/`: a raw file holds every story's
  records for a day and the raw store is append-only and immutable (§12.1), so a story-scoped
  deletion would mean rewriting an immutable file. Epic-level pruning is therefore the only
  implementable rule, and it is **stated** rather than left to be discovered, because it is the one
  effect of `report` whose reach exceeds its reported scope.
- **Nothing at all outside `report`.** **No ptp pipeline command triggers pruning** — not `/ptp:apply`,
  not `/ptp:review`, not the fan-out. Deletion happens while **a human is looking at the data**, never
  as an invisible side effect of an unrelated command.

### 21.3 The `export` consequence, stated rather than papered over

Slice 2's `export` is **always a global re-derivation from `raw/`** (§12.2). So the **next `export`
after a prune rewrites `spans.csv` without the pruned rows.** Pruning does not merely limit how far
back a rebuild can reach — it removes that history from `spans.csv` at the next `export`.

"`spans.csv` is never pruned" is therefore true of **the pruning step** and **not** of the store's
eventual contents, and that distinction is stated **wherever retention is documented** (this skill,
`skills/ptp-config/SKILL.md`, `commands/config.md`, and the README). Stating only "the CSV is never
pruned" would leave a user with the exact opposite practical expectation, and they would discover the
truth by losing data.

Note the ordering this creates, which is the honest one: because `report` reads the **derived** files
and never `raw/` (§17.4), a prune **cannot change the numbers the same command just printed**, and it
has no effect on any report until the user runs `export`.

### 21.4 A misconfigured value prunes on the default, not on nothing and not on the value

A non-integer, zero, or negative `telemetry.retentionDays` resolves to **30** via §1's forgiving
reader, and pruning then runs **on that 30-day window** — never on the unparseable value, and never
"not at all". The reader **never throws and never STOPs a command**.

---

# The Codex layer (`0032_06_codex-telemetry`)

## 22. Codex telemetry — the repository-scoped mechanism

Everything in this section implements the outcome `0032_05_codex-telemetry-scope-spike`'s **decision
record** selected: the **repository-scoped** mechanism, at the fidelity that record's observations
support. It consumes §§1–15 and redefines none of them.

**No user-global Codex configuration is written, for any reason.** That is the defect that killed the
predecessor: one global file holds one endpoint and one credential while stores, ports, and credentials
are per repository, so repository B's setup redirects repository A and A's spans are *accepted* into B's
store on B's own credential. Shape R satisfies this by being repository-scoped — never by disclosure and
never by a documented caveat.

### 22.1 The mechanism, and the one invariant it relaxes

The record selected the Codex CLI's **`-c` / `--config` per-invocation override**, carrying dotted
`otel.*` keys, appended to the `codex exec` invocation. **No Codex configuration file of its own is
written anywhere**, no environment variable is set, and no `~/.codex/config.toml` write of any kind
occurs. The observed precedence, established by conflict rather than read, is
`-c` override > `-p` profile layer > `$CODEX_HOME/config.toml`.

That relaxes exactly one invariant the predecessor carried — *"no telemetry flag, environment variable,
or argument is added to any `codex exec` invocation"* — and it relaxes it **narrowly, explicitly, and as
a decided trade rather than a silent exception**. What is added: repeated `-c` arguments **confined to
the `otel.*` key space**, and nothing else. The bound: only those keys, and **only when telemetry is
on** — so a constructed `codex exec` command line is **byte-identical** to the pre-change one whenever
`telemetry.mode` is not `on`, *and* whenever the consent record of §22.3 does not record consent. The
rule itself lives with every other `codex exec` assembly rule, in
`skills/ptp-codex-mode/SKILL.md`'s canonical flag-append rule; this section does not restate it.

Two record-level values carry the whole design, and both arrive as OTLP **resource** attributes on
**both** signals:

| Value | Key | Meaning |
|---|---|---|
| Origin discriminator | `service.name` = **`codex_exec`** | **Codex-emitted**, not ptp-set. Established by paired comparison against a real Claude-originated record, which emits `service.name = claude-code` on the same signal at the same structural level. Persisted as the raw-only field `service_name` (§10.5) by `0032_07_raw-record-service-name` |
| Correlation value | `otel.environment="<run_id>"` → resource attr **`env`** | The ledger run's **existing `run_id`**. No new field on either record |

Both are read from the **resource** scope specifically, so a span- or log-level attribute of the same
name cannot shadow either one.

### 22.2 The canonical rendering — pinned once

This is the single definition `setup`'s writer, `status`'s parser, and the README example all consume. A
conceptual key list is not sufficient: the writing side and the reading side are separate contracts, and
two renderings that both satisfy the prose can fail to parse each other.

```
-c otel.environment=<the ledger run_id bracketing this invocation>
-c otel.exporter={"otlp-http"={endpoint="http://127.0.0.1:<telemetry.port>/v1/logs",protocol="json",headers={"x-ptp-store-token"="<the store credential>"}}}
```

and, **only when the trace signal is opted in**, one further argument of the same shape:

```
-c otel.trace_exporter={"otlp-http"={endpoint="http://127.0.0.1:<telemetry.port>/v1/traces",protocol="json",headers={"x-ptp-store-token"="<the store credential>"}}}
```

- **Each `-c` value is ONE argument, and it is quoted when the invocation is composed on a shell
  command line.** The rendering above is written as the argument vector Codex receives; the exporter
  value carries `"` characters, which a shell strips, and an unquoted value therefore reaches Codex as a
  different string from the one pinned here. So compose it as
  `-c 'otel.exporter={"otlp-http"={…}}'` — single-quoted, exactly the form the decision record exercised
  throughout the spike — or pass the vector without a shell at all. The `otel.environment` argument
  needs no quoting for a `run_id`, and quoting it anyway is harmless.
- **Full paths, not a base URL** (**advisory A-1**). Codex does **not** append `/v1/logs` or
  `/v1/traces`; it posts to the configured endpoint URL **verbatim**, and §9 accepts only those two
  exact paths. A base-URL endpoint silently reaches nothing.
- **The log signal is the default; the trace exporter is opt-in** (**advisory A-6**). One trivial turn
  produced 932 spans across ~2.4 MB, almost all Rust `tracing` internals, while the **log** signal
  carries the timing data the epic wants.
- **No metrics exporter is enabled, ever.** The receiver serves `/v1/traces` and `/v1/logs` and answers
  nothing at `/v1/metrics`, so a metrics exporter would aim at a route nothing serves. Version-dependent
  metrics support is why metrics are **out of scope for this slice** — not a degradation of it and not an
  emptied column.
- **The credential is the store's existing one**, read from `<telemetry.root>/.ptp-telemetry-credential`
  and **never re-minted**. It is mandatory, not hardening: of the batches surviving the `telemetry.mode`
  and port-drift gates — which **accept and discard** ahead of it, a distinct outcome from rejection —
  the receiver rejects every credential-less one before writing anything (§9.4).
- **The credential is read live at construction time**, so the wiring can never carry a *stale* value.
  What it can be is **absent**, which is the delivery-breaking state §22.6 check 4 exists for.

### 22.3 `setup`'s second, separately-consented Codex step

`/ptp:telemetry setup` gains a **second** step, consented **separately** from the Claude-side
`<repo>/.claude/settings.local.json` step of §13. (Never a `settings.json` step — the baseline forbids
that target.) Declining the Codex step leaves the Claude-side setup fully completed.

**Where the consent lives.** A per-invocation mechanism with no configuration file of its own still
needs the one-time answer to survive: it must govern a later `codex exec` construction and be readable by
`status`. So `setup` records it in a **repository-scoped ptp telemetry-consent record**,
`<telemetry.root>/.ptp-codex-telemetry-consent.json`, written **only** on confirmation. The two
shortcuts are both wrong and both forbidden: inferring consent from the credential file configures a user
who declined, and wiring unconditionally makes declining meaningless.

**That record is not a gate over whether Codex runs**, and the distinction is exact. `codex.mode` alone
decides whether Codex runs. This record decides only whether telemetry wiring is appended to an
invocation `codex.mode` has *already* decided to make, so it cannot disagree with `codex.mode` about
whether Codex ran — a run without consent proceeds identically and simply produces no Codex rows.

**The managed keys — exactly seven**, and the write is **managed-key replacement, never whole-file
replacement**: every other key in the record, including one a user or a future slice put beside them, is
preserved byte-for-byte.

| Key | Value |
|---|---|
| `ptp_consent_kind` | `ptp.codex_telemetry_consent` |
| `ptp_consent_version` | `1` |
| `consent` | `granted` — the only value that authorizes wiring |
| `granted_at` | ISO-8601 UTC |
| `log_endpoint` | `http://127.0.0.1:<telemetry.port>/v1/logs` |
| `trace_endpoint` | the `/v1/traces` form when the trace signal was opted in, empty otherwise |
| `credential_fingerprint` | a **one-way digest** of the store credential — never the credential |

**Why a fingerprint and not the credential.** Under this mechanism nothing ptp writes carries the
credential value, so there is no file to protect at rest and the ignored-and-untracked precondition has
no target. Writing the credential here would create one — inside the repository, and outside the store's
managed `.gitignore` set (a `0032_02` contract this slice does not touch). The fingerprint discloses
nothing and is never printed either way. What it buys is **detectability, not authorization**: it records
*which* credential the consent was given against, so a consent record that was committed and cloned into
another checkout — or left behind by a credential rotation — is reported by §22.6 check 4 as **stale
consent** rather than passing unnoticed. It is deliberately **not** part of the authorization test:
`consent: granted` remains the only value that authorizes wiring, because gating on the fingerprint would
silently switch telemetry off after a routine rotation — the very state §22.6 records as *not*
delivery-breaking.

**The rules the write obeys**, each about not damaging what the user already has:

- **Diff first, against what is actually there.** An existing block is shown changing, never silently
  repointed. Nothing is written before explicit confirmation of *this* step.
- **Refuse rather than overwrite** a record that does not parse as a JSON object, reusing `/ptp:config`'s
  writer posture rather than inventing a second one. The file is left exactly as it was.
- **Create on confirmation only** — an absent record and any missing parent directory are created
  containing only the managed keys. Declining creates nothing.
- **Gated on the credential file, not on the Claude-side answer.** The step proceeds whenever
  `<telemetry.root>/.ptp-telemetry-credential` exists — *including* on a re-run where the Claude-side
  write is declined, since the baseline mints the credential once and reuses it. **Only** when no
  credential file exists does the step report that it cannot produce a working configuration, write
  nothing, and mint nothing of its own.

**What the consent text says, and what it does not.** It names the **absolute path of the consent
record** and the **per-invocation `-c otel.*` wiring that record authorizes** — never a path for a Codex
configuration file, which this mechanism does not have. It states the scope: repository-scoped, nothing
user-global. It does **not** carry the predecessor's out-of-repository framing or cross-repository
repointing disclosure — that failure mode does not exist here and describing it would misstate the
design. And it discloses the **residual exposure the record actually names**: the `-c otel.*` arguments,
credential included, are visible in **any process listing** and in **Codex's own session record**.
Redaction covers this command's *display* and is never presented as the protection.

**What `setup` may claim.** It starts no Codex process, so it never claims the installed Codex *will*
transmit the header. The record did observe `x-ptp-store-token` transmitted verbatim by the pinned
`codex-cli 0.145.0`, **lower-cased** (**advisory A-8**), so header support may be stated for that
version. The result is described as **written but unverified end to end**.

```
node <plugin>/scripts/ptp-otel-sink.js codex-setup-plan  --repo <repo root> [--with-traces]  # writes NOTHING
node <plugin>/scripts/ptp-otel-sink.js codex-setup-apply --repo <repo root> [--with-traces]  # only after confirmation
```

Render the plan's diff verbatim, ask for explicit confirmation of the Codex step, and run
`codex-setup-apply` only on an affirmative answer. Never reconstruct or print the credential value. A
`blocked` result (no credential file) and a `refused` result (unparseable record) are relayed verbatim
and nothing is run.

### 22.4 The Codex join

Slice 2's join asks *which run's `(session_id, window)` contains this span?* For Codex that fails at the
first term: a separate OS process has its own session identity and its own trace roots.

**Routing is positive, and decided at trace-group scope before either join.** The cheap answer —
"whatever matches no ledger run is Codex" — is **forbidden**, and the reason is recorded: a Claude
session in this same store that never ran a ptp command also matches no run, and its spans would be
handed to the Codex join and attributed to whichever Codex window overlapped them in wall-clock time.
Routing therefore uses the §22.1 discriminator, read from the record's persisted `service_name`, and
**never** the configuration path or the span-name catalogue — neither of which is record-level origin
evidence.

**Unanimity is required.** A group goes to the Codex join only where **every** member carries the
discriminator and every value agrees. Two failures send the group **wholly** to `_unattributed/`:

| Case | `notes` |
|---|---|
| members carry **differing** values, **or** some carry it and others carry none | `unattributed:mixed-origin`; `origins=<every observed value, sorted, pipe-joined, with `(none)` standing for empty>`; `origin-missing=<count of members carrying none>` |

Routing on the positive members alone is the tempting shortcut and is wrong for the same reason the
negative predicate is: a group holding even one record that is not demonstrably Codex-originated is
precisely the unknown-origin case.

**An absent `service_name` key reads as an empty one.** Raw lines written before
`0032_07_raw-record-service-name` carry no such key, and the raw store is append-only so they are never
rewritten. Both shapes mean *carrying no discriminator* — never a malformed entry — and **key presence is
never the test**.

**A positive discriminator is necessary and not sufficient.** It proves the telemetry is *Codex's*, not
that it is *the `codex exec` ptp launched*. That gap is closed by the **correlated branch**, which the
decision record selected:

1. The correlation value is normalized at **group** scope first, because the never-split-a-trace
   guarantee means the decision cannot be made per record: a group carries exactly one value, the one
   every member carrying a value agrees on.
2. A group whose members carry **differing** values, or where **some** carry one and some do not, goes
   wholly to `_unattributed/` with `unattributed:conflicting-correlation`, `correlations=<every observed
   value>`, and `correlation-missing=<count>`.
3. A group where **no** member carries one goes to `_unattributed/` with `unattributed:no-correlation` —
   **never matched by window instead**.
4. A single agreed value is matched to the **`cli=codex` run that `run_id` names**. No such run →
   `unattributed:no-such-codex-run` with `correlation=<value>`.
5. That run's window must contain the group's usable timestamps, as a **consistency check on the
   correlation** and never as a substitute for it. Disagreement → `unattributed:correlation-window-mismatch`
   with **both** `correlation=<value>` and `window=<start>..<end>` recorded. One of the two is wrong and
   guessing which is exactly what this design forbids.
6. Zero usable timestamps makes that check vacuous rather than failed — the group is joined on an
   explicit correlation value, strictly stronger evidence than the baseline's session-id term — and the
   condition is recorded as `no-usable-timestamp` rather than hidden.

**The reconciliation, settled here.** The decision record notes in passing that "the baseline's existing
ledger-window attribution remains the fallback for records that carry no correlation value", which is
**not** the same rule as step 3. This slice implements **step 3**, which is what its spec delta requires:
a Codex group carrying no correlation value goes to `_unattributed/`. The consequence is that the
**scoped-configuration branch — window containment alone — is specified but never reached**, because
every `codex exec` ptp launches carries `otel.environment=<run_id>`, and a Codex process ptp did *not*
launch is exactly the one that must not be adopted. The innermost-window tiebreak that branch would have
needed replacing is therefore **never applied to a Codex group at all** — a strictly stronger guarantee
than "replaced", and the one that matters, since that tiebreak resolves *nested* windows within one
session and applying it across concurrent sessions would hand one session's Codex time to the other with
no trace of the mistake.

**Inherited versus replaced**, enumerated rather than summarized as "unchanged":

- **Inherited:** trace grouping, missing-`start_ts` handling, the total ordering, and single-candidate
  resolution — with the candidate set drawn from `cli=codex` windows. A Codex trace resolves as **one
  group and is never split**; a timestamp-less record is excluded from candidate narrowing and inherits
  its group's attribution.
- **Substituted — the near-miss set.** The baseline defines it with a `session_id`-matching term **no
  Codex run can satisfy**, so a literal reuse would always record an empty set and discard the one
  debugging artifact a miss leaves behind. For a Codex group it is **the `cli=codex` runs whose window
  contains at least one usable-timestamp member, in ascending `run_id` order**, emitted as `near-miss=`
  on every unattributed Codex outcome — emitted even when empty, so "no near-miss runs" stays
  distinguishable from "the token is missing".

**What attribution copies**, all of it from the **ledger run** and none of it from the span: `epic`,
`change_id`, `command`, `phase`, `agent_role`, `agent_label`, and `run_id`, with `cli` set to `codex`.

**`agent_role` comes from the ledger, never the span.** Codex appears at two sites with two meanings —
the read-only reviewer (`agent_role=codex`, owned by `skills/ptp-codex-mode/SKILL.md`) and the
`main=codex` implementer (`agent_role=main`, owned by `skills/ptp-run-at-model/SKILL.md`). **Nothing in a
Codex span distinguishes them**; the ledger does, because slice 1 recorded the role at the call site.
Collapsing them makes "how long does the reviewer take?" unanswerable — one of the questions the epic
exists to answer.

**`session_id`** carries **Codex's own** session identity as received, empty when absent. It is recorded
because the fixed 26-column schema has the column, is **never** used as a join key, and is **never**
borrowed from the shelling-out Claude session — that would make one column mean two things in one file.

**`run_id` on a Codex record is the transported correlation value, always.** This is the one behavior
change to the baseline attribution pass, and it is a change of *use*, not of schema: the baseline
overwrites `run_id` from the window join and **blanks** it when no window contains the record, which
would discard a value that arrived in resource `env`. For a Codex-origin record the join only **confirms**
the value and never overwrites or blanks it. Two things depend on this and nothing else does:

- the value survives an unattributed outcome, so it is still there to debug with; and
- a later `export` re-derives the correlation **from the persisted raw record by the same extraction the
  receiver used**, rather than reading back a `run_id` some earlier export projected — which, for a Codex
  record, it never is, by this very rule. Routing on re-export likewise reads the **persisted origin
  evidence**, never the `cli` value a previous export derived.

**What a later `export` recovers**, stated precisely because attribution tests `start_ts` and not arrival
time. A span flushed long after its window closed still has a start inside it and attributes normally. A
record whose `start_ts` **genuinely lies outside every `cli=codex` window is permanently unattributed** —
it resolves identically forever, and is reported as a settled outcome rather than as pending recovery.
The genuinely recoverable cases are exactly those where the **ledger** was unreadable at join time: the
run's open line not yet visible, or a trailing line torn. A **missing close line is not among them** —
§11.2 already treats an open run as extending to the present, so those attribute immediately.

### 22.5 The mapping, and the gaps that are escalated rather than fixed

The Codex span-name catalogue and the Codex column sources are **not defined here**: they are additions
to the **one** table each, in §10.3 and §10.4, consumed by both the receiver and `export` under §10.7's
single-source rule. Three recorded gaps travel with them, each an **advisory consequence** of the
decision record — noted as out of scope and proceeded past, never silently relaxed and never a reason to
add a field:

- **`cost_usd` is empty on every Codex LLM row** (**A-3**). Codex emits token counts and no cost; an
  exhaustive key sweep found no cost-bearing key at all. Availability is per column, so token counts
  populate while cost does not — the three are never treated as jointly available.
- **`tool_class` derives `other` for every Codex record** (**A-4**).
- **`span_kind` maps an uncatalogued Codex name to `other`** with its raw name retained (**A-2**).

Two further advisories are recorded without work: **A-5** — `otel.span_attributes` reaches spans only
(0/35 log records), so anything wanted per-record on the log signal must travel through
`otel.environment` → resource `env`; and **A-7** — Codex log events carry `user.email`,
`user.account_id`, a `prompt` attribute, and `arguments` / `output` **even with**
`otel.log_user_prompt = false`, so what the receiver retains is a deliberate decision.

### 22.6 The `status` Codex preflight — four read-only checks

`status` reports four checks. **None invokes Codex and none writes any file.**

| # | Check | How |
|---|---|---|
| 1 | Is `codex` on `PATH`? | a **filesystem lookup** along `PATH` (with `PATHEXT` on Windows) — never `codex --version`, which would *invoke* Codex and would miss `codex.cmd` |
| 2 | Is the configuration present? | the repository-scoped consent record of §22.3 records `consent: granted` |
| 3 | Does the endpoint match? | the record's `log_endpoint` versus `http://127.0.0.1:<resolved telemetry.port>/v1/logs` — compared at the **full path form** advisory A-1 requires |
| 4 | Does the credential match? | the store's credential against the record's `credential_fingerprint` — a **match verdict with neither value printed**, mirroring the credential verdict `status` already reports for the Claude side (§14.6) |

Checks 3 and 4 exist because of one silent failure reached two ways. A `telemetry.port` change after
setup leaves a **stale endpoint**, and an **absent credential** makes the receiver reject every batch —
either way Codex spans simply stop arriving with no error anywhere. Check 4 separates its two states
honestly, because they are not equally severe: an **absent credential file** is delivery-breaking and is
reported as such, while a **fingerprint mismatch** means the store's credential was replaced after
consent — the wiring reads the current credential, so delivery is unaffected and what is stale is the
**consent**, which is what the advice says.

The **overall verdict honors that separation** rather than flattening it: a fingerprint mismatch with a
credential present is reported as **configured, but the recorded consent is stale — delivery not
verified**, never as "rows will be absent", which is reserved for the states that genuinely break
delivery (no consent, a stale endpoint, or no credential at all). A verdict claiming absent rows beside
an advice line saying delivery is unaffected would be one report contradicting itself.

**An absent CLI is reported as absent**, with the remaining checks marked **not applicable** rather than
erroring; they are still computed from files, so nothing about the report depends on having probed a
process.

**The verdict is scoped honestly.** All four checks read `PATH` and files and none observes a batch, so a
fully-matching result is reported as **configured; delivery not verified** — never as a claim that Codex
is emitting or that the receiver is accepting. It is **not** described as detecting credential-*rejected
batches*: it detects a configured value that *will* be rejected, which is a weaker and different
statement, and conflating them would let a green preflight coexist with an empty store.

### 22.7 The degradation ladder, and why still no gate

`skills/ptp-codex-mode/SKILL.md` already resolves `codex.mode` ∈ `auto | required | off`, already decides
whether a Codex phase runs, and already forbids a silent skip. Every rung below is a **consequence of
that existing resolution, reused verbatim** — not a new design, and **not a new authority**:

| Rung | State | Outcome |
|---|---|---|
| 1 | `codex.mode = off`, or `auto` with the CLI absent | No process, nothing to attribute, **no Codex rows**. The absence is **stated, not silent** — the existing non-silent-skip rule already guarantees that |
| 2 | `required` with the CLI absent | **Exactly** what the existing mode resolution already does (it STOPs). No shell-out window and no rows. Listed because a ladder claiming to enumerate the states cannot skip one of the three modes |
| 3 | Codex runs, telemetry unconfigured — no consent recorded | The ledger still brackets the process, so the **wall time survives in the run ledger** for `0032_04_telemetry-report` to present. This slice claims **no presentation surface of its own** for it |
| 4 | Codex runs, configured, but **credential-rejected** | The same outcome as rung 3, and **the dangerous one: from outside it looks identical to success**, because the receiver rejects those batches (§9.4) without leaving even an `_unattributed` record. That is precisely why the credential belongs in what `setup` records and in what `status` checks |
| 5 | `codex mcp-server` | ptp does not use it and configures no telemetry for it. **Out of scope**, and nothing stronger is asserted about it |

**Metrics are deliberately not a rung.** Nothing answers `/v1/metrics`, so no metrics exporter is
configured at all; calling that a degradation would imply a signal is being collected and lost.

**Every rung degrades a row set or nothing. None degrades a ptp command.**

**The no-gate claim, scoped exactly.** What is forbidden is a ptp-side switch that could disagree with
`codex.mode` about **whether Codex ran**. It is **not** written as "no new key or decision point of any
kind", because that would be false: the user's consented opt-in is theirs to give, and the §22.3 consent
record is a ptp-read **telemetry-wiring** decision point. Both are permitted precisely because neither
can cause or suppress a Codex run.

**The rationale for adding no run gate**, recorded rather than assumed: a second authority over whether
Codex ran can disagree with the first, and the resulting failure is a report that **confidently shows
zero Codex time when Codex ran normally** — worse than no report at all.

---

## Hard rules

- **Default off.** `telemetry.mode` defaults to `off`; `telemetry.root` defaults to
  `openspec/telemetry`; `telemetry.port` defaults to `4318`; `telemetry.retentionDays` defaults to
  `30`.
- **Byte-identical when off.** With the mode not `on`, every write point returns right after the
  config read — creating no directory, no file, and altering no prompt, argument, or command line.
- **Never fail a ptp command.** Every telemetry operation is fire-and-forget: any error is swallowed
  and the observed command proceeds and reports exactly as it would have with telemetry off.
  Telemetry is never a precondition and never alters a terminal state. The **one** permitted effect on
  a pipeline command's output is the single non-blocking advisory line §5 grants the §15 lifecycle
  preflight; telemetry **writes** stay silent.
- **Single append only.** Every ledger, span, and CSV write is a single append of one line. **No
  read-modify-write of any of them, ever.** The exceptions are one-time or self-healing writes that are
  never appended to as data: the store's `.gitignore` / `.gitattributes` policy write (§2.1, §9.3), a
  CSV's BOM + header via the temp-file-then-create-only-rename protocol (§7, §9.7), the receiver's own
  lockfile (§14), and `export`'s staged replace-rename of a `spans.csv` — which is a **materialized
  view**, never the raw store.
- **The raw span store is append-only, immutable, and written only by the receiver** (§12.1). No
  `record_id`, no supersession, no dedup pass, no last-entry-wins rule exists anywhere in this layer.
- **The record shape is defined here and nowhere else** — the ledger record (§3), the span record and
  its 26 columns (§10), the OTel-attribute mapping (§10.4), and the `tool_class` table (§10.6). Every
  other shipped file references this skill; `scripts/ptp-otel-sink.js` carries the **one** executable
  implementation, which `export` calls rather than reimplementing (§10.7).
- **`run_id` is minted once and propagated**, never re-derived by a second writer.
- **`unclosed` is reader-derived** and is never written by any write point.
- **`status` is read-only** — it starts and stops nothing, creates no file or directory of its own,
  and runs no git, no branch guard, and no `openspec validate`. Its probe may cause the **receiver** to
  repair its own lockfile, which `status` reports (§14.6).
- **`export` requires the receiver stopped and never stops it** (§12.5); **no ptp command stops the
  receiver automatically and none requires it running** (§14.7).
- **`/ptp:telemetry setup` is the only ptp step that writes a Claude Code setting**, only on explicit
  confirmation, and is **never** reached automatically — including from the §15 preamble.
- **`report` never derives a field by subtraction** (§17.0). `wall − Σllm − Σtool` — an "other time"
  figure — exists nowhere, because the component sums overlap and the remainder can be negative.
- **Elapsed wall time is a union of intervals, never a sum of durations, and is never called a
  critical path** (§17.2). `concurrency_factor` is never described as a count of agents (§17.3) and is
  stated **undefined** rather than printed when wall time is zero or unavailable or work time is
  absent.
- **`report` reads only the derived files** — `spans.csv` and `runs.ndjson` — and **never `raw/`**;
  `_unattributed/spans.csv` reaches the **footer count alone** and no body figure (§17.4).
- **The §19 data-quality footer is mandatory** — never omitted, shortened, or suppressed, with every
  item present in the footer itself.
- **`report` creates no file, modifies no existing file, and deletes only aged raw files** (§20.1),
  and writes `<telemetry.root>/<epic>/report.md` only on the literal `write` keyword, which is
  stripped before the selector sees the argument (§16.2, §20.2). **The phrase "read-only" is never
  used for `report`, not even qualified.**
- **Pruning is `raw/`-only, reported-epic-only, and `report`-only** (§21): never `runs.ndjson`,
  `runs.csv`, or `spans.csv`; never anything under `<telemetry.root>/_unattributed/`; never triggered
  by any pipeline command; and never a file whose name does not parse as `YYYYMMDD.ndjson` or whose
  date is not strictly earlier than the cutoff.
- **No user-global Codex configuration is ever written, for any reason** (§22), and **no Codex
  configuration file of its own is written anywhere** — the selected mechanism is per-invocation
  `-c otel.*` arguments plus one repository-scoped ptp consent record. `codex.mode` remains the **only**
  authority over whether Codex runs; the consent record governs only whether telemetry wiring is
  appended, never whether Codex ran.
- **Codex routing is positive, at trace-group scope, and unanimous** (§22.4). The negative predicate
  ("whatever matches no ledger run is Codex") is forbidden, the span-name catalogue and the
  configuration path are never origin evidence, and a group with partial or conflicting evidence goes
  **wholly** to `_unattributed/` rather than being routed on its positive members.
- **Never modify the repository's root `.gitattributes`, and modify its root `.gitignore` only as
  `setup`'s confirmed managed-line addition** of `.claude/settings.local.json` (§13.4) — the one write
  outside `<telemetry.root>/`, required because that file carries the ingestion credential and must be
  untracked. The store otherwise carries its own policy inside `<telemetry.root>/`.
