#!/usr/bin/env node
/**
 * ptp-telemetry-analyze — the predefined analysis engine over the ptp span store.
 *
 * Normative contract: `skills/ptp-telemetry/SKILL.md` §23. That section owns the methodology; this
 * file is its one executable copy. Changing §23 and changing this file is one change, never two.
 *
 * This file **consumes** records that `scripts/ptp-otel-sink.js` has ALREADY mapped: it reads
 * `span_kind`, `tool_class`, `tool_name`, `model`, `duration_ms`, `bash_command` and `raw_span_name`
 * as given values and re-derives NEITHER §10.4's OTel-attribute -> column table NOR §10.6's
 * `tool_class` bucket decision. §10.7's single-executable-copy rule is therefore untouched rather
 * than needing to be re-argued: there is still exactly one implementation of each table, and it is
 * not here. (§23.6's bash-by-command key does reuse §10.6's shared *tokenisation* primitive — segment
 * split plus head normalisation — which names a command rather than resolving a bucket. That is the
 * one named, permitted overlap, and it decides nothing §10.6 decides.)
 *
 * Posture (§23.8): analyze **creates no file, modifies no existing file, and deletes nothing.** It
 * runs no git command, no branch guard, and no `openspec validate`, and it prunes nothing — §21's
 * "during `report` and nowhere else" gains no exception here.
 *
 * Invocation:
 *   node <plugin>/scripts/ptp-telemetry-analyze.js --repo <repo root> [--format=json]
 *
 * Test/escape hatch: PTP_HOME_DIR overrides the home directory used to locate the *global*
 * `~/.claude/ptp/config.json` layer — byte-for-byte `scripts/ptp-otel-sink.js`'s own `homeDir()`.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/* ------------------------------------------------------------------ constants */

const DEFAULT_ROOT = 'openspec/telemetry';

// §9.6's envelope table, pinned to exact values rather than described as "supported" — "supported" is
// a judgement two implementations would resolve differently. These are `scripts/ptp-otel-sink.js`'s
// own `ENTRY_KIND` / `ENTRY_VERSION` constants (lines 39–40).
const ENTRY_KIND = 'ptp.span_record';
const ENTRY_VERSION = 1;

// The store-wide directory §21.2 never prunes. Named because the conditional narrowing statement
// (§23.2) must never be triggered by it alone.
const UNATTRIBUTED_DIR = '_unattributed';

/* ------------------------------------------------------------------ tiny utils */

function readJsonFile(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}
/** Byte-for-byte `scripts/ptp-otel-sink.js`'s `homeDir()` — the sole reason `os` is required here. */
function homeDir() { return process.env.PTP_HOME_DIR || os.homedir(); }
function isPlainObject(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }

/* ------------------------------------------------------------------ config (§1, forgiving) */

/** §1.1's `telemetry.root` validation, unchanged from the sink's copy. */
function isValidRoot(v) {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (/[\r\n]/.test(v)) return false;
  if (path.isAbsolute(v) || /^[a-zA-Z]:/.test(v) || v.startsWith('\\\\') || v.startsWith('/')) return false;
  const parts = v.split(/[\\/]+/).filter((s) => s.length > 0 && s !== '.');
  if (parts.some((s) => s === '..')) return false;
  return parts.length > 0;
}

/**
 * §1's layered, FORGIVING resolution — project config over global config over the default. Any
 * missing file, missing key, parse error, or invalid value leaves the prior value and never throws.
 *
 * analyze reads `telemetry.root` and NO other key: not `mode` (a store recorded earlier is readable
 * whatever the mode is now — §20.4's precedent), not `port`, and not `retentionDays` (it prunes
 * nothing).
 */
function resolveConfig(repoRoot) {
  const layers = [
    path.join(homeDir(), '.claude', 'ptp', 'config.json'),
    path.join(repoRoot, '.claude', 'ptp', 'config.json'),
  ];
  let root = DEFAULT_ROOT;
  for (const file of layers) {
    const obj = readJsonFile(file);
    if (!isPlainObject(obj)) continue;
    const t = obj.telemetry;
    if (!isPlainObject(t)) continue;
    if (isValidRoot(t.root)) root = t.root;
  }
  return { root };
}

/* ------------------------------------------------------------------ value readers (§10.2) */

/**
 * A finite non-negative number, or `null` for ABSENT. `''`, `null`, `undefined`, and unparseable
 * input are all absent. **Never `0` for absent input** (§10.2: empty is never zero) — note that
 * `Number('')` is `0`, which is exactly the trap this guard exists for.
 */
function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Epoch milliseconds, or `null` for ABSENT. Never `0` for absent input. */
function ts(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === '') return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ the wrapper invariant (§23.3) */

/*
 * The executable copy of §23.3's wrapper set. The set is stated in exactly two places — §23.3 and
 * here — and changing one is changing the other, in the same change, the pattern §10.7 establishes
 * for the mapping tables.
 *
 * THE KEY IS `tool_name` / `raw_span_name` AND IS **NEVER** `tool_class`. §10.6 maps `Agent`,
 * `Workflow` **AND `Skill`** to `tool_class = agent`. Keying this exclusion on that bucket would
 * strip real `Skill` leaf work out of every total while claiming to remove double counting — a worse
 * error than the one being corrected.
 */
const WRAPPER_TOOL_NAMES = ['Agent', 'Workflow'];
const WRAPPER_RAW_SPAN_NAME = 'claude_code.subagent_completed';

/**
 * `claude_code.subagent_completed` rows carry an EMPTY `tool_name`, so a predicate keyed on
 * `tool_name` alone misses every one of them.
 *
 * What that disjunct is actually for: NOT the leaf exclusion. §10.5 populates `raw_span_name` only on
 * rows that mapped to `span_kind = other`, and §10.3 maps `subagent_completed` to `other`, so
 * `isLeaf`'s `(isLLM ∨ isTool)` clause already excludes them and would do so with the disjunct
 * deleted. It is load-bearing for the wrapper WINDOW UNION (§23.4) and for the wrapper counts — a
 * background dispatch's `Agent` row records only the ~3 ms dispatch while its twin carries the whole
 * subagent. NEVER delete this disjunct as redundant.
 */
function isWrapper(r) {
  return WRAPPER_TOOL_NAMES.includes(r.tool_name) || r.raw_span_name === WRAPPER_RAW_SPAN_NAME;
}

/*
 * §17.1's kind sets, UNCHANGED — deliberately, so analyze and `report` never disagree about what
 * counts as LLM or tool work. The reuse also removes a double count in the other direction: the store
 * emits TWO rows per tool call, a timed `tool_result` and a `tool_decision` that maps to
 * `span_kind = other`, and these sets already exclude the latter.
 */
const LLM_KINDS = ['llm_request', 'api_request'];
const TOOL_KINDS = ['tool', 'tool.execution', 'tool_result'];

function isLLM(r) { return LLM_KINDS.includes(r.span_kind); }
function isTool(r) { return TOOL_KINDS.includes(r.span_kind); }
/** `isLLM` and `isTool` are disjoint by construction, so no row is ever counted under two kinds. */
function isLeaf(r) { return !isWrapper(r) && (isLLM(r) || isTool(r)); }

/**
 * The per-key wrapper tally, PREINITIALIZED from the constants — one key per member of
 * `WRAPPER_TOOL_NAMES` plus one for `WRAPPER_RAW_SPAN_NAME`, and exactly those keys, present whether
 * or not any row matched.
 *
 * Building this map from observed rows instead is the one thing forbidden here: it would silently
 * omit an absent key, and "a key that unexpectedly reads `0` is visible" — §19.4's
 * print-every-count-including-zero rule applied to this tally — is the whole mechanism by which a
 * future wrapper-shaped tool OUTSIDE the set gets noticed. That only works if the key is there to
 * read. (Under `source === 'csv'` the `raw_span_name` key renders `'unavailable'` rather than `0`;
 * the CSV cannot identify those rows at all, so a `0` would be a claim the data cannot support.)
 */
function wrapperCounts(records) {
  const counts = {};
  for (const name of WRAPPER_TOOL_NAMES) counts[name] = 0;
  counts[WRAPPER_RAW_SPAN_NAME] = 0;
  for (const r of records) {
    for (const name of WRAPPER_TOOL_NAMES) if (r.tool_name === name) counts[name] += 1;
    if (r.raw_span_name === WRAPPER_RAW_SPAN_NAME) counts[WRAPPER_RAW_SPAN_NAME] += 1;
  }
  return counts;
}

/* ------------------------------------------------------------------ interval algebra (§23.5) */

/**
 * A LEAF's closed interval `[start, start + duration]`, or `null` when it has no usable `start_ts`.
 *
 * A row with a start and NO duration yields the ZERO-LENGTH interval `[s, s]` (§17.2's rule, reused):
 * it merges harmlessly, adds nothing, and is never an error and never a guess at an unknown extent.
 *
 * NOT `num(r.duration_ms) || 0`: that collapses an explicit `0` as well, and it is the
 * empty-is-zero shortcut in the one place it looks harmless.
 */
function toInterval(r) {
  const s = ts(r.start_ts);
  if (s === null) return null;
  const d = num(r.duration_ms);
  return [s, s + (d === null ? 0 : d)];
}

/**
 * A WRAPPER's window — `null` unless BOTH a usable `start_ts` and a usable `duration_ms` are present.
 *
 * Deliberately NOT `toInterval`. A wrapper missing either has NO window and must contribute none: a
 * zero-length wrapper interval would classify a leaf starting at exactly that millisecond as
 * inside-subagent on the authority of a wrapper whose extent is unknown. This is live input, not a
 * hypothetical — in the reference store 10 of the 20 `Agent` rows are `span_kind = other` dispatch
 * rows carrying a `start_ts` and an EMPTY `duration_ms`.
 */
