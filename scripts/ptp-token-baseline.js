#!/usr/bin/env node
/**
 * ptp-token-baseline — the read-only token-reduction baseline tool.
 *
 * Normative contract: `openspec/specs/token-baseline/spec.md` (capability `token-baseline`).
 * Plain Node, zero dependencies, no network. Read-only over the repository: the ONLY file this tool
 * ever writes inside it is the record `capture` creates under `baselines/`. `--selftest`'s fixture
 * tree lives outside it, under `os.tmpdir()`, and is created and removed by the tool itself.
 *
 * Subcommands:
 *   corpus [--json]                              word counts for prompts and representative artifacts
 *   capture --name <n>                           writes baselines/<n>.json; never overwrites
 *   compare --before <r> --after <r> --scope <s> --out <r>   scoped attribution of a program epic
 *   verify <record-path>                         recomputes recorded counts; exit 1 on any drift
 *   --selftest                                   assertions over fixtures in a temp directory
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const USAGE = [
  'ptp-token-baseline — the read-only token-reduction baseline tool',
  '',
  'Usage:',
  '  node scripts/ptp-token-baseline.js corpus [--json]',
  '  node scripts/ptp-token-baseline.js capture --name <name>',
  '  node scripts/ptp-token-baseline.js compare --before <rec> --after <rec> --scope <scope.json> --out <rec>',
  '  node scripts/ptp-token-baseline.js verify <record-path>',
  '  node scripts/ptp-token-baseline.js --selftest',
].join('\n');

/* ------------------------------------------------------------------ tiny utils */

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(startDir || process.cwd());
    dir = up;
  }
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json' || a === '--selftest' || a === '--export-ran') { opts[a.slice(2)] = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) { opts[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      opts[a.slice(2)] = argv[i + 1] === undefined ? true : argv[i + 1];
      i += 1;
      continue;
    }
    opts._.push(a);
  }
  return opts;
}

/* ------------------------------------------------------------------ counting rule v1 */

/**
 * COUNTING_RULE is the version stamped into every record. A later comparison is valid only against
 * the same version: changing anything in this section requires bumping it and capturing a NEW
 * baseline, never re-counting an old one.
 */
const COUNTING_RULE = 1;

/** Steps 1–2: decode UTF-8, strip a leading BOM, normalize CRLF and lone CR to LF. */
function normalizeBytes(buf) {
  let text = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** Step 3: words are maximal runs of non-whitespace characters (equivalent to `wc -w`). */
function countWords(text) {
  const m = String(text).match(/\S+/g);
  return m === null ? 0 : m.length;
}

/**
 * Step 6: the hash is over the NORMALIZED form, deliberately. A pure line-ending or byte-order-mark
 * change is not content drift, so `verify` must not report one as such.
 */
function sha256Normalized(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/** Repo-relative, forward-slash-separated on every platform, so a Windows record verifies elsewhere. */
function relPath(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

/**
 * Step 4: the frontmatter is the block between a `---` on line 1 and the next line that is exactly
 * `---`. Returns `{ frontLines, body }` with `frontLines === null` when the file has none — in which
 * case the whole file is the body.
 */
function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { frontLines: null, body: text };
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---') {
      return { frontLines: lines.slice(1, i), body: lines.slice(i + 1).join('\n') };
    }
  }
  return { frontLines: null, body: text };
}

/**
 * Step 5: the `description` value, extracted by a PINNED rule rather than by a YAML library, so the
 * count is reconstructable without naming a parser version. Returns `null` when the frontmatter
 * carries no top-level `description` key.
 */
function extractDescription(frontLines) {
  if (frontLines === null) return null;
  let i = 0;
  for (; i < frontLines.length; i += 1) {
    if (/^description:[ \t]*/.test(frontLines[i])) break;
  }
  if (i >= frontLines.length) return null; // any nested or in-body `description:` is ignored
  let head = frontLines[i].replace(/^description:[ \t]*/, '');
  // A block scalar indicator (`|`/`>` with an optional indentation digit and chomping character)
  // carries no words of its own and is dropped. Newlines inside the value are whitespace like any
  // other, so the folded/literal distinction cannot change the count.
  if (/^[|>][0-9]*[-+]?$|^[|>][-+]?[0-9]*$/.test(head.trim())) head = '';
  const parts = [head];
  for (let j = i + 1; j < frontLines.length; j += 1) {
    const line = frontLines[j];
    if (line.length > 0 && !/^[ \t]/.test(line)) break; // a line at column 0 terminates the value
    parts.push(line);
  }
  let value = parts.join('\n').trim();
  if (value.length >= 2) {
    const first = value[0];
    if ((first === "'" || first === '"') && value[value.length - 1] === first) {
      value = value.slice(1, -1); // nothing else is unescaped
    }
  }
  return value;
}

/**
 * A prompt file (`commands/*.md`, `skills/<n>/SKILL.md`): description and body counted SEPARATELY,
 * because the routing surface and the loaded body are separately targeted by later slices. Every
 * other frontmatter key is counted in neither figure.
 */
function countPromptFile(repoRoot, absPath) {
  const text = normalizeBytes(fs.readFileSync(absPath));
  const { frontLines, body } = splitFrontmatter(text);
  const description = extractDescription(frontLines);
  return {
    path: relPath(repoRoot, absPath),
    sha256: sha256Normalized(text),
    descriptionWords: description === null ? 0 : countWords(description),
    bodyWords: countWords(body),
  };
}

/** A planning artifact: one plain word count over the whole normalized file. */
function countArtifactFile(repoRoot, absPath) {
  const text = normalizeBytes(fs.readFileSync(absPath));
  return {
    path: relPath(repoRoot, absPath),
    sha256: sha256Normalized(text),
    words: countWords(text),
    status: 'counted',
  };
}

/* ------------------------------------------------------------------ corpus */

/**
 * The FROZEN representative change set (design.md §3.3). One archived change per category, six
 * categories, each contributing the six recurring planning artifacts below. Spec deltas are
 * excluded, matching the analysis. A change appears in exactly one category. Changing this list
 * changes what the baseline represents, so it is never edited to make a capture pass.
 */
const REPRESENTATIVE_CHANGES = [
  { category: 'trivial', changePath: 'openspec/changes/archive/2026-08-23-0056_01_ptp-analyze-opus-high' },
  { category: 'standard', changePath: 'openspec/changes/archive/2026-08-05-0052_01_review-convergence-marker' },
  { category: 'cross-cutting', changePath: 'openspec/changes/archive/2026-08-09-0054_02_rename-review-markers-to-stages' },
  { category: 'migration', changePath: 'openspec/changes/archive/2026-08-02-0046_04_board-setup-docs-and-migration' },
  { category: 'security', changePath: 'openspec/changes/archive/2026-08-03-0050_01_retire-temp-file-body-admission' },
  { category: 'concurrency', changePath: 'openspec/changes/archive/2026-07-31-0044_01_telemetry-substrate-core' },
];

const RECURRING_ARTIFACTS = ['proposal.md', 'design.md', 'tasks.md', 'brainstorm.md', 'TLDR.md', 'effort.md'];

/**
 * The prompt surface, derived from the FILESYSTEM rather than from any environment variable or
 * manifest: every `commands/*.md`, and every `skills/<dir>/SKILL.md` for a directory that actually
 * holds one. Returned sorted, so a record is byte-stable across platforms.
 */
function enumeratePromptFiles(repoRoot) {
  const out = [];
  const commandsDir = path.join(repoRoot, 'commands');
  if (fs.existsSync(commandsDir)) {
    for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) out.push(path.join(commandsDir, entry.name));
    }
  }
  const skillsDir = path.join(repoRoot, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) out.push(skillFile);
    }
  }
  return out.sort((a, b) => (relPath(repoRoot, a) < relPath(repoRoot, b) ? -1 : 1));
}

