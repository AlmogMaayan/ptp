#!/usr/bin/env node
"use strict";
// Deterministic cap check for a brainstorm scout map (0084_03). Plain Node, zero dependencies.
// Usage: node scripts/ptp-scout-map-check.js <map-file>
// Uncited lines are stripped before judging; a passing map with stripped lines is rewritten in place.
// Prints { ok, lines, words, stripped, problems }; exit 0 valid, 1 invalid, 2 unreadable (empty stdout).
const fs = require("fs");

const SENTINEL = "Nothing beyond the named files";
const MAX_LINES = 60;
const MAX_WORDS = 900;
const CITATION = /[\w./\\:-]+:\d+/g;
const CONCLUSION = /\b(recommend|should|suggest|propose|conclude)\b/i;

const file = process.argv[2];
let raw;
try {
  if (!file) throw new Error("no map file given");
  raw = fs.readFileSync(file, "utf8");
} catch (e) {
  process.stderr.write("ptp-scout-map-check: cannot read map file: " + e.message + "\n");
  process.exit(2);
}

const all = raw.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
const isSentinel = (l) => l.trim() === SENTINEL;
const isCited = (l) => /[\w./\:-]+:\d+/.test(l);
const lines = all.filter((l) => isSentinel(l) || isCited(l));
const stripped = all.length - lines.length;
const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
const problems = [];
const add = (p) => { if (!problems.includes(p)) problems.push(p); };

if (all.length === 0) {
  add("empty");
} else if (lines.length === 0) {
  add("no-cited-lines");
} else {
  const sentinels = lines.filter(isSentinel).length;
  if (sentinels > 0 && lines.length > 1) add("sentinel-not-alone");
  if (lines.length > MAX_LINES) add("too-many-lines");
  if (words > MAX_WORDS) add("too-many-words");
  for (const l of lines) {
    if (isSentinel(l)) continue;
    if (CONCLUSION.test(l.replace(CITATION, " "))) add("conclusion");
  }
}

if (stripped > 0 && problems.length === 0) {
  try {
    fs.writeFileSync(file, lines.join("\n") + "\n");
  } catch (e) {
    add("rewrite-failed");
  }
}

const ok = problems.length === 0;
process.stdout.write(JSON.stringify({ ok, lines: lines.length, words, stripped, problems }) + "\n");
process.exit(ok ? 0 : 1);