function toWrapperInterval(r) {
  const s = ts(r.start_ts);
  const d = num(r.duration_ms);
  if (s === null || d === null) return null;
  return [s, s + d];
}

/** Sort by start and merge overlapping AND touching intervals — the union must be disjoint. */
function mergeIntervals(list) {
  const sorted = list.slice().sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of sorted) {
    const cur = merged[merged.length - 1];
    if (cur && iv[0] <= cur[1]) { if (iv[1] > cur[1]) cur[1] = iv[1]; continue; }
    merged.push([iv[0], iv[1]]);
  }
  return merged;
}

/** Σ (end − start) over an ALREADY-MERGED list. */
function coveredExtent(merged) {
  let total = 0;
  for (const iv of merged) total += iv[1] - iv[0];
  return total;
}

/** Two-pointer sweep over two already-merged lists, emitting each positive-length overlap. */
function intersectUnions(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i += 1; else j += 1;
  }
  return out;
}

/** Is `[s, e]` wholly covered by an already-merged union? */
function isCovered(merged, s, e) {
  for (const iv of merged) if (iv[0] <= s && e <= iv[1]) return true;
  return false;
}

/* ------------------------------------------------------------------ source selection (§23.2) */

/*
 * ABSENT AND UNREADABLE ARE DIFFERENT ANSWERS, and both listers keep them apart.
 *
 * `ENOENT` means the directory genuinely is not there — a real, knowable emptiness. Any OTHER error
 * (`EACCES`, `EPERM`, `EBUSY`, `ENOTDIR`, a Windows share violation) means the directory EXISTS and
 * could not be enumerated, so its contents are UNKNOWN. Collapsing the two into `[]` made analyze
 * assert two things it could not observe:
 *   - an unenumerable ROOT printed "No telemetry exists for this store: it holds neither a raw NDJSON
 *     file nor a `spans.csv`" — a definite claim about contents it never saw; and
 *   - an unenumerable `<dir>/raw` made that directory look CSV-only, which is the DEFINITE branch of
 *     the narrowing statement ("they hold a `spans.csv` and no `raw/`, so they contributed nothing") —
 *     a certain exclusion asserted on an unobserved premise. §23.2 is explicit that printing DEFINITE
 *     where only POSSIBLE is supported is the same error as printing an unmeasured figure, one notch
 *     quieter.
 * This is the directory-level twin of the unreadable-FILE rule above, and it is recorded the same way.
 */
function listDirs(root, out) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (err) {
    if (!err || err.code !== 'ENOENT') out.unlistableDirs.push(root);
    return [];
  }
}

/**
 * Does `p` exist? `false` for genuinely absent (`ENOENT`). A probe that fails for ANY OTHER reason is
 * RECORDED and then treated as not-selected — the same absent-is-not-inaccessible rule the two listers
 * apply, and it must hold here too: `fs.existsSync` swallows every error into `false`, so an
 * inaccessible `spans.csv` looked absent, went unnamed, and could let the store print the DEFINITE
 * "it holds neither a raw NDJSON file nor a `spans.csv`" statement about a file it never managed to
 * look at.
 */
function probeFile(p, out) {
  try { fs.statSync(p); return true; } catch (err) {
    if (!err || err.code !== 'ENOENT') out.unreadableFiles.push(p);
    return false;
  }
}

/** An array of raw files, or `null` for UNKNOWN — the directory exists and could not be enumerated. */
function listRawFiles(root, dir, out) {
  const rawDir = path.join(root, dir, 'raw');
  try {
    return fs.readdirSync(rawDir).filter((n) => n.endsWith('.ndjson')).sort()
      .map((n) => path.join(rawDir, n));
  } catch (err) {
    if (!err || err.code === 'ENOENT') return []; // genuinely absent: a knowable empty
    out.unlistableDirs.push(rawDir);
    return null; // exists but unknown — never reported as "no `raw/`"
  }
}

/**
 * One raw NDJSON file, parsed TOTALLY — it never throws, whatever the file holds.
 *
 * Three tallies are kept APART, deliberately. §12.4 draws the line: an incomplete or unparseable
 * *trailing* line is skipped, a malformed *interior* line is skipped AND counted, and an entry whose
 * kind is unrecognized is skipped (§9.6). A single combined counter would not be comparable with any
 * other reader of the same store, so analyze reports `skippedInterior`, `tornTrailing`, and
 * `skippedKinds` separately — disclosing more than §12.4 requires without changing what it means.
 */
function readRawFile(file, out) {
  let text;
  // A file selected but NOT readable (a Windows share-violation while the receiver appends, a
  // permissions error) is recorded, never swallowed: its WHOLE contents are missing from every figure,
  // which is invisible loss of exactly the kind `skippedInterior` / `tornTrailing` exist to prevent one
  // line at a time. It must also not be listed as a file that was read — the footer's file list is a
  // factual claim, and the mandatory footer is the one place that cannot afford a false one.
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { out.unreadableFiles.push(file); return; }
  const lines = text.split('\n');
  const endsWithNewline = text.endsWith('\n');
  const lastIdx = lines.length - 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A trailing newline yields exactly one synthetic empty token at the end of the split. It is not
    // a line of the file and is counted nowhere. EVERY OTHER empty or whitespace-only line is a real
    // interior blank and IS counted — processing "each non-empty line" would make those vanish.
    if (i === lastIdx && endsWithNewline && line === '') continue;
    const isLast = i === lastIdx
      || (i === lastIdx - 1 && endsWithNewline && lines[lastIdx] === '');
    if (line.trim() === '') { out.skippedInterior += 1; continue; }
    let entry;
    try { entry = JSON.parse(line); } catch (_) {
      // Torn ONLY when it is the file's last line and the file does not end with a newline — the
      // receiver's own read-side rule (`ptp-otel-sink.js` `readRawFile`). A malformed line that IS
      // newline-terminated is complete and therefore interior.
      if (isLast && !endsWithNewline) out.tornTrailing += 1;
      else out.skippedInterior += 1;
      continue;
    }
    // Guard the SHAPE before touching any property. `JSON.parse('null')` returns `null` and
    // `JSON.parse('[]')` returns an array; reading `.ptp_entry_kind` off `null` throws a TypeError
    // OUTSIDE the try above and would abort the whole run on one bad line — breaking the
    // total-parsing contract on the one input that reaches the throw.
    if (!isPlainObject(entry)) { out.skippedInterior += 1; continue; }
    // §12.4 states the KIND rule and `ptp-otel-sink.js` already implements it on read (line 426).
    // The VERSION check is analyze's own addition: the sink declares `ENTRY_VERSION` and writes it
    // (line 361) but never tests it on read, so this half mirrors nothing and is not commented as if
    // it did. Both skip WITHOUT reading `entry.record`, so a future entry kind or version sharing
    // the file can never enter a total silently.
    if (entry.ptp_entry_kind !== ENTRY_KIND || entry.ptp_entry_version !== ENTRY_VERSION) {
      out.skippedKinds += 1;
      continue;
    }
    if (!isPlainObject(entry.record)) { out.skippedInterior += 1; continue; }
    out.records.push(entry.record);
  }
}

/** RFC-4180: quoted fields, doubled quotes inside them, CRLF or LF terminators, leading BOM stripped. */
function parseCsvText(input) {
  const text = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; continue; }
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * One `spans.csv`, mapped onto its own header row. A row whose field count does not match the header
 * increments `skippedCsvRows` — its OWN named tally, never merged with the raw store's, because the
 * two sources are never read in the same run and a shared counter would be unattributable.
 */
function readCsvFile(file, out) {
  let text;
  // Same rule as `readRawFile`: an unreadable selected file is recorded, not swallowed.
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { out.unreadableFiles.push(file); return; }
  const rows = parseCsvText(text);
  if (rows.length === 0) return;
  const header = rows[0];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== header.length) { out.skippedCsvRows += 1; continue; }
    // §9.7 permits a stray duplicate header row; it is a skip, not a malformed row.
    if (row.every((v, j) => v === header[j])) continue;
    const record = {};
    for (let j = 0; j < header.length; j++) record[header[j]] = row[j];
    out.records.push(record);
  }
}

/**
 * Prefer the §10.5 raw superset over `spans.csv`, and record — as FACTS, with no inference attached —
 * which CSV directories went unread.
 *
 * `csvOnlyDirsExcluded` is a CERTAIN exclusion: a directory with a `spans.csv` and no `raw/`
 * contributed nothing. `csvDirsNotRead` is every directory whose `spans.csv` was not read, INCLUDING
 * those that do have `raw/` — the case a CSV-only list would miss and the one most likely to make a
 * narrowed figure look complete. It carries no conclusion: §9.7 appends the raw entry and the CSV row
 * in the same step for every record, so an unread `spans.csv` may be wholly duplicated by the `raw/`
 * beside it. `csvDirsNotReadPrunable` is the subset retention CAN reach — never `_unattributed/`,
 * which §21.2 never prunes — and is what selects the conditional narrowing statement (§23.2).
 */
