---
name: ptp-telemetry
description: Own the ptp telemetry contract, its store layout, its record shapes, and its append protocol
---

# ptp-telemetry — the ptp run ledger contract

<!-- ptp-telemetry:anchor id=purpose class=substrate -->
## Purpose

ptp runs the same pipeline across many agents and CLIs but has emitted no durable timing data.
This skill is the **single source of truth** for the *attribution spine* that fixes that: a per-epic,
append-only **run ledger** plus a flat CSV view, gated by a `telemetry.mode` that defaults to `off`.

The single-source-of-truth posture is the same one `ptp-codex-mode` holds for the canonical `codex
exec` flag-append rule and `ptp-branch-guard` holds for branch safety. Every consumer — the write
points in `skills/ptp-run-at-model/SKILL.md`, `skills/ptp-codex-mode/SKILL.md`,
`skills/ptp-full-apply/SKILL.md`, `workflows/ptp-full-apply.js`, `agents/ptp-apply.md`,
`agents/ptp-review.md`, and `commands/telemetry.md` — **references** this skill. None of them restates
the record shape, the `run_id` rule, the CSV rules, or the gate ordering.

**Two layers, one skill.** §§1–8 are the **run ledger** — the attribution spine, which contains no
OpenTelemetry at all. §§9–15 are the **span layer** added by `0032_02_otel-sink-and-csv`: a loopback
OTLP receiver, the 26-column `spans.csv` it dual-writes, the join that gives a span an epic, the raw
store the `export` action re-derives from, the `env` block the `setup` action writes, and the
lockfile and identity contract the `start` / `stop` / `status` actions act on. The span layer
**consumes** the ledger and never redefines it.

**Substrate only.** Each `/ptp:telemetry` subcommand's own methodology now lives in its own
`ptp-telemetry-<name>` skill, reached from either `/ptp:telemetry <sub>` or `/ptp:telemetry-<sub>`.
What stays here is what more than one of them depends on. The *Retired sections* map below names,
for each number a leaf took, the leaf that now owns it.

---

<!-- ptp-telemetry:anchor id=substrate-map class=substrate -->
## Section index

Operation-scoped sections of this contract live in `references/`, each loaded on its own
trigger rather than with this file:

- `skills/ptp-telemetry/references/1-config-resolution.md` — loaded when resolving the telemetry.* config keys for any telemetry subcommand.
- `skills/ptp-telemetry/references/2-store-layout.md` — loaded when locating or creating the telemetry store on disk.
- `skills/ptp-telemetry/references/3-the-ledger-record.md` — loaded when writing or reading a ptp run ledger record.
- `skills/ptp-telemetry/references/4-append-protocol.md` — loaded when appending a line to the run ledger.
- `skills/ptp-telemetry/references/5-gate-and-failure-ordering.md` — loaded when deciding whether telemetry is enabled before any write.
- `skills/ptp-telemetry/references/6-write-points.md` — loaded when instrumenting a ptp step at its open and close write points.
- `skills/ptp-telemetry/references/7-csv-dual-write.md` — loaded when maintaining the CSV mirror alongside the ledger.
- `skills/ptp-telemetry/references/8-status-methodology.md` — loaded when running the telemetry status subcommand.
- `skills/ptp-telemetry/references/9-the-otlp-receiver.md` — loaded when running or debugging the receiver process.
- `skills/ptp-telemetry/references/10-the-span-record-and-csv-schema.md` — loaded when mapping a received span onto the spans CSV schema.
- `skills/ptp-telemetry/references/11-the-ledger-join.md` — loaded when joining ledger runs to received spans.
- `skills/ptp-telemetry/references/12-export.md` — loaded when running the telemetry export subcommand.
- `skills/ptp-telemetry/references/13-telemetry-setup.md` — loaded when running the telemetry setup subcommand.
- `skills/ptp-telemetry/references/14-the-sink-lifecycle.md` — loaded when starting or stopping the telemetry sink.
- `skills/ptp-telemetry/references/15-the-auto-start-preamble.md` — loaded when auto-starting telemetry at the head of an instrumented step.
- `skills/ptp-telemetry/references/16-telemetry-report.md` — loaded when running the telemetry report subcommand.
- `skills/ptp-telemetry/references/17-the-two-headline-numbers.md` — loaded when computing the report headline numbers.
- `skills/ptp-telemetry/references/18-breakdowns-and-time-sinks.md` — loaded when building the report breakdown views.
- `skills/ptp-telemetry/references/19-the-data-quality-footer.md` — loaded when emitting the report data-quality footer.
- `skills/ptp-telemetry/references/20-write-posture-and-empty-cases.md` — loaded when writing a report file, or reporting an empty window.
- `skills/ptp-telemetry/references/21-retention.md` — loaded when applying the retention window to the store.
- `skills/ptp-telemetry/references/22-codex-telemetry.md` — loaded when instrumenting a codex exec window.

