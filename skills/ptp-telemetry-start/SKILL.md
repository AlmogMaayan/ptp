---
name: ptp-telemetry-start
description: Own starting the local ptp telemetry receiver so that later runs are recorded
---

# ptp-telemetry-start — the receiver start action

## Purpose

This skill owns the **methodology of the manual `start` action**: what `start` does, in what order,
and what it reports. That methodology is stated **here, once**, and nowhere else. It is the verb —
the shared nouns it is evaluated against stay in the substrate.

**Two front doors, one methodology.** `/ptp:telemetry start` reaches this skill through the
`/ptp:telemetry` router and `/ptp:telemetry-start` reaches it directly. Both perform the same ordered
sequence and report the same terminal outcome. Neither command carries methodology of its own, so the
two can never disagree.

**What this skill does not own.** Not the identity/health wire contract; not the auto-start preamble;
not the receiver executable (`scripts/ptp-otel-sink.js`), where it is resolved from, or what happens
when it cannot be located; not `stop`; not `status`; not `setup`. Each of those has more than one
consumer, so each stays in the `ptp-telemetry` skill and is cited here rather than copied.

**Citation posture.** Every substrate contract this skill depends on stays in
`skills/ptp-telemetry/SKILL.md` and is cited by its **anchor id** — the form
`` `ptp-telemetry` [anchor-id] `` — never restated and never paraphrased. A section number appears
only as a parenthetical gloss, never as the citation.

## Substrate dependencies

Every entry is an anchor in the `ptp-telemetry` skill. This list exists so a change to a substrate
region can find this dependent by grepping for the anchor id.

| Anchor (`ptp-telemetry`) | What this skill needs from it |
|---|---|
| `receiver-identity-wire-contract` | the identity/health wire contract the probe speaks, and what a verifying answer compares (§9.2) |
| `receiver-write-path` | the write path and the managed `.gitignore` policy this action reconciles (§9.3) |
| `receiver-artifacts-and-store` | where the receiver script lives, and the non-fatal refusal when it cannot be located (§9.1) — substrate because the auto-start preamble resolves the same script |
| `start-methodology` | the lockfile path and its field contract, retained in the substrate's start stub (§14.1) |
| `lifecycle-identity-idempotence` | idempotence by **identity, not occupancy**, the single-listener / single-writer invariant (§14.2), and the three named lockfile states — `stale`, `live-non-matching`, `migration-conflict` — which that same anchor governs (§14.3) |
| `lockfile-self-heal` | the receiver-owned lockfile repair and the reload-after-any-probe rule (§14.4) |
| `lifecycle-status-read` | the hard lifecycle rules (§14.7) and the receiver's invocation lines and action values (§14.8), which that anchor governs |
| `auto-start-preamble` | the auto-start preamble, including its own `preamble` action vocabulary (§15, §15.8) |

Anchors are derived by the substrate's **innermost-region** rule — the nearest preceding sentinel at
the same or shallower depth — not by the nearest numbered ancestor. That is why the three named
lockfile states are cited as `` `ptp-telemetry` [lifecycle-identity-idempotence] `` (§14.3) and the
hard lifecycle rules and invocation lines as `` `ptp-telemetry` [lifecycle-status-read] ``
(§14.7, §14.8), rather than as `` `ptp-telemetry` [sink-lifecycle] ``, which governs only the sink
lifecycle section's own head matter and which this skill therefore does not cite.

<!-- ptp-telemetry:anchor id=start-methodology class=leaf owner=start -->
## The start sequence, in fixed order

**Step 0 — read the lockfile once, up front**, and record whether it exists. The seven steps below
read against a lockfile that **exists**; the cold start is the ordinary case, so the absent branch is
stated rather than implied.

The branch below decides only which of steps 2–4 apply. **Step 1's mode gate runs first in both
branches** — an absent lockfile never brings the probe or the launch forward past it.

**Absent lockfile.** There is no *recorded* port, so **skip step 2** — a `migration-conflict` is
defined over a recorded port differing from the configured one, and none is recorded — and probe the
**configured** port only. Step 4 has nothing to replace. Then:

- the configured port is **unserved** → nothing to verify and nothing to replace: fall straight
  through to steps 5, 6 and 7 (reconciliation, launch, the first lockfile write);
- a listener **answers** → this is **not** "nothing is running". The receiver repairs its own lockfile
  before answering any probe (`` `ptp-telemetry` [lockfile-self-heal] ``), so **reload** the lockfile
  and run step 3's ordinary verification against the reloaded contents: a match is the no-op, a
  non-verifying answer is the served-port conflict. **Never launch on an absent lockfile plus a served
  port.**

**Lockfile present.** The seven steps run as written.

1. **Mode gate.** When `telemetry.mode` is not `on`, **refuse non-fatally**, naming `telemetry.mode`.
   The manual path may not bring up a receiver the gate would forbid from writing.

2. **Port-migration check — before the configured-port probe.** It runs **inside `start` itself** and
   is never delegated to the preamble, because a port change is exactly when the configured port
   probes free: a probe-first order would find it free and launch a second receiver for one store,
   destroying the only record of the first. The `migration-conflict` **condition** is
   `` `ptp-telemetry` [lifecycle-identity-idempotence] ``'s (§14.3's state list, which that anchor
   governs) and is not restated here; this step owns only the ordering and the verb. Establishing a
   **live, identity-matching** receiver requires probing the lockfile's **recorded** port, and that
   probe can itself trigger the self-heal — so **reload the lockfile and re-verify against the
   reloaded contents, per `` `ptp-telemetry` [lockfile-self-heal] `` (§14.4), before deciding or
   reporting `migration-conflict`.** That rule states the obligation for deciding to start, to stop,
   **or to report a conflict**; step 3 is not its only application. On the state: start nothing, leave
   that lockfile intact, and report that it must be stopped first.
   **A recorded port that differs is not a two-way branch.** Only a recorded port in the `stale` state
   falls through to step 3; a recorded port that is `live-non-matching`, or whose recorded process is
   still live, is refused on the same terms as `migration-conflict` — start nothing, leave the lockfile
   intact, report it — because launching on the newly-configured port would overwrite the only record
   of what is still running. Both state conditions are
   `` `ptp-telemetry` [lifecycle-identity-idempotence] ``'s (§14.3) and are not restated here.

