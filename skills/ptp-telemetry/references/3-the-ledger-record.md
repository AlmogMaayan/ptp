> Loaded from skills/ptp-telemetry/SKILL.md when: writing or reading a ptp run ledger record.
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

<!-- ptp-telemetry:anchor id=command-phase-mapping class=substrate -->
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

<!-- ptp-telemetry:anchor id=write-point-role-table class=substrate -->
### 3.3 Write-point → `agent_role` / `cli` table

| Write point | `agent_role` | `cli` |
|---|---|---|
| `ptp-run-at-model` foreground Claude subagent spawn (`main=claude`) | `subagent` | `claude` |
| `ptp-run-at-model` `main=codex` write-capable shell-out | `main` | `codex` |
| A read-only `codex exec` reviewer call site (`ptp-codex-mode`) | `codex` | `codex` |
| A `ptp-full-apply` measured `agent()` call | `workflow-agent` | `claude` |
| The outer-session command bracket (§6.5) | `main` | `claude` |

The `main`/`claude` pairing is emitted by that one write point (§6.5) and by no other.

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
| `ptp-full-apply` review agent | `terminalState: FIX_TARGET_ESCALATION` | `needs-human-action` |
| Any `ptp-full-apply` agent | `null` / unparseable result | `needs-human-action` |

No case is left unmapped, so **no close line can ever carry an empty `outcome`**.

---

<!-- ptp-telemetry:anchor id=append-protocol class=substrate -->