## 0. The substrate map and the leaf reference contract

This skill is a **shared substrate** plus the private methodology of the individual
`/ptp:telemetry` subcommands. This section states, once, where that boundary runs, how to cite across
it, and what a leaf may and may not restate. It changes no rule below it — it classifies and names
them.

### 0.1 Anchors and classes are two different things

An **anchor** is a stable, number-independent citation handle. A section carries one — whatever its
class — exactly when a citation of it must survive extraction: when its class differs from its
parent's, when it closes a nested region, when it is cited **by anchor** from another file, or when
it is cited across the substrate/leaf boundary. A subsection meeting none of those needs none: a
citation carrying only a number — from within this file, or from either of LR-3's two `§N`-exempt
bundled scripts, neither of which obliges an anchor on its target — stays valid on §0.3's frozen
numbering alone, which is why §0.1–§0.5 themselves carry no sentinel of their own. A **class** — `substrate` or `leaf` — says
who owns the region and which change may move it. Keeping the two apart is what lets a substrate section cite a leaf section through a
registered handle without either promoting the leaf or leaving a dangling reference.

### 0.2 The sentinel and the region rule

Every anchored heading carries, on the line immediately above it:

    <!-- ptp-telemetry:anchor id=<kebab-id> class=substrate|leaf [owner=<subcommand>] -->

`id` is kebab-case, drawn from the section's subject rather than its number, and unique file-wide.
`owner` is present **iff** `class=leaf` and names the subcommand that owns the methodology.

**A sentinel opens a region that extends to the next sentinel at the same or shallower heading
depth.** There is no closing sentinel — heading depth already totally orders the file, and pairing
is a source of bugs. So a `leaf` `##` may contain a `substrate` `###` and a `substrate` `##` may
contain subsections that serve a leaf but stay substrate; both occur below.

**Regions nest, and the innermost one governs.** A `###` sentinel opens a region *inside* its parent
`##` region without ending it, so a heading's class is the class of the **nearest preceding sentinel
at the same or shallower depth than that heading** — §12.1 sits inside `export`'s region but is
governed by its own `substrate` sentinel, and stays here when `export` leaves.

The partition runs from `## Purpose` to the end of the file, and every `##` and `###` heading in it
has **exactly one** governing region. The two unnumbered sections that bracket the numbered range —
`## Purpose` and `## Hard rules` — were left outside the partition while the leaves were being
extracted and are now **inside** it: each carries its own `class=substrate` sentinel and its own
registry row. No terminator clause is needed any more, because `## Hard rules`' own `##` sentinel
ends the preceding region by the ordinary depth rule rather than by a named exception.

Anchor ids are **stable for the life of the plugin**. Renaming one is a breaking change to every
citer.

### 0.3 Section numbering is frozen

**Section numbers never change, and a vacated number is never reused.** The file is never
renumbered. When a leaf's methodology is extracted into its own skill, the **extracted region's own
heading** — at whatever depth it sits, `##` or `###` — and its number **stay here as a redirect
stub**, body replaced by one line naming the skill it moved to; and the
extracted skill **preserves the subsection numbering**, so `§23.4` there means what `§23.4` meant
here.

