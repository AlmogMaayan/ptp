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

// ptp-workspace's layered configuration contract, executable half. The six `artifact.*` budget keys
// are resolved through it; the owner skill states their defaults and that they are acceptance
// criteria, and this file states none of that.
const { configLayers, resolveConfigKey, REJECT } = require('./ptp-resolve-workspace.js');

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

// §2 — budgets. The four KEYED budgets are acceptance criteria: the `budget-exception` marker does
// not excuse them, and a breach is reported as BUDGET_EXCEEDED (high). `prd.md` keeps the soft
// posture, where the marker converts a breach into a note (BUDGET_OVERRUN, low).
const KEYED_BUDGETS = [
  { artifact: 'proposal.md', key: 'artifact.maxProposalWords', fallback: 400 },
  { artifact: 'design.md', key: 'artifact.maxDesignWords', fallback: 800 },
  { artifact: 'tasks.md', key: 'artifact.maxTasksWords', fallback: 600 },
  { artifact: 'specs/**/spec.md', key: 'artifact.maxSpecDeltaWords', fallback: 1200 },
];

const SOFT_BUDGETS = {
  'prd.md': 1200,
};

// A RED declaration must name what breaks and the change that closes it: the contiguous-group rule
// the contract owner states is unenforceable when the closing change is not identified.
const BUILD_STATE_RE = /^(GREEN|RED\s*[\u2014\u2013-]\s*\S.*\s+until\s+\S+)$/;

const CHECKBOX_MIN = 5;
const CHECKBOX_MAX_KEY = 'artifact.maxTaskCount';
const CHECKBOX_MAX_FALLBACK = 15;
const CHECKBOX_WORD_KEY = 'artifact.maxTaskWords';
const CHECKBOX_WORD_FALLBACK = 60;

/**
 * Resolve the six `artifact.*` budgets over the layered config. Forgiving, exactly like every other
 * ptp reader: a missing file, missing key, bad JSON, or non-positive / non-integer value leaves the
 * prior layer's value and finally the fallback. Never throws.
 */
function positiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : REJECT;
}

function resolveBudgets(repoRoot) {
  let layers;
  try {
    layers = configLayers({ repoRoot: repoRoot });
  } catch (err) {
    layers = [];
  }
  const pick = (key, fallback) => resolveConfigKey(layers, key, positiveInt, fallback).value;
  const out = { keyed: {}, checkboxMax: pick(CHECKBOX_MAX_KEY, CHECKBOX_MAX_FALLBACK), checkboxWords: pick(CHECKBOX_WORD_KEY, CHECKBOX_WORD_FALLBACK) };
  for (const row of KEYED_BUDGETS) out.keyed[row.artifact] = pick(row.key, row.fallback);
  return out;
}

