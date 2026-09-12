#!/usr/bin/env node
"use strict";

/**
 * ptp-superpowers-invocation-gate.test.js
 *
 * Drives `scripts/ptp-superpowers-invocation-gate.js` over synthetic trees in fresh temp
 * directories outside the repository. Four cases named by the tasks: clean-pass, unmarked-fail,
 * marked-pass, citation-count-fail. Plain Node, zero dependencies, no network.
 *
 * Every `superpowers:` token this test needs in a fixture is built by concatenation from `SP`, so
 * this test's own source carries no matchable token and stays clean under the gate it exercises.
 *
 * Usage: node scripts/ptp-superpowers-invocation-gate.test.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const { scanGate } = require("./ptp-superpowers-invocation-gate.js");

// Token prefix — concatenated so this file carries no raw matchable token.
const SP = "superpowers" + ":";
const CITE_TOKEN = SP + "using-superpowers";
const BRAINSTORM = SP + "brainstorming";

let passed = 0;
const failures = [];

function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// Build a temp tree from a { relativePath: content } map and return its root.
function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ptp-sp-gate-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return root;
}

const CITE_NOTE = `See ${CITE_TOKEN}, injected by the SessionStart hook.\n`;

function run() {
  const roots = [];

  // clean-pass: the citation exactly once (README), plus a marked branch line. ok=true.
  {
    const root = makeTree({
      "README.md": CITE_NOTE,
      "commands/plan.md": `Default runs ptp-writing-plans; under tdd-plugin=superpowers invoke ${BRAINSTORM} instead.\n`,
    });
    roots.push(root);
    const r = scanGate(root);
    check("clean-pass: ok", r.ok === true);
    check("clean-pass: no unadmitted", r.unadmitted.length === 0);
    check("clean-pass: citation once", r.citationCount === 1);
  }

  // unmarked-fail: a bare token on an unmarked line. ok=false, named offender.
  {
    const root = makeTree({
      "README.md": CITE_NOTE,
      "skills/x/SKILL.md": `Invoke ${BRAINSTORM} here.\n`,
    });
    roots.push(root);
    const r = scanGate(root);
    check("unmarked-fail: not ok", r.ok === false);
    check("unmarked-fail: names the offender", r.unadmitted.some((u) => u.includes(BRAINSTORM)));
    check(
      "unmarked-fail: offender is file:line:token",
      r.unadmitted.some((u) => u === `skills/x/SKILL.md:1:${BRAINSTORM}`)
    );
  }

  // marked-pass: the same token shares its line with tdd-plugin=superpowers. ok=true.
  {
    const root = makeTree({
      "README.md": CITE_NOTE,
      "agents/a.md": `When tdd-plugin=superpowers, run ${BRAINSTORM}.\n`,
    });
    roots.push(root);
    const r = scanGate(root);
    check("marked-pass: ok", r.ok === true);
    check("marked-pass: no unadmitted", r.unadmitted.length === 0);
  }

  // citation-count-fail: the citation occurs twice. ok=false even with no unmarked tokens.
  {
    const root = makeTree({
      "README.md": CITE_NOTE,
      "skills/y/SKILL.md": CITE_NOTE,
    });
    roots.push(root);
    const r = scanGate(root);
    check("citation-count-fail: not ok", r.ok === false);
    check("citation-count-fail: counted twice", r.citationCount === 2);
    check("citation-count-fail: no unadmitted token", r.unadmitted.length === 0);
  }

  // the changelog section is neither scanned nor counted (a token there does not count).
  {
    const root = makeTree({
      "README.md": `${CITE_NOTE}\n## Changelog\n\n| **0.1.0** | ${BRAINSTORM} here | \n`,
    });
    roots.push(root);
    const r = scanGate(root);
    check("changelog-skipped: ok", r.ok === true);
    check("changelog-skipped: citation once", r.citationCount === 1);
    check("changelog-skipped: changelog token not counted", r.unadmitted.length === 0);
  }

  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} assertion(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASS: ${passed} assertion(s) passed.`);
}

run();
