#!/usr/bin/env node
/**
 * ptp-otel-sink — the ptp OTLP/HTTP receiver, its lifecycle, and `export`.
 *
 * Normative contract: `skills/ptp-telemetry/SKILL.md`. This file is the ONE executable
 * implementation of that skill's OTel-attribute -> column table and its `tool_class` table
 * (SKILL.md §10.4 and §10.6); `export` calls the same code path the receiver does, so a reclassification
 * always reproduces the receiver's buckets. Changing the skill's tables and changing this file is
 * one change, never two.
 *
 * Subcommands:
 *   serve     run the receiver in the foreground (what `start` spawns)
 *   start     idempotent background start + lockfile
 *   stop      verify-then-terminate
 *   status    read-only preflight verdict (JSON)
 *   preamble  the auto-start preamble's mechanical half (JSON verdict + at most one advisory)
 *   export    global, deterministic re-derivation of every spans.csv
 *   setup-plan / setup-apply   the confirm-first settings.local.json writer, split across the
 *             confirmation: `setup-plan` writes nothing at all, `setup-apply` runs only after the
 *             user confirmed the plan.
 *
 * Test/escape hatch: PTP_HOME_DIR overrides the home directory used to locate the *global*
 * `~/.claude/ptp/config.json` layer. It exists so the verification harness can resolve config
 * without touching the real user config; nothing in the shipped prompt contracts sets it.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
// The layered config reader. `ptp-workspace` (skills/ptp-workspace/SKILL.md) owns the layer list and
// its precedence; this file states neither and supplies only telemetry's own validity rules.
const { configLayers, resolveConfigKey, REJECT } = require('./ptp-resolve-workspace.js');

/* ------------------------------------------------------------------ constants */

const RECORD_SCHEMA_VERSION = 1; // the CSV/record `schema_version` column
const ENTRY_KIND = 'ptp.span_record'; // the raw NDJSON envelope's only kind in this change
const ENTRY_VERSION = 1; // the envelope version, moving independently of the record's
const IDENTITY_PATH = '/ptp-sink/identity';
const LOCKFILE_NAME = '.ptp-otel-sink.pid';
const CREDENTIAL_NAME = '.ptp-telemetry-credential';
const CREDENTIAL_HEADER = 'x-ptp-store-token';
const DEFAULT_PORT = 4318;
const DEFAULT_ROOT = 'openspec/telemetry';
const BASH_COMMAND_MAX = 512;
const MAX_BODY_BYTES = 64 * 1024 * 1024;
const IDENTITY_RESPONSE_MAX_BYTES = 1024 * 1024; // §9.2's object is a few hundred bytes; this is the bound, not the size
const PROBE_TIMEOUT_MS = 250;
const READINESS_ATTEMPTS = 8;
const READINESS_CADENCE_MS = 250;
const READINESS_DEADLINE_MS = 2000;
const SHIPPED_PROTOCOL = 'http/json';
const BSP_SCHEDULE_DELAY = '5000';

/* Codex telemetry (0032_06). The one executable copy of SKILL.md §22's canonical definitions. */
const CODEX_SERVICE_NAME = 'codex_exec';        // §22.1: the record-level origin discriminator's value
const CODEX_CORRELATION_ATTR = 'env';           // §22.1: `otel.environment` arrives as resource attr `env`
const CODEX_CONSENT_NAME = '.ptp-codex-telemetry-consent.json';
const CODEX_CONSENT_KIND = 'ptp.codex_telemetry_consent';
const CODEX_CONSENT_VERSION = 1;
// Managed-key replacement (§22.3): exactly these keys are owned, replaced, and read back. Every other
// key in the consent record — inside the object as well as outside any block — is preserved verbatim.
const CODEX_CONSENT_MANAGED_KEYS = [
  'ptp_consent_kind', 'ptp_consent_version', 'consent', 'granted_at',
  'log_endpoint', 'trace_endpoint', 'credential_fingerprint',
];

const CSV_COLUMNS = [
  'schema_version', 'epic', 'change_id', 'command', 'phase', 'agent_role', 'agent_label', 'cli',
  'run_id', 'session_id', 'trace_id', 'span_id', 'parent_span_id', 'span_kind', 'tool_name',
  'tool_class', 'model', 'start_ts', 'end_ts', 'duration_ms', 'success', 'error', 'input_tokens',
  'output_tokens', 'cost_usd', 'notes',
];

const SPAN_KINDS = new Set([
  'llm_request', 'tool', 'tool.execution', 'interaction', 'api_request', 'tool_result',
]);
const LLM_KINDS = new Set(['llm_request', 'api_request']);

// tool_class — the executable copy of SKILL.md §10.6's table. Do not add a rule here without
// adding it there in the same change.
const TOOL_CLASS_BY_NAME = {
  Grep: 'search', Glob: 'search',
  Read: 'read',
  Write: 'write', Edit: 'write', NotebookEdit: 'write',
  Agent: 'agent', Workflow: 'agent', Skill: 'agent',
};
const BASH_BUILD_TEST = new Set([
  'npm', 'pnpm', 'yarn', 'bun', 'npx', 'jest', 'vitest', 'mocha', 'ava', 'tsc', 'tsx',
  'pytest', 'tox', 'nox', 'unittest', 'go', 'cargo', 'mvn', 'gradle', 'gradlew', 'dotnet',
  'make', 'cmake', 'ninja', 'msbuild', 'rake', 'rspec', 'ctest', 'eslint', 'prettier',
  'ruff', 'mypy', 'pylint', 'flake8', 'phpunit', 'bazel', 'meson',
]);
const BASH_SEARCH = new Set([
  'rg', 'grep', 'egrep', 'fgrep', 'ag', 'ack', 'find', 'fd', 'locate', 'ls', 'dir', 'tree',
  'which', 'where', 'awk', 'sed',
]);

/* ------------------------------------------------------------------ tiny utils */

function nowIso(ms) { return new Date(typeof ms === 'number' ? ms : Date.now()).toISOString(); }
function utcDayKey(ms) { return nowIso(ms).slice(0, 10).replace(/-/g, ''); }
function stripLineBreaks(v) { return String(v).replace(/[\r\n]+/g, ' '); }
function readJsonFile(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
/**
 * Every OTLP collection is read through this. A JSON body can legally parse while carrying a STRING
 * where the protocol names a list, and a bare `x || []` hands that string to `for...of`, which
 * iterates its characters — so `{"spans":"x"}` fabricates a record out of a character and appends it
 * to the append-only, immutable raw store (§12.1), where nothing can ever remove it. A non-iterable
 * value throws instead and is answered `400` by the flatten guard, so the string case is the one that
 * silently materializes junk.
 */
function asArray(v) { return Array.isArray(v) ? v : []; }
function isPlainObject(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(startDir || process.cwd());
    dir = up;
  }
}

/* ------------------------------------------------------------------ config (§1, forgiving) */

function isValidRoot(v) {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (/[\r\n]/.test(v)) return false;
  if (path.isAbsolute(v) || /^[a-zA-Z]:/.test(v) || v.startsWith('\\\\') || v.startsWith('/')) return false;
  const parts = v.split(/[\\/]+/).filter((s) => s.length > 0 && s !== '.');
  if (parts.some((s) => s === '..')) return false;
  return parts.length > 0;
}

function isValidPort(v) { return Number.isInteger(v) && v >= 1 && v <= 65535; }

/**
 * §1's layered, FORGIVING resolution. The layer list, its order, its duplicate-path rule, and the
 * per-key merge are `ptp-workspace`'s (`skills/ptp-workspace/SKILL.md`); this file restates no layer
 * order and no precedence of its own, and contributes only telemetry's three validity rules as
 * normalizers. `PTP_HOME_DIR` keeps its meaning inside the shared builder.
 */
function resolveConfig(repoRoot) {
  const layers = configLayers({ repoRoot });
  const mode = resolveConfigKey(layers, 'telemetry.mode', (v) => (v === 'on' || v === 'off' ? v : REJECT), 'off');
  const root = resolveConfigKey(layers, 'telemetry.root', (v) => (isValidRoot(v) ? v : REJECT), DEFAULT_ROOT);
  const port = resolveConfigKey(layers, 'telemetry.port', (v) => (isValidPort(v) ? v : REJECT), DEFAULT_PORT);
  return { mode: mode.value, root: root.value, port: port.value };
}

function storePaths(repoRoot) {
  const cfg = resolveConfig(repoRoot);
  const telemetryRoot = path.resolve(repoRoot, cfg.root);
  return {
    cfg,
    repoRoot,
    telemetryRoot,
    lockfile: path.join(telemetryRoot, LOCKFILE_NAME),
    credentialFile: path.join(telemetryRoot, CREDENTIAL_NAME),
  };
}

function logFileFor(telemetryRoot) {
  const key = crypto.createHash('sha1').update(path.resolve(telemetryRoot)).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `ptp-otel-sink-${key}.log`);
}

/* ------------------------------------------------------------------ store policy (§9.3) */

const GITIGNORE_MANAGED = ['*.ndjson', CREDENTIAL_NAME, LOCKFILE_NAME, '!*.csv'];
const GITATTRIBUTES_CONTENT = '*.csv -text\n';

/**
 * The set of patterns a `.gitignore` already carries, normalized the way **git** normalizes them:
 * trailing whitespace is stripped, leading whitespace is NOT. A full `.trim()` would read
 * ` .ptp-telemetry-credential` — a pattern matching a file whose name begins with a space — as the
 * managed line, so the real rule would never be added and the credential would stay committable
 * while the check reported it protected.
 */
function gitignoreLines(text) {
  return String(text).split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
}

/**
 * Is `rule` the EFFECTIVE rule for its pattern in `present`? The single ordering test every managed
 * `.gitignore` decision goes through — the reconciler that ADDS a rule, the plan that reports which
 * are missing, and the read-back that `setup` and `start` stake the credential and the lockfile on.
 *
 * Membership is not effectiveness: git applies the LAST matching rule, so `X` followed by `!X` leaves
 * X unignored while a set test reports the managed line as plainly present — the reconciler would then
 * append nothing and the receiver would keep filling a store whose credential is committable. Because
 * every missing rule is APPENDED, restoring effectiveness is automatic: the appended copy is last.
 *
 * `rule` may itself be a negation (`!*.csv` is one of the managed lines), so the pattern and the
 * desired polarity are both taken from it.
 *
 * Scope, stated rather than implied: this resolves the exact pattern against its exact negation. It is
 * not a gitignore engine — a broader pattern elsewhere that re-includes the path is outside what any
 * textual check can see.
 */
function managedRuleEffective(present, rule) {
  const pattern = rule.startsWith('!') ? rule.slice(1) : rule;
  let effective = null;
  for (const line of present) {
    if (line === pattern) effective = pattern;
    else if (line === '!' + pattern) effective = '!' + pattern;
  }
  return effective === rule;
}