3. **Identity probe.** Verify the answer against the **reloaded** lockfile per
   `` `ptp-telemetry` [receiver-identity-wire-contract] `` (§9.2), which states what a verifying answer
   compares. Decide per `` `ptp-telemetry` [lifecycle-identity-idempotence] `` (§14.2) — its
   identity-not-occupancy principle and its single-listener / single-writer invariant are stated
   there, and only the per-answer branches are stated here:
   - a **served** port whose answer **verifies** → **no-op**, reporting the existing pid;
   - a **served** port whose answer does **not** verify → a **non-fatal conflict naming
     `telemetry.port`**, and no second listener is started on it;
   - an **unserved** port is **not** a conflict — it falls through to step 4 and on to the launch.

4. **Stale lockfile.** The `stale` state is
   `` `ptp-telemetry` [lifecycle-identity-idempotence] ``'s (§14.3), and that state's own meaning —
   including that it may be replaced rather than that it blocks — is stated there. What this step adds
   is that **`start` is the actor** and that the replacement sits **here**, after the probe and before
   the reconciliation.

5. **Managed `.gitignore` reconciliation — before the lockfile is created.** The policy itself is
   `` `ptp-telemetry` [receiver-write-path] `` (§9.3). It runs here because **whoever creates the file
   protects it**: the manual-start-without-`setup` path reaches no other policy writer, so the
   lockfile could otherwise land in an unignored store.

6. **Launch.** A **bind failure** — the port held by an unrelated process — is **reported**, never
   retried silently, and points at `telemetry.port` as the remedy.

7. **Lockfile write.** Written **per the substrate field contract**,
   `` `ptp-telemetry` [start-methodology] `` (the retained §14.1 stub), which is not re-enumerated
   here. This is the **last** step, **after** the launch, because that contract requires **process
   metadata that does not exist until the process does**. A bind failure therefore leaves **no**
   lockfile behind, which is the correct state for a receiver that never came up. Step 5's ordering
   guarantee — the reconciliation precedes the lockfile's creation — is preserved exactly, and is not
   a claim that the write precedes the launch.

## Terminal outcomes

These are the **receiver executable's** action values, which this skill **documents** rather than
defines (`` `ptp-telemetry` [lifecycle-status-read] `` records the invocation lines and the value set,
§14.8):

| Outcome | What to relay |
|---|---|
| `started` | the receiver came up: report it, with the port it bound and the pid recorded. |
| `already-listening` | nothing was launched: report the **existing** pid, and that this invocation was a no-op. |
| `refused` | report the refusal and the key it names — `telemetry.mode` for the mode gate, `telemetry.port` for a served-port conflict or a migration conflict — together with the receiver's own `message`. Non-fatal in every case. |
| `start-failed` | report the failure and the receiver's `message`, naming `telemetry.port` when the cause was a bind failure. Nothing is retried silently. |

## Running it

Before the session's **first** real launch of the receiver, run the canonical CRLF self-heal step of
`skills/ptp-workflow-cache-heal/SKILL.md`, which is where that step is defined; never inline its
command body here. The `ptp-telemetry` skill keeps its own reference to the same heal skill for the
auto-start path's launch of the same script — two references to a third skill are two invocation
edges, not a duplicated rule.

```
node <plugin>/scripts/ptp-otel-sink.js start --repo <repo root>
```

**The auto-start path is not this line.** The preamble runs the executable's own **`preamble`**
action, and records `started_by=auto` itself — see `` `ptp-telemetry` [auto-start-preamble] ``
(§15.8). The `--started-by` flag therefore exists, and this path never sets it.

## Hard rules

**Applied — this action's verb; the rule itself lives in the substrate and is cited, not restated:**

1. This skill **launches nothing when the probe verifies**, and **launches nothing on a served port
   that does not** — per `` `ptp-telemetry` [lifecycle-identity-idempotence] ``, which holds why
   occupancy is not identity and carries the single-listener / single-writer invariant.
2. This skill **overwrites no lockfile that verifies a live identity-matching receiver for this
   store**, on this port or another — the `live-non-matching` and `migration-conflict` states and their
   meanings are `` `ptp-telemetry` [lifecycle-identity-idempotence] ``'s (§14.3).
3. This skill verifies against the **reloaded** lockfile after **any** probe it performs, never against
   the pre-probe copy — **including** the migration check's probe of the recorded port, not only the
   configured-port probe. The reload obligation is `` `ptp-telemetry` [lockfile-self-heal] ``'s; what
   this rule adds is that *both* of this action's probes are covered.
4. This skill **stops nothing and requires nothing to be running** — the general form is
   `` `ptp-telemetry` [lifecycle-status-read] ``'s hard lifecycle rules (§14.7).

**Leaf-owned — no substrate counterpart:**

5. **Never retry a bind failure silently.** Report it, and name `telemetry.port`.
6. **Refuse non-fatally, naming `telemetry.mode`, when the mode is not `on`** — the manual path may not
   bring up a receiver the gate would forbid from writing.
7. **Write no Claude Code setting, and never invoke `setup`.** `start` writes only telemetry-store
   metadata — the managed `.gitignore` lines and its own lockfile — and automating that is not
   permission to automate a settings write.
