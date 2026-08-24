> Loaded from skills/ptp-telemetry/SKILL.md when: instrumenting a ptp step at its open and close write points.
## 6. Write points

Each write point states the §5 gate and the fire-and-forget rule at its own site, and **references
this skill** for the record shape rather than listing fields.

<!-- ptp-telemetry:anchor id=write-point-spawn-boundary class=substrate -->
### 6.1 `skills/ptp-run-at-model/SKILL.md` — the spawn boundary

Open **after** its step 4 (main-agent role resolution — the earliest point at which both `agent_role`
and `cli` are known) and **before** its step 5 (the main run). Close at its step 6 (Relay), the single
funnel both the `main=claude` and `main=codex` branches return through, mapping the three relayed
terminal states straight onto `outcome` per §3.4.

<!-- ptp-telemetry:anchor id=write-point-codex-exec class=substrate -->
### 6.2 The read-only `codex exec` reviewer call sites (`skills/ptp-codex-mode/SKILL.md`)

The **shelling-out Claude session** brackets the process window with `cli=codex`, `agent_role=codex`.
It already knows the epic, the change id, the command, and the exact window, so Codex attribution is
exact **with zero Codex-side metadata and no change to the `codex exec` command line**.

<!-- ptp-telemetry:anchor id=write-point-full-apply class=substrate -->
### 6.3 `workflows/ptp-full-apply.js` and its launcher `skills/ptp-full-apply/SKILL.md`

The workflow sandbox cannot read config and cannot write files, so the gate moves **outside**: the
launcher resolves `telemetry.mode` and passes an explicit top-level boolean in `args`. The workflow
**measures** each `agent()` window, **mints** that run's `run_id` at `t_start`, injects it into the
agent's prompt, and returns it; the launcher — which has `Bash` — appends **one post-hoc ledger run
per measured agent** with `agent_role=workflow-agent`, mapping outcomes per §3.4.

<!-- ptp-telemetry:anchor id=write-point-spawned-agents class=substrate -->
### 6.4 The spawned `ptp:ptp-apply` / `ptp:ptp-review` agents (optional fallback)