The stub is kept at the **extracted region's** heading, not at every number beneath it: a subsection
carried along with its parent (§12.3 with §12, §17.5 with §17.3–§17.7) leaves no stub of its own, and
a `§12.3` citation resolves through §12's stub — where the pointer names the owning leaf, under the
number `§12.3` still carries there — plus the retired-section map below. A subsection that is itself
the extracted region (§14.5) keeps its own stub by the same rule.

Both halves are needed. Freezing alone guarantees only that a number never comes to mean something
else; the stub is what keeps a citation of an *extracted* section resolving. `scripts/ptp-otel-sink.js`
and `scripts/ptp-telemetry-analyze.js` cite leaf sections heavily (§12.x, §13.1/§13.3/§13.4, §14.1,
§14.5, §17.5, §18.2, §19.4, §20.4, §21.x, §23.x), and this pair of rules is exactly what lets every
one of those citations stay correct and unedited through every extraction.

**What this guarantees, and what it does not.** The guarantee is *citation resolvability*: no
extraction rewrites a `§N` token in either script, changes the numbering convention those tokens rely
on, or touches any logic or executable line. It is not byte-immutability, because frozen numbering
cannot preserve a **file-identity** fact: each script header's `Normative contract:` line names the
file that *owns* the methodology it implements, and when an extraction moves that methodology the line
would otherwise assert something false about what is now a stub. Repointing that one comment line is
therefore permitted to the extracting change, and nothing else in the script is.

This is not a style preference. The `§N` citation form is used by roughly 400 references inside this
file and by roughly 250 more inside `scripts/ptp-otel-sink.js` and
`scripts/ptp-telemetry-analyze.js`, whose header comments are normative. Renumbering would invalidate
all of them at once. Freezing keeps every one of them correct, so leaf extraction touches only the
citations extraction itself makes cross-file.

### 0.4 The leaf reference contract

- **LR-1 — No restatement.** A leaf never restates a substrate normative statement; it cites the
  anchor. This is the rule the Purpose section already applies to this skill's external consumers,
  extended inward.
- **LR-2 — Duplication only where the substrate pins it.** A leaf may hold a second copy of a
  substrate *value* only where the substrate itself declares that duplication by design — today, only
  §10.7's single-executable-copy rule. A leaf licenses no new duplication of its own.
- **LR-3 — Anchor citation form.** A citation **from another file** of a section that carries a
  registered anchor names that anchor: `` `ptp-telemetry` [config-resolution] ``. The `§N` form is
  retained in exactly three cases, and this list is closed:
  1. **Inside this file**, where §0.3's frozen numbering keeps it valid.
  2. **Inside `scripts/ptp-otel-sink.js` and `scripts/ptp-telemetry-analyze.js`.** Their normative
     header comments carry roughly 250 `§N` citations and **keep** them: frozen numbering is precisely
     what makes those citations permanently valid, and rewriting a shipped executable's citation form
     would add behavior risk for no gain. This exemption covers **these two files only**.
  3. **A citation whose target carries no anchor at all** — which, because §0.5's registry anchors
     *every* substrate section and subsection cited from a leaf region, can only be a **leaf-owned**
     subsection of a *different* leaf. Such a citation keeps `§N` and resolves through frozen
     numbering plus that leaf's redirect stub, so the citing leaf never has to name a sibling skill.
     This case never covers a substrate target: a leaf citing an unanchored substrate section means
     the **anchor is missing**, and §0.5 is amended rather than the citation left on a number.
- **LR-4 — Declared dependencies.** An extracted leaf opens with a *Substrate dependencies* list
  naming the anchors it relies on, so a substrate change can find its dependents by grep.
