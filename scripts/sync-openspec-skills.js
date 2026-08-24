#!/usr/bin/env node
'use strict';
/**
 * sync-openspec-skills — regenerate the vendored OpenSpec skill copies from their single source.
 *
 * Source of truth: the skills/openspec-* directories (edit here).
 * Generated copies: .claude/skills/openspec-* and .codex/skills/openspec-* (never hand-edit).
 * (Those paths are written without a trailing slash on purpose: a literal "*" followed by "/"
 * would close this block comment.)
 *
 * Normative contract: openspec/specs/workflow-packaging/spec.md, requirement
 * "The vendored OpenSpec skill copies are generated from one source".
 *
 * Modes:
 *   node scripts/sync-openspec-skills.js           regenerate the copies
 *   node scripts/sync-openspec-skills.js --check    verify only; non-zero exit on any difference
 *
 * Exit codes: 0 = success / clean check, 1 = drift found in --check, 2 = usage or I/O error.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'skills');
const TARGET_ROOTS = [
  path.join(REPO_ROOT, '.claude', 'skills'),
  path.join(REPO_ROOT, '.codex', 'skills'),
];
const PREFIX = 'openspec-';

function usage() {
  console.log('Usage: node scripts/sync-openspec-skills.js [--check]');
  console.log('  (no flag)  regenerate .claude/skills and .codex/skills from skills/openspec-*');
  console.log('  --check    verify only; exits 1 if any copy differs from its source');
}

// Line endings are normalised to LF for both comparison and writing: the source tree may be
// checked out CRLF on Windows while the copies are LF, and that must not read as drift.
function normalise(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const rel of listFiles(path.join(dir, entry.name))) {
        out.push(path.join(entry.name, rel));
      }
    } else if (entry.isFile()) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

function label(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
}

function run(argv) {
  let check = false;
  for (const arg of argv) {
    if (arg === '--check') {
      check = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      return 0;
    } else {
      console.error(`sync-openspec-skills: unknown argument "${arg}"`);
      usage();
      return 2;
    }
  }

  const skills = fs
    .readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(PREFIX))
    .map((e) => e.name)
    .sort();

  if (skills.length === 0) {
    console.error(`sync-openspec-skills: no ${PREFIX}* skill found under ${label(SOURCE_ROOT)}`);
    return 2;
  }

  let differences = 0;
  let writes = 0;

  for (const skill of skills) {
    const srcDir = path.join(SOURCE_ROOT, skill);
    const sourceFiles = listFiles(srcDir);

    for (const targetRoot of TARGET_ROOTS) {
      const dstDir = path.join(targetRoot, skill);

      for (const rel of sourceFiles) {
        const dstPath = path.join(dstDir, rel);
        const want = normalise(path.join(srcDir, rel));
        const have = fs.existsSync(dstPath) ? normalise(dstPath) : null;

        if (have === want) {
          console.log(`${check ? 'ok        ' : 'up-to-date'} ${label(dstPath)}`);
          continue;
        }
        differences += 1;
        if (check) {
          console.log(`${have === null ? 'missing   ' : 'drift     '} ${label(dstPath)}`);
          continue;
        }
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
        fs.writeFileSync(dstPath, want, 'utf8');
        writes += 1;
        console.log(`synced     ${label(dstPath)}`);
      }

      const targetFiles = fs.existsSync(dstDir) ? listFiles(dstDir) : [];
      for (const rel of targetFiles) {
        if (sourceFiles.includes(rel)) continue;
        const dstPath = path.join(dstDir, rel);
        differences += 1;
        if (check) {
          console.log(`extra      ${label(dstPath)}`);
          continue;
        }
        fs.unlinkSync(dstPath);
        writes += 1;
        console.log(`pruned     ${label(dstPath)}`);
      }
    }
  }

  // Orphaned target skill directories. The per-file prune above only ever visits a directory that
  // still has a source, so a skill deleted from (or renamed under) skills/ would otherwise linger
  // in both target roots forever. Sweep for openspec-* target directories with no source.
  for (const targetRoot of TARGET_ROOTS) {
    if (!fs.existsSync(targetRoot)) continue;
    const orphans = fs
      .readdirSync(targetRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(PREFIX) && !skills.includes(e.name))
      .map((e) => e.name)
      .sort();

    for (const orphan of orphans) {
      const orphanDir = path.join(targetRoot, orphan);
      const orphanFiles = listFiles(orphanDir);

      if (orphanFiles.length === 0) {
        differences += 1;
        if (check) {
          console.log(`extra      ${label(orphanDir)}/`);
          continue;
        }
        fs.rmSync(orphanDir, { recursive: true, force: true });
        writes += 1;
        console.log(`pruned     ${label(orphanDir)}/`);
        continue;
      }

      for (const rel of orphanFiles) {
        const dstPath = path.join(orphanDir, rel);
        differences += 1;
        if (check) {
          console.log(`extra      ${label(dstPath)}`);
          continue;
        }
        console.log(`pruned     ${label(dstPath)}`);
        writes += 1;
      }
      if (!check) fs.rmSync(orphanDir, { recursive: true, force: true });
    }
  }

  if (check) {
    console.log(
      differences === 0
        ? `sync-openspec-skills: ${skills.length} skill(s) verified, no drift`
        : `sync-openspec-skills: ${differences} difference(s) found — run "node scripts/sync-openspec-skills.js"`
    );
    return differences === 0 ? 0 : 1;
  }
  console.log(`sync-openspec-skills: ${skills.length} skill(s) synced, ${writes} file(s) written`);
  return 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (err) {
  console.error(`sync-openspec-skills: ${err && err.message ? err.message : err}`);
  process.exitCode = 2;
}
