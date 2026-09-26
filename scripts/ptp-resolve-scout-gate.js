#!/usr/bin/env node
"use strict";

/**
 * ptp-resolve-scout-gate.js
 *
 * DERIVED SURFACE. The scout gate contract is owned by
 * `skills/ptp-run-at-model/references/scout-prestep.md` § The scout gate; this script only IMPLEMENTS
 * it, reusing `ptp-resolve-workspace.js`'s `configLayers`/`resolveConfigKey`. Where they disagree the
 * section wins.
 *
 * Usage: node scripts/ptp-resolve-scout-gate.js "<argument text>"
 *        node scripts/ptp-resolve-scout-gate.js --self-test
 *
 * Exit 0: {"scout":"on"|"off","source":"token"|"workspace"|"project"|"global"|"default","args":"<stripped>"}
 * Exit 1: {"refused":true,"candidates":[...],"valid":["on","off"]}
 * Exit 2: usage on stderr, empty stdout.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const { configLayers, resolveConfigKey, REJECT } = require("./ptp-resolve-workspace.js");

const USAGE = 'Usage: node scripts/ptp-resolve-scout-gate.js "<argument-text>" | --self-test';
const VALID = ["on", "off"];

function scoutNormalizer(v) {
  return v === "on" || v === "off" ? v : REJECT;
}

// Returns { candidates, value, args }: every `scout:` candidate, the single valid value (or null),
// and the argument text with that token stripped.
function parseScoutToken(text) {
  const src = typeof text === "string" ? text : "";
  const re = /(^|\s)(scout:\S*)(?=\s|$)/g;
  const found = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    found.push({ token: m[2], start: m.index, lead: m[1].length });
    re.lastIndex = m.index + m[0].length;
  }
  const candidates = found.map((f) => f.token);
  if (found.length !== 1) return { candidates: candidates, value: null, args: src.trim() };
  const only = found[0];
  const value = only.token.slice("scout:".length);
  if (value !== "on" && value !== "off") return { candidates: candidates, value: null, args: src.trim() };
  const tokenStart = only.start + only.lead;
  let args;
  if (only.lead > 0) {
    // drop the token and the whitespace run before it
    let s = only.start;
    while (s > 0 && /\s/.test(src[s - 1])) s -= 1;
    args = src.slice(0, s) + src.slice(tokenStart + only.token.length);
  } else {
    // at the start: drop the token and the whitespace run after it
    args = src.slice(only.token.length).replace(/^\s+/, "");
  }
  return { candidates: candidates, value: value, args: args.trim() };
}

function resolveScoutGate(options) {
  const opts = options || {};
  const parsed = parseScoutToken(opts.text);
  if (parsed.candidates.length > 0 && parsed.value === null) {
    return { refused: true, candidates: parsed.candidates, valid: VALID.slice() };
  }
  if (parsed.value !== null) return { scout: parsed.value, source: "token", args: parsed.args };
  const resolved = resolveConfigKey(configLayers(opts), "brainstorm.scout", scoutNormalizer, "off");
  return { scout: resolved.value, source: resolved.layer, args: parsed.args };
}

/* ------------------------------------------------------------------ self-test */

function writeDeep(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function runSelfTest() {
  const failures = [];
  let passed = 0;
  const check = (name, actual, expected) => {
    if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
    else failures.push(name + ": expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
  };
  const hadHome = Object.prototype.hasOwnProperty.call(process.env, "PTP_HOME_DIR");
  const previousHome = process.env.PTP_HOME_DIR;
  const bases = [];
  const run = (g, p) => {
    const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ptp-scout-"));
    bases.push(base);
    const home = path.join(base, "home");
    const repo = path.join(base, "repo");
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
    fs.mkdirSync(path.join(repo, "openspec"), { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    const cfg = (v) => JSON.stringify({ brainstorm: { scout: v } });
    if (g !== undefined) writeDeep(path.join(home, ".claude", "ptp", "config.json"), cfg(g));
    if (p !== undefined) writeDeep(path.join(repo, ".claude", "ptp", "config.json"), cfg(p));
    process.env.PTP_HOME_DIR = home;
    const r = resolveScoutGate({ text: "x", cwd: repo, repoRoot: repo, workspaceRoot: null });
    return [r.scout, r.source === "default" || r.source === "global" || r.source === "project" ? r.source : "other"];
  };
  try {
    check("no-config", run(undefined, undefined), ["off", "default"]);
    check("global-on", run("on", undefined), ["on", "global"]);
    check("project-over-global", run("on", "off"), ["off", "project"]);
    check("invalid-project-keeps-global", run("on", "bogus"), ["on", "global"]);
    check("invalid-alone-default", run(undefined, "bogus"), ["off", "default"]);
  } catch (e) {
    failures.push("self-test threw: " + (e && e.message));
  } finally {
    if (hadHome) process.env.PTP_HOME_DIR = previousHome;
    else delete process.env.PTP_HOME_DIR;
    for (const b of bases) {
      try {
        fs.rmSync(b, { recursive: true, force: true });
      } catch (e) {
        /* best effort */
      }
    }
  }
  for (const f of failures) process.stdout.write("self-test FAIL: " + f + "\n");
  process.stdout.write("self-test checks passed: " + passed + "/" + (passed + failures.length) + "\n");
  return failures.length === 0 ? 0 : 1;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--self-test") process.exit(runSelfTest());
  if (argv.length !== 1) {
    process.stderr.write(USAGE + "\n");
    process.exit(2);
  }
  const r = resolveScoutGate({ text: argv[0] });
  process.stdout.write(JSON.stringify(r) + "\n");
  process.exit(r.refused ? 1 : 0);
}

if (require.main === module) main();

module.exports = { parseScoutToken: parseScoutToken, resolveScoutGate: resolveScoutGate };