function loadRecords(root) {
  const out = {
    records: [], source: 'none', files: [], unreadableFiles: [], unlistableDirs: [],
    skippedInterior: 0, tornTrailing: 0, skippedKinds: 0, skippedCsvRows: 0,
    csvOnlyDirsExcluded: [], csvDirsNotRead: [], csvDirsNotReadPrunable: [],
  };
  const dirs = listDirs(root, out);
  const rawByDir = new Map();
  const csvByDir = new Map();
  for (const d of dirs) {
    rawByDir.set(d, listRawFiles(root, d, out));
    const csv = path.join(root, d, 'spans.csv');
    if (probeFile(csv, out)) csvByDir.set(d, csv);
  }

  const allRaw = [];
  // A `null` entry is UNKNOWN, not empty: it contributes no file (there is none to name) but it must
  // never be read as evidence that the directory has no `raw/`.
  for (const d of dirs) { const list = rawByDir.get(d); if (list) for (const f of list) allRaw.push(f); }

  if (allRaw.length > 0) {
    // The SOURCE is the raw store as soon as one raw file exists, whether or not every file then reads;
    // `files` is assigned only after the reads, so it lists what was actually read (see below).
    out.source = 'raw';
    for (const d of dirs) {
      if (!csvByDir.has(d)) continue;
      out.csvDirsNotRead.push(d);
      // CSV-ONLY — and so a CERTAIN exclusion — only when the absence of `raw/` was actually OBSERVED.
      // An unenumerable `raw/` (`null`) stays out of this DEFINITE list; it is still named in the
      // fact-only `csvDirsNotRead` list above, and the enumeration failure itself is in the footer.
      const raw = rawByDir.get(d);
      if (raw !== null && raw.length === 0) out.csvOnlyDirsExcluded.push(d);
      if (d !== UNATTRIBUTED_DIR) out.csvDirsNotReadPrunable.push(d);
    }
    for (const f of allRaw) readRawFile(f, out);
    // `filesRead` means READ — a file that failed to open is listed under `unreadableFiles` instead of
    // being claimed here.
    out.files = allRaw.filter((f) => !out.unreadableFiles.includes(f));
    return out;
  }

  const csvFiles = dirs.filter((d) => csvByDir.has(d)).map((d) => csvByDir.get(d));
  if (csvFiles.length > 0) {
    out.source = 'csv';
    for (const f of csvFiles) readCsvFile(f, out);
    out.files = csvFiles.filter((f) => !out.unreadableFiles.includes(f));
    return out;
  }
  return out;
}

/* ------------------------------------------------------------------ nesting detection (§23.4) */

/**
 * The dilation §23.4 pins for the uncovered-`subagent_completed`-window rule.
 *
 * It exists because a foreground twin can start marginally BEFORE the `Agent` row it accompanies —
 * measured start offsets across six foreground pairs are `−1, 0, 0, +1, 0, 0` ms — so an UNDILATED
 * containment test misreports such a twin as uncovered. The largest observed need is therefore 1 ms;
 * `5` is a deliberate guard band above it and NOT a value the data singles out (on the reference
 * store every dilation from 1 ms upward gives the same split). It is pinned to exactly `5` rather
 * than described as "small" because the count is reproducible only if two implementations pick the
 * same number, and a range is not a rule.
 */
const COMPLETED_WINDOW_DILATION_MS = 5;

function str(v) { return typeof v === 'string' ? v : (v === null || v === undefined ? '' : String(v)); }

/**
 * Classify every leaf as inside-subagent or main-agent, and REPORT the method that did it.
 *
 * Method selection is PER LEAF, never store-wide. The obvious store-wide rule — "if any record has a
 * parent link, use parent links" — flips the whole store on one linked record and silently
 * reclassifies every unlinked leaf as main-agent, because parent links have no containment fallback.
 * A partially linked store is exactly what this change anticipates, so resolution degrades one row at
 * a time and the `hybrid` label plus `methodCounts` make the mixture visible.
 *
 * Two stated limits (§23.4):
 *   - Concurrent fan-out makes sibling wrapper windows overlap, so containment can say a row was
 *     inside *a* subagent but never *which*. Only the SPLIT is reported, never per-subagent
 *     attribution.
 *   - A BACKGROUND dispatch runs its subagent concurrently with its parent and both carry the same
 *     `session_id`, so MAIN-AGENT work concurrent with such a window is classified inside-subagent.
 *     The TWIN's window — not the ~3 ms `Agent` dispatch — is what delimits WHICH leaves those are,
 *     containment being a test on the leaf's `start_ts` alone. It does NOT bound the misattributed
 *     DURATION: a leaf starting one millisecond before that window ends carries its whole
 *     `duration_ms` into the inside column however far past the window it runs.
 */
function classifyNesting(records) {
  const inside = new Set();
  let unclassifiable = 0;
  let unclassifiableBySession = 0;
  let parentLinks = 0;
  let containment = 0;

  // §17.5's identity rule: a span is identified by `(trace_id, span_id)`. A row with no `span_id` is
  // no one's ancestor — it can never be the target of an edge — but it may still BE a leaf that
  // walks upward, which is why link eligibility never demands a `span_id` of the leaf itself.
  // Ancestors are looked up among ALL in-scope spans, not only leaves.
  const byId = new Map();
  for (const r of records) {
    const sid = str(r.span_id);
    if (sid === '') continue;
    const key = str(r.trace_id) + '\u0000' + sid;
    if (!byId.has(key)) byId.set(key, r); // first occurrence wins, so the index is deterministic
  }

  /**
   * The ancestry walk. Returns `'inside'`, `'main'`, or `null` for UNRESOLVED (an edge matching no
   * in-scope span, or a cycle) — and only `null` falls back to containment.
   *
   * The three exits are ORDERED, because unordered they collide:
   *   (a) a WRAPPER ancestor → inside, and STOP. A dangling edge or a cycle *above* that wrapper is
   *       irrelevant: the deciding evidence is already in hand.
   *   (b) a ROOT (an ancestor with an empty `parent_span_id`) reached having passed NO wrapper →
   *       main-agent BY PARENT LINKS, and stop. A fully resolved wrapper-free chain is direct
   *       evidence of *outside*; sending it to containment would let an unrelated concurrent
   *       wrapper's window flip it to inside.
   *   (c) unresolved → containment. Never a bare main-agent default.
   */
  function classifyByLinks(r) {
    const trace = str(r.trace_id);
    if (trace === '') return null;
    let cur = str(r.parent_span_id);
    if (cur === '') return null; // no link at all — not eligible, so containment decides
    const seen = new Set();
    for (let steps = 0; steps <= records.length; steps++) {
      const node = byId.get(trace + '\u0000' + cur);
      if (!node) return null; // (c) the edge resolves to no in-scope span
      if (isWrapper(node)) return 'inside'; // (a)
      if (seen.has(cur)) return null; // (c) a cycle
      seen.add(cur);
      const next = str(node.parent_span_id);
      if (next === '') return 'main'; // (b)
      cur = next;
    }
    return null; // (c) the walk is bounded, so a pathological chain terminates as unresolved
  }

  // The per-session union of wrapper windows. An EMPTY `session_id` is not a partition value, it is
  // a MISSING one: `''` is a perfectly good object key, and pooling on it would rebuild the
  // store-wide union this partitioning exists to avoid, over precisely the rows there is least
  // reason to relate. So a wrapper with no session contributes to NO union.
  const wrapperWindows = new Map();
  for (const r of records) {
    if (!isWrapper(r)) continue;
    const s = str(r.session_id);
    if (s === '') continue;
    const iv = toWrapperInterval(r);
    if (!iv) continue;
    if (!wrapperWindows.has(s)) wrapperWindows.set(s, []);
    wrapperWindows.get(s).push(iv);
  }
  // The UNION is taken before any test, so a nested or duplicated wrapper — an `Agent` row and its
  // near-identical `subagent_completed` twin — attributes a contained row ONCE, not twice.
  for (const [s, list] of wrapperWindows) wrapperWindows.set(s, mergeIntervals(list));

  records.forEach((r, i) => {
    if (!isLeaf(r)) return;
    const linked = classifyByLinks(r);
    if (linked !== null) {
      // PRECEDENCE: parent links win. A resolved ancestry is direct evidence and needs no timestamp
      // to be trusted, so such a leaf is never counted as unclassifiable-by-time.
      parentLinks += 1;
      if (linked === 'inside') inside.add(i);
      return;
    }
    containment += 1;
    const s = str(r.session_id);
    const start = ts(r.start_ts);
    // The two tallies are DIFFERENT unknowns and are NOT disjoint: a leaf missing both increments
    // BOTH, and both statements about it are true. They must never be summed into one figure.
    if (s === '') unclassifiableBySession += 1;
    if (start === null) unclassifiable += 1;
    if (s === '' || start === null) return; // main-agent; never dropped, never guessed into a wrapper
    const merged = wrapperWindows.get(s);
    if (!merged) return;
    for (const iv of merged) {
      if (start >= iv[0] && start <= iv[1]) { inside.add(i); return; } // closed [lo, hi]
    }
  });

  const method = parentLinks > 0 && containment > 0 ? 'hybrid'
    : parentLinks > 0 ? 'parent-links'
      : containment > 0 ? 'timestamp-containment'
        // NOT `timestamp-containment` when nothing was classified: naming a method that never ran
        // would make the footer's method line false in exactly the degenerate case the mandatory
        // footer exists to keep honest.
        : 'not-applicable';

  return {
    inside,
    unclassifiable,
    unclassifiableBySession,
    method,
    methodCounts: { parentLinks, containment },
    uncoveredCompletedWindows: countUncoveredCompletedWindows(records),
  };
}

/**
 * The count of UNCOVERED `claude_code.subagent_completed` windows — §23.4's exact, total rule.
 *
 * A `subagent_completed` interval is uncovered when it is not covered by the union of its OWN
 * session's `Agent` / `Workflow` intervals, each dilated by `COMPLETED_WINDOW_DILATION_MS` at both
 * ends. NO pairing, NO "twin" matching, and NO duration ratio: all three need thresholds, and
 * concurrent siblings in one session make pairing ambiguous in exactly the case that matters.
 *
 * IT IS NOT A BACKGROUND-DISPATCH COUNT, AND IT BOUNDS ONE IN NEITHER DIRECTION. Under concurrent
 * fan-out a genuinely background window can fall wholly inside an unrelated sibling's long
 * foreground `Agent` interval in the same session and read as covered (UNDER-count); and a
 * foreground completion whose own `Agent` row is missing or untimed contributes no wrapper interval
 * at all and so reads as uncovered (OVER-count). No name, label, or comment may call it a lower
 * bound, an upper bound, or a minimum.
 */