- **LR-5 — Direction and normativity.** A substrate→leaf citation is permitted **only** through a
  registered anchor and **only** as a non-normative pointer. A substrate rule may never depend on a
  leaf statement; where it would, the leaf statement is promoted to substrate instead. Two such
  promotions exist today and are marked in the registry: **§12.1** (the raw store's mutability
  contract, which §9.6's single-writer assertion depends on) and **§13.2** (the eight `env` keys,
  which §10.4's column-population gate and §15.2's four-key preamble gate both depend on, and which
  `skills/ptp-run-at-model/SKILL.md` already cites as the one place they are enumerated). **Both stay
  in this file when the `export` and `setup` leaves are extracted.** Because a promoted subsection
  may not be left without a parent heading, **every leaf `##` that contains a `substrate` `###` —
  §12, §13, and §17 — keeps its heading and its number as a substrate stub**: heading text unchanged,
  sentinel flipped to `class=substrate`, the substrate subsections verbatim beneath it, plus one line
  pointing at the extracted skill. (For §17 that is §17.0–§17.2; §17.3–§17.7 leave with `report`.)
  A leaf section containing no substrate subsection keeps the plain redirect stub of §0.3 instead —
  heading and number retained, body replaced by the one pointer line.

  This is about *direction*, not notation: a substrate→leaf pointer written inside this file keeps
  the `§N` form per LR-3, and "through a registered anchor" means the **target** carries a registered
  anchor, so the pointer survives that target's extraction. **Naming a region as a region is not a
  citation in this sense**: `§0` describes the partition by enumerating its leaf sections — including
  ranges such as `§12.x` and `§23.x` that name no single heading — to say where the boundary runs, not
  to reach a rule across it, and so obliges no anchor. Every *pointer* does.

### 0.5 The anchor registry

| Anchor id | Section | Class | Owner |
|---|---|---|---|
| `purpose` | `## Purpose` | `substrate` | — |
| `substrate-map` | 0 | `substrate` | — |
| `config-resolution` | 1 | `substrate` | — |
| `telemetry-root-validation` | 1.1 | `substrate` | — |
| `store-layout` | 2 | `substrate` | — |
| `store-git-policy` | 2.1 | `substrate` | — |
| `ledger-record` | 3 | `substrate` | — |
| `command-phase-mapping` | 3.2 | `substrate` | — |
| `write-point-role-table` | 3.3 | `substrate` | — |
| `append-protocol` | 4 | `substrate` | — |
| `gate-ordering` | 5 | `substrate` | — |
| `write-points` | 6 | `substrate` | — |
| `write-point-spawn-boundary` | 6.1 | `substrate` | — |
| `write-point-codex-exec` | 6.2 | `substrate` | — |
| `write-point-full-apply` | 6.3 | `substrate` | — |
| `write-point-spawned-agents` | 6.4 | `substrate` | — |
| `command-bracket` | 6.5 | `substrate` | — |
| `csv-dual-write` | 7 | `substrate` | — |
| `status-methodology` | 8 | `leaf` | `status` |
| `otlp-receiver` | 9 | `substrate` | — |
| `receiver-artifacts-and-store` | 9.1 | `substrate` | — |
| `receiver-identity-wire-contract` | 9.2 | `substrate` | — |
| `receiver-write-path` | 9.3 | `substrate` | — |
| `raw-entry-envelope` | 9.6 | `substrate` | — |
| `receiver-two-appends` | 9.7 | `substrate` | — |
| `span-record` | 10 | `substrate` | — |
| `span-csv-columns` | 10.1 | `substrate` | — |
| `span-value-encodings` | 10.2 | `substrate` | — |
| `span-kind-set` | 10.3 | `substrate` | — |
| `otel-attribute-mapping` | 10.4 | `substrate` | — |
| `raw-record-superset` | 10.5 | `substrate` | — |
| `tool-class-mapping` | 10.6 | `substrate` | — |
| `single-source-mapping-rule` | 10.7 | `substrate` | — |
| `ledger-join` | 11 | `substrate` | — |
| `ledger-join-window-rules` | 11.2 | `substrate` | — |
| `join-never-drops` | 11.4 | `substrate` | — |
| `export-methodology` | 12 | `substrate` | — |
| `raw-store-immutability` | 12.1 | `substrate` | — |
| `setup-methodology` | 13 | `substrate` | — |
| `telemetry-env-keys` | 13.2 | `substrate` | — |
| `setup-merge-semantics` | 13.3 | `leaf` | `setup` |
| `setup-consent-scope` | 13.4 | `leaf` | `setup` |
| `sink-lifecycle` | 14 | `substrate` | — |
| `start-methodology` | 14.1 | `substrate` | — |
| `lifecycle-identity-idempotence` | 14.2 | `substrate` | — |
| `lockfile-self-heal` | 14.4 | `substrate` | — |
| `stop-methodology` | 14.5 | `leaf` | `stop` |
| `lifecycle-status-read` | 14.6 | `substrate` | — |
| `auto-start-preamble` | 15 | `substrate` | — |
| `preamble-env-gate` | 15.2 | `substrate` | — |
| `preamble-readiness-bound` | 15.4 | `substrate` | — |
| `preamble-cache` | 15.5 | `substrate` | — |
| `report-methodology-stub` | 16 | `substrate` | — |
| `report-headline-numbers` | 17 | `substrate` | — |
| `banned-subtraction` | 17.0 | `substrate` | — |
| `aggregate-work-time` | 17.1 | `substrate` | — |
| `elapsed-wall-time` | 17.2 | `substrate` | — |
| `report-breakdowns-stub` | 18 | `substrate` | — |
| `data-quality-footer-obligation` | 19 | `substrate` | — |
| `report-write-posture-stub` | 20 | `substrate` | — |
| `retention-stub` | 21 | `substrate` | — |
| `codex-telemetry` | 22 | `substrate` | — |
| `codex-canonical-rendering` | 22.2 | `substrate` | — |
| `codex-consent-record` | 22.3 | `substrate` | — |
| `codex-status-preflight` | 22.6 | `substrate` | — |
| `codex-degradation-ladder` | 22.7 | `substrate` | — |
| `analyze-methodology` | 23 | `leaf` | `analyze` |
| `hard-rules` | `## Hard rules` | `substrate` | — |