/** Managed-line reconciliation: add missing managed lines, preserve everything else. */
function reconcileGitignore(telemetryRoot) {
  try {
    fs.mkdirSync(telemetryRoot, { recursive: true });
    const file = path.join(telemetryRoot, '.gitignore');
    let existing = '';
    try { existing = fs.readFileSync(file, 'utf8'); } catch (err) {
      // ONLY `ENOENT` is absence. Every other read error means the file is THERE and we cannot see
      // it — and the create branch below writes with `w`, which TRUNCATES. Treating an unreadable
      // file as absent therefore replaces every rule it holds with the four managed lines, which is
      // the exact opposite of §9.3's "add only missing managed lines, preserve every other line".
      // Returning instead leaves the file alone; the read-back in `serve` / `launchReceiver` then
      // refuses to bring a receiver up into a store it cannot confirm is protected (§14.1).
      if (!err || err.code !== 'ENOENT') return;
      existing = null;
    }
    if (existing === null) {
      try {
        // EXCLUSIVE create, not a plain write: between the read above and this line another ptp
        // process can have created the file with rules of its own, and the default `w` flag would
        // TRUNCATE them. §9.3's "add only missing managed lines, preserve every other line" is not
        // conditional on winning that race.
        fs.writeFileSync(file, GITIGNORE_MANAGED.join('\n') + '\n', { flag: 'wx' });
        return;
      } catch (err) {
        if (!err || err.code !== 'EEXIST') throw err; // to the outer swallow
        // Lost the race. The winner's file is complete, so fall through to the ordinary append-only
        // reconciliation against what it actually wrote.
        try { existing = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
      }
    }
    const present = gitignoreLines(existing);
    const missing = GITIGNORE_MANAGED.filter((l) => !managedRuleEffective(present, l));
    if (missing.length === 0) return;
    const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(file, sep + missing.join('\n') + '\n');
  } catch (_) { /* swallowed: telemetry never fails anything */ }
}

/** create-if-absent; an existing file is left untouched. */
function ensureGitattributes(telemetryRoot) {
  try {
    fs.mkdirSync(telemetryRoot, { recursive: true });
    const file = path.join(telemetryRoot, '.gitattributes');
    // Exclusive create rather than exists-then-write: the check-then-act window lets a concurrent
    // creator's file be truncated by the default `w` flag, and §9.3 says an existing file is left
    // untouched. `EEXIST` is not an error here — it IS the create-if-absent success condition.
    try { fs.writeFileSync(file, GITATTRIBUTES_CONTENT, { flag: 'wx' }); } catch (_) { /* exists, or unwritable */ }
  } catch (_) { /* swallowed */ }
}

function storePolicyWrite(telemetryRoot) {
  reconcileGitignore(telemetryRoot);
  ensureGitattributes(telemetryRoot);
}

/* ------------------------------------------------------------------ CSV */

function csvField(v) {
  const s = v === null || v === undefined ? '' : stripLineBreaks(String(v));
  return /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvRow(record) { return CSV_COLUMNS.map((c) => csvField(record[c])).join(',') + '\r\n'; }
function csvHeader() { return '﻿' + CSV_COLUMNS.join(',') + '\r\n'; }

/** Atomic header initialization: temp file + create-only rename (§7 / §9.7). */
function ensureCsvHeader(csvPath) {
  if (fs.existsSync(csvPath)) return;
  const dir = path.dirname(csvPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(csvPath) + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
  try {
    fs.writeFileSync(tmp, csvHeader());
  } catch (err) {
    // The same temp-file hygiene the two branches below already keep, on the one write that sat
    // outside them: a `writeFileSync` that creates the file and then fails leaves a
    // `.spans.csv.<pid>.<hex>.tmp` no `.gitignore` rule matches. Rethrown so the batch still answers
    // 500 and the exporter still retries (§9.7's "a store write that failed must not be answered with
    // a success").
    try { fs.unlinkSync(tmp); } catch (_) { /* never created, or already gone */ }
    throw err;
  }
  try {
    // ONLY the link is in this try. Pairing the temp cleanup with it conflates two failures whose
    // meanings are opposite: a `linkSync` that SUCCEEDED and an `unlinkSync` that then failed (EBUSY,
    // EACCES, ENOENT — none of them in the `linksUnsupported` set below) would be rethrown as a link
    // failure, answering the batch 500 and making the exporter retry a header that was in fact
    // written correctly. The catch below reasons from "no header exists", so only a real link failure
    // may reach it.
    fs.linkSync(tmp, csvPath); // create-only: fails when the destination already exists
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
    // EEXIST: another writer won the create-only rename; its file is complete, so just append below.
    if (err && err.code === 'EEXIST') return;
    const linksUnsupported = err && (err.code === 'EPERM' || err.code === 'ENOSYS' || err.code === 'EXDEV'
      || err.code === 'ENOTSUP' || err.code === 'EOPNOTSUPP' || err.code === 'EMLINK');
    if (!linksUnsupported) {
      // Every OTHER link failure used to return normally, and `appendCsvRow` then appended a data row
      // to a file with no BOM and no header — §9.7's CSV hygiene silently lost, with no error raised
      // anywhere. The realistic codes are the filesystem ones this list cannot enumerate exhaustively
      // (a share, a FUSE mount), so the unknown case must fail rather than pass. Throwing reaches
      // `handleBatch`, which answers 500 and lets the exporter retry; the raw entry for this record is
      // already written, so `export` restores the row either way.
      throw err;
    }
    // No hard links available: fall back to an exclusive create, which is weaker only in a window no
    // writer of this store can currently be in (the receiver is the sole CSV writer).
    try { fs.writeFileSync(csvPath, csvHeader(), { flag: 'wx' }); } catch (err2) {
      // EEXIST here is the same race as above and is fine. Anything else means no header was written,
      // so the same rule applies: never let a data row be appended to a header-less file.
      if (!err2 || err2.code !== 'EEXIST') throw err2;
    }
  }
  // The header is in place on every path that reaches here (the link landed, or the no-hard-links
  // fallback created it). Dropping the temp is hygiene, never a condition of that success — so its
  // failure is swallowed rather than raised, and on the fallback path it is the already-unlinked
  // file's ENOENT.
  try { fs.unlinkSync(tmp); } catch (_) { /* already removed above, or unremovable */ }
}

function appendCsvRow(csvPath, record) {
  ensureCsvHeader(csvPath);
  fs.appendFileSync(csvPath, csvRow(record));
}

/* ------------------------------------------------------------------ raw NDJSON */

function rawFilePath(telemetryRoot, dirKey, ingestMs) {
  return path.join(telemetryRoot, dirKey, 'raw', utcDayKey(ingestMs) + '.ndjson');
}

/** Append one typed entry, always beginning on a fresh line (§9.7). */
function appendRawEntry(rawPath, record, extras) {
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  const entry = {
    ptp_entry_kind: ENTRY_KIND,
    ptp_entry_version: ENTRY_VERSION,
    record: Object.assign({}, record, extras),
  };
  let prefix = '';
  try {
    const st = fs.statSync(rawPath);
    if (st.size > 0) {
      let fd = null;
      try {
        fd = fs.openSync(rawPath, 'r');
        const buf = Buffer.alloc(1);
        fs.readSync(fd, buf, 0, 1, st.size - 1);
        if (buf[0] !== 0x0a) prefix = '\n';
      } finally {
        // A `readSync` that throws would otherwise leak this descriptor once per batch, for the whole
        // life of a receiver that is meant to run for the session.
        if (fd !== null) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
      }
    }
  } catch (err) {
    // An ABSENT file needs no prefix. Any other failure means we could not tell whether the file ends
    // with a newline, and §9.7's two errors are not symmetric: a MISSING prefix concatenates this
    // entry onto a torn fragment and loses both records ("one lost record silently becoming two"),
    // while a SUPERFLUOUS one leaves a blank line that `readRawFile` skips before parsing. So an
    // uninspectable tail defaults to emitting the prefix, never to omitting it.
    if (!err || err.code !== 'ENOENT') prefix = '\n';
  }
  fs.appendFileSync(rawPath, prefix + JSON.stringify(entry) + '\n');
}

/**
 * Read one raw NDJSON file with slice-1 torn-line tolerance: an unparseable *trailing* line is
 * skipped silently, an unparseable *interior* line is skipped and counted.
 */
function readRawFile(file, out) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
    // ENOENT is the ONE expected failure: §21's retention pruner deletes aged raw files, and §21.3
    // already records that their rows leave the CSV on the next `export`. Every other error — EACCES,
    // EIO, a file held open exclusively — means records this store still holds could not be read, and
    // that is NOT one of §12.4's three tolerated conditions (torn trailing line, malformed interior
    // line, unrecognized entry kind). Swallowing it would let `export` REPLACE a `spans.csv` that
    // already carries those rows with one derived from a subset, deleting them from the materialized
    // view while reporting `exported`.
    if (!err || err.code !== 'ENOENT') out.unreadable.push(file + ' (' + ((err && err.code) || 'read-failed') + ')');
    return;
  }
  const lines = text.split('\n');
  const endsWithNewline = text.endsWith('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1 || (i === lines.length - 2 && endsWithNewline && lines[lines.length - 1] === '');
    if (line.trim() === '') continue;
    let obj = null;
    try { obj = JSON.parse(line); } catch (_) { obj = null; }
    // `isPlainObject`, not `typeof x === 'object'`: `typeof [] === 'object'`, so a JSON ARRAY line
    // would otherwise be read as an envelope (and counted as an unrecognized kind rather than the
    // malformed line it is), and an array-valued `record` would be accepted as a record — carrying
    // none of the 26 column keys, so `export` would emit a fabricated, entirely empty CSV row instead
    // of counting a malformed interior line. This is the same trap `handleBatch` already guards.
    if (!isPlainObject(obj)) {
      if (isLast && !endsWithNewline) out.tornTrailing += 1;
      else out.malformedInterior += 1;
      continue;
    }
    if (obj.ptp_entry_kind !== ENTRY_KIND) { out.skippedKinds += 1; continue; }
    if (!isPlainObject(obj.record)) { out.malformedInterior += 1; continue; }
    out.records.push(obj.record);
  }
}

/* ------------------------------------------------------------------ OTLP flatten (SKILL §10.4) */

function attrValue(v) {
  if (!v || typeof v !== 'object') return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return typeof v.intValue === 'string' ? Number(v.intValue) : v.intValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('boolValue' in v) return v.boolValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(attrValue).join('|');
  return undefined;
}
function attrsToMap(list, into) {
  const map = into || {};
  for (const a of asArray(list)) {
    if (!a || typeof a.key !== 'string') continue;
    const val = attrValue(a.value);
    if (val !== undefined) map[a.key] = val;
  }
  return map;
}
function numeric(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}
function nanosToMs(v) {
  const n = numeric(v);
  if (n === undefined || n <= 0) return undefined;
  return Math.round(n / 1e6);
}
function firstDefined(map, keys) {
  for (const k of keys) if (map[k] !== undefined && map[k] !== '') return map[k];
  return undefined;
}

/**
 * Read one field out of a JSON-stringified attribute payload.
 *
 * Claude Code carries a tool's inputs as a JSON **string** in a single flat attribute, not as flat
 * scalar attributes — so `firstDefined`, which does a literal flat property lookup on the flattened map,
 * can never reach them however many key names it is given. Measured against Claude Code 2.1.220:
 * `tool_parameters` = `{"bash_command":"git","full_command":"git status --porcelain",…}`.
 *
 * Parsing is defensive by contract, not by taste: §12's "telemetry writes are fire-and-forget and
 * never fail a ptp command" means a malformed payload from a future CLI version may cost this one
 * record its command text and NOTHING else. Every failure — absent attribute, non-string attribute,
 * unparseable JSON, a parsed value that is not a plain object, a field that is absent or not a
 * non-empty string — yields `undefined` so the caller falls through to its next source. It never
 * throws.
 *
 * `isPlainObject` rather than `typeof === 'object'`: `typeof [] === 'object'` and
 * `typeof null === 'object'`, and the same trap is already guarded this way at `handleBatch` and in
 * the raw-store reader. The `typeof v === 'string'` field guard also keeps `Object.prototype` names
 * (`constructor`, `toString`) from resolving to a function.
 */
function jsonAttrField(map, attrKey, fields) {
  const raw = map[attrKey];
  if (typeof raw !== 'string' || raw === '') return undefined;
  let obj = null;
  try { obj = JSON.parse(raw); } catch (_) { return undefined; }
  if (!isPlainObject(obj)) return undefined;
  for (const f of fields) {
    const v = obj[f];
    if (typeof v === 'string' && v !== '') return v;
  }
  return undefined;
}

function spanKindFor(rawName) {
  const name = String(rawName || '');
  const short = name.startsWith('claude_code.') ? name.slice('claude_code.'.length) : name;
  return SPAN_KINDS.has(short) ? short : 'other';
}

/**
 * The Codex half of §10.3/§10.4's `span_kind` mapping — the executable copy of SKILL.md §22.5's
 * catalogue, which `0032_05_codex-telemetry-scope-spike`'s decision record catalogued (§7a, §7b).
 *
 * Scoped to records whose persisted `service_name` is `codex_exec`, and to nothing else. The
 * catalogue maps **kinds of Codex work**; it is never origin evidence, so it is applied only after
 * the record-level discriminator has already said the record is Codex's. A Claude record whose span
 * happened to be named `shell_command` keeps the baseline mapping.
 *
 * Unknown names fall through to `other` with the raw name retained — the baseline's own rule, and
 * advisory **A-2**'s recorded mapping gap rather than an error.
 */
const CODEX_SPAN_KINDS = {
  // log events (§7a) — the signal that carries Codex's timing data
  'codex.sse_event': 'llm_request',   // input_token_count / output_token_count, event.kind=response.completed
  'codex.tool_result': 'tool_result', // tool_name, call_id, duration_ms, success
  'codex.tool_decision': 'tool',      // tool_name, decision, call_id
  // `codex.api_request` is deliberately ABSENT: its endpoint is `/models`, an HTTP metadata/auth
  // call, so the record classifies it `other` rather than LLM. Listing it would be the one mapping
  // that inflates LLM time with non-LLM work.
  // spans (§7b) — emitted only when the opt-in trace exporter is configured
  'session_task.turn': 'llm_request', // codex.turn.token_usage.* plus `model`
  'shell_command': 'tool',            // tool_name=shell_command, call_id, aborted
};
const CODEX_LLM_TOKEN_KEYS = [
  'input_token_count', 'codex.turn.token_usage.input_tokens',
  'output_token_count', 'codex.turn.token_usage.output_tokens',
];

function codexSpanKind(rawName, attrs, isLogRecord) {
  // On the LOG signal — the default signal (**A-6**), and the one carrying Codex's timing data — the
  // catalogue's keys ARE the `event.name` values: §10.3's Codex log rows are written that way. §10.4's
  // source-name derivation is CLAUDE-shaped, though: a body-less log record becomes
  // `claude_code.` + `event.name`, and a record carrying a body becomes that body's text — neither of
  // which any Codex catalogue key can ever match, so keying the lookup on the derived name alone would
  // silently map every Codex log event to `other` and leave both token columns empty. A Codex record's
  // lookup key is therefore its own `event.name` where it carries one, and the source name otherwise.
  // The `event.name` key is consulted on the LOG signal ONLY — §10.3's catalogue annotates each row
  // `(log)` or `(span)`, and a span is classified by its span name. Scoping it by signal rather than by
  // key presence keeps a span that happens to carry an `event.name` attribute — or a resource carrying
  // one, which the merged map would put on every span in the batch — from being read off the log half
  // of the catalogue.
  const eventName = isLogRecord && attrs && attrs['event.name'] !== undefined && attrs['event.name'] !== ''
    ? String(attrs['event.name'])
    : '';
  const name = eventName || String(rawName || '');
  if (Object.prototype.hasOwnProperty.call(CODEX_SPAN_KINDS, name)) return CODEX_SPAN_KINDS[name];
  // `handle_responses` is **mixed per instance** (§7b): 6 observed instances carry `gen_ai.usage.*`
  // and 10 carry `tool_name`, so the name alone carries no class and the decision must key off the
  // record's own attributes. This is the one name-keyed rule the baseline's `spanKindFor` cannot
  // express, which is why the Codex classifier takes the attribute map at all.
  if (name === 'handle_responses') {
    // "any token attribute" (§10.3) means every key the projection below actually reads for the two
    // token columns — including the BASELINE `input_tokens` / `output_tokens` pair. Omitting those two
    // would classify a `handle_responses` instance carrying them as `other`, which then fails the
    // `LLM_KINDS` gate and drops the very counts the record says are available.
    const hasTokens = CODEX_LLM_TOKEN_KEYS
      .concat(['input_tokens', 'output_tokens', 'gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens'])
      .some((k) => attrs[k] !== undefined && attrs[k] !== '');
    if (hasTokens) return 'llm_request';
    if (attrs.tool_name !== undefined && attrs.tool_name !== '') return 'tool';
    return 'other';
  }
  return 'other';
}

/** The retained Bash command text (§10.5): CR/LF -> single spaces, truncated to 512 chars. */
function retainCommand(raw) {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).replace(/[\r\n]+/g, ' ');
  if (normalized.length <= BASH_COMMAND_MAX) return { text: normalized, truncated: false };
  return { text: normalized.slice(0, BASH_COMMAND_MAX), truncated: true };
}

function bashSegmentHeads(text) {
  return String(text)
    .split(/&&|\|\||[|;]/)
    .map((seg) => seg.trim().split(/\s+/)[0] || '')
    .map((tok) => {
      const base = tok.split(/[\\/]/).pop() || '';
      return base.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
    })
    .filter((t) => t.length > 0);
}

/** The one executable copy of the `tool_class` table (SKILL.md §10.6). */
function deriveToolClass(toolName, bashText) {
  if (!toolName) return '';
  if (Object.prototype.hasOwnProperty.call(TOOL_CLASS_BY_NAME, toolName)) return TOOL_CLASS_BY_NAME[toolName];
  if (toolName !== 'Bash') return 'other';
  const heads = bashSegmentHeads(bashText || '');
  if (heads.length === 0) return 'other';
  if (heads.includes('git')) return 'git';                          // 1st
  if (heads.some((h) => BASH_BUILD_TEST.has(h))) return 'build_test'; // 2nd
  if (heads.some((h) => BASH_SEARCH.has(h))) return 'search';         // 3rd
  return 'other';                                                     // 4th
}

function baseRecord() {
  const r = {};
  for (const c of CSV_COLUMNS) r[c] = '';
  r.schema_version = RECORD_SCHEMA_VERSION;
  return r;
}

/**
 * Project one span/event onto the 26 record fields plus the three raw-only extras.
 * `source` is `{ rawName, traceId, spanId, parentSpanId, startMs, endMs, attrs, resourceAttrs, status }`.
 * `resourceAttrs` is the OTLP **resource** attribute map on its own, deliberately unmerged: `service.name`
 * is a resource-level attribute and is persisted from that scope, so a span- or log-level attribute of
 * the same name cannot shadow the origin discriminator. It is optional — an absent map yields `''`.
 */
function projectSource(source) {
  const rec = baseRecord();
  const attrs = source.attrs || {};
  const resourceAttrs = source.resourceAttrs || {};
  const notes = [];

  // §10.2: **no** record field may contain a CR or an LF. The rule binds the record itself, not
  // just its CSV rendering — the raw NDJSON entry is the authoritative copy, so a field is
  // sanitized here, once, rather than at each serialization site.
  const str = (v) => (v === undefined || v === null ? '' : stripLineBreaks(String(v)));

  // §10.5's third extra, read from the RESOURCE scope so a record-level attribute of the same name
  // cannot shadow it. It is computed first because the Codex `span_kind` catalogue is scoped by it.
  const serviceName = str(resourceAttrs['service.name']);
  const isCodex = serviceName === CODEX_SERVICE_NAME;

  // `signal` distinguishes the two OTLP signals for the one rule that differs between them (the Codex
  // catalogue's log half); an absent value means the trace signal, since only `flattenLogs` sets it.
  rec.span_kind = isCodex
    ? codexSpanKind(source.rawName, attrs, source.signal === 'logs')
    : spanKindFor(source.rawName);
  // §22.4: Codex's own session identity as received — recorded because the fixed schema has the
  // column, never used as a join key, and never borrowed from the shelling-out Claude session.
  rec.session_id = str(firstDefined(attrs, ['session.id', 'session_id']));
  rec.trace_id = str(source.traceId);
  rec.span_id = str(source.spanId);
  rec.parent_span_id = str(source.parentSpanId);
  rec.model = str(firstDefined(attrs, ['model', 'gen_ai.request.model', 'gen_ai.response.model']));
  rec.tool_name = str(firstDefined(attrs, ['tool_name', 'tool.name']));

  // The Bash command text is NOT a flat attribute. Claude Code carries it JSON-stringified inside
  // `tool_parameters` (on BOTH `tool_decision` and `tool_result`) and inside `tool_input`
  // (`tool_result` only) — and emits NEITHER unless `OTEL_LOG_TOOL_DETAILS` is truthy, which is why
  // §13.2's block writes it. Measured against Claude Code 2.1.220 with a captured live payload; the
  // four flat keys below were read for the life of this file and never once matched, which is why
  // every `bash_command.text` written before this change is empty.
  //
  // MIND THE NAME COLLISION: the payload's own `bash_command` field is the command's FIRST TOKEN
  // only ("cd" for `cd . && git status`), NOT this record's `bash_command` extra. Reading it would
  // silently defeat §10.6's ordered sub-rules, which split on `&&`/`||`/`;`/`|` and need the whole
  // line. `full_command` is the whole line and is therefore preferred; the head token is kept only
  // as a third-choice degradation, since a `git` or `rg` head still buys the right bucket.
  //
  // SCOPED TO `Bash`, and the scoping is load-bearing rather than tidiness. The resolved value has
  // exactly one consumer — `retained` below, which is already `null` for every other tool — so off
  // the Bash path the whole chain is work whose result is discarded. It would not be FREE work:
  // unlike `tool_parameters`, whose command fields the emitter writes only on the Bash branch,
  // `tool_input` is emitted on EVERY `tool_result` and carries the whole serialized tool input (the
  // captured `tool_result` carries a sibling `tool_input_size_bytes` measuring exactly that payload),
  // so a `Write`/`Edit` result carries the entire file content. Running rung 2 over that would
  // `JSON.parse` a payload proportional to the file — allocating the whole object graph on the
  // receiver's synchronous ingest path and then dropping it — once per non-Bash tool event in every
  // batch; measured at ~8 ms for a 12 MB input. What this replaced was four flat property lookups
  // that cost nothing; the guard is what keeps that true everywhere the command text is not wanted.
  let command;
  if (rec.tool_name === 'Bash') {
    command = jsonAttrField(attrs, 'tool_parameters', ['full_command']);
    if (command === undefined) command = jsonAttrField(attrs, 'tool_input', ['command']);
    if (command === undefined) command = jsonAttrField(attrs, 'tool_parameters', ['bash_command']);
    // Retained last, not removed: an emitter that does supply a flat key still works, and nothing
    // that reads today can regress.
    if (command === undefined) command = firstDefined(attrs, ['command', 'tool.command', 'tool_input.command', 'bash.command']);
  }
  const retained = rec.tool_name === 'Bash' ? retainCommand(command === undefined ? '' : command) : null;
  rec.tool_class = deriveToolClass(rec.tool_name, retained ? retained.text : '');

  // Timestamps. A single-timestamp source (a log event) reports the moment the thing *finished*,
  // so it supplies end_ts and start_ts is derived backwards from duration_ms.
  // ONLY `duration_ms` — §10.4's table names that one attribute and nothing else. Accepting a bare
  // `duration` too would be a second, undocumented rule, and would fabricate a `start_ts` out of a
  // value in unknown units the moment any source happened to carry one.
  const attrDuration = numeric(attrs.duration_ms);
  let startMs = source.startMs;
  let endMs = source.endMs;
  if (startMs !== undefined && endMs !== undefined) {
    // The difference as received, unclamped: §10.2 forbids a fabricated zero, and clamping a
    // reversed pair (a clock adjustment mid-span) to 0 is exactly that — it would hide the anomaly
    // behind a plausible-looking value instead of reporting it.
    rec.duration_ms = Math.round(endMs - startMs);
  } else if (endMs !== undefined) {
    if (attrDuration !== undefined) {
      startMs = endMs - Math.round(attrDuration);
      rec.duration_ms = Math.round(attrDuration);
    } else {
      startMs = endMs;
      rec.duration_ms = '';
    }
  } else if (startMs !== undefined && attrDuration !== undefined) {
    endMs = startMs + Math.round(attrDuration);
    rec.duration_ms = Math.round(attrDuration);
  }
  // `||`, not `&&`: §10.2's rule is "a span missing a usable start **OR** end timestamp SHALL be
  // written with the timestamp fields empty, `duration_ms` empty, and the reason in `notes` — never
  // with a fabricated or zero time." The four branches above resolve BOTH ends whenever they can (a
  // log event's single timestamp supplies `end_ts` and `start_ts` is taken from it, which is why that
  // case reaches the else below with both populated and keeps the ledger attribution §10.3's log-event
  // scenario requires). What is left is the half-timed span — a `/v1/traces` span carrying
  // `startTimeUnixNano` but no usable end and no `duration_ms`, i.e. one that never ended or was cut
  // off mid-flight. With `&&` it was written with a populated `start_ts`, an empty `end_ts`, and no
  // note at all: not merely a silent schema violation, but a malformed span whose surviving start
  // timestamp still had to be CONTAINED by a candidate run window, so it narrowed — and could empty —
  // the candidate set for every span sharing its `trace_id`. Cleared, it becomes a record with no
  // usable `start_ts`, which §11.3 excludes from candidate-narrowing and lets inherit its group's
  // attribution. Deriving the missing end from the start instead is what "never with a fabricated
  // time" forbids: a span that has not ended has no end to record.
  if (startMs === undefined || endMs === undefined) {
    rec.start_ts = '';
    rec.end_ts = '';
    rec.duration_ms = '';
    notes.push('missing-timestamp');
  } else {
    rec.start_ts = startMs === undefined ? '' : nowIso(startMs);
    rec.end_ts = endMs === undefined ? '' : nowIso(endMs);
  }

  // success / error
  const st = source.status || {};
  const attrSuccess = attrs.success;
  if (attrSuccess === true || attrSuccess === 'true') rec.success = 'true';
  else if (attrSuccess === false || attrSuccess === 'false') rec.success = 'false';
  else if (st.code === 2 || st.code === 'STATUS_CODE_ERROR') rec.success = 'false';
  else if (st.code === 1 || st.code === 'STATUS_CODE_OK') rec.success = 'true';
  else rec.success = '';
  const errMsg = firstDefined(attrs, ['error', 'error.message', 'exception.message']) || st.message || '';
  rec.error = errMsg ? stripLineBreaks(errMsg) : '';

  // LLM-only columns
  if (LLM_KINDS.has(rec.span_kind)) {
    // The Codex source paths (§22.5, decision record §7c) are appended AFTER the baseline keys, so a
    // record carrying both is unchanged: `input_tokens` and `gen_ai.usage.input_tokens` still win.
    // Availability is evaluated PER COLUMN — the record found token counts obtainable and `cost_usd`
    // obtainable from no key at all (**A-3**), so cost is left empty here rather than the three being
    // treated as jointly available.
    const inTok = numeric(firstDefined(attrs, [
      'input_tokens', 'gen_ai.usage.input_tokens',
      'codex.turn.token_usage.input_tokens', 'input_token_count',
    ]));
    const outTok = numeric(firstDefined(attrs, [
      'output_tokens', 'gen_ai.usage.output_tokens',
      'codex.turn.token_usage.output_tokens', 'output_token_count',
    ]));
    const cost = numeric(firstDefined(attrs, ['cost_usd']));
    rec.input_tokens = inTok === undefined ? '' : inTok;
    rec.output_tokens = outTok === undefined ? '' : outTok;
    rec.cost_usd = cost === undefined ? '' : cost;
  }

  const extras = {
    bash_command: retained,
    raw_span_name: rec.span_kind === 'other' ? str(source.rawName) : '',
    // §10.5's third extra: the OTel resource attribute `service.name`, persisted as received so a later
    // consumer can tell a Codex-originated record (`codex_exec`) from a Claude-originated one
    // (`claude-code`) without reading the derived `cli` column. Empty when the resource supplies none.
    // `str()` is deliberate and not incidental: it is the same CR/LF-stripping coercion every other
    // field uses, so the entry stays one physical line. It is the ONLY transformation applied — do not
    // trim, lower-case, or map the value.
    service_name: serviceName,
  };
  // Two join inputs the attribution pass reads (§22.4). Neither is a record field and neither is
  // persisted under its own name: `origin` is `extras.service_name` (persisted, and re-read from the
  // raw record on a later `export`), and `correlation` is the value `otel.environment` transported in
  // the RESOURCE attribute `env` — resolved into the record's EXISTING `run_id` field by the
  // attribution pass, never into a new one. Reading it from the resource scope, like `service.name`,
  // keeps a record-level attribute from shadowing the join key.
  return {
    record: rec,
    extras,
    notes,
    origin: serviceName,
    correlation: isCodex ? str(resourceAttrs[CODEX_CORRELATION_ATTR]) : '',
  };
}

