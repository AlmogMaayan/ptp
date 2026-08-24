> Loaded from skills/ptp-telemetry/SKILL.md when: starting or stopping the telemetry sink.
## 14. The sink lifecycle

```
        ┌──────────── stop ────────────┐
        ▼                              │
   [not running] ── start ──▶ [listening] ── start ──▶ [listening]  (no-op, reports existing pid)
        ▲                              │
        │                              ├─ process dies ─▶ [stale lockfile]
        └──── start (replaces stale) ──┘
```

<!-- ptp-telemetry:anchor id=start-methodology class=substrate -->
### 14.1 `start`

The **start action** is performed by **`skills/ptp-telemetry-start/SKILL.md`** (reached from
`/ptp:telemetry start` and `/ptp:telemetry-start`); the lockfile contract below stays here, because
§14.4's self-heal and §15.5's pid-reuse guard both read it.

The receiver's lockfile is **`<telemetry.root>/.ptp-otel-sink.pid`** — in the store root, so it
follows a customized `telemetry.root` instead of drifting from the data it describes — recording:
`pid`, `port`, `started_at`, `started_by` ∈ `manual|auto`, a **launch token** minted at start, the
**OS-reported process start time** and the executable path (so a recorded pid can be told from a later
process that reused it, which is what makes §15.5's cheap cache validation an actual pid-reuse guard),
and the `repo_root` and `telemetry_root` the receiver was started with.

<!-- ptp-telemetry:anchor id=lifecycle-identity-idempotence class=substrate -->
### 14.2 Idempotence is by *identity*, not occupancy

An **occupied** port is not the same thing as this store's receiver being up. A listener counts as
this store's receiver **only** when it answers §9.2's probe as a ptp sink whose **launch token matches
the lockfile** and whose **repository root and `telemetry_root` match this invocation**. A served port
that is anything else — an unrelated process, or a sink for another repo or store — is **not** this
store's receiver, and is a conflict rather than an "already up": occupancy alone would silently
deliver a second repository's spans into the first repository's store.

This holds identically whether `start` was typed or reached through the §15 preamble, so no sequence
of ptp commands produces a second listener per store — **while the store's lockfile is intact**. State
that boundary rather than an absolute: with the lockfile **deleted** *and* `telemetry.port` changed, a
manual `start` finds the new port free and a second *listener* does come up. What stays unconditional
is the **single-writer** guarantee of §9.3's port-drift gate: only the receiver on the currently
configured port ever writes, so the store keeps one writer even in the state where it briefly has two
listeners.

### 14.3 Three lockfile states, never conflated

A closed, **named** vocabulary. Each state is defined by its **condition**; what an action *does*
about a state belongs to that action.

- **Stale** (`stale`) — the recorded process is not live **and** the recorded port is unserved. Treated
  as **absent and replaced**, so a crashed receiver never permanently blocks a restart.
- **Live but non-matching** (`live-non-matching`) — the recorded port is served by a listener that does
  not verify. **Not replaced**: overwriting it would discard the only record of what is running while
  that listener still holds the port. Reported as a conflict needing explicit resolution; nothing is
  started.
- **Migration conflict** (`migration-conflict`) — the lockfile verifies a **live, identity-matching**
  receiver for this store on a **different** port than the resolved `telemetry.port`.

<!-- ptp-telemetry:anchor id=lockfile-self-heal class=substrate -->
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

<!-- ptp-telemetry:anchor id=stop-methodology class=leaf owner=stop -->
### 14.5 `stop`

The **stop action** is contracted in **`skills/ptp-telemetry-stop/SKILL.md`** (reached from
`/ptp:telemetry stop` and `/ptp:telemetry-stop`), which holds its verification ordering, its outcomes,
and its posture in full.

<!-- ptp-telemetry:anchor id=lifecycle-status-read class=substrate -->
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
  it is live (`ptp-telemetry-export` [export-requires-receiver-stopped]) — it never terminates it, and it is not a pipeline command, so **no pipeline
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

Before the session's **first** real launch of the receiver **by any path** — manual or the §15
preamble, whichever actually launches the script — run the
canonical CRLF self-heal step of `skills/ptp-workflow-cache-heal/SKILL.md`, whose glob covers cached
`scripts/*.js` as well as cached `workflows/*.js`. A `\r` injected into the shipped receiver by a
Windows checkout breaks it exactly as it breaks a workflow script, and the heal is idempotent and a
no-op when the cache is absent. Reference that skill; never inline its command body here.

```
node <plugin>/scripts/ptp-otel-sink.js status --repo <repo root>
```

`start`'s invocation line and its action values are in `skills/ptp-telemetry-start/SKILL.md`.
`stop`'s invocation line, its action values, and the outcome that leaves the receiver running are in
`skills/ptp-telemetry-stop/SKILL.md`.

Each prints one JSON object carrying `action` and, where the outcome is anything other than plain
success, a `message` to relay. `status` always reports `action: status` — it has
no failure form, since it decides nothing and changes nothing.

---

<!-- ptp-telemetry:anchor id=auto-start-preamble class=substrate -->