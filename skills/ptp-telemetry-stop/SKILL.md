---
name: ptp-telemetry-stop
description: Take this store's OTLP receiver down manually — the verify-before-signal ordering (probe the recorded port, reload, verify pid liveness, pid identity, launch token and store identity, only then signal, and unlink only once the recorded port goes unserved), the absent-lockfile probe path that treats a missing record as unknown rather than as stopped, the outcome vocabulary the bundled receiver reports, and the posture that nothing but the receiver process and its own lockfile is ever touched. Reached from both `/ptp:telemetry stop` and `/ptp:telemetry-stop`, which are two front doors onto this one skill. The lockfile record, its three named states, the receiver's self-heal and the reload-after-probe rule stay in the `ptp-telemetry` skill and are cited here by anchor, never restated; so do the hard lifecycle rules that bind every lifecycle command.
---

<!-- ptp-telemetry:anchor id=stop-methodology class=leaf owner=stop -->
# ptp-telemetry-stop — the receiver stop action

## Purpose

This skill owns the **methodology of the manual `stop` action**: what `stop` verifies, in what order,
what it terminates, what it removes, and what it reports. That methodology is stated **here, once**,
and nowhere else in the repository's skill and command prose. To read it you need two contracts this
skill does not own: the **substrate lockfile contract** — the record `stop` reads and the three named
states it can be in — and the **shared hard lifecycle rules**. Both are cited below by anchor.

**Two front doors, one methodology.** `/ptp:telemetry stop` reaches this skill through the
`/ptp:telemetry` router and `/ptp:telemetry-stop` reaches it directly. Both run the same ordered
verification and report the same terminal outcome; neither command carries methodology of its own, so
the two can never disagree.

**What this skill does not own.** Not the lockfile record or its named states; not the receiver's
self-heal or the reload-after-any-probe obligation; not the identity/health wire contract its probe
speaks; not the hard lifecycle rules; not the auto-start preamble; not `start`, `status`, `setup`, or
`export`. Each has more than one consumer, so each stays in the `ptp-telemetry` skill and is cited
here rather than copied — in the form `` `ptp-telemetry` [anchor-id] ``, never by number and never by
paraphrase.

## Substrate dependencies

Every entry is a registered anchor in the `ptp-telemetry` skill. This list exists so a change to a
substrate region can find this dependent by grepping for the anchor id.

| Anchor (`ptp-telemetry`) | What this skill relies on it for |
|---|---|
| `lifecycle-identity-idempotence` | the three named lockfile states — `stale`, `live-non-matching`, `migration-conflict` — and, presupposed by a vocabulary of states *of a lockfile*, that the record exists at all; also idempotence by identity rather than occupancy, which is why a served port alone never counts as this store's receiver |
| `lockfile-self-heal` | the receiver's repair of its own lockfile, and the obligation on **every** lifecycle caller to re-read the lockfile after any probe that may have triggered that repair and to verify against the reloaded contents |
| `receiver-identity-wire-contract` | the identity/health wire contract this skill's probe speaks, and what a verifying answer reports |
| `lifecycle-status-read` | the shared hard lifecycle rules, and the shared one-JSON-object invocation-envelope convention every lifecycle action reports through — both stated there, neither restated here |
| `preamble-cache` | the auto-start preamble's optional cached-listener entry, whose invalidation a successful stop triggers |

Anchors are resolved by the substrate's **innermost enclosing sentinel** rule — the nearest preceding
sentinel at the same or shallower depth — not by the nearest numbered ancestor. That is why the named
lockfile states are cited as `` `ptp-telemetry` [lifecycle-identity-idempotence] `` and the hard
lifecycle rules and the invocation envelope as `` `ptp-telemetry` [lifecycle-status-read] ``, rather
than through the anchor on the enclosing sink lifecycle section — that one governs only the section's
own head matter, which this skill does not rely on, so it is deliberately absent from the list above.

**The lockfile is read by role, never by field list.** This skill names only the roles it uses — the
**recorded pid**, the **recorded port**, the **launch token**, and the **store identity** — and cites
neither the record's field enumeration nor its path. Both live elsewhere in the substrate's prose and
are being re-homed by a later slice; nothing here depends on where they land.