function flattenTraces(body) {
  const out = [];
  for (const rs of asArray(body.resourceSpans)) {
    if (!isPlainObject(rs)) continue;
    const resAttrs = attrsToMap(rs.resource && rs.resource.attributes);
    // `||` rather than a presence test, so an absent `scopeSpans` still falls back to the legacy
    // `instrumentationLibrarySpans` name exactly as before; `asArray` only guards the iteration.
    for (const ss of asArray(rs.scopeSpans || rs.instrumentationLibrarySpans)) {
      if (!isPlainObject(ss)) continue;
      for (const span of asArray(ss.spans)) {
        if (!isPlainObject(span)) continue;
        const attrs = attrsToMap(span.attributes, Object.assign({}, resAttrs));
        out.push(projectSource({
          rawName: span.name,
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          startMs: nanosToMs(span.startTimeUnixNano),
          endMs: nanosToMs(span.endTimeUnixNano),
          attrs,
          resourceAttrs: resAttrs,
          status: span.status || {},
        }));
      }
    }
  }
  return out;
}

function flattenLogs(body) {
  const out = [];
  for (const rl of asArray(body.resourceLogs)) {
    if (!isPlainObject(rl)) continue;
    const resAttrs = attrsToMap(rl.resource && rl.resource.attributes);
    for (const sl of asArray(rl.scopeLogs || rl.instrumentationLibraryLogs)) {
      if (!isPlainObject(sl)) continue;
      for (const lr of asArray(sl.logRecords)) {
        if (!isPlainObject(lr)) continue;
        const attrs = attrsToMap(lr.attributes, Object.assign({}, resAttrs));
        let rawName = (lr.body && typeof lr.body.stringValue === 'string' && lr.body.stringValue) || '';
        // §10.4's `claude_code.` synthesis is a CLAUDE-shaped rendering — it exists so a Claude event
        // name reaches `spanKindFor`, which strips exactly that prefix. Stamping it onto a record whose
        // RESOURCE says `codex_exec` would put a Claude marker on a Codex record's retained raw name,
        // which §10.5 defines as the raw source name. Codex records keep their event name as received.
        if (!rawName && attrs['event.name']) {
          rawName = (resAttrs['service.name'] === CODEX_SERVICE_NAME ? '' : 'claude_code.') + attrs['event.name'];
        }
        let endMs = nanosToMs(lr.timeUnixNano) || nanosToMs(lr.observedTimeUnixNano);
        if (endMs === undefined && attrs['event.timestamp']) {
          const t = Date.parse(attrs['event.timestamp']);
          if (Number.isFinite(t)) endMs = t;
        }
        out.push(projectSource({
          rawName,
          traceId: lr.traceId,
          spanId: lr.spanId,
          parentSpanId: '',
          startMs: undefined,
          endMs,
          attrs,
          resourceAttrs: resAttrs,
          signal: 'logs',
          status: {},
        }));
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ ledger index (§11) */

/**
 * `out` is the OPTIONAL unreadable-input sink. Only a caller that must be COMPLETE passes it —
 * `export`, which replaces every `spans.csv` and so may not publish from a partial read. The receiver
 * omits it and keeps the swallow-everything posture telemetry requires: a ledger it cannot read this
 * second costs one batch its attribution, never the command it is instrumenting.
 */
function listStoreDirs(telemetryRoot, out) {
  let entries = [];
  try { entries = fs.readdirSync(telemetryRoot, { withFileTypes: true }); } catch (err) {
    // An ABSENT store root is the ordinary "nothing collected yet" state. An unreadable one hides an
    // unknown number of epic directories, which would silently become an export of nothing.
    if (out && (!err || err.code !== 'ENOENT')) out.unreadable.push(telemetryRoot + ' (' + ((err && err.code) || 'read-failed') + ')');
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

function ledgerSignature(telemetryRoot) {
  const sig = [];
  for (const dir of listStoreDirs(telemetryRoot)) {
    const file = path.join(telemetryRoot, dir, 'runs.ndjson');
    try {
      const st = fs.statSync(file);
      sig.push(dir + ':' + st.size + ':' + st.mtimeMs);
    } catch (_) { /* no ledger in this dir */ }
  }
  return sig.join('|');
}

/** `out` is the optional unreadable-input sink documented on `listStoreDirs` — `export` only. */
function buildLedgerIndex(telemetryRoot, out) {
  const byRun = new Map();
  for (const dir of listStoreDirs(telemetryRoot, out)) {
    const file = path.join(telemetryRoot, dir, 'runs.ndjson');
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
      // A store directory legitimately holds no ledger (ENOENT) — spans can arrive before any run is
      // recorded there. Any OTHER error means the join's INPUT is incomplete: §11.1 reads every
      // ledger, and an unread one silently fails to claim the records it would have claimed, so
      // `export` moves them to `_unattributed/` and PUBLISHES that as an authoritative reconciliation
      // — replacing the epic CSV that held them. §11.4's "the join rules are identical at ingest and
      // in `export`, so a re-derivation reproduces the placement" is not true across a read failure,
      // so the caller that must be complete is told rather than handed a silently different answer.
      if (out && (!err || err.code !== 'ENOENT')) out.unreadable.push(file + ' (' + ((err && err.code) || 'read-failed') + ')');
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let obj = null;
      try { obj = JSON.parse(line); } catch (_) { continue; } // torn/unparseable line: skip
      if (!obj || typeof obj !== 'object' || !obj.run_id) continue;
      const key = String(obj.run_id);
      let run = byRun.get(key);
      if (!run) {
        run = {
          run_id: key, dirKey: dir, lines: [],
          epic: '', change_id: '', command: '', phase: '', agent_role: '', agent_label: '',
          cli: '', session_id: '', t_start: undefined, t_end: undefined, closed: false,
        };
        byRun.set(key, run);
      }
      run.lines.push({ obj, serialized: line });
    }
  }
  const runs = [];
  for (const run of byRun.values()) {
    // Deterministic reduction: field values, never encounter order.
    run.lines.sort((a, b) => (a.serialized < b.serialized ? -1 : a.serialized > b.serialized ? 1 : 0));
    for (const { obj } of run.lines) {
      const ts = Date.parse(obj.t_start);
      if (Number.isFinite(ts) && (run.t_start === undefined || ts < run.t_start)) run.t_start = ts;
      const te = Date.parse(obj.t_end);
      if (Number.isFinite(te)) {
        run.closed = true;
        if (run.t_end === undefined || te < run.t_end) run.t_end = te;
      }
      for (const f of ['change_id', 'command', 'phase', 'agent_role', 'agent_label', 'cli', 'session_id']) {
        if (!run[f] && obj[f]) run[f] = String(obj[f]);
      }
    }
    // §2: the store's DIRECTORY KEY is the epic, so it is derived from the directory and never
    // reduced from a record's own `epic` field. Reducing it would let one stale or hand-edited
    // ledger line route a run's spans into a directory the ledger does not live in, and would let
    // an `_unattributed` run claim an epic it by definition does not have.
    run.epic = run.dirKey === '_unattributed' ? '' : run.dirKey;
    if (run.t_start === undefined) continue; // a run with no usable start has no window
    if (!run.closed || run.t_end === undefined) run.t_end = Number.POSITIVE_INFINITY; // open: extends to now
    runs.push(run);
  }
  runs.sort((a, b) => (a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0));
  return runs;
}

/* ------------------------------------------------------------------ attribution (§11.3) */

const ATTRIBUTION_FIELDS = ['epic', 'change_id', 'command', 'phase', 'agent_role', 'agent_label', 'cli', 'run_id'];

function groupKeyOf(rec, index) {
  return rec.trace_id ? 'T:' + rec.trace_id : 'S:' + index;
}

/* --- the Codex join (§22.4) ------------------------------------------------------------------- */

const originOf = (it) => (it.origin === undefined || it.origin === null ? '' : String(it.origin));
const corrOf = (it) => (it.correlation === undefined || it.correlation === null ? '' : String(it.correlation));
const windowBound = (t) => (Number.isFinite(t) ? nowIso(t) : 'open');

/**
 * Resolve one trace group that the record-level origin discriminator routed to the Codex join.
 * Returns `{ winner, notes }`; the caller performs the field assignment both joins share.
 *
 * Positive routing only. The negative predicate — "whatever matches no ledger run is Codex" — is
 * forbidden and is never reachable from here: a group arrives only because at least one member's
 * persisted `service_name` says `codex_exec`. Neither the configuration path nor the span-name
 * catalogue is consulted; neither is record-level origin evidence.
 */
function resolveCodexGroup(group, timed, runs) {
  const notes = [];
  let winner = null;

  const codexRuns = runs.filter((r) => r.cli === 'codex');
  const contains = (run, it) => {
    const t = Date.parse(it.record.start_ts);
    return t >= run.t_start && t <= run.t_end;
  };

  // 1. UNANIMITY on the discriminator, decided at group scope so a per-record decision cannot split
  //    a trace. Differing values, and partial presence (some members carrying it, some carrying
  //    none), both send the WHOLE group to `_unattributed/`. Routing on the positive members alone
  //    is the tempting shortcut and is wrong for the same reason the negative predicate is: a group
  //    holding one record that is not demonstrably Codex-originated is the unknown-origin case.
  //    An ABSENT `service_name` key on a raw line predating `0032_07_raw-record-service-name` is read
  //    as an EMPTY value here — `originOf` maps both to `''` — never as a malformed entry, and key
  //    presence is never the test.
  const observedOrigins = [...new Set(group.map(originOf))].sort();
  if (observedOrigins.length > 1) {
    notes.push('unattributed:mixed-origin');
    notes.push('origins=' + observedOrigins.map((o) => (o === '' ? '(none)' : o)).join('|'));
    notes.push('origin-missing=' + group.filter((it) => originOf(it) === '').length);
  } else {
    // 2. CORRELATION, normalized at group scope by the same rule: the group carries exactly one
    //    value, the one every member carrying one agrees on.
    const observedCorr = [...new Set(group.map(corrOf).filter((v) => v !== ''))].sort();
    const corrMissing = group.filter((it) => corrOf(it) === '').length;
    if (observedCorr.length === 0) {
      // Never matched by window instead: a Codex session ptp did not launch would then be adopted
      // by whichever ptp window happened to overlap it.
      notes.push('unattributed:no-correlation');
    } else if (observedCorr.length > 1 || corrMissing > 0) {
      notes.push('unattributed:conflicting-correlation');
      notes.push('correlations=' + observedCorr.join('|'));
      notes.push('correlation-missing=' + corrMissing);
    } else {
      const value = observedCorr[0];
      const run = codexRuns.find((r) => r.run_id === value) || null;
      if (!run) {
        // Recoverable by a later `export` exactly when the cause was an unreadable ledger — the
        // run's open line not yet visible, or a trailing line torn.
        notes.push('unattributed:no-such-codex-run');
        notes.push('correlation=' + value);
      } else if (!timed.every((it) => contains(run, it))) {
        // The window is a CONSISTENCY CHECK on the correlation, never a substitute for it. One of
        // the two is wrong and guessing which is exactly what this design forbids, so both are
        // recorded and the group goes unattributed.
        notes.push('unattributed:correlation-window-mismatch');
        notes.push('correlation=' + value);
        notes.push('window=' + windowBound(run.t_start) + '..' + windowBound(run.t_end));
      } else {
        winner = run;
        // Zero usable timestamps makes the containment check vacuous rather than failed: the group
        // is joined on an explicit correlation value, which is strictly stronger evidence than the
        // baseline's session-id term. The condition is recorded rather than hidden.
        if (timed.length === 0) notes.push('no-usable-timestamp');
      }
    }
  }

  if (!winner) {
    // §22.4's stated substitution for the baseline near-miss set, whose `session_id`-matching term
    // no Codex run can satisfy — so a literal reuse would always record an empty set and discard the
    // one debugging artifact a miss leaves behind. Emitted even when empty, as the baseline does, so
    // "no near-miss runs" is distinguishable from "the token is missing".
    notes.push('near-miss=' + codexRuns
      .filter((run) => timed.some((it) => contains(run, it)))
      .map((run) => run.run_id).sort().join('|'));
  }
  return { winner, notes };
}

/**
 * Resolve attribution for a set of records, per trace group, once. Mutates each record's
 * attribution columns and `notes`. Identical at ingest (scope = the batch) and in `export`
 * (scope = the whole store).
 */
function attributeRecords(items, runs) {
  const groups = new Map();
  items.forEach((item, i) => {
    const key = groupKeyOf(item.record, i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  for (const group of groups.values()) {
    const timed = group.filter((it) => it.record.start_ts && Number.isFinite(Date.parse(it.record.start_ts)));
    let notes = [];
    let winner = null;

    // ROUTING, decided at trace-group scope BEFORE either join, by the positive record-level origin
    // discriminator and by nothing else (§22.4). A group with at least one `codex_exec` member goes
    // to the Codex join, which then enforces unanimity; every other group takes the baseline join
    // below, textually unchanged.
    const isCodexGroup = group.some((it) => originOf(it) === CODEX_SERVICE_NAME);
    if (isCodexGroup) {
      const resolved = resolveCodexGroup(group, timed, runs);
      winner = resolved.winner;
      notes = resolved.notes;
    } else if (timed.length === 0) {
      notes.push('unattributed:no-usable-timestamp');
    } else {
      const sessions = new Set(timed.map((it) => it.record.session_id));
      const sameSession = (run) => sessions.size === 1 && run.session_id === timed[0].record.session_id;
      const contains = (run, it) => {
        const t = Date.parse(it.record.start_ts);
        return t >= run.t_start && t <= run.t_end;
      };
      const sessionRuns = runs.filter(sameSession);
      const candidates = sessionRuns.filter((run) => timed.every((it) => contains(run, it)));
      if (candidates.length === 0) {
        const nearMiss = sessionRuns
          .filter((run) => timed.some((it) => contains(run, it)))
          .map((run) => run.run_id)
          .sort();
        // §11's rule pairs the two tokens, so the `near-miss=` token is emitted even when the set
        // is empty: a reader must be able to tell "no near-miss runs" from "the token is missing".
        notes.push('unattributed:no-containing-window');
        notes.push('near-miss=' + nearMiss.join('|'));
      } else {
        candidates.sort((a, b) => (b.t_start - a.t_start) || (a.run_id < b.run_id ? -1 : a.run_id > b.run_id ? 1 : 0));
        winner = candidates[0];
        if (candidates.length > 1) {
          notes.push('ambiguous-window');
          notes.push('candidates=' + candidates.map((c) => c.run_id).sort().join('|'));
        }
      }
    }

    for (const item of group) {
      const rec = item.record;
      // §10.2 binds every field of the record, including the ones copied in from the ledger: a
      // ledger value may legally carry an escaped newline, which would become a real CR/LF in the
      // authoritative raw entry while `csvRow` quietly stripped it from the CSV — the two copies
      // would then disagree about a value neither of them mangled visibly.
      if (winner) for (const f of ATTRIBUTION_FIELDS) rec[f] = winner[f] ? stripLineBreaks(String(winner[f])) : '';
      else for (const f of ATTRIBUTION_FIELDS) rec[f] = '';
      if (isCodexGroup) {
        // §22.4's one behavior change to the baseline attribution pass: a Codex-origin record's
        // `run_id` is the value transported in resource `env`, ALWAYS — the join only confirms it,
        // and never overwrites or blanks it. Two things depend on this and nothing else does:
        //   (a) the value survives an unattributed outcome, so it is still there to debug with; and
        //   (b) a later `export` re-derives the correlation from the persisted raw record by the
        //       same extraction the receiver used, rather than reading back a `run_id` some earlier
        //       export projected — which for a Codex record it never is, by this very rule.
        // When a winner exists the two are equal by construction (unanimity plus the exact-match
        // lookup), so this is not a second source of truth.
        rec.run_id = corrOf(item);
      }
      const all = (item.notes || []).concat(notes);
      rec.notes = stripLineBreaks(all.join(';'));
      item.dirKey = winner && winner.epic ? winner.epic : '_unattributed';
      item.attributed = Boolean(winner);
    }
  }
}

/* ------------------------------------------------------------------ lockfile + identity */

function readLockfile(lockPath) {
  const obj = readJsonFile(lockPath);
  if (!obj || typeof obj !== 'object' || !obj.pid) return null;
  return obj;
}

function writeLockfileAtomic(lockPath, data) {
  const dir = path.dirname(lockPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + LOCKFILE_NAME + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, lockPath); // replace-if-exists
  } catch (err) {
    // §9.3's managed line is the EXACT name `.ptp-otel-sink.pid`, which does not match
    // `.ptp-otel-sink.pid.<pid>.<hex>.tmp` — so a temp left behind by a failed write or rename is an
    // unignored, committable file in a consumer repository carrying this receiver's launch token and
    // its absolute repo and store paths. §14.1's "whoever creates the file protects it" is what the
    // pre-write reconciliation exists for, and it does not cover a name no rule matches. Rethrown
    // unchanged, so `healOwnLockfile` still swallows and the startup path still refuses to run
    // unmanageable.
    try { fs.unlinkSync(tmp); } catch (_) { /* never created, or already gone */ }
    throw err;
  }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err && err.code === 'EPERM'; }
}

/** Best-effort OS-reported process start time; undefined when it cannot be obtained. */
function osProcessStartTime(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){$p.StartTime.ToUniversalTime().ToString('o')}`],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return out || undefined;
    }
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || undefined;
  } catch (_) { return undefined; }
}

function selfProcessStartTime() {
  return new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString();
}

/**
 * The lockfile's `process_start_time` must be a value an OUTSIDE validator can reproduce for the
 * recorded pid, or the pid-reuse guard of §14.1 / §15.5 is illusory: an in-process estimate
 * (`selfProcessStartTime`) is not comparable with what any other process can observe. So the
 * OS-reported value is authoritative and the estimate is only the last resort when the OS cannot be
 * asked. Resolved ONCE at launch, before the socket is bound, so it never blocks a served request.
 */
function launchProcessStartTime() {
  return osProcessStartTime(process.pid) || selfProcessStartTime();
}

/**
 * True when the lockfile's recorded pid is live AND — as far as the OS can be asked — is the very
 * process the lockfile describes. Liveness alone is not enough: pids are reused, and a reused pid
 * would make a stale lockfile look live forever, permanently blocking §14.4's self-heal.
 */
function lockfileProcessStillLive(lock) {
  const pid = Number(lock && lock.pid);
  if (!Number.isFinite(pid) || pid <= 0 || !pidAlive(pid)) return false;
  const recorded = lock.process_start_time;
  const observed = osProcessStartTime(pid);
  if (!recorded || !observed) return true; // unobtainable on either side: fall back to liveness
  return String(recorded).trim() === String(observed).trim();
}

function httpGetJson(port, urlPath, timeoutMs) {
  return new Promise((resolve) => {
    // An invalid port never reaches `http.request`. Node throws `ERR_SOCKET_BAD_PORT` SYNCHRONOUSLY
    // for an out-of-range number and silently substitutes its DEFAULT port for a `NaN` one — so a
    // lockfile recording `"port": 99999` would escape from this promise as an unhandled rejection and
    // surface as a stack trace and a non-zero exit out of the §15 preamble, which runs on every funnel
    // command and may never alter a terminal state (§15.3); and one recording `"port": "bogus"` would
    // probe 127.0.0.1:80 and read whatever answers there as a listener on the recorded port. §14.5
    // tells the user they may remove the lockfile by hand, so a nonsense value in it is a state these
    // probes must survive rather than assume away.
    if (!isValidPort(port)) { resolve({ ok: false, error: 'bad-port' }); return; }
    let settled = false;
    // Node's `timeout` option is an INACTIVITY timeout: a listener that trickles bytes without
    // ending the response resets it forever. The probe budgets of §15.4 are wall-clock bounds, and
    // the preamble runs on every funnel command, so a hard deadline is what actually keeps a
    // half-broken listener on the port from stalling a ptp command.
    let deadline = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      resolve(value);
    };
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        // The identity response is a fixed-shape object of a few hundred bytes (§9.2), so an answer
        // beyond this cap is by definition not one. The cap is what actually keeps §15.4's per-probe
        // budget: the hard deadline below bounds how long bytes may ARRIVE, but a listener that sends
        // a very large body and then ends within the deadline is answered on the `end` path, whose
        // `Buffer.concat` + `JSON.parse` run to completion BEFORE `finish` is reached — spending
        // seconds and hundreds of megabytes on a probe the preamble runs on every funnel command, and
        // which may never delay the command beyond that budget (§15.3).
        if (size > IDENTITY_RESPONSE_MAX_BYTES) return;
        size += c.length;
        if (size > IDENTITY_RESPONSE_MAX_BYTES) {
          chunks.length = 0;
          req.destroy();
          finish({ ok: false, error: 'response-too-large' });
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        try { finish({ ok: true, status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (_) { finish({ ok: true, status: res.statusCode, body: null }); }
      });
      res.on('error', () => finish({ ok: false, error: 'response-error' }));
    });
    deadline = setTimeout(() => { req.destroy(); finish({ ok: false, error: 'timeout' }); }, timeoutMs);
    if (deadline.unref) deadline.unref();
    req.on('timeout', () => { req.destroy(); finish({ ok: false, error: 'timeout' }); });
    req.on('error', (err) => finish({ ok: false, error: (err && err.code) || String(err) }));
    req.end();
  });
}

/**
 * One pre-launch probe: single attempt, 250 ms timeout, no retries.
 * Returns { served, identity|null, reason }.
 */
async function probeIdentity(port, timeoutMs) {
  const res = await httpGetJson(port, IDENTITY_PATH, timeoutMs || PROBE_TIMEOUT_MS);
  if (!res.ok) {
    if (res.error === 'ECONNREFUSED') return { served: false, identity: null, reason: 'not-served' };
    // A port that is not a port cannot be serving anything, so it is `served: false` rather than the
    // "something is there but did not identify itself" verdict every other error maps to. Reporting it
    // as served would turn a hand-corrupted lockfile into a permanent conflict that blocks `start` and
    // the preamble forever, when the recorded receiver may be long gone.
    if (res.error === 'bad-port') return { served: false, identity: null, reason: 'bad-port' };
    return { served: true, identity: null, reason: res.error };
  }
  const body = res.body;
  if (body && body.ptp_sink === true) return { served: true, identity: body, reason: 'ptp-sink' };
  return { served: true, identity: null, reason: 'foreign-listener' };
}

/**
 * Path identity for the two roots the lifecycle compares. Resolved first, then compared
 * case-insensitively on Windows — whose filesystem is case-insensitive, and where `path.resolve`
 * normalizes separators and NOTHING else, so `E:\repo` and `e:\repo` survive as different strings
 * while naming one store. A case-sensitive comparison there makes a live receiver look foreign in all
 * three directions at once: `start` reports a conflict for "a different store" that is this one, the
 * §15 preamble advises that another store holds the port and collects nothing, and — the costly one —
 * `export` stops recognizing the live receiver it must refuse over (§12.5) and replaces every
 * `spans.csv` while that receiver is appending.
 */
function samePath(a, b) {
  const norm = (p) => {
    const r = path.resolve(p === undefined || p === null ? '' : String(p));
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  const la = norm(a);
  const lb = norm(b);
  if (la === lb) return true;
  // Two lexically different paths can still be ONE directory — a symlink or a Windows junction, which
  // `path.resolve` does not follow. The store is identified by where the bytes land, so a receiver
  // reporting the link and an invocation resolving the target are the same store, and treating them
  // as different lets `export` replace every `spans.csv` in the very directory that receiver is
  // appending to. Canonicalization runs ONLY after the lexical comparison already failed, so the
  // matching path pays nothing and this can only ever widen the match — a resolution failure on
  // either side (an absent path, a permission error) falls back to "not the same", exactly the
  // answer the lexical comparison just gave.
  const real = (p) => {
    try {
      const r = (fs.realpathSync.native || fs.realpathSync)(p);
      return process.platform === 'win32' ? r.toLowerCase() : r;
    } catch (_) { return null; }
  };
  const ra = real(la);
  return ra !== null && ra === real(lb);
}

function identityMatchesStore(identity, paths) {
  return Boolean(identity) && samePath(identity.telemetry_root, paths.telemetryRoot);
}
function identityMatchesFull(identity, paths, lock) {
  return identityMatchesStore(identity, paths)
    && samePath(identity.repo_root, paths.repoRoot)
    && Boolean(lock) && identity.launch_token === lock.launch_token;
}

/* ------------------------------------------------------------------ credential */

function readCredential(paths) {
  try {
    const v = fs.readFileSync(paths.credentialFile, 'utf8').trim();
    return v.length > 0 ? v : null;
  } catch (_) { return null; }
}

function parseHeadersEnv(raw) {
  const map = {};
  for (const part of String(raw || '').split(',')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    map[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim();
  }
  return map;
}

/* ------------------------------------------------------------------ serve */

function makeSinkState(opts) {
  const repoRoot = opts.repoRoot;
  const paths = storePaths(repoRoot);
  const launchPort = opts.port || paths.cfg.port;
  return {
    repoRoot,
    paths,
    launchPort,
    launchToken: opts.launchToken || crypto.randomBytes(24).toString('hex'),
    startedBy: opts.startedBy === 'auto' ? 'auto' : 'manual',
    startedAt: nowIso(),
    processStartTime: launchProcessStartTime(),
    ledgerCache: { signature: null, runs: [] },
  };
}

function sinkLockfileData(state) {
  return {
    schema: 1,
    pid: process.pid,
    port: state.launchPort,
    started_at: state.startedAt,
    started_by: state.startedBy,
    launch_token: state.launchToken,
    repo_root: path.resolve(state.repoRoot),
    telemetry_root: path.resolve(state.paths.telemetryRoot),
    process_start_time: state.processStartTime,
    executable_path: process.execPath,
  };
}

/** Self-heal (§14.4): rewrite the lockfile when it is absent or no longer describes us. */
function healOwnLockfile(state) {
  try {
    const want = sinkLockfileData(state);
    const have = readLockfile(state.paths.lockfile);
    if (have
      && have.pid === want.pid
      && have.port === want.port
      && have.launch_token === want.launch_token
      && have.repo_root === want.repo_root
      && have.telemetry_root === want.telemetry_root
      && have.process_start_time === want.process_start_time
      && have.executable_path === want.executable_path) return;
    if (have && have.launch_token !== want.launch_token && Number(have.port) !== Number(want.port)) {
      // A lockfile naming another receiver on another port: leave it intact when that receiver is
      // live and identity-matching (§14.4). We cannot issue an HTTP probe synchronously here, so
      // the stand-in is the OS-level process identity the lockfile itself records — pid live AND
      // the same process start time. A bare pid check would preserve the lockfile forever once an
      // unrelated process inherited the recorded pid, permanently disabling this self-heal.
      if (lockfileProcessStillLive(have)) return;
    }
    writeLockfileAtomic(state.paths.lockfile, want);
  } catch (_) { /* swallowed */ }
}

function refreshLedger(state) {
  const sig = ledgerSignature(state.paths.telemetryRoot);
  if (sig !== state.ledgerCache.signature) {
    state.ledgerCache = { signature: sig, runs: buildLedgerIndex(state.paths.telemetryRoot) };
  }
  return state.ledgerCache.runs;
}

function logLine(state, msg) {
  try {
    fs.appendFileSync(logFileFor(state.paths.telemetryRoot), nowIso() + ' ' + stripLineBreaks(msg) + '\n');
  } catch (_) { /* swallowed */ }
}

function writeBatch(state, items, ingestMs) {
  const root = state.paths.telemetryRoot;
  storePolicyWrite(root);
  for (const item of items) {
    const rec = item.record;
    // Raw first, CSV second: a raw-only record is self-healing, a CSV-only record must never arise.
    appendRawEntry(rawFilePath(root, item.dirKey, ingestMs), rec, item.extras);
    appendCsvRow(path.join(root, item.dirKey, 'spans.csv'), rec);
  }
}

/**
 * The three gates of §9.3 that are decided **before the body is looked at at all**: mode -> port
 * drift -> credential. Returning a verdict here means the body is never buffered, let alone parsed
 * — which is what makes "accepted and discarded whatever its body contains" literally true, and
 * keeps a gated-off batch from being answered by the body-size or malformed-body rules instead of
 * by its own gate.
 */
function preBodyGate(state, headers) {
  const cfg = resolveConfig(state.repoRoot);
  if (cfg.mode !== 'on') return { status: 200, body: { partialSuccess: {} }, note: 'discarded:mode-off' };
  if (cfg.port !== state.launchPort) return { status: 200, body: { partialSuccess: {} }, note: 'discarded:port-drift' };

  const credential = readCredential(state.paths);
  const presented = headers[CREDENTIAL_HEADER];
  if (!credential || !presented || String(presented).trim() !== credential) {
    logLine(state, 'rejected batch: ingestion credential absent or mismatched');
    return { status: 401, body: { error: 'ptp: ingestion credential absent or mismatched' }, note: 'rejected:credential' };
  }
  return null;
}

/** Everything after the §9.3 gates: parse -> lockfile heal -> flatten -> attribute -> appends. */
function handleBatch(state, urlPath, rawBody) {
  let body;
  try { body = JSON.parse(rawBody.toString('utf8')); } catch (err) {
    logLine(state, 'rejected batch: malformed body (' + (err && err.message) + ')');
    return { status: 400, body: { error: 'ptp: malformed OTLP body' }, note: 'rejected:malformed' };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    // `typeof [] === 'object'`, so an array would otherwise slip through and flatten to zero
    // records — answered `200` as an empty batch instead of rejected as the malformed body it is.
    logLine(state, 'rejected batch: body is not an OTLP JSON object');
    return { status: 400, body: { error: 'ptp: malformed OTLP body' }, note: 'rejected:malformed' };
  }

  healOwnLockfile(state); // §14.4: on every gated batch write, not only on a probe

  let items;
  try {
    items = urlPath === '/v1/traces' ? flattenTraces(body) : flattenLogs(body);
  } catch (err) {
    logLine(state, 'rejected batch: flatten failed (' + (err && err.message) + ')');
    return { status: 400, body: { error: 'ptp: malformed OTLP body' }, note: 'rejected:malformed' };
  }
  if (items.length === 0) {
    // §9.3: the store-policy write runs before EVERY gated batch, not only before one that happens to
    // carry records. Returning ahead of it means a managed line deleted from
    // `<telemetry.root>/.gitignore` mid-session — `.ptp-telemetry-credential`'s rule among them — is
    // restored only once some batch happens to flatten to at least one record, leaving an existing
    // credential file committable for however long the exporter sends empty batches.
    storePolicyWrite(state.paths.telemetryRoot); // swallows its own errors, as §9.3 requires
    return { status: 200, body: { partialSuccess: {} }, note: 'empty' };
  }

  let runs = refreshLedger(state);
  attributeRecords(items, runs);
  if (items.some((it) => !it.attributed)) {
    // An attribution miss is the cheapest possible signal that the ledger set may be stale (§11.1).
    state.ledgerCache.signature = null;
    runs = refreshLedger(state);
    attributeRecords(items, runs);
  }

  try {
    writeBatch(state, items, Date.now());
  } catch (err) {
    // A store write that failed must NOT be answered with a success: the exporter would drop the
    // batch and those spans would be gone, against "never drop a span". A non-success lets it
    // retry, and a retry that re-delivers already-appended records is the at-least-once
    // duplication §12.4 explicitly accepts — strictly better than silent loss.
    logLine(state, 'write failed: ' + (err && err.message));
    return { status: 500, body: { error: 'ptp: telemetry store write failed' }, note: 'write-failed' };
  }
  return { status: 200, body: { partialSuccess: {} }, note: 'written:' + items.length };
}

function serve(argv) {
  const repoRoot = argv.repo ? path.resolve(argv.repo) : findRepoRoot(process.cwd());
  // The same `telemetry.mode` gate `start` applies (§14.2), re-checked here because this process
  // is what actually touches the filesystem: without it a direct `serve`, or a mode flipped to
  // `off` between `start`'s check and this child's startup, would create the store's `.gitignore`
  // and a lockfile while telemetry is off — breaking "with the mode off, no directory and no file
  // is created". An ALREADY-listening receiver is unaffected: nothing stops it automatically, and
  // it keeps accepting and discarding per §9.3.
  if (resolveConfig(repoRoot).mode !== 'on') {
    process.stderr.write('ptp: telemetry.mode is not "on" — the receiver was not started and nothing was written.\n');
    process.exitCode = 1;
    return;
  }
  const state = makeSinkState({
    repoRoot,
    port: argv.port ? Number(argv.port) : undefined,
    startedBy: argv['started-by'],
    launchToken: argv.token,
  });

  reconcileGitignore(state.paths.telemetryRoot); // §14.1: protect the lockfile before writing it
  if (!gitignoreCovers(path.join(state.paths.telemetryRoot, '.gitignore'), [LOCKFILE_NAME])) {
    // The backstop for the same check `start` makes: never bind, and never write a lockfile, into a
    // store that cannot ignore it (§14.1).
    process.stderr.write('ptp: ' + path.join(state.paths.telemetryRoot, '.gitignore') + ' does not ignore '
      + LOCKFILE_NAME + ' and could not be updated — the receiver was not started and nothing was written.\n');
    process.exitCode = 1;
    return;
  }

  const server = http.createServer((req, res) => {
    const send = (status, obj) => {
      const payload = Buffer.from(JSON.stringify(obj));
      res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': payload.length });
      res.end(payload);
    };
    try {
      const urlPath = (req.url || '').split('?')[0];
      if (req.method === 'GET' && urlPath === IDENTITY_PATH) {
        healOwnLockfile(state); // §14.4: repair before answering any probe
        send(200, {
          ptp_sink: true,
          protocol_version: 1,
          launch_token: state.launchToken,
          repo_root: path.resolve(state.repoRoot),
          telemetry_root: path.resolve(state.paths.telemetryRoot),
          port: state.launchPort,
          pid: process.pid,
          started_by: state.startedBy,
          started_at: state.startedAt,
          healthy: true,
        });
        return;
      }
      if (req.method !== 'POST' || (urlPath !== '/v1/traces' && urlPath !== '/v1/logs')) {
        send(404, { error: 'ptp: not found' });
        return;
      }
      // §9.3: the mode, port-drift, and credential gates are decided BEFORE the body is read, so a
      // gated batch is accepted (or credential-rejected) whatever it carries and nothing is
      // buffered for it — never answered instead by the size or malformed-body rules below.
      const gated = preBodyGate(state, req.headers);
      if (gated) {
        req.resume(); // discard the body rather than parse it
        send(gated.status, gated.body);
        return;
      }

      const chunks = [];
      let size = 0;
      let aborted = false;
      req.on('data', (c) => {
        // Already answered: keep draining, retain NOTHING. The remaining body is read and dropped
        // rather than the socket being destroyed, because destroying it is what would defeat the
        // answer this branch exists to deliver — closing a socket that still has unread received data
        // makes TCP send an RST, and the exporter then sees a connection reset instead of the 413,
        // which is exactly the "indistinguishable from a crashed receiver, so it retries the same
        // oversized batch forever" outcome below. Memory stays bounded because nothing is buffered
        // past the cap, and the drain is bounded by the client's own body plus the server's
        // request timeout.
        if (aborted) return;
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          // Answer, never just drop the connection: a destroyed request with no response is
          // indistinguishable from a crashed receiver, so the exporter retries the same oversized
          // batch forever. One logged non-success reply and the listener keeps serving (§9.5).
          aborted = true;
          chunks.length = 0; // release everything buffered so far
          logLine(state, 'rejected batch: body exceeds ' + MAX_BODY_BYTES + ' bytes');
          try { send(413, { error: 'ptp: OTLP body too large' }); } catch (_) { /* ignore */ }
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (aborted) return;
        let result;
        try {
          result = handleBatch(state, urlPath, Buffer.concat(chunks));
        } catch (err) {
          logLine(state, 'batch handler error: ' + (err && err.stack));
          result = { status: 500, body: { error: 'ptp: internal error' } };
        }
        send(result.status, result.body);
      });
      req.on('error', () => { /* a dropped connection never kills the listener */ });
    } catch (err) {
      logLine(state, 'request handler error: ' + (err && err.stack));
      try { send(500, { error: 'ptp: internal error' }); } catch (_) { /* ignore */ }
    }
  });

  server.on('error', (err) => {
    logLine(state, 'listen failed on 127.0.0.1:' + state.launchPort + ' — ' + (err && err.code));
    process.stderr.write('ptp: cannot bind 127.0.0.1:' + state.launchPort + ' (' + (err && err.code)
      + '). Change telemetry.port and retry.\n');
    process.exit(1);
  });

  server.listen(state.launchPort, '127.0.0.1', () => {
    try {
      writeLockfileAtomic(state.paths.lockfile, sinkLockfileData(state));
    } catch (err) {
      // A listener with no lockfile is unmanageable: `stop` has nothing to verify against and the
      // §14.4 self-heal cannot write one either, so the process would outlive every ptp way of
      // taking it down. Refuse to exist in that state rather than report a successful start.
      logLine(state, 'lockfile write failed at startup: ' + (err && err.message));
      process.stderr.write('ptp: could not write ' + state.paths.lockfile + ' (' + (err && err.code)
        + ') — the receiver was stopped rather than left unmanageable.\n');
      try { server.close(); } catch (_) { /* ignore */ }
      process.exit(1);
    }
    logLine(state, 'listening on 127.0.0.1:' + state.launchPort + ' pid=' + process.pid
      + ' started_by=' + state.startedBy);
  });

  const shutdown = () => {
    try { server.close(); } catch (_) { /* ignore */ }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', (err) => { logLine(state, 'uncaught: ' + (err && err.stack)); });
}

/* ------------------------------------------------------------------ lifecycle */

function pluginScriptPath() { return path.resolve(__filename); }

async function lifecycleContext(argv) {
  const repoRoot = argv.repo ? path.resolve(argv.repo) : findRepoRoot(process.cwd());
  const paths = storePaths(repoRoot);
  return { repoRoot, paths, lock: readLockfile(paths.lockfile) };
}

/** The port-migration check shared by `start` and the auto-start preamble (§14.3 / §15.1 step 2). */
async function portMigrationConflict(ctx) {
  const lock = ctx.lock;
  if (!lock || Number(lock.port) === Number(ctx.paths.cfg.port)) return null;
  const probe = await probeIdentity(Number(lock.port));
  // §14.4a: the probe itself may have made the receiver repair a mismatched lockfile, so compare
  // against the RELOADED contents, never against what was read before probing. Comparing to the
  // stale token here would declare a live receiver foreign and let `start` bring up a second one on
  // the new port, destroying the only record of the first.
  const reloaded = readLockfile(ctx.paths.lockfile) || lock;
  ctx.lock = reloaded;
  if (probe.identity && identityMatchesFull(probe.identity, ctx.paths, reloaded)) {
    return {
      port: Number(reloaded.port),
      pid: probe.identity.pid,
      message: 'ptp telemetry: a receiver for this store is still running on port ' + reloaded.port
        + ' while telemetry.port is now ' + ctx.paths.cfg.port
        + ' — run /ptp:telemetry stop before the port change takes effect.',
    };
  }
  // §14.3's two lockfile states. **Stale** — recorded process not live AND recorded port unserved —
  // is the ONLY state treated as absent, because only then does starting on the new port discard
  // nothing. Anything else (the old port still served by a non-matching listener, or the recorded
  // process still live) is a conflict: launching would overwrite the only record of what is running
  // while that listener still holds the port.
  if (!probe.served && !lockfileProcessStillLive(reloaded)) return null;
  return {
    port: Number(reloaded.port),
    pid: reloaded.pid,
    message: 'ptp telemetry: the store lockfile records a receiver on port ' + reloaded.port
      + ' that is neither verifiably this store\'s nor verifiably gone, while telemetry.port is now '
      + ctx.paths.cfg.port + ' — nothing was started and the lockfile was left intact. Resolve it '
      + 'explicitly: `/ptp:telemetry stop`, or remove ' + ctx.paths.lockfile + ' once you have '
      + 'confirmed nothing is running on port ' + reloaded.port + '.',
  };
}

/**
 * The launch half of `start`: everything after the mode gate, the port-migration check, and the
 * pre-launch port probe have already been performed. Split out so a caller that has ALREADY spent
 * those probes — the §15 preamble, whose steps 2 and 4 are exactly them — does not spend them a
 * second time. Re-running them here would put the preamble at up to four pre-launch probes against
 * the "at most two" budget of §15.4, adding up to 500 ms to every funnel command that launches a
 * receiver while a different-port lockfile exists.
 */
async function launchReceiver(ctx, startedBy) {
  const cfg = ctx.paths.cfg;
  const script = pluginScriptPath();
  if (!fs.existsSync(script)) {
    return { action: 'refused', reason: 'script-missing', message: 'ptp telemetry: receiver script not found at ' + script + '.' };
  }

  reconcileGitignore(ctx.paths.telemetryRoot); // §14.1: before any lockfile exists
  // ...and confirm it took. §14.1 is "whoever creates the file protects it": the lockfile carries a
  // pid, a launch token, and absolute paths, so bringing a receiver up that would drop an unignored
  // one into a consumer repo is worse than not starting. The reconciliation swallows its own
  // errors, so the read-back is the only way to know.
  if (!gitignoreCovers(path.join(ctx.paths.telemetryRoot, '.gitignore'), [LOCKFILE_NAME])) {
    return {
      action: 'refused', reason: 'store-unprotected',
      message: 'ptp telemetry: ' + path.join(ctx.paths.telemetryRoot, '.gitignore')
        + ' could not be given its `' + LOCKFILE_NAME + '` rule, so starting the receiver would leave an'
        + ' untracked-but-committable lockfile in this repository — nothing was started. Fix that file, then retry.',
    };
  }

  const logPath = logFileFor(ctx.paths.telemetryRoot);
  let out;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    out = fs.openSync(logPath, 'a');
  } catch (_) { out = 'ignore'; }
  let spawnError = null;
  const child = spawn(process.execPath, [script, 'serve', '--repo', ctx.repoRoot, '--port', String(cfg.port), '--started-by', startedBy], {
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  // A spawn failure (EAGAIN, ENOMEM, a missing interpreter) is emitted asynchronously, and an
  // 'error' event with NO listener is thrown — which would kill the lifecycle command itself
  // instead of degrading to the single `start-failed` advisory the contract allows.
  child.on('error', (err) => { spawnError = err; });
  child.unref();

  // §15.4: at most 8 attempts on a 250 ms start-to-start cadence, under a HARD 2 s deadline,
  // whichever comes first. Each probe's own timeout and each cadence sleep are clamped to the
  // deadline's remainder, so a poll begun just before it cannot overrun it.
  const deadline = Date.now() + READINESS_DEADLINE_MS;
  for (let i = 0; i < READINESS_ATTEMPTS; i++) {
    if (spawnError) {
      return {
        action: 'start-failed', port: cfg.port, log: logPath,
        message: 'ptp telemetry: the receiver process could not be launched (' + (spawnError.code || spawnError.message)
          + '). Continuing without telemetry.',
      };
    }
    const cycleStart = Date.now();
    const budget = deadline - cycleStart;
    if (budget <= 0) break;
    const p = await probeIdentity(cfg.port, Math.min(PROBE_TIMEOUT_MS, budget));
    if (p.identity && identityMatchesStore(p.identity, ctx.paths)) {
      ctx.lock = readLockfile(ctx.paths.lockfile);
      return { action: 'started', pid: p.identity.pid, port: cfg.port, started_by: startedBy, log: logPath };
    }
    const remaining = Math.min(READINESS_CADENCE_MS - (Date.now() - cycleStart), deadline - Date.now());
    if (remaining > 0) await sleep(remaining);
  }
  return {
    action: 'start-failed', port: cfg.port, log: logPath,
    message: 'ptp telemetry: the receiver did not become ready on 127.0.0.1:' + cfg.port
      + ' — see ' + logPath + '. Continuing without telemetry.',
  };
}

/** The full `start`: the pre-launch gates and probes, then `launchReceiver`. */
async function startReceiver(ctx, startedBy) {
  const cfg = ctx.paths.cfg;
  if (cfg.mode !== 'on') {
    return { action: 'refused', reason: 'mode-off', message: 'ptp telemetry: telemetry.mode is not "on" — nothing started.' };
  }

  const migration = await portMigrationConflict(ctx); // pre-launch probe 1 (conditional)
  if (migration) return { action: 'refused', reason: 'port-migration', message: migration.message };

  const probe = await probeIdentity(cfg.port); // pre-launch probe 2
  if (probe.identity) {
    const lock = readLockfile(ctx.paths.lockfile); // reload: the probe may have healed it (§14.4)
    ctx.lock = lock;
    if (identityMatchesFull(probe.identity, ctx.paths, lock)) {
      return { action: 'already-listening', pid: probe.identity.pid, port: cfg.port, started_by: probe.identity.started_by };
    }
    return {
      action: 'refused', reason: 'conflict',
      message: 'ptp telemetry: port ' + cfg.port + ' is served by a ptp receiver for a different store ('
        + (probe.identity.telemetry_root || 'unknown') + ') — change telemetry.port or stop it.',
    };
  }
  if (probe.served) {
    return {
      action: 'refused', reason: 'conflict',
      message: 'ptp telemetry: port ' + cfg.port + ' is held by an unrelated process — change telemetry.port.',
    };
  }

  return launchReceiver(ctx, startedBy);
}

async function stopReceiver(ctx) {
  const cfg = ctx.paths.cfg;
  let lock = ctx.lock;

  if (!lock) {
    // An absent lockfile is "unknown", never "stopped" (§14.5): probing lets the receiver heal it.
    const probe = await probeIdentity(cfg.port, 1000);
    if (!probe.identity || !identityMatchesStore(probe.identity, ctx.paths)) {
      return { action: 'already-stopped', message: 'ptp telemetry: no receiver is running for this store.' };
    }
    lock = readLockfile(ctx.paths.lockfile);
    if (!lock) {
      return { action: 'refused', reason: 'no-lockfile', message: 'ptp telemetry: a receiver answered on port ' + cfg.port + ' but no lockfile could be read — nothing terminated.' };
    }
    ctx.lock = lock;
  }

  const probe = await probeIdentity(Number(lock.port), 1000);
  const reloaded = readLockfile(ctx.paths.lockfile) || lock; // reload after the probe (§14.4)
  ctx.lock = reloaded;
  // §14.4a: pid and liveness come from the RELOADED lockfile. Reading them before the probe would
  // pair the OLD pid's liveness with the healed file's token, so a receiver whose lockfile this
  // very probe just repaired would be rejected as mismatched — defeating the heal when it works.
  const pid = Number(reloaded.pid);
  const alive = pidAlive(pid);
  const verified = alive
    && probe.identity
    && probe.identity.launch_token === reloaded.launch_token
    && Number(probe.identity.pid) === Number(reloaded.pid)
    && identityMatchesStore(probe.identity, ctx.paths);

  if (!verified) {
    // §14.3 defines **stale** as "the recorded PROCESS is not live and the recorded port is
    // unserved", and process identity is not bare pid liveness: once an unrelated process inherits
    // the recorded pid, `pidAlive` is true forever and `stop` would report `mismatched-lockfile` — "
    // nothing terminated, nothing removed" — for a lockfile `status` already reports as `stale: true`
    // and which `start` will in fact replace. Two commands describing one state differently, and the
    // one the user acts on giving the less useful answer. `pidAlive` stays the input to `verified`
    // above, where the probe's launch-token and pid match is the real verification and the recorded
    // start time is not needed to make it stronger.
    if (!lockfileProcessStillLive(reloaded) && !probe.served) {
      return { action: 'stale-lockfile', message: 'ptp telemetry: the lockfile is stale (pid ' + pid + ' is not running and nothing answers on port ' + lock.port + ') — nothing terminated, nothing removed. `/ptp:telemetry start` will replace it.' };
    }
    return { action: 'mismatched-lockfile', message: 'ptp telemetry: the lockfile does not verify against the process on port ' + lock.port + ' — nothing terminated, nothing removed.' };
  }

  try { process.kill(Number(reloaded.pid), 'SIGTERM'); } catch (_) { /* raced */ }
  let down = false;
  for (let i = 0; i < 20; i++) {
    const p = await probeIdentity(Number(reloaded.port), 200);
    if (!p.served) { down = true; break; }
    await sleep(100);
  }
  // §14.5: removing the lockfile is predicated on the termination having happened. Removing it
  // anyway would leave a KNOWINGLY live receiver with no record — and report success for it.
  if (!down) {
    return {
      action: 'not-stopped', pid: Number(reloaded.pid), port: Number(reloaded.port),
      message: 'ptp telemetry: the receiver on port ' + reloaded.port + ' (pid ' + reloaded.pid
        + ') was signalled but is still answering — the lockfile was left intact and nothing was removed. Re-run `/ptp:telemetry stop`, or end pid ' + reloaded.pid + ' by hand.',
    };
  }
  let removed = true;
  try { fs.unlinkSync(ctx.paths.lockfile); } catch (err) {
    // ENOENT is the intended end state reached by someone else. Anything else means the receiver is
    // down but its record is still there, and §14.5 pairs terminating WITH removing — so reporting
    // plain success would state that both halves happened when only one did. The `action` stays
    // `stopped` because it is true and §14.8 enumerates no other outcome for a receiver that really
    // did stop; what changes is that the outcome is no longer silent (§14.8: anything other than
    // plain success carries a `message` to relay).
    if (err && err.code !== 'ENOENT') removed = false;
  }
  if (!removed) {
    return {
      action: 'stopped', pid: Number(reloaded.pid), port: Number(reloaded.port),
      lockfile_removed: false, lockfile: ctx.paths.lockfile,
      message: 'ptp telemetry: the receiver on port ' + reloaded.port + ' (pid ' + reloaded.pid
        + ') was terminated, but ' + ctx.paths.lockfile + ' could not be removed. `/ptp:telemetry '
        + 'status` will report that lockfile as stale and the next `/ptp:telemetry start` replaces it, '
        + 'so nothing is blocked — delete it by hand if you would rather it were gone now.',
    };
  }
  return { action: 'stopped', pid: Number(reloaded.pid), port: Number(reloaded.port) };
}

function envVerdict(ctx) {
  const cfg = ctx.paths.cfg;
  const credential = readCredential(ctx.paths);
  const env = process.env;
  const headers = parseHeadersEnv(env.OTEL_EXPORTER_OTLP_HEADERS);
  const expectedEndpoint = 'http://127.0.0.1:' + cfg.port;
  const settingsFile = path.join(ctx.repoRoot, '.claude', 'settings.local.json');
  const settings = readJsonFile(settingsFile);
  const settingsEnv = settings && typeof settings === 'object' && settings.env && typeof settings.env === 'object' ? settings.env : {};
  // Two distinct on-disk verdicts, because they route to two different repairs (§15.2): a block
  // that is merely *present* but stale cannot be fixed by a restart — restarting would just load
  // the stale values — so only a block that is present AND current earns the restart advisory.
  const blockOnDisk = settingsEnv.CLAUDE_CODE_ENABLE_TELEMETRY === '1' && Boolean(settingsEnv.OTEL_EXPORTER_OTLP_ENDPOINT);
  const blockCurrentOnDisk = blockOnDisk
    && settingsEnv.OTEL_EXPORTER_OTLP_ENDPOINT === expectedEndpoint
    && settingsEnv.OTEL_EXPORTER_OTLP_PROTOCOL === SHIPPED_PROTOCOL
    && Boolean(credential)
    && parseHeadersEnv(settingsEnv.OTEL_EXPORTER_OTLP_HEADERS)[CREDENTIAL_HEADER] === credential;
  return {
    enable_flag: { ok: env.CLAUDE_CODE_ENABLE_TELEMETRY === '1', live: env.CLAUDE_CODE_ENABLE_TELEMETRY || '' },
    endpoint: { ok: env.OTEL_EXPORTER_OTLP_ENDPOINT === expectedEndpoint, live: env.OTEL_EXPORTER_OTLP_ENDPOINT || '', expected: expectedEndpoint },
    protocol: { ok: env.OTEL_EXPORTER_OTLP_PROTOCOL === SHIPPED_PROTOCOL, live: env.OTEL_EXPORTER_OTLP_PROTOCOL || '', expected: SHIPPED_PROTOCOL },
    credential: {
      // The verdict only — never the value (§9.4, §15.2).
      ok: Boolean(credential) && headers[CREDENTIAL_HEADER] === credential,
      store_has_credential: Boolean(credential),
      header_present: Boolean(headers[CREDENTIAL_HEADER]),
      advice: !credential
        ? 'This store has no ingestion credential, so the receiver rejects every batch reaching its write path — run `/ptp:telemetry setup` to mint one.'
        : (headers[CREDENTIAL_HEADER] === credential ? '' : 'The live x-ptp-store-token does not match this store\'s credential — re-run `/ptp:telemetry setup`, then restart Claude Code.'),
    },
    bsp_delay: { ok: env.OTEL_BSP_SCHEDULE_DELAY === BSP_SCHEDULE_DELAY, live: env.OTEL_BSP_SCHEDULE_DELAY || '', expected: BSP_SCHEDULE_DELAY },
    // Non-gating like the delay, but reported: without these nothing is exported at all.
    logs_exporter: { ok: env.OTEL_LOGS_EXPORTER === 'otlp', live: env.OTEL_LOGS_EXPORTER || '', expected: 'otlp' },
    traces_exporter: { ok: env.OTEL_TRACES_EXPORTER === 'otlp', live: env.OTEL_TRACES_EXPORTER || '', expected: 'otlp' },
    block_on_disk: blockOnDisk,
    block_current_on_disk: blockCurrentOnDisk,
    settings_file: settingsFile,
  };
}

function envGateAdvisory(v) {
  const gates = [v.enable_flag.ok, v.endpoint.ok, v.protocol.ok, v.credential.ok];
  if (gates.every(Boolean)) return null;
  if (!v.block_on_disk) {
    return 'ptp telemetry: no telemetry environment is configured — run `/ptp:telemetry setup` once to enable span collection.';
  }
  if (v.block_current_on_disk) {
    // §15.2's second row is "the block is on disk but ABSENT from the live environment", and absence
    // is the test — not "the enable flag specifically is absent". A user who exports
    // CLAUDE_CODE_ENABLE_TELEMETRY=1 from their shell or a global settings file makes that one gate
    // pass while the other three are still simply missing; the block on disk is already current, so
    // re-running `setup` would rewrite byte-identical values and change nothing. Routing there sends
    // the user to a no-op and hides the one action that works.
    //
    // A failing key that is PRESENT with a different value is the third row instead: something else
    // is supplying it, and a restart alone will not displace it (§13.3's shadowing case).
    const failingKeysAllAbsent = [
      [v.enable_flag.ok, v.enable_flag.live],
      [v.endpoint.ok, v.endpoint.live],
      [v.protocol.ok, v.protocol.live],
      // `block_current_on_disk` already implies the store HAS a credential, so a failing credential
      // gate here is the live header being absent or mismatched — never "no credential to match".
      [v.credential.ok, v.credential.header_present ? 'present' : ''],
    ].every((pair) => pair[0] || !pair[1]);
    if (failingKeysAllAbsent) {
      // The one case a restart alone repairs: the correct block is on disk, just not yet in force.
      return 'ptp telemetry: the telemetry env block is on disk but not in this process — restart Claude Code to start collecting spans.';
    }
  }
  return 'ptp telemetry: the telemetry environment no longer matches this store — re-run `/ptp:telemetry setup`, then restart Claude Code.';
}

async function statusReport(ctx) {
  const cfg = ctx.paths.cfg;
  const lock = ctx.lock;
  const probePort = lock && Number(lock.port) !== cfg.port ? Number(lock.port) : cfg.port;
  const probeConfigured = await probeIdentity(cfg.port, 1000);
  const probeLock = probePort === cfg.port ? probeConfigured : await probeIdentity(probePort, 1000);
  const reloaded = readLockfile(ctx.paths.lockfile);
  // §14.6: the receiver repairs its lockfile before answering ANY probe, and the heal fires on a
  // *mismatched* file as well as an absent one — so detect both by comparing the file's contents
  // across the probe, not merely absent-then-present.
  const healed = Boolean(reloaded) && JSON.stringify(lock || null) !== JSON.stringify(reloaded);
  const identity = (probeConfigured.identity && identityMatchesStore(probeConfigured.identity, ctx.paths))
    ? probeConfigured.identity
    : (probeLock.identity && identityMatchesStore(probeLock.identity, ctx.paths) ? probeLock.identity : null);
  // §14.3's definition, both halves: **stale** is the recorded process not live AND the recorded
  // port unserved. Reporting `stale` while an unrelated listener still holds that port would tell
  // the user `start` can simply replace the lockfile, when `start` will in fact report a conflict.
  // Process identity, not bare pid liveness — a reused pid would otherwise make a stale lockfile
  // report as live, the exact confusion the recorded process start time exists to remove.
  const staleLock = Boolean(reloaded && !identity && !probeLock.served && !lockfileProcessStillLive(reloaded));
  return {
    action: 'status', // §14.8: every lifecycle command prints one JSON object carrying `action`
    telemetry_mode: cfg.mode,
    telemetry_root: ctx.paths.telemetryRoot,
    telemetry_port: cfg.port,
    env: envVerdict(ctx),
    codex: codexPreflight(ctx), // §22.6 — four read-only checks, no Codex process, no file written
    listening: Boolean(identity),
    receiver: identity ? {
      pid: identity.pid, port: identity.port, started_by: identity.started_by,
      started_at: identity.started_at, healthy: identity.healthy !== false,
    } : null,
    port_served_by_other: Boolean(!identity && (probeConfigured.served || probeLock.served)),
    lockfile: reloaded ? {
      path: ctx.paths.lockfile, pid: reloaded.pid, port: reloaded.port,
      started_by: reloaded.started_by, started_at: reloaded.started_at, stale: staleLock,
    } : null,
    lockfile_repaired_by_this_probe: healed,
    log_file: logFileFor(ctx.paths.telemetryRoot),
  };
}

/** The mechanical half of the auto-start preamble (§15). Emits at most one advisory. */
async function preamble(argv) {
  const repoRoot = argv.repo ? path.resolve(argv.repo) : findRepoRoot(process.cwd());
  // Step 1's resolution exists to answer the MODE and nothing else: §15.1 step 1 requires the off path
  // to return having performed slice 1's single layered configuration read and no second one, so the
  // gate cannot wait for `lifecycleContext`.
  if (resolveConfig(repoRoot).mode !== 'on') return { action: 'skipped', reason: 'mode-off', advisory: '' }; // step 1
  const ctx = await lifecycleContext(argv);
  // ...and from here ONE snapshot governs the whole sequence. Steps 2, 3 and 5 read the port through
  // `ctx.paths.cfg` (`portMigrationConflict`, `envVerdict`, `launchReceiver` all take `ctx`), so step 4
  // holding step 1's separately-resolved copy meant two independent reads of the same files decided one
  // run: an edit landing between them left the migration check, the environment check and the launch
  // targeting one port while the identity probe targeted another — and step 4 is the step that answers
  // `already-listening`, so the disagreement resolves in the unsafe direction, reporting healthy
  // collection into a receiver the exporter is not sending to.
  const cfg = ctx.paths.cfg;

  const migration = await portMigrationConflict(ctx); // step 2
  if (migration) return { action: 'skipped', reason: 'port-migration', advisory: migration.message };

  const v = envVerdict(ctx); // step 3
  const advisory = envGateAdvisory(v);
  if (advisory) return { action: 'skipped', reason: 'env-mismatch', advisory, env: v };

  const probe = await probeIdentity(cfg.port); // step 4 — one attempt, 250 ms
  if (probe.identity) {
    // Reloaded AFTER the probe, because §14.4 has the receiver repair its lockfile before answering
    // any probe — so a live receiver whose lockfile was deleted or had drifted is matched against the
    // file it has just rewritten, not against the missing one read at `lifecycleContext` time.
    ctx.lock = readLockfile(ctx.paths.lockfile);
    // The FULL identity check (§15.1 step 4), the same one `start` applies: a served port is never
    // success on occupancy alone, and the conflict case is explicitly "a ptp sink whose token,
    // repository root, or `telemetry.root` does not match" — three terms, not just the store root.
    // Matching on the store root alone returned `already-listening` for a sink that is not this
    // launch, and the preamble is the step that decides whether a funnel command collects anything,
    // so it silently reported healthy collection into a receiver holding a different launch token.
    // `export` uses the deliberately LOOSER store-only rule instead; the spec states that exception
    // for `export` alone, which is what makes the strict rule here the intended one.
    if (identityMatchesFull(probe.identity, ctx.paths, ctx.lock)) {
      return { action: 'already-listening', advisory: '', pid: probe.identity.pid, port: cfg.port, launch_token: probe.identity.launch_token };
    }
    return {
      action: 'skipped', reason: 'conflict',
      advisory: 'ptp telemetry: port ' + cfg.port + ' is served by a ptp receiver whose launch token, repository'
        + ' root, or telemetry root does not match this store — telemetry is not being collected for this one'
        + ' (change telemetry.port, or run `/ptp:telemetry stop` and let it start again).',
    };
  }
  if (probe.served) {
    return {
      action: 'skipped', reason: 'conflict',
      advisory: 'ptp telemetry: port ' + cfg.port + ' is held by an unrelated process — telemetry is not being collected (change telemetry.port).',
    };
  }

  // Step 5. `launchReceiver`, not `startReceiver`: steps 2 and 4 above already spent the whole
  // pre-launch probe budget of §15.4, and `startReceiver` would repeat both of them.
  const started = await launchReceiver(ctx, 'auto');
  if (started.action === 'started') return { action: 'started', advisory: '', pid: started.pid, port: started.port, launch_token: (readLockfile(ctx.paths.lockfile) || {}).launch_token };
  return { action: 'start-failed', advisory: started.message || 'ptp telemetry: the receiver could not be started — continuing without telemetry.' };
}

/* ------------------------------------------------------------------ export */

function collectRawRecords(telemetryRoot) {
  const out = { records: [], tornTrailing: 0, malformedInterior: 0, skippedKinds: 0, unreadable: [], storeDirs: [] };
  // Enumerated ONCE and retained, because `export` buckets its OUTPUTS by this same list. A second
  // enumeration can disagree with this checked one: a transient failure there returns an empty set
  // whose emptiness is indistinguishable from "no epics", so every epic that holds an existing
  // `spans.csv` but no current records would get no staged replacement — its stale rows surviving a
  // re-derivation that reports `exported`.
  out.storeDirs = listStoreDirs(telemetryRoot, out);
  const files = [];
  for (const dir of out.storeDirs) {
    const rawDir = path.join(telemetryRoot, dir, 'raw');
    let entries = [];
    try { entries = fs.readdirSync(rawDir); } catch (err) {
      // An absent `raw/` is ordinary — a store directory can hold a ledger and no spans yet. An
      // unreadable one hides an unknown number of records, which is not the same thing.
      if (!err || err.code !== 'ENOENT') out.unreadable.push(rawDir + ' (' + ((err && err.code) || 'read-failed') + ')');
      continue;
    }
    for (const f of entries.sort()) if (f.endsWith('.ndjson')) files.push(path.join(rawDir, f));
  }
  for (const f of files) readRawFile(f, out);
  return out;
}

function compareRows(a, b) {
  const keys = ['start_ts', 'span_id', 'trace_id'];
  for (const k of keys) {
    const av = a.record[k] === undefined || a.record[k] === null ? '' : String(a.record[k]);
    const bv = b.record[k] === undefined || b.record[k] === null ? '' : String(b.record[k]);
    if (av === '' && bv !== '') return -1; // empty orders before non-empty
    if (bv === '' && av !== '') return 1;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  const as = a.serialized;
  const bs = b.serialized;
  return as < bs ? -1 : as > bs ? 1 : 0;
}

async function runExport(argv) {
  const ctx = await lifecycleContext(argv);
  const root = ctx.paths.telemetryRoot;
  const cfg = ctx.paths.cfg;

  const liveProbe = async () => {
    // Re-read the lockfile on EVERY probe, never the copy captured before staging began (§12.5): a
    // receiver that came up — or repaired its own lockfile — while `export` was reading records
    // away on a non-configured port is discoverable only through the lockfile it has since written.
    const lock = readLockfile(ctx.paths.lockfile);
    if (lock) ctx.lock = lock;
    const ports = [cfg.port];
    if (lock && Number(lock.port) !== cfg.port) ports.push(Number(lock.port));
    for (const p of ports) {
      const probe = await probeIdentity(p, 1000);
      if (probe.identity && identityMatchesStore(probe.identity, ctx.paths)) return probe.identity;
    }
    return null;
  };

  const live = await liveProbe();
  if (live) {
    return {
      action: 'refused', reason: 'receiver-live',
      message: 'ptp telemetry: a receiver for this store is live on port ' + live.port
        + ' — run `/ptp:telemetry stop`, then `export` (any ptp command in between auto-starts it again; `telemetry.mode=off` first is the way to be sure). Nothing was written and nothing was stopped.',
    };
  }

  if (!fs.existsSync(root)) return { action: 'noop', reason: 'no-store', message: 'ptp telemetry: no telemetry store exists at ' + root + '.' };

  const collected = collectRawRecords(root);
  const runs = buildLedgerIndex(root, collected); // same sink: both are `export`'s re-derivation inputs
  if (collected.unreadable.length > 0) {
    // Before any staging, so nothing is written and nothing is removed. §12.4 tolerates a torn
    // trailing line, a malformed interior line, and an unrecognized entry kind — and nothing else. An
    // input `export` could not read at all is outside that list, and `export` REPLACES every
    // `spans.csv`, so publishing from a partial read would silently delete rows this store still holds
    // and report `exported` for the result.
    return {
      action: 'failed', reason: 'inputs-unreadable', unreadable: collected.unreadable,
      message: 'ptp telemetry: `export` could not read every input it re-derives from ('
        + collected.unreadable.join('; ') + '). Nothing was staged and every spans.csv is untouched — '
        + '`export` replaces each one, so deriving from a partial read would delete rows this store '
        + 'still holds. Fix the permissions and re-run `/ptp:telemetry export`.',
    };
  }
  const items = collected.records.map((raw) => {
    const record = baseRecord();
    for (const c of CSV_COLUMNS) if (raw[c] !== undefined) record[c] = raw[c];
    record.schema_version = RECORD_SCHEMA_VERSION;
    const bash = raw.bash_command && typeof raw.bash_command === 'object' ? raw.bash_command : null;
    record.tool_class = deriveToolClass(record.tool_name, bash ? bash.text : '');
    const notes = [];
    if (!record.start_ts && !record.end_ts) notes.push('missing-timestamp');
    // §22.4: routing is re-derived from the record's PERSISTED origin evidence, never from the `cli`
    // value a previous export projected. An absent `service_name` — every raw line written before
    // `0032_07_raw-record-service-name` — reads as an empty field, i.e. carrying no discriminator.
    const origin = typeof raw.service_name === 'string' ? raw.service_name : '';
    // ...and the correlation likewise from the persisted record, by the same extraction: for a
    // Codex-origin record `run_id` holds the value transported in resource `env` and never a join
    // output, because `attributeRecords` writes exactly that value there on every pass.
    const correlation = origin === CODEX_SERVICE_NAME ? String(record.run_id || '') : '';
    return { record, notes, extras: null, origin, correlation };
  });

  attributeRecords(items, runs);
  for (const item of items) item.serialized = csvRow(item.record);

  const buckets = new Map();
  const ensureBucket = (key) => { if (!buckets.has(key)) buckets.set(key, []); return buckets.get(key); };
  ensureBucket('_unattributed');
  for (const dir of collected.storeDirs) ensureBucket(dir); // the checked enumeration, reused
  for (const item of items) ensureBucket(item.dirKey).push(item);

  // §2.1's store policy, on the one command whose entire output is CSV files. `export` is a writer
  // into `<telemetry.root>/` — it creates epic directories a reattribution now needs, it always writes
  // `_unattributed/spans.csv`, and it REPLACES every existing one — so the self-healing §2.1 promises
  // for "a root whose policy files were deleted" has to reach it too: without `.gitattributes` these
  // CRLF files are exactly what a consumer repo's `text=auto eol=lf` normalizes, and the BOM alone is
  // stated there to be insufficient. Placed after the read-and-refuse gates so a refusal still touches
  // nothing, and before any staging so the policy is in place before the first file lands. Both halves
  // swallow their own errors, so this can never turn a successful export into a failed one.
  storePolicyWrite(root);

  const staged = [];
  const discardStaged = () => {
    for (const s of staged) { try { fs.unlinkSync(s.tmp); } catch (_) { /* ignore */ } }
  };

  // Every filesystem step is guarded: an unwritable epic directory must produce ONE actionable
  // non-fatal line and leave no temporary file behind — not a stack trace, a non-zero exit, and a
  // litter of `.spans.csv.*.tmp` files, which is what an escaping throw would give.
  try {
    // Compared on the DIRECTORY KEY, never by `Array.prototype.sort`'s default string coercion of the
    // `[dirKey, rows]` entry. That coercion renders the whole row array into the sort key — one
    // `[object Object]` per staged record, so the key grows with the size of the store — and it
    // compares the `,` separator against the next character of a longer key, which inverts the order
    // of any two directory names where one is a prefix of the other and the next character sorts below
    // `,` (`0032 b` ahead of `0032`). The staging order is what the `outputs` report and the rename
    // sequence follow, so it is a stated order rather than an incidental one.
    const byDirKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    for (const [dirKey, rows] of [...buckets.entries()].sort(byDirKey)) {
      rows.sort(compareRows);
      const dir = path.join(root, dirKey);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, '.spans.csv.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
      // Registered BEFORE the write, never after it. A `writeFileSync` that CREATES the file and then
      // fails part-way (ENOSPC) would otherwise be invisible to `discardStaged`, leaving exactly the
      // `.spans.csv.*.tmp` litter this branch's message promises is absent — and §12.6 states of both
      // `failed` forms that "neither leaves a temporary file behind". An unlink of a path the write
      // never created is an ENOENT the discard already swallows.
      staged.push({ tmp, dest: path.join(dir, 'spans.csv'), count: rows.length, dirKey });
      fs.writeFileSync(tmp, csvHeader() + rows.map((r) => r.serialized).join(''));
    }
  } catch (err) {
    discardStaged();
    return {
      action: 'failed', reason: 'staging-failed',
      message: 'ptp telemetry: `export` could not stage its output under ' + root + ' (' + (err && err.code)
        + ') — every spans.csv is untouched and no temporary file remains.',
    };
  }

  const lateLive = await liveProbe(); // one probe after all staging, before the first rename
  if (lateLive) {
    discardStaged();
    return {
      action: 'aborted', reason: 'receiver-appeared',
      message: 'ptp telemetry: a receiver for this store appeared while export was staging — run `/ptp:telemetry stop`, then `export`. Every spans.csv is untouched and no temporary file remains.',
    };
  }
  try {
    for (const s of staged) fs.renameSync(s.tmp, s.dest); // replace-if-exists
  } catch (err) {
    // Some renames may already have landed; each is a complete file, so the store is consistent —
    // only partially regenerated. Say so and drop the rest rather than half-reporting success.
    discardStaged();
    return {
      action: 'failed', reason: 'publish-failed',
      message: 'ptp telemetry: `export` could not replace every spans.csv under ' + root + ' ('
        + (err && err.code) + '). Each file is complete — some are the newly derived version and some the previous one — and no temporary file remains. Fix the permissions and re-run `/ptp:telemetry export`.',
    };
  }

  return {
    action: 'exported',
    outputs: staged.map((s) => ({ path: s.dest, rows: s.count })),
    records: items.length,
    torn_trailing_lines: collected.tornTrailing,
    malformed_interior_lines: collected.malformedInterior,
    skipped_unknown_entry_kinds: collected.skippedKinds,
  };
}

/* ------------------------------------------------------------------ setup */

function repoGitignoreReconcilePlan(repoRoot, line) {
  const file = path.join(repoRoot, '.gitignore');
  let existing = null;
  try { existing = fs.readFileSync(file, 'utf8'); } catch (_) { existing = null; }
  const present = existing === null ? [] : gitignoreLines(existing);
  return { file, needed: !managedRuleEffective(present, line), line, exists: existing !== null };
}

function applyGitignoreLine(plan) {
  try {
    if (!plan.needed) return;
    let existing = '';
    try { existing = fs.readFileSync(plan.file, 'utf8'); } catch (_) { existing = ''; }
    const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(plan.file, sep + plan.line + '\n');
  } catch (_) { /* swallowed */ }
}

/** Read-back check that a `.gitignore` really carries every line it was asked to carry. */
function gitignoreCovers(file, lines) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return false; }
  // Effectiveness, not membership — the shared rule, so this read-back and the reconciler that is
  // supposed to satisfy it can never disagree about what "covered" means. `setup` stakes the
  // ingestion credential on this answer and `start` stakes the lockfile on it (§13.4, §14.1), so a
  // wrong one here is a false protection guarantee rather than a cosmetic slip.
  const present = gitignoreLines(text);
  return lines.every((l) => managedRuleEffective(present, l));
}

/**
 * `tracked` | `untracked` | `unknown` — three states, because the two-state form fails OPEN on the
 * one check standing between a store secret and a committed file (§13.1).
 *
 * `git ls-files --error-unmatch` exits **0** when the path is tracked and **1** when it matches
 * nothing git knows; every other outcome — **128** for a fatal condition (dubious ownership, an
 * unreadable index, not a repository) and a spawn failure such as `ENOENT` for a git that is not
 * installed — is git declining to answer, NOT evidence of an untracked file. Collapsing those into
 * `false` is what lets `setup` write the ingestion credential into a file git is in fact tracking,
 * while reporting that the file is ignored.
 *
 * A directory with no `.git` at all is answered without asking git: nothing there can be tracked, and
 * asking would produce the very exit 128 that must otherwise be treated as unknown — so the precise
 * answer costs one `existsSync` and keeps a non-git project from being refused.
 */
function gitTrackedState(repoRoot, relPath) {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) return 'untracked';
  try {
    execFileSync('git', ['-C', repoRoot, 'ls-files', '--error-unmatch', relPath], { stdio: 'ignore' });
    return 'tracked';
  } catch (err) {
    return err && err.status === 1 ? 'untracked' : 'unknown';
  }
}

/**
 * `reveal` is an INTERNAL flag used only by `setupApply`. The emitted plan never carries the
 * credential's literal value, for two reasons: rendering it would print a secret into the
 * transcript, and a *provisional* one (minted in memory when the store has none) is not the value
 * `setup-apply` will persist — so displaying it would show a byte string the confirmed write does
 * not produce.
 */
function setupPlan(argv, reveal) {
  const repoRoot = argv.repo ? path.resolve(argv.repo) : findRepoRoot(process.cwd());
  const paths = storePaths(repoRoot);
  const cfg = paths.cfg;
  const settingsFile = path.join(repoRoot, '.claude', 'settings.local.json');

  let settingsRaw = null;
  try { settingsRaw = fs.readFileSync(settingsFile, 'utf8'); } catch (err) {
    // ONLY a genuine ENOENT is "no settings file yet" — the same posture `readCodexConsent` already
    // takes, and the one `setupApply`'s own re-read already implements. Collapsing EACCES or an I/O
    // error into absence renders a plan that STATES the file does not exist and that no other `env`
    // key needs preserving, and asks the user to confirm it; `setupApply` would then reconcile both
    // `.gitignore` files and mint the credential before its stricter re-read refuses. Refusing here
    // means nothing at all is written on this path.
    if (!err || err.code !== 'ENOENT') {
      return {
        action: 'refused', reason: 'settings-unreadable',
        message: 'ptp telemetry: ' + settingsFile + ' exists but could not be read ('
          + ((err && err.code) || 'read-failed') + ') — refusing to plan a write against a file ptp '
          + 'cannot see, since the plan would claim it is absent and that it holds no other settings. '
          + 'Nothing was written. Fix the permissions, then re-run `/ptp:telemetry setup`.',
      };
    }
    settingsRaw = null;
  }
  let settings = {};
  if (settingsRaw !== null) {
    try { settings = JSON.parse(settingsRaw); } catch (_) {
      return { action: 'refused', reason: 'unparseable-settings', message: 'ptp telemetry: ' + settingsFile + ' does not parse as JSON — refusing to overwrite it. Fix it by hand, then re-run `/ptp:telemetry setup`.' };
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return { action: 'refused', reason: 'wrong-shape-settings', message: 'ptp telemetry: ' + settingsFile + ' is not a JSON object — refusing to overwrite it.' };
    }
    // §13.3 preserves every key outside the eight. An `env` that is present but not an object
    // cannot be merged into without discarding whatever it holds, so refuse rather than replace —
    // the same posture the whole-file shape check above takes.
    if (Object.prototype.hasOwnProperty.call(settings, 'env')
      && (settings.env === null || typeof settings.env !== 'object' || Array.isArray(settings.env))) {
      return { action: 'refused', reason: 'wrong-shape-env', message: 'ptp telemetry: the `env` key in ' + settingsFile + ' is not a JSON object — refusing to replace it. Fix it by hand, then re-run `/ptp:telemetry setup`.' };
    }
  }

  const trackedState = gitTrackedState(repoRoot, '.claude/settings.local.json');
  if (trackedState === 'tracked') {
    return { action: 'refused', reason: 'settings-tracked', message: 'ptp telemetry: .claude/settings.local.json is tracked by git — the telemetry block carries this store\'s ingestion credential and must not be committed. Untrack it (`git rm --cached .claude/settings.local.json`), then re-run `/ptp:telemetry setup`.' };
  }
  if (trackedState === 'unknown') {
    // Refuse on "cannot tell", never proceed on it: §13.1's guarantee is that the credential is not
    // written into a tracked file, and an unanswerable check is not the same as a negative answer.
    return {
      action: 'refused', reason: 'settings-tracked-state-unknown',
      message: 'ptp telemetry: git could not report whether .claude/settings.local.json is tracked in '
        + repoRoot + ' (git is unavailable, or refused to read this repository — a dubious-ownership '
        + 'or unreadable-index condition). The telemetry block carries this store\'s ingestion '
        + 'credential, so nothing was written rather than risk writing it into a tracked file. Make '
        + '`git -C ' + repoRoot + ' ls-files --error-unmatch .claude/settings.local.json` answer, then '
        + 're-run `/ptp:telemetry setup`.',
    };
  }

  const existingCredential = readCredential(paths);
  const credential = existingCredential || crypto.randomBytes(32).toString('hex'); // provisional when absent
  const desired = {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_EXPORTER_OTLP_PROTOCOL: SHIPPED_PROTOCOL,
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:' + cfg.port,
    OTEL_BSP_SCHEDULE_DELAY: BSP_SCHEDULE_DELAY,
    OTEL_EXPORTER_OTLP_HEADERS: CREDENTIAL_HEADER + '=' + credential,
    // The two exporter-selection keys. Measured, not assumed: with only the five keys above,
    // Claude Code 2.1.220 posts NOTHING at all (spike/OUTCOME.md, "the five-key block does not
    // emit"). They select OTLP rather than enable telemetry, and metrics are deliberately left
    // unset so the receiver is never sent `/v1/metrics`.
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_TRACES_EXPORTER: 'otlp',
    // The eighth key, added on MEASURED evidence exactly as the two exporter keys above were.
    // Without it Claude Code emits neither `tool_parameters` nor `tool_input` on any tool event, so
    // §10.4's Bash command text is not merely unread but ABSENT FROM THE WIRE — every
    // `bash_command.text` in the store was empty for this reason, and no sink-side change alone can
    // populate it. Paired control runs against 2.1.220 confirmed both directions.
    // Non-gating, like the delay and the two exporter keys: its absence costs one raw-only field,
    // not emission, so the auto-start preamble's gate stays exactly FOUR keys.
    // Scope note: this turns on tool PARAMETERS only. `OTEL_LOG_USER_PROMPTS`,
    // `OTEL_LOG_TOOL_CONTENT`, and `OTEL_LOG_RAW_API_BODIES` remain deliberately unset.
    OTEL_LOG_TOOL_DETAILS: '1',
  };
  const currentEnv = settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env) ? settings.env : {};
  const REDACTED = CREDENTIAL_HEADER + '=<'
    + (existingCredential ? "this store's existing credential" : 'a newly generated per-store credential')
    + '>';
  const diff = Object.keys(desired).map((k) => {
    const secret = k === 'OTEL_EXPORTER_OTLP_HEADERS' && !reveal;
    const had = Object.prototype.hasOwnProperty.call(currentEnv, k);
    return {
      key: k,
      old: !had ? null : (secret ? CREDENTIAL_HEADER + '=<the value currently in this file>' : currentEnv[k]),
      new: secret ? REDACTED : desired[k],
      changed: currentEnv[k] !== desired[k],
      shadowed_by_live_env: process.env[k] !== undefined && process.env[k] !== desired[k],
      value_redacted: secret || undefined,
    };
  });

  return {
    action: 'plan',
    repo_root: repoRoot,
    settings_file: settingsFile,
    settings_exists: settingsRaw !== null,
    telemetry_root: paths.telemetryRoot,
    credential_file: paths.credentialFile,
    credential_exists: Boolean(existingCredential),
    credential_provisional: !existingCredential,
    telemetry_port: cfg.port,
    env_diff: diff,
    // `hasOwnProperty`, not `in` — the same own-key test the five other membership checks in this file
    // already use, and required here for the same reason. `desired` is a plain object literal, so `in`
    // also answers true for every `Object.prototype` name: an `env` key called `toString`,
    // `constructor`, or `hasOwnProperty` would be filtered out of this list as though it were one of
    // the eight managed keys. §13.3's write preserves it — `setupApply` assigns only `plan.env_diff`'s
    // keys — so `in` makes the plan the user CONFIRMS describe a different write than the one that runs.
    other_env_keys_preserved: Object.keys(currentEnv)
      .filter((k) => !Object.prototype.hasOwnProperty.call(desired, k)),
    store_gitignore_reconciliation: (() => {
      const file = path.join(paths.telemetryRoot, '.gitignore');
      let existing = null;
      try { existing = fs.readFileSync(file, 'utf8'); } catch (_) { existing = null; }
      const present = existing === null ? [] : gitignoreLines(existing);
      return { file, missing_lines: GITIGNORE_MANAGED.filter((l) => !managedRuleEffective(present, l)) };
    })(),
    repo_gitignore_reconciliation: repoGitignoreReconcilePlan(repoRoot, '.claude/settings.local.json'),
    takes_effect: 'at Claude Code process start — restart Claude Code after confirming.',
  };
}