/** The whole `corpus` block of the record schema (design.md §3.5), computed from `repoRoot`. */
function computeCorpus(repoRoot) {
  const prompts = enumeratePromptFiles(repoRoot).map((abs) => countPromptFile(repoRoot, abs));
  const changes = REPRESENTATIVE_CHANGES.map((spec) => {
    const artifacts = RECURRING_ARTIFACTS.map((name) => {
      const abs = path.join(repoRoot, spec.changePath, name);
      const rel = spec.changePath + '/' + name;
      // A missing file is recorded as `missing` and contributes NO zero to any total.
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { path: rel, status: 'missing' };
      const counted = countArtifactFile(repoRoot, abs);
      counted.path = rel;
      return counted;
    });
    const totalWords = artifacts.reduce((n, a) => (a.status === 'counted' ? n + a.words : n), 0);
    return { category: spec.category, changePath: spec.changePath, artifacts, totalWords };
  });
  const totals = {
    commandBodyWords: prompts.filter((p) => p.path.startsWith('commands/')).reduce((n, p) => n + p.bodyWords, 0),
    skillBodyWords: prompts.filter((p) => p.path.startsWith('skills/')).reduce((n, p) => n + p.bodyWords, 0),
    descriptionWords: prompts.reduce((n, p) => n + p.descriptionWords, 0),
    artifactWords: changes.reduce((n, c) => n + c.totalWords, 0),
  };
  return { prompts, changes, totals };
}

/** How many of the six representative changes have no artifact present at all. */
function missingRepresentativeChanges(corpus) {
  return corpus.changes.filter((c) => c.artifacts.every((a) => a.status === 'missing')).map((c) => c.category);
}

function cmdCorpus(opts, repoRoot) {
  const corpus = computeCorpus(repoRoot);
  if (opts.json) {
    process.stdout.write(JSON.stringify(corpus, null, 2) + '\n');
    return 0;
  }
  const missing = corpus.changes.reduce(
    (n, c) => n + c.artifacts.filter((a) => a.status === 'missing').length, 0);
  process.stdout.write([
    'prompts:            ' + corpus.prompts.length,
    'command body words: ' + corpus.totals.commandBodyWords,
    'skill body words:   ' + corpus.totals.skillBodyWords,
    'description words:  ' + corpus.totals.descriptionWords,
    'artifact words:     ' + corpus.totals.artifactWords,
    'missing artifacts:  ' + missing,
    '',
  ].join('\n'));
  return 0;
}

/* ------------------------------------------------------------------ capture */

const RECORD_SCHEMA = 2;
const BASELINES_DIR = 'baselines';
const PROXY_METRIC = 'corpus.totals';
const PENDING_REASON = 'ptp no longer records telemetry; the word proxy (corpus.totals) is the operative metric';

/** Read-only. A failure records `gitRef: null` rather than failing the capture. */
function gitRef(repoRoot) {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // git's own diagnostics are not this tool's output
    });
    return String(out).trim() || null;
  } catch (_) {
    return null;
  }
}

function buildRecord(ctx) {
  const corpus = computeCorpus(ctx.repoRoot);
  const telemetry = { status: 'pending', reason: PENDING_REASON };
  return {
    schema: RECORD_SCHEMA,
    name: ctx.name,
    frozen: true,
    capturedAt: new Date().toISOString(),
    gitRef: gitRef(ctx.repoRoot),
    countingRule: COUNTING_RULE,
    telemetry,
    corpus,
    proxyMetric: PROXY_METRIC,
  };
}

/**
 * The tool's ONE write. Returns `{ code, message, path }` and writes at most one file.
 *
 * The already-exists refusal is enforced by an EXCLUSIVE CREATE, never by a check-then-write: two
 * captures racing on one name would otherwise both observe an absent target and the second would
 * clobber the first. An `EEXIST` from that create IS the refusal path (design.md §3.6 invariant 1).
 */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function doCapture(ctx) {
  const baselinesDir = path.resolve(ctx.repoRoot, BASELINES_DIR);
  // Refusal 1, BEFORE any directory is created: `<name>` is a bare basename. The tool's one write is
  // guaranteed to land under `baselines/`, and that guarantee is only as strong as the name it is
  // given — `--name ../outside` would otherwise escape the directory the invariant names.
  if (typeof ctx.name !== 'string' || !NAME_PATTERN.test(ctx.name)) {
    return { code: 1, message: 'refusing: --name must match ' + String(NAME_PATTERN) + ' (a bare basename), got ' + JSON.stringify(ctx.name) };
  }
  const target = path.resolve(baselinesDir, ctx.name + '.json');
  // Belt and braces: the resolved target's parent must BE the resolved `baselines/` directory.
  if (path.dirname(target) !== baselinesDir) {
    return { code: 1, message: 'refusing: the resolved target escapes ' + baselinesDir + ' (' + target + ')' };
  }
  const record = buildRecord(ctx);
  // Refusal 2: a corpus missing two or more categories no longer represents the named change set.
  const absent = missingRepresentativeChanges(record.corpus);
  if (absent.length >= 2) {
    return { code: 1, message: 'refusing: ' + absent.length + ' of the six representative changes are missing locally (' + absent.join(', ') + ')' };
  }
  fs.mkdirSync(baselinesDir, { recursive: true });
  try {
    fs.writeFileSync(target, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return { code: 1, message: 'a baseline record already exists and is frozen: ' + target, path: target };
    }
    return { code: 1, message: 'could not write ' + target + ' (' + (err && err.message) + ')', path: target };
  }
  return { code: 0, message: 'wrote ' + target, path: target, record };
}

function cmdCapture(opts, repoRoot) {
  // The telemetry-window flags are retired. They are REFUSED by name rather than ignored, so a caller
  // never believes a record was windowed or sourced from a store it never read.
  for (const flag of ['from', 'to', 'root', 'export-ran']) {
    if (opts[flag] !== undefined) {
      process.stderr.write('ptp-token-baseline: capture no longer accepts --' + flag + ' (ptp no longer records telemetry); use --name only\n');
      return 1;
    }
  }
  if (typeof opts.name !== 'string' || opts.name === '') {
    process.stderr.write('ptp-token-baseline: capture requires --name <name>\n');
    return 1;
  }
  const res = doCapture({ repoRoot, name: opts.name });
  process.stdout.write('ptp-token-baseline: ' + res.message + '\n');
  return res.code;
}

/* ------------------------------------------------------------------ verify */

/**
 * `verify` compares each entry against the STATE that was recorded for it, not against mere
 * presence (design.md §3.5a). A record legitimately carries `missing` entries, so a freshly
 * captured record always verifies clean.
 *
 *   recorded `counted` → `matching` when present with the same SHA-256 and counts
 *                        `changed`  when present with different NORMALIZED bytes or a different count
 *                        `missing`  when it has disappeared
 *   recorded `missing` → `matching` when still absent
 *                        `changed`  when it has since appeared
 *
 * "Changed" is always over the normalized form, so a pure CRLF or BOM change is not drift. Nothing
 * here writes: the record is read and never rewritten, whatever the verdict.
 */
/**
 * Every recorded path must be what `capture` writes: repo-relative, forward-slash-separated, and
 * resolving strictly below the repository root (counting rule step 6).
 *
 * `verify` reads a record it did not necessarily write — its argument is any JSON file a caller
 * names — so a recorded path is untrusted input. Without this test an absolute path or a `../`
 * segment would carry the tool's reads outside the repository and let a crafted record present
 * external content as a matching baseline entry. This is the read-side counterpart of §3.5a's
 * `--name` rule, which already refuses to let the tool's one WRITE escape `baselines/`; leaving the
 * read side unguarded is the asymmetry this closes.
 */