## The verify-before-signal ordering

The load-bearing invariant, in this order:

1. **Read the lockfile.**
2. **Probe the listener on the recorded port** — the port the lockfile records, **not** the configured
   `telemetry.port`. They can differ, and probing the configured one would verify the wrong listener
   (or find nothing) whenever they do.
3. **Reload the lockfile after the probe**, and verify against the **reloaded** contents, per
   `` `ptp-telemetry` [lockfile-self-heal] `` — which is where that obligation and its reason are
   stated. What this step fixes is only *where in `stop`'s sequence the reload fires*: immediately
   after the probe of step 2 and before any verification. **Dropped, `stop` verifies a healed listener
   against the pre-probe token and refuses a receiver whose lockfile that very probe just repaired** —
   the heal defeated exactly when it succeeds.
4. **Verify all five conjuncts** against the reloaded record: the recorded pid is **live**; the probe
   **answered**; the **launch token matches**; the **pid the listener reports equals the recorded
   pid**; and the **store identity matches**. Pid liveness and pid identity are different checks and
   both are required — a reused pid is live and is not this receiver. Any conjunct failing ends the
   sequence at an outcome below; nothing is signalled and nothing is removed.
5. **Only then signal** the recorded pid. This is the attempt, and the attempt is all it is: the
   signal's own failure is deliberately swallowed, and step 6's observation is the only subsequent
   check.
6. **Remove the lockfile only after the receiver is confirmed to have stopped answering on the
   recorded port** within the bounded wait. **Dropped, a `stop` that failed to bring the receiver down
   still deletes the only record of it** — leaving a knowingly live receiver with nothing describing
   it, reported as success.

**"Confirmed down", defined once and used throughout.** Below, **confirmed down** means exactly step
6's predicate — *signalled, and the recorded port then observed unserved within the bounded wait* —
and never an observation of process exit. The bounded wait re-probes only whether the recorded port is
**served**; it re-checks neither the listener's identity nor the pid behind it. Nothing in this skill
claims a confirmation stronger than that.

## The absent-lockfile path

**An absent lockfile is *unknown*, never "nothing is running."** Read the other way, the self-heal of
`` `ptp-telemetry` [lockfile-self-heal] `` would be unreachable from `stop` entirely.

With no lockfile, probe the **configured** `telemetry.port` for a listener reporting **this store's**
telemetry root — there is no recorded port to probe. Then:

- **nothing answers**, or something answers that does **not** report this store → genuinely stopped
  (`already-stopped`). A foreign listener holding the port is not this store's receiver, so `stop` has
  nothing of its own to take down.
- **one answers and reports this store** → its self-heal has just rewritten the lockfile, so **reload
  it** and run the ordinary verification of the section above.
- **one answers reporting this store, but no lockfile can be read even then** → `stop` refuses,
  terminates nothing, and removes nothing.

**Never kill on a port answer alone.**

## Outcomes

The vocabulary the bundled receiver reports, stated as shipped. Each is relayed inside the shared
one-JSON-object envelope of `` `ptp-telemetry` [lifecycle-status-read] ``.

| `action` | Meaning | Receiver after | Lockfile after |
|---|---|---|---|
| `stopped` | verified, signalled, **confirmed down**, and the lockfile unlinked | down | removed |
| `stopped` (`lockfile_removed: false`) | **confirmed down**, but the lockfile could not be unlinked for a reason other than its already being absent. The action value stays `stopped` because the receiver was **confirmed down** in exactly the sense defined above; the outcome carries a `message` rather than being silent, because only one half of stop-and-remove completed. It is not a claim that this invocation ended the process. | down | **left** |
| `already-stopped` | no lockfile could be read, and nothing answering for this store is on the configured port | down | not readable (may be absent), **unchanged** — "could not be read" covers an unreadable or unparseable file as much as a missing one, and `stop` removes nothing here |
| `stale-lockfile` | the lockfile is in the substrate's **`stale`** state (`` `ptp-telemetry` [lifecycle-identity-idempotence] ``). `stop`'s verb for that state: report it and **remove nothing** — replacing it is `start`'s business, not `stop`'s. | untouched | **left** |
| `mismatched-lockfile` | the **residual** branch: verification failed and the lockfile is **not** `stale`. Its usual cause is the substrate's **`live-non-matching`** state, which is not its definition — a live recorded pid with an unserved recorded port also lands here and is neither named state. `stop`'s verb: report it, terminate nothing, remove nothing. | untouched | **left** |
| `not-stopped` | the recorded process verified and was signalled, but the recorded port was **still served** when the bounded wait elapsed. The one `stop` outcome that leaves the receiver **up**. The lockfile is deliberately left intact — removing it would leave a knowingly live receiver with no record of itself — so the remedy is to re-run `stop` or end the reported pid by hand. | **up**, as the outcome reports it | **left** |
| `refused` | a listener **reporting this store** answered, but **no lockfile could be read** even then — which covers an unreadable or unparseable file as much as a missing one — so nothing was terminated | untouched | not readable (may be absent), **unchanged** |

