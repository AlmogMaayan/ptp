#!/usr/bin/env node
'use strict';

/*
 * check-prompt-budgets.js — prompt-surface budget checker for ptp.
 *
 * Run from the repository root:
 *   node scripts/check-prompt-budgets.js              # evaluate every budget
 *   node scripts/check-prompt-budgets.js --self-test  # in-memory fixtures
 *   node scripts/check-prompt-budgets.js --list-exempt
 *   node scripts/check-prompt-budgets.js --list-ordinary
 *
 * No dependencies. Exits 0 when every budget holds, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

const DESC_MIN = 10;
const DESC_MAX = 25;
const SKILL_DESC_TOTAL = 800;
const COMMAND_DESC_TOTAL = 900;
const ORDINARY_BODY_MAX = 300;
const ROUTER_BODY_MAX = 600;
const SKILL_BODY_MAX = 10000;
const AGENT_BODY_MAX = 1500;

const ACRONYM_ALLOWLIST = new Set([
  'PTP', 'PRD', 'TLDR', 'CLI', 'API', 'JSON', 'MCP', 'TDD', 'README',
]);

const ROUTER_PATH = 'skills/ptp/SKILL.md';

const ORDINARY_SECTIONS = ['Arguments', 'Owner', 'Report'];
const AGENT_SECTIONS = {
  'agents/ptp-apply.md': ['Inputs', 'Task', 'Return'],
  'agents/ptp-review.md': ['Inputs', 'Scope', 'Task', 'Return'],
};

// The seven policies this capability closes over. The name is spelled here
// exactly as it must appear in the router's policy index and in the owner's
// own `##`/`###` section heading.
const POLICIES = [
  'Model + effort rubric',
  'Review severity behavior',
  'Branch safety',
  'Model dispatch',
  'Terminal states',
  'Codex mode resolution',
  'Selector grammar',
];

const RULES = new Set([
  'description-present',
  'description-max',
  'description-form',
  'skill-description-total',
  'command-description-total',
  'ordinary-command-body',
  'ordinary-command-shape',
  'owner-command-unlisted',
  'command-owner-map',
  'router-body',
  'skill-body',
  'agent-body',
  'agent-shape',
  'policy-index',
  'allowlist-entry',
]);

// Only the 25-word ceiling and the body budget of an owner command may be
// waived. `description-present` and `description-form` are never exemptible.
const EXEMPTIBLE_RULES = new Set(['description-max', 'ordinary-command-body']);

// ---------------------------------------------------------------------------
// Exemption allowlist (inline, one reason per entry)
// ---------------------------------------------------------------------------

// Every entry names one file, the single rule it exempts, and a reason, and
// suppresses only that rule for that file. `ordinary-command-body` is accepted
// only for a command whose resolved owner is itself — an owner command.
const EXEMPTIONS = [
  { file: 'commands/apply.md', rule: 'ordinary-command-body', reason: 'owner command: owns the sequential apply protocol, no owning skill' },
  { file: 'commands/archive.md', rule: 'ordinary-command-body', reason: 'owner command: owns the archive gates, no owning skill' },
  { file: 'commands/brainstorm-only.md', rule: 'ordinary-command-body', reason: 'owner command: owns the change-agnostic brainstorm protocol, no owning skill' },
  { file: 'commands/brainstorm.md', rule: 'ordinary-command-body', reason: 'owner command: owns the per-change brainstorm protocol, no owning skill' },
  { file: 'commands/codex-review-plan.md', rule: 'ordinary-command-body', reason: 'owner command: owns the closed-book artifact-review payload protocol' },
  { file: 'commands/codex-review-prd.md', rule: 'ordinary-command-body', reason: 'owner command: owns the closed-book requirements-review payload protocol' },
  { file: 'commands/codex-review-uncommitted.md', rule: 'ordinary-command-body', reason: 'owner command: owns the closed-book working-tree review payload protocol' },
  { file: 'commands/codex-review.md', rule: 'ordinary-command-body', reason: 'owner command: owns the closed-book code-review payload protocol' },
  { file: 'commands/effort.md', rule: 'ordinary-command-body', reason: 'owner command: owns the model + effort rubric policy' },
  { file: 'commands/plan-multiple.md', rule: 'ordinary-command-body', reason: 'owner command: owns the decomposition protocol, no owning skill' },
  { file: 'commands/plan.md', rule: 'ordinary-command-body', reason: 'owner command: owns the plan-to-artifacts translation, no owning skill' },
  { file: 'commands/review-fix.md', rule: 'ordinary-command-body', reason: 'owner command: owns the standalone fix pass, no owning skill' },
  { file: 'commands/review-full.md', rule: 'ordinary-command-body', reason: 'owner command: owns the dual-reviewer code orchestration, no owning skill' },
  { file: 'commands/review-plan-full.md', rule: 'ordinary-command-body', reason: 'owner command: owns the dual-reviewer artifact orchestration, no owning skill' },
  { file: 'commands/review-plan.md', rule: 'ordinary-command-body', reason: 'owner command: authors the artifact-review rubric, no owning skill' },
  { file: 'commands/review.md', rule: 'ordinary-command-body', reason: 'owner command: authors the code-review rubric, no owning skill' },
  { file: 'commands/status.md', rule: 'ordinary-command-body', reason: 'owner command: owns the status column contract, no owning skill' },
  { file: 'commands/update.md', rule: 'ordinary-command-body', reason: 'owner command: owns the plugin update protocol, no owning skill' },
];

// ---------------------------------------------------------------------------
// Tree abstraction
// ---------------------------------------------------------------------------

function makeTree(files, dirs) {
  const map = new Map(Object.entries(files));
  const dirSet = new Set(dirs || []);
  for (const p of map.keys()) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i += 1) dirSet.add(parts.slice(0, i).join('/'));
  }
  return {
    files: map,
    dirs: dirSet,
    read(p) { return map.has(p) ? map.get(p) : null; },
    hasFile(p) { return map.has(p); },
    hasDir(p) { return dirSet.has(p); },
    list(pattern) {
      const out = [];
      for (const p of map.keys()) if (pattern.test(p)) out.push(p);
      return out.sort();
    },
  };
}

function readRealTree(root) {
  const files = {};
  const dirs = [];
  const push = (rel) => {
    try { files[rel] = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { /* ignore */ }
  };
  const safeReaddir = (rel) => {
    try { return fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (e) { return []; }
  };
  for (const ent of safeReaddir('commands')) {
    if (ent.isFile() && ent.name.endsWith('.md')) push(`commands/${ent.name}`);
  }
  for (const ent of safeReaddir('agents')) {
    if (ent.isFile() && ent.name.endsWith('.md')) push(`agents/${ent.name}`);
  }
  for (const ent of safeReaddir('skills')) {
    if (!ent.isDirectory()) continue;
    dirs.push(`skills/${ent.name}`);
    push(`skills/${ent.name}/SKILL.md`);
    for (const ref of safeReaddir(`skills/${ent.name}/references`)) {
      if (ref.isFile() && ref.name.endsWith('.md')) push(`skills/${ent.name}/references/${ref.name}`);
    }
  }
  return makeTree(files, dirs);
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function splitFrontmatter(content) {
  // `\r` is a JS line terminator, so a CRLF file would defeat every `$`-anchored
  // frontmatter regex below. Normalise first; nothing here is byte-compared.
  const text = String(content == null ? '' : content).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { frontmatter: null, body: text };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      return { frontmatter: lines.slice(1, i), body: lines.slice(i + 1).join('\n') };
    }
  }
  return { frontmatter: null, body: text };
}