function isSafeRecordedPath(repoRoot, recordedPath) {
  if (typeof recordedPath !== 'string' || recordedPath === '') return false;
  if (path.isAbsolute(recordedPath) || /^[a-zA-Z]:/.test(recordedPath) || recordedPath.startsWith('\\\\')) return false;
  if (recordedPath.split(/[\\/]+/).some((seg) => seg === '..')) return false;
  const rel = path.relative(repoRoot, path.resolve(repoRoot, recordedPath));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function verifyRecord(repoRoot, record) {
  const entries = [];
  const check = (recorded, kind) => {
    // Refused before any filesystem call, so an unsafe path is never even probed for existence.
    if (!isSafeRecordedPath(repoRoot, recorded.path)) {
      entries.push({
        path: String(recorded.path),
        recorded: recorded.status === 'missing' ? 'missing' : 'counted',
        verdict: 'unsafe-path',
      });
      return;
    }
    const abs = path.resolve(repoRoot, recorded.path);
    const present = fs.existsSync(abs) && fs.statSync(abs).isFile();
    if (recorded.status === 'missing') {
      entries.push({ path: recorded.path, recorded: 'missing', verdict: present ? 'changed' : 'matching' });
      return;
    }
    if (!present) {
      entries.push({ path: recorded.path, recorded: 'counted', verdict: 'missing' });
      return;
    }
    const actual = kind === 'prompt' ? countPromptFile(repoRoot, abs) : countArtifactFile(repoRoot, abs);
    const sameHash = actual.sha256 === recorded.sha256;
    const sameCount = kind === 'prompt'
      ? actual.descriptionWords === recorded.descriptionWords && actual.bodyWords === recorded.bodyWords
      : actual.words === recorded.words;
    entries.push({
      path: recorded.path,
      recorded: 'counted',
      verdict: sameHash && sameCount ? 'matching' : 'changed',
    });
  };

  const corpus = (record && record.corpus) || {};
  for (const p of corpus.prompts || []) check(Object.assign({ status: 'counted' }, p), 'prompt');
  for (const c of corpus.changes || []) for (const a of c.artifacts || []) check(a, 'artifact');

  return { entries, ok: entries.every((e) => e.verdict === 'matching') };
}

function cmdVerify(opts, repoRoot) {
  const target = opts._[1];
  if (typeof target !== 'string' || target === '') {
    process.stderr.write('ptp-token-baseline: verify requires a record path\n');
    return 1;
  }
  let record;
  try {
    record = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), target), 'utf8'));
  } catch (err) {
    process.stderr.write('ptp-token-baseline: could not read record ' + target + ' (' + (err && err.message) + ')\n');
    return 1;
  }
  if (record.countingRule !== COUNTING_RULE) {
    process.stderr.write('ptp-token-baseline: record countingRule ' + record.countingRule
      + ' is not this tool\'s rule ' + COUNTING_RULE + ' — a recorded count is never re-computed under a different rule\n');
    return 1;
  }
  const result = verifyRecord(repoRoot, record);
  const drift = result.entries.filter((e) => e.verdict !== 'matching');
  for (const e of drift) process.stdout.write(e.verdict + ' ' + e.path + ' (recorded ' + e.recorded + ')\n');
  process.stdout.write('verify: ' + (result.entries.length - drift.length) + '/' + result.entries.length
    + ' entries matching' + (drift.length === 0 ? '' : ', ' + drift.length + ' drifted') + '\n');
  return result.ok ? 0 : 1;
}

/* ------------------------------------------------------------------ compare (scoped attribution) */

/**
 * `compare` attributes a program epic's word delta to the surfaces that epic changed.
 *
 * Normative contract: the `token-baseline` capability, requirement "A scoped comparison attributes a
 * program epic's word delta to the surfaces that epic changed". It lives in THIS tool, beside
 * `capture` and `corpus`, so `COUNTING_RULE` keeps exactly one owner and no second word-counting
 * implementation exists.
 *
 *   compare --before <record.json> --after <record.json> --scope <scope.json> --out <record.json>
 *
 * The scope list classifies every path it names as `b2` (changed only by the measured epic),
 * `shared` (changed by that epic AND another epic of the same program), or `external` (a file
 * outside the repository whose loading the epic removes). It MAY also carry named metadata that is
 * not a path classification; exactly one such key is defined — `programBaseline`, the pinned
 * `--before` record path — and metadata is ignored when classifying rather than reported as an
 * unclassified path or a scope defect.
 */
const COMPARISON_SCHEMA = 1;
const SCOPE_CLASSES = ['b2', 'shared', 'external'];
const SCOPE_METADATA_KEYS = ['programBaseline'];

/** The class of a scope entry, which may be the bare literal or an object carrying `class`. */
function scopeClassOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.class === 'string') return value.class;
  return null;
}

/**
 * A captured record indexed by path. A prompt entry's word count is its description plus its body:
 * the two are counted separately for the prompt-surface budgets, but an attribution figure is over
 * the whole file. A `missing` entry stays `missing` — it never becomes a zero.
 */
function indexRecord(record) {
  const byPath = new Map();
  const corpus = (record && record.corpus) || {};
  for (const p of corpus.prompts || []) {
    byPath.set(p.path, { status: 'counted', words: (p.descriptionWords || 0) + (p.bodyWords || 0) });
  }
  for (const c of corpus.changes || []) {
    for (const a of c.artifacts || []) {
      byPath.set(a.path, a.status === 'missing' ? { status: 'missing' } : { status: 'counted', words: a.words || 0 });
    }
  }
  return byPath;
}

/**
 * One in-repository path's before/after state.
 *
 * A path counted in `--after` and either absent from `--before` or carried there as `missing` is
 * `added` — a file that did not exist at the before-record's capture is a cost of the measured epic,
 * and those two forms of not-existing are equivalent for attribution. Symmetrically for `removed`.
 * Only a path carried as `missing` in BOTH records propagates as `missing`, contributing to no
 * total rather than a zero. A path in neither record is a scope defect: reported, never dropped.
 */
function comparePath(p, beforeIdx, afterIdx) {
  const b = beforeIdx.get(p) || null;
  const a = afterIdx.get(p) || null;
  const bCounted = b !== null && b.status === 'counted';
  const aCounted = a !== null && a.status === 'counted';
  if (bCounted && aCounted) {
    return { path: p, state: 'counted', before: b.words, after: a.words, delta: a.words - b.words };
  }
  if (aCounted) return { path: p, state: 'added', before: null, after: a.words, delta: a.words };
  if (bCounted) return { path: p, state: 'removed', before: b.words, after: null, delta: -b.words };
  if (b !== null || a !== null) return { path: p, state: 'missing', before: null, after: null, delta: null };
  return { path: p, state: 'absent-from-both', before: null, after: null, delta: null };
}

