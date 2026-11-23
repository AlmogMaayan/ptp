#!/usr/bin/env node
'use strict';

/*
 * check-learnings-size-line.js — size-line marker check for ptp.
 *
 * DERIVED SURFACE. The size-line placement rule is owned by `skills/ptp-learn/SKILL.md`
 * (`## Size line`); this script only enforces that every command file points at it.
 *
 * Every `commands/*.md` file must hold exactly one line that, trimmed, equals SIZE_LINE_SENTENCE.
 * In a file with a `## Report` section, that line must sit inside that section. The check refuses
 * to pass on nothing (a scan with no command file is a finding), and it requires the owner section
 * `## Size line` in `skills/ptp-learn/SKILL.md`. Whether learning is off is decided at runtime, so
 * it is not checked here.
 *
 * Run from the repository root:
 *   node scripts/check-learnings-size-line.js                # scan the real tree
 *   node scripts/check-learnings-size-line.js --root <dir>    # scan another tree
 *   node scripts/check-learnings-size-line.js --self-test     # in-memory fixtures
 *
 * No dependencies. Exits 0 when every check holds, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SIZE_LINE_SENTENCE =
  'If the user invoked this command and you are the outer session, the `ptp-learn` size line ends your report.';
const OWNER_FILE = 'skills/ptp-learn/SKILL.md';
const OWNER_HEADING = '## Size line';
const REPORT_HEADING = '## Report';

const RULES = new Set([
  'missing-sentence',
  'duplicate-sentence',
  'outside-report',
  'no-commands',
  'missing-owner-section',
]);

// ---------------------------------------------------------------------------
// Tree abstraction (mirrors check-agent-types.js)
// ---------------------------------------------------------------------------

function makeTree(files) {
  const map = new Map(Object.entries(files));
  return {
    files: map,
    read(p) { return map.has(p) ? map.get(p) : null; },
    hasFile(p) { return map.has(p); },
    list() { return Array.from(map.keys()).sort(); },
  };
}

function readRealTree(root) {
  const files = {};
  let entries = [];
  try {
    entries = fs.readdirSync(path.join(root, 'commands'), { withFileTypes: true });
  } catch (e) { /* no commands folder: reported as no-commands */ }
  for (const ent of entries) {
    if (!ent.isFile() || path.extname(ent.name) !== '.md') continue;
    try {
      files[`commands/${ent.name}`] = fs.readFileSync(path.join(root, 'commands', ent.name), 'utf8');
    } catch (e) {
      files[`commands/${ent.name}`] = null; // unreadable: reported as missing-sentence, never skipped
    }
  }
  try {
    files[OWNER_FILE] = fs.readFileSync(path.join(root, OWNER_FILE), 'utf8');
  } catch (e) { /* missing owner: reported as missing-owner-section */ }
  return makeTree(files);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function splitLines(content) {
  return String(content).replace(/\r\n?/g, '\n').split('\n');
}

function isCommandFile(file) {
  return /^commands\/[^/]+\.md$/.test(file);
}

// Marks each line as inside or outside a `## Report` section. The section runs from its heading to
// the next level-2 (or level-1) heading outside a code fence.
function reportMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let hasReport = false;
  let inReport = false;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,2}\s/.test(line)) {
      inReport = line.trim() === REPORT_HEADING;
      if (inReport) hasReport = true;
    }
    mask[i] = inReport;
  }
  return { hasReport, mask };
}

function checkCommand(file, content, violations) {
  if (content == null) {
    violations.push({ file, rule: 'missing-sentence', message: 'command file unreadable' });
    return;
  }
  const lines = splitLines(content);
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === SIZE_LINE_SENTENCE) hits.push(i);
  }
  if (hits.length === 0) {
    violations.push({ file, rule: 'missing-sentence', message: 'no size-line sentence' });
    return;
  }
  if (hits.length > 1) {
    violations.push({
      file,
      line: hits[1] + 1,
      rule: 'duplicate-sentence',
      message: `size-line sentence appears ${hits.length} times`,
    });
  }
  const { hasReport, mask } = reportMask(lines);
  if (!hasReport) return;
  for (const i of hits) {
    if (!mask[i]) {
      violations.push({ file, line: i + 1, rule: 'outside-report', message: 'size-line sentence sits outside the ## Report section' });
    }
  }
}