function dedent(lines) {
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (nonEmpty.length === 0) return lines.map(() => '');
  let min = Infinity;
  for (const l of nonEmpty) {
    const m = /^[ \t]*/.exec(l)[0].length;
    if (m < min) min = m;
  }
  if (!isFinite(min)) min = 0;
  return lines.map((l) => (l.trim() === '' ? '' : l.slice(min)));
}

/**
 * Read the frontmatter `description` value.
 * Returns { present, lines, value } where `lines` are the raw content lines
 * (dedented) and `value` is the single-line join with surrounding quotes
 * stripped. `present` is false when there is no frontmatter or no key.
 */
function readDescription(frontmatter) {
  if (!frontmatter) return { present: false, lines: [], value: '' };
  let idx = -1;
  let inline = null;
  for (let i = 0; i < frontmatter.length; i += 1) {
    const m = /^description[ \t]*:(.*)$/.exec(frontmatter[i]);
    if (m) { idx = i; inline = m[1]; break; }
  }
  if (idx === -1) return { present: false, lines: [], value: '' };

  let first = inline.trim();
  const blockScalar = /^[|>][-+]?\d*$/.test(first);
  if (blockScalar) first = '';

  const continuation = [];
  for (let i = idx + 1; i < frontmatter.length; i += 1) {
    const line = frontmatter[i];
    if (line.trim() === '') {
      // A blank line continues the value only when a further indented line follows.
      let j = i + 1;
      while (j < frontmatter.length && frontmatter[j].trim() === '') j += 1;
      if (j < frontmatter.length && /^[ \t]/.test(frontmatter[j])) { continuation.push(''); continue; }
      break;
    }
    if (!/^[ \t]/.test(line)) break;
    continuation.push(line);
  }

  const lines = [];
  if (first !== '') lines.push(first);
  for (const l of dedent(continuation)) lines.push(l);

  let value = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (value.length >= 2) {
    const a = value[0];
    const b = value[value.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) value = value.slice(1, -1).trim();
  }
  return { present: true, lines, value };
}

