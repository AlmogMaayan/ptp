> Loaded from skills/ptp-review-loop/SKILL.md when: rendering a review-cycle tally table.
## Review-cycle tally table

The single normative owner of the review-cycle tally table format. Every surface that prints a tally
cites this document by path and restates none of it — where a printer disagrees with this document,
this document wins. This format is never placed in a command file, because the `prompt-compaction`
capability pins an ordinary command body to `## Arguments`, `## Owner`, `## Report`.

## Caption

Above the table, one caption line naming the change id and the producing run's own terminal-state
literal. The terminal-state literal is reproduced **verbatim** from the run that produced it — this
format defines no terminal-state vocabulary of its own and never normalizes, abbreviates, or
substitutes a synonym for the run's own literal. A mode-skipped terminal state (for example
`PHASE 1 DONE — CODEX SKIPPED (mode=off)`) is reproduced exactly, never flattened into a plain done
state.

## Columns and alignment

The table carries exactly eight columns, in this order:

`Reviewer | Cycles | Found | Accepted | Rejected | Below threshold | Fixed | Capped`

`Reviewer` is left-aligned; the seven count columns (`Cycles`, `Found`, `Accepted`, `Rejected`,
`Below threshold`, `Fixed`, `Capped`) are right-aligned.

The seven count columns map one-to-one onto the `reviewTally` fields defined by the
`review-cycle-tally` capability:

| Column | `reviewTally` field |
|---|---|
| `Cycles` | `cycles` |
| `Found` | `found` |
| `Accepted` | `accepted` |
| `Rejected` | `rejected` |
| `Below threshold` | `belowThreshold` |
| `Fixed` | `fixed` |
| `Capped` | `capped` |

`reviewTally` carries an eighth field, `droppedManual`, that gets **no column**. Its absence is why
`Found` may exceed `Accepted` plus `Rejected` plus `Below threshold` without a finding having been
lost — the gap is exactly the dropped count. The `review-cycle-tally` reconciliation identity
(`found = droppedManual + belowThreshold + rejected + accepted`) is checked against the tally object,
never against this table's visible columns; a reader who wants the `droppedManual` gap on screen adds
a column to this document rather than re-deriving it downstream.

## Row set

One row per reviewer in the run's **configured** reviewer set — the phases the run was configured to
run — and no row for a reviewer outside that set.

A configured reviewer that never ran renders as a **skip row** and is **never omitted**: its
`Reviewer` cell names the reviewer together with the run's own stated reason for the skip
(`<reviewer> — skipped (<reason>)`), and each of its seven count cells carries an em dash (`—`)
rather than a number.

## Unknown counts

A count cell whose value cannot be sourced from `reviewTally` carries the literal `unknown`. Never
`0`, never blank, never any other numeral — `0` would be a fabricated measurement. `unknown` applies
**per cell**, so a partially populated tally still renders the counts it has: a reviewer with a known
`cycles` and `found` but no readable `capped` renders `Cycles` and `Found` as numbers and `Capped` as
`unknown`.

## Totals row

A per-change totals row sums each count column, always rendered — even for a table with a single
reviewer row, so a reader may rely on its presence unconditionally.

The sum includes only numeric cells: a skip row's em dash and an `unknown` cell contribute nothing and
are never coerced to `0`. Numeric cells only, no coercion of `—` or `unknown`.

When any row is a skip row **or** carries an `unknown` count cell, the totals row's label reads
`Total (partial)` rather than `Total`, so a partial sum is never read as complete.

## Empty case

When the run's configured reviewer set is empty, render the caption followed by the literal word
`None`, and render no header, no rows, and no totals row.