**Both sides of the bounded wait observe the port, not the process.** `not-stopped`'s "still up" is
the outcome's own report on a still-served port, exactly as **confirmed down** is a report on an
unserved one; neither re-verifies the listener's identity or its pid. Stated once here so neither side
is read as process-level knowledge.

**`migration-conflict` produces no `stop` outcome of its own.** `stop` probes the **recorded** port,
so a receiver that a `telemetry.port` change stranded on its old port is verified and taken down by
the ordinary path above. That state is a condition `start` refuses on, not an outcome `stop` reports —
recorded here as a stated absence so this contract is not silent about one of the three states
`` `ptp-telemetry` [lifecycle-identity-idempotence] `` names.

**Two asymmetries with `start`**, because a reader arriving from `start` will assume otherwise:

- **`stop` has no `telemetry.mode` gate.** `start` refuses when the mode is not `on`; `stop` does not,
  and no such gate may be added. A mode-gated `stop` would make a live receiver unstoppable through
  ptp the moment the mode was switched off.
- **`stop` never removes a lockfile it did not verify.** `start` *replaces* a stale one — see
  `` `ptp-telemetry-start` [start-methodology] ``, which owns that verb and everything else about
  `start` — while `stop` reports it and removes nothing. Pids get reused, and killing a stranger's
  process is a worse failure than leaving a stale file.

## The posture — nothing else is touched

`stop` signals **at most one** process and removes **at most one** file. The ceiling is the point, and
the two are **ordered rather than paired**: removal happens only on a **confirmed down**, a confirmed
down can still be followed by a failed removal (the `lockfile_removed: false` row above), and every
outcome that signals nothing removes nothing. Nothing here guarantees that something is always killed.

Beyond that one process and that one file, `stop` touches nothing: it writes no `spans.csv` and no
`runs.csv`, appends no ledger row, reads and prunes no raw store, resolves no change selector, runs no
auto-start preamble, triggers no `export`, and changes no configuration.

## Running it

```
node <plugin>/scripts/ptp-otel-sink.js stop --repo <repo root>
```

The output is one JSON object per the shared envelope convention of
`` `ptp-telemetry` [lifecycle-status-read] ``; relay the `message` verbatim whenever one is present.

## One downstream consequence

A stop is a documented **cache-invalidation trigger** for the auto-start preamble's optional
cached-listener entry — see `` `ptp-telemetry` [preamble-cache] ``, which owns that cache and its
rules. This skill names the consequence and states no cache rule of its own.

## Hard rules

1. **Never terminate without a full verified match** — all five conjuncts of the ordering above, on
   the **reloaded** lockfile.
2. **Never remove a lockfile that was not verified.** Pids get reused; a stale or mismatched record is
   reported and left exactly where it is.
3. **Never infer that the receiver is stopped from an absent lockfile alone — probe first.** Absence
   alone is inconclusive; absence **plus** a probe that finds nothing answering for this store is what
   makes `already-stopped` conclusive.
4. **Never gate on `telemetry.mode`.**
5. **Write, prune, and export nothing.** One process signalled, one file possibly removed, and no
   other state changed anywhere.
6. **Start no receiver**, and run no auto-start preamble.
7. **Restate no substrate rule.** The lockfile record, its named states, the self-heal, the
   reload-after-probe obligation, the wire contract, and the hard lifecycle rules are cited by anchor
   and defined elsewhere.
