#!/usr/bin/env node
'use strict';

/*
 * check-agent-types.js — agent-type regression checker for ptp.
 *
 * Every `subagent_type` / `agentType` value named anywhere under `skills/`, `commands/`,
 * `workflows/` or `agents/` must resolve to either a harness built-in agent type or an existing
 * `ptp:<name>` agent (`agents/<name>.md`). A skill's own name is never a valid agent type — the
 * classic failure mode this check exists to catch is a caller leaving the Agent-tool spawn's agent
 * type open, so the harness fills it with the invoking skill's own name and rejects the spawn with
 * "Agent type not found".
 *
 * It also pins `skills/ptp-run-at-model/SKILL.md` step 5's `main == claude` spawn instruction to
 * name `subagent_type: general-purpose` explicitly, and it refuses to pass vacuously — a scan that
 * finds zero agent-type values at all is itself a finding, since that would mean the check stopped
 * recognizing the very things it exists to check.
 *
 * Run from the repository root:
 *   node scripts/check-agent-types.js                # scan the real tree
 *   node scripts/check-agent-types.js --root <dir>    # scan another tree
 *   node scripts/check-agent-types.js --self-test     # in-memory fixtures
 *
 * No dependencies. Exits 0 when every check holds, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['skills', 'commands', 'workflows', 'agents'];
const FILE_EXTS = new Set(['.md', '.js']);

const BUILTIN_AGENT_TYPES = new Set([
  'claude',
  'claude-code-guide',
  'Explore',
  'general-purpose',
  'Plan',
  'statusline-setup',
]);

const STEP5_ANCHOR = /5\.\s*\*\*Run the main work\*\*/;
const STEP5_END = /The prompt MUST contain/;
const STEP5_REQUIRED = 'subagent_type: general-purpose';
const STEP5_FILE = 'skills/ptp-run-at-model/SKILL.md';

