> Loaded from skills/ptp-telemetry/SKILL.md when: auto-starting telemetry at the head of an instrumented step.
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
5. **Otherwise run the executable's own `preamble` action (§15.8), recording `started_by=auto`** —
   idempotent under §14.2's single-listener invariant and the §14.3 states — then poll the identity
   endpoint for readiness within §15.4's cap: silent when it answers in time, one non-blocking
   advisory when the start fails or the cap elapses.

<!-- ptp-telemetry:anchor id=preamble-env-gate class=substrate -->
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
managed `.gitignore` lines (§9.3) and its own pidfile. Automating the second is not permission to
automate the first. Requiring the env to be present before auto-starting is what keeps ptp from ever
running a listener for a session that cannot emit into it.

<!-- ptp-telemetry:anchor id=preamble-readiness-bound class=substrate -->
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

<!-- ptp-telemetry:anchor id=preamble-cache class=substrate -->
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

<!-- ptp-telemetry:anchor id=report-methodology-stub class=substrate -->