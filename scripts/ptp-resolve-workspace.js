#!/usr/bin/env node
"use strict";

/**
 * ptp-resolve-workspace.js
 *
 * DERIVED SURFACE. The workspace-root contract AND the layered configuration contract are both owned
 * by `skills/ptp-workspace/SKILL.md`; this script only implements them. It introduces no workspace
 * rule and no configuration rule the skill does not state -- it states no layer order and no
 * precedence of its own -- and where the two disagree the skill (ptp-workspace) wins. It owns no
 * key's validity rule either: every caller supplies its own normalizer.
 *
 * Resolves the workspace root for the working directory and prints one JSON object on stdout, and
 * publishes the executable half of the layered configuration contract to the other ptp scripts:
 *
 *   configLayers(options)   -> the ordered, deduplicated layer list, each entry labelled
 *   resolveConfigKey(...)   -> one key resolved over that list through a caller-supplied normalizer
 *   REJECT                  -> the sentinel a normalizer returns to reject a layer for a key
 *
 * Usage: node scripts/ptp-resolve-workspace.js [--workspace <path>]
 *        node scripts/ptp-resolve-workspace.js --self-test
 *
 * Exit codes: 0 success (JSON result on stdout), 1 resolution failure (JSON {code,message} on
 * stderr, stdout empty), 2 usage error (usage text on stderr, stdout empty).
 *
 * Plain Node, zero dependencies, no network, no git subprocess.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const USAGE = "Usage: node scripts/ptp-resolve-workspace.js [--workspace <path>] | --self-test";

// The closed set of resolution codes (ptp-workspace).
const CODES = {
  NO_GIT_ROOT: "no-git-root",
  NO_WORKSPACE: "no-workspace",
  WORKSPACE_MISSING: "workspace-missing",
  WORKSPACE_NOT_A_DIRECTORY: "workspace-not-a-directory",
  WORKSPACE_NO_OPENSPEC: "workspace-no-openspec",
  WORKSPACE_OUTSIDE_GIT_ROOT: "workspace-outside-git-root",
};

function normPath(p) {
  return String(p).split(path.sep).join("/");
}

function entryExists(p) {
  // lstat, not stat: a `.git` entry counts whether it is a directory, a file, or a symlink.
  try {
    fs.lstatSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (e) {
    return false;
  }
}

function realpathOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    return p;
  }
}

function findGitRoot(start) {
  let dir = start;
  for (;;) {
    if (entryExists(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findWorkspaceRoot(start, gitRoot) {
  let dir = start;
  for (;;) {
    if (isDirectory(path.join(dir, "openspec"))) return dir;
    if (dir === gitRoot) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function realpathOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch (e) {
    return null;
  }
}

// Lexical containment over two ALREADY-canonical paths. Containment keeps the shape
// scripts/ptp-skill-behavior-tests.js uses -- both sides resolved with fs.realpathSync, then compared
// with path.relative -- but the resolution happens ONCE at the call site and the same canonical path
// is both checked and used. Resolving twice would leave a window in which the path that passed the
// check is not the path that is emitted. A side that cannot be resolved fails CLOSED at the call
// site: it is never compared as an unresolved lexical path.
function isContained(realRoot, realTarget) {
  const rel = path.relative(realRoot, realTarget);
  // Only a real parent traversal is outside: the exact `..` segment, or one followed by a separator.
  // A bare `startsWith("..")` would also reject a contained directory whose own name merely begins
  // with dots (`<root>/..product` relativises to `..product`), which is at or below the root.
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}

function deriveSlug(relative, isRoot) {
  if (isRoot) return "";
  const collapsed = relative
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
  if (collapsed !== "") return collapsed;
  const digest = crypto.createHash("sha256").update(relative, "utf8").digest("hex");
  return "ws-" + digest.slice(0, 8);
}

/* ------------------------------------------------------ layered configuration (ptp-workspace) */

