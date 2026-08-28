#!/usr/bin/env node
/**
 * ptp-compact-lint — standalone, reporting-only compactness linter for the compact artifact
 * contract.
 *
 * Normative contract: `skills/ptp-artifact-contract/SKILL.md`. That skill owns every
 * compact-contract rule (ownership, must-not-contain, word budgets, shapes, the current-state-only
 * policy, and the contract version); this file is its one executable copy. Changing that skill and
 * changing this file is one change, never two. The CLI, exit codes, finding codes and severities,
 * emission order, output shape, and detection heuristics below belong to this file (the
 * `compactness-linter` capability) and are not restated by the owner skill.
 *
 * This script reads one OpenSpec change directory and reports contract violations. It is
 * deterministic and reporting-only: it creates, modifies, and deletes no file, spawns no
 * subprocess of any kind, and issues no version-control command.
 *
 * Invocation:
 *   node scripts/ptp-compact-lint.js --change <change-id> [--repo <root> | --workspace <root>]
 *                                    [--format=text|json] [--assume-contract=ptp-compact]
 *   node scripts/ptp-compact-lint.js --path <change-dir> [--format=text|json]
 *                                    [--assume-contract=ptp-compact]
 *
 * `--workspace` is an alias of `--repo`: both spellings, with a space or an `=`, write the same
 * root, and when both appear the last occurrence wins. `--path <change-dir>` bypasses the root.
 *
 * Exit codes: 0 whenever a report was produced (findings or not). 2 for a usage error, a missing or
 * unreadable change directory, an unreadable artifact, or an `.openspec.yaml` naming a schema that
 * is neither `ptp-compact` nor `spec-driven`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONTRACT_VERSION = 1;

const EFFORT_RE = /^(haiku|sonnet|opus)\.(low|medium|high|xhigh)$/;

const HISTORY_WORDS = [
  'Amendment',
  'Correction',
  'Previously',
  'Earlier draft',
  'Historical record',
  'What changed',
  'SUPERSEDED',
  'CORRECTED',
];

// §7.3 — exactly the seven phrase shapes tasks-authoring publishes.
const MANUAL_PHRASES = [
  'manual qa',
  'manual or exploratory testing',
  'manually verify',
  'verify by hand',
  'check in the browser',
  'have a human confirm',
  'ask the user to try',
];

// §7.1 — coverage heuristic stopword set.
const STOPWORDS = new Set([
  'shall', 'must', 'should', 'with', 'that', 'this', 'from', 'into', 'when', 'then', 'change',
  'changes', 'file', 'files', 'task', 'tasks', 'spec', 'specs', 'openspec', 'requirement',
  'requirements', 'ptp',
]);

// §7.2 — fixed heading-to-owner pairs.
const DUPLICATE_OWNERSHIP_PAIRS = [
  { headings: ['alternatives', 'alternatives considered'], owner: 'brainstorm.md', reportedIn: ['proposal.md'] },
  { headings: ['why', 'motivation'], owner: 'proposal.md', reportedIn: ['design.md', 'tasks.md'] },
  { headings: ['tasks', 'implementation plan'], owner: 'tasks.md', reportedIn: ['proposal.md', 'design.md'] },
  { headings: ['effort', 'model + effort'], owner: 'effort.md', reportedIn: ['proposal.md', 'design.md', 'tasks.md'] },
];

// §7 — DESIGN_EMPTY: headings naming a category design.md owns.
const DESIGN_OWNED_HEADINGS = [
  'decisions', 'alternatives', 'alternatives considered', 'invariants', 'invariants / flow',
  'interfaces', 'data flow', 'failure', 'migration', 'risks',
];

// §2 — soft word budgets.
const BUDGETS = {
  'proposal.md': 400,
  'design.md': 800,
  'tasks.md': 600,
  'prd.md': 1200,
};

const CHECKBOX_MIN = 5;
const CHECKBOX_MAX = 15;
const CHECKBOX_WORD_LIMIT = 60;

const CODE_ORDER = [
  'TLDR_PRESENT',
  'EFFORT_FORMAT',
  'HISTORY_SECTION',
  'REQUIREMENT_UNCOVERED',
  'DUPLICATE_OWNERSHIP',
  'TASK_RATIONALE_HEAVY',
  'DESIGN_EMPTY',
  'TASK_MANUAL_PHRASE',
  'BUDGET_OVERRUN',
];

const SEVERITY = {
  TLDR_PRESENT: 'high',
  EFFORT_FORMAT: 'high',
  HISTORY_SECTION: 'high',
  REQUIREMENT_UNCOVERED: 'high',
  DUPLICATE_OWNERSHIP: 'medium',
  TASK_RATIONALE_HEAVY: 'medium',
  DESIGN_EMPTY: 'low',
  TASK_MANUAL_PHRASE: 'low',
  BUDGET_OVERRUN: 'low',
};

function usageError(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), format: 'text' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--change') {
      args.change = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--change=')) {
      args.change = arg.slice('--change='.length);
    } else if (arg === '--path') {
      args.path = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--path=')) {
      args.path = arg.slice('--path='.length);
    } else if (arg === '--repo') {
      args.repo = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--repo=')) {
      args.repo = arg.slice('--repo='.length);
    } else if (arg === '--workspace') {
      // Alias of --repo, writing the same root. `--repo` already names the REPOSITORY root in
      // scripts/ptp-otel-sink.js, so the workspace spelling exists rather than a rename. When both
      // appear the last occurrence wins, which is this loop's existing behavior for a repeated flag.
      args.repo = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--workspace=')) {
      args.repo = arg.slice('--workspace='.length);
    } else if (arg.startsWith('--format=')) {
      args.format = arg.slice('--format='.length);
    } else if (arg.startsWith('--assume-contract=')) {
      args.assumeContract = arg.slice('--assume-contract='.length);
    } else {
      usageError('Unknown argument: ' + arg);
    }
  }
  return args;
}

function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, '\n');
}

function readFileIfExists(dir, name) {
  const full = path.join(dir, name);
  if (!fs.existsSync(full)) return null;
  try {
    return normalizeLineEndings(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    usageError('Unable to read artifact: ' + full + ' (' + err.message + ')');
    return null;
  }
}

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

// --- Word counting (§7.4) ---

function stripFencedCodeAndComments(text) {
  // Extract HTML comments first (needed separately for the budget-exception marker), then remove
  // fenced code blocks, then remove the comments from the remaining text.
  const comments = [];
  const commentRe = /<!--[\s\S]*?-->/g;
  let match;
  while ((match = commentRe.exec(text)) !== null) {
    comments.push(match[0]);
  }
  let stripped = text.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ');
  stripped = stripped.replace(commentRe, ' ');
  return { stripped, comments };
}

function countWords(text) {
  const { stripped } = stripFencedCodeAndComments(text);
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 0);
  return tokens.length;
}

function findBudgetException(text) {
  const { comments } = stripFencedCodeAndComments(text);
  for (const comment of comments) {
    const m = comment.match(/<!--\s*budget-exception:\s*(.*?)\s*-->/);
    if (m) {
      const reason = m[1].trim();
      return { present: true, reason };
    }
  }
  return { present: false, reason: '' };
}

// --- Checkbox parsing ---

function extractCheckboxes(tasksText) {
  const lines = tasksText.split('\n');
  const boxes = [];
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = line.match(/^- \[[ xX]\]\s*(.*)$/);
    if (m) {
      if (current) boxes.push(current);
      current = { startLine: i + 1, lines: [line] };
    } else if (current) {
      if (/^\s+\S/.test(line)) {
        current.lines.push(line);
      } else if (line.trim() === '') {
        // allow blank lines within a checkbox's continuation region only if followed by more indent;
        // otherwise this checkbox is done. We look ahead conservatively: treat blank line as end.
        boxes.push(current);
        current = null;
      } else {
        boxes.push(current);
        current = null;
      }
    }
  }
  if (current) boxes.push(current);
  return boxes;
}

function checkboxText(box) {
  return box.lines.join('\n');
}

function checkboxWordCount(box) {
  return countWords(checkboxText(box));
}

// --- Findings collection ---

function makeFinding(code, artifact, line, message) {
  return { code, severity: SEVERITY[code], artifact, line: line === undefined ? null : line, message };
}

function sortFindings(findings) {
  return findings.slice().sort((a, b) => {
    const ai = CODE_ORDER.indexOf(a.code);
    const bi = CODE_ORDER.indexOf(b.code);
    if (ai !== bi) return ai - bi;
    if (a.artifact !== b.artifact) return a.artifact < b.artifact ? -1 : 1;
    const al = a.line === null ? -1 : a.line;
    const bl = b.line === null ? -1 : b.line;
    return al - bl;
  });
}

function headingsInText(text) {
  // Returns [{ level, text, line }] for '##'-level markdown headings and bold lead-ins.
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, idx) => {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      out.push({ text: headingMatch[1].trim(), line: idx + 1, kind: 'heading' });
    }
    const boldMatch = line.match(/^\*\*(.+?)\*\*\s*:?\s*$/);
    if (boldMatch) {
      out.push({ text: boldMatch[1].trim(), line: idx + 1, kind: 'bold' });
    }
  });
  return out;
}

function lintChange(dir, changeLabel, assumeContract) {
  const findings = [];
  const notes = [];

  // --- Contract gate ---
  const openspecYamlPath = path.join(dir, '.openspec.yaml');
  let schemaName = null;
  if (fs.existsSync(openspecYamlPath)) {
    let raw;
    try {
      raw = normalizeLineEndings(fs.readFileSync(openspecYamlPath, 'utf8'));
    } catch (err) {
      usageError('Unable to read .openspec.yaml: ' + err.message);
      return null;
    }
    const m = raw.match(/^schema:\s*(\S+)\s*$/m);
    schemaName = m ? m[1] : null;
  }

  let contract;
  let assumed = false;
  let skipped = false;
  let contractVersion = null;

  if (assumeContract === 'ptp-compact') {
    contract = 'ptp-compact';
    assumed = true;
    contractVersion = CONTRACT_VERSION;
  } else if (schemaName === 'ptp-compact') {
    contract = 'ptp-compact';
    contractVersion = CONTRACT_VERSION;
  } else if (schemaName === null || schemaName === 'spec-driven') {
    contract = 'legacy';
    skipped = true;
  } else {
    usageError('Unsupported schema recorded in .openspec.yaml: ' + schemaName);
    return null;
  }

  if (skipped) {
    return {
      contract,
      contractVersion,
      change: changeLabel,
      path: dir,
      skipped: true,
      assumed,
      findings: [],
      notes: [],
      summary: { high: 0, medium: 0, low: 0 },
    };
  }

  // --- Read artifacts ---
  const proposal = readFileIfExists(dir, 'proposal.md');
  const design = readFileIfExists(dir, 'design.md');
  const tasks = readFileIfExists(dir, 'tasks.md');
  const effort = readFileIfExists(dir, 'effort.md');
  const tldrPath = path.join(dir, 'TLDR.md');

  const allArtifactFiles = walkFiles(dir).filter((f) => {
    const rel = toPosix(path.relative(dir, f));
    return rel.endsWith('.md') && rel !== '.openspec.yaml';
  });

  const artifactTexts = {};
  for (const full of allArtifactFiles) {
    const rel = toPosix(path.relative(dir, full));
    try {
      artifactTexts[rel] = normalizeLineEndings(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      usageError('Unable to read artifact: ' + full + ' (' + err.message + ')');
      return null;
    }
  }

  // 1. TLDR_PRESENT
  if (fs.existsSync(tldrPath)) {
    findings.push(makeFinding('TLDR_PRESENT', 'TLDR.md', null, 'TLDR.md exists in the change directory; the compact contract creates no TLDR.md.'));
  }

  // 2. EFFORT_FORMAT
  {
    let content = effort;
    let fails = false;
    if (content === null) {
      fails = true;
    } else {
      let whole = content;
      if (whole.endsWith('\n')) whole = whole.slice(0, -1);
      if (!EFFORT_RE.test(whole)) fails = true;
    }
    if (fails) {
      findings.push(makeFinding('EFFORT_FORMAT', 'effort.md', null, 'effort.md is absent or its whole content does not match ^(haiku|sonnet|opus)\\.(low|medium|high|xhigh)$ with no second line.'));
    }
  }

  // 3. HISTORY_SECTION
  for (const [rel, text] of Object.entries(artifactTexts)) {
    const headings = headingsInText(text);
    for (const h of headings) {
      for (const word of HISTORY_WORDS) {
        const re = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (re.test(h.text)) {
          findings.push(makeFinding(
            'HISTORY_SECTION',
            rel,
            h.line,
            'Heading/lead-in matches a history/amendment signal ("' + word + '") — heading signal — a migration- or compatibility-dependent historical fact is permitted; check before editing.'
          ));
          break;
        }
      }
    }
  }

  // 4. REQUIREMENT_UNCOVERED
  const tasksText = tasks || '';
  const taskLines = tasksText.split('\n').filter((l) => /^- \[[ xX]\]/.test(l));
  function tokenize(s) {
    return s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  }
  const specFiles = allArtifactFiles.filter((f) => {
    const rel = toPosix(path.relative(dir, f));
    return /^specs\/.*\/spec\.md$/.test(rel);
  });
  for (const full of specFiles) {
    const rel = toPosix(path.relative(dir, full));
    const text = artifactTexts[rel];
    const capabilityDir = rel.split('/')[1];
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      const m = line.match(/^###\s+Requirement:\s*(.*)$/);
      if (!m) return;
      const reqTokens = tokenize(m[1]);
      let covered = false;
      for (const taskLine of taskLines) {
        if (capabilityDir && taskLine.toLowerCase().includes(capabilityDir.toLowerCase())) {
          covered = true;
          break;
        }
        const taskTokens = new Set(tokenize(taskLine));
        let shared = 0;
        for (const t of reqTokens) {
          if (taskTokens.has(t)) shared += 1;
        }
        if (shared >= 2) {
          covered = true;
          break;
        }
      }
      if (!covered) {
        findings.push(makeFinding(
          'REQUIREMENT_UNCOVERED',
          rel,
          idx + 1,
          'Requirement "' + m[1].trim() + '" has no tasks.md checkbox sharing at least two distinctive tokens or the capability directory name (heuristic).'
        ));
      }
    });
  }

  // 5. DUPLICATE_OWNERSHIP
  for (const [rel, text] of Object.entries(artifactTexts)) {
    if (!DUPLICATE_OWNERSHIP_PAIRS.some((p) => p.reportedIn.includes(rel))) continue;
    const headings = headingsInText(text).filter((h) => h.kind === 'heading');
    for (const h of headings) {
      const lower = h.text.toLowerCase();
      for (const pair of DUPLICATE_OWNERSHIP_PAIRS) {
        if (!pair.reportedIn.includes(rel)) continue;
        if (pair.headings.includes(lower)) {
          findings.push(makeFinding(
            'DUPLICATE_OWNERSHIP',
            rel,
            h.line,
            'Heading "' + h.text + '" is owned by ' + pair.owner + ' and should not appear in ' + rel + '.'
          ));
        }
      }
    }
  }

  // 6. TASK_RATIONALE_HEAVY
  if (tasks !== null) {
    const boxes = extractCheckboxes(tasks);
    for (const box of boxes) {
      const words = checkboxWordCount(box);
      if (words > CHECKBOX_WORD_LIMIT) {
        findings.push(makeFinding(
          'TASK_RATIONALE_HEAVY',
          'tasks.md',
          box.startLine,
          'Checkbox exceeds the 60-word limit (' + words + ' words); the excess is rationale that design.md or proposal.md owns.'
        ));
      }
    }
  }

  // 7. DESIGN_EMPTY
  if (design !== null) {
    const headings = headingsInText(design).filter((h) => h.kind === 'heading');
    const hasOwnedContent = headings.some((h) => DESIGN_OWNED_HEADINGS.includes(h.text.toLowerCase()));
    if (!hasOwnedContent) {
      findings.push(makeFinding(
        'DESIGN_EMPTY',
        'design.md',
        null,
        'design.md exists but carries no non-empty content under any heading design.md owns (Decisions, Alternatives, Invariants, Interfaces, Data flow, Failure, Migration, Risks).'
      ));
    }
  }

  // 8. TASK_MANUAL_PHRASE
  if (tasks !== null) {
    const boxes = extractCheckboxes(tasks);
    for (const box of boxes) {
      const text = checkboxText(box).toLowerCase();
      const matched = MANUAL_PHRASES.some((phrase) => text.includes(phrase));
      if (matched) {
        findings.push(makeFinding(
          'TASK_MANUAL_PHRASE',
          'tasks.md',
          box.startLine,
          'Checkbox matches a manual-task phrase signal — phrase signal only — the rule is the executor test owned by tasks-authoring / manual-task-rubric; absence of this finding is not evidence of compliance.'
        ));
      }
    }
  }

  // 9. BUDGET_OVERRUN
  for (const [artifactName, budget] of Object.entries(BUDGETS)) {
    const text = artifactTexts[artifactName];
    if (text === undefined) continue;
    const words = countWords(text);
    const exception = findBudgetException(text);
    if (words > budget) {
      if (exception.present && exception.reason) {
        notes.push({ artifact: artifactName, reason: exception.reason });
      } else {
        findings.push(makeFinding(
          'BUDGET_OVERRUN',
          artifactName,
          null,
          artifactName + ' is ' + words + ' words, over its ' + budget + '-word soft budget, with no budget-exception marker.'
        ));
      }
    }
  }
  if (tasks !== null) {
    const boxes = extractCheckboxes(tasks);
    if (boxes.length < CHECKBOX_MIN || boxes.length > CHECKBOX_MAX) {
      const exception = findBudgetException(tasks);
      if (exception.present && exception.reason) {
        notes.push({ artifact: 'tasks.md', reason: exception.reason });
      } else {
        findings.push(makeFinding(
          'BUDGET_OVERRUN',
          'tasks.md',
          null,
          'tasks.md has ' + boxes.length + ' checkboxes, outside the 5-15 range, with no budget-exception marker.'
        ));
      }
    }
  }

  const sorted = sortFindings(findings);
  const summary = { high: 0, medium: 0, low: 0 };
  for (const f of sorted) {
    summary[f.severity] += 1;
  }

  return {
    contract,
    contractVersion,
    change: changeLabel,
    path: dir,
    skipped: false,
    assumed,
    findings: sorted,
    notes,
    summary,
  };
}

function printText(report) {
  const lines = [];
  if (report.skipped) {
    lines.push('Change is legacy (contract: ' + report.contract + '); linter skipped — no findings reported.');
  } else {
    for (const f of report.findings) {
      const loc = f.artifact + (f.line !== null ? ':' + f.line : '');
      lines.push(f.severity + ' ' + f.code + ' ' + loc + ' — ' + f.message);
    }
    for (const n of report.notes) {
      lines.push('note ' + n.artifact + ' — budget exception: ' + n.reason);
    }
    lines.push(
      'summary: high=' + report.summary.high + ' medium=' + report.summary.medium + ' low=' + report.summary.low
    );
  }
  process.stdout.write(lines.join('\n') + '\n');
}

function printJson(report) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.change && !args.path) {
    usageError('Usage: ptp-compact-lint.js (--change <id> | --path <dir>) [--repo <root> | --workspace <root>] [--format=text|json] [--assume-contract=ptp-compact]');
    return;
  }

  let dir;
  let label;
  if (args.path) {
    dir = args.path;
    label = path.basename(args.path);
  } else {
    dir = path.join(args.repo, 'openspec', 'changes', args.change);
    label = args.change;
  }

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    usageError('Change directory not found: ' + dir);
    return;
  }

  const format = args.format || 'text';
  if (format !== 'text' && format !== 'json') {
    usageError('Unsupported --format: ' + format);
    return;
  }

  const report = lintChange(dir, label, args.assumeContract);
  if (report === null) return; // usageError already exited

  if (format === 'json') {
    printJson(report);
  } else {
    printText(report);
  }
  process.exit(0);
}

main();
