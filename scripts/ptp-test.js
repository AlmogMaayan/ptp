#!/usr/bin/env node
'use strict';

/**
 * ptp-test.js — the ptp repository's single dogfooding project suite.
 *
 * Runs the repo's own checks in a fixed order, printing exactly one `PASS`/`FAIL`/`SKIP` line per
 * step, running every step (never short-circuiting), and exiting non-zero when any step fails:
 *
 *   1. node scripts/ptp-skill-behavior-tests.js            (skill behavior + command-case fixtures)
 *   2. node scripts/check-prompt-budgets.js                (prompt-surface word budgets)
 *   3. node scripts/sync-openspec-skills.js --check        (vendored OpenSpec skill copies are in sync)
 *   4. node scripts/ptp-compact-lint.js --change <id> ...  (compact artifact contract for one change)
 *
 * The compact-lint step needs a change target. A change id may be given as the first positional
 * argument, via `--change <id>` / `--change=<id>`, or via the `PTP_TEST_CHANGE` environment
 * variable. Absent one, step 4 is `SKIP`ped as `no change id` and is non-fatal — every other step
 * still runs and still gates.
 *
 * `--help` and `--list` are bounded: each prints and exits 0 without running any sibling script, so
 * the suite can be introspected without side effects.
 *
 * Plain Node, zero dependencies, no network. Every sibling script is resolved and spawned by its
 * absolute path from this file's own location, so behavior does not depend on the working directory.
 *
 * Usage:
 *   node scripts/ptp-test.js [<change-id>] [--change <id>]
 *   node scripts/ptp-test.js --help
 *   node scripts/ptp-test.js --list
 */

const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function scriptPath(rel) {
  return path.join(REPO_ROOT, rel);
}

// Resolve the optional change id from (in precedence order) --change <id> / --change=<id>, the first
// bare positional argument, then PTP_TEST_CHANGE. Returns null when none is supplied.
function resolveChangeId(argv, env) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--change') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) return argv[i + 1];
    } else if (a.startsWith('--change=')) {
      const v = a.slice('--change='.length);
      if (v) return v;
    }
  }
  for (const a of argv) {
    if (!a.startsWith('-')) return a;
  }
  if (env && env.PTP_TEST_CHANGE) return env.PTP_TEST_CHANGE;
  return null;
}

// The fixed step list. `argv` is resolved lazily so the compact step can receive the change id.
function buildSteps(changeId) {
  const steps = [
    {
      name: 'skill-behavior-tests',
      command: 'node scripts/ptp-skill-behavior-tests.js',
      args: [scriptPath('scripts/ptp-skill-behavior-tests.js')],
      grade: (run) => run.status === 0,
    },
    {
      name: 'prompt-budgets',
      command: 'node scripts/check-prompt-budgets.js',
      args: [scriptPath('scripts/check-prompt-budgets.js')],
      grade: (run) => run.status === 0,
    },
    {
      name: 'openspec-skill-sync',
      command: 'node scripts/sync-openspec-skills.js --check',
      args: [scriptPath('scripts/sync-openspec-skills.js'), '--check'],
      grade: (run) => run.status === 0,
    },
  ];

  if (changeId) {
    steps.push({
      name: 'compact-lint',
      command:
        'node scripts/ptp-compact-lint.js --change ' + changeId + ' --assume-contract=ptp-compact',
      args: [
        scriptPath('scripts/ptp-compact-lint.js'),
        '--change',
        changeId,
        '--assume-contract=ptp-compact',
        '--format=json',
      ],
      // The compact linter exits 0 whenever it produced a report, findings or not, so exit code alone
      // never fails the suite. Parse its JSON and fail the step on any finding; a usage/IO error
      // (non-zero exit or unparseable output) fails it too.
      grade: (run) => {
        if (run.status !== 0) return false;
        let parsed;
        try {
          parsed = JSON.parse(String(run.stdout || '').trim());
        } catch (e) {
          return false;
        }
        return Array.isArray(parsed.findings) && parsed.findings.length === 0;
      },
    });
  } else {
    steps.push({
      name: 'compact-lint',
      skip: 'no change id',
    });
  }

  return steps;
}

function printUsage() {
  process.stdout.write(
    [
      'ptp-test — the ptp repository dogfooding suite',
      '',
      'Usage:',
      '  node scripts/ptp-test.js [<change-id>] [--change <id>]',
      '  node scripts/ptp-test.js --help',
      '  node scripts/ptp-test.js --list',
      '',
      'Runs, in order: skill-behavior-tests, prompt-budgets, openspec-skill-sync, compact-lint.',
      'The compact-lint step is skipped when no change id is supplied. Exits non-zero on any failure.',
      '',
    ].join('\n') + '\n'
  );
}

function printList() {
  const names = ['skill-behavior-tests', 'prompt-budgets', 'openspec-skill-sync', 'compact-lint'];
  for (const n of names) process.stdout.write(n + '\n');
}

function main(argv, env) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    return 0;
  }
  if (argv.includes('--list')) {
    printList();
    return 0;
  }

  const changeId = resolveChangeId(argv, env);
  const steps = buildSteps(changeId);

  let failed = 0;
  for (const step of steps) {
    if (step.skip) {
      process.stdout.write('SKIP ' + step.name + ' (' + step.skip + ')\n');
      continue;
    }
    const run = spawnSync(process.execPath, step.args, { cwd: REPO_ROOT, encoding: 'utf8' });
    let ok;
    if (run.error) {
      ok = false;
    } else {
      ok = step.grade(run);
    }
    if (ok) {
      process.stdout.write('PASS ' + step.name + ' (' + step.command + ')\n');
    } else {
      failed++;
      process.stdout.write('FAIL ' + step.name + ' (' + step.command + ')\n');
    }
  }

  return failed === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2), process.env));
}

module.exports = { resolveChangeId, buildSteps, main };