// Every layer's file is `<that layer's root>/.claude/ptp/config.json`. `ptp-workspace` names the
// three roots, their order, and their precedence; this array is only the suffix they share, and this
// file states neither the order nor any precedence of its own.
const CONFIG_RELATIVE = ['.claude', 'ptp', 'config.json'];

// The rejection sentinel. A normalizer returns THIS to reject a layer for a key, and any other value
// -- `undefined`, `null` and `0` included -- to resolve. A sentinel rather than a falsy convention is
// what keeps a legitimately falsy resolved value distinguishable from a rejection.
const REJECT = Object.freeze({ ptpConfigRejection: true });

// PTP_HOME_DIR overrides the home directory the GLOBAL layer sits under, byte-for-byte as
// scripts/ptp-otel-sink.js's own homeDir() does, so the verification harness resolves configuration
// without touching the real user config.
function homeDir() {
  return process.env.PTP_HOME_DIR || os.homedir();
}

function readJsonFileOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

// An OWN property only: `constructor`, `toString` and friends live on the prototype, and reading one
// of those as if a layer had supplied it would hand the normalizer a function out of thin air.
function ownProp(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function configFileIn(root) {
  return path.join(root, CONFIG_RELATIVE[0], CONFIG_RELATIVE[1], CONFIG_RELATIVE[2]);
}

// Reduced form for the duplicate-path rule: absolute and normalized, NO realpath (it throws on a
// missing file and this reader never throws). Exact on POSIX, case-insensitive on win32.
function dedupeKey(file) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * The ordered, deduplicated layer list, each entry carrying its provenance label and its parsed
 * contents. Options, all optional:
 *
 *   cwd            the working directory resolution starts from (default `process.cwd()`)
 *   repoRoot       the repository root (default: the git root above `cwd`, else `cwd` itself)
 *   workspaceRoot  an explicit workspace root; `null` suppresses the layer; omitted means "walk"
 *
 * Each entry is `{ label, root, file, data }`, where `data` is the parsed object or `null` when the
 * file is missing, unreadable, unparseable, or not object-rooted. A candidate whose reduced path
 * equals an earlier candidate's is dropped, keeping the EARLIEST occurrence and its position.
 */
function configLayers(options) {
  const opts = options || {};
  const cwd = path.resolve(opts.cwd === undefined || opts.cwd === null ? process.cwd() : opts.cwd);

  let repoRoot;
  if (opts.repoRoot === undefined || opts.repoRoot === null) {
    const gitRoot = findGitRoot(cwd);
    // Not inside a git repository: the repository candidate falls back to the working directory,
    // exactly as the interactive editor already does.
    repoRoot = gitRoot === null ? cwd : gitRoot;
  } else {
    repoRoot = path.resolve(opts.repoRoot);
  }

  let workspaceRoot = null;
  if (Object.prototype.hasOwnProperty.call(opts, "workspaceRoot")) {
    workspaceRoot =
      opts.workspaceRoot === null || opts.workspaceRoot === undefined ? null : path.resolve(opts.workspaceRoot);
  } else if (isContained(repoRoot, cwd)) {
    // The walk is bounded by the repository root (ptp-workspace). A working directory outside that
    // bound leaves the walk nowhere to run, so no workspace root resolves -- an ABSENCE, not an error.
    workspaceRoot = findWorkspaceRoot(cwd, repoRoot);
  }

  const candidates = [
    { label: "global", root: path.resolve(homeDir()) },
    { label: "project", root: repoRoot },
  ];
  if (workspaceRoot !== null) candidates.push({ label: "workspace", root: workspaceRoot });

  const layers = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const file = configFileIn(candidate.root);
    const key = dedupeKey(file);
    if (seen.has(key)) continue; // dropped: read once, at the earliest occurrence's position
    seen.add(key);
    const parsed = readJsonFileOrNull(file);
    layers.push({
      label: candidate.label,
      root: candidate.root,
      file: file,
      data: isPlainObject(parsed) ? parsed : null,
    });
  }
  return layers;
}

