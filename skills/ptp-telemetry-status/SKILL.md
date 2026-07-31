---
name: ptp-telemetry-status
description: The read-only `/ptp:telemetry status` report — the resolved telemetry.mode and telemetry.root, and the per-epic total / closed / unclosed run counts with `_unattributed/` reported as its own bucket alongside the epics. Reached from both `/ptp:telemetry status` (including the omitted-argument default) and `/ptp:telemetry-status`, which are two front doors onto this one skill. Holds the `status` methodology only; every substrate contract it depends on stays in the `ptp-telemetry` skill and is cited here by anchor, never restated.
---

# ptp-telemetry-status — the read-only `status` contract

## Purpose

This skill owns the **methodology** of the read-only `/ptp:telemetry status` report: the report's
steps, its strictly-read-only posture, and its three states. That methodology is stated **here, once**,
and nowhere else.

**Two front doors, one methodology.** `/ptp:telemetry status` reaches this skill through the
`/ptp:telemetry` router (an omitted argument defaults to `status`), and `/ptp:telemetry-status` reaches
it directly. Both print the same report. Neither command carries methodology of its own, so the two can
never disagree.

**Citation posture.** This skill owns its subcommand's methodology and **reads** the substrate for
everything else. Every substrate contract it depends on stays in `skills/ptp-telemetry/SKILL.md` and is
cited here by its **anchor id** — the form `` `ptp-telemetry` [anchor-id] `` — never restated, never
paraphrased, and never cited by section number.

## Substrate dependencies

Every entry is an anchor in the `ptp-telemetry` skill. This list exists so a change to a substrate
region can find this dependent by grepping for the anchor id.

| Anchor (`ptp-telemetry`) | What this skill needs from it |
|---|---|
| `config-resolution` | resolving `telemetry.mode` / `root` / `port` with the forgiving reader, independently of whether a store exists |
| `store-layout` | the per-epic store layout and the `_unattributed/` bucket reported alongside the epics |
| `append-protocol` | the reader reduction that makes a run closed or unclosed, counted once per `run_id` |
| `gate-ordering` | why the `_unattributed` count is the health signal it is |
| `receiver-identity-wire-contract` | the identity/health wire contract the probe speaks |
| `lifecycle-identity-idempotence` | idempotence by identity, and the lockfile's two never-conflated states |
| `lockfile-self-heal` | where the receiver-owned lockfile repair, and the qualification it places on the read-only posture, are defined |
| `lifecycle-status-read` | the environment / receiver / lockfile reporting list itself, which stays in the substrate |
| `preamble-env-gate` | the environment-agreement gate, per key, plus the non-gating drift keys |
| `codex-canonical-rendering` | the canonical Codex wiring rendering the endpoint and credential checks resolve against |
| `codex-consent-record` | the repository-scoped consent record the preflight reads |
| `codex-status-preflight` | the read-only Codex preflight checks themselves, which stay in the substrate |

<!-- ptp-telemetry:anchor id=status-methodology class=leaf owner=status -->
## 8. `status` methodology (read-only)

### 8.1 The report

`/ptp:telemetry status`:

1. Resolves `telemetry.mode` and `telemetry.root` per `` `ptp-telemetry` [config-resolution] `` —
   **independently of whether a store exists**.
2. Reports the **resolved mode** and the **resolved root** (absolute path shown for clarity).
3. If **no store exists**, reports its **absence** — and still reports the independently resolved
   mode alongside it. **An absent store never implies `mode=off`**: a store can legitimately be absent
   with the mode on (nothing has run yet). It **creates nothing**.
4. If a store exists, reports **per epic directory** (per `` `ptp-telemetry` [store-layout] ``): the
   **total**, **closed**, and **unclosed** run counts, counting each `run_id` **once** per
   `` `ptp-telemetry` [append-protocol] ``'s reduction (a run with any close line is closed; an open
   line with no close line is `unclosed`).
5. Reports `_unattributed/` as **its own bucket alongside the epics**, never folded into an epic and
   never omitted, so its count stays visible as the health signal
   `` `ptp-telemetry` [gate-ordering] ``'s step 4 routes rows to it for.

**Strictly read-only.** It creates no directory and no file, and runs **no git command, no
`ptp-branch-guard`, and no `openspec validate`**.

### 8.2 The three states

**The three states, stated unambiguously:**

| State | Report |
|---|---|
| `telemetry.mode` resolves to `off` | `telemetry.mode = off`, the resolved root, and a note that no telemetry is being recorded. Whether a store exists is still reported from a read-only inspection; nothing is created. |
| Mode `on`, no store | `telemetry.mode = on`, the resolved root, and **"no telemetry store exists at this root"** — no directory or file is created by the report. |
| Mode `on`, one unclosed run | `telemetry.mode = on`, the resolved root, and per-epic counts including `unclosed: 1` **distinguished from** the closed count (e.g. `0032 — total: 4, closed: 3, unclosed: 1`). |

## What the substrate reports through this command

The rest of what `status` reports is specified in the substrate, not here:

- What `status` reports about the environment, the receiver, and the lockfile is specified in
  `` `ptp-telemetry` [lifecycle-status-read] ``.
- The `status` Codex preflight is specified in `` `ptp-telemetry` [codex-status-preflight] ``.

## Not to be confused with /ptp:status

`/ptp:telemetry-status` is about the **telemetry store**. `/ptp:status` is the unrelated OpenSpec
command that reports the change lifecycle. They collide by word and nothing else — never route one to
the other, and never file a change against the wrong capability because of the shared word. This is the
same disambiguation the `ptp-telemetry` skill already draws between `/ptp:telemetry analyze` and
`/ptp:analyze`.

## Hard rules

- **Strictly read-only.** `status` creates **no directory and no file**, and runs **no git command, no
  `ptp-branch-guard`, and no `openspec validate`**.
- **`status` never creates the store, and never infers the mode from it.** The mode is resolved from
  configuration independently, and an **absent store never means `telemetry.mode=off`**.
- For the lifecycle guarantees this read-only posture rests on, and for the single qualification the
  substrate places on it, see `` `ptp-telemetry` [lifecycle-status-read] `` — they are stated there and
  are not restated here.
- **No selector.** This skill takes no argument and resolves **no** change selector.
- **No `ptp-run-at-model`.** This skill does not use it.
- **Cite the substrate; never restate it.** Every dependency on `skills/ptp-telemetry/SKILL.md` is a
  citation of a registered **anchor id** in the form `` `ptp-telemetry` [anchor-id] ``. This file
  carries **no** cross-file `§N` citation, and holds no copy or paraphrase of any substrate contract.