function setupApply(argv) {
  const plan = setupPlan(argv, true); // revealed internally; never emitted
  if (plan.action !== 'plan') return plan;
  const repoRoot = plan.repo_root;
  const paths = storePaths(repoRoot);

  // Order (§13.4): each protection is written before the secret it protects.
  applyGitignoreLine(plan.repo_gitignore_reconciliation);
  reconcileGitignore(paths.telemetryRoot);

  // ...and then VERIFY it landed. Both reconciliations swallow their errors (they share the
  // fire-and-forget telemetry writer), so an unwritable `.gitignore` would otherwise let `setup`
  // persist the credential and the credential-bearing settings file into unignored paths while
  // reporting success — turning §13.4's never-briefly-tracked guarantee into a false claim.
  const unprotected = [];
  if (!gitignoreCovers(path.join(repoRoot, '.gitignore'), ['.claude/settings.local.json'])) {
    unprotected.push(path.join(repoRoot, '.gitignore') + ' (missing `.claude/settings.local.json`)');
  }
  if (!gitignoreCovers(path.join(paths.telemetryRoot, '.gitignore'), [CREDENTIAL_NAME])) {
    unprotected.push(path.join(paths.telemetryRoot, '.gitignore') + ' (missing `' + CREDENTIAL_NAME + '`)');
  }
  if (unprotected.length > 0) {
    return {
      action: 'refused', reason: 'gitignore-not-written', unprotected,
      message: 'ptp telemetry: the .gitignore protection could not be written (' + unprotected.join('; ')
        + '), so nothing was written — neither the credential nor settings.local.json. Fix those files, then re-run `/ptp:telemetry setup`.',
    };
  }

  let credential = readCredential(paths);
  let credentialMintedNow = false;
  if (!credential) {
    const minted = plan.env_diff.find((d) => d.key === 'OTEL_EXPORTER_OTLP_HEADERS').new.split('=').slice(1).join('=');
    // §9.4: created ONCE, then reused. An exclusive create makes that true even if a second
    // confirmed `setup` raced this one — the loser adopts the winner's token instead of
    // overwriting it and leaving settings.local.json naming a credential the store no longer holds.
    try {
      fs.writeFileSync(paths.credentialFile, minted + '\n', { mode: 0o600, flag: 'wx' });
      credential = minted;
      credentialMintedNow = true;
    } catch (err) {
      credential = readCredential(paths);
      if (!credential) {
        // Scoped exactly like the `gitignore-not-written` branch above, and for the same reason: by
        // the time this is reached, §13.4's ordering has already run BOTH `.gitignore` reconciliations
        // — each protection is written before the secret it protects — so either file may legitimately
        // carry a new managed line. A bare "nothing was written" is therefore false, and it is false
        // about the one thing a user reading a failure report would go and check. The reconciliations
        // are required behavior on a confirmed `setup`, not damage, so they are named rather than
        // undone.
        return {
          action: 'refused', reason: 'credential-unwritable', credential_file: paths.credentialFile,
          message: 'ptp telemetry: the ingestion credential could not be written to ' + paths.credentialFile
            + ' (' + (err && err.code) + ') — neither the credential nor settings.local.json was written.'
            + ' The `.gitignore` protection for both had already been reconciled, so those two files may'
            + ' each carry a new managed line; nothing else was touched. Fix the permissions, then'
            + ' re-run `/ptp:telemetry setup`.',
        };
      }
    }
  }
  // ALWAYS re-derive the header from the credential the store actually holds — never from the
  // provisional one the plan minted. The plan's value is stale whenever another `setup` created the
  // credential first, in which case writing the planned token would leave settings.local.json
  // naming a credential this store will reject on every batch.
  for (const d of plan.env_diff) {
    if (d.key === 'OTEL_EXPORTER_OTLP_HEADERS') d.new = CREDENTIAL_HEADER + '=' + credential;
  }

  const settingsFile = plan.settings_file;
  // Re-read and re-validate rather than falling back to `{}`: a read failure or an edit landing
  // between the plan and this confirmed write must NOT be answered by replacing the whole file with
  // the env block alone. §13.3's refuse-without-overwriting posture applies here too.
  let settings;
  let settingsRaw = null;
  try { settingsRaw = fs.readFileSync(settingsFile, 'utf8'); } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      // Reachable when the file becomes unreadable BETWEEN the plan and this confirmed write. The
      // credential half may already have landed by now, so the report says which — an unconditional
      // "the credential file is unchanged" would be false in exactly the run that just minted it.
      return {
        action: 'refused', reason: 'settings-unreadable', credential_created: credentialMintedNow,
        credential_file: paths.credentialFile,
        message: 'ptp telemetry: ' + settingsFile + ' could not be read (' + (err && err.code)
          + ') — refusing to replace it. ' + (credentialMintedNow
            ? 'This store\'s ingestion credential was minted at ' + paths.credentialFile
              + ' and is kept — the next `/ptp:telemetry setup` reuses it rather than replacing it.'
            : 'The credential file is unchanged.'),
      };
    }
  }
  if (settingsRaw === null) settings = {};
  else {
    try { settings = JSON.parse(settingsRaw); } catch (_) {
      return { action: 'refused', reason: 'unparseable-settings', message: 'ptp telemetry: ' + settingsFile + ' no longer parses as JSON — refusing to overwrite it.' };
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return { action: 'refused', reason: 'wrong-shape-settings', message: 'ptp telemetry: ' + settingsFile + ' is not a JSON object — refusing to overwrite it.' };
    }
    if (Object.prototype.hasOwnProperty.call(settings, 'env')
      && (settings.env === null || typeof settings.env !== 'object' || Array.isArray(settings.env))) {
      return { action: 'refused', reason: 'wrong-shape-env', message: 'ptp telemetry: the `env` key in ' + settingsFile + ' is not a JSON object — refusing to replace it.' };
    }
  }
  if (!settings.env) settings.env = {};
  for (const d of plan.env_diff) settings.env[d.key] = d.new;
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    // Write-temp-then-rename, the protocol the lockfile, `export`, and `codexSetupApply` already use
    // here — and required for the same reason, on the file where it matters most: a direct
    // `writeFileSync` TRUNCATES the destination first, so a failure part-way through (ENOSPC, EIO)
    // would leave an empty or half-written settings file while the error path below reports it
    // "unchanged". This file holds EVERY local Claude Code setting for the repository, not just the
    // telemetry block, so that claim cannot be allowed to be false. Mode 0o600 because the block
    // carries the store credential; the temp file is unlinked on any failure, and the residual — a
    // crash between write and rename leaving one `.claude/.settings.local.json.*.tmp` behind, which
    // §13.4's single managed ignore line does not cover — is a visible untracked file, strictly less
    // bad than silently destroying the user's settings.
    const tmp = path.join(path.dirname(settingsFile),
      '.settings.local.json.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
    try {
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(tmp, settingsFile); // replace-if-exists
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch (_) { /* nothing staged, or already gone */ }
      throw err;
    }
  } catch (err) {
    // One actionable line rather than a stack trace: the credential may already exist by now, and
    // the user needs to know exactly which half landed.
    return {
      action: 'refused', reason: 'settings-unwritable', credential_file: paths.credentialFile,
      message: 'ptp telemetry: ' + settingsFile + ' could not be written (' + (err && err.code)
        + ') — it is unchanged. The store\'s ingestion credential is in place, so fix the permissions and re-run `/ptp:telemetry setup`; the existing credential will be reused.',
    };
  }

  return {
    action: 'written',
    settings_file: settingsFile,
    credential_file: paths.credentialFile,
    // What this run actually did, not what the plan predicted. §9.4's exclusive create means a second
    // confirmed `setup` racing this one ADOPTS the winner's token — `plan.credential_exists` was false
    // for both, so reporting it here would tell the loser it created a credential it in fact found. The
    // settings-unreadable branch above already reports the tracked value; this is the same fact.
    credential_created: credentialMintedNow,
    restart_required: true,
    message: 'ptp telemetry: settings.local.json updated. The env block is applied at process start, so restart Claude Code before spans are emitted.',
  };
}