/**
 * Resolve ONE key over the layer list. `keyPath` is a dotted path (`"telemetry.root"`) or an array of
 * segments; `normalize` receives the raw value and returns either the value to resolve or `REJECT`;
 * `fallback` is the key's default, which applies LAST and only when no layer supplied a valid value.
 *
 * Returns `{ value, layer }`, where `layer` is one of `default`, `global`, `project`, `workspace`.
 *
 * Never throws. A layer that is missing, unreadable, unparseable, not object-rooted, whose parent
 * block is not an object, or that does not carry the key is skipped FOR THAT KEY ONLY. A normalizer
 * that raises is treated as a rejection: the never-throw prohibition outranks a caller's defect.
 */
function resolveConfigKey(layers, keyPath, normalize, fallback) {
  const segments = Array.isArray(keyPath) ? keyPath.slice() : String(keyPath).split(".");
  let value = fallback;
  let label = "default";
  if (!Array.isArray(layers) || segments.length === 0) return { value: value, layer: label };

  for (const entry of layers) {
    if (!entry) continue;
    const data = Object.prototype.hasOwnProperty.call(entry, "data")
      ? entry.data
      : readJsonFileOrNull(entry.file);
    let node = isPlainObject(data) ? data : null;
    for (let i = 0; node !== null && i < segments.length - 1; i++) {
      const next = ownProp(node, segments[i]);
      node = isPlainObject(next) ? next : null;
    }
    if (node === null) continue;
    const leaf = segments[segments.length - 1];
    if (!Object.prototype.hasOwnProperty.call(node, leaf)) continue;
    let normalized;
    try {
      normalized = normalize(node[leaf]);
    } catch (e) {
      continue; // a throwing normalizer rejects this layer for this key and nothing else
    }
    if (normalized === REJECT) continue;
    value = normalized;
    label = entry.label;
  }
  return { value: value, layer: label };
}

function parseArgs(argv) {
  let workspace = null;
  let seen = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token !== "--workspace") {
      return { usageError: "unexpected argument '" + token + "'" };
    }
    if (seen) {
      return { usageError: "--workspace given more than once" };
    }
    const next = argv[i + 1];
    if (next === undefined || next === "--workspace") {
      return { usageError: "--workspace requires a path" };
    }
    seen = true;
    workspace = next;
    i++;
  }
  return { workspace };
}

/* ------------------------------------------------------------------ self-test (--self-test) */