**The registry is a bijection over this file's own sentinels**, with two recorded exceptions:
`setup-merge-semantics` (§13.3) and `setup-consent-scope` (§13.4) name anchors that **left with the
`setup` leaf** and now carry their sentinels in `skills/ptp-telemetry-setup/SKILL.md`. Their rows are
kept — a citer holding one of those ids finds here where it went — but they are the only two rows
with no sentinel in this file. Every other row's id appears exactly once as a sentinel here, and
every sentinel's id appears exactly once here.

Two entries are **promotions** recorded by §0.4's LR-5 — `raw-store-immutability` (§12.1) and
`telemetry-env-keys` (§13.2) are `substrate` inside `leaf` parents, and stay in this file when the
`export` and `setup` leaves are extracted.

**This registry is complete in the leaf→substrate direction.** Every `substrate` section and
subsection cited from any `leaf` region of this file carries an anchor here, so an extracted leaf can
always convert such a citation to LR-3's anchor form. A `leaf` subsection cited only from another
`leaf` gets no anchor on that ground — it is private to the subcommand that owns it, and LR-3 case 3
keeps that citation on `§N`, resolved by the redirect stub. If a leaf is ever found citing a
`substrate` section that has no row here, the row is **added**; the citation is not left on a number.

**The substrate→leaf direction is satisfied by frozen numbering plus the stub, not by a row per
target** — which is what makes LR-5 satisfiable rather than merely asserted. A `substrate` region may
*point at* a `leaf` region only as a non-normative pointer, and such a pointer written **inside this
file** keeps the `§N` form LR-3 case 1 allows: the target's number is frozen, its heading survives
here as a stub, and the retired-section map names the leaf that now owns it, so the pointer resolves
in at most one hop rather than dangling. LR-5's "through a registered anchor" is a claim about the
**target**, not about this table: once a leaf is extracted, its own registry becomes the authority
over the ids it owns, and an extracted target's anchor lives there — §17.3 and §17.5, for instance,
are registered in `ptp-telemetry-report`, and §12.3 in `ptp-telemetry-export`. A target keeps a row
**here** only while its id must still be resolvable from this file, which is why some retired targets
(§13, §13.4, §14.1, §21) have one and others do not. Where a `substrate` region cites a leaf **across
files** by anchor id — §12.1's `` `ptp-telemetry-export` [export-determinism] `` is the one such
citation today — the id is verified in that leaf's registry, never added to this one. A `leaf` subsection that no `substrate`
region points at, and that only a sibling `leaf` cites, still gets no anchor: that is LR-3 case 3.

---

## Retired sections — where each subcommand's methodology went