/* ------------------------------------------------------------------ Codex telemetry (§22) */

function codexConsentPath(paths) { return path.join(paths.telemetryRoot, CODEX_CONSENT_NAME); }

/** Is `cmd` on PATH? A pure filesystem lookup — it starts no process. `PATHEXT` on Windows. */
function findOnPath(cmd) {
  const raw = process.env.PATH || process.env.Path || '';
  const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';
  let exts = [''];
  if (process.platform === 'win32') {
    exts = String(process.env.PATHEXT || DEFAULT_PATHEXT).split(';').filter(Boolean);
    // A PATHEXT holding only separators parses to nothing, and an empty candidate list would report a
    // perfectly present `codex.exe` as absent — a wrong preflight verdict produced by the user's
    // environment rather than by their configuration. Fall back to the documented default set.
    if (exts.length === 0) exts = DEFAULT_PATHEXT.split(';');
  }
  for (const dir of String(raw).split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, cmd + ext);
      try {
        if (!fs.statSync(p).isFile()) continue;
        // A file named `codex` that is not executable cannot be invoked, so reporting it as "on PATH"
        // would make check 1 wrong in the one direction that matters. Windows decides executability by
        // extension — which `PATHEXT` above already applied — so the bit is only meaningful on POSIX.
        if (process.platform !== 'win32') fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch (_) { /* next candidate */ }
    }
  }
  return null;
}