// Fixture helpers. Every path the self-test creates lives under os.tmpdir(); nothing is written
// inside the repository and the real user config is never read (PTP_HOME_DIR points elsewhere).
function writeDeep(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function removeTree(dir) {
  try {
    if (typeof fs.rmSync === "function") fs.rmSync(dir, { recursive: true, force: true });
    else fs.rmdirSync(dir, { recursive: true });
  } catch (e) {
    /* a leftover temp directory is never a test failure */
  }
}

function buildFixture() {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ptp-config-layers-"));
  const home = path.join(base, "home");
  const repo = path.join(base, "repo");
  const foo = path.join(repo, "products", "foo");
  const bad = path.join(repo, "products", "bad");
  const arr = path.join(repo, "products", "arr");
  const dir = path.join(repo, "products", "dir");

  writeDeep(configFileIn(home), JSON.stringify({ telemetry: { mode: "on", root: "global/store", port: 4000 } }));

  fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
  fs.mkdirSync(path.join(repo, "openspec"), { recursive: true });
  writeDeep(configFileIn(repo), JSON.stringify({ telemetry: { root: "repo/store", port: 5000 } }));

  fs.mkdirSync(path.join(foo, "openspec"), { recursive: true });
  writeDeep(configFileIn(foo), JSON.stringify({ telemetry: { root: "  ws/store  ", port: "nope" } }));

  fs.mkdirSync(path.join(bad, "openspec"), { recursive: true });
  writeDeep(configFileIn(bad), "{ this is not json");

  fs.mkdirSync(path.join(arr, "openspec"), { recursive: true });
  writeDeep(configFileIn(arr), JSON.stringify([1, 2]));

  fs.mkdirSync(path.join(dir, "openspec"), { recursive: true });
  fs.mkdirSync(configFileIn(dir), { recursive: true }); // an unreadable layer: the path is a directory

  return { base: base, home: home, repo: repo, foo: foo, bad: bad, arr: arr, dir: dir };
}

// The self-test's normalizers. Each is a CALLER's rule -- this script owns none of them.
function selfTestRootNormalizer(v) {
  if (typeof v !== "string") return REJECT;
  const trimmed = v.trim();
  if (trimmed === "" || path.isAbsolute(trimmed)) return REJECT;
  if (trimmed.split(/[\\/]+/).some((seg) => seg === "..")) return REJECT;
  return trimmed; // trim-then-RESOLVE: the trimmed form is the resolved value, not just the checked one
}

function selfTestPortNormalizer(v) {
  return Number.isInteger(v) && v >= 1 && v <= 65535 ? v : REJECT;
}

function selfTestModeNormalizer(v) {
  return v === "on" || v === "off" ? v : REJECT;
}

// The two-layer reader as it stood before the workspace layer existed, kept here so the equal-roots
// case is asserted against it rather than against a restatement of its answer.
function legacyTwoLayerRoot(homeRoot, repoRoot, fallback) {
  let root = fallback;
  for (const file of [configFileIn(homeRoot), configFileIn(repoRoot)]) {
    const obj = readJsonFileOrNull(file);
    if (!isPlainObject(obj)) continue;
    const t = obj.telemetry;
    if (!isPlainObject(t)) continue;
    const normalized = selfTestRootNormalizer(t.root);
    if (normalized !== REJECT) root = normalized;
  }
  return root;
}

function runSelfTest() {
  const failures = [];
  let passed = 0;
  const check = (name, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) passed += 1;
    else failures.push(name + ": expected " + e + ", got " + a);
  };

  const previousHome = process.env.PTP_HOME_DIR;
  const hadHome = Object.prototype.hasOwnProperty.call(process.env, "PTP_HOME_DIR");
  let fx = null;
  try {
    fx = buildFixture();
    process.env.PTP_HOME_DIR = fx.home;

    // PTP_HOME_DIR locates the global layer, so the real user config is never touched.
    const equal = configLayers({ cwd: fx.repo, repoRoot: fx.repo });
    check("home-dir-override", equal[0].file, configFileIn(fx.home));

    // (a) Workspace root equal to the repository root: two layers, the repository file read ONCE at
    // position 2, labelled `project`, resolving exactly what the two-layer reader resolved.
    check("equal-roots-layer-count", equal.length, 2);
    check("equal-roots-labels", equal.map((l) => l.label), ["global", "project"]);
    check("equal-roots-files-distinct", new Set(equal.map((l) => l.file)).size, 2);
    const equalRoot = resolveConfigKey(equal, "telemetry.root", selfTestRootNormalizer, "openspec/telemetry");
    check("equal-roots-root", equalRoot, { value: legacyTwoLayerRoot(fx.home, fx.repo, "openspec/telemetry"), layer: "project" });
    check("equal-roots-mode", resolveConfigKey(equal, "telemetry.mode", selfTestModeNormalizer, "off"), { value: "on", layer: "global" });

    // The git root is discovered from the working directory when no repository root is supplied.
    const walked = configLayers({ cwd: fx.foo });
    check("walk-finds-git-root", walked[1].file, configFileIn(fx.repo));
    check("walk-finds-workspace", walked.length === 3 && walked[2].file === configFileIn(fx.foo), true);

    // (b) A distinct workspace root overrides ONE key; every other key keeps its earlier layer.
    const three = configLayers({ cwd: fx.foo, repoRoot: fx.repo });
    check("distinct-labels", three.map((l) => l.label), ["global", "project", "workspace"]);
    check("distinct-root-wins", resolveConfigKey(three, "telemetry.root", selfTestRootNormalizer, "openspec/telemetry"), { value: "ws/store", layer: "workspace" });
    check("distinct-port-unaffected", resolveConfigKey(three, "telemetry.port", selfTestPortNormalizer, 4318), { value: 5000, layer: "project" });
    check("distinct-mode-unaffected", resolveConfigKey(three, "telemetry.mode", selfTestModeNormalizer, "off"), { value: "on", layer: "global" });
    check("distinct-unset-key-defaults", resolveConfigKey(three, "telemetry.retentionDays", (v) => v, 30), { value: 30, layer: "default" });
    check("distinct-absent-block-defaults", resolveConfigKey(three, "backlog.owner", (v) => v, null), { value: null, layer: "default" });

    // (c) An unparseable layer is skipped whole, leaving the earlier layers intact. So is a layer
    // whose parsed root is not an object, and one whose file cannot be read at all.
    const unparseable = configLayers({ cwd: fx.bad, repoRoot: fx.repo });
    check("unparseable-layer-present", unparseable.length, 3);
    check("unparseable-layer-data-null", unparseable[2].data, null);
    check("unparseable-root", resolveConfigKey(unparseable, "telemetry.root", selfTestRootNormalizer, "openspec/telemetry"), { value: "repo/store", layer: "project" });
    const nonObject = configLayers({ cwd: fx.arr, repoRoot: fx.repo });
    check("non-object-root-skipped", resolveConfigKey(nonObject, "telemetry.root", selfTestRootNormalizer, "openspec/telemetry"), { value: "repo/store", layer: "project" });
    const unreadable = configLayers({ cwd: fx.dir, repoRoot: fx.repo });
    check("unreadable-layer-skipped", resolveConfigKey(unreadable, "telemetry.root", selfTestRootNormalizer, "openspec/telemetry"), { value: "repo/store", layer: "project" });

    // A later layer's INVALID value never clears an earlier layer's valid one.
    check("invalid-later-value-keeps-earlier", resolveConfigKey(three, "telemetry.port", selfTestPortNormalizer, 4318).value, 5000);

    // (d) A rejecting normalizer: every layer is refused and the default applies last.
    check("rejecting-normalizer", resolveConfigKey(three, "telemetry.root", () => REJECT, "openspec/telemetry"), { value: "openspec/telemetry", layer: "default" });

    // (e) A throwing normalizer is a rejection, never an exception -- for every layer, and for one.
    let threw = false;
    let alwaysThrows = null;
    try {
      alwaysThrows = resolveConfigKey(three, "telemetry.root", () => { throw new Error("boom"); }, "openspec/telemetry");
    } catch (e) {
      threw = true;
    }
    check("throwing-normalizer-does-not-throw", threw, false);
    check("throwing-normalizer-defaults", alwaysThrows, { value: "openspec/telemetry", layer: "default" });
    const throwsOnWorkspace = resolveConfigKey(three, "telemetry.root", (v) => {
      if (typeof v === "string" && v.indexOf("ws/") !== -1) throw new Error("boom");
      return selfTestRootNormalizer(v);
    }, "openspec/telemetry");
    check("throwing-normalizer-rejects-one-layer-only", throwsOnWorkspace, { value: "repo/store", layer: "project" });

    // The duplicate-path rule keeps the EARLIEST occurrence, including a non-adjacent duplicate.
    const homeIsWorkspace = configLayers({ cwd: fx.repo, repoRoot: fx.repo, workspaceRoot: fx.home });
    check("duplicate-global-kept-earliest", homeIsWorkspace.map((l) => l.label), ["global", "project"]);
    check("duplicate-global-file", homeIsWorkspace[0].file, configFileIn(fx.home));

    // An absent workspace root is an absence, not an error.
    const suppressed = configLayers({ cwd: fx.foo, repoRoot: fx.repo, workspaceRoot: null });
    check("absent-workspace-two-layers", suppressed.map((l) => l.label), ["global", "project"]);
    check("absent-workspace-root", resolveConfigKey(suppressed, "telemetry.root", selfTestRootNormalizer, "openspec/telemetry"), { value: "repo/store", layer: "project" });
  } catch (e) {
    failures.push("self-test harness threw: " + (e && e.message));
  } finally {
    if (hadHome) process.env.PTP_HOME_DIR = previousHome;
    else delete process.env.PTP_HOME_DIR;
    if (fx) removeTree(fx.base);
  }

  for (const f of failures) process.stdout.write("self-test FAIL: " + f + "\n");
  process.stdout.write("self-test checks passed: " + passed + "/" + (passed + failures.length) + "\n");
  return failures.length === 0 ? 0 : 1;
}