function countUncoveredCompletedWindows(records) {
  const dilatedBySession = new Map();
  for (const r of records) {
    if (!WRAPPER_TOOL_NAMES.includes(r.tool_name)) continue;
    const s = str(r.session_id);
    if (s === '') continue; // a missing partition key is not a partition (§23.4)
    const iv = toWrapperInterval(r);
    if (!iv) continue;
    if (!dilatedBySession.has(s)) dilatedBySession.set(s, []);
    dilatedBySession.get(s).push([iv[0] - COMPLETED_WINDOW_DILATION_MS, iv[1] + COMPLETED_WINDOW_DILATION_MS]);
  }
  for (const [s, list] of dilatedBySession) dilatedBySession.set(s, mergeIntervals(list));

  let uncovered = 0;
  for (const r of records) {
    if (r.raw_span_name !== WRAPPER_RAW_SPAN_NAME) continue;
    const session = str(r.session_id);
    // A row with NO `session_id` has no OWN session, and this figure is defined entirely in terms of
    // one (§23.4: "not covered by the union of their OWN session's `Agent`/`Workflow` intervals"). Its
    // coverage is therefore UNMEASURABLE, exactly as a row with no usable window is — and it is
    // counted nowhere for the same reason. Testing it against the absent union instead would find no
    // covering interval and increment `uncovered`, turning an unmeasurable case into a DEFINITE count:
    // the one error class this reader exists to prevent, in the direction that inflates the split's
    // largest stated error. (§23.4 already treats an empty `session_id` as a MISSING partition rather
    // than a partition value everywhere else; this is the same rule, applied here too.)
    if (session === '') continue;
    const iv = toWrapperInterval(r);
    if (!iv) continue; // no usable window: coverage cannot be tested, so it is counted nowhere
    const merged = dilatedBySession.get(session) || [];
    if (!isCovered(merged, iv[0], iv[1])) uncovered += 1;
  }
  return uncovered;
}

/* ------------------------------------------------------------------ the six aggregations (§23.6) */

const NONE_KEY = '(none)';
const NO_COMMAND_TEXT = '(no command text)';
const TRUNCATED_COMMAND = '(truncated command)';
const NO_COMMAND_NAME = '(no command name)';

/*
 * The executable copy of §23.6's navigation no-op set. It lives here and in §23.6, and changing one
 * is changing the other.
 *
 * Why the key is the leading SEGMENT head and never a whitespace token 0: §10.6 splits on the
 * segment separators BEFORE taking a head, which is what makes `cd repo && npm test` a `build_test`
 * row rather than a `cd` row. Measured on the reference store, 163 of the 303 Bash leaf rows carrying
 * command text begin with `cd` — 53.8% of those rows and, because the compound commands are the
 * long-running ones, 93.6% of their total duration. A token-0 key would file almost all Bash *time*
 * under a single `cd` bucket that describes none of it.
 */
const NAV_HEADS = ['cd', 'pushd', 'popd'];

/** §10.6's tokenisation, unchanged: the segment's first whitespace-delimited token, before normalisation. */
function firstToken(segment) { return String(segment).trim().split(/\s+/)[0] || ''; }