/** `~/x` resolves against the running user's home directory; every other form is used verbatim. */
function resolveExternalPath(p) {
  if (typeof p !== 'string' || p === '') return null;
  if (p === '~') return os.homedir();
  if (p.slice(0, 2) === '~/') return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * An `external` path lies outside the repository, so it is in neither captured record and its counts
 * are NEVER derived from them: it is read at comparison time, under the same counting rule. Its
 * direction is supplied explicitly — PTP loaded the body before and does not after — which is what
 * makes the number a saving rather than an unlabelled count. An unreadable body is `unavailable`
 * with its reason and contributes to no total; it is never recorded as 0.
 */
function measureExternal(p) {
  const abs = resolveExternalPath(p);
  if (abs === null) {
    return { path: p, status: 'unavailable', before: null, after: null, delta: null, reason: 'not a usable path' };
  }
  let text;
  try {
    text = normalizeBytes(fs.readFileSync(abs));
  } catch (err) {
    return {
      path: p,
      status: 'unavailable',
      before: null,
      after: null,
      delta: null,
      reason: 'not readable on this machine (' + ((err && err.code) || (err && err.message) || 'unknown error') + ')',
    };
  }
  const words = countWords(text);
  return { path: p, status: 'measured', before: words, after: 0, delta: -words };
}

/**
 * The whole comparison, as a pure function of two records, a scope list, and a reader for external
 * bodies (injected so the selftest can exercise an unreadable body without depending on the
 * measuring machine). Returns `{ error }` for a refusal or `{ record }` for a result.
 */
function computeComparison(ctx) {
  const before = ctx.beforeRecord;
  const after = ctx.afterRecord;
  // PRESENCE before equality, deliberately. `undefined !== undefined` is false, so an equality-only
  // guard passes two records that each carry NO rule at all — and the record would then be written
  // with `countingRule: undefined`, which JSON.stringify DROPS, publishing a frozen comparison that
  // carries no counting rule. The capability requires the written record to carry "the countingRule
  // both records were produced under", so a record that cannot name its rule is refused, not written.
  for (const side of [{ label: '--before', rec: before }, { label: '--after', rec: after }]) {
    const rule = side.rec.countingRule;
    if (typeof rule !== 'number' || !Number.isFinite(rule)) {
      return {
        error: 'refusing: the ' + side.label + ' record carries no usable countingRule ('
          + JSON.stringify(rule) + ') — a comparison that cannot name the rule its inputs were '
          + 'produced under is never presented as a result',
      };
    }
  }
  if (before.countingRule !== after.countingRule) {
    return {
      error: 'refusing: the two records were produced under different counting rules ('
        + JSON.stringify(before.countingRule) + ' vs ' + JSON.stringify(after.countingRule)
        + ') — a cross-rule difference is never presented as a result',
    };
  }
  const scope = ctx.scope;
  const beforeIdx = indexRecord(before);
  const afterIdx = indexRecord(after);
  const measure = ctx.measureExternal || measureExternal;

  const headlineFiles = [];
  const excluded = [];
  const externalEntries = [];
  const missing = [];
  const scopeDefects = [];
  const unclassified = [];

  for (const key of Object.keys(scope)) {
    if (SCOPE_METADATA_KEYS.indexOf(key) !== -1) continue; // metadata, not a classified path
    const cls = scopeClassOf(scope[key]);
    if (SCOPE_CLASSES.indexOf(cls) === -1) { unclassified.push({ path: key, value: scope[key] }); continue; }
    if (cls === 'external') { externalEntries.push(measure(key)); continue; }
    const entry = comparePath(key, beforeIdx, afterIdx);
    if (entry.state === 'absent-from-both') {
      scopeDefects.push({
        path: key,
        class: cls,
        reason: 'named by the scope list but present in neither captured record',
      });
      // A shared path is reported individually as excluded WHATEVER its state: the duty to name
      // every shared path beside the headline is unconditional, and a shared path in neither
      // record is both excluded (it never enters the headline) and a scope defect. Its counts stay
      // null — no absent value becomes a zero. A b2 path in neither record is only a defect: there
      // is no figure it could enter.
      if (cls === 'shared') excluded.push(Object.assign({ class: 'shared' }, entry));
      continue;
    }
    if (entry.state === 'missing') missing.push(key);
    if (cls === 'shared') excluded.push(Object.assign({ class: 'shared' }, entry));
    else headlineFiles.push(entry);
  }

  const sum = (rows) => rows.reduce((n, r) => (typeof r.delta === 'number' ? n + r.delta : n), 0);
  const externalMeasured = externalEntries.filter((e) => e.status === 'measured');
  const externalStatus = externalEntries.length === 0
    ? 'none'
    : externalMeasured.length === externalEntries.length
      ? 'measured'
      : externalMeasured.length === 0 ? 'unavailable' : 'partial';

  return {
    record: {
      schema: COMPARISON_SCHEMA,
      kind: 'comparison',
      frozen: true,
      comparedAt: new Date().toISOString(),
      gitRef: gitRef(ctx.repoRoot),
      countingRule: before.countingRule,
      sources: { before: ctx.beforeSource, after: ctx.afterSource },
      // The headline is the sum over `b2` paths ONLY. A saving another epic produced is
      // structurally unavailable to it: `shared` paths are reported individually below and are
      // never split, prorated, or estimated between the epics.
      headline: {
        scope: 'b2',
        total: sum(headlineFiles),
        files: headlineFiles.length,
        added: headlineFiles.filter((f) => f.state === 'added').length,
        removed: headlineFiles.filter((f) => f.state === 'removed').length,
        entries: headlineFiles,
      },
      excluded,
      // Reported BESIDE the in-repository headline and never added into it: a saving outside the
      // repository would otherwise inflate a figure the scope list defines over repository files.
      external: {
        status: externalStatus,
        total: sum(externalMeasured),
        measured: externalMeasured.length,
        unavailable: externalEntries.length - externalMeasured.length,
        entries: externalEntries,
      },
      missing,
      scopeDefects,
      unclassified,
    },
  };
}

/**
 * `compare`'s own reader. It returns `{ raw, value }` on success and `{ error }` on failure:
 * `compare` needs the raw
 * bytes for the source digest, and needs a refusal message rather than an indistinguishable `null`.
 */
function readJsonRecordFile(p) {
  try {
    const raw = fs.readFileSync(p);
    return { raw, value: JSON.parse(raw.toString('utf8')) };
  } catch (err) {
    return { error: 'could not read ' + p + ' (' + (err && err.message) + ')' };
  }
}

function cmdCompare(opts, repoRoot) {
  for (const flag of ['before', 'after', 'scope', 'out']) {
    if (typeof opts[flag] !== 'string' || opts[flag] === '') {
      process.stderr.write('ptp-token-baseline: compare requires --before, --after, --scope and --out\n');
      return 1;
    }
  }
  const beforePath = path.resolve(process.cwd(), opts.before);
  const afterPath = path.resolve(process.cwd(), opts.after);
  const scopePath = path.resolve(process.cwd(), opts.scope);
  const outPath = path.resolve(process.cwd(), opts.out);

  const beforeRead = readJsonRecordFile(beforePath);
  const afterRead = readJsonRecordFile(afterPath);
  const scopeRead = readJsonRecordFile(scopePath);
  for (const r of [beforeRead, afterRead, scopeRead]) {
    if (r.error) { process.stderr.write('ptp-token-baseline: ' + r.error + '\n'); return 1; }
  }
  // Refused BEFORE any work, exactly as `capture` refuses an existing record: a comparison record is
  // frozen, and re-deriving one in place would silently restate a published figure.
  if (fs.existsSync(outPath)) {
    process.stderr.write('ptp-token-baseline: a comparison record already exists and is frozen: ' + outPath + '\n');
    return 1;
  }
  const res = computeComparison({
    repoRoot,
    beforeRecord: beforeRead.value,
    afterRecord: afterRead.value,
    scope: scopeRead.value,
    beforeSource: {
      name: beforeRead.value.name || path.basename(beforePath),
      path: relPath(repoRoot, beforePath),
      digest: sha256Normalized(beforeRead.raw.toString('utf8')),
    },
    afterSource: {
      name: afterRead.value.name || path.basename(afterPath),
      path: relPath(repoRoot, afterPath),
      digest: sha256Normalized(afterRead.raw.toString('utf8')),
    },
  });
  if (res.error) { process.stderr.write('ptp-token-baseline: ' + res.error + '\n'); return 1; }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  try {
    fs.writeFileSync(outPath, JSON.stringify(res.record, null, 2) + '\n', { flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      process.stderr.write('ptp-token-baseline: a comparison record already exists and is frozen: ' + outPath + '\n');
      return 1;
    }
    process.stderr.write('ptp-token-baseline: could not write ' + outPath + ' (' + (err && err.message) + ')\n');
    return 1;
  }
  const r = res.record;
  process.stdout.write([
    'wrote ' + outPath,
    'headline (b2 only): ' + r.headline.total + ' words over ' + r.headline.files + ' file(s)',
    'excluded (shared):  ' + r.excluded.length + ' file(s)',
    'external:           ' + r.external.status + ', total ' + r.external.total
      + ' (' + r.external.measured + ' measured, ' + r.external.unavailable + ' unavailable)',
    'scope defects:      ' + r.scopeDefects.length,
    '',
  ].join('\n'));
  // A scope defect is REPORTED, never silently dropped — and never fatal: the in-repository result
  // it accompanies is still a valid figure for every path that both records do carry.
  for (const d of r.scopeDefects) process.stderr.write('scope defect: ' + d.path + ' — ' + d.reason + '\n');
  return 0;
}

/* ------------------------------------------------------------------ selftest harness */

/**
 * The tool's only automated check. Every assertion runs against a fixture tree the harness creates
 * under `os.tmpdir()` — outside the repository, the one exception
 * the capability's write-scope rule allows — and removes again on the way out, including on failure.
 * Assertions run in order, the run stops at the first failure, and the tree is removed either way.
 */
class AssertionFailure extends Error {}

function makeSelftestContext() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptp-token-baseline-'));
  let passed = 0;
  return {
    dir,
    passed: () => passed,
    /** Create a fixture file from raw bytes or a string, making parents as needed. */
    write(rel, data) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      return target;
    },
    ok(name, cond, detail) {
      if (cond) {
        passed += 1;
        process.stdout.write('ok   ' + name + '\n');
        return;
      }
      process.stdout.write('FAIL ' + name + (detail === undefined ? '' : ' — ' + detail) + '\n');
      throw new AssertionFailure(name);
    },
    eq(name, actual, expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      this.ok(name, a === e, 'got ' + a + ', want ' + e);
    },
  };
}