An agent given a `run_id` in its prompt MAY append **exactly one open line** under that id — never a
close line, never a CSV row — and never mints an id of its own. Scoping it to the open line keeps the
launcher the **sole** close/CSV writer, so `runs.csv` holds one row per closed run even when a run has
two ledger writers. An agent given no `run_id` writes nothing (§5's delegated gate). The append is
fire-and-forget: any error is swallowed and never alters the agent's own terminal state. Being
optional is harmless — skipping it costs only crash visibility.

<!-- ptp-telemetry:anchor id=command-bracket class=substrate -->
### 6.5 `skills/ptp-run-at-model/SKILL.md` — the outer-session command bracket

The **command bracket** is one ordinary ledger run over the **outer session** of a ptp command that
routes its main work through `ptp-run-at-model`, so that model rows whose trace group falls wholly
inside the bracket's window but outside every spawned run's window still carry the invoking command,
its phase, and the resolved change id instead of landing in `_unattributed/`.

It is an **ordinary run in every respect but two**: same record shape ([ledger-record]), same
two-line open/close form and mint-once-then-propagate rule ([append-protocol]), same derivations —
which this section deliberately does **not** restate. Only two values are fixed here:

| Field | Value |
|---|---|
| `agent_role` | `main` |
| `cli` | `claude` |

and the label, which is the ordinary `<work>:<id>` form with the command name prefixed:
`command-<name>:<change_id>` — for example `command-plan:0057_01`, or `command-backlog-run:` for an
epic-level or unresolved invocation, whose id half is empty.

**Why the `command-` prefix, and not the bare command name.** The report derives review-loop
iteration numbering by grouping runs that share change id, `command`, `phase`, and `agent_label`;
`agent_role` is **not** part of that key. A bracket labelled `plan:0057_01` would therefore be fused
with the spawned run of the same command and counted as an extra iteration, tripping the "more runs
than the cap allows" footer flag on every run of a loop at its configured cap. Prefixing the `<work>`
half removes the collision without touching the report's grouping rule.

**Placement.** The **open** line is appended in the slot `ptp-run-at-model` already occupies for
telemetry: **after** its auto-start preamble — so the receiver is already listening — and **before**
§6.1's ledger open for the spawned main run. It **reuses the preamble's single resolution of
`telemetry.mode`** and resolves nothing of its own, so the telemetry-off path still performs exactly
one layered configuration read. The **close** line is appended where that skill relays the main run's
terminal result, with `outcome` mapped straight through per §3.4, and appended **after** §6.1's own
close line, before the outer session reports.

That ordering is not cosmetic. It is what makes the bracket's window **strictly enclose** the spawned
run's, which is the sole premise of the next paragraph.

**Containment, not new attribution logic.** No attribution rule changes here. Because the bracket
opens before and closes after every run spawned within it, the existing ledger join ([ledger-join])
**normally** resolves a span inside an inner run's window to that **inner** run — which keeps its
**own** role/CLI pair from [write-point-role-table], `subagent`/`claude` for the `main=claude` spawn
or `main`/`codex` for the `main=codex` shell-out — and resolves an outer-session span, whose only
candidate is the bracket, to the bracket. Every span still resolves to exactly **one** run, so a
total summed over runs stays a partition of the rows and **no span is counted twice**.

**The millisecond tie, and why the partition survives it.** "Opens before" is an *ordering*, not a
strict inequality: ledger timestamps carry milliseconds, so a bracket open and the inner open
appended microseconds apart can share a `t_start`. The join then falls to its existing
smallest-`run_id` tie-break ([ledger-join-window-rules]), and under the default minting scheme
([ledger-record]) `command-plan:…` sorts before `plan:…` — so on a tie the **bracket** wins and the
span is attributed one level coarser than intended. Nothing about the rule is changed to prevent
this, and the word **normally** above is doing real work. The cost is bounded and is stated rather
than hidden: a tie resolved to the bracket coarsens only the **role/label** breakdown, because a
bracket and the runs it encloses carry the **same** `command`, `phase`, `epic`, and `change_id` — so
every per-command, per-phase, and per-change total is unchanged, and the span still resolves to
exactly one run. Two **nested brackets** cannot tie this way at all: an outer command must route,
run its preamble, and reach `ptp-run-at-model` step 4 before an inner one can start, so their opens
are separated by whole turns rather than microseconds. Tightening the join to prefer the narrower
window would change an existing shared rule and is out of scope here.

**Nesting.** When one ptp command invokes another inline in the same session, more than one bracket
may be open at once. **Both are written.** The inner one has the later `t_start` and wins containment
for the spans it encloses — by the paragraph above it cannot tie with an outer bracket. No writer
ever reads the ledger to decide whether to open a bracket — doing so would break the invariant
([append-protocol]) that makes concurrent appends safe.

**Four scope limits, stated rather than hidden.** None of them is papered over, and none is absorbed
by backdating the bracket's `t_start`, forward-dating its `t_end`, or splitting a trace group:

1. **Non-funnel commands.** A ptp command that does not route its main work through
   `ptp-run-at-model` — `/ptp:backlog-run`, whose unwrapped outer-session execution contract is
   deliberate, is the standing example — opens **no** bracket, and its outer-session spans stay in
   `_unattributed/`.
2. **Rows before the bracket's own open.** The bracket cannot enclose what happens before it is
   written, and its earliest possible write point is inside `ptp-run-at-model` step 4. The routing
   turn that selected the command, and the command/skill **description** inventory the CLI loads
   before any skill body runs, therefore stay outside every run window. This is structural — no
   ptp-authored line executes before the model has already read the descriptions.
3. **Rows after the bracket's own close.** Symmetrically, the close is appended at the relay, before
   the outer session reports, so the final reporting turn — the model call that renders the command's
   summary — falls after `t_end` and stays unattributed. No ptp-authored line runs after the
   session's last output, so no later close point exists.
4. **Trace groups that straddle either line.** Attribution is per *trace group*: the join selects a
   run only when its window contains **every** span of the group ([ledger-join]). A group spanning
   the open or the close therefore resolves to **no** run and stays in `_unattributed/`, even though
   some of its rows sit inside the window.

The bracket's claim is thus over the trace groups contained **between** its two lines — the command's
machinery — not over the literal first-to-last byte of its session. What is left out is left visibly
out.

**Gate and failure ordering.** The bracket is an ordinary telemetry **data write**: gated on
`telemetry.mode` per §5 (mode not `on` ⇒ no directory created, no file touched, nothing written), and
otherwise **fire-and-forget** — every error swallowed, never delaying past its own write, never
altering the command's terminal state, output, or ordering. A killed command leaves an open line with
no close, which the reader reports as `outcome=unclosed` exactly like any other interrupted run.

---

<!-- ptp-telemetry:anchor id=csv-dual-write class=substrate -->