const CODE_ORDER = [
  'TLDR_PRESENT',
  'EFFORT_FORMAT',
  'HISTORY_SECTION',
  'REQUIREMENT_UNCOVERED',
  'DUPLICATE_OWNERSHIP',
  'TASK_RATIONALE_HEAVY',
  'DESIGN_EMPTY',
  'TASK_MANUAL_PHRASE',
  'BUILD_STATE_MISSING',
  'BUDGET_EXCEEDED',
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
  BUILD_STATE_MISSING: 'high',
  BUDGET_EXCEEDED: 'high',
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

/**
 * Word count of one spec-delta file, excluding the VERBATIM reproduction inside its
 * `## MODIFIED Requirements` blocks. Reproducing an existing requirement in full is mandatory, so
 * that reproduced text is never counted against the delta budget — but text a MODIFIED block ADDS is
 * the change's own and counts like any other delta prose, or the block would be an unbudgeted
 * channel exactly like the one the delta budget exists to close.
 *
 * The verbatim test is line-level: a non-empty trimmed line inside a MODIFIED block is excluded only
 * when that same trimmed line occurs in the capability's CURRENT spec. `currentSpecText` of `null` —
 * a new capability, or a spec file that could not be read — excludes nothing, which is the
 * conservative direction. Splitting on top-level `##` headings, and the line-level comparison, are
 * this file's detection heuristics.
 */
function countSpecDeltaWords(text, currentSpecText) {
  const currentLines = new Set(
    String(currentSpecText || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  );
  const lines = text.split('\n');
  const kept = [];
  let inModified = false;
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) inModified = /^MODIFIED\s+Requirements\b/i.test(h[1].trim());
    if (!inModified) {
      kept.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (!currentLines.has(trimmed)) kept.push(line);
  }
  return countWords(kept.join('\n'));
}

/** The capability directory of a delta path `specs/<capability>/....md`, or null. */
function deltaCapability(relPath) {
  const m = relPath.match(/^specs\/([^/]+)\//);
  return m ? m[1] : null;
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

function lintChange(dir, changeLabel, assumeContract, budgets, repoRoot) {
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
      if (words > budgets.checkboxWords) {
        findings.push(makeFinding(
          'TASK_RATIONALE_HEAVY',
          'tasks.md',
          box.startLine,
          'Checkbox exceeds the ' + budgets.checkboxWords + '-word limit (' + words + ' words); the excess is rationale that design.md or proposal.md owns.'
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

  // 9. BUILD_STATE_MISSING — proposal.md's required one-line build-state declaration.
  if (proposal !== null) {
    const m = proposal.match(/^##\s+Build state\s*$/mi);
    let ok = false;
    if (m) {
      const after = proposal.slice(m.index + m[0].length);
      const body = after.split(/^##\s/m)[0].replace(/<!--[\s\S]*?-->/g, ' ');
      const declared = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      // Exactly one declaration line, and RED must name what breaks AND the change that closes it —
      // a bare `RED` leaves the contiguous group's closing change unidentifiable.
      ok = declared.length === 1 && BUILD_STATE_RE.test(declared[0]);
    }
    if (!ok) {
      findings.push(makeFinding(
        'BUILD_STATE_MISSING',
        'proposal.md',
        null,
        'proposal.md has no "## Build state" section whose body is exactly one line reading GREEN, or RED \u2014 <what breaks> until <change-id>.'
      ));
    }
  }

  // 10a. BUDGET_EXCEEDED — the keyed budgets. No exception marker excuses these.
  for (const artifactName of ['proposal.md', 'design.md', 'tasks.md']) {
    const text = artifactTexts[artifactName];
    if (text === undefined) continue;
    const budget = budgets.keyed[artifactName];
    const words = countWords(text);
    if (words > budget) {
      findings.push(makeFinding(
        'BUDGET_EXCEEDED',
        artifactName,
        null,
        artifactName + ' is ' + words + ' words, over its ' + budget + '-word budget. The budget is an acceptance criterion: remove text, or split the change.'
      ));
    }
  }
  {
    const deltaFiles = Object.keys(artifactTexts).filter((rel) => rel.startsWith('specs/') && rel.endsWith('.md')).sort();
    if (deltaFiles.length > 0) {
      const budget = budgets.keyed['specs/**/spec.md'];
      let total = 0;
      for (const rel of deltaFiles) {
        const capability = deltaCapability(rel);
        let currentSpec = null;
        if (capability !== null && repoRoot) {
          const specPath = path.join(repoRoot, 'openspec', 'specs', capability, 'spec.md');
          try {
            if (fs.existsSync(specPath)) currentSpec = normalizeLineEndings(fs.readFileSync(specPath, 'utf8'));
          } catch (err) {
            currentSpec = null; // unreadable current spec excludes nothing — the conservative direction
          }
        }
        total += countSpecDeltaWords(artifactTexts[rel], currentSpec);
      }
      if (total > budget) {
        findings.push(makeFinding(
          'BUDGET_EXCEEDED',
          'specs/**/spec.md',
          null,
          'The spec deltas total ' + total + ' words across ' + deltaFiles.length + ' file(s) (verbatim MODIFIED blocks excluded), over the ' + budget + '-word summed budget. Remove text, or split the change.'
        ));
      }
    }
  }
  if (tasks !== null) {
    const boxes = extractCheckboxes(tasks);
    if (boxes.length < CHECKBOX_MIN || boxes.length > budgets.checkboxMax) {
      findings.push(makeFinding(
        'BUDGET_EXCEEDED',
        'tasks.md',
        null,
        'tasks.md has ' + boxes.length + ' checkboxes, outside the ' + CHECKBOX_MIN + '-' + budgets.checkboxMax + ' range.'
      ));
    }
  }

  // 10b. BUDGET_OVERRUN — the soft budgets, where the exception marker still applies.
  for (const [artifactName, budget] of Object.entries(SOFT_BUDGETS)) {
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

  const report = lintChange(dir, label, args.assumeContract, resolveBudgets(args.repo), args.repo);
  if (report === null) return; // usageError already exited

  if (format === 'json') {
    printJson(report);
  } else {
    printText(report);
  }
  process.exit(0);
}

main();