/** §10.6's head normalisation, unchanged: first token, directory stripped, known suffix stripped, lowercased. */
function normaliseHead(segment) {
  const base = firstToken(segment).split(/[\\/]+/).pop() || '';
  return base.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

/*
 * A POSIX shell ASSIGNMENT PREFIX. A segment beginning `NAME=value` begins with an assignment, and an
 * assignment is not a command — so such a segment can supply no command NAME.
 */
const ASSIGNMENT_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*=/;

/*
 * The shape a command NAME can have once §10.6's normalisation has stripped the directory and the
 * known suffix. A WHITELIST, not a blacklist: enumerating what a name may look like is total, whereas
 * enumerating what to reject is whack-a-mole against arbitrary user command text.
 */
const COMMAND_NAME_SHAPE = /^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/;

/**
 * The head a segment may contribute as a **command name**, or `''` when it may contribute none.
 *
 * §10.6's tokenisation and normalisation are used UNCHANGED — this adds no second tokeniser and
 * changes no head. It decides only which of the identical heads may be REPORTED as a command name,
 * exactly as the navigation-no-op rule and the truncated-final-segment rule already do. That
 * distinction is what keeps §10.7 untouched: §10.6 feeds every head into a fixed seven-bucket
 * vocabulary, where a nonsense head simply matches nothing and falls to `other`; this output prints
 * the head VERBATIM, so the same nonsense head becomes a FABRICATED COMMAND NAME — the failure §23.6
 * bans by name, and the reason the truncation rule exists.
 *
 * Two ways a segment head is not a command name, both observed on the live store:
 *   - an ASSIGNMENT: `SP="C:/…/scratchpad" && node "$SP/snap.js"` filed 5 rows under `scratchpad"`
 *     and `D=openspec/changes/0039_01_telemetry-analyze-engine && grep …` filed 13 under
 *     `0039_01_telemetry-analyze-engine` — a directory and a change id reported as commands, while
 *     the real `node` / `grep` / `sed` / `echo` work went uncounted;
 *   - a head that CANNOT BE A NAME: `{` (shell grouping), `b"` (a quote fragment), `\beleven\b\`
 *     (regex text). These arise because §10.6's separator split is quote-blind, so a `|` or `;`
 *     inside a quoted argument yields a phantom segment whose head is argument text.
 *
 * STATED LIMIT — the residual this cannot reach. A phantom segment's head that happens to have a
 * legitimate name shape is indistinguishable from a real command: `grep -rn "Critical/High\|Critical
 * or High"` yields a segment whose head is `critical`, and analyze reports it. Fixing that would mean
 * making the SPLIT quote-aware, which is precisely the divergence from §10.6's shared primitive §23.6
 * forbids — output 5 and `tool_class` would then disagree about the same row. So the shape whitelist
 * suppresses every head that cannot be a name and the remainder is disclosed as a limit rather than
 * silently narrowed away.
 */
function candidateHead(segment) {
  const token = firstToken(segment);
  if (token === '' || ASSIGNMENT_PREFIX.test(token)) return '';
  const head = normaliseHead(segment);
  return COMMAND_NAME_SHAPE.test(head) ? head : '';
}

/**
 * The bash-by-command group key.
 *
 * This is NOT a re-derivation of `tool_class` (§10.7 is untouched): §10.6 examines EVERY segment head
 * and resolves the row to one of seven ordered buckets; this takes ONE head and reports it verbatim
 * as a command name. Only the tokenisation and normalisation are shared, which is what makes the two
 * agree on what a command's name is.
 *
 * Truncation (§10.5 cuts the retained text at 512 characters): a truncated row DISCARDS its final
 * segment — the only one the cut can have left partial — because a partial head would otherwise be
 * reported as a fabricated command name such as `gi`, which is worse than any honest degradation. A
 * SINGLE-SEGMENT truncated row is not an exception to that: its only segment is also its final one,
 * so it is discarded and the row buckets `(truncated command)`. Nothing bounds a command's first
 * token to 512 characters, so no rule here relies on the first head surviving. Falling back to a
 * surviving NAVIGATION head is reserved for UNTRUNCATED commands whose heads are all navigation
 * no-ops.
 *
 * Only a head `candidateHead` admits may be reported (that is the same anti-fabrication rule as the
 * truncation one, applied to the other two ways a head turns out not to be a command name). When no
 * candidate survives at all the row buckets under the explicit `(no command name)` — NEVER under a
 * head that names nothing, and never under `(no command text)`, which would deny that text existed.
 */
function bashCommandKey(bc) {
  if (!isPlainObject(bc) || typeof bc.text !== 'string' || bc.text.trim() === '') return NO_COMMAND_TEXT;
  const truncated = bc.truncated === true;
  let segments = bc.text.split(/&&|\|\||\||;/);
  if (truncated) segments = segments.slice(0, -1);
  const heads = segments.map(candidateHead).filter((h) => h !== '');
  const nonNav = heads.find((h) => !NAV_HEADS.includes(h));
  if (nonNav) return nonNav;
  if (truncated) return TRUNCATED_COMMAND; // no complete non-navigation head survived the cut
  if (heads.length > 0) return heads[0]; // every head is a navigation no-op: that IS the command
  // Text WAS retained — the guard at the top of this function already established that — and not one
  // segment can name a command. So the answer is `(no command name)` UNCONDITIONALLY here, never
  // `(no command text)`: text whose every segment tokenises to nothing (`&&`, `;`) is still text, and
  // labelling it "no command text" would additionally attach that bucket's footer explanation — the
  // row predates `bash_command`, or `OTEL_LOG_TOOL_DETAILS` was unset — which would be false of it.
  return NO_COMMAND_NAME;
}

/**
 * Every map below is keyed on a value taken from a RECORD — a `tool_name`, a `model`, or a bash
 * command head derived from arbitrary user command text — so every one of them is built with
 * `Object.create(null)` rather than `{}`.
 *
 * This is not defensive padding. On a plain `{}`, a key of `__proto__` or `constructor` resolves to
 * an INHERITED property instead of an own one, and the two failures that follow are exactly the two
 * this file exists to prevent:
 *   - `addTo` writes a string to `__proto__`, which is silently discarded, so `byTool` no longer sums
 *     to its column total and the §18.2 invariant check aborts the whole run (exit `1`); and
 *   - `toolByName` / `bashByCommand` find the truthy inherited object, skip their initialiser, and
 *     accumulate onto `Object.prototype` itself — the row then vanishes from the table with NO throw,
 *     NO footer count, and NO trace, which is a SILENT WRONG ANSWER, the worst outcome this reader
 *     admits.
 * A null-prototype map has no inherited keys, so a record-derived key is always an own key and the
 * `Object.keys` / `JSON.stringify` / `sumValues` paths below are unchanged.
 */
function emptyMap() { return Object.create(null); }
function addTo(map, key, ms) { map[key] = (map[key] || 0) + ms; }
function sumValues(map) { let t = 0; for (const k of Object.keys(map)) t += map[k]; return t; }

/**
 * Every figure the renderers print.
 *
 * The FIRST PARAMETER IS THE WHOLE `loadRecords` RESULT, not just its records array: `quality` must
 * carry the source, the files read, all four skip tallies and both CSV-exclusion lists, and
 * `bashByCommand` is omitted on `source === 'csv'` — none of which is derivable from the records or
 * from `nesting`. Passing only the records would leave those fields reachable solely through
 * undeclared module state, which is how a footer field goes silently missing.
 */
function analyze(loadResult, nesting) {
  const records = loadResult.records;
  const isCsv = loadResult.source === 'csv';

  const leaves = [];
  records.forEach((r, i) => { if (isLeaf(r)) leaves.push({ r, i }); });

  /* ---- output 1: the leaf-work split (§23.6 / §23.5) ---- */

  let llmRows = 0;
  let llmMs = 0;
  let toolRows = 0;
  let toolMs = 0;
  let rowsWithNoDuration = 0;
  let rowsWithNoStart = 0;
  const allIntervals = [];
  const llmIntervals = [];
  const toolIntervals = [];
  for (const { r } of leaves) {
    const d = num(r.duration_ms);
    // An ABSENT duration contributes nothing to the sum and is COUNTED — it is never read as `0`
    // (§10.2). The two are different: one is a measurement, the other a known unknown.
    if (d === null) rowsWithNoDuration += 1;
    const add = d === null ? 0 : d;
    const iv = toInterval(r);
    if (iv === null) rowsWithNoStart += 1;
    else allIntervals.push(iv);
    if (isLLM(r)) {
      llmRows += 1; llmMs += add; if (iv) llmIntervals.push(iv);
    } else {
      toolRows += 1; toolMs += add; if (iv) toolIntervals.push(iv);
    }
  }

  const hasInterval = allIntervals.length > 0;
  let unionMs = null;
  let wallWindowMs = null;
  let overlapMs = null;
  if (hasInterval) {
    unionMs = coveredExtent(mergeIntervals(allIntervals));
    let lo = Infinity;
    let hi = -Infinity;
    for (const iv of allIntervals) { if (iv[0] < lo) lo = iv[0]; if (iv[1] > hi) hi = iv[1]; }
    wallWindowMs = hi - lo;
    // OVERLAP IS AN INTERSECTION: the covered extent of union(LLM) ∩ union(tool). It is never
    // `Σllm + Σtool − union` — which is rejected NOT because it is §17.0's banned form (it is not)
    // and NOT because it can go negative (it cannot, a union never exceeding the durations it is
    // built from), but because it measures ALL overlap, WITHIN-KIND INCLUDED: two parallel tool
    // calls inflate it exactly as much as an LLM span overlapping a tool span, so it would be
    // labelled LLM-versus-tools while measuring something else. Each union has already absorbed its
    // own within-kind overlap, which is why intersecting them measures the named quantity exactly.
    overlapMs = coveredExtent(intersectUnions(mergeIntervals(llmIntervals), mergeIntervals(toolIntervals)));
  }
  // `idle = wall window − union-of-intervals` is PERMITTED: the subtrahend is a union COVERAGE,
  // disjoint by construction, so this measures uncovered time within a known window and cannot go
  // negative. What §17.0 bans is subtracting OVERLAPPING COMPONENT SUMS from wall time —
  // `wall − Σllm − Σtool` — and that form appears nowhere in this file. The distinction is *what is
  // subtracted*, not that a subtraction appears. `idle` is additionally absent whenever either
  // operand is.
  const idleMs = (wallWindowMs === null || unionMs === null) ? null : wallWindowMs - unionMs;

  const absentIntervalFigures = [];
  if (unionMs === null) absentIntervalFigures.push('unionMs');
  if (wallWindowMs === null) absentIntervalFigures.push('wallWindowMs');
  if (overlapMs === null) absentIntervalFigures.push('overlapMs');
  if (idleMs === null) absentIntervalFigures.push('idleMs');

  const leafSplit = {
    llm: { rows: llmRows, ms: llmMs },
    tool: { rows: toolRows, ms: toolMs },
    totalBusyMs: llmMs + toolMs,
    unionMs,
    wallWindowMs,
    overlapMs,
    idleMs,
  };

  /* ---- output 2: inside-subagent vs main-agent (§23.6) ---- */

  const newColumn = () => ({ rows: 0, totalMs: 0, llmMs: 0, toolMs: 0, byTool: emptyMap(), byModel: emptyMap() });
  const nestingSplit = { inside: newColumn(), main: newColumn() };
  for (const { r, i } of leaves) {
    const column = nesting.inside.has(i) ? nestingSplit.inside : nestingSplit.main;
    const d = num(r.duration_ms);
    const add = d === null ? 0 : d;
    column.rows += 1;
    column.totalMs += add;
    if (isLLM(r)) column.llmMs += add; else column.toolMs += add;
    // EVERY leaf row in the column enters BOTH sub-maps, not only the rows carrying the key: an LLM
    // row has no `tool_name` and a tool row has no `model`, and both bucket under the literal
    // `(none)`, never merged elsewhere. Restricting `byTool` to tool rows would make the invariant
    // below arithmetically impossible.
    addTo(column.byTool, str(r.tool_name) || NONE_KEY, add);
    addTo(column.byModel, str(r.model) || NONE_KEY, add);
  }
  for (const key of ['inside', 'main']) {
    const c = nestingSplit[key];
    // A breakdown that quietly totals less than the headline it decomposes (§18.2's principle) is a
    // silent wrong answer, so this fails loudly rather than rendering.
    if (sumValues(c.byTool) !== c.totalMs || sumValues(c.byModel) !== c.totalMs) {
      throw new Error('internal: ' + key + ' sub-map does not sum to its column total');
    }
  }

  /* ---- output 3: token burn by model (§23.6) ---- */

  const tokensByModel = emptyMap();
  for (const { r } of leaves) {
    if (!isLLM(r)) continue;
    const key = str(r.model) || NONE_KEY;
    if (!tokensByModel[key]) {
      tokensByModel[key] = {
        rows: 0,
        inputTokens: 0, inputTokenRows: 0,
        outputTokens: 0, outputTokenRows: 0,
        costUsd: { value: 0, populatedRows: 0 },
      };
    }
    const e = tokensByModel[key];
    e.rows += 1;
    const i = num(r.input_tokens); if (i !== null) { e.inputTokens += i; e.inputTokenRows += 1; }
    const o = num(r.output_tokens); if (o !== null) { e.outputTokens += o; e.outputTokenRows += 1; }
    const c = num(r.cost_usd); if (c !== null) { e.costUsd.value += c; e.costUsd.populatedRows += 1; }
  }
  // §10.4 advisory A-3: Codex LLM rows carry NO cost at all. A model whose rows carry none reports
  // cost as ABSENT — never `0`, which a reader would read as free.
  //
  // §23.6 sums all three of these columns "where populated", so the same rule governs the two TOKEN
  // columns: a model NONE of whose rows carry an input (or output) count reports that column ABSENT
  // too, never `0`. `0` there would assert that the model consumed no tokens, which is a measurement
  // the store never took — the same "empty is never zero" error the cost column is guarded against,
  // and the reason §10.2 leaves those fields empty rather than zero in the first place. A column with
  // at least one populated row still prints its sum, so a genuine zero remains printable.
  for (const key of Object.keys(tokensByModel)) {
    const e = tokensByModel[key];
    if (e.costUsd.populatedRows === 0) e.costUsd.value = null;
    if (e.inputTokenRows === 0) e.inputTokens = null;
    if (e.outputTokenRows === 0) e.outputTokens = null;
  }

  /* ---- output 4: tool work by tool_name (§23.6) ---- */

  const toolByName = emptyMap();
  for (const { r } of leaves) {
    if (!isTool(r)) continue;
    const key = str(r.tool_name) || NONE_KEY;
    if (!toolByName[key]) toolByName[key] = { rows: 0, timedRows: 0, ms: 0, meanMs: null };
    const e = toolByName[key];
    e.rows += 1;
    const d = num(r.duration_ms);
    if (d !== null) { e.timedRows += 1; e.ms += d; }
  }
  // THE MEAN'S DENOMINATOR IS `timedRows`, NEVER `rows`. Dividing by every row spreads the sum
  // across rows that contributed nothing, which is "empty is zero" (§10.2) through the back door in
  // the figure where it is hardest to spot. Absent — not `0` — when nothing in the bucket is timed.
  for (const key of Object.keys(toolByName)) {
    const e = toolByName[key];
    e.meanMs = e.timedRows > 0 ? e.ms / e.timedRows : null;
  }

  /* ---- output 5: bash-by-command (§23.6) ---- */

  let bashByCommand = null;
  let bashOmittedReason = null;
  let bashNavigationKeyedRows = 0;
  let bashTruncatedKeyedRows = 0;
  let bashNoCommandTextRows = 0;
  let bashNoCommandNameRows = 0;
  let truncatedRows = 0;
  if (isCsv) {
    // OMITTED with the reason stated, never approximated from a coarser key. The premise is
    // corrected rather than repeated: `spans.csv` never *dropped* the command text.
    bashOmittedReason = 'the 26-column schema never carried the command text; it is raw-only by design (SKILL.md §10.5)';
  } else {
    bashByCommand = emptyMap();
    for (const { r } of leaves) {
      if (str(r.tool_name) !== 'Bash') continue;
      const bc = r.bash_command;
      if (isPlainObject(bc) && bc.truncated === true) truncatedRows += 1;
      const key = bashCommandKey(bc);
      if (NAV_HEADS.includes(key)) bashNavigationKeyedRows += 1;
      if (key === TRUNCATED_COMMAND) bashTruncatedKeyedRows += 1;
      if (key === NO_COMMAND_TEXT) bashNoCommandTextRows += 1;
      if (key === NO_COMMAND_NAME) bashNoCommandNameRows += 1;
      if (!bashByCommand[key]) bashByCommand[key] = { rows: 0, timedRows: 0, ms: 0, meanMs: null };
      const e = bashByCommand[key];
      e.rows += 1;
      const d = num(r.duration_ms);
      if (d !== null) { e.timedRows += 1; e.ms += d; }
    }
    for (const key of Object.keys(bashByCommand)) {
      const e = bashByCommand[key];
      e.meanMs = e.timedRows > 0 ? e.ms / e.timedRows : null; // same denominator rule as output 4
    }
  }

  /* ---- the wrapper figure, printed BESIDE the leaf split and feeding none of it ---- */

  const counts = wrapperCounts(records);
  let wrapperRows = 0;
  let wrapperTotalMs = 0;
  for (const r of records) {
    if (!isWrapper(r)) continue;
    wrapperRows += 1;
    const d = num(r.duration_ms);
    if (d !== null) wrapperTotalMs += d;
  }
  let csvSplitBiasNote = null;
  let wrapperKeyDegradedNote = null;
  if (isCsv) {
    // A count that was TAKEN and came out zero prints `0`; a count that COULD NOT BE TAKEN prints
    // `unavailable` with its reason. The two rules are complementary, not an exception to each other.
    counts[WRAPPER_RAW_SPAN_NAME] = 'unavailable';
    wrapperKeyDegradedNote = 'the wrapper key ran DEGRADED: `spans.csv` has no `raw_span_name` column, '
      + 'so the `' + WRAPPER_RAW_SPAN_NAME + '` disjunct could not fire';
    csvSplitBiasNote = 'the CSV-fallback split is UNDERSTATED on the inside-subagent column: a background '
      + '`Agent` dispatch\'s short interval survives in the CSV while its long `' + WRAPPER_RAW_SPAN_NAME
      + '` twin does not, so work genuinely inside a background subagent is classified main-agent';
  }
  const wrappers = {
    counts,
    totalMs: wrapperTotalMs,
    rows: wrapperRows,
    // Under CSV both figures cover `Agent`/`Workflow` rows ONLY — every `subagent_completed` row is
    // invisible — so they are labelled incomplete rather than printed as bare totals. Suppressing the
    // COUNT as `unavailable` does not license the SUM built from the same missing rows to be printed
    // as though complete.
    complete: !isCsv,
    label: isCsv
      ? 'known `Agent`/`Workflow` wrapper rows/time (incomplete — the CSV cannot identify `'
        + WRAPPER_RAW_SPAN_NAME + '` rows)'
      : 'wrapper rows/time — excluded from every leaf figure above',
    bimodalityNote: 'an `Agent` row is BIMODAL — foreground ≈ the subagent\'s gross wall time, background ≈ '
      + 'the ~3 ms dispatch only — while a `' + WRAPPER_RAW_SPAN_NAME + '` twin carries the subagent\'s whole '
      + 'wall time in BOTH modes. Never sum wrapper durations into a "subagent time" figure, and never read '
      + 'the twin as a duplicate of its `Agent` row.',
  };

  /* ---- the mandatory data-quality footer (§23.7) ---- */

  let scopeStatement;
  if (loadResult.csvOnlyDirsExcluded.length > 0) {
    scopeStatement = 'DEFINITE: ' + loadResult.csvOnlyDirsExcluded.join(', ') + ' hold a `spans.csv` and no '
      + '`raw/`, so they contributed nothing — this analysis covers the raw-retained window, not all recorded history';
  } else if (loadResult.csvDirsNotReadPrunable.length > 0) {
    scopeStatement = 'POSSIBLE: ' + loadResult.csvDirsNotReadPrunable.join(', ') + ' are epic directories '
      + 'retention CAN prune and hold an unread `spans.csv`, so history MAY be narrowed — prunable is not '
      + 'pruned (§21 prunes only the epic a `report` actually ran for), and §9.7 appends the raw entry and the '
      + 'CSV row together, so an unread CSV may be wholly duplicated by the `raw/` beside it. Neither is observable here.';
  } else {
    scopeStatement = 'no directory\'s history is known OR able to be excluded by retention';
  }

  let dateStart = null;
  let dateEnd = null;
  const sessions = new Set();
  for (const r of records) {
    const s = ts(r.start_ts);
    if (s !== null) {
      if (dateStart === null || s < dateStart) dateStart = s;
      const e = ts(r.end_ts);
      const end = e === null ? s : e;
      if (dateEnd === null || end > dateEnd) dateEnd = end;
    }
    const sid = str(r.session_id);
    if (sid !== '') sessions.add(sid);
  }

  const quality = {
    source: loadResult.source,
    filesRead: loadResult.files,
    unreadableFiles: loadResult.unreadableFiles,
    unreadableFilesNote: 'a file that could not be OPENED, or whose very existence could not be PROBED — '
      + 'either way its contents were never observed, which is invisible loss unless it is named. It is '
      + 'listed here rather than under `filesRead`, which is a claim about what was actually read; and a '
      + 'file that is merely ABSENT is never listed here, because absent and inaccessible are different '
      + 'answers.',
    unlistableDirs: loadResult.unlistableDirs,
    unlistableDirsNote: 'a directory that EXISTS and could not be ENUMERATED (absent is a different answer, '
      + 'and is not listed here). Its contents were never observed, so while it is named here no claim is '
      + 'made about them: it is never reported as a directory with no `raw/`, which would make the scope '
      + 'statement a DEFINITE exclusion on an unobserved premise, and it suppresses the "no telemetry exists" '
      + 'statement in favour of an explicit unknown.',
    recordsParsed: records.length,
    skippedInterior: loadResult.skippedInterior,
    tornTrailing: loadResult.tornTrailing,
    skippedKinds: loadResult.skippedKinds,
    skippedCsvRows: loadResult.skippedCsvRows,
    csvOnlyDirsExcluded: loadResult.csvOnlyDirsExcluded,
    csvDirsNotRead: loadResult.csvDirsNotRead,
    csvDirsNotReadNote: 'a FACT about which files were read, carrying NO inference that records were omitted: '
      + '§9.7 appends the raw entry and the CSV row in the same step, so an unread `spans.csv` may be wholly '
      + 'duplicated by the `raw/` beside it',
    scopeStatement,
    nestingMethod: nesting.method,
    nestingMethodCounts: nesting.methodCounts,
    nestingLimitsNote: 'concurrent fan-out yields a SPLIT and never a per-subagent attribution; and a background '
      + 'dispatch runs concurrently with its parent under the same `session_id`, so main-agent work concurrent '
      + 'with a `' + WRAPPER_RAW_SPAN_NAME + '` window is classified inside-subagent',
    absentIntervalFigures,
    absentIntervalReason: absentIntervalFigures.length === 0
      ? null
      : 'no usable leaf interval exists (a row needs a parseable `start_ts`); first start and last end over an '
        + 'empty set are UNDEFINED, not zero',
    wrapperSet: { toolNames: WRAPPER_TOOL_NAMES.slice(), rawSpanName: WRAPPER_RAW_SPAN_NAME },
    wrapperCounts: counts,
    wrapperRows,
    wrapperTotalMs,
    wrapperExclusionNote: 'wrapper rows are excluded from EVERY leaf total and reported separately; the key is '
      + '`tool_name` / `raw_span_name` and is NEVER `tool_class`, because `tool_class=agent` also holds `Skill`',
    wrapperBimodalityNote: wrappers.bimodalityNote,
    wrapperCompletenessNote: isCsv ? wrappers.label : null,
    wrapperKeyDegradedNote,
    csvSplitBiasNote,
    uncoveredCompletedWindows: isCsv ? 'unavailable' : nesting.uncoveredCompletedWindows,
    uncoveredCompletedWindowsNote: 'the count of `' + WRAPPER_RAW_SPAN_NAME + '` intervals NOT covered by the '
      + 'union of their own session\'s `Agent`/`Workflow` intervals dilated by ' + COMPLETED_WINDOW_DILATION_MS
      + ' ms at both ends. It is NOT a count of background dispatches and is NO BOUND on one in either '
      + 'direction: a genuinely background window can hide inside an unrelated sibling\'s long foreground '
      + 'interval (under-count), and a foreground completion whose own `Agent` row is untimed contributes no '
      + 'wrapper interval and so reads as uncovered (over-count). Main-agent work concurrent with such a window '
      + 'is classified inside-subagent. A completion row with no usable interval, or with no `session_id` — the '
      + 'partition this figure is defined against — is counted NOWHERE rather than as uncovered: its coverage '
      + 'is unmeasurable, and counting it would turn a known unknown into a definite figure.',
    leafRowsWithNoDuration: rowsWithNoDuration,
    leafRowsWithNoStart: rowsWithNoStart,
    unclassifiable: nesting.unclassifiable,
    unclassifiableBySession: nesting.unclassifiableBySession,
    unclassifiableNote: 'two DIFFERENT unknowns, never summed: a leaf missing both a `session_id` and a usable '
      + '`start_ts` is counted in BOTH, so the two tallies are not disjoint',
    bashOmitted: bashByCommand === null,
    bashOmittedReason,
    bashNavigationKeyedRows,
    bashTruncatedKeyedRows,
    bashNoCommandTextRows,
    bashNoCommandTextNote: 'a row groups under `' + NO_COMMAND_TEXT + '` when it predates the `bash_command` '
      + 'field or when `OTEL_LOG_TOOL_DETAILS` was unset — §10.4 gates the whole attribute. It is never dropped '
      + 'and never guessed.',
    bashNoCommandNameRows,
    bashNoCommandNameNote: 'a row groups under `' + NO_COMMAND_NAME + '` when command text WAS retained but no '
      + 'segment head can name a command — every candidate was a shell assignment (`NAME=value`) or had no '
      + 'name shape at all (`{`, a quote fragment, regex text). Reporting such a head verbatim would fabricate '
      + 'a command name, which §23.6 bans for the same reason it discards a truncated final segment. STATED '
      + 'LIMIT: §10.6\'s separator split is quote-blind, so a `|` or `;` inside a quoted argument can still '
      + 'yield a phantom segment whose head happens to have a legitimate name shape and is reported; making '
      + 'the split quote-aware would diverge from the shared primitive and make this table and `tool_class` '
      + 'disagree about the same row.',
    truncatedRows,
    dateRangeStart: dateStart === null ? null : new Date(dateStart).toISOString(),
    dateRangeEnd: dateEnd === null ? null : new Date(dateEnd).toISOString(),
    sessionCount: sessions.size,
    posture: 'analyze created no file, modified no existing file, and deleted nothing.',
    separateReaderNote: 'analyze is a separate reader from `report`; it does not change any figure `report` prints.',
  };

  return {
    // The empty-store statement is a CLAIM ABOUT CONTENTS, so it is only made when the contents were
    // actually observable. With an unenumerable directory in play, "it holds neither" is exactly the
    // kind of confidently-wrong statement this reader exists to prevent — so the unknown is stated
    // instead. Either way it is a statement rather than a table of zeros, and the footer still renders.
    statement: loadResult.source !== 'none'
      ? null
      : (loadResult.unlistableDirs.length === 0 && loadResult.unreadableFiles.length === 0
        ? 'No telemetry exists for this store: it holds neither a raw NDJSON file nor a `spans.csv`.'
        : 'No telemetry could be READ for this store, and whether it holds any is UNKNOWN: '
          + loadResult.unlistableDirs.concat(loadResult.unreadableFiles).join(', ')
          + ' could not be enumerated or opened, so their contents were never observed. This is not a '
          + 'statement that the store is empty.'),
    leafSplit,
    nestingSplit,
    tokensByModel,
    toolByName,
    bashByCommand,
    wrappers,
    quality,
  };
}

/** Every key the footer must carry, in render order. Task 8's JSON check asserts against this list. */
const FOOTER_ITEMS = [
  'source', 'filesRead', 'unreadableFiles', 'unreadableFilesNote', 'unlistableDirs',
  'unlistableDirsNote', 'recordsParsed', 'skippedInterior', 'tornTrailing', 'skippedKinds',
  'skippedCsvRows', 'csvOnlyDirsExcluded', 'csvDirsNotRead', 'csvDirsNotReadNote', 'scopeStatement',
  'nestingMethod', 'nestingMethodCounts', 'nestingLimitsNote', 'absentIntervalFigures',
  'absentIntervalReason', 'wrapperSet', 'wrapperCounts', 'wrapperRows', 'wrapperTotalMs',
  'wrapperExclusionNote', 'wrapperBimodalityNote', 'wrapperCompletenessNote', 'wrapperKeyDegradedNote',
  'csvSplitBiasNote', 'uncoveredCompletedWindows', 'uncoveredCompletedWindowsNote',
  'leafRowsWithNoDuration', 'leafRowsWithNoStart', 'unclassifiable', 'unclassifiableBySession',
  'unclassifiableNote', 'bashOmitted', 'bashOmittedReason', 'bashNavigationKeyedRows',
  'bashTruncatedKeyedRows', 'bashNoCommandTextRows', 'bashNoCommandTextNote', 'bashNoCommandNameRows',
  'bashNoCommandNameNote', 'truncatedRows',
  'dateRangeStart', 'dateRangeEnd', 'sessionCount', 'posture', 'separateReaderNote',
];

/* ------------------------------------------------------------------ renderers (§23.6, §23.7) */

const ABSENT = 'absent';

function ms(v) {
  if (v === null || v === undefined) return ABSENT;
  if (typeof v !== 'number' || !Number.isFinite(v)) return ABSENT;
  return Math.round(v).toLocaleString('en-US') + ' ms (' + human(v) + ')';
}

function human(msValue) {
  let s = Math.round(msValue / 1000);
  const h = Math.floor(s / 3600); s -= h * 3600;
  const mn = Math.floor(s / 60); s -= mn * 60;
  const parts = [];
  if (h > 0) parts.push(h + 'h');
  if (mn > 0 || h > 0) parts.push(mn + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}

/*
 * Both padders GUARANTEE A GUTTER: a cell whose content reaches or exceeds its column width still
 * gets one space of separation from its neighbour.
 *
 * A bare `padEnd` / `padStart` silently returns an over-long cell unchanged, so two adjacent
 * over-wide cells RUN TOGETHER — observed on the live store as
 * `total leaf time  14,639,832 ms (4h 4m 0s)6,522,339 ms (1h 48m 42s)`, where the two headline
 * columns of output 2 concatenate into one unreadable token. Nothing bounds a formatted figure's
 * width (a millisecond count grows with the store, and `ms()` appends a humanised form), so a
 * fixed-width column cannot be assumed to fit. Alignment is preserved wherever content does fit; a
 * wider cell goes ragged, which is a cosmetic cost against a renderer that would otherwise print two
 * distinct measurements as one number that was never measured.
 */
/** A token count, or `absent` when NO row in the bucket carried one — never `0` (§10.2). */
function tokens(v) { return v === null || v === undefined ? ABSENT : v.toLocaleString('en-US'); }

function pad(v, width) { const s = String(v); return s.length >= width ? s + ' ' : s.padEnd(width); }
function padLeft(v, width) { const s = String(v); return s.length >= width ? ' ' + s : s.padStart(width); }

/** Deterministic ordering for every table: descending time, then key ascending. */
function sortedEntries(map, msOf) {
  return Object.keys(map).sort((a, b) => {
    const d = msOf(map[b]) - msOf(map[a]);
    return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0);
  });
}

function footerValue(v) {
  if (Array.isArray(v)) return v.length === 0 ? '(none)' : v.join(', ');
  if (v === null || v === undefined) return '(none)';
  if (isPlainObject(v)) return Object.keys(v).map((k) => k + '=' + footerValue(v[k])).join(', ');
  return String(v);
}

/**
 * The footer — MANDATORY and never suppressed: not on an empty store, not on a clean one, not when
 * every item is nil. It is rendered by iterating `FOOTER_ITEMS`, so an item cannot be dropped by
 * being forgotten at a call site, and a missing key fails loudly instead of vanishing.
 */
function renderFooter(quality) {
  const missing = FOOTER_ITEMS.filter((k) => !Object.prototype.hasOwnProperty.call(quality, k));
  if (missing.length > 0) throw new Error('internal: footer is missing ' + missing.join(', '));
  const width = FOOTER_ITEMS.reduce((w, k) => Math.max(w, k.length), 0) + 2;
  const lines = ['6. Data-quality footer (mandatory, never suppressed)', ''];
  for (const key of FOOTER_ITEMS) lines.push('  ' + pad(key + ':', width) + footerValue(quality[key]));
  return lines.join('\n');
}

function renderText(report) {
  const q = report.quality;
  const out = [];

  if (report.statement) {
    // An empty store is STATED, never zeroed — and the full footer still renders.
    out.push(report.statement, '', renderFooter(q), '');
    return out.join('\n');
  }

  const s = report.leafSplit;
  out.push('1. Leaf-work split (LLM versus tools)', '');
  out.push('  ' + pad('LLM rows', 26) + padLeft(s.llm.rows, 8) + '   ' + ms(s.llm.ms));
  out.push('  ' + pad('tool rows', 26) + padLeft(s.tool.rows, 8) + '   ' + ms(s.tool.ms));
  out.push('');
  // THREE separately labelled figures, never conflated and never printed as one unlabelled "time".
  out.push('  ' + pad('total busy (sum, overlaps counted more than once)', 56) + ms(s.totalBusyMs));
  out.push('  ' + pad('union of intervals (covered extent, timestamped rows)', 56) + ms(s.unionMs));
  out.push('  ' + pad('wall window (first start to last end)', 56) + ms(s.wallWindowMs));
  out.push('  ' + pad('LLM<->tools overlap (interval intersection)', 56) + ms(s.overlapMs));
  out.push('  ' + pad('idle (wall window - union of intervals)', 56) + ms(s.idleMs));
  out.push('');
  const w = report.wrappers;
  out.push('  wrappers - ' + w.label + ':');
  out.push('  ' + pad('rows', 26) + padLeft(w.complete ? w.rows : w.rows + ' (incomplete)', 8)
    + '   ' + ms(w.totalMs) + (w.complete ? '' : ' (incomplete)'));
  out.push('  ' + pad('per-key counts', 26) + footerValue(w.counts));
  out.push('');

  out.push('2. Inside-subagent versus main-agent', '');
  out.push('  ' + pad('', 22) + padLeft('inside-subagent', 22) + padLeft('main-agent', 22));
  const cols = [report.nestingSplit.inside, report.nestingSplit.main];
  for (const [label, field] of [['total leaf time', 'totalMs'], ['LLM time', 'llmMs'], ['tool time', 'toolMs'], ['rows', 'rows']]) {
    out.push('  ' + pad(label, 22)
      + padLeft(field === 'rows' ? cols[0].rows : ms(cols[0][field]), 22)
      + padLeft(field === 'rows' ? cols[1].rows : ms(cols[1][field]), 22));
  }
  for (const [subLabel, subKey] of [['by tool_name', 'byTool'], ['by model', 'byModel']]) {
    out.push('', '  ' + subLabel + ' (every leaf row in the column; `' + NONE_KEY + '` is not a merge):');
    const keys = new Set(Object.keys(cols[0][subKey]).concat(Object.keys(cols[1][subKey])));
    const ordered = Array.from(keys).sort((a, b) => {
      const d = ((cols[0][subKey][b] || 0) + (cols[1][subKey][b] || 0))
        - ((cols[0][subKey][a] || 0) + (cols[1][subKey][a] || 0));
      return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0);
    });
    for (const k of ordered) {
      out.push('    ' + pad(k, 20) + padLeft(ms(cols[0][subKey][k] || 0), 22) + padLeft(ms(cols[1][subKey][k] || 0), 22));
    }
    out.push('    ' + pad('TOTAL', 20) + padLeft(ms(cols[0].totalMs), 22) + padLeft(ms(cols[1].totalMs), 22));
  }
  out.push('');

  out.push('3. Token burn by model', '');
  out.push('  ' + pad('model', 28) + padLeft('rows', 7) + padLeft('input', 12) + padLeft('output', 12) + '   cost (USD)');
  for (const k of sortedEntries(report.tokensByModel, (e) => (e.inputTokens || 0) + (e.outputTokens || 0))) {
    const e = report.tokensByModel[k];
    out.push('  ' + pad(k, 28) + padLeft(e.rows, 7) + padLeft(tokens(e.inputTokens), 12)
      + padLeft(tokens(e.outputTokens), 12) + '   '
      + (e.costUsd.value === null ? ABSENT + ' (no row carries a cost)' : e.costUsd.value.toFixed(4)
        + ' over ' + e.costUsd.populatedRows + ' of ' + e.rows + ' rows'));
  }
  if (Object.keys(report.tokensByModel).length === 0) out.push('  (no LLM leaf rows)');
  out.push('');

  out.push('4. Tool work by tool_name', '');
  out.push('  ' + pad('tool_name', 28) + padLeft('rows', 7) + padLeft('timed', 7) + '   ' + pad('total', 30) + 'mean');
  for (const k of sortedEntries(report.toolByName, (e) => e.ms)) {
    const e = report.toolByName[k];
    out.push('  ' + pad(k, 28) + padLeft(e.rows, 7) + padLeft(e.timedRows, 7) + '   ' + pad(ms(e.ms), 30) + ms(e.meanMs));
  }
  if (Object.keys(report.toolByName).length === 0) out.push('  (no tool leaf rows)');
  out.push('');

  out.push('5. Bash by command (leading segment head)', '');
  if (report.bashByCommand === null) {
    // The heading is printed with the reason in place of the table, so its absence can never read as
    // "no Bash work happened".
    out.push('  OMITTED: ' + q.bashOmittedReason);
  } else {
    out.push('  ' + pad('command', 28) + padLeft('rows', 7) + padLeft('timed', 7) + '   ' + pad('total', 30) + 'mean');
    for (const k of sortedEntries(report.bashByCommand, (e) => e.ms)) {
      const e = report.bashByCommand[k];
      out.push('  ' + pad(k, 28) + padLeft(e.rows, 7) + padLeft(e.timedRows, 7) + '   ' + pad(ms(e.ms), 30) + ms(e.meanMs));
    }
    if (Object.keys(report.bashByCommand).length === 0) out.push('  (no Bash leaf rows)');
  }
  out.push('');

  out.push(renderFooter(q), '');
  return out.join('\n');
}

