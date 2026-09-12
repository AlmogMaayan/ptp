#!/usr/bin/env node
"use strict";

/**
 * ptp-superpowers-delivery-tests.js
 *
 * Stubbed, zero-dependency test for the Codex-main Superpowers delivery contract owned by
 * `ptp-skill-contract` § *Agent neutrality* and `ptp-run-at-model` § *The `main=codex` direction*
 * (change 0073_06_codex-main-superpowers-support).
 *
 * A Codex main run has no Skill tool and does not inherit the outer command/skill context, so under
 * `tdd-plugin=superpowers` the outer session MUST deliver the governing Superpowers skill text by one
 * of two modes over a real Superpowers install root:
 *
 *   (a) mode 1 — verbatim inline carriage: the closure is each in-scope skill's whole directory,
 *       i.e. its `SKILL.md` plus the same-directory supporting `.md` files;
 *   (b) mode 2 — a verified-readable path under the Superpowers install root:
 *       `<root>/skills/<skill>/SKILL.md`;
 *   (c) when a required file cannot be read, delivery returns a non-silent `refused` /
 *       `needs-human-action` state naming the undelivered file and "set `tdd-plugin=ptp`", never a
 *       paraphrase and never a silent degrade to the `ptp-*` skills.
 *
 * This test stubs the two modes and the hard-stop trigger over a synthetic Superpowers skills tree in
 * a fresh temp directory outside the repository. Plain Node, zero dependencies, no network.
 *
 * Usage: node scripts/ptp-superpowers-delivery-tests.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// --- delivery logic under test (a stub of the contract, not the real orchestrator) --------------

const TERMINAL_STOP_STATES = ["refused", "needs-human-action"];

// Mode 1 closure: the in-scope skill's whole directory — its SKILL.md and the same-directory
// supporting .md files it references. Returns the ordered list of member files.
function mode1Closure(root, skill) {
  const dir = path.join(root, "skills", skill);
  const skillMd = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    throw new Error(`missing SKILL.md for closure of ${skill}`);
  }
  const siblings = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "SKILL.md")
    .sort()
    .map((f) => path.join(dir, f));
  return [skillMd, ...siblings];
}

// Mode 2 path: the verified-readable path under the Superpowers install root.
function mode2Path(root, skill) {
  return path.join(root, "skills", skill, "SKILL.md");
}

// Deliver a required closure (the fixed set of files the run needs). Every member must be readable
// at delivery time; a member that cannot be read is a delivery failure that takes the non-silent
// terminal state, never a paraphrase, never a ptp-* fallback.
function deliverClosure(members) {
  for (const member of members) {
    if (!fs.existsSync(member)) {
      return deliveryFailure(member);
    }
    // mode 1 obtains the text by reading it; an unreadable member is a delivery failure.
    try {
      fs.readFileSync(member, "utf8");
    } catch (e) {
      return deliveryFailure(member);
    }
  }
  return { state: "completed", delivered: members, degradedToPtp: false };
}

function deliveryFailure(missingFile) {
  return {
    state: "refused",
    message:
      `Cannot deliver Superpowers skill text: ${missingFile} is unreadable. ` +
      `Set \`tdd-plugin=ptp\` to run on the ptp-native skills instead.`,
    undeliveredFile: missingFile,
    degradedToPtp: false,
  };
}

// --- tiny test harness ---------------------------------------------------------------------------

let passed = 0;
const failures = [];

function check(name, cond) {
  if (cond) {
    passed += 1;
  } else {
    failures.push(name);
  }
}

function makeTree() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ptp-sp-delivery-"));
  const mkskill = (skill, files) => {
    const dir = path.join(base, "skills", skill);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), body);
    }
  };
  mkskill("test-driven-development", {
    "SKILL.md": "# tdd\nfull verbatim text\n",
    "reference.md": "# supporting sibling\n",
  });
  mkskill("verification-before-completion", {
    "SKILL.md": "# verification\nfull verbatim text\n",
  });
  return base;
}

function run() {
  const root = makeTree();

  // (a) mode-1 closure = SKILL.md + same-dir .md
  const closure = mode1Closure(root, "test-driven-development");
  check("mode1 includes SKILL.md", closure.some((p) => p.endsWith("SKILL.md")));
  check("mode1 includes same-dir sibling .md", closure.some((p) => p.endsWith("reference.md")));
  check("mode1 closure is exactly SKILL.md + siblings", closure.length === 2);
  check(
    "mode1 for a single-file skill is just SKILL.md",
    mode1Closure(root, "verification-before-completion").length === 1
  );

  // (b) mode-2 path = <root>/skills/<skill>/SKILL.md
  const p = mode2Path(root, "test-driven-development");
  check(
    "mode2 path is <root>/skills/<skill>/SKILL.md",
    p === path.join(root, "skills", "test-driven-development", "SKILL.md")
  );
  check("mode2 path is readable when present", fs.existsSync(p));

  // happy path delivery — the run needs the whole in-scope closure and every member is present
  const required = mode1Closure(root, "test-driven-development");
  const ok = deliverClosure(required);
  check("present closure delivers completed", ok.state === "completed");
  check("present closure never degrades to ptp-*", ok.degradedToPtp === false);

  // (c) missing file → refused/needs-human-action naming it + "set tdd-plugin=ptp", no ptp-* fallback.
  // The closure is fixed by what the run needs; deleting a required member makes delivery fail.
  fs.rmSync(path.join(root, "skills", "test-driven-development", "reference.md"));
  const failMember = deliverClosure(required);
  check("missing member is a terminal stop", TERMINAL_STOP_STATES.includes(failMember.state));
  check("stop names the undelivered file", failMember.message.includes("reference.md"));
  check("stop offers set tdd-plugin=ptp", /set\s+`?tdd-plugin=ptp`?/i.test(failMember.message));
  check("stop does not degrade to ptp-*", failMember.degradedToPtp === false);
  check("stop is not a paraphrase/completed", failMember.state !== "completed");

  // missing SKILL.md entirely → same terminal stop
  fs.rmSync(path.join(root, "skills", "test-driven-development", "SKILL.md"));
  const failSkill = deliverClosure(required);
  check("missing SKILL.md is a terminal stop", TERMINAL_STOP_STATES.includes(failSkill.state));
  check("missing SKILL.md stop offers set tdd-plugin=ptp", /tdd-plugin=ptp/.test(failSkill.message));

  fs.rmSync(root, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} assertion(s) failed:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASS: ${passed} assertion(s) passed.`);
}

run();