function failUsage(reason) {
  process.stderr.write(USAGE + "\n" + reason + "\n");
  process.exit(2);
}

function fail(code, message) {
  process.stderr.write(JSON.stringify({ code: code, message: message }) + "\n");
  process.exit(1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--self-test") process.exit(runSelfTest());

  const parsed = parseArgs(argv);
  if (parsed.usageError) failUsage(parsed.usageError);

  const cwd = realpathOrSelf(path.resolve(process.cwd()));

  // 1. The git root, always discovered from the working directory -- never from an override.
  const gitRoot = findGitRoot(cwd);
  if (gitRoot === null) {
    fail(CODES.NO_GIT_ROOT, "no .git entry found at or above " + normPath(cwd));
  }

  let workspaceRoot;
  let source;

  if (parsed.workspace !== null && parsed.workspace !== undefined) {
    // 2. The override, validated in a fixed order so one input yields one code.
    const candidate = path.resolve(cwd, parsed.workspace);
    let stat = null;
    try {
      stat = fs.statSync(candidate);
    } catch (e) {
      stat = null;
    }
    if (stat === null) {
      fail(CODES.WORKSPACE_MISSING, "--workspace path does not exist: " + normPath(candidate));
    }
    if (!stat.isDirectory()) {
      fail(CODES.WORKSPACE_NOT_A_DIRECTORY, "--workspace path is not a directory: " + normPath(candidate));
    }
    if (!isDirectory(path.join(candidate, "openspec"))) {
      fail(CODES.WORKSPACE_NO_OPENSPEC, "--workspace path contains no openspec directory: " + normPath(candidate));
    }
    // Resolve both sides exactly once, then check and use that same canonical pair.
    const realGitRoot = realpathOrNull(gitRoot);
    const realCandidate = realpathOrNull(candidate);
    if (realGitRoot === null || realCandidate === null || !isContained(realGitRoot, realCandidate)) {
      fail(
        CODES.WORKSPACE_OUTSIDE_GIT_ROOT,
        "--workspace path is outside the git root " +
          normPath(gitRoot) +
          ": " +
          normPath(realCandidate === null ? candidate : realCandidate)
      );
    }
    workspaceRoot = realCandidate;
    source = "override";
  } else {
    // 3. The bounded upward walk: nearest enclosing openspec, stopping at the git root.
    const found = findWorkspaceRoot(cwd, gitRoot);
    if (found === null) {
      fail(
        CODES.NO_WORKSPACE,
        "no openspec directory found from " + normPath(cwd) + " up to the git root " + normPath(gitRoot)
      );
    }
    workspaceRoot = found;
    source = "walk";
  }

  const relative = normPath(path.relative(gitRoot, workspaceRoot));
  // isRoot is decided from the paths, never from the slug, so the two can never disagree.
  const isRoot = path.relative(gitRoot, workspaceRoot) === "";
  const slug = deriveSlug(relative, isRoot);

  process.stdout.write(
    JSON.stringify({
      workspaceRoot: normPath(workspaceRoot),
      gitRoot: normPath(gitRoot),
      relative: relative,
      slug: slug,
      isRoot: isRoot,
      source: source,
    }) + "\n"
  );
  process.exit(0);
}

if (require.main === module) main();

// The executable half of ptp-workspace's layered configuration contract, for the other ptp scripts.
module.exports = {
  configLayers: configLayers,
  resolveConfigKey: resolveConfigKey,
  REJECT: REJECT,
};