function renderJson(report) {
  const text = JSON.stringify(report, null, 2);
  // Asserted on the SERIALISED object, so a machine consumer cannot lose a caveat the text renderer
  // prints — the check has to survive serialisation to mean anything.
  const back = JSON.parse(text);
  if (!isPlainObject(back) || !isPlainObject(back.quality)) {
    throw new Error('internal: the JSON output carries no `quality` object');
  }
  const missing = FOOTER_ITEMS.filter((k) => !Object.prototype.hasOwnProperty.call(back.quality, k));
  if (missing.length > 0) throw new Error('internal: the JSON footer is missing ' + missing.join(', '));
  return text;
}

/* ------------------------------------------------------------------ CLI */

/**
 * `scripts/ptp-otel-sink.js`'s `parseArgv` (lines 2963–2975), EXTENDED with the `--key=value` form.
 *
 * The extension is required rather than cosmetic: the sink's copy does `key = a.slice(2)` with no
 * `=` handling at all, so `--format=json` would parse as a flag literally named `format=json` and
 * `main()`'s whitelist would refuse the exact invocation §23.1, the spec delta, and the machine
 * consumer contract all document. The sink's grammar is a strict subset of this one, so `--repo`
 * keeps both spellings and nothing about it changes.
 */
function parseArgv(list) {
  // A NULL-PROTOTYPE map, for the same reason every record-keyed map above is one: the keys come from
  // OUTSIDE — here from the command line. On a plain `{}`, `argv['__proto__'] = true` assigns a
  // non-object to `__proto__` and is SILENTLY DISCARDED, so no own property is created, `Object.keys`
  // never sees it, and `main()`'s stray-flag whitelist waves `--__proto__` through and runs a full
  // analysis on a flag it was supposed to refuse. With no inherited keys the assignment is an ordinary
  // own property and the whitelist catches it like any other invented flag.
  const argv = Object.create(null);
  // Positionals accumulate in a LOCAL array, never directly on `argv._`. A literal `--_` flag claims
  // that same key, so writing positionals straight to `argv._` made `--_ x y` push onto a STRING and
  // throw a TypeError out of a pure helper — surfacing as exit `1` ("an unexpected internal error")
  // for what is simply a malformed command line the contract says must exit `2`.
  const positional = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) { argv[body.slice(0, eq)] = body.slice(eq + 1); continue; }
      const next = list[i + 1];
      if (next === undefined || next.startsWith('--')) argv[body] = true;
      else { argv[body] = next; i++; }
    } else positional.push(a);
  }
  // `_` carries the positionals — UNLESS a `--_` flag already claimed the key, in which case that
  // flag's value is left in place so `main()`'s `Array.isArray` guard sees the collision and refuses.
  // Every legitimate invocation is byte-identical to before: `_` is the positional array.
  if (argv._ === undefined) argv._ = positional;
  return argv;
}