/**
 * A sorted path+size+sha256 manifest of every file under `dir`, used by the selftest to assert that
 * a refused capture created nothing ANYWHERE under the fixture root — not merely that the named
 * target is absent.
 */
function fileInventory(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.isFile()) continue;
      out.push(p.split(path.sep).join('/') + ':' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
    }
  };
  walk(dir);
  return out.sort();
}

const SELFTESTS = [
  function countingRuleBom(t) {
    const lf = t.write('count/plain.md', Buffer.from('alpha beta gamma\n', 'utf8'));
    const bom = t.write('count/bom.md', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('alpha beta gamma\n', 'utf8')]));
    const a = countPromptFile(t.dir, lf);
    const b = countPromptFile(t.dir, bom);
    t.eq('1.3 BOM is stripped before counting', b.bodyWords, 3);
    t.eq('1.3 BOM does not change the normalized hash', b.sha256, a.sha256);
  },

  function countingRuleCrlf(t) {
    const lf = t.write('count/lf.md', Buffer.from('one two\nthree four\n', 'utf8'));
    const crlf = t.write('count/crlf.md', Buffer.from('one two\r\nthree four\r\n', 'utf8'));
    const cr = t.write('count/cr.md', Buffer.from('one two\rthree four\r', 'utf8'));
    const a = countPromptFile(t.dir, lf);
    const b = countPromptFile(t.dir, crlf);
    const c = countPromptFile(t.dir, cr);
    t.eq('1.3 a CRLF file counts the same as its LF twin', b.bodyWords, a.bodyWords);
    t.eq('1.3 a CRLF file hashes the same as its LF twin', b.sha256, a.sha256);
    t.eq('1.3 a lone-CR file counts the same as its LF twin', c.bodyWords, a.bodyWords);
  },

  function countingRuleFrontmatter(t) {
    const f = t.write('count/fm.md', [
      '---',
      'name: sample',
      'description: alpha beta gamma',
      'allowed-tools: Bash, Read',
      '---',
      '',
      'body one two three',
      '',
    ].join('\n'));
    const r = countPromptFile(t.dir, f);
    t.eq('1.3 frontmatter description is counted separately', r.descriptionWords, 3);
    t.eq('1.3 frontmatter body is counted separately', r.bodyWords, 4);
  },

  function countingRuleNoFrontmatter(t) {
    const f = t.write('count/nofm.md', 'just a body with six words\n');
    const r = countPromptFile(t.dir, f);
    t.eq('1.3 a file with no frontmatter has descriptionWords 0', r.descriptionWords, 0);
    t.eq('1.3 a file with no frontmatter counts its whole text as body', r.bodyWords, 6);
  },

  function countingRuleFrontmatterWithoutDescription(t) {
    const f = t.write('count/fm-nodesc.md', ['---', 'name: sample', '---', 'body words here', ''].join('\n'));
    const r = countPromptFile(t.dir, f);
    t.eq('1.3 frontmatter with no description key has descriptionWords 0', r.descriptionWords, 0);
    t.eq('1.3 frontmatter keys are counted in neither figure', r.bodyWords, 3);
  },

  function countingRuleDescriptionForms(t) {
    const forms = {
      bare: ['---', 'description: alpha beta gamma delta', 'name: x', '---', 'body', ''],
      single: ['---', "description: 'alpha beta gamma delta'", 'name: x', '---', 'body', ''],
      double: ['---', 'description: "alpha beta gamma delta"', 'name: x', '---', 'body', ''],
      folded: ['---', 'description: >', '  alpha beta', '  gamma delta', 'name: x', '---', 'body', ''],
      literal: ['---', 'description: |', '  alpha beta', '  gamma delta', 'name: x', '---', 'body', ''],
    };
    const counts = {};
    for (const key of Object.keys(forms)) {
      const f = t.write('count/desc-' + key + '.md', forms[key].join('\n'));
      counts[key] = countPromptFile(t.dir, f).descriptionWords;
    }
    t.eq('1.3 all five description spellings yield the same descriptionWords', counts,
      { bare: 4, single: 4, double: 4, folded: 4, literal: 4 });
  },

  function countingRuleNestedDescriptionIgnored(t) {
    const f = t.write('count/desc-nested.md', [
      '---',
      'meta:',
      '  description: nested value ignored entirely',
      '---',
      'body words',
      '',
    ].join('\n'));
    t.eq('1.3 a nested description: is ignored', countPromptFile(t.dir, f).descriptionWords, 0);
  },

  function countingRuleWcEquivalence(t) {
    // 9 + 8 + 2 = 19 words, written out literally so the expectation is independent of the code.
    const f = t.write('count/wc.md', [
      'The quick brown fox jumps over the lazy dog.',
      'Pack my box with five dozen liquor jugs.',
      '\t alpha\tbeta   ',
      '',
    ].join('\n'));
    t.eq('1.4 wc -w equivalence on a literally-counted fixture', countPromptFile(t.dir, f).bodyWords, 19);
  },

  function countingRuleHashStability(t) {
    const f = t.write('count/hash.md', 'stable bytes here\n');
    const a = countPromptFile(t.dir, f).sha256;
    const b = countPromptFile(t.dir, f).sha256;
    t.ok('1.4 sha256 is stable across two calls on the same bytes', a === b, a + ' vs ' + b);
    t.ok('1.4 sha256 is a 64-hex digest', /^[0-9a-f]{64}$/.test(a), a);
  },

  function corpusOverFixtureRoot(t) {
    const root = path.join(t.dir, 'repo-corpus');
    t.write('repo-corpus/commands/sample.md', ['---', 'description: one two three', '---', 'a b c d', ''].join('\n'));
    t.write('repo-corpus/skills/thing/SKILL.md', ['---', 'description: four five', '---', 'x y', ''].join('\n'));
    // The trivial change gets five of its six artifacts: `design.md` is deliberately absent.
    const trivial = REPRESENTATIVE_CHANGES[0].changePath;
    for (const name of RECURRING_ARTIFACTS) {
      if (name === 'design.md') continue;
      t.write(path.join('repo-corpus', trivial, name), 'alpha beta\n'); // 2 words each
    }
    const c = computeCorpus(root);

    const sample = c.prompts.find((p) => p.path === 'commands/sample.md');
    t.eq('2.2 a fixture prompt yields both counts',
      { d: sample.descriptionWords, b: sample.bodyWords }, { d: 3, b: 4 });
    t.eq('2.2 fixture totals split command and skill bodies',
      { cmd: c.totals.commandBodyWords, skill: c.totals.skillBodyWords, desc: c.totals.descriptionWords },
      { cmd: 4, skill: 2, desc: 5 });

    const tri = c.changes.find((x) => x.category === 'trivial');
    const missing = tri.artifacts.filter((a) => a.status === 'missing');
    t.eq('2.2 a change missing design.md yields exactly one missing artifact', missing.length, 1);
    t.eq('2.2 the missing artifact is design.md', missing[0].path, trivial + '/design.md');
    t.ok('2.2 a missing artifact carries no fabricated word count',
      !Object.prototype.hasOwnProperty.call(missing[0], 'words'), JSON.stringify(missing[0]));
    t.eq('2.2 the change total omits the missing artifact', tri.totalWords, 10);

    const allowed = ['trivial', 'standard', 'cross-cutting', 'migration', 'security', 'concurrency'];
    t.eq('2.2 every category name is one of the six',
      c.changes.map((x) => x.category).filter((x) => allowed.indexOf(x) === -1), []);
    t.eq('2.2 all six categories are present', c.changes.length, 6);
  },

  function captureRefusalsAndDegradation(t) {
    const root = path.join(t.dir, 'repo-capture');
    // Five of the six representative changes present, so the depleted-corpus refusal does not fire.
    REPRESENTATIVE_CHANGES.slice(0, 5).forEach((spec) => {
      t.write(path.join('repo-capture', spec.changePath, 'proposal.md'), 'alpha beta gamma\n');
    });
    const base = { repoRoot: root };

    // Degradation: no attributed rows ⇒ pending, corpus complete, exit 0.
    const pending = doCapture(Object.assign({}, base, { name: 'pending-one' }));
    t.eq('4.2 a window with no attributed rows still captures (exit 0)', pending.code, 0);
    t.eq('4.2 that record is pending', pending.record.telemetry.status, 'pending');
    t.eq('4.2 that record carries schema 2', pending.record.schema, 2);
    t.ok('4.2 that record carries no window', !Object.prototype.hasOwnProperty.call(pending.record, 'window'));
    t.eq('4.2 the telemetry block is exactly status and reason', Object.keys(pending.record.telemetry).sort(), ['reason', 'status']);
    t.ok('4.2 that record carries a non-empty reason',
      typeof pending.record.telemetry.reason === 'string' && pending.record.telemetry.reason.length > 0,
      String(pending.record.telemetry.reason));
    t.eq('4.2 the pending record still carries all six corpus categories', pending.record.corpus.changes.length, 6);

    // Refusal: the target already exists — enforced by the exclusive create.
    const before = fs.readFileSync(pending.path);
    const again = doCapture(Object.assign({}, base, { name: 'pending-one' }));
    t.eq('4.2 a second capture under the same name is refused', again.code, 1);
    t.ok('4.2 the refusal names the existing record', /pending-one\.json/.test(again.message), again.message);
    t.ok('4.2 the refused capture left the record byte-identical', before.equals(fs.readFileSync(pending.path)));

    // Refusal: an unsafe name writes nothing anywhere under the fixture root.
    for (const bad of ['../escape', 'a/b', '..', '.hidden', 'a\\b', '']) {
      const inventory = fileInventory(t.dir);
      const r = doCapture(Object.assign({}, base, { name: bad }));
      t.eq('4.2 --name ' + JSON.stringify(bad) + ' is refused', r.code, 1);
      t.eq('4.2 --name ' + JSON.stringify(bad) + ' created no file under the fixture root',
        fileInventory(t.dir), inventory);
    }

    // Refusal: two or more representative changes missing.
    const depleted = path.join(t.dir, 'repo-depleted');
    t.write('repo-depleted/keep.md', 'x\n');
    const inv = fileInventory(depleted);
    const r = doCapture(Object.assign({}, base, { repoRoot: depleted, name: 'depleted' }));
    t.eq('4.2 a depleted representative set is refused', r.code, 1);
    t.eq('4.2 the depleted refusal wrote nothing', fileInventory(depleted), inv);
  },

  function verifyComparesRecordedState(t) {
    const root = path.join(t.dir, 'repo-verify');
    const promptRel = 'commands/sample.md';
    t.write(path.join('repo-verify', promptRel), ['---', 'description: one two three', '---', 'a b c d', ''].join('\n'));
    // Five representative changes present with `proposal.md` only, so every OTHER artifact of each is
    // recorded `missing` — exactly the shape a real record carries.
    REPRESENTATIVE_CHANGES.slice(0, 5).forEach((spec) => {
      t.write(path.join('repo-verify', spec.changePath, 'proposal.md'), 'alpha beta gamma\n');
    });
    const cap = doCapture({ repoRoot: root, name: 'verify-fixture' });
    t.eq('4.3 the verify fixture captured', cap.code, 0);
    const recordBytes = fs.readFileSync(cap.path);
    const record = JSON.parse(recordBytes.toString('utf8'));
    t.ok('4.3 the record carries at least one missing entry',
      record.corpus.changes.some((c) => c.artifacts.some((a) => a.status === 'missing')));

    t.ok('4.3 a freshly captured record verifies clean, missing entries included',
      verifyRecord(root, record).ok);

    // A counted file rewritten with CRLF and a BOM but the same words is NOT drift.
    const promptAbs = path.join(root, promptRel);
    const original = fs.readFileSync(promptAbs);
    fs.writeFileSync(promptAbs, Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(original.toString('utf8').replace(/\n/g, '\r\n'), 'utf8'),
    ]));
    t.ok('4.3 a pure CRLF+BOM rewrite still verifies as matching', verifyRecord(root, record).ok);
    fs.writeFileSync(promptAbs, original);

    // counted → changed
    fs.writeFileSync(promptAbs, ['---', 'description: one two three', '---', 'a b c d e', ''].join('\n'));
    let r = verifyRecord(root, record);
    t.eq('4.3 a counted file with a different count verifies as changed',
      r.entries.filter((e) => e.verdict === 'changed').map((e) => e.path), [promptRel]);
    t.ok('4.3 that verify does not pass', !r.ok);
    t.ok('4.3 a failing verify leaves the record byte-identical',
      recordBytes.equals(fs.readFileSync(cap.path)));
    fs.writeFileSync(promptAbs, original);

    // counted → disappeared
    fs.rmSync(promptAbs);
    r = verifyRecord(root, record);
    t.eq('4.3 a counted file that disappeared verifies as missing',
      r.entries.filter((e) => e.verdict === 'missing').map((e) => e.path), [promptRel]);
    t.ok('4.3 a disappeared counted file fails the run', !r.ok);
    fs.writeFileSync(promptAbs, original);
    t.ok('4.3 restoring the file restores a clean verify', verifyRecord(root, record).ok);

    // missing → appeared
    const appeared = record.corpus.changes
      .reduce((acc, c) => acc.concat(c.artifacts.filter((a) => a.status === 'missing')), [])[0];
    const appearedAbs = path.join(root, appeared.path);
    fs.mkdirSync(path.dirname(appearedAbs), { recursive: true });
    fs.writeFileSync(appearedAbs, 'now it exists\n');
    r = verifyRecord(root, record);
    t.eq('4.3 a missing entry that has appeared verifies as changed',
      r.entries.filter((e) => e.verdict === 'changed').map((e) => e.path), [appeared.path]);
    t.ok('4.3 an appeared missing entry fails the run', !r.ok);
    t.ok('4.3 the record is still byte-identical after every failing verify',
      recordBytes.equals(fs.readFileSync(cap.path)));
    fs.rmSync(appearedAbs);
    t.ok('4.3 removing it again restores a clean verify', verifyRecord(root, record).ok);
  },

  function captureRefusesRetiredFlags(t) {
    const root = path.join(t.dir, 'repo-retired');
    REPRESENTATIVE_CHANGES.slice(0, 5).forEach((spec) => {
      t.write(path.join('repo-retired', spec.changePath, 'proposal.md'), 'alpha beta gamma\n');
    });
    const flags = { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z', root: path.join(t.dir, 'somewhere-else'), 'export-ran': true };
    for (const flag of Object.keys(flags)) {
      const inv = fileInventory(t.dir);
      const opts = { _: ['capture'], name: 'should-not-exist' };
      opts[flag] = flags[flag];
      const code = cmdCapture(opts, root);
      t.eq('P3 capture refuses the retired --' + flag, code, 1);
      t.eq('P3 the refused --' + flag + ' capture created no file', fileInventory(t.dir), inv);
    }
  },

  function verifyRefusesPathsOutsideTheRepo(t) {
    const root = path.join(t.dir, 'repo-unsafe');
    t.write('repo-unsafe/commands/sample.md', ['---', 'description: one two', '---', 'a b', ''].join('\n'));
    // A file OUTSIDE the fixture repo, which no safe record may reach.
    const outsideAbs = t.write('outside-the-repo/secret.md', 'alpha beta gamma\n');
    const outsideText = normalizeBytes(fs.readFileSync(outsideAbs));

    for (const bad of ['../outside-the-repo/secret.md', outsideAbs.split(path.sep).join('/'),
      'commands/../../outside-the-repo/secret.md', '', '..']) {
      const record = {
        countingRule: COUNTING_RULE,
        corpus: {
          // The hash and counts are the REAL ones for the outside file, so a record that got
          // through would report it as `matching` — which is precisely the confusion being refused.
          prompts: [{ path: bad, sha256: sha256Normalized(outsideText), descriptionWords: 0, bodyWords: 3 }],
          changes: [],
        },
      };
      const r = verifyRecord(root, record);
      t.eq('P2 a recorded path escaping the repo is refused (' + JSON.stringify(bad) + ')',
        r.entries.map((e) => e.verdict), ['unsafe-path']);
      t.ok('P2 an escaping path fails the run (' + JSON.stringify(bad) + ')', !r.ok);
    }

    // The guard does not disturb an ordinary in-repo entry.
    const good = countPromptFile(root, path.join(root, 'commands/sample.md'));
    const okRecord = { countingRule: COUNTING_RULE, corpus: { prompts: [good], changes: [] } };
    t.ok('P2 an ordinary repo-relative entry still verifies', verifyRecord(root, okRecord).ok);
  },

  function countingRuleWhitespaceOnly(t) {
    const f = t.write('count/ws.md', ' \t\n\r\n   \n');
    const r = countPromptFile(t.dir, f);
    t.eq('1.3 a whitespace-only file counts 0 body words', r.bodyWords, 0);
    t.eq('1.3 a whitespace-only file counts 0 description words', r.descriptionWords, 0);
  },

  // ---------------------------------------------------------------- compare (scoped attribution)

  function compareScopesTheHeadlineToTheMeasuredEpic(t) {
    const root = path.join(t.dir, 'repo-compare');
    fs.mkdirSync(root, { recursive: true });
    const rec = (prompts, artifacts) => ({
      countingRule: COUNTING_RULE,
      name: 'fixture',
      corpus: {
        prompts: prompts.map((p) => ({ path: p.path, descriptionWords: p.desc || 0, bodyWords: p.body || 0 })),
        changes: [{ category: 'x', changePath: 'c', artifacts: artifacts || [] }],
      },
    });
    const beforeRecord = rec([
      { path: 'skills/b2-shrinks/SKILL.md', desc: 10, body: 90 },
      { path: 'commands/shared.md', desc: 10, body: 90 },
      { path: 'skills/b2-deleted/SKILL.md', desc: 5, body: 45 },
    ], [{ path: 'c/gone.md', status: 'missing' }]);
    const afterRecord = rec([
      { path: 'skills/b2-shrinks/SKILL.md', desc: 10, body: 30 },
      { path: 'commands/shared.md', desc: 10, body: 10 },
      { path: 'skills/b2-added/SKILL.md', desc: 5, body: 20 },
    ], [{ path: 'c/gone.md', status: 'missing' }]);
    const scope = {
      programBaseline: 'baselines/pinned.json',
      'skills/b2-shrinks/SKILL.md': 'b2',
      'skills/b2-deleted/SKILL.md': 'b2',
      'skills/b2-added/SKILL.md': { class: 'b2' },
      'commands/shared.md': 'shared',
      'c/gone.md': 'b2',
      'skills/never-captured/SKILL.md': 'b2',
      'commands/never-captured.md': 'shared',
      '~/cache/external-plugin/brainstorming/SKILL.md': 'external',
      '~/cache/external-plugin/writing-plans/SKILL.md': 'external',
    };
    const res = computeComparison({
      repoRoot: root,
      beforeRecord,
      afterRecord,
      scope,
      beforeSource: { name: 'before', digest: 'b' },
      afterSource: { name: 'after', digest: 'a' },
      measureExternal: (p) => (p.indexOf('brainstorming') !== -1
        ? { path: p, status: 'measured', before: 400, after: 0, delta: -400 }
        : { path: p, status: 'unavailable', before: null, after: null, delta: null, reason: 'not readable on this machine (ENOENT)' }),
    });
    const r = res.record;

    // b2 only: -60 (shrunk) -50 (deleted) +25 (added). The shared file's -80 is NOT in it.
    t.eq('C1 compare sums the headline over b2 files only', r.headline.total, -85);
    t.eq('C1 compare labels the headline scope', r.headline.scope, 'b2');
    t.eq('C1 compare lists every shared file as excluded', r.excluded.map((e) => e.path).sort(), ['commands/never-captured.md', 'commands/shared.md']);
    t.eq("C1 compare carries the excluded file own counts", r.excluded.filter((e) => e.path === "commands/shared.md").map((e) => [e.before, e.after]), [[100, 20]]);
    t.ok('C1 compare keeps a shared reduction out of the headline', r.headline.entries.every((e) => e.path !== 'commands/shared.md'));
    t.eq('C1 compare reports a file absent from the before record as added',
      r.headline.entries.filter((e) => e.state === 'added').map((e) => [e.path, e.delta]),
      [['skills/b2-added/SKILL.md', 25]]);
    t.eq('C1 compare reports a file absent from the after record as removed',
      r.headline.entries.filter((e) => e.state === 'removed').map((e) => [e.path, e.delta]),
      [['skills/b2-deleted/SKILL.md', -50]]);
    t.eq('C1 compare propagates a path missing in both records as missing', r.missing, ['c/gone.md']);
    t.ok('C1 compare contributes no zero for a doubly-missing path',
      r.headline.entries.every((e) => e.path !== 'c/gone.md' || e.delta === null));
    t.eq('C1 compare reports a scope path present in neither record as a scope defect',
      r.scopeDefects.map((d) => d.path).sort(), ['commands/never-captured.md', 'skills/never-captured/SKILL.md']);
    t.eq('C1 compare still lists an uncaptured shared path as excluded, with null counts',
      r.excluded.filter((e) => e.path === 'commands/never-captured.md').map((e) => [e.before, e.after, e.delta]), [[null, null, null]]);
    t.ok('C1 compare gives every scope defect a reason', r.scopeDefects.every((d) => typeof d.reason === 'string' && d.reason !== ''));
    t.ok('C1 compare never treats scope metadata as a path',
      r.scopeDefects.every((d) => d.path !== 'programBaseline')
      && r.headline.entries.every((e) => e.path !== 'programBaseline')
      && r.unclassified.length === 0);

    // external: measured is a DIRECTED saving; unavailable is named, never zeroed.
    const ext = r.external.entries;
    t.eq('C1 compare reports a readable external body as a directed saving',
      ext.filter((e) => e.status === 'measured').map((e) => [e.before, e.after, e.delta]), [[400, 0, -400]]);
    t.eq('C1 compare records an unreadable external body as unavailable with its reason',
      ext.filter((e) => e.status === 'unavailable').map((e) => [e.before, e.after, e.reason !== '' && e.reason !== undefined]),
      [[null, null, true]]);
    t.eq('C1 compare keeps the external total out of the in-repository headline', r.headline.total, -85);
    t.eq('C1 compare totals the external section on its own', r.external.total, -400);
    t.eq('C1 compare marks a partly readable external block partial', r.external.status, 'partial');
    t.ok('C1 compare freezes the comparison record and stamps its counting rule',
      r.frozen === true && r.countingRule === COUNTING_RULE);
    t.ok('C1 compare carries both source names and digests',
      r.sources.before.name === 'before' && r.sources.before.digest === 'b'
      && r.sources.after.name === 'after' && r.sources.after.digest === 'a');
  },

  function compareRefusesAcrossCountingRules(t) {
    const root = path.join(t.dir, 'repo-compare-rules');
    fs.mkdirSync(root, { recursive: true });
    const mk = (rule) => ({ countingRule: rule, corpus: { prompts: [], changes: [] } });
    const res = computeComparison({
      repoRoot: root,
      beforeRecord: mk(COUNTING_RULE),
      afterRecord: mk(COUNTING_RULE + 1),
      scope: {},
      beforeSource: { name: 'b', digest: 'b' },
      afterSource: { name: 'a', digest: 'a' },
    });
    t.ok('C2 compare refuses two records carrying different counting rules', typeof res.error === 'string');
    t.ok('C2 the refusal names the rules rather than comparing across them', res.error.indexOf('counting rules') !== -1);
    t.eq('C2 the refused comparison produced no record', res.record, undefined);
  },

  // The equality guard alone lets TWO rule-less records through (`undefined !== undefined` is
  // false), and the written record would then silently lose the key entirely to JSON.stringify.
  function compareRefusesARecordWithNoCountingRule(t) {
    const root = path.join(t.dir, 'repo-compare-norule');
    fs.mkdirSync(root, { recursive: true });
    const noRule = { corpus: { prompts: [], changes: [] } };
    const withRule = { countingRule: COUNTING_RULE, corpus: { prompts: [], changes: [] } };
    const run = (b, a) => computeComparison({
      repoRoot: root,
      beforeRecord: b,
      afterRecord: a,
      scope: {},
      beforeSource: { name: 'b', digest: 'b' },
      afterSource: { name: 'a', digest: 'a' },
    });

    const both = run(noRule, noRule);
    t.ok('C4 compare refuses two records that BOTH omit countingRule', typeof both.error === 'string');
    t.ok('C4 the refusal names the missing counting rule', both.error.indexOf('countingRule') !== -1);
    t.eq('C4 no record is produced, so none can be written without a countingRule', both.record, undefined);

    t.ok('C4 compare refuses when only --before omits countingRule', typeof run(noRule, withRule).error === 'string');
    t.ok('C4 compare refuses when only --after omits countingRule', typeof run(withRule, noRule).error === 'string');
    t.ok('C4 compare refuses a non-numeric countingRule',
      typeof run({ countingRule: '1', corpus: { prompts: [], changes: [] } }, withRule).error === 'string');
    t.ok('C4 two records carrying a valid, equal countingRule are still compared',
      run(withRule, withRule).record.countingRule === COUNTING_RULE);
  },

  function compareRefusesAnExistingOutputPath(t) {
    const root = path.join(t.dir, 'repo-compare-frozen');
    fs.mkdirSync(root, { recursive: true });
    const recPath = path.join(root, 'rec.json');
    fs.writeFileSync(recPath, JSON.stringify({ countingRule: COUNTING_RULE, corpus: { prompts: [], changes: [] } }));
    const scopePath = path.join(root, 'scope.json');
    fs.writeFileSync(scopePath, JSON.stringify({}));
    const outPath = path.join(root, 'out.json');
    const existing = 'do not overwrite me\n';
    fs.writeFileSync(outPath, existing);
    const code = cmdCompare({ _: ['compare'], before: recPath, after: recPath, scope: scopePath, out: outPath }, root);
    t.eq('C3 compare refuses an --out path that already exists', code, 1);
    t.eq('C3 the refused compare left the existing record byte-identical', fs.readFileSync(outPath, 'utf8'), existing);
  },

];

