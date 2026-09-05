#!/usr/bin/env node
"use strict";

/**
 * ptp-single-pass-role-tests.js
 *
 * Asserts, over the REAL repository files, that each of the six surfaces named by
 * 0067_05_single-pass-role-resolution resolves `{ main, reviewer }` via `ptp-agent-roles` and runs
 * the resolved main agent's dispatch, rather than hardcoding an in-session PTP/Claude dispatch:
 *
 *   - review-code       commands/review.md
 *   - review-plan       commands/review-plan.md
 *   - brainstorm        skills/ptp-review-brainstorm/SKILL.md
 *   - prd               skills/ptp-review-prd/SKILL.md
 *   - review-loop       commands/review-loop.md
 *   - review-plan-loop  commands/review-plan-loop.md
 *
 * These are prose/source assertions against the shipped files — each surface is a prompt read by an
 * agent, not an executed harness, so this reader drives the contract RED->GREEN.
 *
 * Plain Node, zero dependencies, no network. Resolves every path from its own location.
 *
 * Usage:
 *   node scripts/ptp-single-pass-role-tests.js               # run every case
 *   node scripts/ptp-single-pass-role-tests.js <case> [...]   # run only the named case(s)
 *
 * Exit codes: 0 all requested assertions hold, 1 one or more failed (each printed as a FAIL line).
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

function readFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

// Each case names one surface. Each assertion: { kind: "requires" | "forbids", pattern, why }.
// A "requires" fails when the pattern is absent from the case's file; a "forbids" fails when
// present. Patterns are matched case-insensitively as regexes.
const CASES = {
  "review-code": {
    file: "commands/review.md",
    assertions: [
      { kind: "requires", pattern: "ptp-agent-roles", why: "must resolve { main, reviewer } via ptp-agent-roles" },
      { kind: "requires", pattern: "byte-identical", why: "the main=claude direction must stay byte-identical" },
      { kind: "requires", pattern: "codex exec -s read-only", why: "the main=codex direction must run a read-only codex exec pass" },
      { kind: "requires", pattern: "ptp-codex-mode", why: "the codex pass must be assembled per ptp-codex-mode's flag-append rule" },
      { kind: "requires", pattern: "codex\\.model", why: "the codex direction's model must come from codex.model" },
      { kind: "requires", pattern: "codex\\.reasoningEffort", why: "the codex direction's effort must come from codex.reasoningEffort" },
      { kind: "requires", pattern: "install .{0,20}codex.{0,40}roles\\.main.{0,3}=.{0,3}claude", why: "codex absent under main=codex must STOP with an install-or-set-roles.main=claude message" },
      { kind: "forbids", pattern: "codex exec -s workspace-write", why: "the review pass must never use the write-capable main-implementer invocation" },
    ],
  },
  "review-plan": {
    file: "commands/review-plan.md",
    assertions: [
      { kind: "requires", pattern: "ptp-agent-roles", why: "must resolve { main, reviewer } via ptp-agent-roles" },
      { kind: "requires", pattern: "byte-identical", why: "the main=claude direction must stay byte-identical" },
      { kind: "requires", pattern: "codex exec -s read-only", why: "the main=codex direction must run a read-only codex exec pass" },
      { kind: "requires", pattern: "ptp-codex-mode", why: "the codex pass must be assembled per ptp-codex-mode's flag-append rule" },
      { kind: "requires", pattern: "codex\\.model", why: "the codex direction's model must come from codex.model" },
      { kind: "requires", pattern: "codex\\.reasoningEffort", why: "the codex direction's effort must come from codex.reasoningEffort" },
      { kind: "requires", pattern: "install .{0,20}codex.{0,40}roles\\.main.{0,3}=.{0,3}claude", why: "codex absent under main=codex must STOP with an install-or-set-roles.main=claude message" },
      { kind: "forbids", pattern: "codex exec -s workspace-write", why: "the review pass must never use the write-capable main-implementer invocation" },
    ],
  },
  brainstorm: {
    file: "skills/ptp-review-brainstorm/SKILL.md",
    assertions: [
      { kind: "requires", pattern: "ptp-agent-roles", why: "must resolve { main, reviewer } via ptp-agent-roles" },
      { kind: "requires", pattern: "codex exec -s read-only", why: "the main=codex direction must run a read-only codex exec pass" },
      { kind: "requires", pattern: "ptp-codex-mode", why: "the codex pass must be assembled per ptp-codex-mode's flag-append rule" },
      { kind: "requires", pattern: "install .{0,20}codex.{0,40}roles\\.main.{0,3}=.{0,3}claude", why: "codex absent under main=codex must STOP with an install-or-set-roles.main=claude message" },
      { kind: "requires", pattern: "no.{0,10}`?openspec validate`?", why: "must keep the no-openspec-validate rule" },
      { kind: "forbids", pattern: "codex exec -s workspace-write", why: "the review pass must never use the write-capable main-implementer invocation" },
    ],
  },
  prd: {
    file: "skills/ptp-review-prd/SKILL.md",
    assertions: [
      { kind: "requires", pattern: "ptp-agent-roles", why: "must resolve { main, reviewer } via ptp-agent-roles" },
      { kind: "requires", pattern: "codex exec -s read-only", why: "the main=codex direction must run a read-only codex exec pass" },
      { kind: "requires", pattern: "ptp-codex-mode", why: "the codex pass must be assembled per ptp-codex-mode's flag-append rule" },
      { kind: "requires", pattern: "install .{0,20}codex.{0,40}roles\\.main.{0,3}=.{0,3}claude", why: "codex absent under main=codex must STOP with an install-or-set-roles.main=claude message" },
      { kind: "requires", pattern: "no.{0,10}`?openspec validate`?", why: "must keep the no-openspec-validate rule" },
      { kind: "forbids", pattern: "codex exec -s workspace-write", why: "the review pass must never use the write-capable main-implementer invocation" },
    ],
  },
  "review-loop": {
    file: "commands/review-loop.md",
    assertions: [
      { kind: "requires", pattern: "ptp-agent-roles", why: "must resolve { main, reviewer } via ptp-agent-roles" },
      { kind: "requires", pattern: "dispatch of the agent playing .?main", why: "reviewer must be the dispatch of the agent playing main, not a hardcoded literal" },
      { kind: "requires", pattern: "codex --version", why: "must verify codex is on PATH before dispatching main=codex" },
      { kind: "requires", pattern: "install .{0,20}codex.{0,40}roles\\.main.{0,3}=.{0,3}claude", why: "codex absent under main=codex must STOP with an install-or-set-roles.main=claude message" },
      { kind: "forbids", pattern: "reviewer `?ptp`?\\.\\s*$", why: "must not hardcode reviewer ptp as a fixed literal" },
    ],
  },
  "review-plan-loop": {
    file: "commands/review-plan-loop.md",
    assertions: [
      { kind: "requires", pattern: "ptp-agent-roles", why: "must resolve { main, reviewer } via ptp-agent-roles" },
      { kind: "requires", pattern: "dispatch of the agent playing .?main", why: "reviewer must be the dispatch of the agent playing main, not a hardcoded literal" },
      { kind: "requires", pattern: "codex --version", why: "must verify codex is on PATH before dispatching main=codex" },
      { kind: "requires", pattern: "install .{0,20}codex.{0,40}roles\\.main.{0,3}=.{0,3}claude", why: "codex absent under main=codex must STOP with an install-or-set-roles.main=claude message" },
      { kind: "forbids", pattern: "reviewer `?ptp`?\\.\\s*$", why: "must not hardcode reviewer ptp as a fixed literal" },
    ],
  },
};

function runCase(name, def) {
  const failures = [];
  let body;
  try {
    body = readFile(def.file);
  } catch (e) {
    return [`FAIL [${name}] ${def.file}: unreadable (${e.message})`];
  }
  for (const a of def.assertions) {
    let re;
    try {
      re = new RegExp(a.pattern, "is");
    } catch (e) {
      failures.push(`FAIL [${name}] ${def.file} [uncompilable pattern '${a.pattern}']: ${e.message}`);
      continue;
    }
    const matched = re.test(body);
    if (a.kind === "requires" && !matched) {
      failures.push(`FAIL [${name}] ${def.file} [requires /${a.pattern}/]: ${a.why}`);
    } else if (a.kind === "forbids" && matched) {
      failures.push(`FAIL [${name}] ${def.file} [forbids /${a.pattern}/]: ${a.why}`);
    }
  }
  return failures;
}

function main(argv) {
  const requested = argv.filter((a) => !a.startsWith("-"));
  const names = requested.length > 0 ? requested : Object.keys(CASES);

  let anyUnknown = false;
  for (const n of names) {
    if (!CASES[n]) {
      process.stdout.write(`unknown case '${n}'\n`);
      anyUnknown = true;
    }
  }
  if (anyUnknown) return 1;

  let totalFailures = 0;
  for (const n of names) {
    const failures = runCase(n, CASES[n]);
    if (failures.length === 0) {
      process.stdout.write(`PASS [${n}]\n`);
    } else {
      for (const f of failures) process.stdout.write(f + "\n");
      totalFailures += failures.length;
    }
  }

  if (totalFailures > 0) {
    process.stdout.write(`${totalFailures} assertion(s) failed\n`);
    return 1;
  }
  process.stdout.write(`OK: ${names.length} case(s) hold\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { CASES };
