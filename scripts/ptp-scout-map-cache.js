#!/usr/bin/env node
"use strict";
// Scout map cache (0084_05). Plain Node, zero dependencies.
// Usage: node scripts/ptp-scout-map-cache.js lookup --workspace <root> --epic <NNNN>
//        node scripts/ptp-scout-map-cache.js store  --workspace <root> --epic <NNNN> --map <file>
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fail(code) {
  process.stderr.write(JSON.stringify({ code }) + "\n");
  process.exit(2);
}

const [sub, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i += 2) {
  if (!rest[i].startsWith("--") || rest[i + 1] === undefined) fail("bad-args");
  flags[rest[i].slice(2)] = rest[i + 1];
}
if (sub !== "lookup" && sub !== "store") fail("bad-args");
if (!flags.workspace || !flags.epic || !/^\d{4}$/.test(flags.epic)) fail("bad-args");
if (sub === "store" && !flags.map) fail("bad-args");

const ws = path.resolve(flags.workspace);
const dir = path.join(ws, "openspec", "scout-cache");
const mdPath = path.join(dir, flags.epic + ".md");
const jsonPath = path.join(dir, flags.epic + ".json");

const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
function hashFile(abs) {
  try {
    return sha(fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n"));
  } catch (e) {
    return null;
  }
}
const resolveKey = (k) => (path.isAbsolute(k) ? k : path.join(ws, k));
const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const nonBlank = (t) => t.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);

function citedKeys(line) {
  const keys = [];
  for (const m of line.match(/[\w./\\:-]+:\d+/g) || []) {
    const p = m.replace(/:\d+$/, "").split("\\").join("/");
    const rel = path.relative(ws, path.resolve(ws, p)).split("\\").join("/");
    keys.push(rel.startsWith("..") || path.isAbsolute(rel) ? p : rel);
  }
  return keys;
}

function writeAtomic(target, content) {
  const tmp = target + "." + process.pid + "." + Date.now() + ".tmp";
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
}

if (sub === "lookup") {
  if (!fs.existsSync(mdPath) || !fs.existsSync(jsonPath)) {
    out({ ok: true, state: "miss", map: null, changed: [] });
    process.exit(0);
  }
  const rel = "openspec/scout-cache/" + flags.epic + ".md";
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!manifest || typeof manifest.files !== "object" || manifest.files === null) throw new Error("shape");
  } catch (e) {
    out({ ok: true, state: "invalidated", map: rel, changed: [] });
    process.exit(0);
  }
  const changed = Object.keys(manifest.files).filter((k) => hashFile(resolveKey(k)) !== manifest.files[k]);
  out({ ok: true, state: changed.length ? "invalidated" : "hit", map: rel, changed });
  process.exit(0);
}

// store
let raw;
try {
  raw = fs.readFileSync(flags.map, "utf8");
} catch (e) {
  fail("map-unreadable");
}
const all = raw.replace(/\r\n?/g, "\n").split("\n");
let dropped = 0;
const kept = all.filter((l) => {
  if (citedKeys(l).some((k) => k.startsWith("openspec/changes/"))) { dropped++; return false; }
  return true;
});
const persisted = kept.join("\n").replace(/\n*$/, "\n");
const files = Object.create(null);
for (const l of kept) for (const k of citedKeys(l)) if (!Object.prototype.hasOwnProperty.call(files, k)) files[k] = hashFile(resolveKey(k));

let prevLines = null;
try { prevLines = nonBlank(fs.readFileSync(mdPath, "utf8")); } catch (e) {}
const newLines = nonBlank(persisted);
const added = newLines.filter((l) => !(prevLines || []).includes(l));
const removed = (prevLines || []).filter((l) => !newLines.includes(l));

fs.mkdirSync(dir, { recursive: true });
let gitignore = "unchanged";
const giPath = path.join(dir, ".gitignore");
if (!fs.existsSync(giPath)) {
  writeAtomic(giPath, "*\n");
  gitignore = "created";
} else {
  const cur = fs.readFileSync(giPath, "utf8");
  if (!cur.replace(/\r\n/g, "\n").split("\n").some((l) => l.trimEnd() === "*")) {
    writeAtomic(giPath, cur + (cur === "" || cur.endsWith("\n") ? "" : "\n") + "*\n");
    gitignore = "updated";
  }
}
writeAtomic(mdPath, persisted);
writeAtomic(jsonPath, JSON.stringify({ version: 1, files }) + "\n");
out({ ok: true, previous: prevLines !== null, added, removed, dropped, files: Object.keys(files).length, gitignore });
