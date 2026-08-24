> Loaded from skills/ptp-telemetry/SKILL.md when: running the telemetry export subcommand.
## 12. `export`

<!-- ptp-telemetry:anchor id=raw-store-immutability class=substrate -->
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
twice and `ptp-telemetry-export` [export-determinism]'s total ordering orders non-identical rows just
as stably.

*Capability note, not a requirement on anything:* a consumer that must not double-count can
deduplicate on the **source-supplied** `(trace_id, span_id)` pair already in the record, **only where
both values are non-empty**. `/v1/logs` events may carry neither, and collapsing on an empty pair
would fuse unrelated events, so **duplicate id-less events are not reliably deduplicable in this
change** — an accepted, documented limit rather than something solved, since solving it needs the
record identity forbidden above. Those ids come from the emitter, so this is **not** a minted
`record_id` and licenses no dedup pass anywhere.

The rest of this section — the `export` contract — now lives in the `ptp-telemetry-export` skill (`skills/ptp-telemetry-export/SKILL.md`), which retains this section's subsection numbering; reach it as `/ptp:telemetry-export` or `/ptp:telemetry export`.

---

<!-- ptp-telemetry:anchor id=setup-methodology class=substrate -->