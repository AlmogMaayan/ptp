> Loaded from skills/ptp-telemetry/SKILL.md when: running or debugging the receiver process.
## 9. The OTLP receiver

<!-- ptp-telemetry:anchor id=receiver-artifacts-and-store class=substrate -->
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

<!-- ptp-telemetry:anchor id=receiver-identity-wire-contract class=substrate -->
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

<!-- ptp-telemetry:anchor id=receiver-write-path class=substrate -->
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
- Gitignored by the managed line above, written **after** that line exists (`ptp-telemetry-setup` [setup-consent-scope]).

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

<!-- ptp-telemetry:anchor id=raw-entry-envelope class=substrate -->
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

<!-- ptp-telemetry:anchor id=receiver-two-appends class=substrate -->
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

<!-- ptp-telemetry:anchor id=span-record class=substrate -->