/**
 * A fingerprint of the store's ingestion credential — NOT the credential.
 *
 * The consent record deliberately does not carry the credential value: under the selected
 * per-invocation mechanism nothing ptp writes carries it, and writing it here would put a store
 * secret into a repository file that the store's managed `.gitignore` set (a `0032_02` contract this
 * change does not touch) does not cover. The fingerprint is a one-way digest of a 256-bit random
 * token, so it discloses nothing, and it is never printed either way — only its match verdict is.
 *
 * What it buys is DETECTABILITY, not authorization: it records which credential the consent was given
 * against, so a record cloned into another checkout — or left behind by a credential rotation — is
 * reported by §22.6 check 4 as stale consent rather than passing unnoticed. `codexConsentGranted` below
 * deliberately does NOT test it: gating wiring on the fingerprint would silently switch telemetry off
 * after a routine rotation, which §22.6 records as explicitly NOT delivery-breaking.
 */
function credentialFingerprint(credential) {
  if (!credential) return '';
  return 'sha256:' + crypto.createHash('sha256').update(String(credential)).digest('hex').slice(0, 16);
}

/**
 * THE canonical rendering (SKILL.md §22.2), pinned once and consumed by all three sides: the `setup`
 * writer, the `status` parser, and the README example. A conceptual key list is not enough — writer
 * and reader are separate contracts and two renderings that both satisfy the prose can fail to parse
 * each other.
 *
 * Every argument is confined to the `otel.*` key space, which is the exact bound of the invariant
 * relaxation the decision record decided. No environment variable, no configuration file, no key
 * outside `otel.*`, and NO metrics exporter (the receiver serves `/v1/traces` and `/v1/logs` only).
 */