function runSelftest() {
  const t = makeSelftestContext();
  let failed = null;
  try {
    for (const fn of SELFTESTS) fn(t);
  } catch (err) {
    failed = err;
    if (!(err instanceof AssertionFailure)) {
      process.stdout.write('FAIL ' + (err && err.stack ? err.stack : String(err)) + '\n');
    }
  } finally {
    try { fs.rmSync(t.dir, { recursive: true, force: true }); } catch (_) { /* fire-and-forget */ }
  }
  if (failed) {
    process.stdout.write('selftest: FAILED after ' + t.passed() + ' passing assertion(s)\n');
    return 1;
  }
  process.stdout.write('selftest: ' + t.passed() + ' assertion(s) passed\n');
  return 0;
}

/* ------------------------------------------------------------------ entry point */

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.selftest) return runSelftest();
  const repoRoot = findRepoRoot(process.cwd());
  const sub = opts._[0];
  if (sub === 'corpus') return cmdCorpus(opts, repoRoot);
  if (sub === 'capture') return cmdCapture(opts, repoRoot);
  if (sub === 'verify') return cmdVerify(opts, repoRoot);
  if (sub === 'compare') return cmdCompare(opts, repoRoot);
  process.stderr.write(USAGE + '\n');
  return 1;
}

function notImplemented(what) {
  process.stderr.write('not implemented: ' + what + '\n');
  return 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, parseArgs, findRepoRoot, USAGE };