Section numbers below are **retired, not reused**. Surviving sections keep the numbers they have
always had, and every retired number resolves in at most one hop: a retired **region** keeps a stub at
its own heading (§0.3), and a subsection that travelled with its parent is found through that parent's
stub and through this table. So every external `ptp-telemetry §N` citation still resolves — including
the roughly 250 in `scripts/ptp-otel-sink.js` and `scripts/ptp-telemetry-analyze.js`, whose `§N`
tokens no extraction ever rewrites (§0.3's one carve-out is each script's `Normative contract:` header
line, which names a file rather than a section). This table
is navigation over section **numbers**; §0.5's registry is the authority over anchor **ids**. Neither
replaces the other, and neither states a rule.

| Retired | Now owned by |
|---|---|
| §8 | `ptp-telemetry-status` |
| §12.2–§12.6 | `ptp-telemetry-export` |
| §13.1, §13.3, §13.4, §13.5 | `ptp-telemetry-setup` |
| §14.1 (the `start` action) | `ptp-telemetry-start` |
| §14.5 | `ptp-telemetry-stop` |
| §16 | `ptp-telemetry-report` |
| §17.3–§17.7 | `ptp-telemetry-report` |
| §18 | `ptp-telemetry-report` |
| §19.1–§19.5 | `ptp-telemetry-report` |
| §20 | `ptp-telemetry-report` |
| §21 | `ptp-telemetry-report` |
| §23 | `ptp-telemetry-analyze` |

**A number absent from this table stayed substrate** and is not retired — §12.1, §13.2, §17.0–§17.2,
§19's footer obligation, and all of §14.2, §14.6, §14.8, §15 and §22 including §22.6. Where a retired
number's own heading still holds substrate prose beside its pointer — §14.1's lockfile contract, §12's
§12.1, §13's §13.2, §17's §17.0–§17.2, §19's footer obligation — that prose is substrate and stays;
the row names only the methodology that left. §14.8 is neither retired nor whole: it keeps its
substrate prose and carries a pointer per moved fragment — one to `ptp-telemetry-start`, one to
`ptp-telemetry-stop` — at the subsection itself, where a `§14.8` citer lands, which is why a
single-owner row could not describe it.

---

<!-- ptp-telemetry:anchor id=config-resolution class=substrate -->
## 23. `analyze` — moved to `skills/ptp-telemetry-analyze/SKILL.md`

The `analyze` methodology moved to `skills/ptp-telemetry-analyze/SKILL.md`, which keeps this section's `§23.1`–`§23.10` numbering.

---

<!-- ptp-telemetry:anchor id=hard-rules class=substrate -->
## Hard rules

- **Default off.** `telemetry.mode` defaults to `off`; `telemetry.root` defaults to
  `openspec/telemetry`; `telemetry.port` defaults to `4318`; `telemetry.retentionDays` defaults to
  `30`.
- **Byte-identical when off.** With the mode not `on`, every write point returns right after the
  config read — creating no directory, no file, and altering no prompt, argument, or command line.
- **Never fail a ptp command.** Every telemetry operation is fire-and-forget: any error is swallowed
  and the observed command proceeds and reports exactly as it would have with telemetry off.
  Telemetry is never a precondition and never alters a terminal state. The **one** permitted effect on
  a pipeline command's output is the single non-blocking advisory line §5 grants the §15 lifecycle
  preflight; telemetry **writes** stay silent.
- **Single append only.** Every ledger, span, and CSV write is a single append of one line. **No
  read-modify-write of any of them, ever.** The exceptions are one-time or self-healing writes that are
  never appended to as data: the store's `.gitignore` / `.gitattributes` policy write (§2.1, §9.3), a
  CSV's BOM + header via the temp-file-then-create-only-rename protocol (§7, §9.7), the receiver's own
  lockfile (§14), and `export`'s staged replace-rename of a `spans.csv` — which is a **materialized
  view**, never the raw store.
- **The raw span store is append-only, immutable, and written only by the receiver** (§12.1). No
  `record_id`, no supersession, no dedup pass, no last-entry-wins rule exists anywhere in this layer.