function codexWiringArgs(opts) {
  const exporter = (endpoint, credential) => '{"otlp-http"={endpoint="' + endpoint
    + '",protocol="json",headers={"' + CREDENTIAL_HEADER + '"="' + credential + '"}}}';
  const args = [];
  args.push('-c', 'otel.environment=' + (opts.runId === undefined ? '<run_id>' : opts.runId));
  args.push('-c', 'otel.exporter=' + exporter(opts.logEndpoint, opts.credential));
  if (opts.traceEndpoint) args.push('-c', 'otel.trace_exporter=' + exporter(opts.traceEndpoint, opts.credential));
  return args;
}

function codexLogEndpoint(port) { return 'http://127.0.0.1:' + port + '/v1/logs'; }
function codexTraceEndpoint(port) { return 'http://127.0.0.1:' + port + '/v1/traces'; }

/**
 * Read the consent record. Distinguishes the three states the writer's posture depends on:
 * absent (no consent yet), unparseable/wrong-shape (refuse without overwriting), and present.
 */
function readCodexConsent(paths) {
  const file = codexConsentPath(paths);
  let raw = null;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // ONLY a genuine ENOENT is "no consent yet". Collapsing EACCES or an I/O error into `absent` would
    // report an existing record as missing — `status` would advise running `setup`, and `setup` would
    // offer to CREATE a record that is right there. An unreadable record is handled exactly like an
    // unparseable one: refuse, write nothing, leave it alone.
    if (err && err.code === 'ENOENT') return { file, state: 'absent', data: null };
    return { file, state: 'unreadable', data: null, error: (err && err.code) || 'read-failed' };
  }
  let obj;
  try { obj = JSON.parse(raw); } catch (_) { return { file, state: 'unparseable', data: null }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { file, state: 'wrong-shape', data: null };
  return { file, state: 'present', data: obj };
}