const REFUSAL = 'ptp telemetry: analyze takes no argument and only --format=json.';

async function main() {
  const argv = parseArgv(process.argv.slice(2));

  // A whitelist, not a blacklist — mirroring the stray-flag guard `ptp-otel-sink.js` applies to
  // `export`. An invented or misspelled flag must never silently run a different analysis. The test
  // is on the PARSED key, so `--format=json` and `--format json` both resolve to `format` and are
  // both accepted, while `--format=xml` and `--formats=json` are both refused.
  const stray = Object.keys(argv).filter((k) => k !== '_' && k !== 'repo' && k !== 'format');
  // `--_` is a flag like any other and must be REFUSED, but its body collides with the positional
  // array's own key: `parseArgv` would overwrite `argv._` with `true` (or with a string), the `k !== '_'`
  // filter above would skip it as though it were the positional list, and `argv._.length` on a boolean
  // is `undefined` — so `--_` slipped through the whitelist and ran an analysis. Requiring `_` to still
  // BE an array is what closes that, and it costs nothing in every legitimate invocation.
  const positional = Array.isArray(argv._) ? argv._ : null;
  const format = argv.format === undefined ? 'text' : argv.format;
  // A VALUELESS `--repo` is REFUSED, never silently degraded. `parseArgv` resolves a flag with no
  // value to `true`, so `--repo` alone (or `--repo --format=json`, or `--repo ""`) would otherwise
  // fall through to `process.cwd()` and analyse a DIFFERENT store from the one the caller named —
  // reporting figures, or the "no telemetry exists" statement, about a root the user never asked for.
  // `--format` already refuses this way (`true` matches neither `text` nor `json`); leaving `--repo`
  // as the one asymmetric hole is what made the same malformed input refuse for one flag and quietly
  // change the answer for the other.
  const repoGiven = argv.repo !== undefined;
  const repoUsable = typeof argv.repo === 'string' && argv.repo.length > 0;
  if (positional === null || positional.length > 0 || stray.length > 0
    || (format !== 'text' && format !== 'json') || (repoGiven && !repoUsable)) {
    process.stderr.write(REFUSAL + '\n');
    process.exitCode = 2;
    return;
  }

  const repoRoot = repoUsable ? path.resolve(argv.repo) : process.cwd();
  const telemetryRoot = path.resolve(repoRoot, resolveConfig(repoRoot).root);

  const loaded = loadRecords(telemetryRoot);
  const nesting = classifyNesting(loaded.records);
  // The WHOLE load result is passed through, not just its records (§23.7's footer needs the source,
  // the files, the four skip tallies, and both CSV lists).
  const report = analyze(loaded, nesting);

  // Exit `0` on a rendered report, INCLUDING the empty-store statement: a store being empty or
  // degraded is never an error.
  process.stdout.write(format === 'json' ? renderJson(report) + '\n' : renderText(report));
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('ptp-telemetry-analyze: ' + (err && err.stack ? err.stack : String(err)) + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  ENTRY_KIND, ENTRY_VERSION, WRAPPER_TOOL_NAMES, WRAPPER_RAW_SPAN_NAME,
  COMPLETED_WINDOW_DILATION_MS, classifyNesting,
  parseArgv, resolveConfig, loadRecords, num, ts,
  isWrapper, isLLM, isTool, isLeaf, wrapperCounts,
  toInterval, toWrapperInterval, mergeIntervals, coveredExtent, intersectUnions,
  NAV_HEADS, FOOTER_ITEMS, bashCommandKey, analyze, renderText, renderJson,
};