// Matches every documented spelling: the JS form with a space, the no-space colon form, the
// backticked Markdown form, and the quoted-or-bare Markdown form.
const VALUE_RE = /(subagent_type|agentType)\s*:\s*["'`]?([A-Za-z0-9_:-]+)/g;

const RULES = new Set(['step5-type', 'unknown-agent-type', 'no-agent-types']);

// ---------------------------------------------------------------------------
// Tree abstraction (mirrors check-prompt-budgets.js's shape for consistency)
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
  const walk = (rel) => {
    const abs = path.join(root, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        walk(childRel);
      } else if (ent.isFile() && FILE_EXTS.has(path.extname(ent.name))) {
        try {
          files[childRel] = fs.readFileSync(path.join(root, childRel), 'utf8');
        } catch (e) { /* ignore unreadable file */ }
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(dir);
  return makeTree(files);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function isKnownAgentType(value, tree) {
  if (BUILTIN_AGENT_TYPES.has(value)) return true;
  const m = /^ptp:([A-Za-z0-9_-]+)$/.exec(value);
  if (!m) return false;
  return tree.hasFile(`agents/${m[1]}.md`);
}

function checkStep5(tree, violations) {
  const content = tree.read(STEP5_FILE);
  if (content == null) {
    violations.push({ file: STEP5_FILE, rule: 'step5-type', message: 'step 5 anchor not found (file missing)' });
    return;
  }
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let startIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (STEP5_ANCHOR.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx === -1) {
    violations.push({ file: STEP5_FILE, rule: 'step5-type', message: 'step 5 anchor "5. **Run the main work**" not found' });
    return;
  }
  let endIdx = -1;
  for (let i = startIdx; i < lines.length; i += 1) {
    if (STEP5_END.test(lines[i])) { endIdx = i; break; }
  }
  if (endIdx === -1) {
    violations.push({ file: STEP5_FILE, rule: 'step5-type', message: 'no "The prompt MUST contain" line found after the step 5 anchor' });
    return;
  }
  const region = lines.slice(startIdx, endIdx + 1).join('\n');
  if (!region.includes(STEP5_REQUIRED)) {
    violations.push({
      file: STEP5_FILE,
      rule: 'step5-type',
      message: `step 5 region does not name "${STEP5_REQUIRED}"`,
    });
  }
}

function checkValues(tree, violations) {
  let total = 0;
  for (const file of tree.list()) {
    const content = tree.read(file);
    const lines = String(content).replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      VALUE_RE.lastIndex = 0;
      let m;
      while ((m = VALUE_RE.exec(line)) !== null) {
        total += 1;
        const value = m[2];
        if (!isKnownAgentType(value, tree)) {
          violations.push({
            file,
            line: i + 1,
            rule: 'unknown-agent-type',
            message: `"${value}" is neither a harness built-in agent type nor an existing ptp:<name> agent`,
          });
        }
      }
    }
  }
  return total;
}

function analyze(tree) {
  const violations = [];
  checkStep5(tree, violations);
  const total = checkValues(tree, violations);
  if (total === 0) {
    violations.push({ file: '(scan)', rule: 'no-agent-types', message: 'no subagent_type/agentType value found anywhere in the scanned tree' });
  }
  return { violations };
}

// ---------------------------------------------------------------------------
// Self-test fixtures
// ---------------------------------------------------------------------------

const GOOD_STEP5 = [
  '5. **Run the main work** as the resolved main agent.',
  '',
  '   - **`main == claude`.** Spawn ONE foreground subagent via the Agent tool with',
  '     `subagent_type: general-purpose` and `model` = the resolved model. The prompt MUST contain:',
].join('\n');

function goodFiles() {
  return {
    [STEP5_FILE]: GOOD_STEP5,
    'agents/ptp-apply.md': '# ptp-apply\n',
    // Four documented spellings, all resolving to known agent types.
    'workflows/example.js': "  agentType: 'general-purpose',\n", // JS form with a space
    'skills/example-a/SKILL.md': "agentType:'ptp:ptp-apply'\n", // no-space colon, quoted
    'skills/example-b/SKILL.md': '`subagent_type: general-purpose`\n', // backticked Markdown
    'skills/example-c/SKILL.md': 'subagent_type: "general-purpose"\n', // quoted Markdown
  };
}

function fixtures() {
  const list = [];
  const push = (name, rule, expectViolation, mutate) => {
    const files = goodFiles();
    if (mutate) mutate(files);
    list.push({ name, rule, expectViolation, files });
  };

  push('clean tree with all four spellings', 'step5-type', false, null);
  push('clean tree, no unknown-agent-type', 'unknown-agent-type', false, null);
  push('clean tree, no no-agent-types', 'no-agent-types', false, null);

  push('skill name used as an agent type', 'unknown-agent-type', true, (f) => {
    f['skills/example-d/SKILL.md'] = "subagent_type: 'ptp:ptp-run-at-model'\n";
  });

  push('missing step-5 anchor', 'step5-type', true, (f) => {
    f[STEP5_FILE] = '# ptp-run-at-model\n\nNo step 5 anchor here.\n';
  });

  push('step-5 anchor present but no general-purpose type named', 'step5-type', true, (f) => {
    f[STEP5_FILE] = [
      '5. **Run the main work** as the resolved main agent.',
      '',
      '   - **`main == claude`.** Spawn ONE foreground subagent via the Agent tool with `model` =',
      '     the resolved model. The prompt MUST contain:',
    ].join('\n');
  });

  push('zero agent-type values anywhere', 'no-agent-types', true, (f) => {
    for (const k of Object.keys(f)) {
      if (k !== STEP5_FILE && k !== 'agents/ptp-apply.md') delete f[k];
    }
    f[STEP5_FILE] = GOOD_STEP5.replace('subagent_type: general-purpose', 'model-only, no type');
  });

  return list;
}

function runSelfTest() {
  const list = fixtures();
  let passed = 0;
  const failures = [];
  for (const fx of list) {
    let result;
    try {
      result = analyze(makeTree(fx.files));
    } catch (err) {
      failures.push(`${fx.name} [${fx.rule}]: threw ${err && err.message}`);
      continue;
    }
    const hit = result.violations.some((v) => v.rule === fx.rule);
    if (hit === fx.expectViolation) {
      passed += 1;
    } else {
      failures.push(`${fx.name} [${fx.rule}]: expected ${fx.expectViolation ? 'violation' : 'clean'}, got ${hit ? 'violation' : 'clean'}`
        + (hit ? '' : ` (other: ${result.violations.map((v) => v.rule).join(',') || 'none'})`));
    }
  }
  for (const f of failures) console.log(`self-test FAIL: ${f}`);
  console.log(`self-test fixtures passed: ${passed}/${list.length}`);
  return failures.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) return runSelfTest();

  let root = ROOT;
  const rootIdx = argv.indexOf('--root');
  if (rootIdx !== -1 && argv[rootIdx + 1]) root = path.resolve(argv[rootIdx + 1]);

  const tree = readRealTree(root);
  const result = analyze(tree);

  for (const v of result.violations) {
    const loc = v.line ? `${v.file}:${v.line}` : v.file;
    console.log(`${loc}: ${v.rule}: ${v.message}`);
  }
  if (result.violations.length) {
    console.log(`${result.violations.length} finding(s)`);
    return 1;
  }
  console.log('all agent types resolve');
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { analyze, makeTree, isKnownAgentType, RULES };