function wordCount(text) {
  if (!text) return 0;
  return String(text).split(/\s+/).filter(Boolean).length;
}

/** Top-level (`##`) and third-level (`###`) headings outside fenced code blocks. */
function headings(body) {
  const out = [];
  let fenced = false;
  for (const raw of String(body || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = /^(#{2,3})\s+(.*?)\s*$/.exec(raw);
    if (m) out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

function topSections(body) {
  return headings(body).filter((h) => h.level === 2).map((h) => h.text);
}

/** Body text of the `## <name>` section, up to the next `##` heading. */
function sectionBody(body, name) {
  const lines = String(body || '').split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^##\s+(.*?)\s*$/.exec(lines[i]);
    if (m && m[1].trim().toLowerCase() === name.toLowerCase()) { start = i + 1; break; }
  }
  if (start === -1) return null;
  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Parse a two-column markdown table whose first header cell matches `firstHeader`. */
function parseTable(body, firstHeader) {
  const lines = String(body || '').split('\n');
  const rows = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) { inTable = false; continue; }
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (!inTable) {
      if (cells.length >= 2 && new RegExp(`^${firstHeader}$`, 'i').test(cells[0].replace(/[`*]/g, '').trim())) {
        inTable = true;
      }
      continue;
    }
    if (/^:?-{2,}:?$/.test(cells[0].replace(/\s/g, ''))) continue;
    if (cells.length < 2) continue;
    const clean = (c) => c.replace(/`/g, '').trim();
    rows.push([clean(cells[0]), clean(cells[1])]);
  }
  return rows.length ? rows : null;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyze(tree, exemptions) {
  const violations = [];
  const allowlist = exemptions || EXEMPTIONS;

  const add = (file, rule, message) => { violations.push({ file, rule, message }); };
  const exemptSet = new Set();
  for (const e of allowlist) {
    if (!e || typeof e.file !== 'string' || !e.file.trim()
      || typeof e.rule !== 'string' || !e.rule.trim()
      || typeof e.reason !== 'string' || !e.reason.trim()) {
      add(e && e.file ? e.file : '(allowlist)', 'allowlist-entry',
        'budget=allowlist entry shape; measured=missing file, rule or reason');
      continue;
    }
    if (!RULES.has(e.rule)) {
      add(e.file, 'allowlist-entry', `budget=known rule; measured=unknown rule "${e.rule}"`);
      continue;
    }
    if (!EXEMPTIBLE_RULES.has(e.rule)) {
      add(e.file, 'allowlist-entry', `budget=exemptible rule; measured=non-exemptible rule "${e.rule}"`);
      continue;
    }
    exemptSet.add(`${e.file}::${e.rule}`);
  }
  const isExempt = (file, rule) => exemptSet.has(`${file}::${rule}`);

  const commandFiles = tree.list(/^commands\/[^/]+\.md$/);
  const skillFiles = tree.list(/^skills\/[^/]+\/SKILL\.md$/);
  const agentFiles = tree.list(/^agents\/[^/]+\.md$/);
  // Reference files live under `skills/`, so the policy single-owner scan below must
  // see them: sectioning moves whole sections into them.
  const referenceFiles = tree.list(/^skills\/[^/]+\/references\/[^/]+\.md$/);

  // --- descriptions ---------------------------------------------------------
  const descWords = new Map();
  const checkDescription = (file) => {
    const { frontmatter } = splitFrontmatter(tree.read(file));
    const desc = readDescription(frontmatter);
    const words = wordCount(desc.value);
    descWords.set(file, words);

    if (!desc.present || words === 0) {
      add(file, 'description-present', 'budget=description present, >=10 words; measured=missing');
      return;
    }
    if (words < DESC_MIN) {
      add(file, 'description-present', `budget=>=${DESC_MIN} words; measured=${words} words`);
    }
    if (words > DESC_MAX && !isExempt(file, 'description-max')) {
      add(file, 'description-max', `budget=<=${DESC_MAX} words; measured=${words} words`);
    }

    // routing-sentence form
    const value = desc.value;
    const terminators = (value.match(/[.?!]/g) || []).length;
    if (terminators > 1) {
      add(file, 'description-form', `budget=at most one sentence terminator, final only; measured=${terminators}`);
    } else if (terminators === 1 && !/[.?!]$/.test(value)) {
      add(file, 'description-form', 'budget=sentence terminator only as final character; measured=mid-value terminator');
    }
    for (const line of desc.lines) {
      if (/^\s*([-*]\s|\d+\.\s)/.test(line)) {
        add(file, 'description-form', 'budget=no list marker; measured=list marker in description');
        break;
      }
    }
    if (desc.lines.some((l) => l.includes('```') || l.includes('~~~'))) {
      add(file, 'description-form', 'budget=no code block; measured=fenced code block in description');
    } else if (desc.lines.some((l) => /^ {4,}\S/.test(l))) {
      add(file, 'description-form', 'budget=no code block; measured=indented code block in description');
    }
    if (/\b(SHALL|MUST)\b/.test(value)) {
      add(file, 'description-form', 'budget=no SHALL/MUST; measured=normative keyword in description');
    }
    const runs = value.match(/[A-Z]{3,}/g) || [];
    for (const run of runs) {
      if (!ACRONYM_ALLOWLIST.has(run)) {
        add(file, 'description-form', `budget=no all-caps token outside allowlist; measured="${run}"`);
        break;
      }
    }
  };
  for (const f of commandFiles) checkDescription(f);
  for (const f of skillFiles) checkDescription(f);
  for (const f of agentFiles) checkDescription(f);

  const skillTotal = skillFiles.reduce((a, f) => a + (descWords.get(f) || 0), 0);
  if (skillTotal > SKILL_DESC_TOTAL) {
    add('skills/*/SKILL.md', 'skill-description-total',
      `budget=<=${SKILL_DESC_TOTAL} words; measured=${skillTotal} words`);
  }
  const commandTotal = commandFiles.reduce((a, f) => a + (descWords.get(f) || 0), 0);
  if (commandTotal > COMMAND_DESC_TOTAL) {
    add('commands/*.md', 'command-description-total',
      `budget=<=${COMMAND_DESC_TOTAL} words; measured=${commandTotal} words`);
  }

  // --- owner resolution -----------------------------------------------------
  const routerBody = tree.hasFile(ROUTER_PATH) ? splitFrontmatter(tree.read(ROUTER_PATH)).body : null;
  let commandTable = null;
  if (routerBody != null) {
    const rows = parseTable(routerBody, 'Command');
    if (rows) {
      commandTable = new Map();
      for (const [cmd, owner] of rows) {
        if (/^commands\/[^/]+\.md$/.test(cmd)) commandTable.set(cmd, owner);
      }
      if (commandTable.size === 0) commandTable = null;
    }
  }

  // `Owns command: /ptp:<name>` declarations, read from the owner's side.
  const declarations = new Map(); // command name -> [skill paths]
  for (const f of skillFiles) {
    const body = splitFrontmatter(tree.read(f)).body;
    const re = /Owns command:\s*\/ptp:([A-Za-z0-9_-]+)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      if (!declarations.has(m[1])) declarations.set(m[1], []);
      const list = declarations.get(m[1]);
      if (!list.includes(f)) list.push(f);
    }
  }
  for (const [name, owners] of declarations) {
    if (owners.length > 1) {
      add(`commands/${name}.md`, 'command-owner-map',
        `budget=exactly one declaring skill; measured=${owners.length} (${owners.join(', ')})`);
    }
  }

  const owners = new Map();
  for (const cmd of commandFiles) {
    const name = cmd.replace(/^commands\//, '').replace(/\.md$/, '');
    const conventional = `skills/ptp-${name}/SKILL.md`;
    const hasConventional = tree.hasDir(`skills/ptp-${name}`) && tree.hasFile(conventional);
    let owner;
    if (commandTable && commandTable.has(cmd)) {
      owner = commandTable.get(cmd);
    } else if (commandTable && !commandTable.has(cmd)) {
      add(cmd, 'command-owner-map', 'budget=listed in the ptp router command table; measured=absent');
      owner = hasConventional ? conventional : cmd;
    } else {
      owner = hasConventional ? conventional : cmd;
    }
    if (owner !== cmd && !tree.hasFile(owner)) {
      add(cmd, 'command-owner-map', `budget=owner file exists; measured=missing ${owner}`);
      owner = cmd;
    }
    // Owner-side validation of the mapping.
    const declaredBy = declarations.get(name) || [];
    if (owner === cmd && declaredBy.length > 0) {
      add(cmd, 'command-owner-map',
        `budget=a declared command is not an owner command; measured=self-mapped but declared by ${declaredBy.join(', ')}`);
    }
    if (owner !== cmd && owner !== conventional && !declaredBy.includes(owner)) {
      add(cmd, 'command-owner-map',
        `budget=explicit owner declares "Owns command: /ptp:${name}"; measured=no declaration in ${owner}`);
    }
    owners.set(cmd, owner);
  }

  const ordinary = [];
  for (const cmd of commandFiles) if (owners.get(cmd) !== cmd) ordinary.push(cmd);

  // --- command bodies -------------------------------------------------------
  for (const cmd of commandFiles) {
    const body = splitFrontmatter(tree.read(cmd)).body;
    const words = wordCount(body);
    const owner = owners.get(cmd);
    const isOrdinary = owner !== cmd;

    if (words > ORDINARY_BODY_MAX && !isExempt(cmd, 'ordinary-command-body')) {
      add(cmd, 'ordinary-command-body', `budget=<=${ORDINARY_BODY_MAX} words; measured=${words} words`);
    }
    if (!isOrdinary && !isExempt(cmd, 'ordinary-command-body')) {
      add(cmd, 'owner-command-unlisted',
        'budget=owner command listed in the exemption allowlist; measured=absent');
    }
    if (!isOrdinary) continue;

    const sections = topSections(body);
    const sameShape = sections.length === ORDINARY_SECTIONS.length
      && sections.every((s, i) => s === ORDINARY_SECTIONS[i]);
    if (!sameShape) {
      add(cmd, 'ordinary-command-shape',
        `budget=${ORDINARY_SECTIONS.map((s) => `## ${s}`).join(', ')} in order and nothing else; measured=${sections.length ? sections.map((s) => `## ${s}`).join(', ') : 'no top-level sections'}`);
    }

    const invocations = [];
    for (const raw of body.split('\n')) {
      const m = /^Invoke the `([a-z0-9-]+)` skill \(`skills\/([a-z0-9-]+)\/SKILL\.md`\)\.$/.exec(raw.trim());
      if (m && m[1] === m[2]) invocations.push(`skills/${m[1]}/SKILL.md`);
    }
    if (invocations.length !== 1) {
      add(cmd, 'ordinary-command-shape',
        `budget=exactly one owning-skill invocation reference; measured=${invocations.length}`);
    } else if (invocations[0] !== owner) {
      add(cmd, 'ordinary-command-shape',
        `budget=invocation names the resolved owner ${owner}; measured=${invocations[0]}`);
    }

    const report = sectionBody(body, 'Report');
    if (report == null) {
      add(cmd, 'ordinary-command-shape', 'budget=## Report section present; measured=absent');
    } else {
      const missing = [];
      if (!/change id/i.test(report)) missing.push('change id');
      if (!/\bstate\b/i.test(report)) missing.push('state');
      if (!/failure/i.test(report)) missing.push('failures');
      if (!/next command/i.test(report)) missing.push('next command');
      if (missing.length) {
        add(cmd, 'ordinary-command-shape',
          `budget=report names change id, state, failures, next command; measured=missing ${missing.join(', ')}`);
      }
    }
  }

  // An `ordinary-command-body` exemption is valid only for an owner command.
  for (const e of allowlist) {
    if (!e || e.rule !== 'ordinary-command-body' || typeof e.file !== 'string') continue;
    if (!owners.has(e.file)) {
      add(e.file, 'allowlist-entry',
        'budget=ordinary-command-body exemption names an existing command; measured=no such command');
      continue;
    }
    if (owners.get(e.file) !== e.file) {
      add(e.file, 'allowlist-entry',
        `budget=ordinary-command-body exemption only for an owner command; measured=owned by ${owners.get(e.file)}`);
    }
  }

  // --- skill and agent bodies ----------------------------------------------
  for (const f of skillFiles) {
    const words = wordCount(splitFrontmatter(tree.read(f)).body);
    if (f === ROUTER_PATH) {
      if (words > ROUTER_BODY_MAX) {
        add(f, 'router-body', `budget=<=${ROUTER_BODY_MAX} words; measured=${words} words`);
      }
    }
    if (words > SKILL_BODY_MAX) {
      add(f, 'skill-body', `budget=<=${SKILL_BODY_MAX} words; measured=${words} words`);
    }
  }
  for (const f of agentFiles) {
    const body = splitFrontmatter(tree.read(f)).body;
    const words = wordCount(body);
    if (words > AGENT_BODY_MAX) {
      add(f, 'agent-body', `budget=<=${AGENT_BODY_MAX} words; measured=${words} words`);
    }
    const expected = AGENT_SECTIONS[f];
    if (expected) {
      const sections = topSections(body);
      const ok = sections.length === expected.length && sections.every((s, i) => s === expected[i]);
      if (!ok) {
        add(f, 'agent-shape',
          `budget=${expected.map((s) => `## ${s}`).join(', ')} in order and nothing else; measured=${sections.length ? sections.map((s) => `## ${s}`).join(', ') : 'no top-level sections'}`);
      }
    }
  }

  // --- policy index ---------------------------------------------------------
  let policyRows = null;
  if (routerBody != null) {
    const rows = parseTable(routerBody, 'Policy');
    if (rows && rows.length) policyRows = rows;
  }
  if (!policyRows) {
    add(ROUTER_PATH, 'policy-index',
      `budget=policy index naming all ${POLICIES.length} policies; measured=absent or unparseable`);
  } else {
    const seen = new Map();
    for (const [policy, owner] of policyRows) {
      const key = policy.toLowerCase();
      if (seen.has(key)) {
        add(ROUTER_PATH, 'policy-index', `budget=one row per policy; measured=duplicate row "${policy}"`);
        continue;
      }
      seen.set(key, owner);
    }
    const expected = new Set(POLICIES.map((p) => p.toLowerCase()));
    for (const key of seen.keys()) {
      if (!expected.has(key)) {
        add(ROUTER_PATH, 'policy-index', `budget=closed set of ${POLICIES.length} policies; measured=unknown policy "${key}"`);
      }
    }
    for (const p of POLICIES) {
      if (!seen.has(p.toLowerCase())) {
        add(ROUTER_PATH, 'policy-index', `budget=policy indexed; measured=missing "${p}"`);
      }
    }
    // Heading resolution and uniqueness.
    for (const p of POLICIES) {
      const owner = seen.get(p.toLowerCase());
      if (!owner) continue;
      if (!tree.hasFile(owner)) {
        add(ROUTER_PATH, 'policy-index', `budget=owner file exists for "${p}"; measured=missing ${owner}`);
        continue;
      }
      const carriers = [];
      for (const f of [].concat(commandFiles, skillFiles, referenceFiles, agentFiles)) {
        const body = splitFrontmatter(tree.read(f)).body;
        if (headings(body).some((h) => h.text.toLowerCase() === p.toLowerCase())) carriers.push(f);
      }
      if (!carriers.includes(owner)) {
        add(owner, 'policy-index', `budget=owner carries "${p}" as a section heading; measured=absent`);
      }
      for (const c of carriers) {
        if (c !== owner) {
          add(c, 'policy-index', `budget=only ${owner} carries the "${p}" heading; measured=duplicate heading`);
        }
      }
    }
  }

  return { violations, ordinary, owners, descWords, skillTotal, commandTotal };
}

// ---------------------------------------------------------------------------
// Self-test fixtures
// ---------------------------------------------------------------------------

function fm(desc, body) {
  return `---\nname: x\ndescription: ${desc}\n---\n\n${body}`;
}

const GOOD_DESC = 'Routes one narrow request to its owning contract and reports the resulting state back to the caller';

function words(n) {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

const FRONT_DOOR_BODY = [
  '## Arguments',
  '',
  'Takes an optional change selector.',
  '',
  '## Owner',
  '',
  'Invoke the `ptp-demo` skill (`skills/ptp-demo/SKILL.md`).',
  '',
  '## Report',
  '',
  'Report the change id, the resulting state, any failures, and the next command.',
].join('\n');

function baseFiles() {
  const files = {};
  files['commands/demo.md'] = fm(GOOD_DESC, FRONT_DOOR_BODY);
  files['commands/effort.md'] = fm(GOOD_DESC, '## Model + effort rubric\n\nOwner of the rubric. SHALL pick a model.\n');
  files['skills/ptp-demo/SKILL.md'] = fm(GOOD_DESC, '## Contract\n\nBody.\n');
  files['skills/ptp-review-loop/SKILL.md'] = fm(GOOD_DESC, '## Review severity behavior\n\nText.\n\n## Terminal states\n\nText.\n');
  files['skills/ptp-branch-guard/SKILL.md'] = fm(GOOD_DESC, '## Branch safety\n\nText.\n');
  files['skills/ptp-run-at-model/SKILL.md'] = fm(GOOD_DESC, '## Model dispatch\n\nText.\n');
  files['skills/ptp-codex-mode/SKILL.md'] = fm(GOOD_DESC, '## Codex mode resolution\n\nText.\n');
  files['skills/ptp-change-selector/SKILL.md'] = fm(GOOD_DESC, '## Selector grammar\n\nText.\n');
  files['skills/ptp/SKILL.md'] = fm(GOOD_DESC, [
    '## Commands',
    '',
    '| Command | Owner |',
    '|---|---|',
    '| `commands/demo.md` | `skills/ptp-demo/SKILL.md` |',
    '| `commands/effort.md` | `commands/effort.md` |',
    '',
    '## Policies',
    '',
    '| Policy | Owner |',
    '|---|---|',
    '| Model + effort rubric | `commands/effort.md` |',
    '| Review severity behavior | `skills/ptp-review-loop/SKILL.md` |',
    '| Branch safety | `skills/ptp-branch-guard/SKILL.md` |',
    '| Model dispatch | `skills/ptp-run-at-model/SKILL.md` |',
    '| Terminal states | `skills/ptp-review-loop/SKILL.md` |',
    '| Codex mode resolution | `skills/ptp-codex-mode/SKILL.md` |',
    '| Selector grammar | `skills/ptp-change-selector/SKILL.md` |',
  ].join('\n'));
  files['agents/ptp-apply.md'] = fm(GOOD_DESC, '## Inputs\n\nX.\n\n## Task\n\nY.\n\n## Return\n\nZ.\n');
  files['agents/ptp-review.md'] = fm(GOOD_DESC, '## Inputs\n\nX.\n\n## Scope\n\nW.\n\n## Task\n\nY.\n\n## Return\n\nZ.\n');
  return files;
}

const BASE_ALLOWLIST = [
  { file: 'commands/effort.md', rule: 'ordinary-command-body', reason: 'owner command in the fixture tree' },
];

function fixtures() {
  const list = [];
  const push = (name, rule, expectViolation, mutate, allowlist) => {
    const files = baseFiles();
    const dirs = [];
    if (mutate) mutate(files, dirs);
    list.push({ name, rule, expectViolation, files, dirs, allowlist: allowlist || BASE_ALLOWLIST });
  };

  // clean baseline for every rule
  for (const rule of ['description-present', 'description-max', 'description-form',
    'skill-description-total', 'command-description-total', 'ordinary-command-body',
    'ordinary-command-shape', 'owner-command-unlisted', 'command-owner-map', 'router-body',
    'skill-body', 'agent-body', 'agent-shape', 'policy-index', 'allowlist-entry']) {
    push(`clean/${rule}`, rule, false, null);
  }

  // malformed-input tolerance (all must stay clean and must not throw)
  push('no frontmatter file', 'description-present', true, (f) => {
    f['commands/demo.md'] = FRONT_DOOR_BODY;
  });
  push('quoted block scalar description', 'description-present', false, (f) => {
    f['commands/demo.md'] = `---\nname: x\ndescription: |\n  "${GOOD_DESC}"\n---\n\n${FRONT_DOOR_BODY}`;
  });
  push('multi-line description', 'description-present', false, (f) => {
    f['commands/demo.md'] = `---\nname: x\ndescription: Routes one narrow request to its owning\n  contract and reports the resulting state back to the caller\n---\n\n${FRONT_DOOR_BODY}`;
  });
  push('missing description key', 'description-present', true, (f) => {
    f['commands/demo.md'] = `---\nname: x\n---\n\n${FRONT_DOOR_BODY}`;
  });
  push('zero-word description', 'description-present', true, (f) => {
    f['commands/demo.md'] = `---\nname: x\ndescription:\n---\n\n${FRONT_DOOR_BODY}`;
  });
  push('skill directory with no references folder', 'skill-body', false, (f, d) => {
    d.push('skills/ptp-demo');
  });

  // description-max
  push('30-word description', 'description-max', true, (f) => {
    f['commands/demo.md'] = fm(words(30), FRONT_DOOR_BODY);
  });

  // description-form
  push('bulleted list in description', 'description-form', true, (f) => {
    f['commands/demo.md'] = `---\nname: x\ndescription: |\n  Routes a request and reports the state back\n  - first bullet item here\n  - second bullet item here\n---\n\n${FRONT_DOOR_BODY}`;
  });
  push('out-of-allowlist all-caps token', 'description-form', true, (f) => {
    f['commands/demo.md'] = fm('Routes one narrow request to its owning contract and reports ITERATION CAP REACHED back to the caller', FRONT_DOOR_BODY);
  });
  push('mid-value sentence terminator', 'description-form', true, (f) => {
    f['commands/demo.md'] = fm('Routes one narrow request. Reports the resulting state back to the caller for the next step', FRONT_DOOR_BODY);
  });
  push('allowlisted acronym stays clean', 'description-form', false, (f) => {
    f['commands/demo.md'] = fm('Routes one narrow request through the CLI to its owning contract and reports the resulting state', FRONT_DOOR_BODY);
  });

  // inventory totals
  push('skill description inventory over budget', 'skill-description-total', true, (f) => {
    for (let i = 0; i < 40; i += 1) {
      f[`skills/ptp-bulk${i}/SKILL.md`] = fm(words(25), '## Contract\n\nText.\n');
    }
  });
  push('command description inventory over budget', 'command-description-total', true, (f) => {
    for (let i = 0; i < 40; i += 1) {
      f[`commands/bulk${i}.md`] = fm(words(25), FRONT_DOOR_BODY.replace('ptp-demo', 'ptp-demo'));
      f[`skills/ptp-bulk${i}/SKILL.md`] = fm(GOOD_DESC, '## Contract\n\nText.\n');
    }
  });

  // bodies
  push('400-word ordinary command body', 'ordinary-command-body', true, (f) => {
    f['commands/demo.md'] = fm(GOOD_DESC, `${FRONT_DOOR_BODY}\n\n${words(400)}`);
  });
  push('11,000-word SKILL.md', 'skill-body', true, (f) => {
    f['skills/ptp-demo/SKILL.md'] = fm(GOOD_DESC, `## Contract\n\n${words(11000)}\n`);
  });
  push('2,000-word agent file', 'agent-body', true, (f) => {
    f['agents/ptp-apply.md'] = fm(GOOD_DESC, `## Inputs\n\n${words(2000)}\n\n## Task\n\nY.\n\n## Return\n\nZ.\n`);
  });
  push('700-word skills/ptp/SKILL.md', 'router-body', true, (f) => {
    f['skills/ptp/SKILL.md'] = f['skills/ptp/SKILL.md'].replace('## Policies', `${words(700)}\n\n## Policies`);
  });

  // shapes
  push('ordinary command with a fourth section', 'ordinary-command-shape', true, (f) => {
    f['commands/demo.md'] = fm(GOOD_DESC, `${FRONT_DOOR_BODY}\n\n## Notes\n\nExtra.\n`);
  });
  push('agent file with an out-of-schema section', 'agent-shape', true, (f) => {
    f['agents/ptp-review.md'] = fm(GOOD_DESC, '## Inputs\n\nX.\n\n## Scope\n\nW.\n\n## Task\n\nY.\n\n## Return\n\nZ.\n\n## History\n\nNarration.\n');
  });

  // router fallbacks
  push('router with no command table', 'policy-index', false, (f) => {
    f['skills/ptp/SKILL.md'] = f['skills/ptp/SKILL.md']
      .replace(/## Commands[\s\S]*?\n\n## Policies/, '## Policies');
  });
  push('router with no policy index', 'policy-index', true, (f) => {
    f['skills/ptp/SKILL.md'] = f['skills/ptp/SKILL.md'].replace(/## Policies[\s\S]*$/, '');
  });
  push('indexed policy heading in two files', 'policy-index', true, (f) => {
    f['skills/ptp-demo/SKILL.md'] = fm(GOOD_DESC, '## Contract\n\nBody.\n\n## Terminal states\n\nCopy.\n');
  });

  // owner map
  push('declared command that self-maps', 'command-owner-map', true, (f) => {
    f['skills/ptp-demo/SKILL.md'] = fm(GOOD_DESC, '## Contract\n\nOwns command: /ptp:effort\n');
  });
  push('explicit owner without a declaration', 'command-owner-map', true, (f) => {
    f['skills/ptp/SKILL.md'] = f['skills/ptp/SKILL.md']
      .replace('| `commands/effort.md` | `commands/effort.md` |', '| `commands/effort.md` | `skills/ptp-demo/SKILL.md` |');
  });
  push('command declared by two skills', 'command-owner-map', true, (f) => {
    f['skills/ptp-branch-guard/SKILL.md'] = fm(GOOD_DESC, '## Branch safety\n\nOwns command: /ptp:demo\n');
    f['skills/ptp-run-at-model/SKILL.md'] = fm(GOOD_DESC, '## Model dispatch\n\nOwns command: /ptp:demo\n');
  });

  // owner command not listed
  push('owner command missing from the allowlist', 'owner-command-unlisted', true, null, []);

  // allowlist entry shape
  push('allowlist entry missing its rule', 'allowlist-entry', true, null,
    [{ file: 'commands/effort.md', reason: 'no rule key' }]);
  push('allowlist entry missing its reason', 'allowlist-entry', true, null,
    [{ file: 'commands/effort.md', rule: 'ordinary-command-body' }]);
  push('ordinary-command-body exemption for an owned command', 'allowlist-entry', true, null,
    [{ file: 'commands/effort.md', rule: 'ordinary-command-body', reason: 'ok' },
      { file: 'commands/demo.md', rule: 'ordinary-command-body', reason: 'not an owner command' }]);

  return list;
}

function runSelfTest() {
  const list = fixtures();
  let passed = 0;
  const failures = [];
  for (const fx of list) {
    let result;
    try {
      result = analyze(makeTree(fx.files, fx.dirs), fx.allowlist);
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

  if (argv.includes('--list-exempt')) {
    for (const e of EXEMPTIONS) {
      console.log(`${e.file}\t${e.rule}\t${e.reason}`);
    }
    return 0;
  }

  const tree = readRealTree(ROOT);
  const result = analyze(tree, EXEMPTIONS);

  if (argv.includes('--list-ordinary')) {
    for (const cmd of result.ordinary) console.log(`${cmd}\t${result.owners.get(cmd)}`);
    return 0;
  }

  for (const v of result.violations) {
    console.log(`${v.file}: ${v.rule}: ${v.message}`);
  }
  if (result.violations.length) {
    console.log(`${result.violations.length} violation(s)`);
    return 1;
  }
  console.log('all prompt-surface budgets hold');
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { analyze, makeTree, splitFrontmatter, readDescription, wordCount };