- **The record shape is defined here and nowhere else** — the ledger record (§3), the span record and
  its 26 columns (§10), the OTel-attribute mapping (§10.4), and the `tool_class` table (§10.6). Every
  other shipped file references this skill; `scripts/ptp-otel-sink.js` carries the **one** executable
  implementation, which `export` calls rather than reimplementing (§10.7).
- **`run_id` is minted once and propagated**, never re-derived by a second writer.
- **`unclosed` is reader-derived** and is never written by any write point.
- **No ptp command stops the receiver automatically and none requires it running** (§14.7). The one
  lifecycle dependency runs the other way and belongs to `ptp-telemetry-export`.
- **`report` never derives a field by subtraction** (§17.0). `wall − Σllm − Σtool` — an "other time"
  figure — exists nowhere, because the component sums overlap and the remainder can be negative.
- **Elapsed wall time is a union of intervals, never a sum of durations, and is never called a
  critical path** (§17.2). `concurrency_factor` is never described as a count of agents (§17.3) and is
  stated **undefined** rather than printed when wall time is zero or unavailable or work time is
  absent.
- **The §19 data-quality footer is mandatory** — never omitted, shortened, or suppressed, with
  every item present in the footer itself. (`analyze` has its own mandatory footer, §23.7, which
  neither replaces nor satisfies this one.)
- **No user-global Codex configuration is ever written, for any reason** (§22), and **no Codex
  configuration file of its own is written anywhere** — the selected mechanism is per-invocation
  `-c otel.*` arguments plus one repository-scoped ptp consent record. `codex.mode` remains the **only**
  authority over whether Codex runs; the consent record governs only whether telemetry wiring is
  appended, never whether Codex ran.
- **Codex routing is positive, at trace-group scope, and unanimous** (§22.4). The negative predicate
  ("whatever matches no ledger run is Codex") is forbidden, the span-name catalogue and the
  configuration path are never origin evidence, and a group with partial or conflicting evidence goes
  **wholly** to `_unattributed/` rather than being routed on its positive members.
- **Never modify the repository's root `.gitattributes`, and modify its root `.gitignore` only as
  `setup`'s confirmed managed-line addition** of `.claude/settings.local.json` (`ptp-telemetry-setup` [setup-consent-scope]) — the one write
  outside `<telemetry.root>/`, required because that file carries the ingestion credential and must be
  untracked. The store otherwise carries its own policy inside `<telemetry.root>/`.
- **Section numbering is frozen** (§0.3). A section's number never changes and is never reused;
  extracting a leaf leaves its number here as a **redirect stub**, and the extracted skill preserves
  its subsection numbering — the file is never renumbered, because roughly
  400 citations here and roughly 250 more in `scripts/ptp-otel-sink.js` and
  `scripts/ptp-telemetry-analyze.js` are keyed to these numbers.
- **Every section whose citations must survive extraction carries an anchor, and a cross-file
  citation of an anchored section names the anchor, never the number** (§0.1, §0.2, LR-3). That is
  not every section: a subsection cited only by number from inside this file — §0.1–§0.5 among them —
  needs none, because frozen numbering already keeps such a citation valid. Anchor ids are stable for
  the life of the plugin; renaming one is a breaking change to every citer. `§N` remains the citation
  form **inside this file**; inside the two bundled executables `scripts/ptp-otel-sink.js` /
  `scripts/ptp-telemetry-analyze.js` — the one closed two-file exemption, which frozen numbering keeps
  correct; and in a citation of a section that has no anchor, which §0.5's completeness rule confines,
  across the substrate/leaf boundary, to one leaf citing another leaf's private subsection.
- **A leaf never restates a substrate normative statement** (LR-1) and licenses no duplication of its
  own (LR-2) — §10.7's single-executable-copy rule is the only duplication this skill pins. An
  extracted leaf opens with a *Substrate dependencies* list naming the anchors it relies on (LR-4).
- **A substrate→leaf citation is non-normative and passes through a registered anchor** (LR-5). A
  substrate rule never depends on a leaf statement; where it would, the leaf statement is promoted —
  which is why **§12.1** and **§13.2** are `substrate` inside `leaf` parents and stay in this file.