function analyze(tree) {
  const violations = [];
  const commands = tree.list().filter(isCommandFile);
  if (commands.length === 0) {
    violations.push({ file: 'commands', rule: 'no-commands', message: 'no commands/*.md file found' });
  }
  for (const file of commands) checkCommand(file, tree.read(file), violations);
  const owner = tree.read(OWNER_FILE);
  if (owner == null || !splitLines(owner).some((l) => l.trimEnd() === OWNER_HEADING)) {
    violations.push({ file: OWNER_FILE, rule: 'missing-owner-section', message: `no "${OWNER_HEADING}" heading` });
  }
  return { violations, commands: commands.length };
}

// ---------------------------------------------------------------------------
// Self-test fixtures
// ---------------------------------------------------------------------------

function goodFiles() {
  return {
    [OWNER_FILE]: '# ptp-learn\n\n## Size line\n\nThe rule.\n',
    'commands/ordinary.md': [
      '# ordinary', '', '## Steps', '', '1. Do it.', '', '## Report', '', 'Print the result.', '', '### Detail', '',
      'More.', '', SIZE_LINE_SENTENCE, '',
    ].join('\n'),
    'commands/owner.md': ['# owner', '', '1. Run.', '', SIZE_LINE_SENTENCE, '', '## Hard rules', '', '- None.', ''].join('\n'),
    'commands/effort.md': ['# effort', '', '5. **Report**', '', `   ${SIZE_LINE_SENTENCE}`, '', '6. **Write**', ''].join('\n'),
  };
}

function fixtures() {
  const list = [];
  const push = (name, rule, expectViolation, mutate) => {
    const files = goodFiles();
    if (mutate) mutate(files);
    list.push({ name, rule, expectViolation, files });
  };

  push('clean-tree', null, false, null);
  push('missing-sentence', 'missing-sentence', true, (f) => {
    f['commands/new.md'] = '# new\n\n## Report\n\nPrint it.\n';
  });
  push('duplicate-sentence', 'duplicate-sentence', true, (f) => {
    f['commands/owner.md'] += `\n${SIZE_LINE_SENTENCE}\n`;
  });
  push('outside-report', 'outside-report', true, (f) => {
    f['commands/late.md'] = ['# late', '', '## Report', '', 'Print it.', '', '## Notes', '', SIZE_LINE_SENTENCE, ''].join('\n');
  });
  push('no-commands', 'no-commands', true, (f) => {
    for (const k of Object.keys(f)) if (isCommandFile(k)) delete f[k];
  });
  push('missing-owner-section', 'missing-owner-section', true, (f) => {
    f[OWNER_FILE] = '# ptp-learn\n\n## The key\n';
  });

  return list;
}

function runSelfTest() {
  const list = fixtures();
  let passed = 0;
  for (const fx of list) {
    let result;
    let why = '';
    try {
      result = analyze(makeTree(fx.files));
      const rules = result.violations.map((v) => v.rule);
      if (fx.rule === null) {
        if (rules.length) why = `expected clean, got ${rules.join(',')}`;
      } else if (!rules.includes(fx.rule)) {
        why = `expected ${fx.rule}, got ${rules.join(',') || 'clean'}`;
      }
    } catch (err) {
      why = `threw ${err && err.message}`;
    }
    if (why) {
      console.log(`self-test FAIL ${fx.name}: ${why}`);
    } else {
      passed += 1;
      console.log(`self-test PASS ${fx.name}`);
    }
  }
  console.log(`self-test fixtures passed: ${passed}/${list.length}`);
  return passed === list.length ? 0 : 1;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) return runSelfTest();

  let root = ROOT;
  const rootIdx = argv.indexOf('--root');
  if (rootIdx !== -1 && argv[rootIdx + 1]) root = path.resolve(argv[rootIdx + 1]);

  const result = analyze(readRealTree(root));
  for (const v of result.violations) {
    const loc = v.line ? `${v.file}:${v.line}` : v.file;
    console.log(`${loc}: ${v.rule}: ${v.message}`);
  }
  if (result.violations.length) {
    console.log(`${result.violations.length} finding(s)`);
    return 1;
  }
  console.log(`size-line sentence present in all ${result.commands} command files`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { analyze, makeTree, SIZE_LINE_SENTENCE, RULES };