/**
 * The states in which the record exists but cannot be safely rewritten. All three refuse rather than
 * overwrite, so a record ptp cannot read or parse is never replaced by one it authored.
 */
function codexConsentUnusable(consent) {
  return consent.state === 'unparseable' || consent.state === 'wrong-shape' || consent.state === 'unreadable';
}

/** True only for a record that affirmatively grants consent. Absence withholds the wiring. */
function codexConsentGranted(consent) {
  return consent.state === 'present'
    && consent.data.ptp_consent_kind === CODEX_CONSENT_KIND
    && consent.data.consent === 'granted';
}

function codexSetupPlan(argv, reveal) {
  const repoRoot = argv.repo ? path.resolve(argv.repo) : findRepoRoot(process.cwd());
  const paths = storePaths(repoRoot);
  const cfg = paths.cfg;
  const consent = readCodexConsent(paths);

  if (codexConsentUnusable(consent)) {
    const unreadable = consent.state === 'unreadable';
    return {
      action: 'refused',
      reason: unreadable ? 'unreadable-consent-record' : 'unparseable-consent-record',
      consent_record: consent.file,
      message: 'ptp telemetry: ' + consent.file + (unreadable
        ? ' exists but could not be read (' + consent.error + ') — refusing to replace a record ptp cannot see. '
        : ' does not parse as a JSON object — refusing to overwrite it. ')
        + 'Fix it by hand, then re-run `/ptp:telemetry setup`.',
    };
  }

  // The blocking condition is the CREDENTIAL FILE, never "the Claude-side step was declined": the
  // baseline mints the credential once and reuses it, so a re-run may decline the Claude-side write
  // while a perfectly valid credential remains on disk. Nothing of its own is ever minted here.
  const credential = readCredential(paths);
  if (!credential) {
    return {
      action: 'blocked', reason: 'no-credential', credential_file: paths.credentialFile,
      consent_record: consent.file,
      message: 'ptp telemetry: this store has no ingestion credential at ' + paths.credentialFile
        + ', so no working Codex configuration can be produced. Nothing was written and no credential was minted — '
        + 'confirm the Claude-side `/ptp:telemetry setup` step once to mint it, then re-run.',
    };
  }

  const withTraces = argv['with-traces'] === true || argv['with-traces'] === 'true';
  const desired = {
    ptp_consent_kind: CODEX_CONSENT_KIND,
    ptp_consent_version: CODEX_CONSENT_VERSION,
    consent: 'granted',
    granted_at: nowIso(),
    log_endpoint: codexLogEndpoint(cfg.port),
    // Opt-in per advisory **A-6**: one trivial turn produced 932 spans, almost all Rust `tracing`
    // internals, while the LOG signal carries the timing data the epic wants.
    trace_endpoint: withTraces ? codexTraceEndpoint(cfg.port) : '',
    credential_fingerprint: credentialFingerprint(credential),
  };
  const current = consent.data || {};
  // The fingerprint is a value to COMPARE, never one to show: §22.3 records that it is never printed
  // either way, and this plan is rendered verbatim to the user. Redaction is gated on `reveal` exactly
  // as the wiring preview is, so `codex-setup-apply` — the only caller passing `reveal` — still writes
  // the real digest rather than its placeholder.
  const REDACTED_FINGERPRINT = '<a one-way digest of the store credential — value not shown>';
  const show = (k, v) => (k === 'credential_fingerprint' && !reveal && v ? REDACTED_FINGERPRINT : v);
  const diff = CODEX_CONSENT_MANAGED_KEYS.map((k) => {
    const had = Object.prototype.hasOwnProperty.call(current, k);
    return {
      key: k,
      old: had ? show(k, current[k]) : null,
      new: show(k, desired[k]),
      // `granted_at` is a timestamp, so it always differs; it is not a semantic change on its own.
      changed: k === 'granted_at' ? had === false : current[k] !== desired[k],
    };
  });

  const wiring = codexWiringArgs({
    logEndpoint: desired.log_endpoint,
    traceEndpoint: desired.trace_endpoint,
    credential: reveal ? credential : '<the store\'s ingestion credential — value not shown>',
  });

  return {
    action: 'plan',
    repo_root: repoRoot,
    telemetry_root: paths.telemetryRoot,
    telemetry_port: cfg.port,
    consent_record: consent.file,
    consent_record_exists: consent.state === 'present',
    credential_file: paths.credentialFile,
    consent_diff: diff,
    other_keys_preserved: Object.keys(current).filter((k) => !CODEX_CONSENT_MANAGED_KEYS.includes(k)),
    wiring_preview: reveal ? undefined : wiring,
    wiring_value_redacted: !reveal,
    trace_signal: withTraces ? 'opt-in-enabled' : 'not-enabled',
    metrics_exporter: 'never configured — the receiver serves /v1/traces and /v1/logs only, so a '
      + 'metrics exporter would aim at a route nothing answers. Metrics are out of scope for this '
      + 'slice, not an emptied column.',
    residual_exposure: 'The -c otel.* arguments carry the store credential on the `codex exec` command '
      + 'line, so they are visible in any process listing and in Codex\'s own session record. Redacting '
      + 'this diff hides the value from THIS output only — it is not the protection.',
    scope: 'Repository-scoped. Nothing is written to any user-global path and no Codex configuration '
      + 'file is written anywhere; this records consent for ptp to append the wiring above to the '
      + '`codex exec` invocations it constructs in this repository.',
    verified: 'written but unverified end to end — `setup` starts no Codex process. The pinned '
      + 'codex-cli 0.145.0 was observed transmitting the ' + CREDENTIAL_HEADER + ' header verbatim '
      + '(lower-cased), so header support is stated for that version; delivery is not.',
  };
}

function codexSetupApply(argv) {
  const plan = codexSetupPlan(argv, true);
  if (plan.action !== 'plan') return plan;
  const paths = storePaths(plan.repo_root);
  const consent = readCodexConsent(paths);
  // Re-read and re-validate rather than trusting the plan's snapshot: an edit landing between the
  // plan and this confirmed write must not be answered by replacing the file wholesale.
  if (codexConsentUnusable(consent)) {
    return {
      action: 'refused',
      reason: consent.state === 'unreadable' ? 'unreadable-consent-record' : 'unparseable-consent-record',
      consent_record: consent.file,
      message: 'ptp telemetry: ' + consent.file + (consent.state === 'unreadable'
        ? ' can no longer be read (' + consent.error + ') — refusing to overwrite it.'
        : ' no longer parses as a JSON object — refusing to overwrite it.'),
    };
  }

  // MANAGED-KEY REPLACEMENT, never whole-file replacement: the enumerated keys are replaced and every
  // other key the user or a future slice put there is preserved byte-for-byte.
  const next = Object.assign({}, consent.data || {});
  for (const d of plan.consent_diff) next[d.key] = d.new;

  try {
    fs.mkdirSync(path.dirname(consent.file), { recursive: true }); // absent parent dirs, on confirmation only
    // Write-temp-then-rename, the protocol the lockfile and `export` already use here. A direct
    // `writeFileSync` TRUNCATES the destination first, so a failure part-way through would leave a
    // half-written consent record behind while the error path below reports it "unchanged" — the one
    // claim the refuse-rather-than-damage posture cannot afford to get wrong.
    const tmp = path.join(path.dirname(consent.file),
      '.' + CODEX_CONSENT_NAME + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
    try {
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
      fs.renameSync(tmp, consent.file); // replace-if-exists
    } catch (err) {
      try { fs.unlinkSync(tmp); } catch (_) { /* nothing staged, or already gone */ }
      throw err;
    }
  } catch (err) {
    return {
      action: 'refused', reason: 'consent-record-unwritable', consent_record: consent.file,
      message: 'ptp telemetry: ' + consent.file + ' could not be written (' + (err && err.code)
        + ') — it is unchanged and no Codex wiring is authorized.',
    };
  }
  return {
    action: 'written',
    consent_record: consent.file,
    created: !plan.consent_record_exists,
    keys_preserved: plan.other_keys_preserved,
    message: 'ptp telemetry: Codex telemetry consent recorded. ptp will append the -c otel.* wiring to the '
      + '`codex exec` invocations it constructs in this repository; the configuration is written but '
      + 'unverified end to end.',
  };
}

/**
 * The four read-only checks of §22.6. Reads `PATH` and files. Starts no Codex process, writes no
 * file, and prints no credential value — only match verdicts.
 */
function codexPreflight(ctx) {
  const paths = ctx.paths;
  const cfg = paths.cfg;

  // Resolved by a FILESYSTEM lookup along PATH, never by running `codex --version`. Two reasons, and
  // both are requirements rather than preferences: §22.6 says the preflight invokes Codex not at all
  // (the mode gate's `codex --version` probe is a different contract, in a different command), and a
  // spawn would miss `codex.cmd` on Windows and report a present CLI as absent.
  const cliPath = findOnPath('codex');
  const cliPresent = Boolean(cliPath);

  const consent = readCodexConsent(paths);
  const granted = codexConsentGranted(consent);
  const expectedLog = codexLogEndpoint(cfg.port);
  const credential = readCredential(paths);
  const recorded = (consent.data || {});

  // An absent CLI marks the remaining checks NOT APPLICABLE rather than erroring — but they are
  // still computed off files, so nothing about the report depends on having probed a process.
  const na = !cliPresent;
  const endpointOk = granted && recorded.log_endpoint === expectedLog;
  const fingerprintOk = granted && Boolean(credential)
    && recorded.credential_fingerprint === credentialFingerprint(credential);

  return {
    cli_on_path: { ok: cliPresent, path: cliPath || '' },
    configuration_present: {
      ok: granted, not_applicable: na, consent_record: consent.file, state: consent.state,
      advice: granted ? '' : (consent.state === 'absent'
        ? 'No Codex telemetry consent has been recorded for this repository, so ptp appends no wiring and Codex produces no rows — run `/ptp:telemetry setup` and confirm the Codex step.'
        : (codexConsentUnusable(consent)
          ? 'The Codex telemetry consent record exists but ptp cannot read it as a JSON object (' + consent.state
            + '), so no consent can be recognized and ptp appends no wiring. Fix the file by hand — `setup` refuses to overwrite it.'
          : 'The Codex telemetry consent record does not record consent, so ptp appends no wiring — re-run `/ptp:telemetry setup`.')),
    },
    endpoint: {
      ok: endpointOk, not_applicable: na, expected: expectedLog,
      recorded: granted ? (recorded.log_endpoint || '') : '',
      advice: !granted || endpointOk ? '' :
        'The authorized wiring points at ' + (recorded.log_endpoint || '(none)') + ' but telemetry.port now '
        + 'resolves to ' + cfg.port + ' — a port change after setup leaves a stale endpoint and Codex batches '
        + 'stop arriving with no error anywhere. Re-run `/ptp:telemetry setup`.',
    },
    credential: {
      // Match verdict only — NEITHER value is printed, mirroring the Claude-side credential verdict.
      ok: fingerprintOk, not_applicable: na,
      store_has_credential: Boolean(credential),
      advice: !credential
        ? 'This store has no ingestion credential, so the wiring can carry no ' + CREDENTIAL_HEADER
          + ' and the receiver rejects every batch before writing anything — run `/ptp:telemetry setup`.'
        : (!granted ? '' : (fingerprintOk ? ''
          : 'The store\'s ingestion credential is not the one the Codex consent was given against. Delivery is '
            + 'unaffected — the wiring reads the current credential — but the recorded consent is stale, so '
            + 're-run `/ptp:telemetry setup` to re-consent.')),
    },
    // Scoped honestly: all four checks read PATH and files and none observes a batch. §22.6 also
    // requires check 4's two states to be separated honestly, and the verdict is bound by that: a
    // FINGERPRINT MISMATCH with a credential present is not delivery-breaking — the wiring reads the
    // current credential — so a verdict of "rows will be absent" would contradict this very report's
    // own advice line above. What is stale there is the consent, and that is what it says.
    verdict: !cliPresent ? 'codex not on PATH — the remaining checks are not applicable'
      : (granted && endpointOk && fingerprintOk
        ? 'configured; delivery not verified'
        : (granted && endpointOk && Boolean(credential)
          ? 'configured, but the recorded consent is stale — the store credential changed since it was given; delivery not verified'
          : 'not fully configured — Codex rows will be absent')),
  };
}

/* ------------------------------------------------------------------ CLI */

function parseArgv(list) {
  const argv = { _: [] };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = list[i + 1];
      if (next === undefined || next.startsWith('--')) argv[key] = true;
      else { argv[key] = next; i++; }
    } else argv._.push(a);
  }
  return argv;
}

async function main() {
  const argv = parseArgv(process.argv.slice(2));
  const sub = argv._[0] || 'serve';
  const emit = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + '\n');

  switch (sub) {
    case 'serve':
      serve(argv);
      return;
    case 'start': {
      const ctx = await lifecycleContext(argv);
      emit(await startReceiver(ctx, argv['started-by'] === 'auto' ? 'auto' : 'manual'));
      return;
    }
    case 'stop': {
      const ctx = await lifecycleContext(argv);
      emit(await stopReceiver(ctx));
      return;
    }
    case 'status': {
      const ctx = await lifecycleContext(argv);
      emit(await statusReport(ctx));
      return;
    }
    case 'preamble':
      emit(await preamble(argv));
      return;
    case 'export': {
      // §12.2: `export` takes NO flag and NO argument. `--repo` is the internal path the skill
      // passes, so the guard is a whitelist — enumerating only `--rebuild` would let every other
      // misspelled or invented flag through and run a global re-derivation the user did not ask for.
      const strayFlags = Object.keys(argv).filter((k) => k !== '_' && k !== 'repo');
      if (argv._.length > 1 || strayFlags.length > 0) {
        emit({ action: 'refused', reason: 'arguments', message: 'ptp telemetry: `export` is global and takes no flag and no argument. Run `/ptp:telemetry export`.' });
        process.exitCode = 2;
        return;
      }
      emit(await runExport(argv));
      return;
    }
    case 'setup-plan':
      emit(setupPlan(argv));
      return;
    case 'setup-apply':
      emit(setupApply(argv));
      return;
    case 'codex-setup-plan':
      emit(codexSetupPlan(argv, false)); // writes NOTHING
      return;
    case 'codex-setup-apply':
      emit(codexSetupApply(argv)); // only after explicit confirmation of the Codex step
      return;
    default:
      process.stderr.write('ptp-otel-sink: unknown subcommand "' + sub + '"\n');
      process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write('ptp-otel-sink: ' + (err && err.stack ? err.stack : String(err)) + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  CSV_COLUMNS, deriveToolClass, jsonAttrField, projectSource, flattenTraces, flattenLogs,
  attributeRecords, buildLedgerIndex, resolveConfig, IDENTITY_PATH,
  // Codex telemetry (0032_06)
  CODEX_SERVICE_NAME, CODEX_CORRELATION_ATTR, CODEX_CONSENT_NAME, CODEX_CONSENT_MANAGED_KEYS,
  storePaths, codexWiringArgs, codexLogEndpoint, codexTraceEndpoint, credentialFingerprint,
  readCodexConsent, codexConsentGranted, codexSetupPlan, codexSetupApply, codexPreflight,
};
