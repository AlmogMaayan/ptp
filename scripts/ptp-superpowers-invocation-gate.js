#!/usr/bin/env node
"use strict";

/**
 * ptp-superpowers-invocation-gate.js
 *
 * Executable, token-level, exit-status-safe conditional invocation gate owned by the
 * `superpowers-migration` capability § *No active runtime surface invokes a Superpowers skill*
 * (change 0073_07_spec-policy-rewrite-and-version, consolidating 0073_04's minimal narrowing).
 *
 * Pass condition: every `superpowers:<token>` occurrence in an active file is EITHER the
 * using-superpowers citation OR sits on a line that also carries the literal marker
 * `tdd-plugin=superpowers` (the restored directive-gated branch line), AND that using-superpowers
 * citation occurs exactly once across all scanned files.
 *
 * Four normative properties:
 *   1. matches the token `superpowers:` (regex `superpowers:[a-z-]+`), never the bare word
 *      `Superpowers`;
 *   2. classifies one `file:line:token` per occurrence — token-level, never a line-level `grep -v`;
 *   3. exits 0 on pass, and names each unadmitted `file:line:token` on failure (exit 1);
 *   4. paired with an assertion that the using-superpowers citation occurs exactly once.
 *
 * It scans `commands agents skills workflows scripts README.md .claude-plugin`, never
 * `openspec/changes/archive/` and never `README.md`'s `## Changelog` section (history rows are
 * neither scanned nor counted).
 *
 * Zero dependencies, plain Node, no network. Resolves paths from its own location.
 *
 * Usage: node scripts/ptp-superpowers-invocation-gate.js [root]
 */

const fs = require("fs");
const path = require("path");

// Built by concatenation so this gate's own source carries no matchable `superpowers:` token.
const CITATION = "superpowers" + ":using-superpowers";
const MARKER = "tdd-plugin=superpowers";
const TOKEN_RE = /superpowers:[a-z-]+/g;

// Active-file scan targets, relative to the scan root.
const TARGETS = [
  "commands",
  "agents",
  "skills",
  "workflows",
  "scripts",
  "README.md",
  ".claude-plugin",
];

// Directory names never descended into.
const SKIP_DIRS = new Set(["node_modules", ".git"]);

function isTextCandidate(file) {
  // The active surface is markdown, JS, and JSON; skip anything else defensively.
  return /\.(md|js|mjs|cjs|json|txt)$/i.test(file) || path.basename(file) === "README.md";
}

// Collect every file under a target path (recursively), skipping the archive and vcs/dep dirs.
function collectFiles(absPath, acc) {
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch (e) {
    return; // a missing optional target is simply not scanned
  }
  if (stat.isDirectory()) {
    const base = path.basename(absPath);
    if (SKIP_DIRS.has(base)) return;
    // never scan the archived changes tree
    if (absPath.replace(/\\/g, "/").includes("/openspec/changes/archive")) return;
    for (const entry of fs.readdirSync(absPath).sort()) {
      collectFiles(path.join(absPath, entry), acc);
    }
  } else if (stat.isFile()) {
    if (isTextCandidate(absPath)) acc.push(absPath);
  }
}

// README.md's `## Changelog` section is neither scanned nor counted: return the file's lines
// truncated at the changelog header. Other files return all their lines unchanged.
function scannableLines(absPath, root) {
  const raw = fs.readFileSync(absPath, "utf8").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const rel = path.relative(root, absPath).replace(/\\/g, "/");
  if (rel === "README.md") {
    const idx = lines.findIndex((l) => /^##\s+Changelog\s*$/.test(l));
    if (idx !== -1) return lines.slice(0, idx);
  }
  return lines;
}

/**
 * Scan the tree under `root` and classify every `superpowers:` token occurrence.
 * @returns {{ unadmitted: string[], citationCount: number, ok: boolean }}
 */
function scanGate(root) {
  const files = [];
  for (const target of TARGETS) {
    collectFiles(path.join(root, target), files);
  }

  const unadmitted = [];
  let citationCount = 0;

  for (const absPath of files) {
    const rel = path.relative(root, absPath).replace(/\\/g, "/");
    const lines = scannableLines(absPath, root);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const marked = line.includes(MARKER);
      TOKEN_RE.lastIndex = 0;
      let m;
      while ((m = TOKEN_RE.exec(line)) !== null) {
        const token = m[0];
        if (token === CITATION) citationCount += 1;
        // token-level admission: the citation, or a token sharing its line with the marker.
        const admitted = token === CITATION || marked;
        if (!admitted) {
          unadmitted.push(`${rel}:${i + 1}:${token}`);
        }
      }
    }
  }

  const ok = unadmitted.length === 0 && citationCount === 1;
  return { unadmitted, citationCount, ok };
}

function main() {
  const root = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..");
  const { unadmitted, citationCount, ok } = scanGate(root);

  if (ok) {
    console.log(
      `PASS: no unadmitted superpowers: token; citation occurs exactly once (${citationCount}).`
    );
    process.exit(0);
  }

  if (unadmitted.length > 0) {
    console.error(`FAIL: ${unadmitted.length} unadmitted superpowers: token(s):`);
    for (const u of unadmitted) console.error(`  - ${u}`);
  }
  if (citationCount !== 1) {
    console.error(
      `FAIL: the ${CITATION} citation must occur exactly once, found ${citationCount}.`
    );
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { scanGate, CITATION, MARKER, TOKEN_RE };
