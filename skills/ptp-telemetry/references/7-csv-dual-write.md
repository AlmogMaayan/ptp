> Loaded from skills/ptp-telemetry/SKILL.md when: maintaining the CSV mirror alongside the ledger.
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

<!-- ptp-telemetry:anchor id=status-methodology class=leaf owner=status -->