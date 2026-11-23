#!/usr/bin/env node
"use strict";

/**
 * ptp-learn.js
 *
 * DERIVED SURFACE. The `learning-mode` key is owned by `skills/ptp-learn/SKILL.md`; the layered
 * configuration contract is owned by `skills/ptp-workspace/SKILL.md`. This script only implements
 * them and where they disagree the skills win.
 *
 * Resolves the learning mode and the two learnings file paths and prints one JSON line:
 *   {"mode","modeLayer","project":{"path","fallback"},"user":{"path"},"sameFile"}
 *
 * `--append <input.json>` appends one lesson to the project copy and then the user copy (one
 * lesson in the user form when both are one file), then reports the read-only git ignore check:
 *   {"written","lessonId","writes":[{"copy","path"}],"git"}
 * Under `learning-mode` off it writes nothing and prints {"written":false,"reason":"learning-mode off"}.
 * It never stages, records or ignores anything in git.
 *
 * `--size` counts lesson headings and physical lines in both learnings files, read-only, and prints
 * one line, `learnings — project: <n> issues, <m> lines · user: <n> issues, <m> lines`, or nothing
 * under `learning-mode` off. It never creates a file or folder.
 *
 * `--list-insights` merges the insights of both learnings files, read-only, and prints the part (j)
 * block `skills/ptp-run-at-model/references/learnings-readback.md` defines (that file owns the
 * text): project lessons first, then user lessons whose id no project lesson has, or every lesson
 * labelled `shared` when both paths are one file. It prints nothing under `off` or `learn-only` or
 * when no insight survives; an unreadable file adds nothing and warns once on stderr.
 *
 * Usage: node scripts/ptp-learn.js [--workspace <root>] [--append <input.json> | --size | --list-insights]
 *        node scripts/ptp-learn.js --self-test
 *
 * Exit codes: 0 success, 1 self-test failure or failed append write, 2 usage error (usage on
 * stderr, stdout empty).
 *
 * Plain Node, zero dependencies, no network.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");
const resolver = require("./ptp-resolve-workspace.js");

const LEARNING_MODES = Object.freeze(["off", "learn-only", "learn-and-suggest", "learn-and-use"]);
// The one pattern every operation tests single lines with to find lesson headings. No flags: a `g`
// flag would make `.test` stateful.
const LESSON_HEADING_RE = /^## Lesson [0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/;
const USAGE =
  "usage: node scripts/ptp-learn.js [--workspace <root>] [--append <input.json> | --size | --list-insights] | --self-test";

function normalizeLearningMode(value) {
  return typeof value === "string" && LEARNING_MODES.indexOf(value) !== -1 ? value : resolver.REJECT;
}

function slashes(p) {
  return String(p).split(path.sep).join("/");
}

function learningsFile(root) {
  return slashes(path.join(root, ".claude", "ptp", "learnings.md"));
}

// Canonical form for same-file detection: real path of the deepest existing ancestor, remaining
// segments joined back, lower-cased on Windows. Never throws on a file that does not exist yet.
function canonicalPath(p) {
  const full = path.resolve(p);
  const rest = [];
  let dir = full;
  for (;;) {
    if (fs.existsSync(dir)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    rest.unshift(path.basename(dir));
    dir = parent;
  }
  let real = dir;
  try {
    real = fs.realpathSync(dir);
  } catch (e) {
    real = dir;
  }
  const joined = path.join.apply(path, [real].concat(rest));
  return process.platform === "win32" ? joined.toLowerCase() : joined;
}

function sameFile(a, b) {
  return canonicalPath(a) === canonicalPath(b);
}

function pickRoot(opts) {
  if (typeof opts.workspace === "string" && opts.workspace !== "") {
    const root = path.resolve(opts.cwd, opts.workspace);
    return { root: root, fallback: null, layerOptions: { cwd: root, workspaceRoot: root } };
  }
  let real = opts.cwd;
  try {
    real = fs.realpathSync(opts.cwd);
  } catch (e) {
    real = opts.cwd;
  }
  const git = resolver.findGitRoot(real);
  if (git === null) {
    return { root: real, fallback: "cwd", layerOptions: { cwd: real, repoRoot: real, workspaceRoot: null } };
  }
  const ws = resolver.findWorkspaceRoot(real, git);
  if (ws !== null) {
    return { root: ws, fallback: null, layerOptions: { cwd: real, repoRoot: git, workspaceRoot: ws } };
  }
  return { root: git, fallback: "repo", layerOptions: { cwd: real, repoRoot: git, workspaceRoot: null } };
}

function resolveLearning(options) {
  const o = options || {};
  const opts = { cwd: path.resolve(o.cwd || process.cwd()), workspace: o.workspace };
  const picked = pickRoot(opts);
  const layers = resolver.configLayers(picked.layerOptions);
  const mode = resolver.resolveConfigKey(layers, "learning-mode", normalizeLearningMode, "off");
  const project = learningsFile(picked.root);
  const user = learningsFile(path.resolve(resolver.homeDir()));
  return {
    mode: mode.value,
    modeLayer: mode.layer,
    project: { path: project, fallback: picked.fallback },
    user: { path: user },
    sameFile: sameFile(project, user),
  };
}

// ---------------------------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------------------------

const LESSON_SOURCES = Object.freeze(["prompt-fix", "learn"]);
const LESSON_SCOPES = Object.freeze(["general", "project-specific"]);
const TEXT_FIELDS = ["reference", "response", "specificInsight", "generalInsight"];

// CRLF to LF, trailing line breaks removed. No other normalization.
function normalizeText(s) {
  return s.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

// Returns { input } or { error }. Runs before the mode check and before any write.
function readAppendInput(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { error: "cannot read --append input " + file };
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { error: "--append input is not JSON: " + file };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { error: "--append input is not a JSON object" };
  if (LESSON_SOURCES.indexOf(obj.source) === -1) return { error: "source must be one of " + LESSON_SOURCES.join(", ") };
  if (LESSON_SCOPES.indexOf(obj.scope) === -1) return { error: "scope must be one of " + LESSON_SCOPES.join(", ") };
  const input = { source: obj.source, scope: obj.scope };
  for (const k of TEXT_FIELDS) {
    if (typeof obj[k] !== "string" || obj[k].trim() === "") return { error: k + " must be a non-empty string" };
    input[k] = normalizeText(obj[k]);
  }
  return { input: input };
}

function pad(v, w) {
  return String(v).padStart(w, "0");
}

// `<YYYYMMDD>T<HHMMSS>Z-<6 hex>`, made once per append; `date` is the UTC date of the same instant.
function newLessonId(now) {
  const d = now || new Date();
  const date = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1, 2) + "-" + pad(d.getUTCDate(), 2);
  const time = pad(d.getUTCHours(), 2) + pad(d.getUTCMinutes(), 2) + pad(d.getUTCSeconds(), 2);
  const id = date.replace(/-/g, "") + "T" + time + "Z-" + crypto.randomBytes(3).toString("hex");
  return { id: id, date: date };
}

function quoteBlock(text) {
  return text
    .split("\n")
    .map((l) => (l === "" ? ">" : "> " + l))
    .join("\n");
}

// The project form omits origin and scope and carries the specific insight; the user form carries
// origin, scope and the general insight.
function formatLesson(lesson, input, userForm, origin) {
  const fields = ["- date: " + lesson.date, "- source: " + input.source];
  if (userForm) fields.push("- origin: " + origin, "- scope: " + input.scope);
  const insight = userForm ? input.generalInsight : input.specificInsight;
  return (
    "## Lesson " + lesson.id + "\n\n" +
    fields.join("\n") + "\n\n" +
    "### Reference\n\n" + quoteBlock(input.reference) + "\n\n" +
    "### Response\n\n" + quoteBlock(input.response) + "\n\n" +
    "### Insight\n\n" + quoteBlock(insight) + "\n"
  );
}

// The repo folder name (the git root found from the workspace root, else the project copy's base
// folder), then `/<slug>` when the workspace slug is not empty. A fallback path has no slug.
function originTag(root, fallback) {
  let real = root;
  try {
    real = fs.realpathSync(root);
  } catch (e) {
    real = root;
  }
  const git = resolver.findGitRoot(real);
  if (git === null) return path.basename(real);
  if (fallback !== null) return path.basename(git);
  const rel = path.relative(git, real);
  const slug = resolver.deriveSlug(slashes(rel), rel === "");
  return slug === "" ? path.basename(git) : path.basename(git) + "/" + slug;
}

// Appends one lesson; an append to a non-empty file writes one blank line first.
function appendLesson(file, text) {
  let prefix = "";
  try {
    const existing = fs.readFileSync(file, "utf8");
    if (existing !== "") prefix = existing.endsWith("\n") ? "\n" : "\n\n";
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  fs.appendFileSync(file, prefix + text);
}

function runAppend(options) {
  const r = resolveLearning(options);
  if (r.mode === "off") return { code: 0, out: { written: false, reason: "learning-mode off" } };
  const input = options.input;
  const lesson = newLessonId();
  const root = path.dirname(path.dirname(path.dirname(r.project.path)));
  const origin = originTag(root, r.project.fallback);
  const targets = r.sameFile
    ? [{ copy: "shared", path: r.user.path, userForm: true }]
    : [
        { copy: "project", path: r.project.path, userForm: false },
        { copy: "user", path: r.user.path, userForm: true },
      ];
  const writes = [];
  for (const t of targets) {
    try {
      fs.mkdirSync(path.dirname(t.path), { recursive: true });
      appendLesson(t.path, formatLesson(lesson, input, t.userForm, origin));
    } catch (e) {
      // Append-only: a copy already written stays.
      const why = e && e.code ? e.code : String(e && e.message ? e.message : e);
      return {
        code: 1,
        out: { written: false, lessonId: lesson.id, writes: writes, error: "cannot write " + t.path + " (" + why + ")" },
      };
    }
    writes.push({ copy: t.copy, path: t.path });
  }
  return { code: 0, out: { written: true, lessonId: lesson.id, writes: writes, git: gitIgnoreState(r.project.path) } };
}

// Read-only: `git check-ignore -q -- <project path>` from the project file's folder. Exit 0 is
// `ignored`, exit 1 `not-ignored`, anything else (no repository, no git) `no-git`.
function gitIgnoreState(file) {
  const r = cp.spawnSync("git", ["check-ignore", "-q", "--", file], {
    cwd: path.dirname(file),
    stdio: "ignore",
  });
  if (r.status === 0) return "ignored";
  if (r.status === 1) return "not-ignored";
  return "no-git";
}

// ---------------------------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------------------------

// One slot of the size line. Physical lines split on \r?\n, a final newline adds none, an empty file
// has 0; issues are the lines LESSON_HEADING_RE matches. Read-only.
function sizeSlot(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return e && e.code === "ENOENT" ? "0 issues, 0 lines (no file yet)" : "unreadable";
  }
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const issues = lines.filter((l) => LESSON_HEADING_RE.test(l)).length;
  return issues + " issues, " + lines.length + " lines";
}

// Returns the size line without its newline, or "" under learning-mode off.
function runSize(options) {
  const r = resolveLearning(options);
  if (r.mode === "off") return "";
  if (r.sameFile) return "learnings — project + user (same file): " + sizeSlot(r.user.path);
  return "learnings — project: " + sizeSlot(r.project.path) + " · user: " + sizeSlot(r.user.path);
}

// ---------------------------------------------------------------------------------------------
// List insights (read-back)
// ---------------------------------------------------------------------------------------------

// The part (j) rule text. `skills/ptp-run-at-model/references/learnings-readback.md` owns it; these
// lines must occur there verbatim (self-test `readback-rules-in-reference`) and the reference wins.
const READBACK_RULES_HEADER = "Rules for these insights:";
const SHARED_RULES = Object.freeze([
  "- Use an insight only at a choice it covers: an assumption, an open question, or a default you would otherwise pick yourself.",
  "- When a project insight and a user insight disagree, follow the project insight.",
  "- An insight is a preference, never evidence: every fact you state still cites code you read.",
  "- Ask the user nothing about an insight.",
]);
const MODE_RULES = Object.freeze({
  "learn-and-suggest":
    "- learn-and-suggest: keep your own default at each choice an insight covers, and write `Suggested by learned insight <id>: <what it would change>` beside it without applying it.",
  "learn-and-use":
    "- learn-and-use: adopt the insight as your default at each choice it covers, and mark that choice `Assumed from learned insight <id>`.",
});

// The one reader of the lesson format. Returns [{ id, date, source, origin, projectSpecific, insight }]
// in file order; a field the lesson lacks is "" (projectSpecific false). Lessons start at lines
// LESSON_HEADING_RE matches; field lines are read before the first `### ` heading; the insight is the
// `> ` / `>` quoted block after `### Insight`, prefixes stripped, empty lines dropped, joined by spaces.
function parseLessons(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  const lessons = [];
  let cur = null;
  let section = null; // null = field region, else the `### ` heading name
  let insightLines = null;
  const finish = () => {
    if (cur === null) return;
    cur.insight = insightLines === null ? "" : insightLines.join(" ");
    lessons.push(cur);
  };
  for (const line of lines) {
    if (LESSON_HEADING_RE.test(line)) {
      finish();
      cur = { id: line.slice("## Lesson ".length), date: "", source: "", origin: "", projectSpecific: false, insight: "" };
      section = null;
      insightLines = null;
      continue;
    }
    if (cur === null) continue;
    if (line.indexOf("### ") === 0) {
      section = line.slice(4).trim();
      if (section === "Insight" && insightLines === null) insightLines = [];
      continue;
    }
    if (section === null) {
      const m = /^- (date|source|origin|scope): (.*)$/.exec(line);
      if (m === null) continue;
      const v = m[2].trim();
      if (m[1] === "scope") cur.projectSpecific = v === "project-specific";
      else if (cur[m[1]] === "") cur[m[1]] = v;
    } else if (section === "Insight" && insightLines !== null && line.charAt(0) === ">") {
      const body = line.charAt(1) === " " ? line.slice(2) : line.slice(1);
      if (body.trim() !== "") insightLines.push(body.trim());
    }
  }
  finish();
  return lessons;
}

// Returns the lessons of one file, [] when it is missing; an unreadable file warns once on stderr.
function readLessons(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (!(e && e.code === "ENOENT")) {
      process.stderr.write("ptp-learn: cannot read " + file + " (" + (e && e.code ? e.code : String(e)) + "); its lessons are skipped\n");
    }
    return [];
  }
  return parseLessons(text);
}

function entryLine(label, l) {
  const parts = [l.id];
  if (l.source !== "") parts.push(l.source);
  if (l.date !== "") parts.push(l.date);
  if (l.origin !== "") parts.push("origin " + l.origin);
  if (l.projectSpecific) parts.push("project-specific");
  return "- [" + label + "] " + parts.join(" · ") + ": " + l.insight;
}

// Returns the part (j) block with its final newline, or "" when the mode reads nothing back or no
// insight survives the merge. Read-only.
function runListInsights(options) {
  const r = resolveLearning(options);
  if (r.mode !== "learn-and-suggest" && r.mode !== "learn-and-use") return "";
  let entries;
  if (r.sameFile) {
    entries = readLessons(r.user.path).map((l) => ({ label: "shared", lesson: l }));
  } else {
    const project = readLessons(r.project.path);
    const ids = new Set(project.map((l) => l.id));
    const user = readLessons(r.user.path).filter((l) => !ids.has(l.id));
    entries = project.map((l) => ({ label: "project", lesson: l }))
      .concat(user.map((l) => ({ label: "user", lesson: l })));
  }
  entries = entries.filter((e) => e.lesson.insight !== "");
  if (entries.length === 0) return "";
  const out = ["Learned insights — " + r.mode]
    .concat(entries.map((e) => entryLine(e.label, e.lesson)))
    .concat(["", READBACK_RULES_HEADER])
    .concat(SHARED_RULES)
    .concat([MODE_RULES[r.mode]]);
  return out.join("\n") + "\n";
}

// Returns { workspace, append, size, listInsights } or { error }. `--self-test` is handled by the caller.
function parseArgs(argv) {
  let workspace;
  let append;
  let size = false;
  let listInsights = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workspace") {
      if (workspace !== undefined) return { error: "--workspace given twice" };
      const v = argv[i + 1];
      if (v === undefined || v === "") return { error: "--workspace needs a value" };
      workspace = v;
      i++;
    } else if (a === "--append") {
      if (append !== undefined) return { error: "--append given twice" };
      const v = argv[i + 1];
      if (v === undefined || v === "") return { error: "--append needs a value" };
      append = v;
      i++;
    } else if (a === "--size") {
      if (size) return { error: "--size given twice" };
      size = true;
    } else if (a === "--list-insights") {
      if (listInsights) return { error: "--list-insights given twice" };
      listInsights = true;
    } else {
      return { error: "unknown argument " + a };
    }
  }
  const ops = (append !== undefined ? 1 : 0) + (size ? 1 : 0) + (listInsights ? 1 : 0);
  if (ops > 1) return { error: "--append, --size and --list-insights are separate operations" };
  return { workspace: workspace, append: append, size: size, listInsights: listInsights };
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (e) {
    return false;
  }
}

function usageError(msg) {
  process.stderr.write(msg + "\n" + USAGE + "\n");
  process.exit(2);
}

function main(argv) {
  if (argv.indexOf("--self-test") !== -1) {
    if (argv.length !== 1) usageError("--self-test takes no other argument");
    process.exit(runSelfTest());
  }
  const parsed = parseArgs(argv);
  if (parsed.error) usageError(parsed.error);
  if (parsed.workspace !== undefined && !isDir(path.resolve(parsed.workspace))) {
    usageError("--workspace is not an existing directory: " + parsed.workspace);
  }
  if (parsed.append !== undefined) {
    const read = readAppendInput(path.resolve(parsed.append));
    if (read.error) usageError(read.error);
    const res = runAppend({ cwd: process.cwd(), workspace: parsed.workspace, input: read.input });
    process.stdout.write(JSON.stringify(res.out) + "\n");
    process.exit(res.code);
  }
  if (parsed.size) {
    const line = runSize({ cwd: process.cwd(), workspace: parsed.workspace });
    if (line !== "") process.stdout.write(line + "\n");
    process.exit(0);
  }
  if (parsed.listInsights) {
    // No process.exit: the block is uncapped, and exiting could drop a pending pipe write.
    process.stdout.write(runListInsights({ cwd: process.cwd(), workspace: parsed.workspace }));
    process.exitCode = 0;
    return;
  }
  process.stdout.write(JSON.stringify(resolveLearning({ cwd: process.cwd(), workspace: parsed.workspace })) + "\n");
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------------------------

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function cfg(root, obj, raw) {
  writeFile(path.join(root, ".claude", "ptp", "config.json"), raw !== undefined ? raw : JSON.stringify(obj));
}

function eqPath(a, b) {
  const x = slashes(a);
  const y = slashes(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function runSelfTest() {
  const results = [];
  const check = (name, fn) => {
    try {
      const r = fn();
      if (r && r.skip) results.push({ name: name, skip: r.skip });
      else results.push({ name: name, ok: r === undefined || r === true, why: typeof r === "string" ? r : "" });
    } catch (e) {
      results.push({ name: name, ok: false, why: String(e && e.message ? e.message : e) });
    }
  };

  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ptp-learn-")));
  const savedHome = process.env.PTP_HOME_DIR;
  let n = 0;
  const fresh = () => {
    const t = path.join(base, "t" + n++);
    const home = path.join(t, "home");
    const ws = path.join(t, "ws");
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(ws, { recursive: true });
    process.env.PTP_HOME_DIR = home;
    return { t: t, home: home, ws: ws };
  };
  const ok = (cond, why) => (cond ? true : why);
  const run = (args, cwd, env) =>
    cp.spawnSync(process.execPath, [__filename].concat(args), {
      cwd: cwd,
      encoding: "utf8",
      env: Object.assign({}, process.env, env || {}),
    });

  try {
    // ---- mode ----
    check("no-config-off-default", () => {
      const f = fresh();
      const r = resolveLearning({ cwd: f.ws, workspace: f.ws });
      return ok(r.mode === "off" && r.modeLayer === "default", JSON.stringify(r));
    });
    check("global-learn-only", () => {
      const f = fresh();
      cfg(f.home, { "learning-mode": "learn-only" });
      const r = resolveLearning({ cwd: f.ws, workspace: f.ws });
      return ok(r.mode === "learn-only" && r.modeLayer === "global", JSON.stringify(r));
    });
    check("workspace-overrides-project", () => {
      const f = fresh();
      fs.mkdirSync(path.join(f.ws, ".git"));
      const sub = path.join(f.ws, "p");
      fs.mkdirSync(path.join(sub, "openspec"), { recursive: true });
      cfg(f.ws, { "learning-mode": "learn-only" });
      cfg(sub, { "learning-mode": "learn-and-use" });
      const r = resolveLearning({ cwd: sub });
      return ok(r.mode === "learn-and-use" && r.modeLayer === "workspace", JSON.stringify(r));
    });
    check("typo-keeps-earlier", () => {
      const f = fresh();
      cfg(f.home, { "learning-mode": "learn-only" });
      cfg(f.ws, { "learning-mode": "Learn-Only" });
      const r = resolveLearning({ cwd: f.ws, workspace: f.ws });
      return ok(r.mode === "learn-only" && r.modeLayer === "global", JSON.stringify(r));
    });
    check("typo-alone-defaults", () => {
      const f = fresh();
      cfg(f.ws, { "learning-mode": true });
      const r = resolveLearning({ cwd: f.ws, workspace: f.ws });
      return ok(r.mode === "off" && r.modeLayer === "default", JSON.stringify(r));
    });
    check("non-string-rejected", () => {
      const bad = [true, 1, null, " off", "Learn-Only", "", ["off"], {}];
      for (const v of bad) {
        if (normalizeLearningMode(v) !== resolver.REJECT) return "accepted " + JSON.stringify(v);
      }
      for (const v of LEARNING_MODES) if (normalizeLearningMode(v) !== v) return "rejected " + v;
      return true;
    });
    check("unparseable-layer-skipped", () => {
      const f = fresh();
      cfg(f.home, { "learning-mode": "learn-only" });
      cfg(f.ws, null, "{ not json");
      const r = resolveLearning({ cwd: f.ws, workspace: f.ws });
      return ok(r.mode === "learn-only" && r.modeLayer === "global", JSON.stringify(r));
    });
    check("workspace-layer-matches-path", () => {
      const f = fresh();
      const elsewhere = path.join(f.t, "elsewhere");
      fs.mkdirSync(elsewhere);
      cfg(f.ws, { "learning-mode": "learn-and-suggest" });
      const r = resolveLearning({ cwd: elsewhere, workspace: f.ws });
      return ok(
        r.mode === "learn-and-suggest" && eqPath(r.project.path, learningsFile(f.ws)),
        JSON.stringify(r)
      );
    });

    // ---- paths ----
    check("workspace-path", () => {
      const f = fresh();
      fs.mkdirSync(path.join(f.t, ".git"));
      fs.mkdirSync(path.join(f.ws, "openspec"));
      const r = resolveLearning({ cwd: f.ws });
      return ok(
        eqPath(r.project.path, learningsFile(f.ws)) && r.project.fallback === null,
        JSON.stringify(r)
      );
    });
    check("root-workspace-not-fallback", () => {
      const f = fresh();
      fs.mkdirSync(path.join(f.ws, ".git"));
      fs.mkdirSync(path.join(f.ws, "openspec"));
      const r = resolveLearning({ cwd: f.ws });
      return ok(r.project.fallback === null && eqPath(r.project.path, learningsFile(f.ws)), JSON.stringify(r));
    });
    check("repo-fallback", () => {
      const f = fresh();
      fs.mkdirSync(path.join(f.ws, ".git"));
      const sub = path.join(f.ws, "a", "b");
      fs.mkdirSync(sub, { recursive: true });
      const r = resolveLearning({ cwd: sub });
      return ok(r.project.fallback === "repo" && eqPath(r.project.path, learningsFile(f.ws)), JSON.stringify(r));
    });
    check("cwd-fallback", () => {
      const f = fresh();
      if (resolver.findGitRoot(f.ws) !== null) return { skip: "temp folder sits inside a git repository" };
      const r = resolveLearning({ cwd: f.ws });
      return ok(r.project.fallback === "cwd" && eqPath(r.project.path, learningsFile(f.ws)), JSON.stringify(r));
    });
    check("home-override", () => {
      const f = fresh();
      const r = resolveLearning({ cwd: f.ws, workspace: f.ws });
      return ok(eqPath(r.user.path, learningsFile(f.home)), JSON.stringify(r));
    });

    // ---- same file ----
    check("same-file-home-workspace", () => {
      const f = fresh();
      const r = resolveLearning({ cwd: f.home, workspace: f.home });
      return ok(r.sameFile === true, JSON.stringify(r));
    });
    check("distinct-files", () => {
      const f = fresh();
      const r = resolveLearning({ cwd: f.ws, workspace: f.ws });
      return ok(r.sameFile === false, JSON.stringify(r));
    });
    check("same-file-case", () => {
      if (process.platform !== "win32") return { skip: "Windows only" };
      const f = fresh();
      return ok(sameFile(path.join(f.ws, "X", "l.md"), path.join(f.ws, "x", "L.md")), "case differs");
    });
    check("same-file-symlink", () => {
      const f = fresh();
      const link = path.join(f.t, "link");
      try {
        fs.symlinkSync(f.home, link, "junction");
      } catch (e) {
        return { skip: "symlink cannot be created" };
      }
      const r = sameFile(path.join(link, ".claude", "ptp", "learnings.md"), learningsFile(f.home));
      return ok(r === true, "link not followed");
    });

    // ---- cli ----
    check("cli-json-shape", () => {
      const f = fresh();
      const r = run(["--workspace", f.ws], f.t, { PTP_HOME_DIR: f.home });
      if (r.status !== 0) return "exit " + r.status;
      const lines = r.stdout.split("\n").filter(Boolean);
      if (lines.length !== 1) return "lines " + lines.length;
      const o = JSON.parse(lines[0]);
      const keys = Object.keys(o).sort().join(",");
      return ok(
        keys === "mode,modeLayer,project,sameFile,user" &&
          o.mode === "off" &&
          o.modeLayer === "default" &&
          o.project.fallback === null &&
          typeof o.project.path === "string" &&
          typeof o.user.path === "string" &&
          o.sameFile === false,
        lines[0]
      );
    });
    const usage = (args, cwd) => {
      const r = run(args, cwd);
      return ok(r.status === 2 && r.stdout === "" && /usage/.test(r.stderr), "exit " + r.status + " out " + r.stdout);
    };
    check("usage-unknown-arg", () => usage(["--bogus"], base));
    check("usage-missing-value", () => usage(["--workspace"], base));
    check("usage-twice", () => usage(["--workspace", base, "--workspace", base], base));
    check("usage-not-a-directory", () => usage(["--workspace", path.join(base, "nope")], base));

    // ---- append ----
    const HEADING = new RegExp("^## Lesson [0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$");
    const goodInput = (over) =>
      Object.assign(
        {
          source: "prompt-fix",
          reference: "The command will write prompt.md into the\nexisting change.\n\nKey assumptions: none.",
          response: "no, allocate a new change",
          specificInsight: "Prefers a fresh change over reusing 0101.",
          generalInsight: "Prefers a fresh change over reusing an existing one.",
          scope: "general",
        },
        over || {}
      );
    const inputFile = (f, obj, raw) => {
      const p = path.join(f.t, "in-" + n++ + ".json");
      fs.writeFileSync(p, raw !== undefined ? raw : JSON.stringify(obj));
      return p;
    };
    const parseOut = (r) => {
      try {
        return JSON.parse(r.stdout.trim());
      } catch (e) {
        return null;
      }
    };
    const appendRun = (f, ws, obj, env) => {
      const r = run(["--workspace", ws, "--append", inputFile(f, obj)], f.t, Object.assign({ PTP_HOME_DIR: f.home }, env || {}));
      return { r: r, out: parseOut(r) };
    };
    const readOrNull = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
    const countHeadings = (text) => text.split("\n").filter((l) => HEADING.test(l)).length;
    const blockText = (text, name) => {
      const lines = text.split("\n");
      const i = lines.indexOf("### " + name);
      if (i === -1) return null;
      const out = [];
      for (let j = i + 2; j < lines.length && lines[j].charAt(0) === ">"; j++) {
        out.push(lines[j] === ">" ? "" : lines[j].slice(2));
      }
      return out.join("\n");
    };
    const quote = (s) => s.split("\n").map((l) => (l === "" ? ">" : "> " + l)).join("\n");
    const lessonText = (id, input, origin) => {
      const date = id.slice(0, 4) + "-" + id.slice(4, 6) + "-" + id.slice(6, 8);
      const fields = ["- date: " + date, "- source: " + input.source];
      if (origin !== undefined) fields.push("- origin: " + origin, "- scope: " + input.scope);
      const insight = origin !== undefined ? input.generalInsight : input.specificInsight;
      return (
        "## Lesson " + id + "\n\n" + fields.join("\n") + "\n\n" +
        "### Reference\n\n" + quote(input.reference) + "\n\n" +
        "### Response\n\n" + quote(input.response) + "\n\n" +
        "### Insight\n\n" + quote(insight) + "\n"
      );
    };
    const learnOn = (f) => cfg(f.home, { "learning-mode": "learn-only" });

    check("append-format", () => {
      const f = fresh();
      learnOn(f);
      fs.mkdirSync(path.join(f.t, ".git"));
      fs.mkdirSync(path.join(f.ws, "openspec"));
      const input = goodInput();
      const a = appendRun(f, f.ws, input);
      if (a.r.status !== 0 || !a.out) return "exit " + a.r.status + " " + a.r.stdout + a.r.stderr;
      const keys = Object.keys(a.out).sort().join(",");
      if (keys !== "git,lessonId,writes,written") return "keys " + keys;
      if (a.out.written !== true) return "written " + a.out.written;
      const id = a.out.lessonId;
      if (!HEADING.test("## Lesson " + id)) return "id " + id;
      const origin = path.basename(f.t) + "/ws";
      const proj = readOrNull(learningsFile(f.ws));
      const user = readOrNull(learningsFile(f.home));
      if (proj !== lessonText(id, input)) return "project copy:\n" + proj;
      if (user !== lessonText(id, input, origin)) return "user copy:\n" + user;
      const w = a.out.writes;
      if (!Array.isArray(w) || w.length !== 2 || w[0].copy !== "project" || w[1].copy !== "user") return "writes " + JSON.stringify(w);
      if (!eqPath(w[0].path, learningsFile(f.ws)) || !eqPath(w[1].path, learningsFile(f.home))) return "paths " + JSON.stringify(w);
      // a second append to a non-empty file writes one blank line first
      const b = appendRun(f, f.ws, input);
      if (b.r.status !== 0 || !b.out) return "second exit " + b.r.status;
      const proj2 = readOrNull(learningsFile(f.ws));
      return ok(proj2 === proj + "\n" + lessonText(b.out.lessonId, input), "second append:\n" + proj2);
    });
    check("append-shared-id", () => {
      const f = fresh();
      cfg(f.home, { "learning-mode": "learn-and-use" });
      fs.mkdirSync(path.join(f.ws, ".git"));
      const a = appendRun(f, f.ws, goodInput());
      if (a.r.status !== 0 || !a.out) return "exit " + a.r.status + " " + a.r.stderr;
      const proj = readOrNull(learningsFile(f.ws)) || "";
      const user = readOrNull(learningsFile(f.home)) || "";
      const heading = "## Lesson " + a.out.lessonId;
      if (proj.split("\n")[0] !== heading || user.split("\n")[0] !== heading) return "ids differ";
      if (/^- (origin|scope):/m.test(proj)) return "project copy has origin or scope";
      if (user.indexOf("\n- origin: ws\n- scope: general\n") === -1) return "user copy origin/scope:\n" + user;
      return ok(blockText(proj, "Reference") === blockText(user, "Reference") &&
        blockText(proj, "Response") === blockText(user, "Response"), "reference or response differ");
    });
    check("append-pasted-heading", () => {
      const f = fresh();
      learnOn(f);
      const a = appendRun(f, f.ws, goodInput({ response: "keep this\n## Lesson 20260101T000000Z-abcdef\nand this" }));
      if (a.r.status !== 0) return "exit " + a.r.status;
      const proj = readOrNull(learningsFile(f.ws)) || "";
      const user = readOrNull(learningsFile(f.home)) || "";
      return ok(countHeadings(proj) === 1 && countHeadings(user) === 1, "heading count");
    });
    check("append-crlf-verbatim", () => {
      const f = fresh();
      learnOn(f);
      const a = appendRun(f, f.ws, goodInput({ response: "first\r\n\r\n## Lesson 20260101T000000Z-abcdef\r\n  last  \r\n\r\n" }));
      if (a.r.status !== 0) return "exit " + a.r.status;
      const proj = readOrNull(learningsFile(f.ws)) || "";
      if (proj.indexOf("\r") !== -1) return "CR kept";
      const got = blockText(proj, "Response");
      return ok(got === "first\n\n## Lesson 20260101T000000Z-abcdef\n  last  ", "response " + JSON.stringify(got));
    });
    check("append-same-file", () => {
      const f = fresh();
      learnOn(f);
      const input = goodInput();
      const a = appendRun(f, f.home, input);
      if (a.r.status !== 0 || !a.out) return "exit " + a.r.status + " " + a.r.stderr;
      const w = a.out.writes;
      if (!Array.isArray(w) || w.length !== 1 || w[0].copy !== "shared") return "writes " + JSON.stringify(w);
      const text = readOrNull(learningsFile(f.home)) || "";
      return ok(countHeadings(text) === 1 && /^- origin: /m.test(text) && /^- scope: general$/m.test(text) &&
        blockText(text, "Insight") === input.generalInsight, "shared copy:\n" + text);
    });
    check("append-off-no-write", () => {
      const f = fresh();
      const a = appendRun(f, f.ws, goodInput());
      if (a.r.status !== 0) return "exit " + a.r.status;
      if (a.r.stdout !== '{"written":false,"reason":"learning-mode off"}\n') return "stdout " + a.r.stdout;
      return ok(!fs.existsSync(path.join(f.ws, ".claude")) && !fs.existsSync(path.join(f.home, ".claude")), "file created");
    });
    check("append-invalid-input", () => {
      const f = fresh();
      learnOn(f);
      const bad = [
        { raw: "[1,2]" },
        { raw: "{ not json" },
        { raw: "null" },
        { obj: goodInput({ source: "other" }) },
        { obj: goodInput({ scope: "everywhere" }) },
        { obj: goodInput({ reference: "" }) },
        { obj: goodInput({ response: "\r\n" }) },
        { obj: goodInput({ generalInsight: 7 }) },
        { obj: (() => { const o = goodInput(); delete o.specificInsight; return o; })() },
      ];
      for (const b of bad) {
        const p = inputFile(f, b.obj, b.raw);
        const r = run(["--workspace", f.ws, "--append", p], f.t, { PTP_HOME_DIR: f.home });
        if (r.status !== 2 || r.stdout !== "") return (b.raw || JSON.stringify(b.obj)) + ": exit " + r.status;
      }
      const good = inputFile(f, goodInput());
      const argSets = [["--append"], ["--append", good, "--append", good], ["--append", ""]];
      for (const args of argSets) {
        const r = run(["--workspace", f.ws].concat(args), f.t, { PTP_HOME_DIR: f.home });
        if (r.status !== 2 || r.stdout !== "") return args.join(" ") + ": exit " + r.status;
      }
      return ok(!fs.existsSync(learningsFile(f.ws)) && !fs.existsSync(learningsFile(f.home)), "file written");
    });
    check("append-unreadable-input", () => {
      const f = fresh();
      learnOn(f);
      for (const p of [path.join(f.t, "missing.json"), f.ws]) {
        const r = run(["--workspace", f.ws, "--append", p], f.t, { PTP_HOME_DIR: f.home });
        if (r.status !== 2 || r.stdout !== "") return p + ": exit " + r.status;
      }
      return ok(!fs.existsSync(learningsFile(f.ws)) && !fs.existsSync(learningsFile(f.home)), "file written");
    });
    check("append-creates-folders", () => {
      const f = fresh();
      cfg(f.home, { "learning-mode": "learn-and-suggest" });
      if (fs.existsSync(path.join(f.ws, ".claude"))) return "precondition";
      const a = appendRun(f, f.ws, goodInput());
      return ok(a.r.status === 0 && fs.existsSync(learningsFile(f.ws)), "exit " + a.r.status + " " + a.r.stderr);
    });
    check("append-write-failure", () => {
      const f = fresh();
      learnOn(f);
      fs.mkdirSync(learningsFile(f.home), { recursive: true }); // a folder where the user file belongs
      const a = appendRun(f, f.ws, goodInput());
      if (a.r.status !== 1 || !a.out) return "exit " + a.r.status + " " + a.r.stdout;
      const w = a.out.writes;
      return ok(
        a.out.written === false &&
          Array.isArray(w) && w.length === 1 && w[0].copy === "project" &&
          countHeadings(readOrNull(learningsFile(f.ws)) || "") === 1 &&
          typeof a.out.error === "string" &&
          slashes(a.out.error).toLowerCase().indexOf(learningsFile(f.home).toLowerCase()) !== -1,
        JSON.stringify(a.out)
      );
    });
    check("heading-re-export", () => {
      const code =
        "const re = require(process.argv[1]).LESSON_HEADING_RE;" +
        "process.stdout.write(JSON.stringify(re instanceof RegExp ? [re.source, re.flags] : null));";
      const r = cp.spawnSync(process.execPath, ["-e", code, __filename], { encoding: "utf8" });
      return ok(r.stdout === JSON.stringify([HEADING.source, ""]), "export " + r.stdout + r.stderr);
    });

    // ---- size ----
    const sizeRun = (f, ws) => run(["--workspace", ws, "--size"], f.t, { PTP_HOME_DIR: f.home });
    // `issues` lesson headings followed by filler, `total` physical lines, final newline included.
    const lessonsFile = (issues, total, eol) => {
      const e = eol || "\n";
      const lines = [];
      for (let i = 0; i < issues; i++) lines.push("## Lesson 20260101T00000" + i + "Z-abcde" + i, "");
      while (lines.length < total) lines.push(lines.length % 3 === 0 ? "" : "- filler " + lines.length);
      return lines.join(e) + e;
    };
    const sizeLine = (r) => (r.status === 0 ? r.stdout : "exit " + r.status + " " + r.stdout + r.stderr);

    check("size-off-silent", () => {
      const f = fresh();
      writeFile(learningsFile(f.ws), lessonsFile(1, 5));
      const r = sizeRun(f, f.ws);
      return ok(r.status === 0 && r.stdout === "" && r.stderr === "", "off printed " + JSON.stringify(sizeLine(r)));
    });
    check("size-two-files", () => {
      const f = fresh();
      learnOn(f);
      writeFile(learningsFile(f.ws), lessonsFile(2, 20));
      fs.appendFileSync(learningsFile(f.home), lessonsFile(3, 31)); // config.json already made the folder
      const r = sizeRun(f, f.ws);
      const want = "learnings — project: 2 issues, 20 lines · user: 3 issues, 31 lines\n";
      return ok(r.status === 0 && r.stdout === want, "got " + JSON.stringify(sizeLine(r)));
    });
    check("size-missing-no-file", () => {
      const f = fresh();
      learnOn(f);
      writeFile(learningsFile(f.home), lessonsFile(1, 4));
      const r = sizeRun(f, f.ws);
      const want = "learnings — project: 0 issues, 0 lines (no file yet) · user: 1 issues, 4 lines\n";
      if (r.status !== 0 || r.stdout !== want) return "got " + JSON.stringify(sizeLine(r));
      return ok(!fs.existsSync(path.join(f.ws, ".claude")), "project folder created");
    });
    check("size-same-file", () => {
      const f = fresh();
      learnOn(f);
      writeFile(learningsFile(f.home), lessonsFile(2, 7));
      const r = sizeRun(f, f.home);
      const want = "learnings — project + user (same file): 2 issues, 7 lines\n";
      return ok(r.status === 0 && r.stdout === want, "got " + JSON.stringify(sizeLine(r)));
    });
    check("size-unreadable", () => {
      const f = fresh();
      learnOn(f);
      fs.mkdirSync(learningsFile(f.ws), { recursive: true }); // a folder where the project file belongs
      writeFile(learningsFile(f.home), "");
      const r = sizeRun(f, f.ws);
      const want = "learnings — project: unreadable · user: 0 issues, 0 lines\n";
      return ok(r.status === 0 && r.stdout === want, "got " + JSON.stringify(sizeLine(r)));
    });
    check("size-crlf-lines", () => {
      const f = fresh();
      learnOn(f);
      writeFile(learningsFile(f.ws), lessonsFile(2, 9, "\r\n"));
      writeFile(learningsFile(f.home), "## Lesson 20260101T000000Z-abcdef\r\n\r\n\r\nno final newline");
      const r = sizeRun(f, f.ws);
      const want = "learnings — project: 2 issues, 9 lines · user: 1 issues, 4 lines\n";
      return ok(r.status === 0 && r.stdout === want, "got " + JSON.stringify(sizeLine(r)));
    });
    check("size-roundtrip-heading-like", () => {
      const f = fresh();
      learnOn(f);
      const a = appendRun(f, f.ws, goodInput({ response: "keep this\n## Lesson 20260101T000000Z-abcdef\nand this" }));
      if (a.r.status !== 0) return "append exit " + a.r.status;
      const r = sizeRun(f, f.ws);
      return ok(r.status === 0 && /^learnings — project: 1 issues, [0-9]+ lines · user: 1 issues, [0-9]+ lines\n$/.test(r.stdout),
        "got " + JSON.stringify(sizeLine(r)));
    });
    check("size-read-only", () => {
      const f = fresh();
      learnOn(f);
      const proj = learningsFile(f.ws);
      writeFile(proj, lessonsFile(1, 3));
      const before = fs.readFileSync(proj, "utf8");
      const listing = (d) => fs.readdirSync(d, { recursive: true }).map(String).sort().join("|");
      const tree = [listing(f.ws), listing(f.home)];
      const r = sizeRun(f, f.ws);
      if (r.status !== 0) return "exit " + r.status;
      if (fs.readFileSync(proj, "utf8") !== before) return "project file changed";
      return ok(listing(f.ws) === tree[0] && listing(f.home) === tree[1] && !fs.existsSync(learningsFile(f.home)),
        "file or folder created");
    });
    check("size-with-append", () => {
      const f = fresh();
      learnOn(f);
      const p = inputFile(f, goodInput());
      const sets = [["--size", "--append", p], ["--append", p, "--size"], ["--size", "--self-test"], ["--self-test", "--size"], ["--size", "--size"]];
      for (const args of sets) {
        const r = run(["--workspace", f.ws].concat(args), f.t, { PTP_HOME_DIR: f.home });
        if (r.status !== 2 || r.stdout !== "") return args.join(" ") + ": exit " + r.status;
      }
      return ok(!fs.existsSync(learningsFile(f.ws)) && !fs.existsSync(learningsFile(f.home)), "file written");
    });

    // ---- list insights ----
    const listRun = (f, ws) => run(["--workspace", ws, "--list-insights"], f.t, { PTP_HOME_DIR: f.home });
    const listOut = (r) => (r.status === 0 ? r.stdout : "exit " + r.status + " " + r.stdout + r.stderr);
    const entryLines = (stdout) => stdout.split("\n").filter((l) => l.indexOf("- [") === 0);
    const dateOf = (id) => id.slice(0, 4) + "-" + id.slice(4, 6) + "-" + id.slice(6, 8);
    const ID = ["20261101T000001Z-aaaaa1", "20261101T000002Z-aaaaa2", "20261101T000003Z-aaaaa3", "20261101T000004Z-aaaaa4"];
    const useOn = (f, mode) => cfg(f.home, { "learning-mode": mode || "learn-and-use" });
    const lessonsOf = (list) => list.map((l) => lessonText(l.id, goodInput(l.over), l.origin)).join("\n");
    const entry = (label, id, insight, extra) =>
      "- [" + label + "] " + id + " · prompt-fix · " + dateOf(id) + (extra || "") + ": " + insight;

    check("list-project-first", () => {
      const f = fresh();
      useOn(f);
      writeFile(learningsFile(f.ws), lessonsOf([
        { id: ID[1], over: { specificInsight: "Project two." } },
        { id: ID[0], over: { specificInsight: "Project one." } },
      ]));
      fs.writeFileSync(learningsFile(f.home), lessonsOf([
        { id: ID[3], origin: "repo/ws", over: { generalInsight: "User four." } },
        { id: ID[2], origin: "repo", over: { generalInsight: "User three.", scope: "project-specific" } },
      ]));
      const r = listRun(f, f.ws);
      if (r.status !== 0) return listOut(r);
      if (r.stdout.split("\n")[0] !== "Learned insights — learn-and-use") return "header " + JSON.stringify(r.stdout);
      const want = [
        entry("project", ID[1], "Project two."),
        entry("project", ID[0], "Project one."),
        entry("user", ID[3], "User four.", " · origin repo/ws"),
        entry("user", ID[2], "User three.", " · origin repo · project-specific"),
      ];
      return ok(JSON.stringify(entryLines(r.stdout)) === JSON.stringify(want), "got " + JSON.stringify(r.stdout));
    });
    check("list-shared-id-project-wins", () => {
      const f = fresh();
      useOn(f, "learn-and-suggest");
      writeFile(learningsFile(f.ws), lessonsOf([{ id: ID[0], over: { specificInsight: "Project copy." } }]));
      fs.writeFileSync(learningsFile(f.home), lessonsOf([
        { id: ID[1], origin: "ws", over: { generalInsight: "Only user." } },
        { id: ID[0], origin: "ws", over: { generalInsight: "User copy." } },
      ]));
      const r = listRun(f, f.ws);
      if (r.status !== 0) return listOut(r);
      const want = [entry("project", ID[0], "Project copy."), entry("user", ID[1], "Only user.", " · origin ws")];
      return ok(JSON.stringify(entryLines(r.stdout)) === JSON.stringify(want), "got " + JSON.stringify(r.stdout));
    });
    check("list-same-file-shared", () => {
      const f = fresh();
      useOn(f);
      fs.writeFileSync(learningsFile(f.home), lessonsOf([
        { id: ID[0], origin: "home", over: { generalInsight: "First." } },
        { id: ID[1], origin: "home", over: { generalInsight: "Second." } },
      ]));
      const r = listRun(f, f.home);
      if (r.status !== 0) return listOut(r);
      const want = [entry("shared", ID[0], "First.", " · origin home"), entry("shared", ID[1], "Second.", " · origin home")];
      return ok(JSON.stringify(entryLines(r.stdout)) === JSON.stringify(want), "got " + JSON.stringify(r.stdout));
    });
    check("list-silent", () => {
      const filled = (mode) => {
        const f = fresh();
        if (mode) useOn(f, mode);
        writeFile(learningsFile(f.ws), lessonsOf([{ id: ID[0] }]));
        writeFile(learningsFile(f.home), lessonsOf([{ id: ID[1], origin: "ws" }]));
        return f;
      };
      const cases = [
        ["off", filled(null)],
        ["learn-only", filled("learn-only")],
        ["missing files", (() => { const f = fresh(); useOn(f); return f; })()],
        ["zero lessons", (() => {
          const f = fresh();
          useOn(f, "learn-and-suggest");
          writeFile(learningsFile(f.ws), "# notes\n\nno lessons here\n");
          fs.writeFileSync(learningsFile(f.home), "");
          return f;
        })()],
      ];
      for (const c of cases) {
        const r = listRun(c[1], c[1].ws);
        if (r.status !== 0 || r.stdout !== "" || r.stderr !== "") return c[0] + ": " + JSON.stringify(listOut(r));
      }
      return ok(!fs.existsSync(learningsFile(cases[2][1].ws)) && !fs.existsSync(learningsFile(cases[2][1].home)), "file created");
    });
    check("list-no-insight-skipped", () => {
      const f = fresh();
      useOn(f);
      const noBlock = "## Lesson " + ID[0] + "\n\n- date: 2026-11-01\n- source: learn\n\n### Reference\n\n> r\n";
      const emptyBlock = "## Lesson " + ID[1] + "\n\n- date: 2026-11-01\n- source: learn\n\n### Insight\n\n";
      writeFile(learningsFile(f.ws), noBlock + "\n" + emptyBlock + "\n" + lessonsOf([{ id: ID[2], over: { specificInsight: "Kept." } }]));
      const r = listRun(f, f.ws);
      if (r.status !== 0) return listOut(r);
      return ok(JSON.stringify(entryLines(r.stdout)) === JSON.stringify([entry("project", ID[2], "Kept.")]), "got " + JSON.stringify(r.stdout));
    });
    check("list-crlf", () => {
      const f = fresh();
      useOn(f);
      const text = lessonsOf([{ id: ID[0], over: { specificInsight: "Line one\nline two\n\nline three" } }]);
      writeFile(learningsFile(f.ws), text.replace(/\n/g, "\r\n"));
      const r = listRun(f, f.ws);
      if (r.status !== 0) return listOut(r);
      if (r.stdout.indexOf("\r") !== -1) return "CR in output";
      return ok(JSON.stringify(entryLines(r.stdout)) === JSON.stringify([entry("project", ID[0], "Line one line two line three")]),
        "got " + JSON.stringify(r.stdout));
    });
    check("list-unreadable-warns", () => {
      const f = fresh();
      useOn(f);
      fs.mkdirSync(learningsFile(f.ws), { recursive: true }); // a folder where the project file belongs
      fs.writeFileSync(learningsFile(f.home), lessonsOf([{ id: ID[0], origin: "ws", over: { generalInsight: "Still listed." } }]));
      const r = listRun(f, f.ws);
      if (r.status !== 0) return listOut(r);
      const warn = r.stderr.split("\n").filter(Boolean);
      if (warn.length !== 1) return "stderr " + JSON.stringify(r.stderr);
      return ok(JSON.stringify(entryLines(r.stdout)) === JSON.stringify([entry("user", ID[0], "Still listed.", " · origin ws")]),
        "got " + JSON.stringify(r.stdout));
    });
    check("list-mode-rules", () => {
      const outFor = (mode) => {
        const f = fresh();
        useOn(f, mode);
        writeFile(learningsFile(f.ws), lessonsOf([{ id: ID[0] }]));
        return listRun(f, f.ws);
      };
      const s = outFor("learn-and-suggest");
      const u = outFor("learn-and-use");
      if (s.status !== 0) return "suggest " + listOut(s);
      if (u.status !== 0) return "use " + listOut(u);
      const lines = (r) => r.stdout.split("\n");
      if (lines(s)[0] !== "Learned insights — learn-and-suggest") return "suggest header";
      if (lines(u)[0] !== "Learned insights — learn-and-use") return "use header";
      for (const rule of SHARED_RULES) {
        if (lines(s).indexOf(rule) === -1 || lines(u).indexOf(rule) === -1) return "shared rule missing: " + rule;
      }
      const sm = MODE_RULES["learn-and-suggest"];
      const um = MODE_RULES["learn-and-use"];
      if (sm.indexOf("Suggested by learned insight <id>") === -1) return "suggest rule text";
      if (um.indexOf("Assumed from learned insight <id>") === -1) return "use rule text";
      return ok(lines(s).indexOf(sm) !== -1 && lines(s).indexOf(um) === -1 &&
        lines(u).indexOf(um) !== -1 && lines(u).indexOf(sm) === -1, "mode rule placement");
    });
    check("readback-rules-in-reference", () => {
      const ref = path.join(__dirname, "..", "skills", "ptp-run-at-model", "references", "learnings-readback.md");
      let text;
      try {
        text = fs.readFileSync(ref, "utf8").replace(/\r\n/g, "\n");
      } catch (e) {
        return "cannot read " + slashes(ref);
      }
      const lines = text.split("\n");
      const emitted = [READBACK_RULES_HEADER].concat(SHARED_RULES, Object.keys(MODE_RULES).map((k) => MODE_RULES[k]));
      for (const line of emitted) if (lines.indexOf(line) === -1) return "not in the reference verbatim: " + line;
      return ok(text.indexOf("Learned insights — <mode>") !== -1, "header shape missing from the reference");
    });
    check("list-usage-combined", () => {
      const f = fresh();
      useOn(f);
      const p = inputFile(f, goodInput());
      const sets = [
        ["--list-insights", "--size"], ["--size", "--list-insights"], ["--list-insights", "--append", p],
        ["--append", p, "--list-insights"], ["--list-insights", "--list-insights"],
        ["--list-insights", "--self-test"], ["--self-test", "--list-insights"],
      ];
      for (const args of sets) {
        const r = run(["--workspace", f.ws].concat(args), f.t, { PTP_HOME_DIR: f.home });
        if (r.status !== 2 || r.stdout !== "") return args.join(" ") + ": exit " + r.status;
      }
      return ok(!fs.existsSync(learningsFile(f.ws)) && !fs.existsSync(learningsFile(f.home)), "file written");
    });

    // ---- git report (temp repos; global and system git config isolated) ----
    const emptyGitConfig = path.join(base, "empty.gitconfig");
    fs.writeFileSync(emptyGitConfig, "");
    const gitEnv = { GIT_CONFIG_GLOBAL: emptyGitConfig, GIT_CONFIG_NOSYSTEM: "1", GIT_CEILING_DIRECTORIES: base };
    const git = (args, cwd) =>
      cp.spawnSync("git", args, { cwd: cwd, encoding: "utf8", env: Object.assign({}, process.env, gitEnv) });
    const hasGit = git(["--version"], base).status === 0;
    const gitCase = (ignore, want) => {
      if (!hasGit) return { skip: "git is not available" };
      const f = fresh();
      learnOn(f);
      if (git(["init", "-q"], f.ws).status !== 0) return { skip: "git init failed" };
      const gi = path.join(f.ws, ".gitignore");
      fs.writeFileSync(gi, ignore ? ".claude/\n" : "node_modules/\n");
      const before = [git(["status", "--porcelain"], f.ws).stdout, git(["ls-files", "--stage"], f.ws).stdout];
      const a = appendRun(f, f.ws, goodInput(), gitEnv);
      if (a.r.status !== 0 || !a.out) return "exit " + a.r.status + " " + a.r.stderr;
      if (a.out.git !== want) return "git " + a.out.git;
      const staged = git(["ls-files", "--stage"], f.ws).stdout;
      if (staged !== before[1]) return "index changed";
      if (fs.readFileSync(gi, "utf8") !== (ignore ? ".claude/\n" : "node_modules/\n")) return ".gitignore changed";
      if (ignore && git(["status", "--porcelain"], f.ws).stdout !== before[0]) return "status changed";
      return true;
    };
    check("git-ignored", () => gitCase(true, "ignored"));
    check("git-not-ignored", () => gitCase(false, "not-ignored"));
    check("git-no-git", () => {
      const f = fresh();
      learnOn(f);
      if (hasGit && git(["rev-parse", "--git-dir"], f.ws).status === 0) return { skip: "temp folder sits inside a git repository" };
      const a = appendRun(f, f.ws, goodInput(), gitEnv);
      return ok(a.r.status === 0 && a.out && a.out.git === "no-git", "exit " + a.r.status + " " + a.r.stdout);
    });
  } finally {
    if (savedHome === undefined) delete process.env.PTP_HOME_DIR;
    else process.env.PTP_HOME_DIR = savedHome;
    try {
      fs.rmSync(base, { recursive: true, force: true });
    } catch (e) {
      // best effort
    }
  }

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.skip) process.stdout.write("SKIP " + r.name + ": " + r.skip + "\n");
    else if (r.ok) passed++;
    else {
      failed++;
      process.stdout.write("FAIL " + r.name + (r.why ? ": " + r.why : "") + "\n");
    }
  }
  const total = results.filter((r) => !r.skip).length;
  process.stdout.write("self-test checks passed: " + passed + "/" + total + "\n");
  return failed === 0 ? 0 : 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  LEARNING_MODES: LEARNING_MODES,
  LESSON_HEADING_RE: LESSON_HEADING_RE,
  READBACK_RULES_HEADER: READBACK_RULES_HEADER,
  SHARED_RULES: SHARED_RULES,
  MODE_RULES: MODE_RULES,
  parseLessons: parseLessons,
  normalizeLearningMode: normalizeLearningMode,
  resolveLearning: resolveLearning,
};
